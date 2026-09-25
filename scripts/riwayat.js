/* ===========================================================================
   DikaPay — riwayat.js
   Halaman Riwayat Transaksi. Data LIVE dari backend (`GET api-riwayat.php`)
   lewat data.js — lihat file itu untuk pemuatan/pemetaan/retry/pagination.
   =========================================================================== */

"use strict";

const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---- Sumber data bersama (data.js) -----------------------------------
   `DATA.TX` MULAI KOSONG dan diisi ASYNC — lihat DATA.ready di bawah.
   `DATA` sendiri (fallback kalau data.js gagal dimuat) TIDAK punya
   `ready`/`muatLagi`/`muatUlang`, jadi setiap pemakaiannya di file ini
   dijaga dengan `typeof ... === "function"`. */

const DATA = window.DATA || { CATS: {}, TX: [], DETAILS: {}, status: "gagal", error: "" };
const CATS = DATA.CATS;

/* ---- Ikon kategori (inline SVG, tanpa aset luar) -------------------- */

const CAT_ICONS = {
  signal:   '<path d="M4 20h.01M8 20v-5M12 20v-9M16 20V8M20 20V4"/>',
  wifi:     '<path d="M5 12.5a11 11 0 0 1 14 0"/><path d="M2 9a16 16 0 0 1 20 0"/><path d="M8.5 16a6 6 0 0 1 7 0"/><path d="M12 20h.01"/>',
  bolt:     '<path d="M13 2 3 14h7l-1 8 10-12h-7z"/>',
  receipt:  '<path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  drop:     '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  shield:   '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  transfer: '<path d="M4 9h13l-3.5-3.5M20 15H7l3.5 3.5"/>',
  /* Transfer MASUK — panah turun ke dalam baki. Sengaja beda bentuk (bukan
     sekadar beda warna) dari `transfer` di atas, supaya uang masuk vs uang
     keluar terbaca sekilas tanpa harus membaca nominalnya. */
  "transfer-in": '<path d="M12 3v10M8.5 9.5 12 13l3.5-3.5"/><path d="M4 16v3.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V16"/>',
  plus:     '<path d="M12 5v14M5 12h14"/>',
  gamepad:  '<rect x="2" y="6" width="20" height="12" rx="5"/><path d="M7 12h3M8.5 10.5v3M15.5 11h.01M17.5 13h.01"/>',
  play:     '<path d="M20 12 6 20V4z"/>',
  tv:       '<rect x="2.5" y="7" width="19" height="13" rx="2.6"/><path d="m8 3 4 4 4-4"/>',
  ticket:   '<path d="M3 8.6V6.5a1.5 1.5 0 0 1 1.5-1.5h15A1.5 1.5 0 0 1 21 6.5v2.1a2.6 2.6 0 0 0 0 5.2v2.1a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 15.9v-2.1a2.6 2.6 0 0 0 0-5.2z"/>',
  card:     '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6 15h4"/>',
  sim:      '<path d="M6.5 3h6.7L19 8.4V20a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 20V4.5A1.5 1.5 0 0 1 6.5 3z"/><rect x="8.4" y="11" width="7.2" height="7" rx="1.4"/>',
  building: '<rect x="4" y="3" width="16" height="18" rx="1.6"/><path d="M9 8h.01M15 8h.01M9 12h.01M15 12h.01M9.5 21v-4h5v4"/>',
  flame:    '<path d="M12 2s5 5 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 1.5 0 1-4 1-8z"/>',
};

function iconSvg(name) {
  return (
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round">' + (CAT_ICONS[name] || "") + "</svg>"
  );
}

/* ---- Filter chip -> grup kategori yang ditampilkan ------------------- */

const FILTERS = {
  all: null,
  pulsa: ["pulsa"],
  tagihan: ["tagihan"],
  transfer: ["transfer"],
  topupgame: ["topup", "game"],
};

const TX = DATA.TX;

/* ---- Detail tambahan per transaksi (untuk struk) ------------------ */
/* acc = nomor tujuan/ID pelanggan/VA/User ID · admin = biaya admin    */

const DETAILS = DATA.DETAILS;

function getDetail(tx) { return DETAILS[tx.id] || {}; }

