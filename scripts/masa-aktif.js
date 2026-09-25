/* ===========================================================================
   DikaPay — masa-aktif.js
   Kategori "Masa Aktif" — DATA ASLI dari backend DikaPay.

   Halaman TIPE A tanpa subkategori (pola sama dengan Pulsa): nomor HP ->
   operator terdeteksi -> daftar paket perpanjangan masa aktif kartu.
   Seluruh rangkaiannya (fetch, pemetaan brand, sub-brand, status, gangguan)
   ada di kategori-live.js — file ini hanya menyebut kategori & teksnya.

   String kategori di price-list: "Masa Aktif" — SUDAH DIVERIFIKASI cocok
   dengan ekspektasi kategori-map.js (slug `masa-aktif`).

   TANPA filter rentang nominal: katalognya kecil (27 produk, paling banyak 9
   per operator), jauh di bawah ambang 20 yang dipakai di Pulsa — chip harga
   di situ cuma menambah baris yang tidak menyaring apa pun.

   Catatan data (per sync): Digiflazz TIDAK punya produk Masa Aktif untuk
   Smartfren maupun by.U. Nomor Smartfren karena itu akan menampilkan kartu
   "belum ada produk" — itu kenyataan katalog, bukan kesalahan halaman.
   =========================================================================== */

(function () {
  "use strict";

  if (!window.DikaKategoriLive) {
    console.error("masa-aktif: kategori-live.js belum di-link.");
    return;
  }

  window.DikaMasaAktif = window.DikaKategoriLive.pasang({
    slug: "masa-aktif",
    kategori: "Masa Aktif",
    sectionTitle: "Pilih Masa Aktif",
    detailLabel: "Masa Aktif",
    payTitle: "Pembayaran",
    labelKosong: function (namaOperator) {
      return "Belum ada paket masa aktif " + namaOperator + " yang tersedia saat ini.";
    },
    payLine: function (item, op, phone) {
      return window.DikaProduk.namaLengkap(item) + " " + op.name +
        " untuk " + phone + " belum bisa diproses karena metode pembayaran masih " +
        "dalam pengerjaan. Terima kasih sudah menunggu!";
    },
  });
})();
