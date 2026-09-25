/* ===========================================================================
   DikaPay — build-www.js
   Menyalin aset web ke folder www/ untuk dibungkus Capacitor jadi APK.

     node build-www.js          (atau: npm run build)

   KENAPA ADA: Capacitor menolak `webDir` yang menunjuk ke root project
   ("." atau "./"), karena folder yang di-bundle akan ikut menelan
   node_modules/, android/, dan file dokumentasi. Jadi webDir menunjuk ke
   www/, dan script ini yang mengisinya.

   ARAH SALINANNYA SATU JALUR: root -> www/.
   File di root (index.html, pages/, scripts/, styles/, assets/) adalah
   SUMBER KEBENARAN. Isi www/ murni hasil salinan dan DIHAPUS TOTAL setiap
   kali script ini dijalankan — jangan pernah menyunting apa pun di dalam
   www/, perubahannya pasti hilang tanpa peringatan pada build berikutnya.

   Struktur di dalam www/ dibuat IDENTIK dengan root supaya seluruh path
   relatif yang dipakai project ini tetap benar tanpa satu pun perubahan:
   dari www/index.html -> "pages/x.html", dari www/pages/x.html ->
   "../scripts/y.js". Lihat "Konvensi path lintas-folder" di CLAUDE.md.
   =========================================================================== */

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const OUT = path.join(ROOT, "www");

/* Yang IKUT masuk APK. Sengaja daftar putih (whitelist), bukan daftar
   hitam: kalau nanti ada folder baru di root — catatan pribadi, berkas
   rancangan, dump database — ia TIDAK akan diam-diam ikut ter-bundle
   dan terkirim ke perangkat member. Menambah folder web baru berarti
   menambahkannya di sini secara sadar. */
const SALIN = [
  "index.html",   // entry point APK — WAJIB ada di akar www/
  "pages",
  "scripts",
  "styles",
  "assets",
];

/* Tidak ikut, meski kebetulan berada di dalam folder yang disalin. */
const ABAIKAN = new Set([
  ".DS_Store",
  "Thumbs.db",
  ".gitkeep",
]);

function abaikan(nama) {
  return ABAIKAN.has(nama) || nama.startsWith(".");
}

let jumlahFile = 0;
let jumlahByte = 0;

function salinRekursif(dariPath, kePath) {
  const st = fs.statSync(dariPath);

  if (st.isDirectory()) {
    fs.mkdirSync(kePath, { recursive: true });
    fs.readdirSync(dariPath).forEach(function (nama) {
      if (abaikan(nama)) return;
      salinRekursif(path.join(dariPath, nama), path.join(kePath, nama));
    });
    return;
  }

  fs.mkdirSync(path.dirname(kePath), { recursive: true });
  fs.copyFileSync(dariPath, kePath);
  jumlahFile++;
  jumlahByte += st.size;
}

function ukuran(b) {
  if (b < 1024) return b + " B";
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + " KB";
  return (b / 1024 / 1024).toFixed(2) + " MB";
}

