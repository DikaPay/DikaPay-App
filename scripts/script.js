/* ===========================================================================
   DikaPay — script.js
   Logika halaman beranda. Semua data di sini masih DUMMY / hardcoded.
   Nanti diganti pemanggilan ke backend DikaPay (lihat CLAUDE.md, fase 2).
   =========================================================================== */

"use strict";

const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---- State sementara (dummy) --------------------------------------- */

/* Saldo dibaca dari localStorage (kunci "dikapay:balance") kalau ada —
   transfer-member.js menguranginya saat transfer ke member lain berhasil.
   Default 125000 HARUS sama dengan DEFAULT_BALANCE di transfer-member.js;
   kalau salah satu diubah, ubah juga yang lain. */
function readBalance() {
  try {
    const raw = localStorage.getItem("dikapay:balance");
    // Key belum pernah ditulis -> ini akun baru, pakai saldo dummy awal.
    // Beda dengan raw === "0" (saldo pernah ada, sekarang habis terpakai) —
    // Number(null) diam-diam jadi 0 kalau dicek lewat isFinite/>=0 saja,
    // jadi null HARUS ditangani eksplisit sebelum konversi ke Number.
    if (raw === null) return 125000;
    const v = Number(raw);
    if (isFinite(v) && v >= 0) return v;
  } catch (e) {}
  return 125000;
}

const state = {
  balance: readBalance(),
  balanceVisible: true,
  hasNewNotif: true,
};

/* ---- Data ------------------------------------------------------- */

const MENU_ITEMS = [
  { id: "pulsa",    label: "Pulsa",          icon: "signal" },
  { id: "data",     label: "Paket Data",     icon: "wifi" },
  { id: "listrik",  label: "Listrik",        icon: "bolt" },
  { id: "pln-bill", label: "PLN Pascabayar", icon: "receipt" },
  { id: "pdam",     label: "PDAM",           icon: "drop" },
  { id: "bpjs",     label: "BPJS Kesehatan", icon: "shield" },
  /* Games sengaja tampil DI SINI dan juga di sheet "Semua Layanan" —
     duplikat yang disengaja: grid beranda 4 kolom butuh kelipatan 4 biar
     baris terakhir tidak menyisakan slot janggal, dan Games termasuk
     kategori prabayar yang sering dipakai. Kalau menambah/menghapus item
     di sini, JAGA jumlahnya tetap kelipatan 4 (termasuk "Lainnya"). */
  { id: "games",    label: "Games",          icon: "gem" },
  { id: "lainnya",  label: "Lainnya",        icon: "grid" },
];

/* Semua layanan — ditampilkan di bottom sheet saat menu "Lainnya" ditekan */
const ALL_SERVICES = [
  { id: "pulsa",      label: "Pulsa",          icon: "signal" },
  { id: "data",       label: "Paket Data",     icon: "wifi" },
  { id: "listrik",    label: "Listrik",        icon: "bolt" },
  { id: "pln-bill",   label: "PLN Pascabayar", icon: "receipt" },
  { id: "pdam",       label: "PDAM",           icon: "drop" },
  { id: "bpjs",       label: "BPJS Kesehatan", icon: "shield" },
  { id: "streaming",  label: "Streaming",      icon: "play" },
  { id: "games",      label: "Games",          icon: "gem" },
  { id: "voucher",     label: "Voucher",            icon: "ticket" },
  { id: "voucher-act", label: "Aktivasi Voucher",   icon: "ticket-check" },
  { id: "gas-prabayar", label: "Gas Prabayar",      icon: "flame" },
  { id: "masa-aktif",  label: "Masa Aktif",         icon: "calendar-clock" },
  { id: "perdana",     label: "Aktivasi Perdana",   icon: "sim" },
  { id: "sms-telpon",  label: "Paket SMS & Telpon", icon: "chat-phone" },
  { id: "gas",         label: "Gas Negara",         icon: "gas" },
  { id: "emoney",      label: "E-Money & Wallet",   icon: "card" },
  /* --- Pascabayar (tagihan; nominal diisi manual, tanpa inquiry) --- */
  { id: "hp-pasca",       label: "HP Pascabayar",       icon: "sim" },
  { id: "internet-pasca", label: "Internet Pascabayar", icon: "wifi" },
  { id: "tv-pasca",       label: "TV Pascabayar",       icon: "tv" },
  { id: "bpjs-tk",        label: "BPJS Ketenagakerjaan", icon: "shield" },
  { id: "multifinance",   label: "Multifinance",        icon: "receipt" },
  { id: "pbb",            label: "PBB",                 icon: "building" },
  /* --- Sub-brand pascabayar operator (kategori resmi Digiflazz) ---
     Kelimanya JUGA bisa dicapai lewat hp-pasca.html, yang mendeteksi
     sub-brand otomatis dari prefix nomor. Halaman sendiri ada supaya
     struktur kategori 1:1 dengan Digiflazz; hp-pasca tetap jadi jalur
     cepat bagi member yang tidak hafal nama sub-brand-nya. Duplikasi
     jalur ini DISENGAJA — lihat CLAUDE.md. */
  { id: "tsel-omni",      label: "Telkomsel Omni",      icon: "sim" },
  { id: "isat-only4u",    label: "Indosat Only4u",      icon: "sim" },
  { id: "tri-cuanmax",    label: "Tri CuanMax",         icon: "sim" },
  { id: "xl-cuanku",      label: "XL Axis Cuanku",      icon: "sim" },
  { id: "byu",            label: "by.U",                icon: "sim" },
  /* E-Money PASCABAYAR — produk BERBEDA dari "E-Money & Wallet" di atas
     (itu top up prabayar, ini tagihan). Jangan digabung. */
  { id: "emoney-pasca",   label: "E-Money Pascabayar",  icon: "card" },
];

/* Ticker — KHUSUS info keamanan & tips. JANGAN diisi promo / riwayat transaksi. */
const SECURITY_TIPS = [
  "Jangan pernah bagikan PIN DikaPay ke siapapun, termasuk pihak yang mengaku dari DikaPay",
  "Akun Anda dilindungi enkripsi standar keamanan perbankan",
  "Aktifkan verifikasi 2 langkah untuk keamanan ekstra",
  "Selalu periksa nomor tujuan sebelum melakukan transaksi",
  "DikaPay tidak pernah meminta PIN atau OTP lewat telepon/chat",
];

