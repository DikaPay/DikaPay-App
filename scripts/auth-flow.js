/* ===========================================================================
   DikaPay — auth-flow.js
   Controller SATU alur untuk auth.html (splash → nomor HP → cabang daftar
   ATAU masuk → sukses → Beranda). Menggantikan login.js + register.js yang
   dulu dua file/dua sistem terpisah — di sini satu state machine, satu file.

   Sesi SELALU lewat window.DikaAuth (auth.js) — jangan akses `dikapay:auth`
   mentah di sini. Halaman ini tidak memuat produk-ui.js, jadi onReady kecil
   sendiri (pola yang sama seperti file lain yang berdiri sendiri).

   ---------------------------------------------------------------------------
   KONTRAK DATA (localStorage) — semua fase 1, lihat CLAUDE.md "Sesi / Auth":

   dikapay:account:<nomor digit>  { name, phone (cantik), pin (6 digit) }
     Direktori akun yang BISA LOGIN — SATU-SATUNYA yang ditulis/dibaca modul
     ini. BUKAN dikapay:member:<nomor> (itu direktori PENERIMA TRANSFER milik
     transfer-member.js — dua hal beda, jangan digabung: bisa dikirimi saldo
     ≠ punya akun+PIN yang bisa dipakai login).

   dikapay:profile / dikapay:security
     TIDAK BERUBAH bentuknya — tetap kunci yang sama yang sudah dibaca semua
     halaman lain (akun.js, script.js, transfer-member.js, notif-store.js).
     Diperlakukan sebagai "cache sesi aktif": begitu seseorang berhasil
     login/daftar di sini, KEDUANYA ditimpa dari data akun yang baru saja
     dipakai — supaya halaman lain otomatis lihat identitas yang benar tanpa
     perlu tahu apa-apa soal dikapay:account. PIN login & PIN Transaksi di
     Akun SATU PIN YANG SAMA (security.pin) — sengaja disatukan, pola DANA
     asli (satu PIN buka app & konfirmasi transaksi).

   dikapay:settings:biometric === "1"
     Preferensi device-wide (bukan per-akun — biometrik nempel ke
     PERANGKAT, bukan ke satu nomor tertentu), diset via toggle "Login
     dengan Biometrik" di Akun > Keamanan (akun.js). Dibaca DI SINI untuk
     menentukan tampilan step "login": ada → tombol biometrik jadi
     PRIORITAS UTAMA + link kecil "Pakai PIN saja"; tidak ada → keypad PIN
     langsung jadi cara masuk utama.

   TODO fase 2: seluruh modul ini diganti alur backend (POST /api/auth/
   register, POST /api/auth/login) lewat api.js — termasuk validasi nomor,
   PIN, dan biometrik (WebAuthn asli). Direktori dikapay:account:* dihapus
   total saat itu terjadi.
   =========================================================================== */

"use strict";

