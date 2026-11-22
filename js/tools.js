/* ==========================================================================
   Tool-Pillen: Klick oeffnet einen Dialog mit Einsatz-Infos

   Die Pillen in den Collage-Köpfen (css/collage.css) sind Knoepfe. Ein
   Klick oeffnet ein <dialog> mit einer kurzen Beschreibung, wofür Tool
   bzw. Modell im Projekt verwendet wurde. Der Dialog wird erst beim
   ersten Klick gebaut (js/tools.js).

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

  var isEn = document.documentElement.lang === "en";
  var dialog = null;
  var nameEl = null;
  var roleEl = null;
  var textEl = null;
  var lastTrigger = null;

  function t(de, en) { return isEn ? en : de; }

  function buildDialog() {
    if (dialog) return dialog;

    dialog = document.createElement("dialog");
    dialog.className = "tool-dialog";
    dialog.setAttribute("aria-labelledby", "toolDialogName");

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
    close.addEventListener("click", function () { dialog.close(); });

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

    /* Klick auf den Hintergrund schliesst - der Klick landet dann auf
       dem <dialog>-Element selbst, nicht auf dem Inhalt. */
    dialog.addEventListener("click", function (e) {
      if (e.target === dialog) dialog.close();
    });

    /* Fokus zurück auf die Pille, aus der der Dialog geöffnet wurde. */
    dialog.addEventListener("close", function () {
      if (lastTrigger && lastTrigger.focus) lastTrigger.focus({ preventScroll: true });
    });

    document.body.appendChild(dialog);
    return dialog;
  }

  function roleOf(pill) {
    var row = pill.closest(".collage__toolrow");
    var use = row ? row.querySelector(".collage__tooluse") : null;
    return use ? use.textContent.replace(/\s+/g, " ").trim() : "";
  }

  function openFor(pill) {
    var name = pill.getAttribute("data-tool") || pill.textContent.trim();
    var entry = TOOLS[name];
    buildDialog();
    lastTrigger = pill;
    nameEl.textContent = name;
    roleEl.textContent = roleOf(pill);
    textEl.textContent = entry ? (isEn ? entry.en : entry.de)
                               : t("Für dieses Tool ist noch keine Notiz hinterlegt.",
                                   "No note has been added for this tool yet.");
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function init() {
    var pills = document.querySelectorAll(".collage__tools .collage__tool[data-tool]");
    if (!pills.length) return;

    Array.prototype.forEach.call(pills, function (pill) {
      pill.addEventListener("click", function (e) {
        e.preventDefault();
        openFor(pill);
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();