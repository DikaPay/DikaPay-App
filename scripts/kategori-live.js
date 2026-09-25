/* ===========================================================================
   DikaPay — kategori-live.js
   PERANGKAI BERSAMA untuk halaman produk TIPE A (auto-detect operator) yang
   datanya datang dari backend.

     window.DikaKategoriLive.pasang({
       slug, kategori, sectionTitle, detailLabel, payTitle, payLine,
       subdef?      // { opKey: [{id,label,cocok}] }  -> halaman bertab
       filterMin?   // angka; hilangkan/0 = tanpa filter rentang harga
       labelKosong? // fn(namaOperator) -> teks saat operator tanpa produk
       labelPilihSub?// teks saat sub-brand belum dipilih
     })

   ======================== KENAPA MODUL INI ADA ============================
   `pulsa.js` dan `paket-data.js` membuktikan polanya (fetch -> petakan brand
   -> sub-brand -> subkategori -> render), tapi keduanya merangkainya SENDIRI.
   Menyalin rangkaian itu untuk 22 kategori sisanya berarti 22 salinan logika
   yang sama — persis yang dilarang di CLAUDE.md ("JANGAN menyalin logika
   antar halaman produk"). File ini mengangkatnya jadi satu tempat, sehingga
   file data kategori tinggal berisi: nama kategori di price-list, teks
   halaman, dan (kalau bertab) definisi subkategorinya.

   `pulsa.js` & `paket-data.js` SENGAJA dibiarkan memakai rangkaian mereka
   sendiri: keduanya sudah dinyatakan tuntas & teruji, dan memindahkannya
   sekarang cuma menambah risiko tanpa menambah kemampuan. Perilaku modul ini
   dibuat sama persis dengan keduanya, jadi memindahkan mereka nanti aman.

   YANG DIURUS DI SINI (semua sudah terbukti di dua kategori sebelumnya):
     - ambil katalog lewat DikaApi (satu pintu fetch + cache 5 menit)
     - petakan `brand` -> opKey (brand-map.js), brand asing dilaporkan
     - `gangguan` & `deskripsi` diteruskan kalau backend mengirimnya
     - nama kembar digabung: yang TIDAK gangguan menang dulu, baru termurah
     - pisah sub-brand (Telkomsel vs by.U) + pemilihnya
     - kelompokkan ke subkategori (kalau `subdef` diberikan); sisa yang tidak
       cocok DITITIPKAN ke subkategori terakhir + dicatat console.warn,
       supaya tab "Lainnya" tidak pernah tampil ke member
     - kartu status: skeleton saat memuat, pesan ramah + "Coba Lagi" saat
       gagal, penjelasan saat menunggu pilihan sub-brand
     - daftarkan jumlah produk ke katalog-jumlah.js (dipakai halaman Margin)
   =========================================================================== */

