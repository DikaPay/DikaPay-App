# Backend Google Sign-In — file untuk di-upload manual

Folder ini **BUKAN** bagian dari aplikasi web/APK DikaPay (tidak masuk
`build-www.js`, tidak ikut ter-bundle ke Capacitor). DikaPay adalah
static web app; backend PHP-nya hidup di server terpisah
(`dikapayofficial.my.id`), yang tidak ada di repo ini.

Isi folder ini adalah **draft file backend** untuk fitur "Lanjutkan dengan
Google" — TUGAS 5 (login dasar) dan TUGAS 6 (PIN wajib + auto-daftar lewat
OTP email + tautkan akun lama).

## Isi folder & status tiap file

| File | Dari tugas | Status |
|---|---|---|
| `google-verify.php` | 5 | BARU, siap pakai apa adanya |
| `api-google-login.php` | 5 | BARU, siap pakai apa adanya |
| `api-daftar-PATCH.md` | 5 | **BUKAN PHP siap pakai** — instruksi tempel manual ke `api-daftar.php` yang sedang berjalan |
| `schema.sql` | 5 + 6 | Tambah kolom `google_email` (5) + tabel `otp_pending` (6) |
| `api-otp-kirim.php` | 6 | BARU — **lihat peringatan email di bawah SEBELUM upload** |
| `api-daftar-google.php` | 6 | BARU — reuse `api-daftar.php` lewat HTTP internal, lihat komentar di file |
| `api-google-hubungkan.php` | 6 | BARU — paling sensitif keamanannya, baca komentar di file sebelum upload |

**Kenapa 3 file TUGAS 6 ditulis sebagai file PHP LENGKAP (bukan patch)**:
ketiganya endpoint yang sama sekali baru (tidak ada versi lama yang bisa
ditimpa), jadi aman diupload apa adanya — beda dengan `api-daftar.php`
(yang SUDAH berjalan) yang cuma boleh ditempel lewat `api-daftar-PATCH.md`.

## ⚠️ TEMUAN TERPISAH — kemampuan hosting mengirim email belum terverifikasi

`api-otp-kirim.php` (dipakai auto-daftar lewat Google, mengirim kode OTP
6 digit ke email member) butuh hosting yang benar-benar bisa mengirim email
dan **mendarat di inbox**, bukan folder Spam. Saya **tidak punya akses ke
hosting/`config.php`** sehingga **tidak bisa memverifikasi**:

- Apakah PHPMailer/Composer sudah terpasang di server.
- Apakah kredensial SMTP (Gmail App Password, atau provider transaksional
  seperti Mailgun/SES/Brevo) sudah/bisa dikonfigurasi.
- Apakah `mail()` bawaan PHP di hosting ini benar-benar mengirim, atau
  malah diblokir/ditolak provider Gmail (SPF/DKIM tidak selaras — ini
  SANGAT UMUM terjadi di shared hosting cPanel Indonesia).

`api-otp-kirim.php` ditulis mendukung KEDUANYA (PHPMailer+SMTP kalau
tersedia & dikonfigurasi lewat konstanta `SMTP_HOST`/`SMTP_USER`/
`SMTP_PASS`/dst di `config.php`, fallback ke `mail()` bawaan kalau tidak) —
**tapi ini BELUM DIUJI KIRIM SUNGGUHAN sama sekali**, karena saya tidak
punya akses untuk menjalankannya. **WAJIB test manual sebelum member
sungguhan memakai fitur ini**: kirim ke alamat Gmail asli, pastikan sampai
ke Inbox (cek juga folder Spam/Promosi) dalam &lt;=2 menit. Kalau ternyata
`mail()` bawaan tidak layak (kemungkinan besar), pasang PHPMailer + SMTP
sebelum fitur ini dianggap selesai — **jangan biarkan member menunggu kode
yang tidak pernah sampai**. Detail lengkap ada di komentar header
`api-otp-kirim.php`.

## Urutan pemasangan

**TUGAS 5 (kalau belum pernah dipasang):**

1. Jalankan bagian `ALTER TABLE members ADD COLUMN google_email ...` di
   `schema.sql`.
2. Upload `google-verify.php` ke folder yang sama dengan `api-login.php`.
3. Upload `api-google-login.php` ke folder yang sama.
4. Terapkan `api-daftar-PATCH.md` ke `api-daftar.php` yang SEDANG BERJALAN
   di server (bukan menimpa dengan file lain), lalu upload.
5. Test manual (lihat catatan di `api-google-login.php`).

**TUGAS 6 (baru):**

6. Jalankan bagian `CREATE TABLE IF NOT EXISTS otp_pending ...` di
   `schema.sql` (baris-baris yang ditambahkan setelah bagian TUGAS 5 di
   atas).
7. **Verifikasi dulu kemampuan kirim email** (lihat peringatan di atas) —
   kalau perlu, pasang PHPMailer + kredensial SMTP di `config.php` SEBELUM
   langkah 8.
8. Upload `api-otp-kirim.php`, `api-daftar-google.php`, dan
   `api-google-hubungkan.php` ke folder yang sama dengan `api-login.php`.
9. Test manual tiap file — daftar pengujian ada di komentar header
   masing-masing file (kode benar/salah/kedaluwarsa, device_token
   kosong/ngawur, nomor sudah tertaut akun Google lain, dst).

## Ketergantungan antar file (siapa `require` siapa)

```
api-google-login.php      -> config.php, google-verify.php
api-daftar-google.php     -> config.php, google-verify.php, (HTTP) api-daftar.php
api-google-hubungkan.php  -> config.php, google-verify.php
api-otp-kirim.php         -> config.php, (opsional) vendor/autoload.php (PHPMailer)
```

`api-daftar-google.php` **tidak** menulis `INSERT` ke tabel `members`
sendiri — ia memanggil `api-daftar.php` lewat HTTP (server memanggil
dirinya sendiri) supaya validasi & skema hash PIN-nya konsisten dengan
alur daftar manual, tanpa saya perlu menebak isi `api-daftar.php` yang
tidak bisa saya baca. Lihat komentar panjang di bagian atas file itu untuk
alasan lengkapnya.
