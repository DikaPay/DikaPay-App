/* ===========================================================================
   DikaPay — pdam.js
   Kategori PDAM (pascabayar) — DISAMBUNGKAN ke backend DikaPay.

   HANYA konfigurasi halaman + teks. Semua rangkaian data (fetch, saring
   brand, bentuk record, dedupe, kartu status, refresh) ada di
   pascabayar-live.js; alur halaman (input ID -> cek tagihan -> bayar) ada
   di manual-page.js + produk-ui.js.

   ==================== KENAPA PDAM JADI PILOT PASCABAYAR ===================
   PDAM adalah kategori pascabayar TERKOMPLEKS: 263 biller (satu PDAM per
   kota/kabupaten), masing-masing `admin_fee` sendiri (Rp300–Rp5.000 di
   price-list asli). Jadi ia menguji jalur pemilih biller berdata backend —
   `produkListFor` + popup `UI.createPicker` — sekaligus. Kategori
   pascabayar lain (biller tunggal / sedikit) tinggal ikut pola yang sama.

   STRUKTUR record PASCABAYAR (produk-schema.js):
     { sku, nama, brand, admin_fee, kategori_asli, gangguan? }
   SENGAJA TIDAK ADA harga_modal — nominal tagihan datang dari inquiry.
   =========================================================================== */

(function () {
  "use strict";

  var UI = window.DikaProdukUI;

  window.DikaPdam = window.DikaPascaLive.pasang({
    slug: "pdam",
    label: "PDAM",
    single: false,                    /* banyak biller -> pemilih daerah */
    choiceTitle: "Pilih PDAM Daerah",
    /* Dipakai di baris ringkas SETELAH biller dipilih ("PDAM: <nama>") —
       TANPA kata "Pilih" seperti choiceTitle (judul popup sebelum dipilih). */
    pickedLabel: "PDAM",
    idField: { min: 6, max: 14 },
    warning: true,
    minNominal: 1000,
    maxNominal: 10000000,
    submitLabel: "Lanjutkan",
    payTitle: "Pembayaran",
    rows: function (ctx) {
      return [
        { label: "PDAM", value: ctx.produk ? ctx.produk.nama : "-" },
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
