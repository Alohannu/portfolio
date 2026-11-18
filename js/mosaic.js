/* ==========================================================================
   Video-Mosaik: Die Videos erscheinen beim Scrollen nacheinander ("Mosaik")
   und laufen danach stumm und geloopt weiter, solange sie sichtbar sind.

   Datenquelle: Die Zellen liegen als JSON im <script id="mosaic-data">-Block
   in index.html. Hier wird nur gerendert und beobachtet; es gibt keine
   fest verdrahteten Dateinamen.

   Öffentliche API (fuer spaetere Erweiterungen):
     window.Mosaic.mount(rootEl, { items, columns, rowHeight, minHeight })
     window.Mosaic.destroy()
   ========================================================================== */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Ein Beobachter fuer die Einblendung: sobald eine Zelle sichtbar wird,
     bekommt sie .is-in und wird nicht wieder abgemeldet (bleibt sichtbar). */
  var revealObserver = null;
  /* Zweiter Beobachter nur fuer Videos: steuert Abspielen/Pausieren. */
  var playObserver = null;
  var mounted = null;

  function makeEl(tag, cls) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    return el;
  }

  function makeCell(item, index) {
    var cell = makeEl("figure", "mosaic__cell mosaic__cell--" + (item.type || "image"));
    cell.style.setProperty("--i", index);

    /* Position kommt aus den Daten (grid-column / grid-row). Fehlt sie,
       greift das automatische Placement des Rasters. */
    if (item.gridColumn) cell.style.gridColumn = item.gridColumn;
    if (item.gridRow) cell.style.gridRow = item.gridRow;
    if (item.title) cell.title = item.title;

    var media;
    if (item.type === "video") {
      media = makeEl("video", "mosaic__media");
      media.muted = true;              // Pflicht fuer Autoplay in allen Browsern
      media.defaultMuted = true;
      media.loop = true;
      media.playsInline = true;
      media.setAttribute("playsinline", "");
      media.setAttribute("webkit-playsinline", "");
      media.preload = "metadata";
      media.setAttribute("aria-label", item.alt || "");
      media.poster = item.poster || "";
    } else {
      media = makeEl("img", "mosaic__media");
      media.loading = "lazy";
      media.decoding = "async";
      media.alt = item.alt || "";
      if (item.width) media.width = item.width;
      if (item.height) media.height = item.height;
    }

    // src erst nach dem Einsetzen setzen, damit der Browser sauber laedt
    cell.appendChild(media);
    media.src = item.src;

    return cell;
  }

  function resolveSrc(src) {
    // Erlaubt sowohl absolute als auch relative Pfade in den JSON-Daten.
    return src;
  }

  function mount(root, opts) {
    if (!root) return null;
    destroy();

    opts = opts || {};
    var items = (opts.items || []).map(function (it) {
      var copy = {};
      for (var k in it) if (Object.prototype.hasOwnProperty.call(it, k)) copy[k] = it[k];
      copy.src = resolveSrc(copy.src);
      return copy;
    });

    if (!items.length) return null;

    var grid = makeEl("div", "mosaic__grid");
    if (opts.columns) grid.style.setProperty("--mosaic-cols", opts.columns);
    if (opts.rowHeight) grid.style.setProperty("--mosaic-row", opts.rowHeight);
    if (opts.minHeight) grid.style.minHeight = opts.minHeight;

    var fragment = document.createDocumentFragment();
    var cells = [];
    var videos = [];

    items.forEach(function (item, i) {
      var cell = makeCell(item, i);
      cells.push(cell);
      fragment.appendChild(cell);
      if (item.type === "video") videos.push(cell.querySelector("video"));
    });

    grid.appendChild(fragment);
    root.appendChild(grid);

    /* Kopfzeile mit derselben Einblendung versehen (eigenes Markup,
       damit das Mosaik nicht von der Morph-Logik in script.js abhaengt). */
    var headEls = Array.prototype.slice.call(
      root.parentNode ? root.parentNode.querySelectorAll("[data-mosaic-reveal]") : []
    );

    /* --- Einblenden: gestaffelt nach Scrollrichtung ---
       rootMargin unten positiv, damit Zellen schon kurz vor dem Rand
       erscheinen; so wirkt es wie ein nacheinander aufgebautes Mosaik. */
    if ("IntersectionObserver" in window && !reduceMotion) {
      revealObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-in");
          revealObserver.unobserve(entry.target);
        });
      }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });

      cells.forEach(function (c) { revealObserver.observe(c); });
      headEls.forEach(function (h) { revealObserver.observe(h); });
    } else {
      cells.forEach(function (c) { c.classList.add("is-in"); });
      headEls.forEach(function (h) { h.classList.add("is-in"); });
    }

    /* --- Videos: abspielen, sobald sichtbar; pausieren, sobald nicht ---
       threshold 0.25 verhindert, dass 14 Videos gleichzeitig laufen. */
    if ("IntersectionObserver" in window && videos.length) {
      playObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          var v = entry.target;
          if (entry.isIntersecting && entry.intersectionRatio >= 0.25) {
            if (!reduceMotion && v.paused) {
              var pr = v.play();
              if (pr && pr.catch) pr.catch(function () { /* Autoplay blockiert: Standbild */ });
            }
          } else if (!v.paused) {
            v.pause();
          }
        });
      }, { threshold: [0, 0.25, 0.6] });

      videos.forEach(function (v) { playObserver.observe(v); });
    }

    /* Nach dem Laden neu auswerten: Bilder/Videos aendern die Rasterhoehe,
       dadurch verschieben sich die Ausloesepunkte. */
    if ("IntersectionObserver" in window) {
      var resort = function () {
        if (!revealObserver) return;
        cells.forEach(function (c) {
          if (c.classList.contains("is-in")) return;
          revealObserver.unobserve(c);
          revealObserver.observe(c);
        });
      };
      window.addEventListener("load", resort, { once: true });
      var t = 0;
      window.addEventListener("resize", function () {
        clearTimeout(t);
        t = setTimeout(resort, 150);
      }, { passive: true });
    }

    /* Pausieren, wenn der Tab in den Hintergrund geht (spart Akku). */
    document.addEventListener("visibilitychange", function () {
      videos.forEach(function (v) {
        if (document.hidden) { if (!v.paused) v.pause(); }
      });
    });

    mounted = { root: root, grid: grid, cells: cells, videos: videos };
    return mounted;
  }

  function destroy() {
    if (revealObserver) { revealObserver.disconnect(); revealObserver = null; }
    if (playObserver) { playObserver.disconnect(); playObserver = null; }
    if (mounted && mounted.videos) {
      mounted.videos.forEach(function (v) {
        try { v.pause(); } catch (e) {}
      });
    }
    if (mounted && mounted.grid && mounted.grid.parentNode) {
      mounted.grid.parentNode.removeChild(mounted.grid);
    }
    mounted = null;
  }

  function boot() {
    var root = document.querySelector("[data-mosaic]");
    if (!root) return;

    var dataEl = document.getElementById("mosaic-data");
    if (!dataEl) return;

    var data;
    try {
      data = JSON.parse(dataEl.textContent);
    } catch (e) {
      console.error("[mosaic] Daten konnten nicht gelesen werden", e);
      return;
    }

    mount(root, data);
  }

  window.Mosaic = { mount: mount, destroy: destroy, boot: boot };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
