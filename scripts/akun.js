/* ===========================================================================
   DikaPay — akun.js
   Halaman Akun. Semua data & alur DUMMY (tanpa backend).
   =========================================================================== */

"use strict";

const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (id) => document.getElementById(id);

/* ---- Ikon SVG inline ------------------------------------------- */

function svgIc(paths) {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round">' + paths + "</svg>";
}
/* ---- Toast --------------------------------------------------- */

const toastEl = $("atoast");
let toastTimer = null;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("is-show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("is-show"), 2600);
}

/* ---- Flow overlay (stack: mendukung flow bertumpuk) --------- */

const flowStack = [];
// Penghitung, bukan boolean: setiap hideFlow() non-pop memanggil history.back()
// sendiri dan menaikkan pendingBack. Dua kali tap tombol back cepat berturut-turut
// menghasilkan 2 event popstate yang keduanya harus "ditelan", bukan cuma satu.
let pendingBack = 0;

// Saat TIDAK ada flow/sheet terbuka, pendingBack HARUS 0. Kalau tidak nol berarti
// ada popstate "nyasar" yang tidak kita picu (mis. tombol back HP ditekan saat pay
// sheet dari paymodal.js terbuka, atau back lintas-dokumen) yang men-skew konter.
// Skew yang dibiarkan bikin popstate berikutnya "termakan" → overlay nyangkut
// menutupi bottom nav. Panggil ini tiap kali interaksi baru dimulai dari kondisi
// bersih supaya konter sembuh sendiri.
function healBackBaseline() {
  if (!flowStack.length && !sheetStack.length && pendingBack !== 0) pendingBack = 0;
}

function showFlow(id) {
  const f = $(id);
  if (!f) return;
  if (flowStack.indexOf(f) !== -1) return; // sudah terbuka → abaikan tap ganda
  healBackBaseline();
  void f.offsetWidth;
  f.classList.add("is-open");
  document.documentElement.style.overflow = "hidden";
  history.pushState({ flow: flowStack.length + 1 }, "");
  flowStack.push(f);
}
function openFlowStacked(id) {
  if (flowStack.length && flowStack[flowStack.length - 1] === $(id)) return;
  showFlow(id);
}
function hideFlow(fromPop) {
  const f = flowStack.pop();
  if (!f) return;
  f.classList.remove("is-open");
  // Alur alamat ditutup → hentikan pencarian lokasi yang mungkin masih jalan.
  if (f.id === "addrFormFlow" && typeof geoGen === "number") {
    geoGen++;
    if (geoAbort) { try { geoAbort.abort(); } catch (e) {} geoAbort = null; }
  }
  // Alur 2FA ditutup → batalkan timer "kirim" & "fokus" yang mungkin masih menunggu.
  if (f.id === "tfaFlow") {
    if (tfa._sendTimer) { clearTimeout(tfa._sendTimer); tfa._sendTimer = null; }
    if (tfa._focusTimer) { clearTimeout(tfa._focusTimer); tfa._focusTimer = null; }
  }
  // Alur Lupa PIN ditutup di tengah jalan → batalkan semua timer tertunda
  // (kirim/fokus/transisi ke Buat PIN Baru), supaya tidak nyala sendiri
  // setelah panelnya sudah tertutup.
  if (f.id === "lupaPinFlow") {
    if (lupaPin.sendTimer) { clearTimeout(lupaPin.sendTimer); lupaPin.sendTimer = null; }
    if (lupaPin.focusTimer) { clearTimeout(lupaPin.focusTimer); lupaPin.focusTimer = null; }
    if (lupaPin.doneTimer) { clearTimeout(lupaPin.doneTimer); lupaPin.doneTimer = null; }
  }
  if (!flowStack.length) document.documentElement.style.overflow = "";
  if (!fromPop) {
    pendingBack++;
    history.back();
  }
}
/* Bottom sheet / picker juga ikut sistem history:
   tombol back HP menutup sheet dulu, bukan flow di bawahnya / keluar halaman. */
const sheetStack = [];
function registerSheet(closeFn) {
  healBackBaseline();
  sheetStack.push(closeFn);
  history.pushState({ sheet: sheetStack.length }, "");
}
function unregisterSheet() {
  // dipanggil dari closeX saat BUKAN dari popstate → mundurkan 1 entri history
  if (!sheetStack.length) return;
  sheetStack.pop();
  pendingBack++;
  history.back();
}

window.addEventListener("popstate", () => {
  if (pendingBack > 0) { pendingBack--; return; }
  if (sheetStack.length) { const close = sheetStack.pop(); close(true); return; }
  if (flowStack.length) hideFlow(true);
  else if ($("logoutOverlay").classList.contains("is-open")) closeLogout();
});

/* ===========================================================================
   Status keamanan akun — SUMBER KEBENARAN TUNGGAL
   Dibaca oleh label menu PIN (renderPinLabel) DAN checklist Skor Keamanan
   (readSecurity). Dipersist di localStorage seperti `profile` / `ADDRESSES`.
     - pinCreated : apakah user sudah pernah membuat PIN transaksi.
     - pin        : PIN transaksi aktif (dummy; dipakai step "PIN lama").
   =========================================================================== */

let security = { pinCreated: false, pin: "123456" };
try {
  const s = localStorage.getItem("dikapay:security");
  if (s) security = Object.assign(security, JSON.parse(s));
} catch (e) {}
function persistSecurity() {
  try { localStorage.setItem("dikapay:security", JSON.stringify(security)); } catch (e) {}
}

/* Label baris menu "PIN": "Buat PIN Transaksi" bila belum ada, "Ubah PIN
   Transaksi" bila sudah. Ikon dapat penanda "+" kecil saat belum dibuat. */
function renderPinLabel() {
  const lbl = $("pinRowLabel");
  if (!lbl) return;
  lbl.textContent = security.pinCreated
    ? i18nText("acc.sec.pin", "Ubah PIN Transaksi")
    : i18nText("acc.sec.pin.create", "Buat PIN Transaksi");
  const row = lbl.closest(".row");
  if (row) row.classList.toggle("is-pin-new", !security.pinCreated);
}

/* ===========================================================================
   Alur: Buat / Ubah PIN Transaksi
   =========================================================================== */

const pin = { step: "old", buf: "", next: "" };
const pinDots = $("pinDots");
const pinHint = $("pinHint");
const PIN_HINTS = {
  old: "Masukkan PIN lama kamu",
  new: "Buat PIN baru — 6 digit",
  confirm: "Ulangi PIN baru kamu",
};

function pinRenderDots() {
  pinDots.querySelectorAll(".pin-dot").forEach((d, i) => {
    d.classList.toggle("is-filled", i < pin.buf.length);
  });
}
function pinShake() {
  pinDots.classList.add("is-error");
  if (pin._shakeTimer) clearTimeout(pin._shakeTimer);
  pin._shakeTimer = setTimeout(() => {
    pin._shakeTimer = null;
    pinDots.classList.remove("is-error");
    pin.buf = "";
    pinRenderDots();
  }, 420);
}
function pinSetStep(s) {
  pin.step = s;
  pin.buf = "";
  pinHint.textContent = PIN_HINTS[s];
  pinRenderDots();
}
function pinProcess() {
  try {
    if (pin.step === "old") {
      if (pin.buf === security.pin) pinSetStep("new");
      else { pinShake(); toast("PIN lama salah, coba lagi."); }
    } else if (pin.step === "new") {
      pin.next = pin.buf;
      pinSetStep("confirm");
    } else {
      if (pin.buf === pin.next) {
        /* SIMULASI "PIN berhasil dibuat": fitur PIN asli belum ada, jadi
           selesainya alur dummy ini = tanda PIN sudah dibuat. Satu sumber
           state → label menu & Skor Keamanan langsung sinkron. */
        const first = !security.pinCreated;
        security.pin = pin.next;
        security.pinCreated = true;
        persistSecurity();
        renderPinLabel();
        renderSecurityScore();
        hideFlow();
        toast(first ? "✓ PIN transaksi berhasil dibuat" : "✓ PIN transaksi berhasil diubah");
      } else {
        pinShake();
        toast("PIN tidak cocok. Ulangi dari awal.");
        pin.next = "";
        pin._resetTimer = setTimeout(() => {
          pin._resetTimer = null;
          pinSetStep("new");
        }, 440);
      }
    }
  } catch (err) {
    console.error("[akun] pinProcess:", err);
  } finally {
    pin.locked = false;
  }
}
function pinKey(k) {
  if (pin.locked) return;                       // sedang memproses 6 digit → abaikan tap
  if (pin._shakeTimer) { clearTimeout(pin._shakeTimer); pin._shakeTimer = null; }
  if (pin._resetTimer) { clearTimeout(pin._resetTimer); pin._resetTimer = null; }
  if (k === "del") {
    pin.buf = pin.buf.slice(0, -1);
    pinRenderDots();
    return;
  }
  if (pin.buf.length >= 6) return;
  pin.buf += k;
  pinRenderDots();
  if (pin.buf.length === 6) {
    pin.locked = true;
    setTimeout(pinProcess, 180);
  }
}
function openPinFlow() {
  pin.next = "";
  if (pin._shakeTimer) { clearTimeout(pin._shakeTimer); pin._shakeTimer = null; }
  if (pin._resetTimer) { clearTimeout(pin._resetTimer); pin._resetTimer = null; }
  /* Belum punya PIN → tidak ada "PIN lama", langsung ke step buat PIN. */
  const title = document.querySelector("#pinFlow .aflow__title");
  if (title) title.textContent = security.pinCreated ? "Ubah PIN Transaksi" : "Buat PIN Transaksi";
  pinSetStep(security.pinCreated ? "old" : "new");
  showFlow("pinFlow");
}

/* Dipanggil HANYA setelah Lupa PIN selesai verifikasi OTP — menukar
   panel Lupa PIN dengan panel Buat PIN Baru langsung di flowStack
   (bukan hideFlow()+showFlow() terpisah, yang berarti menunggu siklus
   history.back()->popstate yang asinkron sebelum panel baru boleh
   pushState lagi). Efeknya juga pas secara UX: tombol back SESUDAH ini
   kembali langsung ke halaman Akun, BUKAN ke layar OTP yang sudah
   selesai diverifikasi — member yang identitasnya sudah dibuktikan
   lewat OTP tidak masuk akal diminta mengulang OTP itu lagi, apalagi
   diminta PIN LAMA yang justru sudah ia lupakan (makanya step dipaksa
   "new", bukan lewat cabang `security.pinCreated` seperti openPinFlow()
   biasa). */
function pinNextFromLupa() {
  const from = $("lupaPinFlow");
  const to = $("pinFlow");
  const idx = flowStack.indexOf(from);
  if (idx !== -1) flowStack[idx] = to;
  from.classList.remove("is-open");

  pin.next = "";
  if (pin._shakeTimer) { clearTimeout(pin._shakeTimer); pin._shakeTimer = null; }
  if (pin._resetTimer) { clearTimeout(pin._resetTimer); pin._resetTimer = null; }
  const title = document.querySelector("#pinFlow .aflow__title");
  if (title) title.textContent = "Buat PIN Baru";
  pinSetStep("new");

  void to.offsetWidth;
  to.classList.add("is-open");
}

/* ===========================================================================
   Alur: Lupa PIN Transaksi
   Tidak menyalin logika PIN — sukses verifikasi OTP di sini bermuara ke
   #pinFlow yang SAMA (lewat openPinFlowLupa() di atas), bukan membangun
   keypad "buat PIN" sendiri kedua kalinya. Pola OTP-nya (ikon beranimasi
   + kode dummy tampil langsung + kotak kode + kirim ulang) SENGAJA meniru
   alur OTP pendaftaran di auth-flow.js, karena user memang memintanya
   konsisten — tapi ditulis ulang dengan nama sendiri di sini karena
   akun.html tidak memuat auth.css/auth-flow.js.
   =========================================================================== */

const lupaPin = { method: null, kode: "", sendTimer: null, focusTimer: null, doneTimer: null };
const lupaPinOtpBoxes = Array.prototype.slice.call(document.querySelectorAll("#lupaPinOtpBoxes input"));

/* Nomor HP di-mask "62 ••• 7890" (kode negara + tail 4 digit) dan email
   di-mask "d ••• gmail.com" (huruf pertama + domain utuh) — pola yang
   SAMA dipakai lagi di redesain halaman Data Diri (lihat maskPhoneId/
   maskEmailId di bawah), satu implementasi untuk kedua tempat. */
function maskPhoneId(v) {
  const d = digitPhone(v);
  if (!d) return "—";
  const intl = d.replace(/^0/, "62");
  return "62 ••• " + intl.slice(-4);
}
function maskEmailId(v) {
  const s = String(v || "").trim();
  const at = s.indexOf("@");
  if (at <= 0) return "—";
  return s.slice(0, 1) + " ••• " + s.slice(at + 1);
}

