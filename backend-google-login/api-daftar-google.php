<?php
/* DikaPay -- Google Sign-In auto-daftar (Cabang C.a): verifikasi kode OTP
   email SUNGGUHAN lalu buat member baru dengan google_email terisi.
   Upload ke folder yang SAMA dengan api-login.php/api-daftar.php.

   ============================================================================
   KEPUTUSAN DESAIN PENTING -- kenapa file ini TIDAK menulis INSERT ke
   tabel `members` sendiri, dan malah MEMANGGIL api-daftar.php lewat HTTP:
   ============================================================================
   Saya tidak punya akses ke isi asli api-daftar.php (backend live di
   dikapayofficial.my.id, terpisah dari repo ini) -- tidak tahu persis kolom
   apa saja yang NOT NULL di tabel `members`, dan yang PALING PENTING: tidak
   tahu persis SKEMA HASH PIN yang dipakai (bcrypt? sha256? argon2?). Kalau
   file ini menulis INSERT sendiri dengan skema hash yang DITEBAK dan
   ternyata beda dari yang dipakai api-login.php untuk verifikasi, member
   yang daftar lewat Google TIDAK AKAN PERNAH bisa login pakai PIN-nya
   sendiri -- bug yang baru ketahuan belakangan, sudah kadung mengunci akun.

   Jalan paling aman: PANGGIL api-daftar.php yang SUDAH ADA & SUDAH TERUJI
   lewat HTTP (server memanggil dirinya sendiri), dengan payload PERSIS
   sama seperti yang dikirim DikaApi.daftar() (lihat api.js) untuk alur
   manual. Ini otomatis mewarisi SELURUH validasi & skema hash PIN-nya
   tanpa saya perlu menebak apa pun -- "reuse validasi yang sama, jangan
   duplikasi logika berbeda yang bisa longgar" (instruksi tugas ini)
   ditegakkan dengan cara paling literal: pakai ULANG endpoint-nya, bukan
   cuma meniru kodenya.

   Konsekuensinya: kalau nanti api-daftar.php berubah bentuk (field baru
   wajib, dll), file ini OTOMATIS ikut berubah tanpa perlu disentuh --
   tapi juga berarti file ini GAGAL kalau api-daftar.php sedang down.
   ============================================================================

   Alur:
     0. Cek DULU apakah email ini sudah tertaut member LAIN (SELECT nomor_hp
        FROM members WHERE google_email = ?) -- kalau sudah, TOLAK 409
        {kode:"google-sudah-dipakai"} beserta nomor_hp akun lamanya di pesan
        error, SEBELUM OTP diperiksa/dikonsumsi dan SEBELUM api-daftar.php
        dipanggil sama sekali. Lihat komentar di kode untuk kronologi bug
        yang dicegah ini (temuan review keamanan -- akun duplikat).
     1. Validasi field wajib ada (email, kode_otp, nomor_hp, nama, pin).
     2. Cari baris otp_pending TERBARU untuk email ini:
          - tidak ada sama sekali -> kode:"otp-salah"
          - kadaluarsa terlewati  -> kode:"otp-kadaluarsa"
          - percobaan >= 5        -> kode:"otp-salah" (anti brute-force)
          - hash(kode_otp) != kode_hash tersimpan -> percobaan++, kode:"otp-salah"
          - cocok -> lanjut, baris otp_pending DIHAPUS (sekali pakai)
     3. POST ke api-daftar.php (endpoint sendiri, lihat di atas) dengan
        payload sama seperti DikaApi.daftar(). Error dari sana diteruskan
        apa adanya (409 -> "terdaftar", 400 -> "validasi").
     4. member berhasil dibuat -> UPDATE members SET google_email = ?
        WHERE nomor_hp = ? (pola SAMA PERSIS dengan api-daftar-PATCH.md,
        cuma dipanggil dari sini alih-alih dari dalam api-daftar.php itu
        sendiri karena saya tidak bisa menempelkan patch itu tanpa melihat
        filenya langsung -- lihat README.md).
     5. Balas {ok:true, member:{id_dikapay, nama, saldo}} -- bentuk SAMA
        dengan api-daftar.php, supaya DikaApi.daftarGoogle() di api.js
        tidak perlu tahu bedanya.

   Test manual sebelum dipakai app:
     - kode_otp benar & belum kedaluwarsa, nomor_hp baru, email BELUM pernah
       tertaut member mana pun -> 200, google_email ikut terisi di baris
       member yang baru dibuat (cek manual ke DB).
     - email ini SUDAH tertaut member lain (ulangi alur auto-daftar dengan
       email Google yang sama, nomor_hp beda) -> 409 {kode:"google-sudah-
       dipakai"}, pesan error menyebut nomor_hp akun lamanya, TIDAK ADA
       member baru yang terbuat, baris otp_pending TIDAK ikut terhapus.
     - kode_otp salah -> 400 {kode:"otp-salah"}, baris otp_pending TIDAK
       dihapus, percobaan bertambah.
     - kode_otp benar tapi sudah lewat 10 menit -> 400 {kode:"otp-kadaluarsa"}.
     - nomor_hp yang dikirim ternyata sudah dipakai member lain (race
       condition, jarang) -> 409 {kode:"terdaftar"}, TIDAK ada google_email
       yang tertaut ke siapa pun. */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }

