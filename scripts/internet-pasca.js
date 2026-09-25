/* ===========================================================================
   DikaPay — internet-pasca.js
   Kategori Internet Pascabayar — DISAMBUNGKAN ke backend DikaPay.

   HANYA konfigurasi + teks. Data (fetch, saring brand="INTERNET PASCABAYAR",
   bentuk record, dedupe, kartu status, refresh) ada di pascabayar-live.js.

   BANYAK BILLER: 6 provider di price-list asli (CBN, Speedy & IndiHome,
   Telkom PSTN, MyRepublic, XL Home, Biznet Home), admin per biller
   (Rp0–Rp3.000) -> pemilih provider.

   Record PASCABAYAR: { sku, nama, brand, admin_fee, kategori_asli, gangguan? }
   =========================================================================== */

(function () {
  "use strict";

  var UI = window.DikaProdukUI;

  window.DikaInternetPasca = window.DikaPascaLive.pasang({
    slug: "internet-pasca",
    label: "Internet Pascabayar",
    choiceTitle: "Pilih Provider",
    pickedLabel: "Provider",
    idField: { min: 6, max: 16 },
    warning: true,
    minNominal: 1000,
    maxNominal: 10000000,
    submitLabel: "Lanjutkan",
    payTitle: "Pembayaran",
    rows: function (ctx) {
      return [
        { label: "Provider", value: ctx.produk ? ctx.produk.nama : "-" },
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
