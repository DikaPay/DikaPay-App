/* ===========================================================================
   DikaPay — paket-data.js
   Kategori "Data" (Paket Data) — DATA ASLI dari backend DikaPay.
   Alur halamannya tetap di produk-page.js + produk-ui.js.

   Kategori KEDUA yang disambungkan ke backend (setelah pulsa.js), dengan
   DUA lapis pengelompokan:

       operator (dari prefix nomor)
         └─ sub-brand   Telkomsel / by.U      (UI.createChoice + BM.pisahSubBrand)
              └─ subkategori famili produk    (tab #prodTabs, dari field `tipe`)

   TIDAK ADA filter rentang nominal di halaman ini (keputusan produk):
   pengelompokan lewat tab famili sudah cukup, dan dua baris chip bertumpuk
   membuat halaman terasa penuh. `UI.createFilterHarga()` tetap ada di
   produk-ui.js dan tetap dipakai halaman Pulsa — jangan ikut dihapus.

   ======================== NAMA KATEGORI DI PRICE-LIST =====================
   Digiflazz mengirim `kategori: "Data"` — BUKAN "Paket Data" seperti nama
   halaman/slug kita. `kategori-map.js` sudah benar (slug `data` memuat alias
   "data" DAN "paket data"), tapi penyaringan di sini harus memakai string
   ASLI-nya. Jangan diganti ke "Paket Data": tidak akan cocok satu produk pun.

   ============= SUBKATEGORI: DARI FIELD `tipe` RESMI DIGIFLAZZ =============
   Backend sekarang mengirim field **`tipe`** — kategorisasi RESMI Digiflazz
   (string yang sama dengan tag di dashboard mereka: "Flash", "Mini",
   "Freedom Internet", "Maxstream", …). Pengelompokan halaman ini TIDAK LAGI
   menebak famili dari `product_name`.

   Yang berubah bukan "sekarang ada pemetaan" — dua-duanya punya pemetaan.
   Yang berubah adalah MASUKANNYA: dari teks bebas 2.494 nama produk menjadi
   kosakata TERTUTUP berisi 186 string resmi. Pemetaan tipe->famili hidup di
   `tipe-map.js` (satu tempat, dipakai bersama), bukan lagi tabel `cocok:[]`
   per operator di file ini.

   `SUBDEF` + `WILAYAH` yang lama SUDAH DIHAPUS, begitu juga pemakaian
   `subkategori-map.js` di sini. Modul itu sendiri MASIH DIPAKAI halaman
   perdana & sms-telpon (kategori itu belum dipindah), jadi jangan dihapus.

   Kenapa tab = FAMILI, bukan `tipe` mentah: Telkomsel punya 77 tipe untuk
   1.068 produk (ekornya "Musik" 1 produk, "FIFA World Cup" 1). 77 tab
   bergulir di layar HP bukan pilihan. Lihat header tipe-map.js.
   =========================================================================== */

