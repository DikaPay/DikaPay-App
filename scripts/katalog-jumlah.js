/* ===========================================================================
   DikaPay — katalog-jumlah.js
   Registry KECIL: window.DikaKatalogJumlah.hitung[slug] = jumlah produk
   SUNGGUHAN di file data kategori itu.

   Ditulis oleh MASING-MASING file data kategori (pulsa.js, paket-data.js,
   dst) tepat setelah data-nya dibangun — satu baris per file, dihitung
   dari array/objek produk yang SAMA yang dipakai controller halaman itu
   sendiri (`PRODUK`/`PACKAGES`/`PROVIDERS`), bukan angka yang diketik
   ulang manual. Kalau produknya bertambah, angkanya ikut naik dengan
   sendirinya di build berikutnya — tidak ada dua tempat yang bisa basi.

   Dibaca oleh margin.js (halaman "Atur Margin Saya") untuk menampilkan
   "X Produk" di kartu tiap kategori — pengganti label "Prabayar" yang
   dulu berulang di situ (seluruh kategori yang bisa diberi margin memang
   sudah prabayar semua, lihat `kategoriMargin()` di kategori-map.js,
   jadi labelnya tidak pernah membawa informasi apa pun).

   ===================== KENAPA REGISTRY TERPISAH ============================
   Bukan margin.js langsung me-link 12 file data kategori itu. Tiap file
   data memanggil `window.DikaProdukPage(...)` / `DikaProviderPage(...)` di
   baris terakhirnya — controller berat yang TIDAK dimuat di margin.html
   (dan memang tidak perlu; halaman ini tidak merender grid produk sama
   sekali). Memuat produk-ui.js + produk-page.js + provider-page.js +
   operator-detect.js hanya untuk membaca `.length` sebuah array akan
   menjalankan `init()` masing-masing controller, yang langsung mencari
   markup seperti `#phoneInput`/`#prodGrid` — TIDAK ADA di margin.html —
   dan gagal dengan `TypeError` di tengah jalan.

   Sebagai gantinya: file ini dimuat SEBELUM 12 file data (tanpa
   controllernya sama sekali), dan panggilan `DikaProdukPage`/
   `DikaProviderPage` di tiap file data DIJAGA (`if (window.DikaXPage)`)
   supaya aman dipanggil walau controllernya tidak ada — di halaman
   aslinya (pulsa.html dst) controllernya SELALU ada, jadi perilakunya
   di situ TIDAK BERUBAH SAMA SEKALI.
   ============================================================================

   Tiga bentuk data yang perlu dihitung, tiap helper menangani satu bentuk:
     hitungOperator(obj)       {opKey: [produk, ...]}                  (pulsa, masa-aktif)
     hitungOperatorPaket(obj)  {opKey: [{produk:[...]}...]}            (paket-data, perdana, sms-telpon)
     hitungProvider(arr)       [{produk:[...]}] ATAU [{subkategori:[{produk:[...]}]}]
                                                                        (games/voucher/voucher-act
                                                                         DAN streaming/tv/emoney)
   `listrik.js` tidak perlu helper — datanya `PRODUK` array polos, cukup
   `PRODUK.length` langsung.
   =========================================================================== */

(function () {
  "use strict";

  window.DikaKatalogJumlah = window.DikaKatalogJumlah || { hitung: {} };
  if (!window.DikaKatalogJumlah.hitung) window.DikaKatalogJumlah.hitung = {};

  function hitungOperator(obj) {
    var n = 0;
    Object.keys(obj || {}).forEach(function (k) {
      if (Array.isArray(obj[k])) n += obj[k].length;
    });
    return n;
  }

  function hitungOperatorPaket(obj) {
    var n = 0;
    Object.keys(obj || {}).forEach(function (k) {
      (obj[k] || []).forEach(function (sub) {
        if (sub && Array.isArray(sub.produk)) n += sub.produk.length;
      });
    });
    return n;
  }

  function hitungProvider(arr) {
    var n = 0;
    (arr || []).forEach(function (p) {
      if (!p) return;
      if (Array.isArray(p.produk)) n += p.produk.length;
      if (Array.isArray(p.subkategori)) {
        p.subkategori.forEach(function (s) {
          if (s && Array.isArray(s.produk)) n += s.produk.length;
        });
      }
    });
    return n;
  }

  /* CATATAN: registry ini dulu juga menyimpan HARGA MODAL TERMURAH per
     kategori (`termurah[slug]` + helper minOperator/minProvider/…). Itu
     ada semata-mata untuk peringatan batas margin versi lama, yang
     bergantung pada harga modal tiap produk (60% dari modal). Sejak batas
     margin jadi RUPIAH TETAP Rp6.000 — sama untuk semua produk — tidak ada
     lagi yang membacanya, jadi ikut dihapus daripada ditinggal sebagai
     data yang terus dihitung tapi tidak pernah dipakai. */

  /* Satu pintu pendaftaran: file data kategori cukup menyebut BENTUK
     datanya, tidak perlu tahu helper mana yang cocok. `bentuk` diisi
     eksplisit oleh pemanggil — ia memang sudah tahu bentuk datanya;
     menebaknya di sini justru rapuh karena tiga bentuk itu sama-sama
     objek/array.

       "array"          [produk, ...]                    listrik, gas-prabayar
       "operator"       {opKey: [produk, ...]}           pulsa, data, masa-aktif, perdana, sms-telpon
       "operatorPaket"  {opKey: [{produk:[...]}, ...]}   (cadangan, belum dipakai)
       "provider"       [{produk|subkategori}, ...]      games, voucher, voucher-act, streaming, tv, emoney */
  function daftarkan(slug, data, bentuk) {
    var R = window.DikaKatalogJumlah;
    if (!R || !R.hitung || !slug) return;
    try {
      var n;
      if (bentuk === "array") n = Array.isArray(data) ? data.length : 0;
      else if (bentuk === "provider") n = hitungProvider(data);
      else if (bentuk === "operatorPaket") n = hitungOperatorPaket(data);
      else n = hitungOperator(data);
      R.hitung[slug] = n;
    } catch (e) {
      console.error("katalog-jumlah: gagal mendaftarkan " + slug + ":", e);
    }
  }

  window.DikaKatalogJumlah.hitungOperator = hitungOperator;
  window.DikaKatalogJumlah.hitungOperatorPaket = hitungOperatorPaket;
  window.DikaKatalogJumlah.hitungProvider = hitungProvider;
  window.DikaKatalogJumlah.daftarkan = daftarkan;
})();
