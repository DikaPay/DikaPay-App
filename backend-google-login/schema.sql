-- DikaPay -- Google Sign-In: kolom pengait akun Google ke member.
-- Jalankan SEKALI di database production. Tidak destruktif (ADD COLUMN
-- nullable + index unique), tapi tetap backup dulu sebelum menjalankan
-- perubahan skema apa pun di database live.

ALTER TABLE members ADD COLUMN google_email VARCHAR(190) NULL,
  ADD UNIQUE INDEX uq_members_google_email (google_email);

-- ---------------------------------------------------------------------------
-- Auto-daftar via Google (Cabang C.a, TUGAS 6): OTP email SUNGGUHAN untuk
-- membuktikan member memang menguasai inbox emailnya, dipakai
-- api-otp-kirim.php (tulis) & api-daftar-google.php (baca+hapus).
--
-- kode_hash: HASH kodenya (sha256), BUKAN kode polos -- pola yang SAMA
--   dengan device_token_hash di tabel members. Siapa pun yang bisa membaca
--   tabel ini (mis. lewat SQL injection di tempat lain) tidak otomatis
--   dapat kode OTP siapa pun.
-- kadaluarsa: TIMESTAMP kapan kode ini berhenti berlaku (10 menit dari saat
--   dikirim -- lihat api-otp-kirim.php). Baris yang sudah lewat kadaluarsa
--   TIDAK dihapus otomatis oleh sistem ini (tidak ada CRON) -- baris lama
--   ditimpa/diabaikan begitu email yang sama minta kode baru; pembersihan
--   berkala baris basi jadi tugas rumah tangga terpisah (mis. event
--   scheduler MySQL atau cron PHP), TIDAK termasuk cakupan TUGAS 6 ini.
-- percobaan: penghitung upaya verifikasi SALAH untuk kode INI SAJA --
--   dibatasi 5x oleh api-daftar-google.php (lihat file itu) supaya kode
--   6 digit tidak bisa ditebak brute-force dalam jendela 10 menitnya.
CREATE TABLE IF NOT EXISTS otp_pending (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(190) NOT NULL,
  kode_hash CHAR(64) NOT NULL,
  kadaluarsa DATETIME NOT NULL,
  percobaan TINYINT UNSIGNED NOT NULL DEFAULT 0,
  dibuat_pada DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_otp_pending_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
