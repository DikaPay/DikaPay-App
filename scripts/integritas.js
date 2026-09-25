/* ===========================================================================
   DikaPay — integritas.js
   Deteksi CLIENT-SIDE terhadap perangkat/aplikasi berisiko (aplikasi
   modifikasi, cheat engine, kerangka hooking, indikasi root), lalu MEMBLOKIR
   akses dengan layar peringatan yang tidak bisa dilewati.

     window.DikaIntegritas = {
       periksa()      // -> Promise<{aman, temuan[]}>
       blokir(temuan) // pasang layar peringatan (dipakai internal)
     }

   ============================= BATAS KEJUJURAN =============================
   Ini pertahanan LAPIS PERTAMA, bukan jaminan. Semua pemeriksaan di sini
   berjalan DI DALAM WebView yang justru sedang diperiksa — penyerang yang
   sudah bisa memodifikasi aplikasi juga bisa mematikan modul ini. Yang
   benar-benar melindungi uang member tetap pemeriksaan DI SISI SERVER
   (saldo, PIN, status transaksi), dan itu sudah jadi sumber kebenaran.

   Yang realistis dicapai di sini: menghentikan pemakaian kasual alat-alat
   populer (Lucky Patcher, Game Guardian, APK Editor, Xposed/LSPosed,
   Magisk) dan memberi tahu member bahwa perangkatnya berisiko.

   JANGAN menaikkan modul ini jadi satu-satunya penjaga, dan jangan
   memakai hasilnya untuk memutuskan hal yang bisa merugikan member secara
   permanen (mis. mem-banned akun) tanpa konfirmasi dari server.

   ============================= CARA MENDETEKSI =============================
   1. PAKET TERPASANG — SEKARANG DIPERIKSA, lewat plugin native
      `Integritas` (IntegritasPlugin.java) yang memanggil PackageManager.
      Daftar aplikasi terpasang MUSTAHIL dilihat dari JavaScript; tidak ada
      API-nya di WebView. Itu sebabnya bagian ini harus native.

      Paket yang dicari: Lucky Patcher, Game Guardian, APK Editor (+Pro),
      Xposed/LSPosed/EdXposed, Magisk, Frida, dan beberapa pembobol
      pembelian lain — 28 nama paket, lihat PAKET_BERISIKO di Java dan
      <queries> di AndroidManifest (keduanya HARUS sama persis).

   2. JEJAK ROOT/HOOKING YANG TERLIHAT DARI WEBVIEW — inilah yang benar-benar
      dipakai di sini, dan semuanya diperiksa dari sisi JS:
        a. Objek global khas kerangka hooking yang menyuntik ke WebView
           (Xposed/LSPosed/Frida sering meninggalkan jejak di `window`).
        b. `navigator.userAgent` yang menyebut build tidak resmi
           (test-keys, userdebug, eng) — penanda ROM/root yang umum.
        c. Fungsi bawaan yang sudah ditambal: kalau `toString()` milik
           fungsi native tidak lagi berbunyi "[native code]", ada yang
           menimpanya di runtime.
        d. WebView debugging yang menyala di build rilis.

   3. `@capacitor/device` DIPAKAI kalau ada (`isVirtual` untuk emulator).
      Tidak wajib — modul ini tetap berjalan tanpanya.

   ========================== KENAPA TIDAK FAIL-CLOSED =======================
   Kalau PEMERIKSAANNYA SENDIRI gagal (plugin bermasalah, API tidak ada),
   member TIDAK diblokir. Memblokir karena ragu akan mengunci member yang
   perangkatnya baik-baik saja dari uangnya sendiri — dan itu kerugian yang
   nyata, sedangkan lolosnya satu perangkat berisiko masih tertahan
   pemeriksaan server. Yang memblokir hanyalah temuan yang POSITIF.
   =========================================================================== */

