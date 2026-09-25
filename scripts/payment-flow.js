/* ===========================================================================
   DikaPay — payment-flow.js
   ALUR PEMBAYARAN BERSAMA untuk SEMUA halaman produk (24 halaman).

     window.DikaPayment = {
       bayar(opts)             // titik masuk tunggal: cek saldo -> proses -> hasil
       readBalance()           // saldo perangkat ini
       writeBalance(v)
       OUTCOME                 // peluang hasil, bisa diubah untuk pengujian
       bentukHasil(status, rc, extra)   // pembentuk objek hasil `res`
       mintaHasil()            // SATU-SATUNYA penentu hasil
       setPenentuHasil(fn)     // ganti penentu hasil (seam integrasi)
       checkStatusUpdate(ref, cb)       // kerangka tindak lanjut status pending
     }

   BENTUK HASIL (`res`) — sama untuk simulasi sekarang maupun API asli:
     { status: "berhasil"|"gagal"|"pending", rc, sn, pesan, raw }
   `rc` = kode alasan penyedia; dipetakan ke pesan lewat digiflazz-rc.js.
   Semua bagian alur sudah bekerja di atas bentuk ini, jadi saat integrasi
   yang berubah cukup PENENTU HASIL-nya lewat `setPenentuHasil(fn)` —
   bukan alurnya. fn boleh sinkron atau mengembalikan Promise.

   SATU implementasi — jangan salin per halaman. `produk-ui.js` (createModal)
   memanggilnya saat tombol "Bayar" ditekan, jadi 24 halaman produk ikut
   mendapatkannya tanpa satu baris pun ditambahkan di file datanya.

   Alurnya:
     1. CEK SALDO dulu. Kurang -> popup ajakan top up, proses TIDAK pernah
        dimulai (saldo tidak berkurang, riwayat tidak tercatat).
     2. PEMROSESAN — animasi 1,5-3 detik (acak, biar tidak terasa palsu).
     3. HASIL — berhasil / gagal / pending.

   Yang terjadi HANYA saat BERHASIL: saldo dipotong, riwayat dicatat,
   notifikasi masuk, suara sukses dibunyikan. Gagal & pending tidak
   menyentuh saldo sama sekali.

   TODO fase 3 (backend): OUTCOME acak diganti hasil sungguhan dari
   `POST /api/transactions` lewat api.js; status `pending` diisi dari
   callback penyedia, bukan ditebak di front-end. Saldo & riwayat berhenti
   dibaca/ditulis ke localStorage. Titik masuk `bayar()` dipertahankan
   supaya halaman produk tidak perlu diubah lagi saat itu terjadi.
   =========================================================================== */

