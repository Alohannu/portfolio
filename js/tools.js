/* ==========================================================================
   Tool-Pillen: Klick oeffnet einen Tooltip mit Einsatz-Infos

   Die Pillen in den Collage-Koepfen (css/collage.css) sind Knoepfe. Ein
   Klick oeffnet einen kleinen Tooltip mit einer kurzen Beschreibung,
   wofuer Tool bzw. Modell im Projekt verwendet wurde.

   Der Tooltip ist KEIN Modal: das <dialog> wird mit show() statt
   showModal() geoeffnet, hat also keinen Backdrop und dunkelt die Seite
   nicht ab. Er haengt als position: fixed an der Zeigerposition des
   Klicks (obere linke Ecke TIP_GAP neben dem Zeiger) und wird an den
   Fensterraendern nach innen geklappt (css/tools.css).

   Ausserdem haengen hier die Hinweise auf die beiden klickbaren Gruppen
   (Phasen-Tabs und Tool-Pillen): dezentes Pulsieren plus Sprechblase,
   solange in der Gruppe noch nichts angeklickt wurde (Stile in
   css/hints.css).

   Die beiden Blasen verhalten sich unterschiedlich:
     Phasen-Tabs - bleiben stehen, bis wirklich eine Phase angeklickt
                   wurde, und erscheinen nach jedem Laden neu. Sie sind
                   die einzige Erklaerung fuer die sechs Knoepfe; laufen
                   sie nach ein paar Sekunden ab, bleibt nur ein Puls
                   ohne Text und niemand weiss, was sich hier klicken
                   laesst.
     Tool-Pillen - wie bisher einmalig pro Sitzung (nach 8s oder nach dem
                   ersten Klick weg, sessionStorage merkt sich das).

   Texte: TOOLS unten, je Tool deutsch und englisch. Die Texte sind bewusst
   als Sachebeschreibung des Arbeitsablaufs formuliert und duerfen gern
   projektspezifisch ersetzt werden - sie stehen an genau einer Stelle.
   ========================================================================== */
