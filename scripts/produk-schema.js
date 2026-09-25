/* ===========================================================================
   DikaPay — produk-schema.js
   SKEMA DATA PRODUK — kontrak tunggal yang harus dipenuhi SEMUA file data
   kategori, supaya siap ditimpa hasil sinkronisasi Digiflazz.

   Dua bentuk produk, SENGAJA BERBEDA:

   1) PRABAYAR (Pulsa, Data, Masa Aktif, Perdana, SMS&Telpon, Listrik/token,
      Voucher Game, Top Up Game, Streaming, TV, Voucher, Aktivasi Voucher,
      E-Money, E-Wallet) — harga TETAP per produk:

        { sku, nama, brand, harga_modal, kategori_asli,
          sub?, deskripsi?, gangguan? }

        sku           <- buyer_sku_code   (WAJIB ada; "" sampai sync pertama)
        nama          <- product_name
        brand         <- brand
        harga_modal   <- price            (harga beli dari Digiflazz)
        kategori_asli <- category         (string apa adanya dari Digiflazz)
        sub           opsional, TAMPILAN saja (mis. "30 Hari"). Setelah sync
                      boleh dikosongkan — `nama` sudah memuat nama lengkap.

        deskripsi     OPSIONAL <- desc    (catatan penting dari penyedia:
                      "proses 1x24 jam", "tidak untuk kartu perdana", dst).
                      Dirender produk-ui.js sebagai section "Catatan produk"
                      di modal konfirmasi — dan HANYA kalau terisi; kalau
                      kosong/absen, section-nya tidak dirender sama sekali
                      (bukan kotak kosong). Boleh tidak ada sama sekali.

        gangguan      OPSIONAL <- turunan `buyer_product_status` &
                      `seller_product_status` dari endpoint CEK HARGA
                      Digiflazz. true = produk sedang tidak bisa dibeli
                      (stok kosong / maintenance penyedia). Kartunya tetap
                      tampil tapi diredupkan + badge "Gangguan", dan
                      kliknya DICEGAT produk-ui.js sebelum sampai ke
                      konfirmasi. Absen = dianggap false.

                      !! NILAINYA SEKARANG MASIH DIATUR MANUAL !! Beberapa
                      produk di file kategori diberi `gangguan: true`
                      sebagai CONTOH DUMMY supaya tampilan & alurnya bisa
                      diuji. Itu BUKAN keadaan sebenarnya dan tidak boleh
                      dianggap sebagai data.

                      TODO fase 2 (sync Cek Harga): nilai ini berhenti
                      ditulis tangan. Backend menarik price-list Digiflazz,
                      menurunkan `gangguan` dari kedua field status di atas
                      (produk dianggap gangguan bila salah satunya tidak
                      aktif), lalu app membacanya lewat api.js. Saat itu
                      SEMUA `gangguan: true` tulis-tangan di file kategori
                      HARUS dihapus — kalau tidak, produk yang sebenarnya
                      sehat akan terus tampil redup. Statusnya juga perlu
                      di-refresh berkala, karena bisa berubah kapan saja
                      di sisi penyedia.

   TODO fase 2 (integrasi Digiflazz): `deskripsi` & `gangguan` sekarang
   ditulis tangan sebagai contoh dummy di file data kategori. Saat sync
   pertama keduanya datang OTOMATIS dari price-list (lewat backend +
   api.js, JANGAN panggil Digiflazz langsung dari front-end) dan nilai
   tulis-tangan di file data dihapus. Bentuk datanya sudah final di sini
   supaya saat itu tiba tidak ada perubahan UI yang perlu dikerjakan.
   Keduanya OPSIONAL: produk lama tanpa kedua field ini tetap sah.

   2) PASCABAYAR (PLN Pascabayar, PDAM, BPJS Kesehatan/Ketenagakerjaan,
      Gas Negara, Pajak, PBB, Multifinance, HP/Internet/TV Pascabayar) —
      TIDAK PUNYA HARGA TETAP:

        { sku, nama, brand, admin_fee, kategori_asli }

        admin_fee     <- admin            (biaya admin per produk, TETAP)
        (tidak ada harga_modal / price)

      Nominal tagihan TIDAK ada di sini: nilainya beda tiap pelanggan tiap
      bulan dan baru diketahui setelah inquiry. Selama inquiry belum aktif,
      nominal diisi MANUAL oleh pengguna dan hidup di state halaman, BUKAN
      di data produk. JANGAN menambahkan harga_modal ke produk pascabayar —
      itu akan menyiratkan tagihan berharga tetap.

   Digiflazz juga mengirim `commission` untuk pascabayar; belum dipakai di
   front-end (urusan margin/pendapatan, bukan tampilan). Tambahkan di sini
   kalau nanti diperlukan.
   =========================================================================== */

