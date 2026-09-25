/* ===========================================================================
   DikaPay — margin.js
   Halaman "Atur Margin Saya".
   KONTEKS: dipakai MEMBER/RESELLER untuk mengatur margin keuntungan PRIBADI
   mereka di atas harga modal DikaPay. Bukan kontrol harga global.
   Semua data DUMMY.
   =========================================================================== */

"use strict";

const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---- Konstanta ------------------------------------------------- */

const MODAL_SAMPLE = 10000; // contoh harga modal untuk simulasi
/* Batas markup 60% dari harga modal — keputusan produk.
   NILAINYA DIBACA DARI margin-calc.js, tidak ditulis ulang di sini:
   dulu angka 60 ada di DUA file dan bisa berbeda diam-diam tanpa ada yang
   gagal. margin-calc.js adalah pemiliknya (di situ cap benar-benar
   ditegakkan lewat terapkan()); halaman ini cuma menampilkannya.

   Batasnya sekarang RUPIAH TETAP, bukan persentase dari modal — jadi bisa
   dijepit keras langsung saat input (lihat clampVal/onInput), dan tidak
   ada lagi produk yang diam-diam menerima margin lebih kecil daripada
   yang disetel member. */
const MAKS_RP = (window.DikaMargin && window.DikaMargin.MAKS_RP) || 6000;
const LIMIT = { min: 0, max: MAKS_RP, step: 500 };
/* Ambangnya TIDAK dihitung di sini lagi. Pertanyaan "apakah nominal ini
   kena potong?" sekarang dijawab DikaMargin.terapkan() lewat field
   `dibatasi` — sumber yang sama dengan yang memotongnya di halaman produk,
   jadi tidak ada ambang kedua yang bisa berbeda pendapat. Lihat
   renderCapWarn(). */

/* Daftar kategori diambil dari kategori-map.js — SATU sumber yang sama
   dipakai sinkronisasi Digiflazz. Sebelumnya di sini ada 7 kategori
   hardcoded (total "251 produk") yang sudah lama tidak cocok: slug
   `plnpasca` tidak pernah dipakai di tempat lain (yang benar `pln-bill`),
   dan Games/Voucher/E-Money serta 16 kategori pascabayar tidak bisa
   diatur marginnya sama sekali.

   TRANSFER ANTAR MEMBER SENGAJA TIDAK ADA di sini: itu bukan produk
   jual-beli dan tidak punya harga modal. Slug "transfer" memang tidak
   terdaftar di kategori-map.js, jadi ia tidak akan pernah ikut. */
const CATS = (function () {
  try {
    const list = window.DikaMargin ? window.DikaMargin.kategori() : [];
    if (list.length) return list;
  } catch (e) { console.error("[margin] gagal memuat kategori:", e); }
  console.warn("[margin] kategori-map.js/margin-calc.js belum dimuat — daftar kosong.");
  return [];
})();
/* Jumlah produk per kategori TIDAK lagi ditampilkan: angkanya dulu
   hardcoded dan menyesatkan. Yang dihitung sekarang jumlah KATEGORI. */
const TOTAL = CATS.length;

const MB = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/* ---- Riwayat Margin Saya — NYATA, bukan contoh ------------------------
   DULU array ini berisi 4 entri DUMMY hardcoded ("Margin Rp500 ke Pulsa,
   Paket Data — 18 Agu 2026") yang muncul di layar setiap member membuka
   halaman ini, apa pun yang sebenarnya pernah dia lakukan.

   Itu bukan sekadar data contoh yang tidak berbahaya: entri-entri itu
   menggambarkan CAKUPAN BERBEDA-BEDA per kategori, sehingga terbaca
   seolah-olah aplikasi menyimpan margin terpisah untuk tiap kategori dan
   yang lama tidak pernah tertimpa. Padahal margin cuma SATU objek di
   `dikapay:margin` yang ditimpa utuh tiap kali "Terapkan" ditekan — tidak
   pernah ada override per-kategori. Riwayat palsu ini yang membuat
   "margin tidak merata" tampak seperti masalah penyimpanan.

   Sekarang isinya benar-benar dicatat saat member menekan Terapkan, dan
   ikut tersimpan supaya tidak hilang begitu halaman ditutup. */
const MHIST_KEY = "dikapay:margin:riwayat";
const MHIST_MAKS = 20;

function loadMhist() {
  try {
    const raw = localStorage.getItem(MHIST_KEY);
    if (!raw) return [];
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.filter((h) => h && typeof h.text === "string" && typeof h.date === "string")
      .slice(0, MHIST_MAKS);
  } catch (e) {
    console.error("[margin] gagal membaca riwayat margin:", e);
    return [];
  }
}

