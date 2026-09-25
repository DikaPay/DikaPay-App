/* ===========================================================================
   DikaPay — manual-page.js
   Controller halaman TIPE C (tagihan): nominal DIISI MANUAL
   oleh pengguna, bukan dipilih dari grid.

   Kenapa manual: DikaPay belum punya inquiry tagihan otomatis, dan nominal
   tagihan beda-beda tiap pelanggan. Ini juga menghemat kuota API.

     DikaManualPage({
       idField : { label, placeholder, min, max } | null,
       produk        : <produk PASCABAYAR tunggal> | null,   // 1 biller
       produkList    : [ <produk PASCABAYAR>, ... ] | null,  // pilih biller dulu
       produkByOperator : { telkomsel: <produk>, ... } | null, // dipakai hp-pasca
       choices : [{ id, name, sub? }] | null,               // pilihan non-produk
       detect  : { subBrands: { telkomsel: "Telkomsel Omni", ... } } | null,
                 // kalau diisi: idField diperlakukan sebagai NOMOR HP -> operator
                 // dideteksi otomatis (operator-detect.js). Hasilnya dipakai
                 // untuk VALIDASI PREFIX + memilih produk per operator.
                 // BADGE/chip providernya TIDAK ditampilkan lagi (keputusan
                 // produk) — deteksinya tetap jalan di balik layar.
       choiceTitle, pickedLabel?, warning: { title, text } | null,
       admin   : 2500,
       minNominal, maxNominal,
       nominalLabel, submitLabel, payTitle,
       rows(ctx) -> [{label, value, total?}],
       payLine(ctx) -> string
     });

   Markup wajib: #app #backBtn #warnBox #nominalSec #nominalInput #nominalErr
   #submitBtn #pEmpty #confirmOverlay #cmRows #cmCancel #cmPay
   Tipe C menambah: #idCard #idInput #clearBtn
   Yang memakai choices/produkList menambah: #choiceSec #choiceBtn #choiceTitle
   #choiceUbah. Daftar pilihannya sendiri BUKAN markup statis — dirender di
   popup pemilih (UI.createPicker, produk-ui.js) yang dibangun runtime,
   ditampilkan setelah #choiceBtn ditekan. #choiceSec baru terlihat setelah
   ID/nomor terisi cukup panjang (lihat idReady()); begitu member memilih,
   #choiceTitle berubah dari placeholder ("Pilih Perusahaan Pembiayaan")
   jadi ringkasan ("Perusahaan Pembiayaan: FIF Group") dan #choiceUbah
   (pill "Ubah") muncul sebagai ajakan eksplisit mengganti pilihan.
   =========================================================================== */

