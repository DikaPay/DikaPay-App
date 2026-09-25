/* ===========================================================================
   DikaPay — gas.js
   Kategori Gas Negara (pascabayar) — DISAMBUNGKAN ke backend DikaPay.

   HANYA konfigurasi + teks. Data ada di pascabayar-live.js.
   DUA BILLER di price-list asli: "Gas Negara" (PGN, admin Rp3.000) &
   "Pertagas" (admin Rp2.500) — biller berbeda, member memilih.
   -> pemilih penyedia (#choiceSec, ditambahkan ke gas.html).

   Record PASCABAYAR: { sku, nama, brand, admin_fee, kategori_asli, gangguan? }
   =========================================================================== */

(function () {
  "use strict";

  var UI = window.DikaProdukUI;

  window.DikaGas = window.DikaPascaLive.pasang({
    slug: "gas",
    label: "Gas Negara",
    choiceTitle: "Pilih Penyedia Gas",
    pickedLabel: "Penyedia",
    idField: { min: 8, max: 14 },
    warning: true,
    minNominal: 1000,
    maxNominal: 10000000,
    submitLabel: "Lanjutkan",
    payTitle: "Pembayaran",
    rows: function (ctx) {
      return [
        { label: "Penyedia", value: ctx.produk ? ctx.produk.nama : "-" },
        { label: "ID Pelanggan", value: ctx.id },
        { label: "Nominal Tagihan", value: UI.fmtRupiah(ctx.nominal) },
        { label: "Admin", value: ctx.adminText },
        { label: "Total Bayar", value: UI.fmtRupiah(ctx.total), total: true },
      ];
    },
    payLine: function (ctx) {
      return "Pembayaran " + (ctx.produk ? ctx.produk.nama : "tagihan") + " " +
        UI.fmtRupiah(ctx.total) + " untuk id pelanggan " + ctx.id +
        " belum bisa diproses karena metode pembayaran masih dalam pengerjaan. " +
        "Terima kasih sudah menunggu!";
    },
  });
})();