/* Samarkan sebagian string: keep 4 karakter awal, sisanya jadi 'x' */
function maskAcc(s) {
  if (!s) return "—";
  const head = s.slice(0, 4);
  const tail = s.slice(4).replace(/[0-9A-Za-z]/g, "x");
  return head + tail;
}
/* "TRX-20260828-0194" -> "TRX-2026...0194" */
function maskId(s) {
  return s.length > 12 ? s.slice(0, 8) + "..." + s.slice(-4) : s;
}

/* ---- Helper tanggal & format --------------------------------------- */

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function parseDT(s) {
  const [d, t] = s.split("T");
  const [y, mo, da] = d.split("-").map(Number);
  const [h, mi] = t.split(":").map(Number);
  return { y, mo: mo - 1, da, h, mi, sortVal: Number(d.replace(/-/g, "") + t.replace(":", "")) };
}
function pad2(n) { return String(n).padStart(2, "0"); }
function fmtRupiah(v) {
  const n = Number(v);
  return "Rp" + Math.round(Math.abs(isFinite(n) ? n : 0)).toLocaleString("id-ID");
}
function fmtDateTime(p) { return `${p.da} ${MONTHS_SHORT[p.mo]} ${p.y} • ${pad2(p.h)}.${pad2(p.mi)}`; }
function monthLabel(p) { return `${MONTHS[p.mo] || "?"} ${p.y}`; }
function monthKey(p) { return p.y * 100 + p.mo; }

/* Jeda eksekusi: klik beruntun sangat cepat hanya memicu 1 proses. */
function debounce(fn, wait) {
  let t = null;
  return function () {
    const args = arguments, ctx = this;
    clearTimeout(t);
    t = setTimeout(function () { fn.apply(ctx, args); }, wait);
  };
}

const STATUS = {
  ok:      { cls: "badge--ok", text: "Berhasil" },
  pending: { cls: "badge--pending", text: "Pending" },
  fail:    { cls: "badge--fail", text: "Gagal" },
};

/* ---- State -------------------------------------------------------- */

const state = { filter: "all", sort: "desc", query: "" };

/* ---- Elemen ----------------------------------------------------- */

const txList = document.getElementById("txList");
const emptyState = document.getElementById("emptyState");
const emptyTitle = document.getElementById("emptyTitle");
const emptySub = document.getElementById("emptySub");
const loadingState = document.getElementById("loadingState");
const errorState = document.getElementById("errorState");
const errorText = document.getElementById("errorText");
const retryBtn = document.getElementById("retryBtn");
const loadMoreBtn = document.getElementById("loadMoreBtn");
const filterChips = document.getElementById("filterChips");
const searchInput = document.getElementById("searchInput");
const sortBtn = document.getElementById("sortBtn");
const summaryTotal = document.getElementById("summaryTotal");
const summaryHint = document.getElementById("summaryHint");

/* ---- Ringkasan bulanan (count-up + reveal) ------------------- */

/* Tanda "-"/"+" sekarang IKUT NILAINYA, tidak lagi dipaku "-" di semua
   jalur. Kartu ringkasan menampilkan SALDO BERSIH bulan berjalan, yang bisa
   positif (uang masuk lebih besar) — dulu nilai positif pun tetap tampil
   dengan tanda minus karena string "-" ditulis tangan di 5 tempat di bawah. */
function tandaNominal(v) {
  if (!isFinite(v) || v === 0) return "";
  return v < 0 ? "-" : "+";
}

function animateCountUp(el, target, duration, onDone) {
  const safeTarget = isFinite(Number(target)) ? Number(target) : 0;
  const tanda = tandaNominal(safeTarget);
  const tulis = (v) => { el.textContent = tanda + fmtRupiah(v); };
  if (REDUCED_MOTION) {
    tulis(safeTarget);
    if (onDone) try { onDone(); } catch (e) { console.error("[riwayat] onDone count-up:", e); }
    return;
  }
  const start = performance.now();
  (function frame(now) {
    try {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out
      tulis(safeTarget * eased);
      if (t < 1) requestAnimationFrame(frame);
      else {
        tulis(safeTarget); // pastikan mendarat tepat
        if (onDone) onDone();
      }
    } catch (err) {
      console.error("[riwayat] Count-up gagal:", err);
      tulis(safeTarget); // fallback: tampilkan nilai final
    }
  })(start);
}

