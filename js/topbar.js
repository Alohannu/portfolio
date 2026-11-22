/* ==========================================================================
   Menueleiste: die vier Projekt-Ansichten, oben fest ueber der Seite

   Zwei Aufgaben:

   1. Sie verschwindet beim Runterscrollen und kommt beim Hochscrollen
      zurueck. So ist sie beim Lesen aus dem Weg, beim Orientieren aber
      sofort da. Ganz oben (scrollY <= SHOW_AT) bleibt sie immer stehen -
      sonst waere sie beim ersten Runterscrollen sofort weg, obwohl man
      den Titel noch liest.

   2. Sie zeigt an, welche Ansicht aktiv ist, und springt per Klick in
      eine andere. Den Sprung macht nicht sie selbst, sondern
      window.TurnTrack.instance.goTo(i) (js/track.js): nur der Track kennt
      die gemessenen Ansichts-Oberkanten und kann die Scrollposition
      richtig setzen.

      location.hash wird dabei bewusst NICHT gesetzt. Der hashchange-
      Handler in js/track.js wuerde den Sprung ein zweites Mal ausfuehren
      (und die Adresse samt History-Eintraegen bei jedem Klick aendern).
      Die href-Attribute bleiben trotzdem stehen: ohne JavaScript und fuer
      "Link in neuem Tab" sind sie die einzige Navigation.

   Steuerung/Form: js/topbar.js + css/topbar.css. Das Markup liegt als
   direktes Kind von <body> vor <main> - WARUM, steht in css/topbar.css.
   ========================================================================== */
