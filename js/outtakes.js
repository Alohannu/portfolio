/* ==========================================================================
   Outtakes-Abschnitt

   1) Die drei Videos laufen frei und geloopt. Gespielt wird nur, was auch
      im Bild steht – so laufen nie alle drei gleichzeitig und das Scrollen
      bleibt fluessig.
   2) Der Text erscheint zeilenweise versetzt, sobald der Kasten in den
      Sichtbereich kommt.
   ========================================================================== */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- 1) Videos ---------- */
  function setupVideos() {
    var tiles = document.querySelectorAll(".ot-tile");
    if (!tiles.length) return;

    Array.prototype.forEach.call(tiles, function (tile) {
      var video = tile.querySelector("video");
      if (!video) return;

      var io = new IntersectionObserver(function (ents) {
        ents.forEach(function (e) {
          if (e.isIntersecting) {
            tile.classList.add("is-in");
            if (!reduceMotion) {
              var pr = video.play();
              if (pr && pr.catch) pr.catch(function () {});
            }
          } else {
            if (!video.paused) video.pause();
          }
        });
      }, { threshold: 0.2 });

      io.observe(tile);
    });
  }

  /* ---------- 2) Text zeilenweise ---------- */
  function setupText() {
    var notes = document.querySelector(".ot-notes");
    if (!notes) return;

    /* Jede "Zeile" ist ein eigener Block: die Absaetze, jeder
       Aufzaehlungspunkt und die Ueberschriften. So laesst sich der Text
       Stueck fuer Stueck einblenden statt als eine grosse Flaeche.
       Der Kasten selbst ist bewusst NICHT dabei - sonst wuerde er
       zusaetzlich als Ganzes einblenden und die Staffelung ueberdecken. */
    var sel = ".ot-box__head, .ot-box__kicker, .ot-box__title," +
              " .ot-box__tools, .ot-block, .ot-block__label," +
              " .ot-block p, .ot-block li";
    var lines = notes.querySelectorAll(sel);

    if (reduceMotion || !("IntersectionObserver" in window)) {
      Array.prototype.forEach.call(lines, function (el) { el.classList.add("ot-line", "is-in"); });
      return;
    }

    /* Versatz je Kasten neu zaehlen, damit die Verzoegerung nicht
       ueber die ganze Seite auflaeuft. */
    var box = null, i = 0;
    Array.prototype.forEach.call(lines, function (el) {
      var parentBox = el.closest(".ot-box");
      if (parentBox !== box) { box = parentBox; i = 0; }
      el.classList.add("ot-line");
      el.style.setProperty("--i", String(Math.min(i, 12)));
      i++;
    });

    var io = new IntersectionObserver(function (ents) {
      ents.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add("is-in");
        io.unobserve(e.target);
      });
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.15 });

    /* Beobachtet wird jeder Kasten: sobald er auftaucht, laufen seine
       Zeilen nacheinander ein. */
    var boxes = notes.querySelectorAll(".ot-box");
    if (boxes.length) {
      Array.prototype.forEach.call(boxes, function (b) {
        var boxIO = new IntersectionObserver(function (ents) {
          ents.forEach(function (e) {
            if (!e.isIntersecting) return;
            /* Nur die Zeilen dieses Kastens einblenden. */
            Array.prototype.forEach.call(e.target.querySelectorAll(".ot-line"), function (el) {
              el.classList.add("is-in");
            });
            boxIO.disconnect();
          });
        }, { rootMargin: "0px 0px -12% 0px", threshold: 0.1 });
        boxIO.observe(b);
      });
    }
  }

  function init() {
    setupVideos();
    setupText();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
