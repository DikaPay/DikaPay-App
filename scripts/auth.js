/* ===========================================================================
   DikaPay — auth.js
   Penjaga sesi DUMMY untuk halaman member. Di-link PALING ATAS di <head>
   SEMUA halaman (auth.html ikut me-link — auto-guard-nya sengaja dilewati
   di sana, lihat catatan di bawah).

   Fase 1: hanya cek flag "dikapay:auth". TIDAK ada verifikasi kredensial
   nyata — itu tugas backend di fase berikutnya (POST /api/auth/login ->
   token; token disimpan & dikirim di header lewat api.js).

   PENTING — anti-lockout:
   Flag ditulis ke localStorage DAN sessionStorage, plus fallback di memori.
   Kalau DOM storage sama sekali tidak bisa dipakai (mode private, WebView
   dengan DOM storage mati, sebagian konteks file://), guard() TIDAK memaksa
   redirect — kalau tidak, aplikasi looping selamanya: auth-flow.js menulis
   flag (gagal diam-diam) -> index.html -> guard() tidak menemukan flag ->
   balik ke auth.html. Fase 1 auth-nya memang dummy (menerima kredensial apa
   pun asal formatnya benar), jadi "fail open" di sini tidak menghilangkan
   proteksi nyata apa pun. Di fase 3 guard diganti verifikasi token ke
   backend dan HARUS fail closed.

   Beda dengan AdminPanel: DikaPay adalah aplikasi MEMBER yang akan dibungkus
   jadi APK, jadi sesi diharapkan bertahan setelah app ditutup —
   localStorage dibaca lebih dulu. AdminPanel sengaja per-tab (sessionStorage).

   STRUKTUR FOLDER (lihat CLAUDE.md): auth.js sendiri hidup di /scripts/, tapi
   yang menentukan path di sini adalah di HALAMAN MANA ia di-load — auth.js
   dipakai baik oleh index.html (root) maupun ke-31 halaman lain di /pages/.
   Path relatif "auth.html" hanya benar dari dalam /pages/; dari root harus
   "pages/auth.html". LOGIN_PAGE dihitung runtime lewat inPages() supaya
   TETAP satu implementasi (bukan disalin per lokasi) dan TETAP path relatif
   (bukan absolut "/pages/auth.html") — kompatibilitas Capacitor nanti minta
   path relatif, lihat CLAUDE.md "Aturan Pengembangan". HOME_PAGE tidak perlu
   logika serupa: satu-satunya pemakainya (auth-flow.js) SELALU dimuat dari
   dalam /pages/, jadi cukup konstanta tetap.

   JANGAN taruh logika bisnis / rahasia di sini.
   =========================================================================== */

"use strict";

(function () {
  var KEY = "dikapay:auth";
  var PROBE = "dikapay:authprobe";

  /* true kalau dokumen saat ini ada di /pages/ (semua halaman KECUALI
     index.html di root). Dipakai untuk menghitung path relatif yang benar
     ke auth.html dari kedua lokasi. */
  function inPages() { return /\/pages\//.test(location.pathname || ""); }

  var LOGIN_PAGE = inPages() ? "auth.html" : "pages/auth.html";
  var HOME_PAGE = "../index.html"; // hanya dipakai dari dalam /pages/ (auth-flow.js)
  var mem = false;                 // fallback terakhir (per-dokumen)

  /* Storage bisa dipakai? Probe tulis-baca-hapus di localStorage lalu
     sessionStorage. Return false kalau dua-duanya melempar / tidak round-trip. */
  function storageUsable() {
    var stores = [];
    try { stores.push(window.localStorage); } catch (e) {}
    try { stores.push(window.sessionStorage); } catch (e) {}
    for (var i = 0; i < stores.length; i++) {
      try {
        stores[i].setItem(PROBE, "1");
        var ok = stores[i].getItem(PROBE) === "1";
        stores[i].removeItem(PROBE);
        if (ok) return true;
      } catch (e) {}
    }
    return false;
  }

  function read() {
    try {
      var v = localStorage.getItem(KEY);
      if (v !== null) return v === "1";
    } catch (e) {}
    try {
      var v2 = sessionStorage.getItem(KEY);
      if (v2 !== null) return v2 === "1";
    } catch (e) {}
    return mem;
  }

  function write(on) {
    mem = !!on;
    try {
      if (on) { localStorage.setItem(KEY, "1"); } else { localStorage.removeItem(KEY); }
    } catch (e) {}
    try {
      if (on) { sessionStorage.setItem(KEY, "1"); } else { sessionStorage.removeItem(KEY); }
    } catch (e) {}
  }

  /* Halaman auth = auth.html (dulu login.html + register.html terpisah,
     sekarang satu alur). Boleh diakses saat BELUM masuk, jadi auto-guard
     dilewati di sini. */
  function isAuthPage() {
    return /(^|\/)auth\.html$/i.test(location.pathname || "");
  }

  window.DikaAuth = {
    KEY: KEY,
    LOGIN_PAGE: LOGIN_PAGE,
    HOME_PAGE: HOME_PAGE,

    isLoggedIn: function () { return read(); },

    login: function () { write(true); },

    /* Keluar: hapus flag lalu ke login. Profil (`dikapay:profile`) & data
       lain SENGAJA tidak dihapus — fase 1 masih dummy, dan menghapusnya
       akan menghilangkan data contoh yang dipakai halaman lain.

       `DikaLock.bersihkanSaatLogout()` (auto-lock.js) WAJIB dipanggil di
       sini — lihat "BUG: PIN DIMINTA DUA KALI SETELAH LOGOUT -> LOGIN" di
       auto-lock.js. Tanpa ini, penanda akun aktif auto-lock ikut terbawa
       ke sesi login berikutnya (akun sama ATAUPUN beda), dan layar kunci
       PIN bisa tampil lagi tepat setelah PIN login baru saja dimasukkan.
       Dijaga `if (window.DikaLock...)` karena auto-lock.js dimuat SETELAH
       auth.js di <head> — di titik logout() ini benar-benar DIPANGGIL
       (klik tombol Keluar, jauh setelah semua script termuat) modul itu
       sudah pasti ada, guard ini murni jaga-jaga kalau ada halaman yang
       lupa me-link-nya. */
    logout: function () {
      try {
        if (window.DikaLock && typeof DikaLock.bersihkanSaatLogout === "function") {
          DikaLock.bersihkanSaatLogout();
        }
      } catch (e) { console.error("[DikaAuth] gagal membersihkan penanda auto-lock saat logout:", e); }
      write(false);
      window.location.replace(LOGIN_PAGE);
    },

    /* Redirect ke login bila belum masuk. Fail-open kalau storage mati
       (lihat catatan anti-lockout di header file). */
    guard: function () {
      if (this.isLoggedIn()) return true;
      if (!storageUsable()) {
        console.warn(
          "[DikaAuth] DOM storage tidak tersedia — guard dilewati supaya tidak " +
          "terkunci di halaman login. Sesi fase 1 memang dummy."
        );
        return true;
      }
      window.location.replace(LOGIN_PAGE);
      return false;
    },
  };

  /* Guard otomatis untuk halaman member. auth.html SENGAJA dilewati — guard
     di sana akan bikin loop redirect ke dirinya sendiri. Dengan pengecualian
     ini auth.html tetap boleh me-link auth.js, jadi tidak perlu menduplikasi
     akses storage mentah di auth-flow.js. */
  if (!isAuthPage()) {
    window.DikaAuth.guard();
  }
})();
