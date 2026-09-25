/* ===========================================================================
   DikaPay — sound.js
   Utility BERSAMA untuk suara notifikasi transaksi (pola "ting" ala DANA/OVO).
   SATU-SATUNYA tempat yang menyentuh Audio API untuk efek suara — jangan
   panggil `new Audio(...)` langsung dari halaman lain, pakai
   window.playSuccessSound().

   Kapan dipanggil: tepat saat sebuah TRANSAKSI (perpindahan saldo nyata)
   selesai dengan status sukses DAN layar/animasi suksesnya mulai tampil —
   panggil di baris yang sama dengan kode yang menampilkan layar itu (mis.
   melepas atribut `hidden`), supaya suara & animasi checkmark terasa
   bersamaan, bukan lebih dulu/telat.

   BUKAN untuk toast pengaturan biasa (ubah profil, ubah margin, PIN, 2FA,
   dst — itu bukan transaksi) dan BUKAN untuk sheet "Segera Hadir"
   (window.DikaComingSoon) — itu justru bilang transaksi BELUM diproses,
   memutar suara sukses di situ menyesatkan.

   Per 2026-09, transfer-member.js SATU-SATUNYA pemanggil nyata — semua
   halaman pembelian produk (pulsa, paket data, listrik, dst.) & Top Up masih
   berakhir di DikaComingSoon (pembayaran asli belum ada, lihat CLAUDE.md).
   Begitu payment flow sungguhan datang di fase 2, panggil playSuccessSound()
   di layar suksesnya juga — ikuti pola yang sama seperti transfer-member.js.

   Di-link di halaman mana pun yang butuh; urutan relatif ke modul lain tidak
   penting, taruh sebelum script halaman yang memanggilnya.
   =========================================================================== */

"use strict";

(function () {
  var SOUND_PREF_KEY = "dikapay:settings:sound";

  /* Path assets/sounds/ relatif terhadap dokumen saat ini. sound.js dipanggil
     baik dari halaman di /pages/ maupun (nanti) dari root index.html, jadi
     kedalamannya beda — pola yang sama seperti LOGIN_PAGE di auth.js /
     ROUTES di bottomnav.js (lihat CLAUDE.md "Konvensi path lintas-folder"). */
  function inPages() { return /\/pages\//.test(location.pathname || ""); }
  var SOUND_URL = (inPages() ? "../assets/sounds/" : "assets/sounds/") + "success.mp3";

  /* Preferensi suara notifikasi. Default AKTIF kalau key belum pernah
     ditulis. UI toggle-nya belum dibuat — ini groundwork saja: begitu ada
     toggle (mis. di halaman Akun > Preferensi), cukup tulis "0"/"1" ke kunci
     ini lewat localStorage, playSuccessSound() otomatis mengikuti tanpa
     perubahan lain. */
  function soundEnabled() {
    try {
      var v = localStorage.getItem(SOUND_PREF_KEY);
      if (v === null) return true; // key belum ada -> default aktif
      return v !== "0" && v !== "false";
    } catch (e) {
      return true; // storage tidak bisa dipakai -> jangan blokir suara karena ini
    }
  }

  /* Suara "ting" transaksi berhasil. Aman dipanggil kapan pun — kalau file
     placeholder belum diganti, browser memblokir autoplay (kebijakan
     tanpa-interaksi-pengguna), atau Audio API tidak tersedia, GAGAL DIAM-DIAM
     (log console) dan TIDAK PERNAH melempar error yang bisa menghentikan
     alur transaksi yang memanggilnya. */
  window.playSuccessSound = function () {
    try {
      if (!soundEnabled()) return;
      if (typeof Audio === "undefined") return;

      var audio = new Audio(SOUND_URL);
      audio.addEventListener("error", function () {
        console.error("sound: file suara notifikasi gagal dimuat:", SOUND_URL);
      });

      var p = audio.play();
      // play() balikin Promise di browser modern; lebih lama (Safari lama)
      // tidak — jaga-jaga keduanya.
      if (p && typeof p.catch === "function") {
        p.catch(function (err) {
          console.error(
            "sound: pemutaran suara notifikasi diblokir/gagal (browser mungkin " +
            "menahan autoplay tanpa interaksi pengguna) — transaksi tetap lanjut:",
            err
          );
        });
      }
    } catch (err) {
      console.error("sound: playSuccessSound gagal total:", err);
    }
  };
})();
