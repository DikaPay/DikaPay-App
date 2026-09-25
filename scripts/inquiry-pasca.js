/* ===========================================================================
   DikaPay — inquiry-pasca.js
   CEK TAGIHAN pascabayar — DATA ASLI dari Digiflazz lewat backend proxy.
   Menggantikan inquiry-dummy.js di 16 halaman pascabayar.

     window.DikaInquiry = {
       cek(slug, customerNo, adminFallback, sku)
         -> Promise<{ nama, id, periode, nominal, admin, total, refId, rc, raw }>
       DUMMY: false
     }

   =========================== KONTRAK ENDPOINT ============================
   POST https://dikapayofficial.my.id/inquiry-pasca.php
     body JSON: { "buyer_sku_code": <kode_produk>, "customer_no": <nomor> }

   Sukses (contoh):
     { "ok": true, "ref_id": "inq...", "data": {
         "ref_id": "...", "status": "Sukses", "rc": "00",
         "customer_no": "...", "buyer_sku_code": "...",
         "customer_name": "NAMA PELANGGAN",
         "admin": 2500, "selling_price": 152500, "price": 150000,
         "desc": { "tarif": "...", "daya": "...", "lembar_tagihan": 1,
                   "detail": [ { "periode": "202608", "nilai_tagihan": "150000", ... } ] } } }

   Gagal (rc != "00"): `data.status` != "Sukses" -> Promise DITOLAK dengan
   Error ber-`pesanMember` (dari digiflazz-rc.js) + `.rc`. manual-page.js
   menampilkan `.pesanMember` apa adanya ke member.

   `buyer_sku_code` diambil manual-page.js dari produkAktif().sku
   (kode_produk asli dari api-produk.php?jenis=pascabayar). Untuk brand
   berbiller-banyak (PDAM/PBB/Multifinance) sku ikut biller yang dipilih
   member di picker; untuk biller tunggal (PLN Pasca/BPJS/dll) sku produk
   tunggalnya.
   =========================================================================== */

(function () {
  "use strict";

  var BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

  function num(v, fallback) {
    var n = Number(v);
    return isFinite(n) ? n : (Number(fallback) || 0);
  }

  /* "202608" / "2026-08" / "Agustus 2026" -> "Agustus 2026". Beberapa biller
     mengirim >1 periode (tunggakan) — digabung "Juli–Agustus 2026". */
  function bulanDari(kode) {
    var s = String(kode || "").replace(/[^0-9]/g, "");
    if (s.length >= 6) {
      var th = s.slice(0, 4), bl = parseInt(s.slice(4, 6), 10);
      if (bl >= 1 && bl <= 12) return BULAN[bl - 1] + " " + th;
    }
    return String(kode || "").trim();
  }

  function periodeDari(d) {
    var desc = d && d.desc;
    var detail = desc && Array.isArray(desc.detail) ? desc.detail : null;
    if (detail && detail.length) {
      var ps = detail.map(function (x) { return bulanDari(x.periode || x.period); })
        .filter(Boolean);
      if (ps.length === 1) return ps[0];
      if (ps.length > 1) return ps[0] + " – " + ps[ps.length - 1];
    }
    if (desc && (desc.periode || desc.period)) return bulanDari(desc.periode || desc.period);
    if (d && (d.periode || d.period)) return bulanDari(d.periode || d.period);
    /* Fallback: tagihan berjalan = pemakaian bulan lalu. */
    var t = new Date(); t.setMonth(t.getMonth() - 1);
    return BULAN[t.getMonth()] + " " + t.getFullYear();
  }

  function sukses(d) {
    var st = String(d.status || "").toLowerCase();
    var rc = String(d.rc || "");
    return st === "sukses" || rc === "00";
  }

  function petakan(d, adminFallback, idInput) {
    /* admin: dari response kalau ada, kalau tidak dari admin_fee produk. */
    var admin = ("admin" in d) ? num(d.admin, adminFallback) : num(adminFallback, 0);

    /* Digiflazz inq-pasca: `selling_price` = total yang harus dibayar
       (tagihan + admin), `price` = tagihan pokok. Ambil defensif. */
    var total, nominal;
    if (d.selling_price != null && isFinite(Number(d.selling_price))) {
      total = num(d.selling_price);
      nominal = Math.max(total - admin, 0);
    } else if (d.price != null && isFinite(Number(d.price))) {
      nominal = num(d.price);
      total = nominal + admin;
    } else {
      /* Sebagian biller mengirim nilai di desc.detail[].nilai_tagihan. */
      var det = d.desc && Array.isArray(d.desc.detail) ? d.desc.detail : [];
      nominal = det.reduce(function (s, x) {
        return s + num(x.nilai_tagihan != null ? x.nilai_tagihan : x.nominal, 0)
          + num(x.denda, 0);
      }, 0);
      total = nominal + admin;
    }

    return {
      nama: String(d.customer_name || d.name || d.nama || "-"),
      id: String(d.customer_no || idInput || ""),
      periode: periodeDari(d),
      nominal: nominal,
      admin: admin,
      total: (nominal + admin) === total ? total : (nominal + admin),
      refId: String(d.ref_id || ""),
      rc: String(d.rc || ""),
      raw: d,
    };
  }

  function cek(slug, customerNo, adminFallback, sku) {
    var API = window.DikaApi;
    if (!API || typeof API.inquiryPasca !== "function") {
      var e0 = new Error("api.js belum di-link / inquiryPasca tidak ada");
      e0.pesanMember = "Cek tagihan belum tersedia di halaman ini.";
      return Promise.reject(e0);
    }
    if (!sku) {
      var e1 = new Error("buyer_sku_code kosong (sku produk belum termuat)");
      e1.pesanMember = "Data produk belum siap. Coba beberapa saat lagi, ya.";
      return Promise.reject(e1);
    }

    return API.inquiryPasca(sku, customerNo).then(function (d) {
      if (!sukses(d)) {
        var rc = String(d.rc || "");
        var e = new Error("inquiry gagal rc=" + rc + " status=" + d.status);
        e.rc = rc;
        e.pesanMember = window.DikaRC
          ? window.DikaRC.pesan(rc, "Tagihan tidak dapat ditemukan. Periksa kembali nomor pelanggan, ya.")
          : (d.message || "Tagihan tidak dapat ditemukan. Periksa kembali nomornya, ya.");
        throw e;
      }
      return petakan(d, adminFallback, customerNo);
    });
  }

  window.DikaInquiry = { cek: cek, DUMMY: false };
})();
