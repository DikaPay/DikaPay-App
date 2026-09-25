/* ===========================================================================
   DikaPay — emoney-pasca.js
   Kategori "E-Money" PASCABAYAR — DISAMBUNGKAN ke backend DikaPay.

   HANYA konfigurasi + teks. Data (fetch, saring brand="E-MONEY" pada
   endpoint pascabayar, bentuk record, dedupe, kartu status) ada di
   pascabayar-live.js.

   ==================== JANGAN digabung dengan emoney.js (prabayar) =========
   emoney.js       = TOP UP saldo, harga tetap, bayar di muka (prabayar)
   emoney-pasca.js = TAGIHAN "bebas nominal" yang dibayar belakangan
   Digiflazz memakai nama kategori "E-Money" di KEDUA daftar harga; pemisah
   ada di ENDPOINT (?jenis=prabayar vs ?jenis=pascabayar) + argumen ketiga
   `DikaKategoriMap.cocokkan(brand, brand, "pascabayar")`. Diuji: 0 kebocoran.

   BANYAK BILLER: 5 e-wallet di price-list asli (GoPay/DANA/ShopeePay/OVO/
   LinkAja "Bebas Nominal"), admin per wallet (Rp0–Rp2.000) -> pemilih.
   Akun e-wallet terdaftar atas NOMOR HP -> idField = nomor HP (detect: {}).

   Record PASCABAYAR: { sku, nama, brand, admin_fee, kategori_asli, gangguan? }
   =========================================================================== */

(function () {
  "use strict";

  var UI = window.DikaProdukUI;

  window.DikaEmoneyPasca = window.DikaPascaLive.pasang({
    slug: "emoney-pasca",
    label: "E-Money Pascabayar",
    detect: {},
    choiceTitle: "Pilih E-Wallet",
    pickedLabel: "E-Wallet",
    idField: { min: 10, max: 13 },
    warning: true,
    minNominal: 1000,
    maxNominal: 10000000,
    submitLabel: "Lanjutkan",
    payTitle: "Pembayaran",
    rows: function (ctx) {
      return [
        { label: "E-Wallet", value: ctx.produk ? ctx.produk.nama : "-" },
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
