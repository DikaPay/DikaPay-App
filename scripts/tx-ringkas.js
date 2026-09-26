/* ===========================================================================
   DikaPay — tx-ringkas.js
   SATU tempat menghitung ringkasan transaksi per bulan.

     window.DikaTxRingkas = {
       kunciBulan(dt)        // "2026-09-13T10:15" -> 202608 (tahun*100 + bulan 0-based)
       kunciSekarang()       // kunci bulan berjalan
       labelBulan(kunci)     // 202608 -> "September 2026"
       ringkas(TX, kunci)    // ringkasan SATU bulan
       perBulan(TX)          // [ringkasan, ...] semua bulan, urut bulan menaik
        perHari(TX, kunci)    // nilai masuk/keluar per tanggal dalam satu bulan
        perKategori(TX, kunci) // nilai masuk/keluar per kategori dalam satu bulan
     }

   Bentuk ringkasan:
     { kunci, keluar, masuk, bersih, pengeluaranBersih, jumlah, kategori }
       keluar            jumlah UANG KELUAR (nilai positif)
       masuk             jumlah UANG MASUK  (nilai positif)
       bersih            masuk - keluar  -> BERTANDA; negatif = saldo berkurang
       pengeluaranBersih max(0, keluar - masuk) -> besaran "habis berapa bulan ini"
       jumlah            banyaknya transaksi BERHASIL bulan itu (kedua arah)
       kategori          { <slug DATA.CATS>: jumlah BERTANDA } — untuk breakdown

   ===================== KENAPA FILE INI ADA ================================
   Dulu perhitungan ini ditulis DUA KALI dengan definisi yang BERBEDA:

     riwayat.js  (kartu "Bulan Ini")  -> jumlah BERTANDA semua transaksi
     statistik.js(computeMonthly)     -> HANYA `amount < 0`, dijumlah Math.abs

   Akibatnya satu periode yang sama bisa menampilkan dua angka berbeda:
   September 2026 (Transfer Keluar -15.000, Transfer Masuk +5.000, Transfer
   Masuk +5.000, Transfer Keluar -5.000) terbaca -Rp10.000 di Riwayat tapi
   -Rp20.000 di Statistik, karena Statistik membuang kedua transfer masuk.
   Memperbaiki satu file saja akan mengulang masalah yang sama nanti — jadi
   definisinya dipindah ke sini dan KEDUA halaman memanggil fungsi yang sama.
   JANGAN menambah perhitungan bulanan baru di luar file ini.

   Transaksi yang dihitung HANYA yang berstatus "ok": pending & gagal belum
   (atau tidak jadi) memindahkan uang, jadi memasukkannya akan membuat
   ringkasan tidak cocok dengan saldo.
   =========================================================================== */

