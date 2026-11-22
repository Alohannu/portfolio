/* ==========================================================================
   Projekt-Ansichten: vier Sektionen untereinander, Pfeile statt Schwenk

   Aufbau (frueher anders, deshalb hier die Begruendung):

   Frueher lagen die vier Ansichten NEBENEINANDER im vierfach breiten
   Track und wurden per transform: translateX() seitlich verschoben - die
   Verschiebung haing an der Scrollposition, sodass Runterscrollen einen
   horizontalen Schwenk ausloeste. Das war irritierend ("man scrollt runter
   und die Seite faehrt zur Seite").

   Jetzt stehen die vier Ansichten als normale Bloecke untereinander:
   vertikal scrollen = durch die Projekte lesen, ohne jede Seitenbewegung.
   Der Wechsel zum naechsten Projekt geht ueber die Pfeile links/rechts
   (js/track.js -> goTo). Sie erscheinen nur an den Uebergaengen:
     - Zurueck-Pfeil links: auf der ERSTEN Bildschirmseite eines Projekts
       (nicht im ersten Projekt)
     - Weiter-Pfeil rechts: auf der LETZTEN Bildschirmseite eines Projekts
   Ein Klick springt weich an die Oberkante der Zielansicht und landet
   dort exakt (Snap). Bleibt man beim freien Scrollen wenige Pixel vor
   einer Ansichtsgrenze stehen, wird auf die Kante nachgezogen.

   Oeffentliche API (unveraendert, damit topbar.js und die Pruef-Skripte
   weiterlaufen):
     window.TurnTrack.init()
     window.TurnTrack.index            - aktive Ansicht (0 ... 3)
     window.TurnTrack.pan / .hold      - immer 0 (Reste der alten Mechanik;
                                          curtain.js und script.js lesen sie)
     window.TurnTrack.instance.goTo(i) - Sprung in eine Ansicht
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
     Ansichtsgrenze stehen, zieht die Seite auf die Kante nach. */
  var SNAP_PX = 84;

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  function init() {
    var track = document.getElementById("track");
    if (!track) return null;

    var panels = Array.prototype.slice.call(track.querySelectorAll(".track__panel"));
    if (!panels.length) return null;

    var current = 0;
    var tops = [];
    var rafPending = false;
    var snapTimer = 0;
    var programmatic = false;
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

    /* Oberkanten der Ansichten in Dokumentkoordinaten. Gemessen wird bei
       Init, load, Resize und wenn ein Panel seine Groesse aendert. */
    function measure() {
      for (var i = 0; i < panels.length; i++) {
        var r = panels[i].getBoundingClientRect();
        tops[i] = Math.round(r.top + scrollTop());
      }
    }

    /* Nur die sichtbare Ansicht darf spielen und Ton haben: sonst laufen
       Hero und Serum gleichzeitig. */
    function setActive(i) {
      if (i === current) return;
      current = i;

      panels.forEach(function (el, n) {
        el.classList.toggle("is-current", n === i);
      });

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

    /* Sprung an die Oberkante von Ansicht i. Der Zielpunkt ist genau
       tops[i] - damit landet jeder Pfeilklick auf der Bildschirmkante
       (Snap) und nicht irgendwo dazwischen. */
    function goTo(i) {
      if (i < 0 || i >= panels.length) return;
      var target = tops[i] === undefined ? 0 : tops[i];
      var behavior = reduceMotion ? "auto" : "smooth";

      programmatic = true;
      programmaticUntil = Date.now() + 900;

      try {
        window.scrollTo({ top: Math.round(target), behavior: behavior });
      } catch (e) {
        window.scrollTo(0, Math.round(target));
      }

      /* Weiches Scrollen landet nicht immer exakt: kurz vor Ende
         nachziehen. (scrollend gibt es nicht ueberall.) */
      setTimeout(function () {
        if (Math.abs(scrollTop() - target) > 2) window.scrollTo(0, Math.round(target));
        programmatic = false;
        setActive(i);
        update();
      }, reduceMotion ? 0 : 700);
    }

    /* Freies Scrollen: bleibt man kurz vor einer Ansichtsgrenze stehen,
       auf die Kante nachziehen. Nur ausserhalb von Pfeilsprüngen und nur
       in der Naehe - sonst wuerde das normale Lesen stoeren. */
    function maybeSnap() {
      if (programmatic || Date.now() < programmaticUntil) return;
      var y = scrollTop();
      for (var i = 0; i < tops.length; i++) {
        var d = tops[i] - y;
        if (d > 0 && d < SNAP_PX) {
          window.scrollTo({ top: Math.round(tops[i]), behavior: reduceMotion ? "auto" : "smooth" });
          return;
        }
        if (d < 0 && -d < SNAP_PX && i > 0) {
          window.scrollTo({ top: Math.round(tops[i]), behavior: reduceMotion ? "auto" : "smooth" });
          return;
        }
      }
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

    /* Tief-Links (#serum, #curtain-view, ...) sollen weiterhin funktionieren:
       die Ansicht selbst steht schon an ihrer Stelle, also reicht es, das
       Element zu finden und dorthin zu scrollen. */
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

    panels.forEach(function (el, n) {
      el.classList.toggle("is-current", n === 0);
    });
    if (window.SerumVideo) window.SerumVideo.setActive(false);

    measure();
    jumpForHash();
    update();

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