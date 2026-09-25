/* ===========================================================================
   DikaPay — member-sync.js
   SINKRONISASI STATUS MEMBER (saldo + banned) dari server, LATAR BELAKANG.

     window.DikaMemberSync = {
       TOKEN_PREFIX                      // "dikapay:device_token:" (+ nomor digit)
       simpanToken(token, nomorDigits?)  // simpan/timpa device_token AKUN ITU
       getToken(nomorDigits?)            // string | ""  (default: akun aktif)
       hapusToken(nomorDigits?)          // hapus device_token AKUN ITU
       terapkanHasil({saldo?,status?,bannedSampai?})  // update saldo + cek banned
       cek()                             // -> Promise, silent/best-effort
       cekSaatBukaKunci(nomorDigits, pin) // dipanggil auto-lock.js pas PIN cocok,
                                          //   DAN auth-flow.js pas login lewat
                                          //   jalur cepat lokal (lihat "PER-AKUN")
     }

   ================= KENAPA ADA: BACKEND JADI SUMBER KEBENARAN =============
   Fase 1 murni lokal: saldo & status "banned" cuma hidup di localStorage
   perangkat ini, jadi owner tidak bisa menyesuaikan saldo/mem-banned member
   dari sisi server dan langsung terlihat di app tanpa member logout-login
   manual. Modul ini menutup celah itu — HANYA membaca (GET api-status.php),
   tidak pernah mengganti alur transaksi/PIN yang sudah ada.

   ============================ TITIK PEMANGGILAN ===========================
     a. App dibuka / kembali aktif dari background -> pasangCapacitor()/
        pasangWeb() di bawah memanggil cek().
     b. Beranda dimuat/ditampilkan -> init() memanggil cek() sekali saat
        skrip ini dieksekusi (dimuat di index.html seperti halaman lain).
     c. PIN layar kunci (auto-lock.js) baru saja cocok -> auto-lock.js
        memanggil cekSaatBukaKunci(nomor, pinYangDiketik) TEPAT SETELAH
        buka(), PIN sudah di tangan jadi tidak perlu diminta ulang.
     d. Selama app di foreground -> mulaiPolling() mengulang cek() tiap 60
        detik; berhentiPolling() dipanggil saat app ke background.

   ========================= TOKEN: DUA JALUR DAPATNYA ======================
   1) NORMAL: device_token sudah ada (didapat dari login/daftar biasa via
      auth-flow.js, atau dari jalur (2) di bawah) -> panggil api-status.php
      dengan Authorization: Bearer <token>.
   2) MEMBER LAMA belum pernah punya token -> HANYA di titik (c) di atas,
      panggil api-login.php dengan nomor+PIN yang BARU SAJA diketik untuk
      buka layar kunci (bukan minta ulang) — sekadar supaya dapat token
      pertama kalinya. Sesudah itu seterusnya lewat jalur (1).

   ========================= SEMUA PANGGILAN BEST-EFFORT =====================
   Gagal jaringan / timeout / server sedang bermasalah TIDAK PERNAH
   ditampilkan ke member dan TIDAK PERNAH memblokir apa pun — dicatat lewat
   console.warn/console.error lalu dilewati begitu saja, pola yang sama
   dengan `DikaPerangkat.catat()` di auth-flow.js. Backend membalas 401
   ("Sesi tidak valid") -> device_token dihapus (kedaluwarsa/dicabut), TAPI
   member TIDAK dipaksa logout untuk itu — dibiarkan, token baru akan
   didapat lagi lewat jalur (c) di kesempatan berikutnya.

   ====================== BANNED DARI SERVER vs BANNED LOKAL =================
   `status:"banned"` dari server SENGAJA tidak ditulis ke storage banned
   lokal mana pun (`dikapay:pintx:banned:*` milik pin-transaksi.js atau
   `dikapay:lock:banned:*` milik auto-lock.js) — itu dua sistem banned lokal
   dengan sumber kebenarannya sendiri (salah PIN 3x). Popup "Akun Kamu Telah
   Dibanned" DIPAKAI ULANG (DikaPinTransaksi.tampilkanBanned, teks diganti
   lewat opts.pesan — pola yang sama seperti auto-lock.js), tapi banned dari
   server murni memicu logout paksa saat itu juga, tanpa menyentuh storage
   banned lokal sama sekali.

   `banned_sampai` BOLEH null (admin memilih durasi "Permanen" di AdminPanel)
   -> paksaLogoutBanned() meneruskannya apa adanya sebagai `info.sampai: null`
   ke tampilkanBanned(), yang menampilkannya TANPA hitung mundur. JANGAN
   mengarang tanggal kedaluwarsa (dulu ada bug fallback "+1 menit" di sini —
   popup menjanjikan bisa coba lagi sebentar lagi padahal banned-nya permanen).

   ====================== TOKEN & SALDO HARUS PER-AKUN (BUG NYATA) ===========
   DITEMUKAN: device_token dulu disimpan di SATU kunci GLOBAL
   (`dikapay:device_token`, tanpa nomor HP) — perangkat tes yang dipakai
   BANYAK akun bergantian (login/logout berkali-kali dengan nomor berbeda)
   akhirnya membuat kunci itu menyimpan token akun MANA PUN yang terakhir
   kali menulisnya, bukan token akun yang SEDANG AKTIF di layar. Polling 60
   detik di sini (titik d) lalu memakai token akun lain itu tanpa curiga,
   menerima saldo akun lain, dan MENIMPA `dikapay:balance` yang sedang
   ditampilkan Beranda dengan saldo AKUN LAIN. Gejalanya persis seperti
   saldo "berubah sendiri" ke angka yang tidak masuk akal setelah transfer.

   Kejadian nyata yang membongkarnya: member "Dikzz_21" (saldo Rp5.000)
   transfer ke "foxxy" (saldo awal Rp5.000, backend BENAR: foxxy jadi
   Rp10.000). Beranda Dikzz_21 malah ikut menampilkan Rp10.000 — itu bukan
   saldo Dikzz_21 yang salah hitung, itu SALDO FOXXY yang nyasar tertimpa ke
   layar Dikzz_21, karena `dikapay:device_token` global masih menyimpan
   token foxxy dari sesi sebelumnya di perangkat yang sama.

   AKAR MASALAH SESUNGGUHNYA ada DUA lapis, dan keduanya harus diperbaiki
   BERSAMAAN (memperbaiki satu saja tidak cukup):

   1. `dikapay:device_token` GLOBAL (di sini) — token akun mana pun bisa
      menimpa punya akun lain. Sekarang di-NAMESPACE per nomor HP:
      `dikapay:device_token:<nomor_digit>` (lihat TOKEN_PREFIX). Setiap
      panggilan simpanToken/getToken/hapusToken WAJIB tahu nomor akun yang
      dimaksud — TIDAK BOLEH lagi ada satu token "aktif" yang dibagi semua
      akun.
   2. auth-flow.js — jalur "CEPAT LOKAL" (PIN cocok dengan cache lokal
      `dikapay:account:<nomor>`, tanpa ke jaringan) memanggil
      `activateSession()` tapi TIDAK PERNAH memanggil apa pun di modul ini,
      jadi device_token & saldo akun yang BARU aktif tidak pernah disegarkan
      — tetap membawa nilai akun SEBELUMNYA sampai polling berikutnya
      (kebetulan) memakai token yang salah. Diperbaiki dengan memanggil
      `cekSaatBukaKunci(nomor, pin)` di titik itu juga (pola yang SAMA
      dengan auto-lock.js di titik (c)) — PIN sudah di tangan, jadi
      penyegaran token/saldo akun yang baru aktif berjalan di latar
      belakang tanpa menahan proses login yang memang didesain instan.

   Pertahanan TAMBAHAN (jaga-jaga race saat berpindah akun PAS ada polling
   sedang di tengah jalan) ada di cek()/cekDenganToken(): nomor aktif
   DICATAT saat request MULAI, dan hasilnya HANYA diterapkan kalau nomor
   aktif itu MASIH SAMA saat respons datang — kalau member sempat logout/
   ganti akun di tengah permintaan, hasil basi itu dibuang, bukan diterapkan
   ke akun yang sekarang aktif.

   Pertahanan TAMBAHAN LAGI (jaga-jaga race dengan transfer/pembayaran yang
   kebetulan menulis saldo otoritatif HAMPIR BERSAMAAN dengan polling ini):
   setiap penulis saldo yang sah (transfer-member.js, payment-flow.js,
   script.js DikaDevSaldo.set, dan terapkanSaldo() di sini sendiri) menera
   `dikapay:balance:ts` dengan waktu tulisnya. terapkanSaldo() di sini
   menolak menimpa kalau `dikapay:balance:ts` SUDAH lebih baru daripada saat
   permintaan status ini MULAI dikirim — artinya ada penulis yang lebih
   otoritatif (mis. hasil transfer barusan) yang menang, bukan hasil polling
   yang kebetulan datang belakangan membawa data lebih basi.

   APAKAH BUG INI DIBAWA member-sync.js, ATAU SUDAH ADA SEBELUMNYA?
   `dikapay:balance` sendiri SUDAH global sejak Fase 1 (dummy, sebelum ada
   backend/device_token sama sekali) — itu bukan bikinan modul ini. TAPI
   `dikapay:device_token` adalah kunci BARU yang lahir BERSAMA modul ini
   (dan fitur login-backend di auth-flow.js) — dan sejak lahir SELALU
   global/tanpa-namespace, sejak commit pertama modul ini ada. Jadi
   member-sync.js tidak "merusak" desain per-akun yang tadinya benar — ia
   MEMPERKENALKAN mekanisme background-overwrite baru (polling aktif) di
   ATAS desain penyimpanan yang sudah cacat sejak awal (global, tak
   ter-namespace), dan kombinasi keduanya itulah yang membuat cache saldo
   yang sebelumnya cuma "basi tak terlihat" menjadi "salah dan terlihat
   nyata" tiap 60 detik. */