/* Carousel promo — banner branding DikaPay (tambah/kurangi di sini).
   DUA BENTUK SLIDE, dibedakan lewat field `type` (infrastruktur `ikon` dan
   slide teks TETAP ADA di slideHtml()/IKON_BANNER di bawah walau tidak
   ada satu pun entri yang memakainya sekarang — lihat catatan penghapusan):
     - type: "image"  -> banner GAMBAR (assets/images/…).
                         Rasio TIDAK harus persis sama dengan --promo-ratio
                         di style.css — `.promo-slide__img` sudah
                         `object-fit: cover`, jadi banner dengan rasio beda
                         ikut terpotong rapi mengisi slot tanpa gepeng. Yang
                         WAJIB sama hanya TINGGI SLOT-nya sendiri
                         (--promo-ratio), supaya carousel tidak "melompat"
                         saat bergeser.
     - tanpa `type`   -> slide TEKS (theme + tag + title + sub) yang
                         digambar CSS, tanpa aset gambar.
   Path gambar RELATIF dari index.html (root) -> "assets/…", TANPA "../"
   (lihat konvensi path lintas-folder di CLAUDE.md).

   ============ 3 SLIDE BER-ANIMASI DIHAPUS (22 Sep 2026) =================
   Keputusan produk: carousel sekarang HANYA 3 banner GAMBAR STATIS
   (promo-banner-3/4/5.png) — tanpa animasi kontinu apa pun di baliknya.
   Yang dihapus SENGAJA 3, bukan asal pilih:
     - Slide teks "Fitur Baru" (theme gold) — punya `.promo-slide__shape`
       s1/s2/s3 yang berputar/melayang INFINITE (drift3/spinSlow/drift2,
       lihat style.css) — animasi kontinu, bukan cuma transisi masuk.
     - promo-banner-1.png & promo-banner-2.png — punya overlay `ikon` yang
       melayang INFINITE lewat @keyframes promoIkonFloat.
   promo-banner-3/4/5.png TIDAK PERNAH punya `ikon` (lihat riwayat git/
   komentar lama: sengaja tanpa ikon karena koordinatnya belum dipindai)
   dan slide teks/`ikon` tidak dipakai gambar manapun lagi — jadi
   urutan & isi 3 banner yang tersisa TIDAK berubah sama sekali, cuma
   3 ENTRI di array ini yang hilang. `slideHtml()` (di bawah) dan
   `IKON_BANNER` SENGAJA TIDAK dihapus — itu kapabilitas umum carousel
   (dot, fetchpriority slide pertama, dua jalur render) yang tetap valid
   kalau nanti ada banner baru yang butuh ikon/teks lagi, bukan sampah
   khusus 3 banner yang dihapus. Dots (`renderCarousel()`) sudah dihitung
   dari `INFO_ITEMS.length` secara dinamis, jadi otomatis jadi 3 titik
   tanpa perlu diubah manual. */
const INFO_ITEMS = [
  {
    type: "image",
    src: "assets/images/promo-banner-3.png",
    alt: "Fitur Atur Margin — kelola margin keuntunganmu per kategori produk",
  },
  {
    type: "image",
    src: "assets/images/promo-banner-4.png",
    alt: "Isi pulsa lebih mudah — semua operator, satu aplikasi",
  },
  {
    type: "image",
    src: "assets/images/promo-banner-5.png",
    alt: "Kemudahan dalam satu genggaman — semua kebutuhan PPOB, satu aplikasi",
  },
];

/* Glyph untuk ikon overlay banner. Sengaja bentuk dasar bertema PPOB
   (sinyal, petir/listrik, chat, HP, dompet, bintang) — tidak meniru apa pun
   di dalam gambar, cuma menyatu dengan gayanya. */
const IKON_BANNER = {
  sinyal:  '<path d="M4 20h.01M9 20v-5M14.5 20V9M20 20V4"/>',
  petir:   '<path d="M13 2 4 14h6l-1 8 9-12h-6z"/>',
  chat:    '<path d="M21 11.5A7.5 7.5 0 0 1 6.5 15L3 16l1-3.5A7.5 7.5 0 1 1 21 11.5z"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01"/>',
  hp:      '<rect x="6" y="2.5" width="12" height="19" rx="2.6"/><path d="M10.5 18.5h3"/>',
  dompet:  '<path d="M20 11V8H6a2 2 0 0 1 0-4h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/>',
  bintang: '<path d="M12 3.2 14 9l5.8 2-5.8 2-2 5.8L10 13l-5.8-2L10 9z"/>',
};

const ICONS = {
  signal:  '<path d="M2 20h.01M7 20v-4M12 20v-8M17 20V8M22 20V4"/>',
  wifi:    '<path d="M5 12.55a11 11 0 0 1 14 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><path d="M12 20h.01"/>',
  bolt:    '<path d="M13 2 3 14h7l-1 8 10-12h-7z"/>',
  receipt: '<path d="M4 2h16v20l-3-2-2 2-3-2-3 2-2-2-3 2z"/><path d="M8 7h8M8 11h8M8 15h5"/>',
  drop:    '<path d="M12 2.5 6 10a6 6 0 1 0 12 0z"/>',
  shield:  '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  wallet:  '<path d="M20 12V8H6a2 2 0 0 1 0-4h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/>',
  gamepad: '<path d="M6 12h4M8 10v4M15 11h.01M18 13h.01"/><rect x="2" y="6" width="20" height="12" rx="4"/>',
  grid:    '<rect x="3" y="3" width="7" height="7" rx="1.6"/><rect x="14" y="3" width="7" height="7" rx="1.6"/><rect x="3" y="14" width="7" height="7" rx="1.6"/><rect x="14" y="14" width="7" height="7" rx="1.6"/>',
  play:    '<path d="M20 12 6 20V4z"/>',
  building:'<rect x="4" y="3" width="16" height="18" rx="1.6"/><path d="M9 8h.01M15 8h.01M9 12h.01M15 12h.01M9.5 21v-4h5v4"/>',
  /* Top Up Game — permata/berlian (mewakili diamond/UC/genesis in-game),
     outline konsisten dengan ikon grid lain. Beda dari "gamepad" (Voucher Game). */
  gem:     '<path d="M6 3h12l3 6-9 12L3 9z"/><path d="M3 9h18"/><path d="m8.5 9 1-6M8.5 9 12 21M15.5 9l-1-6M15.5 9 12 21"/>',
  ticket:  '<path d="M3 8.6V6.5a1.5 1.5 0 0 1 1.5-1.5h15A1.5 1.5 0 0 1 21 6.5v2.1a2.6 2.6 0 0 0 0 5.2v2.1a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 15.9v-2.1a2.6 2.6 0 0 0 0-5.2z"/><path d="M15 5.6v1.8M15 11.1v1.8M15 16.6v1.8"/>',
  "ticket-check": '<path d="M3 8.6V6.5a1.5 1.5 0 0 1 1.5-1.5h15A1.5 1.5 0 0 1 21 6.5v2.1a2.6 2.6 0 0 0 0 5.2v2.1a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 15.9v-2.1a2.6 2.6 0 0 0 0-5.2z"/><path d="m8.6 11.8 2.2 2.2 4.6-4.6"/>',
  tv:      '<rect x="2.5" y="7" width="19" height="13" rx="2.6"/><path d="m8 3 4 4 4-4"/>',
  "calendar-clock": '<rect x="3" y="5" width="18" height="16" rx="2.6"/><path d="M8 3v4M16 3v4M3 10h18"/><path d="M12 13.2v3l2 1.4"/>',
  sim:     '<path d="M6.5 3h6.7L19 8.4V20a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 20V4.5A1.5 1.5 0 0 1 6.5 3z"/><rect x="8.4" y="11" width="7.2" height="7" rx="1.4"/><path d="M12 11v7M8.4 14.5h7.2"/>',
  "chat-phone": '<path d="M20.5 11.6a7.6 7.6 0 0 1-11 6.8L4 20l1.5-5.2A7.6 7.6 0 1 1 20.5 11.6z"/><path d="M9.6 9.3c.3-.3.8-.2 1 .1l.7 1c.2.3.2.6-.1.9l-.4.4c.5.9 1.2 1.6 2.1 2.1l.4-.4c.3-.3.6-.3.9-.1l1 .7c.4.2.4.7.1 1l-.5.5c-.4.4-1 .5-1.5.3a8.8 8.8 0 0 1-4.5-4.5c-.2-.5-.1-1.1.3-1.5z"/>',
  gas:     '<path d="M9 6h6a3 3 0 0 1 3 3v10.5A1.5 1.5 0 0 1 16.5 21h-9A1.5 1.5 0 0 1 6 19.5V9a3 3 0 0 1 3-3z"/><path d="M10 6V4.5A1.5 1.5 0 0 1 11.5 3h1A1.5 1.5 0 0 1 14 4.5V6"/><path d="M6 11h12"/>',
  /* Gas Prabayar — nyala api (token gas PGN). Beda dari "gas" (tabung,
     dipakai Gas Negara pascabayar). */
  flame:   '<path d="M12 3s5 4.2 5 9a5 5 0 0 1-10 0c0-1.4.5-2.8 1.4-4"/><path d="M12 15a2.2 2.2 0 0 0 2.2-2.2c0-1.6-2.2-3.9-2.2-3.9s-2.2 2.3-2.2 3.9A2.2 2.2 0 0 0 12 15z"/>',
  card:    '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 9.5h20"/><rect x="5.5" y="12.6" width="4.6" height="3.4" rx="1"/><path d="M14.5 15.6h4"/>',
};

