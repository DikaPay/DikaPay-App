/* ===========================================================================
   DikaPay — translations.js
   i18n sederhana. Di-link SEBELUM script halaman di index/riwayat/margin/akun.

   Pemakaian:
   - Markup:  <span data-i18n="nav.home">Beranda</span>       -> textContent
              <el data-i18n-html="key">...</el>              -> innerHTML (boleh <br>)
   - JS:      I18N.t("svc.pulsa")            -> string terjemahan
              I18N.apply(root)               -> terapkan ke semua [data-i18n] di root
              I18N.lang / I18N.lang = "en"   -> baca/set bahasa aktif (sessionStorage)

   Cakupan saat ini: label bottom nav, beranda (grid Layanan), halaman Akun.
   Bagian lain sengaja belum diterjemahkan (pengembangan bertahap).
   =========================================================================== */

"use strict";

var TRANSLATIONS = {
  id: {
    /* Bottom navigation */
    "nav.home": "Beranda",
    "nav.transaction": "Transaksi",
    "nav.margin": "Margin",
    "nav.account": "Akun",

    /* Beranda */
    "home.services": "Layanan",
    "home.allservices": "Semua Layanan",
    "svc.pulsa": "Pulsa",
    "svc.data": "Paket Data",
    "svc.listrik": "Listrik",
    "svc.pln-bill": "PLN Pascabayar",
    "svc.pdam": "PDAM",
    "svc.bpjs": "BPJS Kesehatan",
    "svc.lainnya": "Lainnya",
    "svc.streaming": "Streaming",
    "svc.games": "Games",
    "svc.voucher": "Voucher",
    "svc.voucher-act": "Aktivasi Voucher",
    "svc.gas-prabayar": "Gas Prabayar",
    "svc.masa-aktif": "Masa Aktif",
    "svc.perdana": "Aktivasi Perdana",
    "svc.sms-telpon": "Paket SMS & Telpon",
    "svc.gas": "Gas Negara",
    "svc.emoney": "E-Money & Wallet",
    "svc.hp-pasca": "HP Pascabayar",
    "svc.internet-pasca": "Internet Pascabayar",
    "svc.tv-pasca": "TV Pascabayar",
    "svc.bpjs-tk": "BPJS Ketenagakerjaan",
    "svc.multifinance": "Multifinance",
    "svc.pbb": "PBB",
    "svc.tsel-omni": "Telkomsel Omni",
    "svc.isat-only4u": "Indosat Only4u",
    "svc.tri-cuanmax": "Tri CuanMax",
    "svc.xl-cuanku": "XL Axis Cuanku",
    "svc.byu": "by.U",
    "svc.emoney-pasca": "E-Money Pascabayar",

    /* Akun — section & menu */
    "acc.score.title": "Skor Keamanan Akun",
    "acc.score.item.pin": "PIN Transaksi",
    "acc.score.item.pinEvery": "PIN Setiap Transaksi",
    "acc.score.item.tfa": "Verifikasi 2 Langkah",
    "acc.sec.title": "Keamanan Akun",
    "acc.sec.pin": "Ubah PIN Transaksi",
    "acc.sec.pin.create": "Buat PIN Transaksi",
    "acc.sec.lupapin": "Lupa PIN Transaksi",
    "acc.sec.pinEvery": "Gunakan PIN Setiap Transaksi",
    "acc.sec.pinEvery.sub": "Kamu akan diminta memasukkan PIN setiap kali melakukan pembayaran, transfer, atau top up.",
    "acc.sec.bio": "Login dengan Biometrik",
    "acc.sec.bio.sub": "Masuk ke DikaPay lebih cepat tanpa mengetik PIN. Metode yang dipakai (sidik jari atau wajah) ditentukan otomatis oleh HP kamu, sesuai yang sudah kamu daftarkan di Pengaturan Android.",
    "acc.sec.2fa": "Verifikasi 2 Langkah (2FA)",
    "acc.sec.devices": "Perangkat Aktif",

    "acc.my.title": "Akun Saya",
    "acc.my.data": "Data Diri",
    "acc.my.data.sub": "Nama, email, no. HP",
    "acc.my.address": "Alamat Tersimpan",

    "acc.pref.title": "Preferensi",
    "acc.pref.notifTx": "Notifikasi Transaksi",
    "acc.pref.lang": "Bahasa",

    "acc.help.title": "Bantuan & Lainnya",
    "acc.help.faq": "Pusat Bantuan / FAQ",
    "acc.help.cs": "Hubungi Customer Service",
    "acc.help.tnc": "Syarat & Ketentuan",
    "acc.help.privacy": "Kebijakan Privasi",
    "acc.help.about": "Tentang DikaPay",

    "acc.logout": "Keluar",
    "acc.status.active": "Member Aktif",

    /* Bottom sheet pilih bahasa */
    "lang.sheet.title": "Pilih Bahasa",
    "lang.id": "Bahasa Indonesia",
    "lang.en": "English",
    "lang.name.id": "Indonesia",
    "lang.name.en": "English",
  },

  en: {
    "nav.home": "Home",
    "nav.transaction": "Transactions",
    "nav.margin": "Margin",
    "nav.account": "Account",

    "home.services": "Services",
    "home.allservices": "All Services",
    "svc.pulsa": "Credit",
    "svc.data": "Data Package",
    "svc.listrik": "Electricity",
    "svc.pln-bill": "PLN Postpaid",
    "svc.pdam": "Water (PDAM)",
    "svc.bpjs": "BPJS Health",
    "svc.lainnya": "More",
    "svc.streaming": "Streaming",
    "svc.games": "Games",
    "svc.voucher": "Voucher",
    "svc.voucher-act": "Voucher Activation",
    "svc.gas-prabayar": "Prepaid Gas",
    "svc.masa-aktif": "Active Period",
    "svc.perdana": "SIM Activation",
    "svc.sms-telpon": "SMS & Call Package",
    "svc.gas": "State Gas",
    "svc.emoney": "E-Money & Wallet",
    "svc.hp-pasca": "Postpaid Mobile",
    "svc.internet-pasca": "Postpaid Internet",
    "svc.tv-pasca": "Postpaid TV",
    "svc.bpjs-tk": "BPJS Employment",
    "svc.multifinance": "Multifinance",
    "svc.pbb": "Property Tax",
    "svc.tsel-omni": "Telkomsel Omni",
    "svc.isat-only4u": "Indosat Only4u",
    "svc.tri-cuanmax": "Tri CuanMax",
    "svc.xl-cuanku": "XL Axis Cuanku",
    "svc.byu": "by.U",
    "svc.emoney-pasca": "E-Money Postpaid",

    "acc.score.title": "Account Security Score",
    "acc.score.item.pin": "Transaction PIN",
    "acc.score.item.pinEvery": "PIN Every Transaction",
    "acc.score.item.tfa": "Two-Step Verification",
    "acc.sec.title": "Account Security",
    "acc.sec.pin": "Change Transaction PIN",
    "acc.sec.pin.create": "Create Transaction PIN",
    "acc.sec.lupapin": "Forgot Transaction PIN",
    "acc.sec.pinEvery": "Require PIN for Every Transaction",
    "acc.sec.pinEvery.sub": "You will be asked to enter your PIN every time you make a payment, transfer, or top up.",
    "acc.sec.bio": "Sign In with Biometrics",
    "acc.sec.bio.sub": "Access DikaPay faster without typing your PIN. The specific method (fingerprint or face) is decided automatically by your phone, based on what you've enrolled in Android Settings.",
    "acc.sec.2fa": "Two-Step Verification (2FA)",
    "acc.sec.devices": "Active Devices",

    "acc.my.title": "My Account",
    "acc.my.data": "Personal Data",
    "acc.my.data.sub": "Name, email, phone",
    "acc.my.address": "Saved Addresses",

    "acc.pref.title": "Preferences",
    "acc.pref.notifTx": "Transaction Notifications",
    "acc.pref.lang": "Language",

    "acc.help.title": "Help & More",
    "acc.help.faq": "Help Center / FAQ",
    "acc.help.cs": "Contact Customer Service",
    "acc.help.tnc": "Terms & Conditions",
    "acc.help.privacy": "Privacy Policy",
    "acc.help.about": "About DikaPay",

    "acc.logout": "Log Out",
    "acc.status.active": "Active Member",

    "lang.sheet.title": "Choose Language",
    "lang.id": "Bahasa Indonesia",
    "lang.en": "English",
    "lang.name.id": "Indonesia",
    "lang.name.en": "English",
  },
};

var _dikaLang = null; // sumber kebenaran dalam sesi (fallback bila sessionStorage tak tersedia)

var I18N = {
  get lang() {
    if (_dikaLang) return _dikaLang;
    try { _dikaLang = sessionStorage.getItem("dikapay:lang") || "id"; } catch (e) { _dikaLang = "id"; }
    return _dikaLang;
  },
  set lang(v) {
    _dikaLang = v === "en" ? "en" : "id";
    try { sessionStorage.setItem("dikapay:lang", _dikaLang); } catch (e) {}
  },
  t: function (key) {
    var l = this.lang;
    return (TRANSLATIONS[l] && TRANSLATIONS[l][key]) || TRANSLATIONS.id[key] || key;
  },
  apply: function (root) {
    var self = this;
    var scope = root || document;
    scope.querySelectorAll("[data-i18n]").forEach(function (el) {
      el.textContent = self.t(el.getAttribute("data-i18n"));
    });
    scope.querySelectorAll("[data-i18n-html]").forEach(function (el) {
      el.innerHTML = self.t(el.getAttribute("data-i18n-html"));
    });
  },
};

window.I18N = I18N;
