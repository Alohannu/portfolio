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

  /* ---------- Morph-Reveal (wiederverwendbar, Initialisierung über [data-morph]) ---------- */
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

  /* ---------- Abschnitt 3: Avatar-Wechsel (beide Spalten synchron) + Reveal/Fade-in ---------- */
  var project = document.getElementById("projekte");
  var stacks = Array.prototype.slice.call(document.querySelectorAll(".avatar-stack")).map(function (el) {
    return Array.prototype.slice.call(el.querySelectorAll(".avatar"));
  });
  var steps = stacks[0].length;
  var activeAvatar = 0;
  var avatarTicking = false;
  var revealTitle = project.querySelector(".reveal");
  var fadeText = project.querySelector(".fade-in");

  // Scrollstrecke des Wrappers: 100vh Morph, dann Bildwechsel (Rest abzüglich Stage-Höhe)
  function updateAvatar() {
    avatarTicking = false;
    var vh = window.innerHeight;
    if (!vh) return; // Viewport (noch) ohne Höhe, z. B. während Resize
    var offset = -project.getBoundingClientRect().top;
    var p = clamp((offset - vh) / (2 * vh), 0, 1); // 100vh Morph, dann 200vh Bildwechsel
    var idx = Math.min(steps - 1, Math.floor(p * steps));
    if (idx !== activeAvatar) {
      stacks.forEach(function (imgs) {
        imgs[activeAvatar].classList.remove("is-active");
        imgs[idx].classList.add("is-active");
      });
      activeAvatar = idx;
    }
    // Text blendet beim zweiten Scroll-Moment ein (reversibel)
    fadeText.classList.toggle("is-visible", idx >= 1);
  }
  function requestAvatarUpdate() {
    if (!avatarTicking) {
      avatarTicking = true;
      requestAnimationFrame(updateAvatar);
    }
  }
  window.addEventListener("scroll", requestAvatarUpdate, { passive: true });
  window.addEventListener("resize", requestAvatarUpdate);
  updateAvatar();

  /* ---------- Gesichtsbild: nicht mehr nötig ----------
     Die frühere Animation schob das Gesicht in einen leeren Bildslot im
     statischen comfyui.png. Abschnitt 5 zeigt jetzt den Vollbild-Graphen
     ohne Bildslots; die Animation entfällt. Die Aufräumlogik in
     faceFlight() bleibt als No-Op erhalten, damit der Morph-Aufruf nicht
     bricht, falls die Elemente fehlen. */
  var faceOrig = document.querySelector("#konsistenz .face");
  var faceFly = document.getElementById("faceFly");
  var comfy = document.getElementById("comfy");
  var faceFinal = comfy && comfy.querySelector(".comfy__face");
  var stage4 = document.querySelector("#konsistenz .morph-reveal__stage");
  var stage5 = document.querySelector("#tryon .morph-reveal__stage");

  function faceFlight(raw) {
    // Ohne comfy__face gibt es nichts zu animieren (Vollbild-Graph).
    if (!comfy || !faceFinal || !faceOrig || !faceFly) return;
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
        if (el !== project) fade.classList.toggle("is-visible", raw >= 1); // Abschnitt 3 steuert den Text über den Bildwechsel
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

  if (tryonSection) {
    findCanvas();

    window.addEventListener("wheel", function (e) {
      var c = findCanvas();
      if (!c) return;
      if (reduceMotion) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // horizontal nicht anfassen
      if (!tryonIsActive()) return;

      var down = e.deltaY > 0;
      var atEnd = atGraphEnd(c), atStart = atGraphStart(c);

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
      c.scrollTop += e.deltaY;
    }, { passive: false });

    window.addEventListener("scroll", function () {
      if (!tryonIsActive()) { pausedAt = 0; endReachedAt = 0; }
    }, { passive: true });
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
