/* ===========================================================================
   DikaPay — games.js
   Kategori "Games" (top up langsung ke akun) — DATA ASLI dari backend.
   Halaman TIPE B ketiga yang disambungkan, setelah streaming & emoney.

   String kategori di price-list: "Games" — SUDAH DIVERIFIKASI (2.236 produk,
   107 brand unik).

   ================= 1. TIGA TURUNAN GAME DIPISAH DARI INDUKNYA ============
   `Free Fire Max`, `PUBG Mobile Lite`, dan `PUBG New State Mobile` adalah
   GAME LAIN dengan akun sendiri, tapi alias induknya sempat menelan mereka
   ("free fire" menangkap "Free Fire Max", "pubg" menangkap dua sisanya) —
   91 produk tercampur ke kartu yang salah, dan member bisa membeli diamond
   PUBG Lite untuk akun PUBG Mobile biasa. Sekarang ketiganya punya id
   sendiri di brand-map.js: `ffmax`, `pubglite`, `pubgnewstate`.

   Pemisahan ini juga terbukti BUKAN cuma soal kerapian: menurut dokumentasi
   resmi Digiflazz, `Free Fire Max` TIDAK butuh Zone ID sedangkan
   `PUBG Mobile Lite` & `PUBG New State Mobile` BUTUH — padahal keduanya
   dulu mewarisi nilai dari game induknya lewat alias. Kalau ketiganya masih
   tergabung, dua game itu akan kehilangan field Zone ID-nya dan setiap
   transaksinya gagal di penyedia.

   ================= 2. PENCARIAN NAMA, BUKAN TAB GENRE ====================
   `tabs` genre (MOBA/Battle Royale/RPG/FPS) SUDAH DIHAPUS. Genre TIDAK ADA
   di price-list, jadi 107 nilainya harus ditulis tangan — dan genre yang
   ditebak salah MENYEMBUNYIKAN game dari member yang mencarinya, tanpa
   jejak. Gantinya `config.cari`: member mengetik nama game, daftar disaring
   real-time. Mengetik nama tidak bisa meleset.

   ================= 3. KEBUTUHAN Zone ID: DARI DOKUMENTASI RESMI =========
   Price-list TIDAK mengirim informasi ini (sudah diperiksa dua arah: nama
   produk & struktur record, dua-duanya nihil), jadi jawabannya datang dari
   **dokumentasi/dashboard resmi Digiflazz** dan disimpan di tabel
   ZONA_BUTUH / ZONA_TIDAK di bawah.

   Data itu menggantikan TOTAL penandaan "riset eksternal" & "asumsi" yang
   dipakai sebelumnya — beberapa di antaranya ternyata bertentangan dengan
   dokumentasi resmi. Sekarang tidak ada lagi tingkat keyakinan bertingkat:
   field Zone ID **WAJIB atau tidak dirender sama sekali**, tidak ada yang
   opsional — kecuali untuk brand yang belum ada di dokumentasi (game baru
   yang ditambahkan Digiflazz setelah data ini diambil), yang tetap memakai
   default aman.
   =========================================================================== */