(function () {
  "use strict";

  window.DikaManualPage = function (config) {
    var UI = window.DikaProdukUI;
    if (!UI) { console.error("manual-page: produk-ui.js belum di-link"); return; }
    config = config || {};

    var ID = config.idField || null;
    var DET = config.detect || null;
    var OP = DET ? window.DikaOperator : null;
    if (DET && !OP) { console.error("manual-page: config.detect butuh operator-detect.js"); DET = null; }
    /* Biaya admin datang DARI PRODUK (field admin_fee milik Digiflazz),
       bukan konstanta halaman. Nominal tagihan TIDAK ada di produk — dia
       variabel per pelanggan, jadi hidup di state, bukan di data.

       ==================== DATA STATIS vs DATA BACKEND ====================
       Sampai fase pascabayar, ke-16 file kategori memberi produknya sebagai
       ARRAY/OBJEK statis (`config.produk` / `config.produkList`). Sejak
       kategori pascabayar disambungkan ke backend (pascabayar-live.js),
       produknya baru tersedia SETELAH fetch — jadi config bisa memberi
       CALLBACK sebagai gantinya:
         config.produkFor()     -> objek produk tunggal | null   (1 biller)
         config.produkListFor() -> array produk                  (banyak biller)
       Kalau callback diberikan, versi statis TIDAK dipakai. Semua pembacaan
       lewat SATU pintu (getProduk / getProdukList) supaya data telat datang
       tidak perlu dijahit di banyak tempat — pola yang sama seperti
       `providersFor()` di provider-page.js. */
    var STATIC_PRODUK = config.produk || null;
    var STATIC_LIST = Array.isArray(config.produkList) ? config.produkList : null;
    var STATIC_OP = config.produkByOperator || null;
    var PRODUK_FN = typeof config.produkFor === "function" ? config.produkFor : null;
    var LIST_FN = typeof config.produkListFor === "function" ? config.produkListFor : null;
    var OP_FN = typeof config.produkByOperatorFor === "function" ? config.produkByOperatorFor : null;
    var HAS_OP = !!(OP_FN || STATIC_OP);

    function getProduk() {
      if (PRODUK_FN) { try { return PRODUK_FN() || null; } catch (e) { console.error("manual-page: produkFor() error:", e); return null; } }
      return STATIC_PRODUK;
    }
    function getProdukList() {
      if (LIST_FN) { try { return LIST_FN() || []; } catch (e) { console.error("manual-page: produkListFor() error:", e); return []; } }
      return STATIC_LIST;
    }
    function getProdukOp() {
      if (OP_FN) { try { return OP_FN() || null; } catch (e) { console.error("manual-page: produkByOperatorFor() error:", e); return null; } }
      return STATIC_OP;
    }

    /* "Halaman ini PUNYA langkah pilih biller?" — pertanyaan STRUKTURAL,
       jawabannya tidak berubah saat data telat datang. Dipakai untuk
       gerbang isReady() & pemasangan picker. */
    var USES_LIST = !!(LIST_FN || STATIC_LIST);
    var USES_CHOICES = !USES_LIST && Array.isArray(config.choices);
    var HAS_CHOICE_STEP = USES_LIST || USES_CHOICES;

    /* Daftar item untuk popup pemilih — dihitung ULANG tiap dibutuhkan
       (produkListFor bisa berisi setelah fetch). */
    function daftarChoices() {
      if (USES_LIST) {
        return (getProdukList() || []).map(function (p) {
          /* `sub` HANYA kalau produk memang punya sub deskriptif — bukan
             brand. Utk pascabayar `brand` selalu nama kategori ALLCAPS
             ("PDAM"/"MULTIFINANCE") jadi menampilkannya di tiap baris cuma
             pengulangan yang bising. */
          return { id: p.sku || p.nama, name: p.nama, sub: p.sub || null, _p: p };
        });
      }
      return USES_CHOICES ? config.choices : null;
    }

    var ADMIN_FALLBACK = Number(config.admin) || 0;

    /* Produk yang sedang berlaku -> menentukan admin_fee & sku */
    function produkAktif() {
      if (HAS_OP) { var mop = getProdukOp(); return (mop && state.opKey && mop[state.opKey]) || null; }
      if (USES_LIST) return state.choice && state.choice._p ? state.choice._p : null;
      return getProduk() || null;
    }
    function adminAktif() {
      var p = produkAktif();
      return p && typeof p.admin_fee === "number" ? p.admin_fee : ADMIN_FALLBACK;
    }
    var MIN_NOM = Number(config.minNominal) || 1000;
    var MAX_NOM = Number(config.maxNominal) || 10000000;

    /* Laporkan file data yang tidak sesuai kontrak produk-schema.js.
       Dipanggil di init DAN tiap segarkan() (data backend baru datang). */
    function cekSkema() {
      if (!window.DikaProduk) return;
      var slug = config.slug || "manual-page";
      var p = getProduk(), pl = getProdukList();
      if (p) window.DikaProduk.check(p, "pascabayar", slug);
      if (pl && pl.length) window.DikaProduk.check(pl, "pascabayar", slug);
      var mop = getProdukOp();
      if (mop) {
        Object.keys(mop).forEach(function (k) {
          window.DikaProduk.check(mop[k], "pascabayar", slug + "/" + k);
        });
      }
    }

    var els = {};
    var modal = null;
    var picker = null;   /* popup pemilih biller (CHOICES) — UI.createPicker() */
    var state = { id: "", choice: null, nominal: 0, opKey: null, tagihan: null };

    /* ---- Input nominal: format ribuan sambil mempertahankan caret ----
       Tanpa penjagaan caret, mengetik/menyunting di TENGAH angka bikin
       kursor lompat ke ujung tiap kali separator disisipkan. */

    function formatNominal(input) {
      var caret = input.selectionStart;
      var before = caret == null
        ? null
        : input.value.slice(0, caret).replace(/\D/g, "").length;

      var digits = input.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 9);
      var out = digits ? Number(digits).toLocaleString("id-ID") : "";
      if (input.value !== out) input.value = out;

      if (before != null) {
        var pos = 0, seen = 0;
        while (pos < out.length && seen < before) {
          if (/\d/.test(out.charAt(pos))) seen++;
          pos++;
        }
        try { input.setSelectionRange(pos, pos); } catch (e) {}
      }
      return digits ? Number(digits) : 0;
    }

    /* ---- Kesiapan: ID cukup panjang (C) / jenis sudah dipilih (D) ---- */

    /* ID/nomor saja, TANPA syarat CHOICES — dipakai untuk menentukan kapan
       popup pemilih biller boleh mulai ditampilkan (baris ringkasnya,
       #choiceSec). "Nomor dulu, baru pilihan": biller yang bisa dipilih
       kadang bergantung pada nomornya (mis. hp-pasca menyaring dari
       operator terdeteksi), dan menampilkan pemicu sebelum member sempat
       mengisi apa pun cuma mengundang tap terlalu dini. */
    function idReady() {
      if (DET) return !!state.opKey;
      if (ID) return state.id.length >= (ID.min || 8);
      return true;
    }

    function isReady() {
      if (!idReady()) return false;
      /* Katalog backend belum siap -> jangan biarkan member menekan "Cek
         Tagihan" dengan admin_fee yang belum termuat (jatuh ke 0). Kartu
         status pascabayar-live sudah menjelaskan keadaannya. */
      if (typeof config.dataSiap === "function" && !config.dataSiap()) return false;
      if (HAS_CHOICE_STEP && !state.choice) return false;
      return true;
    }

    function syncSteps() {
      var ready = isReady();
      /* TEKS BIAYA ADMIN DIHAPUS dari sini. Dulu baris ini menulis "Biaya
         admin RpX ditambahkan otomatis" di bawah kolom nominal — sudah
         tidak relevan: nominal tidak lagi diketik member, dan rincian
         adminnya muncul di kartu hasil Cek Tagihan beserta totalnya. */
      if (els.hint) els.hint.hidden = true;

      /* Popup pemilih biller: baris pemicunya baru muncul SETELAH ID/nomor
         diisi cukup panjang — bukan langsung terlihat sejak halaman
         dibuka (dulu #choiceSec statis tampil dari awal, berisi list
         kartu memanjang; sekarang list-nya pindah ke popup, dan baris
         pemicunya sendiri baru relevan setelah ada nomor untuk dicocokkan). */
      if (els.choiceSec) els.choiceSec.hidden = !idReady();

      if (els.warn) els.warn.hidden = !ready || !config.warning;
      els.nominalSec.hidden = !ready;
      if (els.empty) els.empty.hidden = ready;
      if (!ready) hideErr();

      /* Nomor/biller berubah -> hasil cek tagihan sebelumnya TIDAK berlaku
         lagi. Membiarkannya tampil berarti member bisa membayar tagihan
         nomor A sambil melihat nama pelanggan nomor B — persis bug yang
         dicegah `resetResult()` di listrik.js dulu. */
      resetTagihan();
    }

    function showErr(msg) {
      els.err.textContent = msg;
      els.err.hidden = false;
      els.nominalField.classList.add("is-error");
    }
    function hideErr() {
      els.err.hidden = true;
      els.nominalField.classList.remove("is-error");
    }

    /* Bangun beberapa contoh dari placeholder asli kategori ini, dengan
       mengganti digitnya. Lebih baik daripada satu daftar contoh generik:
       panjang & bentuknya tetap sesuai kategori masing-masing. */
    function contohDariPlaceholder(ph) {
      var dasar = String(ph || "").replace(/^Contoh:\s*/i, "").trim();
      var digit = dasar.replace(/\D/g, "");
      if (digit.length < 6) return [];
      var acak = function (seed) {
        var out = "";
        for (var i = 0; i < digit.length; i++) {
          out += String((Number(digit.charAt(i)) + seed * (i + 1)) % 10);
        }
        return out;
      };
      return [digit, acak(3), acak(7)];
    }

    /* ---- Handler ------------------------------------------------------ */

    function onId() {
      try {
        var clean = DET
          ? OP.sanitize(els.id.value)                       /* + normalisasi 62 -> 0 */
          : String(els.id.value || "").replace(/\D/g, "").slice(0, (ID && ID.max) || 16);
        if (els.id.value !== clean) els.id.value = clean;
        state.id = clean;
        els.clear.hidden = clean.length === 0;

        if (DET) {
          state.opKey = OP.detect(clean);
          /* BADGE PROVIDER SENGAJA TIDAK DIRENDER LAGI.
             Yang dihapus HANYA tampilannya (chip "Telkomsel" dkk di bawah
             field). Deteksinya TETAP JALAN dan tetap dipakai untuk:
               - validasi prefix nomor (isReady di bawah)
               - memilih produk lewat produkByOperator
               - mengisi ctx.subBrand untuk baris modal konfirmasi
             Jadi JANGAN menghapus OP.detect() di atas — yang boleh hilang
             cuma OP.renderBar()/chip .opsub. */
        }
        syncSteps();
      } catch (err) { console.error("manual-page: input id error:", err); }
    }

    function onNominal() {
      try {
        state.nominal = formatNominal(els.nominal);
        if (!els.err.hidden) hideErr();
      } catch (err) { console.error("manual-page: input nominal error:", err); }
    }

    /* ---- TIDAK ADA ESTIMASI MARGIN DI HALAMAN PASCABAYAR ------------
       manual-page.js dipakai HANYA oleh 16 kategori pascabayar, dan
       pascabayar sudah tidak punya margin sama sekali (keputusan produk:
       nominalnya diisi manual pelanggan, berbeda tiap orang tiap bulan,
       jadi persentase di atasnya tidak menggambarkan keuntungan yang bisa
       direncanakan). Dulu di sini ada renderEstimasi() + kotak .margin-est
       yang menghitung "Nominal + Margin + Admin".

       Gerbangnya sekarang ada di kategori-map.js (`bolehMargin`), jadi
       `DikaMargin.hitung()` memang mengembalikan null untuk slug
       pascabayar — tapi kodenya tetap dihapus, bukan dibiarkan mati:
       kotak yang tidak pernah tampil cuma mengundang orang menghidupkannya
       lagi tanpa tahu alasannya. */

    /* ---- Popup pemilih biller (UI.createPicker, produk-ui.js) --------
       DULU: daftar biller dirender sebagai kartu vertikal langsung di
       #choiceList, memanjang ke bawah kalau opsinya banyak (PDAM/PBB per
       kota/kabupaten bisa puluhan). SEKARANG: satu baris ringkas
       (#choiceSec) membuka bottom sheet berisi daftar itu; memilih salah
       satu menutup sheet dan merangkum pilihannya di baris tadi. */

    function bukaPemilihChoice() {
      if (!HAS_CHOICE_STEP || !picker) return;
      var items = daftarChoices();
      if (!items || !items.length) {
        /* Daftar biller datang dari backend & belum termuat. Beri tahu
           lewat baris pemicu sendiri, jangan buka sheet kosong. */
        if (els.choiceTitle) els.choiceTitle.textContent = "Memuat daftar biller…";
        if (typeof config.saatBillerBelumSiap === "function") {
          try { config.saatBillerBelumSiap(); } catch (e) {}
        }
        return;
      }
      picker.open(items, {
        title: config.choiceTitle || "Pilih",
        picked: state.choice ? state.choice.id : null,
      });
    }

    function renderChoiceTrigger() {
      if (!els.choiceTitle) return;
      if (state.choice) {
        var label = config.pickedLabel || config.choiceTitle || "Pilihan";
        els.choiceTitle.textContent = label + ": " + state.choice.name;
        if (els.choiceSec) els.choiceSec.classList.add("is-picked");
        if (els.choiceUbah) els.choiceUbah.hidden = false;
      } else {
        els.choiceTitle.textContent = config.choiceTitle || "Pilih";
        if (els.choiceSec) els.choiceSec.classList.remove("is-picked");
        if (els.choiceUbah) els.choiceUbah.hidden = true;
      }
    }

    /* ================= ALUR CEK TAGIHAN (inquiry) =====================
       Alur nyata pascabayar: isi nomor -> CEK TAGIHAN -> lihat nama
       pelanggan + periode + nominal -> baru bayar. Nominal TIDAK diketik
       member; ia datang dari penyedia.

       Versi ini memakai data dummy (inquiry-dummy.js) supaya urutan &
       tampilannya sudah persis seperti nanti. Yang diganti saat integrasi
       cuma isi `DikaInquiry.cek()` — `lanjutBayar()` di bawah bekerja di
       atas bentuk hasil yang sama, jadi `rows()`/`payLine()` di 16 file
       kategori TIDAK perlu disentuh sama sekali.

       INI KHUSUS PASCABAYAR. manual-page.js hanya dipakai 16 kategori
       pascabayar; halaman prabayar (produk-page/provider-page/listrik)
       tidak melewati file ini sama sekali. */

    function resetTagihan() {
      state.tagihan = null;
      state.nominal = 0;
      if (els.tagihan) { els.tagihan.hidden = true; els.tagihan.innerHTML = ""; }
      setTombol("cek");
    }

    function setTombol(mode) {
      if (!els.submit) return;
      var label = els.submit.querySelector(".act-btn__label") || els.submit;
      els.submit.classList.remove("is-loading");
      els.submit.disabled = false;
      label.textContent = mode === "bayar" ? "Bayar Sekarang" : "Cek Tagihan";
      els.submit.dataset.mode = mode;
    }

    function onSubmit() {
      if (els.submit && els.submit.dataset.mode === "bayar") lanjutBayar();
      else cekTagihan();
    }

    function cekTagihan() {
      try {
        if (!isReady()) return;
        if (!window.DikaInquiry) {
          console.error("manual-page: inquiry-pasca.js belum di-link");
          showErr("Cek tagihan belum tersedia di halaman ini.");
          return;
        }
        hideErr();
        els.submit.classList.add("is-loading");
        els.submit.disabled = true;

        var slug = config.slug || "";
        var idSaatItu = state.id;
        var admin = adminAktif();
        /* buyer_sku_code ASLI (kode_produk) — dari produk yang sedang
           berlaku: biller yang dipilih di picker (multi) / produk tunggal /
           produk per operator (hp-pasca). inquiry-pasca.php memerlukannya. */
        var pAktif = produkAktif();
        var sku = pAktif && pAktif.sku ? pAktif.sku : "";

        window.DikaInquiry.cek(slug, idSaatItu, admin, sku).then(function (t) {
          /* Member bisa mengubah nomornya selagi menunggu — hasil untuk
             nomor lama harus dibuang, bukan ditampilkan. */
          if (idSaatItu !== state.id) return;
          state.tagihan = t;
          state.nominal = t.nominal;
          renderTagihan(t);
          setTombol("bayar");
        }).catch(function (e) {
          if (idSaatItu !== state.id) return;
          console.error("manual-page: cek tagihan gagal:", e && (e.rc ? "rc=" + e.rc + " " : "") + (e.message || e));
          setTombol("cek");
          showErr((e && e.pesanMember) ||
            "Tagihan belum bisa dicek sekarang. Coba lagi sebentar lagi, ya.");
        });
      } catch (err) {
        console.error("manual-page: cek tagihan error:", err);
        setTombol("cek");
      }
    }

    function renderTagihan(t) {
      if (!els.tagihan) return;
      var p = produkAktif();
      var namaBiller = (state.choice && state.choice.name) || (p && p.nama) || "";
      els.tagihan.innerHTML =
        '<p class="tagihan__judul">Detail Tagihan</p>' +
        baris("Nama Pelanggan", esc(t.nama)) +
        baris(labelId(), esc(t.id)) +
        (namaBiller ? baris("Penyedia", esc(namaBiller)) : "") +
        baris("Periode", esc(t.periode)) +
        baris("Nominal Tagihan", UI.fmtRupiah(t.nominal)) +
        baris("Biaya Admin", fmtAdmin(t.admin)) +
        '<div class="tagihan__baris tagihan__baris--total"><span>Total Bayar</span><b>' +
        UI.fmtRupiah(t.total) + "</b></div>";
      els.tagihan.hidden = false;
    }

    function baris(label, nilai) {
      return '<div class="tagihan__baris"><span>' + label + "</span><b>" + nilai + "</b></div>";
    }

    /* Biaya admin Rp0 -> "Gratis" (keputusan produk). Sebagian biller di
       price-list asli memang tidak memungut admin (Bussan/Columbia Finance,
       INDOVISION, Three/Smartfren Postpaid, OVO, dst) — "Admin Rp0" terbaca
       seperti kolom yang belum terisi. SATU sumber: dipakai kartu Cek
       Tagihan DI SINI, dan file kategori memanggilnya lewat ctx.adminText
       di rows() supaya modal konfirmasi ikut konsisten. */
    function fmtAdmin(n) {
      return Number(n) > 0 ? UI.fmtRupiah(n) : "Gratis";
    }

    /* Sebutan identitas berbeda tiap kategori ("NOP", "Nomor Meter", ...).
       Diambil dari label field yang sudah diatur pascabayar-fields.js,
       bukan ditulis ulang di sini. */
    function labelId() {
      var l = document.querySelector('label[for="idInput"]');
      return esc((l && l.textContent.trim()) || "Nomor Pelanggan");
    }

    /* Nama pelanggan datang dari luar aplikasi (nanti dari penyedia),
       jadi tidak boleh masuk innerHTML mentah-mentah. */
    function esc(v) {
      return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      });
    }

    function lanjutBayar() {
      try {
        var t = state.tagihan;
        if (!t) { cekTagihan(); return; }

        var p = produkAktif();
        var ctx = {
          id: state.id, choice: state.choice, nominal: t.nominal,
          produk: p, sku: p ? p.sku : "", admin: t.admin, total: t.total,
          /* Teks siap-pakai: admin 0 -> "Gratis". File kategori memakai
             ctx.adminText di rows() supaya modal konfirmasi = kartu tagihan. */
          adminText: fmtAdmin(t.admin),
          op: DET ? OP.get(state.opKey) : null,
          subBrand: DET && DET.subBrands ? DET.subBrands[state.opKey] : null,
          /* Data hasil inquiry ikut dibawa supaya bisa dipakai baris modal
             maupun struk nanti. */
          tagihan: t,
        };
        var rows = typeof config.rows === "function" ? config.rows(ctx) : null;
        if (!Array.isArray(rows) || !rows.length) {
          rows = [
            { label: "Nominal Tagihan", value: UI.fmtRupiah(ctx.nominal) },
            { label: "Admin", value: ctx.adminText },
            { label: "Total Bayar", value: UI.fmtRupiah(ctx.total), total: true },
          ];
        }
        modal.show(rows, ctx);
      } catch (err) { console.error("manual-page: gagal lanjut bayar:", err); }
    }

    /* ---- Init --------------------------------------------------------- */

    function init() {
      var $ = function (id) { return document.getElementById(id); };
      els = {
        app: $("app"), warn: $("warnBox"), opBar: $("opBar"),
        nominalSec: $("nominalSec"), nominalField: $("nominalField"),
        nominal: $("nominalInput"), err: $("nominalErr"), submit: $("submitBtn"),
        hint: $("nominalHint"),
        empty: $("pEmpty"),
        id: $("idInput"), clear: $("clearBtn"),
        choiceSec: $("choiceSec"), choiceTitle: $("choiceTitle"),
        choiceBtn: $("choiceBtn"), choiceUbah: $("choiceUbah"),
        tagihan: null,
      };
      /* Label field identitas datang dari SATU sumber terpusat
         (pascabayar-fields.js), bukan hardcode di tiap HTML — tiap
         kategori memakai sebutan berbeda ("ID Pelanggan/No Meter",
         "Nomor Objek Pajak", dst). Halaman yang slug-nya belum terdaftar
         tetap memakai label dari HTML-nya sendiri. */
      if (window.DikaPascaField && config.slug) {
        window.DikaPascaField.terapkan(config.slug);
      }

      cekSkema();

      /* ---- Alur CEK TAGIHAN menggantikan input nominal manual ----------
         `config.submitLabel` ("Lanjutkan") SENGAJA TIDAK dipakai lagi —
         label tombol sekarang ikut tahap alur ("Cek Tagihan" lalu "Bayar
         Sekarang"), diatur setTombol(). Nilainya dibiarkan di 16 file
         kategori supaya diff-nya kecil; kalau ingin dihapus, hapus
         bersamaan di semua file, jangan sebagian.

         Kolom nominal manual DISEMBUNYIKAN, bukan dihapus dari markup:
         nominal sekarang datang dari hasil cek tagihan. Markup & fungsi
         formatNominal() dipertahankan sebagai jalan pulang kalau nanti
         ternyata ada biller yang TIDAK mendukung inquiry — itu kasus nyata
         di Digiflazz (sebagian PDAM/PBB/multifinance), dan saat itu tiba
         jalur manualnya tinggal ditampilkan lagi. */
      if (els.nominalField) els.nominalField.hidden = true;
      if (els.hint) els.hint.hidden = true;

      /* Kotak hasil cek tagihan dibuat runtime & disisipkan di atas tombol
         — 16 halaman pascabayar tidak perlu menambah markup apa pun. */
      if (els.nominalSec) {
        var kotak = document.createElement("div");
        kotak.className = "tagihan";
        kotak.hidden = true;
        kotak.setAttribute("aria-live", "polite");
        if (els.submit && els.submit.parentNode === els.nominalSec) {
          els.nominalSec.insertBefore(kotak, els.submit);
        } else {
          els.nominalSec.appendChild(kotak);
        }
        els.tagihan = kotak;
      }

      modal = UI.createModal({
        slug: config.slug,
        overlay: $("confirmOverlay"), rows: $("cmRows"),
        cancel: $("cmCancel"), pay: $("cmPay"),
        payTitle: config.payTitle || "Pembayaran",
        payLine: function (ctx) {
          if (!ctx || typeof config.payLine !== "function") return "";
          return config.payLine(ctx);
        },
      });

      if (ID && els.id) {
        els.id.addEventListener("input", onId);
        els.clear.addEventListener("click", function () {
          els.id.value = ""; onId(); els.id.focus();
        });
      }
      if (HAS_CHOICE_STEP && els.choiceBtn) {
        picker = UI.createPicker();
        picker.onPick(function (item) {
          try {
            state.choice = item;
            renderChoiceTrigger();
            syncSteps();
          } catch (err) { console.error("manual-page: gagal pilih jenis:", err); }
        });
        els.choiceBtn.addEventListener("click", bukaPemilihChoice);
        renderChoiceTrigger();   /* state awal: placeholder config.choiceTitle */
      }

      /* Input nominal manual tetap didengarkan supaya jalur manual bisa
         dihidupkan lagi tanpa menyambung ulang listener. */
      if (els.nominal) els.nominal.addEventListener("input", onNominal);
      els.submit.addEventListener("click", onSubmit);
      UI.wireBack(els.app, $("backBtn"));

      /* Tombol "ambil dari KONTAK" hanya saat idField memang NOMOR HP,
         yaitu mode `detect` (hp-pasca + 5 halaman sub-brand operator). Di
         halaman lain isinya ID pelanggan / NOP / nomor kontrak — nomor itu
         tidak ada di buku kontak, jadi tombolnya cuma menyesatkan.

         SUARA & SCAN tetap dipasang di SEMUA halaman: ID pelanggan justru
         yang paling panjang dan paling capek diketik (NOP PBB 18 digit),
         dan lembar tagihannya hampir selalu punya barcode. Sebelumnya
         seluruh bar tombol ikut dimatikan di 9 halaman pascabayar — jadi
         di sana mikrofonnya memang TIDAK PERNAH ADA, bukan tidak berfungsi. */
      if (window.DikaInputHelper && els.id) {
        window.DikaInputHelper.attach(els.id, {
          fitur: config.detect ? ["kontak", "suara", "scan"] : ["suara", "scan"],
        });
      }

      /* Placeholder beranimasi. Field NOMOR HP memakai contoh dari prefix
         operator; field ID pelanggan memakai variasi dari placeholder
         aslinya (tiap kategori punya format sendiri — lihat
         pascabayar-fields.js), jadi contohnya tetap relevan per kategori. */
      if (window.DikaPlaceholder && els.id) {
        var contoh = config.detect
          ? window.DikaPlaceholder.contohNomorHP()
          : contohDariPlaceholder(els.id.getAttribute("placeholder"));
        if (contoh.length) window.DikaPlaceholder.pasang(els.id, contoh);
      }

      /* Sinkronkan tampilan dengan isi input (mis. dipulihkan bfcache) */
      if (ID && els.id) onId(); else syncSteps();
      onNominal();
      siapInit = true;
    }

    var siapInit = false;

    UI.onReady ? UI.onReady(init) : document.addEventListener("DOMContentLoaded", init);

    /* Dipanggil pascabayar-live.js SETELAH katalog backend tiba: bangun
       ulang daftar biller di picker, cek skema data baru, sinkronkan
       kembali langkah alur. Aman dipanggil sebelum init selesai (no-op). */
    return {
      segarkan: function () {
        if (!siapInit) return;
        try {
          cekSkema();
          /* Pilihan biller yang sudah dibuat mungkin tak ada lagi di daftar
             baru (data berubah) — batalkan supaya tidak menunjuk _p basi. */
          if (state.choice && USES_LIST) {
            var masih = (daftarChoices() || []).some(function (c) { return c.id === state.choice.id; });
            if (!masih) state.choice = null;
          }
          renderChoiceTrigger();
          syncSteps();
        } catch (e) { console.error("manual-page: segarkan gagal:", e); }
      },
      state: function () { return state; },
    };
  };
})();
