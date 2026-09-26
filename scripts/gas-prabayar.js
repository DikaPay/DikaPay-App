/* ===========================================================================
   DikaPay — gas-prabayar.js
   Halaman Gas Prabayar (token gas PGN — PRABAYAR, harga tetap).
   Menggantikan menu "TV" (kategori TV masih kosong di Digiflazz; Gas
   Prabayar SUDAH ada isinya).

   ALUR: isi ID Pelanggan >= 8 digit -> warning box -> grid nominal token.
   Tidak ada inquiry di sini (gas PRABAYAR = beli token, tidak ada nama
   pelanggan wajib seperti PLN). Pola & modul sama persis dengan listrik.js:
   produk-ui.js LANGSUNG (tidak ada operator yang dideteksi), fetch dirangkai
   sendiri lewat api.js.

   DATA ASLI: diambil dari GET api-produk.php?jenis=prabayar lalu disaring
   ke slug "gas-prabayar" lewat DikaKategoriMap.cocokkan() (bukan cocokkan
   string kategori mentah — supaya tahan kalau Digiflazz menamainya "Gas" /
   "Gas Prabayar" / "Gas PGN"). Di price-list hari ini: kategori "Gas",
   brand "Pertamina Gas", 5 nominal (Pertagas 20rb–500rb).

   STRUKTUR: produk PRABAYAR (harga TETAP) — produk-schema.js:
     { sku, nama, brand, harga_modal, kategori_asli, sub?, deskripsi? }
   TIDAK ADA admin_fee (itu milik pascabayar).
   =========================================================================== */

