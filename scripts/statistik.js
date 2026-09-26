/* ===========================================================================
   DikaPay — statistik.js
   Halaman Statistik Pengeluaran. Data LIVE dari backend (`GET api-riwayat.php`)
   lewat data.js/DATA.TX — dihitung ulang di sini (computeMonthly()) tiap
   DATA.TX berubah. Chart digambar manual dengan SVG + CSS transition
   (tanpa library).
   =========================================================================== */

"use strict";

const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---- Data dummy: 6 bulan terakhir + breakdown kategori ------------- */
/* cats: nilai per kategori, dijumlah = total bulan itu.                */

/* SUMBER DATA: transaksi DIHITUNG dari DATA.TX (data.js) yang sama dengan
   halaman Riwayat, supaya statistik SELALU sinkron dengan riwayat.
   Hanya pengeluaran (amount<0) berstatus ok yang dihitung (top up diabaikan). */

/* Kelompok statistik diturunkan dari field `group` di DATA.CATS, BUKAN
   daftar hardcoded. Dulu daftar ini terpisah, jadi tiap kategori baru
   (Games, Voucher, E-Money, pascabayar) diam-diam tidak terhitung di
   statistik sama sekali — tidak error, cuma hilang dari grafik. */
const GROUP_TO_STAT = (function () {
  const out = {};
  try {
    const C = (window.DATA && window.DATA.CATS) || {};
    Object.keys(C).forEach(function (k) {
      const g = C[k].group;
      /* "topup" tidak punya kolom sendiri di statistik (bukan pengeluaran
         produk), jadi sengaja tidak dipetakan. */
      if (g && g !== "topup") out[k] = g;
    });
  } catch (e) { console.error("[statistik] gagal membaca CATS:", e); }
  return out;
})();
const STAT_KEYS = ["pulsa", "tagihan", "transfer", "game"];
const MONTHS_FULL = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/* ============ SATU DEFINISI DENGAN KARTU "BULAN INI" DI RIWAYAT =========
   BUG yang diperbaiki: fungsi ini dulu punya agregasinya SENDIRI —
       if (!tx || tx.status !== "ok" || tx.amount >= 0) return;   // buang uang masuk
       m.total += Math.abs(tx.amount);
   Artinya SEMUA transaksi uang masuk diabaikan. Untuk September 2026
   (Transfer Keluar -15.000, Transfer Masuk +5.000, Transfer Masuk +5.000,
   Transfer Keluar -5.000) halaman ini menampilkan "-Rp20.000, Transfer
   100%", sedangkan kartu Riwayat untuk bulan yang sama menampilkan
   -Rp10.000 — dua angka berbeda untuk periode yang sama.

   Sekarang penjumlahannya dilakukan tx-ringkas.js, modul yang SAMA yang
   dipakai kartu Riwayat, jadi keduanya tidak bisa lagi berbeda pendapat.

   Yang ditampilkan halaman ini adalah PENGELUARAN BERSIH
   (= keluar - masuk, minimal 0), bukan arus kas bertanda, karena batang &
   donat tidak bisa menggambar nilai negatif. Besarannya tetap SAMA dengan
   kartu Riwayat: bulan yang bersihnya -Rp10.000 di Riwayat tampil sebagai
   pengeluaran bersih Rp10.000 di sini. Bulan yang justru surplus (masuk >
   keluar) tampil 0 — dan angka `masuk`/`keluar`-nya tetap diperlihatkan di
   bawah judul supaya tidak terbaca seolah "tidak ada transaksi".

   Breakdown kategori juga NET per kategori (masuk dikurangi keluar di
   kategori itu), bukan cuma sisi keluarnya. Kategori yang justru surplus
   tidak bisa digambar sebagai potongan donat, jadi dijepit ke 0 dan
   selisihnya dilaporkan sebagai satu baris "Pemasukan lain" di legenda —
   supaya jumlah potongan donat SELALU bisa direkonsiliasi dengan
   totalnya, bukan diam-diam tidak cocok. */
