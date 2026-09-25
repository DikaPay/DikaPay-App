/* ===========================================================================
   DikaPay — tv-pasca.js
   Kategori TV Pascabayar — DISAMBUNGKAN ke backend DikaPay.

   HANYA konfigurasi + teks. Data (fetch, saring brand="TV PASCABAYAR",
   bentuk record, dedupe, kartu status, refresh) ada di pascabayar-live.js.

   BANYAK BILLER: 14 penyedia di price-list asli (Indovision, First Media,
   Nex Media, Telkomvision, Iconnet, K-Vision per paket, Indosat HiFi),
   admin per biller (Rp0–Rp3.500) -> pemilih penyedia.

   Record PASCABAYAR: { sku, nama, brand, admin_fee, kategori_asli, gangguan? }
   =========================================================================== */

(function () {
  "use strict";

  var UI = window.DikaProdukUI;

  window.DikaTvPasca = window.DikaPascaLive.pasang({
    slug: "tv-pasca",
    label: "TV Pascabayar",
    choiceTitle: "Pilih Penyedia",
    pickedLabel: "Penyedia",
    idField: { min: 6, max: 16 },
    warning: true,
    minNominal: 1000,
    maxNominal: 10000000,
    submitLabel: "Lanjutkan",
    payTitle: "Pembayaran",
    rows: function (ctx) {
      return [
        { label: "Penyedia", value: ctx.produk ? ctx.produk.nama : "-" },
        { label: "Nomor Pelanggan", value: ctx.id },
        { label: "Nominal Tagihan", value: UI.fmtRupiah(ctx.nominal) },
        { label: "Admin", value: ctx.adminText },
        { label: "Total Bayar", value: UI.fmtRupiah(ctx.total), total: true },
      ];
    },
    payLine: function (ctx) {
      return "Pembayaran " + (ctx.produk ? ctx.produk.nama : "tagihan") + " " +
        UI.fmtRupiah(ctx.total) + " untuk nomor pelanggan " + ctx.id +
        " belum bisa diproses karena metode pembayaran masih dalam pengerjaan. " +
        "Terima kasih sudah menunggu!";
    },
  });
})();
