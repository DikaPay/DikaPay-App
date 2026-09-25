/* ===========================================================================
   DikaPay — perangkat.js
   DAFTAR PERANGKAT AKTIF milik member — data NYATA, bukan dummy.

     window.DikaPerangkat = {
       KEY_PREFIX
       catat()            // -> Promise<info|null>  rekam perangkat ini
       daftar()           // [{ id, nama, platform, os, terakhir, ini }] terbaru dulu
       iniPerangkat()     // -> Promise<{ id, nama, ... }>  identitas perangkat ini
       keluarkan(id)      // hapus satu perangkat dari daftar
       waktuRelatif(ts)   // "Aktif sekarang" / "3 hari lalu"
     }

   ======================= KENAPA MODUL INI ADA =======================
   Layar "Perangkat Aktif" di Akun dulu merender array DEVICES hardcoded:
   "Xiaomi Redmi Note" (Aktif sekarang) dan "Samsung A52" (3 hari lalu) —
   dua nama yang muncul SAMA PERSIS di setiap HP yang memasang aplikasi
   ini. Untuk layar keamanan, itu lebih buruk daripada kosong: member
   diberi tahu ada perangkat lain yang login padahal tidak ada, dan
   perangkatnya sendiri tidak pernah kelihatan.

   Sekarang identitas diambil dari @capacitor/device (model, pabrikan,
   OS, versi, identifier per-instalasi) dan dicatat saat LOGIN.
   ====================================================================

   Disimpan per NOMOR MEMBER (`dikapay:devices:<nomor digit>`), pola yang
   sama dengan notif-store.js — satu HP bisa dipakai bergantian oleh dua
   akun, dan daftar perangkat akun A tidak boleh bocor ke akun B.

   BATAS YANG JUJUR (fase 1): daftar ini hidup di localStorage PERANGKAT
   INI. Jadi ia mencatat "perangkat mana saja yang pernah login DI SINI",
   bukan seluruh sesi member di semua HP — untuk itu perlu backend.
   "Keluarkan perangkat" pun baru menghapus barisnya, belum benar-benar
   mencabut sesi di perangkat sana.

   TODO fase 2: pindah ke `GET /api/sessions` & `DELETE /api/sessions/:id`
   lewat api.js. Bentuk objek di daftar() dipertahankan supaya akun.js
   tidak perlu diubah lagi.
   =========================================================================== */

