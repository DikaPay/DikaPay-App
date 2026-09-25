/* ===========================================================================
   DikaPay — data.js
   SUMBER DATA BERSAMA untuk halaman Riwayat & Statistik — SEKARANG LIVE dari
   backend (`GET api-riwayat.php` lewat api.js), BUKAN dummy lagi.

   Dipakai oleh:
     - riwayat.js  (daftar transaksi, ringkasan, struk): DATA.TX, DATA.DETAILS, DATA.CATS
     - statistik.js(ringkasan pengeluaran, bar chart, donut) : DATA.TX

   Prinsip: satu sumber kebenaran. DATA.TX diisi SEKALI di sini (fetch +
   pemetaan), riwayat.js/statistik.js tidak pernah memanggil DikaApi sendiri.

     window.DATA = {
       CATS          // { slug: {label,group,color,bg,icon} } — visual kategori
       TX            // [] -> diisi async, lihat `ready`
       DETAILS       // {} -> lihat catatan "DETAIL STRUK" di bawah
       status        // "memuat" | "siap" | "kosong" | "gagal"
       error         // pesan ramah kalau status "gagal" (kosong kalau tidak)
       page          // halaman TERAKHIR yang berhasil dimuat
       totalHalaman  // dari respons backend
       adaLagi       // true kalau masih ada halaman berikutnya (muatLagi() berguna)
       ready         // Promise, SELALU resolve (tidak pernah reject) — lihat di bawah
       muatUlang()   // -> Promise, reset ke halaman 1 (dipakai retry / pull-refresh)
       muatLagi()    // -> Promise, tambah halaman berikutnya ke TX (pagination)
     }

   =========================== KENAPA ASYNC ==================================
   Dulu (dummy) DATA.TX terisi SINKRON saat file ini dieksekusi — riwayat.js/
   statistik.js langsung baca `DATA.TX` di top-level tanpa menunggu apa pun.
   Sekarang datanya datang dari jaringan, jadi TIDAK BISA sinkron lagi.
   Konsumen WAJIB menunggu `DATA.ready` (Promise) sebelum render pertama:

     DATA.ready.then(function () { renderSemua(); });
     // Saat callback itu jalan, DATA.TX sudah terisi (atau kosong dengan
     // DATA.status yang menjelaskan kenapa).

   `ready` SELALU resolve (tidak pernah reject) — gagal jaringan/401/dll.
   ditangani DI DALAM modul ini (DATA.status jadi "gagal"/"kosong", DATA.error
   diisi pesan ramah), supaya konsumen tidak perlu boilerplate .catch() di
   mana-mana. Ini pola yang sama seperti `createStatus()` di produk-ui.js,
   diadaptasi jadi objek data biasa karena riwayat.js/statistik.js tidak
   memuat produk-ui.js.

   =========================== TOKEN: PER-AKUN ================================
   `DikaApi.riwayat()` butuh device_token — diambil lewat
   `DikaMemberSync.getToken()` (SUDAH per nomor HP, lihat catatan besar
   "TOKEN & SALDO HARUS PER-AKUN" di member-sync.js). File ini TIDAK
   menyimpan/membaca device_token sendiri — satu pintu tetap member-sync.js.

   Kalau backend membalas 401 "Sesi tidak valid" DAN saat itu memang belum
   ada device_token yang valid (member lama yang belum pernah membuka layar
   kunci PIN di sesi ini, sehingga member-sync.js belum sempat menukar PIN
   jadi token — lihat `cekSaatBukaKunci` di member-sync.js), file ini
   TIDAK meminta PIN sendiri (halaman Riwayat tidak punya UI untuk itu,
   dan meminta PIN transaksi lewat pin-transaksi.js akan disalahartikan
   sebagai konfirmasi PEMBAYARAN, bukan re-autentikasi). Sebagai gantinya:
   coba SEKALI `DikaMemberSync.cek()` (best-effort, no-op diam-diam kalau
   memang belum ada token sama sekali), lalu retry SEKALI. Masih gagal ->
   status "gagal" dengan pesan sopan yang mengarahkan member membuka ulang
   aplikasi/kunci layar (di titik itu member-sync.js akan dapat token
   lewat jalur PIN layar kunci yang sudah ada).

   =========================== KATEGORI DARI BACKEND ==========================
   `kategori` di tiap baris riwayat DIASUMSIKAN sama dengan SLUG internal
   yang sudah dipakai `DATA.CATS` di bawah (pulsa/data/listrik/transfer/dst)
   — bukan nama kategori mentah Digiflazz seperti di price-list. Kategori
   yang TIDAK dikenal jatuh ke entri `lainnya` (ikon generik) — TIDAK
   disembunyikan dari riwayat, karena transaksi nyata tidak boleh hilang
   hanya karena slugnya belum terdaftar di sini. WAJIB dicocokkan ulang
   pada sync pertama dengan data sungguhan dari backend.

   `jenis` DIASUMSIKAN string yang layak ditampilkan sebagai judul baris
   (mis. "Pulsa", "Transfer Keluar") — dipakai sebagai `tx.name` apa
   adanya (dirapikan jadi Title Case), jatuh ke label kategori kalau
   kosong. `nominal` DIASUMSIKAN bisa datang UNSIGNED (selalu positif);
   arah uang (keluar/masuk, merah/hijau) diturunkan dari tanda `nominal`
   KALAU sudah negatif, atau dari kata kunci di `jenis`
   ("masuk"/"kredit"/"terima"/"topup" dst → masuk), default KELUAR kalau
   tidak ada sinyal apa pun (mayoritas transaksi PPOB adalah pengeluaran).
   WAJIB dicocokkan ulang pada sync pertama — lihat `tentukanArah()`.

   =========================== DETAIL STRUK ===================================
   `api-riwayat.php` HANYA mengirim {id,jenis,kategori,nominal,status,
   dibuat_pada} — TIDAK ada nomor tujuan/SKU/biaya admin/nama penerima
   seperti dummy dulu. `DATA.DETAILS` karena itu SELALU kosong untuk
   transaksi live; struk (riwayat.js `renderReceipt`) sudah punya fallback
   "—" di semua baris yang bergantung padanya, jadi tetap tampil rapi,
   hanya lebih sedikit rincian. TODO: kalau backend menambah endpoint
   detail-per-transaksi, sambungkan di sini juga (bukan di riwayat.js).

   RIWAYAT BACKEND KEMBALI JADI SATU-SATUNYA SUMBER.
   Penggabungan riwayat lokal (tx-lokal.js) sudah DIHAPUS: sejak
   api-transaksi-produk.php ada, pembelian produk benar-benar tercatat di
   server dan ikut terbawa api-riwayat.php — sama seperti transfer.
   Menggabungkan catatan lokal lagi hanya akan membuat transaksi yang sama
   muncul dua kali. */

