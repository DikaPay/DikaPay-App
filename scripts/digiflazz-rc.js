/* ===========================================================================
   DikaPay — digiflazz-rc.js
   PEMETAAN KODE ALASAN (rc) DIGIFLAZZ -> pesan yang ramah untuk member.

     window.DikaRC = {
       pesan(rc, fallback)   // -> string siap tampil
       status(rc)            // -> "berhasil" | "gagal" | "pending" | null
       entri(rc)             // -> { status, judul?, pesan, aksi? } | null
       daftar()              // -> semua kode yang sudah dipetakan
     }

   KENAPA FILE TERPISAH: memisahkan KONTEN PESAN dari LOGIKA ALUR. Saat API
   Digiflazz asli tersambung, yang berubah HANYA tabel di file ini — alur di
   payment-flow.js tidak perlu disentuh sama sekali. Sebaliknya, kalau nanti
   copywriting diperbaiki, tidak ada risiko ikut mengubah logika transaksi.

   ============================ STATUS SEKARANG ============================
   ISI TABEL DI BAWAH MASIH DUMMY / TEBAKAN. Repo ini BELUM PERNAH menyentuh
   API Digiflazz, jadi kode-kode di bawah adalah PLACEHOLDER berdasarkan pola
   umum, BUKAN daftar resmi.

   TODO fase 2/3 (integrasi Digiflazz):
     1. Ganti seluruh isi `RC` dengan daftar RESMI dari dokumentasi
        "Alasan Gagal" / response code Digiflazz. Cocokkan satu per satu —
        JANGAN menganggap kode di bawah sudah benar.
     2. Kode yang datang tapi belum ada di tabel TIDAK BOLEH dibuang diam-diam:
        `pesan()` mengembalikan pesan umum DAN mencatat console.warn supaya
        kode baru ketahuan dan bisa ditambahkan (pola yang sama seperti slug
        "lainnya" di kategori-map.js).
     3. Nada pesan mengikuti gaya DikaPay: menenangkan, tidak menyalahkan
        member, dan menjawab lebih dulu ketakutan utama ("saldo saya
        terpotong tidak?"). Jangan menyalin kalimat teknis Digiflazz apa
        adanya — itu ditulis untuk mesin/mitra, bukan untuk member.
   =========================================================================== */

