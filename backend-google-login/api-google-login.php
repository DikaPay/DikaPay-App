<?php
/* DikaPay -- Google Sign-In: login memakai id_token Google.
   Upload ke folder yang SAMA dengan api-login.php/api-daftar.php.

   Test manual sebelum dipakai app:
     - id_token acak/invalid -> harus balas 401.
     - email yang belum ada di kolom google_email manapun (pakai token
       asli dari device Android) -> harus balas 404. */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }

require '../config.php';
require __DIR__ . '/google-verify.php';

$input = json_decode(file_get_contents('php://input'), true);
$idToken = trim($input['id_token'] ?? '');

if (empty($idToken)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'id_token wajib diisi']);
    exit();
}

$google = verifikasiGoogleIdToken($idToken);
if (!$google) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'Token Google tidak valid atau kedaluwarsa']);
    exit();
}

$pdo = getDB();
$stmt = $pdo->prepare("SELECT * FROM members WHERE google_email = ?");
$stmt->execute([$google['email']]);
$member = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$member) {
    http_response_code(404);
    echo json_encode(['ok' => false, 'error' => 'Akun Google ini belum terhubung ke member DikaPay manapun']);
    exit();
}

if ($member['status'] === 'banned') {
    if ($member['banned_sampai'] !== null && strtotime($member['banned_sampai']) <= time()) {
        $pdo->prepare("UPDATE members SET status = 'aktif', banned_sampai = NULL WHERE id = ?")->execute([$member['id']]);
        $member['status'] = 'aktif';
    } else {
        http_response_code(403);
        echo json_encode(['ok' => false, 'error' => 'banned', 'banned_sampai' => $member['banned_sampai']]);
        exit();
    }
}

$deviceToken = bin2hex(random_bytes(32));
$pdo->prepare("UPDATE members SET device_token_hash = ? WHERE id = ?")
    ->execute([hash('sha256', $deviceToken), $member['id']]);

echo json_encode([
    'ok' => true,
    'device_token' => $deviceToken,
    'member' => [
        'id_dikapay' => $member['nomor_hp'],
        'nama' => $member['nama'],
        'email' => $member['email'],
        'saldo' => (int) $member['saldo'],
        'status' => $member['status'],
    ],
]);