(function () {
  "use strict";

  var PAGE_LIMIT = 20;

  var PESAN_SESI = "Sesi kamu perlu disegarkan. Coba tutup lalu buka lagi aplikasinya, ya.";
  var PESAN_GAGAL_DEFAULT = "Gagal memuat riwayat transaksi. Coba lagi, ya.";

  var CATS = {
    pulsa:        { label: "Pulsa",              group: "pulsa",    color: "#1B4FD6", bg: "#E6EDFB", icon: "signal" },
    data:         { label: "Paket Data",         group: "pulsa",    color: "#0E9AA7", bg: "#DEF4F5", icon: "wifi" },
    masaaktif:    { label: "Masa Aktif",         group: "pulsa",    color: "#7A4FD6", bg: "#ECE6FB", icon: "signal" },
    perdana:      { label: "Aktivasi Perdana",   group: "pulsa",    color: "#1E9C56", bg: "#DDF2E6", icon: "sim" },
    smstelpon:    { label: "SMS & Telpon",       group: "pulsa",    color: "#B98900", bg: "#FBF0D3", icon: "signal" },
    listrik:      { label: "Listrik",            group: "tagihan",  color: "#D99A00", bg: "#FBF0D3", icon: "bolt" },
    /* plnpasca dulu memakai ikon "receipt" — ikon generik yang SAMA dengan
       keranjang `lainnya`, jadi begitu banyak kategori jatuh ke sana semua
       baris riwayat terlihat identik. Sekarang "bolt" (listrik) dengan warna
       navy, supaya tetap terbaca sebagai listrik tapi beda dari token
       prabayar yang gold. */
    plnpasca:     { label: "PLN Pascabayar",     group: "tagihan",  color: "#1B4FD6", bg: "#E6EDFB", icon: "bolt" },
    pdam:         { label: "PDAM",               group: "tagihan",  color: "#2AA5DE", bg: "#E0F2FB", icon: "drop" },
    bpjs:         { label: "BPJS Kesehatan",     group: "tagihan",  color: "#1E9C56", bg: "#DDF2E6", icon: "shield" },
    bpjstk:       { label: "BPJS Ketenagakerjaan", group: "tagihan", color: "#0E9AA7", bg: "#DEF4F5", icon: "shield" },
    transfer:     { label: "Transfer",           group: "transfer", color: "#7A4FD6", bg: "#ECE6FB", icon: "transfer" },
    /* Transfer MASUK dipisah dari transfer keluar: group-nya tetap
       "transfer" (chip filter "Transfer" menangkap KEDUANYA), cuma ikon &
       warnanya beda supaya sekilas terlihat mana uang masuk (hijau, panah
       turun) dan mana uang keluar (ungu, panah kirim). */
    transfermasuk: { label: "Transfer Masuk",    group: "transfer", color: "#12924A", bg: "#DEF3E7", icon: "transfer-in" },
    topup:        { label: "Top Up",             group: "topup",    color: "#B98900", bg: "#FBF0D3", icon: "plus" },
    game:         { label: "Games",              group: "game",     color: "#DB423A", bg: "#FBE3E2", icon: "gamepad" },
    streaming:    { label: "Streaming",          group: "game",     color: "#7A4FD6", bg: "#ECE6FB", icon: "play" },
    tv:           { label: "TV",                 group: "game",     color: "#1B4FD6", bg: "#E6EDFB", icon: "tv" },
    voucher:      { label: "Voucher",            group: "game",     color: "#B98900", bg: "#FBF0D3", icon: "ticket" },
    emoney:       { label: "E-Money",            group: "topup",    color: "#0E9AA7", bg: "#DEF4F5", icon: "card" },
    hppasca:      { label: "HP Pascabayar",      group: "tagihan",  color: "#DB423A", bg: "#FBE3E2", icon: "sim" },
    internet:     { label: "Internet",           group: "tagihan",  color: "#0E9AA7", bg: "#DEF4F5", icon: "wifi" },
    multifin:     { label: "Multifinance",       group: "tagihan",  color: "#7A4FD6", bg: "#ECE6FB", icon: "card" },
    pbb:          { label: "PBB",                group: "tagihan",  color: "#1E9C56", bg: "#DDF2E6", icon: "building" },
    gas:          { label: "Gas Negara",         group: "tagihan",  color: "#D99A00", bg: "#FBF0D3", icon: "flame" },
    gasprabayar:  { label: "Gas Prabayar",       group: "tagihan",  color: "#DB423A", bg: "#FBE3E2", icon: "flame" },
    /* Jaring pengaman untuk `kategori` yang belum dikenal file ini — lihat
       catatan "KATEGORI DARI BACKEND" di atas. Ikon netral, TIDAK merah/
       mencolok (ini bukan error, cuma slug yang belum terdaftar). */
    lainnya:      { label: "Transaksi",          group: "tagihan",  color: "#6B7488", bg: "#E9EBF1", icon: "receipt" },
  };

  /* ===================== PEMETAAN KATEGORI DARI BACKEND ====================
     BUG NYATA yang diperbaiki di sini: versi sebelumnya mencocokkan
     `CATS[kategori.toLowerCase()]` PERSIS — jadi hanya nilai yang kebetulan
     sama dengan SLUG internal ("pulsa", "listrik", "pdam") yang kena.
     Backend ternyata mengirim NAMA KATEGORI yang enak dibaca manusia
     ("Paket Data", "PLN Pascabayar", "BPJS Kesehatan", "Games", "Gas
     Prabayar") dan `jenis` bergaya snake_case ("transfer_keluar",
     "transfer_masuk", "prabayar", "pascabayar"). Tidak satu pun cocok, jadi
     HAMPIR SEMUA baris jatuh ke `lainnya` -> ikon kertas generik yang sama
     untuk semua transaksi, DAN chip filter "Transfer" tidak pernah menemukan
     apa pun (karena group-nya ikut jadi "tagihan", bukan "transfer").

     Sekarang pencocokannya tiga lapis, semuanya di atas bentuk yang sudah
     DINORMALKAN (huruf kecil, semua tanda baca/underscore jadi spasi):
       1. `jenis` diperiksa DULU untuk transaksi non-produk (transfer/top up)
          — `kategori` untuk baris transfer bisa saja kosong atau berisi
          "Transfer" saja, jadi arah uangnya cuma ada di `jenis`.
       2. Tabel alias EKSAK (ALIAS) untuk nama kategori yang sudah diketahui,
          ditulis dalam kedua gaya (nama manusia DAN slug internal) supaya
          tetap benar apa pun yang dikirim backend.
       3. Cadangan kata kunci (KUNCI) yang dicocokkan sebagai KATA UTUH dan
          yang TERPANJANG MENANG — pola yang sama dengan kategori-map.js.
          Tanpa "terpanjang menang", "PLN" akan menelan "PLN PASCABAYAR" dan
          "TV" menelan "TV PASCABAYAR" (jebakan yang sudah didokumentasikan
          di CLAUDE.md).
     Yang tetap tidak cocok -> `lainnya` + console.warn SEKALI per nilai unik
     (bukan per baris — 20 baris kategori tak dikenal dulu berarti 20 baris
     peringatan yang menenggelamkan log lain). */

  var ALIAS = {
    /* ---- Prabayar ---- */
    "pulsa": "pulsa", "pulsa transfer": "pulsa", "isi pulsa": "pulsa",
    "data": "data", "paket data": "data", "internet data": "data", "kuota": "data",
    "masa aktif": "masaaktif",
    "perdana": "perdana", "aktivasi perdana": "perdana", "kartu perdana": "perdana",
    "sms telpon": "smstelpon", "paket sms telpon": "smstelpon", "paket sms dan telpon": "smstelpon", "sms dan telpon": "smstelpon",
    "listrik": "listrik", "token listrik": "listrik", "pln": "listrik", "pln prabayar": "listrik", "token pln": "listrik", "listrik prabayar": "listrik",
    "games": "game", "game": "game", "top up game": "game", "topup game": "game", "voucher game": "game",
    "streaming": "streaming",
    "voucher": "voucher", "aktivasi voucher": "voucher", "voucher act": "voucher",
    "e money": "emoney", "emoney": "emoney", "e wallet": "emoney", "ewallet": "emoney", "e money wallet": "emoney", "dompet digital": "emoney",
    "gas prabayar": "gasprabayar",
    /* ---- Pascabayar ---- */
    "pln pascabayar": "plnpasca", "pln pasca": "plnpasca", "plnpasca": "plnpasca", "pln bill": "plnpasca", "listrik pascabayar": "plnpasca",
    "pdam": "pdam", "pdam pascabayar": "pdam", "air": "pdam",
    "hp pascabayar": "hppasca", "hp pasca": "hppasca", "hppasca": "hppasca", "halo": "hppasca",
    "by u": "hppasca", "byu": "hppasca", "telkomsel omni": "hppasca", "indosat only4u": "hppasca",
    "tri cuanmax": "hppasca", "xl axis cuanku": "hppasca", "xl cuanku": "hppasca",
    "internet pascabayar": "internet", "internet pasca": "internet", "internet": "internet",
    "bpjs": "bpjs", "bpjs kesehatan": "bpjs",
    "bpjs ketenagakerjaan": "bpjstk", "bpjs tk": "bpjstk", "bpjstk": "bpjstk",
    "multifinance": "multifin", "multifin": "multifin", "angsuran kredit": "multifin", "angsuran": "multifin",
    "pbb": "pbb", "pajak bumi dan bangunan": "pbb",
    "gas": "gas", "gas negara": "gas", "pgn": "gas",
    "tv": "tv", "tv pascabayar": "tv", "tv pasca": "tv", "tv kabel": "tv",
    "e money pascabayar": "emoney", "emoney pascabayar": "emoney",
    /* ---- Non-produk ---- */
    "transfer": "transfer", "transfer keluar": "transfer", "kirim saldo": "transfer",
    "transfer masuk": "transfermasuk", "terima saldo": "transfermasuk",
    "top up": "topup", "topup": "topup", "deposit": "topup", "isi saldo": "topup",
  };

  /* Cadangan: dicocokkan sebagai KATA UTUH, yang TERPANJANG menang. */
  var KUNCI = Object.keys(ALIAS).sort(function (a, b) { return b.length - a.length; });

  function norm(s) {
    return String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  var sudahDiperingatkan = {};

  function petakanKategori(kategoriRaw, jenisRaw) {
    var j = norm(jenisRaw);
    /* (1) Transaksi non-produk dikenali dari `jenis` lebih dulu. */
    if (j.indexOf("transfer") !== -1) {
      return j.indexOf("masuk") !== -1 || j.indexOf("terima") !== -1 ? "transfermasuk" : "transfer";
    }
    if (/(^| )(top ?up|deposit|isi saldo)( |$)/.test(j)) return "topup";

    var k = norm(kategoriRaw);
    /* (2) Alias eksak. */
    if (ALIAS[k]) return ALIAS[k];
    /* `jenis` kadang justru yang membawa nama kategorinya (kategori kosong). */
    if (ALIAS[j]) return ALIAS[j];

    /* (3) Kata kunci utuh, terpanjang menang. */
    var target = " " + k + " ";
    var targetJenis = " " + j + " ";
    for (var i = 0; i < KUNCI.length; i++) {
      var kw = " " + KUNCI[i] + " ";
      if (target.indexOf(kw) !== -1 || targetJenis.indexOf(kw) !== -1) return ALIAS[KUNCI[i]];
    }

    var penanda = k || j;
    if (penanda && !sudahDiperingatkan[penanda]) {
      sudahDiperingatkan[penanda] = true;
      console.warn("data.js: kategori riwayat belum dikenal, dipakai ikon umum:",
        JSON.stringify({ kategori: kategoriRaw, jenis: jenisRaw }));
    }
    return "lainnya";
  }

  window.DATA = {
    CATS: CATS,
    TX: [],
    DETAILS: {},
    status: "memuat",
    error: "",
    page: 0,
    totalHalaman: 0,
    adaLagi: false,
  };

  function errLokal(pesan, kode) {
    var e = new Error(pesan);
    e.pesanMember = pesan;
    if (kode) e.kode = kode;
    return e;
  }

  function tokenAktif() {
    try { return (window.DikaMemberSync && DikaMemberSync.getToken()) || ""; }
    catch (e) { return ""; }
  }

  function sudahLogin() {
    try { return !!(window.DikaAuth && DikaAuth.isLoggedIn()); }
    catch (e) { return false; }
  }

  /* ---- Pemetaan 1 baris API -> bentuk TX internal (dipakai riwayat.js/
     statistik.js tanpa perubahan) ---------------------------------------- */

  /* "transfer_keluar" -> "Transfer Keluar", TAPI "PDAM" tetap "PDAM" dan
     "PLN Pascabayar" tetap apa adanya: kalau string-nya SUDAH punya huruf
     kapital, itu tandanya backend mengirim nama yang memang untuk dibaca
     manusia — jangan di-Title Case ulang (itu yang mengubah "PDAM" jadi
     "Pdam" dan "BPJS" jadi "Bpjs"). */
  function rapiNama(s) {
    var t = String(s == null ? "" : s).replace(/[_-]+/g, " ").trim();
    if (!t) return "";
    if (/[A-Z]/.test(t)) return t;
    return t.replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  /* Judul baris riwayat. `jenis` yang cuma menyebut GOLONGAN transaksi
     ("prabayar"/"pascabayar"/"pembelian") TIDAK layak jadi judul — untuk
     baris seperti itu nama kategorinya ("Pulsa", "PLN Pascabayar") jauh
     lebih berguna bagi member. Transfer sebaliknya: arah uangnya justru
     cuma ada di `jenis`. */
  var JENIS_GOLONGAN = /^(prabayar|pascabayar|produk|pembelian|transaksi|pembayaran|tagihan)$/;

  function namaDari(jenisRaw, kategoriRaw, slug) {
    if (slug === "transfermasuk") return "Transfer Masuk";
    if (slug === "transfer") return "Transfer Keluar";

    var mentah = String(kategoriRaw == null ? "" : kategoriRaw).trim();
    if (mentah) {
      /* Sudah bergaya nama manusia ("E-Money", "PDAM", "Paket SMS & Telpon")
         -> pakai APA ADANYA, termasuk tanda hubungnya. Jangan dirapikan:
         itu yang mengubah "E-Money" jadi "E Money". */
      if (/[A-Z]/.test(mentah) && mentah.indexOf("_") === -1) return mentah;
      /* Bergaya slug ("pln-bill", "data") -> label resmi kategori jauh lebih
         enak dibaca daripada slug yang di-Title Case ("Pln Bill"). */
      var ck = CATS[slug];
      if (ck && slug !== "lainnya") return ck.label;
      return rapiNama(mentah);
    }

    var jenis = rapiNama(jenisRaw);
    if (jenis && !JENIS_GOLONGAN.test(norm(jenisRaw))) return jenis;
    var c = CATS[slug];
    return (c && c.label) || "Transaksi";
  }

  /* Lihat catatan "KATEGORI DARI BACKEND" — arah uang BELUM tentu dikirim
     eksplisit oleh backend. Urutan keputusan:
       1. slug hasil petakanKategori() (transfer masuk / top up = uang MASUK)
          — dipakai lebih dulu supaya WARNA nominal (dari tanda `amount`)
          tidak pernah bertentangan dengan JUDUL barisnya ("Transfer Masuk"
          hijau "+", "Transfer Keluar" merah "-");
       2. tanda `nominal` kalau backend memang mengirimnya bertanda;
       3. kata kunci di `jenis`;
       4. default KELUAR — mayoritas transaksi PPOB memang pengeluaran. */
  function tentukanKeluar(nominalMentah, jenisRaw, slug) {
    if (slug === "transfermasuk" || slug === "topup") return false;
    if (slug === "transfer") return true;
    if (isFinite(nominalMentah) && nominalMentah < 0) return true;
    var jenis = String(jenisRaw || "").toLowerCase();
    if (/masuk|kredit|terima|refund|cashback|top[\s_-]?up/.test(jenis)) return false;
    if (/keluar|debit|bayar|beli|pembelian/.test(jenis)) return true;
    return true;
  }

  /* "2026-09-13 08:53:22" (format datetime backend) ATAU ISO
     "2026-09-13T08:53:22Z" -> "2026-09-13T08:53", bentuk yang dipahami
     parseDT() di riwayat.js & statistik.js (keduanya memotong string
     dengan asumsi itu — kalau bentuk ini berubah, ubah KEDUANYA juga). */
  function normalisasiTanggal(raw) {
    var s = String(raw || "").trim();
    if (!s) return "";
    var t = s.indexOf(" ") !== -1 && s.indexOf("T") === -1 ? s.replace(" ", "T") : s;
    var m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(t);
    return m ? m[1] + "T" + m[2] : t;
  }

  function petakanBaris(row) {
    row = row || {};
    var slug = petakanKategori(row.kategori, row.jenis);
    var nominalMentah = Number(row.nominal);
    var nominalAbs = isFinite(nominalMentah) ? Math.abs(nominalMentah) : 0;
    var keluar = tentukanKeluar(nominalMentah, row.jenis, slug);
    var statusSlug = { berhasil: "ok", pending: "pending", gagal: "fail" }[String(row.status || "").trim().toLowerCase()];
    if (!statusSlug) {
      console.warn("data.js: status riwayat tidak dikenal, dianggap pending:", row.status);
      statusSlug = "pending";
    }
    var id = row.id != null ? String(row.id) : ("tx-" + Math.random().toString(36).slice(2));
    return {
      id: id,
      cat: slug,
      name: namaDari(row.jenis, row.kategori, slug),
      dt: normalisasiTanggal(row.dibuat_pada),
      amount: keluar ? -nominalAbs : nominalAbs,
      status: statusSlug,
      method: "Saldo DikaPay",
      ref: id,
      /* Nilai MENTAH dari backend ikut dibawa (additive) — dipakai struk di
         riwayat.js untuk memilih tampilan transfer vs pembelian produk, dan
         sangat membantu saat mendiagnosa pemetaan yang meleset. */
      jenis: String(row.jenis == null ? "" : row.jenis),
      kategoriAsli: String(row.kategori == null ? "" : row.kategori),
    };
  }

  /* ---- Pemuatan halaman, dengan retry SEKALI kalau token basi ---------- */

  function ambilHalaman(page) {
    if (!sudahLogin()) return Promise.reject(errLokal(PESAN_SESI, "belum-login"));
    if (!window.DikaApi || typeof DikaApi.riwayat !== "function") {
      return Promise.reject(errLokal("Layanan riwayat belum siap. Muat ulang halaman, ya."));
    }
    var token = tokenAktif();
    if (!token) return Promise.reject(errLokal(PESAN_SESI, "sesi-tidak-valid"));
    return DikaApi.riwayat(token, page, PAGE_LIMIT);
  }

  function ambilDenganRetry(page, sudahRetry) {
    return ambilHalaman(page).catch(function (err) {
      if (err && err.kode === "sesi-tidak-valid" && !sudahRetry && window.DikaMemberSync) {
        try { DikaMemberSync.hapusToken(); } catch (e) {}
        /* Coba dapatkan token yang valid lewat mekanisme yang SUDAH ADA di
           member-sync.js — best-effort, tanpa PIN di tangan (halaman ini
           bukan layar buka-kunci). Kalau memang belum ada token sama
           sekali, cek() ini no-op diam-diam dan retry di bawah akan gagal
           lagi dengan alasan yang sama -> jatuh ke status "gagal" apa adanya. */
        return DikaMemberSync.cek().then(function () {
          return ambilDenganRetry(page, true);
        });
      }
      return Promise.reject(err);
    });
  }

  /* MUTASI array TX di tempat (push/panjang=0), JANGAN reassign
     `window.DATA.TX = ...` — riwayat.js membaca `DATA.TX` SEKALI ke
     variabel top-level (`const TX = DATA.TX`) saat script itu dimuat,
     SEBELUM data pertama datang (fetch-nya async). Kalau di sini
     objek array-nya diganti dengan yang baru, binding `TX` di riwayat.js
     akan tetap menunjuk array LAMA (kosong) selamanya. Mutasi di tempat
     membuat kedua referensi (di sini dan di riwayat.js) selalu menunjuk
     objek array yang SAMA, jadi tetap sinkron tanpa riwayat.js perlu tahu
     apa-apa soal timing pemuatan. */
  function terapkanHasil(hasil, reset) {
    var baris = Array.isArray(hasil.data) ? hasil.data : [];
    var mapped = baris.map(petakanBaris);
    if (reset) window.DATA.TX.length = 0;
    Array.prototype.push.apply(window.DATA.TX, mapped);
    window.DATA.page = Number(hasil.page) || (reset ? 1 : window.DATA.page + 1);
    window.DATA.totalHalaman = Math.max(1, Number(hasil.totalHalaman) || 1);
    window.DATA.adaLagi = window.DATA.page < window.DATA.totalHalaman;
    window.DATA.status = window.DATA.TX.length ? "siap" : "kosong";
    window.DATA.error = "";
  }

  function tanganiGagal(err) {
    window.DATA.status = "gagal";
    window.DATA.error = (err && err.pesanMember) || PESAN_GAGAL_DEFAULT;
    console.error("data.js: gagal memuat riwayat:", err && (err.sebab || err.message || err));
  }

  function muatUlang() {
    window.DATA.status = "memuat";
    return ambilDenganRetry(1, false).then(
      function (hasil) { terapkanHasil(hasil, true); },
      tanganiGagal
    );
  }

  function muatLagi() {
    if (!window.DATA.adaLagi || window.DATA.status === "memuat") return Promise.resolve();
    var target = window.DATA.page + 1;
    window.DATA.status = "memuat";
    return ambilDenganRetry(target, false).then(
      function (hasil) { terapkanHasil(hasil, false); },
      function (err) {
        /* Gagal memuat HALAMAN TAMBAHAN (bukan pemuatan pertama) — data
           yang SUDAH ada di TX tetap valid, jangan diganti status "gagal"
           yang menyembunyikan daftar yang sudah terlihat. Cukup kembalikan
           ke "siap" dan catat errornya supaya tombol "Muat Lagi" bisa
           dicoba ulang. */
        window.DATA.status = window.DATA.TX.length ? "siap" : "gagal";
        window.DATA.error = (err && err.pesanMember) || PESAN_GAGAL_DEFAULT;
        console.error("data.js: gagal memuat halaman berikutnya:", err && (err.sebab || err.message || err));
      }
    );
  }

  window.DATA.muatUlang = muatUlang;
  window.DATA.muatLagi = muatLagi;
  window.DATA.ready = muatUlang();
})();
