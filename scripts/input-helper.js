/* ===========================================================================
   DikaPay — input-helper.js
   TIGA cara mengisi nomor tujuan tanpa mengetik: KONTAK, SUARA, BARCODE/QR.

     window.DikaInputHelper = {
       attach(input, opts)   // pasang deretan tombol di sebelah field
       support()             // { kontak, suara, scan } — hasil deteksi browser
     }

   SATU implementasi untuk SEMUA halaman produk — jangan salin per halaman.
   Halaman cukup memanggil attach() sekali per field; tombolnya dibuat
   runtime, jadi markup halaman tidak perlu tahu apa-apa soal fitur ini.

   PRINSIP: ketiganya OPSIONAL dan SELALU fail-graceful. Semua API di sini
   (Contact Picker, Web Speech, BarcodeDetector) baru didukung sebagian
   browser, butuh HTTPS, dan bisa ditolak izinnya kapan saja. Tidak satu pun
   boleh membuat halaman error atau menghalangi member mengetik manual —
   kalau tidak tersedia, tombolnya TIDAK dipasang sama sekali (bukan dipasang
   lalu error saat ditekan), dan kalau gagal di tengah jalan, yang muncul
   cuma toast singkat.

   DUA JALUR, dipilih otomatis:
     - APK (Capacitor)  -> @capacitor-community/contacts untuk kontak,
       @capacitor-mlkit/barcode-scanning untuk scan, getUserMedia untuk
       memancing izin mikrofon sebelum SpeechRecognition dipakai.
     - Browser biasa    -> Contact Picker API, BarcodeDetector, Web Speech.

   IZIN RUNTIME: ketiganya izin BERBAHAYA di Android. Mencantumkannya di
   AndroidManifest saja TIDAK cukup — harus diminta saat tombol ditekan
   (lihat mintaIzin()). Inilah yang dulu hilang sehingga tombolnya tidak
   berfungsi sama sekali di APK.
   =========================================================================== */

