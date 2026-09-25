/* ===========================================================================
   DikaPay — verify-build.js
   Memeriksa apakah kode yang benar-benar dibawa APK SAMA dengan kode sumber.

     node verify-build.js          (atau: npm run verify)

   ================== KENAPA ADA: RANTAI SALINAN 4 LAPIS ====================
   Satu perubahan kode harus melewati EMPAT salinan sebelum sampai ke HP:

     1. SUMBER      index.html, pages/, scripts/, styles/, assets/
            |  node build-www.js
     2. www/        (webDir Capacitor)
            |  npx cap sync android
     3. android/app/src/main/assets/public/
            |  Build APK (Gradle / Android Studio)
     4. app-debug.apk  ->  assets/public/ di dalam APK

   Kalau SATU langkah dilewati, semua lapis sesudahnya ikut basi — DAN
   TIDAK ADA ERROR APA PUN. Gejalanya membingungkan: kode di editor sudah
   benar, APK baru saja di-install ulang, tapi aplikasi tetap menampilkan
   perilaku lama. Ini sudah pernah terjadi (lihat CLAUDE.md "Build APK").

   Script ini membandingkan ISI file (hash SHA-1), bukan sekadar ada/tidak
   ada nama filenya. Itu bedanya dengan peringatanSyncBasi() di
   build-www.js, yang hanya melihat nama file — file yang ADA di kedua sisi
   tapi ISINYA beda lolos begitu saja dari pemeriksaan itu, dan justru
   bentuk basi seperti itulah yang paling sering terjadi.

   APK dibaca LANGSUNG sebagai arsip zip (tanpa dependensi npm tambahan,
   sesuai aturan "vanilla saja" di CLAUDE.md) — jadi ini benar-benar
   "membuka isi APK", bukan menebak dari timestamp.
   =========================================================================== */

"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");

const ROOT = __dirname;
const WWW = path.join(ROOT, "www");
const ANDROID_ASSETS = path.join(ROOT, "android", "app", "src", "main", "assets", "public");
const APK_DEBUG = path.join(ROOT, "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk");

/* HARUS sama dengan SALIN di build-www.js. */
const SALIN = ["index.html", "pages", "scripts", "styles", "assets"];

/* Disuntikkan Capacitor saat `cap sync`, memang tidak ada di www/. */
const MILIK_CAPACITOR = new Set(["cordova.js", "cordova_plugins.js"]);

function abaikan(nama) {
  return nama.startsWith(".") || nama === "Thumbs.db";
}

function hash(buf) {
  return crypto.createHash("sha1").update(buf).digest("hex").slice(0, 12);
}

/* relPath (pakai "/" ) -> hash isi file */
function petaFolder(dir, daftarAwal) {
  const peta = new Map();
  if (!fs.existsSync(dir)) return peta;

  function jalan(abs, rel) {
    const st = fs.statSync(abs);
    if (st.isDirectory()) {
      fs.readdirSync(abs).forEach(function (nama) {
        if (abaikan(nama)) return;
        jalan(path.join(abs, nama), rel ? rel + "/" + nama : nama);
      });
      return;
    }
    peta.set(rel, hash(fs.readFileSync(abs)));
  }

  (daftarAwal || fs.readdirSync(dir)).forEach(function (nama) {
    if (abaikan(nama)) return;
    const abs = path.join(dir, nama);
    if (fs.existsSync(abs)) jalan(abs, nama);
  });
  return peta;
}

/* ---- Pembaca ZIP minimal (APK = zip) --------------------------------
   Cukup untuk kebutuhan di sini: cari End Of Central Directory, jalan ke
   central directory, lalu baca entri yang namanya diawali "assets/public/".
   Metode kompresi yang dipakai aapt hanya STORE (0) atau DEFLATE (8). */
