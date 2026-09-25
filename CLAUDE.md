# CLAUDE.md

Panduan untuk Claude Code (dan kontributor lain) saat bekerja di repository ini.

## Ringkasan Project

**DikaPay** adalah aplikasi **PPOB** (Payment Point Online Bank) untuk pembelian:

- Pulsa & paket data
- Token listrik PLN
- Tagihan (PLN pascabayar, PDAM, BPJS, internet, dll.)
- Produk digital lain (e-wallet, voucher game, dll.)

Aplikasi dibangun sebagai **web app statis** dengan **HTML / CSS / JavaScript murni** (tanpa framework, tanpa build step). Tujuan akhirnya dibungkus menjadi **APK Android** menggunakan **Capacitor**.

## Status & Roadmap

| Fase | Isi | Status |
|------|-----|--------|
| 1 | UI/UX front-end statis (HTML/CSS/JS), data produk masih dummy/hardcoded | Sedang berjalan |
| 2 | Integrasi **backend** sebagai perantara ke **Digiflazz** untuk data harga & daftar produk | **Sedang berjalan** — `api.js` sudah ada; kategori **Pulsa** sudah memakai data ASLI, 27 kategori lain menyusul |
| 3 | Flow transaksi nyata (pembayaran, callback, riwayat) via backend | Rencana |
| 4 | Bungkus jadi **APK Android** dengan **Capacitor** | Rencana |

### Prinsip integrasi Digiflazz

- App **tidak pernah** memanggil API Digiflazz secara langsung.
- Semua kredensial Digiflazz (username, API key/secret, tanda tangan MD5) hanya ada di **backend**.
- App hanya bicara ke backend milik DikaPay lewat endpoint REST sendiri (mis. `GET /api/products`, `POST /api/transactions`).
- Saat menambah kode yang butuh harga produk, buat pemanggilan ke lapisan backend abstrak — jangan hardcode URL atau signature Digiflazz di front-end.

## Desain Visual

Tema terinspirasi aplikasi **DANA** — modern, bersih, rounded.

- **Warna utama:** biru navy (mis. `#0b1f52` / `#122b6e` untuk header, tombol utama, background brand)
- **Aksen:** kuning emas (mis. `#f5b301` / `#ffc42e` untuk CTA, highlight, ikon aktif)
- **Netral:** putih & abu-abu terang untuk kartu dan background konten
- **Gaya:** sudut membulat (border-radius besar), shadow lembut, ikon flat, banyak whitespace, tipografi sans-serif
- Layout **mobile-first** — target utama layar HP, karena akhirnya jadi APK

Definisikan warna sebagai **CSS custom properties** (`:root { --navy: ...; --gold: ...; }`) dan pakai variabel itu di seluruh stylesheet, jangan tulis nilai hex berulang-ulang.

## Struktur Project (konvensi yang dipakai)

Karena tanpa build tool, struktur dijaga sederhana dan bisa dibuka langsung di browser. **Sejak reorganisasi folder** (semua file dikelompokkan per jenis — sebelumnya flat, semua di root), hanya `index.html` yang tetap di root sebagai entry point; halaman lain, script, dan style masing-masing punya foldernya sendiri:

```
/
├── index.html            # beranda — SATU-SATUNYA .html yang TETAP DI ROOT (entry point aplikasi/APK)
├── CLAUDE.md
├── build-www.js          # salin aset web -> www/ untuk Capacitor (lihat "Build APK")
├── rebuild-apk.js        # SATU perintah build APK: build-www -> cap sync -> verifikasi
│                         #   (npm run rebuild-apk). JANGAN panggil cap sync sendirian.
├── verify-build.js       # cek ISI (hash) sumber vs www/ vs android/ vs DALAM APK
│                         #   (npm run verify). Membuka app-debug.apk sebagai zip.
├── capacitor.config.json #   webDir: "www"
├── www/                  # HASIL BUILD, bukan sumber. JANGAN diedit — isinya
│                         #   dihapus & disalin ulang tiap `node build-www.js`.
├── android/              # project Android dari Capacitor (bukan sumber web)
│
├── pages/                # SEMUA halaman .html lain (35 file)
│   ├── auth.html              # SATU halaman Masuk+Daftar (splash -> nomor HP -> cabang) — TIDAK kena guard
│   ├── riwayat.html          # halaman Riwayat Transaksi
│   ├── statistik.html        # halaman Statistik Pengeluaran (dari kartu "Bulan Ini" di riwayat)
│   ├── notifikasi.html       # halaman Notifikasi (dari quick action Notifikasi di beranda)
│   ├── transfer-member.html  # halaman Transfer Antar Member (dari quick action Transfer di beranda)
│   ├── margin.html           # halaman "Atur Margin Saya" (tab Margin di bottom nav)
│   ├── akun.html             # halaman Akun (tab Akun di bottom nav)
│   ├── pulsa.html            # halaman Beli Pulsa      (kategori "Pulsa" di grid Layanan)
│   ├── paket-data.html       # halaman Beli Paket Data (kategori "Paket Data" di grid Layanan)
│   ├── listrik.html          # halaman Token Listrik PLN (kategori "Listrik" di grid Layanan)
│   └── ...21 halaman produk Tipe A/B/C lainnya (lihat "Halaman produk — arsitektur berlapis")
│
├── scripts/              # SEMUA file .js (58 file)
│   ├── auth.js               # PENJAGA SESI (dummy) — window.DikaAuth. Di-link PALING ATAS di
│   │                         #   <head> SEMUA halaman; auto-guard dilewati di auth.html.
│   │                         #   Path ke auth.html dihitung runtime (beda kedalaman folder
│   │                         #   tergantung dipanggil dari root atau /pages/) — lihat isi file.
│   ├── auth-flow.js          # SATU alur logic auth.html (splash/nomor HP/daftar/masuk/sukses).
│   │                         #   Reuse DikaAuth — TIDAK menduplikasi isLoggedIn/login/logout.
│   ├── script.js             # logika beranda (HANYA dimuat index.html di root)
│   ├── riwayat.js
│   ├── statistik.js
│   ├── notifikasi.js
│   ├── transfer-member.js
│   ├── sound.js               # BERSAMA — window.playSuccessSound(). SATU-SATUNYA yang
│   │                         #   menyentuh Audio API untuk suara notifikasi. Baca preferensi
│   │                         #   dikapay:settings:sound (default aktif). Fail-diam kalau
│   │                         #   file/browser bermasalah — TIDAK PERNAH menghentikan transaksi.
│   ├── notif-store.js         # BERSAMA — window.DikaNotif (push/getMine/hasUnreadMine/
│   │                         #   markMineRead). SATU-SATUNYA yang menyentuh kunci
│   │                         #   dikapay:notif:<nomor digit> (kotak masuk notifikasi per member).
│   ├── pulsa.js              #   HANYA data harga pulsa + config halaman
│   ├── paket-data.js         #   HANYA katalog paket data + config halaman
│   ├── listrik.js            #   Token PLN dari backend (kategori "PLN") + alur warning manual
│   │                         #   (inquiry NONAKTIF). TIDAK lewat kategori-live.js — nomor meter,
│   │                         #   bukan nomor HP, jadi tidak ada operator yang dideteksi.
│   ├── kategori-live.js      # BERSAMA — perangkai kategori TIPE A berdata backend
│   │                         #   window.DikaKategoriLive.pasang(config). Dipakai
│   │                         #   masa-aktif/perdana/sms-telpon; pulsa & paket-data
│   │                         #   sengaja tetap merangkai sendiri (sudah tuntas).
│   ├── produk-schema.js      # BERSAMA — KONTRAK data produk (prabayar vs pascabayar)
│   │                         #   window.DikaProduk. Di-link SEBELUM produk-ui.js.
│   ├── kategori-map.js       # PEMETAAN category/brand Digiflazz -> slug kategori kita
│   │                         #   window.DikaKategoriMap. Belum di-link ke halaman —
│   │                         #   dipakai backend/admin saat sinkronisasi price-list.
│   ├── produk-ui.js          # BERSAMA — primitif UI paling bawah: fmtRupiah/fmtNumber,
│   │                         #   createGrid, createModal, wireBack. window.DikaProdukUI.
│   ├── margin-calc.js       # BERSAMA — kalkulator margin (TAMPILAN saja)
│   │                         #   window.DikaMargin. DILARANG dipakai di alur bayar.
│   ├── pascabayar-fields.js # BERSAMA — label field identitas per kategori pascabayar
│   │                         #   window.DikaPascaField. SATU sumber label; halaman
│   │                         #   pascabayar TIDAK lagi hardcode "Nomor HP".
│   ├── auto-lock.js         # BERSAMA — kunci PIN otomatis kalau app ditinggal >= 5 mnt
│   │                         #   window.DikaLock. Di-link di SEMUA halaman member
│   │                         #   (kecuali auth.html), SETELAH auth.js di <head>.
│   ├── digiflazz-rc.js      # BERSAMA — peta kode alasan (rc) penyedia -> pesan member
│   │                         #   window.DikaRC. KONTEN pesan dipisah dari LOGIKA alur;
│   │                         #   isinya masih DUMMY, diganti daftar resmi saat integrasi.
│   ├── payment-flow.js      # BERSAMA — alur bayar (cek saldo -> proses -> hasil)
│   │                         #   window.DikaPayment. SATU-SATUNYA yang memotong saldo
│   │                         #   & mencatat riwayat untuk pembelian produk. mintaHasil()
│   │                         #   = satu-satunya penentu hasil (diganti saat integrasi).
│   ├── input-helper.js       # BERSAMA — ambil nomor dari KONTAK / SUARA / QR-barcode
│   │                         #   window.DikaInputHelper. Satu implementasi untuk semua
│   │                         #   halaman produk; tombol yang APInya tak didukung tidak dipasang.
│   ├── operator-detect.js    # BERSAMA — peta prefix operator, deteksi, prettyPhone, markup badge
│   │                         #   window.DikaOperator. SATU-SATUNYA tempat peta prefix & warna operator.
│   ├── produk-page.js        # BERSAMA — controller TIPE A (auto-detect operator) di atas produk-ui.js
│   ├── provider-page.js      # BERSAMA — controller TIPE B (pilih brand -> pilih nominal)
│   │                         #   Kait data backend: config.providersFor() +
│   │                         #   nilai balik .segarkan(). Lihat "Halaman TIPE B
│   │                         #   berdata backend".
│   ├── manual-page.js        # BERSAMA — controller TIPE C (nominal diisi manual).
│   │                         #   Opsi config.detect -> idField diperlakukan sbg NOMOR HP
│   │                         #   (dipakai hp-pasca.html: badge operator + chip sub-brand)
│   │                         #   22 halaman produk = 3 controller + 1 lapis primitif. Data per
│   │                         #   halaman ada di <id>.js; nama file HTML = id di ALL_SERVICES
│   │                         #   (kecuali "data" -> paket-data.html).
│   ├── illustrations.js      # BERSAMA — karakter ilustrasi SVG (window.DikaIllus)
│   │                         #   SATU-SATUNYA sumber karakter. Di-link SEBELUM paymodal.js.
│   ├── margin.js
   ├── katalog-jumlah.js     # REGISTRY jumlah produk sungguhan per kategori
   │                         #   (window.DikaKatalogJumlah). Diisi 12 file data
   │                         #   prabayar sendiri; dibaca margin.js. Di-link di
   │                         #   margin.html SEBELUM 12 file data itu, TANPA
   │                         #   controllernya (produk-ui.js dst) — lihat catatan
   │                         #   di section "Atur Margin Saya".
   ├── api.js                # BERSAMA - window.DikaApi. SATU-SATUNYA tempat fetch ke
   │                         #   backend DikaPay (+cache sesi 5 menit). Dipakai file data
   │                         #   kategori yang sudah live (mulai pulsa.js).
   ├── brand-map.js          # PEMETAAN brand Digiflazz -> kunci internal (opKey /
   │                         #   provider.id) + jenis e-money. window.DikaBrandMap.
   │                         #   LAPISAN SYNC — tidak di-link ke halaman.
   ├── subkategori-map.js    # PENCOCOK subkategori dari product_name (TEBAKAN).
   │                         #   window.DikaSubkategori. TIDAK dipakai halaman mana
   │                         #   pun lagi — tetap ada sebagai jalur cadangan di
   │                         #   kategori-live.js (cabang config.subdef).
   ├── tipe-map.js           # BERSAMA — field `tipe` RESMI Digiflazz -> famili
   │                         #   subkategori. window.DikaTipe. Di-link di pulsa,
   │                         #   paket-data, perdana & sms-telpon SEBELUM file datanya.
   ├── inquiry-pasca.js      # CEK TAGIHAN pascabayar — DATA ASLI Digiflazz
   │                         #   lewat POST inquiry-pasca.php. window.DikaInquiry.
   │                         #   Di-link di 16 halaman pascabayar SEBELUM
   │                         #   manual-page.js (menggantikan inquiry-dummy.js,
   │                         #   yang masih di disk sbg referensi).
   ├── inquiry-dummy.js      # LAMA — data dummy deterministik. Tidak ditaut
   │                         #   lagi; disimpan sbg referensi bentuk data.
   ├── gas-prabayar.js       # Halaman Gas Prabayar (token gas PGN, PRABAYAR).
   │                         #   window.DikaGasPrabayar. Pola listrik.js;
   │                         #   menggantikan menu "TV".
   ├── pin-transaksi.js      # BERSAMA - window.DikaPinTransaksi. PIN WAJIB tiap transaksi.
   │                         #   Di-link di 28 halaman produk (SEBELUM payment-flow.js),
   │                         #   transfer-member.html, DAN auth.html (cek status banned
   │                         #   sebelum login). FAIL-CLOSED. Salah PIN 3x -> banned 2 jam.
   ├── biometrik.js          # BERSAMA - window.DikaBiometrik. SATU-SATUNYA pintu ke sensor
   │                         #   biometrik (@aparajita/capacitor-biometric-auth). FAIL-CLOSED:
   │                         #   autentikasi() cuma true kalau prompt Android menjawab sukses.
   │                         #   Di-link di auth.html (SEBELUM auth-flow.js) & akun.html.
   ├── perangkat.js          # BERSAMA - window.DikaPerangkat. Daftar Perangkat Aktif dari
   │                         #   @capacitor/device. SATU-SATUNYA yang menyentuh kunci
   │                         #   dikapay:devices:<nomor digit>. Dicatat saat LOGIN.
   ├── placeholder-anim.js   # BERSAMA - window.DikaPlaceholder. Placeholder beranimasi untuk
   │                         #   SEMUA field nomor; dipanggil dari controller, bukan per halaman.
│   ├── akun.js
│   ├── data.js               # SUMBER DATA BERSAMA — window.DATA.TX / .DETAILS / .CATS (transaksi & kategori)
│   │                         #   Satu-satunya tempat data transaksi; dipakai riwayat.js & statistik.js.
│   │                         #   JANGAN duplikasi data transaksi ke file lain.
│   ├── paymodal.js           # bottom sheet "Segera Hadir" reusable — window.DikaComingSoon({title, lines})
│   │                         #   Ikut history: push 1 entri saat buka, BACK HP menutup sheet (bukan pindah halaman)
│   ├── bottomnav.js          # BOTTOM NAV BERSAMA (indikator emas + navigasi tab) untuk beranda/riwayat/margin/akun
│   │                         #   Satu moveIndicator(); sync tab aktif dari nama file; pulih dari bfcache lewat pageshow.
│   │                         #   ROUTES dihitung runtime (root vs /pages/) sama seperti auth.js.
│   │                         #   Di-link SETELAH paymodal.js, SEBELUM script halaman. JANGAN bikin moveIndicator lokal lagi.
│   └── translations.js       # i18n sederhana (id/en) — window.I18N; di-link SEBELUM script tiap halaman
│
├── styles/               # SEMUA file .css (9 file)
│   ├── style.css             # stylesheet dasar + custom properties tema (:root), dipakai semua halaman
│   ├── auth.css               # gaya auth.html (.auth-*/.aff/.abtn/.auth-keypad/.auth-check)
│   ├── produk.css             # BERSAMA — gaya semua halaman produk (.phead/.pfield/.opbadge/.prod/.cmodal*)
│   ├── transfer-member.css    # KHUSUS transfer-member.html — bukan bagian arsitektur produk (lihat bawah)
│   ├── riwayat.css
│   ├── statistik.css
│   ├── notifikasi.css
│   ├── margin.css
│   └── akun.css
│
└── assets/
    ├── sounds/            # audio (mis. success.mp3) — folder disiapkan, BELUM ada file
    └── images/            # gambar/ikon rester
        ├── akun-banned.png   # ilustrasi popup "Akun Kamu Telah Dibanned" (pin-transaksi.js)
        ├── nama-terkunci.png # ilustrasi popup "Nama Kamu Sedang Terkunci" (akun.js, Data Diri)
        ├── promo-banner-1.png # banner carousel Beranda "Isi Pulsa Lebih Mudah"
        └── promo-banner-2.png # banner carousel Beranda "Kemudahan dalam Satu Genggaman"
```

> Catatan: folder project di sebagian device Android muncul sebagai `DIKAPAY` **dan** `DikaPay` (FUSE case-insensitive) — inode-nya sama, isinya satu. `ls` bisa menampilkan sebagian file saja; verifikasi dengan `test -f`.

**Konvensi path lintas-folder (WAJIB dipatuhi saat menambah/mengedit apa pun):**

- Dari **`index.html`** (root) ke folder lain: **tanpa** `../` — `scripts/<file>.js`, `styles/<file>.css`, `pages/<file>.html`.
- Dari halaman mana pun di **`/pages/`** ke folder lain: **satu** `../` — `../scripts/<file>.js`, `../styles/<file>.css`, `../index.html`. Ke sesama halaman di `/pages/` **tidak perlu prefix** (satu direktori yang sama).
- **SELALU path relatif, JANGAN path absolut** (`/pages/...`) — aturan lama soal kompatibilitas Capacitor (lihat "Aturan Pengembangan") tetap berlaku, malah sekarang lebih penting karena ada dua kedalaman folder yang harus tetap berfungsi sama saat di-bundle ke WebView.
- **Dua file dipanggil dari KEDUA kedalaman sekaligus** (root index.html DAN halaman-halaman di `/pages/`): `auth.js` (constant `LOGIN_PAGE`) dan `bottomnav.js` (`ROUTES`). Keduanya **menghitung path runtime** lewat cek `location.pathname` (fungsi kecil `inPages()` di masing-masing file) alih-alih hardcode satu string — supaya tetap **satu implementasi** (bukan disalin per lokasi) dan tetap path relatif. Kalau menambah file lain yang situasinya sama (dipanggil dari root **dan** dari `/pages/`), ikuti pola yang sama — jangan hardcode satu path saja.
- File JS lain yang punya fallback navigasi ke beranda (`notifikasi.js`, `riwayat.js`, `produk-ui.js` [dipakai 22 halaman produk], `transfer-member.js`, `HOME_PAGE` di `auth.js`) **tidak perlu logika runtime** — semuanya SELALU dimuat dari halaman yang hidup di `/pages/`, jadi cukup konstanta tetap `"../index.html"`.

Konvensi multi-halaman: tiap halaman = `<nama>.html` (di `/pages/`, kecuali beranda) + `<nama>.css` (di `/styles/`) + `<nama>.js` (di `/scripts/`). Semua halaman **selalu** me-link `style.css` dulu (token `:root`, `.press`, `.reveal`, `.bottom-nav`), lalu CSS khususnya. Markup `.bottom-nav` disalin per halaman (set `is-active` sesuai tab).

**`<script src="auth.js"></script>` selalu jadi baris PERTAMA di `<head>`**, di atas `<link rel="stylesheet">` — termasuk di `auth.html`. Guard harus jalan sebelum CSS & DOM apa pun ter-render, kalau tidak halaman member sempat "berkedip" tampil sebelum dilempar ke login.

`api.js` **SUDAH ADA** (fase 2 dimulai) — satu-satunya tempat `fetch` ke backend. Lihat "Katalog produk dari backend" di bawah.
Sesuaikan dokumen ini bila struktur berubah.

### Sesi / Auth (`auth.js` → `window.DikaAuth`, `auth.html` + `auth-flow.js`) — DUMMY

**Login & daftar SATU halaman** (`pages/auth.html` + `scripts/auth-flow.js`) — bukan dua file terpisah seperti sebelumnya. Alur dinamis mirip DANA: isi nomor HP sekali, halaman sendiri yang tahu apakah nomor itu member baru (cabang daftar) atau member lama (cabang masuk), lewat splash → nomor HP → cabang → sukses, semua di satu dokumen tanpa reload halaman.

- **Fase 1: TIDAK ada verifikasi kredensial nyata ke server.** Validasi terbatas pada FORMAT nomor HP (`08xx`/`+62`), **prefix operator yang dikenal** (lihat di bawah), dan panjang PIN (6 digit) — tidak ada backend.
- **`#phoneInput` menyaring SAAT MENGETIK, bukan cuma saat submit.** Listener `input` memakai `OP.sanitize()` — pola yang SAMA dengan `onPhoneInput()` di `produk-page.js` (halaman produk): buang semua non-digit, normalkan `62xxx`/`+62xxx` jadi `0xxx`, tulis balik hanya kalau berubah (caret tidak melompat). BUG yang diperbaiki: field ini dulu TIDAK menyaring apa pun saat mengetik (`type="tel"` tidak memblokir apa pun, listener `input`-nya cuma membersihkan pesan error) — simbol/huruf yang ter-ketik atau ter-tempel dari clipboard lolos masuk field. `findAccount()` juga **self-healing**: `phone` pada akun tersimpan dibangun ulang dari kunci digit penyimpanannya sendiri tiap kali dibaca (bukan dipercaya apa adanya) dan ditulis balik kalau berubah — membersihkan akun yang sempat tersimpan kotor dari bug ini ATAU dari field "Nomor HP" di Edit Profil (`akun.js`, lihat section "Akun"), yang punya celah serupa dan sudah diperbaiki dengan pola yang sama (izinkan digit+dash, bukan digit saja — field itu dibuka dengan nilai sudah berformat `"0812-3456-7890"`).
- **Cek prefix operator saat submit nomor** (`isKnownPrefix()` di `auth-flow.js`): nomor yang formatnya benar tapi prefiksnya tidak dipakai operator mana pun (mis. `0866…`, `0820…`) **ditolak**, supaya salah ketik tidak lolos jadi akun. Sumbernya `DikaOperator.detect()` dari **`operator-detect.js`** — `auth.html` me-link file itu tepat sebelum `auth-flow.js`. **JANGAN menyalin peta prefix ke sini**; itu tetap satu-satunya tempatnya (lihat "Halaman produk — arsitektur berlapis"), jadi menambah prefix baru dari Kominfo cukup di satu file dan validasi auth ikut terbarui.
  - **Nama operator TIDAK PERNAH ditampilkan di halaman ini.** Deteksinya jalan diam-diam; yang muncul cuma pesan umum *"Nomor HP sepertinya tidak valid. Coba periksa lagi, ya."* — jangan diubah jadi menyebut Telkomsel/Indosat/dst. (Beda konteks dengan **halaman produk**, yang memang SENGAJA menampilkan badge operator `.opbadge` setelah nomor diketik — di sana informasi itu membantu member memastikan produknya cocok. Larangan menyebut operator berlaku khusus untuk pesan error validasi di `auth.html`.)
  - **Fail-open kalau `operator-detect.js` gagal dimuat**: `isKnownPrefix()` mengembalikan `true` + `console.warn`, jadi member tidak terkunci dari aplikasinya sendiri gara-gara satu script gagal — alasan yang sama seperti anti-lockout `guard()` di bawah.
- **`auth.js` = SATU-SATUNYA yang menyentuh storage sesi** (flag `dikapay:auth`). Halaman lain (termasuk `auth-flow.js`/`akun.js`) wajib lewat `DikaAuth.isLoggedIn()/login()/logout()` — **jangan akses `localStorage` mentah** untuk urusan sesi. Ini TIDAK berubah dari sebelumnya — `auth-flow.js` **reuse** `DikaAuth`, tidak menduplikasi logika login/logout.
- **Anti-lockout & auto-guard**: sama seperti sebelumnya (fail-open kalau storage mati, `console.warn`, wajib fail-closed di fase 3). `isAuthPage()` sekarang cek `/(^|\/)auth\.html$/i` (SATU nama file, dulu `login|register`). **Halaman yang kena guard: SEMUA 29 halaman member** — `index` + semua 28 halaman lain di `/pages/` (yaitu 29 file di `/pages/` dikurangi `auth.html` sendiri). Yang TIDAK kena hanya `auth.html`.
- **Init `auth-flow.js` lewat `onReady` lokal**, bukan `DOMContentLoaded` langsung — pola yang sama seperti halaman mandiri lain (`transfer-member.js`, dulu `login.js`/`register.js`).
- **Fase 2/3**: ganti validasi lokal dengan `POST /api/auth/login` & `POST /api/auth/register` lewat `api.js` → token. Direktori `dikapay:account:*` (lihat bawah) dihapus total saat itu terjadi; `guard()` wajib fail-closed.

#### Alur `auth.html` (5 tahap, satu state machine di `auth-flow.js`)

1. **Splash** (`#splash`) — logo + particle background (`.auth-particle`, ~16 titik gold dibuat dinamis via JS, pola yang sama seperti `burstConfetti()` di `akun.js`: span dibuat runtime dengan custom property acak, bukan aset gambar). Auto-lanjut ke step nomor HP setelah ~1,7 dtk, atau ketuk untuk lompat lebih cepat. Menghormati `prefers-reduced-motion` (partikel tidak dibuat sama sekali kalau RM aktif).
2. **Nomor HP** (`#stepPhone`) — satu field, validasi format, submit → cari `dikapay:account:<nomor digit>`. Ketemu → Cabang B. Tidak ketemu → Cabang A.
3. **Cabang A — member baru** (`#stepRegister` → `#stepRegisterPin`):
   - Kartu sambutan (`.auth-welcome`, latar krem) dengan pesan **acak** dari `WELCOME_MESSAGES` (4 pasangan title+desc, nada hangat/playful — bukan dari `login.js` lama, karena file itu TIDAK PERNAH punya pool pesan sambutan; pool ini ditulis baru).
   - Field Nama Lengkap → Lanjutkan → step buat PIN. Nama yang diisi langsung dipakai untuk **sapaan personal** di step berikutnya (`#regPinGreet`, "Halo, {nama depan}! ...") — animasi masuknya (`authGreetIn`, fade+slide, delay 0,15 dtk) **TERPISAH** dari animasi container `.astep.is-in`, sengaja diberi jeda supaya terasa "menyambut" beberapa saat setelah kartu sendiri settle, bukan numpuk jadi satu gerakan. Tidak perlu di-reset manual lewat JS — `animation` langsung pada elemen (bukan digerbang class) otomatis restart tiap kali parent step berpindah dari `hidden` ke tampil.
   - **PIN 6 digit dwifungsi**: keypad custom (`.auth-pin-dots`/`.auth-keypad`, **salinan pola `.pin-dots`/`.keypad` di `akun.css`** dengan nama sendiri) — sub-state `new` → `confirm` di dalam SATU step (`regState.subStep`), persis pola `pinProcess()` di `akun.js`.
     - **Deteksi PIN lemah** (`isWeakPin()`) berjalan **HANYA di sub-state `new`** (buat PIN pertama), SEBELUM lanjut ke confirm — bukan di step konfirmasi, supaya member tidak perlu mengulang dari nol kalau PIN-nya sendiri sebenarnya sudah oke. Deteksi 3 pola: semua digit sama (`111111`), berurutan naik/turun (`123456`/`987654`, dicek lewat substring dari string `"0123456789"`/`"9876543210"`), dan daftar pola umum lain (`WEAK_PIN_COMMON`, mis. `121212`/`112233`/`123123`). **Bukan pemeriksa kekuatan lengkap** — cuma pola paling sering dipakai orang, sesuai maksudnya (peringatan, bukan validasi keamanan sungguhan).
     - Terdeteksi lemah → modal `#weakPinOverlay`/`.auth-modal-*` (primitif SENDIRI di `auth.css`, **bukan** `.cmodal` generik — butuh tombol **hijau** ("Coba Lagi, Yuk") & **merah** ("Lanjutkan") yang tidak ada di skema gold/outline standar). Animasi masuk & shake **DIGABUNG SATU** keyframe (`authModalIn`: fade+scale lalu wobble kecil) — sengaja TIDAK dipisah jadi `transition` (scale-in) + `animation` (shake) terpisah, karena keduanya sama-sama menyentuh `transform` dan animation akan "menang" lalu memutus transition di tengah jalan, keliatan melompat. **Tidak block** — "Coba Lagi, Yuk" (hijau, `--ok-solid`) mengosongkan buffer & tetap di sub-state `new`; "Lanjutkan" (merah, `--err-solid`) tetap pakai PIN itu & lanjut ke `confirm` (`advanceToConfirmPin()`, fungsi bersama dipakai jalur normal maupun jalur modal). Sengaja **tidak bisa ditutup dengan tap backdrop** — untuk keputusan yang menyentuh keamanan akun, device HARUS memaksa salah satu dari dua tombol dipilih secara sadar, bukan ketutup gak sengaja.
     - PIN kuat (tidak lemah) → **langsung** lanjut ke `confirm` tanpa modal apa pun, tanpa delay tambahan — jalur normal tidak berubah performanya sama sekali.
     - Cocok di sub-state `confirm` → `commitRegistration()`: simpan `dikapay:account:<nomor>` **BARU** (lihat kontrak data di bawah), tulis `dikapay:newmember = "1"` (lihat popup Beranda di bawah), lalu `activateSession()`, lalu step sukses. Tidak cocok → shake + reset ke sub-state `new` (pola `pinShake()`).
4. **Cabang B — member lama** (`#stepLogin`):
   - Avatar inisial gold + nama + nomor (dari `dikapay:account`), pola visual sama seperti `.tm-found__avatar`/`.ahead__avatar`.
   - **Biometrik jadi CTA utama HANYA kalau DUA syarat terpenuhi**: preferensi `dikapay:settings:biometric === "1"` DAN `DikaBiometrik.periksa()` menjawab sensornya ada & sudah didaftarkan. Layar SELALU dimulai dari keadaan paling aman (PIN terlihat, `#bioBlock` hidden); tombol sidik jari besar (`.auth-bio-btn`) baru menggantikannya setelah pemeriksaan itu selesai, dengan link kecil "Pakai PIN saja" di bawahnya. **Jangan dibalik lagi** — versi lama cukup melihat flag di localStorage lalu langsung menyembunyikan keypad PIN, sehingga tombol sidik jari bisa jadi satu-satunya jalan masuk di perangkat yang tidak punya sensor sama sekali. Preferensi ini **device-wide** (bukan per-akun — sensor biometrik nempel ke perangkat, bukan ke satu nomor), di-set lewat toggle **"Login dengan Biometrik"** di Akun > Keamanan (`#swBio`, dulu ada di markup tapi TIDAK PERNAH benar-benar disambungkan — sekarang ditulis pertama kali di `akun.js`, lihat bawah).
   - Belum aktif biometrik → `#pinBlock` (keypad PIN) langsung jadi cara masuk utama, `#bioBlock` tetap `hidden`.
   - Tap tombol biometrik → `DikaBiometrik.autentikasi()` → **prompt biometrik Android yang sesungguhnya** (`BiometricPrompt` lewat `@aparajita/capacitor-biometric-auth`). Sukses → `activateSession()` → layar sukses. Gagal / dibatalkan / sensor tidak tersedia → **keypad PIN dibuka** beserta alasannya, sesi TIDAK dibuka. Ini FAIL-CLOSED dan wajib tetap begitu: sebelumnya di sini cuma `setTimeout(900)` lalu `activateSession()` tanpa syarat apa pun — siapa pun yang memegang HP masuk dengan satu ketukan. Lihat `scripts/biometrik.js`. PIN benar → sama. **PIN salah → shake (`authShake`, sama seperti field lain) + reset buffer, TETAP di layar yang sama** — tidak ada `DikaAuth.login()` yang terpanggil sampai PIN/biometrik benar-benar cocok.
5. **Sukses** (`#stepSuccess`) — dipakai KEDUA cabang (judul beda: "Selamat datang, {nama}!" untuk daftar baru, "Selamat datang kembali, {nama}!" untuk login). Checkmark `.auth-check` — **salinan persis `.tm-check`/`tmDraw` di `transfer-member.css`** dengan nama sendiri (`authDraw`) — dipicu bersamaan `window.playSuccessSound()` (reuse `sound.js`, sama seperti transfer). Auto-redirect ke `DikaAuth.HOME_PAGE` ~1,4 dtk kemudian.

Setiap step adalah `<section class="astep">` yang di-toggle lewat `hidden` + class `.is-in` (fade+slide `authStepIn` 0,4 dtk) — dilepas-pasang ulang (`classList.remove` lalu `void el.offsetWidth` lalu `classList.add`) tiap kali step yang SAMA ditampilkan lagi, supaya animasinya bisa terpicu berkali-kali (mis. bolak-balik "Ganti nomor HP").

#### Kontrak data (localStorage) — auth

