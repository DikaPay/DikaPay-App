/* ===========================================================================
   DikaPay — produk-page.js
   Controller halaman produk BERBASIS AUTO-DETECT OPERATOR (pulsa.html,
   paket-data.html, …). Dibangun di atas produk-ui.js; deteksi operator di
   operator-detect.js.

   Halaman cukup menyediakan DATA produknya sendiri:

     DikaProdukPage({
       sectionTitle : "Pilih Paket",              // judul di atas grid
       detailLabel  : "Paket",                    // label baris produk di modal
       payTitle     : "Pembayaran",
       productsFor  : function (opKey) { ... },   // -> [{ name, sub?, price }]
       renderKey    : function (opKey) { ... },   // opsional: penanda tambahan
                                                  //   untuk key grid (lihat di bawah)
       payLine      : function (item, op, phone) { ... }  // teks sheet "Segera Hadir"
     });

   Markup yang diharapkan (id sama di semua halaman produk):
     #app #backBtn #phoneInput #clearBtn #opBar #prodSec #prodTitle #prodGrid
     #pEmpty #confirmOverlay #cmRows #cmCancel #cmPay

   Urutan <script>: paymodal.js → produk-ui.js → operator-detect.js →
   produk-page.js → script data halaman.
   =========================================================================== */

(function () {
  "use strict";

  window.DikaProdukPage = function (config) {
    var UI = window.DikaProdukUI;
    var OP = window.DikaOperator;
    if (!UI) { console.error("produk-page: produk-ui.js belum di-link"); return; }
    if (!OP) { console.error("produk-page: operator-detect.js belum di-link"); return; }
    /* Halaman menyediakan SALAH SATU: `subFor` (subkategori per operator,
       tiap subkategori punya produknya sendiri) ATAU `productsFor` (satu
       daftar produk polos, untuk halaman yang memang tidak bersubkategori). */
    if (!config ||
        (typeof config.subFor !== "function" && typeof config.productsFor !== "function")) {
      console.error("produk-page: config.subFor atau config.productsFor wajib diisi");
      return;
    }

    var els = {};
    var grid = null;
    var modal = null;
    var warn = null;
    var tabs = null;
    var lastOp = null;      /* operator saat daftar tab terakhir dibangun */
    var state = { phone: "", opKey: null, items: [], subId: null };
    var renderTimer = 0;

    function fullName(item) {
      return window.DikaProduk ? window.DikaProduk.namaLengkap(item)
        : (item ? (item.sub ? item.nama + " " + item.sub : item.nama) : "");
    }

    /* ---- Render grid sesuai operator ------------------------------- */

    /* ---- Subkategori -------------------------------------------------
       SUBKATEGORI, BUKAN FILTER: tiap subkategori punya daftar produknya
       SENDIRI (`{ id, label, produk: [...] }`), bukan hasil menyaring satu
       kumpulan yang sama pakai atribut. Ini penting karena di dunia nyata
       subkategori paket data MELEKAT KE OPERATOR — "Ilmupedia" cuma ada di
       Telkomsel, "Xtra Combo" cuma di XL — jadi daftar tabnya ikut berubah
       tiap kali operator yang terdeteksi berganti. */

    function subsFor(opKey) {
      if (typeof config.subFor !== "function") return null;
      try {
        var s = config.subFor(opKey);
        return Array.isArray(s) && s.length ? s : null;
      } catch (e) {
        console.error("produk-page: subFor error:", e);
        return null;
      }
    }

    function subAktif(subs) {
      if (!subs) return null;
      var id = tabs && tabs.exists() ? tabs.active() : null;
      for (var i = 0; i < subs.length; i++) if (subs[i].id === id) return subs[i];
      return subs[0];      /* tab belum sempat dirender / id tak dikenal */
    }

    function renderProducts(opKey) {
      if (!OP.get(opKey)) {
        state.items = [];
        state.subId = null;
        lastOp = null;
        grid.clear();
        if (tabs) tabs.render([]);        /* sembunyikan tab operator lama */
        return;
      }

      var subs = subsFor(opKey);
      var items, key;

      if (subs) {
        /* Daftar tab dibangun ulang HANYA kalau SUSUNAN subkategorinya
           benar-benar berubah — bukan tiap ketukan tombol (kalau begitu,
           tab pilihan member terus balik ke tab pertama sambil dia
           mengetik), dan bukan pula cuma saat opKey berganti.

           Dulu penjaganya `opKey !== lastOp`, dan itu meleset di dua arah:
           (a) halaman yang menyaring daftarnya sendiri bisa mengganti
           susunan tab TANPA mengganti operator — mis. memilih sub-brand
           by.U di paket-data: tab famili Telkomsel tetap terpampang
           padahal tak satu pun berlaku untuk by.U; dan (b) tab operator
           LAMA ikut tertinggal saat daftar subkategori sementara kosong
           (lihat cabang else di bawah). Sidik jari id menutup keduanya. */
        var sig = subs.map(function (s) { return s.id; }).join(",");
        if (tabs && sig !== lastOp) {
          tabs.render(subs.length > 1 ? subs : []);   /* < 2 tab = tidak berguna */
          lastOp = sig;
        }
        var s = subAktif(subs);
        items = s ? s.produk : [];
        state.subId = s ? s.id : null;
        key = opKey + "|" + (state.subId || "-");
      } else {
        /* Halaman bertab yang untuk sementara tidak punya subkategori
           (katalog masih dimuat, atau menunggu member memilih sub-brand):
           tab lama WAJIB dibersihkan, kalau tidak tab milik operator
           sebelumnya tetap terpampang di atas grid yang sudah kosong. */
        if (tabs && typeof config.subFor === "function") {
          tabs.render([]);
          lastOp = null;
        }
        items = config.productsFor ? config.productsFor(opKey) : [];
        state.subId = null;
        key = opKey;
      }

      /* Halaman boleh menambah penanda sendiri ke `key` lewat
         `config.renderKey()`. Perlu untuk halaman yang menyaring daftarnya
         SENDIRI (pemilih sub-brand & filter rentang harga di pulsa.js):
         operatornya tetap sama, jadi tanpa penanda ini `key` tidak berubah
         dan createGrid MELEWATI render — chip filter ditekan, grid diam.
         Halaman yang tidak memakainya sama sekali tidak terpengaruh. */
      if (typeof config.renderKey === "function") {
        try {
          var tambahan = config.renderKey(opKey);
          if (tambahan) key = key + "|" + tambahan;
        } catch (e) { console.error("produk-page: renderKey error:", e); }
      }

      if (!Array.isArray(items) || !items.length) {
        /* Daftar kosong TIDAK selalu bug. Untuk halaman berdata backend,
           kosong itu keadaan sah selama katalognya masih dimuat atau
           member belum memilih sub-brand — dan halamannya sudah
           menjelaskan itu lewat kartu status sendiri. Halaman menandainya
           lewat `config.kosongWajar(opKey)`; tanpa itu perilakunya sama
           seperti sebelumnya (dicatat sebagai kesalahan data). */
        var wajar = false;
        if (typeof config.kosongWajar === "function") {
          try { wajar = !!config.kosongWajar(opKey); }
          catch (e) { console.error("produk-page: kosongWajar error:", e); }
        }
        if (!wajar) {
          console.error("produk-page: daftar produk kosong untuk", opKey, state.subId || "");
        }
        state.items = [];
        grid.clear();
        return;
      }
      if (window.DikaProduk) window.DikaProduk.check(items, "prabayar", config.slug || "produk-page");

      /* state.items HARUS persis daftar yang TERLIHAT — openConfirm
         memakai indeks kartu, jadi kalau isinya beda, member bisa
         membeli produk lain dari yang dia ketuk. */
      state.items = items;
      grid.render(items, key);
    }

    /* ---- Reaksi terhadap perubahan input --------------------------- */

    function onPhoneInput() {
      try {
        var clean = OP.sanitize(els.phone.value);

        /* Tulis balik hanya kalau memang berubah, supaya caret tidak lompat */
        if (els.phone.value !== clean) els.phone.value = clean;

        state.phone = clean;
        state.opKey = OP.detect(clean);

        els.clear.hidden = clean.length === 0;
        els.empty.hidden = clean.length >= OP.MIN_DETECT;

        /* Peringatan ikut ambang yang SAMA dengan deteksi operator &
           grid produk: begitu nomor cukup panjang untuk mulai berbelanja,
           saat itu juga peringatannya jadi relevan. */
        warn.toggle(clean.length >= OP.MIN_DETECT);

        /* Mengetik lagi = membersihkan penolakan sebelumnya, dan
           menandai field sah/belum untuk animasi di produk.css. */
        bersihkanTolakan();
        var sah = typeof OP.isValidPhone === "function" && OP.isValidPhone(clean);
        var field = els.phone.closest(".pfield");
        if (field) field.classList.toggle("is-valid", sah);

        /* Badge langsung (terasa instan), grid produk di-debounce */
        OP.renderBar(els.opBar, clean, state.opKey);

        window.clearTimeout(renderTimer);
        var opKey = state.opKey;
        renderTimer = window.setTimeout(function () {
          renderProducts(opKey);
        }, UI.RM ? 0 : 120);
      } catch (err) {
        console.error("produk-page: input error:", err);
      }
    }

    function clearPhone() {
      els.phone.value = "";
      onPhoneInput();
      els.phone.focus();
    }

    /* ---- Nomor belum sah: tuntun, jangan cuma menolak ---------------- */

    var PESAN = {
      kosong: "Nomor HP-nya belum diisi, nih.",
      pendek: "Nomornya masih kurang panjang. Nomor HP Indonesia biasanya 10-13 digit.",
      panjang: "Nomornya kepanjangan. Nomor HP Indonesia paling banyak 13 digit.",
      prefix: "Nomor HP sepertinya tidak valid. Coba periksa lagi, ya.",
    };

    function tolakNomor() {
      try {
        var sebab = typeof OP.phoneProblem === "function"
          ? OP.phoneProblem(state.phone) : "prefix";
        var field = els.phone.closest(".pfield");
        if (field) {
          field.classList.remove("is-invalid");
          void field.offsetWidth;           /* paksa reflow -> shake terpicu ulang */
          field.classList.add("is-invalid");
        }
        if (els.hint) {
          els.hint.textContent = PESAN[sebab] || PESAN.prefix;
          els.hint.hidden = false;
        }
        els.phone.focus();
      } catch (e) { console.error("produk-page: gagal menandai nomor:", e); }
    }

    function bersihkanTolakan() {
      var field = els.phone.closest(".pfield");
      if (field) field.classList.remove("is-invalid");
      if (els.hint) els.hint.hidden = true;
    }

    /* ---- Konfirmasi ------------------------------------------------- */

    function openConfirm(idx) {
      var op = OP.get(state.opKey);
      var item = state.items[idx];
      if (!op || !item) return;

      /* VALIDASI FINAL — beda dari ambang 4 digit yang cuma untuk
         menampilkan preview produk. Tanpa gerbang ini, nomor sependek
         "0852" bisa lolos sampai ke konfirmasi lalu terkirim ke penyedia
         pihak ketiga. Aturannya satu sumber di operator-detect.js. */
      if (typeof OP.isValidPhone === "function" && !OP.isValidPhone(state.phone)) {
        tolakNomor();
        return;
      }

      modal.show([
        { label: "Nomor HP", value: OP.prettyPhone(state.phone) },
        { label: "Operator", value: op.name },
        { label: config.detailLabel || "Produk", value: fullName(item) },
        { label: "Harga", value: UI.fmtRupiah(item.harga_modal), total: true },
      ], { item: item, op: op, phone: OP.prettyPhone(state.phone) });
    }

    /* ---- Init ------------------------------------------------------- */

    function init() {
      var $ = function (id) { return document.getElementById(id); };
      els = {
        app: $("app"), phone: $("phoneInput"), clear: $("clearBtn"),
        opBar: $("opBar"), prodSec: $("prodSec"), prodTitle: $("prodTitle"),
        prodGrid: $("prodGrid"), empty: $("pEmpty"), hint: $("phoneHint"),
      };

      if (els.prodTitle && config.sectionTitle) els.prodTitle.textContent = config.sectionTitle;

      grid = UI.createGrid({ grid: els.prodGrid, section: els.prodSec, slug: config.slug });
      grid.onPick(openConfirm);
      warn = UI.createWarn("warnBox");   /* halaman tanpa #warnBox tetap aman */

      /* Tab subkategori (opsional) — daftar tabnya datang dari operator
         yang terdeteksi, jadi belum dirender apa pun di sini. */
      if (typeof config.subFor === "function") {
        tabs = UI.createTabs({ el: "prodTabs" });
        tabs.onPick(function () { renderProducts(state.opKey); });
      }

      modal = UI.createModal({
        slug: config.slug,
        overlay: $("confirmOverlay"), rows: $("cmRows"),
        cancel: $("cmCancel"), pay: $("cmPay"),
        payTitle: config.payTitle || "Pembayaran",
        payLine: function (ctx) {
          if (!ctx || typeof config.payLine !== "function") return "";
          return config.payLine(ctx.item, ctx.op, ctx.phone);
        },
      });

      els.phone.addEventListener("input", onPhoneInput);
      els.clear.addEventListener("click", clearPhone);
      UI.wireBack(els.app, $("backBtn"));

      /* Kontak / suara / scan — satu implementasi bersama di
         input-helper.js. Tombol yang APInya tidak didukung browser
         tidak dipasang, jadi halaman tetap normal tanpa file ini. */
      if (window.DikaInputHelper) window.DikaInputHelper.attach(els.phone);

      /* Placeholder beranimasi — contohnya dibangun dari prefix operator
         asli, jadi ikut berubah kalau daftar prefix bertambah. */
      if (window.DikaPlaceholder) {
        window.DikaPlaceholder.pasang(els.phone, window.DikaPlaceholder.contohNomorHP());
      }

      /* Sinkronkan tampilan dengan isi input (mis. dipulihkan bfcache) */
      onPhoneInput();
    }

    UI.onReady ? UI.onReady(init) : document.addEventListener("DOMContentLoaded", init);
  };
})();
