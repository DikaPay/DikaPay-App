/* ===========================================================================
   DikaPay — pascabayar-live.js
   PERANGKAI BERSAMA untuk 16 halaman PASCABAYAR (Tipe C) yang datanya
   datang dari backend DikaPay.

     window.DikaPascaLive.pasang({
       slug,               // slug DikaPay (mis. "pdam")
       label,              // nama enak-dibaca untuk pesan kosong/log
       single: <bool>,     // true  = 1 biller  -> config.produkFor
                           // false = banyak biller -> config.produkListFor
       opMap: {            // ADA -> mode operator (hp-pasca): idField = nomor HP,
         telkomsel: ["halo"],   //   tiap opKey dipetakan ke biller lewat
         indosat:   ["matrix"], //   pencocokan SUBSTRING nama (case-insensitive).
         ...                    //   -> config.produkByOperatorFor
       },
       ...rest             // sisa config diteruskan apa adanya ke DikaManualPage
                           //   (idField, warning, rows, payLine, choiceTitle,
                           //    pickedLabel, minNominal, maxNominal, detect, dst)
     }) -> { ringkasan(), status(), produk(), muatUlang() }

   ======================== KENAPA POLANYA BEDA DARI PRABAYAR ================
   Endpoint pascabayar (`api-produk.php?jenis=pascabayar`) berbentuk lain:

     - SEMUA 400 baris berkategori "Pascabayar" — TIDAK ada 16 nama kategori
       seperti di prabayar. Pemisah 16 slug ada di field `brand`
       ("PDAM", "PBB", "PLN PASCABAYAR", "E-MONEY", ...).
     - TIDAK ada `harga_modal` — hanya `admin_fee` (biaya admin per biller).
       Nominal tagihan datang dari inquiry, bukan dari produk.
     - Controllernya manual-page.js (Tipe C), bukan produk-page/provider-page.

   Jadi modul ini TIDAK bisa menyalin kategori-live.js. Yang dilakukan:
     1. ambil katalog penuh lewat DikaApi (satu pintu fetch + cache 5 menit,
        kunci "dikapay:katalog:pascabayar" — TERPISAH dari cache prabayar)
     2. saring lewat `DikaKategoriMap.cocokkan(brand, brand, "pascabayar")`
        — argumen `jenis` yang ketiga inilah yang menjaga E-Money pascabayar
        tidak bocor ke halaman E-Money prabayar (dan sebaliknya). Dipanggil
        SEKALI per nilai `brand` unik (16), bukan per baris (400), supaya
        console tidak banjir peringatan.
     3. bentuk ke record produk-schema PASCABAYAR:
        { sku, nama, brand, admin_fee, kategori_asli, gangguan? }
        `admin_fee` diambil APA ADANYA dari backend (bisa 0 — itu sah untuk
        sebagian biller); `gangguan` diturunkan lewat DikaProduk.statusGangguan.
     4. nama biller kembar digabung: yang TIDAK gangguan menang dulu, lalu
        admin termurah. Daftar diurut A-Z (biller = daftar kota/perusahaan,
        bukan nominal — urutan abjad yang paling mudah dicari).
     5. suapkan ke DikaManualPage lewat callback (produkFor / produkListFor)
        + kartu status (memuat/gagal/kosong) + `.segarkan()` saat data tiba.

   MARGIN: pascabayar TIDAK pernah bermargin (keputusan produk) — modul ini
   SENGAJA tidak mendaftar ke katalog-jumlah.js.
   =========================================================================== */

