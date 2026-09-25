/* ===========================================================================
   DikaPay — api.js
   SATU-SATUNYA tempat `fetch` ke backend DikaPay. Komponen UI / file data
   kategori TIDAK memanggil jaringan langsung — mereka memanggil modul ini.

     window.DikaApi = {
       BASE                        // origin backend
       TTL_MS                      // masa berlaku cache (5 menit)
       katalog(jenis)              // -> Promise<Array>  SEMUA produk `jenis`
       kategori(jenis, nama)       // -> Promise<Array>  sudah disaring per kategori
       bacaCache(jenis)            // -> Array | null    SINKRON, tanpa jaringan
       bersihkanCache(jenis?)      // buang cache (dipakai tombol "Coba Lagi")
       unggahFotoProfil(deviceToken, base64) // -> Promise<string fotoUrl>
       transaksiProduk(deviceToken, {ref_id,kode_produk,tujuan,pin})
                                   // -> Promise<{status,transaksiId,kategori,nominal,saldoBaru}>
       riwayat(deviceToken, page, limit)  // -> Promise<{data,total,page,limit,totalHalaman}>
                                    //   dipakai data.js untuk mengisi DATA.TX (Riwayat & Statistik)
     }

   ======================= KENAPA SATU PINTU, BUKAN PER HALAMAN =============
   Endpoint `api-produk.php?jenis=prabayar` mengembalikan SATU array berisi
   SELURUH kategori prabayar sekaligus (~8 ribu produk, ±1,1 MB) — Pulsa,
   Data, Games, Voucher, dst tercampur, dipisah lewat field `kategori`.
   Kalau tiap halaman kategori memanggil `fetch` sendiri-sendiri, pindah
   dari Pulsa ke Paket Data berarti mengunduh 1,1 MB yang SAMA dua kali.
   Dengan satu pintu + cache bersama, unduhan itu terjadi sekali dan
   dipakai ulang oleh semua halaman prabayar selama cache masih berlaku.

   ============================== ATURAN CACHE ==============================
   Dua lapis, keduanya sengaja berumur pendek:
     1. MEMORI (per dokumen)   — instan, hilang saat pindah halaman.
     2. sessionStorage (per tab) — bertahan lintas halaman, kedaluwarsa
        setelah TTL_MS. sessionStorage, BUKAN localStorage: harga produk
        tidak boleh "menempel" berhari-hari di perangkat member; menutup
        tab = mulai bersih.
   Gagal menulis cache (kuota penuh / storage dimatikan) TIDAK PERNAH
   menggagalkan permintaan — cache itu percepatan, bukan syarat.

   Permintaan yang sedang berjalan DIBAGI PAKAI (`inflight`): kalau dua
   pemanggil meminta jenis yang sama sebelum yang pertama selesai, keduanya
   menunggu Promise yang sama, bukan menembak endpoint dua kali.

   TODO fase 3: endpoint transaksi (`POST /api/transactions`) juga masuk
   ke file ini — `payment-flow.js` menyambungnya lewat `setPenentuHasil()`,
   bukan dengan memanggil fetch sendiri.
   =========================================================================== */

