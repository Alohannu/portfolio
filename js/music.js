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

   Wellenform und Songtext haengen am Song - nicht an CSS-Loops:
   - die Wellenform steht im Ruhezustand flach und bewegt sich nur, solange
     der Song laeuft. Die Hoehen kommen aus einem AnalyserNode (echte
     Frequenzdaten von Pantomime.mp3), nicht aus einer Animation.
   - der Songtext wird nicht mehr per CSS durchgezogen, sondern seine
     Position folgt der Abspielzeit (currentTime / duration). Pause haelt
     ihn an, Seeken springt mit.
   - wer prefers-reduced-motion gesetzt hat, bekommt weder Bewegung noch
     Textwanderung (die Analyse startet dann gar nicht).

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

    var wave = document.querySelector(".music__wave");
    var bars = wave ? Array.prototype.slice.call(wave.querySelectorAll("span")) : [];
    var lyricsBox = document.querySelector(".music__lyrics");
    var lyricsInner = document.querySelector(".music__lyrics-inner");

    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function setPlaying(playing) {
      if (icon) icon.textContent = playing ? "\u275A\u275A" : "\u25B6";
      button.setAttribute("aria-pressed", playing ? "true" : "false");
      button.setAttribute("aria-label", playing ? "Soundtrack pausieren" : "Soundtrack abspielen");
    }

    /* Songtext an die Abspielzeit koppeln: 0 % = oben, 100 % = Ende. Der
       Text laeuft also genau so weit, wie der Song gespielt hat - Pause
       haelt ihn an, Seeken springt mit. */
    function syncLyrics() {
      if (!lyricsBox || !lyricsInner || reduceMotion) return;
      var travel = lyricsInner.scrollHeight - lyricsBox.clientHeight;
      if (travel <= 0) return;
      var p = duration ? Math.min(1, Math.max(0, audio.currentTime / duration)) : 0;
      lyricsInner.style.transform = "translate3d(0," + (-p * travel).toFixed(1) + "px,0)";
    }

    function render() {
      if (time) time.textContent = fmtTime(audio.currentTime) + " / " + fmtTime(duration);
      if (fill) {
        var pct = duration ? (audio.currentTime / duration) * 100 : 0;
        fill.style.width = pct.toFixed(2) + "%";
      }
      syncLyrics();
    }

    /* ---- Wellenform -------------------------------------------------------
       AudioContext wird erst beim ersten Abspielen erzeugt (Browser
       erlauben das ohne Nutzergeste nicht) und das Element nur EINMAL an
       den Analyser gehaengt - createMediaElementSource darf pro <audio>
       nicht zweimal aufgerufen werden. */
    var ctx = null;
    var analyser = null;
    var freq = null;
    var raf = 0;
    var fallbackT = 0;

    function ensureAnalyser() {
      if (analyser || !bars.length) return;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        ctx = new AC();
        var src = ctx.createMediaElementSource(audio);
        analyser = ctx.createAnalyser();
        analyser.fftSize = 64;                 // 32 Frequenz-Baender
        analyser.smoothingTimeConstant = .76;  // ruhigerer Verlauf
        src.connect(analyser);
        analyser.connect(ctx.destination);
        freq = new Uint8Array(analyser.frequencyBinCount);
      } catch (e) {
        /* Ohne Analyser (z. B. strenge CORS-Regeln bei file://) bleibt die
           Wellenform flach - besser als eine Fake-Animation. */
        analyser = null;
        ctx = null;
      }
    }

    function setBarHeight(i, v) {
      var h = (4 + Math.pow(v, 1.35) * 96).toFixed(1) + "%";
      bars[i].style.height = h;
    }

    function tick() {
      raf = 0;
      var n = bars.length;
      if (analyser && freq) {
        analyser.getByteFrequencyData(freq);
        /* Die Baender auf die Balken verteilen: tiefe Frequenzen links,
           hohe rechts. Die letzten Baender sind meist leer (kein
           Nutzsignal) und werden deshalb nicht bis zum Rand gestreckt. */
        var usable = Math.max(6, Math.floor(freq.length * .82));
        for (var i = 0; i < n; i++) {
          var bin = Math.min(usable - 1, Math.round((i / (n - 1)) * (usable - 1)));
          setBarHeight(i, freq[bin] / 255);
        }
      } else {
        /* Kein Analyser verfuegbar: ruhiger, aber erkennbar laufender
           Puls statt einer eingefrorenen Linie. */
        fallbackT += .06;
        for (var j = 0; j < n; j++) {
          var w = .5 + .5 * Math.sin(fallbackT + j * .55);
          setBarHeight(j, w * .55);
        }
      }
      if (!audio.paused && !audio.ended) raf = requestAnimationFrame(tick);
    }

    function startVisuals() {
      if (reduceMotion) return;
      if (wave) wave.classList.add("is-live");
      ensureAnalyser();
      if (ctx && ctx.state === "suspended") {
        var pr = ctx.resume();
        if (pr && pr.catch) pr.catch(function () {});
      }
      if (!raf) raf = requestAnimationFrame(tick);
    }

    function stopVisuals() {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      if (wave) wave.classList.remove("is-live");
      /* Ruhezustand: flache Linie (CSS-Hoehe 3px), also Inline-Werte weg. */
      bars.forEach(function (b) { b.style.height = ""; });
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

    audio.addEventListener("play", function () {
      setPlaying(true);
      startVisuals();
    });
    audio.addEventListener("pause", function () {
      setPlaying(false);
      stopVisuals();
    });

    audio.addEventListener("loadedmetadata", function () {
      duration = audio.duration || 0;
      render();
    });

    audio.addEventListener("timeupdate", render);

    audio.addEventListener("ended", function () {
      audio.currentTime = 0;
      render();
    });

    window.addEventListener("resize", syncLyrics);

    setPlaying(false);
    render();
    syncLyrics();
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


/* ---------- Titel-Karte "ai music": Overlay und Schrift blenden beim
   Scrollen aus (Bild bleibt). ---------- */
(function () {
  "use strict";
  var shade = document.getElementById("musicIntroShade");
  var section = document.querySelector(".music-intro");
  if (!shade || !section) return;
  var ticking = false;
  function update() {
    ticking = false;
    /* Die Karte steht am Ende von Ansicht 3 gepinnt (top bleibt 0). Der
       Beginn der Pin-Strecke ist deshalb die Unterkante der Section davor
       (steht im normalen Fluss); ab dort blendet der Scroll aus. */
    var prev = section.previousElementSibling;
    var start = prev ? prev.getBoundingClientRect().bottom + window.pageYOffset : section.getBoundingClientRect().top + window.pageYOffset;
    var vh = window.innerHeight;
    var p = Math.min(1, Math.max(0, (window.pageYOffset - start) / (vh * 0.7)));
    shade.style.opacity = String(1 - p);
  }
  function req() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
  window.addEventListener("scroll", req, { passive: true });
  window.addEventListener("resize", req);
  update();
})();
