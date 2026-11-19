/* ==========================================================================
   Schwenk zwischen den Projekt-Ansichten

   Ein Klick auf den Pfeil faehrt den Track um genau eine Ansicht nach
   links bzw. rechts. Der Pfeil erscheint erst am Ende der jeweiligen
   Ansicht.

   Zwei Fallen, die dieser Code umgeht:

   1) transform auf dem Track macht ihn zum Containing Block. Ein
      position:sticky-Element darin pinnt dann nicht mehr am Viewport,
      sondern am Track - die Morph-Abschnitte wuerden brechen.
      Deshalb wird transform NUR waehrend der Fahrt gesetzt und danach
      auf "none" zurueckgesetzt. Weil "none" die Transition sofort
      springen liesse, wird die Transition fuer den Reset kurz
      abgeschaltet (.is-idle).

   2) position:fixed-Elemente (der Pfeil, .face-fly) richten sich sonst
      am Track aus und wandern mit. Der Pfeil liegt deshalb AUSSERHALB
      des Tracks im DOM.

   Oeffentliche API: window.TurnTrack.init()
   ========================================================================== */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var SLIDE_MS = 800;

  function init() {
    var track = document.getElementById("track");
    if (!track) return null;

    var prev = document.getElementById("turnPrev");
    var next = document.getElementById("turnNext");
    var panels = Array.prototype.slice.call(track.querySelectorAll(".track__panel"));
    if (!panels.length) return null;

    var current = 0;
    var busy = false;
    var timer = null;

    function applyTransform(i) {
      /* Nur die aktive Ansicht darf oben liegen: die Panels ueberlappen
         sich vertikal (Panel 1 ist hoeher als Panel 2), sonst verdeckt
         das laengere Panel die kuerzere Ansicht. */
      panels.forEach(function (p, n) { p.classList.toggle("is-current", n === i); });

      if (i === 0) {
        /* Kein transform -> kein Containing Block -> sticky pinnt wieder
           normal. Der Reset muss ohne Transition passieren. */
        track.classList.add("is-idle");
        track.style.transform = "none";
        /* Reflow erzwingen, damit der naechste Schwenk nicht vom
           transition:none verschluckt wird. */
        void track.offsetWidth;
        track.classList.remove("is-idle");
      } else {
        track.style.transform = "translateX(" + (-100 * i) + "vw)";
      }
      updateArrows(i);
      syncArrowVisibility();
    }

    function updateArrows(i) {
      /* Hier wird nur die grundsaetzliche Zustaendigkeit geklaert: auf
         Panel 1 gibt es keinen Zurueck-Pfeil, auf dem letzten Panel
         keinen Weiter-Pfeil. Ob der zustaendige Pfeil tatsaechlich
         sichtbar ist, entscheidet syncArrowVisibility() anhand der
         Scroll-Position. */
      if (prev) {
        var allowPrev = i > 0;
        prev.hidden = !allowPrev;
        if (!allowPrev) {
          prev.classList.remove("is-visible");
          prev.setAttribute("aria-hidden", "true");
          prev.tabIndex = -1;
        }
      }
      if (next) {
        var allowNext = i < panels.length - 1;
        next.hidden = !allowNext;
        if (!allowNext) {
          next.classList.remove("is-visible");
          next.setAttribute("aria-hidden", "true");
          next.tabIndex = -1;
        }
      }
    }

    function goTo(i, viaClick) {
      i = Math.max(0, Math.min(panels.length - 1, i));
      if (busy || i === current) return;
      busy = true;
      current = i;

      /* Nur die sichtbare Ansicht darf spielen und Ton haben: sonst
         laufen Hero und Serum gleichzeitig. Das Serum-Video wird direkt
         angestossen - ein IntersectionObserver meldet es beim reinen
         Seitwaerts-Schwenk nicht zuverlaessig (die Seite scrollt dabei
         nicht), der erste Frame blieb sonst stehen. */
      if (window.SerumVideo) {
        window.SerumVideo.setAudible(i > 0);
        window.SerumVideo.setActive(i > 0);
      }
      var heroVideo = document.getElementById("video-2");
      if (heroVideo) {
        if (i > 0) {
          if (!heroVideo.paused) heroVideo.pause();
          if (!heroVideo.muted) heroVideo.muted = true;
        } else if (heroVideo.paused && !heroVideo.ended) {
          /* Zurueck auf Panel 1: den Hero wieder anlaufen lassen, sofern
             er ueberhaupt schon gestartet war (sonst uebernimmt das
             Scroll-Scrubbing in script.js). */
          var pr = heroVideo.play();
          if (pr && pr.catch) pr.catch(function () {});
        }
      }

      applyTransform(i);
      window.clearTimeout(timer);
      timer = window.setTimeout(function () {
        busy = false;
        /* Am Ziel nach oben: sonst landet man mitten in den Notizen der
           vorigen Ansicht bzw. in Panel 2 unterhalb des Videos. */
        if (viaClick) {
          window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
        }
        clampScrollToPanel(i);
      }, reduceMotion ? 0 : SLIDE_MS);
    }

    if (next) next.addEventListener("click", function () { goTo(current + 1, true); });
    if (prev) prev.addEventListener("click", function () { goTo(current - 1, true); });

    /* Pfeile sind per Tastatur erreichbar, solange sie sichtbar sind.
       Achtung: der Showroom (js/showroom.js) belegt dieselben Tasten zum
       Blaettern durch die Videos. Ist ein Dialog offen, gehoeren ihm die
       Pfeile - sonst wuerde gleichzeitig geblaettert UND geschwenkt. */
    window.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      var t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (document.querySelector(".showroom:not([hidden])")) return; // Showroom hat Vorrang
      if (t && t.closest && t.closest(".showroom")) return;
      goTo(current + (e.key === "ArrowRight" ? 1 : -1), true);
    });

    /* Beim Laden einer Ansicht mit Hash direkt dorthin springen:
       #serum o. ae. liegt in Panel 2. */
    function jumpForHash() {
      var h = window.location.hash;
      if (!h) return;
      var target = document.querySelector(h);
      if (!target) return;
      var panel = target.closest ? target.closest(".track__panel") : null;
      if (!panel) return;
      var idx = panels.indexOf(panel);
      if (idx > 0) {
        applyTransform(idx);
        current = idx;
      }
    }
    jumpForHash();
    window.addEventListener("hashchange", jumpForHash);

    /* --- Scrollbereich je Ansicht ---
       Beide Panels liegen nebeneinander, teilen sich aber den vertikalen
       Scrollbereich des Tracks - und der ist so hoch wie das HOECHSTE
       Panel. Panel 2 ist deutlich kuerzer als Panel 1 (Serum ~9000px,
       Track 1 ~16268px). Ohne Klammerung koennte man in Panel 2 ueber
       dessen Ende hinaus scrollen und saehe leeren Raum. */
    function panelScrollMax(i) {
      var panel = panels[i];
      if (!panel) return 0;
      return Math.max(0, panel.offsetHeight - window.innerHeight);
    }

    function clampScrollToPanel(i) {
      var max = panelScrollMax(i);
      if (window.scrollY > max) window.scrollTo(0, max);
    }

    /* --- Sichtbarkeit: der Pfeil erscheint erst am ENDE der Ansicht ---
       Gemessen wird die Scroll-Position, nicht ein Sentinel-Element:
       ein Element mit Hoehe 0 an der Dokumentunterkante meldet ein
       IntersectionObserver nie als sichtbar (es liegt exakt auf der
       Grenze), der Pfeil bliebe dauerhaft unsichtbar. */
    var PANEL_END_PX = 160; // so nah am Ende gilt "angekommen"

    function atPanelEnd() {
      var panel = panels[current];
      if (!panel) return false;
      var end = panel.offsetTop + panel.offsetHeight;
      var seen = window.scrollY + window.innerHeight;
      return seen >= end - PANEL_END_PX;
    }

    function syncArrowVisibility() {
      var end = atPanelEnd();
      var arrow = end ? (current < panels.length - 1 ? next : prev) : null;
      [[next], [prev]].forEach(function (pair) {
        var el = pair[0];
        if (!el) return;
        var show = el === arrow && !el.hidden;
        el.classList.toggle("is-visible", show);
        el.setAttribute("aria-hidden", show ? "false" : "true");
        el.tabIndex = show ? 0 : -1;
      });
    }

    var arrowTicking = false;
    function requestArrowSync() {
      if (arrowTicking) return;
      arrowTicking = true;
      requestAnimationFrame(function () {
        arrowTicking = false;
        /* Nur klemmen, wenn Panel 2 kuerzer ist als der Track - sonst
           wuerde hier bei jedem Scroll reagiert. */
        if (panels[current] && panels[current].offsetHeight < track.offsetHeight) {
          clampScrollToPanel(current);
        }
        syncArrowVisibility();
      });
    }
    window.addEventListener("scroll", requestArrowSync, { passive: true });
    window.addEventListener("resize", requestArrowSync);
    syncArrowVisibility();

    applyTransform(0);
    return { goTo: goTo, get index() { return current; } };
  }

  window.TurnTrack = { init: init };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