function renderSummary() {
  try {
    if (!Array.isArray(TX)) return;
    if (!window.DikaTxRingkas) {
      console.error("[riwayat] tx-ringkas.js belum di-link — ringkasan bulanan dilewati.");
      return;
    }

    /* ============ SALDO BERSIH BULAN BERJALAN (bukan pengeluaran saja) ====
       Perhitungannya TIDAK lagi ditulis di sini: dipindah ke tx-ringkas.js
       supaya halaman Statistik memakai definisi yang SAMA PERSIS (dulu
       keduanya menghitung sendiri-sendiri dan menghasilkan dua angka
       berbeda untuk periode yang sama — lihat catatan di file itu).

       `bersih` = jumlah BERTANDA seluruh transaksi berhasil bulan ini
       (keluar/pembelian mengurangi, transfer masuk & top up menambah),
       konsisten dengan warna tiap baris di daftar bawah (merah = keluar,
       hijau = masuk). `jumlah` menghitung KEDUA arah. */
    const r = DikaTxRingkas.ringkas(TX, DikaTxRingkas.kunciSekarang());
    const total = r.bersih;
    summaryHint.textContent = r.jumlah
      ? `${r.jumlah} transaksi berhasil bulan ini`
      : "Belum ada transaksi bulan ini";

    const run = () => {
      animateCountUp(summaryTotal, total, 1150, () => {
        summaryTotal.classList.add("is-shimmer");
        setTimeout(() => summaryHint.classList.add("is-in"), 160);
      });
    };

    const card = document.getElementById("summaryCard");
    if (card && "IntersectionObserver" in window) {
      const io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          run();
        }
      }, { threshold: 0.4 });
      io.observe(card);
    } else {
      run();
    }
  } catch (err) {
    console.error("[riwayat] renderSummary gagal:", err);
  }
}

/* ---- Placeholder typewriter di search bar --------------------- */

const SEARCH_HINTS = [
  "Cari nama atau nominal…",
  "Coba cari 'Pulsa'…",
  "Coba cari 'Token Listrik'…",
  "Coba cari 'Transfer'…",
];

const tw = { phrase: 0, char: 0, deleting: false, cursor: true, active: false, timer: null, blink: null };

function twRender() {
  const text = SEARCH_HINTS[tw.phrase].slice(0, tw.char);
  searchInput.setAttribute("placeholder", text + (tw.cursor ? "|" : ""));
}

function twStep() {
  const full = SEARCH_HINTS[tw.phrase];
  if (!tw.deleting) {
    tw.char++;
    twRender();
    if (tw.char >= full.length) {
      tw.deleting = true;
      tw.timer = setTimeout(twStep, 1500);
    } else {
      tw.timer = setTimeout(twStep, 68 + Math.random() * 14);
    }
  } else {
    tw.char--;
    twRender();
    if (tw.char <= 0) {
      tw.deleting = false;
      tw.phrase = (tw.phrase + 1) % SEARCH_HINTS.length;
      tw.timer = setTimeout(twStep, 320);
    } else {
      tw.timer = setTimeout(twStep, 34);
    }
  }
}

function twStart() {
  if (tw.active) return;
  if (REDUCED_MOTION) {
    searchInput.setAttribute("placeholder", SEARCH_HINTS[0]);
    return;
  }
  tw.active = true;
  tw.phrase = 0;
  tw.char = 0;
  tw.deleting = false;
  tw.cursor = true;
  tw.blink = setInterval(() => {
    tw.cursor = !tw.cursor;
    twRender();
  }, 530);
  twStep();
}

function twStop() {
  tw.active = false;
  clearTimeout(tw.timer);
  clearInterval(tw.blink);
  searchInput.setAttribute("placeholder", "");
}

/* ---- Filter + render list ----------------------------------- */

function getFiltered() {
  if (!Array.isArray(TX)) return [];
  const q = String(state.query || "").trim().toLowerCase();
  const digits = q.replace(/[^0-9]/g, "");
  const groups = Object.prototype.hasOwnProperty.call(FILTERS, state.filter)
    ? FILTERS[state.filter]
    : null; // filter tak dikenal → anggap "semua"

  return TX.filter((tx) => {
    const cat = CATS[tx.cat];
    if (!cat) return false;               // kategori tak dikenal → lewati (jangan crash)
    if (groups && !groups.includes(cat.group)) return false;
    if (q) {
      const inName = String(tx.name || "").toLowerCase().includes(q);
      const inAmount = digits.length > 0 && String(Math.abs(tx.amount)).includes(digits);
      if (!inName && !inAmount) return false;
    }
    return true;
  });
}

