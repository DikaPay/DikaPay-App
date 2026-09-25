<?php
/* DikaPay -- Google Sign-In: tautkan akun Google ke member DikaPay yang
   SUDAH ADA (Cabang C.b/C.c). Upload ke folder yang SAMA dengan
   api-login.php/api-daftar.php.

   TITIK PALING RAWAN DISALAHGUNAKAN di seluruh fitur Google Sign-In ini --
   kalau validasinya longgar, member A bisa menautkan google_email ke akun
   member B (atau sebaliknya, membajak akun orang lain). DUA lapis wajib:

     1. Authorization: Bearer <device_token> -- WAJIB, dan device_token itu
        HARUS SUDAH TERBUKTI milik member yang mau ditautkan. Client hanya
        boleh mengirim device_token di sini SETELAH memverifikasi PIN akun
        itu lewat DikaApi.masuk() (lihat auth-flow.js, loginPin.onComplete
        cabang "link") -- endpoint ini SENDIRI tidak mengecek PIN apa pun,
        ia percaya penuh pada device_token yang berarti "PIN sudah benar
        SEBELUM sampai sini".
     2. id_token Google diverifikasi ULANG ke Google di sini (BUKAN
        menerima email mentah dari client) -- supaya client tidak bisa
        menyuntikkan email Google sembarangan untuk ditautkan ke akunnya
        sendiri.

   Member yang ditautkan SELALU member pemilik device_token (dari header),
   TIDAK PERNAH dari nomor_hp/id member manapun di body request -- body
   HANYA berisi id_token.

   Alur:
     1. Baca & validasi Authorization: Bearer <device_token> -> temukan
        member (device_token_hash = SHA256(device_token)). Tidak ketemu ->
        401.
     2. Baca id_token dari body -> verifikasi ke Google (google-verify.php).
        Gagal/kedaluwarsa -> 401.
     3. member.google_email SUDAH TERISI dan BEDA dari email yang baru
        diverifikasi -> 409 (nomor ini sudah tertaut akun Google LAIN --
        Cabang C.c, TOLAK, jangan lanjut apa pun).
     4. member.google_email SUDAH TERISI dan SAMA -> idempotent, balas
        sukses apa adanya (tidak ada perubahan).
     5. member.google_email masih NULL -> UPDATE. Kalau bentrok index unik
        uq_members_google_email (email ini sudah dipakai member LAIN) ->
        409 juga, pesan beda ("akun Google ini sudah dipakai member lain").

   Test manual sebelum dipakai app:
     - device_token kosong/ngawur -> 401.
     - device_token valid (member belum punya google_email) + id_token
       valid milik email yang BELUM dipakai member mana pun -> 200, kolom
       google_email member itu terisi.
     - Ulangi persis request yang sama -> tetap 200 (idempotent), TIDAK
       error.
     - device_token milik member X yang google_email-nya SUDAH terisi
       email lain, dicoba tautkan id_token BERBEDA -> 409.
     - device_token valid, id_token milik email yang SUDAH dipakai member
       LAIN -> 409. */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }

require '../config.php';
require __DIR__ . '/google-verify.php';

/* ---- 1. Authorization: Bearer <device_token> --------------------------- */
$authHeader = $_SERVER['HTTP_AUTHORIZATION']
    ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION']
    ?? '';
if ($authHeader === '' && function_exists('getallheaders')) {
    foreach (getallheaders() as $k => $v) {
        if (strcasecmp($k, 'Authorization') === 0) { $authHeader = $v; break; }
    }
}
if (!preg_match('/^Bearer\s+(.+)$/i', trim($authHeader), $m)) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'Sesi tidak valid, silakan login ulang.']);
    exit();
}
$deviceToken = trim($m[1]);

$pdo = getDB();
$stmt = $pdo->prepare("SELECT * FROM members WHERE device_token_hash = ?");
$stmt->execute([hash('sha256', $deviceToken)]);
$member = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$member) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'Sesi tidak valid, silakan login ulang.']);
    exit();
}

/* ---- 2. Verifikasi id_token Google (dari body, BUKAN email mentah) ----- */
$input = json_decode(file_get_contents('php://input'), true);
$idToken = trim($input['id_token'] ?? '');

if ($idToken === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'id_token wajib diisi.']);
    exit();
}

$google = verifikasiGoogleIdToken($idToken);
if (!$google) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'Token Google tidak valid atau kedaluwarsa.']);
    exit();
}
$emailBaru = $google['email'];

/* ---- 3/4. Sudah tertaut? ------------------------------------------------ */
$emailLama = $member['google_email'];

if ($emailLama !== null && $emailLama !== '' && strcasecmp($emailLama, $emailBaru) !== 0) {
    // Cabang C.c -- nomor ini sudah tertaut akun Google LAIN. TOLAK.
    http_response_code(409);
    echo json_encode([
        'ok' => false,
        'error' => 'Nomor ini sudah tertaut ke akun Google lain. Hubungi Customer Service kalau ini bukan kamu.',
    ]);
    exit();
}

if ($emailLama !== null && strcasecmp($emailLama, $emailBaru) === 0) {
    // Sudah tertaut ke akun Google YANG SAMA -- idempotent, tidak ada yang perlu diubah.
    echo json_encode(['ok' => true]);
    exit();
}

/* ---- 5. Belum tertaut ke mana pun -> tautkan sekarang -------------------
   Dicek EXPLISIT lebih dulu (email ini sudah dipakai member lain?) DAN
   tetap dibungkus try/catch + cek return execute() saat UPDATE -- dua
   lapis, karena saya tidak tahu pasti apakah config.php mengaktifkan
   PDO::ERRMODE_EXCEPTION (kalau TIDAK, execute() yang gagal menabrak
   uq_members_google_email cuma mengembalikan false, BUKAN melempar
   PDOException -- try/catch saja tidak cukup untuk menangkapnya). */
$stmtCek = $pdo->prepare("SELECT id FROM members WHERE google_email = ? AND id != ?");
$stmtCek->execute([$emailBaru, $member['id']]);
if ($stmtCek->fetchColumn() !== false) {
    http_response_code(409);
    echo json_encode([
        'ok' => false,
        'error' => 'Akun Google ini sudah dipakai member DikaPay lain.',
    ]);
    exit();
}

$berhasilUpdate = false;
try {
    $stmtTaut = $pdo->prepare("UPDATE members SET google_email = ? WHERE id = ?");
    $berhasilUpdate = $stmtTaut->execute([$emailBaru, $member['id']]);
} catch (PDOException $e) {
    // uq_members_google_email tetap bentrok (race condition di antara
    // pre-check SELECT di atas dan UPDATE ini) -- jendelanya sangat sempit
    // tapi bukan mustahil, ditangkap juga di sini kalau PDO memang di mode
    // ERRMODE_EXCEPTION.
    error_log('api-google-hubungkan: UPDATE gagal (kemungkinan uq_members_google_email): ' . $e->getMessage());
    $berhasilUpdate = false;
}

if (!$berhasilUpdate) {
    http_response_code(409);
    echo json_encode([
        'ok' => false,
        'error' => 'Akun Google ini sudah dipakai member DikaPay lain.',
    ]);
    exit();
}

echo json_encode(['ok' => true]);
