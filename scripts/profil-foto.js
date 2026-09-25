/* ===========================================================================
   DikaPay — profil-foto.js
   SATU-SATUNYA tempat foto profil member diurus (validasi, unggah, cache,
   dan pemasangan ke elemen avatar).

     window.DikaProfilFoto = {
       MAKS_BYTE                 // 2 MB
       url()                     // -> string | ""   foto akun yang aktif
       simpan(url)               // cache lokal (per nomor HP)
       hapus()                   // buang cache akun aktif
       unggah(file)              // -> Promise<string fotoUrl>
       pasang(el, nama)          // render foto ATAU inisial ke satu elemen
       pasangSemua(nama)         // render ke semua [data-avatar] di halaman
     }

   ======================= KENAPA MODUL TERPISAH =============================
   Avatar member muncul di LEBIH DARI SATU halaman (header Akun, topbar
   Beranda). Kalau tiap halaman membaca cache & membangun markup-nya
   sendiri, satu halaman akan tertinggal setiap kali aturannya berubah —
   pola bug yang sama seperti badge notifikasi vs daftarnya. Jadi "avatar
   itu tampilannya bagaimana" dijawab di sini saja, lewat `pasang()`.

   ============================ NAMESPACE PER AKUN ===========================
     dikapay:profil:foto:<nomor digit>
   Pola yang SAMA dengan dikapay:device_token:<digit> dan
   dikapay:notif:baseline:<digit>. Satu HP dipakai banyak akun uji; foto
   akun A tidak boleh pernah muncul di akun B.

   Yang disimpan cuma URL-nya (pendek), BUKAN base64-nya: menaruh gambar
   2 MB di localStorage gampang menabrak kuota, dan gambarnya toh sudah
   ada di server dan akan di-cache HTTP oleh WebView.

   =============================== CARA MENGAMBIL ===========================
   `@capacitor/camera` SUDAH terpasang. `ambil(sumber)` memakainya di APK:
   "camera" membuka kamera langsung, "gallery" membuka galeri — dua sumber
   berbeda dari plugin yang sama.

   Plugin mengembalikan DATA URL, bukan File. Karena itu `unggah()` menerima
   KEDUANYA: data URL (jalur plugin) maupun File (jalur web/cadangan). Satu
   fungsi unggah, dua bentuk masukan — supaya validasi ukuran/tipe dan
   pemanggilan endpoint tidak perlu ditulis dua kali.

   Plugin juga diminta MENGECILKAN gambar di sisi perangkat (width/quality).
   Foto kamera HP hari ini mudah menembus 5-10 MB sedangkan endpointnya
   berhenti di 2 MB — mengecilkannya lebih dulu jauh lebih ramah daripada
   menolak foto setelah member sudah memotretnya.

   Di luar APK (dibuka sebagai web biasa) plugin tidak tersedia; `ambil()`
   mengembalikan null dan pemanggil jatuh ke `<input type="file">` yang
   sudah ada. Jalur itu SENGAJA dipertahankan, bukan dihapus.
   =========================================================================== */

