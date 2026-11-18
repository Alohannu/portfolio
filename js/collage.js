/* ==========================================================================
   Video-Collage: Scroll-Scrubbing

   Technik wie beim Hero-Video oben:
     - Ein hoher Wrapper erzeugt die Scrollstrecke.
     - Die Buehne darin ist position:sticky und steht still.
     - Der Scrollfortschritt (0..1) steuert direkt video.currentTime.

   Unterschied zum Hero: Jeder Slot spielt eine KETTE von Clips. Der
   Fortschritt wird deshalb auf die Gesamtlaenge der Kette abgebildet:
   Klick 1 -> Clip 1, Clip 2 ... Am Uebergang liegt die Schwarzbende,
   ebenfalls an den Fortschritt gekoppelt (also auch rueckwaerts).

   Alles ist vollstaendig reversibel: zurueckscrollen spult rueckwaerts,
   anhalten haelt das Bild an der Stelle.
   ========================================================================== */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Schwarzbende am Clip-Uebergang: Dauer in Sekunden Clipmaterial, je
     halbe Dauer vor und nach dem Wechsel. Bei der aktuellen Scrollstrecke
     entspricht 1s Clip etwa 96px Scroll, 1.2s Blende also ~231px – lang
     genug, dass man den Uebergang beim Scrollen wirklich sieht. */
  var BLEND = 1.2;
  var SCRUB_VH_PER_SEC = 14; // Scrollstrecke in vh pro Sekunde Clipmaterial

  var state = null;
  var ticking = false;

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function makeEl(tag, cls) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    return el;
  }

  /* Baut einen Slot mit seiner Clip-Kette und der Zeitachse. */
  function createSlot(slotData) {
    var el = makeEl("div", "collage__slot collage__slot--" + (slotData.pos || "left"));
    el.dataset.shape = slotData.shape || "portrait";

    var video = makeEl("video");
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.preload = "auto";
    video.setAttribute("aria-label", slotData.label || "");

    var fade = makeEl("div", "collage__fade");

    el.appendChild(video);
    el.appendChild(fade);

    var clips = (slotData.clips || []).map(function (c) {
      return { src: c.src, title: c.title || "", alt: c.alt || "", dur: c.duration || 0 };
    });

    var s = {
      el: el, video: video, fade: fade,
      clips: clips,
      active: -1,          // aktuell geladener Clip
      seeking: false,
      pendingTime: null
    };

    /* --- Zeitachse: aus der Kette eine Gesamtdauer bauen --- */
    s.buildTimeline = function () {
      var durs = clips.map(function (c) { return c.dur; });
      // Fallback, falls eine Dauer im JSON fehlt: erst nach Metadaten bekannt
      if (durs.some(function (d) { return !d; })) {
        durs = clips.map(function (c) { return c.dur || video.duration || 1; });
      }
      var total = durs.reduce(function (a, b) { return a + b; }, 0) || 1;
      var acc = 0;
      s.spans = durs.map(function (d, i) {
        var span = { i: i, start: acc, end: acc + d, dur: d };
        acc += d;
        return span;
      });
      s.total = total;
      return total;
    };

    /* Fortschritt 0..1 -> {clipIndex, time, fadeOpacity} */
    s.resolve = function (p) {
      if (!s.spans) s.buildTimeline();
      var t = clamp(p, 0, 1) * s.total;
      // Clip finden (letzter Treffer gewinnt)
      var span = s.spans[s.spans.length - 1];
      for (var k = 0; k < s.spans.length; k++) {
        if (t < s.spans[k].end || k === s.spans.length - 1) { span = s.spans[k]; break; }
      }
      var local = clamp(t - span.start, 0, span.dur);

      /* Schwarzbende an den Uebergaengen (nicht am Anfang/Ende der Kette,
         dort waere ein Dauerzustand). */
      var op = 0;
      if (span.i > 0 && local < BLEND) {
        op = 1 - local / BLEND;                 // aus der Blende heraus
      } else if (span.i < s.spans.length - 1 && local > span.dur - BLEND) {
        op = 1 - (span.dur - local) / BLEND;    // in die Blende hinein
      }
      return { idx: span.i, time: local, fade: clamp(op, 0, 1) };
    };

    /* Clip wechseln, ohne die Position zu verlieren. */
    s.useClip = function (i, whenReady) {
      if (i === s.active) { if (whenReady) whenReady(); return; }
      var c = clips[i];
      if (!c) return;
      s.active = i;
      lastSeek = -1;          // Zeitachse hat gewechselt: Seek-Sperre aufheben
      s.pendingTime = null;
      video.setAttribute("aria-label", c.alt || "");
      el.title = c.title || c.alt || "";
      video.src = c.src;
      video.load();
      var done = function () {
        video.removeEventListener("loadeddata", done);
        video.removeEventListener("canplay", done);
        if (whenReady) whenReady();
      };
      video.addEventListener("loadeddata", done);
      video.addEventListener("canplay", done);
      // Fallback, falls das Ereignis ausbleibt (z. B. aus dem Cache)
      setTimeout(done, 900);
    };

    /* Auf einen Fortschrittswert anwenden (der Kern des Scrubings). */
    s.apply = function (p) {
      var r = s.resolve(p);
      fade.style.opacity = String(r.fade);
      if (r.idx !== s.active) {
        var target = r.time;
        s.useClip(r.idx, function () { seekTo(target); });
      } else {
        seekTo(r.time);
      }
    };

    /* iOS/Chrome liefern erst dann Frames beim Seeking, wenn das Video
       einmal angespielt wurde. Deshalb jedes Video kurz primen:
       play() -> sofort pause() -> danach greift currentTime zuverlaessig.
       (Dieselbe Technik nutzt der Hero oben.) */
    s.prime = function () {
      if (s.primed) return;
      s.primed = true;
      var pr = video.play();
      if (pr && pr.then) {
        pr.then(function () {
          video.pause();
          lastSeek = -1;
          if (s.lastProgress != null) s.apply(s.lastProgress);
        }).catch(function () {
          // Autoplay blockiert: Seeking funktioniert dann erst nach
          // der ersten Nutzerinteraktion (siehe touchstart/click unten).
          s.primed = false;
        });
      }
    };

    var lastSeek = -1;
    function seekTo(t) {
      var d = video.duration;
      if (!d || !isFinite(d)) { s.pendingTime = t; return; }
      var tt = clamp(t, 0, Math.max(0, d - 0.05));
      // Nur bei echter Aenderung seeken (verhindert Seek-Spam)
      if (Math.abs(tt - lastSeek) < 0.012) return;
      lastSeek = tt;
      try { video.currentTime = tt; } catch (e) {}
    }

    /* Erstes Bild liefern, sobald Daten da sind, damit vor dem
       Anspielen kein schwarzer Kasten steht. */
    video.addEventListener("loadeddata", function () {
      if (s.lastProgress != null && !s.primed) seekTo(s.resolve(s.lastProgress).time);
    });

    // Sobald Metadaten da sind: gemerkte Position nachziehen und Zeitachse
    // mit den echten Dauern neu aufbauen.
    video.addEventListener("loadedmetadata", function () {
      if (video.duration && isFinite(video.duration)) {
        clips[s.active] && (clips[s.active].dur = video.duration);
        s.buildTimeline();
      }
      lastSeek = -1;
      if (s.pendingTime != null) { var t = s.pendingTime; s.pendingTime = null; seekTo(t); }
      if (s.lastProgress != null) s.apply(s.lastProgress);
    });

    return s;
  }

  function mount(root, opts) {
    if (!root) return null;
    destroy();
    opts = opts || {};
    var slots = opts.slots || [];
    if (!slots.length) return null;

    /* --- Struktur: Wrapper (Scrollstrecke) + sticky Buehne --- */
    var wrap = makeEl("div", "collage__scrub");
    var stage = makeEl("div", "collage__stage");
    var grid = makeEl("div", "collage__grid");

    var entries = [];
    var fragment = document.createDocumentFragment();
    slots.forEach(function (slotData) {
      var s = createSlot(slotData);
      s.buildTimeline();
      entries.push(s);
      fragment.appendChild(s.el);
    });
    grid.appendChild(fragment);
    stage.appendChild(grid);
    wrap.appendChild(stage);
    root.appendChild(wrap);

    /* Scrollstrecke aus der laengsten Clip-Kette ableiten, damit jeder Slot
       ungefaehr im selben Verhaeltnis durchlaeuft. */
    var maxTotal = Math.max.apply(null, entries.map(function (s) { return s.total; }));
    var vhLen = Math.max(300, Math.round(maxTotal * SCRUB_VH_PER_SEC / 10) * 10);
    wrap.style.height = vhLen + "vh";

    var headEls = root.parentNode
      ? Array.prototype.slice.call(root.parentNode.querySelectorAll("[data-collage-reveal]"))
      : [];

    function progress() {
      var top = wrap.getBoundingClientRect().top;
      var dist = wrap.offsetHeight - window.innerHeight;
      if (dist <= 0) return top <= 0 ? 1 : 0;
      return clamp(-top / dist, 0, 1);
    }

    function update() {
      ticking = false;
      var p = progress();
      if (reduceMotion) {
        // Kein Scrubbing: jeden Slot am Anfang seines ersten Clips zeigen.
        entries.forEach(function (s) { if (s.lastProgress !== 0) { s.lastProgress = 0; s.apply(0); } });
        return;
      }
      entries.forEach(function (s) {
        s.lastProgress = p;
        s.apply(p);
      });
    }

    function requestUpdate() {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }

    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);

    /* Priming: erst nach einer echten Nutzerinteraktion erlauben Browser
       das play(). Wir versuchen es sofort; klappt das nicht, wird beim
       ersten Klick/Tastendruck/Touch erneut geprimt. */
    entries.forEach(function (s) {
      s.video.addEventListener("loadedmetadata", function () { s.prime(); });
    });

    var primeAll = function () {
      entries.forEach(function (s) { s.prime(); });
      requestUpdate();
    };
    window.addEventListener("pointerdown", primeAll, { passive: true, once: true });
    window.addEventListener("keydown", primeAll, { once: true });
    window.addEventListener("touchstart", primeAll, { passive: true, once: true });
    window.addEventListener("wheel", primeAll, { passive: true, once: true });

    /* Einblenden der Slots, sobald die Sektion sichtbar wird. */
    if ("IntersectionObserver" in window && !reduceMotion) {
      var io = new IntersectionObserver(function (ents) {
        ents.forEach(function (e) {
          if (!e.isIntersecting) return;
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        });
      }, { rootMargin: "0px 0px -5% 0px", threshold: 0.05 });
      entries.forEach(function (s) { io.observe(s.el); });
      headEls.forEach(function (h) { io.observe(h); });
      state = state || {};
      state.io = io;
    } else {
      entries.forEach(function (s) { s.el.classList.add("is-in"); });
      headEls.forEach(function (h) { h.classList.add("is-in"); });
    }

    state = {
      root: root, wrap: wrap, stage: stage, grid: grid,
      entries: entries, requestUpdate: requestUpdate,
      io: (state && state.io) || null
    };

    update();
    return state;
  }

  function destroy() {
    if (!state) return;
    window.removeEventListener("scroll", state.requestUpdate);
    if (state.io) state.io.disconnect();
    state.entries.forEach(function (s) {
      try { s.video.pause(); } catch (e) {}
      s.video.removeAttribute("src");
    });
    if (state.wrap.parentNode) state.wrap.parentNode.removeChild(state.wrap);
    state = null;
  }

  function boot() {
    var root = document.querySelector("[data-collage]");
    if (!root) return;
    var dataEl = document.getElementById("collage-data");
    if (!dataEl) return;
    var data;
    try { data = JSON.parse(dataEl.textContent); }
    catch (e) { console.error("[collage] Daten konnten nicht gelesen werden", e); return; }
    mount(root, data);
  }

  window.Collage = { mount: mount, destroy: destroy, boot: boot };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
