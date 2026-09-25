/* ===========================================================================
   DikaPay — listrik.js
   Halaman Token Listrik PLN (PRABAYAR — harga tetap).

   ALUR SEKARANG (dengan CEK NAMA PELANGGAN asli):
     isi nomor meter >= 8 digit
       -> tombol "Cek Nama Pelanggan"
       -> GET digiflazz.php?action=inquiry-pln&customer_no=<meter>  (lewat DikaApi)
       -> tampilkan NAMA + Tarif/Daya pelanggan
       -> baru grid nominal token muncul
   Kalau inquiry GAGAL (rc != "00" / jaringan): pesan ramah tampil TAPI
   grid tetap dibuka (fail-open) — member masih bisa beli token sambil
   diminta memeriksa nomor sendiri. Token PLN tidak "salah kirim" ke nama;
   ia masuk ke nomor meter apa adanya, jadi memblokir total malah menahan
   transaksi yang sah hanya karena layanan cek sedang bermasalah.

   Data pelanggan (nama/tarif) TIDAK di-cache — selalu diminta ulang tiap
   kali tombol ditekan. Katalog nominal token tetap lewat cache 5 menit.

   STRUKTUR DATA: token listrik adalah produk PRABAYAR (harga TETAP), jadi
   memakai skema prabayar produk-schema.js:
     { sku, nama, brand, harga_modal, kategori_asli, sub? }
   Ini BEDA dari pln-bill.js (PLN Pascabayar) yang hanya punya admin_fee
   karena nominal tagihannya variabel.

   TIDAK ADA BIAYA ADMIN di halaman ini. Seluruh produk PRABAYAR berharga
   tetap per nominal; biaya admin hanya milik PASCABAYAR dan nilainya datang
   dari field `admin` Digiflazz. `harga_modal` di sini adalah harga beli
   apa adanya — sama perlakuannya dengan pulsa/paket data.
   `sku` diisi buyer_sku_code asli saat sinkronisasi.

   ================== DATA ASLI DARI BACKEND (kategori "PLN") ===============
   Nominal token TIDAK lagi ditulis tangan — diambil dari backend lewat
   DikaApi. String kategorinya di price-list adalah "PLN", BUKAN "Listrik"
   seperti nama halaman/slug kita (kategori-map.js sudah benar: slug
   `listrik` memuat alias "pln" dan "token listrik").

   Halaman ini memakai primitif produk-ui.js LANGSUNG (input nomor meter,
   tanpa deteksi operator), jadi rangkaian bersama di kategori-live.js tidak
   berlaku di sini — pemuatannya dirangkai sendiri di bawah memakai modul
   yang sama: api.js untuk fetch, createStatus untuk skeleton/gagal, dan
   produk-schema.statusGangguan untuk badge gangguan.
   =========================================================================== */

