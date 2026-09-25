/* ===========================================================================
   DikaPay — margin-calc.js
   KALKULATOR MARGIN PRIBADI MEMBER — hanya untuk TAMPILAN.

     window.DikaMargin = {
       KEY                // "dikapay:margin" — SATU-SATUNYA kunci setelan
       MAKS_RP            // batas: Rp6.000 flat per produk
       baca()             // -> { rp, cats }
       simpan(rp, cats)   // -> bool   SATU-SATUNYA penulis setelan
       aktifUntuk(slug)   // apakah kategori ini ikut margin?
       terapkan(modal, rp)-> { modal, marginRp, jual, dibatasi, diminta }
       hitung(modal, slug)-> { ... } | null
       kategori()         // daftar kategori yang boleh diatur marginnya
       aktif()            // sakelar utama "Aktifkan Margin", default true
       setAktif(v)        // ubah sakelar utama — LOKAL, tidak pernah ke server
     }

   ====================== SATU MODE SAJA: NOMINAL TETAP ======================
   KEPUTUSAN PRODUK (final): margin di app ini HANYA punya satu cara kerja —
   TAMBAHAN RUPIAH FLAT yang sama persis untuk semua produk dalam cakupan.

       harga jual = harga_modal + rp

   Mode PERSENTASE sudah DIHAPUS TOTAL dari kode (bukan disembunyikan).
   Jangan menghidupkannya lagi tanpa keputusan produk baru — dua mode yang
   hidup berdampingan persis yang dulu menghasilkan dua sumber data yang
   bisa tidak sinkron.

   BATASNYA JUGA BERUBAH BENTUK: dulu 60% DARI HARGA MODAL (jadi tiap
   produk punya batas rupiah yang berbeda-beda, dan produk murah otomatis
   dipotong). Sekarang Rp6.000 FLAT, sama untuk semua produk berapa pun
   modalnya — jadi batas itu bisa ditegakkan LANGSUNG DI INPUT, dan tidak
   ada lagi produk yang diam-diam menerima margin lebih kecil dari yang
   disetel member.

   `terapkan()` tetap dipertahankan (bukan dihapus) sebagai SATU tempat
   perhitungan: halaman Margin memakainya untuk simulasi setelan yang BELUM
   disimpan, kartu produk memakainya lewat hitung(). Field `dibatasi` masih
   ada dan kini berarti "nominal yang diminta di atas Rp6.000".

   ============================ ATURAN PALING PENTING ============================
   MARGIN TIDAK PERNAH MENGUBAH JUMLAH YANG DIBAYAR MEMBER.

   Transaksi ke DikaPay/Digiflazz SELALU memakai `harga_modal` apa adanya.
   Modul ini murni KALKULATOR TAMPILAN: memberi tahu member berapa idealnya
   dia menjual ke pelanggannya sendiri DI LUAR sistem.

   Karena itu modul ini TIDAK BOLEH dipanggil dari:
     - payment-flow.js       (alur bayar & pemotongan saldo)
     - createModal()         (modal konfirmasi pembelian)
     - perhitungan apa pun yang menghasilkan angka yang dibayar
   Kalau suatu saat angka di layar konfirmasi ikut berubah karena margin,
   itu BUG — bukan fitur.
   ==============================================================================

   Transfer antar member SENGAJA TIDAK PUNYA MARGIN: itu bukan produk
   jual-beli dan tidak punya harga modal. Slug "transfer" memang tidak ada
   di kategori-map.js, jadi ia otomatis tidak pernah masuk daftar di sini.

   TODO fase 2: `dikapay:margin` pindah ke profil member di backend supaya
   ikut lintas-perangkat. Bentuk hasil hitung() dipertahankan.
   =========================================================================== */