function saveMhist() {
  try {
    localStorage.setItem(MHIST_KEY, JSON.stringify(MHIST.slice(0, MHIST_MAKS)));
  } catch (e) {
    console.error("[margin] gagal menyimpan riwayat margin:", e);
  }
}

const MHIST = loadMhist();

/* ---- State -------------------------------------------------- */

/* ---- Penyimpanan margin --------------------------------------------
   BUG yang diperbaiki: sebelumnya menekan "Terapkan" hanya menambah baris
   riwayat di memori + menampilkan toast sukses — nilainya TIDAK PERNAH
   disimpan. Begitu halaman ditutup, margin kembali ke 10% padahal member
   sudah diberi tahu "berhasil diperbarui". */

/* SATU pembaca & SATU penulis, keduanya di margin-calc.js:
     baca  -> DikaMargin.baca()     (dipakai juga kartu produk)
     tulis -> DikaMargin.simpan()   (lihat onConfirmOk)
   Halaman ini TIDAK PERNAH menyentuh localStorage setelan margin sendiri.
   Dulu ia punya pembaca & penulisnya sendiri, dan itulah yang membuka
   celah dua sumber data yang bisa tidak sinkron. Migrasi data versi lama
   (mode persen) juga terjadi di baca(), jadi halaman ini tidak perlu tahu
   bentuk lama itu sama sekali. */
function loadMargin() {
  try {
    const m = window.DikaMargin ? window.DikaMargin.baca() : null;
    if (!m) {
      console.error("[margin] margin-calc.js belum dimuat — memakai nilai bawaan.");
      return { rp: 1000, cats: null };
    }
    return { rp: m.rp, cats: m.cats };
  } catch (e) {
    console.error("[margin] gagal membaca margin tersimpan:", e);
    return { rp: 1000, cats: null };
  }
}

/* Penulisan diteruskan ke DikaMargin.simpan() — satu-satunya penulis
   kunci `dikapay:margin`, yang juga menjepit nominal ke batas Rp6.000
   sebelum menyimpan. */
function saveMargin(cats) {
  if (!window.DikaMargin) {
    console.error("[margin] margin-calc.js belum dimuat — margin TIDAK tersimpan.");
    return false;
  }
  return window.DikaMargin.simpan(state.rp, cats);
}

const state = loadMargin();
/* Angka MENTAH yang terakhir diketik member, sebelum dijepit ke batas.
   Dibutuhkan karena `state.rp` sudah dijepit seketika di onInput() —
   tanpa menyimpan yang diminta, banner peringatan mustahil tahu bahwa
   barusan ada nilai yang disesuaikan turun (nilai tersimpannya selalu
   "sah"). Tidak ikut disimpan ke localStorage: ini konteks satu sesi
   penyuntingan, bukan setelan. */
state.diminta = state.rp;
let prev = { rp: 0, sell: 0 };
let pendingSel = null;

/* ---- Elemen ------------------------------------------------ */

const el = (id) => document.getElementById(id);
const swMarginAktif = el("swMarginAktif");
const marginModeCard = el("marginModeCard");
const marginCakupanCard = el("marginCakupanCard");
const marginInput = el("marginInput");
const simModal = el("simModal");
const simMargin = el("simMargin");
const simSell = el("simSell");
const simNote = el("simNote");
const capWarn = el("capWarn");
const capWarnTxt = el("capWarnTxt");
const chkAll = el("chkAll");
const chkList = el("chkList");
const applyBtn = el("applyBtn");
const confirmOverlay = el("confirmOverlay");
const confirmText = el("confirmText");
const okBtn = el("okBtn");
const cancelBtn = el("cancelBtn");
const topMsg = el("topMsg");
const mhistEl = el("mhist");

/* ---- Helper ---------------------------------------------- */

function fmtRupiah(v) {
  const n = Number(v);
  return "Rp" + Math.round(Math.abs(isFinite(n) ? n : 0)).toLocaleString("id-ID");
}
function clampVal(n) {
  const num = Number(n);
  return Math.max(LIMIT.min, Math.min(LIMIT.max, isFinite(num) ? num : LIMIT.min));
}
function curValue() { return state.rp; }
function setCurValue(n) { state.rp = n; }
function todayStr() {
  const d = new Date();
  return d.getDate() + " " + MB[d.getMonth()] + " " + d.getFullYear();
}