(function () {
  "use strict";

  var TOOLS = {
    "ChatGPT": {
      de: "Konzeption, Prompt-Skripte und Textarbeit: Ideen sammeln, Prompts schärfen, Copy in Ton und Länge des Projekts bringen. Außerdem als Sparringspartner für Bild- und Videoideen, bevor die eigentliche Produktion startete.",
      en: "Concept, prompt scripts and copywriting: collecting ideas, sharpening prompts, shaping text to the tone and length of the project. Also used as a sparring partner for image and video ideas before production started."
    },
    "Midjourney": {
      de: "Bildgenerierung für Moodboards und erste Motiventwürfe. Mit Referenzbildern, Stil-Keywords und mehreren Durchläufen auf den Marken-Look getrimmt; die Auswahl wurde später animiert oder weiter bearbeitet.",
      en: "Image generation for moodboards and first motif drafts. Tuned to the brand look with reference images, style keywords and several passes; the selected motifs were later animated or retouched."
    },
    "Nano Banana": {
      de: "Schnelle Bilditeration und Compositing: Varianten, Retusche und Details - vor allem für Motive, die exakt an eine Vorlage anschließen mussten (gleiche Pose, gleiches Licht, gleiches Produkt).",
      en: "Fast image iteration and compositing: variations, retouching and details - especially for motifs that had to match an existing reference exactly (same pose, same lighting, same product)."
    },
    "Suno": {
      de: "Musikgenerierung: Instrumentals und Tracks für Kampagnenfilm und Social Assets, mit eigenen Vorgaben zu Stil, Tempo und Aufbau.",
      en: "Music generation: instrumentals and tracks for the campaign film and social assets, with custom direction on style, tempo and structure."
    },
    "ElevenLabs": {
      de: "Voiceover, Voice-Design und Sprachfassungen. Auch für Scratch-Stimmen im Rohschnitt, bevor der finale Take saß.",
      en: "Voiceover, voice design and language versions. Also used for scratch voices in the rough cut before the final take was locked."
    },
    "RunwayML": {
      de: "Videogenerierung aus Standbildern: Image-to-Video, Kamerafahrten und Materialwechsel für den Fashion Film.",
      en: "Video generation from stills: image-to-video, camera moves and material changes for the fashion film."
    },
    "Seedance": {
      de: "Kurze Bewegtbild-Sequenzen aus Referenzbildern - vor allem für schnelle Test-Animationen und Social-Crops.",
      en: "Short motion sequences from reference images - mainly for fast test animations and social crops."
    },
    "Adobe Premiere Pro": {
      de: "Schnitt, Ton, Farbkorrektur und Export des Fashion Films: Timing zwischen den generierten Clips, Übergänge, Sound-Layout.",
      en: "Editing, sound, color grading and export of the fashion film: timing between generated clips, transitions, sound layout."
    },
    "CapCut": {
      de: "Schnelle Cuts, Social-Formate, Untertitel und 9:16-Versionen für Reels und TikTok.",
      en: "Fast cuts, social formats, subtitles and 9:16 versions for reels and TikTok."
    }
  };

  /* Abstand der Tooltip-Ecke zum Zeiger bzw. Mindestabstand zum Rand (px).
     Die Werte spiegeln die Vorgabe: ~10px Abstand zum Zeiger, nie halb
     ausserhalb des Fensters. */
  var TIP_GAP = 10;
  var TIP_EDGE = 8;

  var isEn = document.documentElement.lang === "en";
  var dialog = null;
  var nameEl = null;
  var roleEl = null;
  var textEl = null;
  var lastTrigger = null;
  var bound = false;

  function t(de, en) { return isEn ? en : de; }

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  /* ---------- Tooltip aufbauen ---------- */

  function buildDialog() {
    if (dialog) return dialog;

    dialog = document.createElement("dialog");
    dialog.className = "tool-dialog";
    dialog.setAttribute("aria-labelledby", "toolDialogName");
    /* Programmatisch fokussierbar: nach show() liegt der Fokus auf dem
       Tooltip selbst (nicht auf dem Schliessen-Knopf), damit Esc und
       Tab sinnvoll funktionieren. */
    dialog.setAttribute("tabindex", "-1");

    var inner = document.createElement("div");
    inner.className = "tool-dialog__inner";

    var bar = document.createElement("div");
    bar.className = "tool-dialog__bar";

    var kicker = document.createElement("p");
    kicker.className = "tool-dialog__kicker";
    kicker.textContent = t("Eingesetztes Tool", "Tool used");

    var close = document.createElement("button");
    close.type = "button";
    close.className = "tool-dialog__close";
    close.setAttribute("aria-label", t("Dialog schließen", "Close dialog"));
    close.innerHTML = "&times;";
    close.addEventListener("click", function () { closeTip(); });

    bar.appendChild(kicker);
    bar.appendChild(close);

    nameEl = document.createElement("h2");
    nameEl.className = "tool-dialog__name";
    nameEl.id = "toolDialogName";

    roleEl = document.createElement("p");
    roleEl.className = "tool-dialog__role";

    textEl = document.createElement("p");
    textEl.className = "tool-dialog__text";

    var foot = document.createElement("p");
    foot.className = "tool-dialog__foot";
    foot.textContent = t("Projekt: kampagnenmotive / e-commerce / UGC",
                         "Project: campaign visuals / e-commerce / UGC");

    inner.appendChild(bar);
    inner.appendChild(nameEl);
    inner.appendChild(roleEl);
    inner.appendChild(textEl);
    inner.appendChild(foot);
    dialog.appendChild(inner);

    /* Fokus zurueck auf die Pille, aus der der Tooltip geoeffnet wurde.
       preventScroll: der Fokus soll die Seite nicht verschieben. */
    dialog.addEventListener("close", function () {
      if (lastTrigger && lastTrigger.focus) lastTrigger.focus({ preventScroll: true });
    });

    document.body.appendChild(dialog);
    return dialog;
  }

  /* ---------- Position: Tooltip am Zeiger ---------- */

  /* Touch-Geraete (und Tastatur-Aktivierung) haben keinen echten Zeiger:
     dort wird der Tooltip unter der Pille ausgerichtet, linksbuendig. */
  function isPointerless(e) {
    if (e && e.pointerType) return e.pointerType === "touch" || e.pointerType === "pen";
    return window.matchMedia("(hover: none)").matches;
  }

  /* Tastatur-Klick (Enter/Leertaste) hat keine Zeigerkoordinaten. */
  function isKeyboardClick(e) {
    return !e || (e.detail === 0 && e.clientX === 0 && e.clientY === 0);
  }

  function anchorFor(pill, e) {
    if (isPointerless(e) || isKeyboardClick(e)) {
      return { touch: true, rect: pill.getBoundingClientRect() };
    }
    return { touch: false, x: e.clientX, y: e.clientY };
  }

  /* Setzt left/top und den Ursprung der Einblendung. Gerechnet wird in
     Fensterkoordinaten (position: fixed), also mit clientX/clientY des
     Klicks. */
  function place(anchor) {
    var w = dialog.offsetWidth;
    var h = dialog.offsetHeight;
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var left, top, ox, oy;

    if (anchor.touch) {
      var r = anchor.rect;
      left = r.left;
      top = r.bottom + TIP_GAP;
      /* Unten kein Platz: ueber die Pille spiegeln. */
      if (top + h > vh - TIP_EDGE) top = r.top - TIP_GAP - h;
      ox = "0%";
      oy = top < r.top ? "100%" : "0%";
    } else {
      /* Obere linke Ecke neben dem Zeiger. */
      left = anchor.x + TIP_GAP;
      top = anchor.y + TIP_GAP;
      var flipX = false;
      var flipY = false;
      /* Rechts/Unten kein Platz: nach links/oben spiegeln. */
      if (left + w > vw - TIP_EDGE) { left = anchor.x - TIP_GAP - w; flipX = true; }
      if (top + h > vh - TIP_EDGE) { top = anchor.y - TIP_GAP - h; flipY = true; }
      ox = flipX ? "100%" : "0%";
      oy = flipY ? "100%" : "0%";
    }

    /* Letzte Sicherung: nie halb ausserhalb des Fensters. */
    left = clamp(left, TIP_EDGE, Math.max(TIP_EDGE, vw - w - TIP_EDGE));
    top = clamp(top, TIP_EDGE, Math.max(TIP_EDGE, vh - h - TIP_EDGE));

    dialog.style.left = Math.round(left) + "px";
    dialog.style.top = Math.round(top) + "px";
    dialog.style.transformOrigin = ox + " " + oy;
  }

  /* ---------- Oeffnen / Schliessen ---------- */

  function closeTip() {
    if (!dialog || !dialog.open) return;
    dialog.close();
    unbindGlobal();
  }

  function onDocPointerDown(e) {
    if (!dialog || !dialog.open) return;
    var el = e.target;
    if (el && el.nodeType === 1 && dialog.contains(el)) return;
    /* Klick auf eine andere Pille: der Tooltip wandert nur mit, statt
       zuzuklappen und neu aufzugehen. */
    if (el && el.closest && el.closest(".collage__tools .collage__tool[data-tool]")) return;
    closeTip();
  }

  function onKeyDown(e) {
    if (e.key === "Escape" || e.key === "Esc") {
      e.preventDefault();
      closeTip();
    }
  }

  function onScroll(e) {
    /* Scrollen im Tooltip selbst (langer Text) soll ihn nicht schliessen. */
    if (dialog && e.target && e.target.nodeType === 1 && dialog.contains(e.target)) return;
    closeTip();
  }

  function onResize() { closeTip(); }

  function bindGlobal() {
    if (bound) return;
    bound = true;
    document.addEventListener("pointerdown", onDocPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", onResize);
  }

  function unbindGlobal() {
    if (!bound) return;
    bound = false;
    document.removeEventListener("pointerdown", onDocPointerDown, true);
    document.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("scroll", onScroll, { capture: true });
    window.removeEventListener("resize", onResize);
  }

  function roleOf(pill) {
    var row = pill.closest(".collage__toolrow");
    var use = row ? row.querySelector(".collage__tooluse") : null;
    return use ? use.textContent.replace(/\s+/g, " ").trim() : "";
  }

  function openFor(pill, e) {
    var name = pill.getAttribute("data-tool") || pill.textContent.trim();
    var entry = TOOLS[name];
    buildDialog();
    lastTrigger = pill;
    nameEl.textContent = name;
    roleEl.textContent = roleOf(pill);
    textEl.textContent = entry ? (isEn ? entry.en : entry.de)
                               : t("Für dieses Tool ist noch keine Notiz hinterlegt.",
                                   "No note has been added for this tool yet.");

    /* Erst auf 0/0 stellen: show() fokussiert den Tooltip, und ohne feste
       Position wuerde der Browser zur statischen Position scrollen. */
    dialog.style.left = "0px";
    dialog.style.top = "0px";

    if (!dialog.open) dialog.show();
    if (dialog.focus) dialog.focus({ preventScroll: true });
    place(anchorFor(pill, e));
    bindGlobal();
  }

  /* ---------- Hinweise auf klickbare Gruppen ----------
     Solange in einer Gruppe noch nichts angeklickt wurde, pulsiert sie
     dezent und dazu steht eine kleine Sprechblase: bei den Phasen-Tabs
     UNTER der Pille, weil darueber der Titel "ai solution" steht, bei den
     Tool-Zeilen darueber (css/hints.css: .hint-bubble--phases bzw.
     .hint-bubble--tools).

     Zwei Verhaltensweisen, je Hinweis in HINTS gesetzt:
       sticky - Blase und Puls bleiben stehen, bis in der Gruppe geklickt
                wurde. Kein Timeout, kein Sitzungs-Gedaechtnis: nach jedem
                Laden ist der Hinweis wieder da. Fuer die Phasen-Tabs die
                einzige Erklaerung, dass sich die sechs Knoepfe klicken
                lassen.
       sonst  - wie bisher einmalig pro Sitzung (sessionStorage):
                "clicked" - erster Klick war schon (kein Puls, keine Blase)
                "timeout" - Blase ist abgelaufen (keine Blase, Puls weiter)
     Der Puls endet mit dem ersten Klick in der Gruppe. */
  var HINT_TIMEOUT = 8000;

  var HINTS = [
    {
      id: "phases",
      key: "hint:phases",
      selector: ".phase-tabs",
      item: ".phase-tab",
      /* "center" richtet die Blase mittig aus; die Hoehe kommt aus
         .hint-bubble--phases (css/hints.css): unter der Tab-Leiste, damit
         der Titel "ai solution" darueber frei bleibt. */
      align: "center",
      sticky: true,
      de: "Klick auf eine Phase, um sie zu sehen",
      en: "Click a phase to view it"
    },
    {
      id: "tools",
      key: "hint:tools",
      selector: ".collage__tools",
      item: ".collage__tool",
      align: "end",
      de: "Klick für Infos",
      en: "Click for info"
    }
  ];

  function hintState(key) {
    try { return window.sessionStorage.getItem(key); } catch (err) { return null; }
  }

  function setHintState(key, value) {
    try { window.sessionStorage.setItem(key, value); } catch (err) { /* z.B. file:// */ }
  }

  function buildBubble(def, group) {
    var bubble = document.createElement("span");
    bubble.className = "hint-bubble hint-bubble--" + def.align + " hint-bubble--" + def.id;
    /* Reine Sicht-Hilfe: die Knoepfe selbst sind beschriftet. */
    bubble.setAttribute("aria-hidden", "true");
    bubble.textContent = isEn ? def.en : def.de;
    group.el.appendChild(bubble);
    return bubble;
  }

  function removeBubble(group) {
    if (group.bubble && group.bubble.parentNode) {
      group.bubble.parentNode.removeChild(group.bubble);
    }
    group.bubble = null;
  }

  /* Frist startet erst, wenn die Gruppe wirklich im Bild ist - sonst
     laeuft der Hinweis in einer Ansicht ab, die noch niemand gesehen hat. */
  function armTimer(group) {
    if (group.timer || group.done) return;
    group.timer = window.setTimeout(function () {
      group.timer = 0;
      if (group.done) return;
      setHintState(group.def.key, "timeout");
      removeBubble(group);
      /* Der Puls bleibt: er endet mit dem ersten Klick. */
    }, HINT_TIMEOUT);
  }

  /* Im Fenster? */
  function inViewport(el) {
    var r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < window.innerHeight &&
           r.right > 0 && r.left < window.innerWidth;
  }

  /* Wirklich sichtbar? Die Collage-Koepfe werden erst beim Scrollen
     eingeblendet (.fade-in ohne .is-visible hat opacity: 0). Ein Treffer
     im Fenster allein heisst also noch nicht, dass man den Hinweis sieht -
     deshalb wird die Kette der Elternelemente mitgeprueft. */
  function isRendered(el) {
    var n = el;
    while (n && n.nodeType === 1) {
      var cs = window.getComputedStyle(n);
      if (cs.display === "none" || cs.visibility === "hidden") return false;
      if (parseFloat(cs.opacity) < 0.05) return false;
      n = n.parentElement;
    }
    return true;
  }

  function watchVisible(groups) {
    var pending = groups.slice();
    var timer = 0;

    function stop() {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (timer) { window.clearTimeout(timer); timer = 0; }
    }

    function check() {
      timer = 0;
      var waiting = false;
      for (var i = pending.length - 1; i >= 0; i--) {
        var g = pending[i];
        if (g.done) { pending.splice(i, 1); continue; }
        if (!inViewport(g.el)) continue;
        if (isRendered(g.el)) {
          armTimer(g);
          pending.splice(i, 1);
        } else {
          waiting = true;
        }
      }
      if (!pending.length) { stop(); return; }
      /* Gruppe ist im Bild, aber noch nicht fertig eingeblendet: gleich
         noch einmal nachsehen - ein einzelner Treffer waehrend des
         Einblend-Uebergangs darf die Frist nicht verpassen. */
      if (waiting) timer = window.setTimeout(check, 400);
    }

    /* Kurz warten: das Einblenden der Collage-Koepfe laeuft selbst ueber
       den Scroll-Handler (js/collage.js) - kurz danach steht der Endwert. */
    function schedule() {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(check, 300);
    }

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    check();
  }

  function dismissHint(def, groups) {
    /* Sticky-Hinweise merken sich nichts: nach dem naechsten Laden steht
       die Blase wieder da (die Gruppe ist dann ja wieder unberuehrt). */
    if (!def.sticky) setHintState(def.key, "clicked");
    groups.forEach(function (g) {
      g.done = true;
      if (g.timer) { window.clearTimeout(g.timer); g.timer = 0; }
      removeBubble(g);
      g.el.classList.remove("is-hinting");
    });
  }

  function initHints() {
    HINTS.forEach(function (def) {
      var els = document.querySelectorAll(def.selector);
      if (!els.length) return;

      /* Sticky-Hinweise gelten pro Seitenaufruf, nicht pro Sitzung. */
      var state = def.sticky ? null : hintState(def.key);
      if (state === "clicked") return;

      var groups = [];
      Array.prototype.forEach.call(els, function (el) {
        var group = { def: def, el: el, bubble: null, timer: 0, done: false };
        el.classList.add("is-hinting");
        if (state !== "timeout") group.bubble = buildBubble(def, group);
        groups.push(group);
      });

      /* Erster Klick in der Gruppe erledigt den Hinweis. Der Schluessel
         gilt fuer alle Gruppen desselben Typs (Track 1 und 3 teilen sich
         "hint:tools"). */
      Array.prototype.forEach.call(els, function (el) {
        el.addEventListener("click", function (e) {
          var hit = e.target && e.target.closest ? e.target.closest(def.item) : null;
          if (hit && el.contains(hit)) dismissHint(def, groups);
        }, true);
      });

      /* Sticky: Blase und Puls bleiben stehen, bis geklickt wird - die
         8s-Frist und der Sichtbarkeits-Wecker entfallen. */
      if (def.sticky) return;

      if (state !== "timeout") watchVisible(groups);
    });
  }

  /* ---------- Start ---------- */

  function init() {
    var pills = document.querySelectorAll(".collage__tools .collage__tool[data-tool]");
    Array.prototype.forEach.call(pills, function (pill) {
      pill.addEventListener("click", function (e) {
        e.preventDefault();
        openFor(pill, e);
      });
    });

    initHints();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
