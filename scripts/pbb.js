/* ===========================================================================
   DikaPay — pbb.js
   Kategori PBB (pascabayar) — DISAMBUNGKAN ke backend DikaPay.

   HANYA konfigurasi + teks. Data (fetch, saring brand="PBB", bentuk record,
   dedupe, kartu status, refresh) ada di pascabayar-live.js; alur halaman
   ada di manual-page.js + produk-ui.js.

   BANYAK BILLER: PBB dipungut per KOTA/KABUPATEN — tiap pemda 1 biller,
   admin sendiri (Rp2.500–Rp6.500 di price-list asli) -> pemilih wilayah.

   Record PASCABAYAR (produk-schema.js): { sku, nama, brand, admin_fee,
   kategori_asli, gangguan? } — TANPA harga_modal (nominal dari inquiry).
   =========================================================================== */

(function () {
  "use strict";

  var UI = window.DikaProdukUI;

  window.DikaPbb = window.DikaPascaLive.pasang({
    slug: "pbb",
    label: "PBB",
    choiceTitle: "Pilih Wilayah PBB",
    pickedLabel: "Wilayah",
    idField: { min: 15, max: 18 },
    warning: true,
    minNominal: 1000,
    maxNominal: 10000000,
    submitLabel: "Lanjutkan",
    payTitle: "Pembayaran",
    rows: function (ctx) {
      return [
        { label: "Wilayah", value: ctx.produk ? ctx.produk.nama : "-" },
        { label: "NOP", value: ctx.id },
        { label: "Nominal Tagihan", value: UI.fmtRupiah(ctx.nominal) },
        { label: "Admin", value: ctx.adminText },
        { label: "Total Bayar", value: UI.fmtRupiah(ctx.total), total: true },
      ];
    },
    payLine: function (ctx) {
      return "Pembayaran " + (ctx.produk ? ctx.produk.nama : "tagihan") + " " +
        UI.fmtRupiah(ctx.total) + " untuk NOP " + ctx.id +
        " belum bisa diproses karena metode pembayaran masih dalam pengerjaan. " +
        "Terima kasih sudah menunggu!";
    },
  });
})();