/* Jeda eksekusi untuk klik/ketik beruntun sangat cepat. */
function debounce(fn, wait) {
  let t = null;
  return function () {
    const args = arguments, ctx = this;
    clearTimeout(t);
    t = setTimeout(function () { fn.apply(ctx, args); }, wait);
  };
}

function flashClass(node, cls, ms) {
  if (!node) return;
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
  window.clearTimeout(node._ft);
  node._ft = window.setTimeout(() => node.classList.remove(cls), ms);
}

function tweenText(node, from, to, fmt, dur) {
  if (!node) return;
  // batalkan tween sebelumnya di elemen yang sama → tak ada rAF bertumpuk
  if (node._tw) cancelAnimationFrame(node._tw);
  const a = Number(from) || 0;
  const b = Number(to) || 0;
  if (a === b || REDUCED_MOTION) { node.textContent = fmt(b); return; }
  const t0 = performance.now();
  (function step(now) {
    try {
      const p = Math.min((now - t0) / dur, 1);
      const e = 1 - Math.pow(1 - p, 3);
      node.textContent = fmt(a + (b - a) * e);
      if (p < 1) node._tw = requestAnimationFrame(step);
      else { node._tw = null; node.textContent = fmt(b); }
    } catch (err) {
      console.error("[margin] tweenText:", err);
      node._tw = null;
      node.textContent = fmt(b);
    }
  })(t0);
}

/* ---- Peringatan batas margin ------------------------------------------
   Sejak batasnya jadi RUPIAH TETAP, pertanyaannya cuma satu: "apakah yang
   diketik melebihi Rp6.000?" — jawabannya sama untuk semua produk.

   Karena itu `modalTermurahCakupan()` DIHAPUS. Fungsi itu ada semata-mata
   untuk batas lama yang bergantung harga modal (mencari produk termurah di
   cakupan supaya bisa bilang "produk itu cuma akan dapat sekian"); dengan
   batas flat, tidak ada lagi produk yang menerima nominal berbeda. */

function tandaiInputCapped(aktifTanda) {
  const box = marginInput ? (marginInput.closest(".stepper") || marginInput) : null;
  if (box) box.classList.toggle("is-capped", !!aktifTanda);
  if (marginInput) marginInput.setAttribute("aria-invalid", aktifTanda ? "true" : "false");
}

function renderCapWarn() {
  if (!capWarn || !capWarnTxt) return;
  try {
    /* Yang dinilai adalah angka YANG DIMINTA, bukan `state.rp` — nilai itu
       sudah dijepit seketika di onInput(), jadi memeriksanya tidak akan
       pernah menemukan pelanggaran dan banner ini tidak akan pernah
       muncul. Penjepitan tetap lewat DikaMargin.terapkan(), jadi angka
       penggantinya tetap datang dari satu sumber yang sama. */
    const hasil = window.DikaMargin
      ? window.DikaMargin.terapkan(MODAL_SAMPLE, state.diminta)
      : null;
    if (!hasil || !hasil.dibatasi) { capWarn.hidden = true; tandaiInputCapped(false); return; }
    tandaiInputCapped(true);
    capWarnTxt.textContent =
      "Margin maksimal " + fmtRupiah(MAKS_RP) + " per produk. Nominal " +
      fmtRupiah(hasil.diminta) + " otomatis disesuaikan ke " + fmtRupiah(hasil.marginRp) + ".";
    capWarn.hidden = false;
  } catch (e) {
    console.error("[margin] renderCapWarn gagal:", e);
    capWarn.hidden = true;
    tandaiInputCapped(false);
  }
}

/* ---- Simulasi harga ------------------------------------- */

function refreshSim(animate) {
  try {
    const modal = MODAL_SAMPLE > 0 ? MODAL_SAMPLE : 1; // jaga-jaga: tak pernah bagi 0

    /* Angka simulasi WAJIB lewat DikaMargin.terapkan() — rumus & batas
       yang SAMA PERSIS dengan yang dipakai kartu produk lewat hitung(). */
    const hasil = window.DikaMargin && typeof window.DikaMargin.terapkan === "function"
      ? window.DikaMargin.terapkan(modal, state.rp)
      : null;
    if (!hasil) {
      console.error("[margin] margin-calc.js belum dimuat — simulasi dilewati.");
      return;
    }
    const marginRp = hasil.marginRp;
    const sell = hasil.jual;
    /* Persentase TIDAK ditampilkan lagi: nominalnya flat, jadi angka persen
       akan berbeda di tiap produk dan cuma menyesatkan. */
    const fmtMargin = (v) => "+" + fmtRupiah(v);

    renderCapWarn();

    if (animate) {
      tweenText(simMargin, prev.rp, marginRp, fmtMargin, 380);
      tweenText(simSell, prev.sell, sell, fmtRupiah, 380);
      if (!REDUCED_MOTION) {
        flashClass(simMargin.parentElement, "flash-val", 500);
        flashClass(simSell.parentElement, "flash-val", 500);
      }
    } else {
      simMargin.textContent = fmtMargin(marginRp);
      simSell.textContent = fmtRupiah(sell);
    }
    prev = { rp: marginRp, sell: sell };
  } catch (err) {
    console.error("[margin] refreshSim gagal:", err);
  }
}