function lupaPinShow(step) {
  document.querySelectorAll("#lupaPinFlow .tfa-step").forEach((s) => { s.hidden = s.dataset.step !== step; });
}
function lupaPinKode() {
  let k = "";
  for (let i = 0; i < 6; i++) k += Math.floor(Math.random() * 10);
  return k;
}
function openLupaPinFlow() {
  try {
    lupaPin.method = null;
    lupaPin.kode = "";
    if (lupaPin.sendTimer) { clearTimeout(lupaPin.sendTimer); lupaPin.sendTimer = null; }
    if (lupaPin.focusTimer) { clearTimeout(lupaPin.focusTimer); lupaPin.focusTimer = null; }
    if (lupaPin.doneTimer) { clearTimeout(lupaPin.doneTimer); lupaPin.doneTimer = null; }

    const hpPrev = $("lupaPinHpPreview");
    if (hpPrev) hpPrev.textContent = "Ke nomor " + maskPhoneId(profile.phone);

    const emailBtn = document.querySelector('#lupaPinFlow [data-lupapin-method="email"]');
    const emailPrev = $("lupaPinEmailPreview");
    const punyaEmail = !!(profile.email && profile.email.indexOf("@") > 0);
    if (emailPrev) emailPrev.textContent = punyaEmail ? ("Ke email " + maskEmailId(profile.email)) : "Belum ada email terdaftar";
    if (emailBtn) {
      emailBtn.disabled = !punyaEmail;
      emailBtn.classList.toggle("tfa-opt--disabled", !punyaEmail);
    }

    lupaPinShow("method");
    showFlow("lupaPinFlow");
  } catch (err) { console.error("[akun] openLupaPinFlow:", err); }
}
function lupaPinPick(method) {
  try {
    lupaPin.method = method;
    lupaPinShow("sending");
    if (lupaPin.sendTimer) clearTimeout(lupaPin.sendTimer);
    lupaPin.sendTimer = setTimeout(() => {
      lupaPin.sendTimer = null;
      lupaPin.kode = lupaPinKode();
      const target = method === "hp" ? maskPhoneId(profile.phone) : maskEmailId(profile.email);
      $("lupaPinOtpLead").innerHTML = "Kode verifikasi sudah dikirim ke <b>" + esc(target) + "</b>.";
      $("lupaPinDummyCode").textContent = lupaPin.kode;
      $("lupaPinErrText").hidden = true;
      lupaPinOtpBoxes.forEach((b) => (b.value = ""));
      $("lupaPinOtpBoxes").classList.remove("is-error");
      lupaPinShow("otp");
      /* Restart animasi ikon tiap kali step ini ditampilkan lagi (mis.
         member sempat kembali lalu memilih metode lain). */
      const icon = $("lupaPinOtpIcon");
      if (icon && !REDUCED_MOTION) {
        icon.style.animation = "none";
        void icon.offsetWidth;
        icon.style.animation = "";
      }
      if (!REDUCED_MOTION) {
        lupaPin.focusTimer = setTimeout(() => {
          lupaPin.focusTimer = null;
          if ($("lupaPinFlow").classList.contains("is-open")) lupaPinOtpBoxes[0].focus();
        }, 60);
      }
    }, 1100);
  } catch (err) { console.error("[akun] lupaPinPick:", err); }
}
function lupaPinResend() {
  try {
    lupaPin.kode = lupaPinKode();
    $("lupaPinDummyCode").textContent = lupaPin.kode;
    $("lupaPinErrText").hidden = true;
    lupaPinOtpBoxes.forEach((b) => (b.value = ""));
    lupaPinOtpBoxes[0].focus();
    toast("Kode verifikasi baru sudah dikirim.");
  } catch (err) { console.error("[akun] lupaPinResend:", err); }
}
function lupaPinSalah(pesan) {
  $("lupaPinOtpBoxes").classList.remove("is-error");
  void $("lupaPinOtpBoxes").offsetWidth;
  $("lupaPinOtpBoxes").classList.add("is-error");
  $("lupaPinErrText").textContent = pesan;
  $("lupaPinErrText").hidden = false;
}
function lupaPinVerify() {
  try {
    const code = lupaPinOtpBoxes.map((b) => b.value).join("");
    if (code.length < 6) { lupaPinSalah("Masukkan 6 digit kode dulu, ya."); return; }
    if (code !== lupaPin.kode) {
      lupaPinSalah("Kode belum cocok. Coba periksa lagi, ya.");
      lupaPinOtpBoxes.forEach((b) => (b.value = ""));
      lupaPinOtpBoxes[0].focus();
      return;
    }
    lupaPinShow("sukses");
    lupaPin.doneTimer = setTimeout(() => {
      lupaPin.doneTimer = null;
      pinNextFromLupa();
    }, 900);
  } catch (err) { console.error("[akun] lupaPinVerify:", err); }
}

/* ===========================================================================
   Alur: Verifikasi 2 Langkah (2FA)
   =========================================================================== */

const tfa = { method: null, active: false, _sendTimer: null, _focusTimer: null };
const tfaSteps = () => document.querySelectorAll("#tfaFlow .tfa-step");

function tfaShow(step) {
  tfaSteps().forEach((s) => { s.hidden = s.dataset.step !== step; });
}
function openTfaFlow() {
  if (tfa.active) { toast("Verifikasi 2 langkah sudah aktif."); return; }
  if (tfa._sendTimer) { clearTimeout(tfa._sendTimer); tfa._sendTimer = null; }
  if (tfa._focusTimer) { clearTimeout(tfa._focusTimer); tfa._focusTimer = null; }
  tfa.method = null;
  tfaShow("method");
  showFlow("tfaFlow");
}

function tfaPickMethod(m) {
  tfa.method = m;
  const lead = $("tfaContactLead");
  const input = $("tfaContact");
  if (m === "sms") {
    lead.textContent = "Masukkan nomor HP kamu";
    input.placeholder = "08xxxxxxxxxx";
    input.setAttribute("inputmode", "tel");
    input.value = "0812" + "3456789";
  } else {
    lead.textContent = "Masukkan email kamu";
    input.placeholder = "nama@gmail.com";
    input.setAttribute("inputmode", "email");
    input.value = "budi.santoso@email.com";
  }
  tfaShow("contact");
}

function tfaSend() {
  const v = $("tfaContact").value.trim();
  if (!v) { toast("Isi dulu nomor/email kamu, ya."); return; }
  tfaShow("sending");
  if (tfa._sendTimer) clearTimeout(tfa._sendTimer);
  if (tfa._focusTimer) clearTimeout(tfa._focusTimer);
  tfa._sendTimer = setTimeout(() => {
    tfa._sendTimer = null;
    $("tfaOtpLead").textContent = "Masukkan 6 digit kode yang kami kirim ke " + v;
    otpBoxes.forEach((b) => (b.value = ""));
    $("otpBoxes").classList.remove("is-error");
    tfaShow("otp");
    // Hanya fokus bila flow masih terbuka (mengambil alih fokus panel tertutup tidak diinginkan)
    if (!REDUCED_MOTION && $("tfaFlow").classList.contains("is-open")) {
      tfa._focusTimer = setTimeout(() => {
        tfa._focusTimer = null;
        otpBoxes[0].focus();
      }, 60);
    }
  }, 1300);
}

const otpBoxes = Array.prototype.slice.call(document.querySelectorAll("#otpBoxes input"));

function tfaVerify() {
  const code = otpBoxes.map((b) => b.value).join("");
  if (code.length < 6) {
    $("otpBoxes").classList.add("is-error");
    setTimeout(() => $("otpBoxes").classList.remove("is-error"), 420);
    toast("Masukkan 6 digit kode dulu, ya.");
    return;
  }
  tfaShow("done");
  burstConfetti();
  tfa.active = true;
  const st = $("tfaStatus");
  st.textContent = "Aktif";
  st.classList.remove("row__trail--muted");
  st.classList.add("row__trail--ok");
  renderSecurityScore();   // 2FA kini aktif → skor & checklist ikut naik
}

function burstConfetti() {
  if (REDUCED_MOTION) return;
  const box = $("confetti");
  box.innerHTML = "";
  const colors = ["#FFC93C", "#0B2447", "#1B4FD6", "#1E9C56", "#E0453C"];
  for (let i = 0; i < 16; i++) {
    const s = document.createElement("span");
    const ang = (Math.PI * 2 * i) / 16 + Math.random() * 0.5;
    const dist = 70 + Math.random() * 60;
    s.style.setProperty("--cx", Math.cos(ang) * dist + "px");
    s.style.setProperty("--cy", (Math.sin(ang) * dist + 40) + "px");
    s.style.setProperty("--cr", Math.random() * 540 - 270 + "deg");
    s.style.background = colors[i % colors.length];
    s.style.animationDelay = Math.random() * 0.12 + "s";
    box.appendChild(s);
  }
  setTimeout(() => (box.innerHTML = ""), 1500);
}

/* ===========================================================================
   Alur: Perangkat Aktif
   =========================================================================== */

/* DATA NYATA, bukan dummy lagi. Dulu di sini ada array hardcoded
   ("Xiaomi Redmi Note" + "Samsung A52") yang muncul sama persis di setiap
   HP — untuk layar keamanan itu lebih buruk daripada kosong: member
   diberi tahu ada perangkat lain yang login padahal tidak ada, dan
   perangkatnya sendiri tidak pernah muncul. Identitas asli diambil
   perangkat.js lewat @capacitor/device dan dicatat saat login. */
const DEV_IC = svgIc('<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>');

function devList() {
  try {
    return window.DikaPerangkat ? window.DikaPerangkat.daftar() : [];
  } catch (e) {
    console.error("[akun] gagal membaca daftar perangkat:", e);
    return [];
  }
}

function renderDevices() {
  const list = devList();
  const el = $("devList");
  if (!el) return;

  if (!list.length) {
    el.innerHTML =
      '<p class="tfa-lead" style="text-align:center;padding:20px 0">' +
      "Belum ada perangkat tercatat. Perangkat akan muncul di sini setelah kamu masuk lagi." +
      "</p>";
    return;
  }

  el.innerHTML = list.map((d) => {
    const meta = window.DikaPerangkat.waktuRelatif(d.terakhir, d.ini);
    /* Perangkat yang sedang dipakai TIDAK diberi tombol keluar: menekannya
       hanya menghapus barisnya sendiri tanpa mengakhiri sesi apa pun —
       tombol yang berbohong tentang apa yang dilakukannya. Untuk keluar
       dari perangkat ini, tombol Keluar di bawah halaman yang benar. */
    const trail = d.ini
      ? '<span class="dev-item__here">Perangkat ini</span>'
      : `<button class="dev-item__logout" type="button" data-logout="${esc(d.id)}">Keluar dari perangkat ini</button>`;
    const os = [d.os, d.osVersion].filter(Boolean).join(" ");
    return `
    <li class="dev-item" data-id="${esc(d.id)}">
      <div class="dev-item__top">
        <span class="dev-item__ic">${DEV_IC}</span>
        <div>
          <div class="dev-item__name">${esc(d.nama)}</div>
          <div class="dev-item__meta ${d.ini ? "is-current" : ""}">${esc(meta)}${os ? " · " + esc(os) : ""}</div>
        </div>
      </div>
      ${trail}
    </li>`;
  }).join("");
}

/* Nama perangkat berasal dari luar aplikasi (nama yang diberi pemiliknya
   di Pengaturan HP) — jangan pernah masuk innerHTML mentah-mentah. */
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

/* Catat perangkat ini lalu render ulang. `setIdIni` dipanggil dulu supaya
   baris yang benar yang bertanda "Aktif sekarang". */
function refreshDevices() {
  if (!window.DikaPerangkat) { renderDevices(); return; }
  window.DikaPerangkat.catat()
    .then((info) => {
      if (info) window.DikaPerangkat.setIdIni(info.id);
      renderDevices();
    })
    .catch((e) => {
      console.error("[akun] gagal mencatat perangkat:", e);
      renderDevices();
    });
}

function logoutDevice(id) {
  const li = $("devList").querySelector('[data-id="' + id + '"]');
  if (!li) return;
  li.classList.add("is-out");
  setTimeout(() => {
    try {
      if (window.DikaPerangkat) window.DikaPerangkat.keluarkan(id);
    } catch (e) { console.error("[akun] gagal mengeluarkan perangkat:", e); }
    renderDevices();
  }, 300);
  /* Jujur soal batasnya: fase 1 daftar ini hidup di localStorage perangkat
     ini, jadi yang terjadi baru menghapus barisnya — sesi di perangkat
     sana belum benar-benar dicabut (butuh backend, lihat perangkat.js). */
  toast("Perangkat dihapus dari daftar.");
}

/* ===========================================================================
   Bahasa (i18n) — lihat translations.js
   =========================================================================== */

function curLang() {
  return window.I18N ? window.I18N.lang : "id";
}
function i18nText(key, fallback) {
  return window.I18N ? window.I18N.t(key) : fallback;
}

function renderLangVal() {
  const el = $("langVal");
  if (el) el.textContent = i18nText("lang.name." + curLang(), "Indonesia");
}
function fadeLangVal() {
  const el = $("langVal");
  if (!el) return;
  if (REDUCED_MOTION) { renderLangVal(); return; }
  el.style.transition = "opacity 0.18s ease";
  el.style.opacity = "0";
  setTimeout(() => {
    renderLangVal();
    el.style.opacity = "1";
  }, 180);
}

function syncLangSheet() {
  $("langSheet").querySelectorAll(".choice-opt").forEach((o) => {
    o.classList.toggle("is-active", o.dataset.lang === curLang());
  });
}
function openLangSheet() {
  syncLangSheet();
  const s = $("langSheet");
  void s.offsetWidth;
  s.classList.add("is-open");
  registerSheet(closeLangSheet);
}
function closeLangSheet(fromPop) {
  const s = $("langSheet");
  if (!s.classList.contains("is-open")) return;
  s.classList.remove("is-open");
  if (!fromPop) unregisterSheet();
}
let langBusy = false;
function pickLang(lang) {
  try {
    if (langBusy) return;
    if (!window.I18N || lang === curLang() || (lang !== "id" && lang !== "en")) {
      setTimeout(() => closeLangSheet(), 400);
      return;
    }
    langBusy = true;
    window.I18N.lang = lang;
    syncLangSheet();               // radio berpindah smooth
    window.I18N.apply(document);   // terapkan langsung ke semua [data-i18n] di halaman ini
    renderPinLabel();              // label "Buat/Ubah PIN" (dibangun via JS) ikut bahasa baru
    renderSecurityScore();         // label checklist (dibangun via JS) ikut bahasa baru
    fadeLangVal();                 // update nilai "Bahasa" di baris menu dengan fade
    setTimeout(() => { closeLangSheet(); langBusy = false; }, 400);
  } catch (err) {
    console.error("[akun] Ganti bahasa gagal:", err);
    langBusy = false;
  }
}

/* ===========================================================================
   Logout
   =========================================================================== */