(function () {
  "use strict";

  var UI = window.DikaProdukUI;

  var SLUG = "gas-prabayar";
  var JENIS = "prabayar";
  var MIN_DIGITS = 8;
  var MAX_DIGITS = 16;

  var PRODUK = [];
  var status = "idle";       /* idle | memuat | siap | gagal */
  var pesanGagal = "";
  var ringkasan = null;
  var statusUI = null;

  function lebihBaik(baru, lama) {
    var rusakBaru = !!baru.gangguan, rusakLama = !!lama.gangguan;
    if (rusakBaru !== rusakLama) return rusakLama;
    return baru.harga_modal < lama.harga_modal;
  }

  /* Saring baris yang slug kategorinya "gas-prabayar" — cocokkan() dipanggil
     SEKALI per nama kategori unik (bukan per baris), pola yang sama dengan
     tv.js: satu kategori tak dikenal berisi ratusan produk = ratusan
     console.warn identik kalau per-baris. */
  function saring(semua) {
    var KM = window.DikaKategoriMap;
    if (!KM || typeof KM.cocokkan !== "function") {
      console.error(SLUG + ": kategori-map.js belum di-link — tidak bisa menyaring kategori.");
      return [];
    }
    var putusan = {};
    return (semua || []).filter(function (p) {
      if (!p) return false;
      var k = String(p.kategori || "");
      if (!(k in putusan)) {
        try { putusan[k] = KM.cocokkan(k, p.brand, JENIS) === SLUG; }
        catch (e) { putusan[k] = false; }
      }
      return putusan[k];
    });
  }

  function bangun(daftar) {
    var per = {};
    var dilewati = 0, digabung = 0;
    (daftar || []).forEach(function (p) {
      if (!p || typeof p.harga_modal !== "number" || !isFinite(p.harga_modal)) { dilewati++; return; }
      var rec = {
        sku: String(p.kode_produk || ""),
        nama: String(p.nama || "").trim(),
        brand: String(p.brand || "Pertamina Gas").trim(),
        harga_modal: p.harga_modal,
        kategori_asli: String(p.kategori || "Gas"),
      };
      if (window.DikaProduk && window.DikaProduk.statusGangguan(p)) rec.gangguan = true;
      if (p.deskripsi) rec.deskripsi = String(p.deskripsi);
      var k = rec.nama.toLowerCase();
      if (!per[k]) { per[k] = rec; return; }
      digabung++;
      if (lebihBaik(rec, per[k])) per[k] = rec;
    });
    var out = Object.keys(per).map(function (k) { return per[k]; })
      .sort(function (a, b) { return a.harga_modal - b.harga_modal; });
    ringkasan = {
      diterima: (daftar || []).length, terpakai: out.length,
      digabung: digabung, dilewati: dilewati,
      gangguan: out.filter(function (x) { return x.gangguan; }).length,
    };
    console.info(SLUG + ": " + out.length + " nominal token siap dari " +
      ringkasan.diterima + " baris kategori Gas Prabayar.");
    return out;
  }

  function daftarkanJumlah() {
    if (window.DikaKatalogJumlah && window.DikaKatalogJumlah.daftarkan) {
      window.DikaKatalogJumlah.daftarkan(SLUG, PRODUK, "array");
    }
  }

  function segarkanStatusUI() {
    if (!statusUI) return;
    var siapTampil = state.id.length >= MIN_DIGITS;
    if (status === "gagal") { statusUI.gagal(pesanGagal, function () { muat(true); }); return; }
    if (status === "memuat") { statusUI.memuat(5); return; }
    if (status === "siap" && siapTampil && !PRODUK.length) {
      statusUI.kosong("Produk Gas Prabayar sedang belum tersedia. Segera hadir!");
      return;
    }
    statusUI.sembunyi();
  }

  function muat(paksa) {
    if (!window.DikaApi) {
      console.error(SLUG + ": api.js belum di-link — data produk tidak bisa dimuat.");
      status = "gagal";
      pesanGagal = "Modul jaringan belum termuat. Coba buka ulang halamannya, ya.";
      segarkanStatusUI();
      return;
    }
    if (status === "memuat") return;
    status = "memuat"; pesanGagal = "";
    segarkanStatusUI();

    window.DikaApi.katalog(JENIS, !!paksa)
      .then(function (semua) {
        PRODUK = bangun(saring(semua));
        daftarkanJumlah();
        status = "siap";
        if (window.DikaProduk) window.DikaProduk.check(PRODUK, "prabayar", SLUG);
        segarkanStatusUI();
        onInput();
      })
      .catch(function (err) {
        console.error(SLUG + ": gagal memuat katalog:", err && (err.sebab || err.message), err);
        status = "gagal";
        pesanGagal = (err && err.pesanMember) || "Produk tidak bisa dimuat sekarang. Coba lagi, ya.";
        segarkanStatusUI();
      });
  }

  function cobaDariCache() {
    if (!window.DikaApi || typeof window.DikaApi.bacaCache !== "function") return false;
    var mentah = window.DikaApi.bacaCache(JENIS);
    if (!mentah) return false;
    PRODUK = bangun(saring(mentah));   /* 0 record pun jawaban sah */
    daftarkanJumlah();
    status = "siap";
    return true;
  }

  var els = {};
  var grid = null;
  var modal = null;
  var state = { id: "", items: [] };

  function sanitize(raw) {
    return String(raw || "").replace(/\D/g, "").slice(0, MAX_DIGITS);
  }

  function onInput() {
    /* AMAN DIPANGGIL DARI HALAMAN MANA PUN — lihat penjelasan yang sama
       di listrik.js. margin.html memuat file ini hanya untuk membaca
       JUMLAH produknya, tidak merender grid: init() berhenti di
       `if (!UI) return` sehingga `els` masih kosong. muat() memanggil
       onInput() begitu katalog backend datang, jadi tanpa penjagaan ini
       margin.html melempar TypeError "reading 'value'" ke console
       beberapa detik setelah dibuka. */
    if (!els.id) return;
    try {
      var clean = sanitize(els.id.value);
      if (els.id.value !== clean) els.id.value = clean;
      state.id = clean;
      els.clear.hidden = clean.length === 0;

      var ready = clean.length >= MIN_DIGITS;
      els.warn.hidden = !ready;
      els.empty.hidden = ready;

      if (ready && PRODUK.length) {
        state.items = PRODUK;
        grid.render(state.items, "gas|" + PRODUK.length);
      } else {
        state.items = [];
        grid.clear();
      }
      segarkanStatusUI();
    } catch (err) {
      console.error(SLUG + ": input error:", err);
    }
  }

  function clearId() {
    els.id.value = "";
    onInput();
    els.id.focus();
  }

  function openConfirm(idx) {
    var item = state.items[idx];
    if (!item || state.id.length < MIN_DIGITS) return;
    modal.show([
      { label: "ID Pelanggan Gas", value: state.id },
      { label: "Nominal Token", value: item.nama },
      { label: "Total Bayar", value: UI.fmtRupiah(item.harga_modal), total: true },
    ], { item: item, id: state.id });
  }

  function init() {
    if (!UI) { console.error(SLUG + ": produk-ui.js belum di-link"); return; }
    var $ = function (id) { return document.getElementById(id); };
    els = {
      app: $("app"), id: $("meterInput"), clear: $("clearBtn"),
      warn: $("warnBox"),
      prodSec: $("prodSec"), prodGrid: $("prodGrid"), empty: $("pEmpty"),
    };

    statusUI = UI.createStatus({ anchor: els.prodSec });
    grid = UI.createGrid({ grid: els.prodGrid, section: els.prodSec, slug: SLUG });
    grid.onPick(openConfirm);

    modal = UI.createModal({
      slug: SLUG,
      overlay: $("confirmOverlay"), rows: $("cmRows"),
      cancel: $("cmCancel"), pay: $("cmPay"),
      payTitle: "Pembayaran",
      payLine: function (ctx) {
        if (!ctx) return "";
        return "Token gas " + ctx.item.nama + " untuk ID pelanggan " + ctx.id +
          " belum bisa diproses karena metode pembayaran masih dalam pengerjaan. " +
          "Terima kasih sudah menunggu!";
      },
    });

    els.id.addEventListener("input", onInput);
    els.clear.addEventListener("click", clearId);
    UI.wireBack(els.app, $("backBtn"));

    if (window.DikaInputHelper) window.DikaInputHelper.attach(els.id);
    if (window.DikaPlaceholder) {
      window.DikaPlaceholder.pasang(els.id, ["1234 5678 90", "0812 3456 789", "5544 3322 11"]);
    }

    if (cobaDariCache()) {
      if (window.DikaProduk) window.DikaProduk.check(PRODUK, "prabayar", SLUG);
    } else {
      muat(false);
    }
    onInput();
  }

  if (UI) {
    UI.onReady ? UI.onReady(init) : document.addEventListener("DOMContentLoaded", init);
  } else {
    cobaDariCache();
  }

  window.DikaGasPrabayar = {
    ringkasan: function () { return ringkasan; },
    status: function () { return status; },
    produk: function () { return PRODUK; },
    muatUlang: function () { muat(true); },
  };
})();