require '../config.php';
require __DIR__ . '/google-verify.php';

$input = json_decode(file_get_contents('php://input'), true);
$email = strtolower(trim($input['email'] ?? ''));
$kodeOtp = trim($input['kode_otp'] ?? '');
$nomorHp = trim($input['nomor_hp'] ?? '');
$nama = trim($input['nama'] ?? '');
$pin = trim($input['pin'] ?? '');
$alamat = trim($input['alamat'] ?? '');
$tanggalLahir = trim($input['tanggal_lahir'] ?? '');
$jenisKelamin = trim($input['jenis_kelamin'] ?? '');

if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) ||
    $kodeOtp === '' || $nomorHp === '' || $nama === '' || $pin === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Data pendaftaran belum lengkap.', 'kode' => 'validasi']);
    exit();
}

$pdo = getDB();

/* ---- 0. Cegah akun duplikat: email Google ini sudah tertaut member LAIN?
   TEMUAN REVIEW KEAMANAN: sebelum pengecekan ini ada, member yang mengulang
   alur auto-daftar dengan email Google yang SAMA tapi nomor_hp BERBEDA
   (mis. salah ketik nomor di percobaan pertama, atau sekadar mencoba lagi)
   akan lolos sampai ke UPDATE google_email di langkah 4 -- yang kalau
   ternyata bentrok index unik uq_members_google_email, kegagalannya cuma
   di-log diam-diam (error_log) SETELAH member baru KEPALANG DIBUAT lewat
   api-daftar.php. Hasilnya: member itu berakhir dengan DUA akun DikaPay
   (akun lama miliknya, TETAP tertaut Google + akun baru kosong yang baru
   saja terbuat, TANPA google_email) -- tanpa pernah diberi tahu bahwa
   sebenarnya ia sudah py akun.

   Dicek di SINI, PALING AWAL (sebelum OTP diperiksa/dihapus dan SEBELUM
   api-daftar.php dipanggil sama sekali) -- supaya kalau memang sudah
   tertaut, TIDAK ADA member baru yang sempat dibuat, TIDAK ADA baris
   otp_pending yang dikonsumsi (member masih bisa memakai kode itu kalau
   dia lanjut lewat jalur "hubungkan akun lama" alih-alih daftar baru), dan
   member diberi tahu JELAS lewat pesan error (bukan disimpan diam-diam di
   log server yang tidak pernah dilihat siapa pun). */
$stmtCekEmail = $pdo->prepare("SELECT nomor_hp FROM members WHERE google_email = ?");
$stmtCekEmail->execute([$email]);
$nomorLama = $stmtCekEmail->fetchColumn();
if ($nomorLama !== false) {
    http_response_code(409);
    echo json_encode([
        'ok' => false,
        'error' => 'Akun Google ini sudah terhubung ke member DikaPay lain. Coba masuk pakai nomor HP ' . $nomorLama . ' itu, ya.',
        'kode' => 'google-sudah-dipakai',
    ]);
    exit();
}

/* ---- 1. Verifikasi kode OTP -------------------------------------------- */
$stmt = $pdo->prepare(
    "SELECT id, kode_hash, kadaluarsa, percobaan FROM otp_pending
     WHERE email = ? ORDER BY id DESC LIMIT 1"
);
$stmt->execute([$email]);
$otp = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$otp) {
    http_response_code(400);
    echo json_encode([
        'ok' => false,
        'error' => 'Belum ada kode OTP untuk email ini. Minta kode baru, ya.',
        'kode' => 'otp-salah',
    ]);
    exit();
}

if (strtotime($otp['kadaluarsa']) < time()) {
    http_response_code(400);
    echo json_encode([
        'ok' => false,
        'error' => 'Kode OTP sudah kedaluwarsa. Minta kode baru, ya.',
        'kode' => 'otp-kadaluarsa',
    ]);
    exit();
}

if ((int) $otp['percobaan'] >= 5) {
    http_response_code(400);
    echo json_encode([
        'ok' => false,
        'error' => 'Kode ini sudah dicoba terlalu banyak kali. Minta kode baru, ya.',
        'kode' => 'otp-salah',
    ]);
    exit();
}

