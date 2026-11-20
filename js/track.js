/* ==========================================================================
   Schwenk zwischen den Projekt-Ansichten - vom Scrollen gescrubbt

   Frueher fuhr ein Klick auf einen Pfeil den Track eine Ansicht weiter.
   Jetzt faehrt der Track mit dem Scrollen: die Schwenkstrecke ist ein
   Stueck Scrollweg am Ende jeder Ansicht (PAN_VH Viewport-Hoehen, unten
   1.5). Auf dieser Strecke wird die horizontale Verschiebung direkt aus
   der Scrollposition berechnet:

       p = (scrollY - (tops[k] - pan)) / pan        (0 ... 1 geklemmt)
       track: translate3d(-(k - 1 + p) * 100vw, 0, 0)

   p = 0 heisst "Ansicht k-1 steht", p = 1 "Ansicht k steht". Waehrend
   des Schwenks faehrt die alte Ansicht nach links aus dem Bild, die neue
   faehrt von rechts herein, und ihr Titelvideo (der Serum-Hero) steigt
   von unten in den Viewport - genau der Uebergang, den die Pfeile
   vorher per Klick ausgeloest haben.

   Vor dem Schwenk liegt jetzt eine Leerlauf-Strecke (HOLD_VH = 0.4
   Viewport-Hoehen, unten ~360 px bei 900 px Hoehe). WARUM: die letzte
   Bildschirmseite der alten Ansicht ist die Auslauf-Buehne, und die war
   bisher genau so lang wie der Schwenk - sie verschwand also im selben
   Moment, in dem sie stehen blieb. Mit dem Leerlauf steht die Buehne
   erst still (Track-transform bleibt "none", nichts bewegt sich) und
   man kann die Seite ansehen; erst danach faehrt der Schwenk wie
   bisher. Die Auslauf-Buehne ist dafuer um HOLD_VH laenger (run = pan +
   hold) und bleibt ueber Leerlauf UND Schwenk gepinnt.

   Die Geometrie geht nur auf, weil beides getrennt bleibt: die
   Pin-Strecke der Buehne waechst um den Leerlauf (stage height = run,
   min-height = Inhalt + run), der Versatz der Folgeansicht aber NICHT
   (margin-top bleibt tops[k] - pan). Sonst laege die Ankunft um hold
   zu tief und der Schwenk endete vor der Grenze.

   Damit die Schwenkstrecke ueberhaupt Scrollweg hat, liegen die
   Ansichten nicht mehr auf derselben Hoehe, sondern in der Scrollspur
   untereinander:

       Ansicht 0:  y = 0       ..  h1
       Ansicht 1:  y = h1      ..  h1 + h2      (margin-top = h1, setzt das JS)

   Der Schwenk laeuft damit auf [h1 - pan, h1] und endet genau an der
   Oberkante von Ansicht 2; von dort scrollt der Rest von Ansicht 2
   normal weiter. Davor liegt der Leerlauf [h1 - run, h1 - pan] mit
   run = pan + hold. Rueckwaerts laeuft derselbe Weg rueckwaerts, ohne
   Sonderfall.

   Zwei Fallen, die dieser Code umgeht:

   1) transform auf dem Track macht ihn zum Containing Block. Solange
      kein Schwenk laeuft (Fortschritt 0 - also im Leerlauf und in
      Ansicht 1), wird transform deshalb ausdruecklich auf "none"
      zurueckgesetzt - die sticky-Pins in Ansicht 1 bleiben so unberuehrt.
      Ein transform nur waehrend des Schwenks ist unkritisch: in den
      gepinnten Abschnitten von Ansicht 1 ist man dann laengst durch (und
      in Ansicht 2 pinnt der Hero ohnehin erst hinter der Schwenkstrecke).

   2) Die Oberkanten der Ansichten werden als margin-top gesetzt, nicht
      als transform: ein transform auf dem Panel wuerde die sticky-Pins
      darin verschieben.

   Oeffentliche API:
     window.TurnTrack.init()            - startet die Spur (einmal)
     window.TurnTrack.index             - aktive Ansicht (0 ... 2)
     window.TurnTrack.pan               - Schwenkstrecke in px (1 Viewport-Hoehe)
     window.TurnTrack.hold              - Leerlauf-Strecke in px (0.4 Viewport-Hoehen)
     window.TurnTrack.instance.goTo(i)  - Sprung in eine Ansicht (Tastatur,
                                          Verifikation); direkt auf TurnTrack
                                          liegt nur init(), nicht goTo().
   ========================================================================== */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Schwenkstrecke in Viewport-Hoehen: so viel Scrollweg braucht der
     Wechsel von einer Ansicht zur naechsten. Eine Bildschirmhoehe heisst:
     eine Bildschirmhoehe scrollen = eine Ansicht weiter schwenken. Dann
     steht die Oberkante der naechsten Ansicht schon beim ersten Pixel
     Scrollweg an der Viewport-Unterkante, und ihr Titelvideo steigt
     waehrend des ganzen Schwenks sichtbar herein. Bei groesseren Werten
     (z.B. 1.5) bleibt die erste Haelfte des Weges dunkel, weil die
     naechste Ansicht erst spaeter ins Bild kommt. */
  var PAN_VH = 1.0;

  /* Leerlauf-Strecke in Viewport-Hoehen: so viel Scrollweg steht der
     Track still, bevor der Schwenk beginnt (WARUM siehe Kopfkommentar).
     0.4 heisst bei 900 px Hoehe rund 360 px - genug, um die letzte
     Bildschirmseite der alten Ansicht anzusehen, ohne wie eine
     Wartezeit zu wirken. */
  var HOLD_VH = 0.4;

  /* Ab diesem Schwenkfortschritt gilt die Zielansicht als aktiv (Video-
     und Tonumschaltung). */
  var SWITCH_AT = 0.5;

  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

  function init() {
    var track = document.getElementById("track");
    if (!track) return null;

    var panels = Array.prototype.slice.call(track.querySelectorAll(".track__panel"));
    if (!panels.length) return null;

    var current = 0;

    /* Oberkante jeder Ansicht in Dokumentkoordinaten. Ansicht 0 liegt
       immer bei 0, jede weitere dort, wo die vorige endet. */
    var tops = [];
    var pan = 0;        // Schwenkstrecke in px
    var hold = 0;       // Leerlauf-Strecke in px (Track steht still)
    var run = 0;        // Pin-Strecke der Auslauf-Buehne: pan + hold
    var rafPending = false;

    function viewportHeight() {
      return window.innerHeight || document.documentElement.clientHeight;
    }

    function scrollTop() {
      return window.scrollY || window.pageYOffset || 0;
    }

    /* Steht das Element (vertikal) im Viewport? Wird nur beim Wechsel der
       aktiven Ansicht gefragt, nicht pro Scroll-Event - eine
       Layout-Abfrage pro Event waere Thrashing. */
    function isInViewport(el) {
      var r = el.getBoundingClientRect();
      return r.bottom > 0 && r.top < viewportHeight();
    }

    /* Oberkanten und Schwenkstrecke messen. Bewusst NICHT bei jedem
       Scroll-Event: ein offsetHeight pro Event waere Layout-Thrashing.
       Gemessen wird bei Init, load, Resize und wenn ein Panel seine
       Groesse aendert (ResizeObserver). */
    function measure() {
      /* Schwenkstrecke zuerst: sie bestimmt sowohl den Versatz der
         naechsten Ansicht als auch den Platz, den die Auslauf-Buehne der
         vorigen Ansicht zum Stehenbleiben braucht. */
      pan = reduceMotion ? 0 : Math.round(PAN_VH * viewportHeight());

      /* Leerlauf vor dem Schwenk (WARUM siehe Kopfkommentar). Bei
         prefers-reduced-motion gibt es keinen Leerlauf - dort springt der
         Wechsel wie bisher an der Grenze. run ist die Gesamtstrecke, ueber
         die die Auslauf-Buehne gepinnt bleibt: erst hold still, dann pan
         Schwenk. */
      hold = reduceMotion ? 0 : Math.round(HOLD_VH * viewportHeight());
      run = pan + hold;

      /* Erst die Reserven und Buehnenhoehen des letzten Messlaufs loesen:
         sie wuerden sonst als Inhaltshoehe mitgemessen und bei jedem Messen
         weiter wachsen. */
      for (var r = 0; r < panels.length; r++) {
        panels[r].style.minHeight = "";
        var prevStage = panels[r].lastElementChild;
        if (prevStage) prevStage.style.height = "";
      }

      var y = 0;        // Inhaltsende der vorigen Ansicht (Dokumentkoordinaten)
      var last = panels.length - 1;

      for (var i = 0; i < panels.length; i++) {
        tops[i] = y;

        if (i < last) {
          /* Die Auslauf-Buehne (letzte Section, siehe css/track.css) wird
             auf genau die Pin-Strecke run = hold + pan gesetzt. Damit
             faellt ihr Pin-Beginn exakt auf den Leerlaufbeginn und ihr
             Pin-Ende exakt auf das Schwenkende: die Buehne steht waehrend
             des ganzen Leerlaufs still (der Track bewegt sich nicht) und
             bleibt auch waehrend des Schwenks am Viewport - kein Vorlauf
             (in dem nichts passiert) und kein Restdrift am Ende. */
          var stage = panels[i].lastElementChild;
          if (stage && run > 0) stage.style.height = run + "px";
        }

        var contentHeight = panels[i].offsetHeight;

        if (i < last) {
          /* Unter dem Inhalt einer Ansicht, die noch eine Ansicht hinter
             sich hat, liegt die Pin-Strecke Reserve. Nur damit hat die
             Auslauf-Buehne den Platz, im Leerlauf und beim Schwenk am
             Viewport stehen zu bleiben. */
          panels[i].style.minHeight = Math.round(contentHeight + run) + "px";
        }

        /* Dokumentposition dieser Ansicht. Ab der zweiten liegt sie eine
           Schwenkstrecke HOEHER als die vorige endet (Ueberlappung: die
           einlaufende Buehne steht schon beim Schwenkbeginn am Viewport).
           Bewusst weiter nur pan, NICHT run: der Leerlauf kommt als
           Scrollweg oben drauf, die Ankunft der Ansicht (bei y = tops[i])
           muss aber dieselbe bleiben wie vorher - dort steht sie bei
           left 0 und ihr Hero bei top 0. Mit run hier laege sie um hold
           zu tief und der Schwenk endete vor der Grenze.
           Deshalb wird das Inhaltsende aus DIESER Position gerechnet -
           sonst wandert jede weitere Grenze um pan nach unten. */
        var panelTop = i === 0 ? 0 : Math.max(0, tops[i] - pan);
        if (i > 0) panels[i].style.marginTop = Math.round(panelTop) + "px";
        y = panelTop + contentHeight;
      }
    }

    /* Nur die sichtbare Ansicht darf spielen und Ton haben: sonst laufen
       Hero und Serum gleichzeitig. Wird vom Scrollen aus aufgerufen,
       sobald der Schwenk die Mitte passiert. */
    function setActive(i) {
      if (i === current) return;
      current = i;

      panels.forEach(function (el, n) {
        el.classList.toggle("is-current", n === i);
      });

      /* Das Serum-Video gehoert nur zu Ansicht 2: in Ansicht 3 (Vorhang)
         muss es ebenso still sein wie in Ansicht 1. */
      if (window.SerumVideo) {
        window.SerumVideo.setAudible(i === 1);
        window.SerumVideo.setActive(i === 1);
      }

      var heroVideo = document.getElementById("video-2");
      if (heroVideo) {
        if (i > 0) {
          /* Nur pausieren: ein pausiertes Video ist ohnehin still. Frueher
             wurde hier zusaetzlich stummgeschaltet - das liess den Hero
             nach dem Rueckweg dauerhaft stumm, wenn der Nutzer vorher
             keinen Mute gewaehlt hatte (js/script.js hebt die Stummheit
             nur beim ersten Nutzer-Input auf, und der ist dann verbraucht). */
          if (!heroVideo.paused) heroVideo.pause();
        } else if (heroVideo.paused && !heroVideo.ended && isInViewport(heroVideo)) {
          /* Nur anwerfen, wenn der Hero auch im Bild steht: beim
             Zurueckschwenk steht man am ENDE von Ansicht 1, der Hero ist
             dann 13000 px weiter oben. Ohne diese Pruefung liefe er
             unsichtbar weiter. Beim Hochscrollen startet ihn js/script.js
             ohnehin ueber seinen IntersectionObserver. */
          var pr = heroVideo.play();
          if (pr && pr.catch) pr.catch(function () {});
        }
      }
    }

    /* Scrollposition -> Ansicht + Schwenkfortschritt -> transform.
       Die Schwenkstrecke liegt direkt VOR jeder Grenze:
       [tops[k] - pan, tops[k]]. Davor liegt der Leerlauf
       [tops[k] - run, tops[k] - pan]: dort ist p = 0, also transform
       "none" - der Track steht still, waehrend die Auslauf-Buehne der
       alten Ansicht gepinnt bleibt. Gestartet wird deshalb schon bei
       tops[k] - run (sonst gaebe es keinen Leerlauf), p selbst rechnet
       weiter ab tops[k] - pan. */
    function update() {
      rafPending = false;

      var y = scrollTop();
      var k = 0;   // Zielansicht
      var p = 0;   // Fortschritt zu dieser Ansicht

      for (var i = 1; i < tops.length; i++) {
        if (y < tops[i] - run) break;
        k = i;
        p = pan > 0 ? clamp((y - (tops[i] - pan)) / pan, 0, 1) : 1;
      }

      applyPan(k, p);
    }

    function applyPan(k, p) {
      var x = k === 0 ? 0 : (k - 1 + p) * 100;   // Verschiebung in vw
      var next = x === 0 ? "none" : "translate3d(" + (-x).toFixed(3) + "vw, 0, 0)";
      if (track.style.transform !== next) track.style.transform = next;

      setActive(p >= SWITCH_AT ? k : Math.max(0, k - 1));
    }

    /* Sprung in eine Ansicht (Tastatur, API). Das Scrollen durchlaeuft
       dabei die Schwenkstrecke - der Schwenk bleibt also derselbe. */
    function goTo(i) {
      i = clamp(i, 0, panels.length - 1);
      window.scrollTo(0, Math.round(tops[i] === undefined ? 0 : tops[i]));
      update();
    }

    function schedule() {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(update);
    }

    /* #serum & Co. liegen in Ansicht 2. Der Browser scrollt beim Laden,
       bevor track.js die Ansichten auseinandergezogen hat - die Position
       waere dann um h1 falsch. Deshalb nach dem Messen einmal neu
       setzen. */
    function jumpForHash() {
      var h = window.location.hash;
      if (!h) return;
      var target = null;
      try { target = document.querySelector(h); } catch (e) { return; }
      if (!target) return;

      var y = target.getBoundingClientRect().top + scrollTop();

      /* Ziel in einer der hinteren Ansichten: mindestens bis ans Ende der
         Schwenkstrecke scrollen. Sonst stuende der Schwenk noch mitten in
         der Bewegung und das Ziel laege halb ausserhalb des Bildes. */
      var panel = target.closest ? target.closest(".track__panel") : null;
      if (panel) {
        var k = panels.indexOf(panel);
        if (k > 0) y = Math.max(y, tops[k]);
      }

      window.scrollTo(0, Math.max(0, Math.round(y)));
      update();
    }

    /* Scroll-Events rechnen direkt: update() liest kein Layout mehr
       (tops/pan sind gecacht), ein rAF-Umweg wuerde den Schwenk um einen
       Frame nachlaufen lassen. */
    window.addEventListener("scroll", update, { passive: true });

    window.addEventListener("resize", function () {
      measure();
      schedule();
    });

    /* Erst nach dem vollstaendigen Laden stehen die Hoehen der Ansichten
       fest (Bilder, Video-Metadaten). Danach neu messen und das
       Zielelement eines Deep-Links neu anfahren. */
    window.addEventListener("load", function () {
      measure();
      jumpForHash();
      schedule();
    });

    window.addEventListener("hashchange", function () {
      measure();
      jumpForHash();
      schedule();
    });

    /* Aendert sich die Hoehe einer Ansicht (nachgeladene Bilder), muss
       nachgemessen werden - sonst zeigt der Schwenk auf die falsche
       Grenze. */
    if ("ResizeObserver" in window) {
      var ro = new ResizeObserver(function () {
        measure();
        schedule();
      });
      panels.forEach(function (el) { ro.observe(el); });
    }

    /* Pfeiltasten bleiben als unsichtbare Bedienung erhalten: sie
       scrollen auf die Zielansicht und loesen damit denselben Schwenk
       aus. Achtung: der Showroom (js/showroom.js) belegt dieselben Tasten
       zum Blaettern durch die Videos. Ist ein Dialog offen, gehoeren ihm
       die Pfeile. */
    window.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      var t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (document.querySelector(".showroom:not([hidden])")) return; // Showroom hat Vorrang
      if (t && t.closest && t.closest(".showroom")) return;
      var next = current + (e.key === "ArrowRight" ? 1 : -1);
      if (next < 0 || next >= panels.length) return;
      /* preventDefault: sonst scrollt der Browser zusaetzlich selbst ein
         Stueck und der Schwenk bekaeme einen Doppelschritt. */
      e.preventDefault();
      goTo(next);
    });

    /* Startzustand: Ansicht 1 ist aktiv. Die Klasse wird hier gesetzt,
       damit .is-current schon vor dem ersten Scrollen stimmt - und ohne
       das Hero-Video anzustossen (das steuert js/script.js selbst). */
    panels.forEach(function (el, n) {
      el.classList.toggle("is-current", n === 0);
    });
    if (window.SerumVideo) window.SerumVideo.setActive(false);

    measure();
    jumpForHash();
    update();

    /* Die uebrigen Skripte (Hero-Scrubbing, Morph, Avatar-Wechsel) haben
       vor dieser Messung gerechnet und lagen damit um die Hoehe von
       Ansicht 1 daneben. Ein resize-Event laesst sie neu rechnen. */
    try { window.dispatchEvent(new Event("resize")); } catch (e) {}

    var api = { goTo: goTo, get index() { return current; } };

    /* Kennzahlen der laufenden Instanz auch am Namensraum: praktisch fuer
       Debug und Verifikation (window.TurnTrack.index). */
    window.TurnTrack.instance = api;
    try {
      Object.defineProperty(window.TurnTrack, "index", {
        get: function () { return current; },
        configurable: true
      });
      /* Schwenkstrecke in px: js/script.js braucht sie, um den Serum-Hero
         waehrend des Schwenks auf seinem ersten Bild zu halten. */
      Object.defineProperty(window.TurnTrack, "pan", {
        get: function () { return pan; },
        configurable: true
      });
      /* Leerlauf-Strecke in px: nur zum Messen und Tunen - der Leerlauf
         selbst ergibt sich aus measure()/update(), niemand muss ihn
         nachrechnen. Getter wie pan, damit immer der letzte Messwert
         gilt. */
      Object.defineProperty(window.TurnTrack, "hold", {
        get: function () { return hold; },
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
