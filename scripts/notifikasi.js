/* ===========================================================================
   DikaPay — notifikasi.js
   Halaman Notifikasi. Data utama berasal dari backend DikaApi.
   Jika API gagal, halaman tetap tampil dengan daftar kosong.

   =================== BENTUK DATA DARI api-notifikasi.php ==================
   GET /api-notifikasi.php?dikapay_id=<nomor digit>
     { ok:true, jumlah:N, data:[ {
         id, dikapay_id, judul, isi, tipe, target,
         is_read, dibaca_pada, aktif, dibuat_pada
       } ] }

   Tiga hal yang menentukan seluruh rancangan di bawah:

   1. Field jenisnya bernama `tipe` (bahasa Indonesia), BUKAN `type`.
      Versi sebelumnya membaca `n.type` -> selalu undefined -> SEMUA
      notifikasi jatuh ke ikon "security" (perisai biru), termasuk yang
      bertipe promo. Sekarang `tipe` yang dibaca (`type` tetap diterima
      sebagai cadangan kalau backend berubah).

   2. Notifikasi saat ini BERSIFAT SIARAN: `dikapay_id: null` dan
      `target: "semua"`, jadi baris yang sama dikirim ke semua member, dan
      `is_read` di server selalu 0 (server tidak punya tempat menyimpan
      "member X sudah baca"). Karena itu status BACA & HAPUS wajib
      disimpan di perangkat, per akun.

   3. Endpoint ini HANYA menerima GET (dibuktikan lewat OPTIONS:
      `access-control-allow-methods: GET`). Tidak ada jalan menghapus atau
      menandai baca di server, jadi "Hapus" di sini berarti DISEMBUNYIKAN
      DARI TAMPILAN member ini (dismiss lokal), bukan dihapus dari server.

   ===================== STATE LOKAL: SELALU PER AKUN =======================
     dikapay:notif:read:<nomor digit>    -> [id, ...] yang sudah dibaca
     dikapay:notif:hidden:<nomor digit>  -> [id, ...] yang sudah dihapus
   Nomornya dari `dikapay:profile.phone` — pola namespace yang SAMA dengan
   `dikapay:device_token:<nomor>` (lihat member-sync.js), supaya bug "data
   akun tercampur" yang sudah diperbaiki di sana tidak terulang di sini.
   Tanpa nomor aktif (belum login) kedua kunci TIDAK PERNAH ditulis —
   lebih baik status baca hilang daripada menulis ke kunci global yang
   nanti terbaca akun lain.

   KENAPA TIDAK DIHAPUS SAAT LOGOUT: status ini menggambarkan "apa yang
   sudah dilakukan MEMBER INI terhadap notifikasinya", bukan sisa sesi.
   Kalau dibersihkan saat logout, notifikasi yang sudah dibaca/dihapus akan
   MUNCUL LAGI sebagai belum dibaca begitu member login kembali di
   perangkat yang sama — memaksanya membersihkan ulang daftar yang sama.
   Isolasi antar akun sudah dijamin oleh namespace nomor HP di atas, jadi
   akun lain tetap tidak pernah melihat jejak akun sebelumnya.
   =========================================================================== */

"use strict";

const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---- Jenis notifikasi: warna + ikon inline SVG ------------------- */

const NTYPES = {
  security: {
    color: "#1B4FD6", bg: "#E6EDFB",
    icon: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m8.5 12 2.5 2.5L16 9"/>',
  },
  success: {
    color: "#1E9C56", bg: "#DDF2E6",
    icon: '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>',
  },
  promo: {
    color: "#E0A400", bg: "#FBF0D3",
    icon: '<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M3 12h18M12 8v13"/><path d="M12 8S10.5 3 8 4s1 4 4 4zM12 8s1.5-5 4-4-1 4-4 4z"/>',
  },
  info: {
    color: "#0E9AA7", bg: "#DEF4F5",
    icon: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  },
  /* Transaksi gagal. AMBER, bukan merah menyala — alasan yang sama dengan
     layar hasil gagal di payment-flow.js: ini kondisi yang bisa dicoba lagi
     dan saldo member aman, bukan alarm. */
  gagal: {
    color: "#B98900", bg: "#FBF0D3",
    icon: '<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17h.01"/>',
  },
};

const ICON_TRASH =
  '<path d="M4 7h16M10 4h4M9 7v12M15 7v12M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/>';

/* ---- Helper ---------------------------------------------------- */