(function () {
  "use strict";

  function pasang(config) {
    var SLUG = config.slug;
    var JENIS = "pascabayar";
    var LABEL = config.label || SLUG;
    var OP_MAP = config.opMap || null;
    var MODE = OP_MAP ? "operator" : (config.single ? "single" : "list");
    var SINGLE = MODE === "single";
    var UI = window.DikaProdukUI;

    var RECORDS = [];
    var status = "idle";        /* idle | memuat | siap | gagal */
    var pesanGagal = "";
    var ringkasan = null;
    var halaman = null;
    var statusUI = null;

    /* ---- Saring: baris mana yang slug-nya SLUG -------------------------- */

    var putusanBrand = {};      /* brand -> boolean (memo) */
    function milikSlug(brand) {
      var KM = window.DikaKategoriMap;
      if (!KM || typeof KM.cocokkan !== "function") {
        console.error(SLUG + ": kategori-map.js belum di-link — tidak bisa menyaring brand.");
        return false;
      }
      var b = String(brand || "");
      if (!(b in putusanBrand)) {
        try { putusanBrand[b] = KM.cocokkan(b, b, JENIS) === SLUG; }
        catch (e) { putusanBrand[b] = false; }
      }
      return putusanBrand[b];
    }

    /* ---- Rapikan nama biller (TAMPILAN saja) -------------------------
       Backend mengirim sebagian nama dengan kapital acak ("Pln Pascabayar",
       "Bpjs Kesehatan", "Wom Finance", "PBB kota blitar"). Yang dirapikan
       HANYA tampilan `nama`; `sku` (kode_produk) tetap kunci pencocokan
       Digiflazz, `kategori_asli` tetap brand mentah — logika saring &
       dedupe tidak tersentuh (semua case-insensitive).

       Aturan konservatif, sengaja tidak agresif:
         - kata yang SEHARUSNYA akronim (PLN/PDAM/PBB/BPJS/...) -> huruf besar
         - kata SEMUA HURUF KECIL -> huruf pertama besar ("kota" -> "Kota")
         - kata SUDAH kapital penuh ("CBN","XL","INDOVISION") -> dibiarkan
           (menebak pemisahan "FIRSTMEDIA"->"First Media" terlalu berisiko)
         - kata campur ("MyRepublic","by.U","K-Vision","LinkAja") -> dibiarkan */
    var AKRONIM = {
      PLN: 1, PDAM: 1, PBB: 1, PDAB: 1, BPJS: 1, PGN: 1, PT: 1, TV: 1,
      WOM: 1, NSC: 1, ACC: 1, CBN: 1, BAF: 1, FIF: 1, PBBKB: 1, VA: 1,
    };
    function rapikanNama(s) {
      return String(s || "").split(/(\s+)/).map(function (tok) {
        if (!tok || /^\s+$/.test(tok)) return tok;
        var m = tok.match(/^([^A-Za-z]*)([A-Za-z][A-Za-z'.-]*?)([^A-Za-z]*)$/);
        if (!m) return tok;
        var pre = m[1], core = m[2], post = m[3];
        var up = core.toUpperCase();
        if (AKRONIM[up]) core = up;
        else if (/^[a-z]+$/.test(core)) core = core.charAt(0).toUpperCase() + core.slice(1);
        return pre + core + post;
      }).join("");
    }

    /* ---- Bentuk record + dedupe --------------------------------------- */

    /* Pemenang saat dua biller punya NAMA sama: yang TIDAK gangguan lebih
       dulu, baru admin termurah — pola yang sama dengan lebihBaik() di
       kategori-live.js, disesuaikan (admin_fee, bukan harga_modal). */
    function lebihBaik(baru, lama) {
      var rusakBaru = !!baru.gangguan, rusakLama = !!lama.gangguan;
      if (rusakBaru !== rusakLama) return rusakLama;
      return (baru.admin_fee || 0) < (lama.admin_fee || 0);
    }

    function bangun(semua) {
      var dipakai = (semua || []).filter(function (p) {
        return p && milikSlug(p.brand);
      });

      var per = {};
      var digabung = 0;
      dipakai.forEach(function (p) {
        var mentah = String(p.nama || "").trim();
        var rec = {
          sku: String(p.kode_produk || ""),
          nama: rapikanNama(mentah),
          namaAsli: mentah,          /* jejak nama backend apa adanya */
          brand: String(p.brand || "").trim(),
          /* admin_fee APA ADANYA — 0 itu sah (sebagian biller memang
             tidak memungut admin di Digiflazz). null/undefined -> 0. */
          admin_fee: typeof p.admin_fee === "number" && isFinite(p.admin_fee) ? p.admin_fee : 0,
          kategori_asli: String(p.brand || LABEL),
        };
        if (window.DikaProduk && window.DikaProduk.statusGangguan(p)) rec.gangguan = true;
        var k = rec.nama.toLowerCase();
        if (!per[k]) { per[k] = rec; return; }
        digabung++;
        if (lebihBaik(rec, per[k])) per[k] = rec;
      });

      var out = Object.keys(per).map(function (k) { return per[k]; })
        .sort(function (a, b) {
          return a.nama.localeCompare(b.nama, "id", { sensitivity: "base" });
        });

      ringkasan = {
        diterima: (semua || []).length,
        cocokBrand: dipakai.length,
        terpakai: out.length,
        digabung: digabung,
        gangguan: out.filter(function (x) { return x.gangguan; }).length,
        brand: Object.keys(putusanBrand).filter(function (b) { return putusanBrand[b]; }),
      };
      console.info(SLUG + ": " + out.length + " biller siap (" + dipakai.length +
        " baris cocok brand, " + digabung + " nama kembar digabung, " +
        ringkasan.gangguan + " gangguan) dari " + ringkasan.diterima +
        " produk pascabayar.");
      return out;
    }

    /* ---- Kartu status ------------------------------------------------- */

    function anchor() {
      /* Multi-biller: di atas baris pemicu pemilih. Single: di atas kartu
         nominal/cek-tagihan. Keduanya elemen yang pasti ada di 16 halaman. */
      return document.getElementById(SINGLE ? "nominalSec" : "choiceSec")
        || document.getElementById("pEmpty");
    }

    function aturChoiceSec(tampil) {
      var sec = document.getElementById("choiceSec");
      if (sec && !tampil) sec.hidden = true;
      /* tampil=true: JANGAN paksa terlihat — manual-page yang mengatur
         visibilitasnya lewat idReady(). */
    }

    function segarkanStatusUI() {
      if (!statusUI) return;
      if (status === "gagal") {
        aturChoiceSec(false);
        statusUI.gagal(pesanGagal, function () { muat(true); });
        return;
      }
      if (status === "memuat") {
        /* Multi-biller menunggu daftar provider; single-biller tetap
          menunggu data server di atas nominal/cek tagihan. Keduanya perlu
          placeholder agar form tidak terlihat kosong saat jaringan lambat. */
        statusUI.memuat(SINGLE ? 3 : 4);
        return;
      }
      if (status === "siap" && !RECORDS.length) {
        aturChoiceSec(false);
        statusUI.kosong("Layanan " + LABEL + " sedang belum tersedia. Segera hadir!");
        return;
      }
      statusUI.sembunyi();
    }

    /* ---- Muat data -------------------------------------------------- */

    function terapkanKe(daftar) {
      RECORDS = bangun(daftar);
      status = "siap";
    }

    function muat(paksa) {
      if (!window.DikaApi) {
        console.error(SLUG + ": api.js belum di-link — data tidak bisa dimuat.");
        status = "gagal";
        pesanGagal = "Modul jaringan belum termuat. Coba buka ulang halamannya, ya.";
        segarkanStatusUI();
        return;
      }
      if (status === "memuat") return;
      status = "memuat"; pesanGagal = "";
      segarkanStatusUI();

      window.DikaApi.katalog(JENIS, !!paksa)
        .then(function (semua) {
          terapkanKe(semua);
          segarkanStatusUI();
          if (halaman && halaman.segarkan) halaman.segarkan();
        })
        .catch(function (err) {
          console.error(SLUG + ": gagal memuat katalog pascabayar:",
            err && (err.sebab || err.message), err);
          status = "gagal";
          pesanGagal = (err && err.pesanMember) ||
            "Data tidak bisa dimuat sekarang. Coba lagi, ya.";
          segarkanStatusUI();
        });
    }

    function cobaDariCache() {
      if (!window.DikaApi || typeof window.DikaApi.bacaCache !== "function") return false;
      var mentah = window.DikaApi.bacaCache(JENIS);
      if (!mentah) return false;
      terapkanKe(mentah);       /* 0 record pun jawaban sah — jangan re-fetch */
      return true;
    }

    /* ---- Pasang ke halaman ----------------------------------------- */

    /* Peta opKey -> record, dari opMap (pencocokan substring nama). Hanya
       mode operator (hp-pasca). Dihitung ULANG tiap dibutuhkan supaya data
       yang telat datang otomatis terpakai. */
    function petaOperator() {
      var out = {};
      if (!OP_MAP) return out;
      Object.keys(OP_MAP).forEach(function (opKey) {
        var kunci = OP_MAP[opKey] || [];
        for (var i = 0; i < RECORDS.length; i++) {
          var n = RECORDS[i].namaAsli.toLowerCase();
          if (kunci.some(function (k) { return n.indexOf(String(k).toLowerCase()) >= 0; })) {
            out[opKey] = RECORDS[i];
            break;
          }
        }
      });
      return out;
    }

    var opsi = {};
    Object.keys(config).forEach(function (k) {
      if (k === "single" || k === "label" || k === "opMap") return;
      opsi[k] = config[k];
    });
    opsi.dataSiap = function () { return status === "siap"; };
    opsi.saatBillerBelumSiap = function () { segarkanStatusUI(); };
    if (MODE === "operator") opsi.produkByOperatorFor = petaOperator;
    else if (MODE === "single") opsi.produkFor = function () { return RECORDS[0] || null; };
    else opsi.produkListFor = function () { return RECORDS; };

    if (!window.DikaManualPage) {
      /* Tanpa controller (mis. dibuka di konteks non-halaman) — cukup cache. */
      cobaDariCache();
    } else {
      halaman = window.DikaManualPage(opsi);

      var mulai = function () {
        statusUI = UI ? UI.createStatus({ anchor: anchor() }) : null;
        if (cobaDariCache()) {
          segarkanStatusUI();
          if (halaman && halaman.segarkan) halaman.segarkan();
        } else {
          muat(false);
        }
      };
      if (UI && UI.onReady) UI.onReady(mulai);
      else document.addEventListener("DOMContentLoaded", mulai);
    }

    return {
      ringkasan: function () { return ringkasan; },
      status: function () { return status; },
      produk: function () { return RECORDS; },
      peta: function () {
        return MODE === "operator"
          ? Object.keys(petaOperator()).reduce(function (o, k) { o[k] = petaOperator()[k].nama; return o; }, {})
          : null;
      },
      muatUlang: function () { muat(true); },
    };
  }

  window.DikaPascaLive = { pasang: pasang };
})();
