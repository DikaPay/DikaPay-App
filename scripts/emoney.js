/* ===========================================================================
   DikaPay — emoney.js
   Kategori "E-Money" (TOP UP saldo, prabayar) — DATA ASLI dari backend.
   Halaman TIPE B kedua yang disambungkan, setelah streaming.js.

   String kategori di price-list: "E-Money" — SUDAH DIVERIFIKASI (35 produk).

   ============ 1. PRABAYAR vs PASCABAYAR: TIDAK BISA TERCAMPUR ============
   `emoney` (top up saldo) dan `emoney-pasca` (tagihan) memang berbagi nama
   kategori di dokumentasi Digiflazz. Di backend DikaPay keduanya terpisah
   oleh DUA lapis sekaligus, jadi kebocoran mustahil:

     1. ENDPOINT BEDA. Halaman ini memanggil `DikaApi.kategori("prabayar",
        "E-Money")` -> `?jenis=prabayar`. Produk pascabayar hidup di
        `?jenis=pascabayar`, respons yang sama sekali berbeda.
     2. NAMA KATEGORI BEDA. Respons pascabayar TIDAK memakai nama "E-Money"
        sama sekali — seluruh 400 barisnya berkategori **"Pascabayar"**,
        dengan `brand: "E-MONEY"` (5 baris). Jadi walau kedua respons
        digabung sekalipun, penyaring `kategori === "E-Money"` di api.js
        tetap tidak akan menyentuhnya.

   Konsekuensi: TIDAK perlu argumen `jenis` ke `kategori-map.cocokkan()` di
   file ini — pemisahnya sudah terjadi jauh sebelum itu. Sudah diverifikasi
   di browser: 0 produk pascabayar yang lolos.

   ============ 2. FIELD `tipe` DI SINI = BIAYA ADMIN, BUKAN FAMILI ========
   Kategori lain memakai `tipe` resmi sebagai nama tab. **JANGAN di sini.**
   Nilainya: "Umum", "Admin 500", "Admin 1000", "Admin 1500" — itu NOMINAL
   BIAYA ADMIN penyedia, bukan famili produk. Tab bernama "Admin 1500"
   tidak memberi tahu apa pun tentang isi produknya.

   Angkanya juga sudah tercetak di nama produk ("OVO 15.000 Admin 1.500")
   dan sudah tercermin di `harga_modal`, jadi menampilkannya lagi cuma
   mengulang. Aturan prabayar tetap berlaku: `harga_modal` apa adanya,
   TIDAK ADA baris admin terpisah (lihat pelajaran ADMIN 2.500 di listrik).

   Pengelompokan yang BENAR di sini adalah **Kartu fisik vs E-Wallet**, dan
   itu ditentukan dari BRAND lewat `DikaBrandMap.jenisEmoney()` — tabel yang
   memang dibuat untuk pertanyaan ini.

   ============ 3. FIELD INPUT IKUT JENIS SALDONYA =========================
   Kartu fisik butuh **nomor kartu 16 digit**; e-wallet butuh **nomor HP**
   (10-13 digit, prefix operator divalidasi). `accountFields(brand)`
   memilihnya dari `brand.grup` yang diisi dari `jenisEmoney()` — jadi
   kalau Digiflazz menambah kartu fisik besok, field-nya ikut benar sendiri
   tanpa perubahan kode.

   ==================== TEMUAN DATA YANG PERLU DIKETAHUI ===================
   Katalog ASLI cuma punya **4 brand, SEMUANYA E-Wallet**: LinkAja (12),
   DANA (11), OVO (8), ShopeePay (4). **Tidak ada satu pun kartu fisik** —
   Mandiri e-Money, BRI Brizzi, BNI TapCash, BCA Flazz & DKI JakCard yang
   ada di data dummy TIDAK ADA di price-list ini. Halaman menyusut dari 10
   kartu penyedia jadi 4.

   Aliasnya TETAP disimpan di brand-map.js DAN di TAMPILAN di bawah, jadi
   begitu Digiflazz menambahkannya, kartunya langsung tampil dengan warna,
   label "Kartu", dan field 16 digit yang benar.
   =========================================================================== */