/* ---- Helper --------------------------------------------------- */

/* i18n: pakai kamus dari translations.js kalau ada, kalau tidak fallback ke teks asli */
/* I18N.t() mengembalikan KUNCINYA SENDIRI kalau tidak ketemu, jadi kunci
   yang lupa ditambahkan akan bocor ke layar sebagai teks mentah
   ("svc.games" pernah tampil begitu di grid Semua Layanan). `fallback`
   di sini dulu tidak pernah terpakai karena t() tidak pernah undefined —
   sekarang dipakai kalau hasilnya sama persis dengan kuncinya. */
function svcT(key, fallback) {
  if (!window.I18N) return fallback;
  var teks = window.I18N.t(key);
  if (teks === key) {
    console.warn("script: kunci i18n belum ada:", key);
    return fallback != null ? fallback : key;
  }
  return teks;
}
function svcLabel(id, fallback) {
  return svcT("svc." + id, fallback);
}

function formatRupiah(value) {
  return "Rp" + Math.round(value).toLocaleString("id-ID");
}

function iconSvg(name) {
  return (
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || "") + "</svg>"
  );
}

/* ---- Kartu saldo: count-up + toggle fade ------------------- */

const balanceAmount = document.getElementById("balanceAmount");
const balanceToggle = document.getElementById("balanceToggle");

function animateCountUp(target, duration) {
  if (REDUCED_MOTION) {
    balanceAmount.textContent = formatRupiah(target);
    return;
  }
  const start = performance.now();
  (function frame(now) {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
    balanceAmount.textContent = formatRupiah(target * eased);
    if (t < 1) requestAnimationFrame(frame);
  })(start);
}

function fadeBalanceTo(text) {
  balanceAmount.classList.add("is-fading");
  window.setTimeout(() => {
    balanceAmount.textContent = text;
    balanceAmount.classList.remove("is-fading");
  }, 200);
}

/* ---- Saldo basi sesudah transaksi (bfcache) -------------------------
   Pembelian produk terjadi di HALAMAN LAIN (pages/pulsa.html dst).
   payment-flow.js menulis saldo baru dari server ke `dikapay:balance`,
   lalu member kembali ke sini — dan Beranda dipulihkan dari bfcache:
   DOM lama utuh, `<script>` TIDAK dijalankan ulang, jadi `state.balance`
   dan angka di layar masih nilai SEBELUM transaksi. Gejalanya persis
   "saldo beranda salah setelah transaksi".

   member-sync.js memang akhirnya membetulkannya, tapi lewat JARINGAN
   (polling 60 detik / visibilitychange) — jadi saat sinyal jelek atau
   offline, angka yang salah itu bertahan di layar. Padahal nilai yang
   benar SUDAH ada di localStorage, tanpa perlu jaringan sama sekali.

   Alasan yang sama dengan renderAvatar()/renderNotif() di pageshow, dan
   dengan margin basi di produk-ui.js: apa pun yang bisa berubah di
   halaman lain WAJIB dibaca ulang saat Beranda tampil lagi. */
function segarkanSaldo() {
  try {
    const baru = readBalance();
    if (baru === state.balance) return;          /* tidak ada yang berubah */
    state.balance = baru;
    /* Kalau saldo sedang disembunyikan member, JANGAN diam-diam
       menampilkannya lagi — cukup perbarui nilai di balik topengnya. */
    if (!state.balanceVisible) return;
    animateCountUp(baru, 700);
  } catch (e) {
    console.error("[home] gagal menyegarkan saldo:", e);
  }
}

function onToggleBalance() {
  state.balanceVisible = !state.balanceVisible;
  balanceToggle.classList.toggle("is-hidden", !state.balanceVisible);
  balanceToggle.setAttribute("aria-pressed", String(!state.balanceVisible));
  balanceToggle.setAttribute("aria-label", state.balanceVisible ? "Sembunyikan saldo" : "Tampilkan saldo");
  fadeBalanceTo(state.balanceVisible ? formatRupiah(state.balance) : "Rp••••••");
}

/* ---- Menu grid + ripple ---------------------------------- */