| Kunci | Isi | Ditulis oleh | Dibaca oleh |
|---|---|---|---|
| `dikapay:account:<nomor digit>` | `{ name, phone (cantik), pin }` — akun yang BISA LOGIN | `auth-flow.js` (`saveAccount`, saat daftar) | `auth-flow.js` (`findAccount`, saat cek nomor) |
| `dikapay:settings:biometric` | `"1"`/`"0"` — preferensi device-wide | `akun.js` (toggle `#swBio`) | `auth-flow.js` (tentukan tampilan Cabang B) |
| `dikapay:devices:<nomor digit>` | Array `{id,nama,model,platform,os,osVersion,dibuat,terakhir}` - perangkat yang pernah login DI SINI | `perangkat.js` (`catat`, saat login & saat flow Perangkat Aktif dibuka) | `akun.js` (`renderDevices`) |
| `dikapay:newmember` | Flag `"1"` — penanda "baru saja SELESAI daftar", bukan login biasa | `auth-flow.js` (`commitRegistration`, tepat saat akun dibuat) | `script.js` (`maybeShowNewMemberPrompt`, Beranda) — dibaca DAN dihapus sekaligus |

- **`dikapay:account:<nomor>` BUKAN `dikapay:member:<nomor>`** — dua direktori beda konsep, JANGAN digabung. `dikapay:member:*` (punya `transfer-member.js`) = "siapa saja yang bisa DIKIRIMI SALDO" (termasuk 4 member seed dummy: Budi, Siti, dst — mereka BUKAN akun yang bisa login, tidak pernah punya PIN). `dikapay:account:*` = "siapa yang PUNYA AKUN + PIN, bisa login sendiri". Kalau menambah field lintas keduanya, pikirkan dulu — biasanya tandanya butuh direktori ketiga, bukan menggabung dua yang ada.
- **PIN login = PIN Transaksi, SATU PIN yang sama** (keputusan produk, pola DANA asli). `commitRegistration()`/`activateSession()` menulis `dikapay:security = {pinCreated:true, pin}` — kunci & bentuk **SAMA PERSIS** dengan yang sudah dibaca `akun.js` (`security.pin`/`security.pinCreated`, lihat section "Akun" di bawah). Efeknya: member yang baru daftar otomatis dapat centang "PIN Transaksi" di Skor Keamanan Akun sejak hari pertama — bukan bug, itu konsekuensi PIN dwifungsi.
- **`dikapay:profile`/`dikapay:security` DIPERLAKUKAN SEBAGAI "cache sesi aktif"**, bentuknya TIDAK BERUBAH sama sekali dari sebelumnya — semua halaman lain (`akun.js`, `script.js`, `transfer-member.js`, `notif-store.js`) terus membacanya persis seperti sebelumnya, TIDAK PERLU tahu apa-apa soal `dikapay:account`. `activateSession(account)` di `auth-flow.js` menimpa keduanya dari data akun yang baru dipakai; email di `profile` **dipertahankan** kalau nomornya sama dengan sesi sebelumnya (ganti PIN lalu login ulang), dikosongkan kalau beda (identitas lain, supaya email lama tidak salah tempel).
- **Tidak ada direktori member seed untuk akun login** — beda dari `dikapay:member:*` (transfer) yang di-seed 4 nama dummy, `dikapay:account:*` **mulai kosong total**. Setiap nomor yang belum pernah didaftarkan lewat `auth.html` akan SELALU jatuh ke Cabang A, apa pun nomornya.
- **TODO fase 2**: seluruh `dikapay:account:*` diganti `POST/GET /api/auth/*` lewat `api.js`; biometrik diganti WebAuthn asli. Lihat komentar header `auth-flow.js`.

#### Login dengan Biometrik (`#swBio` di `akun.js`)

`akun.js` membaca `dikapay:settings:biometric` saat render awal (set `swBio.checked`) dan menulisnya balik tiap `change` — **SATU-SATUNYA** tempat yang menulis kunci ini, selalu lewat `DikaBiometrik.setAktif()`.

**MENYALAKAN toggle harus dibuktikan satu pemindaian sungguhan** (`DikaBiometrik.periksa()` lalu `autentikasi()`); gagal/batal -> toggle kembali mati. Mematikannya tidak perlu pembuktian — mengurangi hak akses selalu boleh. Tanpa pembuktian ini toggle bisa dinyalakan di perangkat tanpa sensor, dan halaman login akan menyembunyikan keypad PIN demi tombol yang mustahil berfungsi. Kalau `biometrik.js` tidak dimuat, toggle di-`disabled` — bukan dibiarkan seolah berfungsi.

#### Gaya halaman auth (`auth.css`)

- Dipakai oleh `auth.html` (dulu dibagi `login.html`+`register.html`, sekarang satu file lebih sederhana). `style.css` di-link lebih dulu (token `:root`, `.press`, `.reveal`).
- Primitif yang DIPERTAHANKAN dari versi lama: `.auth-hero`/`.auth-logo`/`.auth-card` (kerangka), `.aff`/`.aff__label`/`.aff__err` (field floating-label, salinan pola `.ff` di `akun.css`), `.abtn` (tombol utama, salinan pola `.apply-btn`), `.auth-err`/`.auth-toast`. Halaman ini **tidak** memuat `akun.css`/`transfer-member.css`, jadi semua yang mirip disalin dengan nama sendiri (`authShake`, `authSpin`, dst) — pola yang sudah dipakai sejak `auth.css` pertama kali ada.
- **DIHAPUS** karena tidak relevan lagi di alur baru: `.pwbar`/`.pwhint` (meter kekuatan password — tidak ada lagi field password), `.auth-terms` (checkbox syarat & ketentuan), `.auth-alt` (link "Belum/Sudah punya akun?" — tidak ada lagi dua halaman untuk berpindah).
- **BARU**: `.auth-splash`+`.auth-particle` (splash particle, lihat alur di atas), `.astep`+`authStepIn` (transisi antar step), `.auth-welcome` (kartu sambutan Cabang A), `.auth-member`+`.auth-avatar` (avatar+nama Cabang B), `.auth-bio-btn` (tombol biometrik besar + `authBioScan` pulse saat memindai), `.auth-pin-dots`+`.auth-keypad` (salinan `.pin-dots`/`.keypad` akun.css), `.auth-check`+`.auth-success` (salinan `.tm-check`/`.tm-success` transfer-member.css).
- Input floating-label **wajib punya `placeholder=" "`** — labelnya naik lewat `:not(:placeholder-shown)`, sama seperti sebelumnya.
- Elemen ber-atribut `hidden` yang punya `display` (`.astep`, `.auth-toast`) punya blok guard `[hidden] { display: none; }` — alasan yang sama seperti di `produk.css`.

### Beranda (`index.html`) — komponen

- **Topbar** (`.topbar`) — blok navy penuh, sudut bawah membulat. Berisi:
  - Baris kompak: `.avatar` (lingkaran gold, **ikon dompet inline SVG** navy — badan + lip + kartu mengintip + kantong clasp; `avatarIn` scale+rotate sekali saat masuk, lalu `.avatar::after` sapuan kilau `avatarShine` tiap ~6 dtk dengan jeda tenang, `.avatar` `overflow:hidden`) + saldo (`#balanceAmount`, count-up) + toggle mata (`#balanceToggle`, fade). **Saldo dibaca dari `localStorage["dikapay:balance"]`** lewat `readBalance()` di `script.js` (fallback 125000 kalau kunci belum ada) — bukan lagi konstanta tetap, karena `transfer-member.js` menguranginya saat transfer berhasil. Lihat "Transfer Antar Member" di bawah.
  - Aksi cepat (`.quick-actions`, `space-evenly`): **Top Up / Transfer / Notifikasi** (3 item; Riwayat dihapus). Semua punya aksi nyata (handler di listener `.topbar`):
    - **Top Up** → `window.DikaComingSoon(COMING_SOON.topup)` — bottom sheet "Segera Hadir" reusable (dari `paymodal.js`).
    - **Transfer** → navigasi ke `transfer-member.html` (setelah `is-send` whoosh singkat) — **bukan lagi Coming Soon**. Lihat "Transfer Antar Member" di bawah untuk halamannya.
    - **Notifikasi** → navigasi ke `notifikasi.html` (setelah `bellWiggle` singkat).
    - Transfer = ikon 2 panah horizontal kirim/terima (`.qa-swap`), tap → `qaSend` whoosh. Notifikasi = lonceng (`.qa-ic--bell`) + badge `#notifBadge` `radar` infinite; badge disembunyikan jika `localStorage["dikapay:notifRead"]==="1"` (di-set saat halaman notifikasi dibuka); `renderNotif()` juga dipanggil di `pageshow` (sinkron saat kembali / bfcache).
  - **Banner "hero" DIHAPUS** atas keputusan produk — section `.hero-banner` (headline "Semua Kebutuhan, Satu Ketukan Saja" + CTA "Mulai Sekarang" + ilustrasi karakter + chip melayang) sudah tidak ada di `index.html`. Semua gaya `.hero-*` + `@keyframes heroGradient/floatBlob/twinkle/floatChar/floatChip`, fungsi `renderHeroPerson()`, dan kunci i18n `home.hero.*` ikut dihapus. Setelah `.quick-actions`, topbar langsung ditutup; jarak ke section "Layanan" = `padding-bottom` topbar (20px) + `padding-top` `.content` (18px). `DikaIllus.phone()` tetap ada di `illustrations.js` (dipakai `paymodal.js` `.wave` — nama beda, ilustrasi sama). Jangan menambahkan banner kembali tanpa keputusan produk baru.
- **Layanan** (`.card` + `#menuGrid`) — dirender `script.js` dari `MENU_ITEMS` (item terakhir = **"Lainnya"**, ikon `grid`); ikon SVG dari `ICONS`; reveal staggered, tap-scale + ripple. Tap "Lainnya" → bottom sheet **"Semua Layanan"** (`openServices()`): grid 4 kolom dari `ALL_SERVICES` (**24 item**), item fade+scale staggered, judul + close (X), swipe-down / tap overlay untuk tutup. Pakai primitif `.paysheet` di `style.css` + kelas `.svc-*`. Sheet ikut scroll (`.paysheet` `max-height:94vh; overflow-y:auto`) kalau layar pendek: `.svc-head` **sticky** (judul + X tetap terjangkau, `box-shadow` menutup celah `padding-top`) dan `.svc-item__label` punya `min-height: 2.4em` supaya ikon tiap baris grid tetap sejajar walau label 2 baris.
  - **Handler item**: 8 layanan baru terdaftar di `SVC_COMING_SOON` (id → `{title, lines}`) → tap = `closeServices()` lalu `window.DikaComingSoon(...)` setelah 240ms (biar dua sheet tidak menumpuk; paymodal yang urus history-nya). **Pulsa**, **Paket Data** & **Listrik** sudah punya halaman → `ROUTES["svc:pulsa"]` / `["svc:data"]` / `["svc:listrik"]`. 9 layanan lama sisanya **belum** punya handler — jatuh ke `handleAction("svc:<id>")` yang cuma `console.log` karena belum ada di `ROUTES`. Saat sebuah layanan sudah punya halaman produk: hapus entrinya dari `SVC_COMING_SOON` dan daftarkan `"svc:<id>": "<file>.html"` di `ROUTES`.
- **Ticker keamanan** (`.ticker` + `#tickerText`) — dari `SECURITY_TIPS`; **khusus info keamanan & tips, TIDAK boleh berisi promo/riwayat transaksi**. Crossfade teks tiap 5 dtk, ikon shield (kiri) dengan check animasi
- **Carousel Promo** (`#infoCarousel`) — dari `INFO_ITEMS`, auto-slide 4 dtk + swipe (sentuh), dot indicator, berhenti saat tab tidak terlihat. **TANPA judul section "Promo"** di atasnya (dihapus atas keputusan produk — banner-nya sudah bicara sendiri; jangan dikembalikan tanpa keputusan baru).
  - **DUA BENTUK SLIDE**, dibedakan lewat field `type` di `INFO_ITEMS` dan dirender `slideHtml()`: `type: "image"` → banner GAMBAR (`.promo-slide--img` + `<img class="promo-slide__img">`), tanpa `type` → slide TEKS lama (theme `navy`/`mixed`/`gold` + tag + title + sub + bentuk geometris `.promo-slide__shape`).
  - Isi sekarang **3 slide**: 1 slide teks (`Fitur Baru` — "Bayar sekali untuk banyak tagihan") + 2 banner gambar (`assets/images/promo-banner-1.png`, `promo-banner-2.png`). Dua slide teks lama (`Cashback 20%` & `Ajak teman, dapat Rp5.000`) DIHAPUS saat banner gambar masuk — keduanya menjanjikan fitur yang belum ada di app (cashback & referral). Jangan dihidupkan lagi tanpa fiturnya benar-benar ada.
  - **Tinggi semua slide DIKUNCI lewat `aspect-ratio` di `.carousel__slide`**, nilainya dari custom property `--promo-ratio` (= rasio asli banner, `1793 / 877`). Tanpa itu slide teks dan slide gambar beda tinggi, dan carousel "melompat" tiap kali bergeser — konten di bawahnya ikut tersentak. **Ganti banner dengan rasio lain → ubah `--promo-ratio` saja**, satu tempat di `style.css`.
  - Gambar pertama dimuat `fetchpriority="high"`, sisanya `loading="lazy"` — banner ada di layar pertama, tapi yang belum terlihat tidak perlu ikut menahan first paint.
- **Bottom navigation** (`.bottom-nav`) — 5 slot: Beranda / Transaksi / **PAY** / **Margin** / **Akun** (markup disalin di `index.html`, `riwayat.html`, `margin.html`, `akun.html`). Tombol tengah `.bottom-nav__pay` → **pay sheet** (`paymodal.js`), bukan navigasi. **Semua logika nav (peta rute, klik tab, indikator garis emas `moveIndicator`, set `is-active`, restore bfcache via `pageshow`) ada di `bottomnav.js`** — satu implementasi, bukan lagi 4 salinan (`ROUTES`/`NAV_ROUTES`/`NAV` + `moveIndicator` lokal sudah dihapus dari `script.js`/`riwayat.js`/`margin.js`/`akun.js`). Tab aktif ditentukan `bottomnav.js` dari nama file halaman, jadi indikator tidak "nyangkut" di tab lama setelah back/forward.
- **Popup "Yuk, Amankan Akun Kamu"** (`#secPromptOverlay`, `maybeShowNewMemberPrompt()` di `script.js`) — muncul OTOMATIS, TEPAT SEKALI, hanya untuk member yang baru saja SELESAI mendaftar (bukan login biasa) di kunjungan PERTAMA ke Beranda. Dipicu flag `dikapay:newmember` yang ditulis `auth-flow.js` saat pendaftaran selesai; `maybeShowNewMemberPrompt()` membaca DAN langsung menghapusnya di awal (sebelum popup sempat ditutup/diklik apa pun) — jadi refresh atau kunjungan berikutnya TIDAK PERNAH menampilkannya lagi, apa pun yang terjadi. Tombol "Nanti Saja" (outline) sekadar tutup; "Lengkapi Sekarang" (gold) → `pages/akun.html`. Muncul dengan jeda ~0,7 dtk (`REDUCED_MOTION` → langsung) supaya tidak "menyerbu" sebelum beranda sempat kelihatan.
  - **Pakai `.cmodal-overlay`/`.cmodal`** — primitif yang DIPROMOSIKAN ke `style.css` (sebelumnya disalin terpisah di `akun.css`/`margin.css`/`produk.css`, komentar lama di `produk.css` malah sudah menandainya "kandidat dipindah ke style.css nanti"). `index.html` **tidak punya CSS modal sendiri**, jadi ini murni reuse — bukan salinan ke-4. Halaman yang SUDAH punya salinan sendiri (akun/margin/produk) TIDAK terpengaruh — CSS mereka di-link setelah `style.css`, tetap menang di cascade (selector sama, urutan lebih akhir). Kalau menambah modal konfirmasi sederhana lagi di halaman TANPA salinan `.cmodal` sendiri, pakai versi `style.css` ini dulu sebelum menyalin lagi.

### Pay sheet — modal "Segera Hadir" reusable (`paymodal.js`)

- Modul mandiri di-link oleh `index.html` & `riwayat.html` (setelah `style.css`, sebelum script halaman). CSS di `style.css` (`.paysheet*`).
- **Reusable**: `window.DikaComingSoon({ title, lines: [p1, p2] })` — isi judul + paragraf bubble di-set via `textContent` saat dibuka. Tanpa argumen → default "Scan & Pay". Dipakai untuk PAY (default) & Top Up (lihat `COMING_SOON` di `script.js`). **Transfer TIDAK lagi masuk sini** — sudah punya halaman sendiri, lihat "Transfer Antar Member".
- Intercept klik `.bottom-nav__pay` via listener **capture** + `stopImmediatePropagation`. DOM sheet dibuat lazy saat pertama dibuka.
- Isi: ilustrasi karakter dari **`illustrations.js`** (`DikaIllus.wave()`, `payFloat`), orbit ikon jam & gear (`paySpin`), badge "Segera Hadir" (`payBadgePulse`), speech bubble (fade+scale, `transition-delay: .3s`), tombol "Oke, Mengerti" (gold) + "Ingatkan Saya Nanti" (→ `closeSheet` + toast).
- Tutup: tombol, tap overlay, swipe-down (handle/ilustrasi, threshold 90px), `Esc` → slide-down + fade-out.

### Karakter ilustrasi (`illustrations.js` — `window.DikaIllus`)

- **SATU-SATUNYA sumber karakter DikaPay.** Jangan tulis SVG karakter langsung di HTML / modul lain.
  - `DikaIllus.phone(opts)` — **tidak lagi dipakai** (banner beranda dihapus); fungsinya dipertahankan supaya API dua-pose tetap utuh.
  - `DikaIllus.wave(opts)` — modal "Segera Hadir" (class default `.paysheet__char`). **Satu-satunya pemakai karakter saat ini.**
  - `DikaIllus.character({ pose, className, label })` untuk kebutuhan lain.
- **Kedua pose memakai ILUSTRASI YANG SAMA** — flat design, karakter ceria memegang HP, di atas lingkaran navy. Yang beda hanya class-nya. API dua-pose dipertahankan supaya call site (`paymodal.js`) tidak perlu diubah kalau nanti pose dibedakan lagi.
- **viewBox `0 0 380 460`** (rasio ±0,826). Ukuran diatur dari CSS, bukan atribut width/height di SVG:
  - `.paysheet__char` → `height: 100%` (mengikuti `.paysheet__illus` 162px, lebar ikut ±134px). Patokan TINGGI, bukan lebar.
- **WARNA DI DALAM SVG TIDAK BOLEH DIUBAH** — aset diberikan apa adanya (`#0B2447`, `#123566`, `#3AAFA9`, `#F2A65A`, `#FFC93C`, `#4FD1FF`, `#1a1a1a`, `#1c2b4a`, `#08142c`, `#e8895f`). Ilustrasi ini **tidak ikut token tema**.
- Ilustrasi punya **lingkaran navy `#0B2447` sebagai latar** — konsekuensi aset, bukan bug.
- **Urutan `<script>`**: `illustrations.js` **sebelum** `paymodal.js` di semua halaman yang memakai sheet "Segera Hadir" (26 halaman: index, riwayat, margin, akun + 22 halaman produk). `statistik.html` & `notifikasi.html` tidak memuat keduanya.

### Notifikasi (`notifikasi.html`)

- Dari quick action **Notifikasi** di beranda. `.app` slide-in dari kanan (`pageIn`); back → `.is-leaving` + `history.back()`.
- Data dummy `NOTIFS` (7 item), jenis di `NTYPES` (security=biru shield+check, success=hijau circle+check, promo=amber gift) — ikon inline SVG. Tiap item: ikon, judul, desc 1–2 baris, waktu relatif.
- Unread (`.notif.is-unread`): titik gold (`.notif__dot`) + background lebih terang. List `notifIn` fade+slide-up staggered (`i*55ms`).
- `init()` set `localStorage["dikapay:notifRead"] = "1"` → badge lonceng di beranda hilang saat kembali.

### Transfer Antar Member (`transfer-member.html`)

- Dari quick action **Transfer** di beranda. **Transfer SESAMA MEMBER DikaPay lewat nomor HP terdaftar — BUKAN transfer bank.** Fase 1: semua dummy, disimpan di `localStorage` perangkat ini; tidak ada panggilan jaringan sama sekali.
- **Bukan bagian arsitektur "Halaman produk"** (lihat bawah) — tidak ada SKU/`harga_modal`/`admin_fee`, tidak lewat `produk-ui.js`/`produk-page.js`/`manual-page.js`/`provider-page.js`, dan **tidak me-link `produk.css`**. Polanya sendiri di `transfer-member.css` (prefix kelas `.tm-`) — pilihan yang sama seperti `auth.css` memisahkan diri dari `akun.css`: primitif visual (header, field, badge, modal, warning box) **disalin dengan nama sendiri**, bukan diimpor, supaya halaman ini tidak diam-diam terikat ke perubahan di keluarga halaman lain. `.app`/`.card`/`.press`/`.reveal`/`.content` tetap dipakai apa adanya dari `style.css`.
- `transfer-member.js` tidak memuat `produk-ui.js`, jadi punya salinan kecil `onReady` sendiri (pola yang sama seperti `auth-flow.js`) — **bukan** `DOMContentLoaded` langsung.
- **Alur**: isi nomor HP tujuan → dicari di direktori member (debounce 150ms) → **ditemukan**: preview kartu hijau (avatar inisial gold + nama + nomor, animasi fade/slide `tmFoundIn`) dan blok nominal terbuka; **tidak ditemukan**: pesan error ramah di bawah field, field jadi merah, TIDAK lanjut ke step nominal → isi nominal (`parseAngka`, lihat di bawah) + catatan opsional → "Lanjutkan" (divalidasi: tidak kosong, ≥ Rp1.000, ≤ saldo) → **modal konfirmasi** (ringkasan + kotak peringatan amber) → "Transfer Sekarang" → spinner ~850ms → sukses (checkmark `tmDraw` + ringkasan + "Kembali ke Beranda" / "Transfer Lagi").
- **`parseAngka(input)`** — nama fungsi untuk parsing input nominal di halaman ini (format ribuan sambil mempertahankan posisi caret). Pola & implementasinya **identik** dengan `formatNominal()` di `manual-page.js` (dipakai semua halaman Tipe C) — disalin dengan nama sendiri karena halaman ini tidak memuat `manual-page.js`. Kalau menambah halaman lain yang butuh parsing nominal serupa, pertimbangkan menaikkan salah satu dari keduanya jadi primitif bersama.
- **Modal konfirmasi** (`#confirmOverlay`/`.tm-modal`) ditulis ulang secara lokal (bukan `createModal()` dari `produk-ui.js`) karena "Bayar"-nya harus benar-benar memproses transfer, bukan membuka sheet "Segera Hadir". Kontraknya tetap sama: `history.pushState` saat dibuka supaya **BACK HP menutup modal, bukan pindah halaman**, dan popstate/Esc/klik overlay menutupnya. Tombol back di header mengecek modal dulu (`if (modalOpen) { closeConfirm(); return; }`) sebelum navigasi — pola yang sama seperti `provider-page.js`.
- **Peringatan sebelum kirim** (`.tm-warn`, amber + ikon segitiga `tmWarnPulse`) menegaskan transfer **tidak bisa dibatalkan** dan meminta pengguna memeriksa ulang nomor tujuan — nada hangat & sopan, bukan `PERHATIAN!!!` kaku. Kalau mengubah salinan ini, pertahankan nadanya.
- **Tidak memakai `.is-leaving`** (animasi keluar halaman ala `produk-ui.js`) — tombol back & "Kembali ke Beranda" navigasi langsung (`location.href`), sama seperti `auth-flow.js`. Halaman ini tidak memuat `produk-ui.js`, jadi tidak ikut jaring pertahanan bfcache-nya (`pagehide`/`pageshow`); menambahkan exit-animation di sini TANPA jaring itu berisiko menimbulkan lagi bug "halaman blank" yang didokumentasikan di bagian "Halaman produk".

#### Kontrak data (localStorage) — SEMUA fase 1, akan diganti backend di fase 2

| Kunci | Isi | Ditulis oleh | Dibaca oleh |
|---|---|---|---|
| `dikapay:balance` | Angka, saldo pengirim (device ini) | `transfer-member.js` (`writeBalance`) | `script.js` (`readBalance`, kartu saldo beranda) & `transfer-member.js` sendiri |
| `dikapay:member:<nomor digit>` | `{ name, phone, balance }` — satu member lain | `transfer-member.js` (`ensureSeed`/`saveMember`) | `transfer-member.js` (`findMember`) |
| `dikapay:member:seeded` | Flag `"1"` — penanda direktori dummy sudah di-seed sekali | `transfer-member.js` | `transfer-member.js` (idempotensi `ensureSeed`) |
| `dikapay:tx:extra` | Array `{ tx, detail }[]`, transaksi baru dari perangkat ini | `transfer-member.js` (`appendLocalTx`) | `data.js` (`mergeLocalTx`, sekali saat dimuat) |
| `dikapay:notif:<nomor digit>` | Array notifikasi (`{type,title,desc,time,unread,ts}`) — kotak masuk SATU member | `transfer-member.js` lewat `notif-store.js` (`DikaNotif.push`, dua kali per transfer: pengirim & penerima) | `notifikasi.js` (`DikaNotif.getMine`, digabung ke atas `NOTIFS` dummy) & `script.js` (`DikaNotif.hasUnreadMine`, badge lonceng) |

- **`dikapay:balance` — SATU-SATUNYA kunci saldo saat ini.** Default `125000` HARUS SAMA di dua tempat (`readBalance()` di `script.js` DAN `DEFAULT_BALANCE` di `transfer-member.js`) — keduanya dikomentari saling silang; kalau mengubah salah satu, ubah juga yang lain.
- **Direktori member dummy** diseed sekali (`ensureSeed()`, dijaga `dikapay:member:seeded`) dengan 4 nama (termasuk "Budi Santoso" & "Siti Aminah" — sengaja memakai nama yang sama dengan penerima transfer dummy di `data.js`, biar terasa satu dunia yang konsisten). Idempotent: tidak menimpa saldo yang sudah berubah akibat transfer sebelumnya.
- **Nomor HP sendiri diblokir sebagai tujuan** — dibandingkan ke `dikapay:profile.phone` (dinormalisasi). Pesan errornya juga ramah, bukan sekadar "invalid".
- **Riwayat**: `commitTransfer()` menulis satu entri `{tx, detail}` ber-`cat: "transfer"` mengikuti **skema yang SAMA PERSIS** dengan entri transfer dummy di `data.js` (`recipient`/`recipientId`/`note`/`admin: 0`, `method: "Saldo DikaPay"`) — supaya `riwayat.js` (`renderReceipt`, cabang `isTransfer`) merender strukturnya tanpa perubahan apa pun. `data.js` menggabungkan `dikapay:tx:extra` ke `DATA.TX`/`DATA.DETAILS` **sekali saat dimuat** (`mergeLocalTx()`, di akhir file) — `riwayat.js` & `statistik.js` sendiri **tidak tahu apa-apa soal localStorage**, tetap hanya baca `DATA.TX`/`DATA.DETAILS` seperti sebelumnya. "Satu-satunya tempat data transaksi" tetap `data.js`.
- **Notifikasi transaksi (`notif-store.js` → `window.DikaNotif`)**: `commitTransfer()` menulis DUA notifikasi lewat `DikaNotif.push(nomorDigit, {type,title,desc})` — satu ke nomor **pengirim** (`getProfilePhone()`, pengguna yang sedang login di perangkat ini) dan satu ke nomor **penerima** (`digits`, target transfer). Pesan dipilih acak dari `SENDER_NOTIF_TEMPLATES`/`RECEIVER_NOTIF_TEMPLATES` (3 varian tiap sisi, nada hangat) — title & desc SELALU dari template yang sama (panggil `pickOne()` sekali, simpan hasilnya, jangan panggil dua kali untuk title & desc terpisah — gampang membuat keduanya tidak nyambung).
  - **Kenapa per-nomor, bukan satu kotak masuk**: di dunia nyata pengirim & penerima adalah DUA PERANGKAT berbeda. Menulis ke `dikapay:notif:<nomor penerima>` di perangkat pengirim adalah GROUNDWORK murni — baru "kelihatan" di perangkat ini kalau `dikapay:profile.phone` kebetulan cocok (skenario uji manual: tukar `dikapay:profile` lalu buka `notifikasi.html`, atau langsung `localStorage.getItem("dikapay:notif:<nomor>")` tanpa tukar profil sama sekali).
  - **Badge lonceng beranda TIDAK LAGI bergantung hanya pada flag `dikapay:notifRead`** — itu bisa basi (sudah "1" dari kunjungan lama, padahal ada notifikasi baru masuk setelahnya). `script.js` (`renderNotif`) sekarang OR-kan dengan `DikaNotif.hasUnreadMine()`; badge sembunyi hanya kalau KEDUANYA bilang "sudah dibaca". `notifikasi.js` (`init`) memanggil `DikaNotif.markMineRead()` di samping `dikapay:notifRead = "1"` yang lama.
  - `notifikasi.js` (`allNotifs()`) menggabungkan `DikaNotif.getMine()` DI ATAS array `NOTIFS` dummy sebelum di-`render()` — bentuk item sama persis (`type/title/desc/time/unread`), jadi tidak ada template/gaya terpisah untuk notifikasi "nyata" vs dummy.
  - **TODO fase 2** (ditulis juga sebagai komentar di `transfer-member.js`): push ke nomor **penerima** HARUS diganti push notification real-time dari backend (WebSocket/FCM) yang dikirim ke perangkat penerima sungguhan — bukan ditulis ke `localStorage` perangkat pengirim seperti sekarang. `notif-store.js` & kunci `dikapay:notif:*` berhenti dipakai untuk notifikasi transaksi begitu itu ada.
- **TODO fase 2** (ditulis juga sebagai komentar di `transfer-member.js`): validasi nomor tujuan pindah ke `GET /api/members/:phone`, proses transfer pindah ke `POST /api/transfer` (idealnya atomik di backend), saldo & riwayat berhenti dibaca dari `localStorage` — semuanya lewat `api.js`. Direktori member dummy (`SEED`/`ensureSeed`/`findMember`/`saveMember`) dan `mergeLocalTx()` di `data.js` dihapus total saat itu terjadi.

#### Alur CEK TAGIHAN — 16 halaman pascabayar (`inquiry-pasca.js` + `manual-page.js`)

**Alur sekarang: isi nomor (+ biller) → CEK TAGIHAN → lihat detail tagihan → BAYAR SEKARANG → PIN → proses.** Nominal **TIDAK lagi diketik member**; ia datang dari hasil cek. Ini menggantikan alur lama "isi nominal manual → Lanjutkan".

- **DATA ASLI DIGIFLAZZ** (`inquiry-pasca.js` → `window.DikaInquiry.cek(slug, customerNo, adminFallback, sku)`) — menggantikan `inquiry-dummy.js` (masih di disk sebagai referensi, tidak ditaut). Memanggil `DikaApi.inquiryPasca(sku, customerNo)` → **POST `inquiry-pasca.php`** body JSON string TANPA header `Content-Type: application/json` (memicu CORS preflight; body string biasa = `text/plain` safelisted, backend baca `php://input` apa adanya). `buyer_sku_code` = `produkAktif().sku` (kode_produk asli — ikut biller yang dipilih di picker untuk multi-biller, produk tunggal untuk sisanya).
- **Response**: `{ok:true, ref_id, data:{status, rc, customer_name, admin, selling_price/price, desc:{detail:[{periode, nilai_tagihan, ...}]}, ...}}`. `inquiry-pasca.js` memetakannya ke `{nama, id, periode, nominal, admin, total, refId, rc, raw}`.
- **GAGAL (rc ≠ "00" / status "Gagal")** → Promise DITOLAK dengan `Error.pesanMember` dari `DikaRC.pesan(rc)`; `manual-page.cekTagihan()` menampilkannya di `#nominalErr` dan tombol TETAP di "Cek Tagihan" (tidak lanjut ke bayar). rc yang belum dipetakan → pesan umum + `console.warn`.
- Bentuk hasil `DikaInquiry.cek()` SAMA dengan versi dummy, jadi `lanjutBayar()`/`rows()`/`payLine()` di **16 file kategori tidak disentuh**.
- Kartu hasil (`.tagihan`, gayanya di `produk.css`) **dibuat runtime** — 16 halaman tidak perlu menambah markup. Isinya: nama pelanggan, nomor (label ikut `pascabayar-fields.js`), penyedia, periode, nominal, admin, total.
- **Mengubah nomor/biller menghapus hasil cek sebelumnya** (`resetTagihan()` dipanggil dari `syncSteps()`). Tanpa itu member bisa membayar tagihan nomor A sambil melihat nama pelanggan nomor B — persis bug yang dicegah `resetResult()` di `listrik.js`.
- **Teks biaya admin di bawah kolom nominal DIHAPUS.** Admin sekarang muncul sebagai barisnya sendiri di kartu tagihan beserta totalnya. `config.submitLabel` ("Lanjutkan") tidak dipakai lagi — label tombol mengikuti tahap alur lewat `setTombol()`.
- Teks kartu peringatan di 16 halaman itu ikut diganti: klaim lama *"DikaPay belum menyediakan fitur cek tagihan otomatis"* sudah tidak benar begitu ada tombol Cek Tagihan.

#### Popup pemilih biller pascabayar (`UI.createPicker()` — 6 halaman)