/* ---- Input & stepper --------------------------------- */

function setInput() {
  marginInput.value = String(curValue());
}

// refreshSim(true) di-debounce: nilai & input tetap update tiap klik/ketik,
// tapi animasi simulasi (tween) hanya jalan sekali setelah rentetan berhenti.
const refreshSimAnimSoon = debounce(function () { refreshSim(true); }, 90);

function onInput() {
  try {
    /* Non-digit dibuang -> tanda minus ikut hilang, jadi margin negatif
       mustahil diketik. Nol tetap boleh (jual di harga modal). */
    const n = parseInt(String(marginInput.value).replace(/\D/g, ""), 10) || 0;
    const clamped = clampVal(n);
    state.diminta = n;
    setCurValue(clamped);

    /* Kalau melebihi batas, nilai di LAYAR ikut dikoreksi + diberi tahu.
       Tanpa ini member mengetik 45, melihat "45", tapi yang tersimpan 20 —
       angka di layar berbohong tentang apa yang sebenarnya berlaku. */
    if (n > clamped) {
      marginInput.value = String(clamped);
      flashClass(marginInput.closest(".stepper") || marginInput, "is-shake", 420);
      showTopMsg("Margin maksimal " + fmtRupiah(MAKS_RP) +
        " per produk. Nilai disesuaikan ke " + fmtRupiah(MAKS_RP) + ".", true);
    }
    /* Banner MENETAP di bawah input (renderCapWarn, dipanggil refreshSim)
       tetap dipasang juga — toast di atas hilang sendiri dan sudah lenyap
       jauh sebelum member menekan "Terapkan". */
    refreshSimAnimSoon();
  } catch (err) { console.error("[margin] onInput gagal:", err); }
}

function step(dir) {
  try {
    const minta = curValue() + dir * LIMIT.step;
    state.diminta = Math.max(0, minta);
    setCurValue(clampVal(minta));
    setInput();
    refreshSimAnimSoon();
  } catch (err) { console.error("[margin] step gagal:", err); }
}

/* setMode() DIHAPUS bersama mode Persentase — tidak ada lagi mode yang
   bisa dipilih, jadi tidak ada yang perlu dipindahkan. Prefix "Rp" pada
   input sekarang permanen di markup. */

/* ---- Cakupan produk --------------------------------- */

/* Jumlah produk SUNGGUHAN per kategori — dari katalog-jumlah.js, yang
   diisi 12 file data kategori prabayar sendiri (lihat komentar di file
   itu). BUKAN angka hardcode: kalau produk kategori itu bertambah, angka
   di sini ikut naik dengan sendirinya di kunjungan berikutnya.

   Dulu di sini tertulis label "Prabayar"/"Pascabayar" — tidak informatif
   karena SEMUA kategori yang bisa diberi margin memang sudah prabayar
   semua sejak `kategoriMargin()` membatasi daftarnya (lihat
   kategori-map.js), jadi labelnya berulang tanpa membawa arti apa pun. */
function jumlahProduk(slug) {
  var K = window.DikaKatalogJumlah;
  var n = K && K.hitung ? K.hitung[slug] : undefined;
  return typeof n === "number" && isFinite(n) ? n : null;
}

/* Status pemuatan katalog — dibaca renderChkList() supaya baris kategori
   menampilkan "Memuat…" (bukan strip datar "—") selagi katalog diunduh.
   Strip "—" sekarang HANYA berarti "tidak berhasil didapat", bukan
   "sedang dalam perjalanan": inilah yang membuat halaman ini terlihat
   rusak — unduhan katalog 1,4 MB butuh beberapa detik di jaringan seluler,
   dan selama itu SEMUA baris menampilkan "—" tanpa penjelasan apa pun. */
let katalogStatus = "memuat";   /* "memuat" | "siap" | "gagal" */

