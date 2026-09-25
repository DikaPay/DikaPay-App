/* ===========================================================================
   DikaPay — pin-transaksi.js
   KONFIRMASI PIN untuk SETIAP transaksi.

     window.DikaPinTransaksi = {
       minta(opts)          // -> Promise<{ ok, alasan }>   opts: { nama, nominal }
       punyaPin()           // apakah member sudah punya PIN Transaksi
       cekBanned(nomor?)    // null | { mulai, sampai }  -- status banned nomor itu
                            //   (nomor aktif kalau diosongkan)
       tampilkanBanned(info, opts?)  // munculkan popup banned. opts: { pesan?, onTutup? }
                                      //   pesan default = wording PIN transaksi; auto-lock.js
                                      //   mengisi pesan sendiri untuk banned auto-lock (3 jam).
                                      //   Dipakai juga dari auth-flow.js saat login ditolak.
                                      //   info.sampai null -> banned PERMANEN (tanpa hitung
                                      //   mundur); dipakai member-sync.js untuk banned_sampai
                                      //   null dari server (admin banned via AdminPanel).
       MAKS_SALAH           // 3
     }

   ================== BEDA DENGAN AUTO-LOCK, JANGAN DICAMPUR =================
   `auto-lock.js` mengunci AKSES ke aplikasi setelah 5 menit menganggur —
   sekali buka, semua halaman terbuka. Modul ini mengonfirmasi SATU
   TRANSAKSI: berapa pun nominalnya, apa pun jenisnya, PIN diminta lagi.
   Keduanya memverifikasi ke PIN yang sama (`dikapay:security.pin`) tapi
   menjawab pertanyaan yang berbeda — "ini masih kamu?" vs "kamu benar mau
   mengeluarkan uang ini?".
   ==========================================================================

   ATURAN: FAIL-CLOSED. `minta()` hanya resolve `{ ok: true }` kalau 6 digit
   yang diketik BENAR-BENAR cocok dengan PIN tersimpan. Dibatalkan, salah
   3x, atau member belum punya PIN -> `ok: false`, dan pemanggil WAJIB
   membatalkan transaksinya. Jangan pernah menambah jalur "anggap saja
   benar" di sini.

   ======================= REVISI: BAN 2 JAM, BUKAN JEDA 60 DETIK =============
   Salah PIN 3x dulu cuma memberi jeda 60 detik (member tetap login, bisa
   coba lagi sebentar kemudian). Sekarang: salah 3x -> akun itu DIBANNED
   2 jam PENUH dan member LANGSUNG DI-LOGOUT PAKSA. Keputusan produk: PIN
   transaksi yang bisa ditebak berkali-kali tanpa konsekuensi berarti sama
   saja tidak ada gerbangnya.

   Statusnya disimpan PER NOMOR MEMBER (`dikapay:pintx:banned:<digit>`,
   pola yang sama dengan `dikapay:devices:<digit>`/`dikapay:margin`) —
   banned akun A TIDAK PERNAH memengaruhi akun B di perangkat yang sama.
   Selama 2 jam itu, mencoba login lagi (nomor+PIN benar sekalipun) DITOLAK
   dan popup banned yang sama muncul ulang dengan sisa waktu ter-update —
   lihat pengecekan di auth-flow.js sebelum cabang login dibuka. Konsisten
   dipakai payment-flow.js (produk) maupun transfer-member.js (transfer),
   karena keduanya sama-sama lewat modul ini.

   Belum punya PIN -> transaksi TIDAK diproses, tapi member diberi jalan
   keluar (tombol ke halaman Akun untuk membuatnya). Memblokir tanpa jalan
   keluar sama saja mengunci member dari aplikasinya sendiri.

   TODO fase 3: verifikasi PIN DAN status banned pindah ke backend
   (`POST /api/pin/verify`) supaya tidak bisa dilewati dengan menghapus
   localStorage perangkat. Bentuk `minta()` dipertahankan — pemanggilnya
   sudah menunggu Promise, jadi tidak ada yang berubah.
   =========================================================================== */