**6 dari 16 halaman pascabayar** punya lebih dari satu biller untuk dipilih: `pdam`, `pbb`, `internet-pasca`, `tv-pasca`, `multifinance`, `hp-pasca` (yang lain punya SATU biller tetap — `produk` objek tunggal — jadi tidak ada yang perlu dipilih sama sekali). Dulu daftarnya dirender sebagai **kartu vertikal memanjang** langsung di badan halaman (`.choice-row` di dalam `#choiceList`), tampil dari awal tanpa syarat apa pun — untuk Multifinance (5 biller) itu masih wajar, tapi PDAM/PBB per kota/kabupaten bisa puluhan baris.

**Sekarang**: `#choiceSec` adalah **satu baris ringkas** (`.choice-trigger`, `#choiceBtn`) yang membuka **bottom sheet** (`UI.createPicker()`, produk-ui.js) berisi daftar billernya. Alurnya:

1. **Baris pemicu TERSEMBUNYI** sampai ID/nomor terisi cukup panjang (`idReady()` di manual-page.js — pemeriksaan yang SAMA dengan bagian ID di `isReady()`, tanpa syarat CHOICES). "Nomor dulu, baru pilihan" sekarang benar-benar ditegakkan lewat visibility, bukan cuma urutan markup.
2. Tap baris → `picker.open(CHOICES, { title: config.choiceTitle, picked: state.choice?.id })` → sheet slide-up dari bawah (fade overlay + `translateY`), daftar biller di dalamnya (`.pick-opt`), yang sedang terpilih (kalau ada) ditandai `is-active`.
3. Tap salah satu opsi → sheet tertutup, `state.choice` di-set, dan baris pemicu berubah jadi **ringkasan**: `config.pickedLabel + ": " + nama` (mis. **"Perusahaan Pembiayaan: FIF Group"**) + pill **"Ubah"** (`#choiceUbah`) muncul sebagai ajakan eksplisit mengganti pilihan. Tap baris itu lagi kapan saja membuka ulang sheet dengan pilihan sebelumnya tetap ditandai.
4. **BACK HP menutup sheet, bukan pindah halaman** — `createPicker` mendorong `history.pushState` saat dibuka dan mendaftar ke `registerOverlay()`, kontrak yang SAMA dengan `createModal`.

**`config.pickedLabel`** (baru, opsional) — label untuk baris ringkasan SETELAH dipilih, terpisah dari `config.choiceTitle` (dipakai sebagai judul sheet SEBELUM dipilih, biasanya berawalan "Pilih..."). Kalau tidak diisi, jatuh ke `choiceTitle` apa adanya (bisa kedengaran janggal, mis. "Pilih PDAM Daerah: PDAM Kota Surabaya") — makanya keenam halaman di atas semuanya sudah diberi `pickedLabel` sendiri ("PDAM", "Provider", "Penyedia", "Perusahaan Pembiayaan", "Wilayah", "Jenis Layanan").

**Markup**: `#choiceSec` (section, `hidden` statis) → `#choiceBtn` (tombol, isi seluruh baris) → `#choiceTitle` (span label/ringkasan) + `#choiceUbah` (pill, `hidden` statis) + chevron. **`#choiceList` SUDAH TIDAK ADA** — daftar opsinya dirender `createPicker` sendiri di sheet, bukan markup halaman. Gayanya (`.choice-trigger*`, `.pick-*`) ada di `produk.css`, salinan pola visual `.picker-overlay`/`.picker-sheet`/`.choice-opt` di **akun.css** (dipakai sheet Bahasa) dengan nama sendiri — produk.css tidak memuat akun.css.

**Kenapa tidak semua 16 halaman**: 10 sisanya (PLN Pascabayar, BPJS, BPJS TK, Gas, 5 sub-brand operator, E-Money Pascabayar) punya `produk` (objek tunggal, satu biller tetap) — tidak ada apa pun untuk dipilih, jadi tidak punya `#choiceSec` sama sekali dan tidak terpengaruh perubahan ini.
- **HANYA PASCABAYAR.** `manual-page.js` cuma dipakai 16 kategori pascabayar; halaman prabayar (`produk-page.js`/`provider-page.js`/`listrik.js`) tidak melewati file ini sama sekali, dan `inquiry-dummy.js` tidak di-link di sana.

#### Label field identitas pascabayar (`pascabayar-fields.js`)

Tiap kategori pascabayar memakai sebutan berbeda untuk identitas pelanggannya. **Labelnya TIDAK boleh di-hardcode di masing-masing HTML** — semuanya datang dari `window.DikaPascaField`, diterapkan `manual-page.js` saat init berdasarkan `config.slug`.

**HANYA kategori berikut yang identitasnya NOMOR HP** (ditandai `hp: true`): `hp-pasca`, `byu`, `tsel-omni`, `isat-only4u`, `tri-cuanmax`, `xl-cuanku`, `emoney-pasca` — semuanya terikat ke nomor SIM atau akun operator/e-wallet. Sisanya memakai ID pelanggan: "ID Pelanggan / Nomor Meter" (PLN), "Nomor Objek Pajak (NOP)" (PBB), "Nomor Kepesertaan" (BPJS TK), dan seterusnya. **Jangan menyeragamkan semuanya jadi "Nomor HP".**

**Badge provider TIDAK ditampilkan lagi** (keputusan produk), tapi **deteksi operatornya TETAP JALAN** dan masih dipakai untuk: validasi prefix nomor, pemilihan produk lewat `produkByOperator`, dan mengisi `ctx.subBrand` di modal konfirmasi. Yang boleh hilang hanya `OP.renderBar()` dan chip `.opsub` — **jangan menghapus `OP.detect()`**.

#### Margin — KALKULATOR TAMPILAN, bukan pengubah pembayaran

**ATURAN PALING PENTING: margin TIDAK PERNAH mengubah jumlah yang dibayar member.** Transaksi ke DikaPay/Digiflazz selalu memakai `harga_modal` apa adanya. Margin murni kalkulator pribadi yang memberi tahu member berapa idealnya dia menjual ulang ke pelanggannya sendiri, di luar sistem.

`margin-calc.js` (`window.DikaMargin`) **DILARANG dipanggil dari**: `payment-flow.js`, `createModal()`, atau perhitungan apa pun yang menghasilkan angka yang dibayar. **Kalau angka di layar konfirmasi ikut berubah karena margin, itu BUG.** Yang boleh memakainya hanya tampilan daftar produk:

| Tempat | Yang ditampilkan |
|---|---|
| Kartu produk (`createGrid`) | baris kecil "Jual RpX" + "+RpY" di bawah harga modal |
| Halaman pascabayar (`manual-page.js`) | **TIDAK ADA margin sama sekali** — lihat di bawah |
| Modal konfirmasi & payment-flow | **TIDAK ADA margin sama sekali** |

**PASCABAYAR TIDAK PUNYA MARGIN SAMA SEKALI (keputusan produk).** Ke-16 kategori pascabayar tidak pernah terdaftar sebagai kategori bermargin — perlakuannya sama persis dengan Transfer Antar Member. Alasannya: margin per-kategori hanya masuk akal untuk produk berharga TETAP per nominal (pulsa 10.000 selalu Rp10.900, jadi "+15%" berarti sesuatu); nominal pascabayar diisi manual pelanggan dan berbeda tiap orang tiap bulan, jadi persentase di atasnya tidak menggambarkan keuntungan yang bisa direncanakan.

Gerbangnya **satu**: `DikaKategoriMap.bolehMargin(slug)` + `kategoriMargin()` di `kategori-map.js`. `margin.js` (daftar centang) dan `margin-calc.js` (`kategori`, `aktifUntuk`, `hitung`) sama-sama membacanya — **jangan menyaring sendiri di salah satu file**, nanti keduanya bisa berbeda pendapat tanpa ketahuan. `hitung()` sekarang MEWAJIBKAN slug: tanpa slug ia mengembalikan `null`, supaya margin tidak bisa hidup lagi lewat pintu belakang.

Pascabayar TETAP ADA di `MAP` — masih dibutuhkan untuk memetakan price-list Digiflazz ke slug halaman. Yang hilang hanya hak marginnya. Pilihan lama yang terlanjur tersimpan di `dikapay:margin` (dari versi yang masih memasukkan pascabayar) otomatis tidak berlaku lagi karena gerbangnya dicek saat margin DIPAKAI, bukan cuma saat disimpan.

> Kode lama yang DIHAPUS bersama keputusan ini: `renderEstimasi()` + kotak `.margin-est` di `manual-page.js`, dan seluruh aturan `.margin-est*` di `produk.css`. Basis perhitungan lama ("margin dari NOMINAL TAGIHAN, admin tanpa margin") ikut gugur — jangan dihidupkan lagi tanpa keputusan produk baru.

```
Harga Jual (estimasi) = Nominal + Margin(dari Nominal) + Admin   ← admin TIDAK kena margin
Yang dibayar member    = Nominal + Admin                          ← tidak berubah
```

**Batas markup 20% dari harga modal**, berlaku di kedua mode tapi ditegakkan di dua tempat berbeda:
- **Mode persen** — dibatasi saat input (`LIMITS.pct.max = MAX_PCT`). Nilai di layar ikut dikoreksi + toast, supaya angka yang terlihat tidak berbohong tentang yang tersimpan.
- **Mode nominal tetap** — TIDAK bisa dibatasi saat disimpan, karena harga tiap produk beda: Rp2.000 itu 2% untuk produk Rp100.000 tapi 35% untuk produk Rp5.750. Batasnya diterapkan **saat margin dipakai**, di `DikaMargin.hitung()`, yang menandai hasilnya `dibatasi: true`.
- Negatif mustahil (non-digit dibuang saat input). **Nol diizinkan** — menjual di harga modal itu pilihan yang sah.

**Daftar kategori datang dari `kategori-map.js`** lewat `kategoriMargin()` — **12 slug PRABAYAR saja** (dari 28 slug di `MAP`), bukan daftar terpisah — dulu `margin.js` punya 7 kategori hardcoded dengan jumlah produk palsu ("251 produk") dan slug `plnpasca` yang tidak dipakai di mana pun (yang benar `pln-bill`). Tiap entri MAP kini punya `label` supaya bisa dipakai bersama.

**Transfer antar member SENGAJA tidak punya margin** — bukan produk jual-beli dan tidak punya harga modal. Slug `transfer` memang tidak ada di `kategori-map.js`, jadi ia tidak akan pernah muncul di halaman Margin maupun ikut terhitung.

Margin tersimpan di `dikapay:margin` (`{ mode, pct, rp, cats, savedAt }`) dan divalidasi ulang saat dibaca — data localStorage bisa disunting manual atau berasal dari versi lama dengan batas berbeda.

### Atur Margin Saya (`margin.html`)

- **Konteks penting**: halaman ini untuk **member/reseller** mengatur **margin keuntungan PRIBADI** mereka di atas harga modal DikaPay — bukan kontrol harga global. Semua teks harus menegaskan "margin ini hanya untuk akunmu". Punya bottom nav ("Margin" aktif).
- **Form margin** (`.card`): segmented toggle mode `pct` / `rp` (`.seg` + `.seg__pill` slide via `.seg.is-rp`), stepper `+/-` + input angka besar (`#marginInput`, `state.pct`/`state.rp` disimpan terpisah per mode), simulasi 3 baris (`#simModal` → `#simMargin` gold → `#simSell` navy) dengan `tweenText` count-transition + `flash-val` saat berubah. Simulasi pakai contoh modal `MODAL_SAMPLE = 10000`.
- **Cakupan** (`#chkAll` + `#chkList` dari `CATS`): centang "Semua Produk" → `.chk-list.is-locked` (fade + `input.disabled`). `selection()` hitung jumlah KATEGORI (`TOTAL` = 12 kategori prabayar, atau subset), dan mengembalikan `ids: "all"` saat "Semua Produk" dicentang — **penanda, bukan salinan daftar slug**, supaya kategori yang ditambahkan di masa depan ikut sendirinya. `restoreCoverage()` mengembalikan cakupan tersimpan ke UI saat halaman dibuka; tanpa itu member yang menyimpan 2 kategori kembali melihat "Semua Produk" tercentang dan cakupannya melebar diam-diam jadi seluruh 12 begitu Terapkan ditekan.
  - **Baris kanan tiap kartu = JUMLAH PRODUK SUNGGUHAN** ("54 Produk"), bukan label "Prabayar"/"Pascabayar" seperti dulu — label itu tidak pernah membawa arti apa pun karena `kategoriMargin()` sudah membatasi daftar ini ke prabayar semua. Angkanya dari `window.DikaKatalogJumlah.hitung[slug]` (`katalog-jumlah.js`), diisi **12 file data kategori itu sendiri** (`pulsa.js`, `paket-data.js`, dst) lewat satu baris registrasi tepat setelah data produknya dibangun — bukan dihitung ulang atau ditulis manual di margin.js, jadi tidak bisa basi.
  - **Kenapa 12 file data itu di-link ke margin.html TANPA controllernya** (`produk-ui.js`/`produk-page.js`/`provider-page.js`/`operator-detect.js` sengaja TIDAK ikut dimuat): halaman ini cuma perlu `.length` array produknya, bukan merender grid. Memuat controller lengkap berarti `init()` masing-masing langsung mencari markup seperti `#phoneInput`/`#prodGrid` yang tidak ada di margin.html dan gagal dengan `TypeError`. Sebagai gantinya, panggilan `window.DikaProdukPage({...})`/`DikaProviderPage({...})` di tiap file data **dijaga** (`if (window.DikaXPage) window.DikaXPage({...})`) — begitu juga blok tambahan yang menyentuh modul controller langsung (mis. modal "Informasi Voucher" di `voucher.js` yang memanggil `DikaProdukUI.onReady()`, dan `listrik.js` yang memakai `DikaProdukUI` tanpa lewat factory sama sekali). **Di halaman aslinya (pulsa.html dst) controllernya SELALU ada, jadi perilakunya tidak berubah sama sekali** — guard ini murni jaring pengaman untuk margin.html. Kalau menambah kode baru di salah satu dari 12 file data yang langsung memanggil modul controller (`DikaProdukUI`/`DikaOperator`/dst) di luar `productsFor`/`payLine`/callback controller, **jaga juga panggilannya**, atau margin.html akan mendadak error saat file itu dimuat.
  - **Kunci registry TIDAK SELALU sama dengan nama file** — ikuti SLUG di `kategori-map.js`, bukan nama file datanya. Contoh: `paket-data.js` mendaftar sebagai `hitung["data"]` (karena slug kategorinya `"data"`, lihat "kecuali 'data' -> paket-data.html"), bukan `hitung["paket-data"]`.
  - **Animasi count-up** (0 → angka akhir) jalan sekali saat `renderChkList()` pertama merender kartu — `animasiJumlahProduk()` memanggil `tweenText` yang SAMA dengan simulasi harga di atas (satu implementasi easing + pembatalan rAF), staggered `i*45ms` antar baris. `prefers-reduced-motion` otomatis ikut jalur `tweenText` yang sudah ada: lompat langsung ke angka akhir, tanpa berhitung bertahap.
- **Info box** (`.infobox`, border-kiri navy, bg biru muda) — pengingat margin bersifat pribadi. Strukturnya **judul + satu kalimat** (`.infobox__title` + `.infobox__text`), bukan satu paragraf panjang: versi lama 3 baris rapat yang menempel ke tombol emas di bawahnya terbaca sebagai blok padat, bukan penjelasan. Ikonnya duduk di lingkaran putih 26px, dan card-nya punya napas lebih lega di dalam (`padding: 15px 16px`, `line-height: 1.65`) maupun di luar (`margin: 2px 0 4px`). Kalau menyunting teksnya, **pertahankan dua bagian itu** — maksudnya ("margin ini cuma untuk akunmu, member lain beda") jangan sampai hilang.
- **Apply**: `#applyBtn` → validasi (kosong → `is-shake` + top-toast err) → modal konfirmasi (`#confirmOverlay` / `.cmodal`, scale-in) → `#okBtn` `.is-loading` spinner ~1,3 dtk → tutup + `showTopMsg` toast sukses slide dari atas (`.topmsg.is-show`) + `pushHistory()`.
- **Riwayat Margin Saya** (`#mhist` dari `MHIST`): item fade-in staggered (`mItemIn`); entri baru ditambah di atas setelah apply.

### Akun (`akun.html`)

- Tab **Akun** di bottom nav. Semua data & alur DUMMY. Section `.acard` fade+slide-up staggered (`.reveal` + `staggerReveal`).
- **Header profil** (`.ahead`, navy): avatar inisial gold (`avatarPop` scale-in; inisial dari `profile.name` via `initials()`), nama + **`ID DikaPay: <nomor HP member>`** (`renderHeader()`, dari `profile.phone` — nomor yang sudah diverifikasi OTP saat mendaftar, BUKAN kode buatan seperti versi lama), badge "Member Aktif" (`statusIn` fade delay 0.45s). **Tidak ada ikon pensil** — edit profil hanya lewat menu **Data Diri**.
- **`security` — SUMBER KEBENARAN TUNGGAL status keamanan** (`akun.js`, `let security = { pinCreated, pin }`, dipersist `localStorage["dikapay:security"]`, dimuat seperti `profile`/`ADDRESSES`). Dibaca oleh `renderPinLabel()` (label baris menu PIN) DAN `readSecurity()` (checklist Skor Keamanan) — satu objek, jadi selalu konsisten. `security.pinCreated` diset `true` di `pinProcess()` saat step `confirm` cocok (= SIMULASI "PIN berhasil dibuat", karena fitur PIN asli belum ada), lalu `persistSecurity()` + `renderPinLabel()` + `renderSecurityScore()`.
- **Skor Keamanan Akun** (`.acard--score`, card pertama, DI ATAS section "Keamanan Akun"; border-kiri gold + latar gradient krem→putih tipis) — `renderSecurityScore()` di `akun.js`. **Bukan angka statis** — `readSecurity()` membaca **3 indikator** (`SCORE_ITEMS`) LANGSUNG dari sumbernya tiap kali dipanggil. **KYC SENGAJA TIDAK ikut skor** (fitur KYC tetap ada di "Akun Saya", cuma tidak dihitung di sini).
  - `pin` → `security.pinCreated` (objek yang SAMA dengan label menu; default `false` → "Buat PIN Transaksi").
  - `pinEvery` → `#swPin.checked` (listener `change` → re-render real-time).
  - `tfa` → `tfa.active` (jadi `true` di akhir `tfaVerify()`, yang lalu memanggil `renderSecurityScore()`).
  - Progress bar `.score__fill` (gold, `transition: width .4s`; skala dari `SCORE_ITEMS.length` → 100% = 3/3), teks "`N` dari 3 selesai" (`#scoreCount`), checklist `#scoreList`. Item belum-selesai diklik → `scoreGoTo()`: `pin`/`tfa` buka flow-nya; `pinEvery` scroll ke `.row` `#swPin` + `.row--flash`.
  - **Checklist dibangun SEKALI** (`buildScoreList()`, flag `scoreBuilt`) lalu tiap render hanya men-toggle class — elemennya TIDAK dibuang, jadi transisi CSS punya nilai awal untuk dianimasikan. **JANGAN kembalikan pola `innerHTML` per-render**: kalau elemen dibuat ulang, transisi warna kuning→hijau & crossfade ikon tidak akan pernah jalan (elemen baru langsung lahir di state akhir). Tiap item = satu `<button data-key>` berisi **dua** ikon ditumpuk (`.score__ic--todo` segitiga + `.score__ic--done` centang) yang di-crossfade; item selesai diberi atribut `disabled` (bukan diganti jadi `<span>`) supaya identitas elemennya lestari — listener klik ikut memeriksa `!it.disabled`.
  - **Dekorasi & animasi (pure CSS)**: motif garis diagonal 1px/10px navy 4,5% sebagai layer `background` `.acard--score` (statis); `.score__fill::after` shimmer `scoreShimmer` 2,8s (sapu ±1,25s + jeda); `.score__item--done .score__check` denyut `scoreDonePulse` 4s; `.score__item--todo .score__check::before` halo `scoreTodoGlow` 2,4s; perpindahan belum→selesai = `color .45s` + crossfade ikon `.4s` + `scorePop .56s` (class `.score__check--pop` dari JS, aturannya ditaruh SETELAH aturan `--done` karena spesifisitasnya sama). Semua animasi loop hanya `transform`/`opacity`. Render pertama memaksa reflow (`void fill.offsetWidth`) lalu memasang width setelah 280ms supaya bar ikut terisi beranimasi saat halaman dimuat.
  - Pesan `#scoreMsg`: <100% → `.score__msg--warn` menyebut item spesifik yang belum aktif, diurut `prio` (PIN dulu, lalu PIN-setiap-transaksi & 2FA); =100% → `.score__msg--ok` "✅ Akun kamu sudah terlindungi dengan baik!". Teks pesan + count = string JS Indonesia (tidak di-i18n); label checklist pakai kunci `acc.score.item.*` + di-render ulang saat ganti bahasa.
- **Data Diri** (`#editFlow` `.aflow` slide-in, `data-act="datadiri"` → `openEditFlow()`) — **REDESAIN: halaman LIST** (`.dd-list`, reuse primitif `.row` yang sama dipakai "Keamanan Akun"/"Akun Saya" — label kiri + value/aksi kanan), BUKAN lagi satu form 3-field gabungan. Header `.aflow__head` solid navy (bukan biru terang seperti referensi desainnya). Baris (stagger fade+slide `epIn`, delay per `nth-child`): **Nama Lengkap** (dibatasi edit, lihat di bawah) → **Ganti Gambar Profil** (buka `#photoPicker` yang sudah ada, "Ambil Foto"/"Pilih dari Galeri" → toast) → **Username** (`profile.username`, baru — trail "Pasang" bergaya CTA `.row__trail--cta` saat kosong) → **Ubah Nomor Ponsel** (trail tersamar `maskPhoneId()`, "62 ••• 7890") → **Alamat Email** (trail tersamar `maskEmailId()`, "d ••• example.com"). Catatan ramah di bawah list (`.dd-note`).
  - **Sub-editor SATU field** (`#editFieldFlow`, ditumpuk via `openFlowStacked` di atas `#editFlow`) dipakai ULANG untuk Nama/Username/Nomor Ponsel/Email lewat `editFieldState.kind` + `EF_CONF` — floating-label `.ff` tunggal, bukan 4 sub-halaman terpisah. Badge "Terverifikasi" (`#efBadge`) HANYA muncul untuk `kind === "phone"` (satu-satunya field yang benar-benar dibuktikan lewat OTP pendaftaran). `commitEditField()` = satu titik simpan bersama: persist `profile` → `renderHeader()` + `renderDataDiriList()` → `hideFlow()` + toast "✓ Profil berhasil diperbarui!".
  - **Nama Lengkap dibatasi edit 1x per 7 hari** (keputusan produk — nama dianggap identitas sensitif, beda dari Username/HP/Email yang bebas diubah kapan saja). Timestamp perubahan terakhir per akun di `dikapay:name:lastChange:<nomor digit>` (`{mulai, sampai}`, pola sama `dikapay:devices:<digit>`/`dikapay:pintx:banned:<digit>` — TERPISAH per akun, bukan kunci global). Selama terkunci: baris `#ddNameRow` dapat class `.is-locked` (redup + panah disembunyikan) TAPI **tetap `<button>` yang bisa diklik** (bukan `disabled` — pola yang sama dengan kartu produk "gangguan", `aria-disabled` bukan `disabled`, supaya klik tetap bisa menjelaskan kenapa, bukan ditelan diam-diam). Klik saat terkunci → popup `#namalockOverlay`/`.namalock-*` (fade+scale masuk, ilustrasi mengambang + halo gold berdenyut kontinu — pola yang SAMA dengan `.banned-overlay`/`.banned-modal` di style.css, disalin dengan nama sendiri karena nadanya beda: bukan pelanggaran, jadi warnanya navy/gold bukan merah), gambar `assets/images/nama-terkunci.png`, sisa waktu format hari+jam (`formatSisaHari()`, mis. "5 hari 12 jam lagi") diperbarui tiap 30 detik selagi popup terbuka. Edit berhasil → `catatPerubahanNama()` mencatat timestamp baru (RESET timer 7 hari dari awal, bukan melanjutkan). `namaTerkunciSampai()` membersihkan sendiri entri yang sudah lewat waktunya saat dibaca (pola yang sama dengan `cekBanned()` di pin-transaksi.js/auto-lock.js).
  - **`#efInput` menyaring digit + dash saat mengetik KHUSUS kind `"phone"`** (`digitPhone()`/`prettyPhoneLocal()`, salinan kecil `sanitize()`/`prettyPhone()` operator-detect.js dengan nama sendiri — akun.html tidak me-link file itu; kind `"username"` disaring ke huruf-kecil/angka/underscore, kind lain tidak disaring saat mengetik). BUG yang diperbaiki dari versi lama: field nomor HP dulu disimpan lewat `.trim()` polos tanpa saringan apa pun. Dash (bukan cuma digit) sengaja diizinkan saat mengetik karena field dibuka dengan nilai sudah berformat `"0812-3456-7890"` — menyaring ke digit polos akan menghilangkan dash yang sudah ada begitu member mengetik satu karakter apa pun. Saat disimpan, nilainya tetap disaring ulang total ke digit lalu diformat ulang dari nol. `profile.phone` juga **self-healing saat halaman dimuat**: dibangun ulang dari digitnya sendiri dan ditulis balik kalau berubah, membersihkan data yang sudah kadung kotor dari sebelum perbaikan ini.
- **Keamanan Akun**:
  - **Buat / Ubah PIN** (`data-act="pin"`) → flow `#pinFlow` (slide-in kanan `.aflow`): keypad angka custom (`#pinKeypad`), 6 `.pin-dot` terisi satu-satu, `shake` (`is-error`) jika salah. **Label baris (`#pinRowLabel`) + judul flow dinamis dari `security.pinCreated`**: belum → "Buat PIN Transaksi" (ikon dapat penanda "+" via `.row.is-pin-new`), flow mulai di step `new`. Sudah → "Ubah PIN Transaksi", flow mulai di step `old` (cek `security.pin`, default `"123456"`). Step: (`old` →) `new` → `confirm`. Sukses `confirm` → `security.pinCreated = true` + persist + sinkron ke label & Skor Keamanan (toast "berhasil dibuat"/"berhasil diubah").
  - **Lupa PIN Transaksi** (`data-act="lupapin"`) → flow `#lupaPinFlow`: pilih metode OTP (HP/Email, nomor & email tersamar lewat `maskPhoneId()`/`maskEmailId()`) → kode dummy 6 digit ditampilkan langsung di layar (pola sama alur OTP pendaftaran `auth-flow.js`) → verifikasi → `pinNextFromLupa()` menukar identitas panel di `flowStack` langsung ke `#pinFlow` step `new` bertajuk "Buat PIN Baru" (BUKAN `hideFlow()`+`showFlow()` terpisah — menghindari race `history.back()`/`popstate` asinkron, dan back sesudahnya kembali ke Akun, bukan ke layar OTP yang sudah selesai diverifikasi).
  - Toggle **`#swPin` — "Gunakan PIN Setiap Transaksi"** + **`#swBio`** — `.switch` (`.switch__slider` slide, easing).
    - **BERMAKNA, bukan dekoratif.** Preferensi disimpan `dikapay:settings:pinEvery` (`"1"`/`"0"`, default `"1"`). Dibaca `pin-transaksi.js` `minta()`: kalau `"0"` (dan tanpa `opts.paksa`), `minta()` resolve `{ok:true, alasan:"pin-setiap-transaksi-nonaktif"}` LANGSUNG tanpa membuka sheet PIN — transaksi & transfer lewat tanpa PIN. FAIL-CLOSED: storage rusak → tetap minta PIN.
    - **MENYALAKAN bebas** (menaikkan keamanan) — langsung persist `"1"` + toast. **MEMATIKAN wajib Verifikasi PIN dulu**: handler menahan toggle di ON, panggil `DikaPinTransaksi.minta({ paksa:true, judul:"Verifikasi PIN", nama:"Nonaktifkan PIN setiap transaksi" })` (`paksa:true` = selalu tampilkan sheet, abaikan preferensi). PIN benar → toggle OFF + persist `"0"` + toast. PIN salah / batal / banned → toggle **tetap ON** + pesan error. Pola sama dengan `#swBio`.
    - `akun.js` init `swPin.checked` dari `dikapay:settings:pinEvery` (bukan lagi selalu `checked` di HTML). `readSecurity().pinEvery` & Skor Keamanan ikut nilai ini.
    - `minta()` menerima `opts.judul` (override judul sheet) & `opts.paksa` (abaikan preferensi pinEvery). `window.DikaPinTransaksi.pinSetiapTransaksi()` dibuka untuk cek preferensi.
  - **2FA** (`data-act="tfa"`) → flow `#tfaFlow`: `method` (SMS/Email) → `contact` → `sending` (spinner ~1,3s) → `otp` (6 kotak `#otpBoxes` auto-advance) → `done` (`.check-anim` stroke-draw + `burstConfetti()`). Sukses → `#tfaStatus` jadi "Aktif" hijau (`.row__trail--ok`).
  - **Perangkat Aktif** (`data-act="devices"`) → flow `#devFlow` dari **`DikaPerangkat.daftar()`** (`perangkat.js`) — data perangkat NYATA lewat `@capacitor/device`, bukan lagi array `DEVICES` hardcoded ("Xiaomi Redmi Note" + "Samsung A52" yang dulu muncul sama persis di setiap HP). Perangkat dicatat saat LOGIN (`activateSession`) dan disegarkan tiap flow ini dibuka. Baris perangkat yang sedang dipakai bertanda "Aktif sekarang" + `.dev-item__here`, dan **sengaja TIDAK diberi tombol keluar** — menekannya hanya menghapus barisnya sendiri tanpa mengakhiri sesi apa pun. "Keluar dari perangkat ini" pada baris lain -> `.is-out` fade + hapus dari daftar. Nama perangkat berasal dari luar aplikasi (diberi pemiliknya di Pengaturan HP), jadi **wajib lewat `esc()`** sebelum masuk `innerHTML`.
- **Akun Saya**: **Data Diri** → `openEditFlow()` (lihat redesain di atas). **Alamat Tersimpan** → `openAddrFlow()` (lihat bawah). KYC masih `data-info` → `toast(...)` placeholder; badge `#kycBadge` (`.badge--warn`).
- **Alamat Tersimpan** (`#addrFlow` + `#addrFormFlow`, keduanya `.aflow`; flow bertumpuk didukung via `flowStack` + `suppressPop` di `showFlow`/`hideFlow`/`openFlowStacked`):
  - `#addrFlow`: tombol **"Gunakan Lokasi Saat Ini"** (`.addr-gps-btn` outline gold, ikon pin `gpsPulse`) → `startGps()`; tombol **"+ Tambah Alamat Baru"** (`.addr-add-btn`) → `startManualAddr()`; daftar `#addrList` dari `ADDRESSES` (seed 1, `localStorage["dikapay:addresses"]`), item bisa dihapus (`.is-out` fade).
  - `startGps()`: buka `#addrFormFlow` → state `#addrLoading` (spinner + "Mencari lokasi kamu…") → `navigator.geolocation.getCurrentPosition` (izin prompt browser bawaan) → sukses → `reverseGeocode()` fetch **Nominatim** `/reverse?format=json` (UA tak bisa di-set dari browser; catch response gagal/kosong) → state `#addrFormState`. Error izin/timeout/fetch → modal `#addrErr` ("Coba Lagi" = `runGeo()` / "Isi Manual" = `startManualAddr()`). Transisi state pakai fade (`.addr-state--fading`).
  - Form (`#addrFormState`): `#addrText` (textarea, editable, prefilled hasil geocode) + `#addrLabel` (wajib), floating-label `.ff`. `saveAddr()` → validasi → spinner 700ms → `ADDRESSES.unshift` + persist → `hideFlow()` → item baru `.addr-item--new` slide dari atas + `showTopToast("Alamat berhasil ditambahkan!")`.
- **Bantuan & Lainnya** — semua `data-act` → flow `.aflow` slide-in (konten statis di `akun.html`):
  - **FAQ** `#faqFlow`: 9 pertanyaan accordion (`.faq-item` / `.faq-q` / `.faq-a`), `max-height` via `scrollHeight` inline + chevron `rotate(180)`.
  - **Customer Service** `#csFlow`: jam operasional + 3 opsi kontak (WhatsApp/Email/Telepon, format dummy) → semua tombol `toast("Fitur ini akan segera terhubung.")`.
  - **Syarat & Ketentuan** `#tncFlow` & **Kebijakan Privasi** `#privacyFlow`: dokumen `.doc` panjang scrollable, bahasa formal standar aplikasi PPOB (12 & 9 sub-bab).
  - **Tentang DikaPay** `#aboutFlow`: `.about` — logo dompet gold, "Versi 1.0.0", deskripsi 3 kalimat, "© 2026 DikaPay. Seluruh hak cipta dilindungi."
- **Preferensi**: toggle `#swNotifTx` / `#swNotifPromo`, "Bahasa" (value "Indonesia"). **Tidak ada "Mode Tampilan"** — aplikasi hanya punya tema terang (lihat "Tema" di bawah).
- **Logout** (`#logoutBtn`, merah outline) → modal `#logoutOverlay` (`.cmodal`) → "Ya, Keluar" → toast + `DikaAuth.logout()` (hapus flag sesi + `replace(auth.html)`). Lihat "Sesi / Auth" — **jangan kembalikan redirect lama ke `index.html`**.
- Flow overlay generik: `showFlow(id)`/`hideFlow()` + `history.pushState`/`popstate` (hardware back menutup flow). Sheet (`registerSheet`/`unregisterSheet`) & flow pakai konter `pendingBack` untuk "menelan" popstate hasil `history.back()` sendiri. `healBackBaseline()` (dipanggil di `showFlow`/`registerSheet`/`openLogout`) me-reset `pendingBack` ke 0 tiap interaksi baru dimulai dari kondisi bersih — jaga-jaga kalau ada popstate nyasar (mis. BACK HP saat pay sheet paymodal terbuka) yang bikin konter skew → overlay bisa nyangkut menutupi bottom nav. Toast bawah `#atoast`.

