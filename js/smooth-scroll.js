/* ==========================================================================
   Smooth-Scroll-Schicht (Lenis 1.1.13) — Testbranch feature/smooth-scroll-lenis
   ==========================================================================

   Zweck: das Scrollen des Portfolios auf die gedämpfte Kurve der
   Referenzseite (dejvidkavazovic.com) umstellen, ohne die uebrigen Skripte
   direkt gegen Lenis programmieren zu lassen.

   A/B-Schalter (zum Vergleich im selben Browser):
     ?lenis=0   Schicht aus  -> exakt das bisherige native Scrollen
     ?lenis=1   Schicht an   (Default)
   Ohne Parameter ist die Schicht aktiv. Bei prefers-reduced-motion: reduce
   ist sie IMMER aus.

   Wichtige Begleitumstaende (siehe Kommentare unten):
   - track.js scrollt an mehreren Stellen selbst (Snap, Track-Grenzen,
     Deep-Links). Diese Aufrufe laufen ueber window.SmoothScroll, sonst
     kaempfen Lenis und track.js um dieselbe Position.
   - Overlays, die selbst scrollen (Showroom, Bildansicht, Tool-Dialog,
     Live-Abdeckung), tragen data-lenis-prevent. Das ist notwendig, weil
     Lenis im gestoppten Zustand preventDefault auf Wheel-Events aufruft und
     das Scrollen IN diesen Overlays sonst blockieren wuerde.
   ========================================================================== */
(function () {
  "use strict";

  var root = document.documentElement;
  var reduce = false;
  try {
    reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) {}

  /* --- A/B-Schalter aus der URL ---------------------------------------- */
  var forced = null;
  try {
    var m = /[?&]lenis=(0|1)(?:&|$)/.exec(window.location.search);
    if (m) forced = m[1] === "1";
  } catch (e) {}
  var wanted = forced === null ? true : forced;

  /* --- Lenis starten ---------------------------------------------------- */
  var lenis = null;
  var enabled = false;

  if (wanted && !reduce && typeof window.Lenis === "function") {
    try {
      lenis = new window.Lenis({
        lerp: 0.09,          /* identisch zur Referenz: 8,6 %/Frame @60 Hz */
        smoothWheel: true,   /* Touch bleibt nativ (syncTouch: false) */
        autoResize: true
      });
      enabled = true;
      root.classList.add("has-lenis");
      /* Eigene rAF-Schleife statt autoRaf (gibt es in 1.1.13 noch nicht). */
      (function raf(t) {
        lenis.raf(t);
        window.requestAnimationFrame(raf);
      })(0);
    } catch (e) {
      lenis = null;
      enabled = false;
    }
  }

  /* --- Scroll-Inseln abkoppeln ----------------------------------------- */
  /* Diese Elemente scrollen selbst. Ohne data-lenis-prevent wuerde Lenis
     ihre Wheel-Events virtualisieren (Seite statt Overlay scrollt). */
  /* Die Overlays stehen im Markup NACH diesen Skript-Tags (#showroom,
     #imageviewer), existieren hier also noch nicht. Deshalb zusaetzlich nach
     dem Parsen erneut markieren. Die Funktion ist idempotent. */
  function markPrevent() {
    var sels = [".imageviewer", ".showroom", ".tool-dialog", ".live__cover"];
    for (var i = 0; i < sels.length; i++) {
      var list = document.querySelectorAll(sels[i]);
      for (var j = 0; j < list.length; j++) {
        list[j].setAttribute("data-lenis-prevent", "");
      }
    }
  }
  markPrevent();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", markPrevent);
  } else {
    markPrevent();
  }

  /* --- Seitliche Scroll-Sperre spiegeln -------------------------------- */
  /* showroom.js und imageviewer.js setzen html.is-locked. Lenis muss dann
     stehen; das Overlay selbst scrollt dank data-lenis-prevent weiter. */
  if (enabled && window.MutationObserver) {
    new MutationObserver(function () {
      if (root.classList.contains("is-locked")) lenis.stop();
      else lenis.start();
    }).observe(root, { attributes: true, attributeFilter: ["class"] });
  }

  /* --- Schmale API fuer die uebrigen Skripte --------------------------- */
  window.SmoothScroll = {
    enabled: enabled,
    lenis: lenis,

    y: function () {
      return window.scrollY || window.pageYOffset || 0;
    },

    /* y setzen. opts.immediate = Sprung, opts.duration = Sekunden. */
    to: function (y, opts) {
      opts = opts || {};
      if (enabled) {
        if (opts.duration) lenis.scrollTo(y, { duration: opts.duration, force: true });
        else lenis.scrollTo(y, { immediate: true, force: true });
        return;
      }
      if (opts.duration) {
        try {
          window.scrollTo({ top: y, behavior: "smooth" });
          return;
        } catch (e) {}
      }
      window.scrollTo(0, y);
    },

    by: function (dy) {
      if (enabled) {
        lenis.scrollTo(this.y() + dy, { immediate: true, force: true });
        return;
      }
      window.scrollBy(0, dy);
    },

    stop: function () { if (enabled) lenis.stop(); },
    start: function () { if (enabled) lenis.start(); }
  };
})();
