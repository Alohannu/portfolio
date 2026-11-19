/* ==========================================================================
   Showroom

   Klick auf eine Video-Kachel oeffnet das Video gross ueber der Seite.
   Kein zweiter Download: es wird dieselbe Datei geladen, die in der Kachel
   schon laeuft und damit im Cache liegt.

   - echtes Seitenverhaeltnis, nichts abgeschnitten (object-fit: contain)
   - Pfeiltasten / Pfeile blaettern durch alle Videos der Seite
   - M schaltet den Ton, ESC schliesst
   - waehrend das Overlay offen ist, stehen die Mosaik-Videos still
   - nach dem Schliessen laeuft das Mosaik unveraendert weiter
     (dieselben Videos an denselben Kacheln, nicht neu gemischt)

   Tastatur und Fokus: der Fokus wandert ins Overlay und beim Schliessen
   zurueck auf die Kachel, Tab bleibt im Overlay.
   ========================================================================== */
(function () {
  "use strict";

  var overlay, video, frame, panel, soundBtn, soundText;
  var items = [];          // { src, el } – alle klickbaren Videos der Seite
  var index = -1;
  var lastFocus = null;
  var isOpen = false;
  var pausedByUs = [];     // Mosaik-Videos, die wir angehalten haben

  function init() {
    overlay = document.getElementById("showroom");
    if (!overlay) return;
    video = document.getElementById("showroomVideo");
    frame = overlay.querySelector(".showroom__frame");
    panel = overlay.querySelector(".showroom__panel");
    soundBtn = overlay.querySelector("[data-showroom-sound]");
    soundText = overlay.querySelector("[data-showroom-sound-text]");


    /* Klick auf eine Kachel */
    document.addEventListener("click", function (e) {
      var host = e.target.closest ? e.target.closest("[data-playable]") : null;
      if (!host) return;
      e.preventDefault();
      openForHost(host);
    });

    /* Tastatur auf der Kachel: Enter und Leertaste oeffnen. */
    document.addEventListener("keydown", function (e) {
      if (isOpen) return;
      if (e.key !== "Enter" && e.key !== " ") return;
      var host = e.target.closest ? e.target.closest("[data-playable]") : null;
      if (!host) return;
      e.preventDefault();
      openForHost(host);
    });

    /* Overlay-Steuerung */
    overlay.addEventListener("click", function (e) {
      if (e.target.closest("[data-showroom-close]")) { close(); return; }
      if (e.target.closest("[data-showroom-prev]")) { step(-1); return; }
      if (e.target.closest("[data-showroom-next]")) { step(1); return; }
      if (e.target.closest("[data-showroom-sound]")) { toggleSound(); return; }
    });

    /* Tasten im Overlay */
    document.addEventListener("keydown", function (e) {
      if (!isOpen) return;
      /* preventDefault ist hier nicht kosmetisch: ohne das scrollt der
         Browser die Seite hinter dem Overlay mit den Pfeiltasten weg
         (overflow:hidden auf html reicht dafuer nicht). */
      if (e.key === "Escape") { e.preventDefault(); close(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); e.stopPropagation(); step(-1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); e.stopPropagation(); step(1); }
      else if (e.key === "ArrowUp" || e.key === "ArrowDown" ||
               e.key === "PageUp" || e.key === "PageDown" ||
               e.key === "Home" || e.key === "End" ||
               e.key === " ") {
        /* Auch diese Tasten scrollen sonst die Seite hinter dem Overlay. */
        e.preventDefault();
      }
      else if (e.key === "m" || e.key === "M") { e.preventDefault(); toggleSound(); }
      else if (e.key === "Tab") { trapTab(e); }
    });

    /* Beim Groessenwechsel neu einpassen. */
    window.addEventListener("resize", function () {
      if (isOpen) fitFrame();
    });
  }

  /* ---------- Videos der Seite einsammeln ---------- */
  function collect() {
    items = [];
    /* Mosaik-Kacheln */
    Array.prototype.forEach.call(
      document.querySelectorAll(".collage__slot video, .ot-tile video"),
      function (v) {
        var src = v.getAttribute("src");
        if (!src) return;
        var host = v.closest(".collage__slot, .ot-tile");
        if (!host) return;
        host.setAttribute("data-playable", "");
        host.setAttribute("role", "button");
        host.setAttribute("tabindex", "0");
        /* Beschriftung aus dem aria-label des Videos. */
        var label = v.getAttribute("aria-label") || "Video";
        host.setAttribute("aria-label", label + " – gross ansehen");
        items.push({ src: src, el: host });
      }
    );
  }

  function openForHost(host) {
    var at = -1;
    for (var i = 0; i < items.length; i++) {
      if (items[i].el === host) { at = i; break; }
    }
    open(at >= 0 ? at : 0);
  }

  /* ---------- Oeffnen / Schliessen ---------- */
  function open(i) {
    if (i < 0 || i >= items.length) return;
    lastFocus = document.activeElement;
    isOpen = true;
    index = i;

    /* Mosaik anhalten: sonst laufen 5 Videos im Hintergrund weiter und
       belasten den Rechner, waehrend hier eines laeuft.
       Wichtig: ALLE Videos merken, nicht nur die gerade laufenden. Der
       IntersectionObserver in collage.js startet sie sonst wieder, weil
       sie hinter dem Overlay weiterhin als sichtbar gelten. */
    pausedByUs = [];
    Array.prototype.forEach.call(document.querySelectorAll("video"), function (v) {
      if (v === video) return;
      pausedByUs.push(v);
      try { v.pause(); } catch (e) {}
    });

    overlay.hidden = false;
    /* Im naechsten Frame die Klasse setzen, damit die Transition laeuft. */
    requestAnimationFrame(function () { overlay.classList.add("is-open"); });

    document.documentElement.classList.add("is-locked");
    load(i, true);

    /* Fokus ins Overlay. */
    setTimeout(function () {
      if (soundBtn) soundBtn.focus();
    }, 60);
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    overlay.classList.remove("is-open");
    document.documentElement.classList.remove("is-locked");

    try { video.pause(); } catch (e) {}
    video.removeAttribute("src");
    video.load();

    /* Mosaik unveraendert weiterlaufen lassen: nur die Videos wieder
       starten, die wir selbst angehalten haben. */
    /* Nur die wieder starten, die auch im Bild stehen – sonst laufen
       Videos ausserhalb des Sichtbereichs an. */
    pausedByUs.forEach(function (v) {
      var r = v.getBoundingClientRect();
      var sichtbar = r.bottom > 0 && r.top < window.innerHeight &&
                     r.right > 0 && r.left < window.innerWidth;
      if (!sichtbar) return;
      var pr = v.play();
      if (pr && pr.catch) pr.catch(function () {});
    });
    pausedByUs = [];

    setTimeout(function () {
      overlay.hidden = true;
      /* Fokus zurueck auf die Kachel, von der aus geoeffnet wurde. */
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }, 280);
  }

  /* ---------- Ein Video laden ---------- */
  function load(i, autoplay) {
    index = i;
    var item = items[i];
    if (!item) return;

    video.setAttribute("src", item.src);
    video.muted = false;         // Showroom startet mit Ton …
    video.loop = false;          // einmal abspielen, dann stehen bleiben
    video.currentTime = 0;
    fitFrame();
    updateSoundUI();
    updateNav();

    if (autoplay) {
      var pr = video.play();
      if (pr && pr.catch) {
        /* Manche Browser lassen Ton ohne erneute Geste nicht zu. Dann
           stumm starten, damit ueberhaupt etwas passiert. */
        pr.catch(function () {
          video.muted = true;
          updateSoundUI();
          var pr2 = video.play();
          if (pr2 && pr2.catch) pr2.catch(function () {});
        });
      }
    }
  }

  /* Rahmen auf das Seitenverhaeltnis des Videos einpassen.

     Die Groesse wird hier in Pixeln gerechnet statt per CSS-calc: ein
     calc aus 100svh, clamp() und einer Custom Property loeste im Browser
     nicht zuverlaessig auf (der Rahmen fiel auf 89px zusammen).

     Vorgehen: der Rahmen bekommt die groesstmoegliche Flaeche mit dem
     echten Seitenverhaeltnis des Videos, ohne das Overlay zu verlassen.
     Dadurch ist bei 9:16 das ganze Bild zu sehen und nichts abgeschnitten. */
  function fitFrame() {
    var w = video.videoWidth, h = video.videoHeight;
    if (!w || !h) { w = 16; h = 9; }          // bis die Metadaten da sind

    var cs = getComputedStyle(overlay);
    var padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    var padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);

    /* Flaeche, die dem Rahmen zur Verfuegung steht: Overlay minus
       Innenabstand. Zusaetzlich Platz fuer den Ton-Knopf darunter. */
    var sound = soundBtn ? soundBtn.offsetHeight + 12 : 0;
    var availW = overlay.clientWidth - padX;
    var availH = overlay.clientHeight - padY - sound;
    if (availW <= 0 || availH <= 0) return;

    var ar = w / h;
    var fw = Math.min(availW, availH * ar);
    var fh = fw / ar;

    frame.style.setProperty("--ar", w + " / " + h);
    frame.style.setProperty("--fw", fw + "px");
    frame.style.setProperty("--fh", fh + "px");
  }

  /* ---------- Blaettern ---------- */
  function step(dir) {
    if (items.length < 2) return;
    var next = (index + dir + items.length) % items.length;
    load(next, true);
  }

  function updateNav() {
    overlay.classList.toggle("is-single", items.length < 2);
  }

  /* ---------- Ton ---------- */
  function toggleSound() {
    video.muted = !video.muted;
    if (!video.muted && video.paused) {
      var pr = video.play();
      if (pr && pr.catch) pr.catch(function () {});
    }
    updateSoundUI();
  }

  function updateSoundUI() {
    if (!soundBtn) return;
    var on = !video.muted;
    soundBtn.setAttribute("aria-pressed", on ? "true" : "false");
    soundBtn.setAttribute("aria-label", on ? "Ton ausschalten (M)" : "Ton einschalten (M)");
    if (soundText) soundText.textContent = on ? "ton an" : "stumm";
  }

  /* ---------- Fokus im Overlay halten ---------- */
  function trapTab(e) {
    var focusables = panel.querySelectorAll("button, [href], video[controls], [tabindex]:not([tabindex='-1'])");
    var list = Array.prototype.filter.call(focusables, function (el) {
      return el.offsetParent !== null || el === document.activeElement;
    });
    if (!list.length) return;
    var first = list[0], last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  }

  /* ---------- Metadaten nachreichen ---------- */
  function onMeta() {
    if (isOpen) fitFrame();
  }

  function boot() {
    init();
    /* Die Kacheln entstehen erst in collage.js und outtakes.js. Da dieses
       Skript danach geladen wird, sind sie hier schon da – collect()
       laeuft deshalb am Ende von init(). */
    collect();
    if (video) {
      video.addEventListener("loadedmetadata", onMeta);
      /* Am Ende stehen bleiben, nicht schleifen (loop ist aus). */
      video.addEventListener("ended", function () {
        video.pause();
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
