/* ===========================================================================
   DikaPay — transfer-member.js
   Transfer saldo ANTAR MEMBER DikaPay (BUKAN transfer bank). BACKEND LIVE
   (lihat api.js: DikaApi.cekMemberTransfer/transfer) — validasi nomor
   tujuan & proses transfer sungguhan lewat api-transfer.php, bukan lagi
   direktori dummy di localStorage. Halaman ini tidak memuat produk-ui.js
   (bukan bagian arsitektur produk — lihat CLAUDE.md), jadi beberapa
   primitif kecil (onReady, fmtRupiah, parseAngka) disalin ulang di sini
   dengan pola yang sama seperti file lain, bukan diimpor.

   Alur: isi nomor HP tujuan -> dicek REALTIME ke backend (debounce) ->
   ditemukan (preview nama + avatar) -> isi nominal & catatan -> konfirmasi
   (modal + peringatan) -> PIN Transaksi (diverifikasi BACKEND, lihat
   verifikasiPinBackend()) -> proses -> sukses. Saldo pengirim datang dari
   response `saldo_baru` backend, bukan dihitung sendiri di sini.

   Yang MASIH lokal (belum ada endpoint-nya, lihat CLAUDE.md "Transfer Antar
   Member" & TODO fase 2): riwayat transaksi (dikapay:tx:extra, dibaca
   data.js) dan notifikasi kotak masuk (notif-store.js) — keduanya groundwork
   tampilan, tidak memengaruhi saldo/kebenaran transfer itu sendiri. */

"use strict";