(function () {
  "use strict";

  function pasang(config) {
    var SLUG = config.slug;
    var KATEGORI = config.kategori;
    var JENIS = config.jenis || "prabayar";
    var UI = window.DikaProdukUI;

    var PRODUK = {};
    var status = "idle";           /* idle | memuat | siap | gagal */
    var pesanGagal = "";
    var ringkasan = null;
    var subDipilih = null;         /* sub-brand aktif — memori saja */

    var els = { phone: null };
    var statusUI = null, choiceUI = null, filterUI = null;

    /* ---- Bentuk ulang data backend -> record produk-schema ------------ */

    /* Pemenang saat dua SKU punya NAMA sama persis: yang TIDAK gangguan
       lebih dulu (kartu yang bisa dibeli tidak boleh tertutup kembarannya
       yang bermasalah hanya karena lebih murah), baru harga termurah. */
    function lebihBaik(baru, lama) {
      var rusakBaru = !!baru.gangguan, rusakLama = !!lama.gangguan;
      if (rusakBaru !== rusakLama) return rusakLama;
      return baru.harga_modal < lama.harga_modal;
    }

    function bangun(daftar) {
      var BM = window.DikaBrandMap;
      if (!BM) {
        console.error(SLUG + ": brand-map.js belum di-link — brand tidak bisa dipetakan.");
        return {};
      }
      var hasil = {};
      var takDikenal = {};
      var dilewati = 0;

      (daftar || []).forEach(function (p) {
        if (!p || typeof p.harga_modal !== "number" || !isFinite(p.harga_modal)) { dilewati++; return; }
        var opKey = BM.operator(p.brand, p.nama);
        if (!opKey) { takDikenal[p.brand] = (takDikenal[p.brand] || 0) + 1; return; }
        var rec = {
          sku: String(p.kode_produk || ""),
          nama: String(p.nama || "").trim(),
          brand: String(p.brand || "").trim(),
          harga_modal: p.harga_modal,
          kategori_asli: String(p.kategori || KATEGORI),
        };
        /* Field OPSIONAL diteruskan HANYA kalau backend mengirimnya. */
        if (window.DikaProduk && window.DikaProduk.statusGangguan(p)) rec.gangguan = true;
        if (p.deskripsi) rec.deskripsi = String(p.deskripsi);
        /* `tipe` = kategorisasi RESMI Digiflazz; dasar tab subkategori
           kalau config memakai `tipe: true` (lihat tipe-map.js). */
        if (p.tipe != null && String(p.tipe).trim()) rec.tipe = String(p.tipe).trim();
        (hasil[opKey] = hasil[opKey] || []).push(rec);
      });

      var digabung = 0;
      Object.keys(hasil).forEach(function (opKey) {
        var per = {};
        hasil[opKey].forEach(function (item) {
          var k = item.nama.toLowerCase();
          if (!per[k]) { per[k] = item; return; }
          digabung++;
          if (lebihBaik(item, per[k])) per[k] = item;
        });
        hasil[opKey] = Object.keys(per).map(function (k) { return per[k]; })
          .sort(function (a, b) { return a.harga_modal - b.harga_modal; });
      });

      var akhir = 0;
      Object.keys(hasil).forEach(function (k) { akhir += hasil[k].length; });
      ringkasan = {
        diterima: (daftar || []).length, terpakai: akhir,
        operator: Object.keys(hasil).sort(), takDikenal: takDikenal,
        digabung: digabung, dilewati: dilewati,
        gangguan: Object.keys(hasil).reduce(function (n, op) {
          return n + hasil[op].filter(function (x) { return x.gangguan; }).length;
        }, 0),
      };
      if (Object.keys(takDikenal).length) {
        console.warn(SLUG + ": brand belum dikenal brand-map.js:", JSON.stringify(takDikenal),
          "- tambahkan aliasnya di scripts/brand-map.js.");
      }
      console.info(SLUG + ": " + akhir + " produk siap dari " + ringkasan.diterima +
        " produk kategori " + KATEGORI + " (" + ringkasan.operator.join(", ") + ")");
      return hasil;
    }

    /* ---- Sub-brand (Telkomsel vs by.U) ------------------------------- */

    function kelompokSub(opKey) {
      var BM = window.DikaBrandMap;
      if (!BM || typeof BM.pisahSubBrand !== "function") return null;
      return BM.pisahSubBrand(opKey, PRODUK[opKey] || []);
    }
    function produkSetelahSub(opKey) {
      var kelompok = kelompokSub(opKey);
      if (!kelompok) return PRODUK[opKey] || [];
      for (var i = 0; i < kelompok.length; i++) {
        if (kelompok[i].id === subDipilih) return kelompok[i].produk;
      }
      return [];     /* belum memilih -> jangan menebak */
    }

    /* ---- Subkategori (hanya untuk halaman bertab) -------------------- */

    /* Halaman ini bertab kalau memakai `tipe` resmi ATAU tabel `subdef`
       lama. Dipakai di beberapa tempat, jadi satu fungsi supaya ketiganya
       tidak bisa berbeda pendapat. */
    function bertab() {
      return !!(config.tipe || config.subdef);
    }

    function definisiUntuk(opKey) {
      if (!config.subdef) return null;
      /* Sub-brand boleh punya famili SENDIRI (by.U bukan Flash/Ilmupedia). */
      if (subDipilih && config.subdef[subDipilih]) return config.subdef[subDipilih];
      return config.subdef[opKey] || [];
    }

    function subKategori(opKey) {
      /* ---- Jalur BARU: field `tipe` RESMI Digiflazz ------------------
         Dipilih lewat `tipe: true` di config. Tidak butuh tabel famili
         per operator sama sekali — termasuk untuk sub-brand: by.U punya
         nilai `tipe` sendiri di price-list, jadi pemetaan yang sama
         menghasilkan tab yang benar tanpa cabang khusus. */
      if (config.tipe) {
        var produkT = produkSetelahSub(opKey);
        if (!produkT.length) return [];
        var T = window.DikaTipe;
        if (!T) {
          console.error(SLUG + ": tipe-map.js belum di-link.");
          return [{ id: "semua", label: "Semua Produk", produk: produkT }];
        }
        return T.kelompokkan(produkT, {
          ctx: SLUG + "/" + opKey + (subDipilih ? "/" + subDipilih : ""),
          labelUmum: config.labelUmum,
          min: config.minFamili || 0,
        });
      }

      /* ---- Jalur LAMA: tebakan kata kunci dari nama produk ---------- */
      var def = definisiUntuk(opKey);
      if (!def) return null;
      var SK = window.DikaSubkategori;
      var produk = produkSetelahSub(opKey);
      if (!produk.length) return [];
      if (!SK) {
        console.error(SLUG + ": subkategori-map.js belum di-link.");
        return [{ id: "semua", label: "Semua Produk", produk: produk }];
      }

      var hasil = SK.kelompokkan(def, produk, SLUG + "/" + opKey);

      /* "Lainnya" tidak boleh tampil ke member: sisanya dititipkan ke
         subkategori TERAKHIR (yang memang keranjang umum kategori itu) dan
         dicatat, supaya famili baru dari Digiflazz ketahuan tanpa membuat
         tab bernama "Lainnya". */
      var lain = null;
      hasil = hasil.filter(function (s) {
        if (s.id !== "lainnya") return true;
        lain = s; return false;
      });
      if (lain && lain.produk.length) {
        var umum = def.length ? def[def.length - 1] : null;
        console.warn(SLUG + ": " + lain.produk.length + " produk belum punya famili — " +
          "sementara masuk \"" + (umum ? umum.label : "?") + "\". Tambahkan kata kuncinya di SUBDEF:",
          lain.produk.slice(0, 8).map(function (p) { return p.nama; }));
        var target = null;
        if (umum) hasil.forEach(function (s) { if (s.id === umum.id) target = s; });
        if (target) target.produk = target.produk.concat(lain.produk);
        else if (umum) hasil.push({ id: umum.id, label: umum.label, produk: lain.produk });
        else hasil.push({ id: "umum", label: "Produk Lain", produk: lain.produk });
      }
      return hasil;
    }

    /* Tab aktif dibaca dari #prodTabs — markup yang memang kontrak semua
       halaman produk. Dibaca, bukan dikendalikan; pemiliknya produk-page.js. */
    function subAktifId(daftarSub) {
      if (!daftarSub || !daftarSub.length) return null;
      var el = document.querySelector("#prodTabs .ptab.is-active");
      var id = el && el.dataset ? el.dataset.id : null;
      for (var i = 0; i < daftarSub.length; i++) if (daftarSub[i].id === id) return daftarSub[i].id;
      return daftarSub[0].id;
    }

    /* ---- Kontrak produk-page.js -------------------------------------- */

    function terapkanFilter(list) {
      return filterUI ? filterUI.terapkan(list) : list;
    }

    function productsFor(opKey) {
      var list = produkSetelahSub(opKey);
      if (!Array.isArray(list) || !list.length) return [];
      return terapkanFilter(list);
    }

    function subFor(opKey) {
      var daftar = subKategori(opKey);
      if (!daftar) return [];
      if (!daftar.length) {
        if (filterUI) filterUI.render([], (opKey || "-") + "|kosong");
        return [];
      }
      if (!filterUI) return daftar;

      var aktifId = subAktifId(daftar);
      var aktif = null;
      daftar.forEach(function (s) { if (s.id === aktifId) aktif = s; });
      filterUI.render(aktif ? aktif.produk : [],
        opKey + "|" + (subDipilih || "-") + "|" + (aktifId || "-"));
      if (!aktif) return daftar;
      return daftar.map(function (s) {
        if (s.id !== aktifId) return s;
        return { id: s.id, label: s.label, produk: filterUI.terapkan(s.produk) };
      });
    }

    function renderKey(opKey) {
      var bagian = [subDipilih || "-"];
      if (bertab()) bagian.push(subAktifId(subKategori(opKey)) || "-");
      if (filterUI) bagian.push(filterUI.kunciRender());
      return bagian.join("|");
    }

    function kosongWajar(opKey) {
      if (status !== "siap") return true;
      if (kelompokSub(opKey) && !subDipilih) return true;
      /* Operator yang memang TIDAK punya produk di katalog Digiflazz (mis.
         Masa Aktif untuk Smartfren & by.U) bukan kesalahan data — kartu
         status sudah menjelaskannya ke member, jadi jangan ikut dicatat
         sebagai error. Kosong DI DALAM operator yang punya produk (filter
         atau subkategori meleset) tetap dilaporkan seperti sebelumnya. */
      return !(PRODUK[opKey] || []).length;
    }

    /* ---- Tampilan status --------------------------------------------- */

    function operatorTerdeteksi() {
      var OP = window.DikaOperator;
      if (!OP || !els.phone) return null;
      return OP.detect(OP.sanitize(els.phone.value));
    }

    function picuRenderUlang() {
      if (!els.phone) return;
      try { els.phone.dispatchEvent(new Event("input", { bubbles: true })); }
      catch (e) { console.error(SLUG + ": gagal memicu render ulang:", e); }
    }

    function segarkanStatusUI() {
      if (!statusUI) return;
      var opKey = operatorTerdeteksi();

      if (status === "gagal") {
        if (choiceUI) choiceUI.render([]);
        statusUI.gagal(pesanGagal, function () { muat(true); });
        return;
      }
      if (status === "memuat") {
        if (choiceUI) choiceUI.render([]);
        if (opKey) statusUI.memuat(6); else statusUI.sembunyi();
        return;
      }
      if (!opKey) {
        if (choiceUI) choiceUI.render([]);
        subDipilih = null;
        statusUI.sembunyi();
        return;
      }

      var kelompok = kelompokSub(opKey);
      if (choiceUI) {
        choiceUI.render(kelompok || [], { title: "Pilih Jenis Kartu", label: "Jenis Kartu" });
        subDipilih = choiceUI.pilih();
      }
      if (kelompok && !subDipilih) {
        statusUI.kosong(config.labelPilihSub ||
          "Pilih dulu jenis kartunya di atas — produk Telkomsel dan by.U berbeda, " +
          "walaupun nomornya sama-sama diawali blok Telkomsel.");
        return;
      }
      if (!produkSetelahSub(opKey).length) {
        var OP = window.DikaOperator;
        var nama = OP && OP.get(opKey) ? OP.get(opKey).name : "operator ini";
        statusUI.kosong(config.labelKosong ? config.labelKosong(nama)
          : ("Belum ada produk " + nama + " yang tersedia saat ini."));
        return;
      }
      statusUI.sembunyi();
    }

    function segarkanFilterUI() {
      if (!filterUI || bertab()) return;   /* halaman bertab: diurus subFor */
      var opKey = operatorTerdeteksi();
      filterUI.render(opKey ? produkSetelahSub(opKey) : [],
        (opKey || "-") + "|" + (subDipilih || "-"));
    }

    /* ---- Muat data ---------------------------------------------------- */

    function daftarkanJumlah() {
      var K = window.DikaKatalogJumlah;
      if (!K || typeof K.daftarkan !== "function") return;
      K.daftarkan(SLUG, PRODUK, "operator");
    }

    function muat(paksa) {
      if (!window.DikaApi) {
        console.error(SLUG + ": api.js belum di-link — data produk tidak bisa dimuat.");
        status = "gagal";
        pesanGagal = "Modul jaringan belum termuat. Coba buka ulang halamannya, ya.";
        segarkanStatusUI();
        return;
      }
      if (status === "memuat") return;
      status = "memuat";
      pesanGagal = "";
      segarkanStatusUI();

      window.DikaApi.kategori(JENIS, KATEGORI, !!paksa)
        .then(function (daftar) {
          PRODUK = bangun(daftar);
          daftarkanJumlah();
          status = "siap";
          segarkanStatusUI();
          segarkanFilterUI();
          picuRenderUlang();
        })
        .catch(function (err) {
          console.error(SLUG + ": gagal memuat katalog:", err && (err.sebab || err.message), err);
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

    /* ---- Pasang ke halaman -------------------------------------------- */

    if (!window.DikaProdukPage) {
      /* margin.html: tanpa controller & tanpa jaringan — cukup baca cache. */
      cobaDariCache();
      return bagikan();
    }

    var opsi = {
      slug: SLUG,
      sectionTitle: config.sectionTitle,
      detailLabel: config.detailLabel,
      payTitle: config.payTitle || "Pembayaran",
      payLine: config.payLine,
      renderKey: renderKey,
      kosongWajar: kosongWajar,
    };
    if (bertab()) opsi.subFor = subFor; else opsi.productsFor = productsFor;
    window.DikaProdukPage(opsi);

    var mulai = function () {
      els.phone = document.getElementById("phoneInput");
      statusUI = UI ? UI.createStatus({ anchor: document.getElementById("prodSec") }) : null;
      choiceUI = UI ? UI.createChoice({ anchor: document.getElementById("warnBox") }) : null;
      if (UI && config.filterMin) {
        filterUI = UI.createFilterHarga({
          anchor: document.getElementById("prodGrid"), min: config.filterMin,
        });
      }

      if (choiceUI) choiceUI.onPick(function (id) {
        subDipilih = id;
        segarkanStatusUI();
        segarkanFilterUI();
        picuRenderUlang();
      });
      if (filterUI) filterUI.onPick(function () { picuRenderUlang(); });
      if (els.phone) els.phone.addEventListener("input", function () {
        segarkanStatusUI();
        segarkanFilterUI();
      });

      if (cobaDariCache()) {
        segarkanStatusUI();
        segarkanFilterUI();
        picuRenderUlang();
      } else {
        muat(false);
      }
    };
    if (UI && UI.onReady) UI.onReady(mulai);
    else document.addEventListener("DOMContentLoaded", mulai);

    return bagikan();

    /* Dibuka untuk pengujian & diagnosa. */
    function bagikan() {
      return {
        ringkasan: function () { return ringkasan; },
        status: function () { return status; },
        produk: function () { return PRODUK; },
        muatUlang: function () { muat(true); },
        debug: function () {
          var opKey = operatorTerdeteksi();
          var daftar = opKey ? subKategori(opKey) : null;
          return {
            opKey: opKey,
            subDipilih: subDipilih,
            subAktif: daftar ? subAktifId(daftar) : null,
            filterAktif: filterUI ? filterUI.aktif() : null,
            setelahSub: opKey ? produkSetelahSub(opKey).length : 0,
            subkategori: daftar ? daftar.map(function (s) { return s.id + ":" + s.produk.length; }) : null,
          };
        },
      };
    }
  }

  window.DikaKategoriLive = { pasang: pasang };
})();
