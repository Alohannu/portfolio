/* ==========================================================================
   Bild-Ansicht

   Klick auf ein Element mit data-viewer-src (z. B. das Ergebnisbild im
   ComfyUI-Graphen, context/nodeview.js) zeigt genau diese Datei gross
   ueber der Seite - das Original, nicht eine Kopie und nicht ein
   Screenshot.

   - "Einpassen" (Standard): das ganze Bild auf einen Blick, so gross wie
     das Fenster es erlaubt (hoechstens 2,5-fach; das Original hat nur so
     viele Bildpunkte, wie es hat)
   - "1:1": echte Bildpunkte, ohne jede Skalierung; passt es nicht auf
     den Schirm, scrollt die Ansicht (kein Beschnitt, keine Verzerrung)
   - ESC / X / Klick daneben schliessen, Fokus geht zurueck auf das Bild
   - waehrend die Ansicht offen ist, bewegt das Mausrad weder die Seite
     noch den Node-Graphen: js/script.js lenkt das Rad dort sonst in den
     Graphen um. Der Waechter unten laeuft in der Capture-Phase und
     stoppt die Weitergabe, bevor der Graph-Handler sie sieht.

   Im Markup:

     <button data-viewer-src="assets/output.webp"
             data-viewer-alt="Beschreibung"
             data-viewer-label="Save Image"> … </button>
   ========================================================================== */
