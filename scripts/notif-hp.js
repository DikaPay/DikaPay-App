/* ===========================================================================
   DikaPay — notif-hp.js
   NOTIFIKASI SISTEM HP (local notification Android), SATU pintu untuk semua
   alur transaksi.

     window.DikaNotifHp = {
       siap()                       // -> Promise<bool>  izin sudah/berhasil diminta
       kirim({judul, isi, tag?})    // -> Promise<bool>  best-effort
       transaksi(status, {nama, nominal})   // 3 status baku
     }

   ======================= BEDA DARI notif-store.js ==========================
   `notif-store.js` (window.DikaNotif) adalah KOTAK MASUK DI DALAM APP —
   daftar yang dibaca halaman Notifikasi, disimpan di localStorage. Ia tidak
   pernah memunculkan apa pun di tray notifikasi HP.

   Modul ini yang memunculkan notifikasi SISTEM lewat
   `@capacitor/local-notifications`. Keduanya dipakai BERSAMAAN: kotak masuk
   tetap terisi (supaya riwayat kabarnya bisa dibuka lagi), dan HP-nya ikut
   berbunyi saat itu juga.

   ========================== BATAS YANG PERLU DISADARI ======================
   Ini LOCAL notification, bukan PUSH: yang memunculkannya adalah aplikasi
   ini sendiri, jadi ia hanya bisa tampil untuk kejadian yang terjadi DI
   perangkat ini (member menekan Bayar, lalu hasilnya keluar). Perubahan
   status yang terjadi di server saat app tertutup TIDAK akan memunculkan
   apa pun — itu butuh Firebase Cloud Messaging, yang belum ada di project
   ini dan merupakan pekerjaan terpisah.

   =========================== SELALU BEST-EFFORT ============================
   Gagal minta izin, plugin tidak ada (dibuka sebagai web biasa), atau
   penjadwalan ditolak TIDAK PERNAH menghentikan atau menggagalkan
   transaksi. Pola yang sama dengan `playSuccessSound()` di sound.js:
   dicatat ke console, lalu dilewati. Uang member tidak boleh tergantung
   pada apakah HP-nya mau menampilkan notifikasi.
   =========================================================================== */