function computeMonthly() {
  const src = (window.DATA && Array.isArray(window.DATA.TX)) ? window.DATA.TX : [];
  if (!window.DikaTxRingkas) {
    console.error("[statistik] tx-ringkas.js belum di-link — statistik tidak bisa dihitung.");
    return [];
  }

  return DikaTxRingkas.perBulan(src).map((r) => {
    const mo = r.kunci % 100;
    const cats = { pulsa: 0, tagihan: 0, transfer: 0, game: 0 };

    /* kategori[slug] dari helper BERTANDA (negatif = keluar). Dibalik jadi
       "pengeluaran" (positif = keluar) lalu dikelompokkan ke 4 kolom
       statistik lewat `group` di DATA.CATS. */
    Object.keys(r.kategori).forEach((slug) => {
      const sk = GROUP_TO_STAT[slug];
      if (!sk || cats[sk] === undefined) return;
      cats[sk] += -r.kategori[slug];
    });
    STAT_KEYS.forEach((k) => { cats[k] = Math.max(0, cats[k]); });

    const jumlahKategori = STAT_KEYS.reduce((s, k) => s + cats[k], 0);
    return {
      key: r.kunci,
      label: `${MONTHS_FULL[mo] || "?"} ${Math.floor(r.kunci / 100)}`,
      short: MONTHS_SHORT[mo] || "?",
      total: r.pengeluaranBersih,
      keluar: r.keluar,
      masuk: r.masuk,
      cats: cats,
      /* Selisih antara jumlah potongan donat dan pengeluaran bersih —
         muncul kalau ada pemasukan di luar 4 kolom itu (mis. top up, yang
         memang bukan kategori pengeluaran produk). Ditampilkan legenda
         sebagai baris tersendiri, bukan disembunyikan. */
      pemasukanLain: Math.max(0, jumlahKategori - r.pengeluaranBersih),
      jumlahKategori: jumlahKategori,
    };
  });
}

/* MONTHLY/MAX_TOTAL dulu dihitung SEKALI di sini (data dummy selalu siap
   sejak parse-time). Sekarang DATA.TX terisi ASYNC (lihat DATA.ready di
   data.js), jadi keduanya jadi `let` + fungsi refreshMonthly() yang
   dipanggil ULANG setiap kali data.js selesai memuat (pertama kali &
   setelah "Coba Lagi") — lihat init(). */
let MONTHLY = [];
let MAX_TOTAL = 0;
function refreshMonthly() {
  MONTHLY = computeMonthly();
  MAX_TOTAL = MONTHLY.length ? Math.max.apply(null, MONTHLY.map((m) => m.total)) : 0;
}

/* Kategori — warna konsisten dengan ikon kategori di halaman Riwayat */
const CATS = [
  { key: "pulsa",    label: "Pulsa & Data", color: "#1B4FD6" },
  { key: "tagihan",  label: "Tagihan",      color: "#E0A400" },
  { key: "transfer", label: "Transfer",     color: "#7A4FD6" },
  { key: "game",     label: "Voucher Game", color: "#DB423A" },
];

/* ---- Helper ------------------------------------------------------- */

function fmtRupiah(v) {
  const n = Number(v);
  return "Rp" + Math.round(Math.abs(isFinite(n) ? n : 0)).toLocaleString("id-ID");
}

function animateCountUp(el, target, opts) {
  opts = opts || {};
  const dur = opts.duration || 1150;
  const fmt = opts.format || ((v) => "-" + fmtRupiah(v));
  const gen = opts.gen;
  const safe = isFinite(Number(target)) ? Number(target) : 0;

  // batalkan loop count-up sebelumnya yang masih jalan di elemen ini
  if (el._cu) { cancelAnimationFrame(el._cu); el._cu = null; }

  if (REDUCED_MOTION) {
    el.textContent = fmt(safe);
    if (opts.done) try { opts.done(); } catch (e) { console.error("[statistik] count-up done:", e); }
    return;
  }
  const start = performance.now();
  (function frame(now) {
    if (gen !== undefined && gen !== renderGen) { el._cu = null; return; } // render sudah kedaluwarsa
    try {
      const t = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out
      el.textContent = fmt(safe * eased);
      if (t < 1) el._cu = requestAnimationFrame(frame);
      else {
        el._cu = null;
        el.textContent = fmt(safe); // pastikan mendarat tepat
        if (opts.done) opts.done();
      }
    } catch (err) {
      console.error("[statistik] count-up:", err);
      el._cu = null;
      el.textContent = fmt(safe);
    }
  })(start);
}

