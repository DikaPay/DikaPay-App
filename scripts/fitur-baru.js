/* ===========================================================================
   DikaPay — fitur-baru.js   (window.DikaFiturBaru)

   Kenalan fitur SEKALI SAJA, tepat sesudah pendaftaran berhasil.

     DikaFiturBaru.mungkinTampilkan()  // -> Promise<bool> (true = sempat tampil)
     DikaFiturBaru.sudahPernah(nomor?) // -> bool
     DikaFiturBaru.reset(nomor?)       // untuk pengujian

   ===================== KENAPA PENANDANYA PER NOMOR HP =====================
   Satu perangkat bisa dipakai beberapa akun (ganti nomor, HP pinjaman, HP
   toko). Penanda GLOBAL berarti: member kedua yang mendaftar di HP yang sama
   TIDAK PERNAH melihat kenalan fiturnya, padahal dia memang baru.

   Kuncinya `dikapay:fitur:seen:<nomor digit>` — pola penamaan yang SAMA
   dengan `dikapay:tx:extra:<nomor>`, `dikapay:notif:<nomor>`, dan
   `dikapay:device_token:<nomor>`. Lihat catatan besar "TOKEN & SALDO HARUS
   PER-AKUN" di member-sync.js untuk bug nyata yang lahir dari kunci global.

   ========================= KENAPA DUA GERBANG ============================
   Yang memicu tetap flag `dikapay:newmember` (ditulis auth-flow.js HANYA
   saat pendaftaran selesai, bukan saat login) — itu yang membuatnya "hanya
   untuk akun baru". Penanda per nomor adalah gerbang KEDUA: kalau flag itu
   sempat tertinggal karena apa pun (proses dimatikan sebelum Beranda
   sempat membacanya, dua tab, pemulihan backup), member tetap tidak
   melihatnya dua kali.

   ============================ MARKUP RUNTIME =============================
   Seluruh DOM dibangun di sini, bukan ditulis di index.html — pola yang
   sama dengan paymodal.js & pin-transaksi.js. Halaman tidak perlu diubah,
   dan kalau modul ini tidak dimuat sama sekali, tidak ada sisa markup yatim.
   =========================================================================== */
