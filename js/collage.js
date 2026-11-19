/* ==========================================================================
   Video-Collage: ein Video nach dem anderen, per Scrollen gescrubbt

   Aufbau (wie das Hero-Video oben):
     .collage__scrub   hoher Wrapper = Scrollstrecke (JS setzt die Hoehe)
     .collage__stage   position:sticky, steht still
     Fortschritt p     -> video.currentTime

   Wichtig: Es laeuft IMMER NUR EIN Video gleichzeitig. Genau ein Slot ist
   aktiv und wird gescrubbt; alle anderen sind weisse Flaechen. Dadurch
   arbeitet nur ein einziger Decoder, und das Scrollen bleibt fluessig
   (vorher liefen bis zu sechs Videos parallel - das war das Ruckeln).

   Ist ein Clip zu Ende, blendet der aktive Slot auf Schwarz, der naechste
   Clip uebernimmt im selben Slot. Die Reihenfolge ist zufaellig.

   Oeffentliche API: window.Collage.mount(root, {clips, order, fadeMs})
   ========================================================================== */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Blende am Uebergang, in Sekunden Clipmaterial (je halbe Dauer vor und
     nach dem Wechsel). Die Kette ist mit ~67s deutlich laenger als ein
     einzelner Clip; 2s Blende sind daher noetig, damit der Uebergang beim
     Scrollen nicht uebersprungen wird. */
  var BLEND = 2.0;
  /* Scrollstrecke pro Sekunde Clipmaterial. 6vh/s ergibt bei ~67s Kette
     rund 4000px – lang genug zum Scrubben, kurz genug zum Durchscrollen. */
  var SCRUB_VH_PER_SEC = 6;

  var instances = [];

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
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

    /* Alle Clips einsammeln (flach) und zufaellig mischen. */
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
    if (!clips.length) return null;

    /* --- Struktur --- */
    var wrap = makeEl("div", "collage__scrub");
    var stage = makeEl("div", "collage__stage");
    var grid = makeEl("div", "collage__grid");

    /* Ein Slot je Video: das Raster bleibt als Mosaik sichtbar, und jedes
       Video bekommt seinen Platz. Nur der aktive Slot zeigt Bewegung. */
    var slots = clips.map(function (clip, i) {
      var size = (opts.sizes && opts.sizes[i]) || "m";
      var el = makeEl("div", "collage__slot collage__slot--" + size);
      el.dataset.shape = clip.dur > 0 ? "" : "";
      var video = makeEl("video");
      video.muted = true;
      video.defaultMuted = true;
      video.playsInline = true;
      video.setAttribute("playsinline", "");
      video.setAttribute("webkit-playsinline", "");
      video.preload = "metadata";
      video.setAttribute("aria-label", clip.alt || "");
      el.appendChild(video);
      grid.appendChild(el);
      return { el: el, video: video, clip: clip, active: false };
    });

    /* --- Kopf mit in die gepinnte Buehne ---
       Steht der Kopf ausserhalb, scrollt er weg, waehrend das Raster
       stehen bleibt. Er gehoert deshalb in dieselbe Buehne und bleibt
       zusammen mit den Videos im Bild.
       Der Kopf ist ein GESCHWISTER von root (nicht darin), deshalb wird
       im umgebenden Abschnitt gesucht. */
    var scope = root.parentNode || document;
    var head = scope.querySelector("[data-collage-head]");
    var stageInner = makeEl("div", "collage__stage-inner");
    if (head && !root.contains(head)) {
      head.parentNode.removeChild(head);
      stageInner.appendChild(head);
    }
    stageInner.appendChild(grid);
    stage.appendChild(stageInner);
    wrap.appendChild(stage);
    root.appendChild(wrap);

    /* --- Abspielreihenfolge ---
       Die Kacheln behalten ihre Position im Raster, aber sie leuchten in
       zufaelliger Reihenfolge auf. Ohne das laeuft die Kette immer von
       links nach rechts (Kachel 0, 1, 2 ...), weil die Zeitachse sonst
       schlicht der DOM-Reihenfolge folgt. */
    var playOrder = slots.map(function (_, i) { return i; });
    if (opts.shuffle !== false && playOrder.length > 1) {
      playOrder = shuffle(playOrder);
    }
    /* playOrder[k] = welcher Slot an k-ter Stelle der Kette dran ist.
       orderOf[i]   = an welcher Stelle Slot i steht (Umkehrung). */
    var orderOf = [];
    playOrder.forEach(function (slotIdx, k) { orderOf[slotIdx] = k; });

    /* Zeitachse ueber alle Clips: Fortschritt 0..1 = gesamte Kette.
       Aufgebaut in Abspielreihenfolge, nicht in DOM-Reihenfolge. */
    var total = clips.reduce(function (a, c) { return a + (c.dur || 1); }, 0) || 1;
    var spans = new Array(slots.length);
    var acc = 0;
    playOrder.forEach(function (slotIdx) {
      var d = clips[slotIdx].dur || 1;
      spans[orderOf[slotIdx]] = { i: slotIdx, start: acc, end: acc + d, dur: d };
      acc += d;
    });

    var vhLen = Math.max(300, Math.round(total * SCRUB_VH_PER_SEC / 10) * 10);
    wrap.style.height = vhLen + "vh";

    var currentIdx = -1;      // welcher Clip gerade im aktiven Slot liegt
    var lastSeek = -1;
    var pendingTime = null;

    function activeSlot() { return slots[currentIdx] || null; }

    /* Clip in den aktiven Slot laden. Alle anderen bleiben weiss. */
    function useClip(i, whenReady) {
      var slot = slots[i];
      if (!slot) return;
      slots.forEach(function (s, k) {
        var on = k === i;
        s.el.classList.toggle("is-active", on);
        s.el.classList.toggle("is-idle", !on);
        /* Alten Clip freigeben: sonst bleibt in jedem schon benutzten Slot
           eine geladene Datei im Speicher liegen. */
        if (!on && s.video.getAttribute("src")) {
          try { s.video.pause(); } catch (e) {}
          s.video.removeAttribute("src");
          s.video.load();
        }
      });
      currentIdx = i;
      lastSeek = -1;
      pendingTime = null;
      var video = slot.video;

      var finish = function () {
        video.removeEventListener("loadeddata", finish);
        video.removeEventListener("canplay", finish);
        if (whenReady) whenReady();
      };
      video.addEventListener("loadeddata", finish);
      video.addEventListener("canplay", finish);
      setTimeout(finish, 900);

      if (video.getAttribute("src") !== slot.clip.src) {
        video.src = slot.clip.src;
        video.load();
      } else {
        finish();
      }
      slot.el.title = slot.clip.title || slot.clip.alt || "";
    }

    function seekTo(t) {
      var slot = activeSlot();
      if (!slot) return;
      var video = slot.video;
      var d = video.duration;
      if (!d || !isFinite(d)) { pendingTime = t; return; }
      var tt = clamp(t, 0, Math.max(0, d - 0.05));
      if (Math.abs(tt - lastSeek) < 0.012) return;
      lastSeek = tt;
      try { video.currentTime = tt; } catch (e) {}
    }

    /* Fortschritt auf die Kette abbilden. */
    function resolve(p) {
      var t = clamp(p, 0, 1) * total;
      var span = spans[spans.length - 1];
      for (var k = 0; k < spans.length; k++) {
        if (t < spans[k].end || k === spans.length - 1) { span = spans[k]; break; }
      }
      var local = clamp(t - span.start, 0, span.dur);
      var op = 0;
      if (span.i > 0 && local < BLEND) op = 1 - local / BLEND;
      else if (span.i < spans.length - 1 && local > span.dur - BLEND) op = 1 - (span.dur - local) / BLEND;
      return { idx: span.i, time: local, fade: clamp(op, 0, 1) };
    }

    /* Aktuellen Fortschritt anwenden. */
    function apply(p) {
      var r = resolve(p);
      if (r.idx !== currentIdx) {
        useClip(r.idx, function () { seekTo(r.time); });
      } else {
        seekTo(r.time);
      }
      /* Blende als Overlay ueber dem aktiven Slot. */
      slots.forEach(function (s, k) {
        if (k !== r.idx) return;
        var f = s.el.querySelector(".collage__fade");
        if (!f) {
          f = makeEl("div", "collage__fade");
          s.el.appendChild(f);
        }
        var others = s.el.querySelectorAll(".collage__fade");
        for (var n = 0; n < others.length; n++) if (others[n] !== f) others[n].remove();
        f.style.opacity = String(r.fade);
      });
    }

    function progress() {
      var top = wrap.getBoundingClientRect().top;
      var dist = wrap.offsetHeight - window.innerHeight;
      if (dist <= 0) return top <= 0 ? 1 : 0;
      return clamp(-top / dist, 0, 1);
    }

    /* ticking MUSS pro Collage gefuehrt werden. Waere es modulweit, wuerde
       die erste Collage es beim Scrollen auf true setzen und die zweite
       ihr Update komplett ueberspringen - sie bliebe auf dem ersten Bild
       stehen und wuerde nie weiterschalten. */
    var ticking = false;
    var lastProgress = 0;

    function update() {
      ticking = false;
      var p = progress();
      lastProgress = p;
      if (reduceMotion) { if (currentIdx !== 0) apply(0.0001); return; }
      apply(p);
    }

    function requestUpdate() {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }

    /* --- Einblenden der Kacheln und der Kopfzeile ---
       Ohne das bleiben die Slots auf opacity:0 und man sieht nur Schwarz.
       Beobachtet wird die ganze Sektion, nicht jede Kachel einzeln: die
       Slots liegen in einer sticky Buehne und wuerden bei einem
       Beobachter mit negativem rootMargin nie als sichtbar gelten. */
    var headEls = root.parentNode
      ? Array.prototype.slice.call(root.parentNode.querySelectorAll("[data-collage-reveal]"))
      : [];
    function revealAll() {
      slots.forEach(function (s, i) {
        s.el.style.transitionDelay = (i * 60) + "ms";
        s.el.classList.add("is-in");
      });
      headEls.forEach(function (h) { h.classList.add("is-in"); });
    }
    if ("IntersectionObserver" in window && !reduceMotion) {
      var revealIO = new IntersectionObserver(function (ents) {
        ents.forEach(function (e) {
          if (!e.isIntersecting) return;
          revealAll();
          revealIO.disconnect();
        });
      }, { threshold: 0, rootMargin: "0px 0px -8% 0px" });
      /* Nicht die Buehne beobachten: die ist auf schmalen Viewports hoeher
         als das Fenster, dann greift keine Schwelle. Stattdessen die erste
         Kachel – die ist immer kleiner als der Viewport. */
      revealIO.observe(slots[0].el);
    } else {
      revealAll();
    }

    /* --- Sichtbarkeit: ausserhalb des Bildes wird nichts geladen --- */
    var io = null;
    if ("IntersectionObserver" in window) {
      io = new IntersectionObserver(function (ents) {
        ents.forEach(function (e) {
          if (e.isIntersecting) {
            if (currentIdx === -1) requestUpdate();
          } else {
            var slot = activeSlot();
            if (slot && !slot.video.paused) slot.video.pause();
          }
        });
      }, { threshold: [0, 0.2, 0.6] });
      io.observe(wrap);
    }

    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);

    /* Seeking liefert erst Frames, wenn einmal angespielt wurde. */
    var primed = false;
    function prime() {
      if (primed) return;
      var slot = activeSlot();
      if (!slot) { requestUpdate(); return; }
      var pr = slot.video.play();
      if (pr && pr.then) {
        pr.then(function () {
          slot.video.pause();
          primed = true;
          lastSeek = -1;
          requestUpdate();
        }).catch(function () {});
      }
    }
    window.addEventListener("pointerdown", prime, { passive: true, once: true });
    window.addEventListener("wheel", prime, { passive: true, once: true });
    window.addEventListener("keydown", prime, { once: true });
    window.addEventListener("touchstart", prime, { passive: true, once: true });

    /* Metadaten nachreichen: Dauer korrigieren und Position nachziehen.
       Achtung: spans liegt in ABSPIELREIHENFOLGE, nicht in Slot-Reihenfolge.
       Der Eintrag fuer Slot i steht daher an der Stelle orderOf[i]. */
    slots.forEach(function (s, i) {
      s.video.addEventListener("loadedmetadata", function () {
        var at = orderOf[i];
        if (s.video.duration && isFinite(s.video.duration) && spans[at]) {
          var alt = spans[at].dur;
          spans[at].dur = s.video.duration;
          var delta = s.video.duration - alt;
          if (delta) {
            total += delta;
            for (var k = at; k < spans.length; k++) {
              spans[k].start += delta;
              spans[k].end += delta;
            }
          }
        }
        if (i === currentIdx) {
          lastSeek = -1;
          if (pendingTime != null) { var t = pendingTime; pendingTime = null; seekTo(t); }
          else requestUpdate();
        }
      });
    });

    var inst = { root: root, wrap: wrap, stage: stage, grid: grid, slots: slots,
                 requestUpdate: requestUpdate, io: io, destroy: destroyInstance };
    instances.push(inst);
    useClip(0, function () { requestUpdate(); });
    requestUpdate();
    return inst;
  }

  /* Eine einzelne Collage wieder abbauen. */
  function destroyInstance(inst) {
    if (!inst) return;
    window.removeEventListener("scroll", inst.requestUpdate);
    window.removeEventListener("resize", inst.requestUpdate);
    if (inst.io) inst.io.disconnect();
    inst.slots.forEach(function (s) {
      try { s.video.pause(); } catch (e) {}
      s.video.removeAttribute("src");
    });
    if (inst.wrap.parentNode) inst.wrap.parentNode.removeChild(inst.wrap);
    var at = instances.indexOf(inst);
    if (at !== -1) instances.splice(at, 1);
  }

  /* Alle Collagen der Seite abbauen. */
  function destroy() {
    instances.slice().forEach(destroyInstance);
  }

  function boot() {
    var roots = document.querySelectorAll("[data-collage]");
    if (!roots.length) return;

    /* Die Startseite spielt nur diese Videos; fehlt "only" im JSON,
       gilt diese Liste. Die Outtakes stehen weiter unten auf derselben
       Seite und bringen ihre eigene Liste im JSON mit. */
    var defaultOnly = ["e-commerce", "ucg-outfit1", "ucg-outfit2", "fashion",
                       "hero-video", "eggo-aleph-seedance"];

    Array.prototype.forEach.call(roots, function (root) {
      /* Welcher Datenblock gehoert zu dieser Collage?
         data-collage="outtakes" -> #collage-data-outtakes
         data-collage (leer)     -> #collage-data            */
      var key = root.getAttribute("data-collage");
      var dataEl = document.getElementById(key ? "collage-data-" + key : "collage-data");
      if (!dataEl) {
        console.warn("[collage] Kein Datenblock fuer", key || "(Standard)");
        return;
      }
      var data;
      try { data = JSON.parse(dataEl.textContent); }
      catch (e) { console.error("[collage] Daten konnten nicht gelesen werden", e); return; }

      mount(root, {
        slots: data.slots,
        only: data.only !== undefined ? data.only : defaultOnly,
        shuffle: data.shuffle !== false,   // Standard: mischen
        fadeMs: data.fadeMs
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