(function () {
  "use strict";

  var KEY = "dikapay:margin";

  /* ---- Sakelar utama "Aktifkan Margin" (dikapay:margin:aktif) ----------
     LOKAL SAJA di HP ini (bukan ke server — margin memang kalkulator
     lokal murni sesuai desain di atas), default AKTIF ("1") supaya
     perilaku lama (sebelum toggle ini ada) tidak berubah untuk siapa pun.
     Dicek DI DALAM aktifUntuk() (satu-satunya gerbang yang dipakai
     hitung()), jadi SEMUA tempat yang menampilkan harga+margin — kartu
     produk (createGrid di produk-ui.js) maupun halaman Margin sendiri —
     otomatis ikut menghormati toggle ini tanpa perlu disentuh satu per
     satu. Kalau OFF: aktifUntuk() selalu false, hitung() selalu null,
     jadi halaman produk menampilkan harga_modal apa adanya. */
  var AKTIF_KEY = "dikapay:margin:aktif";

  function aktif() {
    try {
      return localStorage.getItem(AKTIF_KEY) !== "0";
    } catch (e) {
      console.error("margin-calc: gagal membaca status Aktifkan Margin:", e);
      return true;
    }
  }

  function setAktif(v) {
    try {
      localStorage.setItem(AKTIF_KEY, v ? "1" : "0");
      return true;
    } catch (e) {
      console.error("margin-calc: gagal menyimpan status Aktifkan Margin:", e);
      return false;
    }
  }

  /* Batas margin: Rp6.000 FLAT per produk, berapa pun harga modalnya. */
  var MAKS_RP = 6000;
  var BAWAAN_RP = 1000;

  function angka(n, fallback) {
    var v = Number(n);
    return isFinite(v) && v >= 0 ? v : fallback;
  }

  /* Nominal SELALU dijepit ke 0..MAKS_RP di sini — baik saat dibaca maupun
     saat disimpan. Jadi nilai di luar batas mustahil bertahan, entah
     datangnya dari input, dari localStorage yang disunting manual, atau
     dari data versi lama. */
  function jepit(rp) {
    var v = angka(rp, 0);
    return Math.max(0, Math.min(MAKS_RP, Math.round(v)));
  }

  /* ---- MIGRASI dari versi dua-mode --------------------------------------
     Data lama berbentuk { mode:"pct"|"rp", pct, rp, cats }.

     Kalau mode tersimpannya "pct", nilai `rp`-nya TIDAK bisa dipercaya —
     itu cuma sisa dari mode yang tidak sedang dipakai (sering masih
     bawaan 1000 yang tidak pernah disetel sadar oleh member). Yang benar
     adalah MENERJEMAHKAN persentase yang memang sedang berlaku menjadi
     rupiah, memakai contoh modal Rp10.000 yang selama ini dipakai kartu
     simulasi halaman Margin — jadi angka yang dilihat member di simulasi
     sebelum & sesudah pembaruan tetap sama persis (10% -> Rp1.000).

     Hasilnya tetap dijepit ke MAKS_RP, jadi setelan lama 60% (= Rp6.000)
     pun mendarat tepat di batas baru, bukan di atasnya. */
  function migrasi(v) {
    if (v.mode === "pct") {
      var pct = angka(v.pct, 10);
      return jepit((10000 * pct) / 100);
    }
    return jepit(v.rp);
  }

  function baca() {
    var bawaan = { rp: BAWAAN_RP, cats: null };
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return bawaan;
      var v = JSON.parse(raw);
      if (!v || typeof v !== "object") return bawaan;
      return {
        rp: migrasi(v),
        cats: Array.isArray(v.cats) ? v.cats : (v.cats === "all" ? "all" : null),
      };
    } catch (e) {
      console.error("margin-calc: gagal membaca margin:", e);
      return bawaan;
    }
  }

  /* SATU-SATUNYA penulis setelan margin. Halaman Margin WAJIB lewat sini,
     tidak menulis localStorage sendiri — supaya bentuk yang ditulis selalu
     sama persis dengan yang dibaca baca(), dan penjepitan batas tidak bisa
     terlewat di salah satu jalur. */
  function simpan(rp, cats) {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        rp: jepit(rp),
        cats: cats === "all" ? "all" : (Array.isArray(cats) ? cats : null),
        savedAt: Date.now(),
      }));
      return true;
    } catch (e) {
      console.error("margin-calc: gagal menyimpan margin:", e);
      return false;
    }
  }

  /* Kategori yang boleh diatur marginnya = 12 slug PRABAYAR di
     kategori-map.js. Daftarnya diambil dari sana supaya tidak ada daftar
     kedua yang bisa basi.

     16 kategori PASCABAYAR sengaja tidak ikut (lihat `bolehMargin` di
     kategori-map.js). Jangan menyaringnya di sini atau di margin.js —
     aturannya hidup di satu tempat saja. */
  function kategori() {
    try {
      var K = window.DikaKategoriMap;
      if (!K || typeof K.kategoriMargin !== "function") {
        console.warn("margin-calc: kategori-map.js belum dimuat / versi lama.");
        return [];
      }
      return K.kategoriMargin();
    } catch (e) {
      console.error("margin-calc: gagal membaca daftar kategori:", e);
      return [];
    }
  }

  /* Gerbang yang sama dipakai saat margin DIPAKAI, bukan cuma saat
     ditampilkan di halaman pengaturan. Tanpa ini, pilihan lama yang
     terlanjur tersimpan di `dikapay:margin` (dari versi yang masih
     memasukkan pascabayar) akan tetap berlaku diam-diam. */
  function slugBermargin(slug) {
    try {
      var K = window.DikaKategoriMap;
      if (!K || typeof K.bolehMargin !== "function") return false;
      return K.bolehMargin(slug);
    } catch (e) {
      console.error("margin-calc: gagal memeriksa kategori:", e);
      return false;
    }
  }

  /* Kategori ikut margin kalau member memilih "Semua Produk" ("all")
     atau slug-nya ada di daftar pilihan. Belum pernah menyimpan =
     dianggap berlaku untuk semua (perilaku default halaman Margin). */
  function aktifUntuk(slug) {
    if (!slug) return false;
    if (!aktif()) return false;                  /* sakelar utama OFF: tidak pernah */
    if (!slugBermargin(slug)) return false;      /* pascabayar: tidak pernah */
    var m = baca();
    if (m.cats === "all" || m.cats == null) return true;
    return m.cats.indexOf(slug) !== -1;
  }

  /* PUSAT PERHITUNGAN — fungsi MURNI, tidak menyentuh localStorage dan
     tidak peduli kategori. Dipisah dari hitung() supaya halaman Margin
     bisa memakai rumus & batas yang PERSIS SAMA untuk mensimulasikan
     setelan yang BELUM disimpan.

     Beda penting dari versi lama: batasnya tidak lagi bergantung pada
     harga modal, jadi SEMUA produk menerima nominal yang sama persis.
     `dibatasi` sekarang cuma berarti "yang diminta melebihi Rp6.000" dan
     hasilnya sama untuk semua produk — bukan lagi sesuatu yang membuat
     produk murah menerima lebih sedikit dari produk mahal. */
  function terapkan(modal, rp) {
    var dasar = Number(modal);
    if (!isFinite(dasar) || dasar <= 0) return null;

    var diminta = angka(rp, 0);
    var marginRp = jepit(diminta);
    var bulat = Math.round(dasar);

    return {
      modal: bulat,
      marginRp: marginRp,
      jual: bulat + marginRp,
      dibatasi: diminta > MAKS_RP,
      diminta: Math.round(diminta),
    };
  }

  function hitung(modal, slug) {
    var dasar = Number(modal);
    if (!isFinite(dasar) || dasar <= 0) return null;
    /* Slug WAJIB. Tanpa slug kita tidak tahu ini kategori bermargin atau
       bukan, dan menebak "boleh" akan menghidupkan lagi margin di halaman
       pascabayar lewat pintu belakang. */
    if (!aktifUntuk(slug)) return null;

    return terapkan(dasar, baca().rp);
  }

  window.DikaMargin = {
    KEY: KEY,
    MAKS_RP: MAKS_RP,
    baca: baca,
    simpan: simpan,
    kategori: kategori,
    aktifUntuk: aktifUntuk,
    terapkan: terapkan,
    hitung: hitung,
    aktif: aktif,
    setAktif: setAktif,
  };
})();