function renderMenu() {
  const grid = document.getElementById("menuGrid");
  grid.innerHTML = MENU_ITEMS.map((item, i) => {
    const delay = REDUCED_MOTION ? 0 : 0.2 + i * 0.04;
    return `
      <button class="menu-item" type="button" data-menu="${item.id}" style="animation-delay:${delay}s">
        <span class="menu-item__icon">${iconSvg(item.icon)}</span>
        <span class="menu-item__label">${svcLabel(item.id, item.label)}</span>
      </button>`;
  }).join("");
}

function spawnRipple(event) {
  const btn = event.target.closest(".menu-item");
  if (!btn || REDUCED_MOTION) return;
  const box = btn.querySelector(".menu-item__icon");
  const rect = box.getBoundingClientRect();
  const size = rect.width;
  const ripple = document.createElement("span");
  ripple.className = "ripple";
  ripple.style.width = ripple.style.height = size + "px";
  ripple.style.left = (event.clientX - rect.left - size / 2) + "px";
  ripple.style.top = (event.clientY - rect.top - size / 2) + "px";
  box.appendChild(ripple);
  ripple.addEventListener("animationend", () => ripple.remove());
}

/* ---- Aksi (quick action, hero CTA, menu, tab) ------------ */

/* Rute yang sudah punya halaman. Sisanya belum tersedia (console.log). */
const ROUTES = {
  history: "pages/riwayat.html",
  /* Layanan yang sudah punya halaman produk sendiri.
     Grid Layanan beranda mengirim "menu:<id>", sheet Semua Layanan "svc:<id>". */
  "menu:pulsa": "pages/pulsa.html",
  "svc:pulsa": "pages/pulsa.html",
  "menu:data": "pages/paket-data.html",
  "svc:data": "pages/paket-data.html",
  "menu:listrik": "pages/listrik.html",
  "svc:listrik": "pages/listrik.html",
  "menu:masa-aktif": "pages/masa-aktif.html",
  "svc:masa-aktif": "pages/masa-aktif.html",
  "menu:perdana": "pages/perdana.html",
  "svc:perdana": "pages/perdana.html",
  "menu:sms-telpon": "pages/sms-telpon.html",
  "svc:sms-telpon": "pages/sms-telpon.html",
  "menu:games": "pages/games.html",
  "svc:games": "pages/games.html",
  "menu:streaming": "pages/streaming.html",
  "svc:streaming": "pages/streaming.html",
  "menu:gas-prabayar": "pages/gas-prabayar.html",
  "svc:gas-prabayar": "pages/gas-prabayar.html",
  "menu:voucher": "pages/voucher.html",
  "svc:voucher": "pages/voucher.html",
  "menu:voucher-act": "pages/voucher-act.html",
  "svc:voucher-act": "pages/voucher-act.html",
  "menu:emoney": "pages/emoney.html",
  "svc:emoney": "pages/emoney.html",
  "menu:pln-bill": "pages/pln-bill.html",
  "svc:pln-bill": "pages/pln-bill.html",
  "menu:pdam": "pages/pdam.html",
  "svc:pdam": "pages/pdam.html",
  "menu:bpjs": "pages/bpjs.html",
  "svc:bpjs": "pages/bpjs.html",
  "menu:gas": "pages/gas.html",
  "svc:gas": "pages/gas.html",
  "menu:hp-pasca": "pages/hp-pasca.html",
  "svc:hp-pasca": "pages/hp-pasca.html",
  "menu:internet-pasca": "pages/internet-pasca.html",
  "svc:internet-pasca": "pages/internet-pasca.html",
  "menu:tv-pasca": "pages/tv-pasca.html",
  "svc:tv-pasca": "pages/tv-pasca.html",
  "menu:bpjs-tk": "pages/bpjs-tk.html",
  "svc:bpjs-tk": "pages/bpjs-tk.html",
  "menu:multifinance": "pages/multifinance.html",
  "svc:multifinance": "pages/multifinance.html",
  "menu:pbb": "pages/pbb.html",
  "svc:pbb": "pages/pbb.html",
  "menu:tsel-omni": "pages/tsel-omni.html",
  "svc:tsel-omni": "pages/tsel-omni.html",
  "menu:isat-only4u": "pages/isat-only4u.html",
  "svc:isat-only4u": "pages/isat-only4u.html",
  "menu:tri-cuanmax": "pages/tri-cuanmax.html",
  "svc:tri-cuanmax": "pages/tri-cuanmax.html",
  "menu:xl-cuanku": "pages/xl-cuanku.html",
  "svc:xl-cuanku": "pages/xl-cuanku.html",
  "menu:byu": "pages/byu.html",
  "svc:byu": "pages/byu.html",
  "menu:emoney-pasca": "pages/emoney-pasca.html",
  "svc:emoney-pasca": "pages/emoney-pasca.html",
  "tab:transaction": "pages/riwayat.html",
  "tab:margin": "pages/margin.html",
  "tab:account": "pages/akun.html",
};

function handleAction(id) {
  if (ROUTES[id]) {
    window.location.href = ROUTES[id];
    return;
  }
  // TODO: navigasi / buka halaman terkait lainnya
  console.log("Aksi:", id);
}

function flashClass(el, cls, ms) {
  el.classList.remove(cls);
  void el.offsetWidth; // restart animasi walau di-tap beruntun
  el.classList.add(cls);
  window.clearTimeout(el._flashT);
  el._flashT = window.setTimeout(() => el.classList.remove(cls), ms);
}

/* ---- Bottom sheet "Semua Layanan" -------------------- */

const svc = { ov: null, sh: null, open: false };