function arrowPath(dir) {
  const d = dir === "up" ? "M12 19V5M6 11l6-6 6 6" : "M12 5v14M6 13l6 6 6-6";
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
}

function debounce(fn, wait) {
  let t = null;
  return function () {
    const args = arguments, ctx = this;
    clearTimeout(t);
    t = setTimeout(function () { fn.apply(ctx, args); }, wait);
  };
}

/* ---- Elemen ---------------------------------------------------- */

const app = document.getElementById("app");
const monthSel = document.getElementById("monthSel");
const monthName = document.getElementById("monthName");
const statTotal = document.getElementById("statTotal");
const statArus = document.getElementById("statArus");
const cmpBadge = document.getElementById("cmpBadge");
const barChartEl = document.getElementById("barChart");
const barPlot = document.getElementById("barPlot");
const barTip = document.getElementById("barTip");
const donut = document.getElementById("donut");
const donutSegs = document.getElementById("donutSegs");
const donutTotal = document.getElementById("donutTotal");
const legend = document.getElementById("legend");
const insight = document.getElementById("insight");
const insightText = document.getElementById("insightText");

let month = null;
let tipTimer = null;

/* Token generasi render: tiap render() menambah 1. Animasi (count-up, setTimeout
   is-in, dst) dari render lama mengecek token ini dan berhenti sendiri kalau
   sudah kedaluwarsa — jadi ganti bulan cepat tidak menumpuk rAF/timer. */
let renderGen = 0;
const pendingTimers = [];
function clearPending() {
  while (pendingTimers.length) clearTimeout(pendingTimers.pop());
}
function later(fn, ms) {
  const id = setTimeout(fn, ms);
  pendingTimers.push(id);
  return id;
}

/* ---- Bar chart ------------------------------------------------ */

const BAR_W = 24, SLOT = 50, BASE_Y = 140, MAX_H = 112;

function buildBars(activeIdx) {
  const parts = MONTHLY.map((m, i) => {
    const h = (m.total / MAX_TOTAL) * MAX_H;
    const x = i * SLOT + 13;
    const y = BASE_Y - h;
    const active = i === activeIdx;
    const delay = REDUCED_MOTION ? 0 : i * 100;
    return `
      <rect class="bar ${active ? "bar--active" : "bar--other"}" data-i="${i}"
        x="${x}" y="${y.toFixed(1)}" width="${BAR_W}" height="${h.toFixed(1)}" rx="5"
        style="transition-delay:${delay}ms" />
      <text class="bar__label ${active ? "bar__label--active" : ""}" x="${x + BAR_W / 2}" y="158" text-anchor="middle">${m.short}</text>`;
  }).join("");
  barPlot.innerHTML = `<svg viewBox="0 0 300 168" preserveAspectRatio="xMidYMid meet">${parts}</svg>`;
  barChartEl.classList.remove("is-in");
}

function showTip(i) {
  const m = MONTHLY[i];
  if (!m || !(MAX_TOTAL > 0)) return;
  const h = (m.total / MAX_TOTAL) * MAX_H;
  const xPct = ((i * SLOT + 13 + BAR_W / 2) / 300) * 100;
  const yPct = Math.max(((BASE_Y - h - 4) / 168) * 100, 13);
  barTip.textContent = `${m.short} · ${fmtRupiah(m.total)}`;
  barTip.style.left = xPct + "%";
  barTip.style.top = yPct + "%";
  barTip.hidden = false;
  clearTimeout(tipTimer);
  tipTimer = setTimeout(() => (barTip.hidden = true), 2200);
}

barChartEl.addEventListener("click", (e) => {
  try {
    const bar = e.target.closest(".bar");
    if (bar) showTip(+bar.dataset.i);
    else barTip.hidden = true;
  } catch (err) { console.error("[statistik] klik bar:", err); }
});

/* ---- Perbandingan bulan ------------------------------------- */