(function () {
  "use strict";

  var overlay, img, meta, link, panel, modeBtn, closeBtn;
  var isOpen = false;
  var actualSize = false;     // false = Einpassen, true = 1:1
  var lastFocus = null;
  var lastLabel = "";
  var closeTimer = 0;         // laufendes Schliessen (Transition abwarten)

  function init() {
    overlay = document.getElementById("imageviewer");
    if (!overlay) return;

    img = document.getElementById("imageviewerImg");
    meta = document.getElementById("imageviewerMeta");
    link = document.getElementById("imageviewerLink");
    panel = overlay.querySelector(".imageviewer__panel");
    modeBtn = overlay.querySelector("[data-viewer-mode]");
    closeBtn = overlay.querySelector("[data-viewer-close-button]");
    if (!img || !panel) return;

    /* Oeffnen: Klick auf ein Bild (Delegation, damit auch spaeter
       gerenderte Bilder funktionieren - der Node-Graph entsteht erst
       nach dem Laden der Seite). */
    document.addEventListener("click", function (e) {
      var host = e.target.closest ? e.target.closest("[data-viewer-src]") : null;
      if (!host) return;
      e.preventDefault();
      open(host);
    });

    /* Overlay-Steuerung */
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay || e.target.closest("[data-viewer-close]")) { close(); return; }
      if (e.target.closest("[data-viewer-mode]")) { toggleMode(); return; }
    });

    /* Tasten: ESC schliesst, Tab bleibt in der Ansicht, und die
       Blaetter-/Scrolltasten gehoeren der Ansicht, nicht der Seite.
       Die Seite haengt eigene Tasten auf (js/track.js blaettert mit
       Pfeil links/rechts die Abschnitte weiter, js/script.js bedient
       den Graphen). Beide haengen ebenfalls an window - darum in der
       Capture-Phase und mit stopImmediatePropagation, sonst sieht der
       Abschnittswechsel die Pfeiltaste trotzdem und springt hinter der
       offenen Ansicht weg. */
    window.addEventListener("keydown", onKeydown, true);

    /* Mausrad: nur weiterreichen stoppen, nicht die Standardaktion -
       damit die Ansicht bei 1:1 selbst scrollen kann, der Graph
       dahinter aber still steht. */
    window.addEventListener("wheel", function (e) {
      if (!isOpen) return;
      e.stopPropagation();
    }, { capture: true, passive: true });

    img.addEventListener("load", function () {
      if (!isOpen || !img.naturalWidth) return;
      updateMeta();
      fit();
    });
    /* Fehlt die Datei, sagt die Ansicht das, statt leer zu bleiben. */
    img.addEventListener("error", function () {
      if (meta) meta.textContent = "Bild konnte nicht geladen werden";
    });

    window.addEventListener("resize", function () { if (isOpen) fit(); });
  }

  /* ---------- Oeffnen / Schliessen ---------- */
  function open(host) {
    var src = host.getAttribute("data-viewer-src");
    if (!src) return;

    if (closeTimer) { clearTimeout(closeTimer); closeTimer = 0; }
    lastFocus = document.activeElement;
    lastLabel = host.getAttribute("data-viewer-label") || "";
    actualSize = false;
    overlay.classList.remove("is-actual");
    updateModeUI();

    isOpen = true;
    overlay.hidden = false;
    document.documentElement.classList.add("is-locked");

    if (meta) meta.textContent = "wird geladen …";
    img.setAttribute("alt", host.getAttribute("data-viewer-alt") || "");
    img.setAttribute("src", src);        // dieselbe Datei wie im Graphen
    overlay.setAttribute("aria-label", lastLabel ? lastLabel + " – Grossansicht" : "Bild-Ansicht");
    if (link) link.setAttribute("href", src);

    requestAnimationFrame(function () { overlay.classList.add("is-open"); });
    setTimeout(function () { if (closeBtn) closeBtn.focus(); }, 60);
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    overlay.classList.remove("is-open");
    document.documentElement.classList.remove("is-locked");

    /* Erst nach der Transition ausblenden - und nur, wenn in der
       Zwischenzeit nicht wieder geoeffnet wurde. */
    closeTimer = setTimeout(function () {
      closeTimer = 0;
      if (isOpen) return;
      overlay.hidden = true;
      img.removeAttribute("src");
      if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
      lastFocus = null;
    }, 280);
  }

  /* ---------- Einpassen / 1:1 ---------- */
  function toggleMode() {
    actualSize = !actualSize;
    overlay.classList.toggle("is-actual", actualSize);
    updateModeUI();
    fit();
    /* Im 1:1-Modus steht das Bild oben, nicht mitten im Scrollbereich. */
    if (actualSize) overlay.scrollTo(0, 0);
  }

  function updateModeUI() {
    if (modeBtn) {
      modeBtn.textContent = actualSize ? "Einpassen" : "1 : 1";
      modeBtn.setAttribute("aria-pressed", actualSize ? "true" : "false");
      modeBtn.setAttribute("aria-label", actualSize
        ? "Bild auf Fenstergroesse einpassen"
        : "Bild in Originalgroesse zeigen (1:1)");
    }
  }

  /* Die Groesse wird in Pixeln gerechnet (wie im Showroom): ein calc aus
     100svh und Custom Properties loeste im Browser nicht zuverlaessig auf. */
  function fit() {
    if (!img || !img.naturalWidth) return;
    var cs = getComputedStyle(overlay);
    var padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    var padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    var caption = overlay.querySelector(".imageviewer__caption");
    var captionH = caption ? caption.offsetHeight + 14 : 0;

    var availW = overlay.clientWidth - padX;
    var availH = overlay.clientHeight - padY - captionH;
    var scale = 1;
    if (!actualSize && availW > 0 && availH > 0) {
      /* Einpassen: so gross, wie das Fenster es erlaubt. Die Obergrenze
         von 2,5-fach haelt die Vergroesserung im Rahmen - das Original
         hat nur so viele Bildpunkte, wie es hat. */
      scale = Math.min(availW / img.naturalWidth, availH / img.naturalHeight, 2.5);
    }
    img.style.width = Math.max(1, Math.round(img.naturalWidth * scale)) + "px";
    img.style.height = "auto";
  }

  function updateMeta() {
    if (!meta) return;
    var size = "Original " + img.naturalWidth + " \u00d7 " + img.naturalHeight + " px";
    meta.textContent = lastLabel ? lastLabel + " \u00b7 " + size : size;
  }

  /* ---------- Tasten der Ansicht ----------
     Solange die Ansicht offen ist, gehoeren ihr diese Tasten:
       ESC   schliesst
       Tab   bleibt in der Ansicht
       Pfeil links/rechts  wuerde sonst in js/track.js den Abschnitt
                           weiterschalten (Seite springt hinter der
                           Ansicht weg)
       Pfeil hoch/runter, Bild auf/ab, Pos1/Ende  wuerden sonst die
                           Seite scrollen
     Senkrecht scrollen bleibt moeglich - aber in der Ansicht, nie auf
     der Seite. Die Leertaste bleibt bewusst unangetastet: sie gehoert
     den Knoepfen ("1 : 1", X). */
  var TASTEN = {
    ArrowLeft: "seite", ArrowRight: "seite",
    ArrowUp: "scroll", ArrowDown: "scroll",
    PageUp: "scroll", PageDown: "scroll", Home: "scroll", End: "scroll"
  };

  function onKeydown(e) {
    if (!isOpen) return;
    if (e.key === "Escape" || e.key === "Esc") {
      e.preventDefault(); e.stopImmediatePropagation(); close(); return;
    }
    if (e.key === "Tab") { trapTab(e); e.stopImmediatePropagation(); return; }
    var art = TASTEN[e.key];
    if (!art) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (art !== "scroll" || overlay.scrollHeight <= overlay.clientHeight) return;
    var runter = (e.key === "ArrowDown" || e.key === "PageDown" || e.key === "End");
    var weit = (e.key === "PageUp" || e.key === "PageDown") ? overlay.clientHeight * 0.9
             : (e.key === "Home" || e.key === "End") ? overlay.scrollHeight
             : 60;
    overlay.scrollTop += (runter ? weit : -weit);
  }

  /* ---------- Fokus in der Ansicht halten ----------
     Ueber das ganze Overlay, nicht nur ueber die Bildflaeche: die Knoepfe
     in der Leiste ("1 : 1" und X) liegen ausserhalb des Bildes und waeren
     sonst mit der Tabulatortaste nicht mehr erreichbar. */
  function trapTab(e) {
    var nodes = overlay.querySelectorAll("a[href], button:not([disabled])");
    var list = Array.prototype.filter.call(nodes, function (el) { return el.offsetParent !== null; });
    if (!list.length) return;
    var first = list[0], last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function boot() { init(); }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
