/* ==========================================================================
   Video-Collage: Sequenz-Engine

   Jeder Slot spielt seine Videos nacheinander durch:
     Video zu Ende -> Schwarzbende einblenden -> Video wechseln ->
     Schwarzbende ausblenden -> naechstes Video startet.

   Alles haengt am Scrollen:
   - Kein Slot im Sichtbereich  -> gesamte Sequenz pausiert (kein Timer laeuft).
   - Slot kommt in den Sichtbereich -> Sequenz laeuft weiter (bzw. startet).
   - Slot verlaesst den Sichtbereich -> pausiert an der aktuellen Stelle.

   Oeffentliche API: window.Collage.mount(root, { slots, fadeMs })
   ========================================================================== */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var DEFAULT_FADE = 450;   // Dauer der Schwarzbende in ms
  var state = null;         // aktuell gemounteter Zustand

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  function makeEl(tag, cls) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    return el;
  }

  /* Ein Slot verwaltet seine eigene Videokette. */
  function createSlot(slotData, index, fadeMs) {
    var el = makeEl("div", "collage__slot collage__slot--" + (slotData.pos || "left"));

    // Form fuer das responsive Verhalten mitgeben
    el.dataset.shape = slotData.shape || "portrait";

    var video = makeEl("video");
    video.muted = true;             // Pflicht fuer Autoplay
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.preload = "metadata";
    video.setAttribute("aria-label", slotData.label || "");

    var fade = makeEl("div", "collage__fade");
    fade.style.setProperty("--fade", fadeMs + "ms");

    el.appendChild(video);
    el.appendChild(fade);

    var s = {
      el: el,
      video: video,
      fade: fade,
      clips: slotData.clips || [],
      idx: 0,
      visible: false,
      switching: false,
      timer: null,
      started: false
    };

    /* Naechstes Video laden und – je nach Sichtbarkeit – starten. */
    function loadClip(i, autoplay) {
      if (!s.clips.length) return;
      s.idx = ((i % s.clips.length) + s.clips.length) % s.clips.length;
      var clip = s.clips[s.idx];
      video.src = clip.src;
      if (clip.poster) video.poster = clip.poster;
      video.setAttribute("aria-label", clip.alt || "");
      el.title = clip.title || clip.alt || "";
      video.load();
      if (autoplay) tryPlay();
    }

    function tryPlay() {
      if (!s.visible || s.switching || reduceMotion) return;
      var pr = video.play();
      if (pr && pr.catch) pr.catch(function () { /* Autoplay blockiert */ });
    }

    /* Video ist zu Ende: Schwarzbende -> wechseln -> aufblenden. */
    function advance() {
      if (s.switching) return;
      if (!s.visible) return;           // pausiert: Wechsel erst bei Sichtbarkeit
      s.switching = true;
      s.fade.classList.add("is-on");

      var wait = reduceMotion ? 0 : fadeMs;
      s.timer = setTimeout(function () {
        if (!s.visible) {               // waehrend der Blende aus dem Bild gescrollt
          s.switching = false;
          loadClip(s.idx + 1, false);   // naechstes vormerken, aber nicht starten
          return;
        }
        loadClip(s.idx + 1, false);
        // Kurz warten, bis das neue Video Daten hat, dann aufblenden und starten.
        var onReady = function () {
          video.removeEventListener("loadeddata", onReady);
          video.removeEventListener("canplay", onReady);
          s.fade.classList.remove("is-on");
          s.switching = false;
          tryPlay();
        };
        video.addEventListener("loadeddata", onReady);
        video.addEventListener("canplay", onReady);
        // Fallback, falls das Ereignis ausbleibt
        s.timer = setTimeout(function () {
          video.removeEventListener("loadeddata", onReady);
          video.removeEventListener("canplay", onReady);
          s.fade.classList.remove("is-on");
          s.switching = false;
          tryPlay();
        }, 1200);
      }, wait);
    }

    video.addEventListener("ended", advance);

    /* Sichtbarkeit umschalten: pausieren bzw. fortsetzen. */
    function setVisible(v) {
      s.visible = v;
      if (v) {
        if (!s.started) { s.started = true; loadClip(0, true); }
        else if (!s.switching) tryPlay();
      } else {
        if (!video.paused) video.pause();
      }
    }

    return { el: el, setVisible: setVisible, state: s, loadClip: loadClip };
  }

  function mount(root, opts) {
    if (!root) return null;
    destroy();
    opts = opts || {};
    var fadeMs = opts.fadeMs || DEFAULT_FADE;
    var slots = opts.slots || [];
    if (!slots.length) return null;

    var grid = makeEl("div", "collage__grid");
    var entries = [];
    var fragment = document.createDocumentFragment();

    slots.forEach(function (slotData, i) {
      var entry = createSlot(slotData, i, fadeMs);
      entries.push(entry);
      fragment.appendChild(entry.el);
    });

    grid.appendChild(fragment);
    root.appendChild(grid);

    var headEls = root.parentNode
      ? Array.prototype.slice.call(root.parentNode.querySelectorAll("[data-collage-reveal]"))
      : [];

    /* --- Einblenden der Slots --- */
    var revealObserver = null;
    if ("IntersectionObserver" in window && !reduceMotion) {
      revealObserver = new IntersectionObserver(function (ents) {
        ents.forEach(function (e) {
          if (!e.isIntersecting) return;
          e.target.classList.add("is-in");
          revealObserver.unobserve(e.target);
        });
      }, { rootMargin: "0px 0px -6% 0px", threshold: 0.1 });
      entries.forEach(function (en) { revealObserver.observe(en.el); });
      headEls.forEach(function (h) { revealObserver.observe(h); });
    } else {
      entries.forEach(function (en) { en.el.classList.add("is-in"); });
      headEls.forEach(function (h) { h.classList.add("is-in"); });
    }

    /* --- Scroll-Kopplung: Sichtbarkeit steuert die Sequenz ---
       threshold 0.35: ein Slot gilt erst als "aktiv", wenn er wirklich
       im Bild steht. So laufen nie alle Slots gleichzeitig. */
    var playObserver = null;
    if ("IntersectionObserver" in window) {
      playObserver = new IntersectionObserver(function (ents) {
        ents.forEach(function (e) {
          var entry = entries.filter(function (en) { return en.el === e.target; })[0];
          if (!entry) return;
          entry.setVisible(e.isIntersecting && e.intersectionRatio >= 0.35);
        });
      }, { threshold: [0, 0.35, 0.6, 0.9] });
      entries.forEach(function (en) { playObserver.observe(en.el); });
    } else {
      entries.forEach(function (en) { en.setVisible(true); });
    }

    /* Dokument im Hintergrund: alles anhalten. */
    document.addEventListener("visibilitychange", handleVisibility);

    state = {
      root: root,
      grid: grid,
      entries: entries,
      revealObserver: revealObserver,
      playObserver: playObserver
    };
    return state;
  }

  function handleVisibility() {
    if (!state) return;
    if (document.hidden) {
      state.entries.forEach(function (en) { en.setVisible(false); });
    }
  }

  function destroy() {
    if (!state) return;
    document.removeEventListener("visibilitychange", handleVisibility);
    state.entries.forEach(function (en) {
      var s = en.state;
      if (s.timer) clearTimeout(s.timer);
      try { s.video.pause(); } catch (e) {}
      s.video.removeAttribute("src");
      s.video.load();
    });
    if (state.revealObserver) state.revealObserver.disconnect();
    if (state.playObserver) state.playObserver.disconnect();
    if (state.grid.parentNode) state.grid.parentNode.removeChild(state.grid);
    state = null;
  }

  function boot() {
    var root = document.querySelector("[data-collage]");
    if (!root) return;
    var dataEl = document.getElementById("collage-data");
    if (!dataEl) return;
    var data;
    try {
      data = JSON.parse(dataEl.textContent);
    } catch (e) {
      console.error("[collage] Daten konnten nicht gelesen werden", e);
      return;
    }
    mount(root, data);
  }

  window.Collage = { mount: mount, destroy: destroy, boot: boot };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