function buildServicesSheet() {
  const ov = document.createElement("div");
  ov.className = "paysheet-overlay";
  ov.innerHTML = `
    <div class="paysheet paysheet--svc" role="dialog" aria-modal="true" aria-label="Semua Layanan">
      <span class="paysheet__handle" aria-hidden="true"></span>
      <div class="svc-head">
        <h2 class="svc-title">${svcT("home.allservices", "Semua Layanan")}</h2>
        <button class="svc-close" type="button" data-close aria-label="Tutup">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>
        </button>
      </div>
      <div class="svc-grid">
        ${ALL_SERVICES.map((s, i) => `
          <button class="svc-item" type="button" data-svc="${s.id}" style="transition-delay:${REDUCED_MOTION ? 0 : 60 + i * 28}ms">
            <span class="svc-item__ic">${iconSvg(s.icon)}</span>
            <span class="svc-item__label">${svcLabel(s.id, s.label)}</span>
          </button>`).join("")}
      </div>
    </div>`;
  document.body.appendChild(ov);

  const sh = ov.querySelector(".paysheet");
  ov.addEventListener("click", (e) => { if (e.target === ov) closeServices(); });
  ov.querySelector("[data-close]").addEventListener("click", closeServices);
  ov.querySelector(".svc-grid").addEventListener("click", (e) => {
    const it = e.target.closest(".svc-item");
    if (!it) return;
    const svcId = it.dataset.svc;
    closeServices();
    const soon = SVC_COMING_SOON[svcId];
    if (soon) {
      // tunggu sheet layanan selesai menutup dulu supaya tidak dua sheet menumpuk
      window.setTimeout(() => {
        try { if (window.DikaComingSoon) window.DikaComingSoon(soon); }
        catch (err) { console.error("coming soon:", err); }
      }, REDUCED_MOTION ? 0 : 240);
      return;
    }
    handleAction("svc:" + svcId);
  });

  /* Swipe-down dari handle & header */
  let startY = 0, dy = 0, dragging = false;
  const grab = [ov.querySelector(".paysheet__handle"), ov.querySelector(".svc-head")];
  const start = (e) => { startY = e.touches[0].clientY; dy = 0; dragging = true; sh.style.transition = "none"; };
  const move = (e) => {
    if (!dragging) return;
    dy = Math.max(e.touches[0].clientY - startY, 0);
    sh.style.transform = "translateY(" + dy + "px)";
    ov.style.opacity = String(Math.max(1 - dy / 380, 0));
  };
  const end = () => {
    if (!dragging) return;
    dragging = false;
    sh.style.transition = "";
    if (dy > 90) closeServices();
    else { sh.style.transform = ""; ov.style.opacity = ""; }
  };
  const cancel = () => {
    if (!dragging) return;
    dragging = false;
    dy = 0;
    sh.style.transition = "";
    sh.style.transform = "";
    ov.style.opacity = "";
  };
  grab.forEach((el) => {
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: true });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", cancel, { passive: true });
  });

  return { ov, sh };
}

function openServices() {
  if (!svc.ov) {
    const built = buildServicesSheet();
    svc.ov = built.ov;
    svc.sh = built.sh;
  }
  void svc.ov.offsetWidth;
  svc.ov.classList.add("is-open");
  document.documentElement.style.overflow = "hidden";
  svc.open = true;
}

function closeServices() {
  if (!svc.open) return;
  svc.open = false;
  svc.ov.classList.remove("is-open");
  svc.sh.style.transform = "";
  svc.sh.style.transition = "";
  svc.ov.style.opacity = "";
  document.documentElement.style.overflow = "";
}

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeServices();
});

/* ---- Ticker keamanan (crossfade teks otomatis) --------- */

const ticker = { el: document.getElementById("tickerText"), index: 0, timer: null };

function renderTicker() {
  ticker.el.textContent = SECURITY_TIPS[0];
}

function startTicker() {
  window.clearInterval(ticker.timer);
  if (SECURITY_TIPS.length <= 1 || REDUCED_MOTION) return;
  ticker.timer = window.setInterval(() => {
    ticker.el.classList.add("is-out");
    window.setTimeout(() => {
      ticker.index = (ticker.index + 1) % SECURITY_TIPS.length;
      ticker.el.textContent = SECURITY_TIPS[ticker.index];
      ticker.el.classList.remove("is-out");
    }, 320);
  }, 5000);
}

/* ---- Carousel promo (auto-slide + swipe) --------------- */

const carousel = {
  track: document.getElementById("infoTrack"),
  dots: document.getElementById("infoDots"),
  index: 0,
  timer: null,
  interval: 4000,
};

/* Slide GAMBAR vs slide TEKS — lihat catatan bentuk data di INFO_ITEMS.
   Gambar pertama dimuat eager (langsung terlihat saat beranda dibuka),
   sisanya lazy supaya tidak ikut menahan first paint. */
