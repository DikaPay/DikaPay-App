/* ===========================================================================
   DikaPay — biometrik.js
   SATU-SATUNYA pintu ke sensor biometrik perangkat.

     window.DikaBiometrik = {
       KEY                  // "dikapay:settings:biometric"
       aktif()              // preferensi member (toggle di Akun > Keamanan)
       setAktif(bool)
       periksa()            // -> Promise<{ ada, kode, pesan, tipe }>
       autentikasi(alasan)  // -> Promise<{ ok, kode, pesan }>
     }

   ========================= KENAPA MODUL INI ADA =========================
   Sebelumnya tombol sidik jari di halaman login HANYA animasi: menekannya
   menjalankan setTimeout 900 md lalu langsung activateSession() — tanpa
   syarat apa pun. Tidak ada plugin biometrik terpasang, tidak ada izin
   USE_BIOMETRIC di manifest, tidak ada jalur gagal.

   Yang memperparah: begitu toggle biometrik menyala, keypad PIN
   DISEMBUNYIKAN dan tombol sidik jari jadi jalan masuk utama. Jadi siapa
   pun yang memegang HP itu masuk ke akun member dengan SATU KETUKAN —
   lebih buruk daripada tidak punya biometrik sama sekali.

   ATURAN MODUL INI: FAIL-CLOSED.
   autentikasi() hanya mengembalikan { ok: true } kalau prompt biometrik
   ASLI milik Android menjawab sukses. Plugin tidak ada, bukan aplikasi
   native, sensor tidak terdaftar, member membatalkan, error apa pun —
   semuanya ok: false. JANGAN pernah menambah jalur "anggap saja berhasil"
   di sini; kalau biometrik tidak bisa dipakai, member masuk lewat PIN.
   =======================================================================

   Plugin: @aparajita/capacitor-biometric-auth (native name
   "BiometricAuthNative"). Project ini tanpa bundler, jadi paket ESM-nya
   TIDAK di-import — objek plugin diambil langsung dari
   window.Capacitor.Plugins, dan `internalAuthenticate` dipanggil apa
   adanya (di paket aslinya `authenticate()` cuma pembungkus tipis yang
   mengubah reject jadi BiometryError).

   TODO fase 3: biometrik sebaiknya membuka KUNCI kredensial yang
   tersimpan aman (Keystore), bukan sekadar gerbang UI seperti sekarang.
   Selama sesi masih dummy di localStorage, ini sudah setara PIN lokal.

   =============== SUDAH DIRISET: TIDAK BISA memisah Wajah vs Sidik Jari ======
   Android's `BiometricPrompt`/`BiometricManager.Authenticators` (dan plugin
   ini di atasnya, lihat `AuthenticateOptions.androidBiometryStrength`) HANYA
   menerima kelas KEKUATAN (`BIOMETRIC_STRONG` / `BIOMETRIC_WEAK` / opsional
   `DEVICE_CREDENTIAL`) — TIDAK ADA parameter modalitas ("hanya wajah" / "hanya
   sidik jari") di API publik mana pun, baik di plugin ini maupun di
   `androidx.biometric` native-nya (dikonfirmasi dari `AuthActivity.java` milik
   plugin: satu-satunya yang dibaca dari intent adalah `BIOMETRIC_STRENGTH` +
   `DEVICE_CREDENTIAL`, tidak ada field tipe biometrik). `checkBiometry()`
   memang melaporkan `biometryTypes` (dari `PackageManager.hasSystemFeature`),
   tapi itu cuma INFORMASI perangkat kerasnya, bukan parameter yang bisa
   dikirim balik ke `authenticate()` untuk membatasi sensor mana yang dipakai.
   Keputusan sensor mana yang muncul di prompt sepenuhnya di tangan OS/HP
   (Pengaturan > Keamanan > Biometrik member), bukan aplikasi. `FingerprintManager`
   lama (pre-androidx.biometric) memang spesifik sidik jari, tapi sudah
   deprecated sejak API 28 justru demi menyatukan UX lewat BiometricPrompt —
   memakainya lagi berarti mundur ke API usang TANPA menyelesaikan sisi wajah
   sama sekali (tidak ada "FaceManager" publik yang setara).

   KESIMPULAN: dua toggle independen "Verifikasi Wajah" / "Verifikasi Sidik
   Jari" TIDAK bisa dibuat sungguhan aktif-mengontrol-sensor tanpa API tidak
   resmi/rentan. Solusi yang dipakai: TETAP SATU toggle "Login dengan
   Biometrik" (`akun.html`/`akun.js`), dengan copy yang menjelaskan metode
   spesifiknya ditentukan otomatis oleh HP masing-masing member — lihat
   `acc.sec.bio.sub` di `translations.js`. JANGAN menambah toggle checklist
   "izinkan wajah"/"izinkan sidik jari" yang terlihat berfungsi tapi diam-diam
   tidak menyaring apa pun di `authenticate()` — itu UI yang berbohong tentang
   kemampuannya sendiri, bukan cuma "kurang aman".
   =========================================================================== */