(function () {
  "use strict";

  var BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli",
    "Agustus", "September", "Oktober", "November", "Desember"];

  /* Bentuk `dt` dibakukan data.js: "YYYY-MM-DDTHH:mm" (lihat
     normalisasiTanggal di sana). Nilai yang tidak berbentuk itu dikembalikan
     NaN supaya baris rusak dilewati, bukan diam-diam masuk bulan yang salah. */
  function kunciBulan(dt) {
    var m = /^(\d{4})-(\d{2})/.exec(String(dt == null ? "" : dt));
    if (!m) return NaN;
    return Number(m[1]) * 100 + (Number(m[2]) - 1);
  }

  function kunciSekarang() {
    var now = new Date();
    return now.getFullYear() * 100 + now.getMonth();
  }

  function labelBulan(kunci) {
    var y = Math.floor(kunci / 100);
    var mo = kunci % 100;
    return (BULAN[mo] || "?") + " " + y;
  }

  function kosong(kunci) {
    return {
      kunci: kunci,
      keluar: 0,
      masuk: 0,
      bersih: 0,
      pengeluaranBersih: 0,
      jumlah: 0,
      kategori: {},
    };
  }

  function tambah(r, tx) {
    var n = Number(tx.amount);
    if (!isFinite(n)) n = 0;
    if (n < 0) r.keluar += -n; else r.masuk += n;
    r.bersih += n;
    r.jumlah += 1;
    var slug = tx.cat || "lainnya";
    r.kategori[slug] = (r.kategori[slug] || 0) + n;
    return r;
  }

  function selesaikan(r) {
    /* Dihitung SETELAH semua transaksi masuk supaya pembulatannya cuma
       sekali — `bersih` tetap bertanda (dipakai kartu Riwayat), sedangkan
       `pengeluaranBersih` adalah besaran tak-bertanda yang dipakai grafik
       Statistik (bulan yang justru surplus = 0, bukan angka negatif yang
       tidak bisa digambar sebagai batang/donat). */
    r.pengeluaranBersih = Math.max(0, r.keluar - r.masuk);
    return r;
  }

  function layak(tx) {
    return !!tx && tx.status === "ok";
  }

  function ringkas(TX, kunci) {
    var r = kosong(kunci);
    if (!Array.isArray(TX)) return selesaikan(r);
    TX.forEach(function (tx) {
      if (!layak(tx) || kunciBulan(tx.dt) !== kunci) return;
      tambah(r, tx);
    });
    return selesaikan(r);
  }

  function perBulan(TX) {
    var peta = {};
    if (Array.isArray(TX)) {
      TX.forEach(function (tx) {
        if (!layak(tx)) return;
        var k = kunciBulan(tx.dt);
        if (!isFinite(k)) return;
        if (!peta[k]) peta[k] = kosong(k);
        tambah(peta[k], tx);
      });
    }
    return Object.keys(peta)
      .map(function (k) { return selesaikan(peta[k]); })
      .sort(function (a, b) { return a.kunci - b.kunci; });
  }

  function perHari(TX, kunci) {
    var tahun = Math.floor(kunci / 100);
    var bulan = kunci % 100;
    var jumlahHari = new Date(tahun, bulan + 1, 0).getDate();
    var hari = Array.from({ length: jumlahHari }, function (tidakDipakai, indeks) {
      return { tanggal: indeks + 1, masuk: 0, keluar: 0 };
    });
    if (!Array.isArray(TX)) return hari;

    TX.forEach(function (tx) {
      if (!layak(tx) || kunciBulan(tx.dt) !== kunci) return;
      var tanggal = Number(String(tx.dt).slice(8, 10));
      if (!isFinite(tanggal) || tanggal < 1 || tanggal > jumlahHari) return;
      var nominal = Number(tx.amount);
      if (!isFinite(nominal)) nominal = 0;
      if (nominal < 0) hari[tanggal - 1].keluar += -nominal;
      else hari[tanggal - 1].masuk += nominal;
    });
    return hari;
  }

  function perKategori(TX, kunci) {
    var peta = Object.create(null);
    if (Array.isArray(TX)) {
      TX.forEach(function (tx) {
        if (!layak(tx) || kunciBulan(tx.dt) !== kunci) return;
        var slug = tx.cat || "lainnya";
        if (!peta[slug]) peta[slug] = { slug: slug, masuk: 0, keluar: 0, jumlah: 0 };
        var nominal = Number(tx.amount);
        if (!isFinite(nominal)) nominal = 0;
        if (nominal < 0) peta[slug].keluar += -nominal;
        else peta[slug].masuk += nominal;
        peta[slug].jumlah += 1;
      });
    }
    return Object.keys(peta).map(function (slug) { return peta[slug]; });
  }

  window.DikaTxRingkas = {
    kunciBulan: kunciBulan,
    kunciSekarang: kunciSekarang,
    labelBulan: labelBulan,
    ringkas: ringkas,
    perBulan: perBulan,
    perHari: perHari,
    perKategori: perKategori,
  };
})();