(function () {
  "use strict";

  /* GANTI dari kunci global "dikapay:device_token" (bug — lihat catatan
     "TOKEN & SALDO HARUS PER-AKUN" di atas) -> satu slot token PER NOMOR HP.
     Legacy global key TIDAK dimigrasikan: kita tidak bisa tahu dengan aman
     akun mana pemilik token lama itu, jadi lebih aman dibuang saja (biarkan
     `cekSaatBukaKunci`/login berikutnya mendapat token baru per akun). */
  var TOKEN_PREFIX = "dikapay:device_token:";
  var TOKEN_KEY_LEGACY = "dikapay:device_token";
  var BALANCE_KEY = "dikapay:balance";
  var BALANCE_TS_KEY = "dikapay:balance:ts";
  var POLL_MS = 60000; /* 60 detik, selama app di foreground */

  var pollTimer = 0;
  var sedangCek = false; /* cegah dua cek() tumpang tindih (mis. resume + interval bersamaan) */
  var legacyDibersihkan = false;

  /* Nomor member yang sedang aktif di perangkat ini — salinan kecil pola
     yang sama dengan `nomorAktif()` di pin-transaksi.js/auto-lock.js (tidak
     diekspos lintas file, jadi disalin dengan nama sendiri). */
  function nomorAktif() {
    try {
      var p = JSON.parse(localStorage.getItem("dikapay:profile") || "{}");
      return String(p.phone || "").replace(/\D/g, "");
    } catch (e) { return ""; }
  }

  /* Dibuang sekali (best-effort) begitu modul ini pertama kali jalan di
     sesi manapun — bukan dimigrasikan, cuma dibersihkan supaya tidak ada
     dua sumber token yang membingungkan kalau ada yang membaca storage
     manual saat debug. */
  function bersihkanTokenLegacy() {
    if (legacyDibersihkan) return;
    legacyDibersihkan = true;
    try { localStorage.removeItem(TOKEN_KEY_LEGACY); } catch (e) {}
  }

  /* ---- Penyimpanan device_token, PER NOMOR HP -------------------------- */

  function kunciToken(nomorDigits) {
    var nomor = String(nomorDigits || "").replace(/\D/g, "");
    return nomor ? TOKEN_PREFIX + nomor : "";
  }

  /* nomorDigits WAJIB diisi eksplisit oleh pemanggil yang baru saja tahu
     nomor akun ini pasti benar (hasil login/daftar/buka-kunci) — TIDAK
     boleh lagi diam-diam jatuh ke nomorAktif() di titik PENULISAN, karena
     urutan `activateSession()` vs simpan-token pernah beda-beda di
     auth-flow.js dan salah satu urutan itu bisa menulis token akun BARU ke
     slot akun LAMA kalau nomorAktif() dibaca sebelum profil sempat
     berpindah. Parameter eksplisit menghapus ketergantungan pada urutan itu
     sama sekali. */
  function simpanToken(token, nomorDigits) {
    var t = String(token == null ? "" : token).trim();
    var k = kunciToken(nomorDigits);
    if (!t || !k) return;
    bersihkanTokenLegacy();
    try { localStorage.setItem(k, t); }
    catch (e) { console.error("member-sync: gagal menyimpan device_token:", e); }
  }

  /* nomorDigits opsional — default ke akun yang SEDANG AKTIF (dipakai jalur
     baca normal di cek()). Pemanggil yang tahu persis nomor mana yang
     dimaksud (mis. cekSaatBukaKunci) tetap boleh mengisinya eksplisit. */
  function getToken(nomorDigits) {
    var k = kunciToken(nomorDigits || nomorAktif());
    if (!k) return "";
    try { return localStorage.getItem(k) || ""; }
    catch (e) { return ""; }
  }

  function hapusToken(nomorDigits) {
    var k = kunciToken(nomorDigits || nomorAktif());
    if (!k) return;
    try { localStorage.removeItem(k); }
    catch (e) { console.error("member-sync: gagal menghapus device_token:", e); }
  }

  /* ---- Terapkan saldo baru ke tampilan + cache -------------------------
     `mulaiMs` (opsional) — waktu SAAT permintaan status yang menghasilkan
     saldo ini MULAI dikirim (bukan saat responsnya datang). Dipakai sebagai
     pertahanan anti-timpa: kalau ADA penulis saldo lain yang lebih baru
     (transfer/pembayaran yang barusan sukses, atau polling LAIN yang lebih
     baru) sudah menulis `dikapay:balance:ts` SETELAH `mulaiMs`, hasil ini
     dianggap basi dan DIBUANG — bukan diterapkan menimpa yang lebih segar.
     Tanpa `mulaiMs` (dipanggil dari cekSaatBukaKunci/jalur lain), guard ini
     dilewati — pemanggil itu sendiri sudah tahu datanya paling baru. */
  function terapkanSaldo(saldo, mulaiMs) {
    if (saldo == null || !isFinite(Number(saldo))) return;
    if (typeof mulaiMs === "number") {
      var tsTerakhir = 0;
      try { tsTerakhir = Number(localStorage.getItem(BALANCE_TS_KEY)) || 0; } catch (e) {}
      if (tsTerakhir > mulaiMs) {
        console.info("member-sync: hasil saldo dibuang — ada penulis lain yang lebih baru (anti-timpa).");
        return;
      }
    }
    /* Saldo server dipakai APA ADANYA. Dulu di sini dikurangi catatan
       "pembelian simulasi" (saldo-sim.js) karena pembelian produk belum
       sampai ke server. Sejak api-transaksi-produk.php memotong saldonya
       sendiri, penyesuaian itu DIHAPUS — mempertahankannya akan memotong
       dua kali. */
    var n = Math.max(0, Math.round(Number(saldo)));
    try { localStorage.setItem(BALANCE_TS_KEY, String(Date.now())); } catch (e) {}
    /* Beranda (index.html) mengekspos window.DikaDevSaldo.set() yang SUDAH
       menulis cache DAN menganimasikan ulang angkanya di layar — dipakai
       ulang di sini supaya tidak ada dua tempat yang tahu cara "menulis
       saldo dengan benar". Halaman lain tidak punya elemen saldo di layar,
       jadi cukup timpa cache-nya saja. */
    if (window.DikaDevSaldo && typeof DikaDevSaldo.set === "function") {
      DikaDevSaldo.set(n);
      return;
    }
    try { localStorage.setItem(BALANCE_KEY, String(n)); }
    catch (e) { console.error("member-sync: gagal menyimpan saldo:", e); }
  }

  /* ---- Banned dari server -> logout paksa ------------------------------ */

  var TEKS_BANNED_SERVER =
    "Demi keamanan, akun ini dinonaktifkan sementara oleh sistem DikaPay. Kalau menurutmu " +
    "ini keliru, hubungi layanan pelanggan DikaPay untuk bantuan lebih lanjut.";

  /* Dipakai saat admin mem-banned lewat AdminPanel dengan durasi "Permanen"
     -> backend mengirim `banned_sampai: null`. BEDA dari TEKS_BANNED_SERVER
     di atas: tidak menjanjikan "sementara" sama sekali. */
  var TEKS_BANNED_SERVER_PERMANEN =
    "Akun kamu dinonaktifkan permanen oleh sistem DikaPay. Hubungi layanan pelanggan DikaPay " +
    "untuk bantuan lebih lanjut.";

  /* "2026-09-12 15:30:00" (format datetime backend) ATAU ISO string ->
     epoch ms. Salinan kecil dari parseBannedSampai() di pin-transaksi.js
     (tidak diekspos lintas file). */
  function parseBannedSampai(v) {
    if (v == null || v === "") return NaN;
    if (typeof v === "number") return v;
    var s = String(v).trim();
    var iso = s.indexOf("T") === -1 ? s.replace(" ", "T") : s;
    var t = Date.parse(iso);
    if (!isFinite(t)) t = Date.parse(s);
    return t;
  }

  function paksaLogoutBanned(bannedSampaiRaw) {
    var sampaiMs = parseBannedSampai(bannedSampaiRaw);
    var adaBatasWaktu = isFinite(sampaiMs) && sampaiMs > Date.now();
    /* `banned_sampai` NULL/kosong/tidak terbaca -> PERMANEN (admin mem-banned
       lewat AdminPanel dengan durasi "Permanen", backend mengirim
       `banned_sampai: null`). DULU ini jatuh ke fallback "+1 menit" — bug:
       member menunggu semenit, coba masuk lagi, ditolak lagi (logikanya
       memang sudah benar, tampilan countdown-nya yang berbohong). Sekarang
       `info.sampai` dibiarkan `null` apa adanya, dan tampilkanBanned()
       (pin-transaksi.js) tahu artinya "banned tanpa batas waktu" -> tidak
       ada hitung mundur sama sekali. */
    var info = {
      mulai: Date.now(),
      sampai: adaBatasWaktu ? sampaiMs : null,
    };
    var lanjut = function () {
      try { if (window.DikaAuth) DikaAuth.logout(); }
      catch (e) { console.error("member-sync: gagal logout paksa:", e); }
    };
    if (window.DikaPinTransaksi && typeof DikaPinTransaksi.tampilkanBanned === "function") {
      DikaPinTransaksi.tampilkanBanned(info, {
        pesan: adaBatasWaktu ? TEKS_BANNED_SERVER : TEKS_BANNED_SERVER_PERMANEN,
        onTutup: lanjut,
      });
    } else {
      console.error("member-sync: pin-transaksi.js belum di-link — popup banned dilewati, tetap logout paksa.");
      lanjut();
    }
  }

  /* hasil: { saldo?, status?, bannedSampai? } — bentuk yang SAMA dipakai
     baik dari api-status.php (statusMember()) maupun api-login.php
     (masuk(), lihat cekSaatBukaKunci() di bawah), supaya cabangnya cuma
     satu di sini.

     `mulaiMs` (opsional) diteruskan ke terapkanSaldo() sebagai pertahanan
     anti-timpa (lihat komentar terapkanSaldo). `nomorDiharapkan` (opsional)
     adalah nomor akun yang SEDANG AKTIF SAAT PERMINTAAN DIMULAI — kalau
     diisi, hasil ini HANYA diterapkan kalau akun aktif SAAT INI (saat
     respons datang) masih nomor yang SAMA. Ini pertahanan kedua untuk bug
     "saldo akun lain nyasar ke layar" (lihat catatan besar di atas): kalau
     member logout/ganti akun PAS permintaan status sedang di tengah jalan,
     hasil yang datang belakangan itu milik akun LAMA dan harus dibuang,
     bukan diterapkan ke akun yang sekarang aktif. */
  function terapkanHasil(hasil, mulaiMs, nomorDiharapkan) {
    if (!hasil || typeof hasil !== "object") return;
    if (nomorDiharapkan && nomorAktif() !== nomorDiharapkan) {
      console.info("member-sync: hasil dibuang — akun aktif sudah berpindah sejak permintaan dimulai.");
      return;
    }
    if (hasil.saldo != null) terapkanSaldo(hasil.saldo, mulaiMs);
    if (hasil.status === "banned") paksaLogoutBanned(hasil.bannedSampai);
  }

  /* ---- Jalur normal: device_token sudah ada ---------------------------- */

  function cekDenganToken(token, nomorSaatMulai) {
    var mulaiMs = Date.now();
    return window.DikaApi.statusMember(token).then(
      function (hasil) { terapkanHasil(hasil, mulaiMs, nomorSaatMulai); },
      function (err) {
        /* 401 tegas ("Sesi tidak valid") -> token memang sudah tidak
           berlaku, hapus supaya kesempatan berikutnya lewat PIN layar kunci
           (titik c) mengambil yang baru. Dihapus dari slot NOMOR YANG SAMA
           yang dipakai memanggil token ini (bukan akun aktif saat respons
           datang, yang bisa saja sudah berpindah). SELAIN itu (jaringan/
           timeout/server bermasalah) -> BUKAN urusan token, diamkan saja. */
        if (err && err.kode === "sesi-tidak-valid") {
          hapusToken(nomorSaatMulai);
        } else {
          console.warn("member-sync: cek status gagal (diamkan):", err && (err.sebab || err.pesanMember));
        }
      }
    );
  }

  /* Dipanggil dari titik (a) app resume, (b) halaman dimuat, (d) loop 60
     detik. Silent sepenuhnya: belum login / belum ada api.js / belum ada
     device_token -> tidak melakukan apa pun (bukan error). Nomor akun aktif
     DICATAT di sini, SEBELUM permintaan jaringan dikirim — lihat
     terapkanHasil() untuk alasannya. */
  function cek() {
    if (sedangCek) return Promise.resolve();
    try { if (!window.DikaAuth || !DikaAuth.isLoggedIn()) return Promise.resolve(); }
    catch (e) { return Promise.resolve(); }
    if (!window.DikaApi || typeof DikaApi.statusMember !== "function") return Promise.resolve();

    var nomor = nomorAktif();
    if (!nomor) return Promise.resolve();
    var token = getToken(nomor);
    if (!token) return Promise.resolve(); /* belum punya token -> tunggu jalur PIN layar kunci */

    sedangCek = true;
    return cekDenganToken(token, nomor).then(
      function () { sedangCek = false; cekNotifikasi(); },
      function (e) {
        sedangCek = false;
        console.warn("member-sync: cek() gagal (diamkan):", e);
        /* Notifikasi tetap diperiksa walau status member gagal diambil:
           keduanya endpoint berbeda, dan yang satu bermasalah bukan alasan
           menahan yang lain. */
        cekNotifikasi();
      }
    );
  }

  /* ---- Notifikasi baru (Masalah 4) -------------------------------------
     MENUMPANG siklus 60 detik yang sudah ada di sini, bukan membuat timer
     kedua: dua interval yang jalan sendiri-sendiri akan menggandakan
     permintaan ke backend shared hosting tanpa menambah kecepatan apa pun.

     BATASAN YANG PERLU DISADARI: ini BUKAN push notification. Kabar baru
     muncul saat app DIBUKA/aktif (polling + saat app kembali ke depan) —
     bukan di tray notifikasi HP saat app tertutup. Untuk itu perlu Firebase
     Cloud Messaging, yang belum ada di project ini.

     Yang dikerjakan di sini HANYA memberi tahu halaman bahwa ada kabar
     baru lewat event `dika:notif-baru`; yang menggambar badge tetap
     halaman Beranda (script.js), supaya modul ini tidak perlu tahu apa-apa
     soal markup. */
  var notifTerakhirAda = null;

  function cekNotifikasi() {
    try {
      if (!window.DikaApi || typeof DikaApi.notifikasi !== "function") return;
      var S = window.DikaNotifServer;
      if (!S) return;   /* halaman ini tidak memuat penyaringnya */
      var profil = JSON.parse(localStorage.getItem("dikapay:profile") || "{}");
      var phone = String(profil.phone || "");
      if (!phone) return;

      DikaApi.notifikasi(phone).then(function (items) {
        S.pasangBaseline(phone, items);
        var ada = S.adaBelumDibaca(phone, items);
        /* Hanya dikabarkan saat BERUBAH — tanpa ini setiap putaran 60 detik
           menembakkan event yang sama dan halaman menggambar ulang badge
           tanpa ada yang berubah. */
        if (ada === notifTerakhirAda) return;
        notifTerakhirAda = ada;
        try {
          window.dispatchEvent(new CustomEvent("dika:notif-baru", { detail: { ada: ada } }));
        } catch (e) { console.warn("member-sync: gagal mengabarkan notifikasi baru:", e); }
      }).catch(function (e) {
        console.warn("member-sync: cek notifikasi gagal (diamkan):", e);
      });
    } catch (e) {
      console.warn("member-sync: cekNotifikasi gagal (diamkan):", e);
    }
  }

  /* ---- Jalur khusus PIN layar kunci (titik c) DAN login cepat lokal ------
     Dipanggil dari DUA tempat:
       - auto-lock.js, tepat setelah PIN layar kunci cocok (titik c asli).
       - auth-flow.js, tepat setelah PIN "jalur cepat lokal" (login TANPA ke
         jaringan, cocok dengan cache dikapay:account:<nomor>) cocok — lihat
         catatan "TOKEN & SALDO HARUS PER-AKUN" di atas. Titik INI yang dulu
         hilang dan membuat device_token/saldo akun yang baru login tidak
         pernah disegarkan saat berpindah akun di perangkat yang sama.

     KALAU akun `nomorDigits` ini sudah punya device_token tersimpan -> sama
     seperti cek() (tapi dipaksa ke NOMOR itu, bukan diam-diam memakai
     nomorAktif() — penting kalau dipanggil tepat setelah activateSession()
     berpindah akun, supaya tidak ada jendela waktu yang salah baca).
     KALAU BELUM (member lama yang belum pernah dapat token) -> panggil
     api-login.php dengan nomor+PIN yang BARU SAJA dipakai (PIN sudah di
     tangan, TIDAK minta ulang ke member), sekadar supaya dapat device_token
     untuk PERTAMA KALINYA. Sesudah itu jalur ini tidak terpakai lagi untuk
     akun tersebut — seterusnya lewat cek(). */
  function cekSaatBukaKunci(nomorDigits, pin) {
    try { if (!window.DikaAuth || !DikaAuth.isLoggedIn()) return; }
    catch (e) { return; }
    if (!window.DikaApi) return;

    var nomor = String(nomorDigits || nomorAktif() || "").replace(/\D/g, "");
    if (!nomor) return;

    var tokenAda = getToken(nomor);
    if (tokenAda) {
      if (sedangCek) return;
      sedangCek = true;
      cekDenganToken(tokenAda, nomor).then(
        function () { sedangCek = false; },
        function (e) { sedangCek = false; console.warn("member-sync: cekSaatBukaKunci() gagal (diamkan):", e); }
      );
      return;
    }

    var p = String(pin == null ? "" : pin);
    if (!/^\d{6}$/.test(p) || typeof DikaApi.masuk !== "function") return;

    DikaApi.masuk(nomor, p).then(
      function (member) {
        if (member && member.device_token) simpanToken(member.device_token, nomor);
        terapkanHasil({
          saldo: member && member.saldo,
          status: member && member.status,
          bannedSampai: member && member.banned_sampai,
        }, undefined, nomor);
      },
      function (err) {
        console.warn("member-sync: ambil device_token via login gagal (diamkan):",
          err && (err.sebab || err.pesanMember));
      }
    );
  }

  /* ---- Loop 60 detik selama foreground (titik d) ------------------------ */

  function mulaiPolling() {
    if (pollTimer) return;
    pollTimer = window.setInterval(cek, POLL_MS);
  }

  function berhentiPolling() {
    if (!pollTimer) return;
    window.clearInterval(pollTimer);
    pollTimer = 0;
  }

  /* ---- Pemasangan: app resume/background -------------------------------
     Pola SAMA PERSIS dengan pasangCapacitor()/pasangWeb() di auto-lock.js
     (disalin, bukan dipanggil lintas modul — auto-lock.js tidak
     mengekspos punyanya ke window). */

  function pasangCapacitor() {
    try {
      var Cap = window.Capacitor;
      var App = Cap && Cap.Plugins && Cap.Plugins.App;
      if (!App || typeof App.addListener !== "function") return false;
      App.addListener("appStateChange", function (state) {
        if (state && state.isActive) { cek(); mulaiPolling(); }
        else berhentiPolling();
      });
      return true;
    } catch (e) {
      console.warn("member-sync: App plugin tidak bisa dipasang:", e);
      return false;
    }
  }

  function pasangWeb() {
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") { cek(); mulaiPolling(); }
      else berhentiPolling();
    });
  }

  function init() {
    cek(); /* sekali saat skrip ini dieksekusi -- termasuk titik (b) Beranda dimuat */
    if (document.visibilityState !== "hidden") mulaiPolling();

    var adaPlugin = pasangCapacitor();
    pasangWeb();
    if (!adaPlugin) {
      console.info("member-sync: Capacitor App plugin tidak ada — memakai visibilitychange.");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.DikaMemberSync = {
    TOKEN_PREFIX: TOKEN_PREFIX,
    simpanToken: simpanToken,
    getToken: getToken,
    hapusToken: hapusToken,
    terapkanHasil: terapkanHasil,
    cek: cek,
    cekSaatBukaKunci: cekSaatBukaKunci,
  };
})();
