/* ===========================================================================
   DikaPay — tipe-map.js
   PENGELOMPOKAN SUBKATEGORI DARI FIELD `tipe` RESMI DIGIFLAZZ.
   window.DikaTipe

   ======================= KENAPA FILE INI MENGGANTIKAN TEBAKAN NAMA ========
   Sampai sebelum ini, subkategori dicari dengan MENCOCOKKAN KATA di
   `product_name` (subkategori-map.js + tabel `cocok:[...]` di tiap file
   data). Itu tebakan: masukannya teks bebas 2.494 nama produk, dan tiap
   kata kunci baru harus ditulis tangan lalu diuji ulang.

   Backend sekarang mengirim field **`tipe`** — kategorisasi RESMI Digiflazz
   sendiri, string yang sama persis dengan tag di dashboard mereka ("Umum",
   "Bulk", "Flash", "Mini", "Maxstream", "Freedom Internet", …). Semua 8.341
   produk prabayar punya field ini; hanya 10 yang kosong di SELURUH katalog.

   Jadi masukan pengelompokan berubah dari **teks bebas** menjadi
   **kosakata TERTUTUP berisi 186 string resmi** (kategori Data). Itu
   perbedaan yang sebenarnya — bukan sekadar "sumbernya lebih bagus".

   ======================= TAPI `tipe` BUKAN LANGSUNG NAMA TAB ==============
   `tipe` SATU TINGKAT LEBIH RINCI daripada yang muat di bilah tab. Angka
   sesungguhnya dari price-list hari ini (kategori Data):

       Telkomsel  1.068 produk -> 77 tipe
       Indosat      654 produk -> 42 tipe
       Axis         345 produk -> 25 tipe
       XL           169 produk -> 22 tipe
       Smartfren    170 produk -> 21 tipe
       Tri          117 produk -> 20 tipe
       by.U         109 produk -> 10 tipe

   77 tab bergulir di layar HP bukan pilihan; dan ekornya panjang sekali —
   "Musik" 1 produk, "FIFA World Cup" 1, "Games" 1. Karena itu tab = FAMILI,
   dan `tipe` resmi dipetakan ke famili lewat tabel di bawah.

   Yang berubah dari pendekatan lama BUKAN "sekarang ada pemetaan" — dua-
   duanya punya pemetaan. Yang berubah: **masukannya sekarang 186 string
   resmi yang tertutup dan bisa dihitung**, bukan pencocokan kata pada nama
   produk yang bentuknya bebas. Salah petakan sekarang KELIHATAN (tipe yang
   belum terdaftar dilaporkan `console.warn` + jadi tabnya sendiri), bukan
   diam-diam nyasar ke keranjang umum.

   ======================= ATURAN MENYUNTING TABEL ==========================
   - Kunci tabel adalah string `tipe` PERSIS dari price-list (case-
     insensitive saat dicocokkan, tapi tulis apa adanya biar mudah dicari).
   - `tipe` yang BELUM terdaftar TIDAK dibuang & TIDAK masuk keranjang umum:
     ia jadi tabnya SENDIRI memakai nama resminya + `console.warn`. Jadi
     famili baru dari Digiflazz langsung terlihat oleh member DAN oleh kita.
   - TIDAK ADA famili bernama "Lainnya". Keranjang umum bernama
     "Kuota Reguler" dan isinya memang tipe "Umum" resmi + beberapa tipe
     generik lain yang sudah ditimbang.
   - Urutan tab mengikuti urutan `FAMILI` di bawah — jadi stabil, tidak
     berubah-ubah mengikuti jumlah produk. "Zona Regional" & "Kuota Reguler"
     sengaja PALING BAWAH (keranjang paling umum, pola yang sama seperti
     SUBDEF lama).
   =========================================================================== */

