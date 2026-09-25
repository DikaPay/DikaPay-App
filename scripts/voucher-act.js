/* ===========================================================================
   DikaPay — voucher-act.js
   Kategori "Aktivasi Voucher" — DATA ASLI dari backend DikaPay.
   Halaman TIPE B keempat yang disambungkan (setelah streaming, emoney, games).

   String kategori di price-list: "Aktivasi Voucher" — SUDAH DIVERIFIKASI
   (1.334 produk, 72 nilai `tipe`, 83 produk gangguan).

   ================= PENYEDIANYA OPERATOR, BUKAN MERCHANT ==================
   Gampang tertukar dengan kategori **"Voucher"** (Google Play, Steam,
   Garena, Alfamart, …) yang memang merchant. "Aktivasi Voucher" adalah
   AKTIVASI VOUCHER FISIK OPERATOR, jadi penyedianya operator seluler:

       TRI 536 · TELKOMSEL 227 · INDOSAT 225 · XL 104 · AXIS 102 ·
       SMARTFREN 90 · by.U 50

   `brand-map.js` tabel `voucher-act` sebelumnya cuma punya 5 operator —
   **AXIS (102 produk) dan by.U (50) belum terdaftar** dan akan hilang dari
   halaman. Keduanya sudah ditambahkan.

   ================= by.U: TIDAK BUTUH PEMILIH SUB-BRAND ===================
   Di halaman TIPE A (pulsa/paket-data/perdana/sms-telpon), by.U WAJIB
   dipisah lewat `pisahSubBrand()` karena `operator()` memetakannya ke
   "telkomsel" — nomor by.U memakai blok prefix yang sama, jadi deteksi
   nomor tidak bisa membedakannya.

   Di sini situasinya berbeda: halaman ini TIDAK memakai nomor untuk memilih
   penyedia, dan Digiflazz sudah mengirim `brand: "by.U"` terpisah dari
   `"TELKOMSEL"`. Jadi by.U cukup jadi KARTU PENYEDIA sendiri — pemilih
   sub-brand tidak diperlukan sama sekali. (Diverifikasi, bukan diasumsikan.)

   ================= SUBKATEGORI DARI `tipe` RESMI =========================
   Memakai tipe-map.js, sama seperti Pulsa/Paket Data/Perdana/SMS & Telpon.
   `subkategori-map.js` (tebak pola nama) TIDAK dipakai lagi di sini.

   Kategori ini didominasi voucher REGIONAL: dari 72 tipe, mayoritasnya nama
   wilayah — Telkomsel 18 dari 19 tipe-nya wilayah, Tri 9 dari 15. Rollup
   "Zona Regional" karena itu jadi tab terbesar di beberapa operator, dan
   itu memang cerminan katalognya.

   TANPA filter rentang nominal: voucher aktivasi harganya berdekatan dan
   tab famili sudah memecah daftarnya; dua baris kontrol cuma bikin sesak
   (keputusan yang sama dengan Paket Data).
   =========================================================================== */

(function () {
  "use strict";

  var SLUG = "voucher-act";
  var JENIS = "prabayar";
  var KATEGORI = "Aktivasi Voucher";     /* string ASLI di price-list */

  /* Presentasi saja (warna + inisial); price-list tidak punya konsep ini.
     Warnanya mengikuti identitas operator di operator-detect.js supaya
     halaman ini terasa satu keluarga dengan halaman Tipe A. */
  var TAMPILAN = {
    tsel:  { name: "Telkomsel", short: "TS", color: "#E62129" },
    isat:  { name: "Indosat",   short: "IS", color: "#FFD200" },
    xl:    { name: "XL",        short: "XL", color: "#1B4FD6" },
    axis:  { name: "Axis",      short: "AX", color: "#8A2BE2" },
    three: { name: "Tri",       short: "3",  color: "#EC1C24" },
    smart: { name: "Smartfren", short: "SF", color: "#E5007D" },
    byu:   { name: "by.U",      short: "BU", color: "#1D1D1B" },
  };

  var PROVIDERS = [];
  var status = "idle";           /* idle | memuat | siap | gagal */
  var pesanGagal = "";
  var ringkasan = null;
  var statusUI = null;
  var halaman = null;

  /* Pemenang saat dua SKU punya NAMA sama: yang TIDAK gangguan lebih dulu,
     baru harga termurah — aturan yang sama di semua kategori live. */
  function lebihBaik(baru, lama) {
    var rusakBaru = !!baru.gangguan, rusakLama = !!lama.gangguan;
    if (rusakBaru !== rusakLama) return rusakLama;
    return baru.harga_modal < lama.harga_modal;
  }

  function bangun(daftar) {
    var BM = window.DikaBrandMap;
    if (!BM) {
      console.error("voucher-act: brand-map.js belum di-link.");
      return [];
    }
    var per = {}, takDikenal = {}, dilewati = 0, memoId = {};

    (daftar || []).forEach(function (p) {
      if (!p || typeof p.harga_modal !== "number" || !isFinite(p.harga_modal)) { dilewati++; return; }
      var kb = String(p.brand || "");
      if (!(kb in memoId)) memoId[kb] = BM.provider(SLUG, kb);
      var id = memoId[kb];
      if (!id) { takDikenal[kb] = (takDikenal[kb] || 0) + 1; return; }

      var rec = {
        sku: String(p.kode_produk || ""),
        nama: String(p.nama || "").trim(),
        brand: kb.trim(),
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
      var brand = {
        id: id,
        name: t.name || id,
        short: t.short,
        color: t.color,
        jumlah: per[id].length,
      };
      var sub = T ? T.kelompokkan(per[id], {
        ctx: SLUG + "/" + id,
        labelUmum: "Voucher Reguler",
        /* Famili beranggota satu digabung ke keranjang umum: katalognya
           besar (536 produk untuk Tri), jadi tab berisi satu kartu lebih
           banyak memakan ruang daripada menolong. */
        min: 2,
      }) : [];

      /* SATU brand memakai `subkategori` ATAU `produk`, TIDAK PERNAH
         KEDUANYA — `hitungProvider()` di katalog-jumlah.js menjumlahkan
         dua-duanya kalau ada, dan halaman Margin jadi dua kali lipat. */
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
      console.warn("voucher-act: brand belum dikenal brand-map.js:",
        JSON.stringify(takDikenal), "- tambahkan aliasnya di scripts/brand-map.js.");
    }
    console.info("voucher-act: " + total + " produk siap dari " + ringkasan.diterima +
      " produk kategori " + KATEGORI + " (" + ringkasan.provider.join(", ") + ")");
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
      statusUI.kosong("Belum ada voucher aktivasi yang tersedia saat ini.");
      return;
    }
    aturBrandSec(true);
    statusUI.sembunyi();
  }

  function muat(paksa) {
    if (!window.DikaApi) {
      console.error("voucher-act: api.js belum di-link — data produk tidak bisa dimuat.");
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
        console.error("voucher-act: gagal memuat katalog:", err && (err.sebab || err.message), err);
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
      brandTitle: "Pilih Operator",
      nominalTitle: "Pilih Voucher",
      brandLabel: "Operator",
      detailLabel: "Voucher",
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
          hint: "Kode aktivasi akan dikirim ke nomor ini lewat SMS.",
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

  window.DikaVoucherAct = {
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
