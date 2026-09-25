/* ===========================================================================
   DikaPay — voucher.js
   Kategori "Voucher" — DATA ASLI dari backend DikaPay.
   Kategori PRABAYAR TERAKHIR yang disambungkan (12 dari 12).

   String kategori di price-list: "Voucher" — SUDAH DIVERIFIKASI
   (1.102 produk, 44 brand, 75 nilai `tipe`, 91 produk gangguan).

   ================= ISINYA CAMPURAN, BUKAN MURNI MERCHANT =================
   Dugaan awal: kategori ini berisi merchant digital (Steam, Google Play,
   Garena, …). Kenyataannya CAMPURAN, dan justru operator yang mayoritas:

       VOUCHER DATA OPERATOR  860 produk (78%)
         TELKOMSEL 273 · INDOSAT 204 · AXIS 157 · SMARTFREN 109 ·
         XL 49 · by.U 41 · TRI 27
       MERCHANT & GAME        242 produk (22%)
         Steam Wallet 26 · Google Play 23 · Tokopedia 13 · iTunes 12 ·
         XBOX 10 · PlayStation 7 · Razer Gold 7 · … (37 brand)

   Bedanya dengan "Aktivasi Voucher": di sana SEMUA penyedianya operator.
   Di sini keduanya bercampur dalam satu daftar, jadi kartu penyedianya pun
   bercampur — itu memang bentuk katalognya.

   ================= 44 BRAND: PENCARIAN, BUKAN TAB GRUP ===================
   `tabs` grup (Ritel / E-Commerce / Transport / Voucher Game) SUDAH
   DIHAPUS. Grup itu ditulis tangan untuk 10 merchant dummy; untuk 44 brand
   (dan terus bertambah) grup harus ditebak satu per satu, dan grup yang
   salah MENYEMBUNYIKAN merchant dari member yang mencarinya. Diganti
   `config.cari` — pola yang sama dengan halaman Games (107 game).

   ================= BRAND YANG BELUM TERDAFTAR TIDAK DIBUANG ==============
   `brand-map.js` tabel `voucher` sebelumnya cuma punya 10 merchant, dan 34
   brand lain (997 produk, 90%) tidak terpetakan. Operatornya sudah
   ditambahkan ke tabel; merchant yang belum terdaftar memakai id turunan
   nama brand — pola yang sama dengan Games. Menuntut tiap merchant
   didaftarkan dulu berarti ratusan produk hilang tanpa jejak.

   ================= 5 PRODUK TANPA `brand` ================================
   Lima produk di kategori ini punya `brand: null` padahal namanya jelas
   menyebut operatornya ("Voucher Telkomsel 5 GB 3 Hari (Jabodetabek)").
   TIDAK butuh kode baru: `provider()` di brand-map.js memang sudah menerima
   `namaProduk` sebagai upaya kedua saat brand gagal dicocokkan — jalur yang
   sama yang dipakai memisahkan Axis dari XL. Kelimanya mendarat di
   Telkomsel, dan familinya (Zona Regional) ikut ketemu lewat `dariNama()`
   karena namanya menyebut "(Jabodetabek)".
   =========================================================================== */

