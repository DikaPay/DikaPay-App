/* ===========================================================================
   DikaPay — pln-bill.js
   Kategori PLN Pascabayar — DISAMBUNGKAN ke backend DikaPay.

   HANYA konfigurasi halaman + teks. Rangkaian data (fetch, saring brand,
   bentuk record, kartu status, refresh) ada di pascabayar-live.js; alur
   halaman ada di manual-page.js + produk-ui.js.

   BILLER TUNGGAL (`single: true`): di price-list asli kategori "PLN
   PASCABAYAR" cuma punya 1 biller ("Pln Pascabayar", admin Rp4.000), jadi
   tidak ada yang perlu dipilih — langsung isi ID -> Cek Tagihan.

   STRUKTUR record PASCABAYAR (produk-schema.js):
     { sku, nama, brand, admin_fee, kategori_asli, gangguan? }
   SENGAJA TIDAK ADA harga_modal — nominal tagihan datang dari inquiry.
   =========================================================================== */

(function () {
  "use strict";

  var UI = window.DikaProdukUI;

  window.DikaPlnBill = window.DikaPascaLive.pasang({
    slug: "pln-bill",
    label: "PLN Pascabayar",
    single: true,
    idField: { min: 8, max: 12 },
    warning: true,
    minNominal: 1000,
    maxNominal: 10000000,
    submitLabel: "Lanjutkan",
    payTitle: "Pembayaran",
    rows: function (ctx) {
      return [
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
