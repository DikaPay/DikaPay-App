/* ===========================================================================
   DikaPay — multifinance.js
   Kategori Multifinance / "Angsuran Kredit" (pascabayar) — DISAMBUNGKAN ke
   backend DikaPay.

   HANYA konfigurasi + teks. Data (fetch, saring brand="MULTIFINANCE",
   bentuk record, dedupe, kartu status, refresh) ada di pascabayar-live.js.

   BANYAK BILLER: 26 perusahaan pembiayaan di price-list asli (FIF/Federal
   Inti, Adira via ACC, BAF/Bussan, WOM, Mega, Home Credit, CIMB, dst),
   admin per biller (Rp0–Rp10.000) -> pemilih perusahaan.

   Record PASCABAYAR: { sku, nama, brand, admin_fee, kategori_asli, gangguan? }
   =========================================================================== */

(function () {
  "use strict";

  var UI = window.DikaProdukUI;

  window.DikaMultifinance = window.DikaPascaLive.pasang({
    slug: "multifinance",
    label: "Multifinance",
    choiceTitle: "Pilih Perusahaan Pembiayaan",
    pickedLabel: "Perusahaan Pembiayaan",
    idField: { min: 6, max: 16 },
    warning: true,
    minNominal: 1000,
    maxNominal: 10000000,
    submitLabel: "Lanjutkan",
    payTitle: "Pembayaran",
    rows: function (ctx) {
      return [
        { label: "Perusahaan Pembiayaan", value: ctx.produk ? ctx.produk.nama : "-" },
        { label: "Nomor Kontrak", value: ctx.id },
        { label: "Nominal Tagihan", value: UI.fmtRupiah(ctx.nominal) },
        { label: "Admin", value: ctx.adminText },
        { label: "Total Bayar", value: UI.fmtRupiah(ctx.total), total: true },
      ];
    },
    payLine: function (ctx) {
      return "Pembayaran " + (ctx.produk ? ctx.produk.nama : "tagihan") + " " +
        UI.fmtRupiah(ctx.total) + " untuk nomor kontrak " + ctx.id +
        " belum bisa diproses karena metode pembayaran masih dalam pengerjaan. " +
        "Terima kasih sudah menunggu!";
    },
  });
})();