### Halaman produk — arsitektur berlapis

Tiga lapis, dari umum ke khusus. **Jangan menyalin logika antar halaman produk** —
kalau ada yang kurang, tambahkan di lapisan yang tepat.

1. **`produk-ui.js` → `window.DikaProdukUI`** — primitif UI, tidak tahu apa-apa soal operator/PLN:
   - `fmtRupiah` / `fmtNumber` (SATU-SATUNYA definisi di seluruh halaman produk).
   - `createGrid({grid, section})` → `render(items, key)` / `clear()` / `onPick(fn)`. Item = **`{ nama, sub?, harga_modal }`** — nama fieldnya memang mengikuti skema produk prabayar (lihat "Skema data produk"), jadi file data kategori bisa dilempar apa adanya tanpa lapisan pemetaan. Bangun ke `DocumentFragment` lalu tukar sekali, flag anti-re-entrant, dan **melewati render kalau `key` sama** dengan render sebelumnya (supaya animasi tidak "kedip").
     - **Kartu SENGAJA cuma 3 hal: nama, `sub` (opsional), harga akhir.** Baris keempat `.prod__tag` ("Harga modal") **sudah DIHAPUS** dari render — itu istilah internal reseller yang membingungkan member, dan angkanya toh sudah tampil di `.prod__price`. Rincian admin/nominal tetap ada di **modal konfirmasi**, tempat yang memang untuk itu. Aturan CSS `.prod__tag` **ikut dihapus** dari `produk.css` (bukan cuma berhenti dipakai) — jangan dibuat lagi tanpa keputusan produk baru.
     - `sub` yang BERGUNA tetap dipertahankan ("30 Hari", "Diamond", "1 Bulan"). Yang dibuang hanya rincian biaya: `listrik.js` dulu punya `"sub": "Admin Rp2.500"` di ketujuh nominal token — sudah dihapus, sekarang kartunya cuma "Token 20.000" + "Rp22.500".
     - Stagger + efek tekan sudah ada di `produk.css`, bukan di JS: `.prod` punya `animation: prodIn 0.36s var(--ease-out) backwards` dan `.prod:active { transform: scale(0.96) }`; `createGrid` hanya menyetel `animationDelay = i * 45ms` (0 kalau `prefers-reduced-motion`).

##### Subkategori — BUKAN filter (`subFor` / `subkategori`)

**Perbedaan ini menentukan bentuk datanya, jadi jangan dikaburkan.** Subkategori = kelompok produk yang **masing-masing punya daftarnya sendiri**. Itu BUKAN hasil menyaring satu kumpulan produk memakai atribut (mis. memecah satu daftar paket data jadi "Hemat/Jumbo" berdasarkan angka GB-nya) — pendekatan filter itu pernah dipakai di sini dan **salah**, karena semua tab menarik dari kolam yang sama.

Patokan dunia nyata: pada kategori Data Telkomsel, subkategorinya adalah **Flash, Ilmupedia, OMG!, GamesMAX, Unlimited, Zona Regional** — masing-masing katalog terpisah dengan produk yang benar-benar berbeda. Konsekuensi pentingnya: **subkategori MELEKAT KE OPERATOR/BRAND, bukan ke halaman.** "Ilmupedia" tidak ada di XL, "Xtra Combo" tidak ada di Telkomsel. Karena itu daftar tabnya **ikut berubah** tiap kali operator/brand yang dipilih berganti.

| Controller | Sumber subkategori | Bentuk data | Halaman |
|---|---|---|---|
| `produk-page.js` (Tipe A) | `config.subFor(opKey)` | `PACKAGES[operator] = [{ id, label, produk: [...] }]` | paket-data, sms-telpon, perdana |
| `provider-page.js` (Tipe B) | `brand.subkategori` | `providers[].subkategori = [{ id, label, produk: [...] }]` | voucher, voucher-act, games |

**Tipe B punya DUA lapis tab, di dua langkah berbeda** (bukan dua tab bertumpuk di satu layar):

1. **`#brandTabs`** di dalam `#brandSec` — mengelompokkan **daftar brand** lewat `grup` per provider (Ritel/E-Commerce/Transport/Voucher Game; MOBA/Battle Royale/RPG/FPS). Tiap tab berisi brand yang berbeda, tidak ada brand yang muncul di dua tab.
2. **`#prodTabs`** di dalam `#prodSec` — subkategori **di dalam brand terpilih** (Google Play → Voucher Reguler / Langganan; Mobile Legends → Diamond / Starlight / Weekly Pass).

Tipe A hanya memakai `#prodTabs` (di dalam `#prodSec`).

**Aturan yang gampang bikin bug kalau dilanggar:**

- **Daftar tab dibangun ulang HANYA saat operator/brand berganti**, bukan tiap render. Kalau dibangun tiap ketukan tombol, tab pilihan member terus balik ke tab pertama sambil dia mengetik (`lastOp` di `produk-page.js`).
- **`state.items` / `produkTampil()` HARUS persis daftar yang TERLIHAT.** `openConfirm` memakai indeks kartu, jadi kalau isinya beda member bisa membeli produk lain dari yang dia ketuk.
- **`key` grid menyertakan id subkategori** (`opKey + "|" + subId`) — tanpa itu render dilewati karena operatornya sama dan grid tidak ikut berganti saat tab dipindah.
- **Brand dikunci lewat `data-id`, BUKAN indeks** — begitu `#brandTabs` menyaring daftar, indeks tampilan tidak lagi sama dengan indeks di `config.providers`.
- **`< 2 tab = tab disembunyikan`** (`createTabs.render` mengosongkan `aktif` juga, supaya pemanggil jatuh ke subkategori pertama). Satu tab bukan pilihan, cuma judul palsu yang memakan satu baris.
- **`voucher-act` sengaja tidak punya `#brandTabs`** (kelima operatornya sejenis, sudah terlihat semua tanpa scroll) — tapi tetap punya subkategori di dalam tiap operator: Voucher Data / Nelpon & SMS / Combo.
- `UI.filterGrup(list, grupId)` masih dipakai **khusus untuk lapis 1** (mengelompokkan brand). Record tanpa `grup` sengaja ikut tampil di semua tab supaya data yang belum dikelompokkan tidak hilang diam-diam — pola yang sama seperti slug `"lainnya"` di `kategori-map.js`.

**TODO fase 2:** daftar subkategori berhenti ditulis tangan; Digiflazz mengirim famili produk pada price-list, jadi `PACKAGES`/`subkategori` diisi hasil sync lewat `api.js`.

##### Produk sedang gangguan (`gangguan: true`)

Produk yang sedang tidak bisa dibeli (stok habis / maintenance penyedia) ditandai `gangguan: true` di data produk. Perilakunya hidup di **`produk-ui.js`**, bukan di controller — jadi berlaku otomatis di SEMUA halaman produk (Tipe A/B/C + listrik) tanpa satu baris pun ditambahkan per halaman.

- **Tetap ditampilkan, tidak disembunyikan** — member berhak tahu produk itu ada, cuma sedang bermasalah. Kartunya diredupkan (`opacity: .55`), border jadi `dashed`, dan diberi badge kecil "Gangguan" berwarna **netral abu**, bukan merah: ini kondisi sementara dari penyedia, bukan error aplikasi dan bukan kesalahan member.
- **Denyut `gangguanPulse` sangat halus** (opacity .55 ↔ .72, 3,4s) — menandakan "sedang bermasalah", bukan alarm.
- **Redupnya BUKAN animasi.** Blok `prefers-reduced-motion` di `produk.css` menyetel `.prod { opacity: 1 }`, jadi ada baris khusus `.prod--gangguan { opacity: 0.55 }` DI DALAM blok itu supaya penanda visualnya tidak hilang saat reduced-motion — yang dimatikan hanya denyutnya. Jangan hapus baris itu.
- **Pakai `aria-disabled`, BUKAN `disabled`.** Tombolnya harus tetap bisa ditekan supaya bisa menjelaskan KENAPA; `disabled` akan menelan klik dan member cuma merasa aplikasinya rusak.
- **Kliknya dicegat di `onPick`** sebelum sampai ke `openConfirm` — produk gangguan TIDAK PERNAH masuk konfirmasi pembelian. Yang muncul adalah modal `showGangguan(item)`: dibangun sekali lalu dipakai ulang (pola lazy `paymodal.js`), nadanya empatik, tidak menyalahkan siapa pun, dan menegaskan ini sementara. **Kalau menyunting teksnya, pertahankan nadanya.**
- **Badge memakai token status gagal yang sudah ada** (`--err-bg` / `--err-fg` / `--err-solid`) — jangan hardcode merah baru. Animasinya dua lapis: halo `badgeGlow` (2,2s) pada badge + titik kecil `badgeDot` (1,4s) di kirinya. Kartunya sendiri cukup `gangguanPulse` yang halus, supaya daftar tidak terasa berkedip-kedip saat digulir.

##### Kunci otomatis 5 menit (`auto-lock.js` → `window.DikaLock`)

Kalau aplikasi ditinggalkan **≥ 5 menit**, PIN diminta lagi sebelum halaman mana pun bisa dipakai. Di-link di SEMUA halaman member (kecuali `auth.html`), tepat setelah `auth.js` di `<head>`. Overlay-nya dibuat runtime — tidak ada markup yang perlu ditambahkan di 35 halaman.

- Memverifikasi ke `dikapay:security.pin` — **kunci yang SAMA** dengan PIN Transaksi di Akun. Kalau member belum pernah membuat PIN, layar ini **tidak pernah muncul**: mengunci tanpa PIN yang bisa diverifikasi hanya mengurung member tanpa jalan keluar.
- **Yang dicatat adalah "TERAKHIR AKTIF" (`dikapay:lock:seen`), bukan "kapan masuk latar".** Ini bukan detail sepele: `visibilitychange → hidden` ternyata **juga menyala saat member sekadar berpindah halaman**, jadi model "kapan masuk latar" menimpa penandanya di tiap navigasi dan kondisi terkunci yang seharusnya terbawa jadi hilang. Penanda disegarkan oleh heartbeat 15 detik + interaksi member (klik/ketik/scroll/sentuh).
- Penandanya di **localStorage**, bukan memori — supaya proses yang dimatikan Android lalu dibuka lagi setelah 5 menit tetap terkunci.
- Sinyal paling dipercaya di APK adalah `appStateChange` dari `@capacitor/app`; `visibilitychange`/`pageshow` hanya jaring cadangan untuk browser.
- Ada jalan keluar "Lupa PIN? Keluar dari akun" → `DikaAuth.logout()`, supaya member tidak terkunci selamanya.

##### Alur pembayaran (`payment-flow.js` → `window.DikaPayment`)

`createModal` memanggil `DikaPayment.bayar()` saat tombol "Bayar" ditekan, jadi **22 halaman produk mendapat alur ini tanpa satu baris pun ditambahkan di file datanya**. Jangan menyalin alurnya per halaman.

Empat tahap: **cek saldo → KONFIRMASI PIN → pemrosesan (1,5–3 dtk acak) → hasil**.

##### PIN wajib tiap transaksi (`pin-transaksi.js` → `window.DikaPinTransaksi`)

**Setiap transaksi diminta PIN — berapa pun nominalnya, apa pun jenisnya.** Ini BUKAN `auto-lock.js`: auto-lock mengunci AKSES ke aplikasi setelah 5 menit menganggur (sekali buka, semua halaman terbuka), sedangkan ini mengonfirmasi SATU transaksi. Keduanya memverifikasi PIN yang sama (`dikapay:security.pin`) tapi menjawab pertanyaan berbeda — "ini masih kamu?" vs "kamu benar mau mengeluarkan uang ini?".

`minta({nama, nominal})` → `Promise<{ok, alasan}>`. **FAIL-CLOSED**: `ok: true` hanya kalau 6 digit yang diketik benar-benar cocok. Dibatalkan, banned, atau member belum punya PIN → `ok: false` dan pemanggil WAJIB membatalkan transaksinya.

| Dipasang di | Kenapa terpisah |
|---|---|
| `payment-flow.js` `bayar()`, SESUDAH cek saldo | 22 halaman produk memanggil `bayar()` lewat `createModal` — satu gerbang menutup semuanya. Sesudah cek saldo supaya member tidak disuruh mengetik PIN untuk transaksi yang toh ditolak |
| `transfer-member.js`, handler `#cmPay` | Transfer TIDAK memakai `payment-flow.js` (bukan produk PPOB), jadi gerbangnya harus dipasang sendiri |

- **Tanpa `pin-transaksi.js` ter-link, transaksi DITOLAK — bukan dilewati.** Melewatkannya diam-diam persis bug `sound.js` dulu, bedanya yang bocor kali ini uang member.
- **Salah 3x → BANNED 2 JAM + LOGOUT PAKSA** (revisi dari jeda 60 detik lama — PIN yang bisa ditebak berkali-kali tanpa konsekuensi berarti sama saja tidak ada gerbangnya). Status disimpan **PER NOMOR MEMBER** (`dikapay:pintx:banned:<digit>`, pola yang sama dengan `dikapay:devices:<digit>`) berisi `{mulai, sampai}` — banned akun A tidak pernah memengaruhi akun B di perangkat yang sama. `periksa()` di `pin-transaksi.js`: tutup sheet PIN → `pasangBanned()` → popup **"Akun Kamu Telah Dibanned"** (`.banned-overlay`, gaya di `style.css` — bukan `produk.css`, karena harus tampil juga di `auth.html`) → menutup popup memicu `DikaAuth.logout()`.
  - **Popup yang sama dipakai ULANG dari `auth-flow.js`**: submit nomor HP dicek lewat `DikaPinTransaksi.cekBanned(digits)` **sebelum** cabang login/daftar dibuka — kalau masih banned, popup tampil lagi dengan sisa waktu ter-update (dari `digits` di FORM, bukan `dikapay:profile` yang bisa beda identitas) dan submit ditolak sama sekali, apa pun PIN/biometriknya nanti. `auth.html` karena itu ikut me-link `pin-transaksi.js` (sebelum `auth-flow.js`), walau halaman itu sendiri tidak pernah memanggil `minta()`.
  - `minta()` juga memeriksa `cekBanned()` untuk nomor aktif SAAT DIBUKA (jaring pengaman kalau ada sesi lama yang masih hidup — tab lain, navigasi lewat tombol back) — kalau banned, sheet PIN tidak pernah dibuka sama sekali, langsung popup + logout.
  - Format sisa waktu: `formatSisa()` → "1 jam 45 menit lagi" (dibulatkan ke atas ke menit, tidak pernah menampilkan "0 menit lagi" saat masih tersisa waktu), diperbarui tiap 30 dtk selagi popup terbuka. `sampai` yang sudah lewat dibersihkan otomatis saat `cekBanned()` membacanya — percobaan PIN berikutnya mulai dari 0 lagi, tidak perlu langkah reset terpisah.
  - `payment-flow.js`/`transfer-member.js` **tidak menampilkan pesan apa pun lagi** untuk `alasan === "banned"` — popup banned yang mengambil alih seluruh komunikasi ke member; menambah popup lain di situ hanya menumpuk dua pesan untuk satu kejadian.
  - Ilustrasi popup (`assets/images/akun-banned.png`) di-`<img>` lewat `jalurGambar()` — path dihitung runtime (`/pages/` vs root), pola yang sama dengan `jalurAkun()` di file yang sama, karena modul ini sekarang dipakai juga dari `auth.html`.
- **Belum punya PIN** → transaksi tidak diproses, tapi member diberi tombol ke halaman Akun untuk membuatnya. Memblokir tanpa jalan keluar = mengunci member dari aplikasinya sendiri.
- **Tombol "Coba Lagi" pada hasil GAGAL memanggil `bayar()` lagi, bukan `mulaiProses()`** — saldo dicek ulang DAN PIN diminta ulang. Versi lama memanggil `mulaiProses()` langsung; itu pintu belakang yang membuat transaksi kedua dan seterusnya lolos tanpa PIN.
- **Sheet ini TIDAK punya entri history sendiri** (pola yang sama dengan `.payflow`). `createModal.hide()` memanggil `history.back()` tepat sebelum pembayaran dimulai, dan traversal history Chrome itu ASINKRON — `popstate` sisanya bisa mendarat di sheet PIN yang baru terbuka lalu menutupnya (gejala: tekan "Bayar", sheet PIN berkedip lalu hilang, transaksi menggantung). **Jangan menambahkan `pushState` di sini** tanpa menyelesaikan balapan itu lebih dulu. Popup banned mengikuti pola yang sama (tidak push history sendiri).
- Gaya `.pintx*`/`.banned-*` ada di **`style.css`**, bukan `produk.css` — dipakai juga di `transfer-member.html` dan (khusus `.banned-*`) `auth.html`, dua halaman yang tidak memuat `produk.css`. Titik PIN & keypad-nya SALINAN pola `.pin-dots`/`.keypad` akun.css dengan nama sendiri, sama seperti `.auth-keypad`.
- **TODO fase 3**: verifikasi PIN dan status banned pindah ke backend (`POST /api/pin/verify`) supaya tidak bisa dilewati dengan menghapus localStorage perangkat. Bentuk `minta()` dipertahankan.

- **Cek saldo lebih dulu.** Kurang → popup ajakan top up, dan **proses TIDAK pernah dimulai** (saldo tidak berkurang, riwayat tidak tercatat). Popupnya menyebut total tagihan, saldo sekarang, dan kekurangannya, dengan nada membantu — bukan menyalahkan. Tombol "Top Up Sekarang" menaruh penanda `sessionStorage["dikapay:open-topup"]` lalu ke Beranda; `maybeOpenTopUp()` di `script.js` membaca DAN menghapusnya sekaligus, lalu membuka sheet Top Up yang sudah ada (belum ada halaman Top Up tersendiri).
- **Hasil**: `berhasil` / `gagal` / `pending`. Peluangnya di `DikaPayment.OUTCOME` dan sengaja bisa diubah saat menguji (`DikaPayment.OUTCOME.gagal = 1` → selalu gagal).
- **HANYA saat berhasil**: saldo dipotong, riwayat ditulis ke `dikapay:tx:extra`, notifikasi lewat `DikaNotif`, suara lewat `playSuccessSound()`.
  > **`sound.js` & `notif-store.js` WAJIB di-link di halaman produk.** Keduanya dipanggil lewat penjaga `if (window.X)`, jadi kalau lupa di-link, suara & notifikasi **dilewati diam-diam tanpa error** — persis bug yang pernah terjadi: `payment-flow.js` memanggilnya dengan benar, tapi `sound.js` cuma ada di `auth.html`/`transfer-member.html` dan `notif-store.js` cuma di 3 halaman, sehingga transaksi produk tidak pernah berbunyi maupun memunculkan notifikasi. Urutannya: keduanya SEBELUM `payment-flow.js`. **Gagal & pending tidak menyentuh saldo sama sekali** — ini yang paling penting dijaga kalau alurnya diubah.
- Pesan **gagal** menjawab ketakutan utama member lebih dulu ("saldomu tidak terpotong; kalau pun sempat terpotong, kembali otomatis maks 1x24 jam"), pakai amber — **bukan** merah menyala. Pertahankan nada itu.
- Nilai yang dibayar **diturunkan dari ctx**, bukan config: `ctx.item.harga_modal` (Tipe A/B + listrik) atau `ctx.total` (Tipe C nominal manual).
- Default saldo `125000` **HARUS SAMA di tiga tempat**: `readBalance()` di `script.js`, `DEFAULT_BALANCE` di `transfer-member.js`, dan `payment-flow.js`.
- **TODO fase 3**: `OUTCOME` acak diganti hasil sungguhan dari `POST /api/transactions` lewat `api.js`; `pending` diisi callback penyedia. Titik masuk `bayar()` dipertahankan supaya halaman produk tidak perlu diubah lagi.

##### Validasi nomor HP: PREVIEW vs FINAL

Dua ambang berbeda, sengaja — pernah ada bug nomor 4 digit (`0852`) lolos sampai konfirmasi:

| Ambang | Fungsi | Dipakai untuk |
|---|---|---|
| `OP.MIN_DETECT` (4 digit) | `detect()` | **Preview**: badge operator + daftar produk muncul lebih awal saat member masih mengetik |
| `OP.isValidPhone()` (prefix dikenal **dan** 10–13 digit) | validasi FINAL | **Gerbang sebelum konfirmasi** — nomor belum sah tidak pernah sampai ke modal, apalagi ke penyedia |

`isValidPhone()` + `phoneProblem()` ada di **`operator-detect.js`**, satu sumber yang sama dengan yang dipakai `auth.html`. Jangan menyalin aturannya.

**Field mana yang dianggap NOMOR HP:**

- **Tipe A** (`#phoneInput`): pulsa, paket-data, masa-aktif, perdana, sms-telpon → dicek di `openConfirm`; gagal → `tolakNomor()` (field bergetar + pesan yang menyebut sebabnya: pendek / panjang / prefix asing).
- **Tipe B** dengan `accountFields` ber-`phone: true`: streaming, tv, voucher, voucher-act, emoney (**hanya brand e-wallet**) → grid nominal tidak muncul sampai nomornya sah.
- **Tipe C**: `hp-pasca` (lewat `detect`).

**Yang BUKAN nomor HP — validasi longgar sesuai konteksnya sendiri:** `listrik` (nomor meter), `games` (User ID / Zone ID), `emoney` **brand kartu fisik** (nomor kartu 16 digit), dan 9 halaman pascabayar lain (ID pelanggan, NOP, nomor kontrak).

**Halaman Tipe B dengan field `phone: true` WAJIB me-link `operator-detect.js`** — tanpa itu `fieldSah()` tidak punya peta prefix dan nomor asing lolos diam-diam. Sekarang ia mencatat `console.warn` kalau itu terjadi, tapi link-nya tetap yang benar.

##### Tiga cara mengisi nomor tanpa mengetik (`input-helper.js`)

`window.DikaInputHelper.attach(input)` memasang deretan tombol **kontak / suara / scan** di bawah kartu input. **SATU implementasi untuk semua halaman produk** — jangan salin per halaman; controller yang memanggilnya (`produk-page.js` untuk `#phoneInput`, `provider-page.js` untuk field ber-`helper: true`), jadi halaman cukup me-link `input-helper.js` setelah `produk-ui.js`.

| Fitur | API | Catatan |
|---|---|---|
| Kontak | `navigator.contacts.select()` | Hanya ada di sebagian browser mobile + wajib HTTPS |
| Suara | `SpeechRecognition` / `webkitSpeechRecognition` | `lang: "id-ID"`; tombol berdenyut merah saat mendengarkan |
| Scan QR/barcode | `BarcodeDetector` + `getUserMedia` | Kamera **tidak dibuka** kalau `BarcodeDetector` tidak ada — percuma menyalakan kamera kalau tidak ada yang bisa membaca gambarnya |

- **Tombol yang APInya tidak didukung TIDAK dipasang sama sekali** — lebih jujur daripada memasang tombol yang pasti gagal saat ditekan. Kalau ketiganya tidak didukung, `attach()` tidak membuat apa pun dan halaman tetap normal.
- **Nilai dikirim lewat event `input`**, bukan sekadar menyetel `.value` — kalau tidak, controller tidak menjalankan sanitasi, deteksi operator, render grid, maupun peringatan.
- `digitsDari()` mengambil deretan digit terpanjang dari teks bebas dan menormalkan `+62`/`62` jadi `0`, karena hasil suara & QR sering membawa spasi/tanda hubung/awalan.
- **Kamera wajib mati saat halaman ditinggalkan** — ada `pagehide` yang menghentikan track; tanpa itu lampu kamera tetap menyala setelah pindah halaman.
- Tombol helper sengaja **tidak dipasang di field User ID / Zone ID** game — itu bukan nomor kontak, jadi "ambil dari kontak" di situ menyesatkan. Field menandai dirinya lewat `helper: true` di `accountFields()`.
- **TODO fase 4 (Capacitor)**: di APK ketiganya sebaiknya pindah ke plugin native (`@capacitor-community/contacts`, speech-recognition, barcode-scanner). Titik pasangnya tetap di file ini, jadi halaman tidak perlu diubah lagi.
   - `createModal({overlay, rows, cancel, pay, payTitle, payLine, note?})` → `show(rows, ctx)` / `hide(fromPop)`. Baris modal **data-driven**: `[{label, value, total?}]` → jumlah baris bebas per halaman. Modal push `history` sendiri (BACK HP menutup modal, bukan pindah halaman) dan menangani "Bayar" → spinner ~700ms → `DikaComingSoon` setelah 240ms.
     - **Section "Catatan produk" (`.cnote`)** — deskripsi produk (mis. "proses 1x24 jam", "tidak untuk kartu perdana"). Diambil default dari `ctx.item.deskripsi`, atau dari `note(ctx)` kalau config halaman menyediakannya. **Kalau kosong, section-nya TIDAK dirender sama sekali** — bukan kotak kosong. Elemennya dibuat runtime lalu disisipkan setelah `#cmRows`, jadi **22 halaman produk tidak perlu menambah markup apa pun**.
   - `createStatus({anchor})` → `memuat(n)` / `gagal(pesan, onRetry)` / `kosong(pesan)` / `sembunyi()`. Kartu status pemuatan katalog backend (lihat "Katalog produk dari backend"). Dibuat runtime — halaman tidak perlu menambah markup.
   - `createChoice({anchor})` → `render(opsi, {title,label})` / `pilih()` / `set(id)` / `onPick(fn)`. Pemilih sub-brand (Telkomsel vs by.U) — pola visual SAMA dengan `#choiceSec` di halaman pascabayar, tapi dibuat runtime + memakai `createPicker()` sebagai sheet-nya. `< 2 opsi` → kartunya disembunyikan DAN pilihannya direset.
   - `createFilterHarga({anchor, min})` → `render(items, kunciKatalog)` / `terapkan(items)` / `aktif()` / `onPick(fn)` / `kunciRender()`. Chip rentang nominal untuk katalog besar.
   - `createWarn(el|id)` → `show()` / `hide()` / `toggle(b)` / `exists()`. Pengatur tampil-sembunyi kartu peringatan kontekstual (lihat "Kartu peringatan `.warn`"). Tidak pernah menyentuh teks.
   - `createPicker()` → `open(items, opts)` / `close()` / `onPick(fn)` / `exists()`. Bottom sheet pemilih kategori/biller (lihat "Popup pemilih biller pascabayar" di bawah). Dibangun runtime sekali, dipakai ulang — sama seperti `showGangguan`/paymodal.js.
   - `showGangguan(item)` → modal "produk sedang gangguan" (lihat "Produk sedang gangguan").
   - `createTabs({el})` → `render(tabs)` / `onPick(fn)` / `active()` / `exists()`, dan `filterGrup(list, grupId)` — tab subkategori & pengelompokan brand (lihat "Subkategori — BUKAN filter").
   - `registerOverlay(isOpenFn)` / `anyOverlayOpen()` — **registry overlay bersama**. Beberapa lapisan mendengarkan `popstate` sekaligus (modal konfirmasi, daftar brand `provider-page.js`, modal info `voucher.js`). Tanpa registry, SATU ketukan BACK bisa memicu dua aksi sekaligus — menutup modal SEKALIGUS mundur ke daftar brand. `createModal` mendaftar otomatis; modal buatan sendiri **wajib** ikut mendaftar, dan handler `popstate` yang bukan milik overlay wajib `return` lebih dulu kalau `anyOverlayOpen()` true.
   - `wireBack(appEl, btnEl)` — `.is-leaving` lalu `history.back()`.
   - `brandVars(hex, "op"|"bd")` — **SATU-SATUNYA** tempat warna brand disiapkan untuk tampilan. Warna brand dipakai sekaligus sebagai warna TEKS dan (12% alpha) latar chip-nya, jadi warna yang sangat gelap (`#0F1E45` Disney+, `#1B2838` Steam) lenyap di tema GELAP dan yang sangat terang (`#44D62C` Razer, `#F2A900` PUBG) lenyap di tema TERANG — kontrasnya sempat **1.04:1**. Fungsi ini mempertahankan hue & saturasi brand dan hanya MENGGELAPKAN lightness-nya sampai kontras ≥ 4.5:1 di latar terang, lalu mengembalikan string custom property inline: `--op`, `--op-ink`, `--op-bg`. **JANGAN memperbaiki kontras dengan mengganti warna di file data** — warna brand tetap satu sumber (`operator-detect.js` untuk operator, `PROVIDERS[].color` untuk Tipe B); penyesuaian TAMPILAN hanya di sini. Karena aplikasi cuma punya SATU tema, nilai itu dipakai langsung oleh `produk.css` — tidak ada lagi lapisan pemetaan per tema.
2. **`operator-detect.js` → `window.DikaOperator`** — SATU-SATUNYA sumber peta prefix & identitas operator (6 operator, `PREFIX_MAP` lookup O(1), `detect`, `sanitize` + normalisasi `62812…`→`0812…`, `prettyPhone`, `badgeHtml`/`warnHtml`/`renderBar`). Warna brand operator dipasang lewat custom property `--op`/`--op-bg` inline.
3. **Controller per TIPE ALUR** — semua 22 kategori di `ALL_SERVICES` sudah punya halaman:

   | Tipe | Controller | Alur | Kategori |
   |------|-----------|------|----------|
   | **A** | `produk-page.js` | nomor HP → auto-detect operator → grid produk | Pulsa, Paket Data, Masa Aktif, Aktivasi Perdana, Paket SMS & Telpon |
   | **B** | `provider-page.js` | pilih brand/provider → grid nominal | Games, Streaming, TV, Voucher, Aktivasi Voucher, E-Money & Wallet |
   | **C** | `manual-page.js` | input ID → warning → **nominal diisi manual** → modal | PLN Pascabayar, PDAM, BPJS Kesehatan, Gas Negara, PBB, BPJS Ketenagakerjaan |
   | **C+** | `manual-page.js` (+ `produkList`) | pilih provider → input ID → warning → nominal manual | Internet Pascabayar, TV Pascabayar, Multifinance |
   | **C+** | `manual-page.js` (+ `detect`) | nomor HP → deteksi operator + chip sub-brand → pilih layanan → warning → nominal manual | HP Pascabayar |
   | — | `listrik.js` + `produk-ui.js` | nomor meter → **Cek Nama Pelanggan (inquiry-pln ASLI)** → grid nominal token | Listrik / PLN Prabayar |
   | — | `gas-prabayar.js` + `produk-ui.js` | ID pelanggan → warning → grid nominal token gas | Gas Prabayar (menggantikan menu "TV") |

   - **`DikaProdukPage(config)`** (A): `sectionTitle`, `detailLabel`, `payTitle`, `productsFor(opKey)`, `payLine(item, op, phone)`. Badge langsung, grid **di-debounce 120ms**.
   - **`DikaProviderPage(config)`** (B): `providers: [{id, name, sub?, short?, color?, items}]`, `brandTitle`, `nominalTitle`, `brandLabel`, `detailLabel`, `payLine(item, brand, account)`. Warna brand lewat `--bd`/`--bd-bg` inline (pola `${color}1F`, sama seperti operator). Pilih brand → `history.pushState`, jadi **BACK HP kembali ke daftar brand**, bukan keluar halaman. Handler popstate-nya didaftarkan **SEBELUM** `createModal` dan langsung `return` kalau modal sedang terbuka — kalau tidak, satu popstate akan menutup modal SEKALIGUS mundur ke daftar brand (dua aksi sekaligus).
     - **`accountFields(brand)`** (opsional): kembalikan `[{ key, label, placeholder, hint?, required?, min?, max?, digitsOnly?, inputmode? }]` → langkah **identitas akun tujuan** disisipkan ANTARA "pilih brand" dan "pilih nominal" (kartu `#acctSec` / `#acctFields`, wajib ada di markup halaman itu). **Grid nominal baru dirender setelah semua field wajib terisi** (`min` = panjang minimal). Nilai field masuk ke modal konfirmasi (di-escape) dan ke `ctx.account` untuk `payLine`. Halaman Tipe B tanpa `accountFields` (dan tanpa `#acctSec`) tidak terpengaruh. Dipakai: **E-Wallet** (`accountFields` → nomor HP/ID akun per provider) & **Top Up Game** (User ID selalu + Zone/Server ID hanya untuk provider ber-`needZone: true`, mis. Mobile Legends & Genshin; Free Fire/PUBG/Valorant cukup User ID).
   - **`DikaManualPage(config)`** (C): `idField: {min, max}` dan/atau `choices: [{id, name, sub}]` — **boleh dipakai bersamaan** (mis. Internet Pascabayar: pilih provider DAN isi ID). Plus `warning`, `admin`, `minNominal`/`maxNominal`, `submitLabel`, `rows(ctx)`, `payLine(ctx)`.
     - **`detect: { subBrands }`** (opsional, butuh `operator-detect.js`): `idField` diperlakukan sebagai **nomor HP** — operator dideteksi otomatis, badge tampil di `#opBar`, plus chip `.opsub` berisi nama sub-brand pascabayar (Telkomsel Omni, Indosat Only4u, XL Axis Cuanku, Tri CuanMax). Chip ini **informatif saja, bukan pilihan**. Dalam mode ini `isReady()` menuntut **prefix dikenal**, bukan sekadar panjang digit — nomor 13 digit berprefix asing tetap ditolak.
     - `ctx` yang diteruskan ke `rows`/`payLine` berisi `{ id, choice, nominal, admin, total, op, subBrand }`. Input nominal **memformat ribuan sambil mempertahankan posisi caret** (hitung jumlah digit sebelum caret, lalu pasang ulang) — tanpa itu, menyunting di tengah angka bikin kursor lompat ke ujung. Maksimum 9 digit.
   - **`listrik.js`** — alur khusus (cek nomor NONAKTIF), memakai `produk-ui.js` LANGSUNG.

