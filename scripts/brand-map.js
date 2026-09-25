/* ===========================================================================
   DikaPay — brand-map.js
   PEMETAAN `brand` Digiflazz -> kunci internal DikaPay.

     window.DikaBrandMap = {
       operator(brand, namaProduk?)   // -> "telkomsel" | "three" | ... | null
       provider(slug, brand)          // -> provider.id di file data slug itu
       jenisEmoney(brandAtauId)       // -> "Kartu" | "E-Wallet" | null
       subBrand(brand, namaProduk?)   // -> { opKey, id, label } | null  (by.U)
       pisahSubBrand(opKey, produk)   // -> [{ id, label, produk }] | null
       OPERATOR, PROVIDER, EMONEY, SUB_BRAND   // tabelnya, untuk diperiksa/diuji
     }

   ============================= KENAPA MODUL INI ADA =========================
   `kategori-map.js` menjawab "produk ini masuk HALAMAN mana". Modul ini
   menjawab pertanyaan berikutnya: "di dalam halaman itu, masuk OPERATOR /
   PROVIDER mana". Sebelum ini tidak ada jawabannya sama sekali — file data
   menyimpan produk berkunci internal (`PRODUK["telkomsel"]`,
   `provider.id === "ml"`) sementara Digiflazz mengirim `brand: "TELKOMSEL"`,
   `"MOBILE LEGENDS"`. Tanpa jembatan ini produk hasil sync tidak akan
   menemukan tempatnya.

   ATURAN PENCOCOKAN sama dengan `cocokkan()` di kategori-map.js:
   case-insensitive, dan ALIAS TERPANJANG MENANG. Itu penting di sini juga —
   "xl" ada di dalam "xl axis", dan "vision" ada di "mnc vision" maupun
   "k vision".

   Pencocokan memakai BATAS KATA, bukan `indexOf` telanjang. "tri" sebagai
   substring bisa muncul di kata lain yang tidak ada hubungannya; sebagai
   kata utuh ia hanya berarti operator Tri.
   ==========================================================================

   TODO fase 2: alias di bawah adalah EKSPEKTASI penulisan brand Digiflazz,
   bukan fakta — repo ini belum pernah menyentuh API-nya. WAJIB dicocokkan
   ulang dengan price-list asli pada sync pertama. Brand yang tidak cocok
   mengembalikan null dan DICATAT (console.warn), jangan dibuang diam-diam:
   pola yang sama seperti slug "lainnya" di kategori-map.js.
   =========================================================================== */