function openLogout() {
  healBackBaseline();
  const ov = $("logoutOverlay");
  void ov.offsetWidth;
  ov.classList.add("is-open");
  document.documentElement.style.overflow = "hidden";
}
function closeLogout() {
  $("logoutOverlay").classList.remove("is-open");
  document.documentElement.style.overflow = "";
}
function doLogout() {
  closeLogout();
  toast("Kamu telah keluar dari akun DikaPay.");
  /* Sesi SELALU lewat DikaAuth — logout() menghapus flag lalu replace ke
     auth.html. Dulu redirect ke index.html; sekarang itu cuma akan
     dipantulkan guard ke auth.html (dua kali navigasi, sempat kelihatan
     beranda kosong). */
  setTimeout(() => {
    if (window.DikaAuth) DikaAuth.logout();
    else window.location.replace("auth.html");
  }, 1200);
}

/* ===========================================================================
   Profil & Edit Profil
   =========================================================================== */

let profile = { name: "Budi Santoso", phone: "0812-3456-7890", email: "budi.santoso@email.com" };
try {
  const saved = localStorage.getItem("dikapay:profile");
  if (saved) profile = Object.assign(profile, JSON.parse(saved));
} catch (e) {}

/* ---- Nomor HP: digit saja + pemformat "0812-3456-7890" -----------------
   Salinan kecil dari `sanitize()`/`prettyPhone()` di operator-detect.js —
   akun.html tidak me-link file itu, jadi disalin dengan nama sendiri
   (pola yang sama seperti `parseAngka` di transfer-member.js menyalin
   `formatNominal` manual-page.js). SATU-SATUNYA yang menyentuh nomor HP
   di halaman ini; kalau menambah field nomor lain, pakai dua fungsi ini. */
function digitPhone(v) {
  return String(v == null ? "" : v).replace(/\D/g, "").slice(0, 13);
}
function prettyPhoneLocal(d) {
  return String(d || "").replace(/(\d{4})(?=\d)/g, "$1-");
}

/* SELF-HEALING saat dimuat: field "Nomor HP" di Edit Profil (badge
   "Terverifikasi" di bawah) dulu disimpan lewat `.trim()` tanpa saringan
   apa pun — simbol/huruf yang ter-ketik atau ter-tempel lolos langsung ke
   `dikapay:profile.phone`. Dibangun ulang dari digitnya sendiri tiap kali
   halaman ini dimuat, dan ditulis balik kalau memang berubah, supaya data
   yang sudah kadung kotor dari bug lama ikut terbersihkan otomatis —
   bukan cuma dicegah untuk kasus baru. */
try {
  const bersih = prettyPhoneLocal(digitPhone(profile.phone));
  if (profile.phone !== bersih) {
    profile.phone = bersih;
    localStorage.setItem("dikapay:profile", JSON.stringify(profile));
  }
} catch (e) { console.error("[akun] gagal membersihkan nomor HP tersimpan:", e); }

function initials(name) {
  const p = String(name).trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}
function renderHeader() {
  /* Avatar digambar DikaProfilFoto lewat pasangSemua() — SATU fungsi yang
     sama dipakai Beranda & halaman ini, dan ia menyapu SEMUA elemen
     [data-avatar] di halaman (header Akun + pratinjau di Data Diri), bukan
     cuma satu elemen. Dulu di sini memakai pasang() untuk satu elemen saja,
     jadi avatar baru di Data Diri tidak akan pernah ikut tergambar. */
  if (window.DikaProfilFoto) window.DikaProfilFoto.pasangSemua(profile.name);
  else $("avatar").textContent = initials(profile.name);
  document.querySelector(".ahead__name").textContent = profile.name;
  /* ID DikaPay = NOMOR HP member sendiri (nomor yang sudah diverifikasi
     lewat OTP saat mendaftar), BUKAN kode buatan ("DP2026081234") seperti
     sebelumnya — keputusan produk. `profile.phone` sudah format cantik
     ("0812-3456-7890"), dipakai apa adanya supaya konsisten dengan
     tampilan nomor HP di tempat lain (login, Edit Profil). */
  document.querySelector(".ahead__id").textContent = "ID DikaPay: " + (profile.phone || "—");
}

function edClearErrors() {
  document.querySelectorAll("#editFieldFlow .ff").forEach((ff) => {
    ff.classList.remove("is-error", "is-shake");
    ff.querySelector(".ff__err").textContent = "";
  });
}
function edFieldError(id, msg) {
  const ff = $(id).closest(".ff");
  ff.querySelector(".ff__err").textContent = msg;
  ff.classList.add("is-error");
  ff.classList.remove("is-shake");
  void ff.offsetWidth;
  ff.classList.add("is-shake");
  setTimeout(() => ff.classList.remove("is-shake"), 420);
}
/* HANYA @gmail.com (keputusan produk). Verifikasi email belum berjalan,
   dan membatasinya ke satu penyedia yang pasti bisa dijangkau membuat
   alurnya bisa diandalkan saat verifikasi nyata menyusul.

   Dicek DUA lapis: bentuk email yang sah DULU, baru domainnya — supaya
   "budi@" tidak lolos cuma karena mengandung kata gmail.
   Subdomain seperti @mail.gmail.com SENGAJA ditolak: itu bukan alamat
   Gmail biasa.

   ATURAN YANG SAMA ADA DI DUA FILE (auth-flow.js saat mendaftar, akun.js
   saat mengubah email di Data Diri). Kalau salah satu diubah, ubah juga
   yang lain — kalau tidak, member bisa mendaftar dengan domain yang lalu
   ditolak saat menyuntingnya, atau sebaliknya. */
