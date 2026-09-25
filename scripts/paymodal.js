/* ===========================================================================
   DikaPay — paymodal.js
   Bottom sheet "Segera Hadir" (reusable). Dipakai untuk tombol PAY, dan lewat
   window.DikaComingSoon({ title, lines }) untuk fitur lain (Top Up, Transfer).
   Ilustrasi karakter datang dari illustrations.js (window.DikaIllus.wave()).
   =========================================================================== */

"use strict";

(function () {
  const DEFAULT = {
    title: "Scan & Pay",
    lines: [
      "Fitur Scan & Pay sedang kami siapkan dengan sepenuh hati 😊",
      "Belum bisa dipakai sekarang, tapi bakal hadir secepatnya biar transaksi kamu makin praktis. Terima kasih sudah sabar menunggu, ya!",
    ],
  };

  /* Karakter "Segera Hadir" — pose melambai dari illustrations.js.
     Dibangun lazy saat sheet pertama dibuka, jadi cukup illustrations.js
     sudah ter-load (urutan <script> di tiap halaman menjamin itu). */
  function charSvg() {
    if (window.DikaIllus) {
      return window.DikaIllus.wave({ label: "Karakter DikaPay melambai" });
    }
    console.error("paymodal: illustrations.js belum di-link");
    return "";
  }

  const CLOCK_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`;
  const GEAR_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M12 2v3.2M12 18.8V22M2 12h3.2M18.8 12H22M4.9 4.9l2.3 2.3M16.8 16.8l2.3 2.3M19.1 4.9l-2.3 2.3M7.2 16.8l-2.3 2.3"/></svg>`;

  const RM = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let overlay, sheet, toast, toastTimer, mounted = false, open = false;
  // true bila openSheet() sempat push 1 entri history sendiri. Tanpa ini, tombol
  // BACK Android saat sheet terbuka akan "nyasar" ke handler popstate halaman
  // (akun.js/margin.js/riwayat.js) — sheet tetap menutupi bottom nav (z-index 80
  // > 20) sementara konter back halaman jadi skew.
  let pushedHist = false;

  function build() {
    overlay = document.createElement("div");
    overlay.className = "paysheet-overlay";
    overlay.innerHTML = `
      <div class="paysheet" role="dialog" aria-modal="true" aria-label="Scan & Pay segera hadir">
        <span class="paysheet__handle" aria-hidden="true"></span>
        <div class="paysheet__illus" aria-hidden="true">
          <span class="paysheet__orbit paysheet__orbit--clock">${CLOCK_SVG}</span>
          <span class="paysheet__orbit paysheet__orbit--gear">${GEAR_SVG}</span>
          ${charSvg()}
        </div>
        <div class="paysheet__head">
          <span class="paysheet__badge">Segera Hadir</span>
          <h2 class="paysheet__title"></h2>
        </div>
        <div class="paysheet__bubble"></div>
        <div class="paysheet__actions">
          <button class="paysheet__btn paysheet__btn--primary" type="button" data-close>Oke, Mengerti</button>
          <button class="paysheet__btn paysheet__btn--text" type="button" data-remind>Ingatkan Saya Nanti</button>
        </div>
      </div>`;

    toast = document.createElement("div");
    toast.className = "paysheet-toast";
    toast.setAttribute("role", "status");

    document.body.appendChild(overlay);
    document.body.appendChild(toast);
    sheet = overlay.querySelector(".paysheet");
    mounted = true;
    wire();
  }

  function wire() {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeSheet();
    });
    overlay.querySelector("[data-close]").addEventListener("click", () => closeSheet());
    overlay.querySelector("[data-remind]").addEventListener("click", () => {
      closeSheet();
      showToast("Terima kasih, kami akan memberi tahu kamu!");
    });

    /* Swipe-to-dismiss dari handle & area ilustrasi */
    let startY = 0, dy = 0, dragging = false;
    const grab = [overlay.querySelector(".paysheet__handle"), overlay.querySelector(".paysheet__illus")];

    const onStart = (e) => {
      startY = e.touches[0].clientY;
      dy = 0;
      dragging = true;
      sheet.style.transition = "none";
    };
    const onMove = (e) => {
      if (!dragging) return;
      dy = Math.max(e.touches[0].clientY - startY, 0);
      sheet.style.transform = "translateY(" + dy + "px)";
      overlay.style.opacity = String(Math.max(1 - dy / 380, 0));
    };
    const onEnd = () => {
      if (!dragging) return;
      dragging = false;
      sheet.style.transition = "";
      if (dy > 90) {
        closeSheet();
      } else {
        sheet.style.transform = "";
        overlay.style.opacity = "";
      }
    };
    const onCancel = () => {
      if (!dragging) return;
      dragging = false;
      dy = 0;
      sheet.style.transition = "";
      sheet.style.transform = "";
      overlay.style.opacity = "";
    };
    grab.forEach((el) => {
      el.addEventListener("touchstart", onStart, { passive: true });
      el.addEventListener("touchmove", onMove, { passive: true });
      el.addEventListener("touchend", onEnd);
      el.addEventListener("touchcancel", onCancel, { passive: true });
    });
  }

  function fillContent(opts) {
    const title = (opts && opts.title) || DEFAULT.title;
    const lines = (opts && opts.lines) || DEFAULT.lines;
    sheet.querySelector(".paysheet__title").textContent = title;
    sheet.setAttribute("aria-label", title + " segera hadir");
    const bubble = sheet.querySelector(".paysheet__bubble");
    bubble.innerHTML = "";
    lines.forEach((txt) => {
      const p = document.createElement("p");
      p.textContent = txt;
      bubble.appendChild(p);
    });
  }

  function openSheet(opts) {
    if (!mounted) build();
    fillContent(opts);
    if (open) return;
    void overlay.offsetWidth; // reflow → transisi jalan
    overlay.classList.add("is-open");
    document.documentElement.style.overflow = "hidden";
    open = true;
    try { history.pushState({ dikaPaysheet: 1 }, ""); pushedHist = true; }
    catch (e) { pushedHist = false; }
    if (!RM) setTimeout(() => { try { sheet.querySelector("[data-close]").focus({ preventScroll: true }); } catch (e) {} }, 360);
  }

  function closeSheet(fromPop) {
    if (!open) return;
    open = false;
    overlay.classList.remove("is-open");
    sheet.style.transform = "";
    sheet.style.transition = "";
    overlay.style.opacity = "";
    document.documentElement.style.overflow = "";
    // Tutup normal (tombol / overlay / swipe / Esc) → mundurkan entri history
    // yang kita push. Kalau tutup DARI popstate, browser sudah mundur sendiri.
    var didPush = pushedHist;
    pushedHist = false;
    if (!fromPop && didPush) { try { history.back(); } catch (e) {} }
  }

  function showToast(msg) {
    if (!mounted) build();
    toast.textContent = msg;
    toast.classList.add("is-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("is-show"), 2400);
  }

  /* Tombol PAY (QRIS "Scan & Pay") DIHAPUS dari bottom navigation atas
     keputusan produk, jadi penyadap kliknya ikut dihapus — tidak ada lagi
     `.bottom-nav__pay` di halaman mana pun.

     MODULNYA SENDIRI TETAP DIPAKAI: `window.DikaComingSoon({title, lines})`
     masih dipanggil quick action "Top Up" di Beranda. Jangan ikut menghapus
     file ini. */

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSheet();
  });

  /* Tombol BACK Android / gestur back → tutup sheet dulu (bukan pindah halaman).
     Listener ini terdaftar sebelum handler popstate script halaman (urutan
     <script>), jadi sheet ditutup lebih dulu; handler halaman lalu tidak
     menemukan apa-apa untuk ditutup. */
  window.addEventListener("popstate", () => {
    if (open) closeSheet(true);
  });

  /* API publik: buka sheet dengan judul & pesan custom */
  window.DikaComingSoon = openSheet;
})();