(function () {
  "use strict";

  /* ---- Operator (Tipe A + hp-pasca + voucher-act) --------------------
     Kunci = opKey internal di operator-detect.js. JANGAN diganti mengikuti
     penulisan Digiflazz — opKey juga dipakai hasil deteksi prefix nomor,
     jadi ia harus tetap satu bentuk di seluruh app.

     "TRI" -> "three" adalah kasus yang paling gampang terlewat: Digiflazz
     menulis "TRI", app memakai "three", dan tidak ada satu huruf pun yang
     sama untuk dicocokkan otomatis. */
  var OPERATOR = {
    telkomsel: ["telkomsel", "tsel", "simpati", "as", "halo", "kartu halo", "by u", "byu"],
    indosat:   ["indosat", "isat", "im3", "mentari", "matrix"],
    xl:        ["xl", "xl axiata"],
    axis:      ["axis"],
    three:     ["three", "tri", "3"],
    smartfren: ["smartfren", "smart"],
  };

  /* ---- SUB-BRAND: satu blok prefix, DUA katalog berbeda --------------
     by.U memakai blok prefix yang SAMA PERSIS dengan Telkomsel, jadi
     deteksi nomor mustahil membedakannya — `operator()` di atas memang
     mengembalikan "telkomsel" untuk keduanya, dan itu benar: kartunya
     memang berjalan di jaringan Telkomsel.

     Tapi PRODUKNYA tidak saling berlaku: pulsa by.U hanya masuk ke nomor
     by.U, pulsa Telkomsel biasa hanya ke nomor Telkomsel biasa. Kalau
     keduanya digabung dalam satu daftar, member pasti akan membeli produk
     yang gagal di penyedia. Karena itu produknya DIPISAH di sini, dan
     halaman menampilkan pemilih sub-brand sebelum katalognya muncul.

     Ini BUKAN kasus Pulsa saja: pada price-list asli, by.U muncul di 6
     kategori prabayar sekaligus (Pulsa 102, Data 94, Aktivasi Voucher 48,
     Voucher 36, Paket SMS & Telpon 5, Aktivasi Perdana 1). Karena itu
     tabel + `pisahSubBrand()` di bawah hidup di sini, bukan di pulsa.js —
     kategori berikutnya cukup memakainya, tidak menyalinnya.

     Kunci luar = opKey induk. `utama` = label untuk produk yang BUKAN
     sub-brand (sisa katalog operator itu). */
  var SUB_BRAND = {
    telkomsel: {
      utama: "Telkomsel",
      anak: [
        { id: "byu", label: "by.U", alias: ["by u", "byu"] },
      ],
    },
  };

  /* -> { opKey, id, label } kalau brand ini sub-brand, null kalau bukan. */
  function subBrand(brand, namaProduk) {
    var hasil = null;
    Object.keys(SUB_BRAND).forEach(function (opKey) {
      SUB_BRAND[opKey].anak.forEach(function (anak) {
        var tabel = {};
        tabel[anak.id] = anak.alias;
        /* Alias sub-brand dicocokkan ke brand dulu, baru ke nama produk —
           urutan yang sama dengan operator()/provider(). Alias angka
           dikecualikan di jalur nama, alasan yang sama. */
        if (cocokTabel(tabel, brand) || (namaProduk && cocokTabel(tabel, namaProduk, true))) {
          hasil = { opKey: opKey, id: anak.id, label: anak.label };
        }
      });
    });
    return hasil;
  }

  /* Pecah SATU daftar produk milik satu operator menjadi kelompok
     sub-brand. Bentuk hasilnya `[{ id, label, produk }]` — SAMA dengan
     kontrak subkategori yang sudah dipakai produk-page.js, supaya
     pemanggil tidak perlu belajar bentuk baru.

     Mengembalikan `null` kalau operator ini memang tidak punya sub-brand
     ATAU semua produknya jatuh ke satu kelompok saja — pemanggil lalu
     memakai daftar aslinya apa adanya, tanpa memunculkan pemilih yang
     isinya cuma satu pilihan. */
  function pisahSubBrand(opKey, produk) {
    var conf = SUB_BRAND[opKey];
    if (!conf || !Array.isArray(produk) || !produk.length) return null;

    var utama = [];
    var perAnak = {};
    conf.anak.forEach(function (a) { perAnak[a.id] = []; });

    produk.forEach(function (p) {
      var s = subBrand(p.brand, p.nama);
      if (s && s.opKey === opKey && perAnak[s.id]) perAnak[s.id].push(p);
      else utama.push(p);
    });

    var kelompok = [];
    if (utama.length) kelompok.push({ id: opKey, label: conf.utama, produk: utama });
    conf.anak.forEach(function (a) {
      if (perAnak[a.id].length) kelompok.push({ id: a.id, label: a.label, produk: perAnak[a.id] });
    });
    return kelompok.length > 1 ? kelompok : null;
  }

  /* AXIS vs XL — Digiflazz kadang menaruh produk Axis di bawah brand "XL"
     (keduanya satu perusahaan sejak merger). App SENGAJA memisahkannya:
     `axis` punya blok prefix sendiri (0831/0832/0833/0838) dan halaman
     produknya menampilkan katalog berbeda.

     Karena brand saja tidak cukup untuk membedakannya, `operator()`
     menerima `namaProduk` sebagai pemutus: nama produk Axis hampir selalu
     memuat kata "AXIS" ("AXIS Bronet 3GB"). Kalau brand-nya XL TAPI nama
     produknya menyebut Axis, hasilnya `axis`.

     Kalau nanti terbukti Digiflazz memisahkan keduanya dengan rapi di
     `brand`, aturan ini tidak mengganggu — ia hanya aktif saat brand XL
     dan nama produknya benar-benar menyebut Axis. */
  function operator(brand, namaProduk) {
    var key = cocokTabel(OPERATOR, brand);
    if (key === "xl" && sebutAxis(namaProduk)) return "axis";
    /* Upaya kedua lewat NAMA PRODUK — tapi alias yang murni angka
       DIKECUALIKAN di jalur ini. Alasannya nyata, ketahuan saat sync
       pertama dengan price-list asli: alias "3" (brand Tri) cocok sebagai
       kata utuh di dalam "by.U 3.000" (ternormalisasi jadi "by u 3 000"),
       sehingga pulsa by.U 3 ribu mendarat di daftar produk Tri. Di NAMA
       produk, angka hampir selalu nominal/kuota — bukan identitas brand.
       Di `brand` sendiri "3" tetap sah (Digiflazz memang bisa menulis
       brand "3"), jadi pengecualian ini HANYA untuk jalur nama. */
    if (!key && namaProduk) key = cocokTabel(OPERATOR, namaProduk, true);
    if (!key) lapor("operator", brand, namaProduk);
    return key;
  }

  function sebutAxis(namaProduk) {
    return /\baxis\b/i.test(String(namaProduk || ""));
  }

  /* ---- Provider per halaman Tipe B -----------------------------------
     Kunci luar = slug halaman (sama dengan kategori-map.js), kunci dalam =
     `provider.id` di file data halaman itu. Menambah provider baru berarti
     menambah entri di SINI juga — kalau tidak, produknya tidak akan
     menemukan tab-nya dan cuma tercatat sebagai brand tak dikenal. */
  var PROVIDER = {
    /* Turunan sebuah game adalah GAME LAIN dengan akun sendiri, jadi
       masing-masing punya id terpisah. Tanpa ini alias induknya menelan
       mereka: "Free Fire Max" tertangkap "free fire", "PUBG Mobile Lite" &
       "PUBG New State Mobile" tertangkap "pubg" — dan 91 produk dari tiga
       game itu akan tercampur ke kartu induknya. Member lalu bisa membeli
       diamond PUBG Lite untuk akun PUBG Mobile biasa.

       Pemisahnya BUKAN urutan penulisan, tapi aturan "alias TERPANJANG
       menang" di cocokTabel(): "free fire max" (13) mengalahkan
       "free fire" (9), "pubg mobile lite" (16) & "pubg new state mobile"
       (21) mengalahkan "pubg mobile" (11). */
    games: {
      ml:           ["mobile legends", "mobile legend", "ml", "mlbb"],
      ff:           ["free fire", "freefire", "ff"],
      ffmax:        ["free fire max", "freefire max", "ff max"],
      pubg:         ["pubg mobile", "pubgm", "pubg"],
      pubglite:     ["pubg mobile lite", "pubg lite", "pubgm lite"],
      pubgnewstate: ["pubg new state mobile", "pubg new state", "new state mobile"],
      genshin:      ["genshin impact", "genshin"],
      valo:         ["valorant", "valo"],
      /* Didaftarkan supaya game-game populer ini punya provider.id yang
         STABIL (dipakai kunci warna/inisial di TAMPILAN games.js dan enak
         dibaca saat menelusuri data), bukan id turunan nama yang ikut
         berubah tiap Digiflazz mengubah penulisan brand.

         CATATAN: kebutuhan Zone ID TIDAK lagi dikunci ke id ini — tabel
         ZONA_BUTUH/ZONA_TIDAK di games.js dikunci NAMA BRAND, karena
         sumber resminya memang daftar nama dan 94 dari 107 game tidak
         punya id terdaftar di sini. */
      codm:         ["call of duty mobile", "call of duty", "codm"],
      undawn:       ["undawn"],
      zzz:          ["zenless zone zero"],
      /* Mode di dalam Mobile Legends, tapi Digiflazz menjualnya sebagai
         brand TERPISAH ("Magic Chess", 22 produk) — jadi id-nya sendiri.
         Aliasnya sengaja TIDAK memuat "ml"/"mobile legends": itu akan
         membuatnya tertelan kartu Mobile Legends yang 400 produk. Bukan
         teoretis: dokumentasi resmi menyatakan Mobile Legends BUTUH Zone ID
         sedangkan Magic Chess TIDAK, jadi kalau tergabung, salah satunya
         pasti mendapat form yang salah. */
      magicchess:   ["magic chess"],
      /* HANYA nama lengkapnya. Alias pendek "ragnarok m" DILARANG di sini:
         price-list punya 5 game Ragnarok terpisah, dan "Ragnarok M Classic"
         akan tertangkap alias itu lalu mewarisi needZone milik game lain. */
      ragnarokm:    ["ragnarok m eternal love", "ragnarok m: eternal love"],
    },
    streaming: {
      netflix: ["netflix"],
      spotify: ["spotify"],
      vidio:   ["vidio"],
      disney:  ["disney hotstar", "disney+ hotstar", "disney plus", "disney", "hotstar"],
      wetv:    ["wetv", "we tv"],
      viu:     ["viu"],
    },
    tv: {
      indihome:    ["indihome", "indi home"],
      transvision: ["transvision", "trans vision"],
      kvision:     ["k vision", "k-vision", "kvision"],
      mnc:         ["mnc vision", "mnc"],
      firstmedia:  ["first media", "firstmedia"],
    },
    /* Kategori "Voucher" ternyata CAMPURAN: 78%-nya voucher data OPERATOR
       (TELKOMSEL 273, INDOSAT 204, AXIS 157, …), sisanya merchant/game.
       Operatornya didaftarkan di sini supaya identitasnya (nama, warna,
       id) konsisten dengan halaman lain; merchant yang belum terdaftar
       memakai id turunan nama — dengan 44 brand dan terus bertambah,
       menuntut tiap merchant didaftarkan dulu berarti ratusan produk
       hilang diam-diam (pelajaran dari Games & Aktivasi Voucher). */
    voucher: {
      /* --- operator seluler --- */
      tsel:      ["telkomsel", "tsel"],
      isat:      ["indosat", "isat", "im3"],
      xl:        ["xl", "xl axiata"],
      axis:      ["axis"],
      three:     ["three", "tri", "3"],
      smart:     ["smartfren", "smart"],
      byu:       ["by u", "byu"],
      /* --- merchant & game --- */
      alfamart:  ["alfamart", "alfa"],
      indomaret: ["indomaret", "indomart"],
      tokopedia: ["tokopedia", "toped"],
      shopee:    ["shopee"],
      grab:      ["grab"],
      /* Region/mata uang DIPISAH — ini bukan kerapian, ini uang member:
         "GOOGLE PLAY US REGION" $25 = Rp431.025 sedangkan
         "GOOGLE PLAY INDONESIA" Rp5.000 = Rp4.882, dan kode US tidak bisa
         ditebus di akun Indonesia. Sama untuk Steam: brand "Steam Wallet"
         isinya kode RINGGIT MALAYSIA (MYR 5 = Rp21.573), sedangkan
         "Steam Wallet (IDR)" baru yang Rupiah. Kalau dilebur satu kartu,
         daftarnya terurut harga dan keduanya berselang-seling.
         Pemisahnya aturan "alias TERPANJANG menang". */
      gplay:     ["google play indonesia", "google play", "gplay"],
      "gplay-us": ["google play us region", "google play us"],
      steam:     ["steam wallet indonesia", "steam wallet", "steam"],
      "steam-idr": ["steam wallet idr"],
      garena:    ["garena shell", "garena"],
      razer:     ["razer gold", "razer"],
      unipin:    ["unipin voucher", "unipin", "uni pin"],
    },
    /* voucher-act memakai operator, tapi provider.id-nya SINGKAT
       ("tsel", bukan "telkomsel") — jadi tidak bisa memakai tabel
       OPERATOR apa adanya. */
    "voucher-act": {
      tsel:  ["telkomsel", "tsel"],
      isat:  ["indosat", "isat", "im3"],
      xl:    ["xl", "xl axiata"],
      axis:  ["axis"],
      three: ["three", "tri", "3"],
      smart: ["smartfren", "smart"],
      /* by.U TIDAK butuh pemilih sub-brand di kategori ini. Di halaman
         TIPE A (pulsa/data) ia harus dipisah lewat pisahSubBrand() karena
         `operator()` memetakannya ke "telkomsel" — nomornya memakai blok
         prefix yang sama. Di sini brand-nya sudah datang terpisah dari
         Digiflazz ("by.U", 50 produk vs "TELKOMSEL" 227) dan halamannya
         Tipe B, jadi cukup jadi KARTU PENYEDIA sendiri. */
      byu:   ["by u", "byu"],
    },
    emoney: {
      mandiri:   ["mandiri e-toll", "mandiri etoll", "e-money mandiri", "mandiri emoney", "mandiri"],
      brizzi:    ["bri brizzi", "brizzi"],
      tapcash:   ["bni tapcash", "tapcash"],
      flazz:     ["bca flazz", "flazz"],
      jakcard:   ["dki jakcard", "jakcard", "bank dki"],
      ovo:       ["ovo"],
      dana:      ["dana"],
      gopay:     ["gopay", "go pay"],
      shopeepay: ["shopeepay", "shopee pay"],
      linkaja:   ["linkaja", "link aja"],
    },
  };

  /* `diam` = jangan catat brand tak dikenal ke console.

     Dipakai pemanggil yang memang MENGHARAPKAN brand di luar tabel dan
     menanganinya sendiri — halaman Games, yang 99 dari 107 brand-nya
     belum terdaftar (dan id-nya diturunkan dari nama brand). Di sana
     peringatan per baris bukan cuma bising (1.170 baris dalam sekali buka
     halaman), tapi juga SALAH ARAH: sarannya "tambahkan aliasnya", padahal
     tidak ada yang perlu diperbaiki. Pemanggil seperti itu melaporkan
     ringkasannya sendiri. Tanpa `diam`, perilakunya persis seperti dulu. */
  function provider(slug, brand, namaProduk, diam) {
    var tabel = PROVIDER[slug];
    if (!tabel) {
      console.warn("brand-map: belum ada tabel provider untuk slug:", slug);
      return null;
    }
    var id = cocokTabel(tabel, brand);
    /* Alias angka dikecualikan di jalur NAMA PRODUK — alasan yang sama
       persis dengan operator(); `voucher-act` juga punya alias "3". */
    if (!id && namaProduk) id = cocokTabel(tabel, namaProduk, true);
    if (!id && !diam) lapor("provider[" + slug + "]", brand, namaProduk);
    return id;
  }

  /* ---- E-Money: kartu fisik vs dompet digital ------------------------
     Digiflazz mengirim SATU kategori "E-Money" untuk keduanya, jadi
     pembedanya harus dari brand. Nilai yang dikembalikan sama persis
     dengan field `sub` di emoney.js — dipakai apa adanya, jangan
     diterjemahkan lagi di pemanggil. */
  var EMONEY = {
    Kartu: ["mandiri", "brizzi", "tapcash", "flazz", "jakcard"],
    "E-Wallet": ["ovo", "dana", "gopay", "shopeepay", "linkaja"],
  };

  function jenisEmoney(brandAtauId) {
    /* Terima provider.id (hasil provider("emoney", ...)) maupun brand
       mentah dari Digiflazz — dua-duanya dipakai di titik yang berbeda. */
    var id = PROVIDER.emoney[brandAtauId] ? brandAtauId : provider("emoney", brandAtauId);
    if (!id) return null;
    var jenis = null;
    Object.keys(EMONEY).forEach(function (j) {
      if (EMONEY[j].indexOf(id) !== -1) jenis = j;
    });
    if (!jenis) console.warn("brand-map: provider e-money belum punya jenis:", id);
    return jenis;
  }

  /* ---- Mesin pencocok ------------------------------------------------ */

  function norm(v) {
    return String(v == null ? "" : v)
      .toLowerCase()
      .replace(/[^a-z0-9+]+/g, " ")     /* "+" dipertahankan: "disney+" */
      .replace(/\s+/g, " ")
      .trim();
  }

  /* Alias harus muncul sebagai KATA UTUH (atau rangkaian kata utuh).
     `indexOf` telanjang akan menganggap "as" cocok di dalam "kelas", dan
     "3" cocok di dalam "3gb" — dua-duanya operator yang salah. */
  function adaKata(teks, alias) {
    if (!teks || !alias) return false;
    return (" " + teks + " ").indexOf(" " + alias + " ") !== -1;
  }

  /* ALIAS TERPANJANG MENANG — sama seperti cocokkan() di kategori-map.js.
     Tanpa ini "xl" menelan "xl axiata", dan "mnc" menelan "mnc vision".

     `tanpaAngka` dipakai saat teks yang dicocokkan adalah NAMA PRODUK
     (bukan brand): alias yang seluruhnya angka dibuang, karena angka di
     nama produk itu nominal/kuota, bukan penanda brand. Lihat alasan
     lengkapnya di operator(). */
  function cocokTabel(tabel, teks, tanpaAngka) {
    var t = norm(teks);
    if (!t) return null;
    var menang = null;
    var panjang = 0;
    Object.keys(tabel).forEach(function (kunci) {
      tabel[kunci].forEach(function (alias) {
        var a = norm(alias);
        if (tanpaAngka && /^[0-9]+$/.test(a)) return;
        if (a.length > panjang && adaKata(t, a)) {
          panjang = a.length;
          menang = kunci;
        }
      });
    });
    return menang;
  }

  /* Brand tak dikenal TIDAK dibuang diam-diam — produk yang tidak
     menemukan tempatnya harus meninggalkan jejak, sama seperti slug
     "lainnya" di kategori-map.js. */
  function lapor(konteks, brand, namaProduk) {
    console.warn("brand-map: brand tidak dikenal untuk " + konteks + ":",
      JSON.stringify(brand), namaProduk ? "(produk: " + namaProduk + ")" : "",
      "- tambahkan aliasnya di brand-map.js.");
  }

  window.DikaBrandMap = {
    OPERATOR: OPERATOR,
    PROVIDER: PROVIDER,
    EMONEY: EMONEY,
    SUB_BRAND: SUB_BRAND,
    operator: operator,
    provider: provider,
    jenisEmoney: jenisEmoney,
    subBrand: subBrand,
    pisahSubBrand: pisahSubBrand,
  };
})();