**Markup wajib** (id sama di semua halaman produk): `#app #backBtn #clearBtn #prodSec #prodTitle #prodGrid #pEmpty #confirmOverlay #cmRows #cmCancel #cmPay` + input (`#phoneInput` atau `#meterInput`). Halaman operator menambah `#opBar`.

**Urutan input: NOMOR DULU, baru pilihan.** Di halaman yang punya input nomor
DAN blok pilihan (`choices`/`produkList`), `<section class="card pcard">`
(input) HARUS berada di atas `#choiceSec` di dalam `<main>`. Urutannya murni
dari markup — `manual-page.js` hanya memakai `getElementById`, jadi tidak ada
yang bergantung pada urutan DOM. Berlaku di `hp-pasca`,
`internet-pasca`, `multifinance`, `tv-pasca`.

**Halaman BLANK karena `.is-leaving` membeku di bfcache — WAJIB.** `wireBack()`
menempelkan `.is-leaving` (`translateX(100%)`) ke `#app` untuk animasi keluar.
Kalau class itu **masih menempel saat halaman dibekukan ke bfcache**, WebView
memulihkan DOM apa adanya dan **TIDAK menjalankan ulang `<script>`** → konten
tetap di luar layar, halaman tampak BENAR-BENAR BLANK tanpa satu pun error JS
(gejalanya "kadang normal, kadang blank"). Perbaikan lama (hanya `pageshow` di
halaman yang sama) **tidak cukup** — ia membersihkan saat kembali, bukan mencegah
class membeku.

Pertahanan sekarang **berlapis, tidak bergantung pada lifecycle bfcache**:
1. `wireBack()` melepas `.is-leaving` **begitu animasi keluar selesai**
   (`transitionend` pada `transform`, + `setTimeout(340)` fallback), **sebelum**
   `history.back()`. Class tidak pernah hidup lebih lama dari animasinya; snap-back
   tak sempat ter-paint karena `nav()` menyusul di tick yang sama.
2. `pagehide` melepas class tepat sebelum halaman dibekukan — menangkap SEMUA
   jalur keluar (`prefers-reduced-motion`, fallback `location.href`, animasi baru).
3. `pageshow` melepasnya saat restore — jaring terakhir.

`produk-ui.js` memasang lapisan 2 & 3 global; `statistik.js` & `notifikasi.js`
punya salinan `healLeaving` + back-handler pola yang sama (mereka tidak memuat
`produk-ui.js`). **Kalau menambah animasi keluar-halaman: lepas class-nya sebelum
navigasi DAN daftarkan `healLeaving` di `pagehide`+`pageshow`.**

**Init lewat `UI.onReady(init)`, bukan `DOMContentLoaded` langsung.**
`onReady` menjalankan init segera bila `document.readyState` sudah lewat
`"loading"`, dan punya penjaga anti double-init. Memakai `DOMContentLoaded`
saja bikin init tidak pernah jalan kalau script sempat dieksekusi setelah event
itu lewat (mis. dipindah ke `<head>`, diberi `defer`/`async`) → halaman blank.

**Urutan `<script>` wajib**: `illustrations.js` → `paymodal.js` → `produk-ui.js` → `digiflazz-rc.js` → `pin-transaksi.js` → `payment-flow.js` → `input-helper.js` → (`operator-detect.js` → `produk-page.js` untuk alur operator) → **(`api.js` → `brand-map.js` → `tipe-map.js` untuk kategori yang datanya dari backend)** → script data halaman. Semua modul dibungkus IIFE (script klasik berbagi scope global).

**`produk.css`** — gaya bersama semua halaman produk: `.phead`, `.pfield`, `.opbadge`/`.opwarn`, `.warn*` (kartu peringatan sebelum transaksi — dipakai **22 halaman produk**, lihat di bawah), `.prod` (kartu grid 2 kolom), `.pempty`, `.cmodal*`/`.cdetail*`. Kelas kartu produk tinggal `.prod__nom`/`.prod__sub`/`.prod__price` — `.prod__tag` sudah DIHAPUS (lihat `createGrid`); `.cek-btn`/`.cek-err`/`.cust*` masih ada tapi NONAKTIF (lihat Listrik). Tidak ada bottom nav (halaman flow).

#### Kartu peringatan `.warn` — KONTEKSTUAL di semua 22 halaman produk

Semua halaman produk (12 prabayar + 10 pascabayar) punya kartu peringatan amber `.warn`, dan **tidak satu pun tampil sejak halaman dibuka**. Markupnya seragam: `<section class="warn" id="warnBox" hidden aria-live="polite">`. Sebelum member melakukan apa pun, peringatan itu belum relevan dan cuma jadi bising — jadi ia baru muncul (dengan `warnIn`, fade + slide-down) tepat saat member benar-benar mulai bertransaksi.

**Pemicunya beda menurut alur halaman, tapi maknanya sama** — "member baru saja membuat langkah pertama menuju pembelian":

| Pemicu | Ambang | Digerakkan | Halaman |
|---|---|---|---|
| Nomor tujuan diketik | `OP.MIN_DETECT` (4 digit) — ambang yang SAMA dengan deteksi operator & render grid | `produk-page.js` via `UI.createWarn` | 5 Tipe A: pulsa, paket-data, masa-aktif, perdana, sms-telpon |
| Nomor meter diketik | 8 digit | `listrik.js` | listrik |
| Penyedia dipilih | — | `provider-page.js` via `UI.createWarn` | 6 Tipe B: games, streaming, tv, voucher, voucher-act, emoney |
| Input/biller diisi | sesuai `config` | `manual-page.js` (teks dari `config.warning`) | 10 pascabayar |

**Kenapa Tipe B pakai "penyedia dipilih"**: di halaman Tipe B, field identitas tujuan baru dirender SETELAH penyedia dipilih (lihat `accountFields`), jadi tidak ada yang bisa "diketik" sebelum itu. Titik setaranya adalah saat penyedia dipilih: member sudah membuat pilihan pertama, field tujuan muncul, dan grid nominal terbuka — peringatan jadi terpasang persis saat dibutuhkan.

**`UI.createWarn(el|id)`** (di `produk-ui.js`) adalah satu-satunya pengatur tampil/sembunyi ini: `show()` / `hide()` / `toggle(b)`. Ia **tidak pernah menyentuh teks** — teks kontekstual adalah keputusan per halaman dan ditulis di HTML-nya. Halaman tanpa `#warnBox` tetap aman (`exists()` false, semua panggilan jadi no-op).

##### Teksnya mengikuti KENYATAAN produk, bukan satu kalimat generik

Klaim "DikaPay belum menyediakan fitur cek nama pelanggan otomatis" **hanya benar untuk produk yang di dunia nyata memang punya keterikatan nama**. Memasangnya di pulsa/paket data justru menyesatkan: di industri manapun pulsa TIDAK PERNAH punya cek nama pelanggan, jadi kalimat itu menyiratkan ada fitur yang tertunda padahal tidak pernah ada. Tiga kelompok:

| Kelompok | Isi pesan | Halaman |
|---|---|---|
| **Ada keterikatan nama** — sebut "belum ada cek nama otomatis" | nomor terikat identitas pelanggan yang seharusnya bisa diverifikasi | listrik (nomor meter), emoney (akun e-wallet bernama), 10 pascabayar |
| **Tidak ada cek nama di industrinya** — JANGAN sebut cek nama | fokus: nomornya benar + tidak bisa ditarik kembali | pulsa, paket-data, masa-aktif, perdana, sms-telpon |
| **Identitas berupa ID, bukan nama** | fokus: User ID / ID akun sesuai tujuan | games |
| **Tidak ada tujuan sama sekali** | fokus: ketelitian PILIHAN produk & nominal (voucher terbit tidak bisa ditukar) | game, streaming, tv, voucher, voucher-act, emoney |

**`emoney` sengaja masuk kelompok terakhir**, bukan kelompok "ada keterikatan nama": halamannya tidak meminta nomor kartu apa pun (cuma pilih kartu → nominal), jadi pesan cek-nama akan menunjuk sesuatu yang tidak pernah diisi member. Kalau nanti `emoney` diberi `accountFields` (nomor kartu), pindahkan ke kelompok pertama.

Kalau menambah halaman produk baru: **tanyakan dulu "di dunia nyata, apakah produk ini benar-benar punya nama pelanggan terikat?"** sebelum menyalin kalimat halaman lain. Nadanya hangat & sopan (pola yang sama seperti `.tm-warn` di Transfer Antar Member), bukan `PERHATIAN!!!` kaku.

**Anti-luap teks produk.** Kartu `.prod` & `.brand` duduk di grid `repeat(2, 1fr)`. Track `1fr` = `minmax(auto, 1fr)`, jadi minimumnya = **min-content**: satu kata yang lebih lebar dari kolom akan melebarkan track dan menggeser halaman ke samping. Data dummy sekarang aman (kata terpanjang masih muat di kolom ~161px @ viewport 360px), **tapi nama produk asli Digiflazz sering panjang tanpa spasi** (mis. `TELKOMSEL_DATA_OMG_30HARI_25GB`). Karena itu `produk.css` memasang `.prod { min-width: 0 }` + `overflow-wrap: anywhere` pada semua kelas pembawa nama. Pakai `anywhere`, **bukan `break-word`** — hanya `anywhere` yang ikut mengecilkan min-content, jadi `break-word` tidak menyelesaikan masalah track. Kalau menambah kelas teks baru di kartu produk, tambahkan ke daftar itu.

**Atribut `hidden` wajib punya guard.** Aturan UA `[hidden] { display: none }` KALAH dari class rule author yang menyetel `display` — `.psec`, `.pempty`, `.warn`, `.pfield__clear` semuanya pakai `flex`/`grid`. Tanpa blok `.xxx[hidden] { display: none; }` di akhir `produk.css`, elemen ber-atribut `hidden` **tetap tampil**. (`.warn` sangat bergantung pada guard ini — ke-22 halaman produk memulainya dalam keadaan `hidden` dan baru menampilkannya saat member mulai bertransaksi; tanpa guard, semuanya akan tampil sejak halaman dibuka.) Kalau menambah elemen baru yang di-toggle lewat `hidden` DAN punya `display`, tambahkan selectornya ke blok itu.

#### Prabayar vs Pascabayar

`ALL_SERVICES` sekarang **28 layanan**. **`kategori.html` (tab PRABAYAR/PASCABAYAR) BELUM DIBUAT** — semua layanan tampil dalam satu grid di sheet **"Semua Layanan"** (beranda → Lainnya). Sampai halaman itu ada, pengelompokan hidup di dua tempat yang HARUS tetap sinkron: komentar pemisah di `ALL_SERVICES` (`script.js`) dan field `jenis` di `kategori-map.js`. Kelompoknya:

- **Pascabayar (tagihan, nominal manual)**: `pln-bill`, `pdam`, `hp-pasca`, `internet-pasca`, `tv-pasca`, `bpjs`, `bpjs-tk`, `multifinance`, `pbb`, `gas`, + 5 sub-brand operator (`tsel-omni`, `isat-only4u`, `tri-cuanmax`, `xl-cuanku`, `byu`) dan `emoney-pasca` — lihat "Kategori Pascabayar — sinkron dengan Digiflazz".
- **Prabayar (beli produk/nominal tetap)**: sisanya, termasuk `tv` (beli PAKET TV, bukan bayar tagihan) dan `emoney` (top up saldo kartu & e-wallet).

#### Kategori Pascabayar — sinkron dengan Digiflazz

**16 kategori pascabayar resmi Digiflazz, semuanya sudah ada halamannya:**

| # | Kategori Digiflazz | Slug DikaPay | Catatan |
|---|---|---|---|
| 1 | PLN Pascabayar | `pln-bill` | |
| 2 | PDAM | `pdam` | `produkList` — satu biller PER DAERAH |
| 3 | HP Pascabayar | `hp-pasca` | + deteksi sub-brand dari prefix |
| 4 | Internet Pascabayar | `internet-pasca` | |
| 5 | BPJS Kesehatan | `bpjs` | |
| 6 | Multifinance | `multifinance` | alias kategori "Angsuran Kredit" |
| 7 | PBB | `pbb` | `produkList` — satu biller per kota/kabupaten |
| 8 | Gas Negara | `gas` | |
| 9 | TV Pascabayar | `tv-pasca` | |
| 10 | BPJS Ketenagakerjaan | `bpjs-tk` | |
| 11 | by.U | `byu` | |
| 12 | Telkomsel Omni | `tsel-omni` | |
| 13 | Indosat Only4u | `isat-only4u` | |
| 14 | Tri CuanMax | `tri-cuanmax` | |
| 15 | XL Axis Cuanku | `xl-cuanku` | SATU kategori, DUA operator (XL + Axis) |
| 16 | E-Money | `emoney-pasca` | **bukan** `emoney` — lihat di bawah |

**Lima sub-brand operator punya DUA jalur, dan itu disengaja.** Halaman sendiri (`tsel-omni.html` dst) ada supaya struktur kategori 1:1 dengan Digiflazz — penting saat sync, karena `kategori_asli` produk harus mendarat di kategori bernama sama. `hp-pasca.html` tetap dipertahankan sebagai **jalur cepat**: ia mendeteksi sub-brand **otomatis dari prefix nomor**, jadi member yang tidak hafal nama sub-brand-nya tidak bisa salah pilih. Kalau salah satu jalur dihapus, salah satu keuntungan itu hilang.

**`by.U` memakai blok prefix yang SAMA dengan Telkomsel**, jadi badge operator di `byu.html` menampilkan "Telkomsel" — itu benar, bukan bug. Karena tidak bisa dibedakan dari prefix, by.U juga tetap hadir sebagai pilihan "Jenis Layanan" di `hp-pasca.html`.

**`emoney` vs `emoney-pasca` — DUA PRODUK BERBEDA, jangan digabung:**

| | `emoney` (prabayar) | `emoney-pasca` (pascabayar) |
|---|---|---|
| Yang dijual | TOP UP saldo, harga tetap | TAGIHAN, nominal diisi manual |
| Alur | pilih brand → nominal | isi nomor → nominal → bayar |
| Punya `harga_modal` | ya | **tidak** (hanya `admin_fee`) |

Digiflazz memakai nama kategori **"E-Money" di KEDUA daftar harga**, jadi nama kategorinya saja tidak cukup untuk memisahkan. Pemisahnya adalah **daftar harga mana yang sedang disinkronkan**: `cocokkan(category, brand, jenis)` menerima argumen ketiga `"prabayar"`/`"pascabayar"` dan membuang kandidat yang jenisnya berbeda. **Argumen itu WAJIB diisi saat sync sungguhan** — tanpa itu, produk E-Money pascabayar akan mendarat di halaman top up prabayar dan ditolak `DikaProduk.check()` karena tidak punya `harga_modal`.

**Smartfren Pascabayar DIHAPUS dari `SUB_BRANDS`** — Digiflazz tidak punya kategori pascabayar untuk Smartfren. Nomor Smartfren tetap mendapat badge operator biasa, hanya tidak memunculkan chip sub-brand. Kalau nanti kategorinya ada, tambahkan lagi di `hp-pasca.js` **dan** daftarkan slugnya di `kategori-map.js`.

**Tombol kontak/suara/scan di halaman pascabayar** hanya dipasang saat `config.detect` aktif — yaitu ketika `idField` memang **nomor HP** (`hp-pasca` + 5 sub-brand). Di halaman lain isinya ID pelanggan / NOP / nomor kontrak, jadi "ambil dari kontak" akan menyesatkan.

#### Penggabungan halaman (dari 24 → 22 layanan)

Tiga halaman dihapus dan isinya dipindah. **Jangan dihidupkan kembali** tanpa keputusan produk baru:

| Dihapus | Isinya pindah ke | Alasan |
|---|---|---|
| `ewallet.html` / `ewallet.js` | **`emoney.html`** — 5 brand (OVO, DANA, GoPay, ShopeePay, LinkAja) jadi provider tambahan, ditandai `"sub": "E-Wallet"` (yang lama `"sub": "Kartu"`) | Keduanya sama-sama "top up saldo"; memisahkannya cuma membuat member menebak halaman mana yang benar |
| `topup-game.html` / `topup-game.js` | **`games.html`** (baru) — 5 game top up langsung, User ID + Zone ID kondisional (`needZone`) | Rename + tab genre |
| `game.html` / `game.js` (Voucher Game) | **`voucher.html`** — 5 brand (Google Play, Steam Wallet, Garena Shell, Razer Gold, UniPin) masuk sebagai tab **"Voucher Game"** | Yang dijual di situ adalah KODE VOUCHER, sama seperti Alfamart/Indomaret — bukan top up ke akun game. Pemisahnya bentuk produknya, bukan temanya |

**Garis pemisah `games` vs `voucher`** (dipakai juga saat memetakan price-list Digiflazz): kalau produknya masuk **langsung ke akun** dan butuh **User ID**, itu `games`. Kalau yang diterima member adalah **kode yang ditebus sendiri**, itu `voucher` — meskipun temanya game. Di `kategori-map.js` keduanya berbagi category `"Games"`/`"Voucher Game"` dan dipisahkan lewat daftar `brand`.

**`hp-pasca` vs `internet-pasca`**: `hp-pasca` = nomor seluler (operator dari prefix); `internet-pasca` = paket internet rumah. Dua biller berbeda, jangan digabung.

**`tv` vs `tv-pasca` BUKAN duplikat**: `tv.html` = Tipe B (pilih penyedia → beli paket harga tetap, tanpa nomor pelanggan); `tv-pasca.html` = Tipe C (pilih penyedia → nomor pelanggan → nominal tagihan manual). Jangan digabung.

**Sub-brand pascabayar operator** (Telkomsel Omni, Indosat Only4u, Tri CuanMax, XL Axis Cuanku, by.U) sekarang punya **halaman sendiri** DAN tetap muncul sebagai chip otomatis di `hp-pasca.html`. Dua jalur ini DISENGAJA — lihat "Kategori Pascabayar — sinkron dengan Digiflazz" untuk alasannya.

#### Menambah / mengubah halaman produk

Halaman produk dibuat lewat pola yang sama: **satu file data \`<id>.js\` + satu HTML tipis**. Yang membedakan cuma teks di HTML dan isi data. Kalau menambah kategori baru:

1. Tambahkan entri di \`ALL_SERVICES\` (dan \`MENU_ITEMS\` kalau mau tampil di grid beranda).
2. Salin HTML dari kategori satu tipe (mis. \`streaming.html\` untuk tipe B), ganti judul/label.
3. Tulis \`<id>.js\` berisi data + panggilan controller.
4. Daftarkan \`"menu:<id>"\` dan \`"svc:<id>"\` di \`ROUTES\`.
5. **Pasang kartu peringatan \`.warn\`** (\`id="warnBox" hidden\`) dengan teks yang menyebut hal spesifik yang bisa salah di halaman itu — dan **cek dulu apakah produknya di dunia nyata benar-benar punya nama pelanggan terikat** sebelum menyalin kalimat halaman lain; lihat "Kartu peringatan \`.warn\`". Pemicu tampilnya ikut controller yang dipakai. Semua 22 halaman produk sekarang punya, jadi halaman baru tanpa peringatan akan jadi satu-satunya yang bolong.
6. **JANGAN** menyalin logika controller — kalau alurnya benar-benar baru, buat controller baru di atas \`produk-ui.js\`.

\`SVC_COMING_SOON\` sekarang **kosong** — semua layanan sudah punya halaman. Isi lagi ({title, lines}) hanya kalau menambah layanan yang halamannya belum jadi.

#### Skema data produk (WAJIB — siap sinkronisasi Digiflazz)

Semua file data kategori mengikuti `produk-schema.js`. **Dua bentuk, sengaja berbeda:**

| | PRABAYAR | PASCABAYAR |
|---|---|---|
| Kategori | Pulsa, Data, Masa Aktif, Perdana, SMS&Telpon, Listrik (token), Games, Streaming, TV, Voucher, Aktivasi Voucher, E-Money & Wallet | PLN Pascabayar, PDAM, BPJS Kesehatan/Ketenagakerjaan, Gas Negara, PBB, Multifinance, HP/Internet/TV Pascabayar |
| Field | `{ sku, nama, brand, harga_modal, kategori_asli, sub?, deskripsi?, gangguan? }` | `{ sku, nama, brand, admin_fee, kategori_asli }` |
| Harga | `harga_modal` ← `price` (tetap) | **TIDAK ADA `harga_modal`** |
| Admin | sudah termasuk di `harga_modal` | `admin_fee` ← `admin` (tetap per produk) |
| Nominal | dari produk | **diisi manual pengguna**, hidup di state halaman |

- **`sku`** ← `buyer_sku_code`. Sengaja `""` sampai sync pertama, tapi **field-nya WAJIB ada** di setiap record.
- **`deskripsi?` & `gangguan?` — OPSIONAL, produk lama tanpa keduanya tetap sah.** `deskripsi` ← `desc` (catatan penting penyedia) → section "Catatan produk" di modal konfirmasi, hanya kalau terisi. `gangguan` ← turunan `buyer_product_status`/`seller_product_status` → kartu redup + badge + klik dicegat. **Keduanya di file data kategori (`scripts/<id>.js`), BUKAN di `data.js`** — `data.js` khusus transaksi (`TX`/`DETAILS`/`CATS`) dan tidak memuat satu pun record produk. **TODO fase 2:** nilai tulis-tangan sekarang diganti hasil sync Digiflazz lewat backend + `api.js`; bentuk datanya sudah final jadi tidak ada perubahan UI yang perlu dikerjakan saat itu.
- **JANGAN menambahkan `harga_modal` ke produk pascabayar** — itu menyiratkan tagihan berharga tetap, padahal nominalnya beda tiap pelanggan tiap bulan dan baru diketahui setelah inquiry. `DikaProduk.check()` akan menolaknya di console.
- **Biaya admin datang DARI PRODUK, bukan konstanta halaman.** Satu halaman bisa punya banyak biller dengan admin berbeda (mis. `internet-pasca`: IndiHome Rp2.500, First Media Rp3.500). `manual-page.js` mengambil `admin_fee` dari produk yang sedang dipilih (`produkAktif()`), dan teks bantuan nominal ikut diperbarui.
- Sumber produk pascabayar di config `manual-page.js`: `produk` (1 biller), `produkList` (pilih biller), atau `produkByOperator` (hp-pasca).
- **`produk` (objek tunggal) hanya untuk kategori yang benar-benar satu biller** (PLN Pascabayar, BPJS, BPJS TK, Gas/PGN, 5 sub-brand operator, E-Money Pascabayar). **PDAM dan PBB memakai `produkList`** karena di Digiflazz keduanya punya satu biller per daerah — PDAM per kota/kabupaten, PBB per pemda, masing-masing dengan `admin` sendiri. Halaman keduanya sudah diberi markup pemilih biller (`#choiceSec`/`#choiceTitle`/`#choiceList`). Kalau sync pertama menunjukkan kategori lain juga berisi banyak biller, ubah ke pola yang sama — **markup pemilihnya harus ikut ditambahkan**, tidak cukup mengganti kunci config.
- **Token listrik = PRABAYAR** (harga tetap, `listrik.js`), **PLN Pascabayar = PASCABAYAR** (`pln-bill.js`). Dua hal berbeda, jangan digabung.
- **Pemisah ribuan di `nama` ditulis manual** (`"Pulsa 10.000"`). Jangan hasilkan dari `toLocaleString` saat build — Node di device ini small-ICU dan akan menulis koma ke dalam file. Kuantitas item game (`1800 UC`, `2240 Genesis`) memang TANPA pemisah, itu benar.

#### Pemetaan kategori Digiflazz (`kategori-map.js`)

`DikaKategoriMap.cocokkan(category, brand)` → slug kategori kita. Aturannya **kata kunci TERPANJANG menang** — tanpa itu `"PLN"` akan menelan `"PLN PASCABAYAR"`, `"TV"` menelan `"TV PASCABAYAR"`, dan `"Voucher"` menelan `"Aktivasi Voucher"`. Kategori yang sama dipisah lewat brand (`E-Money` → `emoney` untuk kartu, `ewallet` untuk OVO/DANA/GoPay).

Yang tidak cocok mendarat di slug **`"lainnya"`** dan dicatat — **jangan dibuang diam-diam**, produk akan hilang tanpa jejak.

**Dua jenis `"lainnya"`, sengaja dibedakan** lewat `SENGAJA_LAINNYA` + `alasanLainnya(category, brand)`:

- **SENGAJA** (`console.info`) — kategori yang sudah ditimbang dan diputuskan TIDAK dibuatkan halaman: **Tiket** (butuh pilih jadwal/rute/kursi + ketersediaan real-time; tidak ada nomor pelanggan untuk di-inquiry, harga berubah per keberangkatan) dan **Emas/Tabungan** (produk investasi: KYC, rekening atas nama pengguna, harga buyback bergerak, kepatuhan OJK). Keduanya **tidak muat di pola Tipe A/B/C/D** — itulah alasannya, bukan kelupaan.
- **TIDAK DIKENAL** (`console.warn`) — kategori baru/tak terduga yang **perlu ditinjau**: tambahkan slug di `MAP`, atau daftarkan di `SENGAJA_LAINNYA` beserta alasannya.

Kalau salah satu kategori SENGAJA itu mau dikerjakan: hapus entrinya, tambahkan slug di `MAP`, dan buat alurnya sendiri — **jangan dipaksa** masuk pola PPOB sederhana.

**Alias, bukan slug baru**: kategori Digiflazz **"Angsuran Kredit"** dipetakan ke slug **`multifinance`** (bukan halaman sendiri) — `multifinance.js` sudah memuat perusahaan pembiayaan kredit umum (FIF, Adira, BAF, Mandala, WOM) dengan alur, admin per biller, dan modal yang identik.

> String `category` di file itu adalah **EKSPEKTASI**, bukan fakta — repo ini belum pernah menyentuh API Digiflazz. **Wajib dicocokkan ulang dengan price-list asli pada sync pertama.**

#### Katalog produk dari backend (`api.js`) — SELURUH 12 KATEGORI PRABAYAR LIVE

**Fase 2 sudah dimulai. Kategori yang datanya ASLI dari backend DikaPay**
(`https://dikapayofficial.my.id/api-produk.php?jenis=prabayar`): **Pulsa**
(518), **Paket Data** (2.631), **Listrik/token PLN** (10), **Masa Aktif**
(27), **Aktivasi Perdana** (135), **Paket SMS & Telpon** (282) — semuanya
TIPE A — plus TIPE B: **Streaming** (24), **E-Money** (35), **Games**
(2.235), **Aktivasi Voucher** (1.333), **Voucher** (1.102) dan **TV** (0 —
lihat di bawah). **Fase prabayar SELESAI: 12 dari 12 kategori, 8.332
produk.** Yang tersisa 16 kategori PASCABAYAR — pendekatannya berbeda,
lihat "Transisi ke pascabayar" di bawah:

> **NAMA KATEGORI DI PRICE-LIST ≠ NAMA HALAMAN.** Sudah diverifikasi dengan
> respons asli: Digiflazz mengirim `kategori: "Data"`, BUKAN "Paket Data".
> `kategori-map.js` sendiri sudah benar (slug `data` memuat alias `"data"`
> DAN `"paket data"`), tapi penyaringan di file data kategori harus memakai
> string ASLI-nya. Sebelum menyambungkan kategori baru, **cek dulu nilai
> persis `kategori` dari respons** — jangan menebak dari nama halaman.
> Nilai yang sudah terverifikasi: `Pulsa`, `Data`, `Games`, `Voucher`,
> `Aktivasi Voucher`, `Paket SMS & Telpon`, `Aktivasi Perdana`, `E-Money`,
> `Masa Aktif`, `Streaming`, `PLN`, `Gas`.

```js
DikaApi.kategori("prabayar", "Pulsa")   // -> Promise<[{kode_produk, kategori, brand, nama, harga_modal}]>
  .then(function (daftar) { PRODUK = bangun(daftar); /* -> render ulang */ });
```

- **`scripts/api.js` → `window.DikaApi`** — SATU-SATUNYA `fetch` ke backend.
  `katalog(jenis, paksa?)` / `kategori(jenis, nama, paksa?)` / `bacaCache(jenis)` /
  `bersihkanCache(jenis?)`. Endpoint mengembalikan **SEMUA kategori prabayar
  dalam satu array** (~8 ribu produk, ±1,1 MB) — penyaringan per `kategori`
  terjadi di `api.js`, bukan disalin di tiap file data.
  - **Cache dua lapis, umur 5 menit**: memori (per dokumen) + `sessionStorage`
    (per tab, kunci `dikapay:katalog:<jenis>`). **sessionStorage, BUKAN
    localStorage** — harga produk tidak boleh menempel berhari-hari di
    perangkat member. Gagal menulis cache (kuota penuh) **tidak pernah**
    menggagalkan permintaan; cache itu percepatan, bukan syarat.
  - **Permintaan yang sedang berjalan dibagi pakai** (`inflight`): dua
    pemanggil untuk jenis yang sama menunggu Promise yang sama, bukan
    menembak endpoint dua kali. Penting saat nanti 12 kategori prabayar
    saling menyusul.
  - **Timeout 20 detik** (AbortController) + `ok:false` dari backend
    diperlakukan sebagai GAGAL walau HTTP-nya 200. Setiap galat membawa
    `pesanMember` (kalimat ramah untuk UI) dan `sebab` (detail teknis untuk
    console) — UI tidak pernah menampilkan pesan teknis mentah.
- **`UI.createStatus({ anchor })`** (produk-ui.js) — kartu status pemuatan
  bersama: `memuat()` (skeleton 2 kolom yang meniru `.prod-grid`),
  `gagal(pesan, onRetry)` (pesan ramah + tombol "Coba Lagi"), `kosong(pesan)`,
  `sembunyi()`. Dibuat runtime & disisipkan sebelum `#prodSec`, jadi **tidak
  ada halaman yang perlu menambah markup**. Ia SENGAJA di luar `#prodSec`:
  section itu dikelola `createGrid` dan disembunyikan tiap kali daftarnya
  kosong — persis saat status "memuat"/"gagal" justru harus terlihat.
- **Render ulang setelah data datang** dilakukan dengan **memicu event
  `input` di `#phoneInput`**, bukan memanggil internal `produk-page.js`
  (pola yang sama dengan `input-helper.js`: kirim event, jangan menyentuh
  controller). `productsFor(opKey)` tetap SINKRON — ia mengembalikan apa
  yang sudah termuat saat itu, SETELAH pilihan sub-brand & filter harga
  diterapkan (urutannya wajib begitu: `state.items` di produk-page.js harus
  persis sama dengan yang terlihat, kalau tidak indeks kartu yang diketuk
  menunjuk produk lain).
- **Tab subkategori dibangun ulang lewat SIDIK JARI id**, bukan lagi "kalau
  opKey berganti". Penjaga lama meleset di dua arah begitu datanya asli:
  (a) memilih sub-brand by.U mengganti susunan tab TANPA mengganti operator,
  sehingga tab famili Telkomsel tetap terpampang padahal tak satu pun berlaku
  untuk by.U; (b) tab operator LAMA tertinggal saat daftar subkategori
  sementara kosong (menunggu pilihan sub-brand / masih memuat). Efek
  sampingan yang disengaja: di halaman ber-tab yang id-nya sama untuk semua
  operator (`perdana`, `sms-telpon`), tab pilihan member kini BERTAHAN saat
  ganti operator — isinya tetap dihitung ulang per operator.
- **Dua kait opsional di `produk-page.js`** untuk halaman berdata backend —
  keduanya additive, halaman lama tidak terpengaruh:
  - `config.renderKey(opKey)` → penanda tambahan untuk key grid. Tanpa ini,
    operatornya tetap sama saat member berganti sub-brand / menekan chip
    filter, sehingga `createGrid` MELEWATI render dan grid terlihat macet.
  - `config.kosongWajar(opKey)` → true saat daftar kosong itu keadaan sah,
    supaya "daftar produk kosong" tidak dicatat sebagai kesalahan data
    padahal kartu status sudah menjelaskannya ke member. Tiga keadaan sah:
    katalog masih dimuat, sub-brand belum dipilih, **dan operator yang
    memang tidak punya produk di kategori itu** (Digiflazz tidak menjual
    Masa Aktif untuk Smartfren maupun by.U — itu fakta katalog, bukan bug).
    Kosong DI DALAM operator yang punya produk (subkategori/filter meleset)
    tetap dilaporkan sebagai kesalahan.
- **Pemetaan `brand` → `opKey`** lewat `brand-map.js`. Brand yang tidak
  dikenal **tidak dibuang diam-diam**: dihitung, dilaporkan `console.warn`,
  dan produknya dilewati (lihat "by.U" di bawah).