(function () {
  "use strict";

  var SLUG = "data";           /* slug kategori-map.js (bukan nama file) */
  var JENIS = "prabayar";
  var KATEGORI = "Data";       /* string ASLI di price-list — lihat catatan di atas */

  /* ===================== SUBKATEGORI DARI `tipe` RESMI =====================
     TIDAK ADA lagi tabel `SUBDEF`/`WILAYAH` di sini. Pengelompokan famili
     hidup di `tipe-map.js` dan dipakai bersama, karena masukannya sekarang
     kosakata RESMI Digiflazz (field `tipe`) — bukan kata kunci per operator
     yang harus ditulis tangan untuk tiap famili baru.

     Kalau Digiflazz menambah `tipe` baru, tipe-map.js menjadikannya tab
     sendiri memakai nama resminya + console.warn — produknya tidak pernah
     hilang dan tidak pernah dilabeli "Lainnya". */

  var PRODUK = {};              /* opKey -> [record produk-schema] */
  var status = "idle";          /* idle | memuat | siap | gagal */
  var pesanGagal = "";
  var ringkasan = null;
  var subDipilih = null;        /* sub-brand aktif (mis. "byu") — memori saja */

  /* ---- Bentuk ulang data backend -> record produk-schema ------------- */

  /* Pemenang saat dua SKU punya NAMA sama persis.
     Urutan penilaian:
       1. Yang TIDAK gangguan selalu menang — kartu yang bisa dibeli tidak
          boleh tertutup oleh kembarannya yang sedang bermasalah hanya
          karena kebetulan lebih murah.
       2. Baru setelah itu: harga termurah (menguntungkan member/reseller).
     Hari ini di price-list belum ada bentrok nama yang campur sehat +
     gangguan, tapi itu kebetulan data — bukan jaminan. */
  function lebihBaik(baru, lama) {
    var rusakBaru = !!baru.gangguan, rusakLama = !!lama.gangguan;
    if (rusakBaru !== rusakLama) return rusakLama;      /* yang sehat menang */
    return baru.harga_modal < lama.harga_modal;
  }

  function bangun(daftar) {
    var BM = window.DikaBrandMap;
    if (!BM) {
      console.error("paket-data: brand-map.js belum di-link — brand tidak bisa dipetakan.");
      return {};
    }
    var hasil = {};
    var takDikenal = {};
    var dilewati = 0;

    (daftar || []).forEach(function (p) {
      if (!p || typeof p.harga_modal !== "number" || !isFinite(p.harga_modal)) { dilewati++; return; }
      var opKey = BM.operator(p.brand, p.nama);
      if (!opKey) { takDikenal[p.brand] = (takDikenal[p.brand] || 0) + 1; return; }
      var rec = {
        sku: String(p.kode_produk || ""),
        nama: String(p.nama || "").trim(),
        brand: String(p.brand || "").trim(),
        harga_modal: p.harga_modal,
        kategori_asli: String(p.kategori || KATEGORI),
      };
      /* Field OPSIONAL diteruskan HANYA kalau backend mengirimnya, supaya
         record tetap identik selama field itu belum ada. `gangguan`
         diturunkan produk-schema.js (menerima `gangguan` jadi maupun
         `buyer_product_status`/`seller_product_status` mentah). */
      if (window.DikaProduk && window.DikaProduk.statusGangguan(p)) rec.gangguan = true;
      if (p.deskripsi) rec.deskripsi = String(p.deskripsi);
      /* `tipe` = kategorisasi RESMI Digiflazz; jadi dasar tab subkategori
         (lihat tipe-map.js). Diteruskan apa adanya, termasuk saat kosong —
         tipe-map.js yang memutuskan jalur cadangannya. */
      if (p.tipe != null && String(p.tipe).trim()) rec.tipe = String(p.tipe).trim();
      (hasil[opKey] = hasil[opKey] || []).push(rec);
    });

    /* Nama yang sama persis bisa datang dari lebih dari satu SKU —
       simpan SATU saja, lihat lebihBaik() (pola sama dengan pulsa.js). */
    var digabung = 0;
    Object.keys(hasil).forEach(function (opKey) {
      var per = {};
      hasil[opKey].forEach(function (item) {
        var k = item.nama.toLowerCase();
        if (!per[k]) { per[k] = item; return; }
        digabung++;
        if (lebihBaik(item, per[k])) per[k] = item;
      });
      hasil[opKey] = Object.keys(per).map(function (k) { return per[k]; })
        .sort(function (a, b) { return a.harga_modal - b.harga_modal; });
    });

    var akhir = 0;
    Object.keys(hasil).forEach(function (k) { akhir += hasil[k].length; });
    ringkasan = {
      diterima: (daftar || []).length,
      terpakai: akhir,
      operator: Object.keys(hasil).sort(),
      takDikenal: takDikenal,
      digabung: digabung,
      dilewati: dilewati,
    };

    var brandGagal = Object.keys(takDikenal);
    if (brandGagal.length) {
      console.warn("paket-data: brand belum dikenal brand-map.js:", JSON.stringify(takDikenal));
    }
    console.info("paket-data: " + akhir + " produk siap dari " + ringkasan.diterima +
      " produk kategori " + KATEGORI + " (" + ringkasan.operator.join(", ") + ")");
    return hasil;
  }

  /* ---- Sub-brand (Telkomsel vs by.U) --------------------------------
     Sama persis dengan pulsa.js: pemisahannya milik brand-map.js, di sini
     cuma "kelompok mana yang sedang dipilih". by.U memang muncul di
     kategori ini juga (94 produk di price-list). */

  function kelompokSub(opKey) {
    var BM = window.DikaBrandMap;
    if (!BM || typeof BM.pisahSubBrand !== "function") return null;
    return BM.pisahSubBrand(opKey, PRODUK[opKey] || []);
  }

  function produkSetelahSub(opKey) {
    var kelompok = kelompokSub(opKey);
    if (!kelompok) return PRODUK[opKey] || [];
    for (var i = 0; i < kelompok.length; i++) {
      if (kelompok[i].id === subDipilih) return kelompok[i].produk;
    }
    return [];      /* belum memilih -> jangan menebak */
  }

  /* ---- Subkategori: dari field `tipe` resmi --------------------------
     Pengelompokannya milik tipe-map.js. Halaman ini cuma menentukan
     DAFTAR MANA yang dikelompokkan (setelah pilihan sub-brand diterapkan)
     dan memberi konteks untuk pesan console.

     Sub-brand TIDAK lagi butuh tabel famili sendiri: by.U punya nilai
     `tipe` sendiri di price-list (Kaget, Jajan, Mbps, Viu, Vidio, …), jadi
     pemetaan yang sama menghasilkan tab yang benar tanpa cabang khusus.
     `definisiUntuk()` yang dulu memilih SUBDEF per sub-brand sudah tidak
     diperlukan dan sudah dihapus. */

  /* Famili berisi satu produk saja digabung ke keranjang umum ("Kuota
     Reguler"): satu tab untuk satu kartu lebih banyak memakan ruang
     daripada menolong. Nilai 2 = hanya yang benar-benar tunggal. */
  var MIN_FAMILI = 2;

  function subKategori(opKey) {
    var produk = produkSetelahSub(opKey);
    if (!produk.length) return [];

    var T = window.DikaTipe;
    if (!T) {
      console.error("paket-data: tipe-map.js belum di-link.");
      return [{ id: "semua", label: "Semua Paket", produk: produk }];
    }
    return T.kelompokkan(produk, {
      ctx: SLUG + "/" + opKey + (subDipilih ? "/" + subDipilih : ""),
      min: MIN_FAMILI,
    });
  }

  /* ---- Tanpa filter rentang nominal (keputusan produk) ---------------
     `UI.createFilterHarga()` SENGAJA tidak dipakai di halaman ini:
     pengelompokan lewat tab famili sudah cukup, dan dua baris chip
     bertumpuk (famili + harga) justru membuat halaman terasa penuh.
     Komponennya sendiri TETAP ADA di produk-ui.js dan tetap dipakai
     halaman Pulsa — jangan ikut dihapus dari sana. */

  var els = { phone: null };
  var statusUI = null, choiceUI = null;

  function operatorTerdeteksi() {
    var OP = window.DikaOperator;
    if (!OP || !els.phone) return null;
    return OP.detect(OP.sanitize(els.phone.value));
  }

  /* Tab yang sedang aktif dibaca dari #prodTabs — markup yang memang sudah
     jadi kontrak semua halaman produk (lihat "Markup wajib" di CLAUDE.md).
     Dibaca, bukan dikendalikan: pemiliknya tetap produk-page.js. */
  function subAktifId(daftarSub) {
    var el = document.querySelector("#prodTabs .ptab.is-active");
    var id = el && el.dataset ? el.dataset.id : null;
    for (var i = 0; i < daftarSub.length; i++) if (daftarSub[i].id === id) return daftarSub[i].id;
    return daftarSub.length ? daftarSub[0].id : null;   /* tab belum sempat dirender */
  }

  function picuRenderUlang() {
    if (!els.phone) return;
    try { els.phone.dispatchEvent(new Event("input", { bubbles: true })); }
    catch (e) { console.error("paket-data: gagal memicu render ulang:", e); }
  }

  function segarkanStatusUI() {
    if (!statusUI) return;
    var opKey = operatorTerdeteksi();

    if (status === "gagal") {
      if (choiceUI) choiceUI.render([]);
      statusUI.gagal(pesanGagal, function () { muat(true); });
      return;
    }
    if (status === "memuat") {
      if (choiceUI) choiceUI.render([]);
      statusUI.memuat(6);
      return;
    }

    if (!opKey) {
      if (choiceUI) choiceUI.render([]);
      subDipilih = null;
      statusUI.sembunyi();
      return;
    }

    var kelompok = kelompokSub(opKey);
    if (choiceUI) {
      choiceUI.render(kelompok || [], { title: "Pilih Jenis Kartu", label: "Jenis Kartu" });
      subDipilih = choiceUI.pilih();
    }
    if (kelompok && !subDipilih) {
      statusUI.kosong("Pilih dulu jenis kartunya di atas — paket Telkomsel dan by.U berbeda, " +
        "walaupun nomornya sama-sama diawali blok Telkomsel.");
      return;
    }
    if (!produkSetelahSub(opKey).length) {
      var OP = window.DikaOperator;
      var nama = OP && OP.get(opKey) ? OP.get(opKey).name : "operator ini";
      statusUI.kosong("Belum ada paket data " + nama + " yang tersedia saat ini.");
      return;
    }
    statusUI.sembunyi();
  }

  /* ---- Kontrak untuk produk-page.js ---------------------------------- */

  /* Dipanggil produk-page.js tiap kali grid digambar ulang: daftar
     subkategori (tab) beserta produknya, apa adanya — tanpa penyaringan
     harga lagi di atasnya. */
  function subFor(opKey) {
    return subKategori(opKey);
  }

  /* Sub-brand ikut jadi penanda key grid: operatornya tetap `telkomsel`
     saat member berpindah Telkomsel <-> by.U, jadi tanpa ini createGrid
     melewati render dan grid terlihat macet. */
  function renderKey() {
    return subDipilih || "-";
  }

  function kosongWajar(opKey) {
    if (status !== "siap") return true;
    return !!(kelompokSub(opKey) && !subDipilih);
  }

  /* ---- Muat data ----------------------------------------------------- */

  function muat(paksa) {
    if (!window.DikaApi) {
      console.error("paket-data: api.js belum di-link — data produk tidak bisa dimuat.");
      status = "gagal";
      pesanGagal = "Modul jaringan belum termuat. Coba buka ulang halamannya, ya.";
      segarkanStatusUI();
      return;
    }
    if (status === "memuat") return;
    status = "memuat";
    pesanGagal = "";
    segarkanStatusUI();

    window.DikaApi.kategori(JENIS, KATEGORI, !!paksa)
      .then(function (daftar) {
        PRODUK = bangun(daftar);
        daftarkanJumlah();
        status = "siap";
        segarkanStatusUI();
        picuRenderUlang();
      })
      .catch(function (err) {
        console.error("paket-data: gagal memuat katalog:", err && (err.sebab || err.message), err);
        status = "gagal";
        pesanGagal = (err && err.pesanMember) || "Produk tidak bisa dimuat sekarang. Coba lagi, ya.";
        segarkanStatusUI();
      });
  }

  /* ---- Jumlah produk untuk halaman Margin ---------------------------- */

  function daftarkanJumlah() {
    var K = window.DikaKatalogJumlah;
    if (!K || typeof K.daftarkan !== "function") return;
    /* Kunci registry-nya "data" — SLUG di kategori-map.js (yang dipakai
       margin.js), BUKAN nama file ini ("paket-data"). */
    K.daftarkan(SLUG, PRODUK, "operator");
  }

  function cobaDariCache() {
    if (!window.DikaApi || typeof window.DikaApi.bacaCache !== "function") return false;
    var mentah = window.DikaApi.bacaCache(JENIS);
    if (!mentah) return false;
    var kategoriIni = mentah.filter(function (p) {
      return p && String(p.kategori || "").trim().toLowerCase() === KATEGORI.toLowerCase();
    });
    if (!kategoriIni.length) return false;
    PRODUK = bangun(kategoriIni);
    daftarkanJumlah();
    status = "siap";
    return true;
  }

  /* ---- Pasang ke halaman --------------------------------------------- */

  var UI = window.DikaProdukUI;

  if (window.DikaProdukPage) {
    window.DikaProdukPage({
      slug: SLUG,
      sectionTitle: "Pilih Paket",
      detailLabel: "Paket",
      payTitle: "Pembayaran",
      payLine: function (item, op, phone) {
        return window.DikaProduk.namaLengkap(item) + " " + op.name +
          " untuk " + phone + " belum bisa diproses karena metode pembayaran masih " +
          "dalam pengerjaan. Terima kasih sudah menunggu!";
      },
      subFor: subFor,
      renderKey: renderKey,
      kosongWajar: kosongWajar,
    });

    var mulai = function () {
      els.phone = document.getElementById("phoneInput");
      statusUI = UI ? UI.createStatus({ anchor: document.getElementById("prodSec") }) : null;
      choiceUI = UI ? UI.createChoice({ anchor: document.getElementById("warnBox") }) : null;
      if (choiceUI) choiceUI.onPick(function (id) {
        subDipilih = id;
        segarkanStatusUI();
        picuRenderUlang();
      });
      if (els.phone) els.phone.addEventListener("input", segarkanStatusUI);

      if (cobaDariCache()) {
        segarkanStatusUI();
        picuRenderUlang();
      } else {
        muat(false);
      }
    };
    if (UI && UI.onReady) UI.onReady(mulai);
    else document.addEventListener("DOMContentLoaded", mulai);
  } else {
    /* margin.html: tanpa jaringan, cukup pakai cache bila ada. */
    cobaDariCache();
  }

  window.DikaPaketData = {
    ringkasan: function () { return ringkasan; },
    status: function () { return status; },
    produk: function () { return PRODUK; },
    muatUlang: function () { muat(true); },
    debug: function () {
      var opKey = operatorTerdeteksi();
      var daftar = opKey ? subKategori(opKey) : [];
      return {
        opKey: opKey,
        subDipilih: subDipilih,
        subAktif: subAktifId(daftar),
        setelahSub: opKey ? produkSetelahSub(opKey).length : 0,
        subkategori: daftar.map(function (s) { return s.id + ":" + s.produk.length; }),
      };
    },
  };
})();
