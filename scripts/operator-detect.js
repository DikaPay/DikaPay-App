/* ===========================================================================
   DikaPay — operator-detect.js
   Deteksi operator seluler dari prefix nomor HP + helper format.
   Dipakai bersama oleh SEMUA halaman produk seluler (pulsa.html,
   paket-data.html, masa-aktif, perdana, sms-telpon, hp-pasca) DAN oleh
   auth.html (auth-flow.js) untuk MEMVALIDASI nomor saat masuk/daftar —
   di sana hasil detect() cuma dipakai sebagai "prefix dikenal / tidak",
   nama operatornya SENGAJA tidak pernah ditampilkan ke member.

   Di-link SETELAH style.css, SEBELUM produk-page.js & script halaman.
   JANGAN duplikasi peta prefix / warna operator ke file lain — kalau
   Kominfo merilis prefix baru, OPERATORS di bawah ini SATU-SATUNYA yang
   perlu diperbarui, dan validasi auth ikut terbawa otomatis.

   Catatan fase 2 (lihat CLAUDE.md): peta prefix boleh tetap di front-end
   (bukan rahasia), tapi HARGA produk wajib datang dari backend lewat api.js.
   =========================================================================== */

(function () {
  "use strict";

  var MAX_DIGITS = 13;   // panjang maksimum nomor HP yang diterima input
  var MIN_DETECT = 4;    // deteksi operator baru jalan setelah 4 digit pertama

  /* ---- Operator: prefix + identitas brand -------------------------
     `color` = warna brand operator. Ini SATU-SATUNYA tempat warna di luar
     token style.css; dipasang ke CSS lewat custom property --op / --op-bg. */

  var OPERATORS = {
    telkomsel: {
      name: "Telkomsel", short: "T", color: "#E62129",
      prefixes: ["0811", "0812", "0813", "0821", "0822", "0823", "0851", "0852", "0853"],
    },
    indosat: {
      name: "Indosat", short: "I", color: "#E0A400",
      prefixes: ["0814", "0815", "0816", "0855", "0856", "0857", "0858"],
    },
    xl: {
      name: "XL", short: "XL", color: "#1B6FE0",
      prefixes: ["0817", "0818", "0819", "0859", "0877", "0878", "0879"],
    },
    axis: {
      /* 0834–0837 SENGAJA TIDAK ADA — sering disangka Axis memakai blok
         0831–0838 utuh, padahal yang benar-benar dipakai cuma 4 prefix ini
         (dicek ulang ke referensi publik, bukan dari ingatan). */
      name: "Axis", short: "A", color: "#8B3FD1",
      prefixes: ["0831", "0832", "0833", "0838"],
    },
    three: {
      name: "Three", short: "3", color: "#5A6273",
      prefixes: ["0895", "0896", "0897", "0898", "0899"],
    },
    smartfren: {
      name: "Smartfren", short: "S", color: "#E5397F",
      prefixes: ["0881", "0882", "0883", "0884", "0885", "0886", "0887", "0888", "0889"],
    },
  };

  /* Peta prefix → key operator, dibangun sekali saat load (lookup O(1)) */
  var PREFIX_MAP = {};
  Object.keys(OPERATORS).forEach(function (key) {
    OPERATORS[key].prefixes.forEach(function (p) { PREFIX_MAP[p] = key; });
  });

  /* ---- Format ------------------------------------------------------
     fmtRupiah/fmtNumber yang generik ada di produk-ui.js — di sini hanya
     format yang khusus nomor telepon. */

  /* Sisipkan strip biar nomor panjang enak dibaca: 0812-3456-7890 */
  function prettyPhone(digits) {
    return String(digits || "").replace(/(\d{4})(?=\d)/g, "$1-");
  }

  /* ---- Input & deteksi --------------------------------------------- */

  /* Buang semua non-digit, normalkan format internasional, potong ke MAX_DIGITS */
  function sanitize(raw) {
    var d = String(raw || "").replace(/\D/g, "");
    /* Nomor yang ditulis/di-paste format internasional (62812…, +62 812…) →
       jadikan 0812… supaya prefix tetap terdeteksi. Normalisasi baru jalan
       kalau hasilnya memang prefix yang dikenal, jadi angka tidak "melompat"
       saat pengguna baru mengetik "62". */
    if (d.length >= MIN_DETECT + 1 && d.slice(0, 2) === "62") {
      var local = "0" + d.slice(2);
      if (PREFIX_MAP[local.slice(0, MIN_DETECT)]) d = local;
    }
    return d.slice(0, MAX_DIGITS);
  }

  /* Key operator dari 4 digit pertama — null kalau belum cukup / tak dikenal */
  function detect(digits) {
    var d = String(digits || "");
    if (d.length < MIN_DETECT) return null;
    return PREFIX_MAP[d.slice(0, MIN_DETECT)] || null;
  }

  function get(opKey) {
    return (opKey && OPERATORS[opKey]) || null;
  }

  /* ---- Markup badge / peringatan ----------------------------------- */

  /* Warna brand diubah jadi varian yang aman di tema terang oleh
     produk-ui.js (brandVars). Peta warna di file ini TETAP satu-satunya
     sumber; yang dihitung di sana hanya lightness untuk tampilan. */
  function opStyle(color) {
    var UI = window.DikaProdukUI;
    return UI && UI.brandVars ? UI.brandVars(color, "op")
      : "--op:" + color + ";--op-bg:" + color + "1F";
  }

  function badgeHtml(opKey) {
    var op = get(opKey);
    if (!op) return "";
    return '<span class="opbadge" style="' + opStyle(op.color) + '">' +
      '<span class="opbadge__mark">' + op.short + "</span>" +
      '<span class="opbadge__name">' + op.name + "</span>" +
      "</span>";
  }

  function warnHtml() {
    return '<p class="opwarn">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5M12 16.2h.01"/></svg>' +
      "Operator tidak terdeteksi, cek kembali nomor HP</p>";
  }

  /* Isi baris hasil deteksi: badge operator, pesan error, atau kosong */
  function renderBar(el, digits, opKey) {
    if (!el) return;
    if (String(digits || "").length < MIN_DETECT) {
      el.innerHTML = "";
      el.classList.remove("is-filled");
      return;
    }
    el.innerHTML = opKey ? badgeHtml(opKey) : warnHtml();
    el.classList.add("is-filled");
  }

  /* ---- API publik --------------------------------------------------- */

  /* ---- Validasi FINAL nomor HP --------------------------------------
     SATU-SATUNYA definisi "nomor HP Indonesia yang sah" di project ini —
     dipakai auth.html (saat mendaftar/masuk) DAN semua halaman produk
     yang fieldnya benar-benar nomor HP. Jangan menyalin aturannya.

     Dua syarat, keduanya wajib:
       1. Prefiksnya dipakai operator sungguhan (bukan sekadar diawali 08)
       2. Panjang total 10-13 digit, standar nomor seluler Indonesia

     BEDA dengan detect(): detect() cukup 4 digit supaya badge operator &
     daftar produk bisa muncul lebih awal saat member masih mengetik. Itu
     untuk PREVIEW. Sebelum transaksi benar-benar dikirim, yang dipakai
     HARUS isValidPhone() — kalau tidak, nomor sependek "0852" bisa lolos
     sampai ke penyedia pihak ketiga. */

  var MIN_LEN = 10;
  var MAX_LEN = 13;

  function isValidPhone(digits) {
    var d = String(digits || "").replace(/\D/g, "");
    if (d.length < MIN_LEN || d.length > MAX_LEN) return false;
    return !!detect(d);
  }

  /* Alasan spesifik kenapa sebuah nomor ditolak — dipakai untuk pesan
     error yang menuntun, bukan sekadar "tidak valid". Nama operator
     TIDAK PERNAH disebut di pesan mana pun (lihat CLAUDE.md). */
  function phoneProblem(digits) {
    var d = String(digits || "").replace(/\D/g, "");
    if (!d) return "kosong";
    if (d.length < MIN_LEN) return "pendek";
    if (d.length > MAX_LEN) return "panjang";
    if (!detect(d)) return "prefix";
    return null;
  }

  window.DikaOperator = {
    MAX_DIGITS: MAX_DIGITS,
    MIN_DETECT: MIN_DETECT,
    MIN_LEN: MIN_LEN,
    MAX_LEN: MAX_LEN,
    OPERATORS: OPERATORS,
    PREFIX_MAP: PREFIX_MAP,
    get: get,
    detect: detect,
    isValidPhone: isValidPhone,
    phoneProblem: phoneProblem,
    sanitize: sanitize,
    prettyPhone: prettyPhone,
    badgeHtml: badgeHtml,
    warnHtml: warnHtml,
    renderBar: renderBar,
  };
})();