(function () {
  "use strict";

  var RM = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var BALANCE_KEY = "dikapay:balance";
  /* Default HARUS SAMA dengan readBalance() di script.js dan
     DEFAULT_BALANCE di transfer-member.js. Kalau salah satu diubah,
     ubah ketiganya. */
  var DEFAULT_BALANCE = 125000;

  /* Peluang hasil — sengaja bisa diubah dari console saat menguji:
       DikaPayment.OUTCOME.gagal = 1   -> selalu gagal
       DikaPayment.OUTCOME.pending = 1 -> selalu pending
     Sisa dari 1 dianggap berhasil. */
  var OUTCOME = { gagal: 0.12, pending: 0.06 };

  var HOME = "../index.html";

  /* ---- Saldo --------------------------------------------------------- */

  function readBalance() {
    try {
      var raw = localStorage.getItem(BALANCE_KEY);
      /* Kunci belum ada (akun baru) -> default. Beda dengan raw === "0",
         yang artinya saldo memang benar-benar nol. Number(null) === 0,
         jadi cek null-nya HARUS eksplisit. */
      if (raw === null) return DEFAULT_BALANCE;
      var n = Number(raw);
      return isFinite(n) && n >= 0 ? n : DEFAULT_BALANCE;
    } catch (e) {
      console.error("payment-flow: gagal membaca saldo:", e);
      return DEFAULT_BALANCE;
    }
  }

  function writeBalance(v) {
    try {
      localStorage.setItem(BALANCE_KEY, String(Math.max(0, Math.round(v))));
      /* Tera "kapan ditulis" — pola & alasan yang SAMA dengan writeBalance()
         di transfer-member.js: dibaca member-sync.js sebagai pertahanan
         anti-timpa supaya hasil pembayaran (potongan saldo) tidak tertimpa
         balik oleh polling status latar yang kebetulan hampir bersamaan.
         Lihat catatan besar "TOKEN & SALDO HARUS PER-AKUN" di member-sync.js. */
      localStorage.setItem("dikapay:balance:ts", String(Date.now()));
    } catch (e) { console.error("payment-flow: gagal menyimpan saldo:", e); }
  }

  function fmtRupiah(v) {
    var n = Number(v);
    if (!isFinite(n)) return "Rp0";
    return "Rp" + Math.round(n).toLocaleString("id-ID");
  }

  /* ---- Riwayat & notifikasi (pola yang sama seperti transfer-member.js) */

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  function makeTxId(d) {
    return "TRX-" + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) +
      "-" + String(Math.floor(1000 + Math.random() * 9000));
  }
  function nowDt(d) {
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
      "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }
  function makeRef() {
    var s = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789", out = "";
    for (var i = 0; i < 10; i++) out += s[Math.floor(Math.random() * s.length)];
    return out;
  }


  function profilePhone() {
    try {
      var p = JSON.parse(localStorage.getItem("dikapay:profile") || "null");
      return p && p.phone ? String(p.phone).replace(/\D/g, "") : "";
    } catch (e) { return ""; }
  }

  /* ---- DOM overlay (dibangun sekali, dipakai ulang) ------------------- */

  var el = null;
  var state = null;

  function build() {
    if (el) return el;
    var ov = document.createElement("div");
    ov.className = "payflow";
    ov.innerHTML =
      '<div class="payflow__card" role="dialog" aria-modal="true" aria-live="polite">' +
      /* --- proses --- */
      '<div class="payflow__stage payflow__stage--proses">' +
      '<div class="payflow__orb" aria-hidden="true">' +
      '<span class="payflow__ring"></span><span class="payflow__ring payflow__ring--2"></span>' +
      '<span class="payflow__core"></span>' +
      "</div>" +
      '<h3 class="payflow__title">Memproses pembayaran</h3>' +
      '<p class="payflow__text payflow__step">Menyiapkan transaksi…</p>' +
      '<div class="payflow__bar" aria-hidden="true"><span></span></div>' +
      "</div>" +
      /* --- hasil --- */
      '<div class="payflow__stage payflow__stage--hasil" hidden>' +
      '<div class="payflow__mark" aria-hidden="true"></div>' +
      '<h3 class="payflow__title payflow__hasil-judul"></h3>' +
      '<p class="payflow__text payflow__hasil-teks"></p>' +
      '<dl class="payflow__ringkas"></dl>' +
      '<div class="payflow__actions"></div>' +
      "</div>" +
      "</div>";
    document.body.appendChild(ov);
    el = ov;
    return ov;
  }

  function q(sel) { return el.querySelector(sel); }

  function tutup() {
    if (!el) return;
    el.classList.remove("is-open");
    document.documentElement.style.overflow = "";
    state = null;
  }

  function tombol(daftar) {
    var box = q(".payflow__actions");
    box.innerHTML = "";
    daftar.forEach(function (b) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "payflow__btn" + (b.utama ? " payflow__btn--gold" : " payflow__btn--outline");
      btn.textContent = b.label;
      btn.addEventListener("click", b.aksi);
      box.appendChild(btn);
    });
  }

  function ringkasan(rows) {
    var dl = q(".payflow__ringkas");
    if (!rows || !rows.length) { dl.innerHTML = ""; dl.hidden = true; return; }
    dl.hidden = false;
    dl.innerHTML = rows.map(function (r) {
      return '<div class="payflow__row' + (r.total ? " payflow__row--total" : "") + '">' +
        "<dt>" + r.label + "</dt><dd>" + r.value + "</dd></div>";
    }).join("");
  }

  /* ---- Popup saldo tidak cukup --------------------------------------- */

  var kurangEl = null;

  /* Pemberitahuan satu tombol untuk hal yang MENGHENTIKAN transaksi tapi
     bukan soal saldo (PIN salah 3x, sedang dalam jeda, modul PIN tidak
     ada). Memakai primitif `.cmodal` di style.css — dimuat semua halaman,
     jadi tidak ada halaman yang mendapat modal tanpa gaya. */
  var pesanEl = null;

  function popupSederhana(judul, teks) {
    if (!pesanEl) {
      var ov = document.createElement("div");
      ov.className = "cmodal-overlay";
      ov.innerHTML =
        '<div class="cmodal" role="dialog" aria-modal="true">' +
        '<h3 class="cmodal__title"></h3>' +
        '<p class="cmodal__text"></p>' +
        '<div class="cmodal__actions">' +
        '<button class="cmodal__btn cmodal__btn--gold" type="button">Mengerti</button>' +
        "</div></div>";
      document.body.appendChild(ov);
      pesanEl = ov;

      function tutupPesan() {
        ov.classList.remove("is-open");
        document.documentElement.style.overflow = "";
      }
      ov.querySelector("button").addEventListener("click", tutupPesan);
      ov.addEventListener("click", function (e) { if (e.target === ov) tutupPesan(); });
      window.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && ov.classList.contains("is-open")) tutupPesan();
      });
      if (window.DikaProdukUI && window.DikaProdukUI.registerOverlay) {
        window.DikaProdukUI.registerOverlay(function () {
          return ov.classList.contains("is-open");
        });
      }
    }
    pesanEl.querySelector(".cmodal__title").textContent = judul;
    pesanEl.querySelector(".cmodal__text").textContent = teks;
    pesanEl.classList.add("is-open");
    document.documentElement.style.overflow = "hidden";
  }

  function popupSaldoKurang(kurang, harga) {
    if (!kurangEl) {
      var ov = document.createElement("div");
      ov.className = "cmodal-overlay saldo-overlay";
      ov.innerHTML =
        '<div class="cmodal saldo" role="dialog" aria-modal="true" aria-labelledby="saldoTitle">' +
        '<span class="saldo__ic" aria-hidden="true">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M3 8.5A2.5 2.5 0 0 1 5.5 6H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5.5A2.5 2.5 0 0 1 3 16.5z"/>' +
        '<path d="M3 8.5V7a2 2 0 0 1 2-2h10"/><circle cx="17" cy="12.5" r="1.4"/></svg></span>' +
        '<h3 class="cmodal__title" id="saldoTitle">Saldo kamu belum cukup</h3>' +
        '<p class="cmodal__text saldo__teks"></p>' +
        '<div class="saldo__rinci"></div>' +
        '<div class="cmodal__actions">' +
        '<button class="cmodal__btn cmodal__btn--outline" type="button" data-act="batal">Batal</button>' +
        '<button class="cmodal__btn cmodal__btn--gold" type="button" data-act="topup">Top Up Sekarang</button>' +
        "</div></div>";
      document.body.appendChild(ov);
      kurangEl = ov;

      function tutupSaldo() {
        ov.classList.remove("is-open");
        document.documentElement.style.overflow = "";
      }
      ov.querySelector('[data-act="batal"]').addEventListener("click", tutupSaldo);
      ov.querySelector('[data-act="topup"]').addEventListener("click", function () {
        tutupSaldo();
        /* Belum ada halaman Top Up tersendiri — arahkan ke Beranda dan
           minta sheet "Segera Hadir" Top Up yang sudah ada di sana
           terbuka otomatis (script.js membaca penanda ini saat init). */
        try { sessionStorage.setItem("dikapay:open-topup", "1"); } catch (e) {}
        window.location.href = HOME;
      });
      ov.addEventListener("click", function (e) { if (e.target === ov) tutupSaldo(); });
      window.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && ov.classList.contains("is-open")) tutupSaldo();
      });
      if (window.DikaProdukUI && window.DikaProdukUI.registerOverlay) {
        window.DikaProdukUI.registerOverlay(function () {
          return ov.classList.contains("is-open");
        });
      }
    }

    /* Nada membantu, bukan menyalahkan: sebutkan kekurangannya dengan
       jelas supaya member tahu persis berapa yang perlu di-top up. */
    kurangEl.querySelector(".saldo__teks").textContent =
      "Transaksi ini butuh " + fmtRupiah(harga) + ", sedangkan saldo kamu " +
      "sekarang " + fmtRupiah(readBalance()) + ". Tinggal " + fmtRupiah(kurang) +
      " lagi, kok — top up dulu sebentar, lalu lanjutkan pembelianmu, ya.";
    kurangEl.querySelector(".saldo__rinci").innerHTML =
      '<div class="saldo__baris"><span>Total tagihan</span><b>' + fmtRupiah(harga) + "</b></div>" +
      '<div class="saldo__baris"><span>Saldo kamu</span><b>' + fmtRupiah(readBalance()) + "</b></div>" +
      '<div class="saldo__baris saldo__baris--kurang"><span>Kekurangan</span><b>' +
      fmtRupiah(kurang) + "</b></div>";

    kurangEl.classList.add("is-open");
    document.documentElement.style.overflow = "hidden";
  }

  /* ---- Hasil --------------------------------------------------------- */

  var TEKS = {
    berhasil: {
      judul: "Pembayaran berhasil!",
      teks: "Transaksimu sudah kami proses. Detailnya bisa kamu lihat kapan saja di Riwayat Transaksi.",
    },
    gagal: {
      judul: "Transaksi belum berhasil",
      /* Menenangkan & menjelaskan: yang paling ditakuti member adalah
         saldo terpotong tapi produk tidak masuk. Jawab itu lebih dulu. */
      teks: "Penyedia layanan sedang sibuk, jadi pesananmu belum bisa diselesaikan. " +
        "Tenang, saldomu tidak terpotong — kalau pun sempat terpotong, dana akan " +
        "kembali otomatis paling lama 1x24 jam. Kamu bisa mencobanya lagi sekarang.",
    },
    pending: {
      judul: "Masih diproses",
      teks: "Pesananmu sedang diproses penyedia dan kali ini butuh waktu sedikit lebih lama " +
        "dari biasanya. Tidak perlu mengulang pembayaran, ya — statusnya akan otomatis " +
        "diperbarui di Riwayat Transaksi begitu selesai.",
    },
  };

  /* `res` = HASIL TRANSAKSI, satu bentuk untuk simulasi maupun API asli:

       {
         status : "berhasil" | "gagal" | "pending",
         rc     : string|null,   // kode alasan dari penyedia
         sn     : string|null,   // serial number / token (khusus berhasil)
         pesan  : string|null,   // pesan siap tampil; null -> pakai bawaan
         raw    : object|null    // respons mentah, untuk log/diagnosa
       }

     TODO fase 3 (integrasi Digiflazz): `rc` akan diisi KODE RC ASLI dari
     respons Digiflazz, lalu dipetakan ke pesan yang sesuai lewat
     `digiflazz-rc.js` (lihat dokumentasi "Alasan Gagal" Digiflazz).
     Sekarang nilainya masih dummy/null karena repo ini belum pernah
     menyentuh API-nya. Yang penting SLOT-nya sudah ada dan sudah mengalir
     sampai ke layar hasil + riwayat, jadi saat integrasi tidak ada alur
     yang perlu dibongkar — cukup mengisi `rc` di satu titik (lihat
     `mintaHasil()`) dan melengkapi tabel di digiflazz-rc.js. */

  function bentukHasil(status, rc, extra) {
    var r = {
      status: status,
      rc: rc === undefined ? null : rc,
      sn: null,
      pesan: null,
      raw: null,
    };
    if (extra) Object.keys(extra).forEach(function (k) { r[k] = extra[k]; });
    return r;
  }

  /* Pesan yang ditampilkan: prioritas ke pesan yang datang bersama hasil,
     lalu pemetaan rc (digiflazz-rc.js), baru teks bawaan. Urutan ini yang
     membuat konten pesan bisa diganti tanpa menyentuh logika di sini. */
  function teksHasil(res) {
    var bawaan = TEKS[res.status] || TEKS.gagal;
    var judul = bawaan.judul;
    var teks = bawaan.teks;

    if (res.rc && window.DikaRC) {
      var e = window.DikaRC.entri(res.rc);
      if (e) {
        if (e.judul) judul = e.judul;
        if (e.pesan) teks = e.pesan;
      }
    }
    if (res.pesan) teks = res.pesan;      /* pesan eksplisit menang */
    return { judul: judul, teks: teks };
  }

  function tampilkanHasil(res, o) {
    var hasil = res.status;
    q(".payflow__stage--proses").hidden = true;
    var box = q(".payflow__stage--hasil");
    box.hidden = false;

    var t = teksHasil(res);
    var card = q(".payflow__card");
    card.className = "payflow__card is-" + hasil;
    q(".payflow__mark").className = "payflow__mark payflow__mark--" + hasil;
    q(".payflow__hasil-judul").textContent = t.judul;
    q(".payflow__hasil-teks").textContent = t.teks;
    ringkasan(o.rows);

    if (hasil === "berhasil") {
      tombol([
        { label: "Kembali ke Beranda", aksi: function () { window.location.href = HOME; } },
        { label: "Selesai", utama: true, aksi: tutup },
      ]);
    } else if (hasil === "gagal") {
      tombol([
        { label: "Kembali ke Beranda", aksi: function () { window.location.href = HOME; } },
        /* "Coba Lagi" = PERCOBAAN TRANSAKSI BARU, jadi lewat bayar() lagi:
           saldo dicek ulang DAN PIN diminta ulang. Dulu ini memanggil
           mulaiProses() langsung — pintu belakang yang membuat transaksi
           kedua dan seterusnya lolos tanpa PIN sama sekali. */
        { label: "Coba Lagi", utama: true, aksi: function () { tutup(); bayar(o); } },
      ]);
    } else {
      tombol([
        { label: "Lihat Riwayat", aksi: function () { window.location.href = "riwayat.html"; } },
        { label: "Mengerti", utama: true, aksi: tutup },
      ]);
    }
  }

  /* ---- SATU-SATUNYA titik yang menentukan hasil transaksi -------------
     Sekarang: undian lokal + rc dummy.
     Fase 3: ganti isi fungsi ini dengan `POST /api/transactions` lewat
     api.js, lalu bentuk `res` dari respons Digiflazz:

       bentukHasil(mapStatus(d.status), d.rc, { sn: d.sn, raw: d })

     Semua pemanggil (`mulaiProses`, `sukses`, `tampilkanHasil`,
     `checkStatusUpdate`) sudah bekerja di atas bentuk `res`, jadi TIDAK
     ADA yang perlu diubah di luar fungsi ini selain menjadikannya async. */

  /* rc dummy per status — sengaja memakai kode yang SUDAH ada di
     digiflazz-rc.js supaya jalur pemetaan rc -> pesan benar-benar terpakai
     (dan ikut teruji) sejak sekarang, bukan baru hidup saat integrasi. */
  var RC_DUMMY = {
    berhasil: "00",
    pending: "03",
    gagal: ["01", "40", "42"],
  };

  function mintaHasilDummy() {
    var r = Math.random();
    var status = r < OUTCOME.gagal ? "gagal"
      : r < OUTCOME.gagal + OUTCOME.pending ? "pending"
        : "berhasil";
    var rc = status === "gagal"
      ? RC_DUMMY.gagal[Math.floor(Math.random() * RC_DUMMY.gagal.length)]
      : RC_DUMMY[status];
    return bentukHasil(status, rc);
  }

  /* SEAM INTEGRASI — alur memanggil lewat variabel ini, BUKAN langsung ke
     fungsinya. Kalau alur memanggil `mintaHasilDummy()` secara langsung,
     mengganti `DikaPayment.mintaHasil` dari luar tidak akan berefek apa
     pun (closure tetap memegang fungsi lama) — dan seluruh janji "cukup
     ganti satu fungsi saat integrasi" jadi tidak benar.

     Fase 3: `DikaPayment.setPenentuHasil(fn)` dengan fn yang memanggil
     `POST /api/transactions` lewat api.js. Boleh mengembalikan `res`
     langsung atau Promise — keduanya ditangani (lihat mulaiProses). */
  /* ===================== HASIL DARI SERVER (fase 3) =====================
     Hasil transaksi TIDAK lagi diundi di perangkat. Alurnya:

       1. bayar() membuka sheet PIN dengan `verifikasi: verifikasiProduk`.
       2. verifikasiProduk() memanggil api-transaksi-produk.php SEKALI —
          satu panggilan yang sekaligus memverifikasi PIN, memeriksa saldo,
          dan memutasi saldo di server (pola atomik yang SAMA dengan
          transfer-member.js). PIN dipakai saat itu juga lalu dilepas —
          tidak disimpan di variabel mana pun.
       3. Hasilnya disimpan di `hasilServer`, dan penentu hasil di bawah
          tinggal mengembalikannya.

     Kenapa panggilannya TIDAK di dalam penentu hasil: `pin` cuma ada di
     dalam sheet PIN. Menyimpannya untuk dipakai belakangan berarti PIN
     mentah menganggur di memori sepanjang animasi proses — risiko yang
     tidak sepadan, dan transfer sudah membuktikan pola atomik ini bekerja.

     Seam `setPenentuHasil()` tetap dipakai & tetap terbuka: pengujian bisa
     menggantinya, dan `mintaHasilDummy` masih ada sebagai jalur cadangan
     kalau api.js/token tidak tersedia. */
  var hasilServer = null;

  function penentuHasilServer() {
    if (!hasilServer) {
      /* Tidak seharusnya terjadi — verifikasiProduk selalu mengisinya
         sebelum mulaiProses() dipanggil. Kalau toh terjadi, JANGAN
         mengarang "berhasil". */
      console.error("payment-flow: hasil server kosong — dianggap gagal.");
      return Promise.resolve(bentukHasil("gagal", null, {
        pesan: "Hasil transaksi tidak terbaca. Cek Riwayat Transaksi, ya.",
      }));
    }
    var h = hasilServer;
    hasilServer = null;                 /* sekali pakai */
    return Promise.resolve(h);
  }

  var penentuHasil = penentuHasilServer;

  function setPenentuHasil(fn) {
    penentuHasil = typeof fn === "function" ? fn : mintaHasilDummy;
  }

  function mintaHasil() {
    return penentuHasil();
  }

  function sukses(o, res) {
    /* Saldo dipotong HANYA di sini — gagal & pending tidak menyentuhnya. */
    /* ================= SALDO DATANG DARI SERVER ========================
       Dulu di sini ada `writeBalance(readBalance() - o.amount)` — potongan
       dihitung sendiri di perangkat karena pembelian masih simulasi.
       Sekarang `api-transaksi-produk.php` yang memotong saldo, dan
       `saldo_baru` dari responsnya adalah satu-satunya kebenaran.

       Menghitungnya lagi di sini akan memotong DUA KALI begitu polling
       berikutnya membawa saldo server yang sudah terpotong. Karena itu
       saldo HANYA ditulis dari `res.saldoBaru`. */
    if (res && isFinite(Number(res.saldoBaru))) {
      writeBalance(Number(res.saldoBaru));
    } else {
      /* Server berhasil tapi tidak menyertakan saldo_baru — jangan menebak
         angkanya. Biarkan polling member-sync.js yang menyegarkan; lebih
         baik saldo telat beberapa detik daripada salah. */
      console.warn("payment-flow: respons berhasil tanpa saldo_baru — saldo menunggu polling.");
    }

    var now = new Date();
    var tx = {
      id: makeTxId(now),
      cat: o.cat || "topup",
      name: o.nama,
      dt: nowDt(now),
      amount: -o.amount,
      status: "ok",
      method: "Saldo DikaPay",
      ref: makeRef(),
    };
    var detail = {
      acc: o.tujuan || "-",
      sku: (o.item && o.item.sku) || "",
      admin: o.admin || 0,
      /* Jejak dari penyedia — ikut disimpan sejak sekarang supaya struktur
         riwayat tidak perlu diubah saat data aslinya masuk.
         TODO fase 3: `rc` diisi kode asli Digiflazz, `sn` diisi serial
         number / token yang mereka kembalikan (untuk token listrik, `sn`
         inilah nomor token 20 digit yang selama ini dummy di listrik.js). */
      rc: (res && res.rc) || null,
      sn: (res && res.sn) || null,
    };
    /* Riwayat lokal (tx-lokal.js) DIHAPUS: transaksi produk sekarang
       benar-benar tercatat di server dan ikut terbawa api-riwayat.php.
       Mencatatnya lagi di perangkat akan membuatnya muncul dua kali. */

    try {
      if (window.DikaNotif) {
        window.DikaNotif.push(profilePhone(), {
          type: "success",
          title: "Transaksi berhasil",
          desc: o.nama + " sudah diproses. Cek detailnya di Riwayat Transaksi, ya.",
        });
      }
    } catch (e) { console.error("payment-flow: gagal menulis notifikasi:", e); }

    try { if (window.playSuccessSound) window.playSuccessSound(); }
    catch (e) { console.error("payment-flow: gagal membunyikan suara:", e); }
  }

  /* ---- Pemrosesan ----------------------------------------------------- */

  var LANGKAH = [
    "Menyiapkan transaksi…",
    "Menghubungi penyedia layanan…",
    "Menunggu konfirmasi…",
  ];

  function mulaiProses(o) {
    build();
    state = o;
    q(".payflow__card").className = "payflow__card";
    q(".payflow__stage--hasil").hidden = true;
    q(".payflow__stage--proses").hidden = false;
    q(".payflow__step").textContent = LANGKAH[0];
    el.classList.add("is-open");
    document.documentElement.style.overflow = "hidden";

    /* Notifikasi SISTEM HP (bukan kotak masuk in-app) — best-effort, tidak
       pernah menahan atau menggagalkan alur. Lihat notif-hp.js. */
    if (window.DikaNotifHp) {
      window.DikaNotifHp.transaksi("proses", { nama: o.nama, nominal: o.amount });
    }

    /* Durasi acak 1,5-3 dtk supaya tidak terasa seperti animasi palsu
       yang selalu sama panjangnya. */
    var total = RM ? 400 : 1500 + Math.random() * 1500;
    var i = 0;
    var timer = window.setInterval(function () {
      i++;
      if (i < LANGKAH.length) q(".payflow__step").textContent = LANGKAH[i];
    }, total / LANGKAH.length);

    window.setTimeout(function () {
      window.clearInterval(timer);
      if (!state) return;                 /* ditutup di tengah proses */

      /* Penentu hasil boleh sinkron (dummy sekarang) ATAU mengembalikan
         Promise (nanti, saat isinya panggilan jaringan). Ditangani dua-duanya
         di sini supaya fase integrasi tidak perlu menyentuh alur ini. */
      var keluaran;
      try { keluaran = mintaHasil(); }
      catch (e) {
        console.error("payment-flow: penentu hasil melempar error:", e);
        keluaran = bentukHasil("gagal", null);
      }

      if (keluaran && typeof keluaran.then === "function") {
        keluaran.then(selesaikan, function (e) {
          console.error("payment-flow: permintaan hasil ditolak:", e);
          selesaikan(bentukHasil("gagal", null));
        });
      } else {
        selesaikan(keluaran);
      }

      function selesaikan(res) {
        if (!state) return;               /* ditutup sementara menunggu */
        if (!res || !res.status) res = bentukHasil("gagal", null);
        o.res = res;                      /* disimpan untuk checkStatusUpdate */
        if (res.status === "berhasil") {
          try { sukses(o, res); }
          catch (e) { console.error("payment-flow: gagal menuntaskan transaksi:", e); }
        }
        if (res.status === "pending") pantauPending(o, res);
        /* Satu titik untuk ketiga status supaya tidak ada cabang yang
           terlewat saat alurnya berubah nanti. "pending" memakai teks
           "diproses" — dari sisi member memang statusnya masih berjalan. */
        if (window.DikaNotifHp) {
          window.DikaNotifHp.transaksi(
            res.status === "berhasil" ? "berhasil" : (res.status === "gagal" ? "gagal" : "proses"),
            { nama: o.nama, nominal: o.amount });
        }
        tampilkanHasil(res, o);
      }
    }, total);
  }

  /* ---- PENDING: menunggu kepastian status ----------------------------
     Transaksi pending BELUM selesai — statusnya masih bisa berubah jadi
     berhasil atau gagal beberapa saat kemudian. Struktur di bawah adalah
     KERANGKA untuk itu; isinya masih dummy.

     TODO fase 3 (integrasi Digiflazz): JANGAN memakai polling seperti
     kerangka ini di produksi. Digiflazz mengirim CALLBACK (webhook) ke
     backend saat status transaksi berubah, jadi yang benar:

       1. Backend menerima webhook Digiflazz -> memperbarui status transaksi
          di database.
       2. App diberi tahu lewat push/realtime (pola yang sama sudah
          direncanakan untuk notifikasi transfer di notif-store.js), ATAU
          app memuat ulang riwayat saat dibuka.
       3. `checkStatusUpdate()` di sini diganti pemasangan listener itu —
          bukan setInterval yang menembak API terus-menerus, karena itu
          memboroskan kuota permintaan dan tetap kalah cepat dari webhook.

     Yang dipertahankan dari kerangka ini hanya BENTUK datanya: fungsi
     menerima referensi transaksi dan mengembalikan `res` yang sama
     bentuknya, jadi pemanggilnya tidak perlu diubah. */

  var PENDING_TIMEOUT = 15000;   /* berhenti memantau setelah ini (dummy) */

  function checkStatusUpdate(ref, cb) {
    /* DUMMY: selalu melapor "masih pending". Tidak ada jaringan yang
       disentuh, dan sengaja TIDAK menebak-nebak hasil akhir — menebak di
       front-end justru berbahaya karena bisa berbeda dari kenyataan di
       sisi penyedia. */
    var res = bentukHasil("pending", "03", { raw: { dummy: true, ref: ref || null } });
    if (typeof cb === "function") {
      window.setTimeout(function () { cb(res); }, 0);
    }
    return res;
  }

  function pantauPending(o, res) {
    /* Kerangka: satu kali pemeriksaan tertunda, BUKAN polling berulang.
       Sengaja tidak agresif supaya tidak ada kebiasaan buruk yang terbawa
       ke fase produksi. */
    window.setTimeout(function () {
      try {
        checkStatusUpdate(o.ref || null, function (baru) {
          if (!baru || baru.status === "pending") return;   /* belum berubah */
          /* Saat callback ASLI sudah ada, di sinilah transaksi yang
             akhirnya berhasil dipotong saldonya & dicatat ke riwayat. */
          if (baru.status === "berhasil") {
            try { sukses(o, baru); }
            catch (e) { console.error("payment-flow: gagal menuntaskan transaksi pending:", e); }
          }
          if (state === o) tampilkanHasil(baru, o);
        });
      } catch (e) {
        console.error("payment-flow: gagal memeriksa status pending:", e);
      }
    }, PENDING_TIMEOUT);
  }

  /* ---- Titik masuk ---------------------------------------------------- */

  /* opts: { amount, nama, tujuan?, rows?, cat?, admin?, item? } */
  /* Mengembalikan fungsi verifikasi untuk sheet PIN, atau null kalau
     jalur server belum bisa dipakai (api.js/token belum ada). null =
     kembali ke perilaku lama (PIN lokal + hasil simulasi). */
  /* ============ TIDAK ADA LAGI JALUR SIMULASI DI PEMBELIAN NYATA =========
     DULU: kalau api.js/token/kode_produk tidak tersedia, fungsi ini
     mengembalikan null dan penentu hasil jatuh ke `mintaHasilDummy` —
     hasil DIUNDI di perangkat. Akibatnya member bisa melihat layar
     "Transaksi berhasil 🎉" lengkap dengan notifikasi & bunyi, padahal
     TIDAK ADA permintaan apa pun yang pernah dikirim ke server dan tidak
     ada produk yang benar-benar dibeli.

     Berbohong tentang uang jauh lebih merugikan daripada menolak dengan
     jujur. Sekarang: kalau jalur server tidak siap, transaksi DITOLAK dan
     member diberi tahu apa adanya.

     `mintaHasilDummy`/`OUTCOME` SENGAJA tetap ada, tapi hanya bisa dipakai
     lewat `setPenentuHasil()` secara sadar (pengujian) — bukan lagi
     sesuatu yang bisa aktif sendiri di tangan member. */
  function tolakBelum(sebab, pesan) {
    console.error("payment-flow: transaksi DITOLAK —", sebab);
    popupSederhana("Transaksi belum bisa diproses", pesan);
    return false;
  }

  function siapkanVerifikasiProduk(o) {
    if (!window.DikaApi || typeof DikaApi.transaksiProduk !== "function") {
      o.__tolak = tolakBelum("DikaApi.transaksiProduk tidak ada (api.js belum dimuat/versi lama)",
        "Aplikasi belum siap memproses pembelian. Coba tutup lalu buka lagi aplikasinya, ya.");
      return null;
    }
    var token = window.DikaMemberSync && typeof DikaMemberSync.getToken === "function"
      ? DikaMemberSync.getToken() : "";
    if (!token) {
      o.__tolak = tolakBelum("device_token belum ada untuk akun aktif",
        "Sesi kamu belum siap. Coba keluar lalu masuk lagi, ya.");
      return null;
    }
    var kode = (o.item && (o.item.sku || o.item.kode_produk)) || "";
    if (!kode) {
      o.__tolak = tolakBelum("produk tanpa sku/kode_produk: " + (o.nama || "?"),
        "Produk ini belum punya kode yang bisa diproses. Coba pilih produk lain dulu, ya.");
      return null;
    }

    /* ref_id dibuat SEKALI di sini dan dipakai ulang untuk seluruh
       percobaan PIN transaksi ini. Kalau dibuat ulang tiap ketukan,
       perlindungan kiriman-ganda di server jadi tidak berarti. */
    var refId = makeTxId(new Date());
    o.refId = refId;
    penentuHasil = penentuHasilServer;

    return function (pinMasuk) {
      return DikaApi.transaksiProduk(token, {
        ref_id: refId,
        kode_produk: kode,
        tujuan: o.tujuan || "",
        pin: pinMasuk,
      }).then(function (res) {
        /* `status` dari server dipetakan ke bentuk hasil yang SUDAH dipakai
           layar hasil & riwayat — tidak ada bentuk baru yang perlu
           dipelajari alur di bawahnya. */
        hasilServer = bentukHasil(res.status, null, {
          raw: res.raw,
          saldoBaru: res.saldoBaru,
          transaksiId: res.transaksiId,
        });
        o.transaksiId = res.transaksiId;
        /* PIN-nya BENAR (server menerima permintaan), apa pun status
           transaksinya — jadi sheet PIN ditutup dan alur lanjut ke layar
           proses/hasil. Status "gagal" ditampilkan di layar hasil, bukan
           sebagai "PIN salah". */
        return { ok: true, saldoBaru: res.saldoBaru };
      }).catch(function (err) {
        if (err && err.banned) {
          return { ok: false, banned: true, bannedSampai: err.bannedSampai, pesan: err.pesanMember };
        }
        var pesan = (err && err.pesanMember) || "Transaksi gagal diproses. Coba lagi.";
        /* Sama seperti transfer: PIN keliru -> biarkan member mengulang di
           sheet yang sama; alasan lain (saldo kurang, produk gangguan) ->
           mengulang PIN tidak menolong, sheet ditutup. */
        var pinSalah = /^pin salah/i.test(pesan);
        console.error("payment-flow: transaksi produk ditolak:", (err && err.sebab) || pesan);
        return { ok: false, pesan: pesan, pinSalah: pinSalah };
      });
    };
  }

  function bayar(opts) {
    try {
      var o = opts || {};
      o.amount = Math.max(0, Math.round(Number(o.amount) || 0));
      o.nama = o.nama || "Transaksi";

      var saldo = readBalance();
      if (o.amount > saldo) {
        popupSaldoKurang(o.amount - saldo, o.amount);
        return false;                     /* proses TIDAK dimulai */
      }

      /* ===== KONFIRMASI PIN — WAJIB, sebelum apa pun diproses ===========
         Ditaruh di SINI, bukan di tiap halaman: 22 halaman produk memanggil
         bayar() lewat createModal, jadi satu gerbang di titik ini menutup
         semuanya sekaligus. Ditaruh SESUDAH cek saldo supaya member tidak
         disuruh mengetik PIN untuk transaksi yang toh akan ditolak.

         FAIL-CLOSED: kalau pin-transaksi.js tidak ter-link, transaksi
         DITOLAK — bukan dilewati. Melewatkannya diam-diam persis bug
         `sound.js` dulu, bedanya yang bocor kali ini uang member. */
      if (!window.DikaPinTransaksi) {
        console.error("payment-flow: pin-transaksi.js belum di-link — transaksi ditolak.");
        popupSederhana("Transaksi belum bisa diproses",
          "Konfirmasi PIN belum tersedia di halaman ini. Coba buka ulang aplikasinya, ya.");
        return false;
      }

      /* Jalur server WAJIB siap. Kalau tidak, siapkanVerifikasiProduk()
         sudah menampilkan penjelasannya sendiri dan kita berhenti di sini —
         TIDAK jatuh ke hasil simulasi (lihat catatan di fungsi itu). */
      var verifikasi = siapkanVerifikasiProduk(o);
      if (!verifikasi) return false;

      window.DikaPinTransaksi.minta({
        nama: o.nama,
        nominal: o.amount,
        verifikasi: verifikasi,
      })
        .then(function (r) {
          if (r && r.ok) { mulaiProses(o); return; }
          /* Dibatalkan sendiri = diam saja, member tahu apa yang dia lakukan.
             "banned" (salah 3x) TIDAK ditangani di sini sama sekali —
             pin-transaksi.js SUDAH menampilkan popup "Akun Kamu Telah
             Dibanned" sendiri dan langsung logout paksa; menambah popup
             lain di sini hanya menumpuk dua pesan untuk satu kejadian. */
        })
        .catch(function (e) {
          console.error("payment-flow: konfirmasi PIN gagal:", e);
        });
      return true;
    } catch (e) {
      console.error("payment-flow: gagal memulai pembayaran:", e);
      return false;
    }
  }

  window.DikaPayment = {
    bayar: bayar,
    readBalance: readBalance,
    writeBalance: writeBalance,
    OUTCOME: OUTCOME,
    /* Diekspos supaya jalur integrasi bisa diuji/diganti dari luar tanpa
       menyunting file ini — dan supaya bentuk `res` terdokumentasi hidup,
       bukan cuma di komentar. */
    bentukHasil: bentukHasil,
    mintaHasil: mintaHasil,
    setPenentuHasil: setPenentuHasil,   /* SEAM integrasi — lihat komentarnya */
    checkStatusUpdate: checkStatusUpdate,
  };
})();
