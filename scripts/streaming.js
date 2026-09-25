/* ===========================================================================
   DikaPay — streaming.js
   Kategori "Streaming" — DATA ASLI dari backend DikaPay.
   PILOT pertama untuk halaman TIPE B (provider-page.js).

   String kategori di price-list: "Streaming" — SUDAH DIVERIFIKASI terhadap
   respons asli (24 produk).

   ============ KENAPA TIPE B BUTUH KAIT BARU DI CONTROLLER ================
   Tipe A (produk-page.js) membaca produknya lewat CALLBACK
   (`productsFor(opKey)` / `subFor(opKey)`) yang dipanggil ulang tiap
   render, jadi data yang datang belakangan otomatis terpakai.

   Tipe B TIDAK begitu: `config.providers` dulu dibaca sebagai ARRAY STATIS
   — dicek panjangnya saat controller dipasang, lalu daftar brand dirender
   SEKALI di init(). Dua akibatnya untuk data async:

     1. saat `DikaProviderPage(...)` dipanggil, daftarnya masih KOSONG
        (fetch belum selesai) -> controller menolak init dengan
        "config.providers wajib diisi";
     2. tidak ada satu pun jalan untuk menggambar ulang daftar brand
        setelah data tiba.

   Karena itu provider-page.js sekarang punya DUA kait baru (additive —
   6 halaman Tipe B lain yang masih dummy tidak terpengaruh sama sekali):

     config.providersFor()  -> daftar provider, DIBACA ULANG tiap render
     nilai balik .segarkan() -> gambar ulang daftar brand + grid brand aktif

   Ini sejajar dengan `renderKey()`/`kosongWajar()` yang dulu ditambahkan
   ke produk-page.js untuk keperluan yang sama.

   ==================== TEMUAN DATA YANG PERLU DIKETAHUI ===================
   Katalog ASLI Streaming cuma punya DUA brand: **Vidio (12)** dan
   **WeTV (12)**. Netflix, Spotify, Disney+ Hotstar & Viu yang ada di data
   dummy **TIDAK ADA** di price-list Digiflazz ini — halamannya karena itu
   menyusut dari 6 kartu layanan jadi 2. Itu kenyataan katalog, bukan
   kehilangan data. Aliasnya TETAP disimpan di brand-map.js: begitu
   Digiflazz menambahkannya, produknya langsung mendarat sendiri.

   Subkategori: field `tipe` resmi memang berguna di sini, tapi HANYA untuk
   WeTV — "Umum" (9 produk koin) vs "Membership" (3 langganan VIP). Dua hal
   yang benar-benar berbeda dan harganya berselang-seling kalau dicampur
   ("WeTV VIP 1 Bulan" Rp41.559 duduk persis di antara "299 Coins"
   Rp41.445 dan "699 Coins"). Vidio semuanya "Umum" -> satu famili, dan
   provider-page.js menyembunyikan bilah tab kalau isinya < 2.
   =========================================================================== */