function validEmail(v) {
  const t = String(v || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return false;
  return /@gmail\.com$/i.test(t);
}

/* Redesain "Data Diri" — halaman LIST (label kiri + value/aksi kanan),
   BUKAN lagi satu form gabungan 3 field. Nama Lengkap sekarang ikut jadi
   baris PERTAMA (diminta ditambahkan kembali), tapi dibatasi edit 1x per
   7 hari — lihat blok "Kunci Nama Lengkap" di bawah. Username, Nomor
   Ponsel, Email TIDAK dibatasi (cuma nama yang dianggap identitas
   sensitif untuk dibatasi frekuensinya). */
function ddMask(kind) {
  if (kind === "phone") return profile.phone ? maskPhoneId(profile.phone) : "—";
  if (kind === "email") return profile.email ? maskEmailId(profile.email) : "Belum diisi";
  return "—";
}
function renderDataDiriList() {
  /* Pratinjau foto di baris "Ganti Gambar Profil" ikut digambar lewat
     fungsi yang SAMA dengan avatar header & Beranda. */
  if (window.DikaProfilFoto) window.DikaProfilFoto.pasangSemua(profile.name);
  const n = $("ddName");
  if (n) n.textContent = profile.name || "—";
  renderNamaLockRow();
  const u = $("ddUsername");
  if (u) {
    if (profile.username) { u.textContent = "@" + profile.username; u.className = "row__trail"; }
    else { u.textContent = "Pasang"; u.className = "row__trail row__trail--cta"; }
  }
  const p = $("ddPhone");
  if (p) p.textContent = ddMask("phone");
  const e = $("ddEmail");
  if (e) e.textContent = ddMask("email");
}
function openEditFlow() {
  renderDataDiriList();
  showFlow("editFlow");
}

/* ===========================================================================
   Kunci Nama Lengkap — 1x edit per 7 hari
   Timestamp perubahan terakhir disimpan PER AKUN (kunci `<nomor digit>`,
   pola yang sama dengan `dikapay:devices:<digit>`/`dikapay:pintx:banned:
   <digit>`), bukan satu kunci global — supaya kunci akun A tidak pernah
   ikut membatasi akun B di perangkat yang sama. Nomor akun diambil dari
   `profile.phone` (sama seperti `maskPhoneId`/Lupa PIN di atas).
   =========================================================================== */

const NAME_LOCK_MS = 7 * 24 * 60 * 60 * 1000; // 7 hari penuh
const NAME_LOCK_PREFIX = "dikapay:name:lastChange:";

function namaLockKey() {
  const d = digitPhone(profile.phone);
  return d ? NAME_LOCK_PREFIX + d : "";
}
/* null = boleh diedit sekarang. Selain itu -> { mulai, sampai } sisa kunci. */
function namaTerkunciSampai() {
  const k = namaLockKey();
  if (!k) return null;
  try {
    const v = JSON.parse(localStorage.getItem(k) || "null");
    if (!v || typeof v.sampai !== "number") return null;
    if (v.sampai <= Date.now()) { localStorage.removeItem(k); return null; } // sudah lewat -> bersihkan sendiri
    return v;
  } catch (e) {
    console.error("[akun] gagal membaca status kunci nama:", e);
    return null;
  }
}
function catatPerubahanNama() {
  const k = namaLockKey();
  if (!k) { console.error("[akun] tidak ada nomor akun — kunci nama TIDAK bisa dicatat."); return; }
  const mulai = Date.now();
  try { localStorage.setItem(k, JSON.stringify({ mulai: mulai, sampai: mulai + NAME_LOCK_MS })); }
  catch (e) { console.error("[akun] gagal menyimpan status kunci nama:", e); }
}
function renderNamaLockRow() {
  const row = $("ddNameRow");
  if (!row) return;
  const terkunci = !!namaTerkunciSampai();
  row.classList.toggle("is-locked", terkunci);
}

/* "5 hari 12 jam lagi" — pola yang SAMA dengan formatSisa() di
   pin-transaksi.js, cuma satuannya hari+jam (bukan jam+menit) karena
   durasinya jauh lebih panjang (7 hari, bukan 2-3 jam). */
function formatSisaHari(ms) {
  const totalJam = Math.max(1, Math.ceil(ms / (60 * 60 * 1000)));
  const hari = Math.floor(totalJam / 24);
  const jam = totalJam % 24;
  if (hari > 0 && jam > 0) return hari + " hari " + jam + " jam lagi";
  if (hari > 0) return hari + " hari lagi";
  return jam + " jam lagi";
}

let namalockTimer = 0;
function tampilkanNamalock(info) {
  const ov = $("namalockOverlay");
  const nilai = $("namalockCountdown");
  function render() {
    const sisa = info.sampai - Date.now();
    if (sisa <= 0) { tutupNamalock(); renderNamaLockRow(); return; }
    nilai.textContent = formatSisaHari(sisa);
  }
  render();
  if (namalockTimer) window.clearInterval(namalockTimer);
  namalockTimer = window.setInterval(render, 30000); // sisa waktu diperbarui selagi popup terbuka
  void ov.offsetWidth;
  ov.classList.add("is-open");
  document.documentElement.style.overflow = "hidden";
}
function tutupNamalock() {
  if (namalockTimer) { window.clearInterval(namalockTimer); namalockTimer = 0; }
  const ov = $("namalockOverlay");
  if (ov) ov.classList.remove("is-open");
  document.documentElement.style.overflow = flowStack.length ? "hidden" : "";
}

/* ===========================================================================
   Kunci Nomor Ponsel — 1x ganti per 90 HARI
   Pola PERSIS sama dengan kunci Nama Lengkap di atas (kunci per nomor akun,
   membersihkan diri saat sudah lewat, popup penjelas saat masih terkunci) —
   yang berbeda cuma durasinya dan teksnya. Sengaja tidak digabung jadi satu
   fungsi ber-parameter: keduanya menyimpan di kunci berbeda dan punya
   popup sendiri, dan menggabungkannya akan membuat perubahan pada salah
   satu diam-diam mengubah yang lain.

   BATAS FRONTEND — PENTING: gerbang di sini melindungi ALUR DI APP, bukan
   datanya. Penegakan yang sesungguhnya HARUS ada di endpoint ganti nomor
   (kolom `nomor_hp_diubah_pada`), karena localStorage bisa dihapus member.
   Backend belum bisa dikerjakan dari repo ini — lihat laporan.
   =========================================================================== */

/* SATU implementasi untuk DUA field (nomor ponsel & alamat email) — dulu
   nomor ponsel punya salinannya sendiri, dan menambah email berarti
   menyalinnya untuk KETIGA kalinya (setelah aturan Nama 1x/7 hari).
   Salinan ketiga itu persis cara aturan yang satu berubah diam-diam tanpa
   yang lain ikut. Yang dibedakan cuma isi tabel di bawah.

   Aturan Nama Lengkap (7 hari) SENGAJA tetap terpisah: durasinya beda,
   popupnya punya ilustrasi & nada sendiri ("nama terkunci", bukan
   "keamanan akun"), dan ia dipicu dari BARIS daftar, bukan dari layar
   info. Menggabungkannya akan menambah cabang, bukan mengurangi salinan. */
const UBAH_LOCK_MS = 90 * 24 * 60 * 60 * 1000;      /* 90 hari penuh */

const UBAH_LOCK = {
  phone: {
    prefix: "dikapay:phone:lastChange:",
    judul: "Nomor Ponsel Sedang Terkunci",
    apa: "Nomor ponsel",
  },
  email: {
    prefix: "dikapay:email:lastChange:",
    judul: "Alamat Email Sedang Terkunci",
    apa: "Alamat email",
  },
};

/* Kunci SELALU dinamespace ke nomor akun yang sedang aktif — pola yang
   sama dengan dikapay:devices:<digit> / dikapay:pintx:banned:<digit>.
   Satu HP dipakai banyak akun uji; kunci akun A tidak boleh pernah ikut
   membatasi akun B. */
function ubahLockKey(kind) {
  const conf = UBAH_LOCK[kind];
  const d = digitPhone(profile.phone);
  return conf && d ? conf.prefix + d : "";
}

/* null = boleh diganti sekarang. Selain itu -> { mulai, sampai }.
   Entri yang sudah lewat waktunya dibersihkan sendiri saat dibaca. */
function ubahTerkunciSampai(kind) {
  const k = ubahLockKey(kind);
  if (!k) return null;
  try {
    const v = JSON.parse(localStorage.getItem(k) || "null");
    if (!v || typeof v.sampai !== "number") return null;
    if (v.sampai <= Date.now()) { localStorage.removeItem(k); return null; }
    return v;
  } catch (e) {
    console.error("[akun] gagal membaca status kunci " + kind + ":", e);
    return null;
  }
}

/* Untuk NOMOR: dicatat DI BAWAH nomor BARU — begitu nomornya berganti,
   kuncinya ikut nomor yang sekarang dipakai. Kalau dicatat di nomor lama,
   member bisa langsung ganti lagi karena kunci nomor baru masih kosong.
   Untuk EMAIL: nomor akunnya tidak berubah, jadi tidak ada bedanya. */
function catatPerubahanUbah(kind) {
  const k = ubahLockKey(kind);
  if (!k) { console.error("[akun] tidak ada nomor akun — kunci " + kind + " TIDAK bisa dicatat."); return; }
  const mulai = Date.now();
  try { localStorage.setItem(k, JSON.stringify({ mulai: mulai, sampai: mulai + UBAH_LOCK_MS })); }
  catch (e) { console.error("[akun] gagal menyimpan status kunci " + kind + ":", e); }
}

const BULAN_ID = ["Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

function tanggalPanjang(ms) {
  const d = new Date(ms);
  return d.getDate() + " " + BULAN_ID[d.getMonth()] + " " + d.getFullYear();
}

/* Popup penjelas — SATU markup dipakai kedua field, teksnya diisi dari
   UBAH_LOCK. Menutupnya tidak mengubah apa pun: ini pemberitahuan. */
let ubahlockTimer = 0;
function tampilkanUbahlock(kind, info) {
  const conf = UBAH_LOCK[kind];
  const ov = $("phonelockOverlay");
  if (!conf || !ov) return;
  $("phonelockTitle").textContent = conf.judul;
  $("phonelockApa").textContent = conf.apa;
  const nilai = $("phonelockCountdown");
  function render() {
    const sisa = info.sampai - Date.now();
    if (sisa <= 0) { tutupUbahlock(); return; }
    nilai.textContent = formatSisaHari(sisa);
  }
  render();
  if (ubahlockTimer) window.clearInterval(ubahlockTimer);
  ubahlockTimer = window.setInterval(render, 30000);
  void ov.offsetWidth;
  ov.classList.add("is-open");
  document.documentElement.style.overflow = "hidden";
}
function tutupUbahlock() {
  if (ubahlockTimer) { window.clearInterval(ubahlockTimer); ubahlockTimer = 0; }
  const ov = $("phonelockOverlay");
  if (ov) ov.classList.remove("is-open");
  document.documentElement.style.overflow = flowStack.length ? "hidden" : "";
}

/* ===========================================================================
   Layar info ID (Nomor Ponsel / Alamat Email)
   TAMPILAN saja — fungsinya tetap membuka editor yang sudah ada. Isi
   layarnya data-driven dari ID_INFO supaya kedua varian tidak jadi dua
   salinan markup yang bisa berbeda sendiri.
   =========================================================================== */

const ART_HP =
  '<svg viewBox="0 0 120 120" fill="none" aria-hidden="true">' +
  '<circle cx="60" cy="60" r="46" fill="#E7EDFB"/>' +
  '<rect x="43" y="26" width="34" height="62" rx="7" fill="#fff" stroke="#C4D2F0" stroke-width="3"/>' +
  '<path d="M55 33h10" stroke="#C4D2F0" stroke-width="3" stroke-linecap="round"/>' +
  '<circle cx="60" cy="80" r="3" fill="#C4D2F0"/>' +
  '<circle cx="82" cy="40" r="14" fill="#FFC93C"/>' +
  '<path d="M76.5 40.5 80.5 44.5 88 36.5" stroke="#0B2447" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' +
  "</svg>";

const ART_EMAIL =
  '<svg viewBox="0 0 120 120" fill="none" aria-hidden="true">' +
  '<circle cx="60" cy="60" r="46" fill="#E7EDFB"/>' +
  '<rect x="30" y="42" width="60" height="40" rx="7" fill="#fff" stroke="#C4D2F0" stroke-width="3"/>' +
  '<path d="m33 47 27 20 27-20" stroke="#C4D2F0" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' +
  '<rect x="68" y="60" width="26" height="22" rx="5" fill="#FFC93C"/>' +
  '<path d="M75 60v-4a6 6 0 0 1 12 0v4" stroke="#0B2447" stroke-width="3" stroke-linecap="round"/>' +
  '<circle cx="81" cy="70" r="2.6" fill="#0B2447"/>' +
  "</svg>";

const ID_INFO = {
  phone: {
    head: "Nomor Ponsel",
    art: ART_HP,
    title: "ID DikaPay kamu terdaftar di bawah",
    sub: "Nomor ini dipakai untuk masuk, menerima transfer, dan memulihkan akun.",
    label: "Nomor Ponsel",
    tombol: "Ganti Nomor",
    verified: true,
    rules: [
      "Nomor ponsel hanya bisa diganti <b>1x dalam 90 hari</b>.",
      "Nomor ini juga jadi <b>ID DikaPay</b> kamu — teman yang mengirim saldo memakai nomor ini.",
      "Pastikan nomor barunya aktif dan bisa menerima SMS sebelum diganti.",
    ],
  },
  email: {
    head: "Alamat Email",
    art: ART_EMAIL,
    title: "Alamat email kamu sudah terdaftar!",
    sub: "Email dipakai untuk pemberitahuan penting dan pemulihan akun.",
    label: "Alamat Email",
    tombol: "Ganti Email",
    verified: false,
    rules: [
      "Alamat email hanya bisa diganti <b>1x dalam 90 hari</b>.",
      "Email dipakai sebagai <b>jalur cadangan</b> saat kamu lupa PIN.",
      "Gunakan email yang benar-benar kamu miliki dan sering dibuka.",
      "Satu email sebaiknya dipakai untuk satu akun DikaPay saja.",
    ],
  },
};

let idInfoKind = null;

/* "Terakhir diganti" — informasi yang diminta tampil di layar ini.
   Sekarang berlaku untuk KEDUA field: nomor ponsel DAN alamat email
   sama-sama dibatasi 1x per 90 hari. */
function gambarTerakhirDiganti() {
  const last = $("idInfoLast");
  if (!last) return;
  if (!UBAH_LOCK[idInfoKind]) { last.hidden = true; last.textContent = ""; return; }

  const info = ubahTerkunciSampai(idInfoKind);     /* masih terkunci? */
  let catatan = info;
  if (!catatan) {
    /* Sudah lewat 90 hari: entrinya sudah dibersihkan ubahTerkunciSampai(),
       jadi tanggalnya memang tidak ada lagi — itu sebabnya "Tidak pernah"
       bisa muncul untuk field yang dulu pernah diganti. Konsekuensi yang
       disengaja: kita tidak menyimpan riwayat lebih lama dari kuncinya.
       Tanggal yang AKURAT nanti datang dari kolom `nomor_hp_diubah_pada` /
       `email_diubah_pada` di backend — lihat catatan di gerbang tombol. */
    catatan = null;
  }
  last.hidden = false;
  last.innerHTML = catatan
    ? "Terakhir diganti: <b>" + tanggalPanjang(catatan.mulai) + "</b>" +
      " · bisa ganti lagi mulai <b>" + tanggalPanjang(catatan.sampai) + "</b>"
    : "Terakhir diganti: <b>Tidak pernah</b>";
}

/* Menggambar ulang layar info yang SEDANG terbuka, tanpa mendorong flow
   baru ke tumpukan. */
function openIdInfoRefresh() {
  const kind = idInfoKind;
  if (!kind) return;
  const conf = ID_INFO[kind];
  if (!conf) return;
  const nilai = kind === "phone" ? (profile.phone || "") : (profile.email || "");
  $("idInfoValue").textContent = nilai || "Belum diisi";
  $("idInfoBadge").hidden = !(conf.verified && nilai);
  $("idInfoBtn").textContent = nilai ? conf.tombol : "Pasang Sekarang";
  if (kind === "phone") gambarTerakhirDiganti();
}

function openIdInfo(kind) {
  const conf = ID_INFO[kind];
  if (!conf) return;
  idInfoKind = kind;

  $("idInfoHead").textContent = conf.head;
  $("idInfoArt").innerHTML = conf.art;
  $("idInfoTitle").textContent = conf.title;
  $("idInfoSub").textContent = conf.sub;
  $("idInfoLabel").textContent = conf.label;

  const nilai = kind === "phone" ? (profile.phone || "") : (profile.email || "");
  $("idInfoValue").textContent = nilai || "Belum diisi";
  /* Badge "Terverifikasi" HANYA untuk nomor HP — satu-satunya yang benar
     benar dibuktikan lewat OTP saat pendaftaran, dan cuma kalau memang
     sudah terisi. Aturan yang sama dengan badge di editor. */
  $("idInfoBadge").hidden = !(conf.verified && nilai);

  $("idInfoBtn").textContent = nilai ? conf.tombol : "Pasang Sekarang";
  $("idInfoRules").innerHTML = conf.rules
    .map((t) => '<li class="idinfo__rule">' + t + "</li>").join("");

  gambarTerakhirDiganti();
  openFlowStacked("idInfoFlow");
}

/* ---- Sub-editor satu field (Nama Lengkap / Username / Nomor Ponsel / Email) */

const editFieldState = { kind: null };
const EF_CONF = {
  name:     { title: "Nama Lengkap", label: "Nama Lengkap", type: "text", inputmode: "text", auto: "name" },
  username: { title: "Username", label: "Username", type: "text", inputmode: "text", auto: "off" },
  phone:    { title: "Ubah Nomor Ponsel", label: "Nomor Ponsel", type: "tel", inputmode: "tel", auto: "tel" },
  email:    { title: "Alamat Email", label: "Alamat Email", type: "email", inputmode: "email", auto: "email" },
};
function openEditField(kind) {
  const conf = EF_CONF[kind];
  if (!conf) return;
  editFieldState.kind = kind;
  $("efTitle").textContent = conf.title;
  $("efLabel").textContent = conf.label;
  const input = $("efInput");
  input.type = conf.type;
  input.setAttribute("inputmode", conf.inputmode);
  input.setAttribute("autocomplete", conf.auto);
  input.value = kind === "name" ? (profile.name || "")
    : kind === "username" ? (profile.username || "")
    : kind === "phone" ? (profile.phone || "")
    : (profile.email || "");
  $("efHint").textContent = kind === "name"
    ? "Nama ini cuma bisa diubah lagi 7 hari setelah disimpan."
    : kind === "username"
    ? "3–20 karakter: huruf kecil, angka, atau garis bawah."
    : kind === "phone"
    ? "Nomor ini juga dipakai sebagai ID DikaPay kamu."
    : "";
  /* Badge "Terverifikasi" HANYA untuk nomor HP — satu-satunya field di
     sini yang benar-benar dibuktikan lewat OTP saat pendaftaran. */
  const badge = $("efBadge");
  badge.hidden = kind !== "phone";
  $("efField").classList.toggle("ff--badge", kind === "phone");
  edClearErrors();
  openFlowStacked("editFieldFlow");
  if (!REDUCED_MOTION) setTimeout(() => { try { input.focus(); } catch (e) {} }, 320);
}
function saveEditField() {
  const kind = editFieldState.kind;
  const raw = $("efInput").value.trim();
  edClearErrors();

  if (kind === "name") {
    if (raw.length < 3) { edFieldError("efInput", "Nama terlalu pendek."); return; }
    return commitEditField(() => { profile.name = raw; catatPerubahanNama(); });
  }
  if (kind === "username") {
    const uname = raw.toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(uname)) {
      edFieldError("efInput", "Pakai 3–20 karakter: huruf kecil, angka, atau garis bawah saja."); return;
    }
    return commitEditField(() => { profile.username = uname; });
  }
  /* ======== Nomor Ponsel & Email: WAJIB lewat verifikasi kode dulu =======
     Keduanya adalah jalur PEMULIHAN akun (lupa PIN) sekaligus ID DikaPay.
     Mengizinkan penggantiannya hanya dengan mengetik nilai baru berarti
     siapa pun yang sempat memegang HP yang tidak terkunci bisa memindahkan
     akun itu ke nomor/email miliknya.

     Kodenya MASIH SIMULASI (ditampilkan di layar, tidak dikirim lewat
     SMS/email sungguhan) — lihat mintaOtpSimulasi(). Yang sudah nyata
     adalah ALURNYA; tinggal menukar sumber kodenya saat endpoint OTP ada. */
  if (kind === "phone") {
    const digits = digitPhone(raw);
    if (digits.length < 9) { edFieldError("efInput", "Nomor HP terlalu pendek."); return; }
    const baru = prettyPhoneLocal(digits);
    if (baru === profile.phone) { edFieldError("efInput", "Nomor ini sama dengan yang sekarang."); return; }
    return mintaOtpSimulasi({
      kind: "phone",
      judul: "Verifikasi Nomor Baru",
      tujuan: baru,
      lead: "Kami kirim kode ke " + baru + ". Masukkan 6 digitnya untuk memastikan nomor ini benar milikmu.",
      onSah: () => commitEditField(() => {
        profile.phone = baru;
        /* Dicatat SESUDAH profile.phone diganti — phoneLockKey() memakai
           nomor yang sedang aktif, jadi kuncinya menempel ke nomor BARU. */
        catatPerubahanUbah("phone");
      }),
    });
  }
  if (kind === "email") {
    if (!validEmail(raw)) {
      edFieldError("efInput", "Saat ini DikaPay hanya mendukung pendaftaran dengan email Gmail (@gmail.com) untuk memastikan verifikasi berjalan lancar. Yuk gunakan email Gmail kamu ya!");
      return;
    }
    if (raw.toLowerCase() === String(profile.email || "").toLowerCase()) {
      edFieldError("efInput", "Email ini sama dengan yang sekarang."); return;
    }
    return mintaOtpSimulasi({
      kind: "email",
      judul: "Verifikasi Email Baru",
      tujuan: raw,
      lead: "Kami kirim kode ke " + raw + ". Masukkan 6 digitnya untuk memastikan email ini benar milikmu.",
      onSah: () => commitEditField(() => {
        profile.email = raw;
        catatPerubahanUbah("email");
      }),
    });
  }
}

/* ===================== OTP SIMULASI (#otpSimFlow) =========================
   MASIH SIMULASI, DAN DITANDAI JELAS DI LAYAR. Kode 6 digit dibuat di
   perangkat, ditampilkan di kotak berlabel "(simulasi)", dan TIDAK PERNAH
   dikirim lewat SMS/email. Pola yang sama dengan OTP pendaftaran di
   auth-flow.js — supaya member tidak menemui dua gaya OTP yang berbeda.

   Yang perlu ditukar saat OTP sungguhan ada: `kode` diisi dari respons
   backend (bukan dibuat di sini), dan kotak `#otpSimKode` DIHAPUS. Seluruh
   sisa alurnya — layar, animasi, gerbang 90 hari, commit — tidak berubah.

   Kenapa tidak langsung memakai flow 2FA yang sudah ada: alur itu punya
   state sendiri (`tfa.active`, layar metode & konfeti) yang menjawab
   pertanyaan berbeda ("aktifkan 2FA"), dan menumpanginya berarti dua fitur
   berbagi satu state yang bisa saling merusak. */
const otpSim = { kode: "", buf: "", onSah: null, kind: null, aktif: false };

function otpSimStep(nama) {
  document.querySelectorAll("#otpSimFlow .otpsim-step").forEach((el) => {
    el.hidden = el.dataset.step !== nama;
  });
}

function otpSimRenderBoxes() {
  const boxes = document.querySelectorAll("#otpSimBoxes input");
  boxes.forEach((b, i) => { b.value = otpSim.buf[i] || ""; });
}

function otpSimBuatKode() {
  /* 6 digit, tidak pernah berawalan 0 supaya panjangnya selalu terbaca 6. */
  otpSim.kode = String(Math.floor(100000 + Math.random() * 900000));
  const el = $("otpSimNilai");
  if (el) el.textContent = otpSim.kode;
  console.info("[akun] OTP SIMULASI dibuat untuk " + otpSim.kind + ":", otpSim.kode,
    "(tidak dikirim ke mana pun — ini simulasi)");
}

function mintaOtpSimulasi(o) {
  otpSim.kode = "";
  otpSim.buf = "";
  otpSim.onSah = o.onSah;
  otpSim.kind = o.kind;
  otpSim.aktif = true;

  $("otpSimTitle").textContent = o.judul;
  $("otpSimLead").textContent = o.lead;
  $("otpSimKirimLead").textContent = "Menyiapkan kode verifikasi…";
  otpSimRenderBoxes();
  otpSimStep("kirim");
  openFlowStacked("otpSimFlow");

  /* Jeda singkat "mengirim" — bukan hiasan: tanpa jeda, kode muncul di
     detik yang sama saat layar dibuka dan terasa seperti tidak ada proses
     apa pun. REDUCED_MOTION tetap diberi jeda minimum supaya urutannya
     terbaca. */
  setTimeout(() => {
    if (!otpSim.aktif) return;
    otpSimBuatKode();
    otpSimStep("isi");
    if (!REDUCED_MOTION) {
      setTimeout(() => {
        try { document.querySelector("#otpSimBoxes input").focus(); } catch (e) {}
      }, 260);
    }
  }, REDUCED_MOTION ? 180 : 900);
}

function otpSimVerifikasi() {
  if (otpSim.buf.length < 6) {
    showTopToast("Kodenya masih kurang 6 digit.", true);
    return;
  }
  if (otpSim.buf !== otpSim.kode) {
    const box = $("otpSimBoxes");
    box.classList.remove("is-shake");
    void box.offsetWidth;
    box.classList.add("is-shake");
    otpSim.buf = "";
    otpSimRenderBoxes();
    showTopToast("Kodenya belum cocok. Coba lagi, ya.", true);
    return;
  }
  const lanjut = otpSim.onSah;
  otpSim.aktif = false;
  otpSim.kode = "";
  otpSim.buf = "";
  otpSim.onSah = null;
  /* Layar OTP ditutup dulu supaya commitEditField() menutup EDITOR-nya,
     bukan layar OTP yang masih menumpuk di atasnya. */
  hideFlow();
  setTimeout(() => { try { if (lanjut) lanjut(); } catch (e) { console.error("[akun] lanjutan OTP gagal:", e); } },
    REDUCED_MOTION ? 0 : 260);
}

function wireOtpSim() {
  const boxes = document.querySelectorAll("#otpSimBoxes input");
  boxes.forEach((b, i) => {
    b.addEventListener("input", () => {
      const d = b.value.replace(/\D/g, "").slice(-1);
      b.value = d;
      const arr = otpSim.buf.split("");
      arr[i] = d;
      otpSim.buf = arr.join("").slice(0, 6);
      if (d && boxes[i + 1]) boxes[i + 1].focus();
      if (otpSim.buf.replace(/\s/g, "").length === 6) {
        /* Auto-verifikasi saat digit ke-6 diisi — kebiasaan OTP yang sudah
           dipakai di alur pendaftaran. */
        setTimeout(otpSimVerifikasi, 180);
      }
    });
    b.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !b.value && boxes[i - 1]) boxes[i - 1].focus();
    });
  });
  $("otpSimVerifyBtn").addEventListener("click", otpSimVerifikasi);
  $("otpSimUlang").addEventListener("click", () => {
    otpSim.buf = "";
    otpSimRenderBoxes();
    otpSimBuatKode();
    showTopToast("Kode baru dibuat (simulasi).");
  });
}