/* Muat ulang katalog backend ketika halaman Margin dibuka. File kategori
   tetap menjadi pemilik transformasi datanya (dedupe nama kembar, pisah
   sub-brand, dst); masing-masing mendaftarkan jumlah produk ke
   DikaKatalogJumlah setelah katalog selesai dimuat. */
function refreshCoverageFromBackend() {
  const loaders = [
    "DikaPulsa", "DikaPaketData", "DikaListrik", "DikaGasPrabayar",
    "DikaMasaAktif", "DikaPerdana", "DikaSmsTelpon", "DikaGames",
    "DikaStreaming", "DikaVoucher", "DikaVoucherAct", "DikaEmoney",
  ];
  if (!window.DikaApi || typeof window.DikaApi.katalog !== "function") {
    katalogStatus = "gagal";
    return;
  }

  katalogStatus = "memuat";
  renderChkList();

  /* SATU unduhan, bukan dua. Permintaan katalog dibuat DI SINI LEBIH DULU
     supaya tercatat di `inflight` milik api.js; ke-12 `muatUlang()` di
     bawah memanggil DikaApi.kategori(..., paksa=true) yang melewati cache
     TAPI tetap menumpang promise yang sama itu.
     Dulu urutannya terbalik (katalog() dulu sampai SELESAI, baru loaders
     dijalankan) — saat loaders jalan, `inflight` sudah kosong dan
     paksa=true membuat cache dilewati, jadi 1,4 MB yang sama diunduh
     UNTUK KEDUA KALINYA sebelum angkanya muncul. */
  const permintaan = window.DikaApi.katalog("prabayar", true);

  loaders.forEach(function (name) {
    try {
      if (window[name] && typeof window[name].muatUlang === "function") {
        window[name].muatUlang();
      }
    } catch (err) {
      console.error("[margin] refresh kategori " + name + ":", err);
    }
  });

  permintaan
    .then(function () {
      katalogStatus = "siap";
      /* setTimeout 0: beri kesempatan callback `.then` milik ke-12 modul
         (yang mendaftar SEBELUM callback ini) selesai menulis jumlahnya
         ke DikaKatalogJumlah, baru daftar kategori digambar ulang. */
      window.setTimeout(function () {
        renderChkList();
        restoreCoverage();
        syncCoverage();
        // renderChkList() menulis ulang innerHTML #chkList (checkbox baru,
        // atribut disabled lama ikut hilang) — pasang lagi gerbang margin
        // OFF di sini kalau memang sedang OFF, supaya tidak sempat "hidup"
        // sesaat setelah katalog backend selesai dimuat.
        try {
          const marginAktif = window.DikaMargin ? window.DikaMargin.aktif() : true;
          if (!marginAktif) applyMarginGate(false);
        } catch (err) { console.error("[margin] re-gate setelah katalog dimuat gagal:", err); }
      }, 0);
    })
    .catch(function (err) {
      /* Gagal TIDAK boleh diam: dulu cuma console.warn, jadi member melihat
         12 baris "—" tanpa tahu apa yang terjadi atau harus berbuat apa. */
      katalogStatus = "gagal";
      console.warn("[margin] katalog backend belum tersedia:", err);
      renderChkList();
      showTopMsg((err && err.pesanMember) ||
        "Jumlah produk belum bisa dimuat. Cek koneksi lalu buka ulang halaman ini, ya.", true);
    });
}

function renderChkList() {
  chkList.innerHTML = CATS.map((c) => {
    var n = jumlahProduk(c.id);
    /* Mulai dari "0 Produk" — animasi count-up di bawah (animasiJumlahProduk)
       yang menaikkannya ke angka sungguhan begitu render ini selesai.
       Kalau angkanya belum terdaftar (lihat jumlahProduk): "Memuat…" selagi
       katalog diunduh, strip datar "—" kalau unduhannya memang gagal —
       jangan "0 Produk", itu angka yang menyesatkan. */
    var awal = n == null ? (katalogStatus === "memuat" ? "Memuat…" : "—") : "0 Produk";
    return `
    <label class="chk">
      <input type="checkbox" data-cat="${c.id}" />
      <span class="chk__box" aria-hidden="true"></span>
      <span class="chk__label">${c.label}</span>
      <span class="chk__count" data-jumlah="${n == null ? "" : n}">${awal}</span>
    </label>`;
  }).join("");

  animasiJumlahProduk();
}

