/* ==========================================================================
   Endseite / Visitenkarte: Wortmarke einpassen, E-Mail kopieren, "Nach oben"

   Die Sektion steht als letztes Kind von .track__panel--4 (index.html
   direkt nach #music). Sie ist reine Typo - kein Scroll-Scrub, kein
   Pinning; die Formen kommen aus css/endcard.css.
   ========================================================================== */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var isEn = document.documentElement.lang === "en";

  /* ---------- Wortmarke auf die Spaltenbreite einpassen ------------------
     Die Referenz setzt ihre Wortmarke per JS auf 98 % der Spaltenbreite
     (Archivo hat eine Breitenachse, Jost nicht). Deshalb hier derselbe
     Trick mit einer Messung: Text bei 100px messen, dann die Schriftgroesse
     so skalieren, dass er knapp in die Spalte passt. */
  function initWordmark() {
    var section = document.querySelector(".endcard");
    var mark = section ? section.querySelector(".endcard__mark") : null;
    var inner = section ? section.querySelector(".endcard__inner") : null;
    if (!mark || !inner) return;

    function fitWidth(avail) {
      /* Der <p> ist ein Block: scrollWidth waere immer die Spaltenbreite,
         nicht die Textbreite. Deshalb fuer die Messung inline-block +
         max-content - dann misst der Block genau den Text. */
      mark.style.display = "inline-block";
      mark.style.width = "max-content";
      mark.style.fontSize = "100px";
      var w = mark.getBoundingClientRect().width;
      if (!w) return;
      var size = Math.max(18, (100 * avail) / w * 0.985);
      mark.style.fontSize = size.toFixed(2) + "px";
    }

    /* Die Karte ist genau eine Bildschirmhoehe hoch (css/endcard.css);
       die Fusszeile muss unten im Bild stehen. Auf flachen Fenstern passt
       der Text in der Breiten-Einpassung nicht in die Hoehe - dann wird
       die Wortmarke Schritt fuer Schritt kleiner, bis Titel, Kontakt,
       Wortmarke und Fusszeile in einen Screen passen. 1,14 = Zeilenhoehe
       1 plus Unterlaengen-Padding .14em, also Hoehe je Schriftgroesse. */
    function fitHeight() {
      for (var n = 0; n < 8; n++) {
        var over = section.scrollHeight - window.innerHeight;
        if (over <= 1) return;
        var size = parseFloat(mark.style.fontSize) || 100;
        var next = size - over / 1.14;
        if (next < 16) next = 16;
        if (next >= size) return;
        mark.style.fontSize = next.toFixed(2) + "px";
      }
    }

    /* Schluessel aus Spaltenbreite und Fensterhoehe: der ResizeObserver
       am inneren Block feuert auch, wenn wir selbst die Wortmarke
       verkleinert haben - ohne den Vergleich wuerde sich fit() endlos
       selbst nachziehen. */
    var lastKey = "";

    var fit = function () {
      var avail = inner.clientWidth;
      if (!avail) return;
      var key = avail + "x" + window.innerHeight;
      if (key === lastKey) return;
      lastKey = key;
      fitWidth(avail);
      fitHeight();
    };

    fit();

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        /* Nach dem Laden der Schrift sitzen die Zeilen anders: neu messen. */
        lastKey = "";
        fit();
      }).catch(function () {});
    }
    window.addEventListener("resize", fit);
    var ro = window.ResizeObserver && new ResizeObserver(fit);
    if (ro) ro.observe(inner);
  }

  /* ---------- E-Mail kopieren -------------------------------------------
     Kein mailto (wie in der Referenz): die Adresse steht als Text da und
     wird per Knopf kopiert. Ohne Clipboard-API (alte Browser, unsicherer
     Kontext) faellt es auf die Textauswahl zurueck. */
  function initCopy() {
    var buttons = document.querySelectorAll(".endcard__copy");
    Array.prototype.forEach.call(buttons, function (button) {
      var targetId = button.getAttribute("data-copy-target");
      var target = targetId ? document.getElementById(targetId) : null;
      if (!target) return;
      var defaultLabel = button.textContent;
      var resetTimer = 0;

      function feedback(text, ok) {
        button.textContent = text;
        button.classList.toggle("is-copied", !!ok);
        clearTimeout(resetTimer);
        resetTimer = setTimeout(function () {
          button.textContent = defaultLabel;
          button.classList.remove("is-copied");
        }, 1600);
      }

      button.addEventListener("click", function () {
        var value = target.textContent.trim();
        var done = function () { feedback(isEn ? "Copied" : "Kopiert", true); };
        var fail = function () {
          /* Fallback: Text markieren, dann execCommand. */
          try {
            var range = document.createRange();
            range.selectNodeContents(target);
            var sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            if (document.execCommand("copy")) { done(); return; }
          } catch (e) {}
          feedback(isEn ? "Please copy manually" : "Bitte manuell kopieren", false);
        };

        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(value).then(done, fail);
        } else {
          fail();
        }
      });
    });
  }

  /* ---------- "Nach oben" ------------------------------------------------ */
  function initTop() {
    var buttons = document.querySelectorAll(".endcard__top");
    Array.prototype.forEach.call(buttons, function (button) {
      button.addEventListener("click", function () {
        var behavior = reduceMotion ? "auto" : "smooth";
        try {
          window.scrollTo({ top: 0, behavior: behavior });
        } catch (e) {
          window.scrollTo(0, 0);
        }
        /* Fokus zurueck auf den Seitenanfang, damit Tastaturnutzer nicht
           am Seitenende stehen bleiben. */
        var hero = document.querySelector(".stage__title");
        if (hero) {
          hero.setAttribute("tabindex", "-1");
          hero.focus({ preventScroll: true });
        }
      });
    });
  }

  function init() {
    initWordmark();
    initCopy();
    initTop();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();