(function () {
  var RM = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Halaman ini tidak memuat produk-ui.js, jadi onReady kecil sendiri —
     pola yang sama seperti auth-flow.js: jalan langsung kalau
     readyState sudah lewat "loading", plus penjaga anti double-init. */
  function onReady(fn) {
    var ran = false;
    function boot() {
      if (ran) return;
      ran = true;
      try { fn(); }
      catch (e) { console.error("transfer-member: init halaman gagal:", e); }
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }

  function $(id) { return document.getElementById(id); }

  function fmtRupiah(v) {
    var n = Number(v);
    if (!isFinite(n)) return "Rp0";
    return "Rp" + Math.round(n).toLocaleString("id-ID");
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function pad2(n) { return String(n).padStart(2, "0"); }

  /* ---- Nominal: format ribuan sambil mempertahankan posisi caret ----
     Pola yang sama seperti formatNominal() di manual-page.js (dipakai di
     semua halaman Tipe C) — tanpa penjagaan caret, menyunting di TENGAH
     angka bikin kursor lompat ke ujung tiap kali separator disisipkan.
     Nama fungsi ini "parseAngka" (konvensi input nominal DikaPay). */
  function parseAngka(input) {
    var caret = input.selectionStart;
    var before = caret == null
      ? null
      : input.value.slice(0, caret).replace(/\D/g, "").length;

    var digits = input.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 9);
    var out = digits ? Number(digits).toLocaleString("id-ID") : "";
    if (input.value !== out) input.value = out;

    if (before != null) {
      var pos = 0, seen = 0;
      while (pos < out.length && seen < before) {
        if (/\d/.test(out.charAt(pos))) seen++;
        pos++;
      }
      try { input.setSelectionRange(pos, pos); } catch (e) {}
    }
    return digits ? Number(digits) : 0;
  }

  /* ---- Nomor HP: normalisasi + validasi (pola auth-flow.js) ---------- */

  function normPhone(v) {
    var d = String(v || "").replace(/[^\d+]/g, "");
    if (d.indexOf("+62") === 0) d = "0" + d.slice(3);
    else if (d.indexOf("62") === 0 && d.length > 10) d = "0" + d.slice(2);
    return d.replace(/\D/g, "");
  }
  function prettyPhone(d) {
    if (d.length <= 4) return d;
    if (d.length <= 8) return d.slice(0, 4) + "-" + d.slice(4);
    return d.slice(0, 4) + "-" + d.slice(4, 8) + "-" + d.slice(8);
  }
  function isPhone(d) { return /^08[1-9][0-9]{6,11}$/.test(d); }

  function initials(name) {
    var p = String(name).trim().split(/\s+/).filter(Boolean);
    if (!p.length) return "?";
    if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
    return (p[0][0] + p[p.length - 1][0]).toUpperCase();
  }

  function getProfilePhone() {
    try {
      var raw = localStorage.getItem("dikapay:profile");
      if (!raw) return "";
      var p = JSON.parse(raw);
      return (p && p.phone) || "";
    } catch (e) { return ""; }
  }
  function getProfileName() {
    try {
      var raw = localStorage.getItem("dikapay:profile");
      if (!raw) return "";
      var p = JSON.parse(raw);
      return (p && p.name) || "";
    } catch (e) { return ""; }
  }

  /* ---- Pesan notifikasi transfer (bervariasi, nada hangat) -----------
     Dipasangkan title+desc supaya keduanya selalu cocok satu sama lain
     (bukan dicampur acak dari dua kolam terpisah). amount sudah dalam
     bentuk "Rp50.000" (fmtRupiah), jangan ditambah "Rp" lagi. */
  function pickOne(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  var SENDER_NOTIF_TEMPLATES = [
    function (amount, name) { return { title: "Transfer Berhasil!", desc: amount + " ke " + name + " berhasil terkirim. Terima kasih sudah pakai DikaPay! 🎉" }; },
    function (amount, name) { return { title: "Kirim Uang Sukses!", desc: "Sip, " + amount + " sudah meluncur ke " + name + ". Transaksi aman & tercatat rapi di riwayat kamu." }; },
    function (amount, name) { return { title: "Transfer Terkirim!", desc: amount + " ke " + name + " sudah sukses diproses. Semoga bermanfaat, ya! 😊" }; },
  ];
  var RECEIVER_NOTIF_TEMPLATES = [
    function (amount, name) { return { title: "Transfer Masuk!", desc: "Kamu menerima " + amount + " dari " + name + ". Saldo DikaPay kamu sudah bertambah! 💰" }; },
    function (amount, name) { return { title: "Saldo Bertambah!", desc: amount + " dari " + name + " baru saja masuk ke akun DikaPay kamu. Yuk, cek saldo!" }; },
    function (amount, name) { return { title: "Kamu Dapat Transfer!", desc: "Asyik! " + name + " baru saja mengirim " + amount + " ke akun kamu. 🎉" }; },
  ];

  /* ---- Saldo pengirim (kunci: dikapay:balance) -----------------------
     SATU-SATUNYA kunci saldo saat ini, dibaca juga oleh script.js untuk
     kartu saldo beranda. Diisi backend (auth-flow.js `setBalanceDari()`
     saat login) dan diperbarui di sini dari `saldo_baru` respons
     POST /api-transfer.php setelah transfer sukses — TIDAK dihitung
     manual (saldo - nominal) lagi, backend yang punya angka finalnya. */
  var BALANCE_KEY = "dikapay:balance";
  var DEFAULT_BALANCE = 125000;

  function readBalance() {
    try {
      var raw = localStorage.getItem(BALANCE_KEY);
      // Key belum ada (akun baru) -> DEFAULT_BALANCE. Beda dengan raw === "0"
      // (saldo pernah ada, habis terpakai) — Number(null) diam-diam jadi 0
      // kalau dicek lewat isFinite/>=0 saja, jadi null wajib ditangani
      // eksplisit sebelum dikonversi ke Number. Pola sama seperti
      // readBalance() di script.js — perbaiki keduanya kalau salah satu berubah.
      if (raw === null) return DEFAULT_BALANCE;
      var v = Number(raw);
      if (isFinite(v) && v >= 0) return v;
    } catch (e) {}
    return DEFAULT_BALANCE;
  }
  function writeBalance(v) {
    try {
      localStorage.setItem(BALANCE_KEY, String(Math.max(0, Math.round(v))));
      /* Tera "kapan ditulis" — dibaca member-sync.js (terapkanSaldo) sebagai
         pertahanan anti-timpa: `saldo_baru` dari respons transfer ini WAJIB
         jadi sumber kebenaran paling akhir, tidak boleh tertimpa balik oleh
         polling status latar belakang yang kebetulan berjalan hampir
         bersamaan tapi membawa data yang lebih basi. Lihat catatan besar
         "TOKEN & SALDO HARUS PER-AKUN" di member-sync.js. */
      localStorage.setItem("dikapay:balance:ts", String(Date.now()));
    } catch (e) { console.error("transfer-member: gagal menyimpan saldo:", e); }
  }

  /* ---- Riwayat: catat transaksi transfer (kunci: dikapay:tx:extra) ---
     data.js membaca kunci ini sekali saat dimuat dan menggabungkannya ke
     window.DATA.TX/DATA.DETAILS — riwayat.js & statistik.js sendiri tidak
     tahu apa-apa soal localStorage, tetap hanya baca DATA.TX/DATA.DETAILS
     ("satu-satunya tempat data transaksi" di data.js tetap berlaku). */

  function makeTxId(now) {
    var stamp = now.getFullYear() + pad2(now.getMonth() + 1) + pad2(now.getDate());
    var rand = String(Math.floor(1000 + Math.random() * 9000));
    return "TRX-" + stamp + "-" + rand;
  }
  function makeRef() {
    var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    var s = "";
    for (var i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return "TRFM" + s;
  }
  function nowDt(now) {
    return now.getFullYear() + "-" + pad2(now.getMonth() + 1) + "-" + pad2(now.getDate()) +
      "T" + pad2(now.getHours()) + ":" + pad2(now.getMinutes());
  }

  /* appendLocalTx() DIHAPUS. Transfer sudah tercatat di server lewat
     `api-transfer.php` dan ikut terbawa `api-riwayat.php` — mencatatnya
     lagi di perangkat akan membuat setiap transfer muncul DUA KALI di
     daftar. Sejak pembelian produk juga tersambung ke server
     (api-transaksi-produk.php), TIDAK ADA lagi riwayat lokal sama sekali. */

  /* ======================================================================
     Halaman
     ====================================================================== */

  onReady(function () {
    var els = {
      backBtn: $("backBtn"),
      phoneInput: $("phoneInput"),
      clearBtn: $("clearBtn"),
      phoneField: $("phoneField"),
      phoneChecking: $("phoneChecking"),
      phoneErr: $("phoneErr"),
      phoneErrText: $("phoneErrText"),
      foundBox: $("foundBox"),
      foundAvatar: $("foundAvatar"),
      foundName: $("foundName"),
      foundPhone: $("foundPhone"),
      amountBox: $("amountBox"),
      amountField: $("amountField"),
      amountInput: $("amountInput"),
      balanceHint: $("balanceHint"),
      amountErr: $("amountErr"),
      amountErrText: $("amountErrText"),
      noteInput: $("noteInput"),
      continueBtn: $("continueBtn"),
      formStep: $("formStep"),
      successStep: $("successStep"),
      successDesc: $("successDesc"),
      successRows: $("successRows"),
      homeBtn: $("homeBtn"),
      againBtn: $("againBtn"),
      confirmOverlay: $("confirmOverlay"),
      cmRows: $("cmRows"),
      cmCancel: $("cmCancel"),
      cmPay: $("cmPay"),
    };
    if (!els.phoneInput || !els.formStep) return; // markup tidak lengkap, jangan lanjut

    var MIN_TRANSFER = 1000;
    /* Nomor tujuan dicek REALTIME ke backend (GET api-transfer.php) —
       debounce lebih longgar dari sebelumnya (dulu 150ms, waktu pencarian
       masih ke localStorage) supaya ketikan cepat tidak menembak jaringan
       tiap huruf/digit, sesuai permintaan: "jangan tiap ketik satu huruf". */
    var LOOKUP_DEBOUNCE_MS = 450;

    var state = {
      member: null,       // { name, phone (pretty) } — dari respons backend
      memberDigits: "",    // nomor tujuan, digit saja
      nominal: 0,
      transferRefId: "",
      transferIntentKey: "",
    };
    var lookupTimer = null;
    var lookupToken = 0;   // buang hasil pencarian basi (nomor sudah berubah lagi)
    var modalOpen = false;
    var modalPushed = false;
    var transferBusy = false;

    /* ---- Nomor HP tujuan ---------------------------------------------- */

    function setChecking(on) {
      if (els.phoneChecking) els.phoneChecking.hidden = !on;
    }

    function clearPhoneErr() {
      els.phoneErr.hidden = true;
      els.phoneField.classList.remove("is-error");
    }
    function showPhoneErr(msg) {
      hideFound();
      setChecking(false);
      els.phoneErrText.textContent = msg;
      els.phoneErr.hidden = false;
      els.phoneField.classList.add("is-error");
      /* Getar sekali — pola & animasi yang SAMA dipakai field nominal
         (tmShake, lihat showAmountErr) dan .pfield.is-invalid di halaman
         produk (fieldShake): reuse, bukan animasi baru. */
      els.phoneField.classList.remove("is-shake");
      void els.phoneField.offsetWidth;
      els.phoneField.classList.add("is-shake");
    }

    function hideFound() {
      els.foundBox.hidden = true;
      els.amountBox.hidden = true;
      els.phoneField.classList.remove("is-valid");
      state.member = null;
      state.memberDigits = "";
      clearTransferRef();
      updateContinueState();
    }

    function clearTransferRef() {
      state.transferRefId = "";
      state.transferIntentKey = "";
    }

    function newTransferRefId() {
      try {
        if (window.crypto && typeof window.crypto.randomUUID === "function") {
          return window.crypto.randomUUID();
        }
      } catch (e) {}
      return "DP-" + Date.now().toString(36) + "-" +
        Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    }

    function refForCurrentTransfer() {
      var key = state.memberDigits + "|" + String(Math.round(state.nominal));
      if (!state.transferRefId || state.transferIntentKey !== key) {
        state.transferIntentKey = key;
        state.transferRefId = newTransferRefId();
      }
      return state.transferRefId;
    }

    function showFound(member, digits) {
      clearPhoneErr();
      state.member = member;
      state.memberDigits = digits;

      els.foundAvatar.textContent = initials(member.name);
      els.foundName.textContent = member.name;
      els.foundPhone.textContent = member.phone || prettyPhone(digits);

      els.foundBox.hidden = false;
      els.amountBox.hidden = false;
      /* Garis hijau di field nomor — pola yang SAMA dengan .pfield.is-valid
         di halaman produk (Listrik/PLN dkk) begitu nomor terverifikasi. */
      els.phoneField.classList.add("is-valid");

      els.balanceHint.textContent = "Saldo kamu saat ini: " + fmtRupiah(readBalance());
      els.balanceHint.classList.remove("is-over");

      updateContinueState();
    }

    /* GET api-transfer.php?nomor_hp=X — validasi REALTIME ke backend.
       `lookupToken` membuang respons yang datang terlambat (member sudah
       mengetik nomor lain sebelum respons pertama tiba). */
    function doLookup(digits) {
      var token = ++lookupToken;
      if (!window.DikaApi || typeof DikaApi.cekMemberTransfer !== "function") {
        setChecking(false);
        console.error("transfer-member: DikaApi.cekMemberTransfer tidak tersedia — api.js belum di-link?");
        showPhoneErr("Pengecekan nomor member belum bisa dilakukan sekarang. Coba buka ulang aplikasinya, ya.");
        return;
      }
      DikaApi.cekMemberTransfer(digits)
        .then(function (res) {
          if (token !== lookupToken) return; // sudah basi, nomor berubah lagi
          setChecking(false);
          showFound({ name: (res && res.nama) || "Member DikaPay", phone: prettyPhone(digits) }, digits);
        })
        .catch(function (err) {
          if (token !== lookupToken) return;
          setChecking(false);
          var msg = err && err.kode === "tidak-terdaftar"
            ? "Nomor ini belum terdaftar sebagai member DikaPay. Pastikan nomornya benar, atau ajak mereka bergabung dulu, ya!"
            : ((err && err.pesanMember) || "Terjadi kesalahan saat mencari member. Coba lagi.");
          console.error("transfer-member: cek nomor tujuan gagal:", (err && err.sebab) || err);
          showPhoneErr(msg);
        });
    }

    els.phoneInput.addEventListener("input", function () {
      try {
        clearPhoneErr();
        hideFound();
        setChecking(false);
        lookupToken++; // batalkan pencarian sebelumnya yang mungkin masih berjalan
        els.clearBtn.hidden = !els.phoneInput.value;

        window.clearTimeout(lookupTimer);
        var digits = normPhone(els.phoneInput.value);
        if (digits.length < 10) return; // belum cukup panjang, jangan cari dulu

        if (!isPhone(digits)) {
          showPhoneErr("Format nomor HP tidak valid. Contoh: 081234567890.");
          return;
        }
        var selfDigits = normPhone(getProfilePhone());
        if (selfDigits && digits === selfDigits) {
          showPhoneErr("Ups, ini nomor HP kamu sendiri. Masukkan nomor member DikaPay lain, ya.");
          return;
        }

        setChecking(true);
        lookupTimer = window.setTimeout(function () { doLookup(digits); }, LOOKUP_DEBOUNCE_MS);
      } catch (e) { console.error("transfer-member: input nomor gagal diproses:", e); }
    });

    els.clearBtn.addEventListener("click", function () {
      els.phoneInput.value = "";
      els.clearBtn.hidden = true;
      lookupToken++;
      window.clearTimeout(lookupTimer);
      setChecking(false);
      clearPhoneErr();
      hideFound();
      els.phoneInput.focus();
    });

    /* ---- Nominal & catatan ---------------------------------------------- */

    function clearAmountErr() {
      els.amountErr.hidden = true;
      els.amountField.classList.remove("is-error");
    }
    function showAmountErr(msg) {
      els.amountErrText.textContent = msg;
      els.amountErr.hidden = false;
      els.amountField.classList.add("is-error");
      els.amountField.classList.remove("is-shake");
      void els.amountField.offsetWidth;
      els.amountField.classList.add("is-shake");
    }

    function updateContinueState() {
      var ok = !!state.member && state.nominal > 0;
      els.continueBtn.disabled = !ok;
    }

    els.amountInput.addEventListener("input", function () {
      try {
        clearAmountErr();
        var nominalSebelumnya = state.nominal;
        state.nominal = parseAngka(els.amountInput);
        if (state.nominal !== nominalSebelumnya) clearTransferRef();
        var saldo = readBalance();
        var over = state.nominal > saldo;
        els.balanceHint.textContent = over
          ? "Nominal melebihi saldo kamu (" + fmtRupiah(saldo) + ")."
          : "Saldo kamu saat ini: " + fmtRupiah(saldo);
        els.balanceHint.classList.toggle("is-over", over);
        updateContinueState();
      } catch (e) { console.error("transfer-member: input nominal gagal diproses:", e); }
    });

    /* ---- Lanjutkan -> buka modal konfirmasi ------------------------------ */

    els.continueBtn.addEventListener("click", function () {
      try {
        if (!state.member) return;
        var nominal = state.nominal;
        var saldo = readBalance();

        if (!nominal || nominal <= 0) {
          showAmountErr("Masukkan nominal transfer terlebih dahulu.");
          return;
        }
        if (nominal < MIN_TRANSFER) {
          showAmountErr("Nominal transfer minimal " + fmtRupiah(MIN_TRANSFER) + ".");
          return;
        }
        if (nominal > saldo) {
          showAmountErr("Saldo kamu tidak cukup untuk transfer ini. Saldo tersedia " + fmtRupiah(saldo) + ".");
          return;
        }
        openConfirm();
      } catch (e) { console.error("transfer-member: tidak bisa lanjut ke konfirmasi:", e); }
    });

    /* ---- Modal konfirmasi ------------------------------------------------
       Pola yang sama dengan createModal() di produk-ui.js: push history saat
       dibuka supaya BACK HP menutup modal (bukan pindah halaman), dan tutup
       lewat popstate/Esc/klik overlay. Ditulis ulang di sini (bukan impor
       produk-ui.js) karena "Bayar"-nya harus benar-benar memproses transfer,
       bukan membuka sheet "Segera Hadir". */

    function openConfirm() {
      if (modalOpen || transferBusy || !state.member) return;

      var note = (els.noteInput.value || "").trim();
      var rows = [
        ["Nama Tujuan", esc(state.member.name)],
        ["Nomor HP Tujuan", esc(state.member.phone || prettyPhone(state.memberDigits))],
        ["Nominal", fmtRupiah(state.nominal), true],
      ];
      if (note) rows.push(["Catatan", esc(note)]);

      els.cmRows.innerHTML = rows.map(function (r) {
        return '<div class="tm-modal__row' + (r[2] ? " tm-modal__row--total" : "") + '">' +
          "<dt>" + r[0] + "</dt><dd>" + r[1] + "</dd></div>";
      }).join("");

      els.confirmOverlay.classList.add("is-open");
      modalOpen = true;
      document.documentElement.style.overflow = "hidden";

      try { history.pushState({ dikaTransferConfirm: 1 }, ""); modalPushed = true; }
      catch (e) { modalPushed = false; }
    }

    function closeConfirm(fromPop) {
      if (!modalOpen) return;
      modalOpen = false;
      els.confirmOverlay.classList.remove("is-open");
      els.cmPay.classList.remove("is-loading");
      els.cmPay.disabled = false;
      document.documentElement.style.overflow = "";

      var did = modalPushed;
      modalPushed = false;
      if (!fromPop && did) { try { history.back(); } catch (e) {} }
    }

    els.cmCancel.addEventListener("click", function () { closeConfirm(); });
    els.confirmOverlay.addEventListener("click", function (e) {
      if (e.target === els.confirmOverlay) closeConfirm();
    });
    window.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && modalOpen) closeConfirm();
    });
    window.addEventListener("popstate", function () {
      if (modalOpen) closeConfirm(true);
    });

    /* ---- Proses transfer (backend LIVE lewat api-transfer.php) ----------- */

    /* Verifikator PIN yang diteruskan ke DikaPinTransaksi.minta({verifikasi}).
       Berbeda dari transaksi produk (yang cocokkan PIN ke localStorage),
       transfer memverifikasi PIN LANGSUNG ke backend — satu panggilan
       sekaligus memvalidasi PIN, mengecek saldo, dan memutasi saldo kedua
       sisi secara atomik di server. Keypad/animasi/popup banned dari
       pin-transaksi.js dipakai APA ADANYA, hanya sumber verifikasinya yang
       berpindah — lihat komentar di pin-transaksi.js (`periksa()`). */
    function verifikasiPinBackend(pinMasuk) {
      var pengirim = normPhone(getProfilePhone());
      var jaringan = window.DikaNetwork;
      var menungguKoneksi = jaringan && !jaringan.isOnline();
      if (menungguKoneksi && typeof jaringan.setTransactionWait === "function") {
        jaringan.setTransactionWait("transfer", true);
      }
      return DikaApi.transfer({
        ref_id: refForCurrentTransfer(),
        nomor_hp_pengirim: pengirim,
        pin: pinMasuk,
        nomor_hp_tujuan: state.memberDigits,
        nominal: state.nominal,
      }).then(function (res) {
        return {
          ok: true,
          saldoBaru: res.saldoBaru,
          namaTujuan: res.namaTujuan,
          message: res.message,
          duplikat: res.duplikat === true,
        };
      }).catch(function (err) {
        if (err && err.banned) {
          return { ok: false, banned: true, bannedSampai: err.bannedSampai, pesan: err.pesanMember };
        }
        var pesan = (err && err.pesanMember) || "Transfer gagal diproses. Coba lagi.";
        /* Backend membedakan alasan gagal lewat isi pesan: "PIN salah. Sisa
           N percobaan lagi." untuk PIN keliru (biarkan member coba lagi DI
           DALAM sheet PIN yang sama), selain itu (saldo tidak cukup, dll.)
           mengulang PIN tidak menolong apa pun — sheet harus ditutup dan
           pesannya ditampilkan di form, bukan menahan member di keypad. */
        var pinSalah = /^pin salah/i.test(pesan);
        return { ok: false, pesan: pesan, pinSalah: pinSalah };
      }).finally(function () {
        if (menungguKoneksi && jaringan && typeof jaringan.setTransactionWait === "function") {
          jaringan.setTransactionWait("transfer", false);
        }
      });
    }

    function finalisasiSukses(hasilPin) {
      var member = state.member;
      var digits = state.memberDigits;
      var nominal = state.nominal;
      var note = (els.noteInput.value || "").trim().slice(0, 80);
      var namaTujuan = (hasilPin && hasilPin.namaTujuan) || (member && member.name) || "Member DikaPay";

      // Saldo TERBARU datang dari backend (saldo_baru) — bukan dihitung
      // manual (saldo - nominal) lagi, backend yang punya angka finalnya.
      if (hasilPin && isFinite(Number(hasilPin.saldoBaru))) {
        /* `saldo_baru` dari server dipakai apa adanya — sejak pembelian
           produk juga tercatat di server, tidak ada lagi selisih lokal yang
           perlu dikurangi (saldo-sim.js sudah dihapus). */
        writeBalance(Number(hasilPin.saldoBaru));
      }

      var now = new Date();
      var tx = {
        id: makeTxId(now),
        cat: "transfer",
        name: "Transfer ke " + namaTujuan,
        dt: nowDt(now),
        amount: -nominal,
        status: "ok",
        method: "Saldo DikaPay",
        ref: makeRef(),
      };
      var detail = {
        recipient: namaTujuan,
        recipientId: (member && member.phone) || prettyPhone(digits),
        note: note,
        admin: 0,
      };
      /* Riwayat transfer TIDAK dicatat lokal: server sudah memilikinya
         (lihat catatan di tempat appendLocalTx dulu berada). Kotak masuk
         notifikasi in-app di bawah tetap lokal — itu memang belum punya
         endpoint sendiri. */

      if (window.DikaNotif) {
        var amountStr = fmtRupiah(nominal);
        var senderName = getProfileName() || "Member DikaPay";

        var senderMsg = pickOne(SENDER_NOTIF_TEMPLATES)(amountStr, namaTujuan);
        var receiverMsg = pickOne(RECEIVER_NOTIF_TEMPLATES)(amountStr, senderName);

        window.DikaNotif.push(getProfilePhone(), { type: "success", title: senderMsg.title, desc: senderMsg.desc });
        window.DikaNotif.push(digits, { type: "success", title: receiverMsg.title, desc: receiverMsg.desc });
      }

      /* Notifikasi SISTEM HP — modul & teks yang SAMA dengan halaman produk
         (notif-hp.js), jadi member melihat bentuk kabar yang konsisten
         dari mana pun transaksinya berasal. */
      if (window.DikaNotifHp) {
        window.DikaNotifHp.transaksi("berhasil", {
          nama: "Transfer ke " + namaTujuan, nominal: nominal });
      }

      return { tx: tx, detail: detail, note: note, message: hasilPin && hasilPin.message };
    }

    els.cmPay.addEventListener("click", function () {
      if (!modalOpen || transferBusy || els.cmPay.disabled) return;

      /* ===== KONFIRMASI PIN — WAJIB, sama seperti transaksi produk ======
         Halaman ini TIDAK memakai payment-flow.js (transfer bukan produk
         PPOB, lihat CLAUDE.md), jadi gerbang PIN-nya harus dipasang di
         sini juga. FAIL-CLOSED: tanpa pin-transaksi.js, transfer ditolak —
         bukan diteruskan diam-diam. */
      if (!window.DikaPinTransaksi) {
        console.error("transfer-member: pin-transaksi.js belum di-link — transfer ditolak.");
        closeConfirm();
        showAmountErr("Konfirmasi PIN belum tersedia. Coba buka ulang aplikasinya, ya.");
        return;
      }
      if (!window.DikaApi || typeof DikaApi.transfer !== "function") {
        console.error("transfer-member: DikaApi.transfer tidak tersedia — api.js belum di-link?");
        closeConfirm();
        showAmountErr("Transfer belum bisa diproses sekarang. Coba buka ulang aplikasinya, ya.");
        return;
      }

      transferBusy = true;
      refForCurrentTransfer();
      els.cmPay.classList.add("is-loading");
      els.cmPay.disabled = true;

      window.DikaPinTransaksi
        .minta({
          nama: "Transfer ke " + (state.member ? state.member.name : "member"),
          nominal: state.nominal,
          verifikasi: verifikasiPinBackend,
        })
        .then(function (r) {
          if (r && r.ok) { prosesTransfer(r); return; }
          transferBusy = false;
          if (r && (r.alasan === "batal" || r.alasan === "tanpa-pin")) clearTransferRef();
          els.cmPay.classList.remove("is-loading");
          els.cmPay.disabled = false;
          /* Dibatalkan sendiri ("batal") / belum punya PIN ("tanpa-pin") =
             modal konfirmasi TETAP TERBUKA, member masih bisa menekan
             "Transfer Sekarang" lagi. "banned" (salah 3x) beda: member
             sebentar lagi di-logout paksa, jadi modal ini ditutup saja —
             pin-transaksi.js SUDAH menampilkan popup "Akun Kamu Telah
             Dibanned" sendiri, jangan menumpuk pesan lain di sini.
             "gagal-lain" (saldo tidak cukup, dst.) juga menutup modal —
             mengulang PIN tidak menolong, pesannya ditampilkan di form. */
          if (r && r.alasan === "banned") { closeConfirm(); return; }
          if (r && r.alasan === "gagal-lain") {
            closeConfirm();
            showAmountErr(r.pesan || "Transfer gagal diproses. Coba lagi.");
            /* Notifikasi SISTEM HP untuk transfer yang GAGAL diproses
               server (saldo tidak cukup, dll.) — pasangan dari notifikasi
               "berhasil" di finalisasiSukses(). PIN salah / dibatalkan
               sendiri TIDAK diberi notifikasi: itu bukan hasil transaksi,
               dan member sedang menatap layarnya. */
            if (window.DikaNotifHp) {
              window.DikaNotifHp.transaksi("gagal", {
                nama: "Transfer ke " + (state.member ? state.member.name : "member"),
                nominal: state.nominal });
            }
          }
        })
        .catch(function (e) {
          console.error("transfer-member: konfirmasi PIN gagal:", e);
          transferBusy = false;
          els.cmPay.classList.remove("is-loading");
          els.cmPay.disabled = false;
        });
    });

    function prosesTransfer(hasilPin) {
      window.setTimeout(function () {
        var result;
        try {
          result = finalisasiSukses(hasilPin);
        } catch (e) {
          console.error("transfer-member: gagal menuntaskan transfer:", e);
          closeConfirm();
          showAmountErr("Transfer berhasil di server, tapi tampilannya gagal diperbarui. Cek saldo & riwayat kamu, ya.");
          return;
        }
        closeConfirm();
        transferBusy = false;
        clearTransferRef();
        window.setTimeout(function () { showSuccess(result); }, RM ? 0 : 240);
      }, RM ? 0 : 850);
    }

    /* ---- Sukses ----------------------------------------------------------- */

    function showSuccess(result) {
      try {
        els.formStep.hidden = true;
        els.successStep.hidden = false; // memicu animasi checkmark/slide-in tm-success

        // Suara "ting" TEPAT saat layar sukses mulai tampil (baris di atas),
        // supaya terasa bersamaan dengan animasi checkmark, bukan sebelum/
        // sesudahnya. sound.js sudah gagal-diam-diam sendiri kalau bermasalah.
        if (window.playSuccessSound) window.playSuccessSound();

        els.successDesc.textContent =
          result.message || (fmtRupiah(Math.abs(result.tx.amount)) + " berhasil dikirim ke " + result.detail.recipient + ".");

        var rows = [
          ["Nama Tujuan", esc(result.detail.recipient)],
          ["Nomor HP Tujuan", esc(result.detail.recipientId)],
          ["Nominal", fmtRupiah(Math.abs(result.tx.amount)), true],
        ];
        if (result.note) rows.push(["Catatan", esc(result.note)]);
        rows.push(["ID Transaksi", esc(result.tx.id)]);

        els.successRows.innerHTML = rows.map(function (r) {
          return '<div class="tm-modal__row' + (r[2] ? " tm-modal__row--total" : "") + '">' +
            "<dt>" + r[0] + "</dt><dd>" + r[1] + "</dd></div>";
        }).join("");
      } catch (e) { console.error("transfer-member: gagal menampilkan halaman sukses:", e); }
    }

    function resetForm() {
      clearTransferRef();
      els.phoneInput.value = "";
      els.amountInput.value = "";
      els.noteInput.value = "";
      els.clearBtn.hidden = true;
      clearPhoneErr();
      clearAmountErr();
      hideFound();
      state.nominal = 0;
      els.formStep.hidden = false;
      els.successStep.hidden = true;
      els.phoneInput.focus();
    }

    els.homeBtn.addEventListener("click", function () {
      window.location.href = "../index.html";
    });
    els.againBtn.addEventListener("click", resetForm);

    /* ---- Tombol kembali (header) -----------------------------------------
       Kalau modal konfirmasi sedang terbuka, tutup dulu — jangan langsung
       tinggalkan halaman (pola yang sama seperti provider-page.js: cek modal
       SEBELUM navigasi). Tidak memakai animasi keluar .is-leaving di sini
       (halaman ini tidak memuat produk-ui.js yang menjaga bfcache-nya) —
       navigasi langsung, konsisten dengan auth-flow.js. */
    els.backBtn.addEventListener("click", function () {
      if (modalOpen) { closeConfirm(); return; }
      window.location.href = "../index.html";
    });
  });
})();