/* Count-up 0 -> N di tiap baris, begitu daftar kategori pertama kali
   dirender. Memakai `tweenText` yang sama dengan simulasi harga di atas
   (satu implementasi easing + pembatalan rAF, bukan animasi kedua yang
   terpisah) — termasuk jalur `prefers-reduced-motion` yang sudah
   ditanganinya: lompat langsung ke nilai akhir tanpa berhitung. */
function animasiJumlahProduk() {
  try {
    var node = chkList.querySelectorAll(".chk__count[data-jumlah]");
    node.forEach((el, i) => {
      var raw = el.dataset.jumlah;
      if (raw === "") return;                 /* kategori tanpa data -> biarkan "—" */
      var n = Number(raw);
      var mulai = () => tweenText(el, 0, n, (v) => Math.round(v) + " Produk", 620);
      /* Staggered kecil supaya 12 baris tidak menghitung serentak persis
         sama seperti reveal card di bawahnya (pola yang sama). */
      if (REDUCED_MOTION) mulai();
      else window.setTimeout(mulai, i * 45);
    });
  } catch (err) { console.error("[margin] animasi jumlah produk gagal:", err); }
}

/* Kembalikan CAKUPAN tersimpan ke UI.

   BUG yang diperbaiki: mode & nilai margin sudah dipulihkan saat init,
   tapi cakupannya TIDAK — `state.cats` dibaca dari localStorage lalu tidak
   pernah dipakai. Member yang menyimpan margin hanya untuk Pulsa & Paket
   Data kembali ke halaman ini dan melihat "Semua Produk" tercentang
   (bawaan markup). Sekali dia menekan Terapkan tanpa menyentuh apa pun,
   cakupannya melebar diam-diam dari 2 kategori jadi seluruh 28 — tanpa
   dia pernah memintanya.

   `cats` null / "all" = semua produk, termasuk KATEGORI YANG BELUM ADA.
   Itu sebabnya yang disimpan "all" (penanda), bukan salinan daftar slug
   saat itu: salinan akan basi begitu kategori baru ditambahkan. */
function restoreCoverage() {
  try {
    const dipilih = state.cats;
    if (!Array.isArray(dipilih)) { chkAll.checked = true; return; }
    chkAll.checked = false;
    let ketemu = 0;
    dipilih.forEach((id) => {
      const box = chkList.querySelector('[data-cat="' + id + '"]');
      if (box) { box.checked = true; ketemu++; }
      else console.warn("[margin] kategori tersimpan tidak dikenal lagi:", id);
    });
    /* Semua pilihan lama sudah tidak ada (slug dihapus/diganti) — jangan
       tinggalkan member dengan cakupan kosong yang tak bisa disimpan. */
    if (!ketemu) chkAll.checked = true;
  } catch (e) {
    console.error("[margin] gagal memulihkan cakupan:", e);
    chkAll.checked = true;
  }
}

function syncCoverage() {
  const all = chkAll.checked;
  chkList.classList.toggle("is-locked", all);
  chkList.querySelectorAll("input").forEach((i) => { i.disabled = all; });
}

function selection() {
  if (chkAll.checked) return { count: TOTAL, label: "Semua Kategori", ids: "all" };
  const chosen = CATS.filter((c) => {
    const box = chkList.querySelector('[data-cat="' + c.id + '"]');
    return box && box.checked;
  });
  const count = chosen.length;   /* jumlah KATEGORI, bukan produk */
  let label = "";
  if (chosen.length === 1) label = chosen[0].label;
  else if (chosen.length === 2) label = chosen[0].label + ", " + chosen[1].label;
  else if (chosen.length > 2) label = chosen.length + " kategori";
  return { count: count, label: label, ids: chosen.map((c) => c.id) };
}

/* ---- Sakelar utama: Aktifkan Margin -------------------------
   LOKAL SAJA (dikapay:margin:aktif di margin-calc.js) — margin memang
   kalkulator pribadi di HP ini, bukan pengaturan server. OFF -> semua
   halaman produk menampilkan harga_modal apa adanya (gerbangnya ada di
   DikaMargin.aktifUntuk(), dicek satu tempat oleh createGrid() di
   produk-ui.js, bukan disaring lagi di sini) DAN kartu "Mode Margin" +
   "Cakupan Produk" di halaman ini jadi redup/tidak bisa dipakai. */

