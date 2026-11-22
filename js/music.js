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
   - die 2px-Leiste .music__bar ist zugleich Slider: Klick springt an die
     Stelle, Ziehen scrubbt live, Pfeiltasten +/-5 s, Home/End an den Rand.
     Das Markup bleibt eine reine Anzeige - Rolle, tabindex und
     ARIA-Werte setzt dieses Skript.
   - liefert der Server keine Range-Requests, ist das <audio> nicht seekbar
     und der Sprung wuerde den Song neu starten; dann holt der Player die
     Datei einmal als Blob und tauscht die Quelle (siehe seekTo).
   - am Ende springt der Player zurueck auf Anfang und zeigt wieder "▶"

   Wellenform und Songtext haengen am Song - nicht an CSS-Loops:
   - die Wellenform steht im Ruhezustand flach und bewegt sich nur, solange
     der Song laeuft. Die Hoehen kommen aus einem AnalyserNode (echte
     Frequenzdaten von Pantomime.mp3), nicht aus einer Animation.
   - der Songtext wird nicht mehr per CSS durchgezogen, sondern seine
     Position folgt der Abspielzeit. Pause haelt ihn an, Seeken springt
     mit. Der Text setzt erst mit dem Gesang ein (VOCAL_START = 16,5 s),
     davor steht er oben still; kein manuelles Scrollen.
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

  /* Gesangseinsatz in Sekunden: davor steht der Songtext oben still. */
  var VOCAL_START = 16.5;

  /* Schrittweite der Pfeiltasten auf der Fortschrittsleiste. */
  var SEEK_STEP = 5;

  function initPlayer() {
    var audio = document.getElementById("musicSong");
    var button = document.getElementById("musicPlay");
    if (!audio || !button) return;

    var icon = document.getElementById("musicPlayIcon");
    var fill = document.getElementById("musicBarFill");
    var time = document.getElementById("musicTime");
    var bar = document.querySelector(".music__bar");
    var duration = 0;
    var english = document.documentElement.lang === "en";
    var scrubbing = false;

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

    /* Songtext an die Abspielzeit koppeln: p = 0 heisst "oben", p = 1
       "letzte Zeile erreicht". Der Text laeuft erst ab dem Gesangseinsatz
       (VOCAL_START), vorher bleibt er oben stehen. Kein wheel-/touch-
       Handler auf der Box: die Position kommt ausschliesslich aus
       currentTime, also halten Pause und Seeken sie automatisch mit. */
    function lyricsProgress() {
      if (!(duration > VOCAL_START)) return 0;
      var p = (audio.currentTime - VOCAL_START) / (duration - VOCAL_START);
      return Math.min(1, Math.max(0, p));
    }

    function syncLyrics() {
      if (!lyricsBox || !lyricsInner || reduceMotion) return;
      var travel = lyricsInner.scrollHeight - lyricsBox.clientHeight;
      if (travel <= 0) return;
      var p = lyricsProgress();
      lyricsInner.style.transform = "translate3d(0," + (-p * travel).toFixed(1) + "px,0)";
    }

    /* Die Leiste ist ein Slider: aria-valuenow/max und der Vorlesetext
       folgen der Abspielzeit (und damit auch jedem Scrub-Schritt). */
    function syncSliderAria() {
      if (!bar) return;
      bar.setAttribute("aria-valuemin", "0");
      bar.setAttribute("aria-valuemax", duration ? duration.toFixed(1) : "0");
      bar.setAttribute("aria-valuenow", Math.min(duration || 0, audio.currentTime).toFixed(1));
      bar.setAttribute("aria-valuetext", fmtTime(audio.currentTime) + " / " + fmtTime(duration));
    }

    function render() {
      if (time) time.textContent = fmtTime(audio.currentTime) + " / " + fmtTime(duration);
      if (fill) {
        var pct = duration ? (audio.currentTime / duration) * 100 : 0;
        fill.style.width = pct.toFixed(2) + "%";
      }
      syncSliderAria();
      syncLyrics();
    }

    /* ---- Fortschrittsleiste bedienbar machen ------------------------------
       Das Markup bleibt eine reine Anzeige (div.music__bar). Rolle, tabindex
       und ARIA-Werte setzt dieses Skript; die Trefferflaeche liefert
       css/music.css ueber ein Pseudo-Element (sichtbar bleiben 2px). */

    /* Nicht jeder Server beantwortet Range-Requests (python3 -m http.server
       ist der Klassiker). Dann ist das <audio> nicht seekbar: der Browser
       verwirft die laufende Wiedergabe und laedt ab Byte 0 neu - der Song
       startet also von vorn, statt zu springen. Von hier aus laesst sich das
       nicht abfangen (es ist eine HTTP-Sache), deshalb holt der Player die
       Datei in dem Fall einmal komplett als Blob und tauscht die Quelle:
       Blob-URLs sind immer seekbar. Auf Servern MIT Range (GitHub Pages,
       tools/serve.mjs) passiert nichts davon - dort springt der Klick sofort. */
    var pendingSeek = null;    // Zielposition, die nach dem Quellentausch greift
    var rangeOk = null;        // null = unbekannt, true/false = Server-Antwort
    var upgradePromise = null; // laufender Wechsel auf die Blob-Quelle

    function isSeekable() {
      var d = duration || audio.duration || 0;
      if (!d) return false;
      var s = audio.seekable;
      if (!s || !s.length) return false;
      return s.end(s.length - 1) >= d - 1;
    }

    function serverSupportsRange() {
      var src = audio.currentSrc || audio.src;
      return fetch(src, { method: "HEAD", cache: "no-store" })
        .then(function (r) {
          var v = r.headers.get("Accept-Ranges") || "";
          return v.toLowerCase().indexOf("bytes") !== -1;
        })
        .catch(function () { return false; });
    }

    function applyPendingSeek() {
      if (pendingSeek === null) return;
      var t = pendingSeek;
      pendingSeek = null;
      try { audio.currentTime = t; } catch (err) {}
      render();
      /* Kontrolle: hat der Browser den Sprung verworfen und wieder bei 0
         angefangen, ist der Server doch nicht seekbar -> Blob-Quelle. */
      setTimeout(function () {
        if (t > 2 && audio.currentTime < 1) upgradeToBlobSource();
      }, 700);
    }

    function upgradeToBlobSource() {
      if (upgradePromise) return upgradePromise;
      var src = audio.currentSrc || audio.src;
      var wasPlaying = !audio.paused;
      upgradePromise = fetch(src)
        .then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.blob();
        })
        .then(function (blob) {
          var url = URL.createObjectURL(blob);
          audio.src = url;
          audio.load();
          return new Promise(function (res) {
            if (audio.readyState >= 1) return res();
            audio.addEventListener("loadedmetadata", res, { once: true });
            setTimeout(res, 5000);
          }).then(function () {
            applyPendingSeek();
            if (wasPlaying) {
              var p = audio.play();
              if (p && p.catch) p.catch(function () {});
            }
          });
        })
        .catch(function () {
          /* Kein Blob moeglich: dann bleibt es beim bisherigen Verhalten. */
        });
      return upgradePromise;
    }

    function seekTo(seconds) {
      if (!duration) return;
      var t = Math.min(duration, Math.max(0, seconds));
      if (isSeekable()) {
        audio.currentTime = t;
        /* Sofort zeichnen: waehrend des Ziehens kommt kein timeupdate an. */
        render();
        return;
      }
      /* Nicht seekbar: erst klaeren, ob es am Server liegt. */
      pendingSeek = t;
      if (rangeOk === null) {
        serverSupportsRange().then(function (ok) {
          rangeOk = ok;
          if (ok) applyPendingSeek();
          else upgradeToBlobSource();
        });
      } else if (rangeOk) {
        applyPendingSeek();
      } else {
        upgradeToBlobSource();
      }
    }

    function ratioAt(clientX) {
      var rect = bar.getBoundingClientRect();
      if (!rect.width) return 0;
      return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    }

    function endScrub(e) {
      if (!scrubbing) return;
      scrubbing = false;
      if (bar.releasePointerCapture && e && e.pointerId !== undefined) {
        try { bar.releasePointerCapture(e.pointerId); } catch (err) {}
      }
    }

    function initBar() {
      if (!bar) return;
      bar.setAttribute("role", "slider");
      bar.setAttribute("tabindex", "0");
      bar.setAttribute("aria-orientation", "horizontal");
      bar.setAttribute("aria-label", english ? "Playback position" : "Wiedergabeposition");

      bar.addEventListener("pointerdown", function (e) {
        if (!duration) return;
        /* Nur die primaere Maustaste; Touch/Stift haben button 0. */
        if (e.pointerType === "mouse" && e.button !== 0) return;
        scrubbing = true;
        /* Ohne Capture verliert das Ziehen ausserhalb der 2px-Linie den
           Kontakt; wo setPointerCapture fehlt, bleibt wenigstens der
           Klick-/Zugbereich direkt ueber der Leiste bedienbar. */
        if (bar.setPointerCapture) {
          try { bar.setPointerCapture(e.pointerId); } catch (err) {}
        }
        /* Klick setzt den Fokus, damit die Tasten danach greifen. */
        try { bar.focus({ preventScroll: true }); } catch (err) { bar.focus(); }
        seekTo(ratioAt(e.clientX) * duration);
      });

      bar.addEventListener("pointermove", function (e) {
        if (!scrubbing) return;
        e.preventDefault();
        seekTo(ratioAt(e.clientX) * duration);
      });

      bar.addEventListener("pointerup", endScrub);
      bar.addEventListener("pointercancel", endScrub);
      /* Falls die Capture verloren geht (z. B. Element wird ersetzt), darf
         das Ziehen nicht "haengen" bleiben. */
      bar.addEventListener("lostpointercapture", endScrub);

      /* Tastatur: Pfeile = +/-5 s, Home/End = Anfang/Ende. stopPropagation,
         weil js/track.js global auf die Pfeiltasten hoert und sonst
         zusaetzlich eine Ansicht weiterschiebt (der Slider hat den Fokus,
         also gehoeren ihm die Tasten). */
      bar.addEventListener("keydown", function (e) {
        if (!duration) return;
        var k = e.key;
        if (k === "ArrowRight") seekTo(audio.currentTime + SEEK_STEP);
        else if (k === "ArrowLeft") seekTo(audio.currentTime - SEEK_STEP);
        else if (k === "Home") seekTo(0);
        else if (k === "End") seekTo(duration);
        else return;
        e.preventDefault();
        e.stopPropagation();
      });
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
    /* Nach einem Seek (auch aus dem Scrubben) sofort nachziehen. */
    audio.addEventListener("seeked", render);

    audio.addEventListener("ended", function () {
      audio.currentTime = 0;
      render();
    });

    window.addEventListener("resize", syncLyrics);

    initBar();
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