(function () {
  "use strict";

  var SLUG = "emoney";
  var JENIS = "prabayar";
  var KATEGORI = "E-Money";      /* string ASLI di price-list */

  /* Presentasi saja (warna + inisial); price-list tidak punya konsep ini.
     Kartu fisik ikut didaftarkan walau produknya belum ada — lihat header. */
  var TAMPILAN = {
    mandiri:   { name: "Mandiri e-Money", short: "MM", color: "#003D79" },
    brizzi:    { name: "BRI Brizzi",      short: "BZ", color: "#00529C" },
    tapcash:   { name: "BNI TapCash",     short: "TC", color: "#F05A22" },
    flazz:     { name: "BCA Flazz",       short: "FZ", color: "#0066AE" },
    jakcard:   { name: "DKI JakCard",     short: "JC", color: "#E87722" },
    ovo:       { name: "OVO",             short: "OV", color: "#4C3494" },
    dana:      { name: "DANA",            short: "DN", color: "#118EEA" },
    gopay:     { name: "GoPay",           short: "GP", color: "#00AED6" },
    shopeepay: { name: "ShopeePay",       short: "SP", color: "#EE4D2D" },
    linkaja:   { name: "LinkAja",         short: "LA", color: "#E62129" },
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

  function bangun(daftar) {
    var BM = window.DikaBrandMap;
    if (!BM) {
      console.error("emoney: brand-map.js belum di-link — brand tidak bisa dipetakan.");
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
        kategori_asli: String(p.kategori || KATEGORI),
      };
      if (window.DikaProduk && window.DikaProduk.statusGangguan(p)) rec.gangguan = true;
      if (p.deskripsi) rec.deskripsi = String(p.deskripsi);
      /* `tipe` TETAP diteruskan (berguna saat menelusuri data), tapi
         SENGAJA TIDAK dipakai untuk mengelompokkan — lihat header. */
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

    var takBerjenis = [];
    var out = Object.keys(per).map(function (id) {
      var t = TAMPILAN[id] || {};
      /* "Kartu" | "E-Wallet" — string yang dikembalikan brand-map.js
         dipakai APA ADANYA sebagai label `sub` di kartu penyedia. */
      var jenis = BM.jenisEmoney(id);
      if (!jenis) takBerjenis.push(id);
      return {
        id: id,
        name: t.name || id,
        short: t.short,
        color: t.color,
        sub: jenis || "E-Money",
        /* `grup` dibaca accountFields() di bawah untuk memilih bentuk
           field-nya. Nilainya sengaja huruf kecil & terpisah dari `sub`
           (yang untuk mata member), supaya perbandingannya tidak
           bergantung pada teks yang sewaktu-waktu diubah. */
        grup: jenis === "Kartu" ? "kartu" : "wallet",
        jumlah: per[id].length,
        produk: per[id],
      };
    }).sort(function (a, b) {
      /* Kartu fisik dulu, baru e-wallet; di dalamnya yang produknya paling
         banyak lebih dulu. Hari ini semuanya e-wallet, jadi yang terlihat
         cuma urutan kedua — tapi urutannya sudah benar begitu kartu ada. */
      if (a.grup !== b.grup) return a.grup === "kartu" ? -1 : 1;
      return b.jumlah - a.jumlah;
    });

    var total = 0;
    out.forEach(function (b) { total += b.jumlah; });
    ringkasan = {
      diterima: (daftar || []).length, terpakai: total,
      provider: out.map(function (b) { return b.id + "(" + b.sub + "):" + b.jumlah; }),
      takDikenal: takDikenal, digabung: digabung, dilewati: dilewati,
      gangguan: Object.keys(per).reduce(function (n, id) {
        return n + per[id].filter(function (x) { return x.gangguan; }).length;
      }, 0),
    };
    if (Object.keys(takDikenal).length) {
      console.warn("emoney: brand belum dikenal brand-map.js:",
        JSON.stringify(takDikenal), "- tambahkan aliasnya di scripts/brand-map.js.");
    }
    if (takBerjenis.length) {
      console.warn("emoney: provider belum punya jenis Kartu/E-Wallet di brand-map.js:",
        takBerjenis.join(", "));
    }
    console.info("emoney: " + total + " produk siap dari " + ringkasan.diterima +
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
    if (status === "memuat") { aturBrandSec(false); statusUI.memuat(4); return; }
    if (status === "siap" && !PROVIDERS.length) {
      aturBrandSec(false);
      statusUI.kosong("Belum ada penyedia e-money yang tersedia saat ini.");
      return;
    }
    aturBrandSec(true);
    statusUI.sembunyi();
  }

  function muat(paksa) {
    if (!window.DikaApi) {
      console.error("emoney: api.js belum di-link — data produk tidak bisa dimuat.");
      status = "gagal";
      pesanGagal = "Modul jaringan belum termuat. Coba buka ulang halamannya, ya.";
      segarkanStatusUI();
      return;
    }
    if (status === "memuat") return;
    status = "memuat"; pesanGagal = "";
    segarkanStatusUI();

    /* jenis "prabayar" = lapis pemisah pertama dari emoney-pasca. */
    window.DikaApi.kategori(JENIS, KATEGORI, !!paksa)
      .then(function (daftar) {
        PROVIDERS = bangun(daftar);
        daftarkanJumlah();
        status = "siap";
        segarkanStatusUI();
        if (halaman) halaman.segarkan();
      })
      .catch(function (err) {
        console.error("emoney: gagal memuat katalog:", err && (err.sebab || err.message), err);
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
      brandTitle: "Pilih Kartu / E-Wallet",
      nominalTitle: "Pilih Nominal",
      brandLabel: "Penyedia",
      detailLabel: "Nominal",
      payTitle: "Pembayaran",
      payLine: function (item, brand, account) {
        var tujuan = account && (account.kartu || account.phone);
        return window.DikaProduk.namaLengkap(item) + " " + brand.name +
          (tujuan ? " untuk " + tujuan : "") +
          " belum bisa diproses karena metode pembayaran masih dalam pengerjaan. " +
          "Terima kasih sudah menunggu!";
      },
      /* Bentuk field IKUT jenis saldonya — lihat catatan 3 di header. */
      accountFields: function (brand) {
        if (brand && brand.grup === "kartu") {
          return [{
            key: "kartu",
            label: "Nomor Kartu",
            placeholder: "16 digit di depan kartu",
            hint: "Saldo akan masuk ke kartu dengan nomor ini. Pastikan nomornya benar.",
            digitsOnly: true,
            inputmode: "numeric",
            helper: true,      /* scan berguna: nomor kartu sering ada barcode-nya */
            min: 16,
            max: 16,
          }];
        }
        return [{
          key: "phone",
          label: "Nomor HP Tujuan",
          placeholder: "Contoh: 081234567890",
          hint: "Saldo akan masuk ke akun dengan nomor ini. Pastikan nomornya benar.",
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

  window.DikaEmoney = {
    ringkasan: function () { return ringkasan; },
    status: function () { return status; },
    provider: function () { return PROVIDERS; },
    muatUlang: function () { muat(true); },
    debug: function () {
      return {
        status: status,
        brandTerpilih: halaman ? halaman.brandTerpilih() : null,
        provider: PROVIDERS.map(function (b) {
          return b.id + "/" + b.grup + ":" + b.jumlah;
        }),
      };
    },
  };
})();
