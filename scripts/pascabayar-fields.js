/* ===========================================================================
   DikaPay — pascabayar-fields.js
   LABEL FIELD IDENTITAS per kategori pascabayar — SATU sumber kebenaran.

     window.DikaPascaField = {
       get(slug)          // -> { label, placeholder?, hint? } | null
       terapkan(slug, el) // pasang label & placeholder ke DOM
     }

   KENAPA TERPUSAT: tiap kategori memakai sebutan berbeda untuk identitas
   pelanggannya — "ID Pelanggan/No Meter" (PLN), "Nomor Objek Pajak" (PBB),
   "Nomor Kepesertaan" (BPJS TK), dst. Kalau labelnya ditulis langsung di
   masing-masing HTML, satu perubahan istilah berarti menyunting belasan
   file dan gampang tertinggal separuh. Di sini sekali ubah, semua ikut.

   HANYA DUA KATEGORI yang identitasnya benar-benar NOMOR HP: kategori yang
   terikat ke nomor SIM (HP Pascabayar, by.U) dan akun/paket operator yang
   memang didaftarkan atas nomor seluler (E-Money, Telkomsel Omni, Indosat
   Only4u, Tri CuanMax, XL Axis Cuanku). Sisanya BUKAN nomor HP — jangan
   menyeragamkan semuanya jadi "Nomor HP".

   `hp: true` menandai kategori yang identitasnya nomor HP. Dipakai
   manual-page.js untuk memutuskan apakah deteksi operator dijalankan.
   Deteksi itu TETAP DIPERLUKAN (validasi prefix + pemilihan produk per
   operator) meski BADGE-nya tidak lagi ditampilkan — lihat catatan badge
   di manual-page.js.

   TODO fase 2: label boleh tetap di sini (istilah UI, bukan data), tapi
   panjang & format ID sebaiknya diverifikasi ulang ke ketentuan tiap
   biller saat sinkronisasi Digiflazz pertama.
   =========================================================================== */

(function () {
  "use strict";

  var FIELDS = {
    /* ---- Identitas = NOMOR HP (terikat SIM / akun operator) ---------- */
    "hp-pasca": {
      hp: true, label: "Nomor HP",
      placeholder: "Contoh: 081234567890",
    },
    "byu": {
      hp: true, label: "Nomor HP",
      placeholder: "Contoh: 085112345678",
    },
    "tsel-omni": {
      hp: true, label: "Nomor HP",
      placeholder: "Contoh: 081234567890",
    },
    "isat-only4u": {
      hp: true, label: "Nomor HP",
      placeholder: "Contoh: 085712345678",
    },
    "tri-cuanmax": {
      hp: true, label: "Nomor HP",
      placeholder: "Contoh: 089612345678",
    },
    "xl-cuanku": {
      hp: true, label: "Nomor HP",
      placeholder: "Contoh: 081712345678",
    },
    "emoney-pasca": {
      hp: true, label: "Nomor HP",
      placeholder: "Contoh: 081234567890",
      hint: "Akun e-wallet (DANA, GoPay, OVO, LinkAja, ShopeePay) terdaftar atas nomor HP ini.",
    },

    /* ---- Identitas = ID pelanggan, BUKAN nomor HP -------------------- */
    "pln-bill": {
      label: "ID Pelanggan / Nomor Meter",
      placeholder: "Contoh: 512345678901",
    },
    "pdam": {
      label: "Nomor Meter / ID Pelanggan",
      placeholder: "Contoh: 1234567890",
    },
    "internet-pasca": {
      label: "Nomor Pelanggan / ID Internet",
      placeholder: "Contoh: 122334455667",
    },
    "bpjs": {
      label: "Nomor Kartu BPJS / Virtual Account",
      placeholder: "Contoh: 0001234567890",
    },
    "bpjs-tk": {
      label: "Nomor Kepesertaan",
      placeholder: "Contoh: 12A123456789",
    },
    "multifinance": {
      label: "Nomor Kontrak / ID Pelanggan",
      placeholder: "Contoh: 1234567890",
    },
    "pbb": {
      label: "Nomor Objek Pajak (NOP)",
      placeholder: "Contoh: 123456789012345678",
    },
    "gas": {
      label: "ID Pelanggan",
      placeholder: "Contoh: 1234567890",
    },
    "tv-pasca": {
      label: "Nomor Pelanggan / ID Pelanggan",
      placeholder: "Contoh: 1234567890",
    },
  };

  function get(slug) {
    return Object.prototype.hasOwnProperty.call(FIELDS, slug) ? FIELDS[slug] : null;
  }

  /* Pasang ke DOM. Halaman yang slug-nya belum terdaftar dibiarkan apa
     adanya (label dari HTML-nya sendiri) — lebih baik memakai teks lama
     daripada mengosongkannya. */
  function terapkan(slug, root) {
    var f = get(slug);
    if (!f) {
      console.warn("pascabayar-fields: slug belum terdaftar:", slug,
        "- memakai label dari HTML.");
      return null;
    }
    var doc = root || document;
    try {
      var label = doc.querySelector('label[for="idInput"], .pfield__label');
      if (label && f.label) label.textContent = f.label;
      var input = doc.getElementById ? doc.getElementById("idInput") : null;
      if (input && f.placeholder) input.setAttribute("placeholder", f.placeholder);

      /* Teks bantuan opsional di bawah field. Dibuat runtime supaya
         halaman tidak perlu menambah markup. */
      if (f.hint && input) {
        var kartu = input.closest(".pcard") || input.parentNode;
        if (kartu && !kartu.querySelector(".pfield__note")) {
          var p = doc.createElement("p");
          p.className = "pfield__note";
          p.textContent = f.hint;
          kartu.appendChild(p);
        }
      }
    } catch (e) {
      console.error("pascabayar-fields: gagal menerapkan label:", e);
    }
    return f;
  }

  window.DikaPascaField = { FIELDS: FIELDS, get: get, terapkan: terapkan };
})();