(function () {
  "use strict";

  var SLUG = "streaming";
  var JENIS = "prabayar";
  var KATEGORI = "Streaming";     /* string ASLI di price-list */

  /* Tampilan kartu layanan (warna + inisial) TIDAK datang dari Digiflazz —
     price-list tidak punya konsep itu. Tabel kecil ini murni presentasi;
     brand yang belum terdaftar tetap tampil, cuma memakai warna & inisial
     bawaan provider-page.js. */
  var TAMPILAN = {
    vidio:   { name: "Vidio",           short: "VD", color: "#00A9E0" },
    wetv:    { name: "WeTV",            short: "WE", color: "#00C8A0" },
    netflix: { name: "Netflix",         short: "NF", color: "#E50914" },
    spotify: { name: "Spotify",         short: "SP", color: "#1DB954" },
    disney:  { name: "Disney+ Hotstar", short: "DH", color: "#0F1E45" },
    viu:     { name: "Viu",             short: "VU", color: "#D9A400" },
  };

  var PROVIDERS = [];            /* diisi hasil fetch */
  var status = "idle";           /* idle | memuat | siap | gagal */
  var pesanGagal = "";
  var ringkasan = null;
  var statusUI = null;
  var halaman = null;            /* handle dari DikaProviderPage */

  /* Pemenang saat dua SKU punya NAMA sama: yang TIDAK gangguan lebih dulu,
     baru harga termurah — aturan yang sama dengan kategori Tipe A. */
  function lebihBaik(baru, lama) {
    var rusakBaru = !!baru.gangguan, rusakLama = !!lama.gangguan;
    if (rusakBaru !== rusakLama) return rusakLama;
    return baru.harga_modal < lama.harga_modal;
  }

  function bangun(daftar) {
    var BM = window.DikaBrandMap;
    if (!BM) {
      console.error("streaming: brand-map.js belum di-link — brand tidak bisa dipetakan.");
      return [];
    }
    var per = {};
    var takDikenal = {}, dilewati = 0;

    (daftar || []).forEach(function (p) {
      if (!p || typeof p.harga_modal !== "number" || !isFinite(p.harga_modal)) { dilewati++; return; }
      /* provider() = pasangan Tipe B dari operator(): brand Digiflazz ->
         provider.id yang dipakai halaman. Tabelnya sudah ada di
         brand-map.js, tidak ada yang perlu ditambah untuk kategori ini. */
      var id = BM.provider(SLUG, p.brand);
      if (!id) { takDikenal[p.brand] = (takDikenal[p.brand] || 0) + 1; return; }
      var rec = {
        sku: String(p.kode_produk || ""),
        nama: String(p.nama || "").trim(),
        brand: String(p.brand || "").trim(),
        harga_modal: p.harga_modal,
        kategori_asli: String(p.kategori || KATEGORI),
      };
      if (window.DikaProduk && window.DikaProduk.statusGangguan(p)) rec.gangguan = true;
      if (p.deskripsi) rec.deskripsi = String(p.deskripsi);
      if (p.tipe != null && String(p.tipe).trim()) rec.tipe = String(p.tipe).trim();
      (per[id] = per[id] || []).push(rec);
    });

    /* Nama kembar -> simpan satu, lalu urut dari termurah. */
    var digabung = 0;
    Object.keys(per).forEach(function (id) {
      var satu = {};
      per[id].forEach(function (item) {
        var k = item.nama.toLowerCase();
        if (!satu[k]) { satu[k] = item; return; }
        digabung++;
        if (lebihBaik(item, satu[k])) satu[k] = item;
      });
      per[id] = Object.keys(satu).map(function (k) { return satu[k]; })
        .sort(function (a, b) { return a.harga_modal - b.harga_modal; });
    });

    var T = window.DikaTipe;
    var out = Object.keys(per).map(function (id) {
      var tampil = TAMPILAN[id] || {};
      var brand = {
        id: id,
        name: tampil.name || id,
        short: tampil.short,
        color: tampil.color,
        jumlah: per[id].length,      /* dipakai laporan & urutan, bukan UI */
      };
      /* Subkategori dari `tipe` resmi. Kontraknya SAMA dengan Tipe A
         ([{id,label,produk}]), cuma menempel di brand, bukan di operator. */
      var sub = T ? T.kelompokkan(per[id], {
        ctx: SLUG + "/" + id,
        labelUmum: "Reguler",
        min: 0,
      }) : [];

      /* SATU brand memakai `subkategori` ATAU `produk`, TIDAK PERNAH
         KEDUANYA — itu konvensi yang sudah dipakai voucher/games/
         voucher-act, dan bukan sekadar gaya: `hitungProvider()` di
         katalog-jumlah.js MENJUMLAHKAN keduanya kalau ada dua-duanya,
         jadi WeTV akan terhitung 24 (12+12) dan halaman Margin
         menampilkan angka dua kali lipat. */
      if (sub.length > 1) brand.subkategori = sub;
      else brand.produk = per[id];
      return brand;
    }).sort(function (a, b) { return b.jumlah - a.jumlah; });

    var total = 0;
    out.forEach(function (b) { total += b.jumlah; });
    ringkasan = {
      diterima: (daftar || []).length, terpakai: total,
      provider: out.map(function (b) { return b.id + ":" + b.jumlah; }),
      takDikenal: takDikenal, digabung: digabung, dilewati: dilewati,
      gangguan: Object.keys(per).reduce(function (n, id) {
        return n + per[id].filter(function (x) { return x.gangguan; }).length;
      }, 0),
    };
    if (Object.keys(takDikenal).length) {
      console.warn("streaming: brand belum dikenal brand-map.js:",
        JSON.stringify(takDikenal), "- tambahkan aliasnya di scripts/brand-map.js.");
    }
    console.info("streaming: " + total + " produk siap dari " + ringkasan.diterima +
      " produk kategori " + KATEGORI + " (" + ringkasan.provider.join(", ") + ")");
    return out;
  }

  function daftarkanJumlah() {
    var K = window.DikaKatalogJumlah;
    if (!K || typeof K.daftarkan !== "function") return;
    K.daftarkan(SLUG, PROVIDERS, "provider");
  }

  function segarkanStatusUI() {
    if (!statusUI) return;
    if (status === "gagal") { statusUI.gagal(pesanGagal, function () { muat(true); }); return; }
    if (status === "memuat") { statusUI.memuat(4); return; }
    if (status === "siap" && !PROVIDERS.length) {
      statusUI.kosong("Belum ada layanan streaming yang tersedia saat ini.");
      return;
    }
    statusUI.sembunyi();
  }

  function muat(paksa) {
    if (!window.DikaApi) {
      console.error("streaming: api.js belum di-link — data produk tidak bisa dimuat.");
      status = "gagal";
      pesanGagal = "Modul jaringan belum termuat. Coba buka ulang halamannya, ya.";
      segarkanStatusUI();
      return;
    }
    if (status === "memuat") return;
    status = "memuat"; pesanGagal = "";
    segarkanStatusUI();

    window.DikaApi.kategori(JENIS, KATEGORI, !!paksa)
      .then(function (daftar) {
        PROVIDERS = bangun(daftar);
        daftarkanJumlah();
        status = "siap";
        segarkanStatusUI();
        if (halaman) halaman.segarkan();     /* kait baru provider-page.js */
      })
      .catch(function (err) {
        console.error("streaming: gagal memuat katalog:", err && (err.sebab || err.message), err);
        status = "gagal";
        pesanGagal = (err && err.pesanMember) || "Produk tidak bisa dimuat sekarang. Coba lagi, ya.";
        segarkanStatusUI();
      });
  }

  function cobaDariCache() {
    if (!window.DikaApi || typeof window.DikaApi.bacaCache !== "function") return false;
    var mentah = window.DikaApi.bacaCache(JENIS);
    if (!mentah) return false;
    var isi = mentah.filter(function (p) {
      return p && String(p.kategori || "").trim().toLowerCase() === KATEGORI.toLowerCase();
    });
    if (!isi.length) return false;
    PROVIDERS = bangun(isi);
    daftarkanJumlah();
    status = "siap";
    return true;
  }

  var UI = window.DikaProdukUI;

  /* Dijaga: file ini AMAN dimuat tanpa DikaProviderPage (mis. di
     margin.html untuk membaca jumlah produk saja). */
  if (window.DikaProviderPage) {
    halaman = window.DikaProviderPage({
      slug: SLUG,
      brandTitle: "Pilih Layanan",
      nominalTitle: "Pilih Paket",
      brandLabel: "Layanan",
      detailLabel: "Paket",
      payTitle: "Pembayaran",
      payLine: function (item, brand) {
        return window.DikaProduk.namaLengkap(item) + " " + brand.name +
          " belum bisa diproses karena metode pembayaran masih dalam pengerjaan. " +
          "Terima kasih sudah menunggu!";
      },
      /* Nomor HP tujuan pengiriman. helper:true -> input-helper.js
         memasang tombol kontak / suara / scan di field ini. */
      accountFields: function () {
        return [{
          key: "phone",
          label: "Nomor HP Tujuan",
          placeholder: "Contoh: 081234567890",
          hint: "Kode voucher akan dikirim ke nomor ini lewat SMS.",
          digitsOnly: true,
          inputmode: "tel",
          helper: true,
          phone: true,   /* nomor HP sungguhan -> validasi ketat */
          min: 10,
          max: 13,
        }];
      },
      /* Kait BARU: dibaca ulang tiap render, bukan snapshot saat init. */
      providersFor: function () { return PROVIDERS; },
    });

    var mulai = function () {
      statusUI = UI ? UI.createStatus({ anchor: document.getElementById("brandSec") }) : null;
      /* Cache yang masih berlaku dipakai langsung — tidak ada kedip
         skeleton untuk perpindahan halaman yang cepat. */
      if (cobaDariCache()) {
        segarkanStatusUI();
        if (halaman) halaman.segarkan();
      } else {
        muat(false);
      }
    };
    if (UI && UI.onReady) UI.onReady(mulai);
    else document.addEventListener("DOMContentLoaded", mulai);
  } else {
    /* margin.html: tanpa controller & tanpa jaringan — cukup baca cache. */
    cobaDariCache();
  }

  /* Dibuka untuk pengujian & diagnosa. */
  window.DikaStreaming = {
    ringkasan: function () { return ringkasan; },
    status: function () { return status; },
    provider: function () { return PROVIDERS; },
    muatUlang: function () { muat(true); },
    debug: function () {
      return {
        status: status,
        brandTerpilih: halaman ? halaman.brandTerpilih() : null,
        provider: PROVIDERS.map(function (b) {
          return b.id + ":" + b.jumlah +
            (b.subkategori ? "[" + b.subkategori.map(function (s) {
              return s.id + ":" + s.produk.length;
            }).join(",") + "]" : "");
        }),
      };
    },
  };
})();