function buildItem(tx, idx) {
  const cat = CATS[tx.cat] || { color: "#6b7488", icon: "" };
  const p = parseDT(tx.dt);
  const out = Number(tx.amount) < 0;
  const st = STATUS[tx.status] || STATUS.ok;
  const delay = REDUCED_MOTION ? 0 : Math.min(idx * 50, 400); // cap stagger

  const el = document.createElement("button");
  el.type = "button";
  el.className = "tx";
  el.style.animationDelay = delay + "ms";
  el.innerHTML = `
    <span class="tx__icon" style="background:${cat.color}22;color:${cat.color};animation-delay:${delay + 60}ms">${iconSvg(cat.icon)}</span>
    <span class="tx__body">
      <span class="tx__name">${tx.name}</span>
      <span class="tx__date">${fmtDateTime(p)}</span>
    </span>
    <span class="tx__right">
      <span class="tx__amount tx__amount--${out ? "out" : "in"}">${out ? "-" : "+"}${fmtRupiah(tx.amount)}</span>
      <span class="badge ${st.cls}">${st.text}</span>
    </span>
    <svg class="tx__go" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>`;

  el.addEventListener("click", () => openReceipt(tx.id));
  return el;
}

let renderBusy = false;

/* Tombol "Muat Transaksi Lainnya" — tampil kalau backend masih punya
   halaman berikutnya (DATA.adaLagi), atau sedang memuatnya (state "memuat"
   PADAHAL sudah ada transaksi di tangan — beda dari "memuat" pemuatan
   PERTAMA yang layarnya masih kosong total, lihat renderList()). */
function syncLoadMore() {
  const sedangMuat = DATA.status === "memuat";
  const tampil = !!DATA.adaLagi || sedangMuat;
  loadMoreBtn.hidden = !tampil;
  if (!tampil) return;
  loadMoreBtn.classList.toggle("is-loading", sedangMuat);
  loadMoreBtn.disabled = sedangMuat;
  loadMoreBtn.textContent = sedangMuat ? "Memuat…" : "Muat Transaksi Lainnya";
}

function renderList() {
  const hasAny = Array.isArray(TX) && TX.length > 0;

  /* Belum ada SATU PUN transaksi di tangan — bedakan tiga kemungkinan
     lewat DATA.status (memuat pertama kali / gagal / benar-benar kosong)
     alih-alih diam-diam tidak menampilkan apa-apa seperti dulu (dulu
     kondisi ini tidak pernah terjadi karena data dummy selalu siap sejak
     awal). Daftar TIDAK disentuh sampai ada kejelasan status. */
  if (!hasAny) {
    loadingState.hidden = DATA.status !== "memuat";
    errorState.hidden = DATA.status !== "gagal";
    if (DATA.status === "gagal" && errorText) {
      errorText.textContent = DATA.error || "Gagal memuat riwayat transaksi. Coba lagi, ya.";
    }
    emptyState.hidden = DATA.status !== "kosong";
    if (DATA.status === "kosong") {
      emptyTitle.textContent = "Belum ada transaksi";
      emptySub.textContent = "Transaksi yang kamu lakukan akan muncul di sini.";
    }
    txList.innerHTML = "";
    loadMoreBtn.hidden = true;
    return;
  }

  loadingState.hidden = true;
  errorState.hidden = true;

  // Guard: cegah render bertumpuk (mis. dipanggil ulang dari dalam handler)
  if (renderBusy) return;
  renderBusy = true;

  try {
    const list = getFiltered()
      .map((tx) => ({ tx, p: parseDT(tx.dt) }))
      .sort((a, b) => (state.sort === "asc" ? a.p.sortVal - b.p.sortVal : b.p.sortVal - a.p.sortVal));

    // Bangun SEMUA ke fragment lebih dulu. Baru setelah selesai tanpa error,
    // tukar isi #txList sekali jalan → error di tengah proses tidak akan
    // meninggalkan daftar kosong (state terakhir yang valid tetap tampil).
    const frag = document.createDocumentFragment();
    const byKey = new Map();
    const groups = [];
    list.forEach(({ tx, p }) => {
      const k = monthKey(p);
      if (!byKey.has(k)) {
        const g = { label: monthLabel(p), items: [] };
        byKey.set(k, g);
        groups.push(g);
      }
      byKey.get(k).items.push(tx);
    });

    let idx = 0;
    groups.forEach((g) => {
      const gEl = document.createElement("div");
      gEl.className = "txgroup";
      const label = document.createElement("div");
      label.className = "txgroup__label";
      label.textContent = g.label;
      gEl.appendChild(label);
      g.items.forEach((tx) => gEl.appendChild(buildItem(tx, idx++)));
      frag.appendChild(gEl);
    });

    txList.innerHTML = "";
    txList.appendChild(frag);

    const kosongKarenaFilter = list.length === 0;
    emptyState.hidden = !kosongKarenaFilter;
    if (kosongKarenaFilter) {
      // Beda pesan dari "belum ada transaksi sama sekali" — ini ADA
      // transaksinya, cuma tidak ada yang cocok dengan filter/pencarian.
      emptyTitle.textContent = "Tidak ditemukan";
      emptySub.textContent = "Coba kata kunci atau filter lain, ya.";
    }
    syncLoadMore();
  } catch (err) {
    console.error("[riwayat] Gagal merender daftar transaksi:", err);
    // Sengaja TIDAK mengosongkan #txList — biarkan tampilan terakhir yang valid.
  } finally {
    renderBusy = false;
  }
}