(function () {
  "use strict";

  var SLUG = "games";
  var JENIS = "prabayar";
  var KATEGORI = "Games";

  /* ---- Kebutuhan Zone/Server ID per game -----------------------------
     SUMBER: **DOKUMENTASI/DASHBOARD RESMI DIGIFLAZZ** — sumber paling
     otoritatif yang ada. Data ini MENGGANTIKAN TOTAL semua penandaan
     sebelumnya ("riset eksternal" & "asumsi dari game induk"), karena
     beberapa di antaranya ternyata BERTENTANGAN dengan dokumentasi resmi.

     DIKOREKSI jadi User-ID-saja (sebelumnya ditandai BUTUH Zone lewat
     riset eksternal): Genshin Impact, Zenless Zone Zero, Ragnarok M:
     Eternal Love, Magic Chess.

     DIKOREKSI jadi BUTUH Zone (sebelumnya tidak): ARENA OF VALOR,
     Call of Duty MOBILE, PUBG Mobile Lite, PUBG New State Mobile. Dua yang
     terakhir sempat ditandai "asumsi" mengikuti PUBG Mobile — dan asumsi
     itu SALAH: induknya memang butuh Zone, tapi nilainya dulu ditulis
     `false` karena PUBG Mobile sendiri saat itu (keliru) dianggap tidak
     butuh. Pelajarannya: mewarisi nilai dari game induk mewarisi juga
     kesalahannya.

     ==================== DIKUNCI NAMA BRAND, BUKAN id ===================
     Tabel ini dikunci NAMA BRAND (dinormalisasi), bukan provider.id.
     Alasannya: sumbernya memang daftar NAMA, dan 94 dari 107 game tidak
     punya id terdaftar di brand-map.js (id-nya diturunkan dari nama).
     Mengunci ke id berarti menerjemahkan 107 nama ke 107 id dulu — satu
     lapis terjemahan tambahan yang bisa meleset tanpa ketahuan.

     Normalisasi membuang semua yang bukan huruf/angka, jadi beda spasi,
     kapital & tanda baca tidak masalah. Itu bukan kemewahan: dokumentasi
     menulis "Tom and Jerry: Chase" sedangkan price-list "Tom and Jerry :
     Chase" (ada spasi sebelum titik dua). Dengan exact match, satu game
     itu akan diam-diam jatuh ke default. */

  /* HANYA 6 game ini yang butuh User ID + Zone/Server ID. */
  var ZONA_BUTUH = [
    "ARENA OF VALOR",
    "Call of Duty MOBILE",
    "MOBILE LEGENDS",
    "PUBG MOBILE",
    "PUBG Mobile Lite",
    "PUBG New State Mobile",
  ];

  /* 101 game sisanya: User ID saja, field Zone ID TIDAK dirender. */
  var ZONA_TIDAK = [
    "AFK Journey", "AU2 MOBILE", "Age of Empires Mobile", "Arena Breakout",
    "Asphalt 9", "Astra Knights of Veda", "Banishers Faiths Entwined",
    "Bleach Soul Resonance", "Blood Strike", "Captain Tsubasa Ace", "Crossfire",
    "Crystal of Atlan", "Delta Force", "Destiny M", "Draconia Saga",
    "Dragon Nest M Classic", "Dragon Raja SEA", "Dragonheir Silent Gods",
    "Duet Night Abyss", "Eggy Party", "FC Mobile", "FREE FIRE", "Farlight 84",
    "Football Master 2", "Free Fire Max", "GARENA", "Genshin Impact",
    "Ghost Story", "Growtopia", "Guns of Glory", "Haikyu Fly High",
    "Harry Potter Magic Awakened", "Heaven Burns Red", "Heroes Evolved",
    "Heroic Uncle Kim", "Honkai Impact 3", "Honkai Star Rail", "Honor of Kings",
    "Identity V", "Isekai Feast", "King of Avalon", "Kings Choice", "Laplace M",
    "League of Legends PC", "Legends of Runeterra", "LifeAfter Credits",
    "Lineage2M", "Lords Mobile", "MU ORIGIN 3", "MU Origin 2", "Magic Chess",
    "Marvel Rivals", "Melojam", "Metal Slug Awakening", "Mob Rush",
    "Moonlight Blade M", "NBA Infinite", "Octopath Traveler", "Once Human",
    "One Punch Man", "Onmyoji Arena", "POINT BLANK", "Paw Tales Eternal Bond",
    "Persona 5 The Phantom X", "Pixel Gun 3D", "Pokemon Unite",
    "Punishing Gray Raven", "Racing Master", "Ragnarok Idle Adventure Plus",
    "Ragnarok M Classic", "Ragnarok M: Eternal Love", "Ragnarok Origin",
    "Ragnarok Twilight", "Rainbow Six Mobile", "Rememento White Shadow",
    "Revelation Infinite Journey", "Sausage Man", "Seal M Sea",
    "Sega Football Club Champions", "Snowbreak Containment Zone",
    "Soul Land New World", "Speed Drifters", "State of Survival", "Stumble Guys",
    "Super Sus", "Sword of Justice", "Teamfight Tactics Mobile",
    "The Ants Underground Kingdom", "The Moonlit Oath", "Tom and Jerry: Chase",
    "Tomb Busters", "Tower of Fantasy", "Undawn", "Valorant", "Watcher of Realms",
    "Werewolf (Party Game)", "Where Winds Meet", "Whiteout Survival Frost Star",
    "Wuthering Waves", "Zenless Zone Zero", "Zepeto",
  ];

  function normNama(s) {
    return String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

  var PETA_ZONA = {};
  ZONA_BUTUH.forEach(function (n) { PETA_ZONA[normNama(n)] = true; });
  ZONA_TIDAK.forEach(function (n) { PETA_ZONA[normNama(n)] = false; });

  /* -> true | false dari dokumentasi resmi, atau null kalau brand ini
     BELUM ada di dokumentasi (game yang ditambahkan Digiflazz setelah data
     ini diambil). Untuk yang null, halaman memakai default aman: User ID
     wajib + Zone ID OPSIONAL — karena dua kemungkinan salahnya tidak sama
     beratnya. Zone ID muncul padahal tak dibutuhkan cuma satu kotak kosong
     yang boleh dilewati; Zone ID TIDAK muncul padahal dibutuhkan berarti
     transaksi gagal total di penyedia setelah member membayar. */
  function zonaResmi(brand) {
    var k = normNama(brand);
    return Object.prototype.hasOwnProperty.call(PETA_ZONA, k) ? PETA_ZONA[k] : null;
  }

  /* Warna & inisial kartu game. Price-list tidak punya konsep ini, jadi
     yang populer diberi identitasnya sendiri; sisanya memakai warna
     turunan-nama (lihat warnaDariNama) supaya 107 kartu tidak jadi 107
     kotak biru yang sama persis. Murni presentasi. */
  /* Warna brand per game. Field `short` (inisial dua huruf) SUDAH DIHAPUS:
     halaman ini memakai `markIcon` (ikon gamepad) untuk semua kartu, jadi
     `initials()` di provider-page.js tidak pernah dipanggil di sini —
     meninggalkannya hanya jadi data mati yang menyesatkan pembaca
     berikutnya. Halaman Tipe B LAIN tetap memakai inisial dan tetap boleh
     menyetel `short`. */
  var TAMPILAN = {
    ml:           { name: "Mobile Legends",        color: "#1B6CE8" },
    ff:           { name: "Free Fire",             color: "#F26B1D" },
    ffmax:        { name: "Free Fire Max",         color: "#C0451B" },
    pubg:         { name: "PUBG Mobile",           color: "#C79A2E" },
    pubglite:     { name: "PUBG Mobile Lite",      color: "#8A6B1F" },
    pubgnewstate: { name: "PUBG New State",        color: "#4A5568" },
    genshin:      { name: "Genshin Impact",        color: "#3A7CA5" },
    valo:         { name: "Valorant",              color: "#E23744" },
  };

  /* Hue stabil dari nama — game yang sama selalu dapat warna yang sama,
     jadi member bisa mengenalinya lewat warna walau daftarnya panjang.

     WAJIB mengembalikan HEX `#rrggbb`, bukan `hsl(...)`: `UI.brandVars()`
     mengurai warna lewat `hexRgb()` yang hanya menerima hex. Diberi hsl,
     ia jatuh ke jalur cadangan yang menyetel warna TEKS dan LATAR ke nilai
     yang sama — inisialnya ada di DOM tapi tidak terlihat sama sekali.
     Ketahuan dari screenshot: 99 kotak berwarna tanpa huruf. */
  function warnaDariNama(nama) {
    var h = 0;
    for (var i = 0; i < nama.length; i++) h = (h * 31 + nama.charCodeAt(i)) % 360;
    return hslHex(h / 360, 0.42, 0.42);
  }

  function hslHex(h, s, l) {
    var f = function (n) {
      var k = (n + h * 12) % 12;
      var a = s * Math.min(l, 1 - l);
      var v = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
      return ("0" + Math.round(v * 255).toString(16)).slice(-2);
    };
    return "#" + f(0) + f(8) + f(4);
  }

  var PROVIDERS = [];
  var status = "idle";
  var pesanGagal = "";
  var ringkasan = null;
  var belumDikonfigurasi = [];
  var statusUI = null;
  var halaman = null;

  function lebihBaik(baru, lama) {
    var rusakBaru = !!baru.gangguan, rusakLama = !!lama.gangguan;
    if (rusakBaru !== rusakLama) return rusakLama;
    return baru.harga_modal < lama.harga_modal;
  }

  /* Judul kartu untuk game yang belum punya entri TAMPILAN: pakai nama
     brand dari Digiflazz apa adanya, cuma dirapikan kapitalisasinya
     ("MOBILE LEGENDS" -> "Mobile Legends"). Nama yang sudah bercampur
     huruf besar-kecil dibiarkan (mis. "Ragnarok M: Eternal Love"). */
  function rapikan(nama) {
    var s = String(nama || "").trim();
    if (!s) return s;
    if (s !== s.toUpperCase()) return s;      /* sudah rapi, jangan disentuh */
    return s.toLowerCase().replace(/(^|[\s:_-])([a-z0-9])/g, function (m, a, b) {
      return a + b.toUpperCase();
    });
  }

  function bangun(daftar) {
    var BM = window.DikaBrandMap;
    if (!BM) {
      console.error("games: brand-map.js belum di-link — brand tidak bisa dipetakan.");
      return [];
    }
    var per = {}, namaAsli = {}, dilewati = 0, memoId = {};

    (daftar || []).forEach(function (p) {
      if (!p || typeof p.harga_modal !== "number" || !isFinite(p.harga_modal)) { dilewati++; return; }
      /* Brand yang belum punya id di brand-map.js TIDAK dibuang: id-nya
         diturunkan dari nama brand itu sendiri. Dengan 107 game (dan
         bertambah terus), menuntut tiap game didaftarkan dulu berarti
         ratusan produk hilang diam-diam dari halaman. */
      /* Dimemoisasi per NAMA BRAND: 2.236 baris cuma memuat 107 brand,
         jadi memanggil pencocok tiap baris itu pemborosan murni.
         `diam=true` — brand di luar tabel memang diharapkan di sini dan
         ditangani beberapa baris di bawah; ringkasannya dilaporkan sendiri
         di akhir bangun(). */
      var kb = String(p.brand || "");
      if (!(kb in memoId)) memoId[kb] = BM.provider(SLUG, kb, null, true);
      var id = memoId[kb];
      var dikenal = !!id;
      if (!id) {
        id = String(p.brand || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        if (!id) { dilewati++; return; }
      }
      if (!namaAsli[id]) namaAsli[id] = { brand: p.brand, dikenal: dikenal };

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

    belumDikonfigurasi = [];
    var out = Object.keys(per).map(function (id) {
      var t = TAMPILAN[id] || {};
      var nama = t.name || rapikan(namaAsli[id].brand);
      /* Dicocokkan ke NAMA BRAND ASLI dari Digiflazz, bukan ke `nama`
         yang sudah dirapikan kapitalisasinya — dokumentasi resmi memakai
         penulisan brand yang asli. */
      var z = zonaResmi(namaAsli[id].brand);
      if (z === null) belumDikonfigurasi.push({ id: id, nama: nama, produk: per[id].length });
      return {
        id: id,
        name: nama,
        color: t.color || warnaDariNama(nama),
        /* needZone = TAMPILKAN field Zone ID. */
        needZone: z === null ? true : z === true,
        /* zonaWajib = HARUS diisi. Hanya kalau dokumentasi resmi bilang
           begitu; brand di luar dokumentasi dapat field OPSIONAL. */
        zonaWajib: z === true,
        zonaSumber: z === null ? "belum" : "resmi",
        jumlah: per[id].length,
        produk: per[id],
      };
    }).sort(function (a, b) { return b.jumlah - a.jumlah; });

    var total = 0;
    out.forEach(function (b) { total += b.jumlah; });
    ringkasan = {
      diterima: (daftar || []).length, terpakai: total,
      brand: out.length, digabung: digabung, dilewati: dilewati,
      belumDikonfigurasi: belumDikonfigurasi.length,
      zonaResmi: out.filter(function (b) { return b.zonaSumber === "resmi"; }).length,
      zonaWajib: out.filter(function (b) { return b.zonaWajib; }).length,
      gangguan: Object.keys(per).reduce(function (n, id) {
        return n + per[id].filter(function (x) { return x.gangguan; }).length;
      }, 0),
    };
    console.info("games: " + total + " produk siap dari " + ringkasan.diterima +
      " produk kategori " + KATEGORI + " (" + out.length + " game)");
    console.info("games: kebutuhan Zone ID — " + ringkasan.zonaResmi +
      " game dari dokumentasi resmi Digiflazz (" + ringkasan.zonaWajib +
      " butuh Zone ID), " + belumDikonfigurasi.length +
      " brand di luar dokumentasi (default aman: Zone ID opsional)." +
      (belumDikonfigurasi.length
        ? " Daftarnya: window.DikaGames.perluKeputusan()"
        : ""));
    return out;
  }

  function daftarkanJumlah() {
    var K = window.DikaKatalogJumlah;
    if (!K || typeof K.daftarkan !== "function") return;
    K.daftarkan(SLUG, PROVIDERS, "provider");
  }

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
    if (status === "memuat") { aturBrandSec(false); statusUI.memuat(6); return; }
    if (status === "siap" && !PROVIDERS.length) {
      aturBrandSec(false);
      statusUI.kosong("Belum ada game yang tersedia saat ini.");
      return;
    }
    aturBrandSec(true);
    statusUI.sembunyi();
  }

  function muat(paksa) {
    if (!window.DikaApi) {
      console.error("games: api.js belum di-link — data produk tidak bisa dimuat.");
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
        if (halaman) halaman.segarkan();
      })
      .catch(function (err) {
        console.error("games: gagal memuat katalog:", err && (err.sebab || err.message), err);
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

  if (window.DikaProviderPage) {
    halaman = window.DikaProviderPage({
    /* Ikon bertema game menggantikan inisial dua huruf ("ML", "FF", "PG")
       — keputusan produk. Inisial itu tidak memberi tahu apa-apa dan
       terbaca seperti placeholder yang belum diisi. Sengaja SATU ikon
       generik untuk semua game (stik/gamepad), bukan logo asli tiap game:
       logo asli berarti ratusan aset berhak cipta yang harus dirawat, dan
       untuk 107 game itu tidak sepadan. Identitas tiap kartu tetap ada
       lewat WARNA brand-nya. */
    markIcon:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M7.5 7h9a5 5 0 0 1 4.9 4.1l.8 4.3A2.6 2.6 0 0 1 19.7 18c-.9 0-1.7-.5-2.1-1.3L16.7 15H7.3l-.9 1.7c-.4.8-1.2 1.3-2.1 1.3a2.6 2.6 0 0 1-2.5-2.6l.8-4.3A5 5 0 0 1 7.5 7z"/>' +
      '<path d="M7.3 10.2v2.2M6.2 11.3h2.2"/>' +
      '<circle cx="15.6" cy="10.8" r=".9" fill="currentColor" stroke="none"/>' +
      '<circle cx="17.6" cy="12.6" r=".9" fill="currentColor" stroke="none"/>' +
      "</svg>",
      slug: SLUG,
      brandTitle: "Pilih Game",
      nominalTitle: "Pilih Nominal",
      brandLabel: "Game",
      detailLabel: "Item",
      payTitle: "Pembayaran",
      payLine: function (item, game, account) {
        return window.DikaProduk.namaLengkap(item) + " " + game.name +
          " untuk User ID " + (account && account.userid ? account.userid : "-") +
          " belum bisa diproses karena metode pembayaran masih dalam pengerjaan. " +
          "Terima kasih sudah menunggu!";
      },
      /* Menggantikan tab genre — lihat catatan 2 di header. */
      cari: { placeholder: "Cari nama game...", min: 12 },

      /* User ID selalu; Zone/Server ID hanya untuk game yang kebutuhannya
         SUDAH diketahui. Keduanya BUKAN nomor kontak, jadi tanpa `helper` —
         tombol "ambil dari kontak" di situ menyesatkan. */
      accountFields: function (game) {
        var f = [{
          key: "userid",
          label: "User ID",
          placeholder: "Contoh: 123456789",
          hint: "User ID bisa dilihat di halaman profil dalam game.",
          digitsOnly: true,
          inputmode: "numeric",
          min: 5,
          max: 20,
        }];
        if (game && game.needZone) {
          /* Dua bentuk:
             - ada di dokumentasi resmi & butuh Zone -> WAJIB, teksnya tegas;
             - brand di LUAR dokumentasi             -> OPSIONAL, teksnya
               menjelaskan bahwa member boleh mengosongkannya.
             `required: false` sudah didukung provider-page.js: kosong =
             lolos validasi, terisi = tetap dicek panjang minimalnya. */
          var wajib = !!game.zonaWajib;
          f.push({
            key: "zone",
            label: wajib ? "Zone ID / Server" : "Zone ID (opsional)",
            placeholder: wajib ? "Contoh: 2001" : "Isi kalau game kamu memintanya",
            hint: wajib
              ? "Angka dalam kurung di sebelah User ID."
              : "Sebagian game meminta Zone/Server ID di sebelah User ID. " +
                "Kosongkan saja kalau game kamu tidak memintanya.",
            required: wajib,
            digitsOnly: true,
            inputmode: "numeric",
            min: 3,
            max: 10,
          });
        }
        return f;
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

  window.DikaGames = {
    ringkasan: function () { return ringkasan; },
    status: function () { return status; },
    provider: function () { return PROVIDERS; },
    muatUlang: function () { muat(true); },
    /* Game yang `needZone`-nya belum diputuskan, urut produk terbanyak. */
    perluKeputusan: function () {
      return belumDikonfigurasi.slice().sort(function (a, b) { return b.produk - a.produk; });
    },
  };
})();
