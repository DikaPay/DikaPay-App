<?php
/* DikaPay -- Google Sign-In auto-daftar (Cabang C.a): kirim kode OTP
   SUNGGUHAN ke email member (BUKAN dummy yang ditampilkan di layar).
   Upload ke folder yang SAMA dengan api-login.php/api-daftar.php.

   ============================================================================
   TEMUAN AUDIT (WAJIB DIBACA SEBELUM UPLOAD) -- kemampuan kirim email
   ============================================================================
   Saya TIDAK punya akses ke hosting/config.php yang sesungguhnya (backend
   live di dikapayofficial.my.id, terpisah dari repo ini), jadi saya TIDAK
   BISA memverifikasi apakah SMTP/PHPMailer sudah terpasang, atau apakah
   PHP mail() bawaan di hosting ini benar-benar terkirim (bukan langsung
   masuk spam / ditolak Gmail karena tanpa SPF-DKIM yang selaras).

   File ini ditulis mendukung DUA jalur, otomatis pilih yang tersedia:
     1. PHPMailer lewat Composer autoload (../vendor/autoload.php), memakai
        SMTP kalau config.php mendefinisikan SMTP_HOST/SMTP_USER/SMTP_PASS/
        SMTP_PORT/SMTP_FROM/SMTP_FROM_NAME -- INI JALUR YANG DIREKOMENDASIKAN
        untuk deliverability ke Gmail (member Google Sign-In HAMPIR PASTI
        emailnya @gmail.com atau Google Workspace).
     2. Fallback PHP mail() bawaan -- jalan di banyak shared hosting TANPA
        konfigurasi tambahan, TAPI reputasinya sering buruk: gampang masuk
        folder Spam/Promosi Gmail, dan sebagian hosting mem-block mail()
        keluar sama sekali kecuali diaktifkan manual dari cPanel.

   ==> STOP & LAPORKAN ke pemilik project SEBELUM mengandalkan file ini di
       produksi: jalankan test-kirim manual (lihat bagian bawah file ini)
       dan pastikan kode BENAR-BENAR mendarat di inbox (bukan spam) akun
       Gmail asli. Kalau ternyata mail() bawaan tidak layak (banyak kasus di
       shared hosting Indonesia begitu), pasang PHPMailer + kredensial SMTP
       (Gmail App Password / provider transaksional seperti Mailgun/SES/
       Brevo) di config.php sebelum member sungguhan memakai fitur ini --
       JANGAN biarkan member menunggu kode yang tidak pernah sampai.
   ============================================================================

   Test manual sebelum dipakai app:
     - email valid (@gmail.com akun asli) -> {ok:true}, cek inbox DAN folder
       spam dalam <=2 menit.
     - email kosong / bukan format email -> harus balas 400.
     - dipanggil 2x berturut-turut untuk email yang sama dalam <60 detik ->
       harus balas 429 (throttle, lihat JEDA_KIRIM_DETIK) -- mencegah member
       (atau siapa pun) memakai endpoint ini untuk mengirim spam ke satu
       alamat berkali-kali. */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }

require '../config.php';

$input = json_decode(file_get_contents('php://input'), true);
$email = strtolower(trim($input['email'] ?? ''));

if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Alamat email tidak valid.']);
    exit();
}

$pdo = getDB();

/* ---- Throttle: jangan izinkan spam ke satu alamat --------------------- */
const JEDA_KIRIM_DETIK = 60;
$stmt = $pdo->prepare(
    "SELECT dibuat_pada FROM otp_pending WHERE email = ? ORDER BY id DESC LIMIT 1"
);
$stmt->execute([$email]);
$terakhir = $stmt->fetchColumn();
if ($terakhir !== false && (time() - strtotime($terakhir)) < JEDA_KIRIM_DETIK) {
    http_response_code(429);
    echo json_encode([
        'ok' => false,
        'error' => 'Kode baru saja dikirim. Tunggu sebentar sebelum minta lagi, ya.',
        'kode' => 'terlalu-cepat',
    ]);
    exit();
}