function slideHtml(info, i) {
  if (info.type === "image") {
    /* DUA lapis span per ikon, dan itu disengaja: yang LUAR memegang
       posisi (translate -50% supaya koordinat = titik TENGAH ikon), yang
       DALAM memegang animasi. Kalau digabung jadi satu elemen, `transform`
       animasi akan menimpa `transform` penengah itu dan ikonnya melompat
       ke kanan-bawah begitu animasi mulai. */
    const ikon = (info.ikon || []).map((k) => {
      const glyph = IKON_BANNER[k.g] || "";
      return `<span class="promo-ikon promo-ikon--${k.t === "emas" ? "emas" : "putih"}" aria-hidden="true" ` +
        `style="--ix:${k.x}%;--iy:${k.y}%;--iw:${k.w}%">` +
        `<span class="promo-ikon__in" style="--id:${k.d}s;--idl:${k.dl}s">` +
        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ` +
        `stroke-linecap="round" stroke-linejoin="round">${glyph}</svg></span></span>`;
    }).join("");
    return `
    <div class="carousel__slide">
      <div class="promo-slide promo-slide--img">
        <img class="promo-slide__img" src="${info.src}" alt="${info.alt || ""}"
             decoding="async" ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} />
        ${ikon}
      </div>
    </div>`;
  }
  return `
    <div class="carousel__slide">
      <div class="promo-slide promo-slide--${info.theme}">
        <span class="promo-slide__shape s1" aria-hidden="true"></span>
        <span class="promo-slide__shape s2" aria-hidden="true"></span>
        <span class="promo-slide__shape s3" aria-hidden="true"></span>
        <div class="promo-slide__body">
          <span class="promo-slide__tag">${info.tag}</span>
          <strong>${info.title}</strong>
          <span class="promo-slide__sub">${info.sub}</span>
        </div>
      </div>
    </div>`;
}

function renderCarousel() {
  carousel.track.innerHTML = INFO_ITEMS.map(slideHtml).join("");

  /* Dot = PENANDA posisi saja, bukan kontrol. `aria-hidden` supaya pembaca
     layar tidak menawarkannya sebagai sesuatu yang bisa ditekan (klik-nya
     memang sudah dilepas), dan `data-slide` ikut dihapus karena tidak ada
     lagi yang membacanya. */
  carousel.dots.setAttribute("aria-hidden", "true");
  carousel.dots.innerHTML = INFO_ITEMS.length > 1
    ? INFO_ITEMS.map((_, i) => `<span class="carousel__dot${i === 0 ? " is-active" : ""}"></span>`).join("")
    : "";
  updateCarousel();
  /* Animasi slide PERTAMA ditahan sampai section-nya selesai muncul —
     lihat penjelasan lengkap di mulaiAnimasiSlidePertama(). */
  mulaiAnimasiSlidePertama();
}

function updateCarousel() {
  carousel.track.style.transform = `translateX(-${carousel.index * 100}%)`;
  carousel.dots.querySelectorAll(".carousel__dot").forEach((dot, i) => {
    dot.classList.toggle("is-active", i === carousel.index);
  });
  triggerActiveSlideAnim();
}

/* Animasi "settle" singkat (lihat .promo-slide--pulse di style.css) tiap
   kali slide carousel berpindah — dipanggil dari SATU titik
   (updateCarousel(), dipakai auto-slide/dot/swipe) supaya berlaku konsisten
   ke SEMUA jalur perpindahan slide. Berlaku ke KEDUA bentuk banner (gambar
   penuh & kartu teks) karena keduanya sama-sama `.promo-slide`.
   Class dilepas-pasang ulang (bukan cuma ditambah) supaya animasinya
   terpicu ulang tiap kali slide yang SAMA kembali jadi aktif (mis. cuma
   ada 1 banner, atau kembali muter ke slide pertama).

   ===================== KENAPA ADA GERBANG `siapAnimasiSlide` =============
   BUG yang diperbaiki: slide PERTAMA tidak pernah terlihat beranimasi.
   Penyebabnya BUKAN animasinya tidak jalan — ia jalan, tapi di saat yang
   salah. `init()` memanggil renderCarousel() -> updateCarousel() pada t=0,
   sedangkan section carousel adalah `.reveal` KE-3 di Beranda, yang oleh
   staggerReveal() diberi animation-delay 0,28 dtk + durasi revealUp 0,55
   dtk. Artinya section-nya baru benar-benar terlihat pada ~0,83 dtk —
   saat itu animasi 0,72 dtk tadi SUDAH SELESAI di balik layar yang masih
   transparan. Member hanya melihat banner yang sudah diam.
   Sekarang animasi slide pertama DITAHAN sampai revealUp section itu
   selesai (`animationend`), baru dijalankan. Perpindahan slide berikutnya
   tidak terpengaruh — gerbangnya sudah terbuka permanen. */
let siapAnimasiSlide = false;

function triggerActiveSlideAnim() {
  if (REDUCED_MOTION || !siapAnimasiSlide) return;
  const slides = carousel.track.querySelectorAll(".carousel__slide");
  const active = slides[carousel.index];
  const card = active && active.querySelector(".promo-slide");
  if (!card) return;
  /* Banner GAMBAR ikut animasi "settle" ini juga (17 Sep 2026 — dulu
     sengaja dilewati, lihat riwayat di bawah). `.promo-slide--pulse`
     sekarang MURNI zoom (scale + opacity, lihat catatan di style.css),
     jadi menerapkannya ke kartu gambar tidak lagi bentrok dengan gambar
     yang "harus diam" — seluruh kartu (gambar + ikon overlay di atasnya)
     zoom masuk bersama sebagai satu kesatuan, ikon overlay `.promo-ikon`
     tetap punya animasi melayangnya sendiri yang independen (lihat
     "OVERLAY IKON BANNER" di style.css) jadi tidak saling meniadakan.
     Alasan LAMA baris ini pernah `return` untuk banner gambar: animasi
     versi sebelumnya ikut menggeser kartu (translateY) yang terasa aneh
     ditumpuk di atas foto besar — sudah tidak berlaku sejak translateY
     itu dihapus dari promoSlideIn. Banner TEKS tetap memakai pulse yang
     sama seperti sebelumnya — tidak ada cabang terpisah lagi. */
  card.classList.remove("promo-slide--pulse");
  void card.offsetWidth; // paksa reflow supaya animasi restart
  card.classList.add("promo-slide--pulse");
}

/* Dipanggil SEKALI dari renderCarousel(). Menunggu section `.reveal`
   pembungkus carousel selesai muncul, lalu membuka gerbang di atas dan
   menjalankan animasi slide pertama. Selalu ada jaring pengaman timer:
   kalau `animationend` tidak pernah datang (reduced-motion mematikan
   animasinya, section tanpa class .reveal, tab dibuka di latar belakang),
   gerbang tetap dibuka supaya slide-slide berikutnya tidak ikut mati. */
function mulaiAnimasiSlidePertama() {
  const bukaGerbang = () => {
    if (siapAnimasiSlide) return;
    siapAnimasiSlide = true;
    triggerActiveSlideAnim();
  };
  if (REDUCED_MOTION) { siapAnimasiSlide = true; return; }

  const sec = carousel.track.closest(".reveal");
  if (!sec) { bukaGerbang(); return; }

  const onEnd = (e) => {
    if (e.target !== sec || e.animationName !== "revealUp") return;
    sec.removeEventListener("animationend", onEnd);
    bukaGerbang();
  };
  sec.addEventListener("animationend", onEnd);
  window.setTimeout(() => {
    sec.removeEventListener("animationend", onEnd);
    bukaGerbang();
  }, 1500);
}

/* ===================== BANNER: AUTO-PLAY SAJA, TIDAK INTERAKTIF =========
   Keputusan produk: member TIDAK boleh menggeser (swipe) atau menekan
   banner/dot untuk berpindah slide — banner berjalan otomatis saja.
   Karena itu YANG DIHAPUS di sini:
     - onDragStart/onDragMove/onDragEnd/onDragCancel + state dragX/dragDelta
       (dulu dipasang sebagai touchstart/touchmove/touchend/touchcancel
       pada .carousel__track), dan
     - goToSlide(), yang satu-satunya pemanggilnya adalah klik dot.
   Dot indicator dijadikan MURNI VISUAL (pointer-events: none +
   aria-hidden di style.css/renderCarousel) — dipilih menonaktifkannya
   juga, bukan setengah-setengah: kalau dot masih bisa diklik, member
   tetap punya cara memindahkan slide sendiri, dan itu persis yang
   dikeluhkan.

   YANG TIDAK BERUBAH: perpindahan otomatis tiap `carousel.interval`
   (restartAutoSlide di bawah) dan animasi pulse tiap slide aktif
   (triggerActiveSlideAnim). Scroll vertikal halaman di atas banner juga
   tetap normal — `.carousel__track` memakai `touch-action: pan-y`. */

function restartAutoSlide() {
  window.clearInterval(carousel.timer);
  if (INFO_ITEMS.length <= 1 || REDUCED_MOTION) return;
  carousel.timer = window.setInterval(() => {
    carousel.index = (carousel.index + 1) % INFO_ITEMS.length;
    updateCarousel();
  }, carousel.interval);
}

/* ---- Bottom navigation --------------------------------- */
/* Indikator + navigasi tab ditangani bottomnav.js (dipakai bersama 4 halaman).
   Dulu tiap halaman punya moveIndicator() sendiri — rawan tidak sinkron. */

/* ---- Avatar member ------------------------------------
   Foto profil dirender DikaProfilFoto — fungsi yang SAMA dipakai header
   halaman Akun. Kalau belum ada foto, isi asli elemen (ikon dompet) tetap
   dipertahankan modul itu. */
function renderAvatar() {
  try {
    if (!window.DikaProfilFoto) return;
    let nama = "";
    try {
      const p = JSON.parse(localStorage.getItem("dikapay:profile") || "null");
      nama = (p && p.name) || "";
    } catch (e) {}
    window.DikaProfilFoto.pasangSemua(nama);
  } catch (e) { console.error("[home] gagal menggambar avatar:", e); }
}

/* ---- Notifikasi -------------------------------------- */

function renderNotif() {
  const badge = document.getElementById("notifBadge");
  if (!badge) return;

  setNotifBadge(0);
  state.hasNewNotif = false;

  let phone = "";
  try {
    const profile = JSON.parse(localStorage.getItem("dikapay:profile") || "null");
    phone = profile && profile.phone ? String(profile.phone) : "";
  } catch (e) {}

  if (!phone || !window.DikaApi || typeof DikaApi.notifikasi !== "function") return;

  DikaApi.notifikasi(phone)
    .then(function (items) {
      /* Penentuan "ada yang belum dibaca" dipegang DikaNotifServer —
         modul yang SAMA dipakai halaman Notifikasi untuk menyusun
         daftarnya. Dulu di sini ada salinan aturannya sendiri, dan itu
         berarti badge bisa menyala untuk notifikasi yang daftarnya sendiri
         tidak pernah menampilkannya (mis. siaran lama sebelum baseline). */
      const S = window.DikaNotifServer;
      if (!S) {
        console.error("[home] notif-server.js belum dimuat — badge dilewati.");
        return;
      }
      /* Baseline ikut dipasang dari sini: Beranda hampir selalu jadi
         halaman PERTAMA yang menyentuh notifikasi setelah login, jadi
         kalau hanya halaman Notifikasi yang memasangnya, badge sempat
         menyala untuk siaran lama sebelum member membukanya. */
      S.pasangBaseline(phone, items);
      const belum = S.jumlahBelumDibaca(phone, items);
      state.hasNewNotif = belum > 0;
      setNotifBadge(belum);
    })
    .catch(function (err) {
      console.error("[home] gagal memuat unread notifikasi:", err);
    });
}

/* Badge lonceng: sekarang menampilkan ANGKA, bukan cuma titik. Dulu titik
   polos tidak membedakan "ada 1 kabar" dari "ada 9 kabar", padahal setelah
   notifikasi transaksi ikut masuk (lihat member-sync.js) jumlahnya jadi
   informasi yang berguna. Lebih dari 9 ditulis "9+" supaya lingkarannya
   tidak melebar merusak tata letak ikon. */
function setNotifBadge(jumlah) {
  const badge = document.getElementById("notifBadge");
  if (!badge) return;
  const n = Number(jumlah) || 0;
  badge.hidden = n <= 0;
  badge.textContent = n <= 0 ? "" : (n > 9 ? "9+" : String(n));
  badge.classList.toggle("quick-action__dot--angka", n > 0);
  badge.setAttribute("aria-label", n > 0 ? n + " notifikasi belum dibaca" : "");
}

window.addEventListener("dika:notification-read", function () {
  setNotifBadge(0);
  state.hasNewNotif = false;
});

/* Kabar baru dari siklus polling 60 detik member-sync.js (dan saat app
   kembali ke depan). Badge disegarkan TANPA member perlu keluar-masuk
   halaman Notifikasi.

   Sengaja memanggil renderNotif() lagi, bukan memakai `detail.ada` apa
   adanya: yang dibutuhkan badge adalah JUMLAHNYA, dan menghitungnya di dua
   tempat berbeda persis cara badge dan daftar jadi berbeda pendapat. */
window.addEventListener("dika:notif-baru", function () {
  try { renderNotif(); }
  catch (e) { console.error("[home] gagal menyegarkan badge notifikasi:", e); }
});

/* Pesan modal "Segera Hadir" per fitur quick action. "transfer" SUDAH punya
   halaman sendiri (transfer-member.html) — lihat CLAUDE.md "Transfer Antar
   Member" — jadi entrinya dihapus dari sini. */
const COMING_SOON = {
  topup: {
    title: "Top Up Saldo",
    lines: [
      "Top Up saldo DikaPay sedang kami siapkan 😊",
      "Sebentar lagi kamu bisa isi saldo lewat transfer bank, minimarket, dan e-wallet favoritmu. Terima kasih sudah menunggu!",
    ],
  },
};

/* Layanan baru yang belum punya halaman produk sendiri -> bottom sheet
   "Segera Hadir" (paymodal.js). Kalau nanti salah satunya sudah punya halaman,
   hapus entrinya di sini lalu daftarkan rutenya di ROUTES ("svc:<id>"). */
/* Layanan yang belum punya halaman -> bottom sheet "Segera Hadir".
   SEKARANG KOSONG: semua 20 layanan di ALL_SERVICES sudah punya halaman
   sendiri dan terdaftar di ROUTES. Kalau nanti menambah layanan baru yang
   halamannya belum jadi, daftarkan di sini ({ title, lines }). */
const SVC_COMING_SOON = {};

/* ---- Animasi masuk (staggered) --------------------- */

function staggerReveal() {
  document.querySelectorAll(".reveal").forEach((el, i) => {
    el.style.animationDelay = (REDUCED_MOTION ? 0 : 0.08 + i * 0.1) + "s";
  });
}

/* ---- Init ----------------------------------------- */

/* ---- Popup "amankan akun" — sekali saja utk member yg baru daftar ---
   Flag ditulis auth-flow.js (dikapay:newmember) tepat saat pendaftaran
   selesai — TIDAK ditulis saat login biasa, jadi member lama tidak pernah
   melihat popup ini. Dikonsumsi (dihapus) begitu terdeteksi, SEBELUM
   sempat ditutup/diklik apa pun — jadi refresh atau kunjungan berikutnya
   ke Beranda tidak pernah menampilkannya lagi, apa pun aksinya. */
const NEW_MEMBER_KEY = "dikapay:newmember";

/* Member menekan "Top Up Sekarang" di popup saldo tidak cukup (halaman
   produk mana pun) -> payment-flow.js menaruh penanda ini lalu menavigasi
   ke sini. Belum ada halaman Top Up tersendiri, jadi yang dibuka adalah
   bottom sheet "Segera Hadir" yang memang sudah ada di Beranda.
   Penanda dibaca DAN dihapus sekaligus, supaya refresh tidak membukanya
   lagi — pola yang sama seperti dikapay:newmember di bawah. */
const OPEN_TOPUP_KEY = "dikapay:open-topup";

function maybeOpenTopUp() {
  let minta = false;
  try {
    minta = sessionStorage.getItem(OPEN_TOPUP_KEY) === "1";
    if (minta) sessionStorage.removeItem(OPEN_TOPUP_KEY);
  } catch (e) { return; }
  if (!minta || !window.DikaComingSoon) return;
  window.setTimeout(() => {
    try { window.DikaComingSoon(COMING_SOON.topup); }
    catch (e) { console.error("script: gagal membuka sheet top up:", e); }
  }, REDUCED_MOTION ? 0 : 420);
}

/* ===========================================================================
   SALDO: SATU JALUR TULIS + GAMBAR ULANG
   ===========================================================================
   DULU di sini ada "SALDO TESTING": ketuk angka saldo 7x → prompt →
   `DikaDevSaldo.tambah()` menambah saldo dari udara kosong, untuk menguji
   pembelian saat top up belum ada.

   SUDAH DIHAPUS, dua alasan:
     1. Saldo sekarang OTORITATIF DI SERVER (api-transaksi-produk.php &
        api-status.php). Angka yang ditambahkan di perangkat cuma bertahan
        sampai polling 60 detik berikutnya menimpanya — jadi alat itu tidak
        lagi berguna untuk menguji apa pun, cuma membingungkan.
     2. Ia pintu belakang yang ikut terbawa ke APK member.

   Yang TERSISA hanyalah `set()` — dan itu BUKAN "menambah saldo": itu satu-
   satunya tempat yang tahu cara menulis cache saldo SEKALIGUS menggambar
   ulang angkanya di layar. `member-sync.js` (terapkanSaldo) memanggilnya
   setiap kali saldo dari SERVER datang, supaya tidak ada dua tempat yang
   punya versi sendiri soal "cara menulis saldo dengan benar".
   JANGAN dihapus tanpa memindahkan pemanggilnya di member-sync.js. */

window.DikaDevSaldo = {
  set: function (n) {
    try { localStorage.setItem("dikapay:balance", String(Math.max(0, Math.round(n)))); }
    catch (e) { console.error("script: gagal set saldo:", e); return null; }
    state.balance = readBalance();
    animateCountUp(state.balance, 700);
    return state.balance;
  },
  lihat: readBalance,
};

/* ---- Alur member BARU: kenalan fitur -> ajakan amankan akun ----------
   Flag `dikapay:newmember` dibaca & dihapus SEKALI di sini, lalu dipakai
   untuk DUA hal berurutan. Dulu `maybeShowNewMemberPrompt()` yang
   mengonsumsinya sendiri; begitu kenalan fitur ikut butuh flag yang sama,
   siapa pun yang membacanya lebih dulu akan "memakan" giliran yang lain.

   Urutannya disengaja: kenalan fitur DULU (memperkenalkan apa yang bisa
   dilakukan), baru ajakan mengamankan akun. Dibalik, member diminta
   mengamankan sesuatu yang belum dia tahu gunanya. */
function alurMemberBaru() {
  let baru = false;
  try {
    baru = localStorage.getItem(NEW_MEMBER_KEY) === "1";
    if (baru) localStorage.removeItem(NEW_MEMBER_KEY);
  } catch (e) { return; }

  const lanjutKeKeamanan = () => {
    try { showSecurityPrompt(); }
    catch (e) { console.error("[home] prompt keamanan gagal:", e); }
  };

  if (!baru) return;

  if (!window.DikaFiturBaru) {
    console.warn("[home] fitur-baru.js belum dimuat — kenalan fitur dilewati.");
    lanjutKeKeamanan();
    return;
  }

  window.DikaFiturBaru.mungkinTampilkan({ memberBaru: true })
    .then(lanjutKeKeamanan)
    .catch((e) => {
      console.error("[home] kenalan fitur gagal:", e);
      lanjutKeKeamanan();
    });
}

function showSecurityPrompt() {
  const overlay = document.getElementById("secPromptOverlay");
  const laterBtn = document.getElementById("secPromptLater");
  const goBtn = document.getElementById("secPromptGo");
  if (!overlay || !laterBtn || !goBtn) return;

  function close() { overlay.classList.remove("is-open"); }

  window.setTimeout(() => {
    overlay.classList.add("is-open");
  }, REDUCED_MOTION ? 0 : 700); // beri jeda supaya tidak "menyerbu" sebelum beranda sempat kelihatan

  laterBtn.addEventListener("click", close);
  goBtn.addEventListener("click", () => {
    close();
    window.location.href = "pages/akun.html";
  });
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
}

function init() {
  let menuGrid = null;
  try {
    if (window.I18N) window.I18N.apply(document);
    staggerReveal();
    renderAvatar();
    renderNotif();
    renderMenu();
    renderTicker();
    renderCarousel();
    alurMemberBaru();
    maybeOpenTopUp();

    animateCountUp(state.balance, 1100);

    balanceToggle.addEventListener("click", onToggleBalance);

    menuGrid = document.getElementById("menuGrid");
    menuGrid.addEventListener("pointerdown", spawnRipple);
    menuGrid.addEventListener("click", (e) => {
      const btn = e.target.closest(".menu-item");
      if (!btn) return;
      if (btn.dataset.menu === "lainnya") { openServices(); return; }
      handleAction("menu:" + btn.dataset.menu);
    });

    document.querySelector(".topbar").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const act = btn.dataset.action;

      if (act === "transfer") {
        flashClass(btn, "is-send", 450);
        window.setTimeout(() => { window.location.href = "pages/transfer-member.html"; }, 180);
        return;
      }
      if (act === "topup") {
        if (window.DikaComingSoon) window.DikaComingSoon(COMING_SOON.topup);
        return;
      }
      if (act === "notif") {
        flashClass(btn, "is-wiggle", 520);
        window.setTimeout(() => { window.location.href = "pages/notifikasi.html"; }, 180);
        return;
      }
      handleAction(act);
    });

    /* Banner SENGAJA tidak punya listener sentuh/klik sama sekali — lihat
       catatan "BANNER: AUTO-PLAY SAJA" di atas restartAutoSlide(). Jangan
       menambahkan swipe/tap-dot lagi di sini tanpa keputusan produk baru. */
  } catch (err) {
    console.error("[beranda] init gagal:", err);
  } finally {
    startTicker();
    restartAutoSlide();

    window.addEventListener("pageshow", (e) => {
      /* Foto bisa baru diganti di halaman Akun lalu member kembali ke sini
         lewat bfcache — avatar harus ikut segar, alasan yang sama dengan
         margin basi di produk-ui.js. */
      renderAvatar();
      renderNotif();
      segarkanSaldo();
      if (e.persisted) {
        restartAutoSlide();
        startTicker();
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        window.clearInterval(carousel.timer);
        window.clearInterval(ticker.timer);
      } else {
        restartAutoSlide();
        startTicker();
      }
    });
  }
}

document.addEventListener("DOMContentLoaded", init);
