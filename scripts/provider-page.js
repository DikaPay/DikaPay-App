/* ===========================================================================
   DikaPay — provider-page.js
   Controller halaman produk TIPE B: pilih brand/provider dulu, baru nominal.
   Tidak butuh nomor HP / deteksi operator.
   Dipakai: Voucher Game, Top Up Game, Streaming, TV, Voucher,
            Aktivasi Voucher, E-Money, E-Wallet.

     DikaProviderPage({
       brandTitle   : "Pilih Provider",
       nominalTitle : "Pilih Nominal",
       detailLabel  : "Produk",
       payTitle     : "Pembayaran",
       providers    : [{ id, name, sub?, short?, color?,
                          produk: [ ...produk PRABAYAR sesuai produk-schema.js ] }],
       payLine      : function (item, brand, account) { ... },

       // OPSIONAL — daftar provider yang DIBACA ULANG tiap render, untuk
       // kategori yang datanya datang dari backend (async). Kalau diisi,
       // `providers` statis TIDAK dipakai. Pasangannya: nilai balik
       // DikaProviderPage(...) punya `.segarkan()` untuk menggambar ulang
       // daftar brand begitu data tiba.
       providersFor : function () { return PROVIDERS_HASIL_FETCH; },

       // OPSIONAL — kotak pencarian nama brand, untuk daftar yang terlalu
       // panjang untuk dipindai mata (Games: 107 game). Muncul OTOMATIS
       // hanya kalau daftarnya >= `min` (default 12).
       cari : { placeholder: "Cari nama game...", min: 12 },

       // OPSIONAL — langkah "identitas akun tujuan" ANTARA pilih brand
       // dan pilih nominal. Dipakai E-Wallet (nomor HP tujuan) & Top Up
       // Game (User ID + Zone ID). Kembalikan [] / null kalau brand ini
       // tidak butuh input (halaman Tipe B lain tetap jalan tanpa key ini).
       accountFields: function (brand) {
         return [{
           key      : "userid",          // dipakai sbg id field & key di ctx.account
           label    : "User ID",
           placeholder: "Contoh: 12345678",
           hint     : "teks bantuan opsional di bawah field",
           required : true,              // default true; hanya "false" yang melewati validasi
           min      : 3,                 // panjang minimal supaya dianggap terisi
           max      : 20,                // maxlength input
           digitsOnly: false,            // true -> buang non-digit saat mengetik
           inputmode: "text"             // hint keyboard; default "numeric" bila digitsOnly
         }];
       }
     });

   Markup wajib: #app #backBtn #brandSec #brandTitle #brandGrid #pickedBar
   #pickedName #changeBtn #prodSec #prodTitle #prodGrid #confirmOverlay
   #cmRows #cmCancel #cmPay
   Halaman dengan accountFields menambah: #acctSec #acctFields

   Urutan <script>: illustrations.js → paymodal.js → produk-ui.js →
   provider-page.js → script data halaman.
   =========================================================================== */