function svgWrap(inner) {
  return (
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round">' + inner + "</svg>"
  );
}

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>'"]/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[ch]);
}

/* "2026-09-12 23:40:05" -> "12 Sep 2026 • 23.40". Backend mengirim datetime
   mentah; menampilkannya apa adanya membuat daftar terlihat seperti log
   server. Bentuk apa pun yang tidak dikenali dikembalikan apa adanya. */
const BULAN_SINGKAT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function formatWaktu(raw) {
  const s = String(raw == null ? "" : raw).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(s);
  if (!m) return s;
  const bulan = BULAN_SINGKAT[Number(m[2]) - 1] || m[2];
  return `${Number(m[3])} ${bulan} ${m[1]} • ${m[4]}.${m[5]}`;
}

/* ---- State lokal per akun --------------------------------------- */

function activePhone() {
  try {
    const profile = JSON.parse(localStorage.getItem("dikapay:profile") || "null");
    return profile && profile.phone ? String(profile.phone) : "";
  } catch (e) {
    return "";
  }
}

function activePhoneDigits() {
  return activePhone().replace(/\D/g, "");
}

function localKey(jenis) {
  return "dikapay:notif:" + jenis + ":" + activePhoneDigits();
}

function localIds(jenis) {
  if (!activePhoneDigits()) return new Set();
  try {
    const raw = localStorage.getItem(localKey(jenis));
    const ids = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(ids) ? ids.map(String) : []);
  } catch (e) {
    return new Set();
  }
}

function saveLocalIds(jenis, ids) {
  if (!activePhoneDigits()) return;
  try {
    localStorage.setItem(localKey(jenis), JSON.stringify(Array.from(ids).slice(-300)));
  } catch (e) {
    console.warn("[notifikasi] status " + jenis + " tidak tersimpan:", e);
  }
}

function tandaiLokal(jenis, id) {
  if (id == null || !activePhoneDigits()) return;
  const ids = localIds(jenis);
  ids.add(String(id));
  saveLocalIds(jenis, ids);
}

/* ---- Pemetaan & render ------------------------------------------ */

/* Daftar MENTAH terakhir dari server — disimpan supaya menghapus satu
   notifikasi cukup menggambar ulang dari data yang sudah ada, tanpa
   memanggil jaringan lagi. */
let daftarMentah = [];

/* ===================== KOTAK MASUK LOKAL (notif-store.js) =================
   Notifikasi TRANSAKSI tidak datang dari `api-notifikasi.php` — endpoint itu
   bersifat SIARAN (pengumuman untuk semua member). Kabar "pesananmu berhasil"
   dibuat di perangkat ini sendiri oleh notif-hp.js dan dicerminkan ke
   notif-store.js.

   Sebelum ini halaman Notifikasi HANYA membaca daftar server, jadi notifikasi
   sistem yang sudah digeser member hilang total — tidak ada tempat untuk
   membacanya lagi. Keduanya digabung di sini, dan bentuk hasilnya SAMA
   PERSIS dengan hasil pemetaan server, jadi render() tidak perlu tahu asal
   sebuah entri.

   Penyaring "sudah dibaca"/"dihapus" yang sama (localIds) berlaku untuk
   keduanya — kalau tidak, menghapus notifikasi lokal tidak akan ada efeknya. */
function entriLokal() {
  try {
    if (!window.DikaNotif || typeof window.DikaNotif.getMine !== "function") return [];
    const readIds = localIds("read");
    const hiddenIds = localIds("hidden");
    return window.DikaNotif.getMine()
      .filter((n) => n && n.id && !hiddenIds.has(String(n.id)))
      .map((n) => ({
        id: n.id,
        type: NTYPES[n.type] ? n.type : "info",
        title: String(n.title || ""),
        desc: String(n.desc || ""),
        time: waktuRelatif(n.ts) || String(n.time || ""),
        unread: !!n.unread && !readIds.has(String(n.id)),
        lokal: true,
      }));
  } catch (e) {
    console.error("[notifikasi] gagal membaca kotak masuk lokal:", e);
    return [];
  }
}

/* "Baru saja" / "5 menit lalu" / tanggal — entri lokal menyimpan `ts`
   (epoch ms), bukan string tanggal server. */