/* ===================== PEMICU PANEL DEBUG SEMENTARA ========================
   Tekan & tahan teks versi di "Tentang DikaPay" ±700ms -> buka
   debug-panel.js. Long-press dipilih (bukan multi-tap) supaya tidak
   ketukan biasa membuka ini tidak sengaja, dan lebih mudah dijelaskan ke
   penguji lewat screenshot: "tahan aja teks versinya sebentar".

   SENGAJA tidak ada tombol terlihat — ini alat diagnosa sementara, bukan
   fitur. Boleh dihapus bersama debug-panel.js kalau sudah tidak dipakai. */
function wireDebugPanelTrigger() {
  const el = document.querySelector(".about__ver");
  if (!el || !window.DikaDebugPanel) return;
  let timer = null;
  const mulai = () => {
    batal();
    timer = setTimeout(() => { window.DikaDebugPanel.buka(); }, 700);
  };
  const batal = () => { if (timer) { clearTimeout(timer); timer = null; } };
  el.addEventListener("pointerdown", mulai);
  el.addEventListener("pointerup", batal);
  el.addEventListener("pointerleave", batal);
  el.addEventListener("pointercancel", batal);
  /* Jangan biarkan long-press memicu context-menu/seleksi teks bawaan. */
  el.addEventListener("contextmenu", (e) => e.preventDefault());
  el.style.userSelect = "none";
  el.style.webkitUserSelect = "none";
}
function commitEditField(apply) {
  const btn = $("efSaveBtn");
  btn.classList.add("is-loading");
  btn.disabled = true;
  setTimeout(() => {
    let saved = false;
    try {
      apply();
      try { localStorage.setItem("dikapay:profile", JSON.stringify(profile)); } catch (e) {}
      renderHeader();
      renderDataDiriList();
      /* Layar info ID masih terbuka di bawah editor — nilainya ikut
         disegarkan, kalau tidak member kembali ke layar yang masih
         memajang nomor/email lamanya. */
      if (idInfoKind && flowStack.indexOf($("idInfoFlow")) !== -1) openIdInfoRefresh();
      saved = true;
    } catch (err) {
      console.error("[akun] simpan data diri:", err);
    } finally {
      btn.classList.remove("is-loading");
      btn.disabled = false;
    }
    if (saved) {
      hideFlow();
      showTopToast("Profil berhasil diperbarui!");
    } else {
      showTopToast("Gagal menyimpan. Coba lagi.", true);
    }
  }, 700);
}

/* Bottom sheet pilih foto */
function openPicker() {
  const p = $("photoPicker");
  void p.offsetWidth;
  p.classList.add("is-open");
  registerSheet(closePicker);
}
function closePicker(fromPop) {
  const p = $("photoPicker");
  if (!p.classList.contains("is-open")) return;
  p.classList.remove("is-open");
  if (!fromPop) unregisterSheet();
}

/* Toast sukses dari atas */
let topToastTimer = null;
function showTopToast(msg, isErr) {
  const t = $("topToast");
  if (!t) return;
  t.textContent = (isErr ? "⚠ " : "✓ ") + msg;
  t.classList.toggle("is-err", !!isErr);
  t.classList.add("is-show");
  clearTimeout(topToastTimer);
  topToastTimer = setTimeout(() => t.classList.remove("is-show"), 2800);
}

/* ===========================================================================
   Alamat Tersimpan + deteksi lokasi (GPS + reverse geocoding Nominatim)
   =========================================================================== */

const ADDR_PIN_IC = svgIc('<path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>');
const ADDR_X_IC = svgIc('<path d="M6 6l12 12M18 6 6 18"/>');

let ADDRESSES = [
  { id: "a1", label: "Rumah", text: "Jl. Melati No. 12, RT 03/RW 05, Kelurahan Sukamaju, Kecamatan Cilodong, Kota Depok, Jawa Barat 16414" },
];
try {
  const s = localStorage.getItem("dikapay:addresses");
  if (s) ADDRESSES = JSON.parse(s);
} catch (e) {}

function persistAddr() {
  try { localStorage.setItem("dikapay:addresses", JSON.stringify(ADDRESSES)); } catch (e) {}
}
function escHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function renderAddrList(markNew) {
  const list = $("addrList");
  if (!ADDRESSES.length) {
    list.innerHTML = "";
    $("addrEmpty").hidden = false;
    return;
  }
  $("addrEmpty").hidden = true;
  list.innerHTML = ADDRESSES.map((a, i) => `
    <li class="addr-item${markNew && i === 0 ? " addr-item--new" : ""}" data-id="${escHtml(a.id)}">
      <span class="addr-item__ic" aria-hidden="true">${ADDR_PIN_IC}</span>
      <span class="addr-item__body">
        <span class="addr-item__label">${escHtml(a.label)}</span>
        <span class="addr-item__text">${escHtml(a.text)}</span>
      </span>
      <button class="addr-item__del" type="button" data-del="${escHtml(a.id)}" aria-label="Hapus alamat">${ADDR_X_IC}</button>
    </li>`).join("");
}

function deleteAddr(id) {
  const li = $("addrList").querySelector('[data-id="' + id + '"]');
  if (li) li.classList.add("is-out");
  setTimeout(() => {
    ADDRESSES = ADDRESSES.filter((a) => a.id !== id);
    persistAddr();
    renderAddrList(false);
  }, 300);
  toast("Alamat dihapus.");
}

/* ---- Fade antar state loading / form ---- */

// Tiga state saling-eksklusif dalam alur "Tambah Alamat": loading / error / form.
// Hanya SATU yang boleh tampil dalam satu waktu.
const ADDR_STATES = ["addrLoading", "addrErrState", "addrFormState"];

function addrFadeIn(elm) {
  elm.hidden = false;
  if (REDUCED_MOTION) return;
  elm.classList.add("addr-state--fading");
  requestAnimationFrame(() => requestAnimationFrame(() => elm.classList.remove("addr-state--fading")));
}

function addrShowState(id) {
  const next = $(id);
  if (!next) return;

  // Sembunyikan SEMUA state lain seketika — jaminan hanya satu yang tampil.
  ADDR_STATES.forEach((sid) => {
    if (sid === id) return;
    const el = $(sid);
    if (el) { el.hidden = true; el.classList.remove("addr-state--fading"); }
  });

  addrFadeIn(next);
}

/* ---- Validasi form alamat ---- */

function addrClearErrors() {
  document.querySelectorAll("#addrFormFlow .ff").forEach((ff) => {
    ff.classList.remove("is-error", "is-shake");
    ff.querySelector(".ff__err").textContent = "";
  });
}
function addrFieldErr(id, msg) {
  const ff = $(id).closest(".ff");
  ff.querySelector(".ff__err").textContent = msg;
  ff.classList.add("is-error");
  ff.classList.remove("is-shake");
  void ff.offsetWidth;
  ff.classList.add("is-shake");
  setTimeout(() => ff.classList.remove("is-shake"), 420);
}

/* ---- GPS + reverse geocoding ---- */

const ADDR_ERR_MSG = {
  permission:
    "Izin lokasi belum aktif. Aktifkan izin Lokasi lewat Pengaturan aplikasi, atau tambahkan alamat secara manual saja.",
  unavailable:
    "Perangkat tidak bisa menentukan lokasi saat ini (sinyal GPS/jaringan lemah). Coba di dekat jendela, atau tambahkan alamat manual.",
  gpstimeout:
    "Pencarian lokasi memakan waktu terlalu lama. Pastikan GPS aktif lalu coba lagi, atau tambahkan alamat manual.",
  nettimeout:
    "Server peta tidak merespons (koneksi lambat atau diblokir). Coba lagi beberapa saat, atau tambahkan alamat manual.",
  net:
    "Gagal menghubungi server peta. Periksa koneksi internet kamu, lalu coba lagi — atau tambahkan alamat manual.",
  empty:
    "Lokasi kamu terdeteksi, tapi alamatnya tidak ditemukan di peta. Silakan tambahkan alamat secara manual.",
  generic:
    "Kami tidak bisa mengambil alamat dari lokasi kamu. Coba lagi, atau tambahkan alamat secara manual.",
};

function showAddrErr(reason) {
  const key = ADDR_ERR_MSG[reason] ? reason : "generic";
  const t = $("addrErrText");
  if (t) t.textContent = ADDR_ERR_MSG[key];
  console.error("[akun] alamat GPS gagal — alasan:", reason || "generic");
  addrShowState("addrErrState");
}

// Token generasi: tiap kali alur lokasi dimulai ulang, geoGen naik.
// Respons fetch/GPS yang datang terlambat (generasi lama) diabaikan.
let geoGen = 0;
let geoAbort = null;

