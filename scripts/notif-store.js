/* ===========================================================================
   DikaPay — notif-store.js
   Kotak masuk notifikasi BERSAMA, per nomor HP (kunci: dikapay:notif:<nomor
   digit>). SATU-SATUNYA tempat yang menulis/membaca kunci ini — jangan
   akses `dikapay:notif:*` langsung dari halaman lain, pakai window.DikaNotif.

   Kenapa per nomor HP (bukan satu kotak masuk tunggal seperti dulu):
   fase 1 masih localStorage per PERANGKAT, tapi transfer melibatkan DUA
   pihak (pengirim & penerima) yang di dunia nyata adalah dua perangkat
   berbeda. Menulis ke kunci milik nomor tujuan (bukan nomor pengirim)
   adalah GROUNDWORK — di perangkat INI kotak itu baru "terlihat" kalau nanti
   dikapay:profile di perangkat ini kebetulan cocok dengan nomor itu (mis.
   saat menguji dengan menukar profil secara manual). Begitu backend nyata
   ada, ini otomatis jadi kotak masuk penerima yang sesungguhnya.

   Bentuk tiap item SAMA PERSIS dengan NOTIFS di notifikasi.js — {type,
   title, desc, time, unread} — supaya notifikasi.js bisa me-render-nya
   tanpa cabang kode terpisah ("format konsisten, bukan gaya baru"). Field
   `ts` (epoch ms) ditambahkan sebagai bonus tapi diabaikan aman oleh
   render() yang sudah ada (cuma baca field yang dikenalinya).

   TODO fase 2: begitu ada backend real-time (WebSocket/push notification),
   modul ini berhenti dipakai untuk notifikasi TRANSAKSI — server yang
   mendorong notifikasi ke kedua perangkat secara langsung, bukan ditulis ke
   localStorage perangkat pengirim. Lihat catatan TODO di titik pemanggilan
   (transfer-member.js) untuk detailnya.
   =========================================================================== */

"use strict";

(function () {
  var KEY_PREFIX = "dikapay:notif:";
  var CAP = 30; // batas wajar per kotak masuk, bukan aturan bisnis

  function normPhone(v) {
    var d = String(v || "").replace(/[^\d+]/g, "");
    if (d.indexOf("+62") === 0) d = "0" + d.slice(3);
    else if (d.indexOf("62") === 0 && d.length > 10) d = "0" + d.slice(2);
    return d.replace(/\D/g, "");
  }

  function getProfilePhone() {
    try {
      var raw = localStorage.getItem("dikapay:profile");
      if (!raw) return "";
      var p = JSON.parse(raw);
      return (p && p.phone) || "";
    } catch (e) { return ""; }
  }

  /* Baca kotak masuk MENTAH milik satu nomor (digit saja). Selalu array,
     tidak pernah null/undefined — gagal parse = anggap kosong. */
  function getFor(digits) {
    try {
      if (!digits) return [];
      var raw = localStorage.getItem(KEY_PREFIX + digits);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      console.error("notif-store: gagal membaca kotak masuk:", e);
      return [];
    }
  }

  function setFor(digits, arr) {
    try { localStorage.setItem(KEY_PREFIX + digits, JSON.stringify(arr)); }
    catch (e) { console.error("notif-store: gagal menyimpan kotak masuk:", e); }
  }

  /* `id` WAJIB ada dan unik: notifikasi SISTEM HP membawa id ini di
     `extra`-nya, dan saat member menekan notifikasi itu, halaman Notifikasi
     memakainya untuk menemukan & menyorot entri yang SAMA. Tanpa id, satu-
     satunya cara mencocokkan adalah menebak dari judul/teks — yang langsung
     salah begitu member melakukan dua transaksi serupa.

     Berawalan "lokal-" supaya tidak pernah bentrok dengan id notifikasi
     server (angka dari `api-notifikasi.php`) — keduanya hidup berdampingan
     di daftar yang sama. */
  function buatId() {
    return "lokal-" + Date.now().toString(36) + "-" +
      Math.random().toString(36).slice(2, 8);
  }

  /* Tambah satu notifikasi ke kotak masuk nomor `digits`. `item` cukup
     {type, title, desc} — id/time/unread/ts diisi otomatis di sini supaya
     titik pemanggilan tidak perlu mengulang boilerplate yang sama.
     MENGEMBALIKAN entri yang tersimpan (atau null kalau gagal), supaya
     pemanggil bisa memakai `entry.id` — itulah yang ditempelkan notif-hp.js
     ke notifikasi sistem. */
  function push(digits, item) {
    try {
      digits = normPhone(digits);
      if (!digits || !item) return null;

      var entry = {
        id: item.id ? String(item.id) : buatId(),
        type: item.type || "success",
        title: String(item.title || ""),
        desc: String(item.desc || ""),
        time: "Baru saja",
        unread: true,
        ts: Date.now(),
      };

      var arr = getFor(digits);
      arr.unshift(entry);
      if (arr.length > CAP) arr.length = CAP;
      setFor(digits, arr);
      return entry;
    } catch (e) {
      console.error("notif-store: gagal menambah notifikasi:", e);
      return null;
    }
  }

  /* Cari satu entri berdasarkan id, di kotak masuk akun yang sedang aktif.
     Dipakai halaman Notifikasi saat dibuka dari ketukan notifikasi sistem. */
  function getByIdMine(id) {
    try {
      if (id == null) return null;
      var cari = String(id);
      var ada = getMine().filter(function (n) { return String(n.id) === cari; });
      return ada.length ? ada[0] : null;
    } catch (e) { return null; }
  }

  /* Kotak masuk milik pengguna yang SEDANG login di perangkat ini
     (dikapay:profile.phone). Array kosong kalau belum ada profil/notifikasi. */
  function getMine() {
    try {
      var digits = normPhone(getProfilePhone());
      if (!digits) return [];
      return getFor(digits);
    } catch (e) { return []; }
  }

  /* Ada notifikasi belum dibaca milik pengguna saat ini? Dipakai script.js
     untuk badge lonceng beranda — dihitung dari DATA (bukan flag terpisah),
     jadi selalu akurat walau dikapay:notifRead sempat basi (mis. setelah
     tukar profil manual saat menguji skenario multi-device). */
  function hasUnreadMine() {
    try { return getMine().some(function (n) { return !!n.unread; }); }
    catch (e) { return false; }
  }

  /* Tandai SEMUA notifikasi milik pengguna saat ini sebagai sudah dibaca —
     dipanggil notifikasi.js setelah merender daftar (pola yang sama seperti
     dikapay:notifRead: dilihat dulu apa adanya, baru ditandai selesai). */
  function markMineRead() {
    try {
      var digits = normPhone(getProfilePhone());
      if (!digits) return;
      var arr = getFor(digits);
      if (!arr.length) return;
      var changed = false;
      arr.forEach(function (n) { if (n.unread) { n.unread = false; changed = true; } });
      if (changed) setFor(digits, arr);
    } catch (e) {
      console.error("notif-store: gagal menandai notifikasi terbaca:", e);
    }
  }

  window.DikaNotif = {
    push: push,
    getFor: getFor,
    getMine: getMine,
    getByIdMine: getByIdMine,
    hasUnreadMine: hasUnreadMine,
    markMineRead: markMineRead,
  };
})();
