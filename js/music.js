/* ==========================================================================
   Musik-Teil: "ai music"

   Steuert den Soundtrack-Player und den Ton des Concept-Videos im Musik-Teil
   (index.html, Abschnitt #music). Der Aufbau stammt aus dem Original
   (yytrieu.github.io/ai-portfolio): dort war es React-State, hier ist es
   derselbe Ablauf in reinem JavaScript.

   Player:
   - Klick auf den runden Knopf startet/pausiert Pantomime.mp3
   - das Symbol zeigt den naechsten Schritt: "▶" heisst "startet",
     "❚❚" heisst "pausiert gerade"
   - Zeitanzeige und Fortschrittsbalken laufen ueber timeupdate mit
   - am Ende springt der Player zurueck auf Anfang und zeigt wieder "▶"

   Concept-Video:
   - es laeuft stumm in Schleife (autoplay + muted im Markup)
   - der Knopf oben rechts schaltet den Ton um; Beschriftung und Symbol
     folgen dem Zustand ("Audio on" = stumm, Klick schaltet ein)
   ========================================================================== */
(function () {
  "use strict";

  /* Sekunden als "m:ss"; ungueltige Werte werden zu 0:00. */
  function fmtTime(s) {
    if (!isFinite(s) || s < 0) s = 0;
    var m = Math.floor(s / 60);
    var r = Math.floor(s % 60);
    return m + ":" + (r < 10 ? "0" : "") + r;
  }

  function initPlayer() {
    var audio = document.getElementById("musicSong");
    var button = document.getElementById("musicPlay");
    if (!audio || !button) return;

    var icon = document.getElementById("musicPlayIcon");
    var fill = document.getElementById("musicBarFill");
    var time = document.getElementById("musicTime");
    var duration = 0;

    function setPlaying(playing) {
      if (icon) icon.textContent = playing ? "\u275A\u275A" : "\u25B6";
      button.setAttribute("aria-pressed", playing ? "true" : "false");
      button.setAttribute("aria-label", playing ? "Soundtrack pausieren" : "Soundtrack abspielen");
    }

    function render() {
      if (time) time.textContent = fmtTime(audio.currentTime) + " / " + fmtTime(duration);
      if (fill) {
        var pct = duration ? (audio.currentTime / duration) * 100 : 0;
        fill.style.width = pct.toFixed(2) + "%";
      }
    }

    button.addEventListener("click", function () {
      if (audio.paused) {
        var p = audio.play();
        /* play() kann abgelehnt werden (z. B. wenn der Browser ohne
           Nutzeraktion blockt); dann bleibt der Knopf einfach auf "▶". */
        if (p && p.catch) p.catch(function () {});
      } else {
        audio.pause();
      }
    });

    audio.addEventListener("play", function () { setPlaying(true); });
    audio.addEventListener("pause", function () { setPlaying(false); });

    audio.addEventListener("loadedmetadata", function () {
      duration = audio.duration || 0;
      render();
    });

    audio.addEventListener("timeupdate", render);

    audio.addEventListener("ended", function () {
      audio.currentTime = 0;
      render();
    });

    setPlaying(false);
    render();
  }

  function initVideoAudio() {
    var video = document.getElementById("musicVideo");
    var button = document.getElementById("musicAudio");
    if (!video || !button) return;

    var label = button.querySelector("[data-audio-label]");
    var icon = button.querySelector(".music__audio-icon");

    function render() {
      if (label) label.textContent = video.muted ? "Audio on" : "Audio off";
      if (icon) icon.textContent = video.muted ? "\uD83D\uDD07" : "\uD83D\uDD0A";
      button.setAttribute("aria-pressed", video.muted ? "false" : "true");
    }

    button.addEventListener("click", function () {
      video.muted = !video.muted;
      if (!video.muted) {
        video.volume = 1;
        var p = video.play();
        if (p && p.catch) p.catch(function () {});
      }
      render();
    });

    /* Der Zustand kann sich auch ohne den Knopf aendern (Autoplay-Regeln
       setzen Videos stumm). Dann soll die Beschriftung nachziehen. */
    video.addEventListener("volumechange", render);

    render();
  }

  function init() {
    initPlayer();
    initVideoAudio();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