function waktuRelatif(ts) {
  const t = Number(ts);
  if (!isFinite(t) || t <= 0) return "";
  const detik = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (detik < 60) return "Baru saja";
  const menit = Math.round(detik / 60);
  if (menit < 60) return menit + " menit lalu";
  const jam = Math.round(menit / 60);
  if (jam < 24) return jam + " jam lalu";
  const d = new Date(t);
  const bulan = BULAN_SINGKAT[d.getMonth()] || String(d.getMonth() + 1);
  return d.getDate() + " " + bulan + " " + d.getFullYear();
}

function mapNotifications(items) {
  const readIds = localIds("read");
  /* Penyaringan (baseline perangkat + `aktif` + dismiss lokal) dipegang
     DikaNotifServer — aturan yang SAMA dipakai badge lonceng di Beranda.
     Jangan menyaring ulang di sini, nanti daftar dan badge bisa berbeda
     pendapat tentang notifikasi yang sama. */
  const S = window.DikaNotifServer;
  if (!S) {
    console.error("[notifikasi] notif-server.js belum dimuat — daftar tidak disaring.");
  }
  const layak = S ? S.saring(activePhone(), items) : (Array.isArray(items) ? items : []);
  return layak
    .map((n) => {
      const tipe = String(n.tipe || n.type || "").toLowerCase();
      return {
        id: n.id,
        type: NTYPES[tipe] ? tipe : "info",
        title: String(n.judul || ""),
        desc: String(n.isi || ""),
        time: formatWaktu(n.dibuat_pada),
        unread: Number(n.is_read) === 0 && !readIds.has(String(n.id)),
      };
    });
}

/* ---- Empty state ------------------------------------------------------
   MENIRU pola `.empty` di riwayat.html (ilustrasi SVG + judul + subjudul),
   bukan sekadar sebaris teks di tengah layar kosong. Ikonnya diganti
   lonceng + amplop supaya relevan untuk halaman ini — kertas bertanda "+"
   milik Riwayat berarti "transaksi", bukan "kabar".

   Dipakai DUA tempat (daftar kosong sejak awal, dan setelah "Hapus Semua"),
   jadi markup-nya dibuat di satu fungsi — kalau teksnya diubah, keduanya
   ikut berubah bersamaan. */
function emptyHtml() {
  return (
    '<li class="nempty">' +
      '<span class="nempty__art" aria-hidden="true">' +
        '<svg viewBox="0 0 120 120" fill="none">' +
          '<circle cx="60" cy="60" r="46" fill="#E7EDFB"/>' +
          /* lonceng */
          '<path class="nempty__bell" d="M60 30c-10.5 0-19 8.5-19 19v13l-6 9h50l-6-9V49c0-10.5-8.5-19-19-19z" ' +
            'fill="#FFFFFF" stroke="#C4D2F0" stroke-width="3" stroke-linejoin="round"/>' +
          '<path class="nempty__bell" d="M53 76a7 7 0 0 0 14 0" stroke="#C4D2F0" stroke-width="3" stroke-linecap="round"/>' +
          '<path class="nempty__bell" d="M60 24v6" stroke="#C4D2F0" stroke-width="3" stroke-linecap="round"/>' +
          /* amplop kecil bertanda centang — "kabarnya nanti sampai ke sini" */
          '<g class="nempty__mail">' +
            '<rect x="70" y="72" width="30" height="22" rx="5" fill="#FFC93C"/>' +
            '<path d="M73 77.5 85 86l12-8.5" stroke="#0B2447" stroke-width="2.6" ' +
              'stroke-linecap="round" stroke-linejoin="round"/>' +
          "</g>" +
        "</svg>" +
      "</span>" +
      '<span class="nempty__title">Belum ada notifikasi nih</span>' +
      '<span class="nempty__sub">Nanti kalau ada info penting, kami kabari kamu di sini, ya! 😊</span>' +
    "</li>"
  );
}

function render(items) {
  const list = document.getElementById("notifList");
  const clearBtn = document.getElementById("clearAllBtn");
  /* Lokal DI ATAS server: kabar transaksi member sendiri hampir selalu lebih
     baru & lebih mendesak daripada siaran pengumuman. */
  const mapped = entriLokal().concat(mapNotifications(items));

  list.classList.remove("notif-list--loading", "notif-list--empty", "notif-list--error");
  if (clearBtn) clearBtn.hidden = mapped.length === 0;

  if (!mapped.length) {
    list.classList.add("notif-list--empty");
    list.innerHTML = emptyHtml();
    return;
  }

  list.innerHTML = mapped.map((n, i) => {
    const t = NTYPES[n.type];
    const delay = REDUCED_MOTION ? 0 : i * 55;
    return `
      <li class="notif ${n.unread ? "is-unread" : ""}" data-notif-id="${escapeHtml(n.id)}" style="animation-delay:${delay}ms">
        <span class="notif__ic" style="background:${t.color}22;color:${t.color}">${svgWrap(t.icon)}</span>
        <button class="notif__main" type="button" aria-expanded="false">
          <span class="notif__title">${escapeHtml(n.title)}</span>
          <span class="notif__desc">${escapeHtml(n.desc)}</span>
          <span class="notif__time">${escapeHtml(n.time)}</span>
        </button>
        ${n.unread ? '<span class="notif__dot" aria-label="Belum dibaca"></span>' : ""}
        <button class="notif__del" type="button" aria-label="Hapus notifikasi ini">${svgWrap(ICON_TRASH)}</button>
      </li>`;
  }).join("");
}

