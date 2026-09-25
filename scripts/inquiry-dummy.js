/* ===========================================================================
   DikaPay — inquiry-dummy.js
   CEK TAGIHAN pascabayar — DATA MASIH DUMMY, alurnya yang disiapkan.

     window.DikaInquiry = {
       cek(slug, id, adminFee)   // -> Promise<{ nama, id, periode, nominal,
                                 //              admin, total, refId }>
       DUMMY                     // true — penanda jujur bahwa ini belum nyata
     }

   ========================== APA YANG SEDANG DISIAPKAN =======================
   Di dunia nyata, tagihan pascabayar TIDAK diketik member. Alurnya:

       isi nomor pelanggan  ->  CEK TAGIHAN (inquiry ke penyedia)
       ->  lihat nama pelanggan + periode + nominal  ->  baru bayar

   Modul ini menyediakan langkah tengahnya dengan data karangan supaya
   tampilan & urutannya sudah persis seperti nanti. YANG DIGANTI saat
   integrasi hanyalah isi `cek()` — pemanggilnya (manual-page.js) bekerja di
   atas bentuk hasil yang sama, jadi tidak ada UI yang perlu ditulis ulang.

   TODO fase 2/3 — perhatikan bahwa Digiflazz punya DUA jenis inquiry:
     - `inquiry-pln`  : PRABAYAR, cek NAMA pelanggan dari nomor meter
                        (token listrik tidak punya tagihan). BUKAN modul ini.
     - `inq-pasca`    : PASCABAYAR, cek NOMINAL TAGIHAN + nama pelanggan.
                        Inilah yang menggantikan `cek()` di bawah.
   Tidak semua biller pascabayar mendukung inquiry (sebagian PDAM/PBB/
   multifinance tidak), dan kategori bernominal tetap seperti by.U tidak
   membutuhkannya sama sekali — jadi jalur "inquiry gagal / tidak didukung"
   WAJIB ditangani saat integrasi, jangan diasumsikan selalu berhasil.
   Lihat CLAUDE.md bagian "Kesiapan Integrasi Digiflazz".
   ==========================================================================

   NILAI YANG DIHASILKAN DETERMINISTIK terhadap (slug + nomor pelanggan):
   nomor yang sama SELALU memberi nama & nominal yang sama. Ini disengaja —
   angka acak yang berubah tiap kali tombol ditekan langsung terasa palsu,
   dan bikin sulit menguji alurnya.
   =========================================================================== */

(function () {
  "use strict";

  var RM = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Rentang nominal tagihan yang masuk akal per kategori. Bukan angka
     ajaib: dipakai supaya tagihan PBB tidak tampil Rp42.000 dan iuran BPJS
     tidak tampil Rp2 juta — hal kecil yang langsung membuat layar terasa
     tidak sungguhan saat dipakai untuk menguji tampilan. */
  var RENTANG = {
    "pln-bill":       [150000, 900000],
    "pdam":           [45000, 350000],
    "bpjs":           [42000, 210000],
    "bpjs-tk":        [50000, 300000],
    "pbb":            [120000, 1800000],
    "gas":            [60000, 450000],
    "multifinance":   [600000, 3500000],
    "internet-pasca": [250000, 850000],
    "tv-pasca":       [150000, 500000],
    "hp-pasca":       [60000, 650000],
    "tsel-omni":      [75000, 500000],
    "isat-only4u":    [60000, 400000],
    "tri-cuanmax":    [50000, 350000],
    "xl-cuanku":      [60000, 400000],
    "byu":            [50000, 200000],
    "emoney-pasca":   [100000, 1000000],
  };

  /* PBB ditagih per TAHUN, bukan per bulan — periodenya ikut berbeda. */
  var PERIODE_TAHUNAN = { pbb: true };

  var NAMA_DEPAN = ["Budi", "Siti", "Agus", "Dewi", "Rizky", "Putri", "Andi",
    "Nurul", "Hendra", "Fitri", "Bagus", "Ratna", "Yusuf", "Lia", "Dimas", "Sari"];
  var NAMA_BELAKANG = ["Santoso", "Rahayu", "Prasetyo", "Wijaya", "Kusuma",
    "Hidayat", "Lestari", "Nugroho", "Maulana", "Anggraini", "Saputra", "Handayani"];
  var BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

  /* Hash sederhana & stabil (djb2). Bukan untuk keamanan — hanya supaya
     nomor pelanggan yang sama selalu menghasilkan tagihan yang sama. */
  function hash(teks) {
    var h = 5381;
    var s = String(teks || "");
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return h;
  }

  function namaDari(seed) {
    return NAMA_DEPAN[seed % NAMA_DEPAN.length] + " " +
      NAMA_BELAKANG[Math.floor(seed / 7) % NAMA_BELAKANG.length];
  }

  function periodeDari(slug) {
    var d = new Date();
    if (PERIODE_TAHUNAN[slug]) return "Tahun " + d.getFullYear();
    /* Tagihan yang sedang berjalan adalah pemakaian BULAN LALU. */
    d.setMonth(d.getMonth() - 1);
    return BULAN[d.getMonth()] + " " + d.getFullYear();
  }

  function nominalDari(slug, seed) {
    var r = RENTANG[slug] || [50000, 500000];
    var span = r[1] - r[0];
    var v = r[0] + (seed % (span + 1));
    return Math.round(v / 500) * 500;      /* dibulatkan, seperti tagihan asli */
  }

  /* Bentuk hasilnya SENGAJA sama dengan yang nanti dikembalikan `inq-pasca`
     supaya manual-page.js tidak perlu diubah saat integrasi. */
  function cek(slug, id, adminFee) {
    var seed = hash(slug + "|" + id);
    var nominal = nominalDari(slug, seed);
    var admin = Number(adminFee) || 0;

    /* Jeda meniru waktu tempuh inquiry sungguhan (biasanya 1–3 detik).
       Bukan sekadar hiasan: kalau hasilnya muncul seketika, member tidak
       sempat sadar bahwa ada langkah pengecekan yang terjadi. */
    var jeda = RM ? 0 : 1100 + (seed % 900);

    return new Promise(function (resolve) {
      window.setTimeout(function () {
        resolve({
          nama: namaDari(seed),
          id: String(id),
          periode: periodeDari(slug),
          nominal: nominal,
          admin: admin,
          total: nominal + admin,
          /* ref_id ikut disertakan sejak sekarang supaya bentuk hasilnya
             lengkap. Nilai di bawah CUKUP untuk dummy TAPI TIDAK AMAN untuk
             produksi — aturan pembuatan ref_id yang benar ada di CLAUDE.md
             ("Kesiapan Integrasi Digiflazz"). */
          refId: "dummy-" + seed.toString(36) + "-" + Date.now().toString(36),
          dummy: true,
        });
      }, jeda);
    });
  }

  window.DikaInquiry = { cek: cek, DUMMY: true, RENTANG: RENTANG };
})();
