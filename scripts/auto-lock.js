/* ===========================================================================
   DikaPay — auto-lock.js
   KUNCI OTOMATIS: minta PIN lagi kalau aplikasi ditinggalkan >= 5 menit.

     window.DikaLock = {
       IDLE_MS          // ambang batas (5 menit)
       lockNow()        // paksa terkunci (untuk pengujian)
       isLocked()
       cekBanned(nomor?)  // null | { mulai, sampai } -- status banned AUTO-LOCK
                          //   nomor itu (nomor aktif kalau diosongkan)
     }

   Di-link di SEMUA halaman member DAN auth.html (auth.html tidak pernah
   menjalankan layar kuncinya sendiri — lihat init() — tapi tetap butuh
   modul ini dimuat supaya auth-flow.js bisa memanggil cekBanned() saat
   memeriksa apakah nomor yang mau login sedang banned). Overlay dibuat
   runtime, jadi tidak ada markup yang perlu ditambahkan di halaman lain.

   CARA MENDETEKSI:
     1. Capacitor App plugin `appStateChange` — jalur UTAMA di APK, satu-
        satunya sinyal yang benar-benar membedakan "keluar app" dari
        "pindah halaman".
     2. `visibilitychange` + `pageshow` + interaksi member — jaring cadangan
        untuk browser biasa & kalau plugin gagal dimuat.

   Yang dicatat adalah "TERAKHIR AKTIF", bukan "kapan masuk latar" —
   lihat alasannya di bagian penanda di bawah.

   Yang dikunci adalah SESI, bukan halaman: penanda waktunya disimpan di
   localStorage, jadi kalau app benar-benar dimatikan lalu dibuka lagi
   setelah 5 menit, tetap terkunci. Kalau cuma disimpan di memori, proses
   yang dibunuh Android akan melewati kunci ini begitu saja.

   ======================= BUG YANG DIPERBAIKI: PENANDA GLOBAL ===============
   Penanda "terakhir aktif" dulu SATU KUNCI GLOBAL (`dikapay:lock:seen`),
   TIDAK terikat ke akun mana pun. Akibatnya: Member A memakai app lalu
   logout, Member B login di perangkat yang sama — penanda global milik
   Member A (mungkin sudah basi, >5 menit) langsung dibaca seolah itu
   riwayat Member B, dan Member B yang BARU SAJA berhasil login (lewat PIN/
   biometrik — verifikasi yang SAH) langsung disambut layar kunci lagi.

   Sekarang penanda per-akun (`dikapay:lock:seen:<nomor digit>`, pola yang
   sama dengan `dikapay:devices:<digit>`), PLUS penanda kecil kedua
   (`dikapay:lock:activeAccount`) yang mencatat akun mana yang TERAKHIR
   dilacak modul ini. Begitu nomor aktif ganti (beda dari penanda ini —
   entah beda akun, atau akun yang sama tapi baru saja login ulang dari
   auth.html), riwayat "terakhir aktif" untuk akun itu di-RESET ke
   sekarang, bukan dibaca apa adanya — sesi yang baru saja lolos verifikasi
   PIN/biometrik di auth.html tidak boleh langsung disambut kunci lagi.

   =============== BUG: PIN DIMINTA DUA KALI SETELAH LOGOUT -> LOGIN =========
   `segarkanTransisiAkun()` di atas cuma bisa mendeteksi "akun aktifnya
   BERGANTI" (nomor lama != nomor baru) — dan sengaja MELEWATI penyegaran
   kalau nomornya SAMA, dengan asumsi "tidak ada yang berubah, riwayat lama
   masih valid". Asumsi itu SALAH tepat saat logout->login akun yang SAMA:
   `DikaAuth.logout()` (auth.js) dulu TIDAK PERNAH membersihkan penanda
   `dikapay:lock:activeAccount`, jadi begitu member login lagi ke akun yang
   sama, `segarkanTransisiAkun()` melihat "nomor sama seperti sebelumnya"
   dan diam saja — riwayat "terakhir aktif" LAMA (bisa saja sudah basi
   kalau app sempat ditinggal >= 5 menit SEBELUM logout) tetap terbaca apa
   adanya begitu Beranda dimuat. Akibatnya: PIN baru saja benar dimasukkan
   di auth.html, tapi begitu sampai Beranda, `periksaSaatKembali()` melihat
   "terakhir aktif" basi itu dan langsung menampilkan layar kunci ini LAGI —
   PIN diminta dua kali berturut-turut untuk satu login yang sama.

   PERBAIKAN: `DikaAuth.logout()` sekarang memanggil `bersihkanSaatLogout()`
   (diekspor di bawah) SEBELUM redirect — membuang `dikapay:lock:
   activeAccount` supaya login BERIKUTNYA (akun sama ATAUPUN akun lain)
   SELALU dianggap transisi baru oleh `segarkanTransisiAkun()`, yang lalu
   menyegarkan penanda "terakhir aktif" ke SEKARANG. Ini scope sekecil
   mungkin: tidak mengubah `segarkanTransisiAkun()` atau alur deteksi utama
   sama sekali, cuma memastikan logout benar-benar membersihkan bekas
   sesi lama sebelum member baru diizinkan masuk.

   ========================= BANNED 3 JAM (auto-lock) ========================
   Salah PIN 3x di layar kunci ini -> akun DIBANNED 3 JAM (beda konteks &
   beda durasi dari banned PIN TRANSAKSI di pin-transaksi.js yang 2 jam —
   storage key SENGAJA terpisah, `dikapay:lock:banned:<digit>`, supaya dua
   sistem banned ini tidak saling menimpa/tertukar). Perilakunya konsisten
   dengan pola banned transaksi: logout paksa + popup "Akun Kamu Telah
   Dibanned" (dipakai ULANG dari pin-transaksi.js, `tampilkanBanned()`,
   dengan teks penjelasan yang disesuaikan untuk konteks auto-lock) +
   ditampilkan ulang tiap kali coba login lagi sebelum 3 jam habis (dicek
   di auth-flow.js lewat `DikaLock.cekBanned()`, sama seperti pola
   `DikaPinTransaksi.cekBanned()` yang sudah ada).
   =========================================================================== */