function setListState(kind, text) {
  const list = document.getElementById("notifList");
  list.className = "notif-list notif-list--" + kind;
  /* "empty" memakai ilustrasi yang sama dengan daftar yang memang kosong
     sejak awal — kalau di sini ditulis teks polos, member yang baru
     menekan "Hapus Semua" akan melihat halaman yang tampak lain sendiri. */
  if (kind === "empty") list.innerHTML = emptyHtml();
  else list.textContent = text;
  const clearBtn = document.getElementById("clearAllBtn");
  if (clearBtn) clearBtn.hidden = true;
}

/* ---- Navigasi ---------------------------------------------- */

function navBack() {
  if (history.length > 1) history.back();
  else window.location.href = "../index.html";
}

/* ===================== SOROT ENTRI YANG DIKETUK ===========================
   Member menekan notifikasi di tray HP -> notif-hp.js membawa `nid`-nya ke
   sini lewat `?n=`. Entri itu harus langsung KELIHATAN dan TERBUKA PENUH:
   kalau cuma membuka halaman ini apa adanya, member masih harus mencari
   sendiri kabar yang barusan dia tekan — dan di daftar yang panjang itu bisa
   berada jauh di bawah layar.

   Bukan sekadar scroll: kartunya juga dibuka (isi penuh) dan ditandai sudah
   dibaca, karena menekan notifikasi memang berarti "saya baca yang ini". */