(function () {
  "use strict";

  var BASE = "https://dikapayofficial.my.id";
  var TTL_MS = 5 * 60 * 1000;          /* 5 menit */
  var TIMEOUT_MS = 20000;              /* jaringan seluler lambat tetap kebagian waktu */
  var CACHE_PREFIX = "dikapay:katalog:";

  var memori = {};                      /* jenis -> { ts, data } */
  var inflight = {};                    /* jenis -> Promise */

  /* ===================== PESAN GAGAL — JANGAN ASAL MENYALAHKAN KONEKSI ====
     Pesan yang SAMPAI KE MEMBER, bukan pesan teknis. Detail teknisnya
     tetap dicatat ke console lewat console.error di pemanggilnya.

     BUG YANG DIPERBAIKI: dulu SETIAP penolakan `fetch` — apa pun sebabnya —
     memakai satu pesan yang menyuruh member mengecek jaringannya. Padahal
     `fetch` juga menolak saat respons datang TANPA header CORS (halaman
     error dari lapisan web server shared hosting tidak melewati PHP yang
     menambahkan `Access-Control-Allow-Origin`), saat koneksi diputus di
     tengah transfer, dan saat WebView berpindah Wi-Fi <-> data seluler.
     Di semua kasus itu internet member BAIK-BAIK SAJA, tapi dia disuruh
     memperbaiki sesuatu yang tidak rusak — dan penyebab aslinya tidak
     pernah ketahuan.

     Sekarang koneksi hanya disalahkan kalau perangkat MEMANG melaporkan
     dirinya offline (`navigator.onLine === false`). Selebihnya pesannya
     netral dan jujur: "gagal terhubung", tanpa menuding. */
  var PESAN = {
    offline: "Perangkatmu sedang tidak terhubung ke internet. Nyalakan data/Wi-Fi lalu coba lagi, ya.",
    jaringan: "Gagal terhubung ke server DikaPay. Ini biasanya sebentar — coba lagi, ya.",
    lambat: "Server-nya lama merespons. Coba lagi sebentar lagi, ya.",
    sibuk: "Server sedang sibuk. Tunggu sebentar lalu coba lagi, ya.",
    server: "Server sedang bermasalah. Kami sedang memperbaikinya — coba lagi nanti, ya.",
    bentuk: "Data produk yang diterima tidak sesuai. Coba lagi, ya.",
  };

  /* SATU tempat menerjemahkan kegagalan transport jadi pesan member.
     Sebelumnya logika catch yang sama disalin di ambilJaringan(),
     fetchJson(), fetchJsonStatus() dan postAuthJson() — empat salinan yang
     bisa berbeda pendapat tanpa ada yang gagal. */
  function galatTransport(err, timeout, sebabDasar) {
    if (err && err.pesanMember) return err;                 /* sudah ramah */
    var e;
    if (timeout || (err && err.name === "AbortError")) {
      e = galat(PESAN.lambat, "timeout " + TIMEOUT_MS + "ms");
    } else {
      var offline = false;
      try { offline = navigator.onLine === false; } catch (x) {}
      e = galat(offline ? PESAN.offline : PESAN.jaringan,
        (sebabDasar ? sebabDasar + ": " : "") + ((err && err.message) || "fetch gagal"));
      /* Perangkat yang jelas-jelas offline tidak akan sembuh dalam 2 detik;
         mengulanginya cuma menunda pesan yang sudah pasti. */
      if (offline) { e.ulangi = false; return e; }
    }
    e.ulangi = true;
    return e;
  }

  /* HTTP 429 / 503 = "sibuk", bukan "rusak" dan bukan salah koneksi.
     Shared hosting memakai keduanya untuk pembatasan laju. */
  function galatStatus(status) {
    var e;
    if (status === 429 || status === 503) e = galat(PESAN.sibuk, "http " + status);
    else e = galat(PESAN.server, "http " + status);
    /* HANYA 429 & 5xx yang bisa sembuh sendiri. 4xx lain (404 salah alamat,
       401 sesi mati, 400 parameter salah) akan menjawab sama persis berapa
       kali pun diulang — mengulanginya cuma membuat member menunggu 2 detik
       lebih lama untuk pesan yang sama. */
    e.ulangi = status === 429 || status >= 500;
    return e;
  }

  /* Keputusan ulang dibaca dari FLAG di objek galat, bukan ditebak dari
     teks pesannya. Mencocokkan string pesan berarti mengubah kalimat untuk
     member diam-diam mengubah perilaku jaringan — persis jenis keterikatan
     tersembunyi yang bikin bug sulit dilacak. */
  function bolehUlang(err) {
    return !!(err && err.ulangi === true);
  }

  /* Coba ulang dengan jeda bertambah (backoff). Kegagalan SESAAT — satu
     paket hilang, koneksi diputus di tengah, host sedang antre — dulu
     langsung tampil ke member sebagai kegagalan total; ini yang membuat
     "Gagal memuat produk" muncul padahal sekali coba lagi berhasil.
     Dua percobaan tambahan saja: lebih dari itu, member menunggu terlalu
     lama tanpa tahu apa yang sedang terjadi. */
  var JEDA_ULANG = [600, 1600];

  function denganUlang(buat, label) {
    function coba(sisa, jedaKe) {
      return buat().catch(function (err) {
        if (sisa <= 0 || !bolehUlang(err)) throw err;
        var jeda = JEDA_ULANG[jedaKe] || 1600;
        console.warn("api: " + label + " gagal (" + (err.sebab || err.message) +
          ") — coba lagi dalam " + jeda + "ms, sisa " + sisa + "x");
        return new Promise(function (res) { setTimeout(res, jeda); })
          .then(function () { return coba(sisa - 1, jedaKe + 1); });
      });
    }
    return coba(JEDA_ULANG.length, 0);
  }

  function kunciCache(jenis) { return CACHE_PREFIX + jenis; }

  function bacaCache(jenis) {
    var m = memori[jenis];
    if (m && (Date.now() - m.ts) < TTL_MS) return m.data;

    try {
      var raw = sessionStorage.getItem(kunciCache(jenis));
      if (!raw) return null;
      var v = JSON.parse(raw);
      if (!v || typeof v.ts !== "number" || !Array.isArray(v.data)) return null;
      if ((Date.now() - v.ts) >= TTL_MS) {
        sessionStorage.removeItem(kunciCache(jenis));   /* kedaluwarsa -> bersihkan */
        return null;
      }
      memori[jenis] = { ts: v.ts, data: v.data };       /* naikkan ke memori */
      return v.data;
    } catch (e) {
      /* Storage dimatikan / JSON rusak — bukan alasan untuk gagal. */
      console.warn("api: cache tidak terbaca:", e);
      return null;
    }
  }

  function tulisCache(jenis, data) {
    var ts = Date.now();
    memori[jenis] = { ts: ts, data: data };
    try {
      sessionStorage.setItem(kunciCache(jenis), JSON.stringify({ ts: ts, data: data }));
    } catch (e) {
      /* Kuota penuh itu wajar untuk payload ±1 MB di sebagian WebView —
         cukup dicatat, permintaannya sendiri tetap berhasil. */
      console.warn("api: cache tidak bisa disimpan (permintaan tetap berhasil):", e);
    }
  }

  function bersihkanCache(jenis) {
    if (jenis) {
      delete memori[jenis];
      try { sessionStorage.removeItem(kunciCache(jenis)); } catch (e) {}
      return;
    }
    memori = {};
    try {
      Object.keys(sessionStorage).forEach(function (k) {
        if (k.indexOf(CACHE_PREFIX) === 0) sessionStorage.removeItem(k);
      });
    } catch (e) {}
  }

  function galat(pesan, sebab) {
    var e = new Error(pesan);
    e.pesanMember = pesan;      /* dipakai UI apa adanya */
    e.sebab = sebab || "";      /* untuk console/log, bukan untuk member */
    return e;
  }

  function ambilJaringan(jenis) {
    var url = BASE + "/api-produk.php?jenis=" + encodeURIComponent(jenis);
    var ctrl = null;
    var timer = 0;
    var timeout = false;

    try {
      ctrl = new AbortController();
      timer = window.setTimeout(function () {
        timeout = true;
        try { ctrl.abort(); } catch (e) {}
      }, TIMEOUT_MS);
    } catch (e) { ctrl = null; }

    return fetch(url, ctrl
      ? { headers: { Accept: "application/json" }, signal: ctrl.signal }
      : { headers: { Accept: "application/json" } })
      .then(function (r) {
        if (!r.ok) throw galatStatus(r.status);
        return r.json();
      })
      .then(function (json) {
        if (timer) { window.clearTimeout(timer); timer = 0; }
        /* Backend menandai kegagalannya sendiri lewat `ok:false` + `error`
           (mis. parameter salah) — itu BUKAN sukses walau HTTP-nya 200. */
        if (!json || json.ok !== true || !Array.isArray(json.data)) {
          throw galat(PESAN.bentuk, (json && json.error) || "bentuk respons tidak dikenal");
        }
        return json.data;
      })
      .catch(function (err) {
        if (timer) { window.clearTimeout(timer); timer = 0; }
        throw galatTransport(err, timeout, "katalog " + jenis);
      });
  }

  /* `paksa: true` melewati cache (dipakai tombol "Coba Lagi" supaya
     member tidak dikembalikan ke data basi yang sama). */
  function katalog(jenis, paksa) {
    jenis = jenis || "prabayar";

    if (!paksa) {
      var cached = bacaCache(jenis);
      if (cached) return Promise.resolve(cached);
    }
    if (inflight[jenis]) return inflight[jenis];

    /* Katalog dibungkus percobaan ulang: payloadnya paling besar (±1,4 MB)
       jadi paling rentan putus di tengah, dan inilah permintaan yang
       kegagalannya langsung terlihat member sebagai "Gagal memuat produk". */
    var p = denganUlang(function () { return ambilJaringan(jenis); }, "katalog " + jenis)
      .then(function (data) {
        tulisCache(jenis, data);
        delete inflight[jenis];
        return data;
      })
      .catch(function (err) {
        delete inflight[jenis];
        throw err;
      });

    inflight[jenis] = p;
    return p;
  }

  /* Penyaring kategori ditaruh di sini (bukan disalin di tiap file data)
     supaya 28 kategori nanti cukup memanggil satu baris yang sama.
     Perbandingannya case-insensitive + trim: nama kategori datang dari
     price-list penyedia, penulisannya bisa berubah sewaktu-waktu. */
  function kategori(jenis, nama, paksa) {
    var target = String(nama || "").trim().toLowerCase();
    return katalog(jenis, paksa).then(function (data) {
      return data.filter(function (p) {
        return p && String(p.kategori || "").trim().toLowerCase() === target;
      });
    });
  }

  /* ======================= INQUIRY (cek nama / cek tagihan) ==============
     Dua endpoint berbeda di backend proxy `dikapayofficial.my.id`. App
     TIDAK pernah memanggil Digiflazz langsung — backend yang memegang
     kredensial & signature MD5.

       inquiryPln(customer_no)
         GET  /digiflazz.php?action=inquiry-pln&customer_no=XXXX
         -> Promise<data>   data = { status, rc, customer_no, name?,
                                     meter_no?, subscriber_id?, segment_power?,
                                     message? }
         Cek NAMA pelanggan PLN Prabayar sebelum beli token.

       inquiryPasca(buyer_sku_code, customer_no)
         POST /inquiry-pasca.php   body JSON { buyer_sku_code, customer_no }
         -> Promise<{ ref_id, ...data }>   data = { status, rc, customer_no,
             buyer_sku_code, customer_name?, admin?, selling_price?, price?,
             desc?, sn?, message? }
         Cek TAGIHAN pascabayar (SEMUA kategori) — hasil berisi ref_id asli
         + rincian tagihan dari Digiflazz.

     Bentuk galat SAMA dengan katalog(): Error ber-`pesanMember` (untuk UI)
     + `sebab` (untuk console). CATATAN: `status: "Gagal"` + `rc` dari
     Digiflazz BUKAN error jaringan — itu dikembalikan apa adanya sebagai
     resolve; pemanggil (listrik.js / manual-page.js) yang memutuskan cara
     menampilkannya (lewat DikaRC). Yang di-reject hanya kegagalan
     transport / `ok:false` dari proxy. TIDAK di-cache — status pelanggan
     & tagihan harus selalu segar. */

  function fetchJson(url, opts) {
    var ctrl = null, timer = 0, timeout = false;
    try {
      ctrl = new AbortController();
      timer = window.setTimeout(function () { timeout = true; try { ctrl.abort(); } catch (e) {} }, TIMEOUT_MS);
    } catch (e) { ctrl = null; }
    var o = opts || {};
    o.headers = o.headers || {};
    o.headers.Accept = "application/json";
    if (ctrl) o.signal = ctrl.signal;
    return fetch(url, o)
      .then(function (r) {
        if (timer) { window.clearTimeout(timer); timer = 0; }
        if (!r.ok) throw galatStatus(r.status);
        return r.json();
      })
      .catch(function (err) {
        if (timer) { window.clearTimeout(timer); timer = 0; }
        throw galatTransport(err, timeout, url);
      });
  }

  function inquiryPln(customerNo) {
    var cn = String(customerNo || "").replace(/\s+/g, "");
    if (!cn) return Promise.reject(galat("Nomor meter belum diisi.", "customer_no kosong"));
    var url = BASE + "/digiflazz.php?action=inquiry-pln&customer_no=" + encodeURIComponent(cn);
    return fetchJson(url, { method: "GET" }).then(function (json) {
      if (!json || json.ok !== true || !json.data) {
        throw galat("Cek nama pelanggan belum bisa dilakukan sekarang. Coba lagi, ya.",
          (json && json.error) || "bentuk respons inquiry-pln tidak dikenal");
      }
      return json.data;
    });
  }

  function inquiryPasca(sku, customerNo) {
    var s = String(sku || "").trim();
    var cn = String(customerNo || "").replace(/\s+/g, "");
    if (!s || !cn) {
      return Promise.reject(galat("Data belum lengkap untuk cek tagihan.",
        "buyer_sku_code / customer_no kosong"));
    }
    var url = BASE + "/inquiry-pasca.php";
    /* Body JSON string TANPA header Content-Type: application/json.
       Backend membaca php://input apa adanya (json_decode), jadi tipe
       konten tidak penting untuknya — TAPI "application/json" memicu
       CORS preflight (OPTIONS) tiap panggilan. Dengan body string biasa
       browser memakai "text/plain" (CORS-safelisted) -> tanpa preflight,
       satu request saja, dan tetap jalan dari WebView Capacitor
       (origin https://localhost) maupun browser. Sudah diuji: endpoint
       menerima body ini apa adanya. */
    return fetchJson(url, {
      method: "POST",
      body: JSON.stringify({ buyer_sku_code: s, customer_no: cn }),
    }).then(function (json) {
      if (!json || json.ok !== true || !json.data) {
        throw galat("Cek tagihan belum bisa dilakukan sekarang. Coba lagi, ya.",
          (json && json.error) || "bentuk respons inquiry-pasca tidak dikenal");
      }
      var d = json.data;
      d.ref_id = d.ref_id || json.ref_id || "";
      return d;
    });
  }

  /* ======================= FOTO PROFIL — backend LIVE ====================
       POST /api-profil-foto.php
       header : Authorization: Bearer <device_token>, Content-Type: application/json
       body   : { foto_base64: "data:image/jpeg;base64,..." }
       sukses : { ok:true, foto_url:"https://.../uploads/profil/xxx.jpg" }

     BEDA dari POST lain di file ini (inquiryPasca/daftar/masuk/transfer)
     yang SENGAJA tanpa Content-Type supaya tidak memicu preflight CORS:
     endpoint ini MEMANG mensyaratkan `application/json`, jadi preflight
     OPTIONS di sini tidak bisa dihindari dan memang tidak apa-apa —
     unggah foto jarang terjadi (bukan tiap ketukan seperti cek tagihan).

     Ukuran & tipe TIDAK divalidasi di sini: itu urusan pemanggil yang
     memegang File-nya (lihat profil-foto.js), supaya member dapat pesan
     yang jelas SEBELUM base64 sebesar 2 MB dikirim sia-sia. */
  /* ============ PANEL DEBUG DALAM APLIKASI (tanpa USB/adb) =================
     Simpan SATU snapshot percobaan upload terakhir ke localStorage supaya
     `debug-panel.js` (dibuka dari Akun > Tentang DikaPay > tekan lama versi)
     bisa menampilkannya sebagai teks biasa untuk di-screenshot member —
     tanpa perlu chrome://inspect. Field ini TIDAK sensitif (tidak ada PIN
     atau device_token), best-effort (tidak pernah menggagalkan upload kalau
     localStorage penuh/mati). `profil-foto.js` menambahkan hasil ujiMuat
     ke record yang SAMA sesudah fungsi ini selesai. */
  var DEBUG_FOTO_KEY = "dikapay:debug:foto";
  function catatDebugFoto(o) {
    try {
      var rec = { waktu: Date.now() };
      for (var k in o) rec[k] = o[k];
      localStorage.setItem(DEBUG_FOTO_KEY, JSON.stringify(rec));
    } catch (e) { /* panel debug tidak boleh menggagalkan upload sungguhan */ }
  }

  function unggahFotoProfil(deviceToken, fotoBase64) {
    var token = String(deviceToken == null ? "" : deviceToken).trim();
    if (!token) return Promise.reject(galat("Sesi kamu belum siap. Coba buka ulang aplikasinya, ya.", "device_token kosong"));
    var data = String(fotoBase64 || "");
    if (!data) return Promise.reject(galat("Fotonya belum terbaca. Coba pilih lagi, ya.", "foto_base64 kosong"));

    var endpoint = BASE + "/api-profil-foto.php";
    var tipeGambar = (/^data:([^;]+)/.exec(data) || [])[1] || "?";

    return fetchJsonStatus(endpoint, {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ foto_base64: data }),
    }).then(function (res) {
      var j = res.json;
      var bodyMentah = (function () {
        try { return JSON.stringify(j); }
        catch (e) { return String(j); }
      })();
      /* ============ LOG MENTAH: status + BODY apa adanya ================
         Unggah foto "berhasil tapi fotonya tidak berubah" hampir selalu
         berarti bentuk responsnya BUKAN yang didokumentasikan di atas —
         dan itu mustahil dilihat tanpa mencetak body aslinya. Dicetak
         SEBELUM diperiksa, jadi tetap terlihat walau nanti dilempar. */
      console.info("[api] api-profil-foto HTTP " + res.status + " | BODY MENTAH:", bodyMentah);

      if (res.status === 200 && j && j.ok === true && j.foto_url) {
        console.info("[api] foto_url dari server:", String(j.foto_url));
        catatDebugFoto({
          endpoint: endpoint, tipeGambar: tipeGambar, httpStatus: res.status,
          bodyMentah: bodyMentah, fieldDipakai: "foto_url", kontrakCocok: true,
          fotoUrlDiterima: String(j.foto_url), errorPesan: null,
        });
        return String(j.foto_url);
      }

      /* ============ NAMA FIELD LAIN: diterima, TAPI diteriakkan ==========
         Kontrak yang disepakati adalah `foto_url`. Kalau server ternyata
         memakai nama lain, menolaknya mentah-mentah membuat member melihat
         "gagal" padahal fotonya sudah tersimpan di server. Jadi diterima,
         tapi dicatat sebagai KESALAHAN supaya ketahuan & diperbaiki di
         backend — bukan dibiarkan lewat diam-diam jadi kontrak bayangan. */
      if (res.status === 200 && j && j.ok === true) {
        var ALTERNATIF = ["fotoUrl", "url", "foto", "path", "file_url", "image_url"];
        for (var i = 0; i < ALTERNATIF.length; i++) {
          if (j[ALTERNATIF[i]]) {
            console.error("[api] KONTRAK TIDAK COCOK: server menjawab ok:true tapi TANPA " +
              "`foto_url`; yang ada `" + ALTERNATIF[i] + "`. Dipakai apa adanya kali ini, " +
              "TAPI backend sebaiknya diseragamkan ke `foto_url` (lihat dokumentasi " +
              "unggahFotoProfil di api.js).");
            catatDebugFoto({
              endpoint: endpoint, tipeGambar: tipeGambar, httpStatus: res.status,
              bodyMentah: bodyMentah, fieldDipakai: ALTERNATIF[i], kontrakCocok: false,
              fotoUrlDiterima: String(j[ALTERNATIF[i]]), errorPesan: null,
            });
            return String(j[ALTERNATIF[i]]);
          }
        }
        console.error("[api] server menjawab ok:true TAPI tidak ada satu pun field URL foto. " +
          "Field yang ada:", Object.keys(j).join(", "));
        catatDebugFoto({
          endpoint: endpoint, tipeGambar: tipeGambar, httpStatus: res.status,
          bodyMentah: bodyMentah, fieldDipakai: null, kontrakCocok: false,
          fotoUrlDiterima: null,
          errorPesan: "ok:true tapi tidak ada field URL foto apa pun (field ada: " +
            Object.keys(j).join(", ") + ")",
        });
      }

      var e = galat((j && j.error) || PESAN.server, "api-profil-foto http " + res.status);
      if (res.status === 401) e.kode = "sesi-tidak-valid";
      console.error("[api] unggah foto DITOLAK:", e.sebab, "| pesan ke member:", e.pesanMember);
      catatDebugFoto({
        endpoint: endpoint, tipeGambar: tipeGambar, httpStatus: res.status,
        bodyMentah: bodyMentah, fieldDipakai: null, kontrakCocok: false,
        fotoUrlDiterima: null, errorPesan: e.sebab || e.pesanMember,
      });
      throw e;
    }, function (errTransport) {
      /* Galat TRANSPORT (jaringan mati, timeout, dst) — tidak ada `res` sama
         sekali. Tetap dicatat: "tidak ada respons" itu sendiri informasi
         penting untuk panel debug, beda dari "server menjawab tapi salah". */
      catatDebugFoto({
        endpoint: endpoint, tipeGambar: tipeGambar, httpStatus: null,
        bodyMentah: null, fieldDipakai: null, kontrakCocok: false,
        fotoUrlDiterima: null,
        errorPesan: "Galat transport (bukan respons server): " +
          ((errTransport && (errTransport.sebab || errTransport.message)) || String(errTransport)),
      });
      throw errTransport;
    });
  }

  /* Dipanggil profil-foto.js sesudah ujiMuat() selesai — MENAMBAHKAN hasilnya
     ke record yang sama (bukan menimpa seluruhnya), supaya panel debug bisa
     menjawab "servernya OK, tapi gambarnya beneran bisa dimuat browser atau
     tidak". Diekspos di window.DikaApi supaya profil-foto.js tidak perlu
     tahu bentuk localStorage-nya sendiri (tetap satu pintu). */
  function catatDebugFotoUjiMuat(berhasil, pesan) {
    try {
      var raw = localStorage.getItem(DEBUG_FOTO_KEY);
      var rec = raw ? JSON.parse(raw) : {};
      rec.ujiMuatBerhasil = !!berhasil;
      rec.ujiMuatPesan = pesan || null;
      localStorage.setItem(DEBUG_FOTO_KEY, JSON.stringify(rec));
    } catch (e) { /* best-effort */ }
  }

  function notifikasi(phone) {
    var digits = String(phone == null ? "" : phone).replace(/\D/g, "");
    if (!digits) {
      return Promise.reject(galat("Notifikasi belum bisa dimuat.", "nomor HP kosong"));
    }
    var url = BASE + "/api-notifikasi.php?dikapay_id=" + encodeURIComponent(digits);
    return fetchJson(url, { method: "GET" }).then(function (json) {
      if (!json || json.ok !== true || !Array.isArray(json.data)) {
        throw galat("Notifikasi belum bisa dimuat sekarang. Coba lagi, ya.",
          (json && json.error) || "bentuk respons notifikasi tidak dikenal");
      }
      return json.data;
    });
  }

  /* ======================= AUTH — daftar & masuk member ==================
     Backend DikaPay SUDAH LIVE (bukan proxy Digiflazz — ini tabel member
     DikaPay sendiri). App tidak menyimpan token: api-login.php TIDAK
     mengembalikan sesi, hanya data member. "Sesi" di app = flag
     window.DikaAuth + cache dikapay:profile — lihat auth-flow.js.

       daftar(payload)
         POST /api-daftar.php   body JSON { nomor_hp, nama, pin,
             email?, alamat?, tanggal_lahir? (YYYY-MM-DD), jenis_kelamin? }
         sukses (200/201) -> resolve member { id_dikapay, nama, saldo }
         400 { ok:false, error }  -> reject Error{ kode:"validasi", pesanMember:error }
         409 { ok:false, error:"Nomor HP sudah terdaftar" }
                                  -> reject Error{ kode:"terdaftar", pesanMember:error }

       masuk(nomor_hp, pin)
         POST /api-login.php    body JSON { nomor_hp, pin }
         sukses -> resolve member { id_dikapay, nama, email, saldo, status }
         gagal  -> reject Error{ kode:"gagal-login", pesanMember:error }

     Body dikirim string TANPA header Content-Type (text/plain
     CORS-safelisted -> tanpa preflight OPTIONS), pola yang SAMA dengan
     inquiryPasca(). Backend baca php://input apa adanya — sudah diuji.
     Galat transport (jaringan/timeout/HTTP 5xx/respons bukan JSON) ->
     Error ber-pesanMember umum. Galat APLIKASI (ok:false + HTTP 400/409)
     dibedakan lewat `kode` supaya pemanggil bisa mengarahkan member ke
     halaman Masuk saat nomornya sudah terdaftar. TIDAK di-cache. */

  function postAuthJson(path, payload) {
    var url = BASE + "/" + path;
    var ctrl = null, timer = 0, timeout = false;
    try {
      ctrl = new AbortController();
      timer = window.setTimeout(function () {
        timeout = true;
        try { ctrl.abort(); } catch (e) {}
      }, TIMEOUT_MS);
    } catch (e) { ctrl = null; }

    var opts = { method: "POST", body: JSON.stringify(payload), headers: { Accept: "application/json" } };
    if (ctrl) opts.signal = ctrl.signal;

    return fetch(url, opts)
      .then(function (r) {
        if (timer) { window.clearTimeout(timer); timer = 0; }
        return r.json().then(
          function (json) { return { status: r.status, json: json }; },
          function () { throw galat(PESAN.server, "respons bukan JSON (http " + r.status + ")"); }
        );
      })
      .catch(function (err) {
        if (timer) { window.clearTimeout(timer); timer = 0; }
        throw galatTransport(err, timeout, path);
      });
  }

  function daftar(payload) {
    return postAuthJson("api-daftar.php", payload || {}).then(function (res) {
      var j = res.json;
      if (j && j.ok === true && j.member) return j.member;
      var e = galat((j && j.error) || PESAN.server, "api-daftar http " + res.status);
      e.kode = res.status === 409 ? "terdaftar" : "validasi";
      throw e;
    });
  }

  function masuk(nomorHp, pin) {
    return postAuthJson("api-login.php", {
      nomor_hp: String(nomorHp == null ? "" : nomorHp),
      pin: String(pin == null ? "" : pin),
    }).then(function (res) {
      var j = res.json;
      if (j && j.ok === true && j.member) {
        /* api-login.php SEKARANG ikut mengirim "device_token" di level atas
           respons (bukan di dalam `member`) — ditumpangkan ke objek member
           yang di-resolve supaya pemanggil (auth-flow.js, member-sync.js)
           bisa menyimpannya tanpa mengubah bentuk Promise ini. Member lama
           yang belum dapat token dari backend tetap jalan seperti biasa
           (properti ini cuma ada kalau backend mengirimnya). */
        if (j.device_token) j.member.device_token = j.device_token;
        return j.member;
      }
      var e = galat((j && j.error) || PESAN.server, "api-login http " + res.status);
      e.kode = "gagal-login";
      throw e;
    });
  }

  /* ======================= AUTH — masuk/daftar lewat Google ================
     POST /api-google-login.php   body JSON { id_token }
     sukses -> resolve member { id_dikapay, nama, email, saldo, status }
             (id_dikapay ISI-nya nomor HP itu sendiri, pola SAMA dengan masuk())
     404 { ok:false, error }  -> akun Google ini belum terhubung ke member
                                 manapun (belum pernah didaftarkan lewat
                                 google_id_token saat daftar())
     401 { ok:false, error }  -> token Google tidak valid/kedaluwarsa
     gagal  -> reject Error{ pesanMember }, kode:"belum-terhubung" */
  function masukGoogle(idToken) {
    return postAuthJson("api-google-login.php", {
      id_token: String(idToken == null ? "" : idToken),
    }).then(function (res) {
      var j = res.json;
      if (j && j.ok === true && j.member) {
        if (j.device_token) j.member.device_token = j.device_token;
        return j.member;
      }
      var e = galat((j && j.error) || PESAN.server, "api-google-login http " + res.status);
      e.kode = "belum-terhubung";
      throw e;
    });
  }

  /* ======================= AUTH — daftar via Google (member baru) ==========
     Dipakai auth-flow.js saat "Lanjutkan dengan Google" menjawab 404 (akun
     Google ini belum terhubung ke member manapun) DAN nomor HP yang diisi
     memang belum terdaftar. Dua panggilan terpisah, endpoint terpisah:

       kirimOtpEmail(email)
         POST /api-otp-kirim.php   body JSON { email }
         sukses -> resolve(true)  (kodenya dikirim lewat email, TIDAK ikut
                    dalam respons ini — beda dari OTP dummy lama yang
                    menampilkan kodenya langsung di layar)
         gagal  -> reject Error{ pesanMember }

       daftarGoogle(payload)
         POST /api-daftar-google.php   body JSON { email, kode_otp,
             nomor_hp, nama, pin, alamat?, tanggal_lahir?, jenis_kelamin? }
         sukses (200/201) -> resolve member { id_dikapay, nama, saldo }
         400 { ok:false, error }                    -> kode:"validasi"
         409 { ok:false, error }                     -> kode:"terdaftar"
             (nomor_hp sudah dipakai member lain — race condition, jarang)
         400/422 { ok:false, error, kode:"otp-salah"|"otp-kadaluarsa" }
             -> kode DITERUSKAN apa adanya dari backend supaya pemanggil
                bisa mengarahkan member balik ke step OTP (bukan step PIN)

     Body dikirim string TANPA header Content-Type (pola yang sama dengan
     daftar()/masuk()) — text/plain CORS-safelisted, tanpa preflight. */
  function kirimOtpEmail(email) {
    return postAuthJson("api-otp-kirim.php", {
      email: String(email == null ? "" : email).trim(),
    }).then(function (res) {
      var j = res.json;
      if (j && j.ok === true) return true;
      var e = galat((j && j.error) || PESAN.server, "api-otp-kirim http " + res.status);
      e.kode = (j && j.kode) || "kirim-gagal";
      throw e;
    });
  }

  function daftarGoogle(payload) {
    return postAuthJson("api-daftar-google.php", payload || {}).then(function (res) {
      var j = res.json;
      if (j && j.ok === true && j.member) return j.member;
      var e = galat((j && j.error) || PESAN.server, "api-daftar-google http " + res.status);
      e.kode = (j && j.kode) || (res.status === 409 ? "terdaftar" : "validasi");
      throw e;
    });
  }

  /* ======================= AUTH — tautkan akun Google ke member existing ===
     POST /api-google-hubungkan.php
     header : Authorization: Bearer <device_token>  (WAJIB — menentukan
              member mana yang ditautkan; PIN-nya sudah diverifikasi lewat
              masuk() SEBELUM fungsi ini dipanggil, lihat auth-flow.js)
     body   : { id_token }  (diverifikasi ULANG ke Google DI BACKEND — client
              sengaja TIDAK mengirim email mentah, supaya member tidak bisa
              menautkan email Google sembarangan ke akunnya sendiri)
     sukses -> resolve(true)
     401    -> kode:"sesi-tidak-valid" (device_token tidak valid/kedaluwarsa)
     409    -> kode:"sudah-tertaut-lain" (nomor ini sudah tertaut ke akun
              Google LAIN — backend menolak, pemanggil TIDAK BOLEH lanjut
              membuka sesi apa pun) */
  function hubungkanGoogle(deviceToken, idToken) {
    var token = String(deviceToken == null ? "" : deviceToken).trim();
    if (!token) {
      return Promise.reject(galat(
        "Sesi kamu belum siap. Coba keluar lalu masuk lagi, ya.",
        "device_token kosong"));
    }
    return fetchJsonStatus(BASE + "/api-google-hubungkan.php", {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      body: JSON.stringify({ id_token: String(idToken == null ? "" : idToken) }),
    }).then(function (res) {
      var j = res.json;
      if (res.status === 200 && j && j.ok === true) return true;
      var e = galat((j && j.error) || PESAN.server, "api-google-hubungkan http " + res.status);
      if (res.status === 401) e.kode = "sesi-tidak-valid";
      if (res.status === 409) e.kode = "sudah-tertaut-lain";
      throw e;
    });
  }

  /* ======================= STATUS MEMBER (sinkronisasi latar) ============
     GET /api-status.php   header wajib: Authorization: Bearer <device_token>
     Dipakai HANYA oleh member-sync.js untuk polling silent (saldo + banned)
     — lihat file itu untuk titik-titik pemanggilannya. TIDAK di-cache:
     status keanggotaan & saldo harus selalu segar.

       statusMember(deviceToken)
         200 { ok:true, nama, saldo, status:"aktif"|"banned", banned_sampai }
           -> resolve { nama, saldo, status, bannedSampai }
         401 { ok:false, error:"Sesi tidak valid, silakan login ulang" }
           -> reject Error{ kode:"sesi-tidak-valid", pesanMember }
         lainnya (jaringan/timeout/5xx) -> reject Error{ pesanMember } biasa,
           TANPA kode "sesi-tidak-valid" — pemanggil hanya boleh menghapus
           device_token tersimpan kalau backend TEGAS bilang tokennya tidak
           valid (401), bukan kalau sekadar gagal terhubung. */
  function statusMember(deviceToken) {
    var token = String(deviceToken == null ? "" : deviceToken).trim();
    if (!token) return Promise.reject(galat(PESAN.server, "device_token kosong"));
    var url = BASE + "/api-status.php";
    return fetchJsonStatus(url, {
      method: "GET",
      headers: { Authorization: "Bearer " + token },
    }).then(function (res) {
      var j = res.json;
      if (res.status === 200 && j && j.ok === true) {
        return { nama: j.nama, saldo: j.saldo, status: j.status, bannedSampai: j.banned_sampai };
      }
      var e = galat((j && j.error) || PESAN.server, "api-status http " + res.status);
      if (res.status === 401) e.kode = "sesi-tidak-valid";
      throw e;
    });
  }

  /* ======================= RIWAYAT TRANSAKSI — backend LIVE ===============
     GET /api-riwayat.php?page=N&limit=N   header wajib:
     Authorization: Bearer <device_token> — TOKEN PER-AKUN dari
     member-sync.js (lihat DikaMemberSync.getToken()), pola yang SAMA
     dengan statusMember() di atas. Dipakai data.js untuk mengisi
     window.DATA.TX — lihat file itu untuk orkestrasi halaman/retry.
     TIDAK di-cache: riwayat harus selalu segar begitu dibuka.

       riwayat(deviceToken, page, limit)
         200 { ok:true, data:[{id,jenis,kategori,nominal,status,dibuat_pada}],
               total, page, limit, total_halaman }
           -> resolve { data, total, page, limit, totalHalaman }
         401 { ok:false, error:"Sesi tidak valid, silakan login ulang" }
           -> reject Error{ kode:"sesi-tidak-valid", pesanMember }
         lainnya (jaringan/timeout/429/5xx) -> DICOBA ULANG dulu (lihat blok
           retry tepat di bawah ini) sebelum reject Error{ pesanMember }
           biasa — pola penanganan 401 yang SAMA dengan statusMember() —
           jangan menghapus device_token untuk error selain 401 tegas. */
  /* Retry SEKALI/DUA KALI khusus di sini (bukan di fetchJsonStatus bersama)
     — lihat audit "Gagal Terhubung ke Server DikaPay". GET riwayat aman
     diulang (baca saja, tanpa efek samping); reuse `denganUlang()` +
     `galatStatus()` yang SUDAH ADA (sama persis dipakai `katalog()`) supaya
     klasifikasi "transient vs permanen" SATU sumber, bukan disalin ulang.
     SENGAJA TIDAK disentuh: fetchJsonStatus() itu sendiri (dipakai juga
     oleh transfer()/transaksiProduk() — POST yang memindahkan uang; retry
     otomatis di situ berisiko mengirim transaksi dua kali kalau
     permintaan pertama sebenarnya sudah sukses tapi responsnya hilang di
     jalan) dan TIMEOUT_MS (konstanta bersama semua endpoint — audit tidak
     menemukan pola pemanggilan Riwayat yang beda dari endpoint lain,
     jadi menaikkannya di sini berarti menaikkannya untuk semua, tanpa
     dasar yang riwayat-spesifik). */
  function riwayat(deviceToken, page, limit) {
    var token = String(deviceToken == null ? "" : deviceToken).trim();
    if (!token) return Promise.reject(galat(PESAN.server, "device_token kosong"));
    var p = Math.max(1, Math.round(Number(page)) || 1);
    var l = Math.max(1, Math.round(Number(limit)) || 20);
    var url = BASE + "/api-riwayat.php?page=" + p + "&limit=" + l;

    function sekaliMuat() {
      return fetchJsonStatus(url, {
        method: "GET",
        headers: { Authorization: "Bearer " + token },
      }).then(function (res) {
        var j = res.json;
        if (res.status === 200 && j && j.ok === true) {
          return {
            data: Array.isArray(j.data) ? j.data : [],
            total: j.total,
            page: j.page,
            limit: j.limit,
            totalHalaman: j.total_halaman,
          };
        }
        /* galatStatus() sudah menandai 429/5xx sebagai TRANSIENT
           (`.ulangi = true`) — dipakai apa adanya. Pesan ke member tetap
           diutamakan dari backend (`j.error`) kalau ada, kode
           "sesi-tidak-valid" untuk 401 dipertahankan (401 TIDAK ditandai
           `.ulangi` oleh galatStatus(), jadi TIDAK diulang otomatis di
           sini — penyegaran token untuk 401 tetap tugas terpisah
           ambilDenganRetry() di data.js, tidak berubah). */
        var e = galatStatus(res.status);
        if (j && j.error) { e.message = j.error; e.pesanMember = j.error; }
        if (res.status === 401) e.kode = "sesi-tidak-valid";
        throw e;
      });
    }

    return denganUlang(sekaliMuat, "riwayat");
  }

  /* ======================= TRANSFER ANTAR MEMBER — backend LIVE ==========
     Backend DikaPay sendiri (bukan proxy Digiflazz), sama seperti daftar()/
     masuk() di atas. TIDAK di-cache — status "terdaftar sebagai member" dan
     saldo harus selalu segar, beda dengan katalog produk.

       cekMemberTransfer(nomorHp)
         GET  /api-transfer.php?nomor_hp=X
         200 { ok:true, nama }             -> resolve { nama }
         404 { ok:false, error }           -> reject Error{ kode:"tidak-terdaftar", pesanMember }
         Dipakai transfer-member.js untuk validasi REALTIME nomor tujuan
         begitu member selesai mengetik (debounce di pemanggil) — DAN
         dipakai auth-flow.js (verifikasiKeBackend()) untuk mengecek status
         pendaftaran nomor HP di step Masuk/Daftar, SEBELUM sesi ada sama
         sekali. Endpoint ini TIDAK memvalidasi Authorization (diuji
         langsung ke backend: token kosong/ngawur/valid semuanya
         menjawab identik) — jadi `device_token` di sini OPSIONAL, dikirim
         kalau kebetulan sudah ada (mis. dipanggil dari transfer-member.js
         yang sudah login), TAPI TIDAK PERNAH jadi syarat request boleh
         dikirim. BUG yang diperbaiki: dulu ada guard client yang menolak
         memanggil sama sekali kalau device_token kosong ("Sesi kamu belum
         siap...") — cocok untuk transfer-member.js (selalu login), tapi
         menjebak auth-flow.js yang MEMANG belum punya sesi di titik ini
         (member baru saja mengetik nomor HP-nya, belum masuk/daftar).
         JANGAN kembalikan guard itu — kalau backend suatu saat mulai
         menegakkan Authorization untuk endpoint ini, auth-flow.js butuh
         pintu terpisah yang didesain tanpa sesi, bukan guard client di
         fungsi yang dipakai bersama ini.

       transfer(payload)
         POST /api-transfer.php   body JSON { nomor_hp_pengirim, pin,
             nomor_hp_tujuan, nominal }
         sukses -> resolve { saldoBaru, namaTujuan, message }
         gagal  -> reject Error{ pesanMember }
             - PIN salah (belum 3x): pesanMember = "PIN salah. Sisa N percobaan lagi."
             - PIN salah 3x: error.banned = true, error.bannedSampai = banned_sampai
             - lainnya (saldo tidak cukup, dst): pesanMember apa adanya dari backend

     Body POST dikirim string TANPA header Content-Type (pola yang SAMA
     dengan postAuthJson/inquiryPasca) — text/plain CORS-safelisted, tanpa
     preflight OPTIONS. */

  function fetchJsonStatus(url, opts) {
    var o = opts || {};
    var ctrl = null, timer = 0, timeout = false;
    try {
      ctrl = new AbortController();
      timer = window.setTimeout(function () {
        timeout = true;
        try { ctrl.abort(); } catch (e) {}
      }, TIMEOUT_MS);
    } catch (e) { ctrl = null; }
    o.headers = o.headers || {};
    o.headers.Accept = "application/json";
    if (ctrl) o.signal = ctrl.signal;
    return fetch(url, o)
      .then(function (r) {
        if (timer) { window.clearTimeout(timer); timer = 0; }
        return r.json().then(
          function (json) { return { status: r.status, json: json }; },
          function () { return { status: r.status, json: null }; }
        );
      })
      .catch(function (err) {
        if (timer) { window.clearTimeout(timer); timer = 0; }
        throw galatTransport(err, timeout, url);
      });
  }

  /* ======================= TRANSAKSI PRODUK — backend LIVE ==============
       POST /api-transaksi-produk.php
       header : Authorization: Bearer <device_token>
       body   : { ref_id, kode_produk, tujuan, pin }
       sukses : { ok:true, status:"berhasil"|"pending"|"gagal",
                  transaksi_id, kategori, nominal, saldo_baru }

     POLA-nya SAMA dengan transfer(): satu panggilan yang sekaligus
     memverifikasi PIN, memeriksa saldo, dan memutasi saldo di server secara
     atomik. Itu sebabnya `pin` ikut di body — bukan diverifikasi lokal
     lebih dulu lalu dikirim terpisah.

     `ref_id` WAJIB unik per permintaan (aturan Digiflazz) dan dipakai
     server untuk menolak pengiriman ganda. Yang membuatnya: payment-flow.js
     lewat makeTxId().

     CATATAN PENTING: `status: "gagal"` dari server BUKAN kegagalan
     transport — itu hasil transaksi yang sah dan di-RESOLVE apa adanya.
     Yang di-REJECT hanya kegagalan transport atau `ok:false` (PIN salah,
     saldo kurang, banned, produk gangguan). Pemisahan ini yang membuat
     payment-flow bisa membedakan "transaksinya gagal" dari "permintaannya
     tidak sampai". Body POST dikirim string TANPA header Content-Type
     (text/plain CORS-safelisted -> tanpa preflight), pola yang sama dengan
     transfer(). */
  function transaksiProduk(deviceToken, payload) {
    var token = String(deviceToken == null ? "" : deviceToken).trim();
    if (!token) {
      return Promise.reject(galat(
        "Sesi kamu belum siap. Coba keluar lalu masuk lagi, ya.",
        "device_token kosong"));
    }
    var body = payload || {};
    if (!body.ref_id || !body.kode_produk) {
      return Promise.reject(galat(
        "Data transaksi belum lengkap. Coba ulangi dari awal, ya.",
        "ref_id / kode_produk kosong"));
    }
    return fetchJsonStatus(BASE + "/api-transaksi-produk.php", {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      body: JSON.stringify({
        ref_id: String(body.ref_id),
        kode_produk: String(body.kode_produk),
        tujuan: String(body.tujuan == null ? "" : body.tujuan),
        pin: String(body.pin == null ? "" : body.pin),
      }),
    }).then(function (res) {
      var j = res.json;
      if (res.status === 200 && j && j.ok === true) {
        return {
          status: String(j.status || "pending"),
          transaksiId: j.transaksi_id,
          kategori: j.kategori,
          nominal: j.nominal,
          saldoBaru: j.saldo_baru,
          raw: j,
        };
      }
      var e = galat((j && j.error) || PESAN.server,
        "api-transaksi-produk http " + res.status);
      /* Penanda yang dipakai payment-flow untuk memilih perlakuan:
         banned -> popup banned + logout; PIN salah -> biarkan member
         mengulang di sheet PIN yang sama; sisanya -> tutup sheet. */
      if (j && j.banned) { e.banned = true; e.bannedSampai = j.banned_sampai; }
      if (res.status === 401) e.kode = "sesi-tidak-valid";
      throw e;
    });
  }

  function cekMemberTransfer(nomorHp) {
    var digits = String(nomorHp == null ? "" : nomorHp).replace(/\D/g, "");
    if (!digits) return Promise.reject(galat("Nomor HP belum diisi.", "nomor_hp kosong"));
    /* device_token OPSIONAL di sini — lihat catatan di atas fungsi ini.
       Dikirim kalau ada (transfer-member.js, sudah login), TAPI kosongnya
       BUKAN alasan untuk menolak request (auth-flow.js, belum ada sesi). */
    var token = window.DikaMemberSync && typeof DikaMemberSync.getToken === "function"
      ? DikaMemberSync.getToken() : "";
    var url = BASE + "/api-transfer.php?nomor_hp=" + encodeURIComponent(digits);
    var opts = { method: "GET" };
    if (token) opts.headers = { Authorization: "Bearer " + token };
    return fetchJsonStatus(url, opts).then(function (res) {
      var j = res.json;
      if (res.status === 200 && j && j.ok === true) return { nama: j.nama || "" };
      if (res.status === 401) {
        var e = galat((j && j.error) || PESAN.server, "api-transfer GET http " + res.status);
        e.kode = "sesi-tidak-valid";
        throw e;
      }
      if (res.status === 404) {
        var e = galat((j && j.error) || "Nomor tidak terdaftar sebagai member DikaPay.", "api-transfer GET 404");
        e.kode = "tidak-terdaftar";
        throw e;
      }
      throw galat((j && j.error) || PESAN.server, "api-transfer GET http " + res.status);
    });
  }

  function transfer(payload) {
    var token = window.DikaMemberSync && typeof DikaMemberSync.getToken === "function"
      ? DikaMemberSync.getToken() : "";
    if (!token) {
      return Promise.reject(galat(
        "Sesi kamu belum siap. Coba keluar lalu masuk lagi, ya.",
        "device_token kosong"));
    }
    var url = BASE + "/api-transfer.php";
    var body = payload || {};
    return fetchJsonStatus(url, {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      body: JSON.stringify(body),
    }).then(function (res) {
      var j = res.json;
      if (j && j.ok === true) {
        return { saldoBaru: j.saldo_baru, namaTujuan: j.nama_tujuan, message: j.message };
      }
      var e = galat((j && j.error) || PESAN.server, "api-transfer POST http " + res.status);
      if (res.status === 401) e.kode = "sesi-tidak-valid";
      if (j && j.banned) { e.banned = true; e.bannedSampai = j.banned_sampai; }
      throw e;
    });
  }

  window.DikaApi = {
    BASE: BASE,
    TTL_MS: TTL_MS,
    katalog: katalog,
    kategori: kategori,
    bacaCache: bacaCache,
    bersihkanCache: bersihkanCache,
    inquiryPln: inquiryPln,
    inquiryPasca: inquiryPasca,
    notifikasi: notifikasi,
    unggahFotoProfil: unggahFotoProfil,
    catatDebugFotoUjiMuat: catatDebugFotoUjiMuat,
    daftar: daftar,
    masuk: masuk,
    masukGoogle: masukGoogle,
    kirimOtpEmail: kirimOtpEmail,
    daftarGoogle: daftarGoogle,
    hubungkanGoogle: hubungkanGoogle,
    statusMember: statusMember,
    riwayat: riwayat,
    transaksiProduk: transaksiProduk,
    cekMemberTransfer: cekMemberTransfer,
    transfer: transfer,
  };
})();