/* ===========================================================================
   Struk detail transaksi (panel geser)
   =========================================================================== */

const receiptEl = document.getElementById("receipt");
let receiptOpen = false;
let receiptTxId = null;

const STATUS_BIG = {
  ok:      { cls: "rc__status--ok",      text: "Transaksi Berhasil!", icon: '<path d="m5 12 5 5L20 7"/>' },
  pending: { cls: "rc__status--pending", text: "Sedang Diproses",     icon: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>' },
  fail:    { cls: "rc__status--fail",    text: "Transaksi Gagal",     icon: '<path d="M6 6l12 12M18 6 6 18"/>' },
};

function bigIcon(name) {
  return (
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
    'stroke-linecap="round" stroke-linejoin="round">' + (CAT_ICONS[name] || "") + "</svg>"
  );
}

function accordion(title, rows, opts) {
  const open = opts && opts.open ? " is-open" : "";
  const mod = opts && opts.mod ? " " + opts.mod : "";
  const head = opts && opts.headHtml
    ? opts.headHtml
    : `<span>${title}</span>`;
  const body = rows
    .map((r) => `<div class="rc__line"><span>${r[0]}</span><span>${r[1]}</span></div>`)
    .join("");
  return `
    <div class="acc${mod}${open}">
      <button class="acc__head" type="button">
        ${head}
        <svg class="acc__chev" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
      </button>
      <div class="acc__body"><div class="acc__inner">${body}</div></div>
    </div>`;
}

function renderReceipt(tx) {
  const cat = CATS[tx.cat] || { color: "#6b7488", icon: "" };
  const p = parseDT(tx.dt);
  const d = getDetail(tx) || {};
  const st = STATUS_BIG[tx.status] || STATUS_BIG.pending;

  /* Transfer punya DUA arah sejak riwayat live (lihat CATS di data.js) —
     keduanya memakai struk transfer, cuma kata & tombolnya yang menyesuaikan. */
  const isMasuk = tx.cat === "transfermasuk";
  const isTransfer = tx.cat === "transfer" || isMasuk;
  const isTopup = tx.cat === "topup";
  const total = Math.abs(tx.amount);
  const admin = d.admin || 0;
  const base = total - admin;

  /* Buang baris yang nilainya kosong ("—"/undefined) sebelum dirender.
     `api-riwayat.php` tidak mengirim detail penerima/pengirim, jadi tanpa
     ini struk transfer penuh baris bergaris strip yang terlihat seperti
     tampilan rusak. Menyembunyikan barisnya lebih jujur daripada
     menampilkan label dengan isi kosong. */
  const isiAda = (v) => v != null && String(v).trim() !== "" && String(v).trim() !== "—";
  const rowsTerisi = (rows) => rows.filter((r) => isiAda(r[1]));

  const longWhen = `${p.da} ${MONTHS[p.mo]} ${p.y} • ${pad2(p.h)}.${pad2(p.mi)} WIB`;
  const processed = tx.status === "fail"
    ? "—"
    : `${p.da} ${MONTHS_SHORT[p.mo]} ${p.y} ${pad2(p.h)}.${pad2(p.mi)}`;

  /* Deskripsi */
  let desc;
  if (isTransfer) {
    /* d.recipient/d.recipientId datang dari DATA.DETAILS, yang SELALU kosong
       untuk transaksi live (api-riwayat.php belum mengirim identitas lawan
       transaksi). Kalau memang tidak ada, kalimatnya BERHENTI di nominal —
       bukan menempelkan "ke —" atau literal "undefined" seperti dulu. */
    const lawan = isMasuk ? d.sender : d.recipient;
    const lawanId = isMasuk ? d.senderId : d.recipientId;
    const kata = isMasuk ? "Terima Uang" : "Kirim Uang";
    const arah = isMasuk ? "dari" : "ke";
    desc = `${kata} ${fmtRupiah(total)}`;
    if (isiAda(lawan)) desc += ` ${arah} ${lawan}`;
    if (isiAda(lawanId)) desc += ` - ${maskAcc(lawanId)}`;
  } else if (isTopup) {
    desc = `Top Up Saldo via ${tx.method}`;
  } else {
    const suffix = {
      pulsa: `ke ${maskAcc(d.acc)}`,
      data: `ke ${maskAcc(d.acc)}`,
      listrik: `- ID Pelanggan ${maskAcc(d.acc)}`,
      plnpasca: `- ID Pelanggan ${maskAcc(d.acc)}`,
      pdam: `- ID Pelanggan ${maskAcc(d.acc)}`,
      bpjs: `- No. VA ${maskAcc(d.acc)}`,
      game: `- User ID ${maskAcc(d.acc)}`,
    }[tx.cat] || "";
    desc = `${tx.name} ${suffix}`.trim();
  }

  /* Box Total Bayar (accordion) — uang MASUK tidak "dibayar" member,
     jadi labelnya jangan "Total Bayar". */
  const totalLabel = isMasuk ? "Total Diterima" : isTopup ? "Nominal Top Up" : "Total Bayar";
  const baseLabel = isTransfer ? "Nominal Transfer" : isTopup ? "Nominal" : "Harga Produk";
  const totalHead = `
    <span class="rc__total-main">
      <span>${totalLabel}</span>
      <strong>${fmtRupiah(total)}</strong>
    </span>`;
  const totalBox = accordion("", [
    [baseLabel, fmtRupiah(base)],
    ["Biaya Admin", admin ? fmtRupiah(admin) : "Gratis"],
  ], { mod: "acc--total", headHtml: totalHead });

  /* Section collapsible */
  let sections;
  if (isTransfer) {
    /* "Kode Produk / SKU" & "Nomor Tujuan" TIDAK relevan untuk transfer —
       diganti identitas lawan transaksi (Penerima / Pengirim). Kalau backend
       belum mengirimnya, seluruh kartunya dilewati, bukan ditampilkan kosong. */
    const lawanRows = rowsTerisi(isMasuk
      ? [["Nama Pengirim", d.sender], ["Nomor HP / ID DikaPay", d.senderId]]
      : [["Nama Penerima", d.recipient], ["Nomor HP / ID DikaPay", d.recipientId]]);

    const trxRows = rowsTerisi([
      ["ID Transaksi", tx.id],
      /* `ref` sama dengan `id` untuk data live — baris ini hanya muncul
         kalau backend memang mengirim kode referensi yang BERBEDA. */
      ["Kode Referensi", tx.ref && tx.ref !== tx.id ? tx.ref : ""],
      ["Catatan", d.note],
      ["Waktu Diproses", processed],
    ]);

    sections =
      (lawanRows.length
        ? accordion(isMasuk ? "Detail Pengirim" : "Detail Penerima", lawanRows, { open: true })
        : "") +
      accordion("Detail Transaksi", trxRows, { open: !lawanRows.length });
  } else {
    const rows = [
      ["Kode Produk / SKU", d.sku || "—"],
      [isTopup ? "Sumber Dana" : "Nomor Tujuan", isTopup ? tx.method : (d.acc || "—")],
    ];
    if (tx.cat === "listrik" && d.token) rows.push(["Nomor Token / Serial", d.token]);
    rows.push(["Kode Referensi", tx.ref]);
    rows.push(["Waktu Diproses", processed]);
    sections = accordion("Detail Transaksi", rows, { open: true });
  }

  /* Tombol aksi — "Beli Lagi" tidak masuk akal untuk transfer, dan tombol
     lama ("Kirim Lagi"/"Bagikan Bukti") tidak pernah disambungkan ke mana
     pun (cuma console.log). Sekarang keduanya benar-benar menavigasi,
     lihat handler klik `data-act` di bawah.
     Uang MASUK tidak bisa "diulang" oleh penerima, jadi satu-satunya aksi
     yang wajar di situ adalah kembali ke Beranda. */
  let actions;
  if (isTransfer) {
    actions = isMasuk
      ? '<button class="rc__btn rc__btn--gold" type="button" data-act="beranda">Kembali ke Beranda</button>'
      : '<button class="rc__btn rc__btn--gold" type="button" data-act="transfer-lagi">Transfer Lagi</button>' +
        '<button class="rc__btn rc__btn--outline" type="button" data-act="beranda">Kembali ke Beranda</button>';
  } else {
    actions = `<button class="rc__btn rc__btn--gold" type="button" data-act="again">${isTopup ? "Top Up Lagi" : "Beli Lagi"}</button>`;
  }

  return `
    <div class="rc__head">
      <button class="rc__back" type="button" aria-label="Kembali">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
      </button>
      <span class="rc__head-title">Struk Transaksi</span>
    </div>

    <div class="rc__scroll">
      <div class="rc__hero">
        <span class="rc__cat" style="background:${cat.color}22;color:${cat.color}">${bigIcon(cat.icon)}</span>
        <p class="rc__when">${longWhen}</p>
        <p class="rc__trxid">${maskId(tx.id)}</p>
      </div>

      <div class="rc__status ${st.cls}">
        <span class="rc__status-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${st.icon}</svg></span>
        ${st.text}
      </div>

      <p class="rc__desc">${desc}</p>

      ${totalBox}

      <div class="rc__card">
        <div class="rc__row"><span>Metode Pembayaran</span><span>${tx.method}</span></div>
      </div>

      ${sections}
    </div>

    <div class="rc__actions">${actions}</div>`;
}

function openReceipt(id) {
  try {
    const tx = TX.find((t) => t.id === id);
    if (!tx) return;
    let html;
    try {
      html = renderReceipt(tx);
    } catch (err) {
      console.error("[riwayat] gagal render struk:", err);
      html = receiptFallback();
    }
    receiptTxId = id;
    receiptEl.innerHTML = html;
    receiptEl.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => receiptEl.classList.add("is-open"));
    document.documentElement.style.overflow = "hidden";
    if (!receiptOpen) history.pushState({ rc: id }, "");
    receiptOpen = true;
  } catch (err) {
    console.error("[riwayat] gagal membuka struk:", err);
  }
}