- **Dedupe + urut**: satu nominal bisa datang dari >1 SKU dengan harga beda
  (mis. "Telkomsel 25.000" @24.675 dan @23.950) — disimpan yang **termurah**,
  lalu daftar diurutkan **dari harga terkecil** (price-list datang acak:
  90.000 lalu 2.000).
- **`by.U` DIPISAH lewat PEMILIH SUB-BRAND, bukan digabung & bukan dibuang.**
  by.U memakai blok prefix yang SAMA dengan Telkomsel, jadi deteksi nomor
  mustahil membedakannya — `operator()` memang mengembalikan `telkomsel`
  untuk keduanya, dan itu benar (kartunya berjalan di jaringan Telkomsel).
  Tapi PRODUKNYA tidak saling berlaku: pulsa by.U hanya masuk ke nomor by.U.
  Karena itu:
  - `brand-map.js` menyimpan tabel `SUB_BRAND` + `pisahSubBrand(opKey, produk)`
    yang memecah daftar satu operator jadi `[{id, label, produk}]` — bentuk
    yang SAMA dengan kontrak subkategori, jadi pemanggil tidak belajar bentuk baru.
  - Halaman menampilkan **pemilih sub-brand** (`UI.createChoice`) sebelum
    katalognya muncul; selama belum dipilih, grid sengaja KOSONG dan kartu
    status menjelaskan kenapa. Menebak salah satu berarti separuh member
    melihat katalog yang produknya pasti gagal di nomor mereka.
  - Pilihannya **hanya di memori**: ganti nomor ke operator lain → pemilih
    hilang dan pilihannya dilupakan (bukan preferensi akun, tapi konteks
    satu transaksi).
  - Ini bukan kasus Pulsa saja — pada price-list asli by.U muncul di **6
    kategori prabayar** (Pulsa 102, Data 94, Aktivasi Voucher 48, Voucher 36,
    SMS & Telpon 5, Aktivasi Perdana 1), makanya tabelnya di `brand-map.js`,
    bukan di `pulsa.js`.
  - Modal konfirmasi tetap menulis "Operator: Telkomsel" untuk produk by.U —
    **itu benar, bukan bug** (alasan yang sama dengan badge operator di
    `byu.html`); nama produknya sendiri sudah menyebut "by.U".
- **Filter rentang nominal untuk katalog besar** (`UI.createFilterHarga`) —
  chip "Semua / < Rp10rb / Rp10rb–25rb / Rp25rb–50rb / Rp50rb–100rb /
  > Rp100rb" muncul OTOMATIS begitu daftarnya lebih panjang dari ambang
  (`min`, default 20) — **tidak di-hardcode per operator/kategori**. Kelompok
  yang kosong tidak pernah dirender (chip yang selalu memberi nol cuma
  menipu), dan katalog kecil (XL 17 produk) tetap tampil polos.
  - Batas bawah inklusif, batas atas eksklusif — produk tepat Rp25.000 masuk
    SATU kelompok saja.
  - Chip TIDAK dirender ulang selama `kunciKatalog` (operator + sub-brand)
    tidak berubah. Ini penting: `createTabs.render()` selalu mengaktifkan tab
    pertama, sedangkan menekan chip ITU SENDIRI memicu penggambaran ulang
    grid — tanpa penjagaan itu, filter yang baru ditekan langsung batal
    sebelum sempat terlihat (bug yang benar-benar terjadi saat dibangun).
- **Jumlah produk di halaman Margin** kini ikut katalog asli.
  `margin.html` me-link `api.js`+`brand-map.js`+`kategori-live.js` tapi
  **tidak menembak jaringan**: tiap file data cuma membaca cache sesi
  (`cobaDariCache()`). Kalau belum ada cache, `margin.js` menampilkan "—" —
  lebih jujur daripada angka dummy yang basi.
- **Stagger animasi kartu DIBATASI** (`MAKS_STAGGER` di `createGrid`).
  Dengan data dummy (9 kartu) `i * 45ms` tidak pernah bermasalah; dengan
  katalog asli (Telkomsel: 270 kartu pulsa) kartu terakhir menunggu **12
  detik** dan — karena `prodIn` memakai fill `backwards` — benar-benar tak
  terlihat sampai gilirannya tiba. Sekarang maksimal ±0,5 detik untuk
  seluruh grid.

##### Transisi ke PASCABAYAR — endpointnya berbentuk lain

Fase prabayar tuntas (12/12). 16 kategori sisanya pascabayar, dan
**polanya TIDAK bisa disalin apa adanya** — sudah diperiksa ke endpoint:

```
GET .../api-produk.php?jenis=pascabayar   ->  400 produk
```

| | Prabayar | Pascabayar |
|---|---|---|
| Jumlah kategori di respons | **12** (Pulsa, Data, Games, …) | **1** — semuanya berkategori `"Pascabayar"` |
| Pemisah slug | field `kategori` | **field `brand`** (16 nilai: `PLN PASCABAYAR`, `PDAM`, `E-MONEY`, …) |
| Field harga | `harga_modal` | **`admin_fee`** (dan nilainya bisa `null`) |
| Controller | produk-page / provider-page | **manual-page.js** (Tipe C) |

Konsekuensi konkret:

- **`DikaApi.kategori(jenis, nama)` tidak cukup** — ia mencocokkan satu
  string `kategori`, dan di sini semua 400 baris bernilai `"Pascabayar"`.
  Penyaringannya harus lewat `brand`, mirip cara `tv.js` menyaring lewat
  `DikaKategoriMap.cocokkan()` (dan ingat pelajarannya: panggil pencocok
  **sekali per nilai unik**, bukan per baris — versi per-baris sempat
  mencetak 405 peringatan sekali buka halaman).
- **`kategori-map.js` sudah menyiapkan pemisahnya**: `cocokkan(category,
  brand, "pascabayar")` menerima argumen ketiga dan membuang kandidat yang
  jenisnya beda. Itu yang memisahkan `emoney` (prabayar) dari
  `emoney-pasca` — dan sudah terbukti: 0 produk pascabayar bocor ke
  halaman E-Money prabayar.
- **Skema produknya BEDA**: pascabayar TIDAK punya `harga_modal`
  (`DikaProduk.check()` akan menolaknya kalau ditambahkan), nominalnya
  datang dari inquiry. Jadi `lebihBaik()`/dedupe-harga dan `createGrid`
  tidak berlaku; yang dipakai `admin_fee` + alur cek tagihan.
- **Margin tidak berlaku** untuk pascabayar (keputusan produk yang sudah
  ada) — jangan mendaftarkan slug pascabayar ke `katalog-jumlah.js`
  seolah-olah bisa diberi margin.
- **`admin_fee` bernilai `null` untuk SELURUH 400 produk**, bukan sebagian.
  Jadi biaya admin BELUM tersedia dari backend sama sekali — halaman
  pascabayar tidak bisa menampilkannya dari data asli dulu. Ini perlu
  dilaporkan ke pemilik backend sebelum fase itu dikerjakan; kalau tidak,
  16 halaman akan menampilkan "Admin Rp0" yang menyesatkan.
- **16 nilai `brand` memetakan 1:1 ke 16 slug pascabayar**: PDAM 263 ·
  PBB 70 · MULTIFINANCE 26 · TV PASCABAYAR 14 · INTERNET PASCABAYAR 6 ·
  HP PASCABAYAR 5 · E-MONEY 5 · BPJS KETENAGAKERJAAN 2 · GAS NEGARA 2 ·
  PLN PASCABAYAR 1 · BPJS KESEHATAN 1 · Tri CuanMax 1 · XL Axis Cuanku 1 ·
  Indosat Only4u 1 · Telkomsel Omni 1 · by.U 1. Perhatikan sebarannya
  sangat timpang — PDAM & PBB memang satu biller per daerah (`produkList`),
  sedangkan 10 kategori lain cuma 1-6 biller.

##### `kategori-live.js` — perangkai bersama kategori Tipe A yang sudah live

`pulsa.js` & `paket-data.js` MEMBUKTIKAN polanya, tapi keduanya merangkainya
sendiri (±150 baris identik per file). Menyalinnya ke 22 kategori sisanya
persis yang dilarang di "Jangan menyalin logika antar halaman produk".
`window.DikaKategoriLive.pasang(config)` mengangkat rangkaian itu ke satu
tempat, sehingga file data kategori tinggal berisi **nama kategori di
price-list, teks halaman, dan (kalau bertab) definisi subkategorinya**.

```js
window.DikaMasaAktif = window.DikaKategoriLive.pasang({
  slug: "masa-aktif", kategori: "Masa Aktif",
  sectionTitle: "Pilih Masa Aktif", detailLabel: "Masa Aktif",
  payTitle: "Pembayaran", payLine: function (item, op, phone) { … },
  subdef?, filterMin?, labelKosong?, labelPilihSub?,
});
```

Yang diurus di dalamnya: fetch lewat `DikaApi`, pemetaan `brand`→opKey,
`gangguan`/`deskripsi` diteruskan, dedupe nama kembar, pisah sub-brand +
pemilihnya, pengelompokan subkategori, kartu status, `renderKey`/
`kosongWajar`, pendaftaran ke `katalog-jumlah.js`, jalur cache-saja untuk
`margin.html`, dan sebuah `debug()` untuk pengujian.

- **`pulsa.js` & `paket-data.js` SENGAJA tidak dipindah ke sini.** Keduanya
  sudah dinyatakan tuntas & teruji; memindahkannya sekarang menambah risiko
  tanpa menambah kemampuan. Perilaku modul ini dibuat sama persis, jadi
  memindahkan mereka nanti aman.
- **`listrik.js` juga TIDAK memakainya** — halaman itu tidak punya operator
  untuk dideteksi (nomor meter, bukan nomor HP) dan berdiri di atas
  `produk-ui.js` langsung, jadi ia merangkai fetch-nya sendiri memakai modul
  yang sama (`DikaApi` + `createStatus` + `statusGangguan`).
- **Keranjang "Lainnya" tidak pernah tampil ke member**: sisa produk yang
  tidak cocok subkategori mana pun dititipkan ke subkategori TERAKHIR (yang
  memang keranjang umum kategori itu) **plus `console.warn`** berisi nama
  produknya — famili baru dari Digiflazz tetap ketahuan tanpa memunculkan
  tab bernama "Lainnya".

##### Halaman TIPE B berdata backend — dua kait baru di `provider-page.js`

Tipe A dan Tipe B **membaca datanya dengan cara yang berbeda secara
mendasar**, dan itulah satu-satunya alasan Tipe B butuh perubahan
controller:

| | `produk-page.js` (A) | `provider-page.js` (B) |
|---|---|---|
| Sumber produk | **callback** `productsFor(opKey)` / `subFor(opKey)` | **array statis** `config.providers` |
| Kapan dibaca | tiap render | **sekali**, saat `init()` |
| Kunci kelompok | `opKey` dari prefix nomor (runtime) | `provider.id` (ditulis di file data) |
| Daftar brand | tidak ada | `renderBrands()` sekali di `init()` |
| Data telat datang | otomatis terpakai (callback dipanggil lagi) | **tidak ada jalan masuk** |

Akibatnya untuk data async ada DUA penghalang: (1) `DikaProviderPage(...)`
menolak init dengan *"config.providers wajib diisi"* karena saat dipanggil
daftarnya masih kosong; (2) tidak ada cara menggambar ulang daftar brand
setelah fetch selesai. Karena itu `provider-page.js` sekarang punya:

```js
DikaProviderPage({
  providersFor: function () { return PROVIDERS; },   // dibaca ULANG tiap render
  …
});                                                  // -> { segarkan(), brandTerpilih() }
```

- **`config.providersFor()`** — kalau diisi, `config.providers` statis tidak
  dipakai sama sekali. Semua pembacaan lewat SATU pintu `daftarProvider()`
  di dalam controller (dulu `config.providers` dibaca langsung di tiga
  tempat, dan itu yang bikin data async mustahil).
- **Nilai balik `.segarkan()`** — dipanggil halaman SETELAH data tiba.
  Menggambar ulang daftar brand DAN, kalau member kebetulan sedang membuka
  satu brand, menyegarkan grid-nya dengan record baru. Tanpa bagian kedua
  itu `state.items` bisa memegang record lama sementara kartu di layar sudah
  yang baru — indeks kartu lalu menunjuk produk yang salah.
- **Additive**: 5 halaman Tipe B yang masih dummy (games, tv, voucher,
  voucher-act, emoney) tidak diubah sama sekali dan sudah diverifikasi tetap
  normal (0 error).

**JEBAKAN: satu brand memakai `subkategori` ATAU `produk`, TIDAK PERNAH
KEDUANYA.** `hitungProvider()` di `katalog-jumlah.js` MENJUMLAHKAN keduanya
kalau ada dua-duanya, jadi brand ber-12 produk akan terhitung 24 dan halaman
Margin menampilkan angka dua kali lipat. Konvensi ini sudah dipakai
voucher/games/voucher-act sejak awal, tapi tidak pernah ditulis — dan
langsung menggigit saat streaming.js pertama kali menyetel dua-duanya.

**`#prodTabs` WAJIB ADA di halaman Tipe B yang brand-nya punya
`subkategori`.** `streaming.html` dulu tidak punya elemen itu; begitu WeTV
mendapat 2 subkategori, `subAktif()` selalu jatuh ke subkategori PERTAMA dan
**9 dari 12 produk WeTV tidak pernah bisa dibuka** — tanpa satu pun error di
console. Persis bug yang sama pernah terjadi di `pulsa.html`. Cara
menangkapnya: **hitung ulang kartu** — keliling semua tab, jumlahkan kartu
yang benar-benar tampil, bandingkan dengan jumlah produk brand itu.

##### Voucher — isinya CAMPURAN operator + merchant

Gampang disangka murni merchant digital. Kenyataannya operator justru
mayoritas:

| | Produk | Brand |
|---|---|---|
| Voucher data OPERATOR | **860 (78%)** | Telkomsel 278 · Indosat 204 · Axis 157 · Smartfren 109 · XL 49 · by.U 41 · Tri 27 |
| Merchant & game | **242 (22%)** | Steam Wallet 26 · Google Play 23 · Tokopedia 13 · iTunes 12 · XBOX 10 · … (36 brand lain) |

**43 brand**, jadi `config.cari` dipakai (ambang 12) dan `tabs` grup
(Ritel/E-Commerce/Transport/Voucher Game) DIHAPUS — alasan yang sama dengan
genre di Games: grup tidak ada di price-list, harus ditebak untuk 43 brand,
dan grup yang salah menyembunyikan merchant dari member yang mencarinya.

**`brand-map.js` tabel `voucher` sebelumnya cuma punya 10 merchant** — 34
brand lain (**997 produk, 90%**) tidak terpetakan. 7 operator ditambahkan
ke tabel; merchant yang belum terdaftar memakai id turunan nama (pola
Games). Menuntut tiap merchant didaftarkan dulu = ratusan produk hilang.

###### Region & mata uang WAJIB dipisah — ini uang member

Alias lama melebur brand yang isinya berbeda jauh:

| Brand | Isi | Contoh |
|---|---|---|
| `Steam Wallet` | **Ringgit Malaysia** | MYR 5 → Rp21.573 |
| `Steam Wallet (IDR)` | Rupiah | Rp6.000 → Rp5.975 |
| `GOOGLE PLAY INDONESIA` | region Indonesia | Rp5.000 → Rp4.882 |
| `GOOGLE PLAY US REGION` | region USA | $25 → **Rp431.025** |

Kode region yang salah **tidak bisa ditebus** di akun member. Keempatnya
kini punya id sendiri (`steam`/`steam-idr`, `gplay`/`gplay-us`), dipisah
lewat aturan "alias TERPANJANG menang".

Di dalam Steam Wallet, tipe negara jadi tab: **Malaysia / Singapura /
Philippines / Hong Kong**; iTunes: **Indonesia / US**. Tipe negara ini
SENGAJA **tidak** dilebur ke "Zona Regional" — "Zona Regional" di app ini
berarti wilayah DALAM NEGERI (Jawa Barat, Kalisumapa), sumbu yang sama
sekali berbeda; member yang membukanya mengharapkan provinsi, bukan
Ringgit. Juga tidak dilebur jadi satu "Luar Negeri": selisihnya besar
(SGD 5 = Rp66.721 vs MYR 5 = Rp21.573) dan tiap tipe kebetulan milik SATU
brand saja, jadi tabnya tidak pernah menumpuk.

###### 5 produk tanpa `brand` — TIDAK butuh kode baru

Lima produk berkategori Voucher punya `brand: null` padahal namanya jelas
menyebut operatornya (`"Voucher Telkomsel 5 GB 3 Hari (Jabodetabek)"`).
Jalur penyelesaiannya sudah ada sejak awal: **`provider()` di brand-map.js
menerima `namaProduk` sebagai upaya kedua** saat brand gagal dicocokkan —
jalur yang sama yang memisahkan Axis dari XL. Kelimanya mendarat di
Telkomsel (273 → 278), dan familinya (Zona Regional) ikut ketemu lewat
`dariNama()` karena namanya menyebut "(Jabodetabek)".

##### Aktivasi Voucher — penyedianya OPERATOR, bukan merchant

Gampang tertukar dengan kategori **"Voucher"** (Google Play, Steam, Garena,
Alfamart, …) yang memang merchant. **"Aktivasi Voucher" adalah aktivasi
voucher fisik OPERATOR**, jadi penyedianya operator seluler:

| Operator | Produk | Tab |
|---|---|---|
| Tri | 535 | Happy 13 · AlwaysOn 7 · Penawaran Spesial 8 · Zona Regional 500 · Voucher Reguler 7 |
| Telkomsel | 227 | Zona Regional 221 · Voucher Reguler 6 |
| Indosat | 225 | Freedom Internet 11 · Penawaran Spesial 11 · Zona Regional 203 |
| XL | 104 | Xtra Combo 12 · Flex Mini 24 · FlexMax 14 · Flex 4 · Bebas Puas 21 · Hotrod 13 · Harian & Mingguan 9 · Zona Regional 7 |
| Axis | 102 | OWSEM 7 · AIGO SS 20 · Zona Regional 44 · Voucher Reguler 31 |
| Smartfren | 90 | Unlimited 26 · Unlimited Nonstop 33 · Voucher Reguler 31 |
| by.U | 50 | *(satu famili — bilah tab disembunyikan)* |

- **`brand-map.js` tabel `voucher-act` sebelumnya cuma punya 5 operator.**
  **AXIS (102 produk) dan by.U (50) belum terdaftar** dan akan hilang dari
  halaman tanpa jejak. Keduanya sudah ditambahkan.
- **by.U TIDAK butuh pemilih sub-brand di sini** — diverifikasi, bukan
  diasumsikan. Di halaman TIPE A ia wajib dipisah lewat `pisahSubBrand()`
  karena `operator()` memetakannya ke `telkomsel` (blok prefix sama). Di
  sini halamannya Tipe B (penyedia dipilih manual, bukan dari nomor) dan
  Digiflazz sudah mengirim `brand: "by.U"` terpisah — cukup jadi kartu
  penyedia sendiri.
- Kategori ini **didominasi voucher REGIONAL**: Telkomsel 18 dari 19
  tipe-nya nama wilayah, Tri 9 dari 15. Tab "Zona Regional" karena itu jadi
  yang terbesar di beberapa operator — itu cerminan katalognya, bukan
  rollup yang malas.

**Dua keputusan rollup yang arahnya berlawanan, dan itu disengaja:**

| Tipe | Keputusan | Alasan |
|---|---|---|
| `Bebas Puas 2rb/3rb/5rb` (XL) | **DIGABUNG** jadi "Bebas Puas" | angkanya cuma NOMINAL voucher — sudah tercetak di nama kartu dan terlihat dari harganya |
| `SP3K/SP5K SP7K/…` (Perdana) | **TIDAK digabung** | angkanya menunjuk KARTU FISIK yang dipegang member; salah pilih = aktivasi gagal |
| `Flex Mini` / `FlexMax` / `Flex` (XL) | **TIDAK digabung** | bedanya ukuran & masa aktif — justru itu yang dicari member |
| `Aigo SS` (Axis) | **dipisah** | namanya menyebut "Aigo SS" |
| `Aigo` polos (Axis) | **TIDAK dipisah** | namanya TIDAK menyebut Aigo (`"Aktivasi Voucher Axis 1.5 GB 1 Hari"`) dan sebentuk persis dengan tipe "Umum" — tab "AIGO" berisi kartu yang di layar terlihat identik hanya membingungkan |

Patokannya satu dan sama di semua kasus: **"apakah membedakannya berguna
BAGI MEMBER, dilihat dari apa yang tertulis di kartu?"** — jawabannya saja
yang berbeda.

###### Fallback `tipe` kosong: WILAYAH mengalahkan nama famili

`dariNama()` di tipe-map.js sekarang **memeriksa wilayah LEBIH DULU**,
mengalahkan nama famili yang lebih panjang sekalipun. Itu bukan preferensi
kita — itu konvensi Digiflazz, dan sudah diverifikasi ke katalog: dari
**745 produk** yang namanya memuat NAMA FAMILI **dan** WILAYAH sekaligus
(334 "Freedom Internet", 411 "Happy"), **nol** yang ditandai nama
familinya; semuanya ditandai WILAYAH.

Tanpa aturan itu hasilnya jadi lotere panjang string: `"(Jawa Tengah)"`
(11) menang atas `"Happy"` (5) — kebetulan benar — tapi
`"Freedom Internet"` (16) menang atas `"(CJEJBN)"` (6) — kebetulan salah,
padahal **69 produk sekerabatnya ditandai `"Jawa Tengah EJBN"`**. (`CJEJBN`
ikut ditambahkan ke daftar wilayah atas dasar 69 produk itu, bukan tebakan.)

`dariNama()` juga **mengubah tanda baca jadi spasi** sebelum mencocokkan.
Penanda wilayah hampir selalu ditulis dalam kurung di ujung nama, dan
dengan hanya merapikan spasi, `"(Jawa Tengah)"` tidak pernah kena.

Hasilnya: **10 produk bertipe kosong di seluruh katalog** kini jatuh
konsisten dengan konvensi Digiflazz — 9 ke Zona Regional (semuanya memang
menyebut wilayah), 1 ke Freedom Internet (satu-satunya yang tidak).

##### Games — pencarian nama menggantikan tab genre

**107 game, 2.236 produk.** Dua keputusan yang membedakannya dari halaman
Tipe B lain:

**1. Tiga turunan game DIPISAH dari induknya.** `Free Fire Max` (78),
`PUBG Mobile Lite` (7), dan `PUBG New State Mobile` (6) sempat tertelan
alias induknya (`"free fire"`, `"pubg"`) — 91 produk mendarat di kartu yang
salah, dan member bisa membeli diamond PUBG Lite untuk akun PUBG Mobile
biasa. Sekarang punya id sendiri: `ffmax`, `pubglite`, `pubgnewstate`.
Pemisahnya BUKAN urutan penulisan tapi aturan **alias terpanjang menang**
di `cocokTabel()`.

> `needZone` ketiganya `false`, **disamakan dengan game induknya — ITU
> ASUMSI, bukan fakta dari Digiflazz.** Ditandai juga di komentar `games.js`.

**2. `config.cari` menggantikan `config.tabs` genre.** Genre TIDAK ADA di
price-list, jadi 107 nilainya harus ditulis tangan — dan genre yang ditebak
salah **menyembunyikan game dari member yang mencarinya**, tanpa jejak.
`UI.createCari()` (primitif baru di produk-ui.js) menyaring daftar brand
secara real-time dari nama yang diketik. Muncul OTOMATIS hanya kalau daftar
brand >= `min` (default 12), jadi Streaming (2), E-Money (4), Voucher (2)
tetap polos tanpa perubahan di file datanya.

- Substring case-insensitive, di-debounce 120ms (tiap ketukan menggambar
  ulang 107 tombol).
- Pencarian diterapkan PALING AKHIR di `brandsTampil()`; `pickBrand()`
  mencari lewat `data-id` di seluruh daftar, jadi menyaring tidak pernah
  bisa membuka brand yang salah.
- Tidak ketemu -> pesan ramah, bukan grid kosong senyap.

**Brand yang belum terdaftar di `brand-map.js` TIDAK dibuang di halaman
ini** — id-nya diturunkan dari nama brand. Dengan 107 game (dan bertambah
terus), menuntut tiap game didaftarkan dulu berarti ratusan produk hilang
diam-diam. Konsekuensinya `provider()` dapat argumen keempat **`diam`**:
untuk pemanggil yang MEMANG mengharapkan brand di luar tabel, peringatan
per baris bukan cuma bising (**1.170 baris** sekali buka halaman) tapi juga
SALAH ARAH — sarannya "tambahkan aliasnya", padahal tidak ada yang perlu
diperbaiki. `games.js` memoisasi lookup per nama brand dan melaporkan
ringkasannya sendiri. Hasilnya: **0 peringatan**.

**Dua jebakan yang tertangkap saat membangun halaman ini:**

- **Stagger `renderBrands()` tidak dibatasi.** `i * 45ms` dengan 107 kartu =
  kartu terakhir menunggu **4,8 detik**, dan karena `.brand` memakai
  `animation ... backwards` ia benar-benar TIDAK TERLIHAT sampai gilirannya.
  Bug yang sama persis pernah diperbaiki di `createGrid` lewat
  `MAKS_STAGGER`; sekarang angkanya diekspor dari produk-ui.js dan dipakai
  bersama, bukan disalin.
- **`UI.brandVars()` hanya menerima HEX `#rrggbb`.** Warna turunan-nama
  untuk 99 game sempat ditulis `hsl(...)`; `hexRgb()` menolaknya dan
  `brandVars` jatuh ke jalur cadangan yang menyetel warna TEKS dan LATAR ke
  nilai yang SAMA — 99 kotak berwarna tanpa huruf, tanpa satu pun error.
  Ketahuan dari screenshot, bukan dari console.

##### Kebutuhan Zone ID — dari DOKUMENTASI RESMI Digiflazz

Price-list tidak mengirim informasi ini sama sekali — sudah diperiksa dua
arah dan dua-duanya nihil: (a) nama produk, 0 dari 107 brand menyebut
Server/Zone/Region/Role ID; (b) struktur record, game yang butuh Zone dan
yang tidak punya field, `tipe`, dan format `kode_produk` yang identik.

Jawabannya karena itu datang dari **dokumentasi/dashboard resmi Digiflazz**,
disimpan sebagai dua daftar nama di `games.js`: `ZONA_BUTUH` (6 game) dan
`ZONA_TIDAK` (101 game). **Seluruh 107 brand tercakup** — tidak ada lagi
tingkat keyakinan bertingkat, dan tidak ada lagi field Zone ID opsional.

| | Jumlah | Field Zone ID |
|---|---|---|
| Butuh Zone | **6** | dirender & **WAJIB** |
| Tidak butuh | **101** | **tidak dirender sama sekali** |
| Di luar dokumentasi | **0** | *(kalau ada: User ID wajib + Zone ID opsional)* |

6 game yang butuh: **ARENA OF VALOR, Call of Duty MOBILE, MOBILE LEGENDS,
PUBG MOBILE, PUBG Mobile Lite, PUBG New State Mobile.**

**Data ini MENGGANTIKAN TOTAL penandaan "riset eksternal" & "asumsi"
sebelumnya**, yang beberapa di antaranya ternyata bertentangan:
- dikoreksi jadi User-ID-saja: Genshin Impact, Zenless Zone Zero,
  Ragnarok M: Eternal Love, Magic Chess;
- dikoreksi jadi butuh Zone: ARENA OF VALOR, Call of Duty MOBILE,
  PUBG Mobile Lite, PUBG New State Mobile.

**Tabelnya dikunci NAMA BRAND (dinormalisasi), bukan `provider.id`.**
Sumber resminya memang daftar nama, dan 94 dari 107 game tidak punya id
terdaftar di `brand-map.js` (id-nya diturunkan dari nama) — mengunci ke id
berarti menambah satu lapis terjemahan yang bisa meleset tanpa ketahuan.
Normalisasi membuang semua non-alfanumerik, jadi beda spasi/kapital/tanda
baca tidak masalah. **Itu bukan kemewahan**: dokumentasi menulis
`"Tom and Jerry: Chase"` sedangkan price-list `"Tom and Jerry : Chase"`
(ada spasi sebelum titik dua) — dengan exact match, satu game itu diam-diam
jatuh ke default. Hasil pencocokan: **106 persis, 1 toleran, 0 gagal, 0
brand tersisa**.

> **Pemisahan `ffmax`/`pubglite`/`pubgnewstate` terbukti bukan sekadar
> kerapian.** Dokumentasi resmi menyatakan Free Fire Max TIDAK butuh Zone
> sedangkan PUBG Mobile Lite & PUBG New State BUTUH. Kalau ketiganya masih
> tertelan alias induknya, dua game itu kehilangan field Zone ID-nya dan
> setiap transaksinya gagal di penyedia. Hal yang sama berlaku untuk
> `magicchess` vs `ml`: Mobile Legends butuh Zone, Magic Chess tidak.

> **Pelajaran yang layak diingat:** nilai `pubglite`/`pubgnewstate` dulu
> diwarisi dari game induknya lewat asumsi, dan asumsi itu SALAH —
> mewarisi nilai dari game induk mewarisi juga kesalahannya.

###### TODO fase 3 — menyusun `customer_no` ke Digiflazz

Alur pembelian sungguhan BELUM dibangun. Saat nanti dibangun, `customer_no`
harus disusun MENGIKUTI KELOMPOK DI ATAS, bukan sekadar "ada isinya atau
tidak":

| Kelompok | Aturan |
|---|---|
| ada di `ZONA_BUTUH` (6 game) | **SELALU** gabungkan `userid` + `zone` |
| ada di `ZONA_TIDAK` (101 game) | **SELALU** kirim `userid` saja, walau ada nilai lain tertinggal di form (field-nya memang tidak dirender) |
| brand di luar dokumentasi | `zone` diisi → gabungkan; `zone` kosong → `userid` saja |

**JANGAN PERNAH mengirim format campuran yang salah** (mis. menggabung zone
untuk game yang tidak memintanya, atau mengirim userid saja untuk game yang
butuh zone) — penyedia menolaknya dan uang member sudah terlanjur ditahan.
Formatnya sendiri (pemisah antara userid & zone) wajib dicocokkan ke
dokumentasi Digiflazz saat itu; jangan ditebak.

##### E-Money & TV — dua kasus yang TIDAK mengikuti pola biasa

**`emoney` — `tipe` di sini BUKAN famili produk.** Nilainya "Umum",
"Admin 500", "Admin 1000", "Admin 1500" — itu NOMINAL BIAYA ADMIN penyedia.
Tab bernama "Admin 1500" tidak memberi tahu apa pun tentang isinya, dan
angkanya toh sudah tercetak di nama produk ("OVO 15.000 Admin 1.500") serta
sudah tercermin di `harga_modal`. **`tipe-map.js` sengaja TIDAK di-link di
`emoney.html`.** Pengelompokan yang benar di sini **Kartu fisik vs E-Wallet**,
dari BRAND lewat `DikaBrandMap.jenisEmoney()`.

- `jenisEmoney()` mengisi DUA field sekaligus di tiap provider: `sub`
  ("Kartu"/"E-Wallet", untuk mata member) dan `grup` ("kartu"/"wallet",
  untuk perbandingan di kode). Sengaja dipisah supaya logika tidak
  bergantung pada teks yang sewaktu-waktu diubah.
- **Bentuk field input ikut `grup`**: kartu fisik → `Nomor Kartu` 16 digit;
  e-wallet → `Nomor HP Tujuan` 10–13 digit dengan validasi prefix operator.
  Sudah diuji end-to-end lewat kartu sintetis: 12 digit ditolak, 16 digit
  diterima, dan kartu fisik terurut di atas e-wallet.
- **Katalog asli cuma 4 brand, SEMUANYA E-Wallet**: LinkAja (11), DANA (11),
  OVO (8), ShopeePay (5). Kartu fisik (Mandiri e-Money, Brizzi, TapCash,
  Flazz, JakCard) yang ada di data dummy **TIDAK ADA** di price-list ini —
  halaman menyusut dari 10 kartu penyedia jadi 4. Aliasnya TETAP disimpan di
  `brand-map.js` DAN `TAMPILAN`, jadi begitu muncul langsung tampil benar.
- **Tidak ada `#brandTabs` (Kartu/E-Wallet)** — dengan 0 produk kartu, tab
  "Kartu" akan berisi layar kosong. Label `sub` di tiap kartu penyedia sudah
  membedakannya, dan ≤10 brand muat tanpa scroll.

**`emoney` vs `emoney-pasca` TIDAK BISA tercampur** — sudah diverifikasi,
bukan diasumsikan. DUA lapis pemisah: (1) endpoint beda (`?jenis=prabayar`
vs `?jenis=pascabayar`); (2) respons pascabayar **tidak memakai nama
"E-Money" sama sekali** — seluruh 400 barisnya berkategori `"Pascabayar"`
dengan `brand: "E-MONEY"` (5 baris). Diuji dengan sengaja mencampur kedua
respons ke satu cache: **0 produk pascabayar lolos.**