function buildCmp(idx) {
  const cur = MONTHLY[idx];
  const prev = MONTHLY[idx - 1];
  if (!prev || !cur || !(prev.total > 0)) {
    cmpBadge.className = "cmp cmp--flat";
    cmpBadge.innerHTML = "<span>Belum ada data bulan sebelumnya</span>";
    return;
  }
  const diff = cur.total - prev.total;
  const pct = Math.round((Math.abs(diff) / prev.total) * 100);
  if (diff > 0) {
    cmpBadge.className = "cmp cmp--up";
    cmpBadge.innerHTML = `${arrowPath("up")}<span>Naik ${pct}% dari bulan lalu (${fmtRupiah(prev.total)})</span>`;
  } else if (diff < 0) {
    cmpBadge.className = "cmp cmp--down";
    cmpBadge.innerHTML = `${arrowPath("down")}<span>Turun ${pct}% dari bulan lalu (${fmtRupiah(prev.total)})</span>`;
  } else {
    cmpBadge.className = "cmp cmp--flat";
    cmpBadge.innerHTML = `<span>Sama dengan bulan lalu (${fmtRupiah(prev.total)})</span>`;
  }
}

/* ---- Donut ------------------------------------------------- */

function buildDonut() {
  donutSegs.innerHTML = CATS.map((c) =>
    `<circle class="seg" cx="90" cy="90" r="62" fill="none" stroke="${c.color}" stroke-width="26" pathLength="100" stroke-dasharray="0 100" data-key="${c.key}" />`
  ).join("");
  donutTotal.textContent = REDUCED_MOTION ? fmtRupiah(month.total) : "Rp0";
}

/* Penyebut persentase = JUMLAH POTONGAN yang benar-benar digambar
   (month.jumlahKategori), BUKAN month.total. Keduanya biasanya sama; bedanya
   muncul di bulan yang punya pemasukan di luar 4 kategori (mis. top up),
   dan memakai month.total di situ membuat persentase tidak pernah genap
   100% — bahkan bisa membagi nol di bulan yang surplus. */
function pembagiDonut(m) {
  return m && m.jumlahKategori > 0 ? m.jumlahKategori : 0;
}

function animateDonut() {
  const segEls = donutSegs.querySelectorAll(".seg");
  void donut.getBoundingClientRect(); // flush state awal (0 100)
  const pembagi = pembagiDonut(month);
  let cum = 0;
  CATS.forEach((c, i) => {
    const pct = pembagi ? (month.cats[c.key] / pembagi) * 100 : 0;
    const seg = segEls[i];
    seg.style.strokeDashoffset = String(-cum);
    if (!REDUCED_MOTION) seg.style.transitionDelay = i * 0.5 + "s";
    seg.style.strokeDasharray = `${Math.max(pct - 1.6, 0.5)} 100`;
    cum += pct;
  });
}

/* ---- Legend ---------------------------------------------- */

function buildLegend() {
  const pembagi = pembagiDonut(month);
  let html = CATS.map((c, i) => {
    const val = month.cats[c.key];
    const pct = pembagi ? Math.round((val / pembagi) * 100) : 0;
    const delay = REDUCED_MOTION ? 0 : i * 90;
    return `
      <li class="legend__item" style="transition-delay:${delay}ms">
        <span class="legend__dot" style="background:${c.color}"></span>
        <span class="legend__name">${c.label}</span>
        <span class="legend__pct">${pct}%</span>
        <span class="legend__amt">${fmtRupiah(val)}</span>
      </li>`;
  }).join("");

  /* Baris rekonsiliasi: kalau ada pemasukan yang tidak masuk keempat
     kategori di atas (top up, mis.), jumlah potongan donat akan lebih besar
     dari pengeluaran bersih. Selisihnya ditulis apa adanya supaya angkanya
     tetap bisa ditelusuri, bukan hilang diam-diam. */
  if (month.pemasukanLain > 0) {
    html += `
      <li class="legend__item legend__item--net" style="transition-delay:${REDUCED_MOTION ? 0 : CATS.length * 90}ms">
        <span class="legend__dot legend__dot--net"></span>
        <span class="legend__name">Pemasukan lain</span>
        <span class="legend__pct"></span>
        <span class="legend__amt">−${fmtRupiah(month.pemasukanLain)}</span>
      </li>`;
  }

  legend.innerHTML = html;
  legend.classList.remove("is-in");
}

/* ---- Insight otomatis --------------------------------- */

