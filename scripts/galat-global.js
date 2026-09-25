/* ==========================================================================
   DikaPay — galat-global.js   (window.DikaGalat)

   JARING PENGAMAN TERAKHIR. Di-link sebagai <script> PALING ATAS di SEMUA
   halaman — di atas integritas.js & auth.js — supaya galat yang terjadi di
   file mana pun (termasuk saat file itu sendiri gagal dieksekusi) tetap
   tertangkap. Kalau ditaruh di bawah, galat yang terjadi SEBELUM baris ini
   tidak pernah sampai ke sini.

   ============================ KENAPA ADA =================================
   Sebelum ini, satu galat JS yang tidak tertangkap = LAYAR PUTIH tanpa
   penjelasan apa pun. Member tidak tahu harus apa, dan kita tidak tahu apa
   yang terjadi karena tidak ada yang mencatatnya.

   ==================== YANG PALING GAMPANG SALAH DIRANCANG ================
   "Tampilkan pesan ramah setiap kali ada galat" TERDENGAR benar, tapi itu
   JUSTRU memperburuk: sebagian besar galat tak tertangkap bersifat LOKAL
   (satu widget gagal, satu gambar gagal) sementara halamannya sendiri masih
   berfungsi penuh. Menutupinya dengan overlay membuat aplikasi yang
   sebetulnya sehat jadi tidak bisa dipakai.

   Karena itu aturannya DUA lapis, sengaja dipisah:
     - SELALU dicatat ke console (murah, tidak mengganggu siapa pun).
     - Overlay HANYA muncul kalau halamannya benar-benar tidak terpakai:
       galat terjadi sebelum halaman sempat selesai dirender, ATAU layar
       memang kosong melompong saat diperiksa.
   Itu tepat menjawab "jangan layar putih", tanpa membajak layar untuk
   masalah yang tidak dirasakan member.

   ========================= ANTI-LOOP TAK BERUJUNG ========================
   Handler galat yang ikut melempar galat = umpan balik tak berujung yang
   membekukan WebView. Empat pengaman, semuanya perlu:
     1. Seluruh isi handler dibungkus try/catch yang TIDAK melakukan apa pun
        saat gagal (tidak memanggil console di dalam catch, tidak melempar).
     2. Overlay dibangun MAKSIMAL SEKALI (`sudahTampil`).
     3. Ada pagu jumlah galat (`BATAS`); sesudahnya handler dilepas total,
        jadi badai galat berhenti sepenuhnya.
     4. `sedangTangani` mencegah masuk ulang (re-entrancy) saat galat baru
        muncul persis di tengah penanganan galat sebelumnya.
   ========================================================================== */
