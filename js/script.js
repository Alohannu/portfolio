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

  function initMorphReveal(el, options) {
    var stage = el.querySelector(".morph-reveal__stage");
    if (!stage) return null;

    var isMobile = window.matchMedia("(max-width: 767px)").matches;
    var opts = {
      startScale: isMobile ? 0.4 : 0.2, // Breite der Startform relativ zum Stage
      points: 8,                        // Stützpunkte (Vielfaches von 4)
      easing: easeOutCubic,
      morphVh: 1,                       // Scrollstrecke des Morphs in Viewport-Höhen
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

    function update(force) {
      ticking = false;
      var offset = -el.getBoundingClientRect().top;
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

  /* ---------- Gesichtsbild fliegt beim Morph 4 → 5 in den Bildslot von comfyui.png ---------- */
  var faceOrig = document.querySelector("#konsistenz .face");
  var faceFly = document.getElementById("faceFly");
  var comfy = document.getElementById("comfy");
  var faceFinal = comfy && comfy.querySelector(".comfy__face");
  var stage4 = document.querySelector("#konsistenz .morph-reveal__stage");
  var stage5 = document.querySelector("#tryon .morph-reveal__stage");
  // leerer Bildslot im PNG (720 × 570) als Anteil der angezeigten Bildfläche
  var SLOT = { x: 0.0208, y: 0.256, w: 0.289, h: 0.456 };

  function slotRect() {
    // Anzeigefläche des Bildes (object-fit: contain, oben links ausgerichtet) relativ zum Wrapper
    var w = comfy.clientWidth, h = comfy.clientHeight, ratio = 720 / 570;
    var dw = Math.min(w, h * ratio), dh = dw / ratio;
    return { x: dw * SLOT.x, y: dh * SLOT.y, w: dw * SLOT.w, h: dh * SLOT.h };
  }

  function faceFlight(raw) {
    var sl = slotRect();
    faceFinal.style.left = sl.x + "px"; faceFinal.style.top = sl.y + "px";
    faceFinal.style.width = sl.w + "px"; faceFinal.style.height = sl.h + "px";
    if (reduceMotion) return; // CSS zeigt das Gesicht direkt im Slot
    var flying = raw > 0 && raw < 1;
    faceOrig.classList.toggle("is-away", raw > 0);
    faceFinal.style.visibility = raw >= 1 ? "visible" : "hidden";
    faceFly.style.visibility = flying ? "visible" : "hidden";
    if (!flying) return;
    // Start/Ziel relativ zur jeweiligen Stage (beide sind während des Morphs gepinnt, Ursprung = Viewport)
    var o = faceOrig.getBoundingClientRect(), s4 = stage4.getBoundingClientRect();
    var c = comfy.getBoundingClientRect(), s5 = stage5.getBoundingClientRect();
    var sx = o.left - s4.left, sy = o.top - s4.top;
    var tx = c.left - s5.left + sl.x, ty = c.top - s5.top + sl.y;
    var t = easeOutCubic(raw), k = 1 + (sl.w / o.width - 1) * t;
    faceFly.style.width = o.width + "px";
    faceFly.style.height = o.height + "px";
    faceFly.style.transform = "translate(" + (sx + (tx - sx) * t).toFixed(1) + "px," +
      (sy + (ty - sy) * t).toFixed(1) + "px) scale(" + k.toFixed(4) + ")";
  }

  // Morph-Reveal für alle [data-morph]-Wrapper; Headline-Reveal, sobald die Maske (fast) offen ist
  Array.prototype.slice.call(document.querySelectorAll("[data-morph]")).forEach(function (el) {
    var title = el.querySelector(".reveal"), fade = el.querySelector(".fade-in");
    initMorphReveal(el, {
      onProgress: function (raw) {
        if (title) title.classList.toggle("is-visible", raw >= 0.9);
        if (el.id === "tryon") faceFlight(raw);
        if (el !== project && fade) fade.classList.toggle("is-visible", raw >= 1); // Abschnitt 3 steuert den Text über den Bildwechsel
      }
    });
  });

  /* ---------- Abschnitt 5: Ergebnisbild (comfyui_save.png) ---------- */
  // Unterkante auf die Unterkante von comfyui.png legen (nur Desktop-Layout)
  var saveImg = document.querySelector("#tryon .try__save");
  function layoutSave() {
    if (!saveImg) return;
    saveImg.style.marginBottom = "";
    if (window.innerWidth < 900) return;
    var ratio = 720 / 570, w = comfy.clientWidth, h = comfy.clientHeight;
    var dh = Math.min(w, h * ratio) / ratio;
    var wrap = saveImg.parentNode;
    var comfyBottom = comfy.offsetTop + dh;
    var wrapBottom = wrap.offsetTop + wrap.offsetHeight;
    saveImg.style.marginBottom = Math.max(0, wrapBottom - comfyBottom).toFixed(1) + "px";
  }
  layoutSave();
  window.addEventListener("resize", layoutSave);
  window.addEventListener("load", layoutSave);

  /* ---------- Abschnitt 7: Vorhang (Scrollfortschritt 1:1, ohne Easing, umkehrbar) ---------- */
  var curtain = document.getElementById("curtain");
  var curtainOverlay = document.getElementById("curtainOverlay");
  var curtainImgs = [2, 3].map(function (n) { return curtain.querySelector(".curtain__img--" + n); });
  var curtainFade = 0.5; // Overlay und Schrift sind nach 50 % der ersten Bildschirmhöhe ausgeblendet
  var curtainTicking = false, curtainActive = true, curtainLast = -1;

  function updateCurtain() {
    curtainTicking = false;
    var vh = window.innerHeight;
    if (!vh) return;
    var offset = clamp(-curtain.getBoundingClientRect().top / vh, 0, 2); // 0–1: Bild 2, 1–2: Bild 3
    if (offset === curtainLast) return; // nur bei Änderung
    curtainLast = offset;
    curtainImgs.forEach(function (img, i) {
      var t = clamp(offset - i, 0, 1);
      img.style.clipPath = "inset(" + ((1 - t) * 100).toFixed(3) + "% 0 0 0)";
    });
    curtainOverlay.style.opacity = (1 - clamp(offset / curtainFade, 0, 1)).toFixed(3);
  }
  function requestCurtain() {
    if (!curtainActive || curtainTicking) return;
    curtainTicking = true;
    requestAnimationFrame(updateCurtain);
  }
  window.addEventListener("scroll", requestCurtain, { passive: true });
  window.addEventListener("resize", function () { curtainLast = -1; requestCurtain(); });
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      curtainActive = entries[entries.length - 1].isIntersecting;
      if (curtainActive) requestCurtain();
    }, { threshold: 0, rootMargin: "100px 0px 100px 0px" }).observe(curtain);
  }
  updateCurtain();

  /* ---------- Abschnitt 8: Skincare-Video – läuft nur beim Scrollen (vorwärts), Ton läuft mit ---------- */
  var skin = document.getElementById("skin");
  var skinVideo = document.getElementById("skin-video");
  var skinOverlay = skin.querySelector(".stage__overlay");
  var SKIN_FADE = 0.5; // Overlay und Schrift sind nach 50 % der ersten Bildschirmhöhe Scrollen ausgeblendet
  function skinFade() {
    var vh = window.innerHeight;
    if (!vh || reduceMotion) return;
    skinOverlay.style.opacity = (1 - clamp(-skin.getBoundingClientRect().top / (vh * SKIN_FADE), 0, 1)).toFixed(3);
  }
  var skinActive = false, skinTicking = false, skinLastY = window.pageYOffset, skinDir = 1, skinTimer = 0;
  var SKIN_IDLE_MS = 160; // so lange nach dem letzten Scroll-Event läuft das Video weiter

  function skinProgress() {
    var dist = skin.offsetHeight - window.innerHeight;
    return dist > 0 ? clamp(-skin.getBoundingClientRect().top / dist, 0, 1) : 0;
  }
  function skinPause() { if (!skinVideo.paused) skinVideo.pause(); }
  function skinPlay() {
    if (!skinVideo.paused) return;
    skinVideo.muted = false; // Ton läuft mit; Browser ohne Nutzer-Geste lehnen das ab → Fallback stumm
    var pr = skinVideo.play();
    if (pr && pr.catch) pr.catch(function () {
      skinVideo.muted = true;
      var p2 = skinVideo.play();
      if (p2 && p2.catch) p2.catch(function () {});
    });
  }
  function skinUpdate() {
    skinTicking = false;
    var dur = skinVideo.duration;
    if (!skinActive || !isFinite(dur) || reduceMotion) return;
    var p = skinProgress(), target = p * dur;
    var scrolling = p > 0 && p < 1 && skinDir > 0;
    if (!scrolling) { // rückwärts, am Anfang oder Ende: kein Abspielen, Bild folgt dem Scroll
      skinPause();
      if (Math.abs(skinVideo.currentTime - target) > 0.04) skinVideo.currentTime = target;
      return;
    }
    if (Math.abs(skinVideo.currentTime - target) > 0.8) skinVideo.currentTime = target; // Drift korrigieren
    skinPlay();
    clearTimeout(skinTimer);
    skinTimer = setTimeout(skinPause, SKIN_IDLE_MS); // Scrollstopp → Video und Ton halten an
  }
  function skinOnScroll() {
    var y = window.pageYOffset;
    if (y !== skinLastY) { skinDir = y > skinLastY ? 1 : -1; skinLastY = y; }
    if (skinActive) skinFade();
    if (!skinActive || skinTicking) return;
    skinTicking = true;
    requestAnimationFrame(skinUpdate);
  }
  window.addEventListener("scroll", skinOnScroll, { passive: true });
  window.addEventListener("resize", skinOnScroll);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      skinActive = entries[entries.length - 1].isIntersecting;
      if (skinActive) skinOnScroll(); else { clearTimeout(skinTimer); skinPause(); }
    }, { threshold: 0, rootMargin: "0px" }).observe(skin);
  }
  document.addEventListener("visibilitychange", function () { if (document.hidden) skinPause(); });
  // Ton nach der ersten Nutzer-Geste freischalten, falls der Browser zunächst stumm abspielen musste
  ["pointerdown", "keydown", "touchend"].forEach(function (evt) {
    window.addEventListener(evt, function unlock() {
      window.removeEventListener(evt, unlock);
      if (!skinVideo.paused) skinVideo.muted = false;
    }, { passive: true });
  });

  /* ---------- Abschnitt 9: Serum-Video – Autoplay stumm, Ton per Button ---------- */
  var serumVideo = document.getElementById("serum-video");
  var serumBtn = document.getElementById("serumSound");
  var serumLabel = serumBtn.querySelector(".serum__soundlabel");
  function setSerumSound(on) {
    serumVideo.muted = !on;
    serumBtn.setAttribute("aria-pressed", on ? "true" : "false");
    serumBtn.setAttribute("aria-label", on ? "Ton ausschalten" : "Ton einschalten");
    serumLabel.textContent = on ? "SOUND OFF" : "SOUND ON";
    if (on && serumVideo.paused) { var pr = serumVideo.play(); if (pr && pr.catch) pr.catch(function () {}); }
  }
  // Collage ist größer als der Bildschirm: nach dem Morph wandert sie mit dem Scrollen nach oben (reversibel)
  var serumSec = document.getElementById("serum"), serumBoard = serumSec.querySelector(".serum__board");
  var serumVisible = false, serumTicking = false;
  function serumUpdate() {
    serumTicking = false;
    var vh = window.innerHeight, rect = serumSec.getBoundingClientRect();
    if (!vh) return;
    var over = Math.max(0, serumBoard.offsetHeight + 3 * 16 - vh); // Überstand (Stage-Padding 1.5rem oben/unten)
    var p = reduceMotion ? 0 : clamp((-rect.top - vh) / (serumSec.offsetHeight - 2 * vh), 0, 1);
    serumBoard.style.transform = over ? "translateY(" + (-p * over).toFixed(1) + "px)" : "";
    serumVisible = rect.bottom > 0 && rect.top < vh;
    if (serumVisible && serumVideo.paused) { var pr = serumVideo.play(); if (pr && pr.catch) pr.catch(function () {}); }
    else if (!serumVisible && !serumVideo.paused) { serumVideo.pause(); if (!serumVideo.muted) setSerumSound(false); }
  }
  function serumRequest() { if (!serumTicking) { serumTicking = true; requestAnimationFrame(serumUpdate); } }
  window.addEventListener("scroll", serumRequest, { passive: true });
  window.addEventListener("resize", serumRequest);
  serumVideo.addEventListener("pause", function () { // Video darf im sichtbaren Abschnitt nie hängen bleiben
    if (serumVisible && !serumVideo.ended) { var pr = serumVideo.play(); if (pr && pr.catch) pr.catch(function () {}); }
  });
  serumUpdate();
  serumBtn.addEventListener("click", function () { setSerumSound(serumVideo.muted); });
})();