(function () {
  "use strict";

  var KEY_PREFIX = "dikapay:devices:";
  var MAKS = 10;              /* simpan 10 perangkat terakhir, sisanya dibuang */

  /* ---- Identitas perangkat ------------------------------------------- */

  function plugin() {
    try {
      var P = window.Capacitor && window.Capacitor.Plugins;
      return (P && P.Device) || null;
    } catch (e) { return null; }
  }

  /* Nama yang enak dibaca member. Android mengembalikan `manufacturer`
     ("Xiaomi") terpisah dari `model` ("Redmi Note 12"), dan model kadang
     sudah memuat nama pabrikannya — jadi jangan digabung buta-buta. */
  function namaDari(info) {
    var pabrik = bersih(info.manufacturer);
    var model = bersih(info.model);
    if (info.name) return info.name;                 /* nama yang diberi pemilik */
    if (!model) return pabrik || "Perangkat tidak dikenal";
    if (!pabrik) return model;
    if (model.toLowerCase().indexOf(pabrik.toLowerCase()) === 0) return model;
    return pabrik + " " + model;
  }

  function bersih(s) {
    s = String(s == null ? "" : s).trim();
    if (!s) return "";
    /* "xiaomi" -> "Xiaomi"; model seperti "SM-A525F" dibiarkan apa adanya. */
    return /^[a-z]+$/.test(s) ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  /* Di browser biasa plugin tidak ada — jangan menampilkan apa pun yang
     mengaku sebagai perangkat asli. Yang dikembalikan ditandai jelas. */
  function dariBrowser() {
    var ua = String(navigator.userAgent || "");
    var nama = "Browser";
    if (/Android/i.test(ua)) nama = "Browser Android";
    else if (/iPhone|iPad/i.test(ua)) nama = "Browser iOS";
    else if (/Windows/i.test(ua)) nama = "Browser Windows";
    else if (/Mac OS X/i.test(ua)) nama = "Browser macOS";
    else if (/Linux/i.test(ua)) nama = "Browser Linux";
    return {
      id: idBrowser(),
      nama: nama,
      model: "",
      platform: "web",
      os: "web",
      osVersion: "",
    };
  }

  /* Identifier stabil untuk jalur web, supaya membuka aplikasi di browser
     yang sama tidak menambah baris baru tiap kali. */
  function idBrowser() {
    var K = "dikapay:device:webid";
    try {
      var v = localStorage.getItem(K);
      if (v) return v;
      v = "web-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      localStorage.setItem(K, v);
      return v;
    } catch (e) {
      return "web-sementara";
    }
  }

  function iniPerangkat() {
    var P = plugin();
    if (!P || typeof P.getInfo !== "function") return Promise.resolve(dariBrowser());
    return Promise.resolve(P.getInfo())
      .then(function (info) {
        info = info || {};
        return Promise.resolve(
          typeof P.getId === "function" ? P.getId() : { identifier: "" }
        ).then(function (idr) {
          var id = (idr && (idr.identifier || idr.uuid)) || "";
          return {
            id: id || ("dev-" + namaDari(info)),
            nama: namaDari(info),
            model: bersih(info.model),
            platform: info.platform || "",
            os: info.operatingSystem || "",
            osVersion: info.osVersion || "",
          };
        });
      })
      .catch(function (e) {
        console.error("perangkat: gagal membaca identitas perangkat:", e);
        return dariBrowser();
      });
  }

  /* ---- Penyimpanan --------------------------------------------------- */

  function nomorAktif() {
    try {
      var p = JSON.parse(localStorage.getItem("dikapay:profile") || "{}");
      return String(p.phone || "").replace(/\D/g, "");
    } catch (e) { return ""; }
  }

  function kunci() {
    var no = nomorAktif();
    return no ? KEY_PREFIX + no : "";
  }

  function baca() {
    var k = kunci();
    if (!k) return [];
    try {
      var v = JSON.parse(localStorage.getItem(k) || "[]");
      return Array.isArray(v) ? v : [];
    } catch (e) {
      console.error("perangkat: gagal membaca daftar:", e);
      return [];
    }
  }

  function tulis(list) {
    var k = kunci();
    if (!k) return false;
    try {
      localStorage.setItem(k, JSON.stringify(list.slice(0, MAKS)));
      return true;
    } catch (e) {
      console.error("perangkat: gagal menyimpan daftar:", e);
      return false;
    }
  }

  /* Rekam perangkat ini sebagai sesi aktif. Dipanggil saat LOGIN (dan
     saat halaman Akun dibuka, supaya "terakhir aktif" tidak basi). */
  function catat() {
    return iniPerangkat().then(function (info) {
      if (!kunci()) return null;                     /* belum ada profil aktif */
      var list = baca();
      var sekarang = Date.now();
      var ada = null;
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === info.id) { ada = list[i]; break; }
      }
      if (ada) {
        ada.terakhir = sekarang;
        ada.nama = info.nama;                        /* nama HP bisa diganti pemiliknya */
        ada.os = info.os;
        ada.osVersion = info.osVersion;
      } else {
        list.push({
          id: info.id,
          nama: info.nama,
          model: info.model,
          platform: info.platform,
          os: info.os,
          osVersion: info.osVersion,
          dibuat: sekarang,
          terakhir: sekarang,
        });
      }
      list.sort(function (a, b) { return (b.terakhir || 0) - (a.terakhir || 0); });
      tulis(list);
      return info;
    });
  }

  /* Daftar untuk ditampilkan. `ini: true` menandai perangkat yang sedang
     dipakai — itulah yang tampil "Aktif sekarang". Karena identitas
     perangkat butuh Promise, id-nya diselesaikan lebih dulu oleh pemanggil
     lewat catat()/iniPerangkat(); di sini dipakai id yang sudah dicache. */
  var idIni = null;

  function daftar() {
    return baca().map(function (d) {
      return {
        id: d.id,
        nama: d.nama || "Perangkat tidak dikenal",
        platform: d.platform || "",
        os: d.os || "",
        osVersion: d.osVersion || "",
        terakhir: d.terakhir || 0,
        ini: !!idIni && d.id === idIni,
      };
    });
  }

  function setIdIni(id) { idIni = id || null; }

  function keluarkan(id) {
    var list = baca().filter(function (d) { return d.id !== id; });
    return tulis(list);
  }

  /* ---- Tampilan waktu ------------------------------------------------ */

  function waktuRelatif(ts, ini) {
    if (ini) return "Aktif sekarang";
    var n = Number(ts);
    if (!isFinite(n) || n <= 0) return "Waktu tidak diketahui";
    var d = Math.max(0, Date.now() - n);
    var menit = Math.floor(d / 60000);
    if (menit < 1) return "Baru saja";
    if (menit < 60) return menit + " menit lalu";
    var jam = Math.floor(menit / 60);
    if (jam < 24) return jam + " jam lalu";
    var hari = Math.floor(jam / 24);
    if (hari < 30) return hari + " hari lalu";
    var bulan = Math.floor(hari / 30);
    if (bulan < 12) return bulan + " bulan lalu";
    return Math.floor(bulan / 12) + " tahun lalu";
  }

  window.DikaPerangkat = {
    KEY_PREFIX: KEY_PREFIX,
    catat: catat,
    daftar: daftar,
    iniPerangkat: iniPerangkat,
    setIdIni: setIdIni,
    keluarkan: keluarkan,
    waktuRelatif: waktuRelatif,
  };
})();