function buildInsight(idx) {
  const m = MONTHLY[idx];
  let top = CATS[0], topVal = -1;
  CATS.forEach((c) => {
    if (m.cats[c.key] > topVal) { topVal = m.cats[c.key]; top = c; }
  });
  const pembagi = pembagiDonut(m);
  const topPct = pembagi ? Math.round((topVal / pembagi) * 100) : 0;
  let text = `Pengeluaran terbesar bulan ini ada di kategori ${top.label} (${topPct}%).`;

  const prev = MONTHLY[idx - 1];
  if (prev) {
    const diff = m.total - prev.total;
    if (diff < 0) text += ` Kamu lebih hemat ${fmtRupiah(-diff)} dibanding bulan lalu, pertahankan!`;
    else if (diff > 0) text += ` Pengeluaran naik ${fmtRupiah(diff)} dari bulan lalu, coba lebih hemat bulan depan.`;
  }
  insightText.textContent = text;
  insight.classList.remove("is-in");
}

/* ---- Orkestrasi animasi ------------------------------ */

function play(gen) {
  try {
    if (gen !== renderGen || !month) return; // render baru sudah menyusul
    void barChartEl.offsetWidth;
    barChartEl.classList.add("is-in");
    animateDonut();

    animateCountUp(donutTotal, month.total, { gen: gen, format: (v) => fmtRupiah(v) });
    animateCountUp(statTotal, month.total, {
      gen: gen,
      format: (v) => "-" + fmtRupiah(v),
      done: () => {
        if (gen !== renderGen) return;
        statTotal.classList.add("is-shimmer");
        cmpBadge.classList.add("is-in");
        later(() => { if (gen === renderGen) legend.classList.add("is-in"); }, 160);
        later(() => { if (gen === renderGen) insight.classList.add("is-in"); }, 420);
      },
    });
  } catch (err) {
    console.error("[statistik] play gagal:", err);
  }
}

function render(idx) {
  const i = Number(idx);
  if (!Number.isInteger(i) || i < 0 || i >= MONTHLY.length) {
    console.warn("[statistik] render: index bulan tidak valid:", idx);
    return;
  }
  const gen = ++renderGen;   // token baru → animasi render lama otomatis batal
  clearPending();
  if (statTotal._cu) { cancelAnimationFrame(statTotal._cu); statTotal._cu = null; }
  if (donutTotal._cu) { cancelAnimationFrame(donutTotal._cu); donutTotal._cu = null; }

  try {
    month = MONTHLY[i];
    monthName.textContent = month.label;
    statTotal.classList.remove("is-shimmer");
    statTotal.textContent = REDUCED_MOTION ? "-" + fmtRupiah(month.total) : "-Rp0";
    /* Rincian arus kas bulan itu — membuat angka "bersih" di atasnya bisa
       diperiksa sendiri oleh member (keluar - masuk), sekaligus menjelaskan
       bulan yang bersihnya 0 karena pemasukannya lebih besar. */
    if (statArus) {
      statArus.textContent = month.masuk > 0
        ? `Keluar ${fmtRupiah(month.keluar)} · Masuk ${fmtRupiah(month.masuk)}`
        : `Keluar ${fmtRupiah(month.keluar)}`;
    }
    barTip.hidden = true;

    buildBars(i);
    buildCmp(i);
    buildDonut();
    buildLegend();
    buildInsight(i);

    if (REDUCED_MOTION) {
      barChartEl.classList.add("is-in");
      animateDonut();
      donutTotal.textContent = fmtRupiah(month.total);
      cmpBadge.classList.add("is-in");
      legend.classList.add("is-in");
      insight.classList.add("is-in");
      return;
    }
    requestAnimationFrame(() => requestAnimationFrame(() => play(gen)));
  } catch (err) {
    console.error("[statistik] render gagal:", err);
  }
}

/* ---- Navigasi -------------------------------------- */

function navBack() {
  if (history.length > 1) history.back();
  else window.location.href = "riwayat.html";
}

/* ---- Init ---------------------------------------- */

/* ---- Blok status (memuat/gagal/kosong) — lihat #statState di HTML --- */

const statState = document.getElementById("statState");
const statSpin = document.getElementById("statSpin");
const statStateText = document.getElementById("statStateText");
const statRetryBtn = document.getElementById("statRetryBtn");
const statContent = document.getElementById("statContent");

/* kind: "memuat" | "gagal" | "kosong" | null (null = sembunyikan blok
   status, tampilkan #statContent seperti biasa). */