/* ---- Buat & simpan kode (HASH, bukan polos) ---------------------------- */
$kode = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
$kodeHash = hash('sha256', $kode);
$kadaluarsa = date('Y-m-d H:i:s', time() + 10 * 60); // 10 menit

$pdo->prepare(
    "INSERT INTO otp_pending (email, kode_hash, kadaluarsa, percobaan, dibuat_pada)
     VALUES (?, ?, ?, 0, NOW())"
)->execute([$email, $kodeHash, $kadaluarsa]);

/* ---- Kirim email -------------------------------------------------------
   Lihat blok TEMUAN AUDIT di atas -- dua jalur, PHPMailer diutamakan kalau
   tersedia & terkonfigurasi, fallback ke mail() bawaan PHP. */
function dikapayKirimOtpEmail($tujuan, $kode) {
    $subjek = 'Kode Verifikasi DikaPay';
    $isiHtml = '<p>Halo,</p>'
        . '<p>Kode verifikasi untuk menyelesaikan pendaftaran akun DikaPay kamu:</p>'
        . '<p style="font-size:28px;font-weight:bold;letter-spacing:4px;">' . htmlspecialchars($kode) . '</p>'
        . '<p>Kode ini berlaku 10 menit. Jangan bagikan kode ini ke siapa pun, termasuk yang mengaku pihak DikaPay.</p>'
        . '<p>Kalau kamu tidak merasa mendaftar di DikaPay, abaikan email ini.</p>';
    $isiTeks = "Kode verifikasi DikaPay kamu: $kode\n\nBerlaku 10 menit. Jangan bagikan kode ini ke siapa pun.";

    $autoload = __DIR__ . '/../vendor/autoload.php';
    if (file_exists($autoload) && defined('SMTP_HOST') && defined('SMTP_USER') && defined('SMTP_PASS')) {
        require_once $autoload;
        try {
            $mail = new PHPMailer\PHPMailer\PHPMailer(true);
            $mail->isSMTP();
            $mail->Host = SMTP_HOST;
            $mail->SMTPAuth = true;
            $mail->Username = SMTP_USER;
            $mail->Password = SMTP_PASS;
            $mail->SMTPSecure = defined('SMTP_SECURE') ? SMTP_SECURE : PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
            $mail->Port = defined('SMTP_PORT') ? SMTP_PORT : 587;
            $mail->setFrom(
                defined('SMTP_FROM') ? SMTP_FROM : SMTP_USER,
                defined('SMTP_FROM_NAME') ? SMTP_FROM_NAME : 'DikaPay'
            );
            $mail->addAddress($tujuan);
            $mail->Subject = $subjek;
            $mail->isHTML(true);
            $mail->Body = $isiHtml;
            $mail->AltBody = $isiTeks;
            $mail->send();
            return true;
        } catch (Exception $e) {
            error_log('api-otp-kirim: PHPMailer gagal, jatuh ke mail(): ' . $e->getMessage());
            // lanjut ke fallback mail() di bawah, JANGAN exit di sini
        }
    }

    // Fallback: PHP mail() bawaan -- lihat peringatan deliverability di atas.
    $headers = "MIME-Version: 1.0\r\n";
    $headers .= "Content-Type: text/html; charset=UTF-8\r\n";
    $fromAddr = defined('SMTP_FROM') ? SMTP_FROM : 'no-reply@dikapayofficial.my.id';
    $fromName = defined('SMTP_FROM_NAME') ? SMTP_FROM_NAME : 'DikaPay';
    $headers .= "From: {$fromName} <{$fromAddr}>\r\n";
    return @mail($tujuan, $subjek, $isiHtml, $headers);
}

$terkirim = dikapayKirimOtpEmail($email, $kode);

if (!$terkirim) {
    error_log('api-otp-kirim: GAGAL mengirim ke ' . $email . ' (baik PHPMailer maupun mail() menolak/gagal)');
    http_response_code(502);
    echo json_encode([
        'ok' => false,
        'error' => 'Gagal mengirim kode ke email kamu. Coba lagi sebentar, ya.',
        'kode' => 'kirim-gagal',
    ]);
    exit();
}

echo json_encode(['ok' => true]);