function receiptFallback() {
  return `
    <div class="rc__head">
      <button class="rc__back" type="button" aria-label="Kembali">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
      </button>
      <span class="rc__head-title">Struk Transaksi</span>
    </div>
    <div class="rc__scroll">
      <p class="rc__desc" style="text-align:center;padding:32px 8px">
        Detail struk untuk transaksi ini belum bisa ditampilkan.<br>Silakan coba lagi nanti.
      </p>
    </div>`;
}

function closeReceipt(fromPop) {
  if (!receiptOpen) return;
  receiptOpen = false;
  receiptEl.classList.remove("is-open");
  receiptEl.setAttribute("aria-hidden", "true");
  document.documentElement.style.overflow = "";
  if (!fromPop && history.state && history.state.rc) history.back();
}

receiptEl.addEventListener("click", (e) => {
  try {
    if (e.target.closest(".rc__back")) {
      closeReceipt();
      return;
    }
    const head = e.target.closest(".acc__head");
    if (head) {
      head.parentElement.classList.toggle("is-open");
      return;
    }
    const act = e.target.closest("[data-act]");
    if (act) {
      /* riwayat.html hidup di /pages/, jadi Beranda = "../index.html" dan
         halaman Transfer Antar Member = tetangga sedirektori. */
      if (act.dataset.act === "transfer-lagi") { window.location.href = "transfer-member.html"; return; }
      if (act.dataset.act === "beranda") { window.location.href = "../index.html"; return; }
      console.log("Aksi struk:", act.dataset.act, "·", receiptTxId);
    }
  } catch (err) {
    console.error("[riwayat] klik struk:", err);
  }
});

