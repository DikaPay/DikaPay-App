<?php
/* DikaPay -- Google Sign-In: verifikasi id_token ke Google.
   Upload ke folder yang SAMA dengan api-login.php/api-daftar.php.
   require '' oleh api-google-login.php dan (setelah patch manual)
   api-daftar.php. */

const GOOGLE_WEB_CLIENT_ID = '307159266118-i4sq5jthcu9m927gcst2mfjf74589fig.apps.googleusercontent.com';

function verifikasiGoogleIdToken($idToken) {
    $idToken = trim((string) $idToken);
    if ($idToken === '') return null;

    $url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' . urlencode($idToken);
    $ctx = stream_context_create(['http' => ['timeout' => 8]]);
    $raw = @file_get_contents($url, false, $ctx);
    if ($raw === false) return null;

    $data = json_decode($raw, true);
    if (!is_array($data)) return null;

    if (!isset($data['aud']) || $data['aud'] !== GOOGLE_WEB_CLIENT_ID) return null;
    if (!isset($data['email_verified']) || $data['email_verified'] !== 'true') return null;
    if (!isset($data['exp']) || (int) $data['exp'] < time()) return null;
    if (empty($data['email'])) return null;

    return ['email' => strtolower(trim($data['email'])), 'nama' => $data['name'] ?? ''];
}