(function () {
  "use strict";

  var RM = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var KEY_SECURITY = "dikapay:security";
  var BANNED_PREFIX = "dikapay:pintx:banned:";
  var MAKS_SALAH = 3;
  var BAN_MS = 2 * 60 * 60 * 1000;   /* 2 jam */

  var el = null;
  var aktif = null;          /* { resolve, salah } saat sheet terbuka */
  var buf = "";
  var terkunci = false;      /* sedang menganimasikan salah -> abaikan ketukan */

  /* ---- PIN tersimpan -------------------------------------------------- */

  function security() {
    try {
      var v = JSON.parse(localStorage.getItem(KEY_SECURITY) || "null");
      return v && typeof v === "object" ? v : null;
    } catch (e) {
      console.error("pin-transaksi: gagal membaca PIN tersimpan:", e);
      return null;
    }
  }

  function punyaPin() {
    var s = security();
    return !!(s && s.pinCreated && typeof s.pin === "string" && s.pin.length === 6);
  }

  function cocok(masuk) {
    var s = security();
    return !!(s && typeof s.pin === "string" && s.pin.length === 6 && masuk === s.pin);
  }

  /* ---- Banned 2 jam setelah 3x salah -----------------------------------
     Disimpan PER NOMOR (bukan satu kunci global) — pola yang sama dengan
     `dikapay:devices:<digit>` di perangkat.js: akun lain di perangkat yang
     sama tidak boleh ikut terkena banned akun ini. */

  /* Nomor member yang SEDANG aktif di perangkat ini, diambil dari profil
     sesi — salinan kecil pola yang sama dengan `nomorAktif()` di
     perangkat.js (file itu tidak mengeksposnya ke window, jadi disalin
     dengan nama sendiri, bukan dipanggil lintas modul). */
  function nomorAktif() {
    try {
      var p = JSON.parse(localStorage.getItem("dikapay:profile") || "{}");
      return String(p.phone || "").replace(/\D/g, "");
    } catch (e) { return ""; }
  }

  function kunciBanned(nomor) {
    return nomor ? BANNED_PREFIX + nomor : "";
  }

  /* null = tidak banned (atau sudah lewat 2 jam — entrinya ikut dibersihkan
     supaya percobaan PIN berikutnya otomatis mulai dari 0 lagi, bukan
     dari sisa penanda lama). */
  function cekBanned(nomor) {
    var target = nomor || nomorAktif();
    var k = kunciBanned(target);
    if (!k) return null;
    try {
      var v = JSON.parse(localStorage.getItem(k) || "null");
      if (!v || typeof v.sampai !== "number") return null;
      if (v.sampai <= Date.now()) {
        localStorage.removeItem(k);
        return null;
      }
      return v;
    } catch (e) {
      console.error("pin-transaksi: gagal membaca status banned:", e);
      return null;
    }
  }

  /* sampaiOverride (opsional) — dipakai jalur verifikasi REMOTE (transfer
     antar member, lihat `minta({verifikasi})` di bawah): backend punya
     hitungan waktu banned-nya sendiri (`banned_sampai`), jadi entri lokal
     ini WAJIB mengikuti nilai itu, bukan diam-diam memakai BAN_MS 2 jam
     bawaan — kalau tidak, `cekBanned()` yang dibaca halaman produk lain
     bisa berbeda pendapat dengan backend soal kapan banned-nya berakhir. */
  function pasangBanned(nomor, sampaiOverride) {
    var k = kunciBanned(nomor);
    if (!k) { console.error("pin-transaksi: tidak ada nomor aktif — banned TIDAK bisa disimpan."); return null; }
    var mulai = Date.now();
    var sampai = (typeof sampaiOverride === "number" && isFinite(sampaiOverride) && sampaiOverride > mulai)
      ? sampaiOverride
      : mulai + BAN_MS;
    var info = { mulai: mulai, sampai: sampai };
    try { localStorage.setItem(k, JSON.stringify(info)); }
    catch (e) { console.error("pin-transaksi: gagal menyimpan status banned:", e); }
    return info;
  }

  /* "2026-09-12 15:30:00" (format datetime backend) ATAU ISO string ->
     epoch ms. Date.parse tidak selalu menerima spasi sebagai pemisah
     tanggal/waktu, jadi dicoba dulu dengan "T" sebelum jatuh ke string
     asli apa adanya. */
  function parseBannedSampai(v) {
    if (v == null || v === "") return NaN;
    if (typeof v === "number") return v;
    var s = String(v).trim();
    var iso = s.indexOf("T") === -1 ? s.replace(" ", "T") : s;
    var t = Date.parse(iso);
    if (!isFinite(t)) t = Date.parse(s);
    return t;
  }

  /* "1 jam 45 menit lagi" — dibulatkan KE ATAS ke menit terdekat supaya
     tidak pernah menampilkan "0 menit lagi" padahal masih tersisa waktu
     (member bisa mengira dia sudah boleh coba lagi padahal belum). */
  function formatSisa(ms) {
    var totalMenit = Math.max(1, Math.ceil(ms / 60000));
    var jam = Math.floor(totalMenit / 60);
    var menit = totalMenit % 60;
    if (jam > 0 && menit > 0) return jam + " jam " + menit + " menit lagi";
    if (jam > 0) return jam + " jam lagi";
    return menit + " menit lagi";
  }

  /* ---- Markup (dibuat sekali, dipakai ulang) --------------------------
     Dibangun runtime supaya 23 halaman yang bisa bertransaksi (22 produk +
     transfer) tidak perlu menambah markup apa pun. Kelasnya sendiri
     (`.pintx-*`) dan gayanya di style.css — satu-satunya stylesheet yang
     dimuat SEMUA halaman; `produk.css` tidak dimuat transfer-member.html. */

  function build() {
    if (el) return el;
    var ov = document.createElement("div");
    ov.className = "pintx";
    ov.innerHTML =
      '<div class="pintx__card" role="dialog" aria-modal="true" aria-labelledby="pintxTitle">' +
      '<button class="pintx__close" type="button" aria-label="Batalkan">' +
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" ' +
      'stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
      "</button>" +
      '<span class="pintx__ic" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>' +
      "</span>" +
      '<h3 class="pintx__title" id="pintxTitle">Masukkan PIN Transaksi</h3>' +
      '<p class="pintx__sub"></p>' +
      '<div class="pintx__dots" aria-hidden="true">' +
      '<span class="pintx__dot"></span><span class="pintx__dot"></span>' +
      '<span class="pintx__dot"></span><span class="pintx__dot"></span>' +
      '<span class="pintx__dot"></span><span class="pintx__dot"></span>' +
      "</div>" +
      '<p class="pintx__hint" role="status">PIN kamu tidak akan dibagikan ke siapa pun.</p>' +
      '<div class="pintx__keypad"></div>' +
      "</div>";

    var pad = ov.querySelector(".pintx__keypad");
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "hapus"].forEach(function (k) {
      var b = document.createElement("button");
      b.type = "button";
      if (!k) { b.className = "pintx__key pintx__key--kosong"; b.disabled = true; b.setAttribute("aria-hidden", "true"); }
      else if (k === "hapus") {
        b.className = "pintx__key pintx__key--fn";
        b.dataset.k = "hapus";
        b.setAttribute("aria-label", "Hapus");
        b.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" ' +
          'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M20 6H9l-5 6 5 6h11a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1z"/><path d="M17 10l-4 4M13 10l4 4"/></svg>';
      } else { b.className = "pintx__key"; b.dataset.k = k; b.textContent = k; }
      pad.appendChild(b);
    });

    pad.addEventListener("click", function (e) {
      var b = e.target.closest("[data-k]");
      if (b) tekan(b.dataset.k);
    });
    ov.querySelector(".pintx__close").addEventListener("click", function () { tutup("batal"); });
    ov.addEventListener("click", function (e) { if (e.target === ov) tutup("batal"); });

    document.body.appendChild(ov);
    el = ov;
    return ov;
  }

  function q(sel) { return el.querySelector(sel); }

  /* ---- Tampilan ------------------------------------------------------- */

  function renderDots() {
    var d = el.querySelectorAll(".pintx__dot");
    for (var i = 0; i < d.length; i++) {
      d[i].classList.toggle("is-filled", i < buf.length);
    }
  }

  function hint(teks, err) {
    var h = q(".pintx__hint");
    h.textContent = teks;
    h.classList.toggle("pintx__hint--err", !!err);
  }

  function goyang() {
    var dots = q(".pintx__dots");
    dots.classList.remove("is-error");
    void dots.offsetWidth;
    dots.classList.add("is-error");
  }

  /* ---- Interaksi ------------------------------------------------------ */

  function tekan(k) {
    if (!aktif || terkunci) return;
    if (k === "hapus") {
      buf = buf.slice(0, -1);
      renderDots();
      return;
    }
    if (buf.length >= 6) return;
    buf += k;
    renderDots();
    if (buf.length === 6) periksa();
  }

  function periksa() {
    terkunci = true;
    var masuk = buf;
    /* Jeda kecil supaya titik ke-6 sempat terlihat terisi sebelum
       hasilnya muncul — tanpa ini terasa seperti ketukan yang hilang. */
    window.setTimeout(function () {
      if (!aktif) return;

      /* ===== Jalur REMOTE (transfer antar member) =========================
         Kalau `minta({verifikasi})` diisi, PIN yang diketik TIDAK dicocokkan
         ke `dikapay:security.pin` lokal — backend yang memverifikasi (dan
         backend punya hitungan banned-nya sendiri). Keypad, titik, animasi
         goyang, dan popup banned yang dipakai TETAP SAMA; hanya sumber
         kebenaran "PIN ini benar atau tidak" yang berpindah. */
      if (aktif.verifikasi) {
        var verif = aktif.verifikasi;
        verif(masuk).then(function (hasil) {
          if (!aktif) return;
          hasil = hasil || {};
          if (hasil.ok) { tutup("ok", hasil); return; }

          if (hasil.banned) {
            var nomor = nomorAktif();
            var sampaiMs = parseBannedSampai(hasil.bannedSampai);
            var info = pasangBanned(nomor, isFinite(sampaiMs) ? sampaiMs : null);
            tutup("banned");
            if (info) {
              /* Pesan ramah BAWAAN (TEKS_BANNED_DEFAULT) dipakai apa
                 adanya di sini — BUKAN pesan mentah dari backend
                 (`hasil.pesan`, biasanya cuma "PIN salah 3 kali...").
                 Sama seperti jalur banned lokal: nadanya menjelaskan &
                 menenangkan, bukan menghakimi. Pesan backend yang lebih
                 teknis tetap dipakai untuk hint PIN-salah-belum-3x di
                 atas, bukan di sini. */
              tampilkanBanned(info, {
                onTutup: function () {
                  try { if (window.DikaAuth) window.DikaAuth.logout(); }
                  catch (e) { console.error("pin-transaksi: gagal logout paksa:", e); }
                },
              });
            }
            return;
          }

          /* Gagal tapi BUKAN soal PIN (mis. saldo tidak cukup) — mengulang
             PIN tidak akan memperbaiki apa pun, jadi sheet ditutup dan
             pemanggil yang menampilkan pesannya sendiri, bukan menahan
             member di layar keypad ini. Penanda eksplisit `pinSalah:false`
             dari verifikator, bukan ditebak dari isi pesan. */
          if (hasil.pinSalah === false) {
            tutup("gagal-lain", hasil);
            return;
          }

          buf = "";
          renderDots();
          goyang();
          hint(hasil.pesan || "PIN salah.", true);
          terkunci = false;
        }).catch(function (e) {
          console.error("pin-transaksi: verifikasi remote gagal:", e);
          if (!aktif) return;
          buf = "";
          renderDots();
          goyang();
          hint((e && e.pesanMember) || "Terjadi kesalahan. Coba lagi.", true);
          terkunci = false;
        });
        return;
      }

      if (cocok(masuk)) {
        tutup("ok");
        return;
      }

      aktif.salah++;
      buf = "";
      renderDots();
      goyang();

      var sisa = MAKS_SALAH - aktif.salah;
      if (sisa <= 0) {
        /* SALAH 3X -> BANNED 2 JAM + LOGOUT PAKSA (revisi dari jeda 60
           detik). Sheet PIN ditutup dulu (meresolve minta() dengan
           alasan "banned" — pemanggil di payment-flow.js/transfer-member.js
           tidak perlu menampilkan pesan apa pun lagi, popup di bawah ini
           yang mengambil alih seluruh komunikasi ke member). */
        var nomor = nomorAktif();
        var info = pasangBanned(nomor);
        tutup("banned");
        if (info) {
          tampilkanBanned(info, {
            onTutup: function () {
              try { if (window.DikaAuth) window.DikaAuth.logout(); }
              catch (e) { console.error("pin-transaksi: gagal logout paksa:", e); }
            },
          });
        }
        return;
      }
      hint("PIN salah. Sisa " + sisa + " percobaan lagi.", true);
      terkunci = false;
    }, RM ? 0 : 160);
  }

  function onKeydown(e) {
    if (!aktif) return;
    if (e.key === "Escape") { tutup("batal"); return; }
    if (e.key === "Backspace") { e.preventDefault(); tekan("hapus"); return; }
    if (/^[0-9]$/.test(e.key)) { e.preventDefault(); tekan(e.key); }
  }

  /* ---- KENAPA TIDAK PAKAI history.pushState -------------------------
     Modal konfirmasi di produk-ui.js MEMANGGIL `history.back()` saat
     menutup dirinya, tepat sebelum pembayaran dimulai. Traversal history
     di Chrome itu ASINKRON dan bisa selesai LEBIH LAMBAT dari jeda 200 ms
     menuju bayar() — jadi `popstate` sisa itu mendarat di sheet PIN yang
     baru saja terbuka dan langsung menutupnya. Gejalanya: tekan "Bayar",
     sheet PIN berkedip sekilas lalu hilang, transaksi menggantung.

     Karena itu sheet ini TIDAK memiliki entri history sendiri — pola yang
     SAMA dengan overlay `.payflow` di payment-flow.js, yang juga cuma
     mendaftar ke registry overlay. BACK HP akan meninggalkan halaman, dan
     itu memang membatalkan transaksi (tidak ada yang diproses sampai PIN
     benar). Jangan menambahkan pushState di sini tanpa lebih dulu
     menyelesaikan balapan di atas. */
  var registerSudah = false;

  function daftarOverlay() {
    if (registerSudah) return;
    registerSudah = true;
    try {
      if (window.DikaProdukUI && window.DikaProdukUI.registerOverlay) {
        window.DikaProdukUI.registerOverlay(function () {
          return !!el && el.classList.contains("is-open");
        });
      }
    } catch (e) { console.error("pin-transaksi: gagal mendaftar overlay:", e); }
  }

  /* extra (opsional) — dipakai jalur verifikasi REMOTE untuk menumpangkan
     data hasil (saldoBaru, namaTujuan, pesan, dst) ke Promise yang di-
     resolve `minta()`, supaya pemanggil tidak perlu menyimpan state hasil
     transfer di tempat lain. `ok`/`alasan` di `extra` diabaikan — keduanya
     tetap ditentukan dari parameter `alasan` di sini. */
  function tutup(alasan, extra) {
    if (!aktif) return;
    var selesai = aktif.resolve;
    aktif = null;
    buf = "";
    terkunci = false;
    el.classList.remove("is-open");
    document.documentElement.style.overflow = "";
    window.removeEventListener("keydown", onKeydown, true);
    window.setTimeout(function () {
      var hasil = { ok: alasan === "ok", alasan: alasan };
      if (extra && typeof extra === "object") {
        for (var k in extra) {
          if (Object.prototype.hasOwnProperty.call(extra, k) && k !== "ok" && k !== "alasan") {
            hasil[k] = extra[k];
          }
        }
      }
      selesai(hasil);
    }, RM ? 0 : 180);
  }

  /* ---- Sheet "belum punya PIN" ---------------------------------------- */

  function sheetTanpaPin() {
    /* Sengaja memakai alert-modal ringan bawaan halaman kalau ada; kalau
       tidak, pakai kartu PIN yang sama dengan keypad disembunyikan. */
    build();
    q(".pintx__title").textContent = "Buat PIN Transaksi dulu";
    q(".pintx__sub").textContent =
      "Setiap transaksi di DikaPay dikonfirmasi dengan PIN. Kamu belum punya, " +
      "jadi transaksinya belum bisa diproses.";
    q(".pintx__dots").hidden = true;
    q(".pintx__keypad").hidden = true;

    var aksi = document.createElement("div");
    aksi.className = "pintx__actions";
    aksi.innerHTML =
      '<button class="pintx__btn pintx__btn--utama" type="button">Buat PIN Sekarang</button>' +
      '<button class="pintx__btn" type="button">Nanti Saja</button>';
    q(".pintx__card").appendChild(aksi);
    hint("PIN yang sama juga dipakai untuk masuk ke akunmu.", false);

    return new Promise(function (resolve) {
      function bersih(alasan) {
        el.classList.remove("is-open");
        document.documentElement.style.overflow = "";
        aksi.remove();
        q(".pintx__dots").hidden = false;
        q(".pintx__keypad").hidden = false;
        window.setTimeout(function () { resolve({ ok: false, alasan: alasan }); }, RM ? 0 : 180);
      }
      aksi.children[0].addEventListener("click", function () {
        bersih("tanpa-pin");
        window.setTimeout(function () {
          location.href = jalurAkun();
        }, RM ? 0 : 200);
      });
      aksi.children[1].addEventListener("click", function () { bersih("tanpa-pin"); });
      el.classList.add("is-open");
      document.documentElement.style.overflow = "hidden";
    });
  }

  /* Halaman produk & transfer semuanya hidup di /pages/, tapi modul ini
     bisa saja dipakai dari root nanti — pola yang sama seperti auth.js. */
  function jalurAkun() {
    return /\/pages\//i.test(location.pathname || "") ? "akun.html" : "pages/akun.html";
  }

  /* Modul ini sekarang dipakai juga dari auth.html (bukan cuma halaman
     produk/transfer di /pages/), jadi path aset gambar dihitung runtime —
     pola yang sama seperti `jalurAkun()` di atas dan `LOGIN_PAGE` di
     auth.js, BUKAN satu string hardcode. */
  function jalurGambar(nama) {
    return (/\/pages\//i.test(location.pathname || "") ? "../assets/images/" : "assets/images/") + nama;
  }

  /* ---- Popup "Akun Kamu Telah Dibanned" -------------------------------
     Dibangun runtime & dipakai ulang — pola yang sama dengan sheet PIN di
     atas dan showGangguan()/paymodal.js. SATU tampilan dipakai ULANG untuk
     DUA jenis banned yang beda konteks & storage key (PIN transaksi 2 jam
     di sini, PIN auto-lock 3 jam di auto-lock.js — lihat opts.pesan di
     bawah untuk penjelasan yang sesuai konteksnya), dipanggil dari TIGA
     tempat:
       1. periksa() di bawah, tepat setelah PIN transaksi salah 3x pada
          transaksi yang sedang berjalan (lalu memaksa logout).
       2. auto-lock.js, tepat setelah PIN auto-lock salah 3x di layar
          "Masukkan PIN kamu" (lalu memaksa logout juga).
       3. auth-flow.js, saat member yang SEDANG banned (jenis apa pun)
          mencoba login lagi (di situ TIDAK ada logout — dia memang belum
          berhasil masuk).
     Nadanya ramah & menjelaskan, BUKAN menghakimi — ini konsekuensi
     keamanan, bukan hukuman atas kesalahan yang disengaja. */

  var bannedEl = null;
  var bannedTimer = 0;

  var TEKS_BANNED_DEFAULT =
    "Demi keamanan transaksimu, akun ini dinonaktifkan sementara karena PIN transaksi " +
    "dimasukkan salah 3 kali berturut-turut. Ini bukan hukuman — cuma langkah pengamanan " +
    "supaya orang lain tidak bisa menebak-nebak PIN kamu.";

  /* Dipakai saat `info.sampai == null` (lihat tampilkanBanned) — banned TANPA
     batas waktu (mis. admin menonaktifkan akun lewat AdminPanel dengan durasi
     "Permanen", `banned_sampai` dikirim server sebagai null). Pemanggil boleh
     menimpanya lewat opts.pesan (member-sync.js melakukan ini dengan teks yang
     lebih spesifik); ini cuma fallback kalau tidak diisi. */
  var TEKS_BANNED_PERMANEN_DEFAULT =
    "Akun kamu dinonaktifkan permanen. Hubungi layanan pelanggan DikaPay untuk bantuan lebih lanjut.";

  function buildBanned() {
    if (bannedEl) return bannedEl;
    var ov = document.createElement("div");
    ov.className = "banned-overlay";
    ov.innerHTML =
      '<div class="banned-modal" role="dialog" aria-modal="true" aria-labelledby="bannedTitle">' +
      '<div class="banned-modal__img-wrap">' +
      '<img class="banned-modal__img" src="' + jalurGambar("akun-banned.png") + '" alt="" />' +
      "</div>" +
      '<h3 class="banned-modal__title" id="bannedTitle">Akun Kamu Telah Dibanned</h3>' +
      '<p class="banned-modal__text">' + TEKS_BANNED_DEFAULT + "</p>" +
      '<div class="banned-modal__countdown">' +
      '<span class="banned-modal__countdown-label">Bisa coba lagi dalam</span>' +
      '<span class="banned-modal__countdown-value"></span>' +
      "</div>" +
      '<button class="banned-modal__btn" type="button">Oke, Mengerti</button>' +
      "</div>";
    document.body.appendChild(ov);
    bannedEl = ov;
    return ov;
  }

  /* opts.pesan (opsional) — teks penjelasan alternatif untuk jenis banned
     yang BUKAN dari PIN transaksi (mis. banned dari auto-lock, atau banned
     dari server lewat member-sync.js). Kalau tidak diisi, jatuh ke teks
     bawaan (PIN transaksi) — perilaku lama tidak berubah untuk pemanggil
     yang sudah ada.

     `info.sampai` BOLEH `null` — itu artinya banned TANPA batas waktu
     (admin menonaktifkan akun permanen lewat AdminPanel: server mengirim
     `banned_sampai: null`, dan member-sync.js meneruskannya apa adanya,
     BUKAN mengarang tanggal kedaluwarsa). Dalam kondisi itu popup TIDAK
     menampilkan kotak hitung mundur sama sekali, dan tidak pernah menutup
     dirinya sendiri lewat timer — hanya tombol yang bisa menutupnya
     (yang tetap memicu logout paksa lewat onTutup, TIDAK membuka akses). */
  function tampilkanBanned(info, opts) {
    if (!info) return;
    var permanen = info.sampai == null;
    if (!permanen && typeof info.sampai !== "number") return;
    var o = opts || {};
    var ov = buildBanned();
    var teksEl = ov.querySelector(".banned-modal__text");
    if (teksEl) teksEl.textContent = o.pesan || (permanen ? TEKS_BANNED_PERMANEN_DEFAULT : TEKS_BANNED_DEFAULT);
    var countdownBox = ov.querySelector(".banned-modal__countdown");
    var nilai = ov.querySelector(".banned-modal__countdown-value");

    window.clearInterval(bannedTimer);
    bannedTimer = 0;

    function tutupBanned() {
      window.clearInterval(bannedTimer);
      bannedTimer = 0;
      ov.classList.remove("is-open");
      document.documentElement.style.overflow = "";
      if (typeof o.onTutup === "function") {
        try { o.onTutup(); } catch (e) { console.error("pin-transaksi: onTutup banned error:", e); }
      }
    }

    if (permanen) {
      if (countdownBox) countdownBox.hidden = true;
    } else {
      if (countdownBox) countdownBox.hidden = false;
      var render = function () {
        var sisa = info.sampai - Date.now();
        if (sisa <= 0) { tutupBanned(); return; }
        nilai.textContent = formatSisa(sisa);
      };
      render();
      /* Diperbarui tiap 30 dtk — tampilan berbutir menit, jadi tidak perlu
         menghitung tiap detik selagi popup ini biasanya dibaca lalu ditutup
         dalam hitungan detik, bukan dibiarkan terbuka berjam-jam. */
      bannedTimer = window.setInterval(render, 30000);
    }

    /* Listener dipasang sekali per elemen (elemen dipakai ulang lintas
       panggilan) — flag di dataset mencegah listener menumpuk. */
    if (ov.dataset.wired !== "1") {
      ov.dataset.wired = "1";
      ov.querySelector(".banned-modal__btn").addEventListener("click", tutupBanned);
      ov.addEventListener("click", function (e) { if (e.target === ov) tutupBanned(); });
      window.addEventListener("keydown", function (e) { if (e.key === "Escape") tutupBanned(); });
      if (window.DikaProdukUI && window.DikaProdukUI.registerOverlay) {
        window.DikaProdukUI.registerOverlay(function () { return ov.classList.contains("is-open"); });
      }
    }

    ov.classList.add("is-open");
    document.documentElement.style.overflow = "hidden";
  }

  /* ---- API ------------------------------------------------------------ */

  /* Preferensi "Gunakan PIN Setiap Transaksi" (toggle #swPin di Akun >
     Keamanan). Default AKTIF. Disimpan di dikapay:settings:pinEvery
     ("1"/"0"). FAIL-CLOSED: storage rusak / nilai aneh -> tetap minta PIN.
     Mematikannya HARUS lewat verifikasi PIN dulu (lihat akun.js). */
  function pinSetiapTransaksi() {
    try {
      var v = localStorage.getItem("dikapay:settings:pinEvery");
      if (v === "0") return false;
      return true;
    } catch (e) { return true; }
  }

  function minta(opts) {
    var o = opts || {};

    if (aktif) {
      /* Dua permintaan bertumpuk = bug pemanggil. Tolak yang kedua alih-alih
         menimpa resolve yang pertama dan menggantung transaksi sebelumnya. */
      console.warn("pin-transaksi: minta() dipanggil saat sheet masih terbuka.");
      return Promise.resolve({ ok: false, alasan: "sibuk" });
    }

    /* Member menonaktifkan "PIN setiap transaksi" -> lewati sheet PIN untuk
       transaksi biasa. `o.paksa: true` MENGABAIKAN preferensi ini (dipakai
       saat MEMATIKAN toggle-nya: menurunkan keamanan harus dibuktikan). */
    if (o.paksa !== true && !pinSetiapTransaksi()) {
      return Promise.resolve({ ok: true, alasan: "pin-setiap-transaksi-nonaktif" });
    }

    if (!punyaPin()) return sheetTanpaPin();

    /* Jaring pengaman: akun ini SEHARUSNYA sudah di-logout paksa tepat
       saat banned terjadi (lihat periksa()), jadi baris ini normalnya
       tidak pernah kena. Tapi sesi lama bisa saja masih hidup — tab lain
       yang sudah terbuka sebelum banned, atau navigasi lewat tombol back
       browser — jadi diperiksa lagi di sini sebelum sheet PIN dibuka sama
       sekali, bukan diam-diam mengizinkan transaksi berjalan. */
    var banAktif = cekBanned();
    if (banAktif) {
      tampilkanBanned(banAktif, {
        onTutup: function () {
          try { if (window.DikaAuth) window.DikaAuth.logout(); }
          catch (e) { console.error("pin-transaksi: gagal logout paksa:", e); }
        },
      });
      return Promise.resolve({ ok: false, alasan: "banned" });
    }

    build();
    buf = "";
    terkunci = false;
    renderDots();
    q(".pintx__title").textContent = o.judul ? String(o.judul) : "Masukkan PIN Transaksi";
    q(".pintx__sub").textContent = ringkasan(o);
    q(".pintx__dots").hidden = false;
    q(".pintx__keypad").hidden = false;
    hint("PIN kamu tidak akan dibagikan ke siapa pun.", false);
    el.classList.add("is-open");
    document.documentElement.style.overflow = "hidden";

    window.addEventListener("keydown", onKeydown, true);
    daftarOverlay();

    /* opts.verifikasi (opsional) — dipakai transfer-member.js: fungsi
       (pinDigits) => Promise<{ok, pesan?, banned?, bannedSampai?,
       pinSalah?, ...}> yang memverifikasi ke BACKEND, bukan ke
       `dikapay:security.pin` lokal. Kalau tidak diisi, perilaku default
       (verifikasi lokal) sama sekali tidak berubah — lihat periksa(). */
    var verifikasi = typeof o.verifikasi === "function" ? o.verifikasi : null;

    return new Promise(function (resolve) {
      aktif = { resolve: resolve, salah: 0, verifikasi: verifikasi };
    });
  }

  function ringkasan(o) {
    var nama = o.nama ? String(o.nama) : "";
    var nom = Number(o.nominal);
    var rp = isFinite(nom) && nom > 0
      ? "Rp" + Math.round(nom).toLocaleString("id-ID")
      : "";
    if (nama && rp) return nama + " · " + rp;
    return nama || rp || "Konfirmasi transaksi kamu.";
  }

  window.DikaPinTransaksi = {
    minta: minta,
    punyaPin: punyaPin,
    cekBanned: cekBanned,
    tampilkanBanned: tampilkanBanned,
    pinSetiapTransaksi: pinSetiapTransaksi,
    MAKS_SALAH: MAKS_SALAH,
  };
})();