function applyMarginGate(aktifFlag) {
  try {
    const off = !aktifFlag;
    marginModeCard.classList.toggle("is-off", off);
    marginCakupanCard.classList.toggle("is-off", off);

    marginInput.disabled = off;
    document.querySelectorAll(".stepper [data-step]").forEach((b) => { b.disabled = off; });

    // chkAll/chkList tetap ikut aturan syncCoverage() (checklist terkunci
    // saat "Semua Produk" dicentang) — di sini cuma MENAMBAH penguncian
    // saat margin OFF, supaya nyala kembali tidak menimpa aturan itu.
    chkAll.disabled = off;
    chkList.querySelectorAll("input").forEach((i) => { i.disabled = off || chkAll.checked; });

    applyBtn.disabled = off;
  } catch (err) { console.error("[margin] applyMarginGate gagal:", err); }
}

function onToggleMarginAktif() {
  try {
    const aktifFlag = swMarginAktif.checked;
    const tersimpan = window.DikaMargin ? window.DikaMargin.setAktif(aktifFlag) : false;
    applyMarginGate(aktifFlag);
    showTopMsg(
      aktifFlag
        ? "Margin diaktifkan — harga jual di halaman produk memakai margin kamu lagi."
        : "Margin dimatikan — halaman produk menampilkan harga modal apa adanya.",
      !tersimpan
    );
  } catch (err) { console.error("[margin] onToggleMarginAktif gagal:", err); }
}

/* ---- Modal konfirmasi ------------------------------- */

let confirmHist = false; // true bila openConfirm sempat pushState ke history

function openConfirm() {
  void confirmOverlay.offsetWidth;
  confirmOverlay.classList.add("is-open");
  document.documentElement.style.overflow = "hidden";
  history.pushState({ confirm: true }, "");
  confirmHist = true;
}
function closeConfirm(fromPop) {
  // Batalkan proses "Terapkan" yang mungkin masih menunggu (jeda 1,3 dtk).
  // Tanpa ini: tap "Ya, Terapkan" lalu "Batalkan" → margin tetap tersimpan.
  if (applyTimer) { clearTimeout(applyTimer); applyTimer = null; }
  confirmBusy = false;
  confirmOverlay.classList.remove("is-open");
  document.documentElement.style.overflow = "";
  okBtn.classList.remove("is-loading");
  okBtn.disabled = false;
  cancelBtn.disabled = false;
  // Tutup normal (bukan dari popstate) → mundurkan entri history yang kita push.
  if (confirmHist && !fromPop) { confirmHist = false; history.back(); }
  confirmHist = false;
}

/* ---- Toast sukses (dari atas) ----------------------- */

let topTimer = null;
function showTopMsg(msg, isErr) {
  topMsg.textContent = msg;
  topMsg.classList.toggle("topmsg--err", !!isErr);
  topMsg.classList.add("is-show");
  window.clearTimeout(topTimer);
  topTimer = window.setTimeout(() => topMsg.classList.remove("is-show"), isErr ? 2600 : 3400);
}

/* ---- Riwayat margin -------------------------------- */

function renderMhist() {
  if (!MHIST.length) {
    /* Kosong itu keadaan yang SAH untuk member baru — lebih jujur daripada
       mengisinya dengan contoh yang tidak pernah terjadi. */
    mhistEl.innerHTML =
      '<li class="mhist__kosong">Belum ada perubahan margin. Setelan yang kamu terapkan akan tercatat di sini.</li>';
    return;
  }
  mhistEl.innerHTML = MHIST.map((h, i) => `
    <li class="mhist__item" style="animation-delay:${REDUCED_MOTION ? 0 : i * 45}ms">
      <span class="mhist__dot" aria-hidden="true"></span>
      <span class="mhist__text">${h.text}</span>
      <span class="mhist__date">${h.date}</span>
    </li>`).join("");
}

function pushHistory(sel) {
  const mv = fmtRupiah(state.rp);
  MHIST.unshift({
    text: "Margin <b>" + mv + "</b> kamu terapkan ke " + (sel.label || "produk terpilih"),
    date: todayStr(),
  });
  if (MHIST.length > MHIST_MAKS) MHIST.length = MHIST_MAKS;
  saveMhist();
  renderMhist();
}

/* ---- Apply flow ----------------------------------- */

function onApply() {
  try {
    const sel = selection();
    if (!sel || sel.count === 0) {
      flashClass(applyBtn, "is-shake", 420);
      showTopMsg("Pilih minimal satu kategori produk dulu, ya.", true);
      return;
    }
    const mv = fmtRupiah(state.rp);
    confirmText.textContent =
      "Terapkan margin " + mv + " ke " + sel.count +
      " kategori produk kamu? Angka ini dipakai untuk MENGHITUNG estimasi harga jual di halaman produk — yang kamu bayar ke DikaPay tetap harga modal, tidak berubah.";
    pendingSel = sel;
    openConfirm();
  } catch (err) { console.error("[margin] onApply gagal:", err); }
}

