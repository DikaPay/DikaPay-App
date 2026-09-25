/* ===========================================================================
   DikaPay — perdana.js
   Kategori "Aktivasi Perdana" — DATA ASLI dari backend DikaPay.

   Halaman TIPE A BERTAB: nomor HP -> operator -> (sub-brand) -> tab dari
   field `tipe` RESMI Digiflazz. Rangkaiannya di kategori-live.js; di sini
   hanya nama kategori dan teks halaman.

   String kategori di price-list: "Aktivasi Perdana" — SUDAH DIVERIFIKASI
   ulang terhadap respons asli (135 produk).

   ============ SUBKATEGORI: DARI `tipe` RESMI, BUKAN TEBAKAN NAMA =========
   `SUBDEF` lama (tabel `cocok:[...]` per operator, disusun dengan membaca
   135 nama produk) SUDAH DIHAPUS. Pengelompokan sekarang memakai field
   `tipe` resmi lewat tipe-map.js — kosakata TERTUTUP 29 nilai, semuanya
   sudah terpetakan (0 sisa, 0 produk bertipe kosong).

   ==================== TEMUAN PENTING: NILAI "SP..." ======================
   Sebagian besar `tipe` di kategori ini BUKAN nama famili paket, melainkan
   TINGKAT HARGA KARTU PERDANA-nya: SP3K, SP5K SP7K, SP7K, SP9K SP10K,
   SP10K ("SP" = starter pack). Nilainya ikut tercetak di nama produknya:

       "Aktivasi Perdana Axis 3 GB 60 Hari (SP5K SP7K)"

   Kelimanya SENGAJA TIDAK digabung jadi satu tab "Starter Pack" — justru
   MEMBEDAKANNYA yang penting di sini. Member harus memilih aktivasi yang
   cocok dengan kartu fisik yang dia pegang; salah tingkat = aktivasinya
   gagal. Ini kebalikan dari kasus "Paket Aplikasi" di Paket Data, di mana
   33 tipe memang benar-benar sekeluarga dan layak jadi satu tab.

   ==================== SUB-BRAND by.U DI KATEGORI INI =====================
   by.U cuma punya 1 produk di sini, dan `tipe`-nya "Umum" — jadi TIDAK
   punya famili sendiri seperti di Paket Data (Kaget/Jajan/Mbps). Pemilih
   jenis kartu tetap dipasang: 1 produk pun tetap tidak berlaku di kartu
   Telkomsel biasa, dan risikonya tidak mengecil karena jumlahnya sedikit.

   TANPA filter rentang nominal: katalog terbesar per operator cuma 39
   produk (Tri), jauh di bawah ambang 20-per-tab yang bikin chip berguna.
   =========================================================================== */

(function () {
  "use strict";

  if (!window.DikaKategoriLive) {
    console.error("perdana: kategori-live.js belum di-link.");
    return;
  }

  window.DikaPerdana = window.DikaKategoriLive.pasang({
    slug: "perdana",
    kategori: "Aktivasi Perdana",
    sectionTitle: "Pilih Paket Perdana",
    detailLabel: "Paket Perdana",
    payTitle: "Pembayaran",

    /* Tab dari field `tipe` resmi (tipe-map.js). */
    tipe: true,
    /* Keranjang tipe "Umum" resmi. "Kuota Reguler" (default bersama)
       janggal di halaman perdana — yang dijual kartu, bukan kuota. */
    labelUmum: "Perdana Umum",
    /* TANPA penggabungan famili kecil (min 0): katalognya memang kecil,
       dan di sini famili beranggota 1 tetap bermakna — mis. Indosat
       "Freedom Internet" (1 produk) lebih jelas berdiri sendiri daripada
       dilebur ke keranjang umum yang tidak menyebut apa-apa. */
    minFamili: 0,

    labelKosong: function (namaOperator) {
      return "Belum ada paket perdana " + namaOperator + " yang tersedia saat ini.";
    },
    payLine: function (item, op, phone) {
      return window.DikaProduk.namaLengkap(item) + " " + op.name +
        " untuk " + phone + " belum bisa diproses karena metode pembayaran masih " +
        "dalam pengerjaan. Terima kasih sudah menunggu!";
    },
  });
})();