(function () {
  "use strict";

  var topbar = document.getElementById("topbar");
  if (!topbar) return;

  var links = Array.prototype.slice.call(topbar.querySelectorAll(".topbar__link"));

  /* Ab dieser Scrollhoehe darf die Leiste ueberhaupt verschwinden. */
  var SHOW_AT = 120;

  /* Hysterese in px: kleinere Bewegungen zaehlen nicht als Richtung.
     WARUM: ein Trackpad liefert pro Event nur wenige Pixel, teils mit
     Gegenbewegung. Ohne diese Schwelle wuerde die Leiste bei langsamem
     Scrollen dauernd ein- und ausfahren. lastY wird bei so einem Event
     absichtlich NICHT nachgezogen - die kleinen Schritte summieren sich
     dann auf, bis die Richtung eindeutig ist. */
  var MIN_DELTA = 6;

  var hidden = false;
  var lastY = 0;
  var lastIndex = -1;

  function scrollY() {
    return window.scrollY || window.pageYOffset || 0;
  }

  /* Ein- und Ausfahren. Schreibt nur bei echter Aenderung: das Scroll-
     Event ruft das bei jedem Pixel auf. aria-hidden raeumt die Leiste
     fuer Screenreader weg, wenn sie ausgefahren ist - sichtbar ist sie
     dann ohnehin nicht mehr. */
  function setHidden(next) {
    if (next === hidden) return;
    hidden = next;

    topbar.classList.toggle("is-hidden", next);
    if (next) topbar.setAttribute("aria-hidden", "true");
    else topbar.removeAttribute("aria-hidden");
  }

  /* Aktive Ansicht. Der Normalfall ist die API von js/track.js; sie ist
     die einzige Quelle, die den Schwenk wirklich kennt. Der Fallback
     ueber .is-current greift nur, wenn track.js fehlt oder noch nicht
     initialisiert ist. */
  function currentIndex() {
    var t = window.TurnTrack;
    if (t && typeof t.index === "number") return t.index;

    var current = document.querySelector(".track__panel.is-current");
    if (!current) return 0;
    var panels = document.querySelectorAll(".track__panel");
    return Array.prototype.indexOf.call(panels, current);
  }

  /* Markierung nachziehen. Der fruehe Ausstieg ist der Grund, warum das
     gefahrlos aus dem Scroll-Event aufgerufen werden kann: ohne Aenderung
     wird kein DOM angefasst. */
  function syncActive() {
    var i = currentIndex();
    if (i === lastIndex) return;
    lastIndex = i;

    links.forEach(function (link, n) {
      var on = n === i;
      link.classList.toggle("is-active", on);
      if (on) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    });
  }

  function onScroll() {
    var y = scrollY();

    /* Zuerst die Markierung: sie folgt der Ansicht, nicht der Scroll-
       richtung. Deshalb steht sie VOR der Hysterese - bei langsamem
       Scrollen aendert sich die Ansicht, waehrend die Leiste selbst noch
       stillsteht. currentIndex() liest nur die API, keine Geometrie. */
    syncActive();

    var dy = y - lastY;
    if (Math.abs(dy) < MIN_DELTA) return;   // lastY bewusst nicht nachziehen

    if (y <= SHOW_AT) setHidden(false);
    else if (dy > 0) setHidden(true);       // runter -> aus dem Weg
    else setHidden(false);                  // hoch -> zurueck

    lastY = y;
  }

  links.forEach(function (link) {
    link.addEventListener("click", function (e) {
      var t = window.TurnTrack;
      /* Ohne API (oder ohne goTo) dem href folgen: dann springt der
         Browser selbst bzw. der hashchange-Handler in js/track.js. */
      if (!t || !t.instance || typeof t.instance.goTo !== "function") return;

      var i = parseInt(link.getAttribute("data-view"), 10);
      if (isNaN(i)) return;

      e.preventDefault();
      t.instance.goTo(i);
      syncActive();
    });
  });

  window.addEventListener("scroll", onScroll, { passive: true });

  window.addEventListener("resize", function () {
    /* Nach einem Resize misst track.js neu und kann die Ansicht wechseln
       (andere Viewporthoehe = andere Schwenkgrenzen). */
    syncActive();
  });

  /* track.js meldet jede neu gesetzte Ansicht ueber "track:screen".
     WARUM zusaetzlich zum Scroll-Event: bei einem Deep-Link oder einem
     #-Wechsel springt track.js selbst (jumpForHash). Unser Scroll-Event
     laeuft dann VOR dem Frame, in dem track.js seinen Index nachzieht -
     syncActive() sieht dort noch die alte Ansicht, und ein zweites
     Scroll-Event kommt nicht mehr. Die Markierung bliebe also auf dem
     alten Eintrag stehen, obwohl die Ziel-Ansicht schon steht.
     syncActive() steigt bei unveraenderter Ansicht sofort aus, das Event
     darf deshalb bei jedem Wechsel kommen. */
  document.addEventListener("track:screen", syncActive);

  /* Neubasierung nach einem Sprung, den der Nutzer nicht selbst gescrollt
     hat (Deep-Link #serum/#music-view, Fragmentwechsel). WARUM verzoegert:
     js/track.js registriert seinen load-Handler erst in init() bei
     DOMContentLoaded und laeuft damit NACH diesem Handler - sein
     jumpForHash() setzt die Scrollposition erst danach. Ein sofortiges
     Baseline misst die alte Position, und der Sprung kaeme als
     Nutzerscroll (dy > 0) an => Leiste versteckt sich beim Laden. */
  function rebase() {
    lastY = scrollY();
    setHidden(false);
    syncActive();
  }

  /* setTimeout statt requestAnimationFrame: scrollTo ist synchron, der
     Timeout laeuft nach dem Dispatch des Events und damit nach
     jumpForHash. Der danach eintreffende Scroll-Event rechnet dy = 0, also
     kein Ein-/Ausfahren; mit rAF waere die Leiste fuer einen Frame
     versteckt. */
  window.addEventListener("load", function () { setTimeout(rebase, 0); });
  window.addEventListener("hashchange", function () { setTimeout(rebase, 0); });

  /* Startzustand: sichtbar (das Markup ist es ohnehin - setHidden(false)
     haelt Zustand und DOM zusammen), Markierung setzen und die
     Scrollposition als Basis merken. */
  rebase();
})();
