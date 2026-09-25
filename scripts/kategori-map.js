/* ===========================================================================
   DikaPay — kategori-map.js
   PEMETAAN kategori/brand Digiflazz -> slug kategori DikaPay.
   Inilah "CATEGORY_MAP" yang dipakai saat sinkronisasi price-list.

   PENTING — nilai `category` di bawah adalah EKSPEKTASI, bukan fakta.
   Repo ini belum pernah menyentuh API Digiflazz (tidak ada backend/admin),
   jadi string kategori & brand di sini WAJIB dicocokkan ulang dengan
   price-list asli pada sync pertama. Pencocokan sengaja dibuat
   case-insensitive + berbasis kata kunci supaya tahan beda penulisan.

   Kontrak: setiap produk Digiflazz HARUS mendarat di salah satu slug.
   Yang tidak cocok -> slug "lainnya" + dicatat, JANGAN dibuang diam-diam.
   =========================================================================== */

(function () {
  "use strict";

  /* slug -> { label, riwayat, jenis, category (ekspektasi), brand (opsional) }

     `riwayat` = kunci kategori di DATA.CATS (data.js) yang menentukan IKON
     & warna entri di halaman Riwayat Transaksi. Tanpa ini semua transaksi
     produk tercatat sebagai "topup" dan tampil dengan ikon "+" yang sama —
     itu bug yang pernah terjadi. Kalau menambah slug baru, isi field ini
     dan pastikan kuncinya ADA di DATA.CATS. */
  var MAP = {
    /* ---------- PRABAYAR: harga tetap ---------- */
    "pulsa":          { riwayat: "pulsa", label: "Pulsa", jenis: "prabayar", category: ["pulsa"] },
    "data":           { riwayat: "data", label: "Paket Data", jenis: "prabayar", category: ["data", "paket data"] },
    "listrik":        { riwayat: "listrik", label: "Listrik", jenis: "prabayar", category: ["pln", "token listrik"] },
    "masa-aktif":     { riwayat: "pulsa", label: "Masa Aktif", jenis: "prabayar", category: ["masa aktif"] },
    "perdana":        { riwayat: "pulsa", label: "Aktivasi Perdana", jenis: "prabayar", category: ["aktivasi perdana", "kartu perdana", "perdana"] },
    "sms-telpon":     { riwayat: "pulsa", label: "Paket SMS & Telpon", jenis: "prabayar", category: ["paket sms & telpon", "sms", "telpon"] },
    /* "game" (Voucher Game) & "topup-game" DILEBUR:
         - top up langsung ke akun game  -> slug "games"   (games.html)
         - voucher saldo game            -> slug "voucher" (tab "Voucher Game")
       Brand voucher game sengaja tetap dipetakan lewat `brand`, karena di
       price-list Digiflazz keduanya berbagi category "Games"/"Voucher Game". */
    "games":          { riwayat: "game", label: "Games", jenis: "prabayar", category: ["games", "game"],
                        brand: ["mobile legends", "free fire", "pubg", "genshin", "valorant"] },
    "streaming":      { riwayat: "streaming", label: "Streaming", jenis: "prabayar", category: ["streaming"],
                        brand: ["netflix", "spotify", "vidio", "disney", "wetv", "viu"] },
    /* "tv" (beli paket TV prabayar) DIPENSIUNKAN — menu-nya diganti "Gas
       Prabayar" (kategori TV masih kosong di Digiflazz, Gas Prabayar ada
       isinya). File pages/tv.html & scripts/tv.js dibiarkan di disk (tidak
       ditaut) kalau-kalau Digiflazz menambah kategori TV nanti; kembalikan
       slug ini + entri ALL_SERVICES/ROUTES kalau itu terjadi. */
    "voucher":        { riwayat: "voucher", label: "Voucher", jenis: "prabayar", category: ["voucher", "voucher game"],
                        brand: ["alfamart", "indomaret", "tokopedia", "shopee", "grab",
                                "google play", "steam", "garena", "razer", "unipin"] },
    "voucher-act":    { riwayat: "voucher", label: "Aktivasi Voucher", jenis: "prabayar", category: ["aktivasi voucher"] },
    /* "ewallet" DILEBUR ke "emoney" — satu halaman, dua jenis saldo
       (kartu fisik + dompet digital), dibedakan lewat `sub` per brand. */
    "emoney":         { riwayat: "emoney", label: "E-Money & Wallet", jenis: "prabayar", category: ["e-money", "emoney", "e-wallet"],
                        brand: ["mandiri e-toll", "e-money", "brizzi", "tapcash", "flazz", "jakcard",
                                "ovo", "dana", "gopay", "shopeepay", "linkaja"] },
    /* Gas Prabayar (token gas PGN) — BEDA dari slug "gas" (Gas Negara
       PASCABAYAR). Di price-list prabayar kategorinya "Gas" (brand
       "Pertamina Gas"). Menggantikan menu "TV" yang kategorinya masih
       kosong di Digiflazz. */
    "gas-prabayar":   { riwayat: "gas", label: "Gas Prabayar", jenis: "prabayar", category: ["gas"] },

    /* ---------- PASCABAYAR: hanya admin, tanpa harga tetap ---------- */
    "pln-bill":       { riwayat: "plnpasca", label: "PLN Pascabayar", jenis: "pascabayar", category: ["pln pascabayar"] },
    "pdam":           { riwayat: "pdam", label: "PDAM", jenis: "pascabayar", category: ["pdam"] },
    "hp-pasca":       { riwayat: "hppasca", label: "HP Pascabayar", jenis: "pascabayar", category: ["hp pascabayar", "halo", "matrix"] },
    "internet-pasca": { riwayat: "internet", label: "Internet Pascabayar", jenis: "pascabayar", category: ["internet pascabayar", "telkom", "indihome"] },
    "tv-pasca":       { riwayat: "tv", label: "TV Pascabayar", jenis: "pascabayar", category: ["tv pascabayar"] },
    "bpjs":           { riwayat: "bpjs", label: "BPJS Kesehatan", jenis: "pascabayar", category: ["bpjs kesehatan"] },
    "bpjs-tk":        { riwayat: "bpjs", label: "BPJS Ketenagakerjaan", jenis: "pascabayar", category: ["bpjs ketenagakerjaan"] },
    /* "Angsuran Kredit" = ALIAS multifinance, BUKAN slug sendiri.
       multifinance.js sudah memuat perusahaan pembiayaan kredit umum
       (FIF, Adira, BAF, Mandala, WOM) — persis biller yang dipakai Digiflazz
       untuk angsuran kredit motor/mobil/elektronik. Alur (pilih biller ->
       nomor kontrak -> nominal manual), admin per biller, dan modal
       konfirmasinya identik, jadi halaman terpisah hanya akan menduplikasi
       multifinance.html dengan daftar brand yang sama. */
    "multifinance":   { riwayat: "multifin", label: "Multifinance", jenis: "pascabayar", category: ["multifinance", "angsuran kredit", "angsuran"] },
    "pbb":            { riwayat: "pbb", label: "PBB", jenis: "pascabayar", category: ["pbb"] },
    "gas":            { riwayat: "gas", label: "Gas Negara", jenis: "pascabayar", category: ["gas negara", "pgn"] },

    /* --- Sub-brand pascabayar operator: KATEGORI RESMI Digiflazz ---
       Masing-masing punya halamannya sendiri sekarang. Kelimanya juga
       tetap bisa dicapai lewat hp-pasca.html (deteksi dari prefix), tapi
       PEMETAAN SYNC menunjuk ke halaman khususnya — supaya produk hasil
       sync mendarat di kategori yang namanya sama persis dengan Digiflazz. */
    "tsel-omni":      { riwayat: "hppasca", label: "Telkomsel Omni", jenis: "pascabayar", category: ["telkomsel omni", "omni"] },
    "isat-only4u":    { riwayat: "hppasca", label: "Indosat Only4u", jenis: "pascabayar", category: ["indosat only4u", "only4u"] },
    "tri-cuanmax":    { riwayat: "hppasca", label: "Tri CuanMax", jenis: "pascabayar", category: ["tri cuanmax", "cuanmax"] },
    "xl-cuanku":      { riwayat: "hppasca", label: "XL Axis Cuanku", jenis: "pascabayar", category: ["xl axis cuanku", "cuanku"] },
    "byu":            { riwayat: "hppasca", label: "by.U", jenis: "pascabayar", category: ["by.u", "byu"] },

    /* "E-Money" muncul di KEDUA daftar harga Digiflazz (prabayar & pasca),
       jadi nama kategorinya SAJA tidak cukup untuk memisahkan. Pemisahnya
       adalah `jenis` price-list yang sedang disinkronkan — lihat
       cocokkan(category, brand, jenis) di bawah. */
    "emoney-pasca":   { riwayat: "emoney", label: "E-Money Pascabayar", jenis: "pascabayar", category: ["e-money", "emoney"] },
  };

  /* Kategori DikaPay yang TIDAK punya padanan di Digiflazz.
     Kosong sejak Zakat/Donasi dihapus (keputusan produk). */
  var TANPA_PADANAN = [];

  /* ---------------------------------------------------------------------
     SENGAJA "lainnya" — kategori Digiflazz yang KAMI PUTUSKAN untuk TIDAK
     dibuatkan halaman, bukan yang kelupaan.

     Bedanya dengan "lainnya" biasa: yang di sini sudah pernah ditimbang dan
     ditolak dengan alasan, jadi saat sync menemukannya kita TAHU itu bukan
     celah pemetaan. Yang TIDAK terdaftar di sini dan mendarat di "lainnya"
     berarti kategori baru/tak terduga -> perlu ditinjau.

     Kalau nanti salah satunya mau dikerjakan: hapus entrinya dari sini,
     tambahkan slug-nya di MAP, dan buat alurnya sendiri — JANGAN dipaksa
     masuk pola PPOB sederhana (input ID -> nominal -> bayar), karena justru
     itu alasan keduanya ditunda.
     --------------------------------------------------------------------- */
  var SENGAJA_LAINNYA = [
    /* Kategori di bawah (Bundling, Telepon Pascabayar, Pajak, Asuransi)
       SEMPAT punya halaman, lalu DIHAPUS atas keputusan produk.
       Didaftarkan di sini (bukan dibiarkan jatuh ke
       "lainnya" begitu saja) supaya saat sync menemukannya, log-nya
       console.info "SENGAJA" — bukan console.warn "TIDAK DIKENAL" yang
       menyiratkan celah pemetaan yang perlu ditambal. Kalau nanti mau
       dihidupkan lagi: hapus entri di sini, kembalikan slug-nya di MAP,
       dan buat ulang halamannya. */
    {
      kunci: ["bundling", "combo"],
      alasan: "Halaman Bundling dihapus atas keputusan produk.",
    },
    {
      kunci: ["telepon pascabayar", "telpon pascabayar", "pstn"],
      alasan: "Halaman Telepon Pascabayar (PSTN) dihapus atas keputusan produk.",
    },
    {
      kunci: ["pajak", "samsat", "esamsat"],
      alasan: "Halaman Pajak dihapus atas keputusan produk.",
    },
    {
      kunci: ["asuransi"],
      alasan: "Halaman Asuransi (pembayaran premi polis) dihapus atas keputusan produk.",
    },
    {
      kunci: ["tiket", "ticket"],
      alasan: "Butuh alur pilih jadwal/rute/kursi + ketersediaan real-time. " +
              "Tidak ada nomor pelanggan untuk di-inquiry dan harganya " +
              "berubah per keberangkatan, jadi tidak muat di Tipe A/B/C/D.",
    },
    {
      kunci: ["emas", "tabungan emas", "tabungan", "investasi"],
      alasan: "Produk investasi: butuh KYC, rekening/akun terdaftar atas nama " +
              "pengguna, harga buyback yang bergerak, dan kepatuhan OJK. " +
              "Bukan pembelian sekali jalan seperti produk PPOB.",
    },
  ];

  /* Cocokkan ke SENGAJA_LAINNYA. Mengembalikan { alasan, panjang } dengan
     kata kunci TERPANJANG yang cocok, atau null. `panjang` dipakai
     cocokkan() untuk mengadu tabel ini melawan MAP memakai aturan yang sama
     (lihat catatan di cocokkan). */
  function sengajaCocok(category, brand) {
    var c = norm(category), b = norm(brand);
    var best = null;
    for (var i = 0; i < SENGAJA_LAINNYA.length; i++) {
      var e = SENGAJA_LAINNYA[i];
      for (var j = 0; j < e.kunci.length; j++) {
        var k = e.kunci[j];
        if (c.indexOf(k) >= 0 || b.indexOf(k) >= 0) {
          if (!best || k.length > best.panjang) best = { alasan: e.alasan, panjang: k.length };
        }
      }
    }
    return best;
  }

  /* Alasan kenapa sebuah kategori sengaja tidak punya halaman; null kalau
     kategori itu bukan salah satu yang sengaja ditunda. */
  function alasanLainnya(category, brand) {
    var hit = sengajaCocok(category, brand);
    return hit ? hit.alasan : null;
  }

  function norm(v) { return String(v || "").toLowerCase().trim(); }

  /* Cocokkan satu produk Digiflazz -> slug DikaPay.
     Mengembalikan "lainnya" kalau tidak ada yang cocok (JANGAN dibuang).

     `jenis` OPSIONAL: "prabayar" | "pascabayar" — daftar harga mana yang
     sedang disinkronkan. WAJIB diisi saat sync sungguhan, karena ada nama
     kategori yang dipakai di KEDUA daftar: "E-Money" berarti top up saldo
     di price-list prabayar, tapi tagihan di price-list pascabayar. Tanpa
     petunjuk ini, produk E-Money pascabayar akan mendarat di halaman top
     up prabayar dan ditolak DikaProduk.check() karena tidak punya
     harga_modal. Kalau dikosongkan, perilakunya sama seperti sebelumnya. */
  function cocokkan(category, brand, jenis) {
    var c = norm(category), b = norm(brand), j = norm(jenis);
    var kandidat = [];
    var panjangMap = 0;
    Object.keys(MAP).forEach(function (slug) {
      var m = MAP[slug];
      /* Buang kandidat yang jenisnya jelas-jelas berbeda dari daftar
         harga yang sedang diproses. */
      if (j && m.jenis && m.jenis !== j) return;
      /* Ambil kata kunci TERPANJANG yang cocok. Ini penting: "pln" juga ada
         di dalam "pln pascabayar", "tv" di dalam "tv pascabayar", dan
         "voucher" di dalam "aktivasi voucher". Tanpa aturan terpanjang,
         kategori prabayar akan menelan pasangan pascabayar-nya. */
      var panjang = 0;
      m.category.forEach(function (k) {
        if (c.indexOf(k) >= 0 && k.length > panjang) panjang = k.length;
      });
      if (!panjang) return;
      if (panjang > panjangMap) panjangMap = panjang;
      /* Kategori sama dipakai lebih dari satu slug (mis. "Voucher Game"
         dipakai `voucher` maupun `games`) -> pisahkan lewat brand.
         Yang punya brand cocok menang. */
      var brandHit = m.brand ? m.brand.some(function (k) { return b.indexOf(k) >= 0; }) : false;
      kandidat.push({ slug: slug, skor: panjang * 10 + (brandHit ? 5 : 0) });
    });
    /* Aturan "kata kunci TERPANJANG menang" berlaku LINTAS TABEL, bukan cuma
       di dalam MAP. Tanpa ini, kategori yang sengaja dibuang bisa direbut
       kata kunci pendek milik slug lain: "Telpon Pascabayar" mengandung
       "telpon" (milik sms-telpon), sehingga tagihan telepon RUMAH akan salah
       masuk ke paket SMS PRABAYAR. Kata kunci SENGAJA yang lebih panjang
       harus mengalahkan kecocokan MAP yang lebih pendek. */
    var sengaja = sengajaCocok(category, brand);
    if (!kandidat.length || (sengaja && sengaja.panjang > panjangMap)) {
      var alasan = sengaja ? sengaja.alasan : null;
      if (alasan) {
        console.info("kategori-map: category=" + category + " brand=" + brand +
          " -> lainnya (SENGAJA). " + alasan);
      } else {
        console.warn("kategori-map: category=" + category + " brand=" + brand +
          " -> lainnya (TIDAK DIKENAL). Perlu ditinjau: tambahkan slug di MAP " +
          "atau daftarkan di SENGAJA_LAINNYA dengan alasannya.");
      }
      return "lainnya";
    }
    kandidat.sort(function (a, b2) { return b2.skor - a.skor; });
    /* Kalau dua slug seri TANPA petunjuk brand, itu ambigu -> laporkan. */
    if (kandidat.length > 1 && kandidat[0].skor === kandidat[1].skor) {
      console.warn("kategori-map: ambigu untuk category=" + category + " brand=" + brand +
        " -> " + kandidat.map(function (k) { return k.slug; }).join(" / ") +
        "; dipakai " + kandidat[0].slug);
    }
    return kandidat[0].slug;
  }

  /* ====================== KATEGORI YANG BOLEH DIBERI MARGIN ==================
     SUMBER TUNGGAL. `margin.js` (daftar centang di halaman Atur Margin) dan
     `margin-calc.js` (perhitungan saat produk ditampilkan) SAMA-SAMA membaca
     dari sini — jangan menyaring sendiri di salah satu file, nanti keduanya
     bisa berbeda pendapat tanpa ketahuan.

     HANYA PRABAYAR. Seluruh 16 kategori PASCABAYAR sengaja TIDAK PERNAH
     terdaftar sebagai kategori bermargin — perlakuannya sama persis dengan
     Transfer Antar Member, yang memang tidak ada di MAP sama sekali.

     ALASANNYA: margin per-kategori hanya masuk akal untuk produk berharga
     TETAP per nominal (pulsa 10.000 selalu Rp10.900, jadi "+15%" berarti
     sesuatu). Nominal pascabayar diisi manual pelanggan dan berbeda tiap
     orang tiap bulan, jadi persentase di atasnya tidak menggambarkan
     keuntungan yang bisa direncanakan.

     Pascabayar TETAP ADA di MAP — ia masih dibutuhkan untuk memetakan
     price-list Digiflazz ke slug halaman. Yang hilang HANYA hak marginnya.
     ========================================================================= */

  function bolehMargin(slug) {
    var e = slug ? MAP[slug] : null;
    return !!e && e.jenis === "prabayar";
  }

  function kategoriMargin() {
    return Object.keys(MAP)
      .filter(bolehMargin)
      .map(function (slug) {
        return { id: slug, label: MAP[slug].label || slug, jenis: MAP[slug].jenis };
      });
  }

  window.DikaKategoriMap = {
    MAP: MAP,
    TANPA_PADANAN: TANPA_PADANAN,
    SENGAJA_LAINNYA: SENGAJA_LAINNYA,
    alasanLainnya: alasanLainnya,
    cocokkan: cocokkan,
    bolehMargin: bolehMargin,
    kategoriMargin: kategoriMargin,
    slugPrabayar: function () {
      return Object.keys(MAP).filter(function (s) { return MAP[s].jenis === "prabayar"; });
    },
    slugPascabayar: function () {
      return Object.keys(MAP).filter(function (s) { return MAP[s].jenis === "pascabayar"; });
    },
  };
})();
