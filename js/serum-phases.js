/* ==========================================================================
   Projekt 2: "ai solution" - Produktentwicklung in sechs Phasen

   Inhalte und Aufbau stammen 1:1 aus dem Original
   (https://yytrieu.github.io/ai-portfolio/#serum). Dort lagen die Phasen
   in einem Vollbild-Overlay und wurden ueber Pill-Buttons umgeschaltet.

   Hier steht derselbe Bereich als normaler Abschnitt im Track. Das
   Umschalten laeuft weiterhin per Klick - NICHT per Scrollen. Deshalb
   braucht die Section keine Scrollstrecke und ist nur so hoch wie ihr
   Inhalt (siehe .p2-phases in track.css).

   Oeffentliche API: window.SerumPhases.init()
   ========================================================================== */
(function () {
  "use strict";

  /* Die elf Bilder liegen lokal unter media/selected-works/phases/.
     Dateinamen wie im Original belassen, damit der Abgleich mit der
     Quelle trivial bleibt. */
  var BASE = "media/selected-works/phases/";

  /* Phasendaten 1:1 aus dem Original. "single: true" bedeutet: nur EIN
     breites Bild statt des Paares (Phase 4).

     Die Alt-Texte sind hier neu: das Original rendert die Bilder als
     CSS-background-image auf leeren divs und hat daher gar keine
     Alt-Texte. Diese Seite nutzt sonst durchgehend beschreibende
     deutsche Alt-Texte, deshalb echte <img> mit Alt-Text. */
  var PHASES = [
    {
      heading: "Phase 1 \u2013 Erste Ideengenerierung",
      imgL: { src: "produktentwicklung-phase1-2.avif", alt: "Serum-Flaschen mit Tropfer, der in eine aufspritzende Fl\u00fcssigkeit eintaucht" },
      imgR: { src: "produktentwicklung-phase1.avif", alt: "Glasflasche mit rosa Kappe und transparentem Serum vor wei\u00dfem Hintergrund" },
      rows: [
        { label: "Tool", text: "ChatGPT" },
        { label: "The Mission", text: "Brainstorming des Verpackungsdesigns & erste Formfindung." },
        { label: "The Pain Point", text: "Mangelnde Materialtiefe. Trotz mehrfacher Prompt-Iterationen wird der gew\u00fcnschte \u201eGlossy Wax\u201c-Effekt nicht physisch korrekt dargestellt. Die Reflexionen auf dem Glas wirken flach, k\u00fcnstlich und unpr\u00e4zise." }
      ]
    },
    {
      heading: "Phase 2 \u2013 Der visuelle Durchbruch",
      imgL: { src: "produktentwicklung-phase2-2.avif", alt: "Serum-Fl\u00e4schchen mit transparentem Glas und heller Kappe auf grauem Grund" },
      imgR: { src: "produktentwicklung-phase2-1.avif", alt: "Glasflasche, deren wei\u00dfe Glasur als gl\u00e4nzender Wax-Effekt \u00fcber den Flaschenk\u00f6rper l\u00e4uft" },
      rows: [
        { label: "Tool", text: "Midjourney v7" },
        { label: "The Action", text: "\u00dcbertrag der textlichen ChatGPT-Konzepte in einen Midjourney-Prompt." },
        { label: "The Gain", text: "Physikalischer Realismus. Der anspruchsvolle \u201eGlossy Wax\u201c-Effekt wird fehlerfrei \u00fcbersetzt \u2013 inklusive fotorealistischer Lichtbrechung." }
      ]
    },
    {
      heading: "Phase 3 \u2013 Die Proportions-Anpassung",
      imgL: { src: "produktentwicklung-phase3-2.avif", alt: "Schmale Serumflasche mit rosa Tropferkappe, Proportionen schlank und hoch" },
      imgR: { src: "produktentwicklung-phase3-1.avif", alt: "Dieselbe Flasche mit angepassten Proportionen, breiterer K\u00f6rper und Wax-\u00dcberzug" },
      rows: [
        { label: "Tool", text: "ChatGPT" },
        { label: "The Action", text: "Re-Import des Midjourney-Renderings in ChatGPT, um die geometrischen Proportionen der Flasche schnell zu testen." },
        { label: "The Gain", text: "Ressourceneffizienz. Schnelle Iterationsschleifen, ohne wertvolle Credits in Midjourney f\u00fcr einfache geometrische Verschiebungen aufzubrauchen." }
      ]
    },
    {
      heading: "Phase 4 \u2013 Entwicklung von Variationen",
      single: true,
      imgL: { src: "produktentwicklung-phase4.avif", alt: "F\u00fcnf Serumflaschen in einer Reihe: Satin Sand, Brushed Champagne, Soft Mist, Gunmetal und Pearl Blush" },
      rows: [
        { label: "Tool", text: "ChatGPT" },
        { label: "The Action", text: "KI-gest\u00fctzte Exploration alternativer Design-Varianten basierend auf der bereinigten Bildreferenz aus Phase 3." },
        { label: "The Gain", text: "Kreative Breite. Schnelle Erstellung einer kontrastreichen Palette." }
      ]
    },
    {
      heading: "Phase 5 \u2013 Produktisolierung & Detail-Feinschliff",
      imgL: { src: "produktentwicklung-phase5-2.avif", alt: "Einzelne Serumflasche mit dunkler Metallkappe und gr\u00fcner F\u00fcllung" },
      imgR: { src: "produktentwicklung-phase5-1.avif", alt: "Serumflasche in Gunmetal-Optik mit mattem Metallfinish und gr\u00fcner Fl\u00fcssigkeit" },
      rows: [
        { label: "Tool", text: "ChatGPT" },
        { label: "The Action", text: "Fokussierung auf einen ausgew\u00e4hlten Design-Favoriten. Gezielte Materialkorrektur des Serum-Spenders (Wechsel von hartem Plastik zu einem edlen, matten Rubber-Material)." }
      ]
    },
    {
      heading: "Phase 6 \u2013 Der finale Produkt-Shot",
      imgL: { src: "produktentwicklung-phase6-2.avif", alt: "Screenshot eines Midjourney-Prompts mit Referenzbildern und Parametern chaos 20, ar 4:5, raw, v7" },
      imgR: { src: "produktentwicklung-phase6-1.avif", alt: "Finaler Produktshot: Serumflasche mit gr\u00fcner Fl\u00fcssigkeit auf wei\u00dfem Sockel" },
      rows: [
        { label: "Tool", text: "Midjourney v7" },
        { label: "The Action", text: "Finales High-End-Rendering in Midjourney unter Verwendung des Entwurfs aus Phase 5 und weiterer KI-generierter Mood-Bilder als pr\u00e4zise Bild- und Stilreferenz." },
        { label: "The Gain", text: "High-Fashion-\u00c4sthetik." }
      ]
    }
  ];

  /* Englische Texte fuer index-engl.html (<html lang="en">): ueberschreiben
     Ueberschrift und Textzeilen je Phase; Bilder und Tool-Zeilen bleiben. */
  var EN = [
    { heading: "Phase 1 – Initial Concept Development",
      rows: { 1: "Brainstorm the packaging concept and explore initial shapes.",
              2: "Limited material realism. Even after several prompt iterations, the desired “glossy wax” effect lacked depth. The glass reflections felt flat, artificial, and imprecise." } },
    { heading: "Phase 2 – Visual Breakthrough",
      rows: { 1: "Turned the initial ChatGPT concepts into a focused Midjourney prompt.",
              2: "A major improvement in material and lighting realism. The “glossy wax” effect translated convincingly, with realistic reflections and light refraction." } },
    { heading: "Phase 3 – Refining Proportions",
      rows: { 1: "Brought the Midjourney render back into ChatGPT to quickly test and adjust the bottle proportions.",
              2: "Faster iteration without using Midjourney credits on simple geometric changes." } },
    { heading: "Phase 4 – Exploring Variations",
      rows: { 1: "Used the refined image from Phase 3 to explore alternative design directions.",
              2: "Quickly developed a broader range of visually distinct concepts." } },
    { heading: "Phase 5 – Product Isolation & Detail Refinement",
      rows: { 1: "Selected the strongest direction and refined individual product details, including changing the serum dispenser from hard plastic to a premium matte rubber finish." } },
    { heading: "Phase 6 – Final Product Shot",
      rows: { 1: "Created the final high-end render using the Phase 5 design alongside AI-generated mood imagery as visual and style references.",
              2: "A polished, high-fashion product aesthetic." } }
  ];
  if (document.documentElement.lang === "en") {
    EN.forEach(function (t, i) {
      PHASES[i].heading = t.heading;
      Object.keys(t.rows).forEach(function (k) { PHASES[i].rows[k].text = t.rows[k]; });
    });
  }

  function el(tag, className) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    return n;
  }

  /* Baut ein <img> mit festen Massen. width/height entsprechen den
     Originaldateien (Paar: 360x554 bzw. 444x554, Einzelbild: 804x499),
     damit der Browser vor dem Laden Platz reservieren kann und beim
     Umschalten nichts springt.

     loading="eager": die Bilder werden beim Umschalten neu erzeugt. Mit
     loading="lazy" entscheidet der Browser erst nach dem Einfuegen, ob
     das Bild im Viewport liegt - gemessen blieben die Bilder der Phasen
     2-6 dabei ungeladen (naturalWidth 0, complete false), das Panel war
     nach dem Klick leer. Die Dateien sind klein (2-15 kB), eager ist hier
     also unproblematisch. */
  function makeImage(spec, w, h) {
    var img = document.createElement("img");
    img.src = BASE + spec.src;
    img.alt = spec.alt;
    img.width = w;
    img.height = h;
    img.loading = "eager";
    img.decoding = "async";
    return img;
  }

  function renderMedia(host, phase) {
    host.textContent = "";
    if (phase.single) {
      var single = el("div", "phase-media__single");
      single.appendChild(makeImage(phase.imgL, 804, 499));
      host.appendChild(single);
      return;
    }
    // Paar: links schmal (360), rechts breit (444) - wie im Original.
    var pair = el("div", "phase-media__pair");
    pair.appendChild(makeImage(phase.imgL, 360, 554));
    pair.appendChild(makeImage(phase.imgR, 444, 554));
    host.appendChild(pair);
  }

  function renderRows(host, phase) {
    host.textContent = "";
    phase.rows.forEach(function (row) {
      var box = el("div", "phase-row");
      var label = el("span", "phase-row__label");
      label.textContent = row.label;
      var text = el("p", "phase-row__text");
      text.textContent = row.text;
      box.appendChild(label);
      box.appendChild(text);
      host.appendChild(box);
    });
  }

  function init() {
    var section = document.querySelector(".p2-phases");
    if (!section) return null;

    var tabs = Array.prototype.slice.call(section.querySelectorAll(".phase-tab"));
    var panel = section.querySelector("#phasePanel");
    var heading = section.querySelector("#phaseHeading");
    var media = section.querySelector("#phaseMedia");
    var rows = section.querySelector("#phaseRows");
    if (!tabs.length || !panel || !heading || !media || !rows) return null;

    var active = 0;

    function show(index) {
      var phase = PHASES[index];
      if (!phase) return;
      active = index;

      heading.textContent = phase.heading;
      renderMedia(media, phase);
      renderRows(rows, phase);

      tabs.forEach(function (tab, n) {
        var on = n === index;
        tab.classList.toggle("is-active", on);
        tab.setAttribute("aria-selected", on ? "true" : "false");
        // Nur der aktive Tab ist per Tab-Taste erreichbar; die anderen
        // erreicht man mit den Pfeiltasten (tablist-Muster).
        tab.tabIndex = on ? 0 : -1;
      });
      panel.setAttribute("aria-labelledby", tabs[index].id);
    }

    tabs.forEach(function (tab, n) {
      tab.addEventListener("click", function () { show(n); });
      tab.addEventListener("keydown", function (e) {
        var next = null;
        if (e.key === "ArrowRight") next = (n + 1) % tabs.length;
        else if (e.key === "ArrowLeft") next = (n - 1 + tabs.length) % tabs.length;
        else if (e.key === "Home") next = 0;
        else if (e.key === "End") next = tabs.length - 1;
        if (next === null) return;
        e.preventDefault();
        show(next);
        tabs[next].focus();
      });
    });

    show(0);
    return { show: show, get active() { return active; } };
  }

  window.SerumPhases = { init: init, PHASES: PHASES };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