function bacaApk(file, prefix) {
  const peta = new Map();
  const buf = fs.readFileSync(file);

  let eocd = -1;
  const mulai = Math.max(0, buf.length - 66560); /* 64KB + ukuran EOCD */
  for (let i = buf.length - 22; i >= mulai; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("EOCD tidak ketemu — file bukan zip/APK yang valid?");

  const jumlahEntri = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16); /* offset central directory */

  for (let i = 0; i < jumlahEntri; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const metode = buf.readUInt16LE(p + 10);
    const ukuranTerkompresi = buf.readUInt32LE(p + 20);
    const panjangNama = buf.readUInt16LE(p + 28);
    const panjangExtra = buf.readUInt16LE(p + 30);
    const panjangKomentar = buf.readUInt16LE(p + 32);
    const offsetLokal = buf.readUInt32LE(p + 42);
    const nama = buf.toString("utf8", p + 46, p + 46 + panjangNama);
    p += 46 + panjangNama + panjangExtra + panjangKomentar;

    if (!nama.startsWith(prefix) || nama.endsWith("/")) continue;

    /* Panjang nama/extra di LOCAL header bisa beda dari central directory —
       wajib dibaca ulang dari sana, bukan dipakai ulang nilai di atas. */
    const namaLokal = buf.readUInt16LE(offsetLokal + 26);
    const extraLokal = buf.readUInt16LE(offsetLokal + 28);
    const awalData = offsetLokal + 30 + namaLokal + extraLokal;
    const mentah = buf.subarray(awalData, awalData + ukuranTerkompresi);
    const isi = metode === 0 ? mentah : zlib.inflateRawSync(mentah);
    peta.set(nama.slice(prefix.length), hash(isi));
  }
  return peta;
}

/* ---- Perbandingan ---------------------------------------------------- */

function banding(label, kiri, kanan, abaikanDiKanan) {
  const beda = [];
  const kurang = [];
  kiri.forEach(function (h, rel) {
    if (!kanan.has(rel)) kurang.push(rel);
    else if (kanan.get(rel) !== h) beda.push(rel);
  });
  const lebih = [];
  kanan.forEach(function (_, rel) {
    const nama = rel.split("/").pop();
    if (!kiri.has(rel) && !(abaikanDiKanan && abaikanDiKanan.has(nama))) lebih.push(rel);
  });

  const ok = !beda.length && !kurang.length && !lebih.length;
  console.log("\n" + (ok ? "  OK  " : " BASI ") + " | " + label);
  console.log("        " + kiri.size + " file dibandingkan");
  if (ok) return true;

  function cetak(judul, arr) {
    if (!arr.length) return;
    console.log("        " + judul + " (" + arr.length + "):");
    arr.slice(0, 12).forEach(function (f) { console.log("          - " + f); });
    if (arr.length > 12) console.log("          ... +" + (arr.length - 12) + " lagi");
  }
  cetak("ISINYA BEDA (versi lama)", beda);
  cetak("BELUM TERSALIN", kurang);
  cetak("SISA FILE LAMA", lebih);
  return false;
}

function main() {
  console.log("=".repeat(66));
  console.log("  VERIFIKASI RANTAI BUILD DikaPay");
  console.log("  sumber -> www/ -> android/assets/public -> APK");
  console.log("=".repeat(66));

  const sumber = petaFolder(ROOT, SALIN);
  let semuaOk = true;

  const www = petaFolder(WWW);
  semuaOk = banding("1. SUMBER  ->  www/                      (node build-www.js)", sumber, www) && semuaOk;

  if (fs.existsSync(ANDROID_ASSETS)) {
    const android = petaFolder(ANDROID_ASSETS);
    semuaOk = banding("2. www/    ->  android/assets/public     (npx cap sync android)",
      www, android, MILIK_CAPACITOR) && semuaOk;
  } else {
    console.log("\n  ---  | 2. android/assets/public belum ada — `npx cap sync android` belum pernah jalan.");
    semuaOk = false;
  }

  if (fs.existsSync(APK_DEBUG)) {
    const st = fs.statSync(APK_DEBUG);
    const apk = bacaApk(APK_DEBUG, "assets/public/");
    console.log("\n        APK: " + path.relative(ROOT, APK_DEBUG));
    console.log("        dibuild: " + st.mtime.toLocaleString() +
      "  (" + (st.size / 1024 / 1024).toFixed(1) + " MB)");
    semuaOk = banding("3. SUMBER  ->  isi app-debug.apk          (Build APK di Android Studio)",
      sumber, apk, MILIK_CAPACITOR) && semuaOk;
  } else {
    console.log("\n  ---  | 3. app-debug.apk belum ada — belum pernah Build APK.");
  }

  console.log("\n" + "=".repeat(66));
  if (semuaOk) {
    console.log("  SEMUA LAPIS SINKRON. APK berisi kode terbaru.");
  } else {
    console.log("  ADA LAPIS YANG BASI — APK TIDAK berisi kode terbaru.");
    console.log("  Perbaiki dengan menjalankan:  npm run rebuild-apk");
  }
  console.log("=".repeat(66) + "\n");
  process.exit(semuaOk ? 0 : 1);
}

main();
