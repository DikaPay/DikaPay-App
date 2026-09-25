/* ===========================================================================
   DikaPay — bottomnav.js
   Bottom navigation BERSAMA untuk semua halaman ber-nav (beranda, riwayat,
   margin, akun).

   Menggantikan 4 salinan moveIndicator() + handler klik nav + init rAF yang
   dulu tersebar di script.js / riwayat.js / margin.js / akun.js. Empat salinan
   itu gampang tidak sinkron (peta rute beda-beda, sebagian mengubah .is-active
   sebelum pindah halaman) dan jadi sumber bug "indikator emas nyangkut di tab
   yang salah" setelah navigasi back/forward (restore bfcache).

   Di-link SEBELUM script halaman, SETELAH paymodal.js (path relatif terhadap
   halaman yang me-link, lihat CLAUDE.md — dari /pages/: "../scripts/..."):
     <script src="paymodal.js"></script>
     <script src="bottomnav.js"></script>
     <script src="<halaman>.js"></script>

   File ini sendiri hidup di /scripts/, tapi dipakai baik oleh index.html
   (root) MAUPUN riwayat.html/margin.html/akun.html (/pages/) — dua lokasi
   beda kedalaman folder. ROUTES dihitung runtime lewat inPages() supaya tetap
   satu implementasi & tetap path relatif (bukan absolut), pola yang sama
   seperti LOGIN_PAGE di auth.js.

   API opsional: window.DikaNav.refresh() — paksa hitung ulang posisi indikator.
   =========================================================================== */

"use strict";

(function () {
  /* true kalau dokumen saat ini ada di /pages/ (index.html di root = false). */
  function inPages() { return /\/pages\//.test(location.pathname || ""); }

  /* tab -> file tujuan. 4 tab merata; tombol tengah "pay" sudah dihapus. */
  var ROUTES = inPages()
    ? { home: "../index.html", transaction: "riwayat.html", margin: "margin.html", account: "akun.html" }
    : { home: "index.html", transaction: "pages/riwayat.html", margin: "pages/margin.html", account: "pages/akun.html" };

  /* file halaman -> tab aktif. SUMBER KEBENARAN TUNGGAL untuk tab aktif —
     tidak lagi bergantung pada .is-active di markup (yang bisa basi setelah
     restore bfcache). */
  var PAGE_TAB = {
    "": "home",
    "index.html": "home",
    "riwayat.html": "transaction",
    "margin.html": "margin",
    "akun.html": "account",
  };

  var nav = null;
  var indicator = null;
  var currentTab = "home";

  function pageFile() {
    var f = (location.pathname.split("/").pop() || "").toLowerCase();
    return f;
  }

  function activeItem() {
    if (!nav) return null;
    return nav.querySelector('.bottom-nav__item[data-tab="' + currentTab + '"]');
  }

  function moveIndicator(item) {
    if (!item || !nav || !indicator) return;
    try {
      var navRect = nav.getBoundingClientRect();
      var rect = item.getBoundingClientRect();
      // Layout belum siap / nav tersembunyi → jangan paksa indikator ke 0
      // (itu yang bikin garis emas "nyangkut" di bawah tab pertama / Beranda).
      if (!rect.width || !navRect.width) return;
      var w = indicator.offsetWidth;
      indicator.style.transform =
        "translateX(" + (rect.left - navRect.left + rect.width / 2 - w / 2) + "px)";
    } catch (err) {
      console.error("[nav] moveIndicator gagal:", err);
    }
  }

  /* Pastikan .is-active menempel di tab halaman ini (dan lepas dari yang lain),
     lalu tempatkan indikator. Dipanggil saat load DAN tiap pageshow. */
  function syncActive() {
    if (!nav) return;
    var items = nav.querySelectorAll(".bottom-nav__item");
    for (var i = 0; i < items.length; i++) {
      items[i].classList.toggle("is-active", items[i].dataset.tab === currentTab);
    }
    moveIndicator(activeItem());
  }

  function onClick(e) {
    var btn = e.target.closest(".bottom-nav__item");
    if (!btn || !nav.contains(btn)) return;
    var tab = btn.dataset.tab;
    if (tab === currentTab) return;
    var dest = ROUTES[tab];
    if (!dest) return;
    moveIndicator(btn); // gerak dulu biar responsif; halaman tujuan sync sendiri
    window.location.href = dest;
  }

  function init() {
    nav = document.getElementById("bottomNav");
    indicator = document.getElementById("navIndicator");
    if (!nav) return; // halaman tanpa bottom nav (statistik, notifikasi)

    currentTab = PAGE_TAB[pageFile()] || "home";

    nav.addEventListener("click", onClick);

    requestAnimationFrame(function () {
      syncActive();
      requestAnimationFrame(function () { nav.classList.add("is-ready"); });
    });

    window.addEventListener("resize", function () {
      moveIndicator(activeItem());
    });

    /* bfcache: DOMContentLoaded TIDAK jalan lagi saat kembali via back/forward,
       jadi indikator & tab aktif bisa basi. pageshow SELALU jalan → di sinilah
       keduanya dipulihkan. */
    window.addEventListener("pageshow", function () {
      syncActive();
    });
  }

  window.DikaNav = { refresh: syncActive };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