(function () {
  "use strict";

  var IDLE_MS = 5 * 60 * 1000;          /* 5 menit */
  var BG_PREFIX = "dikapay:lock:seen:";  /* + nomor digit -> kapan terakhir AKTIF */
  var ACCOUNT_MARK_KEY = "dikapay:lock:activeAccount"; /* akun terakhir dilacak modul ini */
  var BANNED_PREFIX = "dikapay:lock:banned:";          /* + nomor digit -> {mulai, sampai} */
  var BAN_MS = 3 * 60 * 60 * 1000;      /* 3 jam — SENGAJA beda dari 2 jam pin-transaksi.js */
  var MAKS_SALAH = 3;
  var SEC_KEY = "dikapay:security";      /* { pinCreated, pin } — sama dgn akun.js */

  var el = null;
  var buffer = "";
  var terkunci = false;
  var salahBerturut = 0;

  /* ---- Prasyarat ----------------------------------------------------- */

  function sudahLogin() {
    try { return !!(window.DikaAuth && DikaAuth.isLoggedIn()); }
    catch (e) { return false; }
  }

  function security() {
    try { return JSON.parse(localStorage.getItem(SEC_KEY) || "null") || null; }
    catch (e) { return null; }
  }

  /* Tanpa PIN yang pernah dibuat, tidak ada yang bisa diverifikasi —
     mengunci layar di situ cuma mengurung member tanpa jalan keluar. */
  function bisaDikunci() {
    var s = security();
    return sudahLogin() && !!(s && s.pinCreated && s.pin);
  }

  /* Nomor akun yang SEDANG aktif di perangkat ini — salinan kecil pola
     yang sama dengan `nomorAktif()` di pin-transaksi.js/perangkat.js
     (tidak diekspos lintas file, jadi disalin dengan nama sendiri). */
  function nomorAktif() {
    try {
      var p = JSON.parse(localStorage.getItem("dikapay:profile") || "{}");
      return String(p.phone || "").replace(/\D/g, "");
    } catch (e) { return ""; }
  }

  /* ---- Penanda "terakhir aktif", PER AKUN -----------------------------
     BUKAN "kapan masuk latar", melainkan "kapan terakhir app benar-benar
     dipakai OLEH AKUN INI". Bedanya penting: `visibilitychange -> hidden`
     ternyata juga menyala saat member sekadar BERPINDAH HALAMAN di dalam
     app, bukan cuma saat app ditinggalkan. Kalau yang dicatat "kapan
     masuk latar", tiap perpindahan halaman menimpa penandanya dan kondisi
     terkunci yang seharusnya terbawa jadi hilang.

     Dengan model "terakhir aktif":
       - halaman terlihat & dipakai -> penanda AKUN INI terus disegarkan
       - app ditinggalkan           -> penanda berhenti disegarkan
       - dibuka lagi / halaman baru -> bandingkan selisihnya, TAPI hanya
         kalau akun aktifnya SAMA dengan yang terakhir dilacak (lihat
         segarkanTransisiAkun() di bawah) — kalau beda, dianggap sesi baru.
     Cold start setelah proses dimatikan Android ikut tertangani, karena
     penandanya di localStorage, bukan di memori. */

  var HEARTBEAT_MS = 15000;
  var heartbeat = 0;

  function kunciSeen(nomor) {
    return (nomor || nomorAktif()) ? BG_PREFIX + (nomor || nomorAktif()) : "";
  }

  function segarkan() {
    if (!sudahLogin() || terkunci) return;
    var k = kunciSeen();
    if (!k) return;
    try { localStorage.setItem(k, String(Date.now())); }
    catch (e) { console.error("auto-lock: gagal menyimpan penanda aktif:", e); }
  }

  function lamaTidakAktif() {
    var k = kunciSeen();
    if (!k) return 0;
    try {
      var t = Number(localStorage.getItem(k));
      if (!isFinite(t) || t <= 0) return 0;
      var selisih = Date.now() - t;
      return selisih > 0 ? selisih : 0;
    } catch (e) { return 0; }
  }

  /* Deteksi "akun aktif baru saja berganti" (beda member, ATAU akun yang
     sama tapi baru saja login ulang lewat verifikasi PIN/biometrik di
     auth.html). Kalau berganti, penanda "terakhir aktif" akun ini di-RESET
     ke sekarang — sesi yang baru lolos verifikasi tidak boleh langsung
     disambut kunci lagi memakai riwayat basi (entah riwayat akun lain,
     entah riwayat sesi lamanya sendiri sebelum logout). */
  function segarkanTransisiAkun() {
    var nomor = nomorAktif();
    if (!nomor) return;
    var terakhir = null;
    try { terakhir = localStorage.getItem(ACCOUNT_MARK_KEY); } catch (e) {}
    if (terakhir === nomor) return; // masih akun yang sama, tidak ada transisi
    try { localStorage.setItem(ACCOUNT_MARK_KEY, nomor); } catch (e) {}
    segarkan(); // tulis penanda "aktif sekarang" untuk akun ini
  }

  function mulaiHeartbeat() {
    if (heartbeat) return;
    heartbeat = window.setInterval(function () {
      if (document.visibilityState === "visible") segarkan();
    }, HEARTBEAT_MS);
  }

  function periksaSaatKembali() {
    if (terkunci) return;
    segarkanTransisiAkun();
    if (!bisaDikunci()) return;
    if (lamaTidakAktif() >= IDLE_MS) kunci();
    else segarkan();
  }

  /* ---- Banned 3 jam (PIN auto-lock salah 3x) --------------------------
     Storage TERPISAH dari pin-transaksi.js (`dikapay:lock:banned:*` vs
     `dikapay:pintx:banned:*`) — dua konteks berbeda (verifikasi ulang
     akses vs konfirmasi transaksi), sengaja tidak dicampur supaya salah
     satu tidak bisa menutup/memperpanjang yang lain secara tidak sengaja. */

  function kunciBanned(nomor) {
    return nomor ? BANNED_PREFIX + nomor : "";
  }

  function cekBanned(nomor) {
    var target = nomor || nomorAktif();
    var k = kunciBanned(target);
    if (!k) return null;
    try {
      var v = JSON.parse(localStorage.getItem(k) || "null");
      if (!v || typeof v.sampai !== "number") return null;
      if (v.sampai <= Date.now()) { localStorage.removeItem(k); return null; }
      return v;
    } catch (e) {
      console.error("auto-lock: gagal membaca status banned:", e);
      return null;
    }
  }

  function pasangBanned(nomor) {
    var k = kunciBanned(nomor);
    if (!k) { console.error("auto-lock: tidak ada nomor aktif — banned TIDAK bisa disimpan."); return null; }
    var mulai = Date.now();
    var info = { mulai: mulai, sampai: mulai + BAN_MS };
    try { localStorage.setItem(k, JSON.stringify(info)); }
    catch (e) { console.error("auto-lock: gagal menyimpan status banned:", e); }
    return info;
  }

  var TEKS_BANNED_LOCK =
    "Demi keamanan akunmu, akun ini dinonaktifkan sementara karena PIN dimasukkan salah " +
    "3 kali berturut-turut saat verifikasi ulang. Ini bukan hukuman — cuma langkah " +
    "pengamanan supaya orang lain tidak bisa mencoba-coba masuk ke akunmu.";

  /* Popup "Akun Kamu Telah Dibanned" DIPAKAI ULANG dari pin-transaksi.js
     (ilustrasi, glow, countdown — sudah dibangun & diuji di sana), cuma
     teks penjelasannya diganti lewat opts.pesan supaya sesuai konteks
     auto-lock, bukan konteks PIN transaksi. Kalau pin-transaksi.js entah
     kenapa tidak ter-link di halaman ini, tetap paksa logout — keamanan
     tidak boleh bergantung pada berhasil-tidaknya menampilkan popup. */
  function tampilkanBannedLock(info) {
    var lanjut = function () {
      try { if (window.DikaAuth) window.DikaAuth.logout(); }
      catch (e) { console.error("auto-lock: gagal logout paksa:", e); }
    };
    if (window.DikaPinTransaksi && typeof DikaPinTransaksi.tampilkanBanned === "function") {
      DikaPinTransaksi.tampilkanBanned(info, { pesan: TEKS_BANNED_LOCK, onTutup: lanjut });
    } else {
      console.error("auto-lock: pin-transaksi.js belum di-link — popup banned dilewati, tetap logout paksa.");
      lanjut();
    }
  }

  /* ---- Layar kunci ---------------------------------------------------- */

  var ANGKA = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "hapus"];

  function build() {
    if (el) return el;
    var ov = document.createElement("div");
    ov.className = "lockscreen";
    ov.setAttribute("role", "dialog");
    ov.setAttribute("aria-modal", "true");

    var tombol = ANGKA.map(function (a) {
      if (a === "") return '<span class="lock__key lock__key--kosong" aria-hidden="true"></span>';
      if (a === "hapus") {
        return '<button class="lock__key lock__key--hapus" type="button" data-k="hapus" aria-label="Hapus">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
          'stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M20 6H9.5L4 12l5.5 6H20a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 20 6z"/>' +
          '<path d="m12 10 4 4M16 10l-4 4"/></svg></button>';
      }
      return '<button class="lock__key" type="button" data-k="' + a + '">' + a + "</button>";
    }).join("");

    ov.innerHTML =
      '<div class="lock__box">' +
      '<span class="lock__ic" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round">' +
      '<rect x="4" y="10" width="16" height="11" rx="2.4"/>' +
      '<path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg></span>' +
      '<h2 class="lock__title">Masukkan PIN kamu</h2>' +
      '<p class="lock__text">Demi keamanan, PIN diminta lagi karena aplikasi sempat ' +
      'ditinggalkan beberapa saat.</p>' +
      '<div class="lock__dots" id="lockDots">' +
      new Array(7).join('<span class="lock__dot"></span>') +
      "</div>" +
      '<p class="lock__err" id="lockErr" role="alert" hidden>PIN belum cocok. Coba lagi, ya.</p>' +
      '<div class="lock__keypad">' + tombol + "</div>" +
      '<button class="lock__logout" type="button" id="lockLogout">Lupa PIN? Keluar dari akun</button>' +
      "</div>";

    document.body.appendChild(ov);
    el = ov;

    ov.querySelector(".lock__keypad").addEventListener("click", function (e) {
      var b = e.target.closest("[data-k]");
      if (b) ketuk(b.dataset.k);
    });
    ov.querySelector("#lockLogout").addEventListener("click", function () {
      try {
        var k = kunciSeen();
        if (k) { try { localStorage.removeItem(k); } catch (err2) {} }
        if (window.DikaAuth) DikaAuth.logout();
      } catch (err) { console.error("auto-lock: gagal logout:", err); }
    });
    /* Papan ketik fisik ikut dilayani — memudahkan pengujian di browser
       dan tetap wajar dipakai kalau ada keyboard eksternal. */
    document.addEventListener("keydown", function (e) {
      if (!terkunci) return;
      if (/^[0-9]$/.test(e.key)) ketuk(e.key);
      else if (e.key === "Backspace") ketuk("hapus");
    });

    return ov;
  }

  function gambarDots() {
    var dots = el.querySelectorAll(".lock__dot");
    for (var i = 0; i < dots.length; i++) {
      dots[i].classList.toggle("is-on", i < buffer.length);
    }
  }

  function salah() {
    var box = el.querySelector(".lock__box");
    var err = el.querySelector("#lockErr");
    err.hidden = false;
    box.classList.remove("is-shake");
    void box.offsetWidth;               /* paksa reflow -> shake terpicu ulang */
    box.classList.add("is-shake");
    buffer = "";
    gambarDots();
  }

  function ketuk(k) {
    if (!terkunci) return;
    if (k === "hapus") {
      buffer = buffer.slice(0, -1);
      gambarDots();
      return;
    }
    if (buffer.length >= 6) return;
    buffer += k;
    gambarDots();
    el.querySelector("#lockErr").hidden = true;

    if (buffer.length === 6) {
      var s = security();
      if (s && buffer === String(s.pin)) {
        salahBerturut = 0;
        var pinDipakai = buffer;
        buka();
        /* Sinkronisasi status LATAR BELAKANG (saldo + banned) — lihat
           member-sync.js. PIN sudah di tangan, jadi kalau device_token
           belum ada modul itu bisa sekalian memakainya untuk login diam-
           diam dan dapat token pertama kalinya, tanpa minta ulang ke
           member. Best-effort penuh: hilang/gagal tidak pernah mengganggu
           proses buka kunci di atas, yang sudah selesai duluan. */
        try {
          if (window.DikaMemberSync) DikaMemberSync.cekSaatBukaKunci(nomorAktif(), pinDipakai);
        } catch (e) { console.error("auto-lock: gagal memicu sinkronisasi status:", e); }
      } else {
        salahBerturut++;
        if (salahBerturut >= MAKS_SALAH) {
          var nomor = nomorAktif();
          var info = pasangBanned(nomor);
          terkunci = false;
          buffer = "";
          if (el) el.classList.remove("is-open");
          document.documentElement.style.overflow = "";
          salahBerturut = 0;
          if (info) tampilkanBannedLock(info);
          return;
        }
        salah();
      }
    }
  }

  function kunci() {
    if (terkunci) return;
    build();
    terkunci = true;
    buffer = "";
    salahBerturut = 0;
    gambarDots();
    el.querySelector("#lockErr").hidden = true;
    el.classList.add("is-open");
    /* Halaman di belakangnya tidak boleh bisa digulir atau disentuh. */
    document.documentElement.style.overflow = "hidden";
  }

  function buka() {
    terkunci = false;
    buffer = "";
    salahBerturut = 0;
    segarkan();          /* mulai hitung ulang dari sekarang */
    if (el) el.classList.remove("is-open");
    document.documentElement.style.overflow = "";
  }

  /* ---- Pemasangan pendengar ------------------------------------------ */

  function pasangCapacitor() {
    try {
      var Cap = window.Capacitor;
      var App = Cap && Cap.Plugins && Cap.Plugins.App;
      if (!App || typeof App.addListener !== "function") return false;
      App.addListener("appStateChange", function (state) {
        /* Ini penanda yang PALING dipercaya di APK: hanya menyala saat app
           benar-benar berpindah latar, tidak ikut menyala saat navigasi. */
        if (state && state.isActive) periksaSaatKembali();
        else segarkan();      /* stempel terakhir sebelum ditinggalkan */
      });
      return true;
    } catch (e) {
      console.warn("auto-lock: App plugin tidak bisa dipasang:", e);
      return false;
    }
  }

  function pasangWeb() {
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") periksaSaatKembali();
      /* Saat hidden TIDAK menulis apa-apa: penanda terakhir yang ditulis
         selagi halaman masih aktif sudah cukup, dan menulisnya di sini
         justru menyamakan "pindah halaman" dengan "keluar app". */
    });
    window.addEventListener("pageshow", periksaSaatKembali);

    /* Interaksi nyata menyegarkan penanda — member yang sedang mengetik
       atau menggulir jelas tidak sedang meninggalkan aplikasi. */
    ["click", "keydown", "touchstart", "scroll"].forEach(function (ev) {
      window.addEventListener(ev, segarkan, { passive: true });
    });
  }

  function init() {
    /* auth.html tidak dikunci: di sana member memang sedang masuk. Modul
       ini TETAP dimuat di sana (lihat header) supaya auth-flow.js bisa
       memanggil DikaLock.cekBanned() saat memeriksa nomor yang mau login. */
    if (/(^|\/)auth\.html$/i.test(location.pathname)) return;

    /* Jaring pertahanan kedua: kalau akun yang sedang login TERNYATA sedang
       banned (mis. tab lain baru saja memicunya, atau sesi lolos lewat
       jalur lain sebelum ban tercatat), paksa logout + tampilkan popup di
       sini juga — jangan andalkan auth-flow.js sendirian. */
    if (sudahLogin()) {
      var banInfo = cekBanned();
      if (banInfo) { tampilkanBannedLock(banInfo); return; }
    }

    /* Halaman baru dibuka setelah app lama dimatikan -> penanda waktu
       masih tersimpan, jadi kondisi terkunci ikut terbawa. Inilah kenapa
       penandanya di localStorage, bukan di memori. */
    periksaSaatKembali();
    segarkan();
    mulaiHeartbeat();

    var adaPlugin = pasangCapacitor();
    pasangWeb();
    if (!adaPlugin) {
      /* Bukan error: di browser biasa memang tidak ada plugin Capacitor. */
      console.info("auto-lock: Capacitor App plugin tidak ada — memakai visibilitychange.");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.DikaLock = {
    IDLE_MS: IDLE_MS,
    lockNow: kunci,
    isLocked: function () { return terkunci; },
    cekBanned: cekBanned,
    /* Teks penjelasan banned — diekspos supaya auth-flow.js bisa memakai
       kalimat yang SAMA PERSIS saat menampilkan ulang popup ini di layar
       login, bukan menyalin teksnya sendiri (gampang drift kalau diubah
       cuma di satu tempat). */
    PESAN_BANNED: TEKS_BANNED_LOCK,
    /* Dipanggil DikaAuth.logout() (auth.js) SEBELUM redirect ke auth.html —
       lihat "BUG: PIN DIMINTA DUA KALI SETELAH LOGOUT -> LOGIN" di atas.
       Membuang penanda akun terakhir supaya login BERIKUTNYA (akun yang
       sama ATAU akun lain) SELALU dianggap "transisi baru" oleh
       segarkanTransisiAkun() — riwayat "terakhir aktif" lama (yang bisa
       saja sudah basi kalau app sempat idle sebelum logout) tidak pernah
       lagi ikut terbaca oleh sesi login berikutnya. TIDAK menghapus
       `dikapay:lock:seen:<digit>` itu sendiri (biarkan basi begitu saja —
       tidak berbahaya, toh tidak akan pernah dibaca lagi selama
       ACCOUNT_MARK_KEY sudah tidak menunjuk ke akun itu) — cukup satu
       kunci kecil yang perlu dibuang, bukan menyapu semua state akun. */
    bersihkanSaatLogout: function () {
      try { localStorage.removeItem(ACCOUNT_MARK_KEY); }
      catch (e) { console.error("auto-lock: gagal membersihkan penanda akun saat logout:", e); }
    },
    /* Dipakai pengujian: memundurkan penanda waktu seolah app ditinggal lama. */
    _simulasiIdle: function (ms) {
      /* Mundurkan penanda + hentikan heartbeat, supaya tidak langsung
         disegarkan lagi sebelum pemeriksaan sempat jalan. */
      if (heartbeat) { window.clearInterval(heartbeat); heartbeat = 0; }
      var k = kunciSeen();
      if (!k) return;
      try { localStorage.setItem(k, String(Date.now() - (ms || IDLE_MS))); }
      catch (e) {}
    },
    /* Dipakai pengujian: paksa banned 3x salah tanpa mengetuk keypad manual. */
    _simulasiBanned: function (nomor) { return pasangBanned(nomor || nomorAktif()); },
  };
})();