(function () {
  "use strict";

  /* Penanda global khas kerangka hooking. Dicocokkan PERSIS (bukan
     substring) supaya nama variabel biasa milik library lain tidak
     terbaca sebagai serangan. */
  var GLOBAL_MENCURIGAKAN = [
    "XposedBridge", "xposed", "de_robv_android_xposed",
    "frida", "Frida", "FridaGadget",
    "LSPosed", "EdXposed",
    "GameGuardian", "gameguardian",
    "LuckyPatcher", "luckypatcher",
  ];

  /* Build ROM yang tidak resmi. "test-keys" muncul di hampir semua ROM
     custom & perangkat yang di-root; "userdebug"/"eng" adalah varian build
     pengembang yang tidak seharusnya beredar sebagai perangkat pengguna. */
  var UA_MENCURIGAKAN = /test-keys|userdebug|\beng\b-build|Magisk|SuperSU/i;

  function cekGlobal() {
    var temuan = [];
    for (var i = 0; i < GLOBAL_MENCURIGAKAN.length; i++) {
      var k = GLOBAL_MENCURIGAKAN[i];
      try {
        if (Object.prototype.hasOwnProperty.call(window, k) && window[k] != null) {
          temuan.push("Kerangka modifikasi terdeteksi (" + k + ")");
        }
      } catch (e) { /* akses ditolak = bukan bukti apa-apa */ }
    }
    return temuan;
  }

  function cekUserAgent() {
    try {
      var ua = String(navigator.userAgent || "");
      if (UA_MENCURIGAKAN.test(ua)) {
        return ["Sistem operasi tidak resmi / sudah dimodifikasi"];
      }
    } catch (e) {}
    return [];
  }

  /* Fungsi native yang sudah ditambal tidak lagi mengembalikan
     "[native code]" dari toString(). Yang diperiksa adalah fungsi yang
     PASTI native di lingkungan normal — bukan fungsi milik aplikasi ini
     sendiri (itu memang bukan native dan akan selalu "gagal"). */
  function cekPatch() {
    var temuan = [];
    var kandidat = [
      ["fetch", window.fetch],
      ["JSON.parse", JSON.parse],
      ["localStorage.getItem", window.localStorage && window.localStorage.getItem],
    ];
    for (var i = 0; i < kandidat.length; i++) {
      var nama = kandidat[i][0], fn = kandidat[i][1];
      if (typeof fn !== "function") continue;
      try {
        if (Function.prototype.toString.call(fn).indexOf("[native code]") === -1) {
          temuan.push("Fungsi sistem sudah dimodifikasi (" + nama + ")");
        }
      } catch (e) { /* toString diblokir = tidak dianggap bukti */ }
    }
    return temuan;
  }

  /* ---- Pemeriksaan PAKET TERPASANG (native) ---------------------------
     Satu-satunya bagian yang benar-benar bisa melihat aplikasi lain di
     perangkat. Plugin mengembalikan { temuan: [label...], didukung: bool }.

     `didukung: false` (plugin bermasalah / bukan APK) diperlakukan sebagai
     TIDAK ADA TEMUAN — bukan sebagai kecurigaan. Lihat "KENAPA TIDAK
     FAIL-CLOSED" di bawah: mengunci member karena pemeriksaannya sendiri
     gagal jauh lebih merugikan daripada melewatkan satu perangkat. */
  /* ===================== DIAGNOSA JALUR NATIVE ==========================
     Deteksi yang "tidak terpicu" di HP sungguhan bisa gagal di SALAH SATU
     dari lima titik, dan tanpa log tiap titik mustahil tahu yang mana:

       1. Capacitor tidak ada       -> dibuka sebagai web biasa, bukan APK
       2. Capacitor.Plugins.Integritas tidak ada -> plugin TIDAK terdaftar
          (registerPlugin tidak jalan / dipanggil sesudah super.onCreate)
       3. isNativePlatform() false  -> jalur native memang dilewati
       4. periksaPaket() menolak    -> galat di sisi Java
       5. menjawab tapi temuan kosong -> paket tidak terdaftar di <queries>,
          ATAU nama paketnya memang beda dari yang ada di daftar

     Semua dicatat lewat console.* — di APK, console WebView ikut masuk
     logcat, jadi terlihat berdampingan dengan log Java `DikaPayIntegritas`.
     Perintah persisnya ada di bawah `PETUNJUK_LOGCAT`. */
  var DIAG = "[integritas]";

  /* Hasil mentah disimpan supaya bisa dibaca dari mana pun lewat
     window.DikaIntegritas.diagnosa() — termasuk dari chrome://inspect saat
     HP tersambung USB. */
  var jejak = { langkah: [], hasilMentah: null, lamaMs: null };

  function catat(pesan, data) {
    try {
      jejak.langkah.push({ t: Date.now(), pesan: pesan, data: data == null ? null : data });
      if (data === undefined) console.info(DIAG, pesan);
      else console.info(DIAG, pesan, data);
    } catch (e) {}
  }

  function cekPaketNative() {
    var mulai = Date.now();
    try {
      var C = window.Capacitor;
      if (!C) {
        catat("TITIK 1: window.Capacitor tidak ada -> dibuka sebagai web biasa, " +
          "pemeriksaan paket native DILEWATI (ini normal di browser).");
        return Promise.resolve([]);
      }
      catat("TITIK 1 OK: Capacitor ada.", {
        platform: (typeof C.getPlatform === "function" ? C.getPlatform() : "?"),
        native: (typeof C.isNativePlatform === "function" ? C.isNativePlatform() : "?"),
        plugin: Object.keys((C && C.Plugins) || {}),
      });

      if (!C.Plugins || !C.Plugins.Integritas) {
        console.error(DIAG, "TITIK 2 GAGAL: plugin 'Integritas' TIDAK TERDAFTAR di Capacitor. " +
          "Deteksi aplikasi berisiko TIDAK AKAN PERNAH jalan. Periksa MainActivity.onCreate: " +
          "registerPlugin(IntegritasPlugin.class) HARUS dipanggil SEBELUM super.onCreate(). " +
          "Cek juga logcat: baris 'PLUGIN TERPASANG' dari tag DikaPayIntegritas harus ada.");
        return Promise.resolve([]);
      }
      catat("TITIK 2 OK: plugin 'Integritas' terdaftar.");

      if (typeof C.isNativePlatform === "function" && !C.isNativePlatform()) {
        catat("TITIK 3: isNativePlatform() = false -> jalur native dilewati.");
        return Promise.resolve([]);
      }
      catat("TITIK 3 OK: berjalan di platform native. Memanggil periksaPaket()…");

      return C.Plugins.Integritas.periksaPaket().then(function (r) {
        var lama = Date.now() - mulai;
        jejak.hasilMentah = r;
        jejak.lamaMs = lama;
        /* HASIL MENTAH dicetak apa adanya — inilah yang dibandingkan dengan
           baris "HASIL MENTAH yang dikirim ke JS" di sisi Java. Kalau
           keduanya beda, masalahnya ada di jembatan Capacitor. */
        catat("TITIK 4 OK: periksaPaket() menjawab dalam " + lama + " ms. HASIL MENTAH:",
          JSON.stringify(r));

        if (!r || r.didukung === false) {
          console.warn(DIAG, "TITIK 5: didukung=false -> pemeriksaan paket di sisi Java " +
            "bermasalah. Cari baris 'Pemeriksaan paket GAGAL TOTAL' di logcat.");
          return [];
        }
        var t = Array.isArray(r.temuan) ? r.temuan : [];
        if (t.length) {
          console.warn(DIAG, "TITIK 5: DITEMUKAN aplikasi berisiko:", t.join(", "),
            "| nama paket:", (r.paket || []).join(", "));
        } else {
          catat("TITIK 5: tidak ada temuan. " +
            "diperiksa=" + r.diperiksa + ", sdk=" + r.sdk + ", lamaMs=" + r.lamaMs +
            ". Kalau kamu YAKIN aplikasinya terpasang, nama paketnya belum ada di " +
            "PAKET_BERISIKO ATAU belum didaftarkan di <queries> AndroidManifest.");
        }
        /* Toast SEMENTARA (mode diagnosa) — supaya hasilnya terlihat di HP
           tanpa kabel. Dinyalakan lewat localStorage, MATI secara bawaan:
           member biasa tidak boleh melihat pesan teknis ini. */
        toastDiagnosa(r);
        return t.map(function (nama) {
          return "Aplikasi berisiko terpasang: " + nama;
        });
      }).catch(function (e) {
        console.error(DIAG, "TITIK 4 GAGAL: periksaPaket() menolak setelah " +
          (Date.now() - mulai) + " ms:", e && (e.message || e), e);
        return [];
      });
    } catch (e) {
      console.error(DIAG, "jalur native melempar sebelum sempat dipanggil:", e);
      return Promise.resolve([]);
    }
  }

  /* Ditampilkan HANYA kalau localStorage["dikapay:diag:integritas"] === "1".
     Sengaja tidak ada tombol untuk menyalakannya di UI: ini alat diagnosa
     sementara, bukan fitur. Nyalakan lewat chrome://inspect Console:
       localStorage.setItem("dikapay:diag:integritas","1"); location.reload();  */
  function toastDiagnosa(r) {
    try {
      if (localStorage.getItem("dikapay:diag:integritas") !== "1") return;
      var pasang = function () {
        if (!document.body) return;
        var el = document.createElement("pre");
        el.style.cssText = "position:fixed;left:8px;right:8px;bottom:8px;z-index:2147483646;" +
          "margin:0;padding:10px 12px;border-radius:12px;background:rgba(11,36,71,.94);" +
          "color:#9fffa0;font:11px/1.5 monospace;white-space:pre-wrap;max-height:45vh;overflow:auto;" +
          "visibility:visible";
        el.textContent = "[DIAGNOSA INTEGRITAS — sementara]\n" + JSON.stringify(r, null, 1);
        el.addEventListener("click", function () { el.remove(); });
        document.body.appendChild(el);
      };
      if (document.body) pasang();
      else document.addEventListener("DOMContentLoaded", pasang, { once: true });
    } catch (e) { /* diagnosa tidak boleh menggagalkan apa pun */ }
  }

  function cekPerangkat() {
    try {
      var C = window.Capacitor;
      if (!C || !C.Plugins || !C.Plugins.Device) return Promise.resolve([]);
      if (typeof C.isNativePlatform === "function" && !C.isNativePlatform()) {
        return Promise.resolve([]);
      }
      return C.Plugins.Device.getInfo().then(function (info) {
        var t = [];
        if (info && info.isVirtual) t.push("Aplikasi dijalankan di emulator");
        return t;
      }).catch(function () { return []; });
    } catch (e) { return Promise.resolve([]); }
  }

  function periksa() {
    var temuan = [];
    try {
      temuan = temuan.concat(cekGlobal(), cekUserAgent(), cekPatch());
    } catch (e) {
      /* Pemeriksaannya sendiri bermasalah -> JANGAN blokir. Lihat
         "KENAPA TIDAK FAIL-CLOSED" di header. */
      console.warn("integritas: pemeriksaan gagal (dilewati):", e);
      return Promise.resolve({ aman: true, temuan: [] });
    }
    /* Kedua pemeriksaan asinkron dijalankan BERSAMAAN, dan keduanya sudah
       menelan galatnya sendiri jadi Promise.all tidak akan pernah ditolak
       gara-gara salah satunya bermasalah. */
    return Promise.all([cekPaketNative(), cekPerangkat()]).then(function (hasil) {
      var semua = temuan.concat(hasil[0] || [], hasil[1] || []);
      return { aman: semua.length === 0, temuan: semua };
    }, function (e) {
      console.warn("integritas: pemeriksaan asinkron gagal (dilewati):", e);
      return { aman: temuan.length === 0, temuan: temuan };
    });
  }

  /* ---- Layar blokir -----------------------------------------------------
     Dibangun langsung ke <html>, MENGGANTIKAN seluruh isi halaman — bukan
     overlay di atasnya. Overlay masih menyisakan DOM aplikasi di bawahnya
     yang bisa dijangkau lewat konsol; mengganti isinya membuat tidak ada
     lagi yang tersisa untuk diutak-atik dari layar itu.

     Gayanya inline semua: kalau stylesheet-nya sendiri gagal dimuat (atau
     sengaja diblokir), peringatannya tetap terbaca. */
  function blokir(temuan) {
    try {
      var daftar = (temuan || []).map(function (t) {
        return '<li style="margin:4px 0">' + String(t).replace(/[<>&]/g, "") + "</li>";
      }).join("");

      document.documentElement.innerHTML =
        '<head><meta charset="utf-8"><meta name="viewport" ' +
        'content="width=device-width,initial-scale=1"><title>DikaPay</title></head>' +
        '<body style="margin:0;min-height:100vh;display:flex;align-items:center;' +
        'justify-content:center;background:#0B2447;color:#fff;' +
        'font:14px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:24px">' +
        '<div style="max-width:380px;text-align:center">' +
        '<div style="width:74px;height:74px;margin:0 auto 18px;border-radius:50%;' +
        'display:grid;place-items:center;background:rgba(255,255,255,.1)">' +
        '<svg viewBox="0 0 24 24" width="38" height="38" fill="none" stroke="#FFC93C" ' +
        'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>' +
        '<path d="M12 9v4M12 16h.01"/></svg></div>' +
        '<h1 style="font-size:19px;font-weight:800;margin:0 0 10px">' +
        "Aplikasi tidak bisa dijalankan di perangkat ini</h1>" +
        '<p style="margin:0 0 14px;color:rgba(255,255,255,.78)">' +
        "Demi keamanan saldo dan data kamu, DikaPay berhenti di sini karena " +
        "mendeteksi perangkat ini sudah dimodifikasi atau memuat aplikasi " +
        "yang berisiko.</p>" +
        '<ul style="margin:0 0 16px;padding:0 0 0 18px;text-align:left;' +
        'color:rgba(255,255,255,.7);font-size:12.5px">' + daftar + "</ul>" +
        '<p style="margin:0;color:rgba(255,255,255,.6);font-size:12.5px">' +
        "Coba jalankan DikaPay di perangkat tanpa root atau aplikasi " +
        "modifikasi, ya. Kalau kamu merasa ini keliru, hubungi Customer " +
        "Service kami.</p></div></body>";

      /* Kunci interaksi yang tersisa: tidak ada tombol, tidak ada jalan
         kembali. `history` juga dikunci supaya tombol Back tidak membawa
         member ke halaman sebelumnya yang masih hidup di stack. */
      try {
        history.pushState(null, "", location.href);
        window.addEventListener("popstate", function () {
          history.pushState(null, "", location.href);
        });
      } catch (e) {}
    } catch (e) {
      /* Kalau bahkan menggambar layar blokir gagal, jangan tinggalkan
         aplikasi dalam keadaan setengah jalan. */
      console.error("integritas: gagal memasang layar blokir:", e);
      try { document.body.innerHTML = "<h1>DikaPay tidak bisa dijalankan di perangkat ini.</h1>"; }
      catch (e2) {}
    }
  }

  window.DikaIntegritas = { periksa: periksa, blokir: blokir };

  /* ---- Jalan OTOMATIS saat modul dimuat --------------------------------
     Ditaut PALING ATAS di <head> (sebelum auth.js) supaya layar aplikasi
     tidak sempat tergambar di perangkat yang bermasalah.

     Pemeriksaan native itu ASINKRON (menyeberang ke sisi Java), jadi ia
     tidak bisa selesai sebelum HTML dirender. Supaya halaman Beranda/menu
     tidak sempat terlihat sekejap pun, `<body>` DISEMBUNYIKAN lebih dulu
     lewat atribut `data-integritas="cek"`, dan baru dilepas kalau hasilnya
     aman. Kalau tidak aman, blokir() menggantikan seluruh dokumen sebelum
     apa pun sempat terlihat.

     Penyembunyiannya diberi BATAS WAKTU: kalau pemeriksaan menggantung
     (plugin tidak menjawab), halaman tetap dilepas setelah 2,5 detik.
     Membiarkan member menatap layar kosong selamanya karena pemeriksaan
     yang macet adalah kerugian nyata — pola yang sama dengan sikap
     tidak-fail-closed di seluruh modul ini. */
  var LEPAS_PAKSA_MS = 2500;
  var sudahLepas = false;

  function tandaiCek() {
    try { document.documentElement.setAttribute("data-integritas", "cek"); }
    catch (e) {}
  }
  function lepas() {
    if (sudahLepas) return;
    sudahLepas = true;
    try { document.documentElement.removeAttribute("data-integritas"); }
    catch (e) {}
  }

  tandaiCek();
  var pengaman = window.setTimeout(function () {
    console.warn("integritas: pemeriksaan belum selesai dalam " + LEPAS_PAKSA_MS +
      "ms — halaman dilepas supaya member tidak terjebak layar kosong.");
    lepas();
  }, LEPAS_PAKSA_MS);

  /* ===================== ALAT DIAGNOSA (chrome://inspect) ================
     Dibuka supaya bisa dipanggil manual dari Console saat HP tersambung USB,
     tanpa perlu membangun ulang APK:

       DikaIntegritas.jejak()        // langkah demi langkah + hasil mentah
       DikaIntegritas.daftarPaket()  // status SEMUA paket, satu per satu
       DikaIntegritas.diagnosaOn()   // nyalakan toast hasil mentah di layar HP
       DikaIntegritas.diagnosaOff()  */
  window.DikaIntegritas = {
    jejak: function () { return JSON.parse(JSON.stringify(jejak)); },
    daftarPaket: function () {
      try {
        var C = window.Capacitor;
        if (!C || !C.Plugins || !C.Plugins.Integritas ||
            typeof C.Plugins.Integritas.diagnosa !== "function") {
          console.error(DIAG, "plugin Integritas / method diagnosa() tidak tersedia.");
          return Promise.resolve(null);
        }
        return C.Plugins.Integritas.diagnosa().then(function (r) {
          console.info(DIAG, "diagnosa() mentah:", JSON.stringify(r));
          try {
            console.table((r && r.daftar) || []);
          } catch (e) {}
          return r;
        });
      } catch (e) { return Promise.resolve(null); }
    },
    diagnosaOn: function () {
      try { localStorage.setItem("dikapay:diag:integritas", "1"); } catch (e) {}
      return "Diagnosa ON. Muat ulang halaman untuk melihat toast hasil mentah.";
    },
    diagnosaOff: function () {
      try { localStorage.removeItem("dikapay:diag:integritas"); } catch (e) {}
      return "Diagnosa OFF.";
    },
  };

  /* ============ PANEL DEBUG DALAM APLIKASI (tanpa USB/adb) =================
     Simpan snapshot pemeriksaan TERAKHIR ke localStorage, dibaca oleh
     debug-panel.js (Akun > Tentang DikaPay > tekan lama versi) — supaya
     member bisa screenshot hasil mentahnya tanpa chrome://inspect.
     Ditulis di SETIAP halaman (integritas.js jalan di semua 37 halaman),
     jadi datanya selalu segar dari kunjungan terakhir. */
  function simpanDebugIntegritas(hasil, galatFatal) {
    try {
      var C = window.Capacitor;
      var pluginAda = !!(C && C.Plugins && C.Plugins.Integritas);
      var rec = {
        waktu: Date.now(),
        halaman: location.pathname.split("/").pop() || "(root)",
        capacitorAda: !!C,
        pluginAda: pluginAda,
        isNative: !!(C && typeof C.isNativePlatform === "function" && C.isNativePlatform()),
        hasilMentahDariJava: jejak.hasilMentah,
        lamaMsPanggilan: jejak.lamaMs,
        aman: hasil ? hasil.aman : null,
        temuan: hasil ? hasil.temuan : [],
        galatFatal: galatFatal ? String((galatFatal && galatFatal.message) || galatFatal) : null,
        langkah: jejak.langkah,
      };
      localStorage.setItem("dikapay:debug:integritas", JSON.stringify(rec));
    } catch (e) { /* panel debug tidak boleh mengganggu pemeriksaan sungguhan */ }
  }

  periksa().then(function (hasil) {
    window.clearTimeout(pengaman);
    catat("pemeriksaan selesai. aman=" + hasil.aman +
      ", temuan=" + (hasil.temuan || []).length);
    simpanDebugIntegritas(hasil, null);
    if (hasil.aman) { lepas(); return; }
    console.warn("integritas: perangkat diblokir —", hasil.temuan.join(" | "));
    blokir(hasil.temuan);
    /* blokir() mengganti seluruh dokumen, jadi atribut penyembunyi ikut
       hilang bersama <html> yang lama — tidak perlu dilepas manual. */
  }, function (e) {
    window.clearTimeout(pengaman);
    console.warn("integritas: pemeriksaan gagal (dilewati):", e);
    simpanDebugIntegritas(null, e);
    lepas();
  });
})();
