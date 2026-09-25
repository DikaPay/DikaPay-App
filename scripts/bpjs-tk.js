/* ===========================================================================
   DikaPay — bpjs-tk.js
   Kategori BPJS Ketenagakerjaan (pascabayar) — DISAMBUNGKAN ke backend DikaPay.

   HANYA konfigurasi + teks. Data ada di pascabayar-live.js.
   DUA BILLER di price-list asli: "Penerima Upah" (PU) & "Bukan Penerima
   Upah" (BPU) — iuran & aturannya berbeda, jadi member WAJIB memilih.
   -> pemilih jenis kepesertaan (#choiceSec, ditambahkan ke bpjs-tk.html).

   Record PASCABAYAR: { sku, nama, brand, admin_fee, kategori_asli, gangguan? }
   =========================================================================== */

(function () {
  "use strict";

  var UI = window.DikaProdukUI;

  window.DikaBpjsTk = window.DikaPascaLive.pasang({
    slug: "bpjs-tk",
    label: "BPJS Ketenagakerjaan",
    choiceTitle: "Pilih Jenis Kepesertaan",
    pickedLabel: "Jenis Kepesertaan",
    idField: { min: 10, max: 16 },
    warning: true,
    minNominal: 1000,
    maxNominal: 10000000,
    submitLabel: "Lanjutkan",
    payTitle: "Pembayaran",
    rows: function (ctx) {
      return [
        { label: "Jenis Kepesertaan", value: ctx.produk ? ctx.produk.nama : "-" },
        { label: "Nomor Kepesertaan", value: ctx.id },
        { label: "Nominal Tagihan", value: UI.fmtRupiah(ctx.nominal) },
        { label: "Admin", value: ctx.adminText },
        { label: "Total Bayar", value: UI.fmtRupiah(ctx.total), total: true },
      ];
    },
    payLine: function (ctx) {
      return "Pembayaran " + (ctx.produk ? ctx.produk.nama : "tagihan") + " " +
        UI.fmtRupiah(ctx.total) + " untuk nomor kepesertaan " + ctx.id +
        " belum bisa diproses karena metode pembayaran masih dalam pengerjaan. " +
        "Terima kasih sudah menunggu!";
    },
  });
})();