(function () {
  "use strict";

  var BATAS = 20;          /* sesudah sekian galat, handler dilepas total */
  var JEDA_PERIKSA = 1200; /* jeda sebelum memeriksa "halamannya kosong?" */

  var jumlah = 0;
  var sudahTampil = false;
  var sedangTangani = false;
  var siapDirender = false;   /* true sesudah halaman selesai dimuat */
  var riwayat = [];           /* galat terakhir, untuk diagnosa */

  try {
    window.addEventListener("load", function () { siapDirender = true; }, { once: true });
  } catch (e) { /* diabaikan: bukan alasan mematikan seluruh jaring ini */ }

  function jalurBeranda() {
    /* Pola yang SAMA dengan inPages() di auth.js/bottomnav.js: dihitung
       runtime karena file ini dipakai dari root DAN dari /pages/. */
    return /\/pages\//i.test(location.pathname) ? "../index.html" : "index.html";
  }

  /* Apakah layar benar-benar tidak menampilkan apa pun yang berguna?
     Dipakai supaya galat lokal (halaman masih terpakai) tidak dibajak. */
  function layarKosong() {
    try {
      var b = document.body;
      if (!b) return true;
      /* integritas.js menyembunyikan <body> selama pemeriksaan berjalan —
         itu BUKAN "kosong", cuma belum boleh tampil. Jangan salah vonis. */
      if (document.documentElement.getAttribute("data-integritas") === "cek") return false;
      var teks = (b.innerText || "").replace(/\s+/g, "");
      if (teks.length > 40) return false;
      /* Halaman bisa saja isinya gambar/kanvas tanpa teks. */
      return b.querySelectorAll("img, svg, canvas, input, button").length < 3;
    } catch (e) { return false; }
  }

  function bangunOverlay() {
    var ov = document.createElement("div");
    ov.id = "dikaGalatOverlay";
    ov.setAttribute("role", "alertdialog");
    ov.setAttribute("aria-live", "assertive");
    /* Gaya ditulis INLINE, bukan lewat kelas di style.css: galat bisa
       terjadi justru karena CSS-nya gagal dimuat, dan pesan penyelamat
       tidak boleh ikut bergantung pada hal yang sedang rusak.
       `visibility` dipaksa supaya tetap terlihat walau body sedang
       disembunyikan integritas.js. */
    ov.style.cssText = [
      "position:fixed", "inset:0", "z-index:2147483647",
      "background:#0B2447", "color:#fff", "visibility:visible",
      "display:flex", "align-items:center", "justify-content:center",
      "padding:24px", "margin:0", "overflow:auto",
      "font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif",
    ].join(";");

    var kotak = document.createElement("div");
    kotak.style.cssText = "max-width:340px;width:100%;text-align:center";

    var ikon = document.createElement("div");
    ikon.textContent = "🛠️";
    ikon.style.cssText = "font-size:44px;line-height:1;margin-bottom:14px";

    var judul = document.createElement("h1");
    judul.textContent = "Aduh, ada yang tersendat";
    judul.style.cssText = "margin:0 0 10px;font-size:19px;font-weight:700;color:#FFC93C";

    var pesan = document.createElement("p");
    pesan.textContent =
      "Halaman ini gagal dimuat dengan benar. Tenang, saldo dan transaksi kamu " +
      "aman — tidak ada yang berubah. Coba muat ulang halamannya, ya.";
    pesan.style.cssText = "margin:0 0 20px;font-size:14px;line-height:1.65;opacity:.92";

    var aksi = document.createElement("div");
    aksi.style.cssText = "display:flex;flex-direction:column;gap:10px";

    var bMuat = document.createElement("button");
    bMuat.type = "button";
    bMuat.textContent = "Muat Ulang Halaman";
    bMuat.style.cssText = "padding:13px 18px;border:0;border-radius:14px;background:#FFC93C;" +
      "color:#0B2447;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit";
    bMuat.onclick = function () { try { location.reload(); } catch (e) {} };

    var bHome = document.createElement("button");
    bHome.type = "button";
    bHome.textContent = "Kembali ke Beranda";
    bHome.style.cssText = "padding:13px 18px;border:1px solid rgba(255,255,255,.35);" +
      "border-radius:14px;background:transparent;color:#fff;font-size:15px;" +
      "cursor:pointer;font-family:inherit";
    bHome.onclick = function () { try { location.href = jalurBeranda(); } catch (e) {} };

    aksi.appendChild(bMuat);
    aksi.appendChild(bHome);
    kotak.appendChild(ikon);
    kotak.appendChild(judul);
    kotak.appendChild(pesan);
    kotak.appendChild(aksi);
    ov.appendChild(kotak);
    return ov;
  }

  function tampilkan() {
    if (sudahTampil) return;
    sudahTampil = true;
    try {
      var pasang = function () {
        try {
          if (!document.body) return;
          if (document.getElementById("dikaGalatOverlay")) return;
          document.body.appendChild(bangunOverlay());
          /* Kalau integritas.js menyembunyikan body, pesan ini tetap harus
             terbaca — kalau tidak, member kembali melihat layar kosong. */
          document.body.style.visibility = "visible";
        } catch (e) { /* menyerah diam-diam; sudah dicatat di console */ }
      };
      if (document.body) pasang();
      else document.addEventListener("DOMContentLoaded", pasang, { once: true });
    } catch (e) { /* diabaikan */ }
  }

  function lepasHandler() {
    try {
      window.onerror = null;
      window.removeEventListener("unhandledrejection", onTolak);
    } catch (e) { /* diabaikan */ }
  }

  function tangani(sumber, pesan, detail) {
    if (sedangTangani) return;          /* anti masuk-ulang */
    sedangTangani = true;
    try {
      jumlah++;
      riwayat.push({ sumber: sumber, pesan: String(pesan), waktu: Date.now() });
      if (riwayat.length > 10) riwayat.shift();

      console.error("[galat-global] " + sumber + ":", pesan, detail || "");

      if (jumlah >= BATAS) {
        console.error("[galat-global] galat beruntun (" + jumlah + ") — handler dilepas " +
          "supaya tidak jadi loop tak berujung.");
        lepasHandler();
        tampilkan();
        return;
      }

      /* Galat SEBELUM halaman selesai dimuat hampir selalu fatal (script
         berhenti di tengah jalan) -> langsung tampilkan. Sesudah itu,
         diperiksa dulu: halamannya masih terpakai atau benar-benar kosong? */
      if (!siapDirender) { tampilkan(); return; }
      window.setTimeout(function () {
        try { if (layarKosong()) tampilkan(); } catch (e) {}
      }, JEDA_PERIKSA);
    } catch (e) {
      /* SENGAJA kosong. Melempar/mencatat dari sini bisa memicu handler ini
         lagi — persis loop yang harus dicegah. */
    } finally {
      sedangTangani = false;
    }
  }

  function onTolak(ev) {
    var r = ev && ev.reason;
    tangani("promise ditolak tanpa catch", (r && (r.stack || r.message)) || r, r);
  }

  window.onerror = function (pesan, berkas, baris, kolom, err) {
    tangani("galat JS", pesan, (err && err.stack) || (berkas + ":" + baris + ":" + kolom));
    return false;   /* jangan telan: biar tetap tampil di console/logcat */
  };
  window.addEventListener("unhandledrejection", onTolak);

  /* Dibuka untuk diagnosa & pengujian — BUKAN untuk dipakai alur normal. */
  window.DikaGalat = {
    riwayat: function () { return riwayat.slice(); },
    jumlah: function () { return jumlah; },
    tampil: function () { return sudahTampil; },
    /* Dipakai halaman yang menangkap galat fatalnya sendiri lalu memutuskan
       layar tidak lagi terpakai. */
    paksaTampil: tampilkan,
  };
})();
