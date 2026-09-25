/* ===========================================================================
   DikaPay — tv.js
   Kategori TV (beli PAKET TV prabayar) — DISAMBUNGKAN ke backend DikaPay.

   ==================== KATEGORI INI MEMANG KOSONG HARI INI ================
   Price-list prabayar Digiflazz saat ini punya 12 kategori dan **TIDAK ADA
   satu pun yang jatuh ke slug `tv`**:

       Aktivasi Perdana, Aktivasi Voucher, Data, E-Money, Games, Gas,
       Masa Aktif, PLN, Paket SMS & Telpon, Pulsa, Streaming, Voucher

   Keputusan produk: **menu TV TETAP tampil di Beranda**, tapi halamannya
   menampilkan state kosong yang jujur ("Segera hadir") — bukan disembunyikan,
   dan bukan pula diisi produk karangan. 14 produk dummy yang dulu ada di
   file ini (IndiHome/Transvision/K-Vision/MNC/First Media) SUDAH DIHAPUS
   TOTAL: menampilkan harga yang tidak bisa dibeli lebih buruk daripada
   mengaku belum punya produknya.

   ==================== TETAP MENEMBAK API SUNGGUHAN =======================
   Halaman ini **tidak** di-hardcode "selalu kosong". Ia benar-benar
   memanggil `DikaApi` tiap kali dibuka, jadi begitu Digiflazz menambahkan
   produk TV, halamannya langsung terisi TANPA satu baris kode pun diubah —
   prinsip yang sama dengan brand Netflix/Spotify di streaming.js yang
   aliasnya tetap disimpan walau produknya belum ada.

   ==================== KENAPA MENYARING LEWAT SLUG, BUKAN NAMA ============
   Kategori lain memanggil `DikaApi.kategori(jenis, "<nama persis>")`, yang
   mencocokkan SATU string apa adanya. Di sini itu justru rapuh: kita belum
   tahu Digiflazz akan menamainya "TV", "Paket TV", atau "TV Prabayar", dan
   menebak satu string berarti halaman ini tetap kosong walau produknya
   sudah ada.

   Jadi halaman ini mengambil katalog penuh lewat `DikaApi.katalog()` lalu
   menyaring dengan `DikaKategoriMap.cocokkan(kategori, brand, "prabayar")
   === "tv"` — pemetaan yang memang dibuat untuk pertanyaan itu, dan sudah
   mengenali ketiga penamaan di atas. Tidak ada permintaan jaringan
   tambahan: `katalog()` memakai cache 5 menit yang sama.
   =========================================================================== */

