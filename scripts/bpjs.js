/* ===========================================================================
   DikaPay — bpjs.js
   Kategori BPJS Kesehatan (pascabayar) — DISAMBUNGKAN ke backend DikaPay.

   HANYA konfigurasi + teks. Data ada di pascabayar-live.js.
   BILLER TUNGGAL: 1 biller ("BPJS Kesehatan", admin Rp2.500).

   Record PASCABAYAR: { sku, nama, brand, admin_fee, kategori_asli, gangguan? }
   =========================================================================== */

(function () {
  "use strict";

  var UI = window.DikaProdukUI;

  window.DikaBpjs = window.DikaPascaLive.pasang({
    slug: "bpjs",
    label: "BPJS Kesehatan",
    single: true,
    idField: { min: 11, max: 16 },
    warning: true,
    minNominal: 1000,
    maxNominal: 10000000,
    submitLabel: "Lanjutkan",
    payTitle: "Pembayaran",
    rows: function (ctx) {
      return [
        { label: "Nomor Kartu", value: ctx.id },
        { label: "Nominal Tagihan", value: UI.fmtRupiah(ctx.nominal) },
        { label: "Admin", value: ctx.adminText },
        { label: "Total Bayar", value: UI.fmtRupiah(ctx.total), total: true },
      ];
    },
    payLine: function (ctx) {
      return "Pembayaran " + (ctx.produk ? ctx.produk.nama : "tagihan") + " " +
        UI.fmtRupiah(ctx.total) + " untuk nomor kartu " + ctx.id +
        " belum bisa diproses karena metode pembayaran masih dalam pengerjaan. " +
        "Terima kasih sudah menunggu!";
    },
  });
})();
