/* ===========================================================================
   DikaPay — google-auth.js
   SATU-SATUNYA pintu ke Google Sign-In native. Pola yang SAMA dengan
   biometrik.js: tanpa bundler, plugin diambil langsung dari
   window.Capacitor.Plugins, FAIL-CLOSED.

     window.DikaGoogleAuth = {
       tersedia()   // -> boolean SINKRON, plugin ada & app native?
       masuk()      // -> Promise<{ ok, kode, pesan, idToken, email, nama, foto }>
       keluar()     // -> Promise<void>
     }

   Plugin: @capacitor-community/google-auth (native name "GoogleAuth").
   `initialize()` dipanggil SEKALI sebelum signIn() pertama — kegagalannya
   TIDAK menghentikan alur (plugin lama boleh saja tidak butuh initialize
   eksplisit; kalau signIn() tetap gagal karena itu, itu tertangkap sendiri
   di catch masuk()).

   ATURAN: pembatalan member (kode "12501" / pesan mengandung "cancel") itu
   BUKAN bug — jangan di-console.error, cukup dikembalikan sebagai hasil
   ok:false biasa. Semua kegagalan LAIN dicatat ke console supaya ketahuan.
   =========================================================================== */

(function () {
  "use strict";

  var NAMA_PLUGIN = "GoogleAuth";
  var initialized = false;

  var PESAN = {
    tidakNative: "Masuk dengan Google hanya tersedia di aplikasi DikaPay yang terpasang di HP.",
    tanpaPlugin: "Modul Google Sign-In tidak tersedia di versi aplikasi ini.",
    tanpaIdToken: "Google tidak mengirimkan token yang valid. Coba lagi, ya.",
    dibatalkan: "Masuk dengan Google dibatalkan.",
    gagal: "Masuk dengan Google sedang tidak bisa dipakai. Coba lagi, ya.",
  };

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

  function tersedia() {
    return nativeApp() && !!plugin();
  }

  function pastikanInit(P) {
    if (initialized) return Promise.resolve();
    if (!P || typeof P.initialize !== "function") return Promise.resolve();
    return Promise.resolve(P.initialize())
      .then(function () { initialized = true; })
      .catch(function (e) {
        /* Gagal initialize tidak boleh menghentikan alur — lanjut coba
           signIn() apa adanya, plugin bisa saja sudah terkonfigurasi lewat
           capacitor.config.json tanpa perlu initialize() eksplisit. */
        console.warn("google-auth: initialize() gagal, lanjut coba signIn():", e);
      });
  }

  function kodeBatal(e) {
    var kode = String((e && (e.code || e.errorMessage)) || "");
    var pesan = String((e && e.message) || "").toLowerCase();
    return kode.indexOf("cancel") !== -1 || kode === "12501" || pesan.indexOf("cancel") !== -1;
  }

  function masuk() {
    if (!nativeApp()) {
      return Promise.resolve({ ok: false, kode: "tidakNative", pesan: PESAN.tidakNative });
    }
    var P = plugin();
    if (!P || typeof P.signIn !== "function") {
      return Promise.resolve({ ok: false, kode: "tanpaPlugin", pesan: PESAN.tanpaPlugin });
    }

    return pastikanInit(P)
      .then(function () { return P.signIn(); })
      .then(function (r) {
        var idToken = r && r.authentication && r.authentication.idToken;
        if (!idToken) {
          return { ok: false, kode: "tanpaIdToken", pesan: PESAN.tanpaIdToken };
        }
        return {
          ok: true,
          kode: "",
          pesan: "",
          idToken: idToken,
          email: (r && r.email) || "",
          nama: (r && r.name) || "",
          foto: (r && r.imageUrl) || "",
        };
      })
      .catch(function (e) {
        // TEMPORARY DIAGNOSTIC — lihat CLAUDE.md/catatan sesi sebelum menghapus:
        // dipasang untuk menelusuri kenapa signIn() gagal dengan kode "gagal"
        // generik di HP sungguhan. Hapus setelah penyebabnya ketemu & diperbaiki.
        //
        // DIPERLUAS: error.code/error.message saja tidak cukup -- ApiException
        // Android asli (dari GoogleSignInClient/GoogleApiClient) sering punya
        // field LAIN yang lebih spesifik ("status", "statusMessage",
        // "statusCode", dst) yang tertelan Capacitor saat dijembatani ke JS
        // sebagai object polos. JSON.stringify(e, Object.getOwnPropertyNames(e))
        // mengambil SEMUA properti sendiri objeknya (termasuk yang non-
        // enumerable seperti biasanya dipakai instance Error), bukan cuma
        // code/message yang kita tebak sebelumnya.
        var detailLengkap;
        try {
          detailLengkap = JSON.stringify(e, Object.getOwnPropertyNames(e || {}), 2);
        } catch (jsonErr) {
          detailLengkap = "(gagal di-JSON.stringify: " + jsonErr.message + ") String(e) = " + String(e);
        }
        console.error("google-auth: RAW ERROR (lengkap):", e, "\nDETAIL:", detailLengkap);
        // TEMPORARY DIAGNOSTIC — HAPUS bersamaan dengan blok console.error di
        // atas begitu penyebabnya ketemu & diperbaiki. JANGAN ikut ke rilis.
        try {
          alert("RAW ERROR (LENGKAP)\n\n" + detailLengkap +
            "\n\n--- ringkasan ---\ncode: " + (e && e.code) + "\nmessage: " + (e && e.message));
        } catch (alertErr) {}
        if (kodeBatal(e)) {
          return { ok: false, kode: "dibatalkan", pesan: PESAN.dibatalkan };
        }
        console.error("google-auth: signIn gagal:", e);
        return { ok: false, kode: "gagal", pesan: PESAN.gagal };
      });
  }

  function keluar() {
    var P = plugin();
    if (!P || typeof P.signOut !== "function") return Promise.resolve();
    return Promise.resolve(P.signOut())
      .catch(function (e) { console.warn("google-auth: signOut gagal:", e); });
  }

  window.DikaGoogleAuth = {
    tersedia: tersedia,
    masuk: masuk,
    keluar: keluar,
  };
})();
