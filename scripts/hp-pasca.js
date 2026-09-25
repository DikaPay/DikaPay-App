/* ===========================================================================
   DikaPay — hp-pasca.js
   Kategori HP Pascabayar — DISAMBUNGKAN ke backend DikaPay.

   HANYA konfigurasi + teks. Data ada di pascabayar-live.js.

   ==================== KENAPA MODE "operator", BUKAN produkList ============
   5 biller di price-list asli ("Halo Postpaid", "XL Postpaid", "Matrix",
   "Three Postpaid", "Smartfren Postpaid") tapi member TIDAK memilihnya dari
   daftar — biller-nya ditentukan OTOMATIS dari prefix nomor HP yang diketik
   (deteksi operator). Jadi `pascabayar-live.js` dijalankan dengan `opMap`:
   tiap opKey dipetakan ke biller lewat pencocokan substring nama. Ini
   memberi hp-pasca `admin_fee` & `sku` ASLI per operator tanpa mengubah
   alur "nomor -> deteksi -> tagihan" yang sudah ada.

   `axis` sengaja dipetakan ke biller "XL Postpaid" (di Digiflazz Axis ikut
   billing XL). Smartfren TETAP dipetakan walau tidak punya chip sub-brand
   (Digiflazz tidak punya kategori sub-brand pascabayar untuk Smartfren).

   Record PASCABAYAR: { sku, nama, brand, admin_fee, kategori_asli, gangguan? }
   =========================================================================== */

(function () {
  "use strict";

  var UI = window.DikaProdukUI;

  /* Nama sub-brand pascabayar — TAMPILAN saja (chip di modal), bukan biller
     terpisah. Smartfren SENGAJA tidak ada: Digiflazz tidak punya kategori
     pascabayar sub-brand untuk Smartfren. */
  var SUB_BRANDS = {
    "telkomsel": "Telkomsel Omni",
    "indosat": "Indosat Only4u",
    "xl": "XL Axis Cuanku",
    "axis": "XL Axis Cuanku",
    "three": "Tri CuanMax",
  };

  window.DikaHpPasca = window.DikaPascaLive.pasang({
    slug: "hp-pasca",
    label: "HP Pascabayar",
    /* opKey -> kata kunci substring pada nama biller backend */
    opMap: {
      telkomsel: ["halo"],
      indosat:   ["matrix"],
      xl:        ["xl postpaid"],
      axis:      ["xl postpaid"],
      three:     ["three postpaid"],
      smartfren: ["smartfren postpaid"],
    },
    detect: { subBrands: SUB_BRANDS },
    idField: { min: 4, max: 13 },
    choices: [
      { id: "reguler", name: "Pascabayar Reguler", sub: "Tagihan bulanan sesuai operator terdeteksi" },
      { id: "byu", name: "by.U", sub: "Paket khusus, tidak terikat prefix operator" },
    ],
    choiceTitle: "Jenis Layanan",
    pickedLabel: "Jenis Layanan",
    warning: true,
    minNominal: 1000,
    maxNominal: 10000000,
    submitLabel: "Lanjutkan",
    payTitle: "Pembayaran",
    rows: function (ctx) {
      return [
        { label: "Nomor HP", value: window.DikaOperator.prettyPhone(ctx.id) },
        { label: "Operator", value: ctx.op ? ctx.op.name : "-" },
        { label: "Layanan", value: ctx.choice && ctx.choice.id === "byu"
            ? "by.U" : (ctx.subBrand || "Pascabayar") },
        { label: "Nominal Tagihan", value: UI.fmtRupiah(ctx.nominal) },
        { label: "Admin", value: ctx.adminText },
        { label: "Total Bayar", value: UI.fmtRupiah(ctx.total), total: true },
      ];
    },
    payLine: function (ctx) {
      return "Pembayaran " + (ctx.produk ? ctx.produk.nama : "tagihan") + " " +
        UI.fmtRupiah(ctx.total) + " untuk nomor hp " + ctx.id +
        " belum bisa diproses karena metode pembayaran masih dalam pengerjaan. " +
        "Terima kasih sudah menunggu!";
    },
  });
})();