(function () {
  "use strict";

  var UI = window.DikaProdukUI;

  var MIN_DIGITS = 8;    // warning + nominal muncul setelah 8 digit
  var MAX_DIGITS = 12;
  /* TIDAK ADA BIAYA ADMIN DI SINI — dan jangan ditambahkan lagi.
     ATURAN BISNIS: seluruh produk PRABAYAR (termasuk token listrik) tidak
     punya biaya admin; harganya tetap per nominal. Biaya admin HANYA ada di
     produk PASCABAYAR, nilainya dari field `admin` yang dikirim Digiflazz —
     bukan angka yang ditentukan DikaPay.

     Versi lama file ini menyimpan `var ADMIN = 2500` lalu menulis
     `harga_modal` sebagai (nominal + 2.500) dan memecahnya kembali di modal
     konfirmasi dengan `harga_modal - ADMIN`. Itu salah konsep sejak awal,
     DAN akan menampilkan angka yang salah begitu harga asli Digiflazz masuk:
     `price` dari Digiflazz sudah harga beli final, marginnya bukan 2.500
     tetap, jadi pengurangan itu menghasilkan "Nominal Token" karangan. */

  var KATEGORI = "PLN";      /* string ASLI di price-list — lihat header */
  var JENIS = "prabayar";

  /* Diisi hasil fetch; kosong sampai data pertama datang. */
  var PRODUK = [];
  var status = "idle";       /* idle | memuat | siap | gagal */
  var pesanGagal = "";
  var ringkasan = null;
  var statusUI = null;

  /* Pemenang saat dua SKU punya NAMA sama: yang TIDAK gangguan lebih dulu,
     baru harga termurah (aturan yang sama dengan pulsa/paket-data). */
  function lebihBaik(baru, lama) {
    var rusakBaru = !!baru.gangguan, rusakLama = !!lama.gangguan;
    if (rusakBaru !== rusakLama) return rusakLama;
    return baru.harga_modal < lama.harga_modal;
  }

  function bangun(daftar) {
    var per = {};
    var dilewati = 0, digabung = 0;
    (daftar || []).forEach(function (p) {
      if (!p || typeof p.harga_modal !== "number" || !isFinite(p.harga_modal)) { dilewati++; return; }
      var rec = {
        sku: String(p.kode_produk || ""),
        nama: String(p.nama || "").trim(),
        brand: String(p.brand || "PLN").trim(),
        /* HARGA APA ADANYA — tidak ada penambahan/pengurangan admin di sini.
           Lihat catatan "TIDAK ADA BIAYA ADMIN" di atas. */
        harga_modal: p.harga_modal,
        kategori_asli: String(p.kategori || KATEGORI),
      };
      if (window.DikaProduk && window.DikaProduk.statusGangguan(p)) rec.gangguan = true;
      if (p.deskripsi) rec.deskripsi = String(p.deskripsi);
      var k = rec.nama.toLowerCase();
      if (!per[k]) { per[k] = rec; return; }
      digabung++;
      if (lebihBaik(rec, per[k])) per[k] = rec;
    });
    var out = Object.keys(per).map(function (k) { return per[k]; })
      .sort(function (a, b) { return a.harga_modal - b.harga_modal; });
    ringkasan = {
      diterima: (daftar || []).length, terpakai: out.length,
      digabung: digabung, dilewati: dilewati,
      gangguan: out.filter(function (x) { return x.gangguan; }).length,
    };
    console.info("listrik: " + out.length + " nominal token siap dari " +
      ringkasan.diterima + " produk kategori " + KATEGORI);
    return out;
  }

  function daftarkanJumlah() {
    if (window.DikaKatalogJumlah && window.DikaKatalogJumlah.daftarkan) {
      window.DikaKatalogJumlah.daftarkan("listrik", PRODUK, "array");
    }
  }

  function segarkanStatusUI() {
    if (!statusUI) return;
    /* Kartu status katalog hanya relevan SETELAH member menekan "Cek Nama
       Pelanggan" (saat itulah grid nominal dibuka). */
    var siapTampil = state.meter.length >= MIN_DIGITS && state.cekDone;
    if (status === "gagal") {
      if (siapTampil) statusUI.gagal(pesanGagal, function () { muat(true); });
      else statusUI.sembunyi();
      return;
    }
    if (status === "memuat") { if (siapTampil) statusUI.memuat(6); else statusUI.sembunyi(); return; }
    if (status === "siap" && siapTampil && !PRODUK.length) {
      statusUI.kosong("Belum ada nominal token listrik yang tersedia saat ini.");
      return;
    }
    statusUI.sembunyi();
  }

  function muat(paksa) {
    if (!window.DikaApi) {
      console.error("listrik: api.js belum di-link — data produk tidak bisa dimuat.");
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
        PRODUK = bangun(daftar);
        daftarkanJumlah();
        status = "siap";
        if (window.DikaProduk) window.DikaProduk.check(PRODUK, "prabayar", "listrik");
        segarkanStatusUI();
        onInput();          /* gambar ulang grid dengan data yang baru datang */
      })
      .catch(function (err) {
        console.error("listrik: gagal memuat katalog:", err && (err.sebab || err.message), err);
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
    PRODUK = bangun(isi);
    daftarkanJumlah();
    status = "siap";
    return true;
  }

  /* Jumlah produk untuk halaman Margin didaftarkan lewat daftarkanJumlah()
     begitu data ada. Di margin.html (tanpa jaringan) cukup dari cache sesi;
     kalau belum ada cache, margin.js menampilkan "—". */

  var els = {};
  var grid = null;
  var modal = null;
  /* cust    : hasil inquiry-pln { nama, tarif, meter, subscriber } | null
     cekDone : true setelah tombol Cek ditekan & selesai (sukses ATAU gagal
               fail-open) -> grid nominal boleh tampil
     cekBusy : anti tap-ganda */
  var state = { meter: "", items: [], cust: null, cekDone: false, cekBusy: false };

  /* ---- Helper ------------------------------------------------------ */

  function sanitize(raw) {
    return String(raw || "").replace(/\D/g, "").slice(0, MAX_DIGITS);
  }

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ---- Reset hasil cek saat nomor meter berubah -------------------
     WAJIB: tanpa ini member bisa membeli token untuk nomor B sambil masih
     melihat nama pelanggan nomor A. */
  function resetResult() {
    state.cust = null;
    state.cekDone = false;
    state.items = [];
    if (els.cust) { els.cust.hidden = true; }
    if (els.cekErr) { els.cekErr.hidden = true; els.cekErr.textContent = ""; }
    els.warn.hidden = true;
    if (grid) grid.clear();
  }

  /* ---- Tampilan ----------------------------------------------------- */

  function onInput() {
    /* AMAN DIPANGGIL DARI HALAMAN MANA PUN. File ini dimuat juga oleh
       halaman yang TIDAK memuat produk-ui.js — margin.html cuma butuh
       JUMLAH produknya (lihat katalog-jumlah.js), tidak merender grid.
       Di halaman itu init() sengaja berhenti di `if (!UI) return`, jadi
       `els` masih kosong: tidak ada field nomor meter, tidak ada grid.
       muat() memanggil onInput() saat katalog backend selesai datang
       (beberapa detik setelah halaman dibuka), dan tanpa penjagaan ini
       panggilan itu melempar "Cannot read properties of undefined
       (reading 'value')" ke console margin.html. Pola penjagaannya sama
       dengan `if (!statusUI) return` di segarkanStatusUI(). */
    if (!els.meter) return;
    try {
      var clean = sanitize(els.meter.value);
      if (els.meter.value !== clean) els.meter.value = clean;

      var berubah = clean !== state.meter;
      state.meter = clean;
      els.clear.hidden = clean.length === 0;

      var ready = clean.length >= MIN_DIGITS;

      /* Nomor berubah -> hasil cek lama tidak berlaku lagi. */
      if (berubah) resetResult();

      /* Tombol "Cek Nama Pelanggan" muncul begitu nomor cukup panjang. */
      if (els.cekBtn) els.cekBtn.hidden = !ready;

      /* Grid nominal HANYA setelah cek dilakukan (sukses atau fail-open). */
      if (ready && state.cekDone && PRODUK.length) {
        state.items = PRODUK;
        grid.render(state.items, "token|" + PRODUK.length);
      } else {
        state.items = [];
        grid.clear();
      }

      /* Placeholder: sembunyi kalau sudah ada sesuatu untuk dilakukan. */
      els.empty.hidden = ready;

      segarkanStatusUI();
    } catch (err) {
      console.error("listrik: input error:", err);
    }
  }

  function clearMeter() {
    els.meter.value = "";
    onInput();
    els.meter.focus();
  }

  /* ---- CEK NAMA PELANGGAN (inquiry-pln asli lewat DikaApi) -------- */

  function showCustomer(c) {
    if (!els.cust) return;
    if (els.custId) els.custId.textContent = c.meter || state.meter;
    if (els.custName) els.custName.textContent = c.nama || "-";
    if (els.custTarif) els.custTarif.textContent = c.tarif || "-";
    els.cust.hidden = false;
    els.empty.hidden = true;
  }

  function revealProduk() {
    state.cekDone = true;
    els.warn.hidden = false;
    if (PRODUK.length) {
      state.items = PRODUK;
      grid.render(state.items, "token|" + PRODUK.length);
    }
    segarkanStatusUI();
  }

  function onCek() {
    if (state.cekBusy) return;
    var meter = sanitize(els.meter.value);
    if (meter.length < MIN_DIGITS) {
      if (els.cekErr) {
        els.cekErr.textContent = "Nomor meter minimal " + MIN_DIGITS + " digit.";
        els.cekErr.hidden = false;
      }
      return;
    }
    if (!window.DikaApi || typeof window.DikaApi.inquiryPln !== "function") {
      /* Modul jaringan belum siap -> jangan menahan member, buka grid saja. */
      console.error("listrik: DikaApi.inquiryPln tidak tersedia.");
      revealProduk();
      return;
    }

    state.cekBusy = true;
    state.meter = meter;
    els.cekBtn.classList.add("is-loading");
    els.cekBtn.disabled = true;
    if (els.cekErr) els.cekErr.hidden = true;

    window.DikaApi.inquiryPln(meter).then(function (d) {
      if (meter !== sanitize(els.meter.value)) return;   // nomor keburu diganti
      var st = String(d.status || "").toLowerCase();
      var rc = String(d.rc || "");
      var sukses = st === "sukses" || rc === "00";

      if (sukses && (d.name || d.nama)) {
        state.cust = {
          nama: d.name || d.nama,
          tarif: d.segment_power || d.tarif || d.daya || "",
          meter: d.meter_no || d.customer_no || meter,
          subscriber: d.subscriber_id || "",
        };
        showCustomer(state.cust);
        revealProduk();
      } else {
        /* rc != 00 / tidak ada nama -> pesan ramah + tetap buka grid. */
        var pesan = window.DikaRC
          ? window.DikaRC.pesan(rc, "Nama pelanggan belum bisa kami tampilkan. Pastikan nomor meter sudah benar sebelum melanjutkan, ya.")
          : (d.message || "Nama pelanggan belum bisa ditampilkan. Periksa lagi nomor meternya, ya.");
        if (els.cekErr) { els.cekErr.textContent = pesan; els.cekErr.hidden = false; }
        state.cust = null;
        if (els.cust) els.cust.hidden = true;
        revealProduk();
      }
    }).catch(function (err) {
      if (meter !== sanitize(els.meter.value)) return;
      console.error("listrik: inquiry-pln gagal:", err && (err.sebab || err.message), err);
      var pesan = (err && err.pesanMember) ||
        "Pengecekan nama pelanggan sedang tidak tersedia. Pastikan nomor meter kamu benar, lalu lanjutkan.";
      if (els.cekErr) { els.cekErr.textContent = pesan; els.cekErr.hidden = false; }
      state.cust = null;
      if (els.cust) els.cust.hidden = true;
      revealProduk();
    }).then(function () {
      state.cekBusy = false;
      els.cekBtn.classList.remove("is-loading");
      els.cekBtn.disabled = false;
    });
  }

  /* ---- Konfirmasi ---------------------------------------------------- */

  function openConfirm(idx) {
    var item = state.items[idx];
    if (!item || state.meter.length < MIN_DIGITS) return;

    var rows = [];
    if (state.cust && state.cust.nama) {
      rows.push({ label: "Nama Pelanggan", value: state.cust.nama });
    }
    rows.push({ label: "Nomor Meter/ID Pelanggan", value: state.meter });
    if (state.cust && state.cust.tarif) {
      rows.push({ label: "Tarif/Daya", value: state.cust.tarif });
    }
    rows.push({ label: "Nominal Token", value: item.nama });
    rows.push({ label: "Total Bayar", value: UI.fmtRupiah(item.harga_modal), total: true });

    modal.show(rows, { item: item, meter: state.meter, cust: state.cust });
  }

  /* ---- Init ---------------------------------------------------------- */

  function init() {
    if (!UI) { console.error("listrik: produk-ui.js belum di-link"); return; }
    var $ = function (id) { return document.getElementById(id); };
    els = {
      app: $("app"), meter: $("meterInput"), clear: $("clearBtn"),
      warn: $("warnBox"),
      cekBtn: $("cekBtn"), cekErr: $("cekErr"),
      cust: $("custCard"), custId: $("custId"),
      custName: $("custName"), custTarif: $("custTarif"),
      prodSec: $("prodSec"), prodGrid: $("prodGrid"), empty: $("pEmpty"),
    };

    statusUI = UI.createStatus({ anchor: els.prodSec });

    grid = UI.createGrid({ grid: els.prodGrid, section: els.prodSec, slug: "listrik" });
    grid.onPick(openConfirm);

    modal = UI.createModal({
        slug: "listrik",
      overlay: $("confirmOverlay"), rows: $("cmRows"),
      cancel: $("cmCancel"), pay: $("cmPay"),
      payTitle: "Pembayaran",
      payLine: function (ctx) {
        if (!ctx) return "";
        return "Token listrik " + ctx.item.nama +
          " untuk nomor meter " + ctx.meter +
          " belum bisa diproses karena metode pembayaran masih " +
          "dalam pengerjaan. Terima kasih sudah menunggu!";
      },
    });

    els.meter.addEventListener("input", onInput);
    els.clear.addEventListener("click", clearMeter);
    if (els.cekBtn) els.cekBtn.addEventListener("click", onCek);
    UI.wireBack(els.app, $("backBtn"));

    /* Kontak / suara / scan — halaman ini memakai produk-ui.js LANGSUNG
       (tanpa produk-page.js / provider-page.js), jadi attach dipanggil di
       sini sendiri. Scan barcode justru paling berguna di halaman ini:
       nomor meter tercetak sebagai barcode di kartu & struk PLN. */
    if (window.DikaInputHelper) window.DikaInputHelper.attach(els.meter);

    /* Contoh nomor meter PLN (11-12 digit, diawali 5 atau 1). */
    if (window.DikaPlaceholder) {
      window.DikaPlaceholder.pasang(els.meter,
        ["5300 1234 5678", "1122 3344 5566", "5411 2233 4455"]);
    }

    /* Cache yang masih berlaku dipakai langsung — tidak ada kedip skeleton
       untuk perpindahan halaman yang cepat. */
    if (cobaDariCache()) {
      if (window.DikaProduk) window.DikaProduk.check(PRODUK, "prabayar", "listrik");
    } else {
      muat(false);
    }

    /* Sinkronkan tampilan dengan isi input (mis. dipulihkan bfcache) */
    onInput();
  }

  /* Dijaga: file ini AMAN dimuat tanpa produk-ui.js (mis. di margin.html
     untuk membaca jumlah produk saja, lewat pendaftaran di atas) — di
     halaman aslinya (listrik.html) produk-ui.js SELALU ada, perilakunya
     tidak berubah sama sekali. */
  if (UI) {
    UI.onReady ? UI.onReady(init) : document.addEventListener("DOMContentLoaded", init);
  } else {
    /* margin.html: tanpa produk-ui.js & tanpa jaringan — cukup baca cache. */
    cobaDariCache();
  }

  /* Dibuka untuk pengujian & diagnosa. */
  window.DikaListrik = {
    ringkasan: function () { return ringkasan; },
    status: function () { return status; },
    produk: function () { return PRODUK; },
    muatUlang: function () { muat(true); },
  };
})();
