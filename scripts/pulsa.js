/* ===========================================================================
   DikaPay — pulsa.js
   Kategori "Pulsa" — DATA ASLI dari backend DikaPay (bukan dummy lagi).
   Alur halamannya sendiri tetap di produk-page.js + produk-ui.js.

   ======================= KATEGORI PERTAMA YANG DISAMBUNG ==================
   Ini kategori percobaan sebelum 27 kategori lain menyusul. Pola di file
   ini sengaja dibuat supaya bisa disalin apa adanya:

     1. Ambil katalog lewat `DikaApi.kategori("prabayar", "Pulsa")`
        — SATU pintu fetch + cache bersama (lihat api.js). Endpoint-nya
        mengembalikan SEMUA kategori prabayar tercampur; penyaringan
        `kategori` terjadi di api.js, bukan di sini.
     2. Petakan `brand` Digiflazz -> opKey internal lewat `DikaBrandMap`
        ("TRI" -> "three", "AXIS" -> "axis", dst). Brand yang tidak
        dikenal TIDAK dibuang diam-diam — dihitung & dilaporkan ke console
        supaya aliasnya bisa ditambahkan di brand-map.js.
     3. Bentuk ulang jadi record `produk-schema.js` PRABAYAR:
        { sku, nama, brand, harga_modal, kategori_asli }
        `kode_produk` -> `sku`. Nama field TIDAK diubah — produk-ui.js
        merender `nama`/`harga_modal` dan margin-calc.js membaca
        `harga_modal`, jadi mengganti namanya akan mematikan keduanya.

   `subFor(opKey)` tetap SINKRON (kontrak produk-page.js tidak
   berubah): ia mengembalikan apa yang sudah termuat saat itu. Begitu data
   datang, halaman dirender ulang dengan cara MEMICU event `input` di
   #phoneInput — jalur yang sama persis dengan yang dipakai member saat
   mengetik (pola yang sama seperti input-helper.js: kirim event, jangan
   memanggil internal controller). Tidak ada satu baris pun di
   produk-page.js yang perlu diubah.

   Semua yang sudah ada tetap jalan tanpa perubahan: margin (dihitung
   createGrid dari `harga_modal` + slug "pulsa"), placeholder beranimasi,
   deteksi operator, PIN transaksi, dan modal konfirmasi.

   CATATAN: file ini juga dimuat margin.html (tanpa controller & tanpa
   api.js) hanya untuk membaca JUMLAH produk. Di sana ia TIDAK menembak
   jaringan — cukup membaca cache kalau kebetulan ada.
   =========================================================================== */

