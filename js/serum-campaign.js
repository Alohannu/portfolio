/* ==========================================================================
   Projekt 2, Abschnitt 2: gespiegelte Ansicht mit dem Kampagnenfilm

   Die Ansicht wiederholt "ai face serum" mit vertauschten Seiten: links
   das Video, rechts Titel und Text. Sie steht im Track zwischen dem
   Avatar-Abschnitt und der Phasen-Section und ist 200svh hoch (100svh
   Buehne + 100svh Halten, siehe css/track.css).

   Dieses Skript macht zwei Dinge:

   1. Es blendet Titel und Text ein, sobald die Ansicht im Bild steht
      (.reveal/.fade-in wie in den anderen Projekt-Abschnitten). Der
      Morph-Handler in js/script.js fasst die Section nicht an, weil sie
      kein [data-morph] ist.
   2. Es spielt das Kampagnenvideo nur ab, solange die Ansicht sichtbar
      ist. Sonst liefen mehrere Videos gleichzeitig (Serum-Hero, Collage
      in Ansicht 1) und im Hintergrund der Seite weiter. Der Track
      schiebt die Ansicht beim Schwenk seitlich aus dem Viewport - auch
      das erkennt der Beobachter und pausiert.

   Das Video ist stumm und geloopt. Es braucht keinen Ton-Schalter, weil
   es Projektmaterial ist und nicht das Titelvideo des Panels. Unter
   prefers-reduced-motion bleibt es stehen: das Poster (erster Frame der
   Kampagne) zeigt das Bild.
   ========================================================================== */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var section = document.getElementById("serumRepeat");
  if (!section) return;

  var video = section.querySelector(".campaign__video");
  var title = section.querySelector(".reveal");
  var fade = section.querySelector(".fade-in");

  function setVisible(on) {
    if (title) title.classList.toggle("is-visible", on);
    if (fade) fade.classList.toggle("is-visible", on);
  }

  function play() {
    if (!video || reduceMotion) return;
    var pr = video.play();
    if (pr && pr.catch) pr.catch(function () {});
  }

  function pause() {
    if (video && !video.paused) video.pause();
  }

  function isInView() {
    var r = section.getBoundingClientRect();
    return r.bottom > 0 && r.top < window.innerHeight;
  }

  if (!("IntersectionObserver" in window)) {
    setVisible(true);
    return;
  }

  /* Schwelle 0.25: die Section ist zwei Viewport-Hoehen hoch, im
     gepinnten Zustand liegt ihr Sichtanteil bei 0.5. Erst wenn sie zu
     einem Viertel im Bild steht, ist der Text so weit hereingescrollt,
     dass das Einblenden nicht im Anschnitt passiert. */
  new IntersectionObserver(function (entries) {
    var entry = entries[entries.length - 1];
    var on = entry.isIntersecting && entry.intersectionRatio >= 0.25;
    setVisible(on);
    if (!on) pause();
    else if (!document.hidden) play();
  }, { threshold: [0, 0.25, 0.6] }).observe(section);

  /* Tabwechsel: im Hintergrund pausieren, beim Zurueckkommen nur starten,
     wenn die Ansicht noch im Bild steht. */
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      pause();
    } else if (isInView()) {
      play();
    }
  });
})();