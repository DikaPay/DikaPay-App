/* ===========================================================================
   DikaPay — produk-ui.js
   Primitif UI BERSAMA untuk semua halaman produk. Lapisan paling bawah:
   tidak tahu apa-apa soal operator/PLN, hanya soal tampilan.

     window.DikaProdukUI = {
       RM,                                   // prefers-reduced-motion
       fmtRupiah(v), fmtNumber(v),
       brandVars(hex, "op"|"bd")              // warna brand aman di tema terang
       createGrid({ grid, section })          -> { render(items, key), clear(), onPick(fn) }
       createModal({ overlay, rows, cancel, pay, payTitle, payLine, note? })
                                              -> { show(rows, ctx), hide(fromPop), isOpen() }
       createWarn(el|id)                      -> { show(), hide(), toggle(b), exists() }
       createStatus({ anchor })               -> { memuat(n), gagal(pesan, onRetry),
                                                   kosong(pesan), sembunyi(), keadaan() }
       createChoice({ anchor })               -> { render(opsi, o), pilih(), set(id),
                                                   onPick(fn), sembunyi() }   // pemilih sub-brand
       createFilterHarga({ anchor, min })     -> { render(items), terapkan(items),
                                                   aktif(), onPick(fn), kunciRender() }
       createPicker()                         -> { open(items, opts), close(), onPick(fn), exists() }
       showGangguan(item)                     // modal "produk sedang gangguan"
       wireBack(appEl, btnEl)
     }

   Dua perilaku produk yang hidup di lapisan ini supaya berlaku SERAGAM
   di semua halaman produk, bukan disalin per halaman:
     - `deskripsi` produk  -> section catatan di modal konfirmasi
                              (tidak dirender sama sekali kalau kosong)
     - `gangguan: true`    -> kartu diredupkan + badge, klik dicegat dan
                              diganti modal penjelasan (tidak pernah
                              sampai ke konfirmasi pembelian)

   Dipakai oleh produk-page.js (alur auto-detect operator: pulsa, paket data)
   dan listrik.js (alur cek nomor meter). Di-link PALING AWAL di antara
   modul produk.
   =========================================================================== */