(function () {
  "use strict";

  var PREFIX = "dikapay:profil:foto:";
  var MAKS_BYTE = 2 * 1024 * 1024;              /* 2 MB, sesuai kontrak endpoint */
  var TIPE_OK = ["image/jpeg", "image/jpg", "image/png"];

  function digits(phone) {
    return String(phone == null ? "" : phone).replace(/\D/g, "");
  }

  function nomorAktif() {
    try {
      var p = JSON.parse(localStorage.getItem("dikapay:profile") || "{}");
      return digits(p.phone);
    } catch (e) { return ""; }
  }

  function url() {
    var d = nomorAktif();
    if (!d) return "";
    try { return localStorage.getItem(PREFIX + d) || ""; }
    catch (e) { return ""; }
  }

  function simpan(fotoUrl) {
    var d = nomorAktif();
    if (!d || !fotoUrl) return false;
    try { localStorage.setItem(PREFIX + d, String(fotoUrl)); return true; }
    catch (e) { console.warn("profil-foto: URL foto tidak tersimpan:", e); return false; }
  }

  function hapus() {
    var d = nomorAktif();
    if (!d) return;
    try { localStorage.removeItem(PREFIX + d); } catch (e) {}
  }

  /* Inisial dipakai saat foto belum ada — salinan kecil initials() yang
     sudah dipakai akun.js/auth-flow.js, dengan nama sendiri supaya modul
     ini tidak terikat urutan <script> halaman mana pun. */
  function inisial(nama) {
    var bagian = String(nama || "").trim().split(/\s+/).filter(Boolean);
    if (!bagian.length) return "?";
    if (bagian.length === 1) return bagian[0].slice(0, 2).toUpperCase();
    return (bagian[0][0] + bagian[bagian.length - 1][0]).toUpperCase();
  }

  /* Satu elemen avatar bisa berisi DUA hal bergantian: <img> foto, atau
     inisial/ikon bawaan. Isi asli (mis. ikon dompet di topbar Beranda)
     disimpan sekali di `dataset` supaya bisa dikembalikan saat foto
     dihapus — tanpa itu, sekali foto dipasang ikon aslinya hilang
     selamanya sampai halaman dimuat ulang. */
  function pasang(el, nama) {
    if (!el) return;
    try {
      if (el.dataset.avatarAsli === undefined) el.dataset.avatarAsli = el.innerHTML;
      var f = url();
      if (f) {
        var img = el.querySelector(".avatar-foto");
        if (!img) {
          el.innerHTML = "";
          img = document.createElement("img");
          img.className = "avatar-foto";
          img.alt = "";
          img.setAttribute("aria-hidden", "true");

          /* ============ GAGAL MUAT: JANGAN HAPUS URL-nya ==================
             BUG YANG DIPERBAIKI: dulu handler ini memanggil hapus(), jadi
             SATU kegagalan muat — jaringan sedang mati, server sesaat 404,
             CORS meleset — MENGHAPUS URL foto secara permanen. Sesudah itu
             avatar kembali ke inisial SELAMANYA walau unggahannya benar-
             benar berhasil, dan tidak ada jejak apa pun untuk dilacak.
             Persis gejala "foto profil tidak berubah walau upload berhasil".

             Kegagalan muat itu FANA; URL-nya sendiri belum tentu salah.
             Jadi: URL DIPERTAHANKAN, kegagalannya DICATAT dengan jelas, dan
             percobaan berikutnya (halaman dibuka lagi / pageshow) akan
             mencoba memuatnya lagi. */
          img.addEventListener("error", function () {
            console.error(
              "profil-foto: GAMBAR AVATAR GAGAL DIMUAT.\n" +
              "  URL   : " + f + "\n" +
              "  Elemen: " + (el.id ? "#" + el.id : el.className) + "\n" +
              "  URL TIDAK dihapus — akan dicoba lagi saat halaman dibuka " +
              "berikutnya. Kalau ini terus berulang, periksa apakah berkasnya " +
              "benar-benar ada di server dan bisa diakses dari WebView " +
              "(404 / CORS / mixed-content)."
            );
            /* Ditandai supaya bisa dilihat dari DevTools tanpa membaca log,
               dan supaya CSS bisa membedakannya dari avatar tanpa foto. */
            el.setAttribute("data-avatar-error", f);
            el.classList.remove("has-foto");
            el.innerHTML = el.dataset.avatarAsli || inisial(nama);
          });
          img.addEventListener("load", function () {
            el.removeAttribute("data-avatar-error");
            console.info("[profil-foto] avatar BERHASIL dimuat", JSON.stringify({
              url: f,
              elemen: el.id ? "#" + el.id : el.className,
              ukuran: img.naturalWidth + "x" + img.naturalHeight,
            }));
          });
          el.appendChild(img);
        }
        if (img.getAttribute("src") !== f) {
          /* URL yang BENAR-BENAR dipasang ke <img>. Kalau di chrome://inspect
             tab Network tidak menunjukkan permintaan ke URL ini, berarti
             masalahnya sebelum render (URL tidak tersimpan), bukan di
             pemuatan gambar. */
          console.info("[profil-foto] memasang src avatar:", f,
            "| elemen:", el.id ? "#" + el.id : el.className);
          img.setAttribute("src", f);
        }
        el.classList.add("has-foto");
        return;
      }
      el.classList.remove("has-foto");
      var asli = el.dataset.avatarAsli;
      /* Elemen yang memang menampilkan inisial (header Akun) diisi
         inisial; elemen yang aslinya ikon (topbar Beranda) dikembalikan
         ke ikonnya. Dibedakan dari apakah isi aslinya memuat markup. */
      el.innerHTML = (asli && asli.indexOf("<") !== -1) ? asli : inisial(nama);
    } catch (e) {
      console.error("profil-foto: gagal memasang avatar:", e);
    }
  }

  function pasangSemua(nama) {
    var daftar = document.querySelectorAll("[data-avatar]");
    for (var i = 0; i < daftar.length; i++) pasang(daftar[i], nama);
  }

  /* ---- Ambil dari kamera / galeri lewat plugin ------------------------ */

  function cameraPlugin() {
    try {
      var C = window.Capacitor;
      if (!C || !C.Plugins || !C.Plugins.Camera) return null;
      if (typeof C.isNativePlatform === "function" && !C.isNativePlatform()) return null;
      return C.Plugins.Camera;
    } catch (e) { return null; }
  }

  /* -> Promise<string dataUrl> | Promise<null> kalau plugin tidak ada
     (pemanggil lalu memakai <input type="file">).
     Dibatalkan member -> Promise ditolak dengan galat ber-`batal: true`,
     supaya pemanggil bisa diam saja alih-alih menampilkan pesan error. */
  function ambil(sumber) {
    var Cam = cameraPlugin();
    if (!Cam) return Promise.resolve(null);
    return Cam.getPhoto({
      quality: 82,
      /* Dikecilkan di perangkat supaya jauh di bawah batas 2 MB endpoint. */
      width: 1024,
      height: 1024,
      resultType: "dataUrl",
      allowEditing: false,
      correctOrientation: true,
      source: sumber === "camera" ? "CAMERA" : "PHOTOS",
      promptLabelHeader: "Foto Profil",
      promptLabelCancel: "Batal",
    }).then(function (foto) {
      var u = foto && (foto.dataUrl || foto.webPath);
      if (!u) throw galat("Fotonya belum terbaca. Coba pilih lagi, ya.", "hasil kamera kosong");
      return u;
    }, function (e) {
      var pesan = String((e && (e.message || e.errorMessage)) || "");
      /* Plugin memakai kalimat berbeda-beda untuk "dibatalkan" tergantung
         versi/Android — dicocokkan longgar; sisanya galat sungguhan. */
      if (/cancel|dibatalkan/i.test(pesan)) {
        var b = galat("", "dibatalkan member");
        b.batal = true;
        throw b;
      }
      if (/permission|denied|izin/i.test(pesan)) {
        throw galat("Izin kamera/galeri belum diberikan. Aktifkan dulu di Pengaturan aplikasi, ya.", pesan);
      }
      throw galat("Kamera atau galeri belum bisa dibuka. Coba lagi, ya.", pesan);
    });
  }

  function bacaSebagaiDataUrl(file) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(String(fr.result || "")); };
      fr.onerror = function () { rej(new Error("FileReader gagal membaca file")); };
      fr.readAsDataURL(file);
    });
  }

  function galat(pesan, sebab) {
    var e = new Error(pesan);
    e.pesanMember = pesan;
    e.sebab = sebab || "";
    return e;
  }

  /* Perkiraan ukuran byte dari panjang base64 (4 karakter = 3 byte). */
  function byteDataUrl(dataUrl) {
    var i = String(dataUrl).indexOf(",");
    if (i < 0) return 0;
    var b64 = String(dataUrl).slice(i + 1);
    var pad = (b64.slice(-2).match(/=/g) || []).length;
    return Math.max(0, Math.floor(b64.length * 3 / 4) - pad);
  }

  /* Menerima DUA bentuk masukan: File (jalur <input type="file">) dan data
     URL (jalur plugin Camera). Validasi ukuran & tipe berlaku sama untuk
     keduanya, dan dilakukan SEBELUM apa pun dikirim. */
  function unggah(masukan) {
    if (!masukan) return Promise.reject(galat("Belum ada foto yang dipilih.", "masukan kosong"));

    var dataUrlLangsung = null;
    if (typeof masukan === "string") {
      var m = /^data:(image\/[a-z+.-]+);base64,/i.exec(masukan);
      if (!m) return Promise.reject(galat("Fotonya belum terbaca. Coba pilih lagi, ya.", "bukan data URL gambar"));
      var tipeUrl = m[1].toLowerCase();
      if (TIPE_OK.indexOf(tipeUrl) === -1) {
        return Promise.reject(galat("Fotonya harus JPG atau PNG, ya.", "tipe " + tipeUrl));
      }
      var ukuran = byteDataUrl(masukan);
      if (ukuran > MAKS_BYTE) {
        return Promise.reject(galat(
          "Ukuran foto maksimal 2 MB. Foto kamu " + (ukuran / 1024 / 1024).toFixed(1) +
          " MB — coba pilih yang lebih kecil, ya.", "ukuran " + ukuran));
      }
      dataUrlLangsung = masukan;
    } else {
      var tipe = String(masukan.type || "").toLowerCase();
      if (TIPE_OK.indexOf(tipe) === -1) {
        return Promise.reject(galat("Fotonya harus JPG atau PNG, ya.", "tipe " + (tipe || "tidak dikenal")));
      }
      if (masukan.size > MAKS_BYTE) {
        var mb = (masukan.size / 1024 / 1024).toFixed(1);
        return Promise.reject(galat(
          "Ukuran foto maksimal 2 MB. Foto kamu " + mb + " MB — coba pilih yang lebih kecil, ya.",
          "ukuran " + masukan.size));
      }
    }

    var S = window.DikaMemberSync;
    var token = S && typeof S.getToken === "function" ? S.getToken() : "";
    if (!token) {
      return Promise.reject(galat(
        "Sesi kamu belum siap untuk mengunggah foto. Coba keluar lalu masuk lagi, ya.",
        "device_token tidak ada"));
    }
    if (!window.DikaApi || typeof DikaApi.unggahFotoProfil !== "function") {
      return Promise.reject(galat("Fitur foto belum siap di versi ini.", "api.js lama / belum dimuat"));
    }

    var siapkan = dataUrlLangsung
      ? Promise.resolve(dataUrlLangsung)
      : bacaSebagaiDataUrl(masukan).catch(function (e) {
          throw galat("Fotonya belum terbaca. Coba pilih lagi, ya.", e.message);
        });

    var mulai = Date.now();
    return siapkan
      .then(function (dataUrl) {
        console.info("[profil-foto] MULAI unggah", JSON.stringify({
          sumber: dataUrlLangsung ? "plugin Camera (data URL)" : "input file",
          tipe: (/^data:([^;]+)/.exec(dataUrl) || [])[1] || "?",
          perkiraanByte: byteDataUrl(dataUrl),
          nomor: nomorAktif(),
          adaToken: !!token,
        }));
        return DikaApi.unggahFotoProfil(token, dataUrl);
      })
      .then(function (fotoUrl) {
        console.info("[profil-foto] server menjawab dalam " + (Date.now() - mulai) +
          " ms, foto_url = " + fotoUrl);
        /* Server bilang "ok" TIDAK sama dengan "fotonya bisa dilihat".
           Berkasnya masih bisa 404, diblokir CORS, atau jadi mixed-content
           di WebView. Kalau itu terjadi, mengklaim "berhasil diperbarui"
           ke member adalah bohong — avatarnya tidak akan pernah berubah.
           Jadi URL-nya DICOBA MUAT dulu di sini; baru setelah benar-benar
           termuat ia disimpan dan dianggap berhasil. */
        return ujiMuat(fotoUrl).then(function () {
          var ok = simpan(fotoUrl);
          console.info("[profil-foto] URL terbukti bisa dimuat & " +
            (ok ? "TERSIMPAN" : "GAGAL DISIMPAN") + " di " + PREFIX + nomorAktif());
          if (window.DikaApi && DikaApi.catatDebugFotoUjiMuat) {
            DikaApi.catatDebugFotoUjiMuat(true, null);
          }
          return fotoUrl;
        }, function () {
          console.error(
            "profil-foto: server menerima foto TAPI URL-nya tidak bisa dimuat.\n" +
            "  URL: " + fotoUrl + "\n" +
            "  Periksa: berkasnya ada di server? bisa diakses tanpa login? " +
            "header CORS-nya benar? URL-nya https (bukan http)?"
          );
          if (window.DikaApi && DikaApi.catatDebugFotoUjiMuat) {
            DikaApi.catatDebugFotoUjiMuat(false,
              "Server menjawab ok tapi gambar di URL itu gagal dimuat balik " +
              "(404 / CORS / mixed-content / http bukan https?). URL: " + fotoUrl);
          }
          throw galat(
            "Fotonya sudah terkirim, tapi belum bisa ditampilkan. Coba lagi sebentar lagi, ya.",
            "foto_url tidak bisa dimuat: " + fotoUrl);
        });
      });
  }

  /* Memuat gambar di luar DOM semata-mata untuk MEMBUKTIKAN URL-nya hidup.
     Diberi batas waktu supaya tidak menggantung selamanya kalau servernya
     diam saja. */
  function ujiMuat(fotoUrl) {
    return new Promise(function (res, rej) {
      var img = new Image();
      var beres = false;
      var timer = setTimeout(function () {
        if (beres) return;
        beres = true;
        rej(new Error("timeout memuat " + fotoUrl));
      }, 12000);
      img.onload = function () {
        if (beres) return;
        beres = true;
        clearTimeout(timer);
        /* Gambar 0x0 = berkas ada tapi rusak/bukan gambar. */
        if (!img.naturalWidth) { rej(new Error("gambar kosong")); return; }
        res(fotoUrl);
      };
      img.onerror = function () {
        if (beres) return;
        beres = true;
        clearTimeout(timer);
        rej(new Error("gagal memuat " + fotoUrl));
      };
      img.src = fotoUrl;
    });
  }

  window.DikaProfilFoto = {
    MAKS_BYTE: MAKS_BYTE,
    ambil: ambil,
    url: url,
    simpan: simpan,
    hapus: hapus,
    unggah: unggah,
    inisial: inisial,
    pasang: pasang,
    pasangSemua: pasangSemua,
  };
})();