(function () {
  "use strict";

  var PRABAYAR = ["sku", "nama", "brand", "harga_modal", "kategori_asli"];
  var PASCABAYAR = ["sku", "nama", "brand", "admin_fee", "kategori_asli"];

  function missing(rec, fields) {
    var out = [];
    for (var i = 0; i < fields.length; i++) {
      if (!rec || !Object.prototype.hasOwnProperty.call(rec, fields[i])) out.push(fields[i]);
    }
    return out;
  }

  /* Validasi ringan saat runtime: melaporkan struktur yang tidak sesuai
     kontrak tanpa menghentikan halaman. Dipanggil controller sebelum render,
     jadi file data yang salah bentuk langsung ketahuan di console. */
  function check(list, kind, ctx) {
    var fields = kind === "pascabayar" ? PASCABAYAR : PRABAYAR;
    var arr = Array.isArray(list) ? list : [list];
    var bad = 0;
    arr.forEach(function (rec, i) {
      var m = missing(rec, fields);
      if (m.length) {
        bad++;
        console.error("produk-schema [" + (ctx || "?") + "] item " + i +
          " kekurangan field: " + m.join(", "), rec);
      }
      if (kind === "pascabayar" && rec && "harga_modal" in rec) {
        bad++;
        console.error("produk-schema [" + (ctx || "?") + "] item " + i +
          ": produk pascabayar TIDAK BOLEH punya harga_modal", rec);
      }
    });
    return bad === 0;
  }

  /* Nama lengkap untuk modal / teks: gabungkan sub kalau ada. */
  function namaLengkap(rec) {
    if (!rec) return "";
    return rec.sub ? rec.nama + " " + rec.sub : rec.nama;
  }

  /* ---- Status gangguan dari baris price-list backend ------------------
     `gangguan: true` bikin kartu produk diredupkan + diberi badge dan
     kliknya dicegat (lihat produk-ui.js). Nilainya TIDAK ditulis tangan
     lagi begitu kategori tersambung ke backend — diturunkan dari baris
     yang dikirim `api-produk.php`.

     Dua bentuk diterima, supaya frontend tidak perlu diubah lagi apa pun
     bentuk yang akhirnya dikirim backend:
       1. `gangguan` sudah jadi (boolean / 1 / "1")  -> dipakai apa adanya
       2. `buyer_product_status` + `seller_product_status` mentah dari
          Digiflazz -> gangguan bila SALAH SATU tidak aktif

     Mengembalikan `false` kalau baris itu tidak memuat informasi status
     sama sekali — TIDAK menebak "sehat", tapi juga tidak menandai produk
     sehat sebagai gangguan hanya karena datanya belum ada. Selama backend
     belum mengirim field ini, tidak akan ada produk yang tampil gangguan.

     CATATAN: per sync pertama, `api-produk.php` BELUM mengirim salah satu
     pun dari field di atas (respons hanya berisi kode_produk, kategori,
     brand, nama, harga_modal). Jadi jalur ini sudah siap tapi belum
     pernah aktif — begitu backend menambahkannya, halaman produk langsung
     menampilkan badge tanpa perubahan kode lagi di sini. */
  function statusGangguan(row) {
    if (!row || typeof row !== "object") return false;
    if (row.gangguan === true || row.gangguan === 1 || row.gangguan === "1") return true;
    if (row.gangguan === false || row.gangguan === 0 || row.gangguan === "0") return false;

    var punyaStatus = ("buyer_product_status" in row) || ("seller_product_status" in row);
    if (!punyaStatus) return false;
    var aktif = function (v) {
      return v === true || v === 1 || v === "1" ||
        String(v).toLowerCase() === "true" || String(v).toLowerCase() === "aktif";
    };
    var buyer = ("buyer_product_status" in row) ? aktif(row.buyer_product_status) : true;
    var seller = ("seller_product_status" in row) ? aktif(row.seller_product_status) : true;
    return !(buyer && seller);
  }

  window.DikaProduk = {
    FIELDS_PRABAYAR: PRABAYAR,
    FIELDS_PASCABAYAR: PASCABAYAR,
    check: check,
    missing: missing,
    namaLengkap: namaLengkap,
    statusGangguan: statusGangguan,
  };
})();
