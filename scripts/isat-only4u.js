/* ===========================================================================
   DikaPay — isat-only4u.js
   Kategori "Indosat Only4u" (pascabayar sub-brand operator) — DISAMBUNGKAN ke
   backend DikaPay.

   HANYA konfigurasi + teks. Data ada di pascabayar-live.js.
   BILLER TUNGGAL: 1 biller di price-list asli. Layanan ini JUGA bisa
   dicapai lewat hp-pasca.html (deteksi sub-brand otomatis dari prefix);
   halaman ini ada supaya struktur kategori 1:1 dengan Digiflazz.

   idField diperlakukan sebagai NOMOR HP (detect: {}): prefix operator
   divalidasi, badge tidak ditampilkan (lihat manual-page.js).

   Record PASCABAYAR: { sku, nama, brand, admin_fee, kategori_asli, gangguan? }
   =========================================================================== */

(function () {
  "use strict";

  var UI = window.DikaProdukUI;

  window.DikaIsatOnly4u = window.DikaPascaLive.pasang({
    slug: "isat-only4u",
    label: "Indosat Only4u",
    single: true,
    detect: {},
    idField: { min: 10, max: 13 },
    warning: true,
    minNominal: 1000,
    maxNominal: 10000000,
    submitLabel: "Lanjutkan",
    payTitle: "Pembayaran",
    rows: function (ctx) {
      return [
        { label: "Nomor HP", value: ctx.id },
        { label: "Nominal Tagihan", value: UI.fmtRupiah(ctx.nominal) },
        { label: "Admin", value: ctx.adminText },
        { label: "Total Bayar", value: UI.fmtRupiah(ctx.total), total: true },
      ];
    },
    payLine: function (ctx) {
      return "Pembayaran " + (ctx.produk ? ctx.produk.nama : "tagihan") + " " +
        UI.fmtRupiah(ctx.total) + " untuk " + ctx.id +
        " belum bisa diproses karena metode pembayaran masih dalam pengerjaan. " +
        "Terima kasih sudah menunggu!";
    },
  });
})();