(function () {
  "use strict";

  var KEY = "dikapay:settings:biometric";
  var NAMA_PLUGIN = "BiometricAuthNative";

  /* Pesan per kode error plugin, dalam bahasa yang bisa ditindaklanjuti
     member. Kode mentahnya ("biometryNotEnrolled") tidak berarti apa-apa
     buat orang yang cuma mau masuk ke akunnya. */
  var PESAN = {
    biometryNotAvailable: "Perangkat ini tidak punya sensor biometrik.",
    biometryNotEnrolled: "Belum ada sidik jari/wajah yang didaftarkan di HP ini. Daftarkan dulu lewat Pengaturan HP, ya.",
    biometryNotPresent: "Perangkat ini tidak punya sensor biometrik.",
    biometryLockout: "Terlalu banyak percobaan gagal. Coba lagi nanti atau pakai PIN.",
    passcodeNotSet: "Kunci layar HP belum diaktifkan. Aktifkan dulu PIN/pola HP-nya, ya.",
    userCancel: "Pemindaian dibatalkan.",
    systemCancel: "Pemindaian dihentikan sistem.",
    appCancel: "Pemindaian dibatalkan.",
    authenticationFailed: "Sidik jari/wajah tidak dikenali. Coba lagi, atau pakai PIN.",
    userFallback: "Kamu memilih masuk dengan cara lain.",
    tidakNative: "Login biometrik hanya tersedia di aplikasi DikaPay yang terpasang di HP.",
    tanpaPlugin: "Modul biometrik tidak tersedia di versi aplikasi ini.",
    gagal: "Pemindaian biometrik sedang tidak bisa dipakai.",
  };

  function pesanDari(kode, bawaan) {
    return (kode && PESAN[kode]) || bawaan || PESAN.gagal;
  }

  function nativeApp() {
    try {
      return !!(window.Capacitor &&
        typeof window.Capacitor.isNativePlatform === "function" &&
        window.Capacitor.isNativePlatform());
    } catch (e) { return false; }
  }

  function plugin() {
    try {
      var P = window.Capacitor && window.Capacitor.Plugins;
      return (P && P[NAMA_PLUGIN]) || null;
    } catch (e) { return null; }
  }

  /* ---- Preferensi member --------------------------------------------
     Kunci yang SAMA dengan sebelumnya supaya perangkat yang sudah pernah
     menyalakannya tidak kehilangan setelan. */

  function aktif() {
    try { return localStorage.getItem(KEY) === "1"; } catch (e) { return false; }
  }

  function setAktif(v) {
    try { localStorage.setItem(KEY, v ? "1" : "0"); return true; }
    catch (e) { console.error("biometrik: gagal menyimpan preferensi:", e); return false; }
  }

  /* ---- Ketersediaan --------------------------------------------------
     `isAvailable` plugin sudah menggabungkan "hardware ada" DAN "member
     sudah mendaftarkan sidik jari/wajah". Keduanya harus benar; perangkat
     dengan sensor tapi tanpa pendaftaran tidak bisa memunculkan prompt. */

  function periksa() {
    if (!nativeApp()) {
      return Promise.resolve({ ada: false, kode: "tidakNative", pesan: PESAN.tidakNative, tipe: 0 });
    }
    var P = plugin();
    if (!P || typeof P.checkBiometry !== "function") {
      return Promise.resolve({ ada: false, kode: "tanpaPlugin", pesan: PESAN.tanpaPlugin, tipe: 0 });
    }
    return Promise.resolve(P.checkBiometry())
      .then(function (r) {
        if (r && r.isAvailable) {
          return { ada: true, kode: "", pesan: "", tipe: (r.biometryTypes && r.biometryTypes[0]) || r.biometryType || 0 };
        }
        /* Plugin memberi tahu ALASAN-nya lewat `reason`/`code` — dipakai
           supaya member tahu harus berbuat apa, bukan cuma "tidak bisa". */
        var kode = (r && (r.code || r.strongCode)) || "biometryNotAvailable";
        return {
          ada: false,
          kode: kode,
          pesan: pesanDari(kode, (r && (r.reason || r.strongReason)) || PESAN.gagal),
          tipe: (r && r.biometryType) || 0,
        };
      })
      .catch(function (e) {
        console.error("biometrik: checkBiometry gagal:", e);
        return { ada: false, kode: "gagal", pesan: PESAN.gagal, tipe: 0 };
      });
  }

  /* ---- Autentikasi ---------------------------------------------------
     `allowDeviceCredential: false` DISENGAJA: kalau PIN/pola HP diterima
     sebagai pengganti sidik jari, "login biometrik" berubah jadi "login
     dengan kunci layar HP" — bukan itu yang dijanjikan ke member, dan
     app ini sudah punya PIN-nya sendiri sebagai jalur alternatif. */

  function autentikasi(alasan) {
    return periksa().then(function (p) {
      if (!p.ada) return { ok: false, kode: p.kode, pesan: p.pesan };

      var P = plugin();
      if (!P || typeof P.internalAuthenticate !== "function") {
        return { ok: false, kode: "tanpaPlugin", pesan: PESAN.tanpaPlugin };
      }

      return Promise.resolve(P.internalAuthenticate({
        reason: alasan || "Buktikan bahwa ini benar kamu",
        title: "Masuk ke DikaPay",
        subtitle: alasan || "Verifikasi lewat sensor biometrik kamu",
        cancelTitle: "Pakai PIN saja",
        allowDeviceCredential: false,
        androidConfirmationRequired: false,
      }))
        .then(function () { return { ok: true, kode: "", pesan: "" }; })
        .catch(function (e) {
          /* Capacitor menaruh argumen kedua call.reject() di `.code`. */
          var kode = (e && (e.code || e.errorMessage)) || "gagal";
          var pesan = pesanDari(kode, e && e.message);
          if (kode !== "userCancel" && kode !== "systemCancel") {
            console.warn("biometrik: autentikasi gagal:", kode, e && e.message);
          }
          return { ok: false, kode: kode, pesan: pesan };
        });
    });
  }

  window.DikaBiometrik = {
    KEY: KEY,
    aktif: aktif,
    setAktif: setAktif,
    periksa: periksa,
    autentikasi: autentikasi,
  };
})();