function main() {
  /* Bersihkan dulu supaya file yang SUDAH DIHAPUS di root ikut hilang dari
     www/. Tanpa ini, halaman lama yang sudah dihapus (mis. ewallet.html)
     akan terus ikut ter-bundle ke APK selamanya.

     Yang dihapus adalah ISI www/, BUKAN folder www/ itu sendiri. Di Windows,
     menghapus folder yang sedang dipegang proses lain (dev server dengan
     CWD di situ, Explorer yang membukanya, editor) gagal EPERM — dan build
     berhenti di tengah, meninggalkan salinan basi yang diam-diam ikut
     ter-bundle. Menghapus anak-anaknya saja tetap berhasil dalam kondisi itu. */
  if (fs.existsSync(OUT)) {
    kosongkan(OUT);
    console.log("isi www/ lama dibersihkan.");
  }
  fs.mkdirSync(OUT, { recursive: true });

  let hilang = [];
  SALIN.forEach(function (nama) {
    const dari = path.join(ROOT, nama);
    if (!fs.existsSync(dari)) { hilang.push(nama); return; }
    salinRekursif(dari, path.join(OUT, nama));
  });

  if (hilang.length) {
    console.warn("PERINGATAN: tidak ditemukan di root, dilewati:", hilang.join(", "));
  }

  /* index.html WAJIB ada di akar www/ — tanpa itu WebView membuka halaman
     kosong dan penyebabnya sulit dilacak dari dalam APK. Lebih baik gagal
     di sini, keras dan jelas. */
  const entry = path.join(OUT, "index.html");
  if (!fs.existsSync(entry)) {
    console.error("GAGAL: www/index.html tidak ada. APK akan blank. Build dibatalkan.");
    process.exit(1);
  }

  console.log("\nwww/ siap:");
  SALIN.forEach(function (nama) {
    const p = path.join(OUT, nama);
    if (!fs.existsSync(p)) return;
    const isDir = fs.statSync(p).isDirectory();
    const n = isDir ? hitungFile(p) : 1;
    console.log("  " + nama.padEnd(12) + (isDir ? n + " file" : "1 file"));
  });
  console.log("  ------------");
  console.log("  total       " + jumlahFile + " file (" + ukuran(jumlahByte) + ")");
  peringatanSyncBasi();
  console.log("\nLangkah berikutnya:  npx cap sync");
}

/* Menyalin ke www/ SAJA tidak membuat APK ikut berubah: Capacitor punya
   salinan KETIGA di android/app/src/main/assets/public, dan itu hanya
   diperbarui oleh `npx cap sync`. Melewatkannya menghasilkan APK berisi
   kode lama TANPA error apa pun — gejalanya membingungkan karena kode di
   root sudah benar tapi yang jalan di HP versi sebelumnya. Ini sudah
   pernah terjadi (fitur margin tidak muncul di APK karena margin-calc.js
   belum ikut tersalin), jadi sekarang diperiksa dan diperingatkan. */
function peringatanSyncBasi() {
  var apk = path.join(ROOT, "android", "app", "src", "main", "assets", "public", "scripts");
  if (!fs.existsSync(apk)) return;                 /* belum pernah cap sync */
  try {
    var diWww = fs.readdirSync(path.join(OUT, "scripts"));
    var diApk = fs.readdirSync(apk);
    var hilang = diWww.filter(function (f) { return diApk.indexOf(f) === -1; });
    if (hilang.length) {
      console.warn("\n!! SALINAN APK BASI — " + hilang.length +
        " file belum ada di android/: " + hilang.join(", ") +
        "\n   APK akan memakai kode LAMA sampai `npx cap sync` dijalankan.");
    }
  } catch (e) {
    console.error("build-www: gagal memeriksa salinan APK:", e);
  }
}

/* Hapus seluruh isi folder tanpa menghapus foldernya sendiri. Kalau ada
   satu berkas yang benar-benar terkunci, laporkan dengan jelas — jangan
   diam-diam melanjutkan dengan salinan setengah jadi. */
function kosongkan(dir) {
  fs.readdirSync(dir).forEach(function (nama) {
    const p = path.join(dir, nama);
    try {
      fs.rmSync(p, { recursive: true, force: true });
    } catch (e) {
      console.error("GAGAL menghapus " + path.relative(ROOT, p) + " — " + e.code +
        ".\nTutup dulu program yang sedang memakai folder www/ " +
        "(dev server, File Explorer, editor), lalu jalankan lagi.");
      process.exit(1);
    }
  });
}

function hitungFile(dir) {
  let n = 0;
  fs.readdirSync(dir).forEach(function (nama) {
    const p = path.join(dir, nama);
    n += fs.statSync(p).isDirectory() ? hitungFile(p) : 1;
  });
  return n;
}

main();