(function () {
  "use strict";

  var SLUG = "tv";
  var JENIS = "prabayar";

  /* Tampilan kartu penyedia (warna + inisial) — murni presentasi, tidak ada
     di price-list. Penyedia yang belum terdaftar tetap tampil memakai warna
     & inisial bawaan provider-page.js. Daftarnya SENGAJA dipertahankan
     walau produknya belum ada: begitu Digiflazz menambahkannya, kartunya
     langsung tampil dengan identitas yang benar. */
  var TAMPILAN = {
    indihome:    { name: "IndiHome",    short: "IH", color: "#E31E24" },
    transvision: { name: "Transvision", short: "TV", color: "#0066B3" },
    kvision:     { name: "K-Vision",    short: "KV", color: "#F7941D" },
    mnc:         { name: "MNC Vision",  short: "MV", color: "#1B4FD6" },
    firstmedia:  { name: "First Media", short: "FM", color: "#E4002B" },
  };

  var PROVIDERS = [];
  var status = "idle";           /* idle | memuat | siap | gagal */
  var pesanGagal = "";
  var ringkasan = null;
  var statusUI = null;
  var halaman = null;

  function lebihBaik(baru, lama) {
    var rusakBaru = !!baru.gangguan, rusakLama = !!lama.gangguan;
    if (rusakBaru !== rusakLama) return rusakLama;
    return baru.harga_modal < lama.harga_modal;
  }

  /* Ambil hanya baris yang slug kategorinya `tv` — lihat catatan di header.

     `cocokkan()` dipanggil SEKALI PER NAMA KATEGORI (12 di price-list hari
     ini), BUKAN sekali per baris (8.341). Dua alasannya, dan yang kedua
     yang benar-benar menggigit:
       1. 8.341 pemanggilan untuk menjawab 12 pertanyaan itu pemborosan;
       2. `cocokkan()` mencatat `console.warn` untuk tiap kategori yang
          belum dipetakan. Per-baris, satu kategori tak dikenal berisi 400
          produk akan mencetak 400 peringatan identik dan menenggelamkan
          peringatan lain yang benar-benar perlu dibaca. Terbukti saat
          diuji: 405 baris peringatan untuk satu halaman. */
  function saringTV(semua) {
    var KM = window.DikaKategoriMap;
    if (!KM || typeof KM.cocokkan !== "function") {
      console.error("tv: kategori-map.js belum di-link — tidak bisa menyaring kategori.");
      return [];
    }
    var putusan = {};      /* nama kategori -> boolean "ini TV?" */
    return (semua || []).filter(function (p) {
      if (!p) return false;
      var k = String(p.kategori || "");
      if (!(k in putusan)) {
        try { putusan[k] = KM.cocokkan(k, p.brand, JENIS) === SLUG; }
        catch (e) { putusan[k] = false; }
      }
      return putusan[k];
    });
  }

  function bangun(daftar) {
    var BM = window.DikaBrandMap;
    if (!BM) {
      console.error("tv: brand-map.js belum di-link — brand tidak bisa dipetakan.");
      return [];
    }
    var per = {}, takDikenal = {}, dilewati = 0;

    (daftar || []).forEach(function (p) {
      if (!p || typeof p.harga_modal !== "number" || !isFinite(p.harga_modal)) { dilewati++; return; }
      var id = BM.provider(SLUG, p.brand);
      if (!id) { takDikenal[p.brand] = (takDikenal[p.brand] || 0) + 1; return; }
      var rec = {
        sku: String(p.kode_produk || ""),
        nama: String(p.nama || "").trim(),
        brand: String(p.brand || "").trim(),
        harga_modal: p.harga_modal,
        kategori_asli: String(p.kategori || "TV"),
      };
      if (window.DikaProduk && window.DikaProduk.statusGangguan(p)) rec.gangguan = true;
      if (p.deskripsi) rec.deskripsi = String(p.deskripsi);
      if (p.tipe != null && String(p.tipe).trim()) rec.tipe = String(p.tipe).trim();
      (per[id] = per[id] || []).push(rec);
    });

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

    var out = Object.keys(per).map(function (id) {
      var t = TAMPILAN[id] || {};
      return {
        id: id, name: t.name || id, short: t.short, color: t.color,
        jumlah: per[id].length,
        /* Satu brand: `produk` ATAU `subkategori`, tidak pernah keduanya —
           `hitungProvider()` menjumlahkan dua-duanya kalau ada. */
        produk: per[id],
      };
    }).sort(function (a, b) { return b.jumlah - a.jumlah; });

    var total = 0;
    out.forEach(function (b) { total += b.jumlah; });
    ringkasan = {
      diterima: (daftar || []).length, terpakai: total,
      provider: out.map(function (b) { return b.id + ":" + b.jumlah; }),
      takDikenal: takDikenal, digabung: digabung, dilewati: dilewati,
    };
    if (Object.keys(takDikenal).length) {
      console.warn("tv: brand belum dikenal brand-map.js:", JSON.stringify(takDikenal));
    }
    console.info("tv: " + total + " produk siap dari " + ringkasan.diterima +
      " baris kategori TV di price-list.");
    return out;
  }

  function daftarkanJumlah() {
    var K = window.DikaKatalogJumlah;
    if (!K || typeof K.daftarkan !== "function") return;
    K.daftarkan(SLUG, PROVIDERS, "provider");
  }

  /* Section "Pilih Penyedia" disembunyikan selama belum ada penyedia sama
     sekali — kalau tidak, member melihat judul dengan area kosong di
     bawahnya, tepat di sebelah kartu yang bilang produknya belum ada.
     Ini menyentuh markup HALAMAN INI SENDIRI, bukan internal controller. */
  function aturBrandSec(tampil) {
    var sec = document.getElementById("brandSec");
    if (sec) sec.hidden = !tampil;
  }

  function segarkanStatusUI() {
    if (!statusUI) return;
    if (status === "gagal") {
      aturBrandSec(false);
      statusUI.gagal(pesanGagal, function () { muat(true); });
      return;
    }
    if (status === "memuat") {
      aturBrandSec(false);
      statusUI.memuat(4);
      return;
    }
    if (status === "siap" && !PROVIDERS.length) {
      aturBrandSec(false);
      /* Nadanya sengaja bukan pesan galat: tidak ada yang rusak dan tidak
         ada yang salah dilakukan member — produknya memang belum ada. */
      statusUI.kosong("Produk TV sedang belum tersedia. Segera hadir!");
      return;
    }
    aturBrandSec(true);
    statusUI.sembunyi();
  }

  function muat(paksa) {
    if (!window.DikaApi) {
      console.error("tv: api.js belum di-link — data produk tidak bisa dimuat.");
      status = "gagal";
      pesanGagal = "Modul jaringan belum termuat. Coba buka ulang halamannya, ya.";
      segarkanStatusUI();
      return;
    }
    if (status === "memuat") return;
    status = "memuat"; pesanGagal = "";
    segarkanStatusUI();

    window.DikaApi.katalog(JENIS, !!paksa)
      .then(function (semua) {
        PROVIDERS = bangun(saringTV(semua));
        daftarkanJumlah();
        status = "siap";
        segarkanStatusUI();
        if (halaman) halaman.segarkan();
      })
      .catch(function (err) {
        console.error("tv: gagal memuat katalog:", err && (err.sebab || err.message), err);
        status = "gagal";
        pesanGagal = (err && err.pesanMember) || "Produk tidak bisa dimuat sekarang. Coba lagi, ya.";
        segarkanStatusUI();
      });
  }

  function cobaDariCache() {
    if (!window.DikaApi || typeof window.DikaApi.bacaCache !== "function") return false;
    var mentah = window.DikaApi.bacaCache(JENIS);
    if (!mentah) return false;
    /* Cache ADA tapi tidak memuat produk TV = jawaban yang sah ("memang
       belum ada"), bukan cache-miss. Jadi tetap dianggap berhasil —
       kalau tidak, halaman ini akan menembak jaringan tiap kali dibuka. */
    PROVIDERS = bangun(saringTV(mentah));
    daftarkanJumlah();
    status = "siap";
    return true;
  }

  var UI = window.DikaProdukUI;

  if (window.DikaProviderPage) {
    halaman = window.DikaProviderPage({
      slug: SLUG,
      brandTitle: "Pilih Penyedia",
      nominalTitle: "Pilih Paket",
      brandLabel: "Penyedia",
      detailLabel: "Paket",
      payTitle: "Pembayaran",
      payLine: function (item, brand) {
        return window.DikaProduk.namaLengkap(item) + " " + brand.name +
          " belum bisa diproses karena metode pembayaran masih dalam pengerjaan. " +
          "Terima kasih sudah menunggu!";
      },
      accountFields: function () {
        return [{
          key: "phone",
          label: "Nomor HP Tujuan",
          placeholder: "Contoh: 081234567890",
          hint: "Kode voucher akan dikirim ke nomor ini lewat SMS.",
          digitsOnly: true,
          inputmode: "tel",
          helper: true,
          phone: true,
          min: 10,
          max: 13,
        }];
      },
      providersFor: function () { return PROVIDERS; },
    });

    var mulai = function () {
      statusUI = UI ? UI.createStatus({ anchor: document.getElementById("brandSec") }) : null;
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
    cobaDariCache();
  }

  window.DikaTv = {
    ringkasan: function () { return ringkasan; },
    status: function () { return status; },
    provider: function () { return PROVIDERS; },
    muatUlang: function () { muat(true); },
  };
})();