(function () {
  "use strict";

  var SLUG = "voucher";
  var JENIS = "prabayar";
  var KATEGORI = "Voucher";      /* string ASLI di price-list */

  /* Presentasi saja (warna + inisial). Operator memakai warna identitasnya
     supaya konsisten dengan halaman lain; merchant populer diberi warnanya
     sendiri. Brand di luar daftar ini memakai warna turunan nama. */
  var TAMPILAN = {
    tsel:        { name: "Telkomsel",     short: "TS", color: "#E62129" },
    isat:        { name: "Indosat",       short: "IS", color: "#FFD200" },
    axis:        { name: "Axis",          short: "AX", color: "#8A2BE2" },
    smart:       { name: "Smartfren",     short: "SF", color: "#E5007D" },
    xl:          { name: "XL",            short: "XL", color: "#1B4FD6" },
    byu:         { name: "by.U",          short: "BU", color: "#1D1D1B" },
    three:       { name: "Tri",           short: "3",  color: "#EC1C24" },
    steam:       { name: "Steam Wallet",  short: "ST", color: "#1B2838" },
    "steam-idr": { name: "Steam Wallet (IDR)", short: "SR", color: "#2A475E" },
    gplay:       { name: "Google Play",   short: "GP", color: "#0F9D58" },
    "gplay-us":  { name: "Google Play US", short: "GU", color: "#4285F4" },
    tokopedia:   { name: "Tokopedia",     short: "TP", color: "#42B549" },
    alfamart:    { name: "Alfamart",      short: "AL", color: "#ED1C24" },
    indomaret:   { name: "Indomaret",     short: "IM", color: "#0071CE" },
    garena:      { name: "Garena",        short: "GA", color: "#F04E23" },
    razer:       { name: "Razer Gold",    short: "RZ", color: "#44D62C" },
    unipin:      { name: "UniPin",        short: "UP", color: "#E30613" },
  };

  var PROVIDERS = [];
  var status = "idle";           /* idle | memuat | siap | gagal */
  var pesanGagal = "";
  var ringkasan = null;
  var brandDariNama = [];        /* produk yang brand-nya kosong -> laporan */
  var statusUI = null;
  var halaman = null;

  function lebihBaik(baru, lama) {
    var rusakBaru = !!baru.gangguan, rusakLama = !!lama.gangguan;
    if (rusakBaru !== rusakLama) return rusakLama;
    return baru.harga_modal < lama.harga_modal;
  }

  /* Warna turunan nama untuk brand tanpa entri TAMPILAN — sama seperti
     games.js. WAJIB hex: UI.brandVars() hanya mengurai `#rrggbb`, dan
     diberi `hsl(...)` ia menyetel warna teks = warna latar (inisialnya
     jadi tidak terlihat sama sekali). */
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

  /* "GOOGLE PLAY INDONESIA" -> "Google Play Indonesia". Nama yang sudah
     bercampur huruf besar-kecil dibiarkan ("Steam Wallet (IDR)"). */
  function rapikan(nama) {
    var s = String(nama || "").trim();
    if (!s || s !== s.toUpperCase()) return s;
    return s.toLowerCase().replace(/(^|[\s:_.\-(])([a-z0-9])/g, function (m, a, b) {
      return a + b.toUpperCase();
    });
  }

  function bangun(daftar) {
    var BM = window.DikaBrandMap;
    if (!BM) {
      console.error("voucher: brand-map.js belum di-link.");
      return [];
    }
    var per = {}, namaAsli = {}, dilewati = 0, memo = {};
    brandDariNama = [];

    (daftar || []).forEach(function (p) {
      if (!p || typeof p.harga_modal !== "number" || !isFinite(p.harga_modal)) { dilewati++; return; }
      var kb = String(p.brand == null ? "" : p.brand).trim();

      /* Brand kosong -> tebak dari NAMA PRODUK lewat jalur kedua yang
         memang sudah ada di provider(). Tidak dimemo karena kuncinya nama
         produk (unik per baris), bukan brand. */
      var id;
      if (!kb) {
        id = BM.provider(SLUG, "", p.nama, true);
        brandDariNama.push({ nama: String(p.nama || ""), id: id || null });
      } else {
        if (!(kb in memo)) memo[kb] = BM.provider(SLUG, kb, null, true);
        id = memo[kb];
      }

      /* Belum terdaftar di brand-map -> id diturunkan dari nama brand.
         Dengan 44 brand yang terus bertambah, membuangnya berarti ratusan
         produk hilang diam-diam dari halaman. */
      var sumberNama = kb || String(p.nama || "");
      if (!id) {
        if (!kb) { dilewati++; return; }   /* tanpa brand DAN tanpa tebakan */
        id = kb.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        if (!id) { dilewati++; return; }
      }
      if (!namaAsli[id]) namaAsli[id] = sumberNama;

      var rec = {
        sku: String(p.kode_produk || ""),
        nama: String(p.nama || "").trim(),
        brand: kb,
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

    var T = window.DikaTipe;
    var out = Object.keys(per).map(function (id) {
      var t = TAMPILAN[id] || {};
      var nama = t.name || rapikan(namaAsli[id]);
      var brand = {
        id: id,
        name: nama,
        short: t.short,
        color: t.color || warnaDariNama(nama),
        jumlah: per[id].length,
      };
      var sub = T ? T.kelompokkan(per[id], {
        ctx: SLUG + "/" + id,
        labelUmum: "Voucher Reguler",
        /* Famili beranggota satu digabung ke keranjang umum — kecuali yang
           memang cuma punya satu famili, yang tetap tampil tanpa tab. */
        min: 2,
      }) : [];
      /* SATU brand: `subkategori` ATAU `produk`, TIDAK PERNAH keduanya —
         hitungProvider() menjumlahkan dua-duanya kalau ada. */
      if (sub.length > 1) brand.subkategori = sub;
      else brand.produk = per[id];
      return brand;
    }).sort(function (a, b) { return b.jumlah - a.jumlah; });

    var total = 0;
    out.forEach(function (b) { total += b.jumlah; });
    ringkasan = {
      diterima: (daftar || []).length, terpakai: total,
      brand: out.length, digabung: digabung, dilewati: dilewati,
      brandDariNama: brandDariNama.length,
      gangguan: Object.keys(per).reduce(function (n, id) {
        return n + per[id].filter(function (x) { return x.gangguan; }).length;
      }, 0),
    };
    console.info("voucher: " + total + " produk siap dari " + ringkasan.diterima +
      " produk kategori " + KATEGORI + " (" + out.length + " brand)");
    if (brandDariNama.length) {
      console.info("voucher: " + brandDariNama.length + " produk tanpa `brand` dari " +
        "backend, brand-nya ditebak dari nama produk. Rincian: " +
        "window.DikaVoucher.brandDariNama()");
    }
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
      statusUI.kosong("Belum ada voucher yang tersedia saat ini.");
      return;
    }
    aturBrandSec(true);
    statusUI.sembunyi();
  }

  function muat(paksa) {
    if (!window.DikaApi) {
      console.error("voucher: api.js belum di-link — data produk tidak bisa dimuat.");
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
        console.error("voucher: gagal memuat katalog:", err && (err.sebab || err.message), err);
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
      slug: SLUG,
      brandTitle: "Pilih Voucher",
      nominalTitle: "Pilih Nominal",
      brandLabel: "Voucher",
      detailLabel: "Produk",
      payTitle: "Pembayaran",
      payLine: function (item, brand) {
        return window.DikaProduk.namaLengkap(item) + " " + brand.name +
          " belum bisa diproses karena metode pembayaran masih dalam pengerjaan. " +
          "Terima kasih sudah menunggu!";
      },
      /* Menggantikan tab grup — lihat catatan di header. */
      cari: { placeholder: "Cari merchant / operator...", min: 12 },
      accountFields: function () {
        return [{
          key: "phone",
          label: "Nomor HP Tujuan",
          placeholder: "Contoh: 081234567890",
          hint: "Kode voucher akan dikirim ke nomor ini lewat SMS.",
          digitsOnly: true,
          inputmode: "tel",
          helper: true,
          phone: true,   /* nomor HP sungguhan -> validasi prefix + panjang */
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

  window.DikaVoucher = {
    ringkasan: function () { return ringkasan; },
    status: function () { return status; },
    provider: function () { return PROVIDERS; },
    muatUlang: function () { muat(true); },
    /* Produk yang brand-nya kosong di backend + hasil tebakannya. */
    brandDariNama: function () { return brandDariNama.slice(); },
    debug: function () {
      return {
        status: status,
        brandTerpilih: halaman ? halaman.brandTerpilih() : null,
        brand: PROVIDERS.map(function (b) {
          return b.id + ":" + b.jumlah +
            (b.subkategori ? "[" + b.subkategori.map(function (s) {
              return s.id + ":" + s.produk.length;
            }).join(",") + "]" : "");
        }),
      };
    },
  };
})();