function reverseGeocode(lat, lon, gen) {
  // Catatan: header User-Agent tidak dapat di-set dari fetch browser (forbidden header);
  // browser mengirim UA & Origin miliknya sendiri, cukup untuk kebijakan Nominatim.
  let ctrl = null;
  let timer = null;
  let timedOut = false;
  try {
    ctrl = new AbortController();
    geoAbort = ctrl;
    timer = setTimeout(() => { timedOut = true; try { ctrl.abort(); } catch (e) {} }, 15000);
  } catch (e) { ctrl = null; }

  fetch(
    "https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1&lat=" +
      encodeURIComponent(lat) + "&lon=" + encodeURIComponent(lon),
    ctrl ? { headers: { Accept: "application/json" }, signal: ctrl.signal }
         : { headers: { Accept: "application/json" } }
  )
    .then((r) => { if (!r.ok) throw new Error("http " + r.status); return r.json(); })
    .then((data) => {
      if (timer) { clearTimeout(timer); timer = null; }
      if (gen !== geoGen) return; // alur sudah di-reset / ditinggalkan
      if (!data || !data.display_name) { showAddrErr("empty"); return; }
      $("addrText").value = data.display_name;
      $("addrLabel").value = "";
      $("addrIntro").textContent =
        "Alamat berikut terdeteksi otomatis dari lokasi kamu. Periksa dan sesuaikan bila kurang tepat, lalu beri label.";
      $("addrFormTitle").textContent = "Konfirmasi Alamat";
      addrClearErrors();
      addrShowState("addrFormState");
    })
    .catch((err) => {
      if (timer) { clearTimeout(timer); timer = null; }
      if (gen !== geoGen) return;
      let reason = "net";
      if (timedOut || (err && err.name === "AbortError")) reason = "nettimeout";
      console.error("[akun] reverse geocode gagal:", err);
      showAddrErr(reason);
    });
}

/* ---- Ambil lokasi ---------------------------------------------------
   DUA JALUR, dipilih otomatis:
     - APK  -> @capacitor/geolocation (izin runtime Android sungguhan)
     - Web  -> navigator.geolocation (dialog izin bawaan browser)

   Kenapa tidak cukup navigator.geolocation saja: di WebView Android, API
   itu hanya berhasil kalau izin lokasi NATIVE app sudah diberikan DAN
   WebView-nya meneruskan izin tersebut. Kalau app belum pernah meminta
   ACCESS_FINE_LOCATION, panggilannya langsung gagal dengan
   PERMISSION_DENIED — persis gejalanya: "izin lokasi ditolak" padahal GPS
   HP menyala. Izinnya memang tidak pernah diminta ke sistem. */

function capPlugin(nama) {
  try {
    const P = window.Capacitor && window.Capacitor.Plugins;
    return (P && P[nama]) || null;
  } catch (e) { return null; }
}

function isNativeApp() {
  return !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === "function" &&
    window.Capacitor.isNativePlatform());
}

function runGeo() {
  const gen = ++geoGen;
  if (geoAbort) { try { geoAbort.abort(); } catch (e) {} geoAbort = null; }
  addrShowState("addrLoading");

  const Geo = capPlugin("Geolocation");
  if (isNativeApp() && Geo) { runGeoNative(Geo, gen); return; }

  if (!navigator.geolocation) { showAddrErr("unavailable"); return; }
  try {
    navigator.geolocation.getCurrentPosition(
      (pos) => { if (gen === geoGen) reverseGeocode(pos.coords.latitude, pos.coords.longitude, gen); },
      (err) => {
        if (gen !== geoGen) return;
        // 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT
        let reason = "unavailable";
        if (err && err.code === 1) reason = "permission";
        else if (err && err.code === 3) reason = "gpstimeout";
        console.error("[akun] getCurrentPosition gagal — code:", err && err.code, err && err.message);
        showAddrErr(reason);
      },
      { enableHighAccuracy: false, timeout: 20000, maximumAge: 60000 }
    );
  } catch (e) {
    console.error("[akun] getCurrentPosition error:", e);
    showAddrErr("generic");
  }
}

/* Alur native: cek izin -> minta kalau belum -> ambil koordinat.
   Alias plugin: `location` (ACCESS_FINE + COARSE) dan `coarseLocation`.
   Lokasi perkiraan sudah cukup untuk mengisi alamat, jadi keduanya
   diterima — memaksa lokasi presisi hanya memperbesar peluang ditolak. */
function runGeoNative(Geo, gen) {
  const sah = (s) => s === "granted" || s === "limited";
  const ambilStatus = (r) => (r && (sah(r.location) ? r.location : r.coarseLocation)) || null;

  Promise.resolve()
    .then(() => Geo.checkPermissions())
    .then((hasil) => {
      if (sah(ambilStatus(hasil))) return true;
      /* `denied` belum tentu permanen — dialognya bisa saja memang belum
         pernah muncul. Tetap coba minta; kalau permanen, hasilnya tetap
         denied dan barulah kita tampilkan pesan. */
      return Promise.resolve(Geo.requestPermissions({ permissions: ["location", "coarseLocation"] }))
        .then((baru) => sah(ambilStatus(baru)));
    })
    .then((ok) => {
      if (gen !== geoGen) return;
      if (!ok) { showAddrErr("permission"); return; }
      return Promise.resolve(
        Geo.getCurrentPosition({ enableHighAccuracy: false, timeout: 20000, maximumAge: 60000 })
      ).then((pos) => {
        if (gen !== geoGen) return;
        const c = pos && pos.coords;
        if (!c) { showAddrErr("unavailable"); return; }
        reverseGeocode(c.latitude, c.longitude, gen);
      });
    })
    .catch((e) => {
      if (gen !== geoGen) return;
      console.error("[akun] Geolocation native gagal:", e);
      const pesan = String((e && e.message) || "").toLowerCase();
      /* Bedakan "GPS mati / tidak dapat sinyal" dari "izin ditolak" —
         dua masalah berbeda dengan dua solusi berbeda bagi member. */
      if (pesan.indexOf("denied") >= 0 || pesan.indexOf("permission") >= 0) showAddrErr("permission");
      else if (pesan.indexOf("timeout") >= 0) showAddrErr("gpstimeout");
      else showAddrErr("unavailable");
    });
}

function startGps() {
  $("addrFormTitle").textContent = "Konfirmasi Alamat";
  openFlowStacked("addrFormFlow");
  runGeo();
}

function startManualAddr() {
  // Batalkan alur GPS yang mungkin masih berjalan supaya respons lambat
  // tidak menimpa alamat yang sedang diisi manual.
  geoGen++;
  if (geoAbort) { try { geoAbort.abort(); } catch (e) {} geoAbort = null; }
  $("addrFormTitle").textContent = "Tambah Alamat";
  $("addrText").value = "";
  $("addrLabel").value = "";
  $("addrIntro").textContent = "Isi alamat lengkap kamu, lalu beri label seperti “Rumah” atau “Kantor”.";
  addrClearErrors();
  openFlowStacked("addrFormFlow");
  addrShowState("addrFormState");
}

function saveAddr() {
  const text = $("addrText").value.trim();
  const label = $("addrLabel").value.trim();
  addrClearErrors();
  let ok = true;
  if (!label) { addrFieldErr("addrLabel", "Label alamat wajib diisi."); ok = false; }
  if (!text) { addrFieldErr("addrText", "Alamat lengkap tidak boleh kosong."); ok = false; }
  if (!ok) return;

  const btn = $("addrSaveBtn");
  btn.classList.add("is-loading");
  btn.disabled = true;
  setTimeout(() => {
    let saved = false;
    try {
      ADDRESSES.unshift({ id: "a" + Date.now(), label: label, text: text });
      persistAddr();
      renderAddrList(true);
      saved = true;
    } catch (err) {
      console.error("[akun] simpan alamat:", err);
    } finally {
      btn.classList.remove("is-loading");
      btn.disabled = false;
    }
    if (saved) {
      hideFlow();
      showTopToast("Alamat berhasil ditambahkan!");
    } else {
      showTopToast("Gagal menyimpan alamat. Coba lagi.", true);
    }
  }, 700);
}

function openAddrFlow() {
  renderAddrList(false);
  showFlow("addrFlow");
}

/* ===========================================================================
   Bottom navigation
   =========================================================================== */

/* Bottom navigation (indikator + navigasi tab) ditangani bottomnav.js —
   satu implementasi bersama untuk beranda / riwayat / margin / akun. */

/* ===========================================================================
   Skor Keamanan Akun
   Dihitung dari state ASLI toggle/flow di halaman ini — bukan angka statis.
   Dipanggil ulang tiap kali salah satu sumbernya berubah (toggle #swPin,
   2FA selesai) sehingga progress bar & checklist ikut real-time.
   =========================================================================== */

/* 3 indikator. KYC SENGAJA TIDAK ikut skor keamanan (fiturnya tetap ada di
   section "Akun Saya", cuma tidak dihitung di sini). */
const SCORE_ITEMS = [
  { key: "pin",      labelKey: "acc.score.item.pin",      fallback: "PIN Transaksi",
    verb: "buat PIN Transaksi",              prio: 0 },
  { key: "pinEvery", labelKey: "acc.score.item.pinEvery", fallback: "PIN Setiap Transaksi",
    verb: "aktifkan PIN Setiap Transaksi",   prio: 1 },
  { key: "tfa",      labelKey: "acc.score.item.tfa",      fallback: "Verifikasi 2 Langkah",
    verb: "aktifkan Verifikasi 2 Langkah",   prio: 1 },
];

/* Sumber kebenaran tiap indikator — dibaca LANGSUNG saat dipanggil:
   - pin      : `security.pinCreated` — SATU objek yang sama dipakai
                renderPinLabel() untuk label menu. Diset true saat alur
                buat/ubah PIN selesai, dipersist di localStorage.
   - pinEvery : checkbox #swPin (live tiap event 'change').
   - tfa      : tfa.active → true setelah alur 2FA tuntas di tfaVerify(). */
function readSecurity() {
  const sw = $("swPin");
  return {
    pin: !!security.pinCreated,
    pinEvery: !!(sw && sw.checked),
    tfa: !!tfa.active,
  };
}

const SCORE_IC_DONE = svgIc('<circle cx="12" cy="12" r="9"/><path d="m8.4 12 2.5 2.5 4.7-5.2"/>');
const SCORE_IC_TODO = svgIc('<path d="M10.3 3.9 1.8 18.4A2 2 0 0 0 3.5 21.4h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4M12 17h.01"/>');
const SCORE_CHEV =
  '<svg class="score__chev" viewBox="0 0 24 24" width="15" height="15" fill="none" ' +
  'stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="m9 6 6 6-6 6"/></svg>';

let scorePrev = null;
let scoreBuilt = false;
let scoreFillTimer = null;

/* Markup checklist dibangun SEKALI saja. Setiap render berikutnya hanya
   men-toggle class — elemennya TIDAK dibuang, jadi transisi CSS (warna
   kuning→hijau, crossfade ikon) benar-benar punya nilai awal untuk
   dianimasikan. Kedua ikon (warning & centang) ikut dirender lalu
   di-crossfade lewat opacity. */
function buildScoreList(list) {
  const frag = document.createDocumentFragment();
  SCORE_ITEMS.forEach((it) => {
    const li = document.createElement("li");
    li.innerHTML =
      '<button class="score__item" type="button" data-key="' + it.key + '">' +
      '<span class="score__check">' +
      '<span class="score__ic score__ic--todo">' + SCORE_IC_TODO + "</span>" +
      '<span class="score__ic score__ic--done">' + SCORE_IC_DONE + "</span>" +
      "</span>" +
      '<span class="score__label"></span>' +
      SCORE_CHEV +
      "</button>";
    frag.appendChild(li);
  });
  list.innerHTML = "";
  list.appendChild(frag);
  scoreBuilt = true;
}

function renderSecurityScore() {
  const list = $("scoreList");
  const fill = $("scoreFill");
  if (!list || !fill) return;
  if (!scoreBuilt) buildScoreList(list);

  const st = readSecurity();
  const total = SCORE_ITEMS.length;
  const done = SCORE_ITEMS.reduce((n, it) => n + (st[it.key] ? 1 : 0), 0);
  const pct = Math.round((done / total) * 100);
  const firstRender = scorePrev === null;

  /* Status tiap item DULU (sebelum reflow di bawah), supaya pada render
     pertama style awalnya sudah benar dan tidak ada crossfade "palsu". */
  SCORE_ITEMS.forEach((it, i) => {
    const li = list.children[i];
    const btn = li && li.firstElementChild;
    if (!btn) return;
    const ok = !!st[it.key];
    btn.classList.toggle("score__item--done", ok);
    btn.classList.toggle("score__item--todo", !ok);
    btn.disabled = ok;                       // selesai → tidak perlu diklik
    const lbl = btn.querySelector(".score__label");
    if (lbl) lbl.textContent = i18nText(it.labelKey, it.fallback);

    /* Pop bouncy hanya untuk indikator yang BARU berpindah belum → selesai */
    if (ok && !firstRender && !scorePrev[it.key] && !REDUCED_MOTION) {
      const chk = btn.querySelector(".score__check");
      if (chk) {
        chk.classList.remove("score__check--pop");
        void chk.offsetWidth;                // restart animasi walau di-trigger beruntun
        chk.classList.add("score__check--pop");
        chk.addEventListener("animationend",
          () => chk.classList.remove("score__check--pop"), { once: true });
      }
    }
  });

  const bar = $("scoreBar");
  if (bar) bar.setAttribute("aria-valuenow", String(pct));
  const countEl = $("scoreCount");
  if (countEl) countEl.textContent = done + " dari " + total + " selesai";

  /* Bar juga ikut terisi beranimasi saat halaman BARU DIMUAT: paksa browser
     menghitung style awal (width: 0) lalu pasang nilainya sedikit tertunda
     supaya sapuannya jatuh setelah card selesai muncul (.reveal). */
  if (scoreFillTimer) { clearTimeout(scoreFillTimer); scoreFillTimer = null; }
  if (firstRender && !REDUCED_MOTION) {
    void fill.offsetWidth;
    scoreFillTimer = setTimeout(() => {
      scoreFillTimer = null;
      fill.style.width = pct + "%";
    }, 280);
  } else {
    fill.style.width = pct + "%";
  }

  scorePrev = st;

  const msgEl = $("scoreMsg");
  if (!msgEl) return;
  if (done === total) {
    msgEl.textContent = "✅ Akun kamu sudah terlindungi dengan baik!";
    msgEl.className = "score__msg score__msg--ok";
  } else {
    const todo = SCORE_ITEMS.filter((it) => !st[it.key])
      .sort((a, b) => a.prio - b.prio)             // PIN dulu, lalu PIN-setiap-transaksi & 2FA
      .map((it) => it.verb);
    let phrase;
    if (todo.length === 1) phrase = todo[0];
    else if (todo.length === 2) phrase = todo[0] + " dan " + todo[1];
    else phrase = todo.slice(0, -1).join(", ") + ", dan " + todo[todo.length - 1];
    msgEl.textContent =
      "⚠️ Akun kamu belum sepenuhnya aman. Segera " + phrase + " untuk perlindungan maksimal.";
    msgEl.className = "score__msg score__msg--warn";
  }
}

