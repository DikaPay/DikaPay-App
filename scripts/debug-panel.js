/* ===========================================================================
   DikaPay — debug-panel.js   (window.DikaDebugPanel)

   PANEL DIAGNOSTIK DI DALAM APLIKASI — supaya member/penguji bisa
   SCREENSHOT langsung dari HP tanpa kabel USB, tanpa chrome://inspect,
   tanpa adb logcat. Menampilkan sebagai TEKS BIASA di layar:

     1. Percobaan upload foto profil TERAKHIR (endpoint, status HTTP, body
        mentah, field yang dipakai server, apakah URL-nya benar-benar bisa
        dimuat balik) — ditulis oleh api.js (unggahFotoProfil) & profil-
        foto.js (hasil ujiMuat), dibaca dari localStorage.
     2. Pemeriksaan aplikasi berisiko TERAKHIR (plugin terdaftar?, hasil
        mentah dari sisi Java, berapa lama, paket apa yang ketemu) —
        ditulis oleh integritas.js, dibaca dari localStorage.

   ============================ INI SEMENTARA ================================
   Ditandai jelas di UI sebagai "Info Debug Sementara" dan boleh dihapus
   kalau sudah tidak diperlukan lagi — cari file ini + pemicunya di
   akun.js (long-press pada versi aplikasi, layar Tentang DikaPay).

   Dibuka lewat: Akun > Bantuan & Lainnya > Tentang DikaPay > tekan & tahan
   teks "Versi 1.0.0" selama ±700ms.

   ========================= TIDAK ADA DATA SENSITIF =========================
   Yang disimpan HANYA metadata percobaan (URL endpoint, status HTTP, body
   respons, nama field, ms). TIDAK PERNAH menyimpan PIN, device_token, atau
   isi base64 foto itu sendiri.
   =========================================================================== */
