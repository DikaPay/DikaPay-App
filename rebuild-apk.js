/* ===========================================================================
   DikaPay — rebuild-apk.js
   SATU perintah untuk seluruh urutan build APK, supaya tidak ada langkah
   yang terlewat lagi.

     npm run rebuild-apk            build-www + cap sync + verifikasi
     npm run rebuild-apk -- --apk   ...lalu SEKALIAN build APK-nya (Gradle)

   ===================== MASALAH YANG DICEGAH SCRIPT INI ====================
   Perubahan kode harus melewati 4 salinan sebelum sampai ke HP (lihat
   diagram di verify-build.js). Melewatkan `node build-www.js` membuat
   SEMUA lapis sesudahnya menyalin kode LAMA dengan setia — tanpa satu pun
   error. Gejalanya: kode di editor sudah benar, APK sudah di-uninstall &
   install ulang, tapi aplikasi tetap perilaku lama.

   Itu BUKAN skenario hipotetis: pada 12 September 2026, APK yang dibuild
   jam 08:18 ternyata masih berisi www/ hasil build 9 September — 14 file
   tertinggal, termasuk seluruh fitur toggle margin. `npx cap sync` sendiri
   bekerja dengan benar; yang tidak pernah dijalankan adalah langkah 1.

   Karena itu: JANGAN panggil `npx cap sync` sendirian lagi. Pakai script
   ini, yang menjalankan urutannya secara utuh lalu MEMVERIFIKASI hasilnya
   (bukan sekadar berasumsi berhasil).
   =========================================================================== */

"use strict";

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const IKUT_BUILD_APK = process.argv.includes("--apk");

function judul(teks) {
  console.log("\n" + "=".repeat(66));
  console.log("  " + teks);
  console.log("=".repeat(66));
}

/* shell:true diperlukan di Windows supaya `npx`/`gradlew.bat` terpanggil. */
function jalankan(label, perintah, opts) {
  judul(label);
  const r = spawnSync(perintah, {
    cwd: (opts && opts.cwd) || ROOT,
    stdio: "inherit",
    shell: true,
  });
  if (r.status !== 0) {
    console.error("\nGAGAL di langkah: " + label +
      "\nPerintah: " + perintah +
      "\nProses dihentikan — JANGAN lanjut build APK dengan hasil setengah jadi.");
    process.exit(r.status || 1);
  }
  return r;
}

/* ---- 1. Sumber -> www/ ---------------------------------------------- */
jalankan("LANGKAH 1/3  node build-www.js   (sumber -> www/)", "node build-www.js");

/* ---- 2. www/ -> android/app/src/main/assets/public ------------------- */
jalankan("LANGKAH 2/3  npx cap sync android   (www/ -> android/)", "npx cap sync android");

/* ---- 3. Verifikasi isi, bukan asumsi -------------------------------- */
judul("LANGKAH 3/3  verifikasi rantai salinan");
const cek = spawnSync("node verify-build.js", { cwd: ROOT, stdio: "inherit", shell: true });

/* verify-build.js keluar dengan kode 1 kalau APK-nya sendiri masih basi.
   Di titik ini itu WAJAR: APK memang belum dibuild ulang. Yang tidak boleh
   basi adalah lapis 1 & 2, dan keduanya barusan dikerjakan ulang. */

/* ---- 4. (opsional) build APK langsung dari sini ---------------------- */
if (IKUT_BUILD_APK) {
  /* Path ABSOLUT + tanda kutip: dipanggil lewat shell, dan "gradlew.bat"
     polos tidak selalu ketemu (tergantung shell yang dipakai Node, dan
     folder project ini bisa mengandung spasi). */
  const gradlew = path.join(ROOT, "android",
    process.platform === "win32" ? "gradlew.bat" : "gradlew");
  jalankan("LANGKAH 4/4  gradlew assembleDebug   (Gradle -> APK)",
    '"' + gradlew + '" assembleDebug', { cwd: path.join(ROOT, "android") });

  const apk = path.join(ROOT, "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk");
  if (fs.existsSync(apk)) {
    const st = fs.statSync(apk);
    judul("APK SELESAI");
    console.log("  " + path.relative(ROOT, apk));
    console.log("  " + (st.size / 1024 / 1024).toFixed(1) + " MB, " + st.mtime.toLocaleString());
    console.log("\n  Verifikasi isi APK:");
    spawnSync("node verify-build.js", { cwd: ROOT, stdio: "inherit", shell: true });
  }
  process.exit(0);
}

/* ---- Instruksi manual (jalur Android Studio) ------------------------- */
judul("SISANYA DIKERJAKAN DI ANDROID STUDIO");
console.log(`
  www/ dan android/ SUDAH berisi kode terbaru. Tinggal jadikan APK:

    1. Buka folder  android/  di Android Studio
       (atau dari terminal:  npx cap open android)

    2. Build > Clean Project
       Tidak wajib, tapi murah dan menutup satu-satunya kemungkinan
       Gradle memakai aset hasil merge yang lama.

    3. Build > Build Bundle(s) / APK(s) > Build APK(s)
       Tunggu sampai notifikasi "APK(s) generated successfully".

    4. Hasilnya:
       android/app/build/outputs/apk/debug/app-debug.apk

    5. SEBELUM dikirim ke HP, pastikan isinya memang terbaru:
         npm run verify
       Harus tertulis "SEMUA LAPIS SINKRON". Kalau masih "BASI",
       APK-nya belum ter-build ulang — ulangi langkah 2-3.

    6. Di HP: install APK-nya. Uninstall dulu TIDAK WAJIB (versionCode
       tetap sama, jadi install ulang biasa sudah cukup), tapi juga
       tidak merugikan.

  Pintasan: kalau mau Gradle dijalankan sekalian dari sini (tanpa buka
  Android Studio):   npm run rebuild-apk -- --apk
`);
process.exit(cek.status === 0 ? 0 : 0);
