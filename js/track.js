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

    /* Hoehe des Tracks an die AKTIVE Ansicht anpassen.
       Panel 1 ist 16268px hoch, Panel 2 nur 9000px. Ohne Anpassung waere
       das Dokument immer 16268px hoch und man koennte in Panel 2 ab 9000px
       ins Leere scrollen. Statt die Scrollposition zu klemmen (das hat das
       Scrollen komplett blockiert), wird die Hoehe des Tracks gesetzt:
       die laengere, nicht sichtbare Ansicht wird durch overflow: clip
       abgeschnitten und traegt nicht mehr zur Dokumenthoehe bei. */
    function applyTrackHeight(i) {
      var panel = panels[i];
      if (!panel) return;
      var h = panel.offsetHeight;
      if (h > 0) track.style.height = h + "px";
      measurePanels();
    }

    function applyTransform(i) {
      /* Nur die aktive Ansicht darf oben liegen: die Panels ueberlappen
         sich vertikal (Panel 1 ist hoeher als Panel 2), sonst verdeckt
         das laengere Panel die kuerzere Ansicht. */
      panels.forEach(function (p, n) { p.classList.toggle("is-current", n === i); });
      applyTrackHeight(i);

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

      /* Scrollposition SOFORT auf den Anfang der Zielansicht setzen -
         nicht erst nach der Transition. Sonst steht man beim Schwenk
         noch auf der Scrollposition der alten Ansicht und sieht in
         Panel 2 eine leere Flaeche unterhalb des Videos. */
      if (viaClick) {
        try { window.scrollTo(0, 0); } catch (e) {}
      }

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
          var pr = heroVideo.play();
          if (pr && pr.catch) pr.catch(function () {});
        }
      }

      applyTransform(i);
      window.clearTimeout(timer);
      timer = window.setTimeout(function () {
        busy = false;
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

    /* --- Scrollbereich ---
       Der Track ist so hoch wie das HOECHSTE Panel (Panel 1). Beide
       Panels teilen sich diesen Bereich, deshalb ist in Panel 2 das
       Panel-Ende die natuerliche Untergrenze: weiter unten kommt nichts
       mehr.

       Hier wird bewusst NICHT geklemmt. Ein frueherer Versuch hat die
       Scrollposition per scrollTo zurueckgesetzt - das hat das Scrollen
       auf der ganzen Seite unterdrueckt (der Browser schrieb bei jedem
       Rad-Event zurueck), sodass sich die Seite nicht mehr bewegen
       liess. Stattdessen: das Panel ist genau so hoch wie sein Inhalt,
       und der Pfeil erscheint an seinem Ende. */
    var PANEL_END_PX = 160; // so nah am Ende gilt "angekommen"

    /* Endposition jeder Ansicht im Dokument (offsetTop + Hoehe), gemerkt
       beim Schwenk und bei Resize. So kann die Scroll-Pruefung bei jedem
       Scroll-Event laufen, ohne das Layout abzufragen - ein offsetHeight
       pro Scroll-Event wuerde Layout-Thrashing verursachen. */
    var endOffsets = [];
    function measurePanels() {
      endOffsets = panels.map(function (p) { return p.offsetTop + p.offsetHeight; });
    }

    /* --- Sichtbarkeit: der Pfeil erscheint erst am ENDE der Ansicht ---
       Gemessen wird die Scroll-Position, nicht ein Sentinel-Element:
       ein Element mit Hoehe 0 an der Dokumentunterkante meldet ein
       IntersectionObserver nie als sichtbar (es liegt exakt auf der
       Grenze), der Pfeil bliebe dauerhaft unsichtbar. */
    function atPanelEnd() {
      var end = endOffsets[current];
      if (end === undefined) return false;
      var seen = window.scrollY + window.innerHeight;
      return seen >= end - PANEL_END_PX;
    }

    function syncArrowVisibility() {
      var end = atPanelEnd();
      var arrow = end ? (current < panels.length - 1 ? next : prev) : null;
      [next, prev].forEach(function (el) {
        if (!el) return;
        var show = el === arrow && !el.hidden;
        el.classList.toggle("is-visible", show);
        el.setAttribute("aria-hidden", show ? "false" : "true");
        el.tabIndex = show ? 0 : -1;
      });
    }

    /* Direkt statt ueber requestAnimationFrame: die Pruefung liest kein
       Layout mehr (endOffsets ist gecacht), und ein rAF-Rueckruf laeuft
       nicht in jedem Kontext zuverlaessig - dann bliebe der Pfeil aus. */
    window.addEventListener("scroll", syncArrowVisibility, { passive: true });
    window.addEventListener("resize", function () {
      /* vh-basierte Abschnitte aendern ihre Hoehe mit dem Viewport. */
      applyTrackHeight(current);
      syncArrowVisibility();
    });
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