(function () {
  "use strict";

  var PREFIX = "dikapay:fitur:seen:";
  var RM = false;
  try { RM = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}

  /* Fitur yang BENAR-BENAR sudah ada di app ini. Jangan menambahkan yang
     masih rencana — kenalan fitur yang menjanjikan hal belum ada adalah
     cara tercepat kehilangan kepercayaan di menit pertama. */
  var SLIDE = [
    {
      ikon: "grid",
      judul: "Semua tagihan, satu aplikasi",
      isi: "Pulsa, paket data, token listrik, PDAM, BPJS, sampai voucher game — semuanya bisa dari sini.",
    },
    {
      ikon: "persen",
      judul: "Atur margin jualan sendiri",
      isi: "Jualan lagi ke pelanggan kamu? Atur untungnya sendiri di menu Margin, khusus buat akun kamu.",
    },
    {
      ikon: "kirim",
      judul: "Kirim saldo ke sesama member",
      isi: "Transfer saldo ke teman sesama member DikaPay cukup dengan nomor HP-nya.",
    },
    {
      ikon: "grafik",
      judul: "Pantau pengeluaran kamu",
      isi: "Semua transaksi tercatat rapi di Riwayat, lengkap dengan ringkasan pengeluaran bulanan.",
    },
    {
      ikon: "perisai",
      judul: "Aman dengan PIN kamu",
      isi: "Setiap transaksi dikonfirmasi PIN dulu. PIN kamu nggak pernah kami bagikan ke siapa pun.",
    },
  ];

  var IKON = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/>' +
          '<rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    persen: '<path d="M19 5 5 19"/><circle cx="7.5" cy="7.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/>',
    kirim: '<path d="M3 11h13M11 6l5 5-5 5"/><path d="M17 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3"/>',
    grafik: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    perisai: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m8.5 12 2.5 2.5L16 9"/>',
  };

  function nomorAktif() {
    try {
      var p = JSON.parse(localStorage.getItem("dikapay:profile") || "{}");
      return String(p.phone || "").replace(/\D/g, "");
    } catch (e) { return ""; }
  }

  function kunci(nomor) {
    var d = String(nomor == null ? nomorAktif() : nomor).replace(/\D/g, "");
    return d ? PREFIX + d : "";
  }

  function sudahPernah(nomor) {
    var k = kunci(nomor);
    /* Tanpa nomor, jangan menebak "belum pernah" — itu membuat kenalan ini
       muncul berulang kali di perangkat yang profilnya belum siap. */
    if (!k) return true;
    try { return localStorage.getItem(k) === "1"; } catch (e) { return true; }
  }

  function tandai(nomor) {
    var k = kunci(nomor);
    if (!k) return;
    try { localStorage.setItem(k, "1"); }
    catch (e) { console.error("fitur-baru: penanda tidak tersimpan:", e); }
  }

  function reset(nomor) {
    var k = kunci(nomor);
    if (!k) return;
    try { localStorage.removeItem(k); } catch (e) {}
  }

  function svg(nama) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round">' + (IKON[nama] || IKON.grid) + "</svg>";
  }

  function bangun() {
    var ov = document.createElement("div");
    ov.className = "fbaru-overlay";
    ov.setAttribute("role", "dialog");
    ov.setAttribute("aria-modal", "true");
    ov.setAttribute("aria-label", "Kenalan fitur DikaPay");

    var slides = SLIDE.map(function (s, i) {
      return '<li class="fbaru__slide" data-i="' + i + '"' + (i === 0 ? "" : " hidden") + '>' +
        '<span class="fbaru__ic">' + svg(s.ikon) + "</span>" +
        '<h2 class="fbaru__judul">' + s.judul + "</h2>" +
        '<p class="fbaru__isi">' + s.isi + "</p>" +
        "</li>";
    }).join("");

    var dots = SLIDE.map(function (s, i) {
      return '<span class="fbaru__dot' + (i === 0 ? " is-active" : "") + '"></span>';
    }).join("");

    ov.innerHTML =
      '<div class="fbaru">' +
        '<button class="fbaru__lewati" type="button">Lewati</button>' +
        '<ul class="fbaru__slides">' + slides + "</ul>" +
        '<div class="fbaru__dots">' + dots + "</div>" +
        '<button class="fbaru__next" type="button">Lanjut</button>' +
      "</div>";
    return ov;
  }

  var sedangTampil = false;

  function tampilkan() {
    return new Promise(function (resolve) {
      if (sedangTampil) return resolve(false);
      sedangTampil = true;

      var ov = bangun();
      document.body.appendChild(ov);
      /* Reflow dipaksa supaya transisi masuk benar-benar berjalan (elemen
         baru lahir langsung di keadaan akhir kalau tidak). */
      void ov.offsetWidth;
      ov.classList.add("is-open");
      var htmlEl = document.documentElement;
      var overflowLama = htmlEl.style.overflow;
      htmlEl.style.overflow = "hidden";

      var idx = 0;
      var slideEls = ov.querySelectorAll(".fbaru__slide");
      var dotEls = ov.querySelectorAll(".fbaru__dot");
      var next = ov.querySelector(".fbaru__next");
      var lewati = ov.querySelector(".fbaru__lewati");
      var selesai = false;

      function ke(n) {
        if (n < 0 || n >= slideEls.length) return;
        slideEls[idx].hidden = true;
        slideEls[idx].classList.remove("is-in");
        idx = n;
        slideEls[idx].hidden = false;
        void slideEls[idx].offsetWidth;
        slideEls[idx].classList.add("is-in");
        for (var i = 0; i < dotEls.length; i++) {
          dotEls[i].classList.toggle("is-active", i === idx);
        }
        next.textContent = idx === slideEls.length - 1 ? "Mulai Pakai DikaPay" : "Lanjut";
        lewati.hidden = idx === slideEls.length - 1;
      }

      function tutup() {
        if (selesai) return;
        selesai = true;
        /* Ditandai saat DITUTUP, bukan saat dibuka: kalau app mati di tengah
           kenalan, member berhak melihatnya utuh sekali lagi. */
        tandai();
        ov.classList.remove("is-open");
        window.setTimeout(function () {
          try { ov.remove(); } catch (e) {}
          htmlEl.style.overflow = overflowLama;
          sedangTampil = false;
          resolve(true);
        }, RM ? 0 : 260);
      }

      next.addEventListener("click", function () {
        if (idx >= slideEls.length - 1) { tutup(); return; }
        ke(idx + 1);
      });
      lewati.addEventListener("click", tutup);

      /* Geser kiri/kanan — kebiasaan yang sudah dipakai carousel promo di
         Beranda, jadi tidak perlu dipelajari lagi. */
      var x0 = null;
      ov.addEventListener("touchstart", function (e) {
        x0 = e.touches && e.touches[0] ? e.touches[0].clientX : null;
      }, { passive: true });
      ov.addEventListener("touchend", function (e) {
        if (x0 == null) return;
        var x1 = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : x0;
        var d = x1 - x0;
        x0 = null;
        if (Math.abs(d) < 45) return;
        ke(d < 0 ? idx + 1 : idx - 1);
      }, { passive: true });

      slideEls[0].classList.add("is-in");
      ke(0);
    });
  }

  /* Dipanggil Beranda. `paksa` dipakai pengujian & tombol diagnosa — alur
     normal TIDAK PERNAH mengirimnya. */
  function mungkinTampilkan(opts) {
    try {
      opts = opts || {};
      if (!opts.paksa) {
        if (!opts.memberBaru) return Promise.resolve(false);
        if (sudahPernah()) {
          console.info("fitur-baru: kenalan fitur dilewati — akun ini sudah pernah melihatnya.");
          return Promise.resolve(false);
        }
      }
      if (!document.body) return Promise.resolve(false);
      return tampilkan();
    } catch (e) {
      console.error("fitur-baru: gagal menampilkan kenalan fitur:", e);
      return Promise.resolve(false);
    }
  }

  window.DikaFiturBaru = {
    mungkinTampilkan: mungkinTampilkan,
    sudahPernah: sudahPernah,
    reset: reset,
    JUMLAH_SLIDE: SLIDE.length,
  };
})();