function sorot(nid) {
  try {
    if (!nid) return false;
    const kartu = document.querySelector('.notif[data-notif-id="' + String(nid).replace(/"/g, '\\"') + '"]');
    if (!kartu) {
      console.warn("[notifikasi] entri yang diketuk tidak ditemukan di daftar:", nid);
      return false;
    }
    if (!kartu.classList.contains("is-open")) {
      const tombol = kartu.querySelector(".notif__main");
      if (tombol) tombol.click();      /* lewat jalur yang sama dengan ketukan member */
    }
    kartu.classList.add("is-sorot");
    try {
      kartu.scrollIntoView({ behavior: REDUCED_MOTION ? "auto" : "smooth", block: "center" });
    } catch (e) { kartu.scrollIntoView(); }
    /* Sorotannya sementara — penanda "ini yang kamu tekan", bukan status
       permanen yang ikut tersimpan. */
    window.setTimeout(() => kartu.classList.remove("is-sorot"), 2600);
    console.info("[notifikasi] entri dari ketukan notifikasi disorot:", nid);
    return true;
  } catch (e) {
    console.error("[notifikasi] gagal menyorot entri:", e);
    return false;
  }
}

function sorotDariUrl() {
  try {
    const m = /[?&]n=([^&]+)/.exec(location.search || "");
    if (!m) return;
    sorot(decodeURIComponent(m[1]));
  } catch (e) { console.error("[notifikasi] parameter ?n= tidak terbaca:", e); }
}

/* ---- Init ------------------------------------------------- */

function init() {
  const phone = activePhone();
  const list = document.getElementById("notifList");
  const clearBtn = document.getElementById("clearAllBtn");
  const konfirm = document.getElementById("clearOverlay");
  setListState("loading", "Memuat notifikasi…");

  /* Buka/tutup isi penuh + tandai sudah dibaca. `isi` bisa panjang & punya
     baris baru (lihat contoh "Informasi Cut Off" dari server) — di daftar
     dipotong 2 baris oleh CSS, dan dibuka penuh di sini. */
  function toggleCard(card) {
    if (!card) return;
    const terbuka = card.classList.toggle("is-open");
    const tombol = card.querySelector(".notif__main");
    if (tombol) tombol.setAttribute("aria-expanded", terbuka ? "true" : "false");

    if (card.dataset.notifId) tandaiLokal("read", card.dataset.notifId);
    card.classList.remove("is-unread");
    const dot = card.querySelector(".notif__dot");
    if (dot) dot.remove();
    window.dispatchEvent(new CustomEvent("dika:notification-read"));
  }

  function hapusKartu(card) {
    if (!card || !card.dataset.notifId) return;
    tandaiLokal("hidden", card.dataset.notifId);
    /* Hilang dengan animasi singkat, lalu daftar digambar ulang dari data
       mentah yang sama (tanpa permintaan jaringan baru) supaya keadaan
       kosong/`Hapus Semua` ikut tersegarkan. */
    card.classList.add("is-removing");
    window.setTimeout(() => render(daftarMentah), REDUCED_MOTION ? 0 : 220);
  }

  list.addEventListener("click", (event) => {
    const card = event.target.closest(".notif");
    if (!card) return;
    if (event.target.closest(".notif__del")) { hapusKartu(card); return; }
    toggleCard(card);
  });

  if (clearBtn && konfirm) {
    clearBtn.addEventListener("click", () => konfirm.classList.add("is-open"));
    konfirm.addEventListener("click", (event) => {
      if (event.target === konfirm || event.target.closest("[data-close]")) {
        konfirm.classList.remove("is-open");
        return;
      }
      if (!event.target.closest("#clearConfirm")) return;
      /* Sembunyikan SEMUA yang sedang tampil — sekaligus tandai sudah
         dibaca, supaya badge lonceng di Beranda ikut bersih. */
      /* Entri LOKAL ikut — kalau hanya daftar server yang disembunyikan,
         "Hapus Semua" menyisakan notifikasi transaksi di layar. */
      const ids = entriLokal().concat(mapNotifications(daftarMentah)).map((n) => n.id);
      const hidden = localIds("hidden");
      const read = localIds("read");
      ids.forEach((id) => { hidden.add(String(id)); read.add(String(id)); });
      saveLocalIds("hidden", hidden);
      saveLocalIds("read", read);
      konfirm.classList.remove("is-open");
      window.dispatchEvent(new CustomEvent("dika:notification-read"));
      render(daftarMentah);
    });
  }

  if (!phone || !window.DikaApi || typeof DikaApi.notifikasi !== "function") {
    /* render() (bukan setListState("empty")) — kotak masuk LOKAL bisa berisi
       notifikasi transaksi walau daftar server tidak bisa diambil sama
       sekali. Kalau isinya benar-benar kosong, render() sendiri yang
       memasang state kosong berilustrasi. */
    render([]);
    sorotDariUrl();
  } else {
    DikaApi.notifikasi(phone)
      .then(function (data) {
        daftarMentah = Array.isArray(data) ? data : [];
        /* Baseline dipasang SEBELUM render: kunjungan pertama akun ini di
           perangkat ini mencatat ID tertinggi saat itu, sehingga siaran
           lama tidak pernah sempat tampil walau sekejap. */
        if (window.DikaNotifServer) window.DikaNotifServer.pasangBaseline(phone, daftarMentah);
        render(daftarMentah);
        sorotDariUrl();
      })
      .catch(function (err) {
        console.error("[notifikasi] gagal memuat dari server:", err);
        /* Siaran server gagal diambil BUKAN alasan menyembunyikan notifikasi
           transaksi yang sudah ada di perangkat — apalagi kalau member baru
           saja sampai di sini dari ketukan notifikasi. */
        if (entriLokal().length) {
          render([]);
          sorotDariUrl();
        } else {
          setListState("error", "Notifikasi belum bisa dimuat. Coba lagi nanti.");
        }
      });
  }

  /* Dibuka dari ketukan notifikasi saat app SUDAH di halaman ini. */
  window.addEventListener("dika:buka-notif", (ev) => {
    sorot((ev && ev.detail && ev.detail.nid) || "");
  });

  document.getElementById("backBtn").addEventListener("click", () => {
    var app = document.getElementById("app");
    if (REDUCED_MOTION || !app) { navBack(); return; }
    if (app.classList.contains("is-leaving")) return;
    app.classList.add("is-leaving");
    var done = false;
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
    var app = document.getElementById("app");
    if (app) app.classList.remove("is-leaving");
  } catch (e) { console.error("heal is-leaving:", e); }
}
window.addEventListener("pageshow", healLeaving);
window.addEventListener("pagehide", healLeaving);