window.addEventListener("popstate", () => {
  if (receiptOpen) closeReceipt(true);
});

/* ---- Bottom navigation ------------------------------------- */
/* Indikator + navigasi tab ditangani bottomnav.js (dipakai bersama 4 halaman). */

/* ---- Init ------------------------------------------------- */

function init() {
  try {
    if (window.I18N) window.I18N.apply(document);
    // Render SEGERA (DATA.status masih "memuat" di titik ini -> menampilkan
    // spinner #loadingState), lalu render ULANG begitu data pertama datang
    // (atau gagal/kosong) lewat DATA.ready — lihat catatan "KENAPA ASYNC"
    // di data.js. DATA.ready SELALU resolve, tidak pernah reject.
    renderList();
    const ready = DATA.ready && typeof DATA.ready.then === "function" ? DATA.ready : Promise.resolve();
    ready.then(() => {
      try { renderSummary(); renderList(); }
      catch (err) { console.error("[riwayat] render setelah data siap gagal:", err); }
    });
  } catch (err) {
    console.error("[riwayat] init/render gagal:", err);
  }

  retryBtn.addEventListener("click", () => {
    try {
      if (typeof DATA.muatUlang !== "function") return;
      renderList(); // langsung perlihatkan spinner (DATA.status jadi "memuat")
      DATA.muatUlang().then(() => {
        renderSummary();
        renderList();
      });
    } catch (err) { console.error("[riwayat] Coba Lagi gagal:", err); }
  });

  loadMoreBtn.addEventListener("click", () => {
    try {
      if (typeof DATA.muatLagi !== "function") return;
      const p = DATA.muatLagi();
      syncLoadMore(); // perlihatkan "Memuat…" segera, sebelum promise selesai
      p.then(renderList);
    } catch (err) { console.error("[riwayat] Muat Transaksi Lainnya gagal:", err); }
  });

  // renderList di-debounce: input/klik beruntun sangat cepat -> 1 render saja
  const renderSoon = debounce(renderList, 180);

  searchInput.addEventListener("input", (e) => {
    try {
      state.query = e.target.value;
      renderSoon();
      if (e.target.value) twStop();
    } catch (err) { console.error("[riwayat] Input pencarian gagal:", err); }
  });
  searchInput.addEventListener("focus", twStop);
  searchInput.addEventListener("blur", () => {
    if (!searchInput.value) twStart();
  });
  twStart();

  filterChips.addEventListener("click", (e) => {
    try {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      filterChips.querySelectorAll(".chip").forEach((c) => c.classList.toggle("is-active", c === chip));
      state.filter = chip.dataset.filter || "all";
      renderSoon();
    } catch (err) {
      console.error("[riwayat] Klik filter chip gagal:", err);
    }
  });

  sortBtn.addEventListener("click", () => {
    try {
      state.sort = state.sort === "desc" ? "asc" : "desc";
      sortBtn.classList.toggle("is-asc", state.sort === "asc");
      sortBtn.setAttribute("aria-label", state.sort === "asc" ? "Urutkan: terlama dulu" : "Urutkan: terbaru dulu");
      renderSoon();
    } catch (err) {
      console.error("[riwayat] Klik urutkan gagal:", err);
    }
  });

  document.getElementById("summaryCard").addEventListener("click", () => {
    window.location.href = "statistik.html";
  });

  pasangBackFisik();
}

