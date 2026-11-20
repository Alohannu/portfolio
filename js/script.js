(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var wrapper = document.getElementById("hero-wrapper");
  var video1 = document.getElementById("video-1");
  var video2 = document.getElementById("video-2");
  var overlay = document.getElementById("stageOverlay");
  var toggle = document.getElementById("soundToggle");

  var SCRUB_VH = 2;   // Scrollstrecke für Video 1 (in Viewport-Höhen); danach 1vh Pin für Video 2
  var FADE_END = 0.6; // Overlay ist bei 60 % des Scrubbing-Wegs vollständig transparent

  var heroState = {
    videoTwoStarted: false,
    videoTwoEnded: false,
    videoTwoPausedByLeave: false
  };
  var progress = 0;
  var stageVisible = true;
  var coveredByNext = false; // Morph-Abschnitt deckt den Hero-Stage vollständig ab
  var lastTime = -1;
  var ticking = false;

  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
  function safePlay(v) {
    var pr = v.play();
    if (pr && pr.catch) pr.catch(function () {});
  }

  function getProgress() {
    var top = wrapper.getBoundingClientRect().top;
    if (reduceMotion) return top <= -1 ? 1 : 0; // kein Scrubbing: Video 2 startet beim ersten Scrollen
    var dist = window.innerHeight * SCRUB_VH;
    return clamp(-top / dist, 0, 1);
  }

  /* Start mit Ton; blockiert der Browser das (kein Nutzerklick bisher), läuft es stumm
     und wird beim ersten Klick/Tastendruck/Touch eingeschaltet. */
  function startVideo2() {
    var pr = video2.play();
    if (pr && pr.catch) {
      pr.catch(function () {
        if (!video2.muted) {
          video2.muted = true;
          syncToggle();
          safePlay(video2);
        }
      });
    }
  }

  /* Video 2: spielt nur, wenn gestartet, nicht beendet, Video 1 am Ende und Stage sichtbar */
  function syncVideo2() {
    if (!heroState.videoTwoStarted || heroState.videoTwoEnded) return;
    var shouldPlay = progress >= 1 && stageVisible && !coveredByNext;
    if (shouldPlay && video2.paused) {
      heroState.videoTwoPausedByLeave = false;
      safePlay(video2);
    } else if (!shouldPlay && !video2.paused) {
      heroState.videoTwoPausedByLeave = true;
      video2.pause();
    }
  }

  function update() {
    ticking = false;
    progress = getProgress();
    coveredByNext = wrapper.getBoundingClientRect().bottom <= window.innerHeight + 1;

    // Ausgeblendet = nicht klickbar (Sprachumschalter liegt im Overlay)
    overlay.style.visibility = progress >= 0.55 ? "hidden" : "visible";

    // Video 1: vollständig reversibel scrubben
    if (reduceMotion) {
      overlay.style.opacity = progress >= 1 ? "0" : "1";
    } else {
      overlay.style.opacity = String(1 - clamp(progress / FADE_END, 0, 1));
      var d = video1.duration;
      if (d && isFinite(d)) {
        var t = progress * d;
        if (Math.abs(t - lastTime) > 0.01 || (progress === 1 && lastTime !== d)) {
          video1.currentTime = t;
          lastTime = t;
        }
      }
    }

    // Video 2: zurück in Video 1 → ausblenden und von vorne bereitstellen
    video2.style.opacity = progress >= 1 ? "1" : "0";
    if (progress < 1 && heroState.videoTwoStarted) {
      video2.pause();
      video2.currentTime = 0;
      heroState.videoTwoStarted = false;
      heroState.videoTwoEnded = false;
      heroState.videoTwoPausedByLeave = false;
    }
    if (progress >= 1 && !heroState.videoTwoStarted) {
      heroState.videoTwoStarted = true;
      if (stageVisible) startVideo2();
    }
    syncVideo2();
  }

  function requestUpdate() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }

  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate);
  video1.addEventListener("loadedmetadata", requestUpdate);

  // iOS: Video 1 einmal anspielen, damit currentTime-Seeking Frames liefert
  if (!reduceMotion) {
    window.addEventListener("touchstart", function () {
      var pr = video1.play();
      if (pr && pr.then) pr.then(function () { video1.pause(); requestUpdate(); }).catch(function () {});
    }, { passive: true, once: true });
  }

  /* Sichtbarkeit des Stage-Wrappers: Pause/Resume von Video 2 */
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      stageVisible = entries[entries.length - 1].isIntersecting;
      syncVideo2();
    }, { threshold: 0, rootMargin: "-1px 0px -1px 0px" }).observe(wrapper); // Randberührung zählt nicht als sichtbar
  }

  video2.addEventListener("ended", function () {
    heroState.videoTwoEnded = true; // letzter Frame bleibt stehen; der Morph-Abschnitt folgt über die feste Scrollstrecke
  });

  /* Mute-Zustand gilt für beide Videos und bleibt beim Wechsel erhalten */
  function syncToggle() {
    toggle.setAttribute("aria-pressed", video2.muted ? "true" : "false");
  }
  var userChoseMute = false;
  toggle.addEventListener("click", function () {
    userChoseMute = true;
    video2.muted = !video2.muted;
    syncToggle();
  });

  // Ton ist Standard: sobald der Browser Ton erlaubt (erste Nutzeraktion), einschalten
  video2.muted = false;
  ["pointerdown", "keydown", "touchend"].forEach(function (evt) {
    window.addEventListener(evt, function enableSound(e) {
      if (toggle.contains(e.target)) return; // der Button entscheidet selbst
      window.removeEventListener(evt, enableSound);
      if (!userChoseMute && video2.muted) {
        video2.muted = false;
        syncToggle();
      }
    }, { passive: true });
  });
  syncToggle();

  update();

  /* ---------- Projekt 2: Kampagnenvideo (Scrubbing wie im Hero) ----------
     Ablauf:
       1. Waehrend des Schwenks (track.js schiebt die Buehne herein) steht
          das erste Bild still, die Ueberschrift liegt darueber.
       2. Sobald die Ansicht angekommen ist, laeuft das Video mit Ton von
          vorn - nicht erst beim Scrollen. Es laeuft weiter, auch wenn das
          Scrollen anhaelt ("Ton ist einfach an").
          Beim Vorwaerts-Scrollen durch die Strecke wird die Abspielzeit am
          Scrollfortschritt gehalten, aber nur bei groesserer Abweichung
          (0,8 s) nachgezogen - staendiges Seeking wuerde den Ton abreissen
          lassen (wie im Original "Ton laeuft mit").
          Rueckwaerts bleibt es still und das Bild folgt dem Scroll.
       3. Am Ende der Strecke laeuft das Video mit Ton weiter - nur wenn
          der Scrub es nicht bis dorthin mitgenommen hat, von vorn.

     Unterschied zum Hero: dort sind es zwei Videos (intro.mp4 wird
     gescrubbt, intro-video.mp4 spielt danach). Hier gibt es nur ein
     Kampagnenvideo; es wird gescrubbt und danach abgespielt.

     Damit nie zwei Videos gleichzeitig Ton machen, schaltet der Schwenk
     das jeweils andere stumm (siehe track.js -> window.SerumVideo).

     WARUM der Ton nicht mehr am Scrollen haengt: der Browser erlaubt Ton
     ohne Nutzergeste gar nicht (Autoplay-Politik). Haengt er zusaetzlich
     am Scrollen, ist er praktisch "durchgehend aus" - vor allem, wenn die
     erste Geste verbraucht ist, bevor diese Ansicht im Bild steht. */
  var serumHero = document.getElementById("serumHero");
  var serumOverlay = document.getElementById("serumOverlay");
  var serumVideo = document.getElementById("serumVideo");
  var serumToggle = document.getElementById("serumSoundToggle");

  if (serumVideo) {
    /* Scrollstrecke des Scrubbings in Viewport-Hoehen - wie SCRUB_VH des
       Heros oben. Muss zur Hoehe von .hero-wrapper--serum passen
       (css/track.css: 500vh = 200vh Scrubbing + Halten). */
    var SERUM_SCRUB_VH = 2;

    var serumProgress = 0;         // 0 = Stillstand, 1 = durchgescrubbt
    var serumPanelActive = false;  // Ansicht 2 ist eingeschwenkt (track.js)
    var serumInView = false;       // Hero liegt im Viewport
    var serumArrived = false;      // Schwenk vorbei: die Ansicht steht still
    var serumPlaying = false;      // Play-Phase nach dem Scrubbing laeuft
    var serumLastTime = -1;        // zuletzt gesetzte Scrub-Zeit
    var serumTicking = false;
    var serumUserChoseMute = false;
    var serumDir = 0;              // Scrollrichtung: 0 = noch kein Scroll-Event
    var serumLastY = window.pageYOffset;
    var serumDirTimer = 0;         // setzt die Richtung nach dem Scrollen zurueck
    var serumScrubCarried = false; // der Vorwaerts-Scrub hat das Video mitgenommen

    /* So lange nach dem letzten Scroll-Event gilt die Richtung noch. Danach
       ist sie wieder 0 und das Video laeuft weiter mit Ton - auch wenn
       zuletzt rueckwaerts gescrollt wurde. */
    var SERUM_DIR_IDLE_MS = 150;

    /* Hat der Browser schon eine echte Nutzergeste gesehen? Nur dann darf
       ein play() mit Ton ueberhaupt gelingen - ohne Geste lehnt der Browser
       es ab. Ohne diese Abfrage wuerde jedes Scroll-Event unnoetig ein
       stummes play() versuchen und gleich wieder stumm schalten. */
    var serumActivated = false;

    function serumUserActivated() {
      if (serumActivated) return true;
      var ua = navigator.userActivation;
      if (ua && ua.hasBeenActive) { serumActivated = true; return true; }
      return false;
    }

    /* Ton nachholen, wenn er nur wegen der Autoplay-Politik aus ist (der
       Nutzer hat ihn nie selbst abgeschaltet). WARUM nicht nur einmal beim
       ersten Klick: der stumme Rueckfall in serumPlay() kann eintreten,
       BEVOR diese Ansicht aktiv ist - dann war die erste Geste schon
       verbraucht und der Ton blieb fuer den Rest des Besuchs aus
       ("das Video laeuft, der Ton geht nicht los"). */
    function serumTryUnmute() {
      if (serumUserChoseMute || !serumVideo.muted) return false;
      if (!serumUserActivated()) return false;
      serumVideo.muted = false;
      serumSyncToggle();
      return true;
    }

    function serumSyncToggle() {
      if (serumToggle) {
        serumToggle.setAttribute("aria-pressed", serumVideo.muted ? "true" : "false");
      }
    }

    /* Stumm schalten darf nur ein echtes Autoplay-Verbot (NotAllowedError).
       Ein AbortError dagegen heisst: das eigene pause() hat den play()-
       Versuch unterbrochen (der Scrub pausiert bei jedem Rueckwaerts-Schritt
       und beim Scrollstopp). Wird auch das als Autoplay-Verbot gewertet,
       bleibt das Video dauerhaft stumm - auf 390x844 war der Ton am
       Streckenende genau deshalb aus, obwohl das Video lief und im Bild
       stand. */
    function serumPlay() {
      var pr = serumVideo.play();
      if (pr && pr.catch) {
        pr.catch(function (e) {
          if (e && e.name && e.name !== "NotAllowedError") return;
          if (!serumVideo.muted) {
            serumVideo.muted = true;
            serumSyncToggle();
            safePlay(serumVideo);
          }
        });
      }
    }

    /* Vorwaerts mitten in der Scrub-Strecke: die Abspielzeit wird hier am
       Scrollfortschritt gehalten (Ton laeuft dabei weiter). */
    function serumScrubbing() {
      return serumDir > 0 && serumProgress > 0 && serumProgress < 1;
    }

    /* Ton und Bild laufen, sobald die Ansicht angekommen ist - auch ohne
       Scrollen und auch nach einem Scrollstopp ("Ton ist einfach an").
       Waehrend des Schwenks (noch nicht angekommen) und beim Rueckwaerts-
       Scrollen bleibt das Bild stehen bzw. folgt still dem Scroll. */
    function serumShouldPlay() {
      if (!serumPanelActive || !serumInView || document.hidden) return false;
      if (!serumArrived) return false;
      /* Nur beim Vorwaerts-Scrollen: Stopp = Bild und Ton halten an,
         rueckwaerts folgt das Bild still dem Scroll (Scrub, kein Ton). */
      return serumDir > 0;
    }

    function serumSyncPlayback() {
      if (serumShouldPlay()) {
        serumTryUnmute();
        if (serumVideo.paused) serumPlay();
      } else if (!serumVideo.paused) {
        serumVideo.pause();
      }
    }

    function serumUpdate() {
      serumTicking = false;

      /* Eine Layout-Abfrage fuer alles: Fortschritt und Sichtbarkeit. */
      var rect = serumHero ? serumHero.getBoundingClientRect() : null;
      var top = rect ? rect.top : 0;
      if (reduceMotion) {
        serumProgress = top <= -1 ? 1 : 0;
        serumArrived = top <= -1;
      } else {
        /* Der Schwenk (js/track.js) schiebt die Buehne schon eine
           Schwenkstrecke weit nach oben, waehrend sie noch seitlich
           hereinkommt. Diese Strecke darf das Video nicht mit-scrubben:
           sonst waere das Titelbild beim Ankommen der Ansicht bereits zur
           Haelfte ausgeblendet. Die ersten `pan` Pixel halten deshalb das
           erste Bild - erst danach ist die Ansicht "angekommen" und das
           Video startet mit Ton. */
        var panHold = window.TurnTrack && typeof window.TurnTrack.pan === "number"
          ? window.TurnTrack.pan
          : 0;
        var travelled = -top - panHold;
        serumArrived = travelled >= -4;
        serumProgress = clamp(travelled / (window.innerHeight * SERUM_SCRUB_VH), 0, 1);
      }
      serumInView = !!rect && rect.bottom > 0 && top < window.innerHeight;

      /* Ueberschrift wie im Hero ueber die ersten 60 % des Weges ausblenden */
      if (serumOverlay) {
        serumOverlay.style.opacity = reduceMotion
          ? (serumProgress >= 1 ? "0" : "1")
          : String(1 - clamp(serumProgress / FADE_END, 0, 1));
      }

      if (serumProgress >= 1) {
        if (!serumPlaying) {
          /* Scrub-Weg zu Ende: das Video laeuft mit Ton weiter. Nur wenn es
             noch steht (Sprung, Deep-Link oder rueckwaerts gescrollt),
             beginnt es von vorn - laeuft es schon, waere der Sprung auf 0
             ein hoerbarer Aussetzer. */
          serumPlaying = true;
          serumScrubCarried = false;
        }
      } else {
        serumPlaying = false;
        var d = serumVideo.duration;
        if (d && isFinite(d)) {
          var t = serumProgress * d;
          if (serumScrubbing()) {
            /* Vorwaerts: Ton laeuft mit. Die Abspielzeit folgt dem Scroll
               nur bei groesserer Abweichung - staendiges Seeking wuerde den
               Ton abreissen lassen (wie im Original: erst ab 0,8 s). */
            serumScrubCarried = true;
            if (Math.abs(t - serumVideo.currentTime) > 0.8) {
              serumVideo.currentTime = t;
            }
            serumLastTime = t;
          } else if (serumDir < 0) {
            /* Rueckwaerts: kein Ton, das Bild folgt dem Scroll Frame fuer
               Frame (wie bisher). Steht der Scroll wieder (serumDir 0),
               laeuft das Video an dieser Stelle weiter - mit Ton. */
            if (!serumVideo.paused) serumVideo.pause();
            if (Math.abs(t - serumLastTime) > 0.01) {
              serumVideo.currentTime = t;
              serumLastTime = t;
            }
          }
        } else if (!serumVideo.paused) {
          serumVideo.pause();
        }
      }
      serumSyncPlayback();
    }

    function serumRequestUpdate() {
      if (!serumTicking) {
        serumTicking = true;
        requestAnimationFrame(serumUpdate);
      }
    }

    /* Scrollrichtung merken: vorwaerts haelt die Abspielzeit am Scroll,
       rueckwaerts folgt das Bild still dem Scroll. Ohne Scroll-Event bleibt
       serumDir 0 - dann laeuft das Video trotzdem, sobald die Ansicht
       angekommen ist ("Ton ist einfach an"). */
    function serumOnScroll() {
      var y = window.pageYOffset;
      if (y !== serumLastY) {
        serumDir = y > serumLastY ? 1 : -1;
        serumLastY = y;
      }
      /* Richtung nach dem Scrollen zuruecksetzen: sonst bliebe der Ton aus,
         nur weil zuletzt rueckwaerts gescrollt wurde - die Ansicht steht
         dann sichtbar da und das Video waere still. */
      clearTimeout(serumDirTimer);
      serumDirTimer = setTimeout(function () {
        serumDir = 0;
        serumRequestUpdate();
      }, SERUM_DIR_IDLE_MS);
      serumRequestUpdate();
    }

    window.addEventListener("scroll", serumOnScroll, { passive: true });
    window.addEventListener("resize", serumRequestUpdate);
    serumVideo.addEventListener("loadedmetadata", serumRequestUpdate);

    /* iOS liefert beim currentTime-Seeking erst Frames, wenn das Video
       einmal angespielt wurde - wie beim Hero-Video. */
    if (!reduceMotion) {
      window.addEventListener("touchstart", function () {
        var pr = serumVideo.play();
        if (pr && pr.then) {
          pr.then(function () { serumVideo.pause(); serumRequestUpdate(); }).catch(function () {});
        }
      }, { passive: true, once: true });
    }

    if (serumToggle) {
      serumToggle.addEventListener("click", function () {
        serumVideo.muted = !serumVideo.muted;
        /* "selbst stumm geschaltet" gilt nur, wenn der Klick wirklich stumm
           macht. Dreht der Klick den Ton ein, bleibt das automatische
           Einschalten scharf - sonst waere der Ton nach einem Klick, der
           ihn einschalten sollte, fuer den Rest des Besuchs aus. */
        serumUserChoseMute = serumVideo.muted;
        serumSyncToggle();
      });
    }

    /* Ton ist Standard - genau wie beim Hero-Video in Track 1: das Video
       wird sofort auf muted = false gesetzt und nicht erst beim Einschwenken
       der Ansicht. Blockiert der Browser Ton ohne Nutzergeste, laeuft es
       stumm und wird beim ersten Klick/Tastendruck/Touch eingeschaltet. */
    serumVideo.muted = true;
    serumSyncToggle();
    serumTryUnmute();

    /* Wie in Track 1, aber nicht nur beim allerersten Mal: der Ton wird bei
       JEDER Geste nachgeholt. Sonst blieb er stumm, wenn die erste Geste
       verbraucht war, bevor diese Ansicht im Bild stand. */
    ["pointerdown", "keydown", "touchend"].forEach(function (evt) {
      window.addEventListener(evt, function serumEnableSound(e) {
        serumActivated = true;
        if (serumToggle && serumToggle.contains(e.target)) return;
        serumTryUnmute();
      }, { passive: true });
    });

    document.addEventListener("visibilitychange", serumSyncPlayback);

    serumSyncToggle();

    /* Von track.js aufgerufen, wenn die Ansicht gewechselt wird: die
       sichtbare Ansicht darf spielen und Ton haben, die andere nicht. */
    window.SerumVideo = {
      setActive: function (on) {
        serumPanelActive = !!on;
        /* Position sofort neu messen: der Schwenk setzt scrollY auf 0,
           serumProgress stammte aber noch von der alten Scrollposition. */
        serumUpdate();
      },
      setAudible: function (on) {
        if (!on && !serumVideo.muted) {
          serumVideo.muted = true;
          serumSyncToggle();
        } else if (on) {
          serumTryUnmute();
        }
      }
    };

    serumUpdate();
  }

  /* ---------- Morph-Reveal (wiedervereinbar, Initialisierung über [data-morph]) ---------- */
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  var BLOB_JITTER = [0.06, -0.09, 0.11, -0.05, 0.08, -0.1, 0.05, -0.07]; // feste, leicht unregelmäßige Form

  // Scrollstrecke des Morphs in Viewport-Höhen. Muss zum morphVh der
  // [data-morph]-Sections passen – der Graph-Handler prüft damit, ob der
  // Morph fertig ist (siehe tryonIsActive).
  var MORPH_VH = 1;

  function initMorphReveal(el, options) {
    var stage = el.querySelector(".morph-reveal__stage");
    if (!stage) return null;

    var isMobile = window.matchMedia("(max-width: 767px)").matches;
    var opts = {
      startScale: isMobile ? 0.4 : 0.2, // Breite der Startform relativ zum Stage
      points: 8,                        // Stützpunkte (Vielfaches von 4)
      easing: easeOutCubic,
      morphVh: MORPH_VH,                // Scrollstrecke des Morphs in Viewport-Höhen
      onProgress: null
    };
    for (var k in options) if (options[k] !== undefined) opts[k] = options[k];
    if (el.dataset.morphStart) opts.startScale = parseFloat(el.dataset.morphStart);
    if (el.dataset.morphPoints) opts.points = parseInt(el.dataset.morphPoints, 10);
    var N = Math.max(4, Math.round(opts.points / 4) * 4);

    var blob = [], rect = [];
    var lastRaw = -1, active = false, ticking = false;

    // Flaches Array: Ankerpunkte, dann Handle 1, dann Handle 2 (je N Punkte, x/y)
    function build(anchors, handles) {
      var out = [], i;
      for (i = 0; i < N; i++) out.push(anchors[i][0], anchors[i][1]);
      for (i = 0; i < N; i++) out.push(handles.c1[i][0], handles.c1[i][1]);
      for (i = 0; i < N; i++) out.push(handles.c2[i][0], handles.c2[i][1]);
      return out;
    }

    function computeShapes() {
      var W = stage.clientWidth, H = stage.clientHeight, i;
      var m = N / 4, corners = [[0, 0], [W, 0], [W, H], [0, H]];

      // Ende: Rechteck – Anker exakt auf Ecken und Kanten, Handles entlang der Kanten
      var ra = [];
      for (i = 0; i < N; i++) {
        var e = Math.floor(i / m), f = (i % m) / m, a = corners[e], b = corners[(e + 1) % 4];
        ra.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
      }
      var rh = { c1: [], c2: [] };
      for (i = 0; i < N; i++) {
        var p = ra[i], q = ra[(i + 1) % N];
        rh.c1.push([p[0] + (q[0] - p[0]) / 3, p[1] + (q[1] - p[1]) / 3]);
        rh.c2.push([p[0] + (q[0] - p[0]) * 2 / 3, p[1] + (q[1] - p[1]) * 2 / 3]);
      }
      rect = build(ra, rh);

      // Start: kleine, unregelmäßige, abgerundete Form (Catmull-Rom → Bézier)
      var rx = opts.startScale * W / 2, ry = Math.min(rx * 1.3, H * 0.4);
      var ba = [];
      for (i = 0; i < N; i++) {
        var ang = (-135 + i * 360 / N) * Math.PI / 180, j = 1 + BLOB_JITTER[i % BLOB_JITTER.length];
        ba.push([W / 2 + Math.cos(ang) * rx * j * 1.42, H / 2 + Math.sin(ang) * ry * j * 1.42]);
      }
      var bh = { c1: [], c2: [] };
      for (i = 0; i < N; i++) {
        var p0 = ba[(i - 1 + N) % N], p1 = ba[i], p2 = ba[(i + 1) % N], p3 = ba[(i + 2) % N];
        bh.c1.push([p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]);
        bh.c2.push([p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]);
      }
      blob = build(ba, bh);
    }

    function pathFor(t) {
      var v = [], i;
      for (i = 0; i < blob.length; i++) v.push(blob[i] + (rect[i] - blob[i]) * t);
      function pt(n) { return v[2 * n].toFixed(1) + " " + v[2 * n + 1].toFixed(1); }
      var d = "M " + pt(0);
      for (i = 0; i < N; i++) {
        d += " C " + pt(N + i) + ", " + pt(2 * N + i) + ", " + pt((i + 1) % N);
      }
      return d + " Z";
    }

    function apply(raw, offset) {
      if (reduceMotion || raw >= 1) {
        stage.style.clipPath = "none";
        stage.style.opacity = "1";
      } else {
        stage.style.clipPath = "path('" + pathFor(opts.easing(raw)) + "')";
        // kurzes Einblenden, damit die Form nicht plötzlich erscheint
        stage.style.opacity = String(clamp(offset / (window.innerHeight * opts.morphVh * 0.06), 0, 1));
      }
      if (opts.onProgress) opts.onProgress(reduceMotion ? 1 : raw);
    }

    // Fortschrittsquelle des Morphs.
    // Standard: Position der Section-Oberkante. Das funktioniert, solange die
    // Stage erst später pinnt (Sections mit margin-top: -200vh).
    // Bei #tryon pinnt die Stage sofort (top: 0, height: 100vh), die
    // Oberkante steht also still und der Morph käme nie über raw = 0 hinaus.
    // Dort messen wir deshalb den Weg durch die Section selbst.
    function progressOffset() {
      if (opts.progressMode === "section") {
        var r = el.getBoundingClientRect();
        return clamp(-r.top, 0, Math.max(1, el.offsetHeight - window.innerHeight));
      }
      return -el.getBoundingClientRect().top;
    }

    function update(force) {
      ticking = false;
      var offset = progressOffset();
      var raw = clamp(offset / (window.innerHeight * opts.morphVh), 0, 1);
      if (raw === lastRaw && !force) return; // nur bei Änderung
      lastRaw = raw;
      apply(raw, offset);
    }

    function onScroll() {
      if (!active || ticking) return;
      ticking = true;
      requestAnimationFrame(function () { update(false); });
    }

    computeShapes();
    update(true);

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", function () {
      computeShapes();
      update(true);
    });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        active = entries[entries.length - 1].isIntersecting;
        if (active) update(false);
      }, { threshold: 0, rootMargin: "100px 0px 100px 0px" }).observe(el);
    } else {
      active = true;
    }
    return { update: function () { update(true); } };
  }

  /* ---------- Abschnitt 3: Avatar-Wechsel (beide Spalten synchron) + Reveal/Fade-in ----------
     Gilt jetzt fuer JEDEN Projekt-Abschnitt mit .avatar-stack, nicht nur
     fuer #projekte: Projekt 1 hat zwei Spalten mit je 5 Bildern, Projekt 2
     eine Spalte mit 6. Jeder Abschnitt wird eigenstaendig aus seiner
     eigenen Scroll-Position gesteuert. */
  function makeAvatarSwitcher(section) {
    var stacks = Array.prototype.slice.call(section.querySelectorAll(".avatar-stack")).map(function (el) {
      return Array.prototype.slice.call(el.querySelectorAll(".avatar"));
    }).filter(function (imgs) { return imgs.length > 0; });
    if (!stacks.length) return null;

    // Schrittweite: der Abschnitt mit den meisten Bildern gibt sie vor.
    var steps = stacks.reduce(function (n, imgs) { return Math.max(n, imgs.length); }, 0);
    var activeAvatar = -1; // erzwingt den ersten Durchlauf
    var ticking = false;
    var fadeText = section.querySelector(".fade-in");
    var shirtEls = Array.prototype.slice.call(section.querySelectorAll("#shirtHeading, #shirtStack"));
    var shirts = Array.prototype.slice.call(section.querySelectorAll(".shirt"));

    // Scrollstrecke: 100vh Morph, danach der Bildwechsel ueber den Rest.
    function updateAvatar() {
      ticking = false;
      var vh = window.innerHeight;
      if (!vh) return;
      var offset = -section.getBoundingClientRect().top;
      var p = clamp((offset - vh) / (2 * vh), 0, 1);
      var idx = Math.min(steps - 1, Math.floor(p * steps));
      if (idx !== activeAvatar) {
        stacks.forEach(function (imgs) {
          // Kuerzere Stacks behalten ihr letztes Bild, statt zu verschwinden.
          var next = Math.min(idx, imgs.length - 1);
          var prevIdx = Math.min(activeAvatar < 0 ? 0 : activeAvatar, imgs.length - 1);
          if (imgs[prevIdx] && imgs[prevIdx] !== imgs[next]) imgs[prevIdx].classList.remove("is-active");
          if (imgs[next]) imgs[next].classList.add("is-active");
        });
        activeAvatar = idx;
      }
      if (fadeText) fadeText.classList.toggle("is-visible", idx >= 1);
      /* Zweiter Block (nur #projekte): Ueberschrift und Shirt-Bild kommen im
         selben Schritt wie der Text; danach wechselt das Bild je Schritt
         (idx 1 -> Shirt 1 ... idx 4 -> Shirt 4). */
      if (shirtEls.length) {
        shirtEls.forEach(function (el) { el.classList.toggle("is-visible", idx >= 1); });
        var si = clamp(idx - 1, 0, shirts.length - 1);
        shirts.forEach(function (img, n) { img.classList.toggle("is-active", n === si); });
      }
    }
    function requestAvatarUpdate() {
      if (!ticking) { ticking = true; requestAnimationFrame(updateAvatar); }
    }
    window.addEventListener("scroll", requestAvatarUpdate, { passive: true });
    window.addEventListener("resize", requestAvatarUpdate);
    updateAvatar();
    return { update: updateAvatar };
  }

  Array.prototype.slice.call(document.querySelectorAll(".project")).forEach(function (section) {
    if (section.querySelector(".avatar-stack")) makeAvatarSwitcher(section);
  });

  /* ---------- Gesichtsbild: von Abschnitt 4 in den Node-Graph (Abschnitt 5) ----------
     Das Porträt aus #konsistenz wandert als Klon (#faceFly) skaliert zum
     Bild-Node "model" des Graphen. Dort geht es in das Node-Bild über:
     media/projects/projekt-1/model.webp ist dieselbe Datei wie
     media/projects/projekt-1/avatar-jason-face.webp, deshalb
     ist die Übergabe am Ende ohne Kante. Eine CSS-Änderung braucht es nicht –
     .face-fly ist position:fixed mit transform-origin 0 0, wir rechnen also
     durchgehend in Viewport-Koordinaten (kein Stage-Ursprung).

     Start- und Zielrechteck werden bei jedem Aufruf frisch gemessen, weil sich
     beide mit dem Scrollen verschieben. */
  var faceOrig = document.querySelector("#konsistenz .face");
  var faceFly = document.getElementById("faceFly");
  var comfy = document.getElementById("comfy");

  var faceTarget = null;  // Bild-Node des Graphen, entsteht erst nach dem Rendern
  var faceBaseW = -1;     // zuletzt gesetzte Elementgröße des Klons
  var faceBaseH = -1;

  // Ziel-Node lazy auflösen: NodeView rendert den Graphen erst nach diesem Skript.
  function findFaceTarget() {
    if (faceTarget && faceTarget.isConnected) return faceTarget;
    faceTarget = document.querySelector('#comfy-slot .nv-node[data-node="41"] .nv-img');
    return faceTarget;
  }

  // Sichtbarer Inhalt eines object-fit:contain-Bildes. Bewusst NICHT die
  // Elementbox: die ist bei contain größer als das Bild (383×547 statt 383×479),
  // ein Start von der Elementbox aus springt beim ersten Frame.
  function faceVisibleRect(img) {
    var r = img.getBoundingClientRect();
    var nw = img.naturalWidth, nh = img.naturalHeight;
    if (!r.width || !r.height || !nw || !nh) return null;
    var s = Math.min(r.width / nw, r.height / nh);
    var w = nw * s, h = nh * s;
    return { x: r.left + (r.width - w) / 2, y: r.top + (r.height - h) / 2, w: w, h: h };
  }

  // Liegt der Ziel-Node überwiegend im sichtbaren Canvas? Wurde vorher im
  // Graphen nach unten gescrollt, steht er außerhalb; dann darf der Klon nicht
  // fliegen – er liegt mit z-index 30 über allem und landete sonst über
  // fremdem Seiteninhalt.
  function faceTargetInCanvas(rect) {
    var canvas = document.querySelector("#comfy-slot .nv-canvas");
    if (!canvas || !canvas.isConnected) return false;
    var c = canvas.getBoundingClientRect();
    var ox = Math.min(rect.x + rect.w, c.right) - Math.max(rect.x, c.left);
    var oy = Math.min(rect.y + rect.h, c.bottom) - Math.max(rect.y, c.top);
    if (ox <= 0 || oy <= 0) return false;
    return (ox * oy) / (rect.w * rect.h) >= 0.5;
  }

  // Der Model-Node ist während des Flugs schwarz verdeckt: die Kachel fliegt auf
  // die schwarze Fläche, danach verschwinden Kachel und Schwärze und man sieht
  // das echte Bild im Graphen. brightness(0) schwärzt genau die Bildfläche –
  // kein zusätzliches Element, keine Layoutänderung, Node-Radius und -Kante
  // bleiben. Die Fläche liegt im Graphen und wird so von der Morph-Maske
  // mitgeclippt und wandert bei Pan/Zoom mit.
  function faceMat(target, black) {
    if (!target) return;
    if (black) {
      target.style.transition = "filter 180ms linear";
      target.style.filter = "brightness(0)";
    } else if (target.style.filter) {
      target.style.filter = ""; // Übergang blendet das echte Bild zurück
    }
  }

  // Ruhezustand: Klon weg, Original sichtbar. Jeder Zweifelsfall landet hier,
  // damit nie ein Klon ohne gültiges Ziel stehen bleibt.
  function faceRest() {
    if (faceFly) faceFly.style.visibility = "hidden";
    if (faceOrig) faceOrig.classList.remove("is-away");
    faceMat(faceTarget, false);
  }

  // Deckt die Tryon-Bühne das Porträt wirklich zu? Nur dann darf das Original
  // verschwinden. Unter prefers-reduced-motion ruft der Morph onProgress immer
  // mit 1 auf, auch wenn #tryon noch weit unterhalb des Viewports steht
  // (IntersectionObserver-Rand 100px); ohne diese Prüfung wäre das Porträt
  // dauerhaft ausgeblendet – auch beim Zurückscrollen in Abschnitt 4.
  function faceStageCovers() {
    var stage = document.querySelector("#tryon .morph-reveal__stage");
    var start = faceOrig && faceVisibleRect(faceOrig);
    if (!stage || !start) return false;
    var s = stage.getBoundingClientRect();
    var ox = Math.min(start.x + start.w, s.right) - Math.max(start.x, s.left);
    var oy = Math.min(start.y + start.h, s.bottom) - Math.max(start.y, s.top);
    if (ox <= 0 || oy <= 0) return false;
    return (ox * oy) / (start.w * start.h) >= 0.5;
  }

  function faceFlight(raw) {
    if (!faceOrig || !faceFly) return;

    // Ende der Landung: das Node-Bild selbst ist das Ziel, der Klon hätte dort
    // nur eine Doppelkante. Das Original verschwindet nur, wenn die Bühne es
    // tatsächlich verdeckt – sonst bliebe das Porträt unerreichbar versteckt.
    if (raw >= 1) {
      faceFly.style.visibility = "hidden";
      // Erst die Kachel, dann die Schwärze: das echte Bild blendet zurück.
      faceMat(findFaceTarget(), false);
      faceOrig.classList.toggle("is-away", faceStageCovers());
      return;
    }
    if (raw <= 0) { faceRest(); return; }

    var target = findFaceTarget();
    var start = faceVisibleRect(faceOrig);
    if (!target || !start) { faceRest(); return; }
    var r = target.getBoundingClientRect();
    if (!r.width || !r.height) { faceRest(); return; }
    var dest = { x: r.left, y: r.top, w: r.width, h: r.height };
    if (!faceTargetInCanvas(dest)) { faceRest(); return; }

    // Model-Node schwarz legen, solange die Kachel unterwegs ist.
    faceMat(target, true);

    // Elementgröße nur bei echter Änderung setzen (Resize): die Transform-Basis
    // bleibt über alle Frames gleich, sonst zappelt die Skalierung.
    if (faceBaseW !== start.w || faceBaseH !== start.h) {
      faceBaseW = start.w;
      faceBaseH = start.h;
      faceFly.style.width = start.w + "px";
      faceFly.style.height = start.h + "px";
    }

    var t = easeOutCubic(clamp(raw, 0, 1));
    var x = start.x + (dest.x - start.x) * t;
    var y = start.y + (dest.y - start.y) * t;
    // Uniform skalieren: Start- und Zielbild haben dasselbe Seitenverhältnis,
    // die Breite gibt den Faktor vor.
    var k = 1 + (dest.w / start.w - 1) * t;
    faceFly.style.transform = "translate(" + x.toFixed(2) + "px, " + y.toFixed(2) +
      "px) scale(" + k.toFixed(4) + ")";
    // Ecken mitziehen, sonst stoßen am Ende runde Klon-Ecken auf eckige Node-Ecken.
    var radius = parseFloat(getComputedStyle(target).borderTopLeftRadius);
    faceFly.style.borderRadius = (isFinite(radius) ? radius * t : 0).toFixed(2) + "px";

    faceFly.style.visibility = "visible";
    faceOrig.classList.add("is-away");
  }

  // Morph-Reveal für alle [data-morph]-Wrapper; Headline-Reveal, sobald die Maske (fast) offen ist
  Array.prototype.slice.call(document.querySelectorAll("[data-morph]")).forEach(function (el) {
    var title = el.querySelector(".reveal"), fade = el.querySelector(".fade-in");
    initMorphReveal(el, {
      // #tryon pinnt sofort; der Morph muss über den Weg durch die Section
      // laufen, sonst bleibt er auf raw = 0 stehen (siehe progressOffset).
      progressMode: el.id === "tryon" ? "section" : "top",
      onProgress: function (raw) {
        title.classList.toggle("is-visible", raw >= 0.9);
        if (el.id === "tryon") faceFlight(raw);
        // Abschnitte mit .avatar-stack steuern ihren Text selbst über den
        // Bildwechsel (makeAvatarSwitcher, Kriterium idx >= 1). Ohne diese
        // Ausnahme setzen zwei Handler dieselbe Klasse mit widersprechender
        // Bedingung: im Fenster raw = 1.0 bis 1.333 machte der Morph .fade-in
        // schon sichtbar, waehrend der Bildwechsel es wieder ausblendete -
        // sichtbar als kurzes Aufblitzen des Projekttextes beim Uebergang.
        // Vorher stand hier "el !== project": das traf nur #projekte und liess
        // den Serum-Abschnitt (ebenfalls mit .avatar-stack) aussen vor.
        if (!el.querySelector(".avatar-stack")) fade.classList.toggle("is-visible", raw >= 1);
      }
    });
  });

  /* ---------- Abschnitt 5: im Graphen bis zum Ende scrollen ----------
     Die Section ist gepinnt (position: sticky). Solange der Graph noch nicht
     am unteren Ende ist, wird das Mausrad auf den Graphen umgelenkt. Am Ende
     greift eine kurze Pause, danach läuft die Seite weiter – so gibt es
     keinen harten Bruch in der Bewegung.

     Wichtig: Der Canvas hat overflow:auto und liegt unter dem Cursor. Ohne
     Eingriff frisst er das Rad-Event nativ, die Seite bleibt stehen und der
     Übergang zur Section geht verloren. Deshalb schalten wir das native
     Scrollen des Canvas ab und bewegen ihn ausschließlich selbst. */
  var tryonSection = document.getElementById("tryon");
  var tryonStage = tryonSection && tryonSection.querySelector(".morph-reveal__stage");
  var canvasEl = null;
  var END_PAUSE_MS = 420;   // kurze Pause am Graph-Ende
  var endReachedAt = 0;     // Zeitpunkt, an dem das Ende erreicht wurde
  var pausedAt = 0;         // Zeitpunkt, an dem die Pause begann

  function findCanvas() {
    if (canvasEl && canvasEl.isConnected) return canvasEl;
    canvasEl = document.querySelector("#comfy-slot .nv-canvas");
    if (canvasEl) {
      // Der Canvas wird nur von uns bewegt, nie nativ gescrollt.
      canvasEl.style.overflow = "hidden";
      canvasEl.style.cursor = "grab";
    }
    return canvasEl;
  }

  // Die Section ist "aktiv", sobald der Morph vollständig offen steht.
  // Ohne diese Bedingung übernimmt der Graph-Handler zu früh: die Ansicht
  // wäre dann nur teilweise aufgeklappt und der Rest des Weges würde
  // übersprungen.
  function tryonIsActive() {
    if (!tryonSection || !tryonStage) return false;
    // Laeuft die Drehung (oder steht sie halb offen), bleibt die Section
    // zustaendig: sonst gibt der Graph am Ende die Seite frei, die Seite
    // laeuft aus der Section heraus, und die Laufstrecke bekommt nie das Rad.
    if (flipP > 0) return true;
    var r = tryonStage.getBoundingClientRect();
    if (r.top > 2 || r.bottom < window.innerHeight * 0.6) return false;
    // Fortschritt wie im Morph (progressMode "section"): der Weg durch die
    // Section, nicht die (gepinnte) Stage-Position.
    var offset = clamp(-tryonSection.getBoundingClientRect().top, 0,
                       Math.max(1, tryonSection.offsetHeight - window.innerHeight));
    return offset >= window.innerHeight * MORPH_VH - 2;
  }

  function atGraphEnd(c) {
    return c.scrollTop + c.clientHeight >= c.scrollHeight - 2;
  }

  function atGraphStart(c) {
    return c.scrollTop <= 1;
  }

  /* ---------- Flip am Graph-Ende ------------------------------------------
     Nach dem Graph-Ende laeuft eine Laufstrecke (--flip-runway, Standard 0.6
     Viewport-Hoehen). Darin dreht die ganze Flaeche von 0 auf 180 Grad,
     eins zu eins an der Scrollposition: hochscrollen dreht zurueck.

     Warum die Drehung aus der Scrollposition kommt und nicht aus einem
     eigenen Delta-Sammler: so bleibt sie umkehrbar, deterministisch und
     testbar, und sie laeuft nicht auseinander, wenn ein Trackpad mit
     Nachlauf oder die Tastatur ins Spiel kommt.
     ---------------------------------------------------------------------- */
  var flip = document.getElementById("flip");
  var flipInner = document.getElementById("flipInner");
  var flipFront = flip && flip.querySelector(".flip__front");
  var flipBack = flip && flip.querySelector(".flip__back");
  var flipP = 0;            // 0 = Graph, 1 = Live-Anwendung
  var flipApplied = -1;

  /* ---------- Rueckseite: AI Photo Studio live ---------------------------------
     Die Rueckseite zeigt nicht mehr den Screenshot, sondern die echte
     Anwendung (iframe, URL steht als data-src im Markup). Zwei Dinge regelt
     dieser Block:

     1. Geladen wird erst, wenn die Rueckseite zum ersten Mal sichtbar wird.
        Sonst zoege jeder Seitenaufruf ~0.5 MB Fremd-HTML mit, die niemand
        sieht, bevor er bis zum Graphen-Ende gescrollt hat.
     2. Bedient wird erst nach einem Klick ("Hier ausprobieren"). Eine
        eingebettete Seite bekommt Mausrad und Tasten selbst; waere sie von
        Anfang an scharf, bliebe das Scrollen der Portfolio-Seite ueber dem
        Rahmen stehen. "Bedienung beenden" (oder Esc, solange der Fokus im
        Dokument liegt) gibt das Scrollen wieder frei.                 ---------- */
  var liveStudio = document.getElementById("liveStudio");
  var liveFrame = document.getElementById("liveFrame");
  var liveStart = document.getElementById("liveStart");
  var liveExit = document.getElementById("liveExit");
  var liveFull = document.getElementById("liveFull");
  var liveHint = document.getElementById("liveHint");
  var liveMode = false;     // Bedienmodus: Klick/Tasten gehen an die Einbettung

  function liveLoad() {
    if (!liveFrame || !liveStudio || liveFrame.getAttribute("src")) return;
    var src = liveStudio.getAttribute("data-src");
    if (!src) return;
    liveFrame.setAttribute("src", src);
  }

  function liveSetMode(on) {
    if (!liveStudio || liveMode === on) return;
    liveMode = on;
    liveStudio.classList.toggle("is-live", on);
    // tabindex -1: der Rahmen liegt nicht im Tab-Fokus, solange er nicht
    // bedient werden darf (sonst springt der Fokus in eine ausgeblendete
    // Flaeche). Im Bedienmodus ist er erreichbar.
    if (liveFrame) liveFrame.setAttribute("tabindex", on ? "0" : "-1");
    if (on) {
      // Fokus auf den Ausstieg statt in den Rahmen: so bleibt Esc im
      // Eltern-Dokument und schliesst den Bedienmodus.
      if (liveExit) liveExit.focus({ preventScroll: true });
    } else if (liveStart && !liveStart.disabled) {
      liveStart.focus({ preventScroll: true });
    }
  }

  if (liveFrame) {
    // Der Rahmen wird erst beim ersten Sichtbarwerden der Rueckseite geladen;
    // in der Zwischenzeit zeigt die Abdeckung "wird geladen ...".
    liveFrame.addEventListener("load", function () {
      if (!liveFrame.getAttribute("src")) return;
      if (liveStart) liveStart.disabled = false;
      if (liveHint) liveHint.textContent = document.documentElement.lang === "en" ? "Runs right here – choose a model, upload an item, generate." : "Läuft direkt hier – Model wählen, Item hochladen, generieren.";
    });
    liveFrame.addEventListener("error", function () {
      if (liveHint) liveHint.textContent = document.documentElement.lang === "en" ? "The live view could not be loaded here – please open it in a new tab." : "Die Live-Ansicht ließ sich hier nicht laden – bitte im neuen Tab öffnen.";
    });
  }

  if (liveStart) {
    liveStart.addEventListener("click", function () { liveSetMode(true); });
  }
  if (liveExit) {
    liveExit.addEventListener("click", function () { liveSetMode(false); });
  }
  if (liveFull) {
    // Der Rahmen ist nur ~2/3 bildschirmhoch; in Vollbild laesst sich die
    // Anwendung so bedienen, wie sie gedacht ist. Fehlt die Unterstuetzung
    // (z. B. iOS Safari), faellt der Knopf weg.
    if (!document.fullscreenEnabled) {
      liveFull.style.display = "none";
    } else {
      liveFull.addEventListener("click", function () {
        if (!liveFrame) return;
        try {
          var req = liveFrame.requestFullscreen();
          if (req && req.catch) req.catch(function () {});
        } catch (e) { /* Vollbild verweigert: dann eben nicht */ }
      });
    }
  }
  document.addEventListener("keydown", function (e) {
    if (!liveMode) return;
    if (e.key === "Escape" || e.key === "Esc") { e.preventDefault(); liveSetMode(false); }
  });

  // `inert` haelt die jeweils verdeckte Seite aus Fokus und Klickfolge. Aeltere
  // Engines kennen die Eigenschaft nicht; dann bleibt es beim reinen
  // Sichtbarkeitswechsel (visibility), der schon alles verdeckt.
  function setInert(el, on) {
    if (!el || !("inert" in el)) return;
    el.inert = on;
  }

  function runwayPx() {
    var v = flip && getComputedStyle(flip).getPropertyValue("--flip-runway");
    var n = parseFloat(v);
    if (!(n > 0)) n = 0.6;
    return Math.max(1, window.innerHeight * n);
  }

  /* ---------- Leerlauf am Graph-Ende -------------------------------------
     Vor der Laufstrecke liegt eine Strecke (--flip-hold), in der sich nichts
     bewegt: der Nutzer soll das Ergebnisbild in Ruhe ansehen koennen, bevor
     die Drehung beginnt. holdLeft ist der Rest dieser Strecke; holdArm() legt
     sie neu an, sobald der Graph das Ende verlaesst.

     Anders als bei runwayPx() ist 0 hier ein gueltiger Wert ("kein
     Leerlauf"), deshalb wird nur ein fehlender oder unbrauchbarer Wert
     ersetzt. */
  function holdPx() {
    var v = flip && getComputedStyle(flip).getPropertyValue("--flip-hold");
    var n = parseFloat(v);
    if (!isFinite(n) || n < 0) n = 0.4;
    return window.innerHeight * n;
  }

  var holdLeft = holdPx();   // Rest der Leerlauf-Strecke in px

  function holdArm() {
    holdLeft = holdPx();
  }

  // Setzt die Flaeche auf den Fortschritt p. Der Sichtbarkeitswechsel haengt
  // an p >= .5 (Kante an), nicht an einem Timer.
  function applyFlip(p) {
    flipP = clamp(p, 0, 1);
    if (flipApplied === flipP) return;
    flipApplied = flipP;
    var showBack = flipP >= .5;
    if (flipInner && !reduceMotion) {
      // Bei reduzierter Bewegung hat .flip__inner per CSS transform:none; dann
      // wird nur die sichtbare Seite gewaehlt (unten).
      flipInner.style.transform = "rotateY(" + (flipP * 180).toFixed(2) + "deg)";
    }
    if (flipFront) {
      flipFront.style.visibility = showBack ? "hidden" : "visible";
      flipFront.setAttribute("aria-hidden", showBack ? "true" : "false");
      setInert(flipFront, showBack);
    }
    if (flipBack) {
      flipBack.style.visibility = showBack ? "visible" : "hidden";
      flipBack.setAttribute("aria-hidden", showBack ? "false" : "true");
      setInert(flipBack, !showBack);
    }
    if (showBack) {
      liveLoad();          // Anwendung erst jetzt holen (siehe oben)
    } else {
      liveSetMode(false);  // verdeckt heisst: nicht bedienbar
    }
  }

  if (tryonSection) {
    findCanvas();

    window.addEventListener("wheel", function (e) {
      var c = findCanvas();
      if (!c) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // horizontal nicht anfassen
      if (!tryonIsActive()) return;
      // Bei reduzierter Bewegung gibt es keine Drehung; die Zielseite wird
      // weiter unten direkt gesetzt, ohne das Rad zu kapern.

      var down = e.deltaY > 0;
      var atEnd = atGraphEnd(c), atStart = atGraphStart(c);

      // --- Leerlauf: am Graph-Ende erst ansehen, dann drehen -------------
      // Liegt das Ergebnisbild vor uns, wird zuerst die Leerlauf-Strecke
      // verbraucht: das Rad bewegt weder Drehung noch Graph. Der Weg bleibt
      // umkehrbar wie die Drehung - hochscrollen fuellt die Strecke wieder
      // auf, bevor irgendetwas anderes passiert. Nur wenn die Strecke voll
      // ist, laeuft der Rest weiter (Drehung bzw. Graph).
      var rest = e.deltaY;
      if (!reduceMotion && atEnd && flipP === 0 && !atStart) {
        if (down) {
          var used = Math.min(holdLeft, rest);
          holdLeft -= used;
          rest -= used;
          e.preventDefault();
          // Strecke noch nicht leer: hier endet der Schritt.
          if (holdLeft > 0) return;
        } else if (holdLeft < holdPx()) {
          // Hochscrollen: zuerst den Leerlauf auffuellen. Nur der Rest, der
          // nicht mehr hineinpasst, darf den Graphen bewegen - sonst liefe
          // der Weg an der Nahtstelle doppelt (auffuellen UND scrollen).
          var fill = Math.min(holdPx() - holdLeft, -rest);
          holdLeft += fill;
          rest += fill;
          e.preventDefault();
          if (rest === 0) return;
          // Strecke ist jetzt voll: der echte Rest scrollt den Graphen, das
          // Ende ist damit verlassen (Leerlauf neu anlegen).
          holdArm();
          c.scrollTop += rest;
          return;
        }
      }

      // --- Laufstrecke: die Drehung hat Vorrang vor allem anderen ---------
      // Die Drehung beginnt erst, wenn der Graph wirklich am Ende steht.
      // Sonst schluckt das Rad, das den Graphen ans Ende faehrt, gleich noch
      // die halbe Drehung: der Uebergang springt statt zu scrubben.
      // Beim Zurueckdrehen auf 0 wird der Rest des Deltas an den Graphen
      // weitergegeben, damit die Bewegung an der Nahtstelle nicht stockt.
      if (!reduceMotion) {
        var inRunway = atEnd
          ? (down && flipP < 1) || (!down && flipP > 0)
          : (!down && flipP > 0);   // Rueckweg: erst drehen, dann Graph scrollen
        if (inRunway && (atEnd || flipP > 0)) {
          e.preventDefault();
          pausedAt = 0;
          endReachedAt = 0;
          var before = flipP;
          var step = rest / runwayPx();
          applyFlip(flipP + step);
          // Tatsaechlich verbrauchter Anteil des Deltas.
          rest = (flipP - before) * runwayPx();
          if (down || flipP > 0) return;
          // p ist wieder auf 0: erst den Leerlauf auffuellen, nur der echte
          // Rest laeuft in den Graphen (gleiche Umkehrbarkeit wie unten).
          if (holdLeft < holdPx()) {
            var refill = Math.min(holdPx() - holdLeft, -rest);
            holdLeft += refill;
            rest += refill;
            if (rest === 0) return;
          }
          if (!down && atStart) { pausedAt = 0; return; }
          c.scrollTop += rest;
          return;
        }
      } else {
        // Ohne Drehung: am Graph-Ende direkt auf die Zielseite springen.
        applyFlip(atEnd ? 1 : flipP);
      }

      // --- Graph-Ende: kurze Pause, dann Seite weiter -------------------
      if (down && atEnd) {
        var now = Date.now();
        if (!pausedAt) { pausedAt = now; e.preventDefault(); return; }
        if (now - pausedAt < END_PAUSE_MS) { e.preventDefault(); return; }
        // Pause vorbei: Seite selbst weiterbewegen (das Event ist verbraucht).
        e.preventDefault();
        window.scrollBy(0, e.deltaY);
        return;
      }
      if (down && !atEnd) pausedAt = 0;

      // --- Graph-Anfang: nach oben zurück an die Seite -------------------
      if (!down && atStart) { pausedAt = 0; return; }

      // --- Sonst: Rad auf den Graphen umlenken, Seite steht still --------
      e.preventDefault();
      pausedAt = 0;
      // Der Graph verlaesst hier das Ende (hoch) bzw. steht noch nicht dort
      // (runter): die Leerlauf-Strecke neu anlegen, damit sie beim naechsten
      // Anfahren wieder vollstaendig da ist.
      holdArm();
      c.scrollTop += e.deltaY;
    }, { passive: false });

    window.addEventListener("scroll", function () {
      if (!tryonIsActive()) {
        pausedAt = 0;
        endReachedAt = 0;
        // Section verlassen: Flaeche wieder auf den Graphen stellen, damit
        // sie beim naechsten Durchlauf sauber von vorn beginnt. Die
        // Leerlauf-Strecke wird dabei ebenfalls neu angelegt.
        if (flipP !== 0) applyFlip(0);
        holdArm();
      }
    }, { passive: true });

    // Startzustand setzen (Vorderseite sichtbar, Rueckseite verborgen).
    applyFlip(0);
  }

  /* ---------- Abschnitt 5: kein Ergebnisbild mehr ---------- */
  var saveImg = document.querySelector("#tryon .try__save");
  function layoutSave() {
    if (!saveImg || !comfy) return;
    saveImg.style.marginBottom = "";
    if (window.innerWidth < 900) return;
    var wrap = saveImg.parentNode;
    var comfyBottom = comfy.offsetTop + comfy.offsetHeight;
    var wrapBottom = wrap.offsetTop + wrap.offsetHeight;
    saveImg.style.marginBottom = Math.max(0, wrapBottom - comfyBottom).toFixed(1) + "px";
  }
  layoutSave();
  window.addEventListener("resize", layoutSave);
  window.addEventListener("load", layoutSave);
})();