if (!hash_equals($otp['kode_hash'], hash('sha256', $kodeOtp))) {
    $pdo->prepare("UPDATE otp_pending SET percobaan = percobaan + 1 WHERE id = ?")
        ->execute([$otp['id']]);
    http_response_code(400);
    echo json_encode([
        'ok' => false,
        'error' => 'Kode OTP salah. Coba periksa lagi, ya.',
        'kode' => 'otp-salah',
    ]);
    exit();
}

// Kode benar -- sekali pakai, hapus supaya tidak bisa dipakai ulang.
$pdo->prepare("DELETE FROM otp_pending WHERE id = ?")->execute([$otp['id']]);

/* ---- 2. Verifikasi ULANG id_token Google (kalau dikirim) ---------------
   Opsional -- OTP email sudah cukup membuktikan kepemilikan email itu
   sendiri. Kalau client TETAP mengirim google_id_token (untuk lapis
   pertahanan tambahan), cocokkan emailnya dengan yang barusan diverifikasi
   OTP -- kalau BEDA, sesuatu yang janggal sedang terjadi, tolak. */
$googleIdToken = trim($input['google_id_token'] ?? '');
if ($googleIdToken !== '') {
    $google = verifikasiGoogleIdToken($googleIdToken);
    if (!$google || $google['email'] !== $email) {
        http_response_code(401);
        echo json_encode([
            'ok' => false,
            'error' => 'Identitas Google tidak cocok dengan email yang diverifikasi.',
            'kode' => 'validasi',
        ]);
        exit();
    }
}

/* ---- 3. Buat member lewat api-daftar.php (REUSE, lihat catatan atas) --- */
$payloadDaftar = ['nomor_hp' => $nomorHp, 'nama' => $nama, 'pin' => $pin, 'email' => $email];
if ($alamat !== '') $payloadDaftar['alamat'] = $alamat;
if ($tanggalLahir !== '') $payloadDaftar['tanggal_lahir'] = $tanggalLahir;
if ($jenisKelamin !== '') $payloadDaftar['jenis_kelamin'] = $jenisKelamin;

function dikapayPanggilDaftar($payload) {
    $url = 'https://dikapayofficial.my.id/api-daftar.php';
    $body = json_encode($payload);

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 15,
        ]);
        $raw = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $gagalTransport = ($raw === false);
        curl_close($ch);
        if ($gagalTransport) return [0, null];
        return [$status, json_decode($raw, true)];
    }

    // Fallback tanpa ext-curl (jarang, tapi jangan sampai fatal error).
    $ctx = stream_context_create(['http' => [
        'method' => 'POST',
        'header' => "Content-Type: application/json\r\n",
        'content' => $body,
        'timeout' => 15,
        'ignore_errors' => true,
    ]]);
    $raw = @file_get_contents($url, false, $ctx);
    $status = 0;
    if (isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $m)) {
        $status = (int) $m[1];
    }
    if ($raw === false) return [0, null];
    return [$status, json_decode($raw, true)];
}

list($statusDaftar, $jDaftar) = dikapayPanggilDaftar($payloadDaftar);

if ($statusDaftar === 0) {
    error_log('api-daftar-google: gagal memanggil api-daftar.php (transport) untuk ' . $nomorHp);
    http_response_code(502);
    echo json_encode(['ok' => false, 'error' => 'Server sedang bermasalah. Coba lagi nanti, ya.']);
    exit();
}

if (!($statusDaftar === 200 || $statusDaftar === 201) || !$jDaftar || empty($jDaftar['ok']) || empty($jDaftar['member'])) {
    // Teruskan status & pesan APA ADANYA dari api-daftar.php (409/400/dst).
    http_response_code($statusDaftar >= 400 ? $statusDaftar : 500);
    echo json_encode([
        'ok' => false,
        'error' => ($jDaftar && isset($jDaftar['error'])) ? $jDaftar['error'] : 'Pendaftaran gagal. Coba lagi sebentar, ya.',
        'kode' => $statusDaftar === 409 ? 'terdaftar' : 'validasi',
    ]);
    exit();
}

/* ---- 4. Tautkan google_email ke member yang baru dibuat ----------------- */
try {
    $stmtTaut = $pdo->prepare("UPDATE members SET google_email = ? WHERE nomor_hp = ?");
    $stmtTaut->execute([$email, $nomorHp]);
} catch (PDOException $e) {
    // uq_members_google_email bentrok (race condition sangat jarang: email
    // yang sama berhasil ditautkan ke member lain di antara verifikasi OTP
    // & titik ini). Member BARU SAJA berhasil dibuat -- jangan digagalkan
    // total, cukup dicatat; member tetap bisa login manual pakai PIN-nya.
    error_log('api-daftar-google: gagal menautkan google_email untuk ' . $nomorHp . ': ' . $e->getMessage());
}

http_response_code(201);
echo json_encode(['ok' => true, 'member' => $jDaftar['member']]);
