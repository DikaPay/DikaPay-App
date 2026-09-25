# Patch untuk `api-daftar.php` yang SEDANG BERJALAN di server

**Saya tidak punya isi `api-daftar.php` yang asli** — file itu tidak ada di
repo ini (backend DikaPay live di `dikapayofficial.my.id`, terpisah dari
repo ini) dan saya tidak punya akses ke hosting-nya. Instruksi awal minta
saya "baca dulu isi aslinya sekarang (bisa saja sudah berubah)" sebelum
menimpanya — saya tidak bisa melakukan itu, jadi saya tidak menulis ulang
seluruh file (berisiko menghilangkan validasi/logika lain yang sudah ada
dan belum saya lihat). Terapkan tiga potongan ini SECARA MANUAL ke file
yang sesungguhnya sedang berjalan, jangan menimpanya dengan file baru.

## 1. Tambahkan require, setelah `require config.php` (atau baris require
   yang setara di file aslinya):

```php
require __DIR__ . '/google-verify.php';
```

## 2. Baca `google_id_token` dari body request (dekat baris lain yang
   membaca `$input['...']`):

```php
$google_id_token = trim($input['google_id_token'] ?? '');
```

## 3. SETELAH `$stmt->execute([...])` yang meng-INSERT member baru
   (baris yang membuat baris member baru di tabel `members`), tambahkan:

```php
if (!empty($google_id_token)) {
    $google = verifikasiGoogleIdToken($google_id_token);
    if ($google) {
        $memberId = $pdo->lastInsertId();
        $pdo->prepare("UPDATE members SET google_email = ? WHERE id = ?")
            ->execute([$google['email'], $memberId]);
    }
}
```

**Aturan wajib**: verifikasi Google yang gagal (token invalid/kedaluwarsa,
`google_id_token` kosong) **TIDAK BOLEH** menggagalkan pendaftaran — akun
tetap dibuat, cuma tanpa keterkaitan Google. Jangan bungkus INSERT member
di dalam pengecekan `$google`, dan jangan `exit()`/`http_response_code`
apa pun di blok ini kalau `verifikasiGoogleIdToken()` mengembalikan `null`.

**Jangan ubah** validasi, response shape, atau logika lain di file itu —
tiga potongan di atas adalah SATU-SATUNYA perubahan yang diminta.

Setelah diterapkan, diff-kan dulu dengan versi yang sedang live sebelum
upload, untuk memastikan tidak ada perubahan lain di file itu (sejak
terakhir dilihat) yang ikut hilang.
