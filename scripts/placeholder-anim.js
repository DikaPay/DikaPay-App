/* ===========================================================================
   DikaPay — placeholder-anim.js
   Placeholder BERANIMASI untuk field input nomor.

     window.DikaPlaceholder = {
       pasang(input, contoh[])   // mulai animasi ketik bergantian
       contohNomorHP()           // contoh nomor dari prefix operator asli
       lepas(input)              // hentikan & kembalikan placeholder semula
     }

   SATU implementasi untuk SEMUA halaman produk — dipanggil dari controller
   (produk-page / provider-page / manual-page / listrik), jadi 28+ halaman
   tidak perlu menambah kode apa pun.

   Polanya menyalin typewriter search bar di riwayat.js (ketik -> jeda ->
   hapus -> contoh berikutnya) dengan aturan yang sama: BERHENTI saat field
   difokuskan atau sudah ada isinya, lanjut lagi saat ditinggalkan dalam
   keadaan kosong. Animasi placeholder yang terus berjalan sambil member
   mengetik hanya mengganggu dan bikin field terasa "hidup sendiri".

   prefers-reduced-motion: tidak mengetik huruf per huruf, hanya berganti
   contoh dengan jeda lebih panjang.
   =========================================================================== */

(function () {
  "use strict";

  var RM = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var KETIK_MS = 90;     /* jeda antar huruf saat mengetik */
  var HAPUS_MS = 45;     /* menghapus terasa lebih cepat dari mengetik */
  var TAHAN_MS = 1600;   /* contoh utuh ditahan sebentar supaya terbaca */
  var RM_MS = 2600;      /* mode reduced-motion: sekadar berganti contoh */

  var aktif = [];        /* semua animasi yang sedang berjalan */

  /* Contoh nomor HP dibangun dari PREFIX ASLI di operator-detect.js —
     bukan angka karangan. Kalau daftar prefix bertambah (mis. Kominfo
     merilis blok baru), contohnya ikut tanpa perlu disunting di sini. */
  function contohNomorHP(jumlah) {
    var fallback = ["0812 3456 7890", "0857 1234 5678", "0896 2345 6789", "0817 8765 4321"];
    try {
      var OP = window.DikaOperator;
      if (!OP || !OP.OPERATORS) return fallback;
      var out = [];
      Object.keys(OP.OPERATORS).forEach(function (k) {
        var p = OP.OPERATORS[k].prefixes;
        if (p && p.length) out.push(p[0] + " 1234 5678");
      });
      return out.length ? out.slice(0, jumlah || 5) : fallback;
    } catch (e) {
      console.error("placeholder-anim: gagal membaca prefix operator:", e);
      return fallback;
    }
  }

  function pasang(input, contoh) {
    var el = typeof input === "string" ? document.getElementById(input) : input;
    if (!el || !Array.isArray(contoh) || !contoh.length) return null;
    if (el.dataset.phAnim === "1") return null;      /* jangan dipasang dua kali */

    var st = {
      el: el,
      contoh: contoh,
      asli: el.getAttribute("placeholder") || "",
      idx: 0,
      char: 0,
      hapus: false,
      timer: 0,
      berhenti: false,
    };
    el.dataset.phAnim = "1";

    function tulis(teks) {
      /* Kalau member sudah mengetik, JANGAN sentuh placeholder-nya lagi. */
      if (el.value) return;
      el.setAttribute("placeholder", teks);
    }

    function langkah() {
      if (st.berhenti) return;
      var full = st.contoh[st.idx];

      if (RM) {
        tulis(full);
        st.idx = (st.idx + 1) % st.contoh.length;
        st.timer = window.setTimeout(langkah, RM_MS);
        return;
      }

      if (!st.hapus) {
        st.char++;
        tulis(full.slice(0, st.char));
        if (st.char >= full.length) {
          st.hapus = true;
          st.timer = window.setTimeout(langkah, TAHAN_MS);
          return;
        }
        st.timer = window.setTimeout(langkah, KETIK_MS);
      } else {
        st.char--;
        tulis(full.slice(0, Math.max(0, st.char)));
        if (st.char <= 0) {
          st.hapus = false;
          st.idx = (st.idx + 1) % st.contoh.length;
        }
        st.timer = window.setTimeout(langkah, HAPUS_MS);
      }
    }

    function mulai() {
      if (st.berhenti || st.timer) return;
      st.timer = window.setTimeout(langkah, 400);
    }
    function jeda() {
      window.clearTimeout(st.timer);
      st.timer = 0;
    }

    /* Saat difokuskan atau sudah ada isinya, animasi berhenti dan
       placeholder dikembalikan ke teks aslinya — member yang sedang
       mengisi tidak perlu melihat teks berkedip di belakang ketikannya. */
    el.addEventListener("focus", function () {
      jeda();
      el.setAttribute("placeholder", st.asli);
    });
    el.addEventListener("blur", function () {
      if (!el.value) mulai();
    });
    el.addEventListener("input", function () {
      if (el.value) jeda();
      else if (document.activeElement !== el) mulai();
    });

    aktif.push(st);
    mulai();
    return st;
  }

  function lepas(input) {
    var el = typeof input === "string" ? document.getElementById(input) : input;
    aktif = aktif.filter(function (st) {
      if (st.el !== el) return true;
      st.berhenti = true;
      window.clearTimeout(st.timer);
      st.el.setAttribute("placeholder", st.asli);
      delete st.el.dataset.phAnim;
      return false;
    });
  }

  /* Halaman ditinggalkan -> hentikan semua timer supaya tidak ada
     setTimeout menggantung saat masuk bfcache. */
  window.addEventListener("pagehide", function () {
    aktif.forEach(function (st) {
      st.berhenti = true;
      window.clearTimeout(st.timer);
    });
    aktif = [];
  });

  window.DikaPlaceholder = {
    pasang: pasang,
    lepas: lepas,
    contohNomorHP: contohNomorHP,
  };
})();