(function () {
  "use strict";

  var KEY_FOTO = "dikapay:debug:foto";
  var KEY_INTEGRITAS = "dikapay:debug:integritas";

  function bacaJson(key) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function waktuBacaan(ms) {
    if (!ms) return "-";
    try {
      var d = new Date(ms);
      var pad = function (n) { return String(n).padStart(2, "0"); };
      return pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear() +
        " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
    } catch (e) { return String(ms); }
  }

  function garis() { return "----------------------------------------------------"; }

  function seksiFoto() {
    var rec = bacaJson(KEY_FOTO);
    var L = [];
    L.push("📷 FOTO PROFIL — percobaan upload TERAKHIR");
    L.push(garis());
    if (!rec) {
      L.push("Belum ada percobaan upload foto tercatat di perangkat ini.");
      L.push("(Coba ganti foto profil dulu lewat Data Diri > Ganti Gambar Profil,");
      L.push(" lalu buka panel ini lagi.)");
      return L.join("\n");
    }
    L.push("Waktu        : " + waktuBacaan(rec.waktu));
    L.push("Endpoint     : " + (rec.endpoint || "-"));
    L.push("Tipe gambar  : " + (rec.tipeGambar || "-"));
    L.push("Status HTTP  : " + (rec.httpStatus == null ? "(tidak ada respons)" : rec.httpStatus));
    L.push("");
    L.push("Body mentah dari server:");
    L.push(rec.bodyMentah || "(kosong / bukan JSON)");
    L.push("");
    L.push("Field URL dipakai : " + (rec.fieldDipakai || "(tidak ada)"));
    L.push("Sesuai kontrak `foto_url`? : " +
      (rec.fieldDipakai == null ? "-" : (rec.kontrakCocok ? "YA" : "TIDAK — server pakai nama field lain!")));
    L.push("foto_url diterima : " + (rec.fotoUrlDiterima || "(tidak ada)"));
    L.push("");
    if (rec.errorPesan) {
      L.push("❌ ERROR: " + rec.errorPesan);
    }
    if (rec.ujiMuatBerhasil == null) {
      L.push("Uji muat balik (browser benar2 bisa menampilkan gambarnya?) : belum diuji");
    } else if (rec.ujiMuatBerhasil) {
      L.push("✅ Uji muat balik : BERHASIL — gambar benar-benar bisa dimuat browser.");
    } else {
      L.push("❌ Uji muat balik : GAGAL — server bilang OK tapi gambarnya TIDAK bisa dimuat.");
      L.push("   Pesan: " + (rec.ujiMuatPesan || "-"));
    }
    return L.join("\n");
  }

  function seksiIntegritas() {
    var rec = bacaJson(KEY_INTEGRITAS);
    var L = [];
    L.push("🛡️ DETEKSI APLIKASI BERISIKO — pemeriksaan TERAKHIR");
    L.push(garis());
    if (!rec) {
      L.push("Belum ada pemeriksaan tercatat di perangkat ini.");
      L.push("(Seharusnya tidak terjadi — integritas.js jalan otomatis di semua");
      L.push(" halaman. Coba tutup & buka ulang aplikasinya.)");
      return L.join("\n");
    }
    L.push("Waktu             : " + waktuBacaan(rec.waktu));
    L.push("Halaman terakhir  : " + (rec.halaman || "-"));
    L.push("Capacitor ada?    : " + (rec.capacitorAda ? "YA" : "TIDAK (dibuka sbg web biasa)"));
    L.push("Plugin terdaftar? : " + (rec.pluginAda ? "YA" : "❌ TIDAK — deteksi tidak akan pernah jalan!"));
    L.push("Platform native?  : " + (rec.isNative ? "YA" : "TIDAK"));
    L.push("Lama panggilan    : " + (rec.lamaMsPanggilan == null ? "-" : rec.lamaMsPanggilan + " ms"));
    L.push("");
    L.push("Hasil MENTAH dari sisi Java (periksaPaket):");
    L.push(rec.hasilMentahDariJava ? JSON.stringify(rec.hasilMentahDariJava) : "(tidak ada / plugin tidak menjawab)");
    L.push("");
    L.push("Kesimpulan        : " + (rec.aman == null ? "-" : (rec.aman ? "AMAN (tidak ada temuan)" : "DIBLOKIR")));
    if (rec.temuan && rec.temuan.length) {
      L.push("Temuan            : " + rec.temuan.join(" | "));
    }
    if (rec.galatFatal) {
      L.push("");
      L.push("❌ GALAT FATAL saat pemeriksaan: " + rec.galatFatal);
    }
    if (rec.langkah && rec.langkah.length) {
      L.push("");
      L.push("Jejak langkah demi langkah:");
      rec.langkah.forEach(function (lg, i) {
        var d = lg.data;
        var teksData = "";
        if (d != null) {
          try { teksData = " -> " + (typeof d === "string" ? d : JSON.stringify(d)); }
          catch (e) { teksData = ""; }
        }
        L.push("  " + (i + 1) + ". " + lg.pesan + teksData);
      });
    }
    return L.join("\n");
  }

  var elOverlay = null;

  function bangun() {
    var ov = document.createElement("div");
    ov.id = "dikaDebugPanel";
    ov.setAttribute("role", "dialog");
    ov.setAttribute("aria-modal", "true");
    ov.setAttribute("aria-label", "Info Debug Sementara");
    /* Inline SEMUA gaya — panel ini harus tetap tampil & terbaca walau CSS
       halaman gagal dimuat, sama seperti galat-global.js. */
    ov.style.cssText = [
      "position:fixed", "inset:0", "z-index:2147483647",
      "background:#0B2447", "color:#eaf0ff", "visibility:visible",
      "display:flex", "flex-direction:column",
      "font-family:ui-monospace,SFMono-Regular,Consolas,Menlo,monospace",
      "font-size:12.5px", "line-height:1.6",
    ].join(";");

    var head = document.createElement("div");
    head.style.cssText = "flex:0 0 auto;padding:14px 16px 10px;border-bottom:1px solid rgba(255,255,255,.15)";
    head.innerHTML =
      '<div style="font-weight:700;font-size:14.5px;color:#FFC93C">🔧 Info Debug Sementara</div>' +
      '<div style="opacity:.75;margin-top:3px;font-size:11.5px">' +
      "Panel ini cuma untuk membantu diagnosa selama pengembangan — boleh " +
      "dihapus nanti. Screenshot layar ini kalau diminta." +
      "</div>";

    var body = document.createElement("div");
    body.style.cssText = "flex:1 1 auto;overflow:auto;padding:14px 16px;white-space:pre-wrap;word-break:break-word";
    var pre1 = document.createElement("div");
    pre1.style.marginBottom = "22px";
    pre1.textContent = seksiFoto();
    var pre2 = document.createElement("div");
    pre2.textContent = seksiIntegritas();
    body.appendChild(pre1);
    body.appendChild(pre2);

    var foot = document.createElement("div");
    foot.style.cssText = "flex:0 0 auto;display:flex;gap:10px;padding:12px 16px;" +
      "border-top:1px solid rgba(255,255,255,.15)";

    var bTutup = document.createElement("button");
    bTutup.type = "button";
    bTutup.textContent = "Tutup";
    bTutup.style.cssText = "flex:1;padding:12px;border:0;border-radius:12px;" +
      "background:#FFC93C;color:#0B2447;font-weight:700;font-size:13.5px;" +
      "font-family:inherit;cursor:pointer";
    bTutup.addEventListener("click", tutup);

    var bHapus = document.createElement("button");
    bHapus.type = "button";
    bHapus.textContent = "Hapus Data Debug";
    bHapus.style.cssText = "flex:1;padding:12px;border:1px solid rgba(255,255,255,.3);" +
      "border-radius:12px;background:transparent;color:#eaf0ff;font-size:13.5px;" +
      "font-family:inherit;cursor:pointer";
    bHapus.addEventListener("click", function () {
      try {
        localStorage.removeItem(KEY_FOTO);
        localStorage.removeItem(KEY_INTEGRITAS);
      } catch (e) {}
      pre1.textContent = seksiFoto();
      pre2.textContent = seksiIntegritas();
    });

    foot.appendChild(bTutup);
    foot.appendChild(bHapus);

    ov.appendChild(head);
    ov.appendChild(body);
    ov.appendChild(foot);
    return ov;
  }

  function buka() {
    try {
      if (elOverlay) return; // sudah terbuka
      elOverlay = bangun();
      document.body.appendChild(elOverlay);
      document.body.style.visibility = "visible"; // jaga-jaga integritas.js sedang menyembunyikan body
    } catch (e) {
      console.error("debug-panel: gagal membuka panel:", e);
    }
  }

  function tutup() {
    try {
      if (elOverlay) { elOverlay.remove(); elOverlay = null; }
    } catch (e) {}
  }

  function ada() { return !!elOverlay; }

  window.DikaDebugPanel = { buka: buka, tutup: tutup, ada: ada };
})();
