/* ===========================================================================
   DikaPay — sms-telpon.js
   Kategori "Paket SMS & Telpon" — DATA ASLI dari backend DikaPay.

   Halaman TIPE A BERTAB: nomor HP -> operator -> (sub-brand) -> tab dari
   field `tipe` RESMI Digiflazz. Rangkaiannya di kategori-live.js; di sini
   hanya nama kategori dan teks halaman.

   String kategori di price-list: "Paket SMS & Telpon" — SUDAH DIVERIFIKASI
   ulang terhadap respons asli (282 produk).

   ============ SUBKATEGORI: DARI `tipe` RESMI, BUKAN TEBAKAN NAMA =========
   `definisi()` lama (satu susunan kata kunci untuk semua operator) SUDAH
   DIHAPUS, berikut seluruh jebakannya. Yang paling berbahaya: keranjang
   umum lama tidak boleh memuat kata "telepon"/"nelpon", karena keduanya
   (7 & 6 huruf) akan MENGALAHKAN "sesama" (6) pada nama seperti
   "Telepon 100 All + 30 Sesama" dan menyedot puluhan produk nelpon-sesama
   ke keranjang umum. Jebakan sepanjang itu memang ciri pencocokan kata;
   dengan `tipe` resmi ia hilang sama sekali — produk itu bertipe
   "Sesama Operator", titik.

   29 nilai `tipe`, semuanya terpetakan (0 sisa, 0 produk bertipe kosong).

   ============ 3 PRODUK YANG DULU MENGGANTUNG: SUDAH TERJAWAB =============
   "Telkomsel Telepon 50.000 / 80.000 / 130.000" dulu tidak punya satu pun
   kata pembeda, jadi ditandai untuk dinamai manual. Field `tipe` resminya
   ternyata **"Umum"** — Digiflazz sendiri menaruhnya di keranjang umum.
   Jadi tidak perlu subkategori baru: ketiganya tampil di tab
   "Paket Reguler" bersama produk bertipe "Umum" lainnya.

   ==================== SUB-BRAND by.U DI KATEGORI INI =====================
   by.U punya 5 produk, bertipe "Semua Operator" (4) & "Sesama Operator"
   (1) — TIDAK punya famili sendiri seperti di Paket Data (Kaget/Jajan).
   Pemilih jenis kartu tetap dipasang: produk by.U tidak berlaku di kartu
   Telkomsel biasa, berapa pun jumlahnya.

   TANPA filter rentang nominal: tab terbesar (Zona Regional Telkomsel, 72
   produk) memang di atas ambang, tapi kategori ini tidak pernah dipakai
   dengan chip harga dan menambahkannya berarti dua baris kontrol — sama
   seperti keputusan di Paket Data.
   =========================================================================== */

(function () {
  "use strict";

  if (!window.DikaKategoriLive) {
    console.error("sms-telpon: kategori-live.js belum di-link.");
    return;
  }

  window.DikaSmsTelpon = window.DikaKategoriLive.pasang({
    slug: "sms-telpon",
    kategori: "Paket SMS & Telpon",
    sectionTitle: "Pilih Paket",
    detailLabel: "Paket",
    payTitle: "Pembayaran",

    /* Tab dari field `tipe` resmi (tipe-map.js). */
    tipe: true,
    /* Keranjang tipe "Umum" resmi — di sini isinya paket nelpon/SMS yang
       tidak masuk merek mana pun, termasuk 3 "Telkomsel Telepon <nominal>"
       di atas. "Kuota Reguler" (default bersama) salah konteks: yang
       dijual menit & SMS, bukan kuota data. */
    labelUmum: "Paket Reguler",
    /* TANPA penggabungan famili kecil (min 0). Penting di sini: by.U cuma
       punya 2 famili dan salah satunya berisi 1 produk — meleburnya akan
       menampilkan produk "Sesama Operator" di bawah label "Paket Reguler",
       yang justru menyesatkan. */
    minFamili: 0,

    labelKosong: function (namaOperator) {
      return "Belum ada paket SMS & telpon " + namaOperator + " yang tersedia saat ini.";
    },
    payLine: function (item, op, phone) {
      return window.DikaProduk.namaLengkap(item) + " " + op.name +
        " untuk " + phone + " belum bisa diproses karena metode pembayaran masih " +
        "dalam pengerjaan. Terima kasih sudah menunggu!";
    },
  });
})();