let confirmBusy = false;
let applyTimer = null;

function onConfirmOk() {
  if (confirmBusy || !pendingSel) return;   // cegah klik ganda / state kosong
  confirmBusy = true;
  okBtn.classList.add("is-loading");
  okBtn.disabled = true;
  // cancelBtn tetap aktif — user boleh membatalkan selama jeda proses.
  const sel = pendingSel;
  applyTimer = window.setTimeout(() => {
    applyTimer = null;
    try {
      pushHistory(sel);
      /* Simpan DULU, baru beri tahu berhasil. Kalau penyimpanan gagal
         (storage penuh / mode privat), member harus tahu — jangan
         menampilkan "berhasil" untuk sesuatu yang tidak tersimpan. */
      const tersimpan = saveMargin(sel.ids || null);
      showTopMsg(tersimpan
        ? "✓ Margin kamu berhasil diperbarui untuk " + sel.count + " kategori!"
        : "Margin diterapkan, tapi gagal disimpan di perangkat ini.", !tersimpan);
    } catch (err) {
      console.error("[margin] Terapkan margin gagal:", err);
    } finally {
      confirmBusy = false;
      closeConfirm();
    }
  }, 1300);
}

/* ---- Bottom navigation --------------------------- */
/* Indikator + navigasi tab ditangani bottomnav.js (dipakai bersama 4 halaman). */

/* ---- Init --------------------------------------- */

function init() {
  try {
    if (window.I18N) window.I18N.apply(document);
    simModal.textContent = fmtRupiah(MODAL_SAMPLE);
    /* Catatan simulasi menyebut batasnya secara eksplisit: angka di kartu
       ini SUDAH ikut dipotong, jadi member tidak perlu menebak apakah yang
       dilihatnya sudah final atau belum. */
    if (simNote) {
      simNote.textContent = "*Simulasi memakai contoh harga modal " +
        fmtRupiah(MODAL_SAMPLE) + ". Nominal yang sama juga ditambahkan ke produk lain. " +
        "Maksimal " + fmtRupiah(MAKS_RP) + " per produk.";
    }
    renderChkList();
    renderMhist();
    restoreCoverage();
    syncCoverage();

    /* Tidak ada lagi mode yang perlu dipulihkan ke UI — satu-satunya yang
       tersimpan adalah nominalnya, dan setInput() sudah menuliskannya. */
    setInput();
    refreshSim(false);
    refreshCoverageFromBackend();

    const marginAktif = window.DikaMargin ? window.DikaMargin.aktif() : true;
    swMarginAktif.checked = marginAktif;
    applyMarginGate(marginAktif);
  } catch (err) {
    console.error("[margin] init/render gagal:", err);
  }

  document.querySelectorAll(".reveal").forEach((r, i) => {
    r.style.animationDelay = (REDUCED_MOTION ? 0 : 0.06 + i * 0.08) + "s";
  });

  // step()/onInput() sudah aman: nilai update tiap klik, animasi simulasi
  // di-debounce di dalam (refreshSimAnimSoon). Handler cukup dibungkus try-catch.
  swMarginAktif.addEventListener("change", onToggleMarginAktif);

  document.querySelector(".stepper").addEventListener("click", (e) => {
    try {
      const b = e.target.closest("[data-step]");
      if (b) step(Number(b.dataset.step));
    } catch (err) { console.error("[margin] klik stepper:", err); }
  });
  marginInput.addEventListener("input", onInput);
  marginInput.addEventListener("blur", setInput);

  /* Cakupan TIDAK lagi memengaruhi simulasi maupun peringatan batas:
     nominalnya flat, jadi angkanya sama untuk kategori mana pun yang
     dipilih. Cukup mengunci/melepas checklist-nya saja. */
  chkAll.addEventListener("change", () => {
    try { syncCoverage(); } catch (err) { console.error("[margin] toggle cakupan:", err); }
  });

  applyBtn.addEventListener("click", onApply);
  cancelBtn.addEventListener("click", closeConfirm);
  okBtn.addEventListener("click", onConfirmOk);
  confirmOverlay.addEventListener("click", (e) => {
    if (e.target === confirmOverlay) closeConfirm();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeConfirm();
  });
  window.addEventListener("popstate", () => {
    if (confirmOverlay.classList.contains("is-open")) closeConfirm(true);
  });

}

document.addEventListener("DOMContentLoaded", init);