(function () {
  "use strict";

  window.DikaProviderPage = function (config) {
    var UI = window.DikaProdukUI;
    if (!UI) { console.error("provider-page: produk-ui.js belum di-link"); return; }
    var async = config && typeof config.providersFor === "function";
    if (!config || (!async && (!Array.isArray(config.providers) || !config.providers.length))) {
      console.error("provider-page: config.providers wajib diisi");
      return;
    }

    /* SATU-SATUNYA pintu baca daftar provider. Dulu `config.providers`
       dibaca langsung di tiga tempat; untuk kategori berdata backend itu
       tidak cukup, karena saat controller dipasang daftarnya masih KOSONG
       (fetch-nya belum selesai). Lewat fungsi ini, halaman async cukup
       mengembalikan daftar terbarunya dan semua pemakai ikut terbarui. */
    function daftarProvider() {
      if (async) {
        try {
          var d = config.providersFor();
          return Array.isArray(d) ? d : [];
        } catch (e) {
          console.error("provider-page: providersFor error:", e);
          return [];
        }
      }
      return config.providers || [];
    }

    var els = {};
    var grid = null;
    var modal = null;
    var warn = null;
    var tabs = null;       /* tab pengelompokan BRAND (langkah 1) */
    var cariUI = null;     /* kotak pencarian nama brand (langkah 1) */
    var subTabs = null;    /* tab SUBKATEGORI di dalam brand (langkah 2) */
    var state = { brand: null, items: [], account: {} };
    var brandPushed = false;
    var siap = false;      /* true setelah init() selesai — dipakai segarkan() */

    function esc(s) {
      return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      });
    }

    /* ---- Langkah "identitas akun" (opsional) ------------------------
       E-Wallet: nomor HP tujuan. Top Up Game: User ID (+ Zone ID untuk
       game tertentu). Halaman Tipe B tanpa config.accountFields (dan
       tanpa #acctSec di markup) tidak terpengaruh — acctFields() = []. */

    function acctFields() {
      if (typeof config.accountFields !== "function" || !state.brand) return [];
      try {
        var f = config.accountFields(state.brand);
        return Array.isArray(f) ? f : [];
      } catch (e) {
        console.error("provider-page: accountFields error:", e);
        return [];
      }
    }

    /* Field bertanda `phone: true` adalah NOMOR HP sungguhan (tujuan
       kirim SMS / akun e-wallet), jadi tunduk pada validasi ketat yang
       sama dengan auth.html: prefix operator dikenal + panjang 10-13
       digit. Field lain (User ID game, nomor kartu e-money, ID akun)
       TIDAK dikenai aturan itu — cukup panjang minimalnya sendiri. */
    function fieldSah(f) {
      var v = (state.account[f.key] || "").trim();
      if (f.required === false && !v) return true;
      if (v.length < (f.min || 1)) return false;
      if (f.phone) {
        var OP = window.DikaOperator;
        if (OP && typeof OP.isValidPhone === "function") return OP.isValidPhone(v);
        /* Field ditandai nomor HP tapi peta prefiksnya tidak dimuat —
           halamannya lupa me-link operator-detect.js. Jangan diam-diam
           meloloskan nomor yang belum tervalidasi; catat supaya ketahuan. */
        console.warn("provider-page: operator-detect.js belum di-link, " +
          "validasi ketat nomor HP tidak bisa dijalankan untuk field:", f.key);
      }
      return true;
    }

    function acctReady() {
      return acctFields().every(fieldSah);
    }

    function renderAccount() {
      var fields = acctFields();
      state.account = {};
      if (!els.acctSec || !els.acctFields) return;
      if (!fields.length) { els.acctSec.hidden = true; els.acctFields.innerHTML = ""; return; }

      var frag = document.createDocumentFragment();
      fields.forEach(function (f) {
        var id = "acct_" + String(f.key).replace(/[^\w-]/g, "");
        var wrap = document.createElement("div");
        wrap.className = "acct-field";
        wrap.innerHTML =
          '<label class="pfield__label" for="' + id + '">' + esc(f.label || f.key) + "</label>" +
          '<div class="pfield">' +
          '<input class="pfield__input" id="' + id + '" data-key="' + esc(f.key) + '" ' +
          'type="' + (f.digitsOnly ? "tel" : "text") + '" ' +
          'inputmode="' + esc(f.inputmode || (f.digitsOnly ? "numeric" : "text")) + '" ' +
          'autocomplete="off" ' + (f.max ? 'maxlength="' + Number(f.max) + '" ' : "") +
          'placeholder="' + esc(f.placeholder || "") + '" />' +
          "</div>" +
          '<p class="pfield__hint" hidden></p>' +
          (f.hint ? '<p class="acct-hint">' + esc(f.hint) + "</p>" : "");
        frag.appendChild(wrap);
      });
      els.acctFields.innerHTML = "";
      els.acctFields.appendChild(frag);
      els.acctSec.hidden = false;

      /* Kontak / suara / scan dipasang HANYA di field bernomor telepon —
         User ID / Zone ID game bukan nomor kontak, jadi tombol "ambil
         dari kontak" di situ cuma menyesatkan. Field ditandai lewat
         `helper: true` di accountFields(). */
      if (window.DikaInputHelper) {
        fields.forEach(function (f) {
          if (!f.helper) return;
          var node = els.acctFields.querySelector('[data-key="' + f.key + '"]');
          if (node) window.DikaInputHelper.attach(node);
        });
      }

      /* Placeholder beranimasi. Field nomor HP memakai contoh prefix
         operator asli; field lain (User ID game, nomor kartu) memakai
         placeholder-nya sendiri apa adanya — angka acak untuk User ID
         justru menyesatkan karena formatnya beda-beda per game. */
      if (window.DikaPlaceholder) {
        fields.forEach(function (f) {
          if (!f.phone) return;
          var node = els.acctFields.querySelector('[data-key="' + f.key + '"]');
          if (node) window.DikaPlaceholder.pasang(node, window.DikaPlaceholder.contohNomorHP());
        });
      }
    }

    function onAccountInput(e) {
      var inp = e.target.closest(".pfield__input");
      if (!inp) return;
      try {
        var key = inp.dataset.key;
        var f = acctFields().filter(function (x) { return x.key === key; })[0];
        if (f && f.digitsOnly) {
          var clean = inp.value.replace(/\D/g, "");
          if (f.max) clean = clean.slice(0, Number(f.max));
          if (inp.value !== clean) inp.value = clean;
        }
        state.account[key] = inp.value.trim();

        /* Tandai field sah/belum untuk animasi di produk.css. Pesan
           bantuan hanya muncul kalau member sudah mengetik cukup banyak
           tapi nomornya tetap belum sah — jangan menegur di digit kedua. */
        var wrap = inp.closest(".acct-field");
        var field = inp.closest(".pfield");
        if (f && field) {
          var v = inp.value.trim();
          var sah = fieldSah(f);
          field.classList.toggle("is-valid", !!(v && sah));
          /* !! WAJIB boolean: classList.toggle(nama, undefined) itu
             toggle biasa, BUKAN force-off — field non-HP (User ID)
             akan ikut ditandai merah kalau nilainya undefined. */
          var belum = !!(f.phone && v.length >= (f.min || 1) && !sah);
          field.classList.toggle("is-invalid", belum);
          var hint = wrap && wrap.querySelector(".pfield__hint");
          if (hint) {
            hint.hidden = !belum;
            if (belum) {
              var OP = window.DikaOperator;
              var sebab = OP && typeof OP.phoneProblem === "function" ? OP.phoneProblem(v) : "prefix";
              hint.textContent = sebab === "pendek"
                ? "Nomornya masih kurang panjang. Nomor HP Indonesia biasanya 10-13 digit."
                : sebab === "panjang"
                  ? "Nomornya kepanjangan. Nomor HP Indonesia paling banyak 13 digit."
                  : "Nomor HP sepertinya tidak valid. Coba periksa lagi, ya.";
            }
          }
        }

        syncNominal();
      } catch (err) { console.error("provider-page: input akun error:", err); }
    }

    /* ---- Subkategori per brand ---------------------------------------
       SUBKATEGORI, BUKAN FILTER: brand boleh punya `subkategori`
       (`[{ id, label, produk: [...] }]`) — tiap subkategori membawa
       daftar produknya SENDIRI, bukan hasil menyaring satu kumpulan yang
       sama. Brand yang cukup punya `produk` saja tetap jalan seperti dulu. */

    function subsBrand() {
      var b = state.brand;
      if (!b || !Array.isArray(b.subkategori) || !b.subkategori.length) return null;
      return b.subkategori;
    }

    function subAktif() {
      var subs = subsBrand();
      if (!subs) return null;
      var id = subTabs && subTabs.exists() ? subTabs.active() : null;
      for (var i = 0; i < subs.length; i++) if (subs[i].id === id) return subs[i];
      return subs[0];
    }

    /* Produk yang SEDANG TERLIHAT — dipakai juga openConfirm, jadi
       indeks kartu selalu menunjuk produk yang benar. */
    function produkTampil() {
      var s = subAktif();
      if (s) return s.produk || [];
      return (state.brand && state.brand.produk) || [];
    }

    /* Nominal hanya tampil setelah identitas akun lengkap */
    function syncNominal() {
      if (!state.brand) return;
      if (!acctReady()) { grid.clear(); return; }
      var s = subAktif();
      var items = produkTampil();
      state.items = items;
      grid.render(items, state.brand.id + "|" + (s ? s.id : "-"));
    }

    /* Inisial brand untuk "logo" kotak — dari nama kalau tidak di-set */
    function initials(p) {
      if (p.short) return p.short;
      var w = String(p.name).replace(/[^A-Za-z0-9 ]/g, " ").trim().split(/\s+/);
      return (w.length > 1 ? w[0][0] + w[1][0] : String(p.name).slice(0, 2)).toUpperCase();
    }

    /* Brand yang tampil = hasil saring tab aktif. Tanpa config.tabs,
       daftarnya utuh seperti sebelumnya. */
    function brandsTampil() {
      var semua = daftarProvider();
      if (config.tabs && tabs && tabs.exists()) semua = UI.filterGrup(semua, tabs.active());
      /* Pencarian diterapkan PALING AKHIR, dan `pickBrand` mencari brand
         lewat `data-id` di seluruh daftar (bukan indeks tampilan), jadi
         menyaring di sini tidak bisa membuka brand yang salah. */
      if (cariUI) {
        semua = semua.filter(function (p) {
          return cariUI.cocok(p.name) || cariUI.cocok(p.id);
        });
      }
      return semua;
    }

    function renderBrands() {
      try {
        var daftar = brandsTampil();
        var frag = document.createDocumentFragment();
        daftar.forEach(function (p, i) {
          var btn = document.createElement("button");
          btn.className = "brand";
          btn.type = "button";
          /* Kunci pakai ID brand, BUKAN indeks: begitu tab menyaring
             daftar, indeks tampilan tidak lagi sama dengan indeks di
             config.providers dan tombol akan membuka brand yang salah. */
          btn.dataset.id = p.id;
          /* Dibatasi seperti createGrid: dengan 107 game, `i * 45` membuat
             kartu terakhir menunggu 4,8 detik — dan karena `.brand` memakai
             `animation ... backwards`, ia benar-benar TIDAK TERLIHAT sampai
             gilirannya tiba. */
          var maks = UI.MAKS_STAGGER || 11;
          btn.style.animationDelay = (UI.RM ? 0 : Math.min(i, maks) * 45) + "ms";
          var color = p.color || "#1B4FD6";
          /* brandVars: varian warna yang tetap terbaca di tema terang */
          var style = UI.brandVars ? UI.brandVars(color, "bd")
            : "--bd:" + color + ";--bd-bg:" + color + "1F";
          /* `config.markIcon` (opsional): satu ikon SVG dipakai untuk SEMUA
             brand di halaman itu, menggantikan inisial dua huruf. Dipakai
             halaman Games — "ML"/"FF"/"PG" tidak memberi tahu apa-apa dan
             terlihat seperti placeholder. Warna tetap per-brand lewat
             `--bd`, jadi tiap kartu masih punya identitasnya sendiri.
             Halaman Tipe B lain tidak menyetelnya -> tetap memakai inisial. */
          btn.innerHTML =
            '<span class="brand__mark' + (config.markIcon ? " brand__mark--ikon" : "") +
            '" style="' + style + '">' +
            (config.markIcon || initials(p)) + "</span>" +
            '<span class="brand__body">' +
            '<span class="brand__name">' + p.name + "</span>" +
            (p.sub ? '<span class="brand__sub">' + p.sub + "</span>" : "") +
            "</span>";
          frag.appendChild(btn);
        });
        els.brandGrid.innerHTML = "";
        els.brandGrid.appendChild(frag);
        if (cariUI) {
          /* Jumlah SEBELUM disaring menentukan kotaknya muncul atau tidak. */
          var semuaJml = daftarProvider().length;
          cariUI.render(semuaJml);
          cariUI.pesanKosong(
            !daftar.length && !!cariUI.nilai() && semuaJml > 0,
            "Tidak ada yang cocok dengan \"" + cariUI.nilai() + "\". Coba kata lain, ya."
          );
        }
      } catch (err) {
        console.error("provider-page: gagal render brand:", err);
      }
    }

    /* ---- Langkah 1 (pilih brand) <-> langkah 2 (pilih nominal) ------ */

    function showBrands() {
      state.brand = null;
      state.items = [];
      state.account = {};
      els.brandSec.hidden = false;
      els.picked.hidden = true;
      if (els.acctSec) { els.acctSec.hidden = true; }
      if (els.acctFields) els.acctFields.innerHTML = "";
      grid.clear();
      if (subTabs) subTabs.render([]);   /* tab subkategori milik brand lama */
      /* Kembali ke daftar penyedia = belum ada yang perlu diperiksa lagi. */
      if (warn) warn.hide();
    }

    function pickBrand(id) {
      var p = null;
      var semua = daftarProvider();
      for (var i = 0; i < semua.length; i++) {
        if (semua[i].id === id) { p = semua[i]; break; }
      }
      var punyaSub = p && Array.isArray(p.subkategori) && p.subkategori.length;
      if (!p || (!punyaSub && (!Array.isArray(p.produk) || !p.produk.length))) {
        console.error("provider-page: provider tidak punya produk:", id);
        return;
      }
      state.brand = p;

      /* Daftar tab subkategori ikut BRAND, jadi dibangun ulang tiap kali
         brand berganti (Google Play punya famili sendiri, Steam sendiri). */
      if (subTabs) subTabs.render(punyaSub && p.subkategori.length > 1 ? p.subkategori : []);

      if (window.DikaProduk) {
        (punyaSub ? p.subkategori : [{ id: "-", produk: p.produk }]).forEach(function (s) {
          window.DikaProduk.check(s.produk, "prabayar",
            (config.slug || "provider") + "/" + p.id + "/" + s.id);
        });
      }
      state.items = produkTampil();

      els.brandSec.hidden = true;
      els.pickedName.textContent = p.name;
      els.picked.hidden = false;

      /* Langkah identitas akun (kalau ada) -> nominal muncul setelah lengkap.
         Tanpa accountFields, syncNominal() langsung merender grid. */
      renderAccount();
      syncNominal();

      /* Halaman Tipe B tidak punya input nomor untuk dijadikan pemicu
         (enam di antaranya tidak punya field sama sekali), jadi titik
         setaranya adalah "penyedia sudah dipilih": member baru saja
         membuat pilihan pertama dan sebentar lagi masuk konfirmasi.
         Di ewallet/topup-game peringatan jadi sudah terpasang tepat saat
         field User ID/nomor tujuan muncul — persis saat dibutuhkan. */
      if (warn) warn.show();

      /* BACK HP kembali ke daftar brand, bukan keluar halaman */
      if (!brandPushed) {
        try { history.pushState({ dikaBrand: 1 }, ""); brandPushed = true; }
        catch (e) { brandPushed = false; }
      }
    }

    function backToBrands(fromPop) {
      if (!state.brand) return;
      showBrands();
      var did = brandPushed;
      brandPushed = false;
      if (!fromPop && did) { try { history.back(); } catch (e) {} }
    }

    /* ---- Konfirmasi -------------------------------------------------- */

    function openConfirm(idx) {
      var item = produkTampil()[idx];
      var brand = state.brand;
      if (!item || !brand) return;
      if (!acctReady()) return;   /* grid seharusnya belum tampil, tapi jaga-jaga */

      var acct = {};
      var rows = [{ label: config.brandLabel || "Provider", value: esc(brand.name) }];
      acctFields().forEach(function (f) {
        var v = (state.account[f.key] || "").trim();
        acct[f.key] = v;
        /* Field OPSIONAL yang memang dikosongkan TIDAK dirender sebagai
           baris "-": itu baris yang tidak mengatakan apa-apa, dan di layar
           konfirmasi ia malah terbaca seperti ada yang terlewat diisi.
           Field WAJIB yang kosong tetap ditampilkan (tidak seharusnya bisa
           sampai sini, tapi kalau terjadi, menyembunyikannya lebih buruk). */
        if (f.required === false && !v) return;
        rows.push({ label: f.label || f.key, value: esc(v || "-") });
      });
      rows.push({
        label: config.detailLabel || "Produk",
        value: esc(window.DikaProduk ? window.DikaProduk.namaLengkap(item) : item.nama),
      });
      rows.push({ label: "Harga", value: UI.fmtRupiah(item.harga_modal), total: true });

      modal.show(rows, { item: item, brand: brand, account: acct });
    }

    /* ---- Init --------------------------------------------------------- */

    function init() {
      var $ = function (id) { return document.getElementById(id); };
      els = {
        app: $("app"), brandSec: $("brandSec"), brandTitle: $("brandTitle"),
        brandGrid: $("brandGrid"), picked: $("pickedBar"), pickedName: $("pickedName"),
        change: $("changeBtn"), prodSec: $("prodSec"), prodTitle: $("prodTitle"),
        prodGrid: $("prodGrid"),
        acctSec: $("acctSec"), acctFields: $("acctFields"),
      };

      if (els.brandTitle && config.brandTitle) els.brandTitle.textContent = config.brandTitle;
      if (els.prodTitle && config.nominalTitle) els.prodTitle.textContent = config.nominalTitle;

      grid = UI.createGrid({ grid: els.prodGrid, section: els.prodSec, slug: config.slug });
      grid.onPick(openConfirm);
      warn = UI.createWarn("warnBox");   /* halaman tanpa #warnBox tetap aman */

      els.brandGrid.addEventListener("click", function (e) {
        var btn = e.target.closest(".brand");
        if (!btn) return;
        try { pickBrand(btn.dataset.id); }
        catch (err) { console.error("provider-page: gagal pilih brand:", err); }
      });

      /* Langkah 1 — kotak pencarian nama brand. Muncul sendiri hanya kalau
         daftarnya panjang (lihat createCari), jadi halaman Tipe B lain
         tidak berubah. */
      if (config.cari) {
        cariUI = UI.createCari({
          anchor: els.brandGrid,
          placeholder: config.cari.placeholder || "Cari nama...",
          min: config.cari.min,
        });
        cariUI.onInput(function () { renderBrands(); });
      }

      /* Langkah 1 — tab yang mengelompokkan DAFTAR BRAND. */
      if (config.tabs) {
        tabs = UI.createTabs({ el: "brandTabs" });
        tabs.render(config.tabs);
        tabs.onPick(function () { renderBrands(); });
      }
      /* Langkah 2 — tab SUBKATEGORI di dalam brand terpilih.
         Daftarnya ikut brand, jadi belum dirender di sini. */
      subTabs = UI.createTabs({ el: "prodTabs" });
      subTabs.onPick(function () { syncNominal(); });
      els.change.addEventListener("click", function () { backToBrands(); });
      if (els.acctFields) els.acctFields.addEventListener("input", onAccountInput);

      /* Didaftarkan SEBELUM createModal supaya handler ini jalan lebih dulu.
         Kalau modal sedang terbuka, biarkan modal yang menangani popstate —
         jangan ikut mundur ke daftar brand (nanti dua aksi sekaligus). */
      window.addEventListener("popstate", function () {
        /* Ada overlay terbuka (modal konfirmasi, modal info halaman) ->
           biarkan overlay itu yang menangani BACK. Tanpa ini, satu
           ketukan BACK menutup overlay SEKALIGUS mundur ke daftar brand. */
        if (UI.anyOverlayOpen && UI.anyOverlayOpen()) return;
        if (modal && modal.isOpen()) return;
        if (state.brand) backToBrands(true);
      });

      modal = UI.createModal({
        slug: config.slug,
        overlay: $("confirmOverlay"), rows: $("cmRows"),
        cancel: $("cmCancel"), pay: $("cmPay"),
        payTitle: config.payTitle || "Pembayaran",
        payLine: function (ctx) {
          if (!ctx || typeof config.payLine !== "function") return "";
          return config.payLine(ctx.item, ctx.brand, ctx.account || {});
        },
      });

      UI.wireBack(els.app, $("backBtn"));
      siap = true;
      renderBrands();
      showBrands();
    }

    UI.onReady ? UI.onReady(init) : document.addEventListener("DOMContentLoaded", init);

    /* Kait untuk halaman berdata backend — sejajar dengan `renderKey()` /
       `kosongWajar()` yang dulu ditambahkan ke produk-page.js. Halaman
       memanggilnya SETELAH data tiba; controller tetap tertutup (halaman
       tidak menyentuh satu pun fungsi di dalamnya).

       Kalau member kebetulan sedang membuka satu brand saat data datang,
       grid-nya ikut disegarkan memakai record yang BARU — kalau tidak,
       `state.items` bisa memegang record lama sementara kartu di layar
       sudah yang baru, dan indeks kartu menunjuk produk yang salah. */
    return {
      segarkan: function () {
        if (!siap) return;              /* init() belum jalan; nanti terurus sendiri */
        try {
          renderBrands();
          if (state.brand) {
            var seg = null, semua = daftarProvider();
            for (var i = 0; i < semua.length; i++) {
              if (semua[i].id === state.brand.id) { seg = semua[i]; break; }
            }
            if (seg) {
              state.brand = seg;
              var punyaSub = Array.isArray(seg.subkategori) && seg.subkategori.length;
              if (subTabs) subTabs.render(punyaSub && seg.subkategori.length > 1 ? seg.subkategori : []);
              syncNominal();
            } else {
              backToBrands();          /* brand-nya hilang dari katalog baru */
            }
          }
        } catch (e) {
          console.error("provider-page: gagal menyegarkan daftar provider:", e);
        }
      },
      brandTerpilih: function () { return state.brand ? state.brand.id : null; },
    };
  };
})();