/* ---- Tombol Back fisik Android ------------------------------
   Header TIDAK PUNYA tombol back lagi (keputusan produk — member
   berpindah halaman hanya lewat bottom nav), jadi tombol back FISIK
   di Android perlu diarahkan secara eksplisit, bukan dibiarkan jatuh
   ke perilaku bawaan Capacitor (yang bisa KELUAR APLIKASI kalau
   riwayat.html kebetulan tidak punya riwayat WebView untuk dikembalikan).

   Kalau struk detail sedang terbuka -> tutup dulu struknya (tidak
   pindah halaman), sama seperti menekan tombol back di struk. Kalau
   tidak ada yang terbuka -> selalu ke Beranda, apa pun jalur member
   masuk ke halaman ini (quick action, tab Transaksi, atau bottom nav
   dari halaman lain). */
function pasangBackFisik() {
  try {
    const Cap = window.Capacitor;
    const App = Cap && Cap.Plugins && Cap.Plugins.App;
    if (!App || typeof App.addListener !== "function") return;
    App.addListener("backButton", () => {
      try {
        if (receiptOpen) { closeReceipt(); return; }
        window.location.href = "../index.html";
      } catch (err) {
        console.error("[riwayat] backButton gagal:", err);
        window.location.href = "../index.html";
      }
    });
  } catch (err) {
    console.warn("[riwayat] App plugin tidak bisa dipasang untuk backButton:", err);
  }
}

document.addEventListener("DOMContentLoaded", init);