**`tv` — MENU DIPENSIUNKAN, diganti "Gas Prabayar".** Price-list prabayar
Digiflazz punya kategori **"Gas"** (brand "Pertamina Gas", 5 nominal Pertagas
20rb–500rb) tapi TIDAK punya kategori TV. Keputusan produk: slot menu "TV"
di `ALL_SERVICES` diganti **"Gas Prabayar"** (`slug: gas-prabayar`, ikon
"flame"), rute `menu/svc:gas-prabayar` → `pages/gas-prabayar.html`.
`gas-prabayar.js` pola `listrik.js` (ID pelanggan → warning → grid token),
menyaring `DikaKategoriMap.cocokkan(kategori, brand, "prabayar") === "gas-prabayar"`
(slug baru, category `["gas"]`, jenis prabayar — TIDAK bentrok dengan slug
`gas` PASCABAYAR yang category-nya `["gas negara","pgn"]`).

**`pages/tv.html` & `scripts/tv.js` DIBIARKAN DI DISK** (tidak ditaut dari
menu/ROUTES/margin.html) kalau-kalau Digiflazz menambah kategori TV — slug
`tv` dihapus dari `kategori-map.js` MAP juga. 14 produk dummy TV lama sudah
lama dihapus. Kembalikan slug + entri `ALL_SERVICES`/`ROUTES` kalau TV muncul.

- **Halaman ini TIDAK di-hardcode "selalu kosong"** — ia benar-benar
  menembak `DikaApi` tiap dibuka, jadi begitu Digiflazz menambah produk TV,
  halamannya terisi sendiri tanpa satu baris kode pun diubah.
- **Menyaring lewat SLUG, bukan nama kategori.** Kategori lain memanggil
  `DikaApi.kategori(jenis, "<nama persis>")`; di sini itu rapuh karena kita
  belum tahu Digiflazz akan menamainya "TV", "Paket TV", atau "TV Prabayar".
  Jadi `tv.js` mengambil `DikaApi.katalog()` lalu menyaring dengan
  `DikaKategoriMap.cocokkan(kategori, brand, "prabayar") === "tv"` — ketiga
  penamaan itu sudah dikenali. Tanpa permintaan jaringan tambahan: cache
  5 menit yang sama.
- **`cocokkan()` dipanggil sekali per NAMA KATEGORI, bukan per baris.**
  Versi pertama memanggilnya per baris dan mencetak **405 peringatan** dalam
  satu kali buka halaman (satu per baris kategori tak dikenal), menenggelamkan
  peringatan lain yang perlu dibaca. Dengan memoisasi per nama kategori:
  **1 peringatan**. Kalau menambah penyaring serupa di tempat lain, ikuti
  pola ini.
- Halaman Margin menampilkan **"0 Produk"** untuk TV — angka sungguhan,
  bukan "—" (yang artinya "belum ada datanya sama sekali").

##### Subkategori dari field `tipe` RESMI Digiflazz (`tipe-map.js`)

Backend mengirim field **`tipe`** untuk setiap produk — kategorisasi RESMI
Digiflazz, string yang sama dengan tag di dashboard mereka ("Umum", "Bulk",
"Flash", "Mini", "Maxstream", "Freedom Internet", …). **Pulsa & Paket Data
memakai ini; perdana & sms-telpon MASIH memakai tebakan nama** lewat
`subkategori-map.js` (belum dipindah — lihat "Sisa pekerjaan" di bawah).

**Yang berubah BUKAN "sekarang ada pemetaan"** — dua pendekatan sama-sama
punya pemetaan. Yang berubah adalah MASUKANNYA:

| | Lama (`subkategori-map.js`) | Baru (`tipe-map.js`) |
|---|---|---|
| Masukan | `product_name`, teks bebas | `tipe`, kosakata TERTUTUP |
| Ukuran masukan | 2.494 nama produk | **186 string resmi** (Data) |
| Cara cocok | kata kunci `cocok:[...]` per operator | kunci tabel persis |
| Famili baru dari Digiflazz | tenggelam ke keranjang umum | **jadi tab sendiri + `console.warn`** |
| Tabel per operator | ya (SUBDEF × 7) | tidak — satu tabel bersama |

**`tipe` BUKAN langsung nama tab.** Ia satu tingkat LEBIH RINCI daripada
yang muat di bilah tab. Angka sungguhan kategori Data:

| Operator | Produk | Nilai `tipe` | Tab setelah rollup |
|---|---|---|---|
| Telkomsel | 1.068 | **77** | 19 |
| Indosat | 654 | 42 | 11 |
| Axis | 345 | 25 | 12 |
| Smartfren | 170 | 21 | 9 |
| XL | 169 | 22 | 11 |
| Tri | 117 | 20 | 12 |
| by.U | 109 | 10 | 7 |

77 tab bergulir di layar HP bukan pilihan, dan ekornya panjang sekali
("Musik" 1 produk, "FIFA World Cup" 1, "Games" 1). Karena itu **tab =
FAMILI**, dan `tipe` resmi dipetakan ke famili lewat tabel di `tipe-map.js`.

- **Nama tab memakai nama RESMI Digiflazz apa adanya** kalau tipe-nya cukup
  besar berdiri sendiri (Flash, Internet Sakti, Super Seru, Orbit, OMG!,
  Bronet, OWSEM, Xtra Combo, Hotrod, Happy, AlwaysOn, Connex Evo, Kaget,
  Jajan, Freedom Internet, Gift Data, Yellow, Bulk, Surprise Deal). Yang
  digabung hanya yang memang sekeluarga — 33 tipe aplikasi (Youtube,
  Facebook, Maxstream, Netflix, …) → **Paket Aplikasi**; semua tipe wilayah
  → **Zona Regional**.
- **`tipe` yang belum terdaftar TIDAK dibuang & TIDAK ditelan keranjang
  umum**: ia jadi tabnya sendiri memakai nama resminya + `console.warn`.
  Jadi famili baru dari Digiflazz langsung terlihat member DAN kita.
- **TIDAK ADA famili bernama "Lainnya"** (sudah diverifikasi di 13
  kombinasi operator × sub-brand di kedua halaman). Keranjang umumnya
  bernama **"Kuota Reguler"** dan isinya memang tipe `"Umum"` resmi.
  `opts.labelUmum` mengganti namanya per kategori — halaman Pulsa memakai
  **"Pulsa"**, karena "Kuota Reguler" janggal di sana.
- **Urutan tab = urutan array `FAMILI`**, jadi stabil (tidak berubah-ubah
  mengikuti jumlah produk). `zona` & `umum` sengaja paling bawah — kecuali
  `combo-data`, yang SENGAJA ditaruh SETELAH `umum`: famili itu cuma muncul
  di Pulsa, dan tab pertama adalah yang aktif secara default, jadi default
  yang benar di halaman pulsa adalah pulsa biasa, bukan bundel combo.
- **`opts.min`** menggabungkan famili beranggota < min ke keranjang umum.
  Paket Data memakai `MIN_FAMILI = 2` (hanya yang benar-benar tunggal); satu
  tab untuk satu kartu lebih banyak memakan ruang daripada menolong.
- **Produk tanpa `tipe`** (1 dari 2.632 di Data) tidak jatuh ke keranjang
  umum begitu saja: `dariNama()` mencari nama famili RESMI di dalam nama
  produknya lebih dulu — kosakata yang SAMA, jadi tidak ada daftar kata
  kunci kedua yang harus dirawat. Terverifikasi: "Indosat Freedom Internet
  7 GB 14 Hari" → **Freedom Internet**, bukan "Kuota Reguler".
- **`SUBDEF` + `WILAYAH` di `paket-data.js` SUDAH DIHAPUS** (file itu turun
  555 → 416 baris), begitu juga link `subkategori-map.js` di
  `paket-data.html`. `definisiUntuk()` (dulu memilih SUBDEF per sub-brand)
  juga hilang: **by.U punya nilai `tipe` sendiri** di price-list (Kaget,
  Jajan, Mbps, Viu, Vidio, …), jadi pemetaan yang sama menghasilkan tab yang
  benar tanpa cabang khusus.

**Kategori Pulsa: `tipe` nyaris tidak membedakan apa pun.** 6 dari 7
operator SELURUH produknya bertipe `"Umum"`; hanya Indosat punya tipe kedua
**`"Combo Data"`** (6 produk: "Indosat 20.000 + 1 GB" dst). Pemisahan itu
tetap berguna — daftar pulsa diurutkan HARGA, jadi tanpa tab "Indosat 20.000
+ 1 GB" (Rp26.525) duduk berjauhan dari "Indosat 20.000" biasa dan gampang
tertukar. Operator lain tetap tanpa tab (`produk-page.js` menyembunyikan
bilah tab kalau isinya < 2), jadi tampilannya persis seperti sebelumnya.

> **"Pulsa Transfer" TIDAK ADA di price-list ini** — 0 produk, baik di field
> `tipe` maupun di nama produk kategori Pulsa (satu-satunya yang mengandung
> "transfer" adalah tipe `"Data Transfer"` milik Tri, di kategori Data).
> Kalau nanti muncul, `tipe-map.js` menjadikannya tab sendiri memakai nama
> resminya — tidak perlu mengubah `pulsa.js`.

**`pulsa.html` sekarang punya `#prodTabs`.** Dulu tidak ada, dan itu bug
yang sempat terjadi saat pindah: `subFor()` mengembalikan 2 famili tapi
`produk-page.js` tidak punya elemen untuk merendernya, sehingga bilah tab
tidak muncul DAN grid jatuh ke famili pertama saja (6 kartu Combo Data,
32 kartu pulsa biasa tidak terlihat). **Halaman yang memakai `subFor` WAJIB
punya `#prodTabs` di dalam `#prodSec`.**

**Filter nominal Pulsa sekarang diurus `subFor()`, bukan fungsi terpisah.**
Begitu halaman punya tab, chip harus dihitung dari isi TAB YANG AKTIF —
bukan dari seluruh katalog operator. Menghitungnya di dua tempat membuat
keduanya bisa berbeda pendapat tanpa ketahuan, jadi `segarkanFilterUI()`
dihapus dan polanya menyalin `kategori-live.js`. Konsekuensi yang disengaja:
chip ikut digambar pada siklus render `produk-page.js` (debounce 120ms),
bukan seketika saat tombol ditekan.

- **TIDAK ada filter rentang nominal di halaman Paket Data** (keputusan
  produk): tab famili sudah cukup, dua baris chip bertumpuk membuat halaman
  terasa penuh. `UI.createFilterHarga()` tetap ada di produk-ui.js dan tetap
  dipakai halaman **Pulsa** — jangan ikut dihapus dari sana. Di Pulsa dua
  baris itu memang muncul, tapi HANYA di Indosat (satu-satunya yang bertab).

##### Perdana & SMS & Telpon — juga sudah memakai `tipe`

Keduanya sekarang lewat `kategori-live.js` dengan `tipe: true` (bukan lagi
`subdef`). 29 nilai `tipe` di masing-masing kategori, **semuanya terpetakan,
0 produk bertipe kosong**. Config-nya tinggal 3 baris:

```js
tipe: true,                 // tab dari field `tipe` resmi
labelUmum: "Perdana Umum",  // nama keranjang tipe "Umum" untuk kategori ini
minFamili: 0,               // TANPA penggabungan famili kecil
```

- **`minFamili: 0` (beda dari Paket Data yang memakai 2).** Katalog kedua
  kategori ini kecil, dan melebur famili beranggota satu justru menyesatkan:
  by.U di SMS & Telpon cuma punya 2 famili dan salah satunya berisi 1 produk
  — meleburnya akan menampilkan produk "Sesama Operator" di bawah label
  "Paket Reguler".
- **`labelUmum`**: "Perdana Umum" & "Paket Reguler". "Kuota Reguler" (default
  bersama) salah konteks di sini — yang dijual kartu perdana dan menit/SMS,
  bukan kuota data.

**TEMUAN: nilai `SP…` di Perdana BUKAN famili produk.** SP3K, SP5K SP7K,
SP7K, SP9K SP10K, SP10K adalah **tingkat harga KARTU PERDANA**-nya ("SP" =
starter pack), dan nilainya ikut tercetak di nama produk:

```
Aktivasi Perdana Axis 3 GB 60 Hari (SP5K SP7K)
```

Kelimanya SENGAJA **tidak** digabung jadi satu tab "Starter Pack" — justru
MEMBEDAKANNYA yang penting: member harus memilih aktivasi yang cocok dengan
kartu fisik yang dia pegang, salah tingkat = aktivasinya gagal. Ini kebalikan
dari "Paket Aplikasi" di Paket Data, di mana 33 tipe memang sekeluarga.
**Patokannya bukan "berapa banyak tab", tapi "apakah membedakannya berguna".**

**3 produk yang dulu menggantung sudah terjawab.** "Telkomsel Telepon
50.000 / 80.000 / 130.000" dulu ditandai untuk dinamai manual karena tidak
punya kata pembeda. Field `tipe` resminya ternyata **`"Umum"`** — Digiflazz
sendiri menaruhnya di keranjang umum, jadi tidak perlu subkategori baru.

**Sub-brand by.U di dua kategori ini TIDAK punya famili sendiri**, beda dari
Paket Data (Kaget/Jajan/Mbps): Perdana by.U 1 produk bertipe "Umum";
SMS & Telpon by.U 5 produk bertipe "Semua Operator" (4) & "Sesama Operator"
(1). Pemilih jenis kartu tetap dipasang — produk by.U tidak berlaku di kartu
Telkomsel biasa berapa pun jumlahnya.

**Jebakan pencocokan kata yang ikut lenyap**: definisi lama sms-telpon tidak
boleh memuat kata "telepon"/"nelpon" di keranjang umum, karena keduanya (7 &
6 huruf) MENGALAHKAN "sesama" (6) pada nama seperti "Telepon 100 All + 30
Sesama" dan menyedot puluhan produk nelpon-sesama ke keranjang umum. Dengan
`tipe` resmi jebakan itu hilang total — produk itu bertipe "Sesama Operator",
titik.

**`subkategori-map.js` sekarang tidak dipakai halaman mana pun**, tapi TETAP
ADA sebagai jalur cadangan di `kategori-live.js` (cabang `config.subdef`)
untuk kategori berikutnya yang mungkin belum punya `tipe` yang berguna.

##### Status `gangguan` dengan data backend

Perilaku kartu redup + badge "Gangguan" + klik dicegat (produk-ui.js) TIDAK
berubah dan sudah diverifikasi masih hidup setelah semua restrukturisasi.
Yang berubah: nilainya tidak lagi ditulis tangan di file kategori, tapi
diturunkan dari baris backend lewat **`DikaProduk.statusGangguan(row)`**
(produk-schema.js) yang menerima DUA bentuk — `gangguan` sudah jadi, atau
`buyer_product_status` + `seller_product_status` mentah (gangguan bila salah
satunya tidak aktif). `pulsa.js` & `paket-data.js` meneruskannya (bersama
`deskripsi`) HANYA kalau backend mengirimnya, jadi record tetap identik
selama field itu belum ada.

**SUDAH AKTIF DENGAN DATA ASLI.** `api-produk.php` kini mengirim
`gangguan: true/false` per produk (dan tidak lagi menyaring produk gangguan
dari respons — total prabayar naik 7.966 → 8.341, +375 = persis jumlah
produk gangguan). Terverifikasi di halaman: Pulsa 3 produk gangguan
(Telkomsel 125rb & 175rb, Indosat 115rb) dan Paket Data 138 (Indosat 43,
Axis 35, Telkomsel 20, by.U 15, Tri 9, Smartfren 9, XL 7) tampil redup +
badge "Gangguan" + `aria-disabled`, dan kliknya membuka modal penjelasan,
bukan alur beli.

**Saat dua SKU punya NAMA sama, `lebihBaik()` di pulsa.js/paket-data.js
memenangkan yang TIDAK gangguan lebih dulu, baru harga termurah.** Tanpa itu,
kartu yang bisa dibeli bisa tertutup kembarannya yang sedang bermasalah hanya
karena kebetulan lebih murah. Di price-list hari ini belum ada bentrok nama
yang campur sehat+gangguan — tapi itu kebetulan data, bukan jaminan.

#### Data dummy per halaman

- **`pulsa.js` — TIDAK LAGI DUMMY.** Sekarang mengambil kategori "Pulsa" dari
  backend lewat `DikaApi` (lihat section di atas): ±519 produk diterima, **518
  terpakai** (1 duplikat nominal digabung, diambil yang termurah) di 6
  operator — Telkomsel 270 + **by.U 102** (dua sub-brand di balik satu blok
  prefix, dipisah lewat pemilih), Smartfren 42, Indosat 37, Tri 29, Axis 18,
  XL 17. `DENOMS`/`PRICES` tulis-tangan yang lama sudah dihapus.
- **`paket-data.js` — TIDAK LAGI DUMMY.** Mengambil kategori **`"Data"`** (nama aslinya di price-list, bukan "Paket Data") lewat `DikaApi`: 2.632 produk diterima, **2.631 terpakai** (1 duplikat digabung) di 6 operator — Telkomsel 1.068 + **by.U 109**, Indosat 654, Axis 345, XL 169, Smartfren 169, Tri 117 (jumlahnya naik dari angka sebelumnya karena backend tidak lagi menyaring produk gangguan dari respons). `PACKAGES` berisi produk tulis-tangan sudah dihapus; yang tersisa `SUBDEF` (id + label + `cocok`) saja, produknya diisi runtime oleh `subkategori-map.js`. Famili produknya tetap BEDA per operator, dan `SUBDEF`-nya disusun dari nama produk ASLI sehingga **100% produk punya famili bernama** (tidak ada tab "Lainnya") — lihat "Subkategori Paket Data" di atas.
- **Tipe A lain — SEMUANYA TIDAK LAGI DUMMY**, ketiganya lewat `kategori-live.js`.
  `perdana` & `sms-telpon` memakai `tipe: true` (field `tipe` resmi);
  `masa-aktif` tanpa subkategori sama sekali:
  - **`masa-aktif.js`** — kategori `"Masa Aktif"`, 27 produk (2 gangguan) di 5 operator: Telkomsel 9, Indosat 7, Tri 5, Axis 4, XL 2. **Tanpa subkategori** (pola Pulsa) dan **tanpa filter harga** (maksimal 9 produk per operator, jauh di bawah ambang 20). Digiflazz TIDAK punya produk Masa Aktif untuk **Smartfren maupun by.U** — nomor Smartfren karena itu menampilkan kartu "belum ada produk"; itu kenyataan katalog, bukan kesalahan halaman.
  - **`perdana.js`** — kategori `"Aktivasi Perdana"`, 135 produk (3 gangguan) di 6 operator, **by.U hanya 1 produk**. Tab dari field `tipe` resmi (29 nilai, 0 sisa): Tri 2 tab, Indosat 2, Smartfren 3, XL 5, Axis 7, Telkomsel & by.U 1 (tab disembunyikan). Lihat catatan **`SP…` bukan famili** di atas.
  - **`sms-telpon.js`** — kategori `"Paket SMS & Telpon"`, 282 produk (7 gangguan) di 5 operator (**Smartfren tidak punya produk sama sekali** — kartu "belum ada produk", bukan bug), **by.U 5 produk**. Tab dari field `tipe` resmi (29 nilai, 0 sisa) — Telkomsel 12 tab: Nelpon Semua Operator 38, Zona Regional 72, Nelpon Sakti 23, Paket Reguler 19, Nelpon Sesama 15, Talkmania 10, Telepon Pas 6, KringKring 6, SMS 6, MyTelkomsel Gift 4, Roaming & Haji 3, Penawaran Spesial 3.
- **Tipe B** (6 halaman): `PROVIDERS` = 41 brand. Item per brand boleh beda jumlah (mis. Disney+ 2 paket, Netflix 4) — itu disengaja.
  - **`emoney.js` — TIDAK LAGI DUMMY.** Kategori `"E-Money"` prabayar, 35 produk, 4 brand (semuanya E-Wallet hari ini). `accountFields` memilih bentuk field dari `brand.grup`: kartu fisik → Nomor Kartu 16 digit, e-wallet → Nomor HP 10–13 digit. Lihat "E-Money & TV" di atas.
  - **`voucher.js` — TIDAK LAGI DUMMY.** Kategori `"Voucher"`, 1.102 produk di **43 brand** (78% operator, 22% merchant). Tab grup DIHAPUS, diganti kotak pencarian; 32 tab famili dari field `tipe` resmi. Lihat "Voucher — isinya CAMPURAN" di atas.
  - **`games.js` — TIDAK LAGI DUMMY.** Kategori `"Games"`, 2.235 produk (1 duplikat digabung) di **107 game**. Tab genre DIHAPUS, diganti kotak pencarian nama (`config.cari`). `accountFields` → User ID selalu; Zone/Server ID hanya untuk 2 game yang kebutuhannya sudah diketahui (ML & Genshin). Lihat "Games — pencarian nama" di atas.
  - **`voucher-act.js` — TIDAK LAGI DUMMY.** Kategori `"Aktivasi Voucher"`, 1.333 produk (1 duplikat digabung) di **7 operator** — termasuk AXIS & by.U yang aliasnya belum terdaftar sebelumnya. 25 tab dari field `tipe` resmi. Tanpa tab brand, tanpa pemilih sub-brand. Lihat "Aktivasi Voucher" di atas.
  - **`streaming.js` — TIDAK LAGI DUMMY** (pilot Tipe B). Kategori `"Streaming"`, 24 produk. Katalog ASLI cuma punya **DUA brand**: Vidio (12) & WeTV (12) — **Netflix, Spotify, Disney+ Hotstar & Viu TIDAK ADA** di price-list ini, jadi halamannya menyusut dari 6 kartu layanan jadi 2. Aliasnya TETAP disimpan di `brand-map.js`: begitu Digiflazz menambahkannya, produknya mendarat sendiri. Subkategori dari `tipe`: WeTV "Reguler" (9 koin) vs "Membership" (3 langganan VIP) — pemisahan yang berguna karena harganya berselang-seling kalau dicampur ("WeTV VIP 1 Bulan" Rp41.559 duduk di antara "299 Coins" Rp41.445 dan "699 Coins"); Vidio satu famili → bilah tab disembunyikan. Tabel `TAMPILAN` (warna + inisial brand) tetap ditulis tangan — price-list tidak punya konsep itu.
  - **`tv.js` — TIDAK LAGI DUMMY, dan memang KOSONG.** Kategorinya belum ada di Digiflazz; halaman menampilkan "Segera hadir" lewat `createStatus().kosong()` tapi tetap menembak API sungguhan. 14 produk dummy dihapus total. Lihat "E-Money & TV" di atas.
- **Tipe C** (10 halaman): tanpa katalog harga — hanya `idField.min/max`, produk (`produk`/`produkList`/`produkByOperator`) berisi `admin_fee`, dan `rows(ctx)`. Admin Rp2.500 (PBB Rp5.000; biller di `produkList` Rp2.000–Rp3.500). Nominal Rp1.000–Rp10.000.000. Tiga di antaranya (`internet-pasca`, `tv-pasca`, `multifinance`) memakai `produkList` untuk pilih provider; `hp-pasca` menambah `detect` untuk deteksi operator.
- **Pemisah ribuan di DATA harus ditulis manual** (`1.000`), JANGAN dari `toLocaleString` saat generate — Node di device ini small-ICU dan akan menulis koma ke dalam file. `toLocaleString("id-ID")` hanya aman dipakai saat **runtime** di WebView.
- **`listrik.js` — TIDAK LAGI DUMMY.** Mengambil kategori **`"PLN"`** (nama aslinya di price-list — BUKAN "Listrik" seperti slug halaman kita; `kategori-map.js` sendiri sudah benar, slugnya memuat alias `"pln"`) lewat `DikaApi`: **10 nominal token** (5rb–1jt), 0 gangguan, tidak ada duplikat. Array `PRODUK` tulis-tangan sudah dihapus.
  - **TIDAK lewat `kategori-live.js`**, karena halaman ini tidak punya operator untuk dideteksi (nomor meter, bukan nomor HP) dan berdiri di atas `produk-ui.js` langsung. Ia merangkai fetch-nya sendiri memakai modul yang sama: `DikaApi` untuk mengambil, `UI.createStatus` untuk skeleton/gagal/kosong, `DikaProduk.statusGangguan` untuk badge, dan `lebihBaik()` (sehat menang dulu, baru termurah) untuk dedupe nama kembar.
  - **Key grid sekarang `"token|" + PRODUK.length`, bukan `"token"` saja.** Daftar nominalnya memang tidak bergantung pada nomor meter (itu tetap benar), tapi dengan key yang benar-benar tetap `createGrid` akan MELEWATI render saat data backend akhirnya datang — gridnya tidak pernah terisi. Panjang katalog dipakai sebagai penanda "isinya sudah berubah" tanpa membawa nomor meter ke dalam key.
  - `window.DikaListrik` (`ringkasan()`/`status()`/`produk()`/`muatUlang()`) dibuka untuk pengujian & diagnosa, pola yang sama dengan kategori live lain.
  - **Alur SEKARANG (CEK NAMA PELANGGAN ASLI)**: nomor meter ≥ **8 digit** → tombol **"Cek Nama Pelanggan"** (`#cekBtn`) → `DikaApi.inquiryPln(meter)` (GET `digiflazz.php?action=inquiry-pln&customer_no=<meter>` lewat backend proxy) → kartu **`#custCard`** menampilkan **Nama + ID Pelanggan + Tarif/Daya asli** → baru grid nominal token muncul.
    - **FAIL-OPEN**: kalau inquiry gagal (rc ≠ "00" / jaringan), pesan ramah dari `DikaRC.pesan(rc)` tampil di `#cekErr` **TAPI grid tetap dibuka**. Token PLN masuk ke nomor meter apa adanya (tidak "salah kirim ke nama"), jadi memblokir total malah menahan transaksi sah hanya karena layanan cek sedang bermasalah.
    - **`resetResult()`** dipanggil tiap nomor meter berubah — WAJIB, tanpa itu member bisa beli token nomor B sambil melihat nama pelanggan nomor A. `state.cekDone` gerbang grid: nominal HANYA tampil setelah cek ditekan.
    - Data pelanggan **TIDAK di-cache** (selalu diminta ulang tiap tombol ditekan); katalog nominal tetap cache 5 menit.
    - **TODO**: rc "45" (IP hosting belum di-whitelist Digiflazz) masih mungkin muncul — itu urusan konfigurasi backend/Digiflazz, bukan front-end. Frontend sudah menanganinya sebagai `gagal → fail-open`.
  - **Warning box** (`.warn`, judul "Periksa kembali nomor meter"): amber lembut + border-kiri gold + ikon segitiga. Muncul SETELAH cek (sukses maupun gagal). Teksnya sekarang: "Pastikan nomor meter & nama pelanggan di atas sudah sesuai sebelum membeli token" — klaim lama "DikaPay belum bisa cek nama otomatis" DIHAPUS (sudah tidak benar). Digerakkan `listrik.js` sendiri (bukan `UI.createWarn`).
  - **TIDAK ADA BIAYA ADMIN di token listrik — dan jangan ditambahkan lagi.** ATURAN BISNIS: seluruh produk **PRABAYAR** (termasuk token listrik) berharga tetap per nominal dan tidak punya biaya admin. Biaya admin **hanya milik PASCABAYAR**, nilainya dari field `admin` yang dikirim Digiflazz — bukan angka yang ditentukan DikaPay.
    Versi lama menyimpan `var ADMIN = 2500`, menulis `harga_modal` sebagai (nominal + 2.500), lalu memecahnya kembali di modal dengan `harga_modal - ADMIN`. Itu salah konsep sejak awal **DAN** akan menampilkan angka karangan begitu harga asli masuk: `price` Digiflazz sudah harga beli final dan marginnya bukan 2.500 tetap. `ADMIN`, baris "Admin" di modal, dan pengurangannya **sudah dihapus total**; modal konfirmasi sekarang 3 baris (Nomor Meter, Nominal Token, Total Bayar).
  - **Kartu nominal token cuma nama + harga akhir** ("PLN 20.000" / "Rp21.360" — `harga_modal` apa adanya dari backend). Field `"sub": "Admin Rp2.500"` yang dulu ada di ketujuh produk juga sudah dihapus.
  - Modal konfirmasi: **Nama Pelanggan** (kalau cek sukses) + Nomor Meter/ID Pelanggan + **Tarif/Daya** (kalau ada) + Nominal Token + Total Bayar. Tidak ada baris Admin (prabayar tanpa admin).
  - **Blok `INQUIRY (NONAKTIF)` di akhir `listrik.js` SUDAH DIHAPUS** — inquiry kini aktif dalam bentuk yang lebih bersih (`onCek`/`showCustomer`/`revealProduk`/`resetResult` inline di file, bukan lagi blok komentar). Markup `#cekBtn`/`#cekErr`/`#custCard` di `listrik.html` sekarang AKTIF (tidak dikomen). Gaya `.cek-btn`/`.cust*` di `produk.css` dipakai lagi.

**Backend inquiry:** `digiflazz.php?action=inquiry-pln` (GET, query string — POST body JSON DITOLAK backend). Response: `{ok:true, data:{status, rc, name, meter_no, subscriber_id, segment_power, ...}}`. `DikaApi.inquiryPln()` di `api.js` satu-satunya pintu; app TIDAK panggil Digiflazz langsung.

### Riwayat Transaksi (`riwayat.html`)

- Dibuka dari beranda: aksi cepat **Riwayat** (`ROUTES.history`) & tab **Transaksi** (`ROUTES["tab:transaction"]`) di `script.js`.
- **Header navy** (`.rhead`): **TANPA tombol back** (keputusan produk — member berpindah halaman hanya lewat bottom nav, bukan tombol back di header) + judul, search bar (`#searchInput`, filter by nama **atau** nominal) + tombol sort terbaru/terlama (`#sortBtn`, `.is-asc`). Tombol Back **fisik** Android tetap ditangani (lihat `pasangBackFisik()` di bawah), supaya menghapus tombol header tidak sampai membuat member terjebak atau ter-exit dari aplikasi.
- **Ringkasan bulanan** (`.summary`): total pengeluaran bulan berjalan, **dihitung otomatis** dari `TX` (status `ok`, `amount < 0`, bulan = `new Date()`). Count-up ease-out dipicu `IntersectionObserver` saat kartu terlihat → lalu shimmer sekali di nominal (`.summary__total.is-shimmer`) → hint fade-in (`.summary__hint.is-in`). Glow `summaryGlow` breathing infinite, panah `arrowNudge` infinite. **Klik kartu → `statistik.html`.**
- **Search bar**: placeholder typewriter looping (`SEARCH_HINTS`, state `tw`, cursor `|` blink) — `twStart`/`twStop`; berhenti saat input fokus/berisi, lanjut saat blur & kosong.
- **Filter chips** (`#filterChips`): Semua / Pulsa & Data / Tagihan / Transfer → map ke `FILTERS` (grup kategori); chip aktif gold dengan transisi warna.
- **List** dikelompokkan per bulan (`Agustus 2026`, …), urut terbaru. Tiap item `.tx` (satu `<button>`): kolom kiri `.tx__body` = nama 1 baris ellipsis (baris 1) + tanggal·jam (baris 2, terpisah), kolom kanan `.tx__right` **lebar tetap 96px** (`flex: 0 0 96px`) berisi nominal (merah `-` / hijau `+`) + badge status. Ikon bulat per **kategori** (`CATS` — warna + ikon inline SVG di `CAT_ICONS`).
- Data sumber: `TX` (20 transaksi, 4 bulan Jun–Sep) + `DETAILS` (acc/sku/admin/token, atau recipient/recipientId/note untuk transfer) — **dari `window.DATA` di `data.js`** (di-link sebelum `riwayat.js`), **bukan** deklarasi lokal. `riwayat.js` hanya menahan `CAT_ICONS`/`iconSvg`/`FILTERS`; `CATS`/`TX`/`DETAILS` adalah alias `DATA.*`. Empty state (`#emptyState`) bila hasil filter kosong.
- **Struk detail** (`#receipt` / `.rc`): tap item → panel geser-in dari kanan (`.rc.is-open`), bukan accordion. Dirender `renderReceipt(tx)` — 2 varian: **produk/PPOB** (Beli Lagi / Top Up Lagi) & **transfer** (Kirim Lagi + Bagikan Bukti). Isi: hero ikon kategori + waktu + ID disamarkan (`maskId`), badge status besar (`STATUS_BIG`), deskripsi (nomor tujuan disamarkan `maskAcc`), box "Total Bayar" + section collapsible pakai helper `accordion()` generik (`.acc` / `.acc.is-open`, chevron putar 180°). Back / hardware-back ditangani via `history.pushState` + `popstate` → `closeReceipt`.
- **Tombol Back fisik Android** (`pasangBackFisik()`, lewat `@capacitor/app` → `backButton`, sama plugin yang dipakai `auto-lock.js`): struk terbuka → tutup struknya saja (`closeReceipt()`, tidak pindah halaman); tidak ada yang terbuka → **selalu ke Beranda** (`../index.html`), apa pun jalur member masuk ke halaman ini. Ini SENGAJA dipasang secara eksplisit — begitu tombol back header dihapus, membiarkan back fisik jatuh ke perilaku bawaan Capacitor berisiko KELUAR APLIKASI kalau halaman ini kebetulan tidak punya riwayat WebView untuk dikembalikan.
- Animasi: item fade-in + slide-up staggered (`txIn`, delay `idx*50ms`), ikon kategori `iconPop`, tap `:active` scale + bg gelap.

### Statistik Pengeluaran (`statistik.html`)

