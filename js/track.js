/* ==========================================================================
   Projekt-Track: vier Ansichten nebeneinander, Pfeile schieben seitlich

   Aufbau:

     [ Ansicht 1 ][ Ansicht 2 ][ Ansicht 3 ][ Ansicht 4 ]   <- 400vw breite Spur

   Die vier Ansichten stehen wie in der Live-Version nebeneinander in einer
   400vw breiten Spur. Sichtbar ist immer genau eine: die Spur wird per
   transform: translate3d(-i * 100vw, 0, 0) verschoben.

   Was ANDERS ist als frueher: Die Verschiebung haengt NICHT mehr an der
   Scrollposition (scroll-gescrubbter Schwenk). Frueher fuhr die Spur
   mit, wenn man runterscrollte - dadurch wirkte das Scrollen wie eine
   Seitwaertsbewegung. Jetzt scrollt die Seite nur noch vertikal, und die
   Ansicht wechselt nur, wenn man es ausloest:

     - Pfeil-Knoepfe links/rechts (css/viewnav.css)
     - Pfeiltasten links/rechts
     - freies Scrollen ueber eine Ansichtsgrenze hinweg

   In allen drei Faellen faehrt die Spur animiert zur Zielansicht
   (CSS-Transition auf .track, css/track.css) und rastet dort exact ein.

   Damit die Scrollposition weiterhin eindeutig sagt, welche Ansicht
   "dran" ist, bekommt jede Ansicht in der Scrollspur ihren eigenen
   vertikalen Platz: Die Ansichten stehen im Dokument untereinander
   (margin-top setzt dieses Script), obwohl sie visuell nebeneinander
   liegen. So bleiben die sticky-Pins der Abschnitte unberuehrt.

   Oeffentliche API (unveraendert, damit topbar.js und die Pruef-Skripte
   weiterlaufen):
     window.TurnTrack.init()
     window.TurnTrack.index            - aktive Ansicht (0 ... 3)
     window.TurnTrack.pan / .hold      - immer 0 (Reste der alten Mechanik;
                                          curtain.js und script.js lesen sie)
     window.TurnTrack.instance.goTo(i) - Wechsel in eine Ansicht
     window.TurnTrack.instance.tops    - Oberkanten in Dokumentkoordinaten
   ========================================================================== */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* So viele Pixel unterhalb einer Ansichtsgrenze gelten als "auf der
     ersten Bildschirmseite" - der Zurueck-Pfeil erscheint dann. */
  var START_ZONE = 0.45;

  /* Ab hier gilt die letzte Bildschirmseite eines Projekts als erreicht -
     der Weiter-Pfeil erscheint. */
  var END_ZONE = 0.85;

  /* Freies Scrollen: bleibt man innerhalb dieser Distanz vor einer
     Ansichtsgrenze stehen, zieht die Seite auf die Kante nach (und die
     Spur faehrt dabei zur naechsten Ansicht). */
  var SNAP_RATIO = 0.28;

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  function init() {
    var track = document.getElementById("track");
    if (!track) return null;

    var panels = Array.prototype.slice.call(track.querySelectorAll(".track__panel"));
    if (!panels.length) return null;

    var current = -1;
    var tops = [];
    var rafPending = false;
    var snapTimer = 0;
    var programmaticUntil = 0;

    var prevBtn = document.querySelector('[data-viewnav="prev"]');
    var nextBtn = document.querySelector('[data-viewnav="next"]');

    function vh() {
      return window.innerHeight || document.documentElement.clientHeight;
    }

    function scrollTop() {
      return window.scrollY || window.pageYOffset || 0;
    }

    function isInViewport(el) {
      var r = el.getBoundingClientRect();
      return r.bottom > 0 && r.top < vh();
    }

    /* Oberkanten der Ansichten in Dokumentkoordinaten.

       Die Ansichten liegen visuell nebeneinander; in der Scrollspur
       muessen sie untereinander liegen, sonst waere die Scrollposition
       nicht eindeutig. Deshalb bekommt Ansicht i den Versatz, den die
       Ansichten davor zusammen an Hoehe haben (margin-top, nicht
       transform: ein transform wuerde die sticky-Pins darin verschieben).

       Die Margins werden vor dem Messen zurueckgesetzt, damit die
       natuerlichen Hoehen gemessen werden. */
    function measure() {
      for (var i = 0; i < panels.length; i++) panels[i].style.marginTop = "0px";

      var y = 0;
      for (var j = 0; j < panels.length; j++) {
        tops[j] = Math.round(y);
        panels[j].style.marginTop = Math.round(y) + "px";
        y += panels[j].offsetHeight;
      }
    }

    /* Horizontale Verschiebung der Spur: Ansicht 0 = "none", sonst
       -i * 100vw. Die Transition auf .track laesst das Gleiten animieren. */
    function applyPan(i) {
      var next = i <= 0 ? "none" : "translate3d(" + (-i * 100) + "vw, 0, 0)";
      if (track.style.transform !== next) track.style.transform = next;
    }

    /* Nur die sichtbare Ansicht darf spielen und Ton haben: sonst laufen
       Hero und Serum gleichzeitig. */
    function setActive(i) {
      if (i === current) return;
      current = i;

      panels.forEach(function (el, n) {
        el.classList.toggle("is-current", n === i);
      });

      applyPan(i);

      if (window.SerumVideo) {
        window.SerumVideo.setAudible(i === 1);
        window.SerumVideo.setActive(i === 1);
      }

      var heroVideo = document.getElementById("video-2");
      if (heroVideo) {
        if (i > 0) {
          if (!heroVideo.paused) heroVideo.pause();
        } else if (heroVideo.paused && !heroVideo.ended && isInViewport(heroVideo)) {
          var pr = heroVideo.play();
          if (pr && pr.catch) pr.catch(function () {});
        }
      }
    }

    /* Welche Ansicht ist aktiv? Die, deren Oberkante als letzte ueber der
       aktuellen Scrollposition liegt (2px Toleranz). */
    function indexAt(y) {
      var k = 0;
      for (var i = 0; i < tops.length; i++) {
        if (tops[i] <= y + 2) k = i;
      }
      return k;
    }

    /* Pfeile: links nur auf der ersten Bildschirmseite eines Projekts
       (und nicht im ersten Projekt), rechts nur auf der letzten
       Bildschirmseite (und nicht im letzten Projekt). */
    function syncArrows(k) {
      var y = scrollTop();
      var startZone = k > 0 && y <= tops[k] + vh() * START_ZONE;
      var endZone = k < panels.length - 1 && y >= tops[k + 1] - vh() * END_ZONE;

      if (prevBtn) {
        prevBtn.classList.toggle("is-visible", startZone);
        prevBtn.setAttribute("aria-hidden", startZone ? "false" : "true");
        prevBtn.tabIndex = startZone ? 0 : -1;
      }
      if (nextBtn) {
        nextBtn.classList.toggle("is-visible", endZone);
        nextBtn.setAttribute("aria-hidden", endZone ? "false" : "true");
        nextBtn.tabIndex = endZone ? 0 : -1;
      }
    }

    /* Wechsel in Ansicht i. Die Scrollposition springt sofort an die
       Oberkante der Zielansicht (damit deren Inhalt ab dem ersten Pixel
       stimmt), sichtbar bewegt sich nur die Spur nach links - der
       Projektwechsel ist also eine reine Seitenbewegung.

       Warum ohne weiches Scrollen: die Zielansicht ist beim Sprung noch
       ausserhalb des Bildes; ein animiertes Scrollen waere als
       vertikales Rutschen zu sehen und genau das soll der Wechsel nicht
       sein. */
    function goTo(i) {
      if (i < 0 || i >= panels.length) return;

      programmaticUntil = Date.now() + 700;

      var target = Math.round(tops[i] === undefined ? 0 : tops[i]);
      try {
        window.scrollTo({ top: target, behavior: "auto" });
      } catch (e) {
        window.scrollTo(0, target);
      }

      setActive(i);
      syncArrows(i);
      update();
    }

    /* Freies Scrollen: bleibt man kurz vor einer Ansichtsgrenze stehen,
       auf die Kante nachziehen. Nur in der Naehe, damit das Lesen
       innerhalb einer Ansicht nicht gestoert wird. */
    function maybeSnap() {
      if (Date.now() < programmaticUntil) return;
      var y = scrollTop();
      /* Ganz unten nicht nachziehen: die letzte Sektion ist niedriger als
         der Bildschirm - das wuerde vom Seitenende wegziehen. */
      if (y >= document.documentElement.scrollHeight - vh() - 2) return;

      var reach = Math.max(120, Math.min(320, vh() * SNAP_RATIO));
      var best = -1;
      var bestD = reach + 1;
      for (var i = 1; i < tops.length; i++) {
        var d = Math.abs(tops[i] - y);
        if (d <= reach && d < bestD) {
          bestD = d;
          best = i;
        }
      }
      if (best < 0 || bestD < 1) return;

      programmaticUntil = Date.now() + 700;
      window.scrollTo({
        top: Math.round(tops[best]),
        behavior: reduceMotion ? "auto" : "smooth"
      });
    }

    function update() {
      rafPending = false;
      var k = indexAt(scrollTop());
      setActive(k);
      syncArrows(k);
    }

    function schedule() {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(update);
    }

    function onScroll() {
      schedule();
      clearTimeout(snapTimer);
      snapTimer = setTimeout(maybeSnap, 160);
    }

    /* Tief-Links (#serum, #curtain-view, ...) sollen weiterhin funktionieren. */
    function jumpForHash() {
      var hash = window.location.hash;
      if (!hash || hash.length < 2) return;
      var target = document.getElementById(hash.slice(1));
      if (!target) return;
      var y = target.getBoundingClientRect().top + scrollTop();
      window.scrollTo(0, Math.max(0, Math.round(y)));
    }

    prevBtn && prevBtn.addEventListener("click", function () {
      goTo(indexAt(scrollTop()) - 1);
    });
    nextBtn && nextBtn.addEventListener("click", function () {
      goTo(indexAt(scrollTop()) + 1);
    });

    window.addEventListener("scroll", onScroll, { passive: true });

    window.addEventListener("resize", function () {
      measure();
      schedule();
    });

    window.addEventListener("load", function () {
      measure();
      schedule();
    });

    window.addEventListener("hashchange", function () {
      measure();
      jumpForHash();
      schedule();
    });

    if ("ResizeObserver" in window) {
      var ro = new ResizeObserver(function () {
        measure();
        schedule();
      });
      panels.forEach(function (el) { ro.observe(el); });
    }

    /* Pfeiltasten: eine Ansicht weiter (wie die Pfeil-Knoepfe). */
    window.addEventListener("keydown", function (e) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      var t = e.target;
      if (t && (t.matches && (t.matches("input, textarea, select") || t.isContentEditable))) return;
      var k = indexAt(scrollTop());
      var next = k + (e.key === "ArrowRight" ? 1 : -1);
      if (next < 0 || next >= panels.length) return;
      e.preventDefault();
      goTo(next);
    });

    measure();
    jumpForHash();

    /* Beim Laden (auch mit wiederhergestellter Scrollposition) soll die
       Spur sofort an der richtigen Stelle stehen und nicht erst
       hereingleiten. */
    track.style.transition = "none";
    update();
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { track.style.transition = ""; });
    });

    var api = {
      goTo: goTo,
      get index() { return current; },
      /* Oberkanten in Dokumentkoordinaten (js/script.js braucht sie fuer
         die Einblend-Logik des Serum-Titel-Overlays). */
      get tops() { return tops.slice(); }
    };

    window.TurnTrack.instance = api;
    try {
      Object.defineProperty(window.TurnTrack, "index", {
        get: function () { return current; },
        configurable: true
      });
      /* Reste der alten Schwenk-Mechanik: curtain.js und js/script.js
         lesen sie als Versatz. Ohne Schwenk sind sie 0. */
      Object.defineProperty(window.TurnTrack, "pan", {
        get: function () { return 0; },
        configurable: true
      });
      Object.defineProperty(window.TurnTrack, "hold", {
        get: function () { return 0; },
        configurable: true
      });
    } catch (e) {}

    return api;
  }

  window.TurnTrack = { init: init };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();