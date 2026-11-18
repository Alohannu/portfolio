/* ==========================================================================
   Video-Collage

   Alle Videos laufen von selbst und geloopt – kein Scroll-Scrubbing.
   Gescrollt wird nur die Ueberschrift ("selected works"), die beim
   Hereinkommen eingeblendet wird.

   Aufbau:
     .collage__scrub        Wrapper; die Hoehe kommt aus dem Inhalt,
                            das Raster bleibt per sticky stehen
     .collage__stage        position:sticky, steht still
     .collage__stage-inner  Kopf + Raster zusammen, damit die Ueberschrift
                            nicht wegscrollt, waehrend die Videos stehen

   Gespielt wird nur, was auch im Bild steht: sonst laufen alle Videos
   gleichzeitig und das Scrollen ruckelt.

   Oeffentliche API: window.Collage.mount(root, {slots, only, shuffle})
   ========================================================================== */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var instances = [];

  function makeEl(tag, cls) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    return el;
  }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function mount(root, opts) {
    if (!root) return null;
    opts = opts || {};

    /* Alle Clips einsammeln und mischen. */
    var clips = [];
    (opts.slots || []).forEach(function (slot) {
      (slot.clips || []).forEach(function (c) {
        clips.push({ src: c.src, title: c.title || "", alt: c.alt || "", dur: c.duration || 0 });
      });
    });
    if (opts.only && opts.only.length) {
      var want = opts.only.map(function (s) { return s.toLowerCase(); });
      clips = clips.filter(function (c) {
        var f = c.src.split("/").pop().toLowerCase();
        return want.some(function (w) { return f.indexOf(w) !== -1; });
      });
    }
    if (opts.shuffle !== false) shuffle(clips);

    /* Festes Bild statt eines Videos: steht immer an derselben Stelle
       (opts.image.index, 0-basiert) und ersetzt das Video "drop". Ein Klick
       oeffnet es in der Bild-Ansicht (js/imageviewer.js). */
    if (opts.image && opts.image.src) {
      if (opts.image.drop) {
        var dropKey = String(opts.image.drop).toLowerCase();
        clips = clips.filter(function (c) {
          return c.src.split("/").pop().toLowerCase().indexOf(dropKey) === -1;
        });
      }
      var at = Math.min(opts.image.index || 0, clips.length);
      clips.splice(at, 0, { image: opts.image, title: opts.image.label || "", alt: opts.image.alt || "" });
    }
    if (!clips.length) return null;

    /* --- Struktur --- */
    var wrap = makeEl("div", "collage__scrub");
    var stage = makeEl("div", "collage__stage");
    var stageInner = makeEl("div", "collage__stage-inner");
    var grid = makeEl("div", "collage__grid");

    /* Kopf mit in die Buehne holen (er ist ein Geschwister von root). */
    /* Der Kopf ist ein Geschwister von root, nicht darin. Gesucht wird
       deshalb im umgebenden Abschnitt – aber nur der Kopf DIESES
       Abschnitts, sonst greift eine zweite Collage den Kopf der ersten. */
    var scope = root.parentNode || document;
    var head = null;
    if (scope.querySelectorAll) {
      var heads = scope.querySelectorAll("[data-collage-head]");
      for (var hi = 0; hi < heads.length; hi++) {
        /* Nur nehmen, wenn der Kopf nicht schon in einer anderen Buehne
           steckt (die wurde beim ersten mount dorthin verschoben). */
        if (!heads[hi].closest(".collage__stage")) { head = heads[hi]; break; }
      }
    }

    /* --- Eine Kachel je Video --- */
    var slots = clips.map(function (clip, i) {
      var el = makeEl("div", "collage__slot collage__slot--m");
      el.dataset.idx = String(i);

      if (clip.image) {
        el.classList.add("collage__slot--img");
        el.setAttribute("role", "button");
        el.setAttribute("tabindex", "0");
        el.setAttribute("data-viewer-src", clip.image.src);
        el.setAttribute("data-viewer-alt", clip.image.alt || "");
        el.setAttribute("data-viewer-label", clip.image.label || "");
        el.setAttribute("aria-label", (clip.image.alt || "Bild") + " – in voller Größe öffnen");
        var pic = makeEl("img");
        pic.src = clip.image.src;
        pic.alt = clip.image.alt || "";
        pic.decoding = "async";
        el.appendChild(pic);
        el.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); el.click(); }
        });
        grid.appendChild(el);
        /* Platzhalter, damit die Video-Logik unten das Bild wie eine
           Kachel behandeln kann. */
        return { el: el, video: { paused: true, pause: function () {}, play: function () { this.paused = false; return null; } }, clip: clip };
      }

      var video = makeEl("video");
      video.muted = true;
      video.defaultMuted = true;
      video.playsInline = true;
      video.setAttribute("playsinline", "");
      video.setAttribute("webkit-playsinline", "");
      video.loop = true;
      video.preload = "metadata";
      video.src = clip.src;
      video.setAttribute("aria-label", clip.alt || "");

      el.appendChild(video);
      el.title = clip.title || clip.alt || "";
      grid.appendChild(el);

      return { el: el, video: video, clip: clip };
    });

    if (head && !root.contains(head)) {
      head.parentNode.removeChild(head);
      stageInner.appendChild(head);
    }
    stageInner.appendChild(grid);
    stage.appendChild(stageInner);
    wrap.appendChild(stage);
    root.appendChild(wrap);

    /* --- Abspielen: nur was im Bild steht ---
       Ein Beobachter je Kachel. Sichtbar -> play(), sonst pause().
       Die Videos laufen unabhaengig voneinander, jedes in seinem Loop. */
    var playing = 0;
    function setActive(slot, on) {
      /* Solange der Showroom offen ist, bleibt alles stehen. Sonst wuerde
         der Beobachter die Videos hinter dem Overlay wieder starten. */
      if (on && document.documentElement.classList.contains("is-locked")) return;
      if (on === !slot.video.paused) return;
      if (on) {
        slot.el.classList.add("is-active");
        playing++;
        if (!reduceMotion) {
          var pr = slot.video.play();
          if (pr && pr.catch) pr.catch(function () {});
        }
      } else {
        slot.el.classList.remove("is-active");
        playing = Math.max(0, playing - 1);
        if (!slot.video.paused) slot.video.pause();
        if (slot.clip.image) slot.video.paused = true;
      }
    }

    var io = null;
    if ("IntersectionObserver" in window) {
      io = new IntersectionObserver(function (ents) {
        ents.forEach(function (e) {
          var slot = slots.filter(function (s) { return s.el === e.target; })[0];
          if (!slot) return;
          if (e.isIntersecting) {
            slot.el.classList.add("is-in");
            setActive(slot, true);
          } else {
            setActive(slot, false);
          }
        });
      }, { threshold: [0, 0.25, 0.6] });
      slots.forEach(function (s) { io.observe(s.el); });
    } else {
      slots.forEach(function (s) { s.el.classList.add("is-in"); setActive(s, true); });
    }

    /* Dokument im Hintergrund: alles anhalten. */
    function onVisibility() {
      if (document.hidden) slots.forEach(function (s) { setActive(s, false); });
    }
    document.addEventListener("visibilitychange", onVisibility);

    /* --- Ueberschrift beim Scrollen einblenden ---
       Nur das ist noch an das Scrollen gekoppelt, und zwar wie bei
       "ComfyUI virtual try on": die Ueberschrift faehrt aus einer Maske
       herauf (.reveal / .reveal__inner), der Text folgt mit .fade-in.
       Ausgeloest wird ueber den Scroll-Fortschritt des Abschnitts, nicht
       ueber einen Beobachter - so sitzt der Moment reproduzierbar an
       derselben Stelle. */
    var titleEl = stageInner.querySelector(".reveal");
    var fadeEl = stageInner.querySelector(".fade-in");

    function setHead(show) {
      if (titleEl) titleEl.classList.toggle("is-visible", show);
      if (fadeEl) fadeEl.classList.toggle("is-visible", show);
    }

    var headTicking = false;
    function updateHead() {
      headTicking = false;
      var r = wrap.getBoundingClientRect();
      var dist = wrap.offsetHeight - window.innerHeight;
      if (dist <= 0) { setHead(r.top <= 0); return; }
      /* 0 = Abschnitt kommt ins Bild, 1 = komplett durchgescrollt.
         Ab 15% ist die Ueberschrift da - frueh, aber nicht schon beim
         ersten Pixel, sonst sieht man die Bewegung nicht. */
      setHead(-r.top / dist >= 0.15);
    }

    function requestHead() {
      if (!headTicking) { headTicking = true; requestAnimationFrame(updateHead); }
    }

    if (reduceMotion) {
      setHead(true);
    } else {
      window.addEventListener("scroll", requestHead, { passive: true });
      window.addEventListener("resize", requestHead);
      updateHead();
    }

    var inst = {
      root: root, wrap: wrap, stage: stage, grid: grid, slots: slots,
      requestHead: requestHead, onVisibility: onVisibility,
      destroy: function () { destroyInstance(inst); }
    };
    instances.push(inst);
    return inst;
  }

  function destroyInstance(inst) {
    if (!inst) return;
    document.removeEventListener("visibilitychange", inst.onVisibility);
    window.removeEventListener("scroll", inst.requestHead);
    window.removeEventListener("resize", inst.requestHead);
    inst.slots.forEach(function (s) {
      try { s.video.pause(); } catch (e) {}
    });
    if (inst.wrap.parentNode) inst.wrap.parentNode.removeChild(inst.wrap);
    var at = instances.indexOf(inst);
    if (at !== -1) instances.splice(at, 1);
  }

  function destroy() {
    instances.slice().forEach(destroyInstance);
  }

  function boot() {
    var roots = document.querySelectorAll("[data-collage]");
    if (!roots.length) return;

    /* Die Startseite spielt nur diese Videos; fehlt "only" im JSON,
       gilt diese Liste. */
    var defaultOnly = ["e-commerce", "ucg-outfit1", "ucg-outfit2", "fashion",
                       "hero-video"];

    Array.prototype.forEach.call(roots, function (root) {
      var key = root.getAttribute("data-collage");
      var dataEl = document.getElementById(key ? "collage-data-" + key : "collage-data");
      if (!dataEl) return;
      var data;
      try { data = JSON.parse(dataEl.textContent); }
      catch (e) { console.error("[collage] Daten konnten nicht gelesen werden", e); return; }

      mount(root, {
        slots: data.slots,
        only: data.only !== undefined ? data.only : defaultOnly,
        image: data.image,
        shuffle: data.shuffle !== false
      });
    });
  }

  window.Collage = { mount: mount, destroy: destroy, boot: boot };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