function tampilkanState(kind, pesan) {
  if (!statState || !statContent) return;
  if (!kind) {
    statState.hidden = true;
    statContent.hidden = false;
    return;
  }
  statState.classList.toggle("sstate--error", kind === "gagal");
  statState.classList.toggle("sstate--loading", kind === "memuat");
  statContent.hidden = kind !== "gagal";
  statState.hidden = false;
  if (statSpin) statSpin.hidden = kind !== "memuat";
  if (statRetryBtn) statRetryBtn.hidden = kind !== "gagal";
  if (statStateText) {
    statStateText.textContent =
      kind === "memuat" ? "Memuat statistik…" :
      kind === "gagal" ? (pesan || "Gagal memuat statistik. Coba lagi, ya.") :
      "Belum ada pengeluaran untuk ditampilkan.";
  }
}

/* Dipanggil setelah DATA.ready (pemuatan pertama) MAUPUN setelah
   DATA.muatUlang() (tombol "Coba Lagi") selesai — satu titik yang
   menghitung ulang MONTHLY dan memutuskan status/blok mana yang tampil. */
function siapkanTampilan() {
  try {
    refreshMonthly();
    if ((!window.DATA || window.DATA.status === "memuat") && MONTHLY.length === 0) {
      tampilkanState("memuat");
      return;
    }
    if (MONTHLY.length === 0) {
      const status = (window.DATA && window.DATA.status) || "kosong";
      tampilkanState(status === "gagal" ? "gagal" : "kosong", window.DATA && window.DATA.error);
      console.warn("[statistik] Tidak ada data pengeluaran untuk ditampilkan.");
      return;
    }
    tampilkanState(null);
    monthSel.innerHTML = MONTHLY.map((m, i) => `<option value="${i}">${m.label}</option>`).join("");
    monthSel.value = String(MONTHLY.length - 1); // default: bulan berjalan
    render(MONTHLY.length - 1);
  } catch (err) {
    console.error("[statistik] siapkanTampilan gagal:", err);
  }
}

function init() {
  tampilkanState("memuat");
  const ready = (window.DATA && window.DATA.ready && typeof window.DATA.ready.then === "function")
    ? window.DATA.ready
    : Promise.resolve();
  ready.then(siapkanTampilan);
  window.addEventListener("dika:data-ready", siapkanTampilan);
  window.addEventListener("dika:data-loading", siapkanTampilan);

  if (statRetryBtn) {
    statRetryBtn.addEventListener("click", () => {
      if (!window.DATA || typeof window.DATA.muatUlang !== "function") return;
      tampilkanState("memuat");
      window.DATA.muatUlang().then(siapkanTampilan);
    });
  }

  const renderSoon = debounce(function () {
    try { render(+monthSel.value); } catch (err) { console.error("[statistik] ganti bulan:", err); }
  }, 120);
  monthSel.addEventListener("change", renderSoon);

  document.getElementById("backBtn").addEventListener("click", () => {
    if (REDUCED_MOTION || !app) { navBack(); return; }
    if (app.classList.contains("is-leaving")) return;
    app.classList.add("is-leaving");
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      app.removeEventListener("transitionend", onEnd);
      app.classList.remove("is-leaving");   // lepas SEBELUM navigasi
      navBack();
    };
    const onEnd = (e) => {
      if (e.target === app && e.propertyName === "transform") finish();
    };
    app.addEventListener("transitionend", onEnd);
    setTimeout(finish, 340);
  });
}

document.addEventListener("DOMContentLoaded", init);

/* Halaman BLANK: .is-leaving (translateX(100%)) yang ikut membeku ke
   bfcache membuat konten tetap di luar layar saat halaman dipulihkan
   (script TIDAK dijalankan ulang). Dilepas di DUA titik: pagehide (tepat
   sebelum dibekukan — menangkap semua jalur) dan pageshow (jaring saat
   restore). Sama seperti produk-ui.js. */
function healLeaving() {
  try {
    var el = document.getElementById("app");
    if (el) el.classList.remove("is-leaving");
  } catch (e) { console.error("heal is-leaving:", e); }
}
window.addEventListener("pageshow", healLeaving);
window.addEventListener("pagehide", healLeaving);