(function () {
  "use strict";

  /* Urutan di sini = urutan tab di layar. Dua yang terakhir sengaja
     keranjang paling umum. */
  var FAMILI = [
    { id: "flash",       label: "Flash" },
    { id: "sakti",       label: "Internet Sakti" },
    { id: "super-seru",  label: "Super Seru" },
    { id: "orbit",       label: "Orbit" },
    { id: "omg",         label: "OMG!" },
    { id: "freedom",     label: "Freedom Internet" },
    { id: "gift",        label: "Gift Data" },
    { id: "yellow",      label: "Yellow" },
    { id: "bronet",      label: "Bronet" },
    { id: "owsem",       label: "OWSEM" },
    { id: "aigo-ss",     label: "AIGO SS" },
    { id: "xtra-combo",  label: "Xtra Combo" },
    { id: "xtra-kuota",  label: "Xtra Kuota" },
    { id: "flex-mini",   label: "Flex Mini" },
    { id: "flexmax",     label: "FlexMax" },
    { id: "flex",        label: "Flex" },
    { id: "bebas-puas",  label: "Bebas Puas" },
    { id: "hotrod",      label: "Hotrod" },
    { id: "ultra",       label: "Ultra 5G+" },
    { id: "blue",        label: "XL Blue" },
    { id: "happy",       label: "Happy" },
    { id: "alwayson",    label: "AlwaysOn" },
    { id: "getmore",     label: "GetMore" },
    { id: "hifi",        label: "HiFi Air" },
    { id: "home",        label: "Tri Home" },
    { id: "connex",      label: "Connex Evo" },
    { id: "kaget",       label: "Kaget" },
    { id: "jajan",       label: "Jajan" },
    { id: "mbps",        label: "Paket Mbps" },
    { id: "unlimited",   label: "Unlimited" },
    { id: "nonstop",     label: "Unlimited Nonstop" },
    /* --- Paket SMS & Telpon --- */
    { id: "semua-op",    label: "Nelpon Semua Operator" },
    { id: "sesama",      label: "Nelpon Sesama" },
    { id: "nelpon-sakti", label: "Nelpon Sakti" },
    { id: "talkmania",   label: "Talkmania" },
    { id: "mania",       label: "Mania" },
    { id: "telepon-pas", label: "Telepon Pas" },
    { id: "anynet",      label: "AnyNet" },
    { id: "kringkring",  label: "KringKring" },
    { id: "mytsel-gift", label: "MyTelkomsel Gift" },
    { id: "sms",         label: "SMS" },
    { id: "apps",        label: "Paket Aplikasi" },
    { id: "games",       label: "Games" },
    { id: "ilmupedia",   label: "Ilmupedia & Belajar" },
    { id: "ukm",         label: "Paket UKM" },
    { id: "ketengan",    label: "Ketengan" },
    { id: "mini",        label: "Kuota Mini" },
    { id: "malam",       label: "Kuota Malam" },
    { id: "durasi",      label: "Harian & Mingguan" },
    { id: "roaming",     label: "Roaming & Haji" },
    { id: "surprise",    label: "Surprise Deal" },
    { id: "spesial",     label: "Penawaran Spesial" },
    { id: "bulk",        label: "Bulk" },
    { id: "transfer",    label: "Transfer Kuota" },
    { id: "volume",      label: "Berbasis Volume" },
    /* --- Aktivasi Perdana: tingkat harga KARTU PERDANA-nya ---
       Diurut dari termurah. Ini BUKAN famili produk dan sengaja TIDAK
       digabung jadi satu tab "Starter Pack": justru membedakannya yang
       penting. Nilainya ikut tercetak di nama produk ("Aktivasi Perdana
       Axis 3 GB 60 Hari (SP5K SP7K)"), jadi member mencocokkan tab dengan
       kartu fisik yang dia pegang. Salah pilih = aktivasinya gagal. */
    { id: "sp3k",        label: "SP3K" },
    { id: "sp5k7k",      label: "SP5K SP7K" },
    { id: "sp7k",        label: "SP7K" },
    { id: "sp9k10k",     label: "SP9K SP10K" },
    { id: "sp10k",       label: "SP10K" },
    /* --- Tipe B (Streaming/Games/Voucher): langganan vs sekali beli ---
       "Membership" resmi dipakai di Streaming (WeTV VIP), Games (144
       produk) & Voucher. Dipisah dari keranjang umum karena beda BENTUK
       produk: langganan berjangka, bukan koin/voucher sekali pakai. */
    { id: "membership",  label: "Membership" },
    { id: "gift-card",   label: "Gift Card" },
    { id: "telepon",     label: "Telepon" },
    /* --- NEGARA/mata uang voucher (kategori Voucher) ---
       SENGAJA TIDAK dilebur ke "Zona Regional". "Zona Regional" di app ini
       berarti WILAYAH DALAM NEGERI (Jawa Barat, Kalisumapa) — cakupan
       kartu operator. Ini NEGARA, sumbu yang sama sekali berbeda, dan
       meleburnya justru menyesatkan: member yang membuka "Zona Regional"
       mengharapkan provinsi, bukan Ringgit Malaysia.

       Juga tidak digabung jadi satu tab "Luar Negeri": tiap negara punya
       mata uang & toko sendiri, dan selisihnya besar sekali —
       "Steam Wallet Code SGD 5" Rp66.721 vs "MYR 5" Rp21.573. Kode negara
       yang salah TIDAK BISA ditebus di akun member. Tiap tipe kebetulan
       juga milik SATU brand saja (Steam Wallet: MYR/PHP/HKD/SGD;
       iTunes: US/Indonesia), jadi tabnya tidak pernah menumpuk. */
    { id: "neg-indonesia",   label: "Indonesia" },
    { id: "neg-malaysia",    label: "Malaysia" },
    { id: "neg-singapura",   label: "Singapura" },
    { id: "neg-philippines", label: "Philippines" },
    { id: "neg-hongkong",    label: "Hong Kong" },
    { id: "neg-us",          label: "US" },
    { id: "zona",        label: "Zona Regional" },
    { id: "umum",        label: "Kuota Reguler" },
    /* SENGAJA di bawah `umum`, melanggar aturan "keranjang umum paling
       bawah" — dan itu benar di sini. Famili ini hanya muncul di kategori
       Pulsa, yang isinya cuma dua tab: "Pulsa" (= umum) dan "Combo Data".
       Tab PERTAMA adalah yang aktif secara default, dan default yang benar
       untuk halaman pulsa adalah pulsa biasa, bukan bundel combo. */
    { id: "combo-data",  label: "Combo Data" },
  ];

  /* ---- tipe RESMI -> id famili -------------------------------------
     Disusun dari 186 nilai `tipe` sungguhan di kategori Data + nilai dari
     Pulsa. Dikelompokkan per famili supaya mudah ditinjau. */
  var PETA = {};
  function daftar(id, daftarTipe) {
    daftarTipe.forEach(function (t) { PETA[t.toLowerCase()] = id; });
  }

  /* --- Telkomsel --- */
  daftar("flash",      ["Flash", "Flash Revamp"]);
  daftar("sakti",      ["Internet Sakti", "Combo Sakti"]);
  daftar("super-seru", ["Super Seru"]);
  daftar("orbit",      ["Orbit"]);
  daftar("omg",        ["OMG"]);
  daftar("ketengan",   ["Ketengan Utama"]);
  daftar("bulk",       ["Bulk"]);
  daftar("surprise",   ["Surprise Deal"]);

  /* --- Indosat --- */
  daftar("freedom", [
    "Freedom Internet", "Freedom Internet 5G", "Freedom Internet Gift",
    "Freedom U", "Freedom U Gift", "Freedom Max", "Freedom Longlife",
    "Freedom Combo", "Freedom Combo Gift",
  ]);
  daftar("gift",   ["Gift Data"]);
  daftar("yellow", ["Yellow", "Yellow Gift"]);

  /* --- Axis --- */
  daftar("bronet", ["Bronet", "Bronet 5G"]);
  daftar("owsem",  ["Owsem"]);
  /* "Aigo SS" DIPISAH, "Aigo" polos TIDAK — dan bedanya ada di NAMA
     PRODUKNYA, bukan di selera:
       tipe "Aigo SS" -> "Aktivasi Voucher Axis Aigo SS 2.5 GB 2 Hari"
       tipe "Aigo"    -> "Aktivasi Voucher Axis 1.5 GB 1 Hari"
     Yang kedua tidak menyebut "Aigo" sama sekali, dan namanya persis
     sebentuk dengan produk bertipe "Umum" ("Aktivasi Voucher Axis 2 GB
     30 Hari"). Memberinya tab "AIGO" berarti memisahkan kartu-kartu yang
     di layar terlihat identik, tanpa satu pun petunjuk kenapa — itu
     membingungkan, bukan menolong. Jadi ia tetap di keranjang umum. */
  daftar("aigo-ss", ["Aigo SS"]);

  /* --- XL --- */
  daftar("xtra-combo", [
    "Xtra Combo", "Xtra Combo Flex", "Xtra Combo Gift", "Xtra Combo Mini",
    "Xtra Combo Plus", "Xtra Combo VIP Gift", "Xtra Combo VIP Plus",
    "Xtra Combo Weekend",
  ]);
  daftar("xtra-kuota", ["Xtra Kuota", "Xtra On"]);
  daftar("hotrod",     ["Hotrod", "Hotrod Special"]);
  /* Lini "Flex" milik XL (kategori Aktivasi Voucher). Mini / Max / polos
     SENGAJA dipisah: bedanya ukuran & masa aktif, dan itu justru yang
     dicari member ("Flex Mini" = kuota kecil harian, "FlexMax" = besar
     28 hari). Menggabungnya jadi satu tab 42 produk menghapus pembeda
     yang berguna. */
  daftar("flex-mini",  ["Flex Mini"]);
  daftar("flexmax",    ["FlexMax", "Flex Max"]);
  daftar("flex",       ["Flex"]);
  /* Sebaliknya, "Bebas Puas 2rb/3rb/5rb" DIGABUNG. Angkanya cuma NOMINAL
     voucher, dan nominal itu sudah tercetak di nama tiap kartu sekaligus
     terlihat dari harganya — memecahnya jadi 3 tab berisi 6-8 produk tidak
     memberi tahu apa pun yang tidak sudah terlihat.

     Bandingkan dengan SP3K/SP5K/SP7K di Aktivasi Perdana yang sengaja TIDAK
     digabung: di sana angkanya menunjuk KARTU FISIK yang harus dipegang
     member, dan salah pilih = aktivasi gagal. Patokannya sama untuk
     keduanya — "apakah membedakannya berguna?" — jawabannya saja beda. */
  daftar("bebas-puas", ["Bebas Puas 2rb", "Bebas Puas 3rb", "Bebas Puas 5rb", "Bebas Puas"]);
  daftar("ultra",      ["Ultra 5G+"]);
  daftar("blue",       ["Blue"]);

  /* --- Tri --- */
  daftar("happy",    ["Happy", "Happy 5G"]);
  daftar("alwayson", ["AlwaysOn"]);
  daftar("getmore",  ["GetMore"]);
  daftar("hifi",     ["HiFi Air"]);
  daftar("home",     ["Home"]);
  daftar("transfer", ["Data Transfer", "Bagi Kuota"]);

  /* --- Smartfren --- */
  daftar("connex",    ["Connex Evo"]);
  daftar("unlimited", ["Unlimited", "Unlimited Harian", "Unlimited Harian 5G",
                     "Unlimited Gift", "AIGO Unlimited"]);
  daftar("nonstop",   ["Nonstop", "Unlimited Nonstop", "Unlimited Nonstop 5G"]);
  daftar("volume",    ["Volume", "Kuota 5G"]);

  /* --- by.U --- */
  daftar("kaget", ["Kaget", "Super Kaget"]);
  daftar("jajan", ["Jajan"]);
  daftar("mbps",  ["Mbps"]);

  /* --- Lintas operator: kuota khusus aplikasi ---
     Semua ini kuota yang HANYA berlaku di satu aplikasi. Dipisah dari
     kuota umum karena salah beli di sini artinya kuotanya tidak bisa
     dipakai untuk apa pun selain aplikasi itu. */
  daftar("apps", [
    "Apps Kuota", "Bronet Sosmed", "Chat", "Conference", "Disney+ Hotstar",
    "Facebook", "Freedom Apps", "Freedom Apps Gift", "Freedom Play",
    "Getcontact", "Instagram", "Ketengan TikTok", "Klikfilm", "Maxstream",
    "MusicMAX", "Musik", "Netflix", "Nonton", "Seru Nonton", "SnackVideo",
    "Sosmed", "Tiktok", "Twitter", "Unlimited Chatting", "Unlimited Sosmed",
    "Unlimited Streaming", "Videomax", "Vidio", "Viu", "Whatsapp", "Youtube",
    "Zoom", "H3RO",
  ]);

  /* --- Lintas operator: games --- */
  daftar("games", [
    "Games", "GamesMAX", "GamesMAX Booster", "GamesMAX Unlimited Play",
    "Unlimited Games", "Apps Games", "Topping GGWP",
  ]);

  /* --- Lintas operator: belajar --- */
  daftar("ilmupedia", ["Ilmupedia", "Belajar", "Edukasi", "Ruangguru"]);

  /* --- Lintas operator: usaha/korporat --- */
  daftar("ukm", [
    "UKM", "UKM COMBO", "UKM Plus", "UMKM", "SMB", "Enterprise+",
    "Paket Warnet", "Community",
  ]);

  /* --- Lintas operator: ukuran & durasi --- */
  daftar("mini",   ["Mini", "Combo Lite", "Sachet", "Serba Lima Ribu"]);
  daftar("malam",  ["Malam"]);
  daftar("durasi", ["Harian", "Harian Sepuasnya", "Mingguan", "Bulanan", "Freedom Harian"]);

  /* --- Lintas operator: roaming & ibadah --- */
  daftar("roaming", [
    "Roaming", "Roamax", "RoaMAX Haji", "Umroh", "Umroh Haji",
    "Umroh Haji Combo", "Umroh Haji Internet", "Haji", "Mabrur",
    "Happy Travel", "Luar Negeri",
  ]);

  /* --- Lintas operator: penawaran bersyarat/musiman ---
     Tipe-tipe ini menandai penawaran personal atau musiman, bukan famili
     produk tetap. Dikumpulkan supaya tidak jadi belasan tab berisi 1-2
     produk, tapi tetap terpisah dari kuota reguler biasa. */
  daftar("spesial", [
    "Terbaik Untukmu", "Eksklusif", "Magnet", "Bronze", "Freedom Spesial",
    "Spesial", "Ramadan", "FIFA World Cup", "Pure Merdeka", "gaspol", "Kzl",
    "Kita", "Mandiri", "Ekstra", "Hot Promo", "Obor",
  ]);

  /* --- Keranjang umum: "Umum" resmi + tipe generik lain --- */
  daftar("umum", [
    "Umum", "DPI", "InternetMAX", "UnlimitedMAX", "GigaMAX", "SATSPAM+",
    "KeepOn", "Aigo", "BOY", "Kuota", "Paket", "Volume Based",
  ]);

  /* --- Kategori Pulsa --- */
  daftar("combo-data", ["Combo Data"]);

  /* --- Tipe B: langganan berjangka --- */
  daftar("membership", ["Membership"]);

  /* --- Kategori Voucher --- */
  daftar("gift-card", ["Gift Card"]);
  /* Tipe generik milik satu voucher nelpon Axis. Diberi famili sendiri
     (bukan dilebur ke "Nelpon Sesama") karena namanya generik: kalau
     Digiflazz menambah produk "Telepon" yang bukan sesama, pelabelannya
     tetap benar. */
  daftar("telepon", ["Telepon"]);
  daftar("neg-indonesia",   ["Indonesia"]);
  daftar("neg-malaysia",    ["Malaysia"]);
  daftar("neg-singapura",   ["Singapura", "Singapore"]);
  daftar("neg-philippines", ["Philippines", "Filipina"]);
  daftar("neg-hongkong",    ["Hong Kong"]);
  daftar("neg-us",          ["US", "USA"]);

  /* --- Kategori Paket SMS & Telpon ---
     Dua yang pertama adalah JENIS LAYANAN, bukan merek: "Sesama" (Tri/XL)
     dan "Sesama Operator" (Telkomsel/by.U) menyebut hal yang persis sama,
     jadi digabung. Sisanya nama merek milik operatornya sendiri dan
     dipertahankan apa adanya — pola yang sama dengan Bronet/OWSEM/Happy. */
  daftar("semua-op",    ["Semua Operator"]);
  daftar("sesama",      ["Sesama Operator", "Sesama"]);
  daftar("nelpon-sakti", ["Nelpon Sakti"]);
  daftar("talkmania",   ["Talkmania"]);
  /* "Mania" milik Tri ("Tri Mania Puas Nelpon Seharian") — produk yang
     BERBEDA dari Talkmania Telkomsel, jadi tidak digabung. */
  daftar("mania",       ["Mania"]);
  daftar("telepon-pas", ["Telepon Pas"]);
  /* AnyNet = merek XL untuk nelpon ke semua operator. Sengaja TIDAK
     dilebur ke "Nelpon Semua Operator": tidak ada satu pun produk XL yang
     bertipe "Semua Operator", jadi meleburnya cuma menghapus nama yang
     justru dikenal pengguna XL. */
  daftar("anynet",      ["Anynet", "AnyNet"]);
  daftar("kringkring",  ["KringKring Bulk", "KringKring", "Kring Kring"]);
  daftar("mytsel-gift", ["Mytsel Gift", "MyTelkomsel Gift"]);
  daftar("sms",         ["SMS", "SMS Gift"]);

  /* --- Kategori Aktivasi Perdana: tingkat harga kartu perdana --- */
  daftar("sp3k",    ["SP3K"]);
  daftar("sp5k7k",  ["SP5K SP7K"]);
  daftar("sp7k",    ["SP7K"]);
  daftar("sp9k10k", ["SP9K SP10K"]);
  daftar("sp10k",   ["SP10K"]);

  /* ---- Zona regional -------------------------------------------------
     Nilai `tipe` yang isinya NAMA WILAYAH bukan famili produk — produk yang
     sama dijual per wilayah. Kalau tidak digabung, Telkomsel sendiri
     menyumbang 20 tab wilayah. Dicocokkan lewat daftar eksplisit DULU,
     baru pola sebagai jaring pengaman untuk wilayah baru. */
  var ZONA = {};
  [
    "Banten", "EJBN", "Jabo - Jabar", "Jabo", "Jabodetabek",
    "Jabodetabek Zona 1", "Jabodetabek Zona 2", "Jakarta Raya",
    "Jawa Bali Nusra", "Jawa Barat", "Jawa Tengah", "Jawa Tengah - DIY",
    "Jawa Tengah - Jawa Barat", "Jawa Tengah EJBN", "CJEJBN", "Jawa Timur",
    "Kalimantan", "Kalimantan Zona 1", "Kalimantan Zona 2",
    "Kalimantan Zona 3", "Kalisumapa", "Kendal", "Lokal", "Naslok",
    "Non Puma", "Non Jawa Bali Nusra", "NTT", "Papua", "Papua Maluku",
    "Maluku", "Pamasuka", "Non Pamasuka", "Kalimantan Sulawesi",
    "Salatiga", "Semarang-Salatiga", "Serumax Zona A", "Special East",
    "Sukabumi", "Sukabumi Bogor Banten", "Sulawesi Zona 1",
    "Sulawesi Zona 2", "Sulawesi Zona 3", "Sulutra", "Sulawesi Ewako",
    "Sumatera", "Sumbagsel", "Sumbagut",
    "Sumatera Selatan", "Sumatera Selatan Zona 1", "Sumatera Selatan Zona 2",
    "Sumatera Selatan Zona 3", "Sumatera Tengah", "Sumatera Tengah Zona 1",
    "Sumatera Tengah Zona 2", "Sumatera Tengah Zona 3", "Sumatera Utara",
    "Sumatera Utara Zona 1", "Sumatera Utara Zona 2", "Sumatera Utara Zona 3",
    "Bali - Nusa Tenggara Zona 1", "Bali - Nusa Tenggara Zona 2",
    "Bali - Nusa Tenggara Zona 3", "Bali - Nusa Tenggara Zona 4",
    "Jawa Bali Lombok Zona 3", "Jatim Bali Nusra", "Banyuwangi Probolinggo",
    "Mdra Sdrj Mlng Smbw", "Salatiga Jatim Sulawesi", "East", "Central", "West",
  ].forEach(function (t) { ZONA[t.toLowerCase()] = true; });

  /* Jaring pengaman: wilayah baru yang belum masuk daftar di atas. Sengaja
     TIDAK dipakai sendirian — daftar eksplisit lebih dulu, supaya famili
     produk yang kebetulan mengandung kata wilayah tidak ikut tersedot. */
  var POLA_ZONA = /(^|\s)(zona|jabodetabek|jabo|jabar|jateng|jatim|jawa|diy|yogyakarta|banten|papua|maluku|kalimantan|sumatera|sumbagsel|sumbagteng|sumbagut|sulawesi|sulutra|bali|nusa|nusra|lombok|kalisumapa|ejbn|cwj|ntt|salatiga|semarang|kendal|sukabumi|bogor|pamasuka)(\s|$)/i;

  function bersih(t) {
    return String(t == null ? "" : t).trim();
  }

  /* tipe resmi -> id famili. null kalau tipe-nya kosong. */
  function idFamili(tipe) {
    var t = bersih(tipe);
    if (!t) return null;
    var k = t.toLowerCase();
    if (PETA[k]) return PETA[k];
    if (ZONA[k] || POLA_ZONA.test(t)) return "zona";
    return null;      /* belum terdaftar — pemanggil yang memutuskan */
  }

  /* Semua string tipe yang dikenal, diurut dari yang TERPANJANG.
     Dipakai jalur cadangan `dariNama()`: kalau `tipe` kosong, kita cari
     nama famili resmi DI DALAM nama produknya. Ini sengaja memakai
     kosakata resmi yang sama, jadi tidak ada daftar kata kunci kedua yang
     harus dirawat terpisah. */
  var panjangDulu = function (a, b) { return b.length - a.length; };
  var KOSA_ZONA = Object.keys(ZONA).sort(panjangDulu);
  var KOSA_PETA = Object.keys(PETA).sort(panjangDulu);

  function dariNama(nama) {
    /* Tanda baca diubah jadi SPASI dulu, bukan cuma dirapikan spasinya.
       Alasannya nyata: penanda wilayah hampir selalu ditulis dalam kurung
       di ujung nama ("… 28 Hari (Jawa Tengah)"). Dengan hanya merapikan
       spasi, kurung buka menempel ke kata dan pencocokan " jawa tengah"
       tidak pernah kena — produknya lalu jatuh ke famili yang lebih pendek
       ("Happy"), padahal Digiflazz menandai SEMUA saudaranya yang berembel
       wilayah sebagai tipe WILAYAH. */
    var n = " " + String(nama || "").toLowerCase()
      .replace(/[^a-z0-9+]+/g, " ").replace(/\s+/g, " ") + " ";

    /* WILAYAH DICEK LEBIH DULU, mengalahkan nama famili yang lebih panjang
       sekalipun. Itu bukan preferensi kita — itu konvensi Digiflazz
       sendiri, dan sudah diverifikasi ke katalog: dari 745 produk yang
       namanya memuat NAMA FAMILI **dan** WILAYAH sekaligus (334 "Freedom
       Internet", 411 "Happy"), **nol** yang ditandai nama familinya; semua
       ditandai WILAYAH. Yang ditandai nama famili hanyalah produk yang
       namanya TIDAK menyebut wilayah sama sekali.

       Tanpa aturan ini, hasilnya jadi lotere panjang string: "(Jawa
       Tengah)" (11) menang atas "Happy" (5) — kebetulan benar — tapi
       "Freedom Internet" (16) menang atas "(CJEJBN)" (6) — kebetulan
       salah, padahal 69 produk sekerabatnya ditandai "Jawa Tengah EJBN". */
    var cari = function (daftar, ambil) {
      for (var i = 0; i < daftar.length; i++) {
        var k = daftar[i];
        if (k.length < 4) continue;          /* "boy"/"kzl" terlalu pendek */
        if (n.indexOf(" " + k + " ") !== -1 || n.indexOf(" " + k) !== -1) return ambil(k);
      }
      return null;
    };
    return cari(KOSA_ZONA, function () { return "zona"; }) ||
           cari(KOSA_PETA, function (k) { return PETA[k]; });
  }

  var LABEL = {};
  FAMILI.forEach(function (f) { LABEL[f.id] = f.label; });
  var URUT = {};
  FAMILI.forEach(function (f, i) { URUT[f.id] = i; });

  /* ---- Pengelompokan -------------------------------------------------
     produk: array record yang MASING-MASING membawa `tipe` (diteruskan
     apa adanya dari backend). Mengembalikan [{id,label,produk}] siap
     dipakai sebagai subkategori produk-page.js.

     opts.ctx  — nama untuk pesan console (mis. "data/telkomsel")
     opts.min  — famili dengan produk < min DIGABUNG ke keranjang umum
                 ("Kuota Reguler"). 0/undefined = tidak ada penggabungan.
     opts.labelUmum — ganti label keranjang umum untuk kategori ini saja.
                 "Kuota Reguler" benar untuk Paket Data, tapi janggal di
                 Pulsa (di sana namanya "Pulsa"). Hanya memengaruhi tampilan
                 pemanggil ini, tidak mengubah tabel bersama. */
  function kelompokkan(produk, opts) {
    opts = opts || {};
    var ctx = opts.ctx || "?";
    var labelUmum = opts.labelUmum || LABEL.umum;
    var ember = {};
    var belumTerdaftar = {};
    var kosongTipe = 0, kosongTertolong = 0;

    (produk || []).forEach(function (p) {
      var id = idFamili(p && p.tipe);

      if (id === null && !bersih(p && p.tipe)) {
        /* `tipe` kosong dari backend — jalur cadangan: cari nama famili
           resmi di dalam nama produknya. */
        kosongTipe++;
        id = dariNama(p && p.nama);
        if (id) kosongTertolong++;
        else id = "umum";
      } else if (id === null) {
        /* `tipe` ADA tapi belum terdaftar di tabel: JANGAN dibuang &
           jangan ditelan keranjang umum — pakai nama resminya sebagai
           tab sendiri, lalu laporkan supaya bisa ditimbang. */
        var t = bersih(p.tipe);
        id = "tipe:" + t.toLowerCase();
        LABEL[id] = t;
        belumTerdaftar[t] = (belumTerdaftar[t] || 0) + 1;
      }
      (ember[id] = ember[id] || []).push(p);
    });

    /* Famili terlalu kecil digabung ke keranjang umum — hanya kalau
       diminta lewat opts.min. Zona Regional & keranjang umum sendiri
       tidak pernah ikut digabung. */
    if (opts.min > 1) {
      Object.keys(ember).forEach(function (id) {
        if (id === "umum" || id === "zona") return;
        if (ember[id].length >= opts.min) return;
        ember.umum = (ember.umum || []).concat(ember[id]);
        delete ember[id];
      });
    }

    var hasil = Object.keys(ember).map(function (id) {
      return {
        id: id,
        label: id === "umum" ? labelUmum : (LABEL[id] || id),
        produk: ember[id],
      };
    }).sort(function (a, b) {
      var ua = URUT[a.id], ub = URUT[b.id];
      /* Tipe yang belum terdaftar diletakkan sebelum dua keranjang umum,
         supaya kelihatan — bukan disembunyikan di ujung. */
      if (ua === undefined) ua = URUT.zona - 0.5;
      if (ub === undefined) ub = URUT.zona - 0.5;
      return ua - ub;
    });

    var takKenal = Object.keys(belumTerdaftar);
    if (takKenal.length) {
      console.warn("tipe-map [" + ctx + "]: " + takKenal.length +
        " nilai `tipe` belum ada di tabel famili — sementara jadi tab sendiri " +
        "memakai nama resminya. Tambahkan ke scripts/tipe-map.js:",
        JSON.stringify(belumTerdaftar));
    }
    if (kosongTipe) {
      console.info("tipe-map [" + ctx + "]: " + kosongTipe +
        " produk tanpa `tipe` dari backend; " + kosongTertolong +
        " tertolong lewat nama produknya, sisanya masuk \"Kuota Reguler\".");
    }
    return hasil;
  }

  window.DikaTipe = {
    FAMILI: FAMILI,
    idFamili: idFamili,
    dariNama: dariNama,
    label: function (id) { return LABEL[id] || id; },
    kelompokkan: kelompokkan,
  };
})();