(function () {
  var RM = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (window.DikaAuth && DikaAuth.isLoggedIn()) {
    window.location.replace(DikaAuth.HOME_PAGE);
    return;
  }

  function onReady(fn) {
    var ran = false;
    function boot() {
      if (ran) return;
      ran = true;
      try { fn(); }
      catch (e) { console.error("auth-flow: init halaman gagal:", e); }
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }

  function $(id) { return document.getElementById(id); }

  /* ---- Nomor HP: normalisasi + validasi (pola register.js lama) ------- */

  function normPhone(v) {
    var d = String(v || "").replace(/[^\d+]/g, "");
    if (d.indexOf("+62") === 0) d = "0" + d.slice(3);
    else if (d.indexOf("62") === 0 && d.length > 10) d = "0" + d.slice(2);
    return d.replace(/\D/g, "");
  }
  function prettyPhone(d) {
    if (d.length <= 4) return d;
    if (d.length <= 8) return d.slice(0, 4) + "-" + d.slice(4);
    return d.slice(0, 4) + "-" + d.slice(4, 8) + "-" + d.slice(8);
  }
  function isPhone(d) { return /^08[1-9][0-9]{6,11}$/.test(d); }

  /* Prefix-nya benar-benar milik operator Indonesia? isPhone() di atas cuma
     mengecek BENTUK (08xx + panjang), jadi nomor karangan seperti 0866649916
     tetap lolos padahal 0866 bukan prefix siapa pun.

     Sumber prefix = operator-detect.js (window.DikaOperator) — SATU-SATUNYA
     peta prefix di project ini, sengaja TIDAK disalin ke sini supaya kalau
     Kominfo merilis prefix baru cukup satu file yang diperbarui (lihat
     CLAUDE.md "Sesi / Auth"). Hasil detect() hanya dipakai sebagai
     "dikenal / tidak" — nama operatornya TIDAK PERNAH ditampilkan ke member,
     pesan errornya sengaja umum & tidak menyebut operator mana pun.

     Kalau operator-detect.js gagal dimuat, jangan kunci member di luar
     aplikasi: anggap lolos (fail-open) dan cukup catat di console — pola
     yang sama seperti fail-open guard() di auth.js. */
  function isKnownPrefix(d) {
    try {
      if (!window.DikaOperator || typeof DikaOperator.detect !== "function") {
        console.warn("auth-flow: operator-detect.js tidak tersedia — cek prefix dilewati.");
        return true;
      }
      return !!DikaOperator.detect(d);
    } catch (e) {
      console.error("auth-flow: cek prefix gagal:", e);
      return true;
    }
  }

  function initials(name) {
    var p = String(name).trim().split(/\s+/).filter(Boolean);
    if (!p.length) return "?";
    if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
    return (p[0][0] + p[p.length - 1][0]).toUpperCase();
  }
  function firstName(name) {
    return String(name || "").trim().split(/\s+/)[0] || "Member";
  }

  /* ---- Deteksi PIN lemah/gampang ditebak (langkah "buat PIN", SEBELUM
     konfirmasi — lihat CLAUDE.md) — bukan pemeriksaan lengkap ala penilai
     kekuatan password sungguhan, cukup pola paling umum dipakai orang. TIDAK
     memblokir, cuma memicu modal peringatan (member tetap boleh lanjut). */
  var WEAK_PIN_COMMON = [
    "121212", "212121", "010101", "101010",
    "112233", "123123", "112211", "123321",
    "102030", "111222", "222111", "696969",
  ];
  function isWeakPin(pin) {
    if (!/^\d{6}$/.test(pin)) return false;
    if (/^(\d)\1{5}$/.test(pin)) return true;            // semua digit sama: 111111, 222222, ...
    if ("0123456789".indexOf(pin) !== -1) return true;    // berurutan naik: 123456, 234567, ...
    if ("9876543210".indexOf(pin) !== -1) return true;    // berurutan turun: 987654, ..., 654321
    if (WEAK_PIN_COMMON.indexOf(pin) !== -1) return true; // pola umum lain yang gampang ditebak
    return false;
  }

  /* ---- Direktori akun (kunci: dikapay:account:<digit>) ----------------
     TODO fase 2: ganti GET/POST /api/auth/* lewat api.js — lihat header file. */
  var ACCOUNT_PREFIX = "dikapay:account:";
  function findAccount(digits) {
    try {
      var raw = localStorage.getItem(ACCOUNT_PREFIX + digits);
      if (!raw) return null;
      var a = JSON.parse(raw);
      if (!a || !a.name || !a.pin) return null;

      /* SELF-HEALING: `a.phone` di sini murni TAMPILAN dari `digits` —
         kunci penyimpanan yang dipakai untuk mencari akun ini sendiri.
         Tidak pernah ada alasan sah keduanya berbeda, jadi dibangun ulang
         di sini tiap kali dibaca (pola yang sama seperti `loadMargin()`
         memvalidasi ulang nilai tersimpan). Ini membersihkan akun yang
         sempat tersimpan dengan `phone` kotor dari bug lama — field nomor
         HP di halaman ini yang belum disaring saat mengetik (baru
         diperbaiki), atau field "Nomor HP" di Edit Profil (akun.js) yang
         juga belum menyaring input sebelum ini. Ditulis balik supaya
         perbaikannya permanen, bukan cuma bersih di tampilan sesaat. */
      var bersih = prettyPhone(digits);
      if (a.phone !== bersih) {
        a.phone = bersih;
        saveAccount(digits, a);
      }
      return a;
    } catch (e) { return null; }
  }
  function saveAccount(digits, account) {
    try { localStorage.setItem(ACCOUNT_PREFIX + digits, JSON.stringify(account)); }
    catch (e) { console.error("auth-flow: gagal menyimpan akun:", e); }
  }

  /* ---- Sesi aktif: sinkronkan dikapay:profile/security dari akun yang
     baru saja dipakai login/daftar, lalu tandai login lewat DikaAuth. Email
     lama DIPERTAHANKAN kalau nomornya sama dengan sesi sebelumnya (mis.
     ganti PIN lalu login ulang) — dianggap identitas beda kalau nomornya
     beda, jadi email dikosongkan supaya tidak salah tempel ke orang lain. */
  function activateSession(account) {
    try {
      var existing = null;
      try { existing = JSON.parse(localStorage.getItem("dikapay:profile") || "null"); } catch (e) {}
      var sameIdentity = existing && normPhone(existing.phone || "") === normPhone(account.phone);

      /* Field baru dari formulir pendaftaran (email, alamat, tanggal lahir,
         jenis kelamin) — utamakan yang ada di AKUN (selalu terisi untuk
         akun baru sejak formulir ini diperluas), jatuh ke profil sesi
         sebelumnya kalau identitasnya sama (akun lama dari sebelum
         formulir diperluas, belum punya field ini sama sekali). */
      localStorage.setItem("dikapay:profile", JSON.stringify({
        name: account.name,
        phone: account.phone,
        email: account.email || (sameIdentity && existing.email) || "",
        alamat: account.alamat || (sameIdentity && existing.alamat) || "",
        tanggalLahir: account.tanggalLahir || (sameIdentity && existing.tanggalLahir) || "",
        jenisKelamin: account.jenisKelamin || (sameIdentity && existing.jenisKelamin) || "",
      }));
      localStorage.setItem("dikapay:security", JSON.stringify({ pinCreated: true, pin: account.pin }));
    } catch (e) { console.error("auth-flow: gagal menyinkronkan sesi:", e); }

    /* Catat perangkat ini sebagai sesi aktif — dipanggil SETELAH profil
       ditulis, karena daftar perangkat disimpan per nomor member dan
       nomornya dibaca dari `dikapay:profile`. Sengaja tidak ditunggu:
       gagal mencatat perangkat tidak boleh menahan member masuk. */
    try {
      if (window.DikaPerangkat) {
        window.DikaPerangkat.catat().catch(function (e) {
          console.error("auth-flow: gagal mencatat perangkat:", e);
        });
      }
    } catch (e) { console.error("auth-flow: perangkat:", e); }

    DikaAuth.login();
  }

  /* ---- Pesan sambutan member baru — bervariasi, nada hangat & playful -- */
  function pickOne(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  var WELCOME_MESSAGES = [
    { title: "Halo, sepertinya kamu member baru! 👋", text: "Yuk, buat akun DikaPay dalam waktu kurang dari semenit. Gampang banget, kok!" },
    { title: "Wah, nomor ini belum terdaftar!", text: "Tenang, daftar di DikaPay cepat kok — cukup nama & PIN 6 digit. Ayo mulai!" },
    { title: "Selamat datang, calon member DikaPay! ✨", text: "Satu langkah lagi buat mulai transaksi tanpa ribet. Isi nama dan buat PIN kamu, yuk." },
    { title: "Kamu member baru, ya? Asyik! 🎉", text: "DikaPay siap jadi teman transaksimu. Isi data singkat ini buat mulai." },
  ];

  onReady(function () {
    var app = $("app");
    var splash = $("splash");

    var stepPhone = $("stepPhone");
    var stepGooglePhone = $("stepGooglePhone");
    var stepRegister = $("stepRegister");
    var stepRegisterMore = $("stepRegisterMore");
    var stepRegisterOtp = $("stepRegisterOtp");
    var stepRegisterPin = $("stepRegisterPin");
    var stepLogin = $("stepLogin");
    var stepLogin2FA = $("stepLogin2FA");
    var stepSuccess = $("stepSuccess");
    var steps = [stepPhone, stepGooglePhone, stepRegister, stepRegisterMore, stepRegisterOtp, stepRegisterPin, stepLogin, stepLogin2FA, stepSuccess];

    var login2faCode = $("login2faCode");
    var login2faError = $("login2faError");
    var login2faErrorText = $("login2faErrorText");
    var login2faSubmit = $("login2faSubmit");
    var login2faToggle = $("login2faToggle");
    var login2faLead = $("login2faLead");

    var phoneForm = $("phoneForm");
    var phoneInput = $("phoneInput");
    var phoneField = $("phoneField");
    var phoneErrBox = $("phoneErrBox");
    var phoneErrText = $("phoneErrText");
    var phoneBtn = $("phoneBtn");

    var gpForm = $("gpForm");
    var gpPhoneInput = $("gpPhoneInput");
    var gpPhoneField = $("gpPhoneField");
    var gpErrBox = $("gpErrBox");
    var gpErrText = $("gpErrText");
    var gpPhoneBtn = $("gpPhoneBtn");
    var gpBackBtn = $("gpBackBtn");

    var regNameForm = $("regNameForm");
    var regNameInput = $("regName");
    var regNameField = $("regNameField");
    var regEmailInput = $("regEmail");
    var regEmailField = $("regEmailField");
    var regErrBox = $("regErrBox");
    var regErrText = $("regErrText");

    var regMoreForm = $("regMoreForm");
    var regAlamatInput = $("regAlamat");
    var regAlamatField = $("regAlamatField");
    var regTglInput = $("regTglLahir");
    var regTglField = $("regTglField");
    var regGenderField = $("regGenderField");
    var regGender = $("regGender");
    var moreErrBox = $("moreErrBox");
    var moreErrText = $("moreErrText");
    var regAlamatGpsBtn = $("regAlamatGpsBtn");
    var regAlamatGpsLabel = $("regAlamatGpsLabel");

    var bioBlock = $("bioBlock");
    var pinBlock = $("pinBlock");
    var bioBtn = $("bioBtn");
    var bioLabel = $("bioLabel");

    var weakPinOverlay = $("weakPinOverlay");
    var weakPinRetry = $("weakPinRetry");
    var weakPinContinue = $("weakPinContinue");

    var regProgress = $("regProgress");
    var regProgressText = $("regProgressText");

    if (!app || !stepPhone) return; // markup tidak lengkap, jangan lanjut

    var state = {
      phoneDigits: "", account: null, googleIdToken: "", googleProfile: null,
      pendingLogin: null, login2faRecovery: false,
      /* null | "login" (Langkah B: Google sudah terhubung, PIN wajib) |
         "link" (Langkah C.b/C.c: nomor sudah member, tautkan google_email
         setelah PIN cocok) — dibaca loginPin.onComplete untuk memutuskan
         apakah hubungkanGoogle() perlu dipanggil sebelum activateSession().
         Di-reset ke null tiap kali cabang login MANUAL (bukan Google)
         dimasuki, supaya tidak ada sisa dari percobaan Google sebelumnya. */
      googleFlow: null,
    };
    var regState = {
      name: "", email: "", alamat: "", tanggalLahir: "", jenisKelamin: "",
      subStep: "new", pinNew: "", pendingWeakPin: "",
      otp: "", otpTimer: 0,
      /* "sms" (default, OTP dummy lama) | "email" (Cabang Google C.a — kode
         BENERAN dikirim ke email, verifikasi ditunda sampai commitGoogleRegistration).
         Direset ke "sms" tiap enterRegisterBranch() (mulai Cabang A dari nol). */
      otpChannel: "sms",
    };

    /* Nomor yang backend jawab "sudah terdaftar" (respons 409 api-daftar)
       tapi belum ada akun lokal di perangkat ini — dipakai handler submit
       nomor HP untuk memaksa cabang MASUK (PIN diverifikasi ke backend). */
    var knownRegistered = "";

    function setBalanceDari(member) {
      try {
        var s = member && isFinite(Number(member.saldo)) ? Math.max(0, Number(member.saldo)) : 0;
        localStorage.setItem("dikapay:balance", String(s));
        /* Tera "kapan ditulis" — dibaca member-sync.js sebagai pertahanan
           anti-timpa (lihat komentar besar "TOKEN & SALDO HARUS PER-AKUN"
           di member-sync.js): polling latar yang kebetulan sedang di tengah
           jalan TIDAK BOLEH menimpa saldo yang baru saja dikonfirmasi login
           ini dengan data yang lebih basi. */
        localStorage.setItem("dikapay:balance:ts", String(Date.now()));
      } catch (e) {}
    }

    /* api-login.php SEKARANG ikut mengirim "device_token" (lihat api.js:
       masuk() menumpangkannya ke objek member yang di-resolve) — disimpan
       DI SINI, di kedua tempat member berhasil login lewat backend (login
       penuh & auto-login setelah daftar), supaya member-sync.js langsung
       bisa memakai jalur api-status.php mulai sesi berikutnya, tanpa perlu
       menunggu member membuka & menutup layar kunci PIN dulu. Tidak ada apa
       pun kalau device_token tidak ikut dikirim (member lama / backend
       belum sempat menyertakannya) — member-sync.js tetap akan
       mendapatkannya lewat jalur PIN layar kunci sebagai fallback.

       `nomorDigits` WAJIB diisi eksplisit (nomor akun yang BARU SAJA login/
       daftar) — BUKAN dibiarkan member-sync.js menebak dari dikapay:profile,
       karena di jalur "backend" (lihat onComplete loginPin di bawah) fungsi
       ini pernah dipanggil SEBELUM activateSession() menulis profil akun
       baru, sehingga token bisa tersimpan ke slot akun LAMA. Parameter
       eksplisit menghapus ketergantungan pada urutan itu — lihat catatan
       "TOKEN & SALDO HARUS PER-AKUN" di member-sync.js. */
    function simpanTokenDari(member, nomorDigits) {
      try {
        if (window.DikaMemberSync && member && member.device_token) {
          DikaMemberSync.simpanToken(member.device_token, nomorDigits);
        }
      } catch (e) { console.error("auth-flow: gagal menyimpan device_token:", e); }
    }

    /* ---- Indikator langkah pendaftaran ---------------------------------
       Peta step -> nomor. Step yang TIDAK ada di peta ini (nomor HP, cabang
       masuk, sukses) berarti indikator disembunyikan sepenuhnya — itu
       bukan bagian dari "isi formulir pendaftaran". */
    var PROGRESS_STEP = { "register": 1, "register-more": 2, "register-otp": 3, "register-pin": 4 };
    var PROGRESS_LABEL = { 1: "Data Diri", 2: "Info Tambahan", 3: "Verifikasi Nomor", 4: "Buat PIN" };
    var PROGRESS_TOTAL = 4;

    function perbaruiProgress(target) {
      if (!regProgress) return;
      /* Cabang Google (C): cuma 3 langkah nyata (nomor -> OTP email -> PIN),
         "Info Tambahan" dilewati sama sekali — indikator 1-4 akan salah
         label kalau tetap dipakai, jadi disembunyikan total di sini. */
      if (regState.otpChannel === "email") { regProgress.hidden = true; return; }
      var n = target ? PROGRESS_STEP[target.dataset.step] : null;
      if (!n) { regProgress.hidden = true; return; }
      regProgress.hidden = false;
      regProgress.querySelectorAll(".auth-progress__dot").forEach(function (dot) {
        var i = Number(dot.dataset.n);
        dot.classList.toggle("is-active", i === n);
        dot.classList.toggle("is-done", i < n);
      });
      regProgress.querySelectorAll(".auth-progress__line").forEach(function (line, i) {
        line.classList.toggle("is-done", i + 1 < n);
      });
      if (regProgressText) {
        regProgressText.textContent = "Langkah " + n + " dari " + PROGRESS_TOTAL + " — " + PROGRESS_LABEL[n];
      }
    }

    /* ---- Perpindahan step (fade+slide via .is-in, lihat auth.css) ----- */
    function goTo(target) {
      perbaruiProgress(target);
      steps.forEach(function (el) {
        if (!el) return;
        if (el === target) {
          el.hidden = false;
          el.classList.remove("is-in");
          void el.offsetWidth; // restart animasi walau step yang sama dipakai lagi
          el.classList.add("is-in");
        } else {
          el.hidden = true;
          el.classList.remove("is-in");
        }
      });
    }

    /* ---- Splash: particle + auto-lanjut (atau ketuk utk lompat) ------- */
    function spawnParticles() {
      if (RM) return;
      try {
        var frag = document.createDocumentFragment();
        for (var i = 0; i < 16; i++) {
          var p = document.createElement("span");
          p.className = "auth-particle";
          p.style.setProperty("--pLeft", (Math.random() * 100).toFixed(1) + "%");
          p.style.setProperty("--pSize", (3 + Math.random() * 4).toFixed(1) + "px");
          p.style.setProperty("--pOpacity", (0.25 + Math.random() * 0.4).toFixed(2));
          p.style.setProperty("--pDur", (5 + Math.random() * 5).toFixed(1) + "s");
          p.style.setProperty("--pDelay", (-Math.random() * 9).toFixed(1) + "s");
          p.style.setProperty("--pDrift", (Math.random() * 40 - 20).toFixed(0) + "px");
          frag.appendChild(p);
        }
        splash.insertBefore(frag, splash.firstChild);
      } catch (e) { console.error("auth-flow: gagal membuat partikel splash:", e); }
    }
    var splashDone = false;
    var splashHideTimer = 0;
    /* Durasi transisi CSS `.auth-splash` (opacity 0.45s, lihat auth.css) +
       sedikit buffer. Dipakai SEBAGAI ANGKA, bukan cuma didokumentasikan —
       kalau durasi transisinya diubah di auth.css, ubah juga angka ini. */
    var SPLASH_FADE_MS = 500;

    function dismissSplash() {
      if (splashDone) return;
      splashDone = true;
      splash.classList.add("is-leaving");
      /* BUG yang ditemukan & diperbaiki saat menambah step pendaftaran
         (poin 1/4): timer 1,7 dtk ini dulu SELALU memanggil goTo(stepPhone)
         apa pun yang sedang terjadi. Kalau member (atau pengujian
         otomatis) sempat mengisi & submit nomor HP DALAM 1,7 dtk pertama,
         timer ini menariknya balik ke step nomor HP di tengah proses
         daftar/masuk — goTo() menyembunyikan SEMUA step lain tanpa pandang
         bulu, termasuk step yang baru saja dimasuki. Sekarang hanya
         pindah ke stepPhone kalau memang belum ada progres sama sekali
         (nomor belum pernah disubmit). */
      if (!state.phoneDigits) {
        goTo(stepPhone);
        try { phoneInput.focus(); } catch (e) {}
      }
      /* BUG "splash nyangkut di atas form": CSS `.auth-splash.is-leaving`
         (opacity:0 + visibility:hidden) SUDAH benar sendirian dalam
         kondisi normal, TAPI itu satu-satunya jaring — murni mengandalkan
         transisi CSS selesai dengan mulus. Kalau WebView sempat dibekukan
         Android (app di-background) TEPAT di tengah 0,45 dtk fade ini,
         atau kelas `is-leaving` entah bagaimana terlepas sebelum
         transisinya kelar, splash bisa "berhenti setengah jalan" —
         terlihat menumpuk transparan di atas form, masih ikut menangkap
         sentuhan (z-index:50 tetap aktif selama belum `visibility:hidden`
         penuh). Pola yang SAMA dengan bug bfcache `.is-leaving` di
         produk-ui.js (lihat CLAUDE.md "Halaman BLANK karena .is-leaving
         membeku di bfcache") — jangan cuma percaya kelas CSS, paksa WUJUD
         AKHIRNYA (`hidden`) sebagai jaring pengaman keras begitu durasi
         transisinya lewat, supaya splash BENAR-BENAR keluar dari layout &
         berhenti menangkap sentuhan, bukan cuma "kelihatan" hilang. */
      window.clearTimeout(splashHideTimer);
      splashHideTimer = window.setTimeout(function () {
        splash.hidden = true;
      }, SPLASH_FADE_MS);
    }
    spawnParticles();
    splash.addEventListener("click", dismissSplash);
    setTimeout(dismissSplash, RM ? 0 : 1700);

    /* Jaring pengaman KEDUA, khusus jalur "kembali dari background" yang
       tidak tertangkap timer di atas: `pageshow` menyala setiap kali
       halaman ini TERLIHAT lagi (termasuk saat WebView dibangunkan dari
       kondisi beku, bukan cuma navigasi bfcache browser biasa). Kalau
       splash SUDAH pernah didismiss (splashDone true) tapi entah kenapa
       belum benar-benar `hidden` di titik ini — WebView-nya sempat beku
       sebelum timer 500 md di atas sempat jalan — selesaikan paksa di
       sini juga. TIDAK pernah menyalakan splash yang belum pernah
       didismiss (splashDone masih false berarti memang belum waktunya). */
    window.addEventListener("pageshow", function () {
      if (!splashDone || splash.hidden) return;
      splash.classList.add("is-leaving");
      splash.hidden = true;
    });

    /* ---- Helper error field (pola login.js/register.js lama) -----------
       `.auth-field-plain` (tanggal lahir, jenis kelamin) ikut ditangani di
       sini — sama-sama punya `.aff__err` di dalamnya, cuma bukan floating-
       label seperti `.aff` (lihat auth.css). */
    function fieldErr(input, msg) {
      var wrap = input.closest(".aff") || input.closest(".auth-field-plain");
      if (!wrap) return;
      var slot = wrap.querySelector(".aff__err");
      if (slot) slot.textContent = msg;
      wrap.classList.add("is-error");
      wrap.classList.remove("is-shake");
      void wrap.offsetWidth;
      wrap.classList.add("is-shake");
    }
    function clearFieldErr(field) {
      field.classList.remove("is-error", "is-shake");
    }
    /* HANYA @gmail.com (keputusan produk). Verifikasi email belum berjalan,
       dan membatasinya ke satu penyedia yang pasti bisa dijangkau membuat
       alurnya bisa diandalkan saat verifikasi nyata menyusul.

       Dicek DUA lapis: bentuk email yang sah DULU, baru domainnya — supaya
       "budi@" tidak lolos cuma karena mengandung kata gmail.
       Subdomain seperti @mail.gmail.com SENGAJA ditolak: itu bukan alamat
       Gmail biasa.

       ATURAN YANG SAMA ADA DI DUA FILE (auth-flow.js saat mendaftar, akun.js
       saat mengubah email di Data Diri). Kalau salah satu diubah, ubah juga
       yang lain — kalau tidak, member bisa mendaftar dengan domain yang lalu
       ditolak saat menyuntingnya, atau sebaliknya. */
    function validEmail(v) {
      var t = String(v || "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return false;
      return /@gmail\.com$/i.test(t);
    }

    /* ---- Toast kecil (markup #authToast sudah ada dari awal, belum
       pernah disambungkan ke apa pun sampai sekarang — dipakai "Kirim
       Ulang Kode" OTP di bawah). */
    var authToastEl = $("authToast");
    var authToastTimer = 0;
    function showToast(msg) {
      if (!authToastEl) return;
      authToastEl.textContent = msg;
      authToastEl.hidden = false;
      void authToastEl.offsetWidth;
      authToastEl.classList.add("is-show");
      window.clearTimeout(authToastTimer);
      authToastTimer = window.setTimeout(function () {
        authToastEl.classList.remove("is-show");
        window.setTimeout(function () { authToastEl.hidden = true; }, 360);
      }, 2400);
    }

    /* ---- Keypad PIN generik (dipakai step register-pin & login) ------- */
    function createPinPad(opts) {
      var buf = "";
      var locked = false;
      var dots = Array.prototype.slice.call(opts.dotsEl.querySelectorAll(".auth-pin-dot"));

      function render() {
        dots.forEach(function (d, i) { d.classList.toggle("is-filled", i < buf.length); });
      }
      function reset() {
        buf = "";
        locked = false;
        render();
      }
      function shake(afterMsg) {
        opts.dotsEl.classList.add("is-error");
        setTimeout(function () {
          opts.dotsEl.classList.remove("is-error");
          reset();
          if (afterMsg) opts.hintEl.textContent = afterMsg;
        }, 420);
      }
      function setHint(t) { opts.hintEl.textContent = t; }

      opts.keypadEl.addEventListener("click", function (e) {
        try {
          var btn = e.target.closest("button[data-k]");
          if (!btn || locked) return;
          var k = btn.dataset.k;
          if (k === "del") { buf = buf.slice(0, -1); render(); return; }
          if (buf.length >= 6) return;
          buf += k;
          render();
          if (buf.length === 6) {
            locked = true;
            setTimeout(function () {
              locked = false;
              opts.onComplete(buf);
            }, 180);
          }
        } catch (err) { console.error("auth-flow: input keypad gagal:", err); }
      });

      /* setBusy: kunci keypad + redupkan selama panggilan jaringan (daftar/
         masuk) berjalan, tanpa mengosongkan buffer — dipakai commitRegistration
         & fallback login backend. */
      function setBusy(on) {
        locked = !!on;
        opts.keypadEl.classList.toggle("is-busy", !!on);
      }

      return { reset: reset, shake: shake, setHint: setHint, setBusy: setBusy };
    }

    /* ===== STEP: nomor HP → cari akun → cabang =========================== */

    function clearPhoneErr() {
      phoneErrBox.hidden = true;
      clearFieldErr(phoneField);
    }
    function showPhoneErr(msg) {
      phoneErrText.textContent = msg;
      phoneErrBox.hidden = false;
      fieldErr(phoneInput, msg);
    }
    /* SARING SAAT MENGETIK, bukan cuma divalidasi setelah submit.
       BUG yang diperbaiki: field ini sebelumnya hanya membersihkan pesan
       error di listener `input`, tidak pernah menyaring isinya sendiri —
       `type="tel"` TIDAK memblokir apa pun, ia cuma memunculkan keypad
       angka di HP. Simbol/huruf yang ter-ketik (atau ter-tempel dari
       clipboard/autofill) lolos masuk field dan bahkan sempat tersimpan
       ke `dikapay:account:*` (lihat pembersihan di bawah) — itulah yang
       menghasilkan bug nyata "####**349466".

       Polanya SAMA PERSIS dengan `onPhoneInput()` di produk-page.js:
       `OP.sanitize()` lalu tulis balik HANYA kalau memang berubah (supaya
       caret tidak melompat ke ujung tiap kali mengetik digit yang sah). */
    phoneInput.addEventListener("input", function () {
      try {
        if (window.DikaOperator && typeof DikaOperator.sanitize === "function") {
          var bersih = DikaOperator.sanitize(phoneInput.value);
          if (phoneInput.value !== bersih) phoneInput.value = bersih;
        } else {
          /* Fail-safe kalau operator-detect.js gagal dimuat: tetap saring
             manual (digit saja) daripada membiarkan field terbuka lebar. */
          var digitSaja = String(phoneInput.value || "").replace(/\D/g, "").slice(0, 16);
          if (phoneInput.value !== digitSaja) phoneInput.value = digitSaja;
        }
      } catch (err) { console.error("auth-flow: gagal menyaring nomor HP:", err); }
      clearPhoneErr();
    });

    /* Akun ini sedang DIBANNED -> tolak login sama sekali, apa pun PIN/
       biometriknya nanti — popup "Akun Kamu Telah Dibanned" tampil ULANG
       dengan sisa waktu ter-update, bukan cuma sekali saat banned terjadi.
       Dicek dari NOMOR DI FORM (bukan dikapay:profile, yang bisa jadi
       identitas beda) supaya banned akun A tidak pernah bocor ke nomor lain.

       DUA sumber banned, storage TERPISAH, dicek keduanya: PIN transaksi
       salah 3x (pin-transaksi.js, 2 jam) DAN PIN auto-lock salah 3x
       (auto-lock.js, 3 jam) — beda konteks, beda durasi, tapi sama-sama
       memakai popup DikaPinTransaksi.tampilkanBanned(), cuma teksnya
       (opts.pesan) disesuaikan sumbernya.

       Dipakai submit nomor HP cabang MANUAL (phoneForm) DAN cabang GOOGLE
       (gpForm, lihat enterGooglePhoneStep) — satu implementasi, supaya
       banned lokal tidak bisa dilewati cuma dengan lewat "Lanjutkan dengan
       Google" alih-alih mengetik nomor manual. Return true = pemanggil
       WAJIB berhenti (popup sudah ditampilkan). */
    function tolakJikaBanned(digits) {
      if (window.DikaPinTransaksi && typeof DikaPinTransaksi.cekBanned === "function") {
        var banAktif = DikaPinTransaksi.cekBanned(digits);
        if (banAktif) {
          DikaPinTransaksi.tampilkanBanned(banAktif);
          return true;
        }
      }
      if (window.DikaLock && typeof DikaLock.cekBanned === "function") {
        var banLock = DikaLock.cekBanned(digits);
        if (banLock) {
          DikaPinTransaksi.tampilkanBanned(banLock, { pesan: DikaLock.PESAN_BANNED });
          return true;
        }
      }
      return false;
    }

    phoneForm.addEventListener("submit", function (e) {
      e.preventDefault();
      try {
        clearPhoneErr();
        var digits = normPhone(phoneInput.value);
        if (!digits) { showPhoneErr("Nomor HP wajib diisi."); return; }
        if (!isPhone(digits)) { showPhoneErr("Nomor HP tidak valid. Contoh: 081234567890."); return; }
        if (!isKnownPrefix(digits)) {
          showPhoneErr("Nomor HP sepertinya tidak valid. Coba periksa lagi, ya.");
          return;
        }
        if (tolakJikaBanned(digits)) return;

        state.phoneDigits = digits;
        state.googleFlow = null; // cabang MANUAL -- buang sisa flag dari percobaan Google sebelumnya (kalau ada)
        var account = findAccount(digits);

        /* Sudah terbukti terdaftar di backend (409 saat coba daftar) tapi
           tanpa akun lokal (didaftarkan di perangkat lain) -> paksa cabang
           MASUK dengan akun-stub; PIN-nya diverifikasi ke api-login.php,
           bukan ke salinan lokal (yang memang tidak ada). */
        if (!account && knownRegistered && knownRegistered === digits) {
          account = { name: "Member DikaPay", phone: prettyPhone(digits), pin: null, backendOnly: true };
        }

        if (account) {
          state.account = account;
          enterLoginBranch(account);
          return;
        }

        /* TIDAK ADA cache lokal untuk nomor ini — BUKAN otomatis berarti
           member baru. dikapay:account:<digit> cuma CACHE SESI di perangkat
           ini; ia hilang total kalau APK di-uninstall/install ulang atau
           storage dibersihkan (lihat CLAUDE.md "Build APK" — ini pola
           pengujian yang memang biasa dipakai di project ini), padahal
           akunnya tetap ada di server. BUG yang diperbaiki: sebelum ini,
           tidak ada cache lokal langsung disimpulkan "member baru" dan
           lompat ke wizard pendaftaran (Langkah 1) tanpa pernah bertanya ke
           backend dulu — member lama yang device-nya baru saja
           di-reinstall salah diarahkan ke pendaftaran padahal akunnya
           sudah ada. Sekarang kita cek ke backend dulu (endpoint yang
           sudah ada, dipakai juga oleh transfer-member.js untuk
           memastikan nomor_hp adalah member DikaPay) SEBELUM memutuskan
           cabang mana yang ditampilkan. */
        verifikasiKeBackend(digits);
      } catch (err) {
        console.error("auth-flow: submit nomor gagal:", err);
        showPhoneErr("Terjadi kesalahan. Coba lagi.");
      }
    });

    function setPhoneChecking(on) {
      if (phoneBtn) {
        phoneBtn.classList.toggle("is-loading", on);
        phoneBtn.disabled = on;
      }
      if (phoneInput) phoneInput.disabled = on;
    }

    /* `DikaApi.cekMemberTransfer` sudah dites end-to-end (dipakai
       transfer-member.js) dan menjawab persis pertanyaan yang kita
       butuhkan di sini — "apakah nomor_hp ini member DikaPay terdaftar" —
       tanpa perlu PIN. Dipakai HANYA sebagai gerbang cabang login/daftar;
       tidak menulis apa pun. Kalau nomor berganti sebelum respons datang
       (member mengetik ulang lalu submit lagi), hasil yang telat ini
       diabaikan (dicek lewat state.phoneDigits). */
    function verifikasiKeBackend(digits) {
      if (!window.DikaApi || typeof DikaApi.cekMemberTransfer !== "function") {
        /* api.js belum siap -> jangan menebak ke arah yang salah (dulu ini
           langsung dianggap member baru). Tanpa cara memastikan, tetap
           beri jalan ke wizard supaya member yang BENAR-BENAR baru tidak
           terjebak, tapi 409 di langkah PIN sudah jadi jaring pengaman
           kalau ternyata nomor ini sudah terdaftar (lihat regPinToLoginBtn). */
        console.warn("auth-flow: api.js belum siap — tidak bisa memverifikasi nomor ke backend.");
        enterRegisterBranch();
        return;
      }

      setPhoneChecking(true);
      DikaApi.cekMemberTransfer(digits).then(
        function (m) {
          setPhoneChecking(false);
          if (state.phoneDigits !== digits) return; // nomor sudah diganti, abaikan
          var account = { name: (m && m.nama) || "Member DikaPay", phone: prettyPhone(digits), pin: null, backendOnly: true };
          state.account = account;
          enterLoginBranch(account);
        },
        function (err) {
          setPhoneChecking(false);
          if (state.phoneDigits !== digits) return;
          if (err && err.kode === "tidak-terdaftar") {
            enterRegisterBranch();
            return;
          }
          /* Gagal jaringan/timeout/server — BUKAN alasan sah untuk menebak
             "member baru" (itu persis bug yang sedang diperbaiki). Beri
             tahu apa adanya dan biarkan member coba lagi, tetap di step
             nomor HP. */
          console.warn("auth-flow: gagal memeriksa status pendaftaran nomor:",
            err && (err.sebab || err.pesanMember));
          showPhoneErr(
            (err && err.pesanMember) || "Tidak bisa memeriksa nomor ini sekarang. Coba lagi, ya."
          );
        }
      );
    }

    /* Login Google sementara dinonaktifkan; tombol hanya membuka informasi.
       Alur login/daftar melalui nomor HP tetap menjadi jalur aktif. */
    var googleBtn = $("googleBtn");
    var googleDevOverlay = $("googleDevOverlay");
    var googleDevPushed = false;

    function closeGoogleInfo(fromPop) {
      if (!googleDevOverlay || !googleDevOverlay.classList.contains("is-open")) return;
      googleDevOverlay.classList.remove("is-open");
      document.documentElement.style.overflow = "";
      var didPush = googleDevPushed;
      googleDevPushed = false;
      if (!fromPop && didPush) { try { history.back(); } catch (e) {} }
    }

    function openGoogleInfo() {
      if (!googleDevOverlay || googleDevOverlay.classList.contains("is-open")) return;
      googleDevOverlay.classList.add("is-open");
      document.documentElement.style.overflow = "hidden";
      try { history.pushState({ dikaGoogleDev: 1 }, ""); googleDevPushed = true; }
      catch (e) { googleDevPushed = false; }
    }

    if (googleBtn) googleBtn.addEventListener("click", openGoogleInfo);
    if (googleDevOverlay) {
      var googleDevClose = $("googleDevClose");
      if (googleDevClose) googleDevClose.addEventListener("click", closeGoogleInfo);
      googleDevOverlay.addEventListener("click", function (e) {
        if (e.target === googleDevOverlay) closeGoogleInfo();
      });
      window.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && googleDevOverlay.classList.contains("is-open")) closeGoogleInfo();
      });
      window.addEventListener("popstate", function () {
        if (googleDevOverlay.classList.contains("is-open")) closeGoogleInfo(true);
      });
    }

    /* ===== CABANG GOOGLE (C): akun belum terhubung → minta nomor HP ======
       Nama & email dari Google SUDAH terverifikasi -- ditampilkan read-only,
       TIDAK diminta ulang (beda dari Cabang A yang menanyakannya dari nol).
       Submit nomor HP di sini bercabang (lihat DikaApi.cekMemberTransfer):
         - "tidak-terdaftar" (belum jadi member sama sekali) -> C.a: daftar
           baru lewat OTP EMAIL sungguhan (bukan OTP SMS dummy) + PIN baru.
         - ditemukan (sudah jadi member, entah sudah/belum tertaut akun
           Google ini) -> C.b/C.c: minta PIN akun itu sebagai bukti
           kepemilikan (reuse enterLoginBranch/loginPin persis Langkah B);
           backend (hubungkanGoogle, dipanggil dari loginPin.onComplete)
           yang memutuskan boleh ditautkan (C.b) atau ditolak karena sudah
           tertaut akun Google LAIN (C.c). */
    function clearGpErr() {
      if (gpErrBox) gpErrBox.hidden = true;
      if (gpPhoneField) clearFieldErr(gpPhoneField);
    }
    function showGpErr(msg) {
      if (gpErrText) gpErrText.textContent = msg;
      if (gpErrBox) gpErrBox.hidden = false;
      if (gpPhoneInput) fieldErr(gpPhoneInput, msg);
    }
    function setGpChecking(on) {
      if (gpPhoneBtn) {
        gpPhoneBtn.classList.toggle("is-loading", on);
        gpPhoneBtn.disabled = on;
      }
      if (gpPhoneInput) gpPhoneInput.disabled = on;
    }

    function enterGooglePhoneStep() {
      if (!stepGooglePhone || !gpPhoneInput) return; // markup tidak lengkap
      var nama = (state.googleProfile && state.googleProfile.nama) || "Akun Google";
      var email = (state.googleProfile && state.googleProfile.email) || "";
      if ($("gpAvatar")) $("gpAvatar").textContent = initials(nama);
      if ($("gpName")) $("gpName").textContent = nama;
      if ($("gpEmail")) $("gpEmail").textContent = email;
      gpPhoneInput.value = "";
      clearGpErr();
      goTo(stepGooglePhone);
      try { gpPhoneInput.focus(); } catch (e) {}
    }

    if (gpPhoneInput) gpPhoneInput.addEventListener("input", function () {
      try {
        if (window.DikaOperator && typeof DikaOperator.sanitize === "function") {
          var bersih = DikaOperator.sanitize(gpPhoneInput.value);
          if (gpPhoneInput.value !== bersih) gpPhoneInput.value = bersih;
        } else {
          var digitSaja = String(gpPhoneInput.value || "").replace(/\D/g, "").slice(0, 16);
          if (gpPhoneInput.value !== digitSaja) gpPhoneInput.value = digitSaja;
        }
      } catch (err) { console.error("auth-flow: gagal menyaring nomor HP (Google):", err); }
      clearGpErr();
    });

    if (gpBackBtn) gpBackBtn.addEventListener("click", function () {
      goTo(stepPhone);
      try { phoneInput.focus(); } catch (e) {}
    });

    function mulaiOtpEmail() {
      if (!window.DikaApi || typeof DikaApi.kirimOtpEmail !== "function") {
        showGpErr("Layanan verifikasi email belum siap. Muat ulang halaman, ya.");
        return;
      }
      setGpChecking(true);
      DikaApi.kirimOtpEmail(regState.email).then(function () {
        setGpChecking(false);
        enterOtpStep();
      }, function (err) {
        setGpChecking(false);
        console.warn("auth-flow: kirim OTP email gagal:", err && (err.sebab || err.pesanMember));
        showGpErr((err && err.pesanMember) || "Gagal mengirim kode ke email kamu. Coba lagi, ya.");
      });
    }

    if (gpForm) gpForm.addEventListener("submit", function (e) {
      e.preventDefault();
      try {
        clearGpErr();
        var digits = normPhone(gpPhoneInput.value);
        if (!digits) { showGpErr("Nomor HP wajib diisi."); return; }
        if (!isPhone(digits)) { showGpErr("Nomor HP tidak valid. Contoh: 081234567890."); return; }
        if (!isKnownPrefix(digits)) {
          showGpErr("Nomor HP sepertinya tidak valid. Coba periksa lagi, ya.");
          return;
        }
        if (tolakJikaBanned(digits)) return;

        if (!window.DikaApi || typeof DikaApi.cekMemberTransfer !== "function") {
          showGpErr("Layanan belum siap. Muat ulang halaman, ya.");
          return;
        }

        state.phoneDigits = digits;
        setGpChecking(true);
        DikaApi.cekMemberTransfer(digits).then(
          function (m) {
            setGpChecking(false);
            if (state.phoneDigits !== digits) return; // nomor sudah diganti, abaikan
            var account = { name: (m && m.nama) || "Member DikaPay", phone: prettyPhone(digits), pin: null, backendOnly: true };
            state.account = account;
            state.googleFlow = "link";
            enterLoginBranch(account, {
              googleNote: "Nomor ini sudah terdaftar di DikaPay. Masukkan PIN transaksi akun tersebut untuk menghubungkannya dengan akun Google kamu.",
            });
          },
          function (err) {
            setGpChecking(false);
            if (state.phoneDigits !== digits) return;
            if (err && err.kode === "tidak-terdaftar") {
              regState.name = (state.googleProfile && state.googleProfile.nama) || "Member DikaPay";
              regState.email = (state.googleProfile && state.googleProfile.email) || "";
              regState.otpChannel = "email";
              mulaiOtpEmail();
              return;
            }
            console.warn("auth-flow: gagal memeriksa nomor (Google):",
              err && (err.sebab || err.pesanMember));
            showGpErr((err && err.pesanMember) || "Tidak bisa memeriksa nomor ini sekarang. Coba lagi, ya.");
          }
        );
      } catch (err) {
        setGpChecking(false);
        console.error("auth-flow: submit nomor Google gagal:", err);
        showGpErr("Terjadi kesalahan. Coba lagi.");
      }
    });

    /* ===== CABANG A: sambutan + nama → info tambahan → verifikasi → PIN ===
       4 langkah kecil (lihat indikator progress) alih-alih satu formulir
       panjang sekaligus — Nama+Email di sini, Alamat+Tanggal Lahir+Jenis
       Kelamin di stepRegisterMore, verifikasi OTP dummy di stepRegisterOtp,
       baru terakhir buat PIN di stepRegisterPin (tidak berubah). */

    function clearRegErr() {
      regErrBox.hidden = true;
      clearFieldErr(regNameField);
      clearFieldErr(regEmailField);
    }
    regNameInput.addEventListener("input", function () { clearRegErr(); });
    regEmailInput.addEventListener("input", function () { clearRegErr(); });

    function enterRegisterBranch() {
      var msg = pickOne(WELCOME_MESSAGES);
      $("welcomeTitle").textContent = msg.title;
      $("welcomeText").textContent = msg.text;
      regNameInput.value = (state.googleProfile && state.googleProfile.nama) || "";
      regEmailInput.value = (state.googleProfile && state.googleProfile.email) || "";
      regState.otpChannel = "sms"; // mulai Cabang A dari nol -- buang sisa "email" dari percobaan Google yang ditinggalkan
      clearRegErr();
      goTo(stepRegister);
      try { (regNameInput.value ? regEmailInput : regNameInput).focus(); } catch (e) {}
    }

    regNameForm.addEventListener("submit", function (e) {
      e.preventDefault();
      try {
        clearRegErr();
        var name = regNameInput.value.trim();
        var email = regEmailInput.value.trim();
        if (!name) { fieldErr(regNameInput, "Nama lengkap wajib diisi."); regErrText.textContent = "Periksa lagi data yang kamu isi."; regErrBox.hidden = false; return; }
        if (name.length < 3) { fieldErr(regNameInput, "Nama terlalu pendek."); regErrText.textContent = "Periksa lagi data yang kamu isi."; regErrBox.hidden = false; return; }
        if (!email) { fieldErr(regEmailInput, "Email wajib diisi."); regErrText.textContent = "Periksa lagi data yang kamu isi."; regErrBox.hidden = false; return; }
        if (!validEmail(email)) {
          /* Dibedakan: bentuknya memang salah, atau bentuknya benar tapi
             bukan Gmail. Pesan "Format email tidak valid" untuk alamat
             yang sah seperti budi@yahoo.com cuma membingungkan — member
             tidak tahu apa yang harus diperbaiki. */
          var bentukOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
          fieldErr(regEmailInput, bentukOk
            ? "Khusus email Gmail (@gmail.com), ya."
            : "Format email tidak valid.");
          regErrText.textContent = bentukOk
            ? "Saat ini DikaPay hanya mendukung pendaftaran dengan email Gmail (@gmail.com) untuk memastikan verifikasi berjalan lancar. Yuk gunakan email Gmail kamu ya!"
            : "Periksa lagi data yang kamu isi.";
          regErrBox.hidden = false;
          return;
        }

        regState.name = name;
        regState.email = email;
        enterRegisterMoreStep();
      } catch (err) { console.error("auth-flow: submit nama/email gagal:", err); }
    });

    $("regBackBtn").addEventListener("click", function () {
      clearPhoneErr();
      goTo(stepPhone);
      try { phoneInput.focus(); } catch (e) {}
    });

    /* ===== CABANG A — LANGKAH 2: alamat, tanggal lahir, jenis kelamin === */

    function clearMoreErr() {
      moreErrBox.hidden = true;
      clearFieldErr(regAlamatField);
      clearFieldErr(regTglField);
      clearFieldErr(regGenderField);
    }
    regAlamatInput.addEventListener("input", function () { clearMoreErr(); });
    regTglInput.addEventListener("input", function () { clearMoreErr(); });

    /* Batasi tanggal lahir maksimal hari ini — mencegah tanggal masa depan
       tanpa perlu validasi format manual (browser yang menegakkan lewat
       date picker-nya sendiri). */
    (function batasiTglLahir() {
      try {
        var hariIni = new Date();
        var yyyy = hariIni.getFullYear();
        var mm = String(hariIni.getMonth() + 1).padStart(2, "0");
        var dd = String(hariIni.getDate()).padStart(2, "0");
        regTglInput.max = yyyy + "-" + mm + "-" + dd;
      } catch (e) {}
    })();

    /* Jenis Kelamin — segmented toggle 2 opsi, pill meluncur lewat class
       .is-p (pola yang sama seperti .seg.is-rp di margin.js). */
    regGender.querySelectorAll('input[name="jenisKelamin"]').forEach(function (radio) {
      radio.addEventListener("change", function () {
        regGender.classList.toggle("is-p", radio.value === "P");
        regGender.querySelectorAll(".auth-gender__opt").forEach(function (opt) {
          var r = opt.querySelector('input[name="jenisKelamin"]');
          opt.classList.toggle("is-checked", !!(r && r.checked));
        });
        clearMoreErr();
      });
    });

    function enterRegisterMoreStep() {
      regAlamatInput.value = "";
      regTglInput.value = "";
      regGender.querySelectorAll('input[name="jenisKelamin"]').forEach(function (r) { r.checked = false; });
      regGender.classList.remove("is-p");
      regGender.querySelectorAll(".auth-gender__opt").forEach(function (o) { o.classList.remove("is-checked"); });
      clearMoreErr();
      gpsGen++; // batalkan pencarian lokasi tertunda dari kunjungan sebelumnya ke step ini
      gpsSetLoading(false);
      goTo(stepRegisterMore);
      try { regAlamatInput.focus(); } catch (e) {}
    }

    /* ===== Cari alamat via GPS — HANYA di form pendaftaran ini ===========
       Logic-nya SENGAJA menyalin pola dua-jalur `runGeo()`/`runGeoNative()`
       di akun.js (Alamat Tersimpan > "Gunakan Lokasi Saat Ini"), yang sudah
       lebih dulu diperbaiki menangani izin runtime Android dengan benar —
       disalin dengan nama sendiri karena auth-flow.js/auth.html tidak
       memuat akun.js. JANGAN dipakai untuk field alamat lain mana pun. */

    var gpsGen = 0; // token generasi — respons yang datang setelah step ini ditinggalkan diabaikan

    function gpsCapPlugin(nama) {
      try {
        var P = window.Capacitor && window.Capacitor.Plugins;
        return (P && P[nama]) || null;
      } catch (e) { return null; }
    }
    function gpsNativeApp() {
      try {
        return !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === "function" &&
          window.Capacitor.isNativePlatform());
      } catch (e) { return false; }
    }
    function gpsSetLoading(on) {
      if (!regAlamatGpsBtn) return;
      regAlamatGpsBtn.classList.toggle("is-loading", on);
      regAlamatGpsBtn.disabled = on;
      if (regAlamatGpsLabel) regAlamatGpsLabel.textContent = on ? "Mencari lokasi kamu…" : "Cari Lokasi Saya";
    }
    function gpsReverseGeocode(lat, lon, gen) {
      fetch(
        "https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1&lat=" +
          encodeURIComponent(lat) + "&lon=" + encodeURIComponent(lon),
        { headers: { Accept: "application/json" } }
      )
        .then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); })
        .then(function (data) {
          if (gen !== gpsGen) return; // step sudah ditinggalkan / dicoba ulang
          gpsSetLoading(false);
          if (!data || !data.display_name) {
            showToast("Lokasi ketemu, tapi alamatnya tidak terbaca. Isi manual, ya.");
            return;
          }
          regAlamatInput.value = data.display_name;
          regAlamatInput.dispatchEvent(new Event("input", { bubbles: true })); // float label + clear error ikut jalan
          showToast("Alamat terisi otomatis dari lokasi kamu.");
        })
        .catch(function (err) {
          if (gen !== gpsGen) return;
          gpsSetLoading(false);
          console.error("auth-flow: reverse geocode gagal:", err);
          showToast("Tidak bisa mengambil alamat. Coba lagi atau isi manual, ya.");
        });
    }
    function gpsRunNative(Geo, gen) {
      var sah = function (s) { return s === "granted" || s === "limited"; };
      var ambilStatus = function (r) { return (r && (sah(r.location) ? r.location : r.coarseLocation)) || null; };

      Promise.resolve()
        .then(function () { return Geo.checkPermissions(); })
        .then(function (hasil) {
          if (sah(ambilStatus(hasil))) return true;
          return Promise.resolve(Geo.requestPermissions({ permissions: ["location", "coarseLocation"] }))
            .then(function (baru) { return sah(ambilStatus(baru)); });
        })
        .then(function (ok) {
          if (gen !== gpsGen) return;
          if (!ok) { gpsSetLoading(false); showToast("Izin lokasi belum diberikan. Isi alamat manual dulu, ya."); return; }
          return Promise.resolve(
            Geo.getCurrentPosition({ enableHighAccuracy: false, timeout: 20000, maximumAge: 60000 })
          ).then(function (pos) {
            if (gen !== gpsGen) return;
            var c = pos && pos.coords;
            if (!c) { gpsSetLoading(false); showToast("Lokasi tidak ditemukan. Coba lagi, ya."); return; }
            gpsReverseGeocode(c.latitude, c.longitude, gen);
          });
        })
        .catch(function (e) {
          if (gen !== gpsGen) return;
          gpsSetLoading(false);
          console.error("auth-flow: Geolocation native gagal:", e);
          showToast("Lokasi sedang tidak bisa diambil. Coba lagi, ya.");
        });
    }
    function gpsCariLokasi() {
      if (regAlamatGpsBtn && regAlamatGpsBtn.disabled) return; // sedang mencari, abaikan tap ganda
      var gen = ++gpsGen;
      gpsSetLoading(true);

      var Geo = gpsCapPlugin("Geolocation");
      if (gpsNativeApp() && Geo) { gpsRunNative(Geo, gen); return; }

      if (!navigator.geolocation) {
        gpsSetLoading(false);
        showToast("Perangkat ini tidak mendukung pencarian lokasi otomatis.");
        return;
      }
      try {
        navigator.geolocation.getCurrentPosition(
          function (pos) { if (gen === gpsGen) gpsReverseGeocode(pos.coords.latitude, pos.coords.longitude, gen); },
          function (err) {
            if (gen !== gpsGen) return;
            gpsSetLoading(false);
            console.error("auth-flow: getCurrentPosition gagal:", err && err.code, err && err.message);
            showToast(err && err.code === 1
              ? "Izin lokasi ditolak. Isi alamat manual dulu, ya."
              : "Lokasi tidak ditemukan. Coba lagi atau isi manual, ya.");
          },
          { enableHighAccuracy: false, timeout: 20000, maximumAge: 60000 }
        );
      } catch (e) {
        gpsSetLoading(false);
        console.error("auth-flow: getCurrentPosition error:", e);
        showToast("Lokasi sedang tidak bisa diambil. Coba lagi, ya.");
      }
    }
    if (regAlamatGpsBtn) regAlamatGpsBtn.addEventListener("click", gpsCariLokasi);

    regMoreForm.addEventListener("submit", function (e) {
      e.preventDefault();
      try {
        clearMoreErr();
        var alamat = regAlamatInput.value.trim();
        var tgl = regTglInput.value;
        var gender = regGender.querySelector('input[name="jenisKelamin"]:checked');

        if (!alamat) { fieldErr(regAlamatInput, "Alamat wajib diisi."); moreErrText.textContent = "Periksa lagi data yang kamu isi."; moreErrBox.hidden = false; return; }
        if (!tgl) { fieldErr(regTglInput, "Tanggal lahir wajib diisi."); moreErrText.textContent = "Periksa lagi data yang kamu isi."; moreErrBox.hidden = false; return; }
        if (!gender) {
          regGenderField.classList.add("is-error");
          regGenderField.classList.remove("is-shake");
          void regGenderField.offsetWidth;
          regGenderField.classList.add("is-shake");
          var slot = regGenderField.querySelector(".aff__err");
          if (slot) slot.textContent = "Pilih jenis kelamin dulu, ya.";
          moreErrText.textContent = "Periksa lagi data yang kamu isi.";
          moreErrBox.hidden = false;
          return;
        }

        regState.alamat = alamat;
        regState.tanggalLahir = tgl;
        regState.jenisKelamin = gender.value;
        enterOtpStep();
      } catch (err) { console.error("auth-flow: submit info tambahan gagal:", err); }
    });

    $("regMoreBackBtn").addEventListener("click", function () {
      goTo(stepRegister);
    });

    /* ===== CABANG A — LANGKAH 3: verifikasi nomor HP =====================
       DUA channel berbagi step & markup ini (regState.otpChannel):
         "sms"   — BELUM ADA SMS gateway sungguhan (fase 1): kode 6 digit
                   di-generate lokal dan DITAMPILKAN LANGSUNG di layar
                   ("Kode dummy untuk testing"), dibandingkan lokal di
                   verifyOtp(). Dipakai Cabang A (daftar manual).
         "email" — Cabang Google (C.a): kode BENERAN dikirim ke email lewat
                   DikaApi.kirimOtpEmail() (api-otp-kirim.php), TIDAK
                   ditampilkan di layar. verifyOtp() di sini HANYA memeriksa
                   format (6 digit terisi) -- verifikasi SUNGGUHAN ditunda
                   sampai commitGoogleRegistration() (DikaApi.daftarGoogle,
                   yang mengecek kode+kedaluwarsa di backend). Kalau kode
                   salah/kedaluwarsa, member dilempar BALIK ke step ini dari
                   sana dengan pesan jelas -- lihat commitGoogleRegistration. */

    var otpErrBox = $("otpErrBox");
    var otpErrText = $("otpErrText");
    var otpFormBlock = $("otpFormBlock");
    var otpSukses = $("otpSukses");
    var otpSuksesText = $("otpSuksesText");
    var otpIcon = $("otpIcon");
    var otpDummyBox = $("otpDummyBox");
    var otpChannelDesc = $("otpChannelDesc");
    var otpTarget = $("otpTarget");
    var otpResendBtn = $("otpResendBtn");
    var otpVerifyBtn = $("otpVerifyBtn");
    var otpBoxesReg = Array.prototype.slice.call(document.querySelectorAll("#regOtpBoxes input"));

    function buatKodeOtp() {
      var kode = "";
      for (var i = 0; i < 6; i++) kode += Math.floor(Math.random() * 10);
      return kode;
    }

    function clearOtpErr() {
      if (otpErrBox) otpErrBox.hidden = true;
      var box = $("regOtpBoxes");
      if (box) box.classList.remove("is-error");
    }

    function tampilkanKodeOtp() {
      regState.otp = buatKodeOtp();
      var codeEl = $("otpDummyCode");
      if (codeEl) codeEl.textContent = regState.otp;
    }

    /* Membangun "Kode verifikasi sudah dikirim ke <b>X</b>." lewat DOM node
       (bukan innerHTML) supaya alamat email tidak pernah lewat jalur yang
       bisa disalahartikan sebagai HTML. */
    function tampilkanTujuanOtp() {
      if (!otpChannelDesc || !otpTarget) return;
      var email = regState.otpChannel === "email";
      var prefix = email
        ? "Kode verifikasi sudah dikirim ke alamat email "
        : "Kode verifikasi sudah dikirim lewat SMS ke ";
      var tujuan = email
        ? ((state.googleProfile && state.googleProfile.email) || regState.email)
        : prettyPhone(state.phoneDigits);
      while (otpChannelDesc.firstChild) otpChannelDesc.removeChild(otpChannelDesc.firstChild);
      otpChannelDesc.appendChild(document.createTextNode(prefix));
      otpTarget.textContent = tujuan;
      otpChannelDesc.appendChild(otpTarget);
      otpChannelDesc.appendChild(document.createTextNode("."));
    }

    function enterOtpStep() {
      tampilkanTujuanOtp();
      if (otpDummyBox) otpDummyBox.hidden = regState.otpChannel === "email";
      if (regState.otpChannel === "email") {
        regState.otp = ""; // diisi verifyOtp() dari input member, BUKAN di-generate lokal
      } else {
        tampilkanKodeOtp();
      }
      otpBoxesReg.forEach(function (b) { b.value = ""; });
      clearOtpErr();
      otpFormBlock.hidden = false;
      otpSukses.hidden = true;
      goTo(stepRegisterOtp);
      // Ikon SMS masuk dengan animasi sendiri — dilepas-pasang ulang supaya
      // bisa terpicu lagi tiap kali step ini dibuka (pola yang sama seperti
      // .astep.is-in / auth-pin-greet).
      if (otpIcon) {
        otpIcon.style.animation = "none";
        void otpIcon.offsetWidth;
        otpIcon.style.animation = "";
      }
      if (!RM) {
        window.setTimeout(function () {
          try { otpBoxesReg[0].focus(); } catch (e) {}
        }, 300);
      }
    }

    otpBoxesReg.forEach(function (box, i) {
      box.addEventListener("input", function () {
        box.value = box.value.replace(/\D/g, "").slice(-1);
        clearOtpErr();
        if (box.value && i < otpBoxesReg.length - 1) otpBoxesReg[i + 1].focus();
      });
      box.addEventListener("keydown", function (e) {
        if (e.key === "Backspace" && !box.value && i > 0) otpBoxesReg[i - 1].focus();
      });
    });

    function verifyOtp() {
      try {
        var kode = otpBoxesReg.map(function (b) { return b.value; }).join("");
        if (kode.length < 6) {
          $("regOtpBoxes").classList.add("is-error");
          if (otpErrText) otpErrText.textContent = "Isi keenam kotak kode dulu, ya.";
          if (otpErrBox) otpErrBox.hidden = false;
          return;
        }
        /* Channel "sms": dibandingkan lokal seperti sebelumnya. Channel
           "email": TIDAK dibandingkan di sini sama sekali -- backend yang
           memutuskan saat commitGoogleRegistration() dikirim. */
        if (regState.otpChannel !== "email" && kode !== regState.otp) {
          $("regOtpBoxes").classList.remove("is-error");
          void $("regOtpBoxes").offsetWidth;
          $("regOtpBoxes").classList.add("is-error");
          if (otpErrText) otpErrText.textContent = "Kode salah. Coba periksa lagi, ya.";
          if (otpErrBox) otpErrBox.hidden = false;
          otpBoxesReg.forEach(function (b) { b.value = ""; });
          try { otpBoxesReg[0].focus(); } catch (e) {}
          return;
        }

        regState.otp = kode; // channel "email": disimpan utuh, dikirim ke commitGoogleRegistration()
        clearOtpErr();
        otpFormBlock.hidden = true;
        otpSukses.hidden = false;
        if (otpSuksesText) {
          otpSuksesText.textContent = regState.otpChannel === "email"
            ? "Kode diterima. Lanjut buat PIN untuk menyelesaikan akun."
            : "Nomor berhasil diverifikasi!";
        }
        window.setTimeout(function () {
          enterPinStep();
        }, RM ? 0 : 900);
      } catch (err) { console.error("auth-flow: verifikasi OTP gagal:", err); }
    }
    if (otpVerifyBtn) otpVerifyBtn.addEventListener("click", verifyOtp);

    if (otpResendBtn) otpResendBtn.addEventListener("click", function () {
      otpResendBtn.disabled = true;
      var labelAsli = otpResendBtn.textContent;
      otpResendBtn.textContent = "Mengirim ulang…";

      function selesaiKirimUlang(pesanToast) {
        otpBoxesReg.forEach(function (b) { b.value = ""; });
        clearOtpErr();
        try { otpBoxesReg[0].focus(); } catch (e) {}
        otpResendBtn.textContent = labelAsli;
        otpResendBtn.disabled = false;
        showToast(pesanToast);
      }

      if (regState.otpChannel === "email") {
        if (!window.DikaApi || typeof DikaApi.kirimOtpEmail !== "function") {
          selesaiKirimUlang("Layanan pengiriman kode belum siap. Muat ulang halaman, ya.");
          return;
        }
        DikaApi.kirimOtpEmail(regState.email).then(function () {
          selesaiKirimUlang("Kode verifikasi baru sudah dikirim ke email kamu.");
        }, function (err) {
          console.warn("auth-flow: kirim ulang OTP email gagal:", err && (err.sebab || err.pesanMember));
          selesaiKirimUlang((err && err.pesanMember) || "Gagal mengirim ulang kode. Coba lagi, ya.");
        });
        return;
      }

      window.setTimeout(function () {
        tampilkanKodeOtp();
        selesaiKirimUlang("Kode verifikasi baru sudah dikirim.");
      }, RM ? 0 : 700);
    });

    $("otpBackBtn").addEventListener("click", function () {
      goTo(regState.otpChannel === "email" ? stepGooglePhone : stepRegisterMore);
    });

    /* ===== CABANG A — LANGKAH 4: buat & konfirmasi PIN (tidak berubah) === */

    function enterPinStep() {
      regState.subStep = "new";
      regState.pinNew = "";
      regPin.setHint("Buat PIN baru — 6 digit");
      regPin.reset();
      // Sapaan personal — animasi masuknya sendiri (lihat auth-pin-greet
      // di auth.css), terpisah dari fade+slide container .astep.is-in.
      $("regPinGreet").textContent = "Halo, " + firstName(regState.name) + "! Sekarang buat PIN rahasia kamu, ya — 6 digit yang cuma kamu yang tahu.";
      goTo(stepRegisterPin);
    }

    $("regPinBackBtn").addEventListener("click", function () {
      goTo(stepRegisterOtp);
    });

    /* PIN "new" (buat PIN, langkah PERTAMA — bukan konfirmasi) lolos cek
       lemah -> lanjut ke sub-step confirm seperti biasa. Dipisah jadi
       fungsi sendiri supaya bisa dipanggil juga dari tombol "Lanjutkan"
       di modal peringatan (member yang tetap memilih pakai PIN lemahnya). */
    function advanceToConfirmPin(buf) {
      regState.pinNew = buf;
      regState.subStep = "confirm";
      regPin.setHint("Ulangi PIN baru kamu");
      regPin.reset();
    }

    var regPin = createPinPad({
      dotsEl: $("regPinDots"),
      keypadEl: $("regPinKeypad"),
      hintEl: $("regPinHint"),
      onComplete: function (buf) {
        if (regState.subStep === "new") {
          if (isWeakPin(buf)) {
            regState.pendingWeakPin = buf;
            openWeakPinModal();
            return; // alur lanjut ditentukan tombol modal, bukan di sini
          }
          advanceToConfirmPin(buf);
        } else {
          if (buf === regState.pinNew) {
            /* Cabang Google (C.a, regState.otpChannel === "email") pakai
               endpoint & payload berbeda (kode_otp ikut dikirim, diperiksa
               BACKEND) -- lihat commitGoogleRegistration(). Cabang manual
               (channel "sms", tidak berubah) tetap commitRegistration(). */
            if (regState.otpChannel === "email") commitGoogleRegistration();
            else commitRegistration();
          } else {
            regPin.shake("Buat PIN baru — 6 digit");
            regState.subStep = "new";
            regState.pinNew = "";
          }
        }
      },
    });

    /* ---- Modal peringatan PIN lemah ---------------------------------------
       Bukan block total — dua pilihan, keduanya valid, member yang putuskan
       (lihat CLAUDE.md). Overlay ini menutupi keypad secara visual & lewat
       stacking biasa (bukan flag terpisah) selama terbuka — pola yang sama
       seperti modal konfirmasi transfer-member.js. */
    function openWeakPinModal() {
      if (!weakPinOverlay) { advanceToConfirmPin(regState.pendingWeakPin); return; } // markup hilang -> jangan sampai macet
      weakPinOverlay.classList.add("is-open");
    }
    function closeWeakPinModal() {
      if (weakPinOverlay) weakPinOverlay.classList.remove("is-open");
    }
    if (weakPinRetry) weakPinRetry.addEventListener("click", function () {
      closeWeakPinModal();
      regState.pendingWeakPin = "";
      regPin.reset(); // tetap di sub-step "new", kosongkan buffer, coba lagi
    });
    if (weakPinContinue) weakPinContinue.addEventListener("click", function () {
      closeWeakPinModal();
      var buf = regState.pendingWeakPin;
      regState.pendingWeakPin = "";
      advanceToConfirmPin(buf);
    });

    /* ---- Pendaftaran ke BACKEND (api-daftar.php) — bukan lagi lokal ------
       Semua data 4 langkah wizard sudah terkumpul di regState. Di titik ini
       (konfirmasi PIN cocok) kita kirim ke backend, lalu langsung login
       untuk membuka sesi (api-daftar.php TIDAK mengembalikan sesi). */
    var regPinErrBox = $("regPinErrBox");
    var regPinErrText = $("regPinErrText");
    var regPinToLoginBtn = $("regPinToLogin");
    var daftarBusy = false;

    function clearRegPinErr() {
      if (regPinErrBox) regPinErrBox.hidden = true;
      if (regPinToLoginBtn) regPinToLoginBtn.hidden = true;
    }
    function showRegPinErr(msg, withLoginBtn) {
      if (regPinErrText) regPinErrText.textContent = msg;
      if (regPinErrBox) regPinErrBox.hidden = false;
      if (regPinToLoginBtn) regPinToLoginBtn.hidden = !withLoginBtn;
    }
    function resetPinKeBuatBaru() {
      regState.subStep = "new";
      regState.pinNew = "";
      regPin.reset();
      regPin.setHint("Buat PIN baru — 6 digit");
    }

    if (regPinToLoginBtn) regPinToLoginBtn.addEventListener("click", function () {
      /* "Masuk ke Akun Kamu" setelah 409 — nomor sudah terdaftar. Teruskan
         ke langkah nomor HP lalu ke cabang MASUK; PIN diverifikasi ke
         backend (knownRegistered dibaca di handler submit nomor HP). */
      clearRegPinErr();
      knownRegistered = state.phoneDigits;
      try { phoneInput.value = prettyPhone(state.phoneDigits); } catch (e) {}
      try { phoneForm.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true })); } catch (e) {}
    });

    function commitRegistration() {
      if (daftarBusy) return;
      clearRegPinErr();

      var digits = state.phoneDigits;
      var pin = regState.pinNew;

      /* Validasi akhir sebelum kirim (dituntut tugas — langkah sebelumnya
         sudah menjamin bentuknya, ini jaring terakhir). */
      if (!/^\d{6,15}$/.test(digits)) {
        showRegPinErr("Nomor HP tidak valid. Ketuk “Kembali” untuk memperbaikinya.");
        return;
      }
      if (!/^\d{6}$/.test(pin)) {
        regPin.shake("Buat PIN baru — 6 digit");
        regState.subStep = "new";
        regState.pinNew = "";
        return;
      }
      if (!window.DikaApi || typeof DikaApi.daftar !== "function") {
        console.error("auth-flow: api.js belum dimuat — pendaftaran tidak bisa dikirim.");
        showRegPinErr("Layanan pendaftaran belum siap. Muat ulang halaman, ya.");
        return;
      }

      var payload = { nomor_hp: digits, nama: regState.name, pin: pin };
      if (regState.email) payload.email = regState.email;
      if (regState.alamat) payload.alamat = regState.alamat;
      if (regState.tanggalLahir) payload.tanggal_lahir = regState.tanggalLahir;
      if (regState.jenisKelamin) payload.jenis_kelamin = regState.jenisKelamin;
      if (state.googleIdToken) payload.google_id_token = state.googleIdToken;

      daftarBusy = true;
      regPin.setBusy(true);
      regPin.setHint("Mendaftarkan akun kamu…");

      DikaApi.daftar(payload)
        .then(function (member) {
          /* Pendaftaran sukses tapi TANPA sesi — login dengan nomor+PIN yang
             sama untuk mendapat data member terkini + membuka sesi. Auto-
             login gagal (jarang) -> tetap lanjut pakai data pendaftaran. */
          return DikaApi.masuk(digits, pin).then(
            function (m) { return m || member; },
            function (loginErr) {
              console.warn("auth-flow: daftar sukses tapi auto-login gagal:",
                loginErr && (loginErr.sebab || loginErr.pesanMember));
              return member;
            }
          );
        })
        .then(function (member) { finishRegistration(member, digits, pin); })
        .catch(function (err) {
          daftarBusy = false;
          regPin.setBusy(false);
          resetPinKeBuatBaru();
          if (err && err.kode === "terdaftar") {
            showRegPinErr(
              "Nomor " + prettyPhone(digits) + " sudah terdaftar di DikaPay. Silakan masuk pakai PIN kamu.",
              true
            );
          } else {
            showRegPinErr(err && err.pesanMember ? err.pesanMember : "Pendaftaran gagal. Coba lagi sebentar, ya.");
          }
        });
    }

    /* ---- Pendaftaran Cabang GOOGLE (C.a) ke BACKEND (api-daftar-google.php)
       Beda dari commitRegistration(): kode OTP (regState.otp, diketik di
       stepRegisterOtp channel "email") ikut dikirim dan DIPERIKSA BACKEND
       di panggilan ini -- bukan dibandingkan lokal seperti channel "sms".
       Kalau kode salah/kedaluwarsa, member dilempar BALIK ke step OTP
       (bukan cuma reset PIN) supaya bisa minta kode baru lewat "Kirim
       Ulang Kode" di sana. */
    var googleDaftarBusy = false;
    function commitGoogleRegistration() {
      if (googleDaftarBusy) return;
      clearRegPinErr();

      var digits = state.phoneDigits;
      var pin = regState.pinNew;
      var email = (state.googleProfile && state.googleProfile.email) || regState.email;

      if (!/^\d{6,15}$/.test(digits)) {
        showRegPinErr("Nomor HP tidak valid. Ketuk “Kembali” untuk memperbaikinya.");
        return;
      }
      if (!/^\d{6}$/.test(pin)) {
        regPin.shake("Buat PIN baru — 6 digit");
        regState.subStep = "new";
        regState.pinNew = "";
        return;
      }
      if (!email) {
        showRegPinErr("Email Google tidak ditemukan. Ketuk “Kembali” untuk mengulang, ya.");
        return;
      }
      if (!window.DikaApi || typeof DikaApi.daftarGoogle !== "function") {
        console.error("auth-flow: api.js belum dimuat — pendaftaran Google tidak bisa dikirim.");
        showRegPinErr("Layanan pendaftaran belum siap. Muat ulang halaman, ya.");
        return;
      }

      var payload = { email: email, kode_otp: regState.otp, nomor_hp: digits, nama: regState.name, pin: pin };

      googleDaftarBusy = true;
      regPin.setBusy(true);
      regPin.setHint("Mendaftarkan akun kamu…");

      DikaApi.daftarGoogle(payload)
        .then(function (member) {
          /* Sama seperti commitRegistration(): server TIDAK mengembalikan
             sesi -- login sekali lagi supaya dapat device_token/saldo
             terkini. Auto-login gagal (jarang) -> tetap lanjut pakai data
             pendaftaran, member tidak terjebak gara-gara satu panggilan
             ekstra. */
          return DikaApi.masuk(digits, pin).then(
            function (m) { return m || member; },
            function (loginErr) {
              console.warn("auth-flow: daftar Google sukses tapi auto-login gagal:",
                loginErr && (loginErr.sebab || loginErr.pesanMember));
              return member;
            }
          );
        })
        .then(function (member) {
          googleDaftarBusy = false;
          finishRegistration(member, digits, pin);
        })
        .catch(function (err) {
          googleDaftarBusy = false;
          regPin.setBusy(false);
          resetPinKeBuatBaru();

          if (err && (err.kode === "otp-salah" || err.kode === "otp-kadaluarsa")) {
            /* Kode OTP-nya yang salah/kedaluwarsa, BUKAN PIN -- kembali ke
               step OTP (bukan cuma reset PIN di step ini) supaya member
               bisa minta kode baru. regState.pinNew sengaja sudah dikosongkan
               resetPinKeBuatBaru() di atas -- kalau OTP diperbaiki, PIN
               tetap perlu diulang dari awal (bentuk paling sederhana &
               konsisten, tidak menyimpan PIN "setengah jadi" antar step). */
            goTo(stepRegisterOtp);
            otpBoxesReg.forEach(function (b) { b.value = ""; });
            if (otpErrText) otpErrText.textContent = err.pesanMember ||
              "Kode OTP salah atau sudah kedaluwarsa. Minta kode baru, ya.";
            if (otpErrBox) otpErrBox.hidden = false;
            try { otpBoxesReg[0].focus(); } catch (e) {}
            return;
          }
          if (err && err.kode === "terdaftar") {
            showRegPinErr("Nomor " + prettyPhone(digits) +
              " ternyata sudah terdaftar di DikaPay. Mulai ulang lewat “Lanjutkan dengan Google”, ya.");
            return;
          }
          if (err && err.kode === "google-sudah-dipakai") {
            /* TEMUAN REVIEW KEAMANAN: akun Google ini TERNYATA sudah tertaut
               member DikaPay lain (mis. member mengulang alur auto-daftar
               dengan email Google yang sama tapi nomor HP berbeda dari
               percobaan sebelumnya). Backend (api-daftar-google.php) sudah
               menolak SEBELUM member baru sempat dibuat -- di sini TIDAK
               ADA akun ganda yang perlu dibersihkan, cuma perlu mengarahkan
               member ke jalur yang BENAR.

               err.pesanMember dari backend SUDAH menyebutkan nomor HP akun
               lamanya (mis. "...Coba masuk pakai nomor HP 0812xxxx itu,
               ya."), tapi nomornya hanya ada DI DALAM teks pesan itu, bukan
               field terpisah -- mem-parsing angka dari teks bebas lebih
               rapuh (gampang salah kalau kalimatnya sedikit berubah) daripada
               membiarkan member mengetik ulang nomornya sendiri. Karena itu
               diarahkan ke stepPhone (langkah PALING AWAL alur ini, bukan
               langsung stepLogin yang butuh state.account/state.phoneDigits
               sudah terisi) -- dari situ cabang login biasa (PIN akun lama,
               BUKAN OTP/PIN baru) berjalan normal lewat phoneForm yang sudah
               ada, tanpa kode tambahan apa pun. */
            state.googleFlow = null;
            regState.otpChannel = "sms";
            clearPhoneErr();
            showPhoneErr(err.pesanMember || "Akun Google ini sudah terhubung ke member DikaPay lain.");
            goTo(stepPhone);
            try { phoneInput.focus(); } catch (e) {}
            return;
          }
          showRegPinErr(err && err.pesanMember ? err.pesanMember : "Pendaftaran gagal. Coba lagi sebentar, ya.");
        });
    }

    function finishRegistration(member, digits, pin) {
      try {
        var account = {
          name: (member && member.nama) || regState.name,
          phone: prettyPhone(digits),
          pin: pin,
          email: regState.email || (member && member.email) || "",
          alamat: regState.alamat,
          tanggalLahir: regState.tanggalLahir,
          jenisKelamin: regState.jenisKelamin,
          idDikapay: (member && member.id_dikapay) || digits,
        };
        /* Akun lokal ditulis sebagai CACHE SESI cabang login di perangkat
           ini — BUKAN lagi sumber kebenaran (itu backend/api-daftar.php).
           Tanpa ini, member yang baru daftar lalu logout tidak bisa masuk
           lagi lewat cabang login lokal di perangkat yang sama. */
        saveAccount(digits, account);
        activateSession(account);

        /* Saldo awal 0 dari backend -> Beranda menampilkan Rp0, bukan
           dummy 125rb dari readBalance(). */
        setBalanceDari(member);
        simpanTokenDari(member, digits);

        /* Dikonsumsi sekali oleh script.js di Beranda — popup "amankan
           akun" hanya untuk member yang BARU daftar, bukan login biasa. */
        try { localStorage.setItem("dikapay:newmember", "1"); } catch (e) {}

        showSuccess({
          title: "Selamat datang, " + firstName(account.name) + "!",
          desc: "Akun DikaPay kamu berhasil dibuat. PIN ini juga jadi PIN transaksi kamu — jangan sampai lupa, ya!",
        });
      } catch (err) {
        daftarBusy = false;
        regPin.setBusy(false);
        console.error("auth-flow: finishRegistration gagal:", err);
        showRegPinErr("Akun berhasil dibuat, tapi ada kendala membuka sesi. Coba masuk lagi, ya.");
      }
    }

    /* ===== CABANG B: member ditemukan → biometrik / PIN ================== */

    function enterLoginBranch(account, opts) {
      state.pendingLogin = null;
      state.login2faRecovery = false;
      $("loginAvatar").textContent = initials(account.name);
      $("loginName").textContent = account.name;
      $("loginPhone").textContent = account.phone;

      /* Cabang Google (state.googleFlow "login"/"link") lewat opts.googleNote
         -- menegaskan PIN di layar ini PIN transaksi DikaPay, bukan PIN akun
         Google. Cabang manual (opts kosong) -> catatan disembunyikan. */
      var noteEl = $("loginGoogleNote");
      if (noteEl) {
        var pesanNote = (opts && opts.googleNote) || "";
        noteEl.textContent = pesanNote;
        noteEl.hidden = !pesanNote;
      }

      var BIO = window.DikaBiometrik;
      /* Akun-stub backendOnly TIDAK punya identitas terverifikasi lokal —
         biometrik (yang langsung membuka sesi) dilewati, PIN dulu. */
      var bioOn = !!(BIO && BIO.aktif()) && !account.backendOnly;

      /* Mulai dari keadaan PALING AMAN: PIN terlihat, biometrik tidak.
         Tombol biometrik baru dimunculkan setelah perangkat BENAR-BENAR
         menjawab bahwa sensornya ada dan sudah didaftarkan. Dulu urutannya
         terbalik — cukup ada flag "1" di localStorage, keypad PIN langsung
         disembunyikan, padahal tombolnya belum tentu bisa apa-apa. */
      bioBlock.hidden = true;
      pinBlock.hidden = false;
      bioBtn.classList.remove("is-scanning");
      bioLabel.textContent = "Masuk dengan Biometrik";

      loginPin.reset();
      loginPin.setHint("Masukkan PIN kamu");

      goTo(stepLogin);

      if (bioOn && BIO) {
        BIO.periksa().then(function (p) {
          /* Member bisa saja sudah pindah step sementara pemeriksaan
             berjalan — jangan menyalakan blok di layar yang tidak aktif. */
          if (stepLogin.hidden || !p.ada) {
            if (!p.ada) console.warn("auth-flow: biometrik aktif tapi tidak tersedia:", p.kode);
            return;
          }
          bioBlock.hidden = false;
          pinBlock.hidden = true;
        }).catch(function (e) {
          console.error("auth-flow: gagal memeriksa biometrik:", e);
        });
      }
    }

    $("usePinBtn").addEventListener("click", function () {
      bioBlock.hidden = true;
      pinBlock.hidden = false;
      loginPin.reset();
    });

    $("loginBackBtn").addEventListener("click", function () {
      clearPhoneErr();
      state.pendingLogin = null;
      state.login2faRecovery = false;
      loginPin.setBusy(false);
      state.googleFlow = null; // batal cabang Google (kalau sedang di situ) -- jangan bocor ke percobaan berikutnya
      goTo(stepPhone);
      try { phoneInput.focus(); } catch (e) {}
    });

    /* SESI HANYA DIBUKA KALAU PROMPT BIOMETRIK ANDROID MENJAWAB SUKSES.
       Versi sebelumnya di sini cuma setTimeout 900 md lalu langsung
       activateSession() — tanpa plugin, tanpa sensor, tanpa jalur gagal.
       Jangan pernah mengembalikan pola itu: kalau biometrik tidak bisa
       dipakai, member masuk lewat PIN, bukan lewat animasi. */
    bioBtn.addEventListener("click", function () {
      try {
        if (bioBtn.classList.contains("is-scanning") || !state.account) return;

        var BIO = window.DikaBiometrik;
        if (!BIO) {
          console.error("auth-flow: biometrik.js belum dimuat.");
          pakaiPin("Masuk dengan PIN dulu, ya.");
          return;
        }

        bioBtn.classList.add("is-scanning");
        bioLabel.textContent = "Memindai...";

        BIO.autentikasi("Masuk ke akun DikaPay kamu")
          .then(function (r) {
            bioBtn.classList.remove("is-scanning");
            bioLabel.textContent = "Masuk dengan Biometrik";
            if (!r.ok) {
              /* Gagal/dibatalkan TIDAK boleh diam-diam — kalau member tidak
                 diberi jalan lain, ia terjebak di layar yang tidak bisa
                 dilewati. Batal = buka keypad PIN, itu memang gunanya. */
              pakaiPin(r.kode === "userCancel" ? "Masuk dengan PIN kamu" : r.pesan);
              return;
            }
            if (!/^\d{6}$/.test(String(state.account.pin || ""))) {
              pakaiPin("Masukkan PIN untuk melanjutkan.");
              return;
            }
            bioBlock.hidden = true;
            pinBlock.hidden = false;
            loginPin.reset();
            loginPin.setBusy(true);
            loginPin.setHint("Memeriksa PIN…");
            submitBackendLogin(state.account.pin, null, false);
          })
          .catch(function (e) {
            bioBtn.classList.remove("is-scanning");
            bioLabel.textContent = "Masuk dengan Biometrik";
            console.error("auth-flow: biometrik gagal:", e);
            pakaiPin("Masuk dengan PIN kamu");
          });
      } catch (err) {
        bioBtn.classList.remove("is-scanning");
        console.error("auth-flow: biometrik gagal:", err);
        pakaiPin("Masuk dengan PIN kamu");
      }
    });

    /* Beralih ke keypad PIN sambil menjelaskan kenapa. */
    function pakaiPin(pesan) {
      bioBlock.hidden = true;
      pinBlock.hidden = false;
      loginPin.reset();
      loginPin.setHint(pesan || "Masukkan PIN kamu");
    }

    var loginPin = createPinPad({
      dotsEl: $("loginPinDots"),
      keypadEl: $("loginPinKeypad"),
      hintEl: $("loginPinHint"),
      onComplete: function (buf) {
        if (!state.account) return;
        submitBackendLogin(buf, null, false);
      },
    });

    function clearLogin2FA() {
      state.pendingLogin = null;
      state.login2faRecovery = false;
      if (login2faCode) login2faCode.value = "";
      if (login2faError) login2faError.hidden = true;
      if (login2faCode) login2faCode.classList.remove("is-error");
      if (login2faSubmit) {
        login2faSubmit.disabled = false;
        login2faSubmit.textContent = "Verifikasi";
      }
      if (login2faToggle) login2faToggle.textContent = "Pakai kode cadangan";
    }

    function showLogin2FA(err, phone, pin, googleFlow) {
      state.pendingLogin = { phone: phone, pin: pin, googleFlow: googleFlow };
      state.login2faRecovery = false;
      login2faCode.maxLength = 6;
      login2faCode.inputMode = "numeric";
      login2faCode.placeholder = "000000";
      login2faCode.value = "";
      login2faLead.textContent = "Masukkan kode dari aplikasi authenticator kamu.";
      login2faToggle.textContent = "Pakai kode cadangan";
      login2faError.hidden = true;
      login2faSubmit.disabled = false;
      login2faSubmit.textContent = "Verifikasi";
      loginPin.setBusy(false);
      goTo(stepLogin2FA);
      requestAnimationFrame(function () { login2faCode.focus(); });
    }

    function showLogin2FAError(pesan) {
      login2faErrorText.textContent = pesan;
      login2faError.hidden = false;
      login2faCode.classList.remove("is-error");
      void login2faCode.offsetWidth;
      login2faCode.classList.add("is-error");
      login2faCode.value = "";
      login2faCode.focus();
    }

    function failLogin(pin, pesan, from2FA) {
      if (from2FA) {
        login2faSubmit.disabled = false;
        login2faSubmit.textContent = "Verifikasi";
        showLogin2FAError(pesan);
        return;
      }
      loginPin.setBusy(false);
      loginPin.shake(pesan || "PIN salah. Coba lagi, ya.");
    }

    function finishBackendLogin(member, pin, phone, googleFlow, from2FA) {
      var account = {
        name: (member && member.nama) || (state.account && state.account.name) || "Member DikaPay",
        phone: prettyPhone(phone),
        pin: pin,
        email: (member && member.email) || "",
        alamat: "", tanggalLahir: "", jenisKelamin: "",
        idDikapay: (member && member.id_dikapay) || phone,
      };

      function selesaiMasuk(pesanSukses) {
        saveAccount(phone, account);
        state.account = account;
        setBalanceDari(member);
        simpanTokenDari(member, phone);
        state.googleFlow = null;
        clearLogin2FA();
        activateSession(account);
        showSuccess({
          title: "Selamat datang kembali, " + firstName(account.name) + "!",
          desc: pesanSukses,
        });
      }

      if (googleFlow === "link") {
        if (!state.googleIdToken || !(member && member.device_token) ||
            !window.DikaApi || typeof DikaApi.hubungkanGoogle !== "function") {
          clearLogin2FA();
          loginPin.setBusy(false);
          goTo(stepLogin);
          loginPin.shake("Tidak bisa menghubungkan akun Google sekarang. Coba lagi, ya.");
          return;
        }
        if (from2FA) login2faLead.textContent = "Kode benar. Menghubungkan akun Google kamu…";
        else loginPin.setHint("Menghubungkan akun Google…");
        DikaApi.hubungkanGoogle(member.device_token, state.googleIdToken).then(
          function () { selesaiMasuk("Akun Google kamu berhasil dihubungkan ke DikaPay."); },
          function (linkErr) {
            clearLogin2FA();
            loginPin.setBusy(false);
            goTo(stepLogin);
            console.warn("auth-flow: hubungkanGoogle gagal:", linkErr && (linkErr.sebab || linkErr.pesanMember));
            loginPin.shake((linkErr && linkErr.pesanMember) || "Gagal menghubungkan akun Google. Coba lagi, ya.");
          }
        );
        return;
      }

      selesaiMasuk("Kamu berhasil masuk ke akun DikaPay.");
    }

    function submitBackendLogin(pin, faktor, from2FA) {
      if (!window.DikaApi || typeof DikaApi.masuk !== "function") {
        failLogin(pin, "Login belum bisa terhubung. Coba lagi sebentar, ya.", from2FA);
        return;
      }
      var phone = from2FA && state.pendingLogin ? state.pendingLogin.phone : state.phoneDigits;
      var googleFlow = from2FA && state.pendingLogin ? state.pendingLogin.googleFlow : state.googleFlow;
      if (from2FA) {
        login2faSubmit.disabled = true;
        login2faSubmit.textContent = "Memeriksa…";
        login2faError.hidden = true;
      } else {
        loginPin.setBusy(true);
        loginPin.setHint("Memeriksa PIN…");
      }
      DikaApi.masuk(phone, pin, faktor).then(function (member) {
        if (state.phoneDigits !== phone ||
            (from2FA && (!state.pendingLogin || state.pendingLogin.pin !== pin || stepLogin2FA.hidden)) ||
            (!from2FA && stepLogin.hidden)) return;
        finishBackendLogin(member, pin, phone, googleFlow, from2FA);
      }).catch(function (err) {
        if (state.phoneDigits !== phone ||
            (from2FA && (!state.pendingLogin || state.pendingLogin.pin !== pin || stepLogin2FA.hidden)) ||
            (!from2FA && stepLogin.hidden)) return;
        console.warn("auth-flow: login backend gagal:", err && (err.sebab || err.pesanMember));
        if (!from2FA && err && err.kode === "butuh-2fa") {
          showLogin2FA(err, phone, pin, googleFlow);
          return;
        }
        if (from2FA) {
          failLogin(pin, (err && err.pesanMember) || "Kode belum cocok. Coba lagi, ya.", true);
          return;
        }
        failLogin(pin, (err && err.pesanMember) || "PIN salah. Coba lagi, ya.", false);
      });
    }

    login2faCode.addEventListener("input", function () {
      if (state.login2faRecovery) {
        var code = login2faCode.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
        login2faCode.value = code.length > 4 ? code.slice(0, 4) + "-" + code.slice(4) : code;
      } else {
        login2faCode.value = login2faCode.value.replace(/\D/g, "").slice(0, 6);
      }
      login2faError.hidden = true;
      login2faCode.classList.remove("is-error");
    });
    login2faCode.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); login2faSubmit.click(); }
    });
    login2faToggle.addEventListener("click", function () {
      state.login2faRecovery = !state.login2faRecovery;
      login2faCode.value = "";
      login2faCode.maxLength = state.login2faRecovery ? 9 : 6;
      login2faCode.inputMode = state.login2faRecovery ? "text" : "numeric";
      login2faCode.placeholder = state.login2faRecovery ? "XXXX-XXXX" : "000000";
      login2faCode.setAttribute("aria-label", state.login2faRecovery ? "Kode Cadangan" : "Kode Verifikasi 2 Langkah");
      login2faLead.textContent = state.login2faRecovery
        ? "Masukkan salah satu kode cadangan yang kamu simpan."
        : "Masukkan kode dari aplikasi authenticator kamu.";
      login2faToggle.textContent = state.login2faRecovery ? "Pakai kode authenticator" : "Pakai kode cadangan";
      login2faError.hidden = true;
      login2faCode.focus();
    });
    login2faSubmit.addEventListener("click", function () {
      if (!state.pendingLogin || login2faSubmit.disabled) return;
      var code = login2faCode.value.trim();
      var factor;
      if (state.login2faRecovery) {
        code = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (code.length !== 8) { showLogin2FAError("Masukkan kode cadangan 8 karakter."); return; }
        factor = { recovery_code: code.slice(0, 4) + "-" + code.slice(4) };
      } else {
        code = code.replace(/\D/g, "");
        if (code.length !== 6) { showLogin2FAError("Masukkan 6 digit kode authenticator."); return; }
        factor = { kode_2fa: code };
      }
      submitBackendLogin(state.pendingLogin.pin, factor, true);
    });
    $("login2faBack").addEventListener("click", function () {
      clearLogin2FA();
      loginPin.reset();
      loginPin.setHint("Masukkan PIN kamu");
      goTo(stepLogin);
    });

    /* ===== STEP: sukses → suara + checkmark → Beranda ==================== */

    function showSuccess(opts) {
      $("successTitle").textContent = opts.title;
      $("successDesc").textContent = opts.desc;
      goTo(stepSuccess);
      if (window.playSuccessSound) window.playSuccessSound();
      setTimeout(function () {
        window.location.replace(DikaAuth.HOME_PAGE);
      }, RM ? 300 : 1400);
    }
  });
})();