(function () {
  "use strict";

  var SLUG = "pulsa";
  var JENIS = "prabayar";
  var KATEGORI = "Pulsa";      /* nilai field `kategori` di price-list */

  /* Diisi hasil fetch; kosong sampai data pertama datang. */
  var PRODUK = {};
  var status = "idle";          /* idle | memuat | siap | gagal */
  var pesanGagal = "";
  var ringkasan = null;         /* hasil pemetaan terakhir, untuk laporan */

  /* Sub-brand yang sedang dipilih member (mis. "byu"). HANYA di memori:
     ganti nomor ke operator lain -> pemilihnya hilang & pilihan ini
     dilupakan. Sengaja tidak dipersist — ini konteks satu transaksi,
     bukan preferensi akun. */
  var subDipilih = null;

  /* ---- Bentuk ulang data backend -> record produk-schema ------------- */

  function keOpKey(p) {
    var BM = window.DikaBrandMap;
    if (!BM) {
      console.error("pulsa: brand-map.js belum di-link — brand tidak bisa dipetakan.");
      return null;
    }
    return BM.operator(p.brand, p.nama);
  }

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
    var hasil = {};
    var takDikenal = {};        /* brand -> jumlah, untuk dilaporkan */
    var dilewati = 0;
    var total = 0;

    (daftar || []).forEach(function (p) {
      if (!p || typeof p.harga_modal !== "number" || !isFinite(p.harga_modal)) {
        dilewati++;
        return;
      }
      var opKey = keOpKey(p);
      if (!opKey) {
        takDikenal[p.brand] = (takDikenal[p.brand] || 0) + 1;
        return;
      }
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
      /* `tipe` = kategorisasi RESMI Digiflazz (lihat tipe-map.js). Di
         kategori Pulsa isinya nyaris seragam "Umum" — yang membedakan
         cuma "Combo Data", lihat subKategori() di bawah. */
      if (p.tipe != null && String(p.tipe).trim()) rec.tipe = String(p.tipe).trim();
      (hasil[opKey] = hasil[opKey] || []).push(rec);
      total++;
    });

    /* Satu nominal bisa datang dari lebih dari satu SKU dengan harga
       berbeda (mis. "Telkomsel 25.000" @24.675 dan @23.950). Menampilkan
       dua kartu yang tulisannya sama persis tapi harganya beda cuma
       membingungkan member — disimpan SATU saja, lihat lebihBaik(). */
    var digabung = 0;
    Object.keys(hasil).forEach(function (opKey) {
      var per = {};
      hasil[opKey].forEach(function (item) {
        var k = item.nama.toLowerCase();
        if (!per[k]) { per[k] = item; return; }
        digabung++;
        if (lebihBaik(item, per[k])) per[k] = item;
      });
      /* Urut dari nominal termurah — daftar dari penyedia datang acak
         (90.000 lalu 2.000), sedangkan member membaca dari yang kecil. */
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
      console.warn(
        "pulsa: " + brandGagal.reduce(function (n, b) { return n + takDikenal[b]; }, 0) +
        " produk dilewati karena brand-nya belum dikenal brand-map.js:",
        JSON.stringify(takDikenal),
        "- tambahkan aliasnya di scripts/brand-map.js kalau memang mau ditampilkan."
      );
    }
    console.info("pulsa: " + akhir + " produk siap dari " + ringkasan.diterima +
      " produk kategori " + KATEGORI + " (" + ringkasan.operator.join(", ") + ")");

    return hasil;
  }

  /* ---- Muat data ----------------------------------------------------- */

  var els = { phone: null };
  var statusUI = null;
  var choiceUI = null;          /* pemilih sub-brand (Telkomsel / by.U) */
  var filterUI = null;          /* chip rentang nominal untuk katalog besar */

  function operatorTerdeteksi() {
    var OP = window.DikaOperator;
    if (!OP || !els.phone) return null;
    return OP.detect(OP.sanitize(els.phone.value));
  }

  /* Render ulang lewat jalur yang SAMA dengan member mengetik. Tidak
     memanggil apa pun di dalam produk-page.js — modul itu tetap tertutup. */
  function picuRenderUlang() {
    if (!els.phone) return;
    try {
      els.phone.dispatchEvent(new Event("input", { bubbles: true }));
    } catch (e) {
      console.error("pulsa: gagal memicu render ulang:", e);
    }
  }

  function segarkanStatusUI() {
    if (!statusUI) return;
    var opKey = operatorTerdeteksi();

    if (status === "gagal") {
      /* Kegagalan ditampilkan APA PUN keadaan input — member berhak tahu
         katalognya tidak termuat, dan bisa mencoba lagi tanpa harus
         mengetik nomor dulu. */
      if (choiceUI) choiceUI.render([]);
      statusUI.gagal(pesanGagal, function () { muat(true); });
      return;
    }
    if (status === "memuat") {
      /* Skeleton hanya saat produknya memang sedang ditunggu — sebelum
         nomor cukup panjang, halaman sudah punya penjelasannya sendiri
         (#pEmpty "masukkan minimal 4 digit"), jadi menambah spinner di
         situ cuma bising. */
      if (choiceUI) choiceUI.render([]);
      if (opKey) statusUI.memuat(6); else statusUI.sembunyi();
      return;
    }

    /* --- status "siap" --- */

    if (!opKey) {
      /* Nomor belum cukup / operator tak dikenal: pemilih sub-brand ikut
         hilang DAN pilihannya dilupakan (createChoice.render([]) yang
         mengurusnya), jadi "by.U" tidak terbawa ke operator berikutnya. */
      if (choiceUI) choiceUI.render([]);
      subDipilih = null;
      statusUI.sembunyi();
      return;
    }

    var kelompok = kelompokSub(opKey);
    if (choiceUI) {
      choiceUI.render(kelompok || [], {
        title: "Pilih Jenis Kartu",
        label: "Jenis Kartu",
      });
      subDipilih = choiceUI.pilih();
    }

    if (kelompok && !subDipilih) {
      /* Sudah ada katalognya, tapi member belum memilih jenis kartu.
         Grid sengaja dibiarkan kosong: menebak salah satu berarti
         separuh member melihat produk yang pasti gagal di nomor mereka. */
      statusUI.kosong("Pilih dulu jenis kartunya di atas — produk Telkomsel dan by.U berbeda, " +
        "walaupun nomornya sama-sama diawali blok Telkomsel.");
      return;
    }

    if (!produkSetelahSub(opKey).length) {
      /* Operatornya terdeteksi tapi katalognya memang tidak punya produk
         untuk dia — itu kondisi wajar, bukan error. */
      var OP = window.DikaOperator;
      var nama = OP && OP.get(opKey) ? OP.get(opKey).name : "operator ini";
      statusUI.kosong("Belum ada produk pulsa " + nama + " yang tersedia saat ini.");
      return;
    }
    statusUI.sembunyi();
  }

  /* Chip rentang nominal SEKARANG DIURUS `subFor()`, bukan fungsi terpisah.
     Alasannya: begitu halaman ini punya tab (Indosat: Pulsa / Combo Data),
     chip harus dihitung dari isi TAB YANG AKTIF — bukan dari seluruh
     katalog operator. Menghitungnya di dua tempat berbeda bikin keduanya
     bisa berbeda pendapat tanpa ketahuan.

     Konsekuensi yang disengaja: chip ikut digambar pada siklus render
     produk-page.js (debounce 120ms), bukan seketika saat tombol ditekan.
     Tidak terasa di layar, dan hasilnya selalu sinkron dengan grid. */

  function muat(paksa) {
    if (!window.DikaApi) {
      console.error("pulsa: api.js belum di-link — data produk tidak bisa dimuat.");
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
        console.error("pulsa: gagal memuat katalog:", err && (err.sebab || err.message), err);
        status = "gagal";
        pesanGagal = (err && err.pesanMember) ||
          "Produk tidak bisa dimuat sekarang. Coba lagi, ya.";
        segarkanStatusUI();
      });
  }

  /* ---- Sub-brand (Telkomsel vs by.U) --------------------------------
     by.U memakai blok prefix Telkomsel, jadi deteksi nomor tidak bisa
     membedakannya — pemisahan produknya & alasannya ada di brand-map.js
     (`pisahSubBrand`). Di sini tinggal: kelompok mana yang sedang dipilih. */

  function kelompokSub(opKey) {
    var BM = window.DikaBrandMap;
    if (!BM || typeof BM.pisahSubBrand !== "function") return null;
    return BM.pisahSubBrand(opKey, PRODUK[opKey] || []);
  }

  /* Daftar produk SETELAH pilihan sub-brand diterapkan. Selama member
     belum memilih, kembalikan kosong — lebih baik menampilkan pemilihnya
     dulu daripada menebak, karena menebak berarti separuh member melihat
     katalog yang produknya pasti gagal di nomor mereka. */
  function produkSetelahSub(opKey) {
    var kelompok = kelompokSub(opKey);
    if (!kelompok) return PRODUK[opKey] || [];
    for (var i = 0; i < kelompok.length; i++) {
      if (kelompok[i].id === subDipilih) return kelompok[i].produk;
    }
    return [];
  }

  /* ---- Subkategori: dari field `tipe` resmi --------------------------
     Di kategori Pulsa `tipe` hampir tidak membedakan apa pun — 6 dari 7
     operator SELURUH produknya bertipe "Umum". Yang membedakan hanya
     Indosat, yang punya tipe kedua **"Combo Data"** (6 produk: "Indosat
     20.000 + 1 GB" dst).

     Itu pemisahan yang berguna: daftar pulsa diurutkan HARGA, jadi tanpa
     tab "Indosat 20.000 + 1 GB" (Rp26.525) duduk berjauhan dari "Indosat
     20.000" biasa dan gampang tertukar — dua kartu yang sekilas menawarkan
     nominal sama dengan harga beda jauh.

     CATATAN HASIL PEMERIKSAAN: **"Pulsa Transfer" TIDAK ADA di price-list
     ini** — 0 produk, baik di field `tipe` maupun di nama produk kategori
     Pulsa. Kalau nanti muncul, tipe-map.js akan menjadikannya tab sendiri
     memakai nama resminya + console.warn, tanpa perlu mengubah file ini.

     Operator dengan satu famili saja tetap mendapat daftar 1 elemen —
     produk-page.js menyembunyikan bilah tab kalau isinya < 2 (jadi 6
     operator lain tampil persis seperti sebelumnya, tanpa tab). */

  function subKategori(opKey) {
    var produk = produkSetelahSub(opKey);
    if (!produk.length) return [];

    var T = window.DikaTipe;
    if (!T) {
      console.error("pulsa: tipe-map.js belum di-link.");
      return [{ id: "umum", label: "Pulsa", produk: produk }];
    }
    /* labelUmum "Pulsa": keranjang umum bersama bernama "Kuota Reguler",
       dan itu janggal di halaman pulsa. Tanpa `min` — famili di sini cuma
       dua, tidak ada ekor yang perlu digabung. */
    return T.kelompokkan(produk, { ctx: SLUG + "/" + opKey, labelUmum: "Pulsa" });
  }

  /* ---- Kontrak untuk produk-page.js ----------------------------------
     Tab aktif dibaca dari #prodTabs — markup yang memang kontrak semua
     halaman produk. DIBACA, bukan dikendalikan; pemiliknya produk-page.js. */
  function subAktifId(daftar) {
    if (!daftar || !daftar.length) return null;
    var el = document.querySelector("#prodTabs .ptab.is-active");
    var id = el && el.dataset ? el.dataset.id : null;
    for (var i = 0; i < daftar.length; i++) if (daftar[i].id === id) return daftar[i].id;
    return daftar[0].id;
  }

  function subFor(opKey) {
    var daftar = subKategori(opKey);
    /* Kosong itu keadaan normal saat data masih dalam perjalanan ATAU
       member belum memilih sub-brand — kartu status sudah menjelaskannya,
       jadi sengaja TIDAK dicatat sebagai kesalahan di sini. */
    if (!daftar.length) {
      if (filterUI) filterUI.render([], (opKey || "-") + "|kosong");
      return [];
    }
    if (!filterUI) return daftar;

    /* Chip rentang harga dihitung dari isi TAB YANG SEDANG AKTIF, sebelum
       difilter — kalau dihitung dari hasil filter, chip yang baru ditekan
       akan membuang semua chip lain. */
    var aktifId = subAktifId(daftar);
    var aktif = null;
    daftar.forEach(function (s) { if (s.id === aktifId) aktif = s; });
    filterUI.render(aktif ? aktif.produk : [],
      opKey + "|" + (subDipilih || "-") + "|" + (aktifId || "-"));
    if (!aktif) return daftar;

    /* Filter diterapkan PALING AKHIR dan HANYA ke tab yang aktif, supaya
       `state.items` di produk-page.js persis sama dengan yang terlihat di
       grid — kalau tidak, indeks kartu yang diketuk menunjuk produk lain. */
    return daftar.map(function (s) {
      if (s.id !== aktifId) return s;
      return { id: s.id, label: s.label, produk: filterUI.terapkan(s.produk) };
    });
  }

  /* ---- Jumlah produk untuk halaman Margin ---------------------------- */

  /* Angkanya sekarang mengikuti katalog SUNGGUHAN, jadi hanya bisa
     didaftarkan setelah data ada. Di margin.html (tanpa api.js & tanpa
     jaringan) kita cukup membaca cache yang mungkin ditinggalkan halaman
     Pulsa di tab yang sama; kalau tidak ada, margin.js sudah menampilkan
     "—" dengan sendirinya — lebih jujur daripada angka dummy yang basi. */
  function daftarkanJumlah() {
    var K = window.DikaKatalogJumlah;
    if (!K || typeof K.daftarkan !== "function") return;
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

  /* Dijaga: file ini AMAN dimuat tanpa DikaProdukPage (mis. di margin.html
     untuk membaca jumlah produk saja) — di halaman aslinya (pulsa.html)
     controller ini SELALU ada, perilakunya tidak berubah sama sekali. */
  if (window.DikaProdukPage) {
    window.DikaProdukPage({
      slug: SLUG,
      sectionTitle: "Pilih Nominal",
      detailLabel: "Nominal",
      payTitle: "Pembayaran",
      payLine: function (item, op, phone) {
        return window.DikaProduk.namaLengkap(item) + " " + op.name +
          " untuk " + phone + " belum bisa diproses karena metode pembayaran masih " +
          "dalam pengerjaan. Terima kasih sudah menunggu!";
      },
      subFor: subFor,
      /* Penanda tambahan untuk key grid: tanpa ini operatornya tetap sama
         saat member berganti sub-brand / menekan chip filter, sehingga
         createGrid melewati render dan grid terlihat "macet". */
      renderKey: function () {
        return (subDipilih || "-") + "|" + (filterUI ? filterUI.kunciRender() : "-");
      },
      /* Grid kosong itu WAJAR selama katalog masih dimuat/gagal, atau
         selama member belum memilih sub-brand — kartu status yang
         menjelaskannya. Tanpa penanda ini, produk-page.js akan mencatat
         "daftar produk kosong" sebagai kesalahan data padahal bukan. */
      kosongWajar: function (opKey) {
        if (status !== "siap") return true;
        if (kelompokSub(opKey) && !subDipilih) return true;
        /* Operator yang memang tidak punya produk di katalog bukan
           kesalahan data — kartu status sudah menjelaskannya ke member. */
        return !(PRODUK[opKey] || []).length;
      },
    });

    /* Init sendiri SETELAH controller memasang miliknya (onReady punya
       penjaga anti double-init, dan urutannya mengikuti urutan daftar). */
    var mulai = function () {
      els.phone = document.getElementById("phoneInput");
      statusUI = UI ? UI.createStatus({ anchor: document.getElementById("prodSec") }) : null;
      /* Pemilih sub-brand duduk di antara kartu input dan kartu peringatan
         — urutan yang sama dengan #choiceSec di halaman pascabayar. */
      choiceUI = UI ? UI.createChoice({ anchor: document.getElementById("warnBox") }) : null;
      /* Chip filter di DALAM #prodSec, tepat di atas grid: ikut muncul &
         hilang bersama daftar produknya. */
      filterUI = UI ? UI.createFilterHarga({ anchor: document.getElementById("prodGrid") }) : null;

      if (choiceUI) choiceUI.onPick(function (id) {
        subDipilih = id;
        segarkanStatusUI();
        picuRenderUlang();       /* subFor() menggambar ulang chip filternya */
      });
      if (filterUI) filterUI.onPick(function () { picuRenderUlang(); });

      /* Status & chip ikut berubah saat member mengetik: skeleton muncul
         begitu operatornya terdeteksi, hilang lagi kalau dikosongkan. */
      if (els.phone) els.phone.addEventListener("input", function () {
        segarkanStatusUI();
      });

      /* Cache yang masih berlaku dipakai langsung — tidak ada kedip
         skeleton untuk perpindahan halaman yang cepat. */
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

  /* Dibuka untuk pengujian & diagnosa (dipakai skrip verifikasi):
     window.DikaPulsa.ringkasan() -> hasil pemetaan terakhir. */
  window.DikaPulsa = {
    ringkasan: function () { return ringkasan; },
    status: function () { return status; },
    produk: function () { return PRODUK; },
    muatUlang: function () { muat(true); },
    /* Keadaan penyaringan saat ini — dipakai skrip verifikasi dan berguna
       saat menelusuri "kenapa grid isinya begini". */
    debug: function () {
      var opKey = operatorTerdeteksi();
      return {
        opKey: opKey,
        subDipilih: subDipilih,
        filterAktif: filterUI ? filterUI.aktif() : null,
        setelahSub: opKey ? produkSetelahSub(opKey).length : 0,
        subAktif: opKey ? subAktifId(subKategori(opKey)) : null,
        subkategori: opKey
          ? subKategori(opKey).map(function (x) { return x.id + ":" + x.produk.length; })
          : null,
        setelahFilter: opKey
          ? subFor(opKey).reduce(function (n, x) { return n + x.produk.length; }, 0)
          : 0,
      };
    },
  };
})();
