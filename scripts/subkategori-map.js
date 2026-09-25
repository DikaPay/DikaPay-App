/* ===========================================================================
   DikaPay — subkategori-map.js
   Menentukan SUBKATEGORI sebuah produk dari `product_name` Digiflazz.

     window.DikaSubkategori = {
       LAINNYA                       // definisi keranjang penampung
       cocokkan(daftarSub, nama)     // -> id subkategori | null
       kelompokkan(daftarSub, produk)// -> daftarSub terisi + "Lainnya" bila perlu
     }

   ============================= KENAPA MODUL INI ADA =========================
   Price-list Digiflazz TIDAK punya field "famili produk". Di dalam satu
   kategori, semua produk berbagi `category` DAN `brand` yang sama persis:

     category="Data"  brand="TELKOMSEL"  -> Flash? Ilmupedia? OMG!? GamesMAX?

   Satu-satunya tempat nama famili muncul adalah di dalam `product_name`
   ("Flash 1GB", "Starlight Member", "Xtra Combo Mini 2GB"). Karena itu tiap
   subkategori di file data sekarang punya field `cocok: [...]` berisi kata
   kunci yang menandainya, dan modul ini yang mencocokkannya.

   ATURAN PENCOCOKAN sama dengan `cocokkan()` di kategori-map.js:
   case-insensitive, KATA KUNCI TERPANJANG MENANG. Itu wajib di sini:
     "Hotrod Unlimited Harian" memuat "unlimited" DAN "hotrod unlimited"
     "Weekly Diamond Pass"     memuat "diamond"   DAN "diamond pass"
   Tanpa aturan terpanjang, keduanya mendarat di subkategori yang salah.

   Pencocokan memakai BATAS KATA, bukan `indexOf` telanjang — "uc" sebagai
   substring muncul di "unlimited"; sebagai kata utuh ia hanya berarti
   Unknown Cash.
   ==========================================================================

   KERANJANG "LAINNYA" — produk tidak boleh hilang diam-diam.
   Produk yang tidak cocok ke subkategori mana pun DIKUMPULKAN, bukan
   dibuang: pola yang sama seperti slug "lainnya" di kategori-map.js.

   Keranjangnya DITAMBAHKAN OTOMATIS oleh `kelompokkan()` dan HANYA kalau
   benar-benar ada produk yang tidak cocok — sengaja tidak ditulis sebagai
   entri kosong di file data. Alasannya praktis: `paket-data` punya 6
   operator dan `voucher` punya 10 merchant, jadi menuliskannya di data
   berarti ~30 keranjang kosong permanen, dan tab kosong yang tidak pernah
   berisi apa-apa hanya membingungkan member. Dengan cara ini keranjangnya
   MUNCUL tepat saat ada isinya, dan hilang lagi saat tidak ada.

   TODO fase 2: `cocok` di file data adalah EKSPEKTASI penulisan nama produk
   Digiflazz, bukan fakta. Wajib dicocokkan ulang pada sync pertama —
   `kelompokkan()` melaporkan berapa produk yang jatuh ke "Lainnya" supaya
   kata kunci yang meleset langsung ketahuan.
   =========================================================================== */

(function () {
  "use strict";

  var LAINNYA = { id: "lainnya", label: "Lainnya", cocok: [] };

  function norm(v) {
    return String(v == null ? "" : v)
      .toLowerCase()
      .replace(/[^a-z0-9+]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function adaKata(teks, kunci) {
    if (!teks || !kunci) return false;
    return (" " + teks + " ").indexOf(" " + kunci + " ") !== -1;
  }

  /* Mengembalikan id subkategori yang kata kuncinya PALING PANJANG cocok
     dengan nama produk, atau null kalau tidak ada yang cocok sama sekali. */
  function cocokkan(daftarSub, namaProduk) {
    if (!Array.isArray(daftarSub) || !daftarSub.length) return null;
    var t = norm(namaProduk);
    if (!t) return null;

    var menang = null;
    var panjang = 0;
    daftarSub.forEach(function (s) {
      if (!s || !Array.isArray(s.cocok)) return;
      s.cocok.forEach(function (k) {
        var kk = norm(k);
        if (kk.length > panjang && adaKata(t, kk)) {
          panjang = kk.length;
          menang = s.id;
        }
      });
    });
    return menang;
  }

  /* Membagikan `produk` ke dalam salinan `daftarSub`. Dipakai lapisan sync,
     bukan halaman: halaman membaca hasilnya seperti data biasa.

     Mengembalikan ARRAY BARU — daftar aslinya tidak disentuh, supaya
     memanggil ulang dengan produk berbeda tidak menumpuk isi sebelumnya. */
  function kelompokkan(daftarSub, produk, ctx) {
    var sub = (Array.isArray(daftarSub) ? daftarSub : []).map(function (s) {
      return {
        id: s.id, label: s.label,
        cocok: Array.isArray(s.cocok) ? s.cocok.slice() : [],
        produk: [],
      };
    });
    var indeks = {};
    sub.forEach(function (s) { indeks[s.id] = s; });

    var sisa = [];
    (Array.isArray(produk) ? produk : []).forEach(function (p) {
      var id = cocokkan(sub, p && p.nama);
      if (id && indeks[id]) indeks[id].produk.push(p);
      else sisa.push(p);
    });

    if (sisa.length) {
      /* Dilaporkan, bukan didiamkan: angka besar di sini berarti kata kunci
         `cocok` perlu disesuaikan dengan penulisan nama asli Digiflazz. */
      console.warn("subkategori-map" + (ctx ? " [" + ctx + "]" : "") + ": " +
        sisa.length + " produk tidak cocok ke subkategori mana pun, " +
        'dikumpulkan ke "Lainnya".',
        sisa.slice(0, 5).map(function (p) { return p && p.nama; }));
      sub.push({ id: LAINNYA.id, label: LAINNYA.label, cocok: [], produk: sisa });
    }

    /* Subkategori tanpa produk TIDAK ikut — tab kosong tidak berguna buat
       member, dan Digiflazz bisa saja tidak punya famili tertentu untuk
       operator tertentu (mis. Ilmupedia hanya ada di Telkomsel). */
    return sub.filter(function (s) { return s.produk.length > 0; });
  }

  window.DikaSubkategori = {
    LAINNYA: LAINNYA,
    cocokkan: cocokkan,
    kelompokkan: kelompokkan,
  };
})();