(function () {
  "use strict";

  var RM = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function fmtRupiah(value) {
    var n = Number(value);
    if (!isFinite(n)) return "Rp0";
    return "Rp" + Math.round(n).toLocaleString("id-ID");
  }

  function fmtNumber(value) {
    var n = Number(value);
    if (!isFinite(n)) return "0";
    return Math.round(n).toLocaleString("id-ID");
  }

  /* ---- Warna brand yang tetap terbaca di tema terang ----------------
     Warna brand dipakai SEKALIGUS sebagai warna teks dan (12% alpha)
     sebagai latar chip-nya. Akibatnya warna yang sangat terang
     (#44D62C Razer, #F2A900 PUBG) lenyap di latar terang — kontras
     bisa turun sampai 1.04:1, praktis tidak terbaca.

     brandVars() mempertahankan hue & saturasi brand dan hanya
     MENGGELAPKAN lightness-nya secukupnya sampai kontras terhadap latar
     chip mencapai TARGET. Hasilnya ditulis inline sebagai custom
     property (--op / --op-ink / --op-bg) dan dipakai langsung oleh
     produk.css.

     Aplikasi hanya punya SATU tema (terang) — tidak ada lagi varian
     gelap di sini. Kalau suatu saat tema gelap dihidupkan lagi, warna
     brand perlu varian keduanya (lihat riwayat file ini).

     JANGAN "memperbaiki" kontras dengan mengganti warna di file data —
     warna brand tetap satu sumber (operator-detect.js untuk operator,
     PROVIDERS[].color untuk Tipe B). Penyesuaian TAMPILAN terjadi di sini. */

  var TARGET = 4.5;
  /* Latar TERBURUK (ikut token style.css): latar paling gelap yang
     mungkin ada di belakang chip, yaitu --bg halaman. */
  var SURFACE = [244, 246, 251];
  var INK_DARK = [11, 36, 71];   /* --navy-900, teks gelap di atas warna terang */

  function hexRgb(h) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(h || "").trim());
    if (!m) return null;
    var n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbHex(c) {
    return "#" + c.map(function (v) {
      return ("0" + Math.max(0, Math.min(255, Math.round(v))).toString(16)).slice(-2);
    }).join("");
  }
  function lum(c) {
    var a = c.map(function (v) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  }
  function contrast(a, b) {
    var x = lum(a), y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  /* fg dengan alpha di atas bg (latar chip = warna brand 12%) */
  function mix(fg, alpha, bg) {
    return fg.map(function (v, i) { return v * alpha + bg[i] * (1 - alpha); });
  }

  function rgbHsl(c) {
    var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    var h = 0, s = 0, l = (mx + mn) / 2;
    if (d) {
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0));
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    return [h, s, l];
  }
  function hslRgb(h, s, l) {
    if (!s) { var v = l * 255; return [v, v, v]; }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    function t(x) {
      if (x < 0) x += 1; if (x > 1) x -= 1;
      if (x < 1 / 6) return p + (q - p) * 6 * x;
      if (x < 1 / 2) return q;
      if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
      return p;
    }
    return [t(h + 1 / 3) * 255, t(h) * 255, t(h - 1 / 3) * 255];
  }

  /* Gelapkan lightness sampai kontras >= TARGET. Berhenti di langkah
     pertama yang lolos, jadi warna tetap sedekat mungkin ke aslinya. */
  function adjust(rgb, bg) {
    if (contrast(rgb, bg) >= TARGET) return rgb;
    var hsl = rgbHsl(rgb);
    for (var i = 1; i <= 100; i++) {
      var l = hsl[2] - i / 100;
      if (l < 0) break;
      var cand = hslRgb(hsl[0], hsl[1], l);
      if (contrast(cand, bg) >= TARGET) return cand;
    }
    return hslRgb(hsl[0], hsl[1], 0.07);
  }

  /* -> "--op:#..;--op-ink:#..;--op-bg:#..1F"
     prefix "op" untuk badge operator, "bd" untuk kartu brand Tipe B. */
  function brandVars(hex, prefix) {
    var p = "--" + (prefix || "op");
    var rgb = hexRgb(hex);
    if (!rgb) return p + ":" + hex + ";" + p + "-bg:" + hex;
    var bg = mix(rgb, 0.12, SURFACE);
    var fg = adjust(rgb, bg);
    /* Ink untuk .opbadge__mark (teks di atas warna brand SOLID).
       Putih & navy dulu — keduanya sesuai palet. Hitam hanya cadangan
       untuk warna nada-tengah, di mana putih maupun navy sama-sama
       gagal 4.5:1; max(putih, hitam) dijamin >= 4.58 di semua warna. */
    var lolos = [["#ffffff", [255, 255, 255]], [rgbHex(INK_DARK), INK_DARK]]
      .map(function (c) { return { hex: c[0], r: contrast(c[1], fg) }; })
      .filter(function (c) { return c.r >= TARGET; })
      .sort(function (a, b) { return b.r - a.r; });
    var ink = lolos.length ? lolos[0].hex
      : (contrast([255, 255, 255], fg) >= contrast([0, 0, 0], fg) ? "#ffffff" : "#000000");
    /* Latar chip tetap warna brand ASLI + alpha: identitas brand terjaga
       dan translusensinya cocok di atas card maupun background halaman. */
    return p + ":" + rgbHex(fg) + ";" +
      p + "-ink:" + ink + ";" +
      p + "-bg:" + rgbHex(rgb) + "1F";
  }

  /* ---- Kartu peringatan kontekstual --------------------------------
     Peringatan `.warn` TIDAK lagi tampil sejak halaman dibuka: ia muncul
     setelah member benar-benar mulai bertransaksi (mengisi nomor tujuan,
     atau memilih penyedia di halaman yang tidak punya input sama sekali).
     Sebelum itu ia belum relevan dan cuma jadi bising.

     Elemennya sudah ada di markup tiap halaman lengkap dengan teksnya —
     helper ini HANYA mengatur kapan tampil, tidak pernah menyentuh isi
     teks (teks kontekstual per produk adalah keputusan per halaman).
     Animasi masuk `warnIn` di produk.css otomatis terpicu ulang tiap kali
     elemen berpindah dari hidden ke tampil. */

  function createWarn(el) {
    var node = typeof el === "string" ? document.getElementById(el) : el;
    function set(tampil) {
      if (!node) return;                       /* halaman tanpa .warn tetap aman */
      var mau = !tampil;
      if (node.hidden === mau) return;         /* jangan retrigger animasi sia-sia */
      node.hidden = mau;
    }
    return {
      show: function () { set(true); },
      hide: function () { set(false); },
      toggle: function (tampil) { set(!!tampil); },
      exists: function () { return !!node; },
    };
  }

  /* ---- Status pemuatan katalog (memuat / gagal / kosong) -------------
     Dipakai halaman produk yang datanya datang dari BACKEND (api.js),
     bukan dari array dummy di file datanya sendiri. Hidup di lapisan ini
     supaya 28 kategori nanti tidak menyalin markup + CSS yang sama.

     Kartunya DIBUAT RUNTIME dan disisipkan tepat sebelum `#prodSec`, jadi
     tidak ada halaman yang perlu menambah markup. Ia SENGAJA di luar
     `#prodSec`: section itu dikelola createGrid (disembunyikan tiap kali
     daftar kosong), jadi apa pun yang ditaruh di dalamnya akan ikut
     hilang persis saat status "memuat"/"gagal" justru harus terlihat.

     Tiga keadaan, semuanya mengganti isi kartu yang sama:
       memuat()          -> skeleton 2 kolom yang meniru bentuk .prod-grid
       gagal(pesan, fn)  -> pesan ramah + tombol "Coba Lagi" (fn dipanggil)
       kosong(pesan)     -> daftar kosong yang WAJAR (mis. operator ini
                            memang belum punya produk), bukan error
     `sembunyi()` mengembalikannya ke tidak tampil sama sekali. */

  function createStatus(o) {
    o = o || {};
    var anchor = typeof o.anchor === "string" ? document.getElementById(o.anchor) : o.anchor;
    var node = null;
    var keadaan = "sembunyi";
    var onRetry = null;

    function build() {
      if (node) return node;
      node = document.createElement("section");
      node.className = "pstatus";
      node.setAttribute("aria-live", "polite");
      node.hidden = true;
      if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(node, anchor);
      else document.body.appendChild(node);

      /* Satu listener untuk tombol retry — isinya diganti-ganti, jadi
         dipasang di kontainer (delegasi), bukan di tombolnya. */
      node.addEventListener("click", function (e) {
        var btn = e.target.closest(".pstatus__retry");
        if (!btn || typeof onRetry !== "function") return;
        try { onRetry(); } catch (err) { console.error("produk-ui: retry gagal:", err); }
      });
      return node;
    }

    function tampil(html, kelas) {
      build();
      node.className = "pstatus" + (kelas ? " " + kelas : "");
      node.innerHTML = html;
      node.hidden = false;
    }

    var IC_GAGAL =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
      'stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M12 3.5 2.5 20h19L12 3.5z"/><path d="M12 10v4M12 17.4h.01"/></svg>';
    var IC_KOSONG =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
      'stroke-linecap="round" stroke-linejoin="round">' +
      '<rect x="3.5" y="5.5" width="17" height="13" rx="2.4"/><path d="M3.5 10h17M9 15h6"/></svg>';

    return {
      memuat: function (jml) {
        keadaan = "memuat";
        var n = Number(jml) > 0 ? Number(jml) : 6;
        var kartu = "";
        for (var i = 0; i < n; i++) {
          kartu += '<span class="pskel" style="animation-delay:' + (RM ? 0 : i * 70) + 'ms">' +
            '<span class="pskel__line pskel__line--nom"></span>' +
            '<span class="pskel__line pskel__line--price"></span></span>';
        }
        tampil(
          '<p class="pstatus__lead">Memuat daftar produk terbaru…</p>' +
          '<div class="pskel-grid" aria-hidden="true">' + kartu + "</div>",
          "pstatus--memuat"
        );
      },
      gagal: function (pesan, fn) {
        keadaan = "gagal";
        onRetry = fn || null;
        tampil(
          '<span class="pstatus__ic" aria-hidden="true">' + IC_GAGAL + "</span>" +
          '<p class="pstatus__title">Gagal memuat produk</p>' +
          '<p class="pstatus__text">' + esc(pesan || "Coba lagi sebentar lagi, ya.") + "</p>" +
          (fn ? '<button class="pstatus__retry" type="button">Coba Lagi</button>' : ""),
          "pstatus--gagal"
        );
      },
      kosong: function (pesan) {
        keadaan = "kosong";
        onRetry = null;
        tampil(
          '<span class="pstatus__ic" aria-hidden="true">' + IC_KOSONG + "</span>" +
          '<p class="pstatus__text">' + esc(pesan || "Belum ada produk untuk pilihan ini.") + "</p>",
          "pstatus--kosong"
        );
      },
      sembunyi: function () {
        keadaan = "sembunyi";
        onRetry = null;
        if (node) { node.hidden = true; node.innerHTML = ""; }
      },
      keadaan: function () { return keadaan; },
    };
  }

  /* ---- Pemilih sub-brand / pilihan lain (dibuat runtime) -------------
     Pola visual SAMA dengan pemilih biller `#choiceSec` di halaman
     pascabayar (hp-pasca.html dst): satu baris ringkas yang membuka
     bottom sheet `createPicker()`. Bedanya kartunya DIBUAT RUNTIME, jadi
     halaman produk tidak perlu menambah markup — penting karena pemilih
     ini akan menyusul di banyak kategori (by.U muncul di 6 kategori
     prabayar sekaligus, lihat SUB_BRAND di brand-map.js).

       render(opsi, {title, label})   opsi: [{ id, label, sub? }]
                                      opsi.length < 2 -> kartu disembunyikan
                                      DAN pilihan direset (pemanggil jatuh
                                      ke daftar penuh, bukan ke sisa pilihan
                                      operator sebelumnya)
       pilih()                        -> id terpilih | null
       set(id)                        pilih dari luar tanpa memicu onPick
       onPick(fn)                     dipanggil saat member memilih
       sembunyi()                     */

  function createChoice(o) {
    o = o || {};
    var anchor = typeof o.anchor === "string" ? document.getElementById(o.anchor) : o.anchor;
    var node = null, labelEl = null, ubahEl = null;
    var picker = null;
    var opsi = [];
    var terpilih = null;
    var judul = "Pilih";
    var labelDasar = "Pilihan";
    var cb = null;

    function build() {
      if (node) return node;
      node = document.createElement("section");
      node.className = "card psec choice-trigger";
      node.hidden = true;
      node.innerHTML =
        '<button class="choice-trigger__btn" type="button">' +
        '<span class="choice-trigger__text">' +
        '<span class="choice-trigger__label"></span></span>' +
        '<span class="choice-trigger__ubah" hidden>Ubah</span>' +
        '<svg class="choice-trigger__chev" viewBox="0 0 24 24" width="18" height="18" fill="none" ' +
        'stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" ' +
        'aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>' +
        "</button>";
      labelEl = node.querySelector(".choice-trigger__label");
      ubahEl = node.querySelector(".choice-trigger__ubah");
      if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(node, anchor);
      else document.body.appendChild(node);

      picker = createPicker();
      picker.onPick(function (item) {
        terpilih = item.id;
        gambar();
        if (typeof cb === "function") {
          try { cb(terpilih); } catch (e) { console.error("produk-ui: onPick choice error:", e); }
        }
      });
      node.querySelector(".choice-trigger__btn").addEventListener("click", function () {
        picker.open(opsi.map(function (x) {
          return { id: x.id, name: x.label, sub: x.sub };
        }), { title: judul, picked: terpilih });
      });
      return node;
    }

    function namaTerpilih() {
      for (var i = 0; i < opsi.length; i++) if (opsi[i].id === terpilih) return opsi[i].label;
      return null;
    }

    function gambar() {
      build();
      var nama = namaTerpilih();
      node.classList.toggle("is-picked", !!nama);
      ubahEl.hidden = !nama;
      labelEl.textContent = nama ? (labelDasar + ": " + nama) : judul;
    }

    return {
      render: function (daftar, opts) {
        opts = opts || {};
        judul = opts.title || judul;
        labelDasar = opts.label || labelDasar;
        opsi = Array.isArray(daftar) ? daftar : [];
        /* Satu pilihan bukan pilihan — dan pilihan lama WAJIB dilupakan,
           kalau tidak "byu" bisa ikut terbawa saat member berpindah ke
           operator yang tidak punya sub-brand sama sekali. */
        if (opsi.length < 2) {
          terpilih = null;
          build();
          node.hidden = true;
          gambar();          /* label ikut kembali ke keadaan awal, bukan
                                menyimpan "…: by.U" milik operator lama */
          return;
        }
        if (!namaTerpilih()) terpilih = null;   /* pilihan lama tidak ada di daftar baru */
        build();
        node.hidden = false;
        gambar();
      },
      pilih: function () { return terpilih; },
      set: function (id) { terpilih = id || null; gambar(); },
      onPick: function (fn) { cb = fn; },
      sembunyi: function () { terpilih = null; if (node) node.hidden = true; },
    };
  }

  /* ---- Kotak pencarian untuk daftar brand yang PANJANG ---------------
     Dipakai halaman TIPE B yang daftar brand-nya tidak lagi muat dipindai
     mata: kategori Games punya **107 game** di price-list asli.

     Kenapa BUKAN tab genre: genre tidak ada di price-list Digiflazz sama
     sekali, jadi 107 nilainya harus ditulis tangan — dan tebakan genre
     yang meleset menyembunyikan game dari member yang mencarinya. Mengetik
     nama game tidak bisa meleset.

     Muncul OTOMATIS hanya kalau daftarnya lebih panjang dari `min`, jadi
     halaman Tipe B lain (Streaming 2 brand, E-Money 4) tetap polos seperti
     sebelumnya tanpa perubahan apa pun di file datanya. */

  function createCari(o) {
    o = o || {};
    var anchor = typeof o.anchor === "string" ? document.getElementById(o.anchor) : o.anchor;
    var min = Number(o.min) > 0 ? Number(o.min) : 12;
    var node = null, input = null, kosongEl = null;
    var cb = null, timer = null;

    function build() {
      if (node) return node;
      node = document.createElement("div");
      node.className = "pcari";
      node.hidden = true;
      node.innerHTML =
        '<span class="pcari__ic" aria-hidden="true">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round">' +
        '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></svg></span>' +
        '<input class="pcari__input" type="search" autocomplete="off" ' +
        'aria-label="Cari nama game" />' +
        '<button class="pcari__clear" type="button" aria-label="Hapus pencarian" hidden>' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" ' +
        'stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>';
      input = node.querySelector(".pcari__input");
      if (o.placeholder) input.placeholder = o.placeholder;
      var clear = node.querySelector(".pcari__clear");

      /* Di-debounce: tiap ketukan menggambar ulang SELURUH daftar brand
         (107 tombol), jadi menggambar per karakter terasa berat. */
      function ubah() {
        clear.hidden = !input.value;
        if (timer) clearTimeout(timer);
        timer = setTimeout(function () {
          if (typeof cb === "function") {
            try { cb(nilai()); }
            catch (e) { console.error("produk-ui: onInput cari error:", e); }
          }
        }, 120);
      }
      input.addEventListener("input", ubah);
      clear.addEventListener("click", function () {
        input.value = "";
        ubah();
        input.focus();
      });

      if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(node, anchor);
      else document.body.appendChild(node);
      return node;
    }

    function nilai() {
      return input ? input.value.trim().toLowerCase() : "";
    }

    return {
      /* jml = panjang daftar SEBELUM disaring. Kotaknya disembunyikan
         (dan pencariannya dikosongkan) begitu daftarnya kembali pendek,
         supaya tidak ada saringan tersembunyi yang menyembunyikan brand. */
      render: function (jml) {
        build();
        var tampil = Number(jml) >= min;
        node.hidden = !tampil;
        if (!tampil && input.value) {
          input.value = "";
          node.querySelector(".pcari__clear").hidden = true;
        }
      },
      nilai: nilai,
      /* Substring, case-insensitive — sengaja sesederhana mungkin.
         Cocokkan ke NAMA yang dilihat member. */
      cocok: function (teks) {
        var q = nilai();
        if (!q) return true;
        return String(teks || "").toLowerCase().indexOf(q) !== -1;
      },
      /* Pesan "tidak ketemu" dititipkan ke komponen ini supaya pemanggil
         tidak perlu markup sendiri. */
      pesanKosong: function (tampil, teks) {
        build();
        if (!kosongEl) {
          kosongEl = document.createElement("p");
          kosongEl.className = "pcari__kosong";
          kosongEl.hidden = true;
          node.parentNode.insertBefore(kosongEl, node.nextSibling);
        }
        kosongEl.hidden = !tampil;
        if (tampil) kosongEl.textContent = teks;
      },
      onInput: function (fn) { cb = fn; },
      sembunyi: function () { if (node) node.hidden = true; },
    };
  }

  /* ---- Filter rentang nominal untuk katalog besar --------------------
     Katalog ASLI bisa ratusan produk dalam satu operator (Telkomsel: 270
     pulsa) — menggulir 135 baris untuk mencari nominal 20 ribu itu
     menyiksa. Chip rentang harga muncul OTOMATIS begitu daftarnya lebih
     panjang dari `min`, dan tidak muncul sama sekali untuk katalog kecil
     (XL 17 produk tetap tampil polos seperti sebelumnya).

     Rentangnya BUKAN khusus pulsa: satuannya rupiah `harga_modal`, jadi
     kategori lain (Games, Voucher, Data) bisa memakai komponen yang sama
     tanpa perubahan. Kelompok yang KOSONG tidak pernah dirender — chip
     yang selalu memberi hasil nol cuma menipu.

       render(items)      -> pasang chip sesuai sebaran harga `items`
       terapkan(items)    -> items yang lolos chip aktif
       aktif()            -> id chip aktif ("all" default)
       onPick(fn)
       kunciRender()      -> penanda untuk key grid (lihat produk-page.js) */

  var RENTANG = [
    { id: "r1", label: "< Rp10rb",       min: 0,      max: 10000 },
    { id: "r2", label: "Rp10rb–25rb",    min: 10000,  max: 25000 },
    { id: "r3", label: "Rp25rb–50rb",    min: 25000,  max: 50000 },
    { id: "r4", label: "Rp50rb–100rb",   min: 50000,  max: 100000 },
    { id: "r5", label: "> Rp100rb",      min: 100000, max: Infinity },
  ];
  var MIN_FILTER = 20;      /* di bawah ini daftarnya masih enak digulir */

  function createFilterHarga(o) {
    o = o || {};
    var anchor = typeof o.anchor === "string" ? document.getElementById(o.anchor) : o.anchor;
    var minimal = typeof o.min === "number" ? o.min : MIN_FILTER;
    var node = null, tabs = null;
    var cb = null;
    var aktif = "all";
    var sidikJari = null;   /* susunan chip yang sedang terpasang */

    function cocok(item, r) {
      var h = Number(item && item.harga_modal);
      if (!isFinite(h)) return false;
      /* Batas bawah inklusif, batas atas eksklusif — supaya produk tepat
         Rp25.000 masuk SATU kelompok saja, tidak dua. */
      return h >= r.min && h < r.max;
    }

    function build() {
      if (node) return node;
      node = document.createElement("div");
      node.className = "ptabs";
      node.hidden = true;
      if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(node, anchor);
      else document.body.appendChild(node);
      tabs = createTabs({ el: node });
      tabs.onPick(function (id) {
        aktif = id;
        if (typeof cb === "function") {
          try { cb(id); } catch (e) { console.error("produk-ui: onPick filter error:", e); }
        }
      });
      return node;
    }

    return {
      render: function (items, kunciKatalog) {
        build();
        var list = Array.isArray(items) ? items : [];
        var chips = [];
        if (list.length > minimal) {
          chips.push({ id: "all", label: "Semua" });
          RENTANG.forEach(function (r) {
            var ada = list.some(function (it) { return cocok(it, r); });
            if (ada) chips.push({ id: r.id, label: r.label });
          });
          if (chips.length < 2) chips = [];
        }

        /* KATALOG SAMA -> jangan render ulang. `createTabs.render()` selalu
           mengaktifkan tab PERTAMA, jadi render ulang yang tidak perlu akan
           diam-diam mengembalikan pilihan member ke "Semua". Itu bukan
           teori: render ulang memang terjadi tiap kali daftar produk
           disegarkan — dan menekan chip ITU SENDIRI memicu penggambaran
           ulang grid — sehingga filter yang baru ditekan langsung batal
           sebelum sempat terlihat.

           `kunciKatalog` datang dari pemanggil (mis. opKey + sub-brand).
           Katalognya benar-benar berganti -> chip dibangun ulang DAN
           pilihan kembali ke "Semua", karena rentang yang relevan untuk
           operator lama belum tentu masuk akal di operator baru. */
        var kunci = (kunciKatalog == null ? chips.map(function (t) { return t.id; }).join(",")
                                          : String(kunciKatalog)) + "#" + chips.length;
        if (kunci === sidikJari) return;
        sidikJari = kunci;

        tabs.render(chips);
        aktif = tabs.active() || "all";
      },
      terapkan: function (items) {
        var list = Array.isArray(items) ? items : [];
        if (!aktif || aktif === "all") return list;
        var r = null;
        RENTANG.forEach(function (x) { if (x.id === aktif) r = x; });
        if (!r) return list;
        return list.filter(function (it) { return cocok(it, r); });
      },
      aktif: function () { return aktif; },
      onPick: function (fn) { cb = fn; },
      kunciRender: function () { return aktif || "all"; },
    };
  }

  /* Teks yang masuk innerHTML selalu lewat sini — pesan galat bisa
     memuat potongan respons server, jadi tidak boleh dipercaya mentah. */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ---- Daftar overlay yang sedang terbuka ---------------------------
     Beberapa lapisan mendengarkan `popstate` sekaligus (modal konfirmasi,
     daftar brand di provider-page, modal info di halaman voucher). Kalau
     masing-masing bertindak sendiri, SATU ketukan BACK bisa memicu dua
     aksi sekaligus — mis. menutup modal SEKALIGUS mundur ke daftar brand.

     Registry ini jadi satu tempat bertanya "apakah ada overlay terbuka?"
     sebelum sebuah handler bertindak. Overlay mendaftarkan fungsi kecil
     yang melaporkan statusnya sendiri. */

  var overlays = [];

  function registerOverlay(isOpenFn) {
    if (typeof isOpenFn === "function") overlays.push(isOpenFn);
  }
  function anyOverlayOpen() {
    for (var i = 0; i < overlays.length; i++) {
      try { if (overlays[i]()) return true; }
      catch (e) { console.error("produk-ui: cek overlay gagal:", e); }
    }
    return false;
  }

  /* ---- Bottom sheet pemilih (kategori/biller pascabayar) -------------
     createPicker() -> { open(items, opts), close(), onPick(fn), exists() }
       items: [{ id, name, sub? }]
       opts : { title, picked }   -- title = judul sheet, picked = id yang
                                      sedang terpilih (ditandai di daftar)

     KENAPA ADA: 6 halaman pascabayar berbiller-banyak (PDAM, PBB,
     Internet/TV/HP Pascabayar, Multifinance) dulu merender daftar biller
     sebagai KARTU VERTIKAL memanjang langsung di badan halaman — untuk
     Multifinance (5 biller) itu masih wajar, tapi kalau daftarnya
     panjang (PDAM/PBB per kota/kabupaten bisa puluhan) halaman jadi
     berisi satu list raksasa sebelum member sempat mengisi apa pun.

     Sheet ini DIBANGUN RUNTIME sekali, dipakai ulang — pola yang sama
     seperti `showGangguan`/paymodal.js — supaya keenam halaman itu tidak
     perlu menambah markup sheet apa pun, cukup `#choiceSec` yang sudah
     ada berubah jadi baris ringkas pemicu (lihat manual-page.js).

     Mengikuti kontrak overlay yang SAMA dengan createModal: dorong
     history saat dibuka (BACK HP menutup sheet, bukan pindah halaman)
     dan mendaftar ke `registerOverlay` supaya tidak tabrakan dengan
     modal konfirmasi yang mungkin terbuka di lapisan lain. */

  var pickerEl = null;

  function buildPicker() {
    if (pickerEl) return pickerEl;
    var ov = document.createElement("div");
    ov.className = "pick-overlay";
    ov.innerHTML =
      '<div class="pick-sheet" role="dialog" aria-modal="true" aria-labelledby="pickTitle">' +
      '<span class="pick-sheet__handle" aria-hidden="true"></span>' +
      '<h3 class="pick-sheet__title" id="pickTitle"></h3>' +
      '<div class="pick-sheet__list"></div>' +
      "</div>";
    document.body.appendChild(ov);
    pickerEl = ov;
    return ov;
  }

  function createPicker() {
    var buka = false;
    var pushed = false;
    var onPickCb = null;

    function pasang() {
      var ov = buildPicker();
      /* Listener dipasang SEKALI per elemen (bukan sekali per createPicker,
         kalau-kalau lebih dari satu instance createPicker() dibuat) — flag
         di dataset mencegah listener dobel menutup-buka aneh. */
      if (ov.dataset.wired === "1") return ov;
      ov.dataset.wired = "1";
      ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
      window.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
      window.addEventListener("popstate", function () { if (buka) close(true); });
      registerOverlay(function () { return buka; });
      return ov;
    }

    function render(items, pickedId) {
      var list = pickerEl.querySelector(".pick-sheet__list");
      var frag = document.createDocumentFragment();
      (Array.isArray(items) ? items : []).forEach(function (item, i) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "pick-opt" + (item.id === pickedId ? " is-active" : "");
        b.style.animationDelay = (RM ? 0 : Math.min(i, 14) * 30) + "ms";
        b.innerHTML =
          '<span class="pick-opt__body">' +
          '<span class="pick-opt__name"></span>' +
          (item.sub ? '<span class="pick-opt__sub"></span>' : "") +
          "</span>" +
          '<span class="pick-opt__radio" aria-hidden="true">' +
          '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" ' +
          'stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M20 6 9 17l-5-5"/></svg></span>';
        b.querySelector(".pick-opt__name").textContent = item.name;
        if (item.sub) b.querySelector(".pick-opt__sub").textContent = item.sub;
        b.addEventListener("click", function () {
          close();
          if (onPickCb) {
            try { onPickCb(item); }
            catch (e) { console.error("produk-ui: onPick picker error:", e); }
          }
        });
        frag.appendChild(b);
      });
      list.innerHTML = "";
      list.appendChild(frag);
    }

    function open(items, opts) {
      if (buka) return;
      pasang();
      opts = opts || {};
      pickerEl.querySelector(".pick-sheet__title").textContent = opts.title || "Pilih";
      render(items, opts.picked);
      pickerEl.classList.add("is-open");
      buka = true;
      document.documentElement.style.overflow = "hidden";
      try { history.pushState({ dikaPick: 1 }, ""); pushed = true; }
      catch (e) { pushed = false; }
    }

    function close(fromPop) {
      if (!buka || !pickerEl) return;
      buka = false;
      pickerEl.classList.remove("is-open");
      document.documentElement.style.overflow = "";
      var did = pushed;
      pushed = false;
      if (!fromPop && did) { try { history.back(); } catch (e) {} }
    }

    return {
      open: open,
      close: close,
      onPick: function (fn) { onPickCb = fn; },
      exists: function () { return true; },
    };
  }

  /* ---- Tab subkategori ---------------------------------------------
     Nav tab horizontal untuk memecah daftar panjang jadi kelompok yang
     bisa dipindai cepat. SATU implementasi dipakai dua jenis halaman
     dengan sasaran filter yang berbeda:

       Tipe A (produk-page.js)  -> menyaring GRID NOMINAL
       Tipe B (provider-page.js) -> menyaring DAFTAR BRAND

     Yang dipakai bersama cuma tampilan + state tab aktif; keputusan
     "apa yang disaring" tetap milik masing-masing controller.

     tabs: [{ id, label }] — tab pertama otomatis aktif saat halaman dibuka.
     onPick(id) dipanggil tiap tab berpindah (TIDAK dipanggil saat render
     awal; controller yang menentukan tampilan awalnya sendiri). */

  function createTabs(o) {
    var node = typeof o.el === "string" ? document.getElementById(o.el) : o.el;
    var aktif = null;
    var pilih = null;

    function render(tabs) {
      if (!node) return;
      /* < 2 tab tidak berguna: satu tab bukan pilihan, cuma judul palsu
         yang menambah satu baris. Sembunyikan DAN lupakan tab aktif,
         supaya pemanggil jatuh ke subkategori pertama. */
      if (!Array.isArray(tabs) || tabs.length < 2) {
        node.hidden = true;
        node.innerHTML = "";
        aktif = null;
        return;
      }
      var frag = document.createDocumentFragment();
      tabs.forEach(function (t, i) {
        var b = document.createElement("button");
        b.className = "ptab" + (i === 0 ? " is-active" : "");
        b.type = "button";
        b.dataset.id = t.id;
        b.textContent = t.label;
        frag.appendChild(b);
      });
      node.innerHTML = "";
      node.appendChild(frag);
      node.hidden = false;
      aktif = tabs[0].id;
    }

    if (node) {
      node.addEventListener("click", function (e) {
        var b = e.target.closest(".ptab");
        if (!b || b.dataset.id === aktif) return;   /* tap tab yang sama = no-op */
        try {
          var lama = node.querySelector(".ptab.is-active");
          if (lama) lama.classList.remove("is-active");
          b.classList.add("is-active");
          aktif = b.dataset.id;
          /* Geser tab terpilih ke area pandang kalau daftarnya panjang */
          if (b.scrollIntoView) b.scrollIntoView({ inline: "nearest", block: "nearest" });
          if (typeof pilih === "function") pilih(aktif);
        } catch (err) { console.error("produk-ui: gagal ganti tab:", err); }
      });
    }

    return {
      render: render,
      onPick: function (fn) { pilih = fn; },
      active: function () { return aktif; },
      exists: function () { return !!node; },
    };
  }

  /* Saring daftar memakai `grup` pada tiap record. Record TANPA `grup`
     sengaja ikut tampil di semua tab — supaya data yang belum sempat
     dikelompokkan tidak hilang diam-diam dari UI (pola yang sama seperti
     slug "lainnya" di kategori-map.js: jangan buang tanpa jejak). */
  function filterGrup(list, grupId) {
    if (!Array.isArray(list)) return [];
    if (!grupId) return list;
    return list.filter(function (x) { return !x.grup || x.grup === grupId; });
  }

  /* ---- Produk sedang GANGGUAN --------------------------------------
     Produk dengan `gangguan: true` (lihat produk-schema.js) tetap
     DITAMPILKAN — member berhak tahu produk itu ada, cuma sedang tidak
     bisa dibeli — tapi diredupkan, diberi badge, dan TIDAK bisa dibawa
     ke konfirmasi pembelian. Modalnya dibangun sekali lalu dipakai ulang
     (pola lazy yang sama seperti paymodal.js) supaya semua halaman
     produk berbagi satu implementasi, bukan menyalin per halaman. */

  var gangguanEl = null;

  function buildGangguan() {
    if (gangguanEl) return gangguanEl;
    var ov = document.createElement("div");
    ov.className = "cmodal-overlay gmodal-overlay";
    ov.innerHTML =
      '<div class="cmodal gmodal" role="dialog" aria-modal="true" aria-labelledby="gmTitle">' +
      '<span class="gmodal__ic" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
      'stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="12" cy="12" r="9"/><path d="M12 8v4.6M12 16h.01"/></svg></span>' +
      '<h3 class="cmodal__title" id="gmTitle">Produk ini sedang gangguan</h3>' +
      '<p class="cmodal__text gmodal__text"></p>' +
      '<div class="cmodal__actions">' +
      '<button class="cmodal__btn cmodal__btn--gold" type="button">Oke, Mengerti</button>' +
      "</div></div>";
    document.body.appendChild(ov);
    gangguanEl = ov;

    function tutup() {
      ov.classList.remove("is-open");
      document.documentElement.style.overflow = "";
    }
    ov.querySelector(".cmodal__btn").addEventListener("click", tutup);
    ov.addEventListener("click", function (e) { if (e.target === ov) tutup(); });
    window.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && ov.classList.contains("is-open")) tutup();
    });
    return ov;
  }

  /* Nada sengaja empatik & menenangkan: tidak menyalahkan penyedia,
     tidak membuat member merasa salah pilih, dan menegaskan ini
     sementara. Kalau menyunting teks ini, pertahankan nadanya. */
  function showGangguan(item) {
    try {
      var ov = buildGangguan();
      var nama = item && item.nama ? item.nama : "Produk ini";
      ov.querySelector(".cmodal__text").textContent =
        nama + " untuk sementara belum bisa diproses karena penyedia layanannya " +
        "sedang bermasalah. Ini biasanya tidak lama, jadi tidak perlu khawatir — " +
        "kamu bisa memilih nominal lain dulu, atau kembali lagi sebentar lagi. " +
        "Terima kasih ya sudah mau menunggu.";
      ov.classList.add("is-open");
      document.documentElement.style.overflow = "hidden";
    } catch (e) {
      console.error("produk-ui: gagal menampilkan info gangguan:", e);
    }
  }

  /* ---- Grid produk -------------------------------------------------
     item: produk PRABAYAR sesuai produk-schema.js
           { sku, nama, brand, harga_modal, kategori_asli, sub?,
             deskripsi?, gangguan? }
     `key` = penanda isi grid. Kalau key sama dengan render sebelumnya,
     grid TIDAK dibangun ulang — supaya animasi tidak "kedip" saat
     pemicu render terjadi berkali-kali (mis. tiap ketukan tombol). */

  /* Kartu ke berapa yang masih ikut antre animasi masuk. ±satu layar
     penuh di grid 2 kolom; selebihnya tidak perlu diantre karena belum
     terlihat saat animasinya berjalan. */
  var MAKS_STAGGER = 11;

  /* ===================== MARGIN BASI SETELAH BFCACHE ======================
     Angka "Jual Rp…"/"+Rp…" di kartu produk dihitung SEKALI saat grid
     dirender, lalu ikut membeku di DOM. Kalau member pergi ke halaman
     Margin, mengubah setelannya, lalu KEMBALI, WebView memulihkan halaman
     ini dari bfcache: <script> TIDAK dijalankan ulang, `init()` tidak
     jalan, dan grid tetap memajang margin LAMA.

     Gejalanya persis seperti "margin tidak merata": kategori yang baru
     dibuka memakai setelan baru, kategori yang PERNAH dibuka sebelumnya
     masih memakai setelan lama — padahal penyimpanannya cuma satu kunci
     dan sudah benar.

     Penjaganya ditaruh di lapisan primitif ini supaya berlaku otomatis di
     SEMUA halaman produk (22 halaman + listrik + gas), bukan disalin per
     controller. `token` juga harus dikosongkan lebih dulu, kalau tidak
     render() akan melewati permintaan ini karena key-nya tidak berubah. */
  var gridHidup = [];

  function tandaMargin() {
    try {
      var M = window.DikaMargin;
      if (!M) return "0";
      var m = M.baca();
      return [M.aktif() ? 1 : 0, m.mode, m.pct, m.rp,
        m.cats === "all" ? "all" : (Array.isArray(m.cats) ? m.cats.join(",") : "-")].join("|");
    } catch (e) {
      console.error("produk-ui: gagal membaca tanda margin:", e);
      return "0";
    }
  }

  function segarkanSemuaGrid() {
    var tanda = tandaMargin();
    gridHidup.forEach(function (g) {
      try { g(tanda); } catch (e) { console.error("produk-ui: gagal menyegarkan grid:", e); }
    });
  }

  function createGrid(o) {
    var busy = false;
    var token = null;
    var list = [];        /* dipakai onPick untuk tahu produk mana yang gangguan */
    var tandaTerakhir = null;   /* setelan margin saat grid ini terakhir digambar */

    /* Digambar ulang HANYA kalau setelan margin benar-benar berubah —
       kembali dari halaman lain tanpa mengubah apa pun tidak boleh
       membuat kartu berkedip tanpa alasan. */
    gridHidup.push(function (tandaBaru) {
      if (tandaTerakhir === null || tandaBaru === tandaTerakhir) return;
      if (!list.length) { tandaTerakhir = tandaBaru; return; }
      var kunci = token;
      token = null;                /* buka gerbang "key sama -> lewati" */
      render(list, kunci);
    });

    function render(items, key) {
      if (busy) return;
      busy = true;
      try {
        if (!Array.isArray(items) || !items.length) {
          o.grid.innerHTML = "";
          o.section.hidden = true;
          token = null;
          list = [];
          return;
        }
        if (key != null && key === token) return;
        list = items;
        tandaTerakhir = tandaMargin();

        /* Bangun ke DocumentFragment dulu → tukar sekali. Kalau ada error
           di tengah, daftar lama tetap tampil. */
        var frag = document.createDocumentFragment();
        items.forEach(function (item, i) {
          var btn = document.createElement("button");
          var rusak = !!(item && item.gangguan);
          btn.className = "prod" + (rusak ? " prod--gangguan" : "");
          btn.type = "button";
          btn.dataset.idx = String(i);
          /* Stagger DIBATASI, bukan i*45 tanpa batas. Dengan data dummy
             (9 kartu) itu tidak pernah jadi masalah, tapi katalog ASLI
             bisa ratusan produk dalam satu operator (Telkomsel: 270 kartu
             pulsa) — kartu terakhir jadi menunggu 12 DETIK sebelum muncul,
             dan karena `prodIn` memakai fill `backwards`, sampai gilirannya
             tiba kartu itu benar-benar tak terlihat (opacity 0). Member
             yang menggulir ke bawah cuma melihat area kosong.
             Dibatasi MAKS_STAGGER kartu (±satu layar penuh): sisanya
             muncul bersama di ujung urutan, dan toh sudah di luar layar
             saat animasinya berjalan. */
          btn.style.animationDelay = (RM ? 0 : Math.min(i, MAKS_STAGGER) * 45) + "ms";
          /* aria-disabled, BUKAN disabled: tombolnya harus tetap bisa
             ditekan supaya kita bisa menjelaskan KENAPA tidak tersedia.
             disabled akan menelan klik dan member cuma merasa app-nya rusak. */
          if (rusak) btn.setAttribute("aria-disabled", "true");
          /* Kartu SENGAJA cuma nama + keterangan singkat + harga. Baris
             "Harga modal" (dulu .prod__tag) DIHAPUS: itu istilah internal
             reseller yang membingungkan member, dan angkanya sudah tampil
             di .prod__price. Rincian admin/nominal tetap ada di modal
             konfirmasi, tempat yang memang untuk itu. */
          /* KALKULATOR MARGIN — TAMPILAN SAJA.
             `harga_modal` yang tampil di .prod__price dan yang dibayar
             member TIDAK berubah sedikit pun. Baris tambahan di bawah
             cuma memberi tahu member berapa idealnya dia menjual ulang
             ke pelanggannya sendiri. JANGAN memakai nilai ini di modal
             konfirmasi atau di payment-flow.js. */
          var est = window.DikaMargin
            ? window.DikaMargin.hitung(item.harga_modal, o.slug)
            : null;
          var estHtml = est && est.marginRp > 0
            ? '<span class="prod__margin">' +
              '<span class="prod__jual">Jual ' + fmtRupiah(est.jual) + "</span>" +
              '<span class="prod__untung">+' + fmtRupiah(est.marginRp) + "</span>" +
              "</span>"
            : "";

          btn.innerHTML =
            '<span class="prod__nom">' + item.nama + "</span>" +
            (item.sub ? '<span class="prod__sub">' + item.sub + "</span>" : "") +
            '<span class="prod__price">' + fmtRupiah(item.harga_modal) + "</span>" +
            estHtml +
            (rusak ? '<span class="prod__badge">Gangguan</span>' : "");
          frag.appendChild(btn);
        });

        o.grid.innerHTML = "";
        o.grid.appendChild(frag);
        o.section.hidden = false;
        token = key == null ? null : key;
      } catch (err) {
        console.error("produk-ui: gagal render grid:", err);
      } finally {
        busy = false;
      }
    }

    return {
      render: render,
      clear: function () {
        o.grid.innerHTML = "";
        o.section.hidden = true;
        token = null;
        list = [];
      },
      onPick: function (fn) {
        o.grid.addEventListener("click", function (e) {
          var btn = e.target.closest(".prod");
          if (!btn) return;
          try {
            var idx = Number(btn.dataset.idx);
            /* Produk gangguan BERHENTI DI SINI — tidak pernah sampai ke
               konfirmasi pembelian. Dicegat di lapisan primitif supaya
               berlaku otomatis di SEMUA halaman produk; controller
               (produk-page/provider-page/listrik) tidak perlu tahu. */
            if (list[idx] && list[idx].gangguan) { showGangguan(list[idx]); return; }
            fn(idx);
          } catch (err) { console.error("produk-ui: gagal pilih produk:", err); }
        });
      },
    };
  }

  /* ---- Modal konfirmasi --------------------------------------------
     rows: [{ label, value, total? }] — baris `total` diberi garis pemisah
     dan huruf lebih besar. ctx diteruskan ke payLine(ctx). */

  function createModal(o) {
    var open = false;
    var pushed = false;
    var ctx = null;
    var noteEl = null;
    var lastRows = [];   /* dipakai ulang sbg ringkasan di layar hasil */

    /* ---- Deskripsi produk (catatan penting dari penyedia) ------------
       Sebagian produk punya catatan yang WAJIB dibaca sebelum bayar
       ("proses 1x24 jam", "tidak berlaku untuk kartu perdana", dst).
       Elemennya dibuat sekali saat pertama dibutuhkan lalu disisipkan
       setelah daftar baris — jadi 24 halaman produk TIDAK perlu
       menambah markup apa pun.

       TODO fase 2 (integrasi Digiflazz): `deskripsi` berhenti ditulis
       tangan di file data kategori. Isinya datang dari field `desc`
       pada price-list Digiflazz saat sinkronisasi, lewat backend +
       api.js — lihat "Prinsip integrasi Digiflazz" di CLAUDE.md.
       Bentuk datanya sudah disiapkan sekarang supaya saat sync pertama
       tidak ada perubahan UI yang perlu dikerjakan lagi. */

    function noteOf(context) {
      if (typeof o.note === "function") {
        try { return o.note(context) || ""; }
        catch (e) { console.error("produk-ui: note() error:", e); return ""; }
      }
      return context && context.item && context.item.deskripsi
        ? String(context.item.deskripsi) : "";
    }

    function renderNote(context) {
      var teks = noteOf(context);
      /* Kosong = section TIDAK dirender sama sekali, bukan kotak kosong. */
      if (!teks) { if (noteEl) noteEl.hidden = true; return; }
      if (!noteEl) {
        noteEl = document.createElement("div");
        noteEl.className = "cnote";
        noteEl.innerHTML =
          '<p class="cnote__title">Catatan produk</p><p class="cnote__text"></p>';
        o.rows.parentNode.insertBefore(noteEl, o.rows.nextSibling);
      }
      noteEl.querySelector(".cnote__text").textContent = teks;
      noteEl.hidden = false;
    }

    function show(rows, context) {
      if (open) return;                    // anti tap-ganda
      if (!Array.isArray(rows) || !rows.length) return;
      ctx = context || null;

      lastRows = rows;
      o.rows.innerHTML = rows.map(function (r) {
        return '<div class="cdetail__row' + (r.total ? " cdetail__row--total" : "") + '">' +
          "<dt>" + r.label + "</dt><dd>" + r.value + "</dd></div>";
      }).join("");
      renderNote(ctx);

      o.overlay.classList.add("is-open");
      open = true;
      document.documentElement.style.overflow = "hidden";

      /* BACK HP menutup modal, bukan pindah halaman */
      try { history.pushState({ dikaProduk: 1 }, ""); pushed = true; }
      catch (e) { pushed = false; }
    }

    function hide(fromPop) {
      if (!open) return;
      open = false;
      o.overlay.classList.remove("is-open");
      o.pay.classList.remove("is-loading");
      o.pay.disabled = false;
      document.documentElement.style.overflow = "";

      /* Kalau tutup DARI popstate, browser sudah mundur sendiri */
      var did = pushed;
      pushed = false;
      if (!fromPop && did) { try { history.back(); } catch (e) {} }
    }

    /* ---- Nilai yang dibayar -------------------------------------------
       Diturunkan dari ctx supaya 24 halaman produk TIDAK perlu menambah
       config apa pun. Dua bentuk ctx yang ada:
         - punya `item`  (Tipe A/B + listrik) -> item.harga_modal
         - nominal manual (Tipe C pascabayar) -> ctx.total  */

    /* Kategori untuk RIWAYAT (menentukan ikon & warna entri).
       Diturunkan dari slug halaman lewat kategori-map.js — SATU sumber
       yang sama dengan label & pemetaan sync.

       BUG yang diperbaiki: dulu isinya `o.txCat || "topup"`, sementara
       TIDAK ADA satu halaman pun yang menyetel `txCat`. Akibatnya SEMUA
       transaksi produk baru tercatat sebagai "topup" dan tampil dengan
       ikon "+" yang sama — pulsa, token listrik, diamond game, semuanya. */
    function kategoriRiwayat() {
      try {
        var M = window.DikaKategoriMap && window.DikaKategoriMap.MAP;
        var e = M && o.slug ? M[o.slug] : null;
        if (e && e.riwayat) return e.riwayat;
        if (o.slug) {
          console.warn("produk-ui: slug belum punya kategori riwayat:", o.slug,
            "- entri memakai ikon umum. Tambahkan `riwayat` di kategori-map.js.");
        }
      } catch (err) { console.error("produk-ui: gagal menentukan kategori riwayat:", err); }
      return o.txCat || "topup";
    }

    function nilaiBayar(c) {
      if (!c) return 0;
      if (c.item && c.item.harga_modal != null) return Number(c.item.harga_modal) || 0;
      if (c.total != null) return Number(c.total) || 0;
      return 0;
    }

    function namaTransaksi(c) {
      if (!c) return "Transaksi";
      if (c.item) {
        var n = window.DikaProduk ? window.DikaProduk.namaLengkap(c.item) : c.item.nama;
        var brand = (c.brand && c.brand.name) || (c.op && c.op.name) || c.item.brand || "";
        return brand ? n + " " + brand : n;
      }
      /* Tipe C: nama biller ada di choice/produk aktif */
      var b = (c.choice && c.choice.name) || (c.produk && c.produk.nama) || "";
      return b ? "Bayar " + b : "Pembayaran tagihan";
    }

    function tujuanTransaksi(c) {
      if (!c) return "";
      if (c.phone) return c.phone;
      if (c.meter) return c.meter;
      if (c.id) return c.id;
      if (c.account) {
        var k = Object.keys(c.account);
        if (k.length) return c.account[k[0]];
      }
      return "";
    }

    function pay() {
      if (!open || o.pay.disabled) return;

      var c = ctx;
      var jumlah = nilaiBayar(c);

      /* Alur pembayaran nyata (cek saldo -> proses -> hasil) hidup di
         payment-flow.js supaya SATU implementasi dipakai semua halaman
         produk. Kalau file itu tidak dimuat, jatuh ke sheet "Segera
         Hadir" yang lama — halaman tetap berfungsi, tidak error. */
      if (!window.DikaPayment) {
        payFallback(c);
        return;
      }

      o.pay.classList.add("is-loading");
      o.pay.disabled = true;

      var rows = lastRows.slice();
      window.setTimeout(function () {
        hide();
        window.setTimeout(function () {
          try {
            window.DikaPayment.bayar({
              amount: jumlah,
              nama: namaTransaksi(c),
              tujuan: tujuanTransaksi(c),
              rows: rows,
              cat: kategoriRiwayat(),
              admin: (c && c.admin) || 0,
              item: c && c.item,
            });
          } catch (err) {
            console.error("produk-ui: gagal memulai pembayaran:", err);
          }
        }, RM ? 0 : 200);
      }, RM ? 0 : 260);
    }

    /* Jalur lama — dipakai hanya kalau payment-flow.js tidak ada. */
    function payFallback(c) {
      o.pay.classList.add("is-loading");
      o.pay.disabled = true;
      window.setTimeout(function () {
        hide();
        window.setTimeout(function () {
          try {
            if (!window.DikaComingSoon) return;
            var detail = "";
            if (typeof o.payLine === "function") {
              try { detail = o.payLine(c) || ""; }
              catch (e) { console.error("produk-ui: payLine error:", e); }
            }
            window.DikaComingSoon({
              title: o.payTitle || "Pembayaran",
              lines: [
                "Pembayaran sedang kami siapkan \u{1F60A}",
                detail || "Metode pembayaran masih dalam pengerjaan. Terima kasih sudah menunggu!",
              ],
            });
          } catch (err) {
            console.error("produk-ui: gagal buka sheet pembayaran:", err);
          }
        }, RM ? 0 : 240);
      }, RM ? 0 : 700);
    }

    o.cancel.addEventListener("click", function () { hide(); });
    o.pay.addEventListener("click", pay);
    o.overlay.addEventListener("click", function (e) {
      if (e.target === o.overlay) hide();
    });
    window.addEventListener("keydown", function (e) {
      if (e.key === "Escape") hide();
    });
    /* paymodal.js mendaftarkan popstate-nya lebih dulu (urutan <script>),
       jadi kalau sheet "Segera Hadir" terbuka, dia yang tutup duluan. */
    window.addEventListener("popstate", function () { if (open) hide(true); });

    registerOverlay(function () { return open; });

    return { show: show, hide: hide, isOpen: function () { return open; } };
  }

  /* ---- Halaman BLANK karena .is-leaving membeku di bfcache -----------
     wireBack() menempelkan .is-leaving ke #app (translateX(100%)) supaya
     halaman menggeser keluar layar sebelum history.back(). Kalau class itu
     masih menempel saat halaman MASUK bfcache, WebView membekukan DOM APA
     ADANYA dan TIDAK menjalankan ulang <script> saat dipulihkan — seluruh
     isi .app tetap terdorong keluar layar → halaman tampak BENAR-BENAR
     BLANK, tanpa satu pun error JS (gejalanya "kadang normal kadang blank").

     Pertahanan BERLAPIS, tidak lagi bergantung pada satu titik:

       1. wireBack() melepas .is-leaving BEGITU animasi keluar selesai,
          SEBELUM history.back() — jadi class tidak pernah hidup lebih lama
          dari animasinya sendiri (lihat wireBack di bawah).
       2. pagehide melepasnya tepat sebelum halaman dibekukan ke bfcache —
          menangkap SEMUA jalur keluar (termasuk prefers-reduced-motion,
          fallback location.href, atau animasi baru yang lupa dibersihkan).
       3. pageshow melepasnya saat restore — jaring terakhir kalau entah
          bagaimana masih tersisa.

     Poin 2 yang membuat perbaikan ini tidak bergantung pada lifecycle
     bfcache: apa pun yang terjadi, DOM yang dibekukan tidak membawa
     .is-leaving. Pola pageshow yang sama dipakai bottomnav.js. */

  function healLeaving() {
    try {
      var app = document.getElementById("app");
      if (app) app.classList.remove("is-leaving");
    } catch (e) { console.error("produk-ui: healLeaving:", e); }
  }
  window.addEventListener("pageshow", healLeaving);
  window.addEventListener("pagehide", healLeaving);

  /* Margin bisa berubah selagi halaman ini "tidur" (member membuka halaman
     Margin lalu kembali). `pageshow` menyala baik untuk muat biasa maupun
     pemulihan bfcache — dua-duanya diperiksa, karena halaman yang dimuat
     ulang pun bisa keburu menggambar grid dari cache sesi sebelum
     setelan terbaru sempat dibaca. Lihat "MARGIN BASI SETELAH BFCACHE". */
  window.addEventListener("pageshow", segarkanSemuaGrid);
  /* Perubahan dari TAB/dokumen lain di perangkat yang sama. */
  window.addEventListener("storage", function (e) {
    if (!e || !e.key || e.key.indexOf("dikapay:margin") !== 0) return;
    segarkanSemuaGrid();
  });

  /* ---- Jalankan init dengan aman ------------------------------------
     Controller dulu memakai DOMContentLoaded SAJA. Kalau script data
     halaman sempat dieksekusi setelah event itu lewat (mis. dipindah ke
     <head>, diberi defer/async, atau di-cache), init TIDAK PERNAH jalan
     dan halaman ikut blank. onReady() menutup celah itu. */

  function onReady(fn) {
    if (typeof fn !== "function") return;
    var ran = false;
    function boot() {
      if (ran) return;
      ran = true;
      try { fn(); }
      catch (e) { console.error("produk-ui: init halaman gagal:", e); }
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }

  /* ---- Jaring error global -------------------------------------------
     Di WebView (Acode) console tidak selalu terlihat; tanpa ini error
     yang menghentikan render lolos tanpa jejak. Hanya mencatat. */

  window.addEventListener("error", function (e) {
    console.error("produk-ui: error tidak tertangkap:",
      e && e.message, e && e.filename, e && e.lineno);
  });
  window.addEventListener("unhandledrejection", function (e) {
    console.error("produk-ui: promise ditolak tanpa catch:", e && e.reason);
  });

  /* ---- Tombol back halaman ------------------------------------------ */

  function wireBack(app, btn) {
    if (!btn) return;
    function nav() {
      if (history.length > 1) history.back();
      else window.location.href = "../index.html";
    }
    btn.addEventListener("click", function () {
      if (RM || !app) { nav(); return; }
      if (app.classList.contains("is-leaving")) return;   // anti tap-ganda
      app.classList.add("is-leaving");

      /* Animasi keluar dijalankan penuh, LALU class dilepas, LALU navigasi.
         Class tidak pernah menempel lebih lama dari animasinya sendiri, jadi
         tidak mungkin ikut membeku ke bfcache. Snap-back setelah class
         dilepas tak sempat ter-paint karena nav() menyusul di tick yang
         sama. transitionend sebagai pemicu utama; setTimeout > 0.28s
         sebagai jaring kalau event tidak terkirim (mis. tab disembunyikan). */
      var done = false;
      function finish() {
        if (done) return;
        done = true;
        app.removeEventListener("transitionend", onEnd);
        app.classList.remove("is-leaving");
        nav();
      }
      function onEnd(e) {
        if (e.target === app && e.propertyName === "transform") finish();
      }
      app.addEventListener("transitionend", onEnd);
      window.setTimeout(finish, 340);
    });
  }

  window.DikaProdukUI = {
    RM: RM,
    /* Batas stagger animasi kartu — dibagi ke provider-page.js supaya
       angkanya satu sumber, bukan disalin. */
    MAKS_STAGGER: MAKS_STAGGER,
    createCari: createCari,
    fmtRupiah: fmtRupiah,
    fmtNumber: fmtNumber,
    brandVars: brandVars,
    createGrid: createGrid,
    createModal: createModal,
    createWarn: createWarn,
    createStatus: createStatus,
    createChoice: createChoice,
    createFilterHarga: createFilterHarga,
    createPicker: createPicker,
    createTabs: createTabs,
    filterGrup: filterGrup,
    registerOverlay: registerOverlay,
    anyOverlayOpen: anyOverlayOpen,
    showGangguan: showGangguan,
    wireBack: wireBack,
    onReady: onReady,
  };
})();