(function () {
  "use strict";

  /* Bentuk entri:
       status : "berhasil" | "gagal" | "pending"
       pesan  : kalimat untuk member (WAJIB)
       judul  : opsional, menimpa judul bawaan layar hasil
       aksi   : opsional, saran tindakan -> "ulang" | "periksa-nomor" | "tunggu"
                dipakai layar hasil untuk memilih tombol yang paling masuk akal */

  var RC = {
    /* ---- BERHASIL ---- */
    "00": {
      status: "berhasil",
      pesan: "Transaksimu sudah diproses. Detailnya bisa kamu lihat kapan saja di Riwayat Transaksi.",
    },

    /* ---- PENDING ---- */
    "03": {
      status: "pending",
      pesan: "Pesananmu sedang diproses penyedia dan kali ini butuh waktu sedikit lebih lama " +
        "dari biasanya. Tidak perlu mengulang pembayaran, ya — statusnya akan otomatis " +
        "diperbarui begitu selesai.",
      aksi: "tunggu",
    },

    /* ---- GAGAL: kesalahan data tujuan ----
       Kelompok ini yang PALING sering terjadi dan paling bisa ditindaklanjuti
       member sendiri, jadi pesannya menunjuk hal spesifik yang perlu dicek. */
    "01": {
      status: "gagal",
      judul: "Nomor tujuan belum cocok",
      pesan: "Nomor tujuan sepertinya belum tepat, jadi transaksinya tidak kami lanjutkan. " +
        "Saldomu aman, tidak terpotong. Coba periksa lagi nomornya, ya.",
      aksi: "periksa-nomor",
    },
    "02": {
      status: "gagal",
      judul: "Nomor tujuan belum cocok",
      pesan: "Nomor tujuan tidak dikenali oleh penyedia layanan. Saldomu tidak terpotong — " +
        "silakan periksa kembali nomornya sebelum mencoba lagi.",
      aksi: "periksa-nomor",
    },

    /* ---- GAGAL: masalah di sisi penyedia ----
       Bukan salah member sama sekali, jadi nadanya menenangkan dan
       mengarahkan untuk mencoba lagi. */
    "40": {
      status: "gagal",
      pesan: "Penyedia layanan sedang sibuk, jadi pesananmu belum bisa diselesaikan. " +
        "Tenang, saldomu tidak terpotong — kalau pun sempat terpotong, dana akan " +
        "kembali otomatis paling lama 1x24 jam. Kamu bisa mencobanya lagi sekarang.",
      aksi: "ulang",
    },
    "41": {
      status: "gagal",
      judul: "Produk sedang gangguan",
      pesan: "Produk ini untuk sementara belum bisa diproses dari sisi penyedia. " +
        "Biasanya tidak lama — kamu bisa memilih nominal lain dulu, atau kembali " +
        "lagi sebentar lagi.",
      aksi: "ulang",
    },
    "42": {
      status: "gagal",
      judul: "Stok sedang habis",
      pesan: "Stok produk ini sedang kosong di sisi penyedia. Saldomu tidak terpotong, " +
        "jadi kamu bisa langsung memilih nominal lain, ya.",
      aksi: "ulang",
    },

    /* ---- GAGAL: khusus INQUIRY (cek nama / cek tagihan) ----
       Dipakai oleh alur cek nama PLN Prabayar & cek tagihan pascabayar.
       Nomor tagihan/token TIDAK dibeli di titik ini, jadi tidak ada
       urusan "saldo terpotong" — pesannya cukup mengarahkan. */
    "45": {
      status: "gagal",
      judul: "Cek belum bisa dilakukan",
      pesan: "Layanan pengecekan sedang tidak tersedia sementara. Coba lagi beberapa saat " +
        "lagi, ya. Kalau kamu yakin nomornya benar, kamu tetap bisa melanjutkan.",
      aksi: "tunggu",
    },
    "05": {
      status: "gagal",
      judul: "Nomor tidak ditemukan",
      pesan: "Nomor yang kamu masukkan tidak ditemukan di sistem penyedia. Coba periksa " +
        "lagi angkanya, ya.",
      aksi: "periksa-nomor",
    },
    "54": {
      status: "gagal",
      judul: "Nomor pelanggan belum cocok",
      pesan: "Nomor pelanggan yang kamu masukkan sepertinya belum tepat, jadi tagihannya " +
        "tidak ditemukan. Coba periksa kembali angkanya, ya.",
      aksi: "periksa-nomor",
    },
  };

  /* Dipakai kalau kodenya belum ada di tabel. SENGAJA menenangkan dan
     tidak menyebut kode teknis apa pun ke member. */
  var UMUM = {
    status: "gagal",
    pesan: "Transaksimu belum bisa diselesaikan kali ini. Saldomu tidak terpotong — " +
      "kalau pun sempat terpotong, dana akan kembali otomatis paling lama 1x24 jam. " +
      "Silakan coba lagi sebentar lagi, ya.",
    aksi: "ulang",
  };

  /* Normalisasi: Digiflazz mengirim rc sebagai string ber-nol di depan
     ("01"), tapi sebagian klien/log memperlakukannya sebagai angka (1).
     Terima keduanya supaya tidak ada kode yang meleset gara-gara format. */
  function normalisasi(rc) {
    if (rc === null || rc === undefined || rc === "") return null;
    var s = String(rc).trim();
    if (/^\d$/.test(s)) s = "0" + s;      /* "1" -> "01" */
    return s;
  }

  function entri(rc) {
    var k = normalisasi(rc);
    if (!k) return null;
    if (Object.prototype.hasOwnProperty.call(RC, k)) return RC[k];
    /* JANGAN dibuang diam-diam — kode baru harus ketahuan supaya bisa
       ditambahkan ke tabel. */
    console.warn("digiflazz-rc: kode alasan belum dipetakan:", k,
      "- memakai pesan umum. Tambahkan ke RC di digiflazz-rc.js.");
    return null;
  }

  function status(rc) {
    var e = entri(rc);
    return e ? e.status : null;
  }

  function pesan(rc, fallback) {
    var e = entri(rc);
    if (e && e.pesan) return e.pesan;
    return fallback || UMUM.pesan;
  }

  function daftar() {
    return Object.keys(RC).slice();
  }

  window.DikaRC = {
    RC: RC,
    UMUM: UMUM,
    entri: entri,
    status: status,
    pesan: pesan,
    daftar: daftar,
  };
})();