/* Klik item checklist yang BELUM selesai → langsung ke tempat mengaturnya. */
function scoreGoTo(key) {
  if (key === "pin") { openPinFlow(); return; }
  if (key === "tfa") { openTfaFlow(); return; }
  const row = key === "pinEvery" && $("swPin") ? $("swPin").closest(".row") : null;
  if (!row) return;
  try { row.scrollIntoView({ behavior: REDUCED_MOTION ? "auto" : "smooth", block: "center" }); }
  catch (e) { row.scrollIntoView(); }
  row.classList.remove("row--flash");
  void row.offsetWidth;
  row.classList.add("row--flash");
  setTimeout(() => row.classList.remove("row--flash"), 1500);
}

/* ===========================================================================
   Ringkasan Keuangan (uang masuk/keluar) — kartu + diagram (#cashflowFlow)

   Angka HARUS sama dengan kartu "Bulan Ini" Riwayat & donut Statistik —
   ketiganya lewat window.DikaTxRingkas, SATU tempat perhitungan bulanan
   (lihat catatan besar di tx-ringkas.js: "JANGAN menambah perhitungan
   bulanan baru di luar file ini"). akun.js hanya menampilkan hasilnya.

   DATA.TX terisi ASYNC (data.js, backend) — refreshCashflow() dipanggil
   lewat DATA.ready di init(), pola yang sama dengan statistik.js/riwayat.js.
   =========================================================================== */

function fmtRpCf(v) {
  const n = Number(v);
  return "Rp" + Math.round(Math.abs(isFinite(n) ? n : 0)).toLocaleString("id-ID");
}

let cfMonth = null; // ringkasan bulan berjalan, dari DikaTxRingkas.ringkas()

function refreshCashflow() {
  try {
    if (!window.DikaTxRingkas) {
      console.error("[akun] tx-ringkas.js belum di-link — ringkasan keuangan tidak bisa dihitung.");
      return;
    }
    const src = (window.DATA && Array.isArray(window.DATA.TX)) ? window.DATA.TX : [];
    cfMonth = window.DikaTxRingkas.ringkas(src, window.DikaTxRingkas.kunciSekarang());
    $("cfIn").textContent = fmtRpCf(cfMonth.masuk);
    $("cfOut").textContent = fmtRpCf(cfMonth.keluar);
  } catch (err) {
    console.error("[akun] refreshCashflow gagal:", err);
  }
}

/* Digambar ULANG tiap kali flow dibuka (bukan sekali saat halaman dimuat)
   supaya kalau member sempat bertransaksi lalu balik ke Akun, diagramnya
   tidak basi — dan supaya animasi masuknya selalu terpicu lagi, pola yang
   sama dengan `.astep.is-in` di auth-flow.js (lepas-pasang class). */
function buildCashflowDiagram() {
  try {
    const chart = $("cfChart"), legend = $("cfLegend"),
      catsWrap = $("cfCatsWrap"), catsList = $("cfCatsList"), empty = $("cfEmpty");
    const m = cfMonth;

    if (!m || (m.masuk <= 0 && m.keluar <= 0)) {
      chart.hidden = true; legend.hidden = true; catsWrap.hidden = true;
      empty.hidden = false;
      return;
    }
    chart.hidden = false; legend.hidden = false; empty.hidden = true;

    $("cfMonthLabel").textContent = "Ringkasan " + window.DikaTxRingkas.labelBulan(window.DikaTxRingkas.kunciSekarang());

    const total = m.masuk + m.keluar;
    const pctIn = total ? (m.masuk / total) * 100 : 0;
    const pctOut = total ? (m.keluar / total) * 100 : 0;

    const segIn = $("cfSegIn"), segOut = $("cfSegOut");
    // Reset ke 0 dulu tanpa transisi, lalu flush, supaya animasi "menggambar
    // dari nol" benar-benar terpicu tiap kali flow ini dibuka (bukan cuma
    // sekali di kunjungan pertama) — pola yang sama seperti buildDonut()/
    // animateDonut() di statistik.js.
    segIn.style.transition = "none"; segOut.style.transition = "none";
    segIn.style.strokeDasharray = "0 100"; segOut.style.strokeDasharray = "0 100";
    void chart.getBoundingClientRect();
    segIn.style.transition = ""; segOut.style.transition = "";

    segIn.style.strokeDashoffset = "0";
    segIn.style.strokeDasharray = Math.max(pctIn - (pctOut > 0 ? 1.6 : 0), pctIn > 0 ? 0.5 : 0) + " 100";
    segOut.style.strokeDashoffset = String(-pctIn);
    segOut.style.strokeDasharray = Math.max(pctOut - (pctIn > 0 ? 1.6 : 0), pctOut > 0 ? 0.5 : 0) + " 100";

    $("cfMidVal").textContent = fmtRpCf(total);
    $("cfLegIn").textContent = fmtRpCf(m.masuk);
    $("cfLegOut").textContent = fmtRpCf(m.keluar);
    $("cfPctIn").textContent = Math.round(pctIn) + "%";
    $("cfPctOut").textContent = Math.round(pctOut) + "%";

    legend.classList.remove("is-in");
    void legend.offsetWidth;
    legend.classList.add("is-in");

    /* Rincian per kategori — sisi KELUAR saja (paling berguna buat member
       menelusuri ke mana uang perginya). `m.kategori[slug]` bertanda
       (negatif = keluar, lihat tx-ringkas.js), dibalik jadi positif. */
    const CATS = (window.DATA && window.DATA.CATS) || {};
    const rows = Object.keys(m.kategori)
      .map((slug) => ({ slug: slug, val: -m.kategori[slug] }))
      .filter((r) => r.val > 0)
      .sort((a, b) => b.val - a.val)
      .slice(0, 6);

    if (!rows.length) {
      catsWrap.hidden = true;
    } else {
      catsWrap.hidden = false;
      const maxVal = rows[0].val;
      catsList.innerHTML = rows.map((r, i) => {
        const c = CATS[r.slug] || { label: "Transaksi", color: "#6B7488" };
        const w = maxVal ? Math.round((r.val / maxVal) * 100) : 0;
        const delay = REDUCED_MOTION ? 0 : i * 70;
        return '<li class="cfcats__item" style="animation-delay:' + delay + 'ms">' +
          '<span class="cfcats__dot" style="background:' + c.color + '"></span>' +
          '<span class="cfcats__name">' + esc(c.label) + '</span>' +
          '<span class="cfcats__bar"><span data-w="' + w + '" style="background:' + c.color + '"></span></span>' +
          '<span class="cfcats__amt">' + fmtRpCf(r.val) + '</span>' +
          "</li>";
      }).join("");
      // Lebar bar disetel SETELAH elemen ada di DOM (bukan langsung di
      // markup) supaya transisi CSS `width` benar-benar terpicu.
      requestAnimationFrame(() => {
        catsList.querySelectorAll(".cfcats__bar span").forEach((el) => {
          el.style.width = el.dataset.w + "%";
        });
      });
    }
  } catch (err) {
    console.error("[akun] buildCashflowDiagram gagal:", err);
  }
}

/* ===========================================================================
   Init
   =========================================================================== */

