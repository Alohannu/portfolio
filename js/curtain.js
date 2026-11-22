/* ==========================================================================
   Ansicht 3: Vorhang - eggo, AI Sunglass Brand

   Uebernommen aus dem Referenzstand (portfolio-yytrieu/js/script.js,
   Abschnitt "Vorhang (Scrollfortschritt 1:1, ohne Easing, umkehrbar)").

   Anpassungen fuer diese Seite:

   1. Die Bilder fahren erst, wenn die Buehne wirklich ankommt: gemessen
      wird ab ihrer Oberkante am Viewport-Top. (Frueher lag die Ansicht
      beim Schwenk schon eine Strecke hoeher in der Spur; diese
      Schwenkstrecke wurde hier abgezogen. Mit der vertikalen Navigation
      gibt es sie nicht mehr - die Ansicht steht an ihrer Stelle.)

   2. Die Buehne wird nicht ueber einen IntersectionObserver stillgelegt,
      sondern nur dann gerechnet, wenn Ansicht 3 ueberhaupt in der Naehe
      ist. Der Beobachter ist aber derselbe wie im Referenzstand.
   ========================================================================== */

(function () {
  "use strict";

  var curtain = document.getElementById("curtain");
  if (!curtain) return;

  var overlay = document.getElementById("curtainOverlay");
  var imgs = [2, 3].map(function (n) {
    return curtain.querySelector(".curtain__img--" + n);
  });

  var FADE = 0.5;   // Titel und Abdunklung sind nach 50 % der ersten Bildschirmhoehe weg
  var ticking = false;
  var active = true;
  var last = -1;

  function clamp(v, a, b) {
    return v < a ? a : (v > b ? b : v);
  }

  function update() {
    ticking = false;

    var vh = window.innerHeight;
    if (!vh) return;

    /* 0-1: Bild 2 faehrt hoch, 1-2: Bild 3. */
    var offset = clamp(-curtain.getBoundingClientRect().top / vh, 0, 2);
    if (offset === last) return;   // nur bei Aenderung schreiben
    last = offset;

    imgs.forEach(function (img, i) {
      if (!img) return;
      var t = clamp(offset - i, 0, 1);
      img.style.clipPath = "inset(" + ((1 - t) * 100).toFixed(3) + "% 0 0 0)";
    });

    if (overlay) {
      overlay.style.opacity = (1 - clamp(offset / FADE, 0, 1)).toFixed(3);
    }
  }

  function request() {
    if (!active || ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }

  window.addEventListener("scroll", request, { passive: true });
  window.addEventListener("resize", function () {
    last = -1;
    request();
  });
  /* Nach load noch einmal rechnen: dann stehen die Buehnenhoehen fest. */
  window.addEventListener("load", function () {
    last = -1;
    request();
  });

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      active = entries[entries.length - 1].isIntersecting;
      if (active) request();
    }, { threshold: 0, rootMargin: "100px 0px 100px 0px" }).observe(curtain);
  }

  update();
})();
