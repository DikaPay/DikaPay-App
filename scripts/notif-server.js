/* ===========================================================================
   DikaPay — notif-server.js
   SATU-SATUNYA penentu "notifikasi server mana yang boleh dilihat member ini
   di perangkat ini".

     window.DikaNotifServer = {
       BASELINE_PREFIX
       digits(phone)                 // normalisasi nomor -> digit saja
       baseline(phone)               // -> number | null   (null = belum pernah)
       pasangBaseline(phone, items)  // set SEKALI kalau belum ada -> number|null
       saring(phone, items)          // -> item server yang layak tampil
       jumlahBelumDibaca(phone, items) // -> number (angka di badge lonceng)
       adaBelumDibaca(phone, items)  // -> bool
     }

   ======================= KENAPA MODUL TERPISAH =============================
   Ada DUA tempat yang perlu jawaban ini: halaman Notifikasi (daftar) dan
   Beranda (badge merah di ikon lonceng). Dulu keduanya menyaringnya
   sendiri-sendiri dengan aturan yang disalin. Begitu aturannya bertambah
   satu saja — seperti baseline di bawah — salinan yang tertinggal akan
   membuat badge menyala untuk notifikasi yang daftarnya sendiri tidak
   pernah menampilkannya. Jadi aturannya hidup di sini saja.

   ========================= BASELINE PER PERANGKAT ==========================
   Notifikasi dari AdminPanel bersifat SIARAN (`dikapay_id: null`,
   `target: "semua"`): server sah-sah saja mengirim baris yang sama ke semua
   member, dan memang tidak boleh dihapus dari sana — riwayatnya masih
   dibutuhkan untuk audit.

   Masalahnya di sisi member: siapa pun yang membuka halaman Notifikasi ikut
   melihat SELURUH siaran lama, termasuk member yang baru saja mendaftar
   (belum ada saat siaran itu dikirim) dan akun yang baru pasang ulang app.

   Penyelesaiannya di sisi PERANGKAT, bukan server: saat data notifikasi
   pertama kali dimuat untuk sebuah nomor di perangkat ini, ID TERTINGGI
   yang saat itu dikembalikan server dicatat sebagai baseline. Setelah itu
   HANYA notifikasi ber-ID LEBIH BESAR dari baseline yang ditampilkan.

   Efeknya otomatis benar untuk dua kasus yang diminta:
     - Member baru daftar  -> baseline langsung = ID tertinggi saat itu,
       jadi seluruh siaran lama tidak pernah muncul; layarnya "Belum ada
       notifikasi", bukan tumpukan kabar yang bukan miliknya.
     - Uninstall lalu pasang ulang -> localStorage ikut terhapus, baseline
       hilang, dan di-set ulang ke ID tertinggi saat itu. Riwayat lama
       kembali tersembunyi, TAPI siaran BARU yang dikirim sesudah momen itu
       tetap muncul normal.

   KONSEKUENSI YANG DISENGAJA: riwayat notifikasi lama tidak bisa dilihat
   lagi oleh member setelah pasang ulang. Datanya TIDAK hilang — masih utuh
   di server dan tetap bisa diaudit dari AdminPanel.

   ID diasumsikan MENAIK (AUTO_INCREMENT). Kalau suatu saat server memakai
   id acak/UUID, perbandingan `>` di sini tidak lagi bermakna dan baseline
   harus diganti patokan waktu (`dibuat_pada`) — lihat idNum().

   ============================ NAMESPACE PER AKUN ===========================
     dikapay:notif:baseline:<nomor digit>
   Pola yang SAMA dengan dikapay:notif:read/hidden:<digit> dan
   dikapay:device_token:<digit> — satu perangkat dipakai banyak akun uji,
   dan baseline akun A tidak boleh pernah terbaca akun B.
   =========================================================================== */

(function () {
  "use strict";

  var BASELINE_PREFIX = "dikapay:notif:baseline:";

  function digits(phone) {
    return String(phone == null ? "" : phone).replace(/\D/g, "");
  }

  /* ID dibaca sebagai angka. Baris tanpa id yang masuk akal dianggap 0 —
     bukan dibuang: yang menentukan tampil/tidak tetap perbandingan di
     saring(), supaya tidak ada notifikasi hilang diam-diam karena
     bentuk id yang tak terduga. */
  function idNum(n) {
    var v = Number(n && n.id);
    return isFinite(v) ? v : 0;
  }

  function baseline(phone) {
    var d = digits(phone);
    if (!d) return null;
    try {
      var raw = localStorage.getItem(BASELINE_PREFIX + d);
      if (raw == null || raw === "") return null;
      var v = Number(raw);
      return isFinite(v) ? v : null;
    } catch (e) {
      /* Storage mati: JANGAN menebak baseline. Mengembalikan null berarti
         semuanya tampil — lebih baik member melihat kabar lama daripada
         kehilangan kabar penting karena storage bermasalah. */
      console.warn("notif-server: baseline tidak terbaca:", e);
      return null;
    }
  }

  /* Dipanggil SETIAP kali data server tiba; hanya menulis kalau belum ada.
     Idempoten — pemanggil tidak perlu tahu ini kunjungan pertama atau bukan. */
  function pasangBaseline(phone, items) {
    var d = digits(phone);
    if (!d) return null;
    var sudah = baseline(phone);
    if (sudah !== null) return sudah;

    var maks = 0;
    (Array.isArray(items) ? items : []).forEach(function (n) {
      var v = idNum(n);
      if (v > maks) maks = v;
    });
    try {
      localStorage.setItem(BASELINE_PREFIX + d, String(maks));
    } catch (e) {
      console.warn("notif-server: baseline tidak tersimpan:", e);
      return null;
    }
    return maks;
  }

  function idLokal(jenis, d) {
    if (!d) return null;
    try {
      var raw = localStorage.getItem("dikapay:notif:" + jenis + ":" + d);
      var ids = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(ids) ? ids.map(String) : []);
    } catch (e) {
      return null;
    }
  }

  /* Urutan saringnya sengaja: baseline dulu (paling menentukan), lalu
     status admin, lalu dismiss lokal. */
  function saring(phone, items) {
    var d = digits(phone);
    var batas = baseline(phone);
    var hidden = idLokal("hidden", d);
    return (Array.isArray(items) ? items : []).filter(function (n) {
      if (!n) return false;
      if (batas !== null && idNum(n) <= batas) return false;   /* siaran lama */
      if (Number(n.aktif) === 0) return false;                  /* dimatikan admin */
      if (hidden && hidden.has(String(n.id))) return false;     /* dihapus member */
      return true;
    });
  }

  /* Satu penghitung, dua pemakai: badge Beranda menampilkan ANGKANYA dan
     juga memutuskan tampil/tidak dari angka yang sama. Kalau "ada" dan
     "berapa" dihitung terpisah, badge bisa menyala sambil menulis "0". */
  function jumlahBelumDibaca(phone, items) {
    var read = idLokal("read", digits(phone));
    return saring(phone, items).filter(function (n) {
      return Number(n.is_read) === 0 && !(read && read.has(String(n.id)));
    }).length;
  }

  function adaBelumDibaca(phone, items) {
    return jumlahBelumDibaca(phone, items) > 0;
  }

  window.DikaNotifServer = {
    BASELINE_PREFIX: BASELINE_PREFIX,
    digits: digits,
    baseline: baseline,
    pasangBaseline: pasangBaseline,
    saring: saring,
    jumlahBelumDibaca: jumlahBelumDibaca,
    adaBelumDibaca: adaBelumDibaca,
  };
})();