function init() {
  try {
    if (window.I18N) window.I18N.apply(document);
    renderLangVal();
    renderHeader();
    refreshDevices();
    renderPinLabel();
    renderSecurityScore();
  } catch (err) {
    console.error("[akun] init/render gagal:", err);
  }

  /* Ringkasan Keuangan: DATA.TX datang async dari backend (data.js), jadi
     kartu mulai di "Rp0" lalu terisi begitu DATA.ready selesai — sama
     seperti pola siapkanTampilan() di statistik.js. */
  try {
    const cfReady = (window.DATA && window.DATA.ready && typeof window.DATA.ready.then === "function")
      ? window.DATA.ready
      : Promise.resolve();
    cfReady.then(refreshCashflow).catch((err) => console.error("[akun] DATA.ready (cashflow):", err));
    $("cashflowBtn").addEventListener("click", () => {
      showFlow("cashflowFlow");
      buildCashflowDiagram();
    });
  } catch (err) {
    console.error("[akun] wiring cashflow gagal:", err);
  }

  document.querySelectorAll(".reveal").forEach((r, i) => {
    r.style.animationDelay = (REDUCED_MOTION ? 0 : 0.05 + i * 0.08) + "s";
  });

  /* Data Diri: baris list -> buka sub-editor SATU field (kecuali foto,
     yang membuka bottom sheet pilih foto yang sudah ada). */
  $("ddPhotoRow").addEventListener("click", openPicker);
  document.querySelectorAll("#editFlow [data-editfield]").forEach((row) =>
    row.addEventListener("click", () => {
      const kind = row.dataset.editfield;
      /* Nama Lengkap SENGAJA tetap sebuah <button> yang bisa diklik walau
         sedang terkunci (bukan `disabled`) — mengetuknya harus tetap
         menjelaskan KENAPA lewat popup, bukan diam tak bereaksi. */
      if (kind === "name") {
        const info = namaTerkunciSampai();
        if (info) { tampilkanNamalock(info); return; }
      }
      /* Nomor Ponsel & Alamat Email TIDAK langsung membuka editor: keduanya
         lewat layar info dulu (nilai saat ini + status verifikasi + aturan),
         supaya member tahu apa yang sedang dia ubah sebelum mengubahnya. */
      if (kind === "phone" || kind === "email") { openIdInfo(kind); return; }
      openEditField(kind);
    })
  );
  /* Layar info ID: tombol "Ganti Nomor"/"Ganti Email" -> editor.
     Gerbang 90 hari dipasang DI SINI (bukan di baris daftar) supaya member
     tetap bisa MELIHAT nomornya & alasan penguncian, dan baru ditahan saat
     benar-benar mencoba menggantinya. */
  $("idInfoBtn").addEventListener("click", () => {
    /* Gerbang 90 hari untuk nomor ponsel DAN alamat email.

       BATAS YANG HARUS DISADARI: ini melindungi ALUR DI APP, bukan
       datanya. Penegakan sesungguhnya harus di endpoint ganti nomor/email
       (kolom `nomor_hp_diubah_pada` / `email_diubah_pada`), karena
       localStorage bisa dihapus member. Endpoint itu BELUM ADA — sudah
       diperiksa ke backend live, lihat laporan. */
    const info = UBAH_LOCK[idInfoKind] ? ubahTerkunciSampai(idInfoKind) : null;
    if (info) { tampilkanUbahlock(idInfoKind, info); return; }
    openEditField(idInfoKind);
  });
  wireOtpSim();
  wireDebugPanelTrigger();
  $("phonelockBtn").addEventListener("click", tutupUbahlock);
  $("phonelockOverlay").addEventListener("click", (e) => {
    if (e.target === $("phonelockOverlay")) tutupUbahlock();
  });
  $("namalockBtn").addEventListener("click", tutupNamalock);
  $("namalockOverlay").addEventListener("click", (e) => {
    if (e.target === $("namalockOverlay")) tutupNamalock();
  });
  $("efSaveBtn").addEventListener("click", saveEditField);
  $("efInput").addEventListener("input", () => {
    $("efInput").closest(".ff").classList.remove("is-error");
    /* SARING SAAT MENGETIK — sama seperti bug yang pernah diperbaiki di
       field nomor HP versi lama (dan di halaman Masuk/Daftar auth-flow.js):
       tanpa saringan, simbol/huruf apa pun lolos ke storage lewat `.trim()`
       polos. Aturannya bergantung field yang sedang dibuka:
         - phone  → digit + dash saja (field ini bisa dibuka dengan nilai
                    sudah berformat "0812-3456-7890"; dash itu pemformatan
                    aplikasi sendiri, bukan sampah yang perlu diblokir)
         - username → huruf kecil, angka, underscore saja
         - email  → tidak disaring saat mengetik (karakter email valid
                    terlalu beragam untuk disaring karakter-per-karakter);
                    validasi penuh tetap terjadi saat Simpan. */
    const input = $("efInput");
    if (editFieldState.kind === "phone") {
      const bersih = input.value.replace(/[^\d-]/g, "").slice(0, 15);
      if (input.value !== bersih) input.value = bersih;
    } else if (editFieldState.kind === "username") {
      const bersih = input.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);
      if (input.value !== bersih) input.value = bersih;
    }
  });
  $("photoPicker").addEventListener("click", (e) => {
    if (e.target === $("photoPicker")) { closePicker(); return; }
    const opt = e.target.closest("[data-photo]");
    if (!opt) return;
    closePicker();
    const sumber = opt.dataset.photo === "camera" ? "camera" : "gallery";
    const F = window.DikaProfilFoto;

    /* JALUR UTAMA (APK): @capacitor/camera — "Ambil Foto" membuka kamera,
       "Pilih dari Galeri" membuka galeri. Plugin mengembalikan data URL
       yang sudah dikecilkan di perangkat.

       JALUR CADANGAN (dibuka sebagai web biasa / plugin tidak tersedia):
       `ambil()` mengembalikan null dan kita jatuh ke <input type="file">
       yang memang sudah ada. Jalur itu SENGAJA dipertahankan supaya
       halaman ini tetap berfungsi di luar APK. */
    if (F && typeof F.ambil === "function") {
      F.ambil(sumber).then((dataUrl) => {
        if (dataUrl) { prosesFotoBaru(dataUrl); return; }
        bukaInputFile(sumber);
      }).catch((err) => {
        /* Dibatalkan member bukan kesalahan — diam saja. */
        if (err && err.batal) return;
        console.error("[akun] ambil foto gagal:", err);
        showTopToast((err && err.pesanMember) || "Kamera belum bisa dibuka. Coba lagi, ya.", true);
      });
      return;
    }
    bukaInputFile(sumber);
  });

  function bukaInputFile(sumber) {
    const inp = $("fotoInput");
    if (!inp) { toast("Pemilih foto belum siap."); return; }
    /* Tanpa plugin, satu-satunya pembeda sumber adalah atribut `capture`:
       dengan capture Android membuka kamera langsung; tanpa capture muncul
       dialog sistem (galeri + kamera). */
    if (sumber === "camera") inp.setAttribute("capture", "user");
    else inp.removeAttribute("capture");
    inp.value = "";           /* pilih file yang SAMA dua kali tetap memicu change */
    inp.click();
  }

  /* ---- Unggah foto profil ---------------------------------------------
     SATU jalur untuk kedua sumber: plugin Camera menyerahkan data URL,
     <input type="file"> menyerahkan File — `DikaProfilFoto.unggah()`
     menerima keduanya, jadi tidak ada dua salinan alur unggah di sini.

     Alurnya sengaja "optimis terukur": member melihat status jelas selama
     unggah, dan avatar baru baru dipasang SETELAH server menjawab dengan
     URL-nya — bukan langsung menampilkan pratinjau lokal yang bisa saja
     tidak pernah benar-benar tersimpan. */
  function prosesFotoBaru(masukan) {
    const F = window.DikaProfilFoto;
    if (!F) { showTopToast("Fitur foto belum siap di versi ini.", true); return; }

    const av = $("avatar");
    if (av) av.classList.add("is-unggah");
    showTopToast("Mengunggah foto…");

    F.unggah(masukan)
      .then(() => {
        F.pasangSemua(profile.name);
        showTopToast("Foto profil berhasil diperbarui!");
      })
      .catch((err) => {
        console.error("[akun] unggah foto profil gagal:", err);
        showTopToast((err && err.pesanMember) || "Foto gagal diunggah. Coba lagi, ya.", true);
      })
      .finally(() => {
        if (av) av.classList.remove("is-unggah");
      });
  }

  const fotoInput = $("fotoInput");
  if (fotoInput) {
    fotoInput.addEventListener("change", () => {
      const file = fotoInput.files && fotoInput.files[0];
      if (!file) return;
      prosesFotoBaru(file);
      fotoInput.value = "";
    });
  }

  /* Bahasa */
  $("langSheet").addEventListener("click", (e) => {
    try {
      if (e.target === $("langSheet")) { closeLangSheet(); return; }
      const opt = e.target.closest("[data-lang]");
      if (opt) pickLang(opt.dataset.lang);
    } catch (err) { console.error("[akun] sheet bahasa:", err); }
  });

  /* Baris menu (delegasi) */
  document.querySelector(".amain").addEventListener("click", (e) => {
    try {
      const row = e.target.closest(".row");
      if (!row) return;

      if (row.dataset.info) { toast('Halaman "' + row.dataset.info + '" segera hadir 😊'); return; }

      switch (row.dataset.act) {
        case "datadiri": openEditFlow(); break;
        case "alamat": openAddrFlow(); break;
        case "pin": openPinFlow(); break;
        case "lupapin": openLupaPinFlow(); break;
        case "tfa": openTfaFlow(); break;
        /* Segarkan dulu: "terakhir aktif" harus benar saat dilihat, bukan
           angka dari kunjungan sebelumnya. */
        case "devices": refreshDevices(); showFlow("devFlow"); break;
        case "lang": openLangSheet(); break;
        case "faq": showFlow("faqFlow"); break;
        case "cs": showFlow("csFlow"); break;
        case "tnc": showFlow("tncFlow"); break;
        case "privacy": showFlow("privacyFlow"); break;
        case "about": showFlow("aboutFlow"); break;
      }
    } catch (err) { console.error("[akun] klik menu:", err); }
  });

  /* Alamat Tersimpan */
  $("addrGpsBtn").addEventListener("click", startGps);
  $("addrAddBtn").addEventListener("click", startManualAddr);
  $("addrSaveBtn").addEventListener("click", saveAddr);
  $("addrList").addEventListener("click", (e) => {
    const d = e.target.closest("[data-del]");
    if (d) deleteAddr(d.dataset.del);
  });
  $("addrErrRetry").addEventListener("click", () => runGeo());
  $("addrErrManual").addEventListener("click", () => startManualAddr());
  ["addrText", "addrLabel"].forEach((id) =>
    $(id).addEventListener("input", () => $(id).closest(".ff").classList.remove("is-error"))
  );

  /* FAQ accordion */
  $("faqList").addEventListener("click", (e) => {
    const q = e.target.closest(".faq-q");
    if (!q) return;
    const item = q.parentElement;
    const a = item.querySelector(".faq-a");
    const open = item.classList.toggle("is-open");
    a.style.maxHeight = open ? a.scrollHeight + "px" : "";
  });

  /* Tombol kontak Customer Service (belum terintegrasi) */
  $("csFlow").addEventListener("click", (e) => {
    if (e.target.closest(".cs-opt")) toast("Fitur ini akan segera terhubung.");
  });

  /* ---- Toggle "Gunakan PIN Setiap Transaksi" (#swPin) -----------------
     Preferensi disimpan di dikapay:settings:pinEvery ("1"/"0", default
     "1"). Dibaca pin-transaksi.js (minta()) untuk memutuskan apakah sheet
     PIN muncul saat transaksi.

     MENYALAKAN bebas (menaikkan keamanan). MEMATIKAN wajib dibuktikan
     dengan Verifikasi PIN dulu — supaya bukan orang lain yang sedang
     pegang HP yang menonaktifkannya. Pola yang sama dengan toggle
     biometrik #swBio di bawah. PIN salah / batal / banned → toggle
     tetap ON. */
  const swPin = $("swPin");
  if (swPin) {
    try {
      swPin.checked = localStorage.getItem("dikapay:settings:pinEvery") !== "0";
    } catch (e) {}
    renderSecurityScore();

    let pinBusy = false;
    swPin.addEventListener("change", () => {
      renderSecurityScore();

      if (swPin.checked) {
        /* Dinyalakan → langsung berlaku, tidak perlu verifikasi. */
        try { localStorage.setItem("dikapay:settings:pinEvery", "1"); } catch (e) {}
        toast("PIN setiap transaksi diaktifkan.");
        renderSecurityScore();
        return;
      }

      /* Dimatikan → tahan dulu, minta Verifikasi PIN. */
      if (pinBusy) return;
      swPin.checked = true;            // kembalikan ke ON sampai PIN terbukti
      renderSecurityScore();

      const PT = window.DikaPinTransaksi;
      if (!PT || typeof PT.minta !== "function") {
        toast("Verifikasi PIN belum tersedia. Coba buka ulang halaman.");
        return;
      }
      pinBusy = true;
      PT.minta({
        paksa: true,                   // selalu tampilkan sheet, abaikan preferensi
        judul: "Verifikasi PIN",
        nama: "Nonaktifkan PIN setiap transaksi",
      }).then((r) => {
        pinBusy = false;
        if (r && r.ok) {
          swPin.checked = false;
          try { localStorage.setItem("dikapay:settings:pinEvery", "0"); } catch (e) {}
          renderSecurityScore();
          toast("PIN setiap transaksi dimatikan.");
        } else {
          swPin.checked = true;
          renderSecurityScore();
          if (r && r.alasan === "banned") return;      // popup banned sudah tampil
          if (r && r.alasan === "sibuk") return;
          if (r && r.alasan === "tanpa-pin") { toast("Kamu belum punya PIN Transaksi."); return; }
          toast("PIN salah atau dibatalkan. Toggle tetap aktif.");
        }
      }).catch((e) => {
        pinBusy = false;
        console.error("[akun] verifikasi PIN swPin gagal:", e);
        swPin.checked = true;
        renderSecurityScore();
        toast("Verifikasi PIN gagal. Toggle tetap aktif.");
      });
    });
  }

  /* Login dengan Biometrik — preferensi device-wide (bukan per-akun; sensor
     sidik jari/Face ID nempel ke PERANGKAT), dibaca auth-flow.js untuk
     menentukan apakah tombol biometrik jadi prioritas utama saat login lain
     kali. SATU-SATUNYA tempat yang menulis kunci ini. */
  const swBio = $("swBio");
  if (swBio) {
    const BIO = window.DikaBiometrik;
    if (!BIO) {
      console.warn("[akun] biometrik.js belum dimuat — toggle biometrik dimatikan.");
      swBio.checked = false;
      swBio.disabled = true;
    } else {
      swBio.checked = BIO.aktif();

      /* MENYALAKAN toggle sekarang harus DIBUKTIKAN dulu dengan satu
         pemindaian sungguhan. Dulu toggle-nya cuma menulis "1" ke
         localStorage — jadi bisa dinyalakan di perangkat tanpa sensor sama
         sekali, dan halaman login akan menyembunyikan keypad PIN demi
         tombol sidik jari yang mustahil berfungsi. Mematikannya tidak
         perlu pembuktian: mengurangi hak akses selalu boleh. */
      swBio.addEventListener("change", () => {
        if (!swBio.checked) {
          BIO.setAktif(false);
          toast("Login dengan biometrik dimatikan.");
          return;
        }
        swBio.disabled = true;
        BIO.periksa()
          .then((p) => {
            if (!p.ada) { swBio.checked = false; BIO.setAktif(false); toast(p.pesan); return; }
            return BIO.autentikasi("Aktifkan login biometrik DikaPay").then((r) => {
              if (!r.ok) {
                swBio.checked = false;
                BIO.setAktif(false);
                toast(r.kode === "userCancel"
                  ? "Login biometrik belum diaktifkan."
                  : r.pesan);
                return;
              }
              BIO.setAktif(true);
              toast("Login dengan biometrik diaktifkan.");
            });
          })
          .catch((e) => {
            console.error("[akun] biometrik:", e);
            swBio.checked = false;
            BIO.setAktif(false);
            toast("Biometrik sedang tidak bisa dipakai.");
          })
          .then(() => { swBio.disabled = false; });
      });
    }
  }
  const scoreList = $("scoreList");
  if (scoreList) scoreList.addEventListener("click", (e) => {
    const it = e.target.closest("[data-key]");
    if (it && !it.disabled) {          // item selesai di-`disabled` → tidak actionable
      try { scoreGoTo(it.dataset.key); }
      catch (err) { console.error("[akun] skor keamanan:", err); }
    }
  });

  /* PIN keypad */
  $("pinKeypad").addEventListener("click", (e) => {
    try {
      const b = e.target.closest("[data-k]");
      if (b) pinKey(b.dataset.k);
    } catch (err) { console.error("[akun] PIN keypad:", err); }
  });

  /* Lupa PIN Transaksi */
  document.querySelectorAll("#lupaPinFlow [data-lupapin-method]").forEach((b) =>
    b.addEventListener("click", () => { if (!b.disabled) lupaPinPick(b.dataset.lupapinMethod); })
  );
  $("lupaPinVerifyBtn").addEventListener("click", lupaPinVerify);
  $("lupaPinResendBtn").addEventListener("click", (e) => { e.preventDefault(); lupaPinResend(); });
  lupaPinOtpBoxes.forEach((box, i) => {
    box.addEventListener("input", () => {
      box.value = box.value.replace(/\D/g, "").slice(0, 1);
      $("lupaPinErrText").hidden = true;
      if (box.value && i < lupaPinOtpBoxes.length - 1) lupaPinOtpBoxes[i + 1].focus();
    });
    box.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !box.value && i > 0) lupaPinOtpBoxes[i - 1].focus();
    });
  });

  /* 2FA */
  document.querySelectorAll("#tfaFlow [data-method]").forEach((b) =>
    b.addEventListener("click", () => tfaPickMethod(b.dataset.method))
  );
  $("tfaSendBtn").addEventListener("click", tfaSend);
  $("tfaVerifyBtn").addEventListener("click", tfaVerify);
  $("otpHint").addEventListener("click", (e) => {
    if (e.target.closest("b")) toast("Kode verifikasi baru sudah dikirim.");
  });
  otpBoxes.forEach((box, i) => {
    box.addEventListener("input", () => {
      box.value = box.value.replace(/\D/g, "").slice(0, 1);
      if (box.value && i < otpBoxes.length - 1) otpBoxes[i + 1].focus();
    });
    box.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !box.value && i > 0) otpBoxes[i - 1].focus();
    });
  });

  /* Devices logout */
  $("devList").addEventListener("click", (e) => {
    const b = e.target.closest("[data-logout]");
    if (b) logoutDevice(b.dataset.logout);
  });

  /* Flow back / done */
  document.querySelectorAll("[data-flowback], [data-flowdone]").forEach((b) =>
    b.addEventListener("click", () => hideFlow())
  );

  /* Logout modal */
  $("logoutBtn").addEventListener("click", openLogout);
  $("loCancel").addEventListener("click", closeLogout);
  $("loOk").addEventListener("click", doLogout);
  $("logoutOverlay").addEventListener("click", (e) => {
    if (e.target === $("logoutOverlay")) closeLogout();
  });

  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if ($("langSheet").classList.contains("is-open")) closeLangSheet();
    else if ($("photoPicker").classList.contains("is-open")) closePicker();
    else if ($("namalockOverlay").classList.contains("is-open")) tutupNamalock();
    else if ($("phonelockOverlay").classList.contains("is-open")) tutupUbahlock();
    else if (flowStack.length) hideFlow();
    else closeLogout();
  });

  /* Foto profil bisa berubah di halaman lain (atau di sesi lain) lalu
     member kembali ke sini lewat bfcache — <script> tidak dijalankan ulang,
     jadi avatarnya harus disegarkan di `pageshow`. Alasan yang sama dengan
     penyegar margin di produk-ui.js. */
  window.addEventListener("pageshow", function () {
    try {
      if (window.DikaProfilFoto) window.DikaProfilFoto.pasangSemua(profile.name);
    } catch (err) { console.error("[akun] gagal menyegarkan avatar:", err); }
  });

  /* Bottom nav → ditangani bottomnav.js (bersama untuk 4 halaman). */
}

document.addEventListener("DOMContentLoaded", init);
