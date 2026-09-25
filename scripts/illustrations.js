/* ===========================================================================
   DikaPay — illustrations.js
   Karakter ilustrasi BERSAMA (flat design, karakter ceria memegang HP).
   SATU-SATUNYA sumber karakter DikaPay — jangan tulis ulang SVG karakter
   di HTML atau di modul lain.

     window.DikaIllus.phone(opts)  -> banner beranda        (class .hero-person)
     window.DikaIllus.wave(opts)   -> modal "Segera Hadir"  (class .paysheet__char)
     window.DikaIllus.character({ pose, className, label, uid })

   Kedua pose memakai ILUSTRASI YANG SAMA; yang beda hanya class-nya, supaya
   animasi CSS per tempat (floatChar / payFloat) tetap jalan.

   viewBox 0 0 380 460 (rasio ±0,826). Ukuran diatur lewat CSS:
     .hero-person   -> width 140px  (tinggi ±169px, muat di banner 178px)
     .paysheet__char-> height 100%  (mengikuti .paysheet__illus 162px)

   WARNA DI DALAM SVG TIDAK BOLEH DIUBAH — ini aset yang diberikan apa adanya.
   =========================================================================== */

(function () {
  "use strict";

  var VIEWBOX = "0 0 380 460";

  /* Isi ilustrasi — disalin apa adanya, fill tidak diubah. */
  var BODY =
    '<circle cx="190" cy="220" r="170" fill="#0B2447"/>' +
    '<circle cx="290" cy="130" r="60" fill="#123566"/>' +
    '<circle cx="90" cy="320" r="50" fill="#123566"/>' +
    '<ellipse cx="190" cy="410" rx="90" ry="14" fill="#08142c" opacity="0.4"/>' +
    '<path d="M140 300 L150 420 L170 420 L175 310 Z" fill="#1c2b4a"/>' +
    '<path d="M210 310 L215 420 L235 420 L245 300 Z" fill="#1c2b4a"/>' +
    '<path d="M130 180 Q130 150 190 150 Q250 150 250 180 L255 300 Q255 320 190 320 Q125 320 125 300 Z" fill="#3AAFA9"/>' +
    '<path d="M150 175 L110 240 Q105 250 115 258 L125 265 Q135 270 142 258 L178 195 Z" fill="#F2A65A"/>' +
    '<circle cx="112" cy="252" r="16" fill="#FFC93C"/>' +
    '<rect x="95" y="238" width="30" height="46" rx="6" fill="#1a1a1a" transform="rotate(-18 110 260)"/>' +
    '<rect x="98" y="242" width="24" height="34" rx="3" fill="#4FD1FF" transform="rotate(-18 110 260)"/>' +
    '<path d="M232 175 L268 220 Q276 230 268 240 L255 250 Q245 255 238 245 L205 195 Z" fill="#F2A65A"/>' +
    '<circle cx="262" cy="228" r="15" fill="#F2A65A"/>' +
    '<path d="M250 213 Q262 200 275 213 Q270 226 262 232 Q254 226 250 213 Z" fill="#F2A65A"/>' +
    '<circle cx="190" cy="130" r="52" fill="#F2A65A"/>' +
    '<path d="M140 115 Q140 68 190 68 Q240 68 240 115 L240 108 Q225 78 190 82 Q155 78 140 108 Z" fill="#1a1a1a"/>' +
    '<path d="M140 108 Q136 130 145 148 L150 118 Z" fill="#1a1a1a"/>' +
    '<path d="M240 108 Q244 130 235 148 L230 118 Z" fill="#1a1a1a"/>' +
    '<circle cx="172" cy="132" r="5" fill="#1a1a1a"/>' +
    '<circle cx="208" cy="132" r="5" fill="#1a1a1a"/>' +
    '<path d="M170 152 Q190 168 210 152" stroke="#1a1a1a" stroke-width="3" fill="none" stroke-linecap="round"/>' +
    '<circle cx="165" cy="145" r="8" fill="#e8895f" opacity="0.5"/>' +
    '<circle cx="215" cy="145" r="8" fill="#e8895f" opacity="0.5"/>' +
    '<circle cx="240" cy="180" r="6" fill="#FFC93C"/>' +
    '<circle cx="130" cy="200" r="4" fill="#FFC93C"/>' +
    '<circle cx="270" cy="260" r="5" fill="#FFC93C"/>';

  function character(opts) {
    opts = opts || {};
    var pose = opts.pose === "phone" ? "phone" : "wave";
    var cls = opts.className || (pose === "phone" ? "hero-person" : "paysheet__char");
    var label = opts.label || "Ilustrasi karakter DikaPay";

    return '<svg class="' + cls + '" viewBox="' + VIEWBOX + '" role="img" aria-label="' +
      label + '">' + BODY + "</svg>";
  }

  window.DikaIllus = {
    VIEWBOX: VIEWBOX,
    character: character,
    phone: function (o) { o = o || {}; o.pose = "phone"; return character(o); },
    wave: function (o) { o = o || {}; o.pose = "wave"; return character(o); },
  };
})();