- Dibuka dari kartu ringkasan di `riwayat.html`. `.app` slide-in dari kanan saat load (`pageIn`); back → `.is-leaving` slide-out lalu `history.back()`.
- **Data SINKRON dengan riwayat** (bukan dummy terpisah): `MONTHLY` **dihitung** dari `window.DATA.TX` (`data.js`) lewat `computeMonthly()` — kelompokkan `tx.cat` (pulsa/data→pulsa; listrik/plnpasca/pdam/bpjs→tagihan; transfer; game; top up diabaikan), hanya status `ok` & `amount < 0`. `CATS` lokal (4 kategori) & warna konsisten dengan ikon riwayat. Guard: jika tak ada data → init keluar tanpa crash.
- **Header**: back + judul + `<select id="monthSel">` (default bulan terakhir); ganti bulan → `render(idx)` ulang semua + `play()`.
- **Kartu ringkasan** (`.stat-card`): total count-up ease-out → shimmer (`.is-shimmer`) → badge perbandingan bln lalu (`.cmp--up/--down/--flat`, fade+scale via `.is-in`).
- **Bar chart** (`#barChart` → SVG di `#barPlot`): 1 bar per bulan (banyaknya mengikuti `MONTHLY`, bisa < 6), tumbuh `scaleY(0→1)` (`transform-box: fill-box; transform-origin: bottom`) staggered `i*100ms`; bar bulan terpilih gold, lainnya navy opacity rendah; tap bar → `.bar-tip`.
- **Donut** (`#donut` SVG): 4 `.seg` `<circle pathLength="100">`, digambar berurutan via transition `stroke-dasharray` + `transition-delay: i*0.5s`, `stroke-dashoffset` = -cumulative. Total di tengah count-up. Legend fade-in staggered (`.legend.is-in`).
- **Insight** (`#insight`): kalimat otomatis dari kategori terbesar + selisih vs bulan lalu; ikon bohlam; fade-in (`.insight.is-in`).
- Orkestrasi di `play()`; semua punya jalur `REDUCED_MOTION` (render langsung final).

### Tema (hanya TERANG)

- **Aplikasi hanya punya SATU tema: terang.** Fitur "Mode Tampilan" (terang/gelap/otomatis) sudah **DIHAPUS** — modul `theme.js`, atribut `data-theme`, blok token `:root[data-theme="dark"]`, baris menu + bottom sheet `#themeSheet` di Akun, dan kunci i18n `acc.pref.theme` semuanya sudah tidak ada. Jangan menambahkannya kembali tanpa keputusan produk baru.
- **Token semantik di `style.css`**: semua ada di `:root` dan bernilai tetap. Tetap **pakai token, jangan hardcode warna** — token masih berguna sebagai satu sumber warna walau temanya cuma satu.
- **Aturan**: Ikon/heading di atas card = `--fg-strong`. Bg card = `--surface`, area inset = `--surface-2`, kotak ikon/hover = `--tint`. `--navy-*`, `--gold-*`, `--white`, `--on-brand` = warna brand (teks di atas gold/putih-pill pakai `--on-brand`). Ikon kategori data-driven (riwayat/notif) pakai `${color}22` (translucent) bukan pastel tetap.
- Aturan `transition` warna 0.3s di `style.css` **tetap dipertahankan** — dulu dipakai untuk animasi ganti tema, sekarang masih dipakai perubahan state (`.row:active`, `.tx:active`, chip filter).

### i18n (`translations.js` — `window.I18N`)

- Kamus `TRANSLATIONS.id` / `.en`. Bahasa aktif di `sessionStorage["dikapay:lang"]` (+ cache `_dikaLang` bila sessionStorage tak tersedia) — **per sesi**, konsisten lintas navigasi, tidak permanen lintas tab.
- Markup: `data-i18n="key"` → `textContent`; `data-i18n-html="key"` → `innerHTML` (untuk `<br>`). `I18N.apply(root)` menerapkannya. Panggil `I18N.apply(document)` di awal `init()` tiap halaman.
- Teks dari JS: `I18N.t(key)` — di `script.js` lewat `svcLabel(id, fallback)` / `svcT(key, fallback)` (grid Layanan + sheet "Semua Layanan").
- **Cakupan saat ini** (sengaja bertahap): label bottom nav (4 halaman), Beranda (judul "Layanan" + grid Layanan), halaman Akun (semua judul section + label menu + sub + status + logout + label checklist Skor Keamanan `acc.score.item.*`). Sisanya biarkan Bahasa Indonesia.
- **Ganti bahasa**: menu Akun → **Bahasa** (`data-act="lang"`) → bottom sheet `#langSheet` (`.lang-opt` + `.lang-radio` gold + checkmark scale/fade). `pickLang(lang)` → set `I18N.lang` → `syncLangSheet()` (radio pindah smooth) → `I18N.apply(document)` (update live tanpa reload) → `fadeLangVal()` (nilai baris "Bahasa" `#langVal` fade ke "Indonesia"/"English") → auto-close ~400ms. Menambah bahasa baru: tambah entri di `TRANSLATIONS` + opsi di `#langSheet`.

### Ketahanan (guard / try-catch / debounce)

- **Kontrol yang sering diklik cepat** (chip filter riwayat, seg/stepper margin, sheet bahasa/tema akun, keypad PIN, bar statistik) dibungkus **try-catch** (log `console.error`, JANGAN kosongkan UI) + **debounce ~90–180ms** untuk render/animasi. Handler klik tidak boleh melempar error yang lolos.
- **Render daftar** (`renderList` riwayat, `render` statistik): guard data siap (`Array.isArray` + panjang), flag `renderBusy` anti-re-entrant, **bangun ke `DocumentFragment` dulu → tukar `innerHTML` sekali** (error di tengah proses = daftar lama tetap tampil).
- `tweenText` (margin) membatalkan rAF sebelumnya di elemen yang sama (`node._tw`). `fmtRupiah`/`clampVal` menolak `NaN`/`Infinity`. Pembagian persen dijaga `> 0`.
- `showFlow` (akun) menolak flow yang sudah terbuka (anti tap-ganda). PIN keypad `pin.locked` selama memproses 6 digit.
- Kalau nambah tombol yang bisa di-spam: bungkus try-catch + debounce, sesuai pola di atas.

### Animasi

- CSS transition/animation murni, tanpa library. Token easing: `--ease-out`. Utamakan animasi `transform`/`opacity`.
- Beranda: handler aksi lewat `handleAction(id)` di `script.js`. Rute yang sudah ada halaman terdaftar di `ROUTES`; sisanya `console.log`.
- Hormati `prefers-reduced-motion` — sudah ditangani di CSS (media query) dan JS (`REDUCED_MOTION`). Pertahankan saat menambah animasi baru.

## Kesiapan Integrasi Digiflazz

Struktur data & kode sudah disiapkan supaya penyambungan API asli **tidak butuh bongkar ulang**. Bagian ini merangkum apa yang sekarang dummy tapi sudah terstruktur, dan apa persisnya yang diganti saat integrasi.

> **Semua nilai di bawah masih DUMMY.** Repo ini belum pernah menyentuh API Digiflazz. Kode `rc`, daftar pesan, dan flag `gangguan` adalah PLACEHOLDER berdasarkan pola umum — **wajib dicocokkan ulang dengan dokumentasi & price-list asli pada sync pertama**, jangan dianggap sudah benar.

### Yang sudah dummy-tapi-terstruktur

| Hal | Bentuk sekarang | Di mana |
|---|---|---|
| Hasil transaksi | `res = { status, rc, sn, pesan, raw }` — satu bentuk untuk simulasi & API asli | `payment-flow.js` (`bentukHasil`) |
| Kode alasan → pesan | Tabel `RC` berisi 7 kode contoh + pesan umum | `digiflazz-rc.js` |
| Jejak penyedia di riwayat | `detail.rc` & `detail.sn` sudah ikut ditulis (masih null/dummy) | `payment-flow.js` (`sukses`) |
| Tindak lanjut status pending | `checkStatusUpdate(ref, cb)` — kerangka, selalu melapor "masih pending" | `payment-flow.js` |
| Status ketersediaan produk | `gangguan: true` ditulis tangan di 5 file kategori (6 produk) | `produk-schema.js` + file kategori |
| SKU produk | `sku: ""` di semua record, field-nya sudah wajib ada | semua file kategori |

### Langkah konkret saat API asli tersambung

1. **`scripts/api.js` — SUDAH ADA** (dipakai kategori Pulsa; lihat "Katalog produk dari backend"). SATU-SATUNYA tempat `fetch`. App **tidak pernah** memanggil Digiflazz langsung; kredensial & tanda tangan MD5 hanya di backend.

2. **`payment-flow.js` → `setPenentuHasil(fn)`** — ini **satu-satunya titik yang menentukan hasil**, dan sudah disiapkan sebagai *seam* yang bisa diganti dari luar:
   ```js
   DikaPayment.setPenentuHasil(function (o) {
     return api.postTransaksi(o).then(function (d) {
       return DikaPayment.bentukHasil(mapStatus(d.status), d.rc, { sn: d.sn, raw: d });
     });
   });
   ```
   **Boleh sinkron atau mengembalikan Promise** — `mulaiProses` menangani keduanya, termasuk kalau Promise-nya ditolak (jatuh ke hasil `gagal`, tidak menggantung). `sukses`, `tampilkanHasil`, dan `checkStatusUpdate` semuanya bekerja di atas bentuk `res`, jadi **tidak ada yang perlu diubah di luar fungsi pengganti itu**. Hapus `OUTCOME`, `RC_DUMMY`, dan `mintaHasilDummy` saat itu.

   > Alur memanggil lewat variabel `penentuHasil`, **bukan** langsung ke fungsinya. Ini disengaja: kalau dipanggil langsung, mengganti `DikaPayment.mintaHasil` dari luar tidak berefek apa pun (closure tetap memegang fungsi lama) — dan janji "cukup ganti satu fungsi" jadi tidak benar. Jangan ubah jadi panggilan langsung.

3. **`digiflazz-rc.js` → tabel `RC`** — ganti seluruh isinya dengan daftar RESMI "Alasan Gagal" Digiflazz. Kode yang belum dipetakan **tidak dibuang diam-diam**: `entri()` mengembalikan `null` + `console.warn` supaya kode baru ketahuan. Nada pesan tetap gaya DikaPay (menenangkan, menjawab "saldo saya terpotong tidak?" lebih dulu) — **jangan menyalin kalimat teknis Digiflazz apa adanya**, itu ditulis untuk mitra, bukan member.

4. **Status PENDING → CALLBACK, bukan polling.** Digiflazz mengirim webhook ke backend saat status berubah. Yang benar: backend menerima webhook → perbarui database → app diberi tahu lewat push/realtime (pola yang sama sudah direncanakan di `notif-store.js`), atau app memuat ulang riwayat saat dibuka. `checkStatusUpdate()` diganti pemasangan listener itu — **bukan `setInterval` yang menembak API terus-menerus**, karena memboroskan kuota permintaan dan tetap kalah cepat dari webhook. Kerangka sekarang sengaja hanya satu pemeriksaan tertunda, supaya tidak ada kebiasaan polling yang terbawa ke produksi.

5. **`gangguan` → dari endpoint Cek Harga.** Backend menurunkannya dari `buyer_product_status` & `seller_product_status` (gangguan bila salah satunya tidak aktif). **Semua `gangguan: true` tulis-tangan di file kategori HARUS dihapus** saat itu — kalau tidak, produk yang sehat akan terus tampil redup. Statusnya juga perlu di-refresh berkala karena bisa berubah kapan saja.

6. **`sn` untuk token listrik.** Nomor token 20 digit yang sekarang dummy di `listrik.js` diganti `sn` asli dari respons — slotnya sudah ada di `detail.sn`.

7. **Harga & katalog** — `harga_modal` dan daftar subkategori berhenti ditulis tangan, diisi hasil sync price-list. Peta prefix operator (`operator-detect.js`) **boleh tetap di front-end** (bukan rahasia), tapi **harga & data pelanggan wajib dari backend**.

8. **Guard sesi wajib fail-closed** di fase itu (lihat "Sesi / Auth") — sekarang sengaja fail-open supaya tidak ada lockout saat auth masih dummy.

### Lapisan pemetaan sync — `brand-map.js` & `subkategori-map.js`

`kategori-map.js` menjawab "produk ini masuk HALAMAN mana". Dua file berikut menjawab pertanyaan sesudahnya, dan **keduanya lapisan SYNC — sengaja TIDAK di-link ke halaman mana pun** (halaman membaca hasilnya sebagai data biasa):

| File | Menjawab | API |
|---|---|---|
| `brand-map.js` | "di halaman itu, masuk OPERATOR / PROVIDER mana" | `operator(brand, namaProduk?)`, `provider(slug, brand)`, `jenisEmoney(brand)` |
| `subkategori-map.js` | "di dalam operator/provider itu, masuk SUBKATEGORI mana" | `cocokkan(daftarSub, nama)`, `kelompokkan(daftarSub, produk)` |

Ketiganya memakai **aturan pencocokan yang sama**: case-insensitive, **kata kunci TERPANJANG menang**, dan dicocokkan sebagai **KATA UTUH** (bukan `indexOf` telanjang — "uc" muncul di dalam "unlimited", "3" di dalam "3GB"). Yang tidak cocok **dilaporkan lewat `console.warn`, tidak dibuang diam-diam** — pola yang sama seperti slug `"lainnya"`.

**Kasus khusus yang sudah ditangani di `brand-map.js`:**
- **`"TRI"` (Digiflazz) → `"three"` (opKey app)** — tidak ada satu huruf pun yang sama, jadi mustahil dicocokkan otomatis tanpa tabel ini.
- **Alias yang MURNI ANGKA (mis. `"3"` untuk Tri) hanya berlaku untuk `brand`, tidak untuk jalur cadangan `namaProduk`.** Ini bukan kehati-hatian teoretis — ketahuan pada sync sungguhan pertama: `"by.U 3.000"` (ternormalisasi jadi `"by u 3 000"`) membuat pulsa by.U 3 ribu mendarat di daftar produk **Tri**, operator yang sama sekali berbeda. Di nama produk, angka hampir selalu nominal/kuota, bukan identitas brand. Berlaku juga di `provider()` (`voucher-act` juga punya alias `"3"`).
- **AXIS vs XL** — Digiflazz kadang menaruh produk Axis di bawah brand `"XL"`. App SENGAJA memisahkannya (Axis punya blok prefix sendiri). Karena brand saja tidak cukup, `operator()` menerima `namaProduk` sebagai pemutus: brand XL + nama produk menyebut "AXIS" → `axis`.
- **E-Money Kartu vs E-Wallet** — Digiflazz mengirim satu kategori `"E-Money"` untuk keduanya; tabel `EMONEY` memisahkannya per brand, mengembalikan string yang sama persis dengan field `sub` di `emoney.js`.

**Subkategori (`cocok`)** — tiap subkategori di 6 file data (`paket-data`, `perdana`, `sms-telpon`, `games`, `voucher`, `voucher-act`) sekarang punya field `cocok: ["flash"]` berisi kata kunci penanda. Ini yang membuat produk hasil sync bisa menemukan tab-nya sendiri, karena **price-list Digiflazz tidak punya field famili produk sama sekali** — di dalam satu kategori, `category` DAN `brand` identik untuk semua subkategori, dan satu-satunya penanda famili ada di dalam `product_name`.

`kelompokkan()` menambahkan keranjang **"Lainnya"** OTOMATIS dan **hanya kalau ada produk yang tidak cocok**, lalu membuang subkategori yang kosong. Sengaja tidak ditulis sebagai entri kosong di file data: `paket-data` punya 6 operator dan `voucher` 10 merchant, jadi itu berarti ~30 keranjang kosong permanen dan tab yang tidak pernah berisi apa-apa.

> Alias & kata kunci di kedua file adalah **EKSPEKTASI penulisan Digiflazz, bukan fakta** — wajib dicocokkan ulang pada sync pertama. `kelompokkan()` melaporkan berapa produk yang jatuh ke "Lainnya" supaya kata kunci yang meleset langsung ketahuan.

### ref_id / idtrx WAJIB unik lintas member

Digiflazz mensyaratkan `ref_id` unik untuk **setiap** request (inquiry maupun pembayaran). **JANGAN membuatnya dari angka urut sederhana.** Dua member yang bertransaksi di detik yang sama bisa mendapat id yang sama, dan akibatnya bukan sekadar error: transaksi salah satunya ditolak, atau lebih buruk, tertukar.

Bentuk yang wajib dipakai saat implementasi nanti:

```
ref_id = <timestamp presisi tinggi> + <id unik member> + <random string>
```

Ketiganya, bukan salah satu. Timestamp saja bentrok saat bersamaan; id member saja bentrok saat satu member menekan dua kali; random saja tidak bisa dilacak. `inquiry-dummy.js` sudah menyertakan slot `refId` di hasilnya supaya bentuk datanya lengkap, **tapi nilai dummy di sana TIDAK memenuhi aturan ini** dan tidak boleh dibawa ke produksi.

### Price-list API dan Transaction API adalah DUA endpoint terpisah

Sync katalog (price-list) dan transaksi member (transaction, termasuk inquiry cek tagihan untuk 16 kategori pascabayar) **tidak saling memblokir maupun menunggu** — berapa pun banyaknya kategori yang diakses bersamaan. Dua aturan wajib dari dokumentasi Digiflazz:

1. **JANGAN memanggil price-list API tiap kali member membuka halaman produk** — ada limitasi dari Digiflazz. Yang benar: **sync berkala ke database DikaPay sendiri** (mis. tiap beberapa menit), dan produk yang ditampilkan ke member **selalu dari database DikaPay**, bukan real-time ke Digiflazz.
2. **`POST /v1/transaction` WAJIB menyertakan `max_price`** — batas harga sesuai yang ditampilkan ke member saat itu. Kalau harga asli di Digiflazz sudah naik sejak sync terakhir, transaksi **ditolak oleh Digiflazz** alih-alih diproses diam-diam dengan selisih yang merugikan DikaPay. Nilainya diambil dari `harga_modal` yang sedang tampil di layar, bukan dari harga terbaru.

### DUA jenis inquiry — jangan tertukar (KEDUANYA SUDAH LIVE)

| | PRABAYAR: `inquiry-pln` | PASCABAYAR: `inq-pasca` |
|---|---|---|
| Kategori | Token Listrik / PLN Prabayar (`listrik`) | 16 kategori pascabayar |
| Yang dicek | **NAMA pelanggan** dari nomor meter | **NOMINAL TAGIHAN + nama pelanggan** |
| Endpoint | `GET digiflazz.php?action=inquiry-pln&customer_no=X` (query string) | `POST inquiry-pasca.php` body JSON `{buyer_sku_code, customer_no}` |
| Pintu app | `DikaApi.inquiryPln(X)` di `api.js` | `DikaApi.inquiryPasca(sku, X)` di `api.js` → `inquiry-pasca.js` → `DikaInquiry.cek()` |
| Pemakai | `listrik.js` (`#cekBtn` → `onCek`) | `manual-page.js` (`cekTagihan()`) di 16 halaman |
| Gagal (rc≠"00") | fail-OPEN: pesan + grid tetap dibuka | fail-CLOSED: pesan, tombol tetap "Cek Tagihan" |

- **`api-produk.php` kirim `Access-Control-Allow-Origin: *`** — GET (safelisted) lolos tanpa preflight. `inquiry-pasca.php` POST: **JANGAN set `Content-Type: application/json`** (memicu preflight OPTIONS tiap panggilan) — body string biasa (`text/plain` safelisted), backend baca `php://input`. Sudah diuji.
- **rc yang sudah dipetakan di `digiflazz-rc.js`**: "00" sukses, "45" (IP hosting belum di-whitelist Digiflazz — urusan backend), "05"/"54" (nomor salah). rc lain → pesan umum + `console.warn`.
- **Tidak semua biller pascabayar mendukung inquiry.** by.U dkk bernominal tetap mungkin balas rc gagal. Markup input nominal manual di 16 halaman **disembunyikan, bukan dihapus** — jalur cadangan kalau ada biller yang tidak support.
- **TODO fase 3**: `payment-flow.setPenentuHasil()` → `POST /v1/transaction` pakai `ref_id` + `max_price` dari hasil inquiry (`state.tagihan.refId`).

### Yang TIDAK perlu diubah saat integrasi

Alur & tampilan sudah netral terhadap sumber data: layar proses/berhasil/gagal/pending, popup saldo kurang, kartu gangguan, modal konfirmasi, dan pencatatan riwayat semuanya membaca `res` / field produk — bukan memanggil sumbernya langsung. Itu sebabnya `mintaHasil()` dibuat sebagai satu-satunya titik penentu hasil.

## Aturan Pengembangan

- **Vanilla saja.** Jangan tambahkan React/Vue/jQuery/bundler tanpa diminta. Tidak ada `npm run build`.
- **Semua `fetch` lewat `api.js`** — SUDAH BERLAKU, bukan rencana lagi. Komponen UI / file data kategori tidak memanggil jaringan langsung.
- **Jangan simpan rahasia di repo.** Tidak ada API key Digiflazz, tidak ada secret backend di kode front-end.
- **Sesi selalu lewat `DikaAuth`** (`auth.js`) — jangan baca/tulis flag sesi ke `localStorage` langsung dari halaman. Halaman baru wajib me-link `auth.js` sebagai script pertama di `<head>`; hanya `auth.html` yang dikecualikan dari guard.
- **Kompatibel Capacitor:** hindari dependensi pada path absolut server; gunakan path relatif untuk aset agar berfungsi saat di-bundle ke WebView. Fitur yang butuh plugin native (share, clipboard, push) rencanakan lewat plugin Capacitor nanti.
- **Bahasa UI:** Indonesia. Format mata uang Rupiah (`Rp` + pemisah ribuan).
- Uji dengan membuka `index.html` langsung di browser atau lewat static server (mis. `python3 -m http.server`).

## Build APK (Capacitor)

Capacitor sudah terpasang (`@capacitor/core`, `cli`, `android` v8) dan folder `android/` sudah ada.

### Perintah setiap kali mau build ulang — PAKAI YANG INI

```
npm run rebuild-apk        # build-www -> cap sync android -> verifikasi
```

Lalu di Android Studio: **Build > Clean Project** → **Build > Build APK(s)**, dan
sebelum APK-nya dikirim ke HP:

```
npm run verify             # WAJIB tertulis "SEMUA LAPIS SINKRON"
```

Kalau mau Gradle sekalian dijalankan tanpa membuka Android Studio:
`npm run rebuild-apk -- --apk` (butuh `JAVA_HOME`; JDK bawaan Android Studio ada
di `C:\Program Files\Android\Android Studio\jbr`).

> `npm run sync` & `npm run build` masih ada dan tidak salah, tapi **jangan
> memanggil `npx cap sync` sendirian** — itu persis cara bug di bawah terjadi.

### RANTAI 4 SALINAN — kenapa perubahan bisa "tidak muncul" di APK

Satu perubahan kode harus melewati **empat** salinan sebelum sampai ke HP, dan
**melewatkan satu langkah tidak menghasilkan error apa pun** — lapis berikutnya
menyalin kode lama dengan setia:

| # | Lapis | Diisi oleh |
|---|---|---|
| 1 | `index.html`, `pages/`, `scripts/`, `styles/`, `assets/` | **kamu** (sumber kebenaran) |
| 2 | `www/` | `node build-www.js` |
| 3 | `android/app/src/main/assets/public/` | `npx cap sync android` |
| 4 | `app-debug.apk` → `assets/public/` | Build APK (Gradle / Android Studio) |

**KEJADIAN NYATA (12 September 2026).** APK dibuild jam 08:18, HP di-uninstall lalu
install ulang, tapi fitur toggle margin tetap tidak muncul. Penyebabnya **hanya
langkah 1→2**: `node build-www.js` tidak pernah dijalankan setelah kodenya diedit,
jadi `www/` masih hasil build 9 September. Lapis 3 & 4 bekerja BENAR — mereka
menyalin persis apa yang ada di `www/`, yaitu kode lama. 14 file tertinggal
(`margin.js`, `margin-calc.js`, `pin-transaksi.js`, `api.js`, `transfer-member.*`,
dst) dan 2 file baru tidak pernah ikut sama sekali.

Yang **BUKAN** penyebabnya (sudah diperiksa satu per satu, jangan buang waktu ke sana lagi):

- **Cache Gradle / perlu Clean Project** — tidak. Aset yang berubah ikut ter-merge
  tanpa Clean; sudah dibuktikan dengan build ulang (`148 executed`) yang langsung
  membawa file baru. Clean Project tetap disarankan karena murah, bukan karena wajib.
- **`versionCode` harus dinaikkan** — tidak. `versionCode 1` hanya mengatur
  upgrade in-place; karena APK-nya di-uninstall dulu, install pasti berhasil. Kalau
  versionCode benar-benar jadi masalah, yang terjadi adalah **install DITOLAK**, bukan
  aplikasi terinstall tapi isinya lama. (Naikkan versionCode untuk distribusi ke
  orang lain — itu soal lain.)
- **WebView meng-cache aset lama** — tidak. Uninstall menghapus seluruh data app
  termasuk cache WebView, dan Capacitor menyajikan aset dari `assets/public` lewat
  asset loader, bukan dari HTTP cache.
- **`npx cap sync` tidak menyalin** — tidak. Lapis 3 terbukti identik byte-per-byte
  dengan `www/` (kecuali `cordova.js` & `cordova_plugins.js` yang memang disuntik
  Capacitor).

### `npm run verify` — memeriksa ISI, bukan menebak

`verify-build.js` membandingkan **hash isi file** di keempat lapis, dan untuk lapis
4 ia **membuka `app-debug.apk` sebagai arsip zip** lalu membaca `assets/public/` di
dalamnya (tanpa dependensi npm tambahan — tetap "vanilla saja"). Jadi pertanyaan
"APK ini benar-benar berisi kode terbaru atau tidak" dijawab dengan bukti, bukan
dengan timestamp.

> Ini melengkapi `peringatanSyncBasi()` di `build-www.js`, yang hanya membandingkan
> **nama file**. Bug 12 September lolos dari peringatan itu justru karena nama
> filenya ada di kedua sisi — yang beda cuma isinya.

### `www/` adalah HASIL BUILD — jangan pernah diedit

**Sumber kebenaran tetap file di root**: `index.html`, `pages/`, `scripts/`, `styles/`, `assets/`. Folder `www/` murni salinan, dan **seluruh isinya dihapus tiap kali `build-www.js` dijalankan** — apa pun yang disunting langsung di sana hilang tanpa peringatan pada build berikutnya.

**WAJIB jalankan `node build-www.js` SEBELUM `npx cap sync`.** Kalau dilewati, `cap sync` menyalin `www/` versi lama ke `android/`, dan APK-nya berisi kode basi — gejalanya membingungkan karena kode di root sudah benar tapi yang jalan di HP versi sebelumnya.

### Kenapa harus ada `www/`

Capacitor menolak `webDir` yang menunjuk ke root project. Kalau dipaksa, yang ikut ter-bundle ke APK bukan cuma web-nya tapi juga `node_modules/`, `android/`, dan dokumentasi. `capacitor.config.json` karena itu memakai `"webDir": "www"`.

### Isi `build-www.js`

- **Daftar putih, bukan daftar hitam.** Yang disalin hanya 5 entri di konstanta `SALIN` (`index.html`, `pages`, `scripts`, `styles`, `assets`). Konsekuensinya: **folder web baru di root TIDAK otomatis ikut** — harus ditambahkan ke `SALIN` secara sadar. Ini disengaja, supaya catatan pribadi / berkas rancangan / dump data yang kebetulan ada di root tidak diam-diam terkirim ke perangkat member.
- **Struktur di dalam `www/` identik dengan root**, jadi seluruh path relatif project tetap benar tanpa satu pun perubahan (`www/index.html` → `pages/x.html`; `www/pages/x.html` → `../scripts/y.js`). Lihat "Konvensi path lintas-folder".
- **Isi `www/` dikosongkan, foldernya sendiri tidak dihapus.** Di Windows, menghapus folder yang sedang dipegang proses lain (dev server ber-CWD di situ, File Explorer, editor) gagal `EPERM` dan membuat build berhenti di tengah dengan salinan basi. Menghapus anak-anaknya saja tetap berhasil. Kalau satu berkas benar-benar terkunci, script **berhenti dengan pesan jelas** — bukan melanjutkan dengan salinan setengah jadi.
- **`www/index.html` diperiksa setelah menyalin.** Tanpa file itu WebView membuka halaman kosong dan penyebabnya sangat sulit dilacak dari dalam APK, jadi lebih baik gagal keras di terminal.

### Plugin Capacitor yang sudah dipakai

| Plugin | Untuk |
|---|---|
| `@capacitor/app` | `appStateChange` → kunci otomatis 5 menit (`auto-lock.js`); `backButton` → arahkan Back fisik ke Beranda di halaman tanpa tombol back header (`riwayat.js`) |
| `@capacitor-community/contacts` | ambil nomor dari kontak (`input-helper.js`) |
| `@capacitor-mlkit/barcode-scanning` | scan QR/barcode nomor tujuan |

**Izin runtime WAJIB, manifest saja tidak cukup.** `READ_CONTACTS`, `CAMERA`, dan `RECORD_AUDIO` adalah *dangerous permission*: Android 6+ menolak aksesnya sampai member menyetujui dialog sistem. Ketiganya diminta **saat tombolnya ditekan**, bukan saat halaman dibuka — lihat `mintaIzin()` di `input-helper.js`. Inilah yang dulu hilang sehingga tombol kontak/scan/mikrofon tidak berfungsi sama sekali di APK meski kodenya ada.

Status `denied` di Android berarti **ditolak permanen** ("Jangan tanya lagi") — meminta ulang tidak akan memunculkan dialog apa pun, jadi member diarahkan ke Pengaturan aplikasi, bukan dibiarkan menekan tombol yang diam saja.

`input-helper.js` punya **dua jalur** yang dipilih otomatis lewat `Capacitor.isNativePlatform()`: plugin native di APK, API web (Contact Picker / BarcodeDetector / Web Speech) saat dibuka sebagai web biasa. Keduanya tetap fail-graceful — tombol yang jalurnya tidak tersedia tidak dipasang sama sekali.

### Izin runtime — jebakan yang sudah pernah menggigit

Tiga hal ini membuat fitur terlihat "sudah diizinkan tapi tetap mati". Semuanya pernah terjadi di project ini:

1. **Alias plugin bisa mencakup LEBIH DARI SATU izin.** `@capacitor-community/contacts` memakai satu alias `contacts` = `READ_CONTACTS` **+** `WRITE_CONTACTS`, dan Capacitor hanya menganggapnya granted kalau **semuanya** granted. Manifest yang cuma punya `READ_CONTACTS` membuat izin itu **mustahil** granted — meski member sudah mengaktifkannya di Pengaturan. Karena itu `WRITE_CONTACTS` ikut dideklarasikan walau app tidak pernah menulis kontak. **Cek deklarasi `@CapacitorPlugin` tiap plugin sebelum menambah izin**, jangan menebak dari nama fiturnya.
2. **Nama field status berbeda per plugin.** `PermissionStatus` memakai alias masing-masing: `contacts`, `camera`, `speechRecognition`, `location`/`coarseLocation`. Membacanya dengan tebakan berantai (`hasil.camera || hasil.contacts || …`) menghasilkan `undefined` begitu ada plugin baru → izin yang sudah ada dianggap belum ada. Lihat tabel `IZIN` di `input-helper.js`.
3. **`denied` TIDAK selalu berarti ditolak permanen.** Sebelum dialog pernah muncul sekali pun, sebagian perangkat sudah melaporkan `denied`. Kalau kode langsung menyerah di situ, izinnya **tidak pernah diminta**. Pola yang benar: tetap panggil `requestPermissions()` dulu, baru arahkan ke Pengaturan kalau hasilnya masih `denied`.

Dua jebakan Android lain yang sudah ditangani:

- **Web Speech API tidak ada di Android WebView.** `webkitSpeechRecognition` itu fitur browser Chrome, bukan WebView — jalur web mustahil dipakai di APK. Input suara memakai `@capacitor-community/speech-recognition`.
- **Android 11+ menyembunyikan aplikasi lain.** Tanpa blok `<queries>` untuk `android.speech.RecognitionService`, `SpeechRecognizer` tidak menemukan layanan pengenalan suara dan `available()` selalu `false` — mati tanpa pesan error.
- **`navigator.geolocation` di WebView butuh izin NATIVE lebih dulu.** Kalau app belum pernah meminta `ACCESS_FINE_LOCATION`, panggilannya langsung `PERMISSION_DENIED` — GPS HP menyala tidak menolong. Lokasi sekarang lewat `@capacitor/geolocation` (`runGeoNative` di `akun.js`), dengan `navigator.geolocation` hanya sebagai jalur web.

### Splash: native vs web — DUA hal berbeda

- **Splash native** (`AppTheme.NoActionBarLaunch`) muncul **sebelum satu baris JS pun berjalan**, jadi mustahil dibuat bergantung status login. Sengaja dibuat **warna polos** `@color/splashBackground` (bukan artwork) supaya tidak terbaca sebagai animasi pembuka. Tidak ada `@capacitor/splash-screen` terpasang → tidak ada penundaan buatan; layar itu hilang begitu WebView menggambar. **Jangan menambahkan `launchShowDuration`.**
- **Splash beranimasi** ada di `auth.html` dan **hanya untuk member yang belum login**. Member yang sudah login masuk lewat `index.html` yang memang tidak punya splash; kalaupun mendarat di `auth.html`, `auth-flow.js` mengalihkannya ke Beranda sebelum splash sempat tergambar.

### Fase berikutnya

Fitur lain yang butuh plugin native (share, clipboard, push notification) direncanakan lewat plugin Capacitor.