(function () {
  "use strict";

  var izinOk = null;      /* null = belum pernah diperiksa */
  var idBerikut = 1;

  function plugin() {
    try {
      var C = window.Capacitor;
      if (!C || !C.Plugins || !C.Plugins.LocalNotifications) return null;
      /* Di web biasa plugin ini ada tapi tidak berarti apa-apa — cukup
         lewati saja daripada memunculkan prompt izin browser. */
      if (typeof C.isNativePlatform === "function" && !C.isNativePlatform()) return null;
      return C.Plugins.LocalNotifications;
    } catch (e) { return null; }
  }

  /* Izin diminta SEKALI lalu hasilnya diingat. Android 13+ mewajibkan
     POST_NOTIFICATIONS diminta saat runtime; versi lama mengembalikan
     "granted" langsung. */
  function siap() {
    var LN = plugin();
    if (!LN) return Promise.resolve(false);
    if (izinOk !== null) return Promise.resolve(izinOk);

    return LN.checkPermissions()
      .then(function (st) {
        if (st && st.display === "granted") return true;
        /* `denied` di Android bisa berarti "belum pernah ditanya" — jadi
           tetap diminta dulu, jangan langsung menyerah. Pelajaran yang sama
           sudah dicatat di input-helper.js. */
        return LN.requestPermissions().then(function (r) {
          return !!(r && r.display === "granted");
        });
      })
      .then(function (ok) { izinOk = ok; return ok; })
      .catch(function (e) {
        console.warn("notif-hp: izin notifikasi tidak bisa diperiksa:", e);
        izinOk = false;
        return false;
      });
  }

  function nomorAktif() {
    try {
      var p = JSON.parse(localStorage.getItem("dikapay:profile") || "{}");
      return String(p.phone || "");
    } catch (e) { return ""; }
  }

  /* ===================== CERMIN KE KOTAK MASUK ==========================
     ATURAN: setiap notifikasi sistem yang ditampilkan modul ini WAJIB ikut
     tersimpan di notif-store.js. Alasannya bukan kerapian — notifikasi
     Android hilang begitu digeser, dan tanpa salinan di kotak masuk, pesan
     itu lenyap selamanya. Member yang menggeser notifikasi "transaksi
     gagal" lalu membuka app tidak akan menemukan jejak apa pun.

     Dicerminkan DULU, baru dijadwalkan: id hasil cerminan itulah yang
     ditempelkan ke notifikasi sistem (`extra.nid`), sehingga ketukan pada
     notifikasi bisa membuka entri yang PERSIS sama. Kalau urutannya
     dibalik, notifikasi sistem sudah terlanjur tampil dengan id yang belum
     tentu ada di kotak masuk.

     Dijalankan walau plugin/izin TIDAK ada (mis. dibuka sebagai web biasa):
     kotak masuk tetap harus terisi. */
  function cermin(o) {
    try {
      if (!window.DikaNotif || typeof window.DikaNotif.push !== "function") {
        console.error("notif-hp: notif-store.js belum di-link — pesan ini TIDAK tersimpan " +
          "di kotak masuk dan akan hilang begitu notifikasi digeser.");
        return null;
      }
      var nomor = nomorAktif();
      if (!nomor) {
        console.warn("notif-hp: belum ada profil aktif — pesan tidak dicerminkan ke kotak masuk.");
        return null;
      }
      return window.DikaNotif.push(nomor, {
        type: o.tipe || "success",
        title: String(o.judul || "DikaPay"),
        /* Kotak masuk menyimpan isi PENUH; notifikasi sistem boleh dipotong
           Android, daftar di app tidak. */
        desc: String(o.isi || ""),
      });
    } catch (e) {
      console.error("notif-hp: gagal mencerminkan ke kotak masuk:", e);
      return null;
    }
  }

  function kirim(o) {
    o = o || {};
    var judul = String(o.judul || "DikaPay");
    var isi = String(o.isi || "");

    var entri = cermin(o);
    var nid = entri && entri.id ? entri.id : "";
    console.info("notif-hp: notifikasi disiapkan", JSON.stringify({
      judul: judul, nid: nid, tersimpanDiKotakMasuk: !!entri,
    }));

    return siap().then(function (ok) {
      if (!ok) {
        console.info("notif-hp: izin notifikasi sistem tidak ada — pesan tetap tersimpan " +
          "di kotak masuk (nid " + nid + ").");
        return false;
      }
      var LN = plugin();
      if (!LN) return false;
      return LN.schedule({
        notifications: [{
          /* id WAJIB angka & unik dalam sesi; kalau dipakai ulang, Android
             menimpa notifikasi sebelumnya alih-alih menambah yang baru. */
          id: (Date.now() % 100000) + (idBerikut++),
          title: judul,
          body: isi,
          smallIcon: "ic_stat_dikapay",
          /* `extra` ikut dikembalikan Android saat notifikasinya DIKETUK —
             ini satu-satunya jalan menghubungkan ketukan itu kembali ke
             entri kotak masuk yang benar. Lihat pasangKetukan(). */
          extra: { nid: nid, nomor: nomorAktif() },
          /* Tanpa `schedule.at` -> tampil segera. */
        }],
      }).then(function () { return true; });
    }).catch(function (e) {
      console.warn("notif-hp: notifikasi tidak bisa ditampilkan (diamkan):", e);
      return false;
    });
  }

  /* ===================== KETUKAN NOTIFIKASI =============================
     Member menekan notifikasi di tray -> app dibuka -> WAJIB mendarat di
     halaman Notifikasi pada entri yang dia tekan, bukan di Beranda (yang
     memaksanya mencari sendiri kabar yang barusan dia baca separuh).

     Path dihitung runtime (root vs /pages/) — pola yang sama dengan
     inPages() di auth.js/bottomnav.js, karena file ini di-link dari kedua
     kedalaman. */
  var ketukanTerpasang = false;

  function jalurNotifikasi(nid) {
    var dasar = /\/pages\//i.test(location.pathname) ? "notifikasi.html" : "pages/notifikasi.html";
    return nid ? dasar + "?n=" + encodeURIComponent(nid) : dasar;
  }

  function pasangKetukan() {
    if (ketukanTerpasang) return;
    var LN = plugin();
    if (!LN || typeof LN.addListener !== "function") return;
    ketukanTerpasang = true;
    try {
      LN.addListener("localNotificationActionPerformed", function (ev) {
        try {
          var extra = (ev && ev.notification && ev.notification.extra) || {};
          var nid = extra.nid || "";
          console.info("notif-hp: notifikasi DIKETUK", JSON.stringify({
            nid: nid, actionId: ev && ev.actionId,
          }));
          /* Sudah berada di halaman Notifikasi -> jangan navigasi (itu
             memuat ulang halaman & membuang posisi scroll); cukup beri tahu
             halamannya supaya menyorot entrinya. */
          if (/notifikasi\.html/i.test(location.pathname)) {
            window.dispatchEvent(new CustomEvent("dika:buka-notif", { detail: { nid: nid } }));
            return;
          }
          location.href = jalurNotifikasi(nid);
        } catch (e) {
          console.error("notif-hp: gagal menangani ketukan notifikasi:", e);
        }
      });
      console.info("notif-hp: pendengar ketukan notifikasi terpasang.");
    } catch (e) {
      console.warn("notif-hp: pendengar ketukan tidak bisa dipasang:", e);
      ketukanTerpasang = false;
    }
  }

  /* Dipasang segera: ketukan bisa datang kapan saja setelah app hidup,
     termasuk saat app dibuka DARI notifikasi itu sendiri. */
  try { pasangKetukan(); } catch (e) { /* best-effort, seperti sisa modul ini */ }

  function rupiah(v) {
    var n = Number(v);
    if (!isFinite(n)) return "";
    return "Rp" + Math.round(Math.abs(n)).toLocaleString("id-ID");
  }

  /* ===================== NADA PESAN: HANGAT, BUKAN FORMULIR =============
     Teksnya ditulis SEKALI di sini supaya halaman produk dan transfer
     mengirim kalimat yang sama persis — bukan versi sendiri-sendiri.

     Nadanya sengaja seperti mengobrol, bukan pemberitahuan sistem: member
     sedang menunggu uangnya, dan kalimat kaku ("Transaksi sedang diproses")
     terasa seperti mesin. Yang TIDAK boleh hilang demi keakraban: NAMA
     PRODUK dan NOMINAL — itu inti informasinya, dan tanpa keduanya member
     tidak tahu notifikasi ini soal transaksi yang mana.

     Tiap status punya BEBERAPA varian yang dipilih acak, pola yang sama
     dengan SENDER_NOTIF_TEMPLATES di transfer-member.js. Alasannya sama:
     member bertransaksi berkali-kali sehari, dan kalimat yang sama persis
     berulang-ulang justru terbaca seperti template kaku.

     Nama produk datang APA ADANYA dari pemanggil (`o.nama`) — "Telkomsel
     2.000", "Token PLN 20.000", "Mobile Legends 86 Diamonds", "Transfer ke
     Budi" — jadi kalimatnya menyesuaikan sendiri untuk semua kategori,
     bukan cuma pulsa.

     Kalimat GAGAL WAJIB menjawab ketakutan utama lebih dulu ("saldo kamu
     aman"), pola yang sama dengan pesan gagal di payment-flow.js. Jangan
     mengubahnya jadi sekadar "transaksi gagal". */

  function pilih(daftar) {
    return daftar[Math.floor(Math.random() * daftar.length)];
  }

  /* `p` = nama produk + nominal yang sudah dirangkai, mis.
     "Telkomsel 2.000 (Rp2.105)" atau "Telkomsel 2.000" kalau nominalnya
     tidak dikirim. */
  var TEKS = {
    proses: [
      function (p) { return { judul: "Lagi diproses ya~", isi: "Sabar ya, pesanan " + p + " kamu lagi kami proses~" }; },
      function (p) { return { judul: "Bentar ya…", isi: "Pesanan " + p + " kamu lagi jalan nih. Tunggu sebentar ya!" }; },
      function (p) { return { judul: "Sedang kami urus", isi: "Oke, " + p + " kamu lagi kami urus. Kami kabari lagi begitu beres ya~" }; },
    ],
    berhasil: [
      function (p) { return { judul: "Yeay, berhasil! 🎉", isi: "Yeay, berhasil! " + p + " udah masuk. Makasih udah pakai DikaPay 🎉" }; },
      function (p) { return { judul: "Beres! ✨", isi: "Beres nih! " + p + " udah berhasil diproses. Makasih ya udah pakai DikaPay ✨" }; },
      function (p) { return { judul: "Sukses! 🎉", isi: "Mantap, " + p + " kamu sukses! Semoga harimu lancar terus ya 🎉" }; },
    ],
    gagal: [
      function (p) { return { judul: "Waduh, gagal nih", isi: "Waduh, transaksi " + p + " gagal nih. Tenang, saldo kamu aman kok, coba lagi ya." }; },
      function (p) { return { judul: "Belum berhasil", isi: "Yah, " + p + " belum berhasil diproses. Saldo kamu nggak kepotong kok — boleh dicoba lagi ya." }; },
      function (p) { return { judul: "Gagal diproses", isi: "Maaf ya, " + p + " gagal diproses. Saldo kamu aman, tidak berkurang sama sekali. Coba lagi sebentar lagi ya." }; },
    ],
  };

  function transaksi(status, o) {
    o = o || {};
    var varian = TEKS[status];
    if (!varian) {
      console.warn("notif-hp: status notifikasi tidak dikenal:", status);
      return Promise.resolve(false);
    }
    var nama = String(o.nama || "transaksi kamu");
    var rp = rupiah(o.nominal);
    /* Nominal ditempel dalam kurung, bukan disambung polos: nama produk
       sering SUDAH memuat angka ("Telkomsel 2.000"), jadi tanpa kurung
       kalimatnya jadi "Telkomsel 2.000 Rp2.105" yang membingungkan. */
    var p = rp ? nama + " (" + rp + ")" : nama;
    var t = pilih(varian)(p);
    /* `tipe` menentukan ikon & warna entri di kotak masuk. Sengaja memakai
       kosakata NTYPES di notifikasi.js, bukan nama status di sini — kalau
       tidak dikenal, halaman itu diam-diam jatuh ke "info" dan notifikasi
       gagal jadi terlihat sama seperti kabar biasa. */
    var TIPE = { proses: "info", berhasil: "success", gagal: "gagal" };
    return kirim({ judul: t.judul, isi: t.isi, tipe: TIPE[status] || "info" });
  }

  window.DikaNotifHp = {
    siap: siap,
    kirim: kirim,
    transaksi: transaksi,
  };
})();