(function () {
  "use strict";

  var RM = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- Deteksi dukungan ---------------------------------------------
     Contact Picker & BarcodeDetector cuma ada di sebagian browser mobile;
     SpeechRecognition masih berprefix di Chrome/Safari. */

  var SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;

  /* ---- Jalur NATIVE (APK) vs WEB (browser) --------------------------
     Di dalam APK, API web di atas sebagian besar TIDAK tersedia atau
     tidak diizinkan — itu sebabnya tombolnya dulu tidak berfungsi sama
     sekali di Android. Plugin Capacitor dipakai lebih dulu bila ada,
     API web hanya dipakai saat aplikasi dibuka sebagai web biasa. */

  function nativeApp() {
    return !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === "function" &&
      window.Capacitor.isNativePlatform());
  }

  function plugin(nama) {
    try {
      var P = window.Capacitor && window.Capacitor.Plugins;
      return (P && P[nama]) || null;
    } catch (e) { return null; }
  }

  function support() {
    var native = nativeApp();
    return {
      kontak: native
        ? !!plugin("Contacts")
        : !!(navigator.contacts && typeof navigator.contacts.select === "function"),
      /* Android WebView TIDAK mengimplementasikan Web Speech API —
         `webkitSpeechRecognition` memang tidak ada di sana, jadi jalur web
         mustahil dipakai di APK. Di native harus lewat plugin. */
      suara: native ? !!plugin("SpeechRecognition") : !!SR,
      scan: native
        ? !!plugin("BarcodeScanner")
        : (!!window.BarcodeDetector ||
           !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)),
    };
  }

  /* ---- Izin runtime --------------------------------------------------
     Android 6+ menolak akses kontak/kamera/mikrofon sampai member
     menyetujuinya lewat dialog sistem — mencantumkannya di
     AndroidManifest saja tidak cukup. Dimintanya SAAT TOMBOL DITEKAN,
     bukan saat halaman dibuka: member jadi tahu untuk apa izin itu.

     Mengembalikan Promise<boolean>. Di browser biasa langsung true —
     di sana izin ditangani oleh dialog bawaan browser masing-masing API. */

  /* Tiap plugin memakai NAMA ALIAS-nya sendiri di objek PermissionStatus.
     Sebelumnya kode ini menebak (`hasil.camera || hasil.contacts || ...`)
     — cara itu rapuh: begitu satu plugin memakai nama lain, statusnya
     terbaca `undefined` dan izin yang SUDAH diberikan tetap dianggap
     belum ada. Alias di bawah diambil dari deklarasi @CapacitorPlugin
     masing-masing plugin, jangan diubah tanpa mengeceknya lagi. */
  var IZIN = {
    kontak: { plugin: "Contacts", alias: "contacts", label: "kontak" },
    scan: { plugin: "BarcodeScanner", alias: "camera", label: "kamera" },
    suara: { plugin: "SpeechRecognition", alias: "speechRecognition", label: "mikrofon" },
  };

  function statusIzin(hasil, alias) {
    if (!hasil) return null;
    /* Ambil persis alias-nya. Kalau plugin mengembalikan bentuk lain,
       jatuh ke satu-satunya nilai yang ada supaya tidak salah baca. */
    if (Object.prototype.hasOwnProperty.call(hasil, alias)) return hasil[alias];
    var kunci = Object.keys(hasil);
    return kunci.length === 1 ? hasil[kunci[0]] : null;
  }

  function diizinkan(status) {
    return status === "granted" || status === "limited";
  }

  function mintaIzin(fitur) {
    if (!nativeApp()) return Promise.resolve(true);

    var cfg = IZIN[fitur];
    var p = cfg && plugin(cfg.plugin);
    /* Plugin tidak terpasang -> jangan memblokir; jalur web di bawah yang
       akan menangani (atau memberi tahu kalau memang tidak didukung). */
    if (!p || typeof p.checkPermissions !== "function") return Promise.resolve(true);

    return Promise.resolve()
      .then(function () { return p.checkPermissions(); })
      .then(function (hasil) {
        var status = statusIzin(hasil, cfg.alias);
        if (diizinkan(status)) return true;

        /* CATATAN: `denied` TIDAK selalu berarti ditolak permanen.
           Sebelum dialog pernah muncul sekali pun, sebagian perangkat
           sudah melaporkan `denied`. Karena itu tetap COBA minta dulu —
           kalau memang permanen, dialognya tidak muncul dan hasilnya
           tetap denied, baru kita arahkan ke Pengaturan. Versi lama
           langsung menyerah di sini, sehingga izin tidak pernah diminta. */
        return Promise.resolve(p.requestPermissions()).then(function (baru) {
          var s = statusIzin(baru, cfg.alias);
          if (diizinkan(s)) return true;
          toast(s === "denied"
            ? "Izin " + cfg.label + " ditolak. Aktifkan lewat Pengaturan aplikasi, ya."
            : "Tanpa izin " + cfg.label + ", fitur ini belum bisa dipakai.");
          return false;
        });
      })
      .catch(function (e) {
        console.error("input-helper: gagal meminta izin " + fitur + ":", e);
        toast("Izin " + cfg.label + " tidak bisa diminta sekarang.");
        return false;
      });
  }

  /* ---- Toast kecil ---------------------------------------------------
     Halaman produk tidak punya sistem toast sendiri, jadi dibuat di sini.
     Sengaja SANGAT sederhana: satu elemen dipakai ulang. */

  var toastEl = null;
  var toastTimer = 0;

  function toast(pesan) {
    try {
      if (!toastEl) {
        toastEl = document.createElement("div");
        toastEl.className = "ihelp-toast";
        document.body.appendChild(toastEl);
      }
      toastEl.textContent = pesan;
      toastEl.classList.add("is-show");
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(function () {
        toastEl.classList.remove("is-show");
      }, 2600);
    } catch (e) { console.error("input-helper: toast gagal:", e); }
  }

  /* ---- Isi field + beri tahu halaman ---------------------------------
     Nilai HARUS dikirim lewat event `input` supaya controller halaman
     (produk-page.js / provider-page.js / manual-page.js) menjalankan
     alur normalnya: sanitasi, deteksi operator, render grid, tampilkan
     peringatan. Menyetel .value saja tidak memicu apa pun. */

  function isi(input, nilai) {
    if (!input || !nilai) return;
    input.value = nilai;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
    if (!RM) {
      input.classList.add("is-filled-flash");
      window.setTimeout(function () { input.classList.remove("is-filled-flash"); }, 620);
    }
  }

  /* Ambil deretan digit terpanjang dari teks bebas (hasil suara/scan
     sering membawa spasi, tanda hubung, atau awalan "nomor"). +62 dan 62
     di depan dinormalkan jadi 0 supaya cocok dengan format yang dipakai
     di seluruh app. */
  function digitsDari(teks) {
    var t = kataKeAngka(String(teks || "")).replace(/[\s\-().,]/g, "");
    var m = t.match(/(\+?62|0)?\d{6,}/g);
    if (!m || !m.length) return "";
    var pilih = m.sort(function (a, b) { return b.length - a.length; })[0];
    pilih = pilih.replace(/^\+/, "");
    if (pilih.indexOf("62") === 0) pilih = "0" + pilih.slice(2);
    return pilih;
  }

  /* Angka yang DIUCAPKAN tidak selalu kembali sebagai digit. Google STT
     id-ID biasanya menulis "0812..." kalau nomornya diucapkan mengalir,
     TAPI kalau dieja satu-satu ("nol delapan satu dua...") hasilnya sering
     berupa KATA. Tanpa penerjemahan ini, `\d{6,}` tidak menemukan apa pun
     dan fiturnya terasa "tidak mendengar" padahal suaranya tertangkap
     sempurna — itu persis gejala yang dilaporkan.

     Hanya satuan 0-9 yang diterjemahkan, plus "kosong"/"nul" yang lazim
     dipakai orang Indonesia untuk angka nol saat mengeja nomor HP.
     Puluhan/ratusan SENGAJA tidak ditangani: "delapan ratus dua belas"
     bukan cara orang menyebutkan digit nomor telepon, dan menebaknya
     justru berisiko menghasilkan nomor yang salah tanpa disadari. */
  var KATA_ANGKA = {
    kosong: "0", nol: "0", nul: "0", "zero": "0",
    satu: "1", dua: "2", tiga: "3", empat: "4", lima: "5",
    enam: "6", tujuh: "7", delapan: "8", sembilan: "9",
  };

  function kataKeAngka(teks) {
    if (!/[a-z]/i.test(teks)) return teks;            /* sudah berupa digit */
    return teks.split(/\b/).map(function (bagian) {
      var k = bagian.toLowerCase().trim();
      return Object.prototype.hasOwnProperty.call(KATA_ANGKA, k)
        ? KATA_ANGKA[k]
        : bagian;
    }).join("");
  }

  /* ---- a) KONTAK — Contact Picker API -------------------------------- */

  function dariKontak(input) {
    if (!support().kontak) { toast("Ambil dari kontak belum didukung di perangkat ini."); return; }

    /* Jalur NATIVE (APK) — plugin Capacitor + dialog izin Android. */
    var P = plugin("Contacts");
    if (nativeApp() && P) {
      mintaIzin("kontak").then(function (ok) {
        if (!ok) return;
        return P.pickContact({ projection: { name: true, phones: true } })
          .then(function (hasil) {
            var c = hasil && hasil.contact;
            var tel = c && c.phones && c.phones[0] && c.phones[0].number;
            var no = digitsDari(tel);
            if (!no) { toast("Kontak itu tidak punya nomor yang bisa dipakai."); return; }
            isi(input, no);
          });
      }).catch(function (e) {
        /* Batal memilih juga mendarat di sini — jangan tampilkan error
           untuk sesuatu yang memang disengaja member. */
        console.warn("input-helper: kontak (native):", e);
      });
      return;
    }

    /* Jalur WEB — Contact Picker API browser. */
    navigator.contacts.select(["tel"], { multiple: false })
      .then(function (hasil) {
        if (!hasil || !hasil.length) return;               /* dibatalkan = diam saja */
        var tel = hasil[0].tel && hasil[0].tel[0];
        var no = digitsDari(tel);
        if (!no) { toast("Kontak itu tidak punya nomor yang bisa dipakai."); return; }
        isi(input, no);
      })
      .catch(function (e) {
        /* Batal pilih juga masuk sini di sebagian browser — jangan
           tampilkan pesan error untuk sesuatu yang memang disengaja. */
        console.warn("input-helper: kontak:", e);
      });
  }

  /* ---- b) SUARA — Web Speech API -------------------------------------- */

  var recog = null;

  function dariSuara(input, btn) {
    /* Jalur NATIVE (APK) — plugin SpeechRecognition.
       getUserMedia TIDAK dipakai lagi untuk memancing izin: di WebView ia
       sering ditolak diam-diam meski RECORD_AUDIO sudah diberikan, jadi
       fiturnya terlihat "sudah diizinkan tapi tetap mati". Izin diminta
       lewat alias resmi plugin. */
    var P = plugin("SpeechRecognition");
    if (nativeApp() && P) {
      /* Ketuk kedua saat sedang mendengar = BERHENTI, bukan mulai lagi.
         Tanpa ini `start()` dipanggil dua kali dan plugin menolak dengan
         "Client side error" — di layar terlihat seperti mikrofonnya rusak. */
      Promise.resolve()
        .then(function () {
          return typeof P.isListening === "function"
            ? P.isListening()
            : { listening: false };
        })
        .then(function (st) {
          if (st && st.listening) {
            btn.classList.remove("is-listening");
            return P.stop();
          }
          return mulaiDengarNative(P, input, btn);
        })
        .catch(function (e) {
          btn.classList.remove("is-listening");
          console.warn("input-helper: suara (native):", e);
          toast(pesanSuara(e));
        });
      return;
    }

    /* Jalur WEB — Web Speech API browser. */
    if (!SR) { toast("Input suara belum didukung di perangkat ini."); return; }
    if (recog) { try { recog.stop(); } catch (e) {} recog = null; return; }
    mulaiDengar(input, btn);
  }

  /* Plugin menolak lewat call.reject(getErrorText(kode)) berisi string
     Android apa adanya ("No speech input", "Missing permission", ...).
     Semuanya dulu jatuh ke satu pesan "sedang tidak bisa dipakai" — member
     yang cuma kurang keras bicaranya jadi mengira fiturnya rusak. */
  function pesanSuara(e) {
    var m = String((e && (e.message || e.errorMessage)) || e || "").toLowerCase();
    if (m.indexOf("no speech") !== -1 || m.indexOf("speech timeout") !== -1) {
      return "Belum ada suara yang tertangkap. Coba sebutkan nomornya lagi, ya.";
    }
    if (m.indexOf("no match") !== -1) {
      return "Nomornya belum terdengar jelas. Sebutkan digit satu per satu, ya.";
    }
    if (m.indexOf("permission") !== -1) {
      return "Izin mikrofon belum diberikan. Aktifkan lewat Pengaturan aplikasi, ya.";
    }
    if (m.indexOf("busy") !== -1 || m.indexOf("client side") !== -1) {
      return "Mikrofon masih sibuk. Tunggu sebentar lalu coba lagi.";
    }
    if (m.indexOf("network") !== -1) {
      return "Pengenalan suara butuh internet. Cek koneksi kamu dulu, ya.";
    }
    return "Input suara sedang tidak bisa dipakai.";
  }

  function mulaiDengarNative(P, input, btn) {
    return Promise.resolve(P.available()).then(function (a) {
      if (!(a && a.available)) {
        toast("Pengenalan suara tidak tersedia di perangkat ini. " +
              "Pastikan aplikasi Google/Speech Services terpasang.");
        return;
      }
      return mintaIzin("suara").then(function (ok) {
        if (!ok) return;                                /* toast sudah di mintaIzin */
        btn.classList.add("is-listening");
        toast("Sebutkan nomornya…");
        return Promise.resolve(P.start({
          language: "id-ID",
          maxResults: 5,
          partialResults: false,
          popup: false,
        })).then(function (hasil) {
          btn.classList.remove("is-listening");
          var kandidat = (hasil && hasil.matches) || [];
          var no = "";
          for (var i = 0; i < kandidat.length && !no; i++) no = digitsDari(kandidat[i]);
          if (no) { isi(input, no); return; }
          /* Suaranya TERTANGKAP tapi tidak ada nomor di dalamnya —
             tunjukkan apa yang didengar supaya member tahu masalahnya di
             pengucapan, bukan di mikrofon. */
          toast(kandidat.length
            ? 'Terdengar "' + String(kandidat[0]).slice(0, 24) + '" — belum berupa nomor. Coba sebutkan digitnya satu per satu.'
            : "Nomornya belum tertangkap. Coba sebutkan lagi, ya.");
        });
      });
    });
  }

  function mulaiDengar(input, btn) {
    try {
      recog = new SR();
      recog.lang = "id-ID";
      recog.interimResults = false;
      recog.maxAlternatives = 3;

      btn.classList.add("is-listening");
      toast("Sebutkan nomornya…");

      recog.onresult = function (ev) {
        var teks = "";
        for (var i = 0; i < ev.results.length; i++) teks += " " + ev.results[i][0].transcript;
        /* Angka yang diucapkan sering ditulis sebagai kata; ambil digit
           dari alternatif mana pun yang menghasilkan nomor terpanjang. */
        var no = digitsDari(teks);
        if (!no && ev.results[0]) {
          for (var k = 0; k < ev.results[0].length; k++) {
            no = digitsDari(ev.results[0][k].transcript);
            if (no) break;
          }
        }
        if (no) isi(input, no);
        else {
          var dengar = String(teks).trim().slice(0, 24);
          toast(dengar
            ? 'Terdengar "' + dengar + '" — belum berupa nomor. Coba sebutkan digitnya satu per satu.'
            : "Nomornya belum tertangkap. Coba sebutkan lagi, ya.");
        }
      };
      recog.onerror = function (ev) {
        var kode = ev && ev.error;
        if (kode === "not-allowed" || kode === "service-not-allowed") {
          toast("Izin mikrofon belum diberikan.");
        } else if (kode === "no-speech") {
          toast("Belum ada suara yang tertangkap. Coba sebutkan nomornya lagi, ya.");
        } else if (kode !== "aborted") {
          toast("Input suara sedang tidak bisa dipakai.");
        }
        console.warn("input-helper: suara:", kode);
      };
      recog.onend = function () {
        btn.classList.remove("is-listening");
        recog = null;
      };
      recog.start();
    } catch (e) {
      btn.classList.remove("is-listening");
      recog = null;
      toast("Input suara sedang tidak bisa dipakai.");
      console.error("input-helper: suara gagal:", e);
    }
  }

  /* ---- c) BARCODE / QR — BarcodeDetector + kamera ---------------------
     Tanpa library eksternal: BarcodeDetector sudah ada di Chrome/Edge
     Android. Kalau API-nya tidak ada, kameranya TIDAK dibuka sama sekali
     — percuma menyalakan kamera kalau tidak ada yang bisa membaca
     gambarnya (dan itu cuma bikin member bingung + boros baterai). */

  var scanEl = null;

  function tutupScan() {
    if (!scanEl) return;
    try {
      var v = scanEl.querySelector("video");
      if (v && v.srcObject) v.srcObject.getTracks().forEach(function (t) { t.stop(); });
    } catch (e) { console.error("input-helper: gagal menutup kamera:", e); }
    scanEl.remove();
    scanEl = null;
    document.documentElement.style.overflow = "";
  }

  function dariScan(input) {
    var s = support();

    /* Jalur NATIVE (APK) — ML Kit lewat plugin Capacitor. Pemindaiannya
       ditangani layar kamera bawaan plugin, jadi TIDAK perlu overlay
       <video> buatan sendiri di sini. */
    var P = plugin("BarcodeScanner");
    if (nativeApp() && P) {
      mintaIzin("scan").then(function (ok) {
        if (!ok) return;
        return Promise.resolve(P.scan()).then(function (hasil) {
          var kode = hasil && hasil.barcodes && hasil.barcodes[0];
          var no = digitsDari(kode && (kode.rawValue || kode.displayValue));
          if (!no) { toast("Kode itu tidak memuat nomor yang bisa dipakai."); return; }
          isi(input, no);
        });
      }).catch(function (e) {
        console.warn("input-helper: scan (native):", e);
        toast("Pemindaian dibatalkan atau gagal.");
      });
      return;
    }

    /* Jalur WEB — BarcodeDetector + getUserMedia. */
    if (!window.BarcodeDetector) {
      toast("Scan kode belum didukung di perangkat ini.");
      return;
    }
    if (!s.scan || !navigator.mediaDevices) { toast("Kamera tidak tersedia."); return; }

    scanEl = document.createElement("div");
    scanEl.className = "ihelp-scan";
    scanEl.innerHTML =
      '<div class="ihelp-scan__box">' +
      '<video playsinline muted></video>' +
      '<span class="ihelp-scan__frame" aria-hidden="true"></span>' +
      "</div>" +
      '<p class="ihelp-scan__hint">Arahkan kamera ke QR / barcode yang memuat nomor</p>' +
      '<button class="ihelp-scan__close" type="button">Tutup</button>';
    document.body.appendChild(scanEl);
    document.documentElement.style.overflow = "hidden";
    scanEl.querySelector(".ihelp-scan__close").addEventListener("click", tutupScan);

    var video = scanEl.querySelector("video");
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      .then(function (stream) {
        video.srcObject = stream;
        return video.play();
      })
      .then(function () {
        var det = new window.BarcodeDetector();
        var berhenti = false;

        (function loop() {
          if (berhenti || !scanEl) return;
          det.detect(video)
            .then(function (kode) {
              if (berhenti || !scanEl) return;
              if (kode && kode.length) {
                var no = digitsDari(kode[0].rawValue);
                if (no) {
                  berhenti = true;
                  tutupScan();
                  isi(input, no);
                  return;
                }
              }
              window.requestAnimationFrame(loop);
            })
            .catch(function () { window.requestAnimationFrame(loop); });
        })();
      })
      .catch(function (e) {
        tutupScan();
        toast(e && e.name === "NotAllowedError"
          ? "Izin kamera belum diberikan."
          : "Kamera sedang tidak bisa dipakai.");
        console.warn("input-helper: scan:", e);
      });
  }

  /* ---- Pasang tombol -------------------------------------------------
     Tombol yang APINYA tidak tersedia TIDAK dipasang — lebih jujur
     daripada memasang tombol yang pasti gagal saat ditekan. */

  var IKON = {
    kontak: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>',
    suara: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4"/></svg>',
    scan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3"/><path d="M7 12h10"/></svg>',
  };

  var LABEL = {
    kontak: "Ambil dari kontak",
    suara: "Isi dengan suara",
    scan: "Scan QR / barcode",
  };

  function attach(input, opts) {
    try {
      var el = typeof input === "string" ? document.getElementById(input) : input;
      if (!el) return null;

      /* Tombol hidup DI DALAM .pfield, sejajar tombol clear "X".
         Ini bukan cuma soal tampilan — dulu bar-nya disisipkan sebagai
         SIBLING dari .pcard, di LUAR #acctSec. Padahal provider-page.js
         membangun ulang isi #acctFields tiap kali brand dipilih, jadi:
         input lama (pembawa penanda anti-duplikat) ikut terhapus, bar
         lamanya TIDAK ikut terhapus karena berada di luar, lalu bar baru
         ditambahkan lagi — tiga kali pilih brand = tiga baris tombol
         menumpuk. Dengan tombol berada di dalam .pfield, keduanya hidup
         dan mati bersama, jadi bar yatim tidak mungkin tertinggal. */
      var field = el.closest(".pfield");
      if (!field) return null;

      /* Sabuk pengaman kedua: kalau entah bagaimana masih ada sisa,
         buang dulu sebelum memasang yang baru. */
      var lama = field.querySelector(".ihelp");
      if (lama) lama.remove();
      if (field.dataset.ihelp === "1" && el.dataset.ihelp === "1") return null;

      var o = opts || {};
      var s = support();
      var mau = o.fitur || ["kontak", "suara", "scan"];
      var aktif = mau.filter(function (f) { return s[f]; });
      if (!aktif.length) return null;                 /* tidak ada yang didukung */

      var bar = document.createElement("span");
      bar.className = "ihelp";
      aktif.forEach(function (f) {
        var b = document.createElement("button");
        b.className = "ihelp__btn ihelp__btn--" + f;
        b.type = "button";
        b.title = LABEL[f];
        b.setAttribute("aria-label", LABEL[f]);
        b.innerHTML = IKON[f];
        b.addEventListener("click", function () {
          try {
            if (f === "kontak") dariKontak(el);
            else if (f === "suara") dariSuara(el, b);
            else dariScan(el);
          } catch (e) {
            console.error("input-helper: " + f + " gagal:", e);
            toast("Fitur ini sedang tidak bisa dipakai.");
          }
        });
        bar.appendChild(b);
      });

      /* Ditaruh di ujung kanan field, SETELAH tombol clear kalau ada,
         supaya "X" tetap menempel langsung ke teks yang dihapusnya. */
      field.appendChild(bar);
      field.dataset.ihelp = "1";
      el.dataset.ihelp = "1";
      return bar;
    } catch (e) {
      console.error("input-helper: attach gagal:", e);
      return null;
    }
  }

  window.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && scanEl) tutupScan();
  });
  /* Kamera WAJIB mati saat halaman ditinggalkan — kalau tidak, lampu
     kamera tetap menyala setelah pindah halaman. */
  window.addEventListener("pagehide", tutupScan);

  window.DikaInputHelper = { attach: attach, support: support };
})();
