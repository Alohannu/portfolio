/*!
 * nodeview.js – Framework-freier Renderer für die ComfyUI-Node-Ansicht
 * Vorlage: https://yytrieu.github.io/ai-portfolio/#comfyui
 *
 * Zustandslos & kapselnd: rendert nur in den übergebenen Container, alle CSS-Regeln
 * sind unter `.nv-root` gescoped, kein DOM-Lookup per globalem Selektor, kein React.
 *
 *   <div id="comfy-slot"></div>
 *   <script src="nodeview.js"></script>
 *   <script>
 *     fetch('/context/nodeview.json').then(r => r.json())
 *       .then(data => NodeView.renderNodeView(document.querySelector('#comfy-slot'), data, {
 *         assetBase: '/assets/',          // Bilder liegen als assets/comfy-*.avif
 *         canvasHeight: 'min(72vh, 720px)'
 *       }));
 *   </script>
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NodeView = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var SVGNS = 'http://www.w3.org/2000/svg';
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ---------------------------------------------------------------------------
   * CSS – wird pro Container als <style> injiziert, damit keine Host-CSS-Datei
   * gepflegt werden muss. Alle Regeln greifen nur unter `.nv-root`.
   * Theme-Farben kommen aus data.theme als CSS-Variablen (--nv-*).
   * ------------------------------------------------------------------------- */
  var BASE_CSS = [
    '.nv-root, .nv-root *{box-sizing:border-box}',
    '.nv-root{position:relative;font-family:Jost,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--nv-text-color)}',
    '.nv-root .nv-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}',
    '.nv-root .nv-lede{margin:0 0 24px;max-width:820px;font-size:clamp(14px,1.2vw,17px);line-height:1.6;font-weight:300;color:var(--nv-lede-color);text-wrap:pretty}',
    '.nv-root .nv-editor{border:1px solid #1c1c26;border-radius:14px;overflow:hidden;background:var(--nv-bg);box-shadow:0 30px 80px -40px rgba(10,10,15,.6)}',
    '.nv-root .nv-bar{display:flex;align-items:center;flex-wrap:wrap;gap:10px 18px;padding:12px 16px;background:var(--nv-bar-bg);border-bottom:1px solid var(--nv-bar-border)}',
    '.nv-root .nv-bar-title{display:flex;align-items:center;gap:8px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#e7e7f2}',
    '.nv-root .nv-bar-dot{width:9px;height:9px;border-radius:50%;background:var(--nv-accent);box-shadow:0 0 10px var(--nv-accent)}',
    '.nv-root .nv-zoom{display:flex;align-items:center;gap:6px;margin-left:auto}',
    '.nv-root .nv-zoom button{border:1px solid #2c2c3a;background:#16161f;color:#cfcfe8;border-radius:6px;padding:4px 10px;cursor:pointer;font:inherit;font-size:12px;line-height:1.4}',
    '.nv-root .nv-zoom button:hover,.nv-root .nv-zoom button:focus-visible{background:#22222e;outline:none;border-color:#3a3a4d}',
    '.nv-root .nv-pct{min-width:44px;text-align:center;font-size:11px;color:#9c9cb5}',
    '.nv-root .nv-canvas{position:relative;height:var(--nv-canvas-h);overflow:auto;cursor:grab;background:var(--nv-bg);background-image:radial-gradient(circle,var(--nv-dot) 1px,transparent 1.4px);background-size:var(--nv-dot-size) var(--nv-dot-size)}',
    '.nv-root .nv-canvas.is-panning{cursor:grabbing;user-select:none}',
    '.nv-root .nv-stage{position:relative}',
    '.nv-root .nv-inner{position:absolute;left:0;top:0;transform-origin:0 0}',
    '.nv-root .nv-wires{position:absolute;inset:0;pointer-events:none;overflow:visible}',
    '.nv-root .nv-group{position:absolute;border:1px solid var(--nv-group-border);border-radius:10px;background:var(--nv-group-bg)}',
    '.nv-root .nv-group>span{position:absolute;left:14px;top:-11px;padding:2px 8px;border-radius:5px;background:var(--nv-group-label-bg);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--nv-group-label)}',
    '.nv-root .nv-node{position:absolute;border-radius:var(--nv-node-radius);overflow:hidden;background:var(--nv-node-bg);-webkit-backdrop-filter:var(--nv-node-blur);backdrop-filter:var(--nv-node-blur);border:1px solid var(--nv-node-border);box-shadow:0 12px 30px -18px rgba(0,0,0,.9);transition:box-shadow .25s ease,border-color .25s ease}',
    '.nv-root .nv-node:hover{border-color:rgba(255,255,255,.22);box-shadow:0 16px 34px -16px rgba(0,0,0,1)}',
    '.nv-root .nv-head{display:flex;align-items:center;gap:8px;padding:8px 11px;background:var(--nv-head-bg);border-bottom:1px solid rgba(255,255,255,.06)}',
    '.nv-root .nv-acc{width:7px;height:7px;border-radius:50%;flex:none}',
    '.nv-root .nv-title{font-size:11px;font-weight:600;letter-spacing:.02em;color:var(--nv-title);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.nv-root .nv-body{padding:8px 0 10px}',
    '.nv-root .nv-io{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:2px 11px;min-height:16px}',
    '.nv-root .nv-io>div{display:flex;align-items:center;gap:6px;min-width:0}',
    '.nv-root .nv-pin{width:7px;height:7px;border-radius:50%;flex:none}',
    '.nv-root .nv-pin.in{margin-left:-15px}',
    '.nv-root .nv-pin.out{margin-right:-15px}',
    '.nv-root .nv-in-name{font-size:10px;color:#9c9cb5}',
    '.nv-root .nv-out-name{font-size:10px;letter-spacing:.06em;color:#c8c8dd}',
    '.nv-root .nv-widget{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:5px 9px 0;padding:4px 9px;border-radius:999px;background:var(--nv-widget-bg);border:1px solid rgba(255,255,255,.06);font-size:10px}',
    '.nv-root .nv-widget .k{color:var(--nv-widget-key);white-space:nowrap}',
    '.nv-root .nv-widget .v{color:var(--nv-widget-value);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.nv-root .nv-text{margin:6px 9px 0;padding:7px 9px;border-radius:6px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06);font-size:9.5px;line-height:1.45;color:#c3c3d8;overflow:hidden}',
    /* height:auto ist noetig, seit die Bilder width/height-Attribute tragen:
       die Attribute liefern nur das Seitenverhaeltnis als Platzhalter, ohne
       height:auto pinnt das height-Attribut aber die Naturhoehe (727px) und
       object-fit:fill zieht das Bild auf das Dreifache in die Laenge. */
    '.nv-root .nv-img{width:calc(100% - 16px);height:auto;margin:6px 8px 0;display:block;border-radius:4px;background:#0e0e15}',
    /* Das Ergebnisbild des Graphen ist anklickbar: es oeffnet dieselbe
       Datei in der Grossansicht (js/imageviewer.js, Delegation auf
       [data-viewer-src]). Der Knopf liegt genau dort, wo sonst das Bild
       steht, damit sich am Aufbau des Knotens nichts aendert. */
    '.nv-root .nv-img-btn{position:relative;display:block;width:100%;margin:0;padding:0;border:0;background:none;font:inherit;color:inherit;cursor:zoom-in}',
    '.nv-root .nv-img-btn:focus-visible{outline:2px solid #fff;outline-offset:2px;border-radius:6px}',
    '.nv-root .nv-img-btn::after{content:"";position:absolute;left:50%;top:50%;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;background:rgba(0,0,0,.55) url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23fff\' stroke-width=\'2\' stroke-linecap=\'round\'%3E%3Ccircle cx=\'10.5\' cy=\'10.5\' r=\'6.5\'/%3E%3Cpath d=\'M20 20l-4.8-4.8M10.5 7.5v6M7.5 10.5h6\'/%3E%3C/svg%3E") center / 22px 22px no-repeat;opacity:0;transform:scale(.85);transition:opacity .25s ease,transform .25s ease;pointer-events:none}',
    '.nv-root .nv-img-btn:hover::after,.nv-root .nv-img-btn:focus-visible::after{opacity:1;transform:scale(1)}',
    /* Hinweiszeile unter dem Bild: sie sitzt am unteren Knotenrand und ist
       damit auch dann zu sehen, wenn der Canvas nur den unteren Teil des
       Knotens zeigt. Der Zeiger allein (zoom-in) ist zu leise. */
    '.nv-root .nv-hint{display:block;margin:5px 8px 0;font-size:9px;letter-spacing:.08em;text-transform:uppercase;text-align:center;color:#9fb4ff}',
    '.nv-root .nv-img-btn:hover .nv-hint,.nv-root .nv-img-btn:focus-visible .nv-hint{color:#fff}',
    '.nv-root .nv-caption{text-align:center;font-size:9px;color:#8b8ba6;margin-top:4px}',
    /* Notiz-Knoten: er traegt die Ueberschrift der Sektion IM Graphen, statt als
       HTML darueber zu stehen - so gehoert der Text sichtbar zum Workflow und
       wird mit ihm geschoben und gezoomt.
       Die Schriftgroesse der Ueberschrift ist bewusst in festen px angegeben
       (kein clamp/vw): die Notiz liegt im per transform skalierten Canvas, ihre
       Groesse muss also deterministisch sein und darf nicht zusaetzlich an der
       Viewport-Breite haengen. Die Hoehe bleibt auto (kein fester Wert), damit
       der Text nicht abgeschnitten wird.
       Schrift: der Knoten traegt .nv-mono (ComfyUI-Look der Kopfzeile), damit
       wuerden Ueberschrift und Text die Monospace-Schrift erben. Beide setzen
       deshalb ausdruecklich die Seiten-Schrift (.nv-root) - die Vorlage zeigt
       den Fliesstext in Jost, nur die Kopfzeile "Note" ist mono. */
    '.nv-root .nv-note{border-color:rgba(159,180,255,.28);background:linear-gradient(180deg,rgba(82,87,176,.16),rgba(22,22,30,.86))}',
    '.nv-root .nv-note .nv-body{padding:16px 16px 18px}',
    '.nv-root .nv-note__title{margin:0;font-family:Jost,system-ui,-apple-system,"Segoe UI",sans-serif;font-size:40px;line-height:1.05;font-weight:600;letter-spacing:-.02em;color:var(--nv-title)}',
    '.nv-root .nv-note__text{margin:12px 0 0;font-family:Jost,system-ui,-apple-system,"Segoe UI",sans-serif;font-size:15px;line-height:1.5;font-weight:300;color:#c3c3d8}',
    '@media (prefers-reduced-motion:reduce){.nv-root .nv-pulse{animation:none!important;opacity:0}}'
  ].join('\n');

  /* ---------------------------------------------------------------------------
   * Geometrie – muss zu den CSS-Maßen oben passen (Header 30px, IO-Zeile 20px,
   * Body-Padding 8px). Links werden aus from/to + Port-Namen projiziert.
   * ------------------------------------------------------------------------- */
  var HEAD_H = 30, BODY_PAD_TOP = 8, PORT_H = 20;

  function portY(node, side, name) {
    var list = node[side] || [];
    var index = list.findIndex(function (p) { return p.name === name; });
    if (index < 0) index = 0;
    return node.y + HEAD_H + BODY_PAD_TOP + index * PORT_H + PORT_H / 2;
  }

  function wirePath(x1, y1, x2, y2) {
    var dx = Math.max(60, Math.abs(x2 - x1) * 0.5);
    return 'M ' + x1 + ' ' + y1 + ' C ' + (x1 + dx) + ' ' + y1 + ', ' + (x2 - dx) + ' ' + y2 + ', ' + x2 + ' ' + y2;
  }

  function resolveLink(link, nodesById) {
    var a = nodesById[link.from], b = nodesById[link.to];
    if (!a || !b) return null;
    return {
      d: wirePath(a.x + a.w, portY(a, 'outputs', String(link.fromPort || '').replace(/^out:/, '')),
                  b.x, portY(b, 'inputs', String(link.toPort || '').replace(/^in:/, ''))),
      type: link.type || 'none'
    };
  }

  // Eine Zeile pro Input/Output-Paar (wie im Original), Restzeilen einseitig.
  function pairedRows(node) {
    var ins = node.inputs || [], outs = node.outputs || [], rows = [], i, n = Math.max(ins.length, outs.length, 1);
    for (i = 0; i < n; i++) {
      rows.push({
        in: ins[i] ? ins[i].name : '', inType: ins[i] ? ins[i].type : 'none',
        out: outs[i] ? outs[i].name : '', outType: outs[i] ? outs[i].type : 'none'
      });
    }
    return rows;
  }

  /* ---------------------------------------------------------------------------
   * Bild eines Knotens
   *
   * width/height aus den Daten reservieren den Platz schon vor dem Laden:
   * ohne sie ist der Knoten bis zum Laden nur ~112 px hoch und springt
   * dann auf seine volle Hoehe - der Graph steht waehrend des Scrollens
   * an der falschen Stelle und das Bild "erscheint" nicht, es ploppt auf.
   *
   * Beim Ergebnis-Knoten des Graphen (ComfyUI "Save Image", hier Node 9)
   * steckt das Bild in einem Knopf: ein Klick oeffnet genau diese Datei in
   * der Grossansicht. Welcher Knoten das ist, sagt entweder das Datenfeld
   * imageZoom oder der Knotentyp; js/imageviewer.js nimmt den Klick per
   * Delegation auf [data-viewer-src] entgegen.
   * ------------------------------------------------------------------------- */
  function nodeImage(n, assetBase) {
    var src = esc(assetBase + String(n.image).replace(/^assets\//, ''));
    var alt = esc(n.imageAlt || (n.title ? n.title + ' \u2013 Vorschaubild' : n.image));
    var dims = (n.imageW && n.imageH) ? ' width="' + n.imageW + '" height="' + n.imageH + '"' : '';
    var img = '<img class="nv-img" loading="lazy" alt="' + alt + '" src="' + src + '"' + dims + '>';
    if (n.imageZoom !== true && n.type !== 'SaveImage') return img;
    var label = n.title || n.type || 'Ergebnisbild';
    return '<button type="button" class="nv-img-btn"' +
      ' data-viewer-src="' + src + '"' +
      ' data-viewer-alt="' + alt + '"' +
      ' data-viewer-label="' + esc(label) + '"' +
      ' aria-label="' + esc(label + ' in Originalgr\u00f6\u00dfe ansehen') + '">' +
      img +
      '<span class="nv-hint nv-mono" aria-hidden="true">\u2197 Original gro\u00df ansehen</span>' +
      '</button>';
  }

  /* ---------------------------------------------------------------------------
   * Render
   * ------------------------------------------------------------------------- */
  function renderNodeView(host, data, options) {
    if (!host) throw new Error('renderNodeView: Container fehlt');
    if (!data || !Array.isArray(data.nodes)) throw new Error('renderNodeView: { nodes: [...] } erwartet');
    var opts = options || {};
    var pal = data.palette || {};
    /* Zweisprachige Notiz-Texte: index-engl.html setzt <html lang="en">, dann
       gelten die *En-Felder aus nodeview.json (headingEn/textEn). Fehlen sie,
       bleibt der deutsche Text stehen. */
    var isEn = document.documentElement.lang === "en";
    var cs = data.canvas || {};
    var theme = data.theme || {};
    var assetBase = opts.assetBase != null ? opts.assetBase : '';
    var nodesById = {};
    data.nodes.forEach(function (n) { nodesById[n.id] = n; });

    if (!host.id) host.id = 'nv-' + Math.random().toString(36).slice(2, 8);
    var uid = '#' + host.id;
    host.innerHTML = '';
    host.classList.add('nv-root');

    // Theme-Tokens als CSS-Variablen
    var vars = {
      '--nv-bg': theme.editorBg || '#0A0A0F',
      '--nv-bar-bg': theme.barBg || 'linear-gradient(180deg,#14141c,#0e0e15)',
      '--nv-bar-border': theme.barBorder || '#23232f',
      '--nv-dot': theme.dotGridColor || 'rgba(120,120,180,.20)',
      '--nv-dot-size': (theme.dotGridSize || 20) + 'px',
      '--nv-node-bg': theme.nodeBg || 'rgba(22,22,30,.82)',
      '--nv-node-border': theme.nodeBorder || 'rgba(255,255,255,.10)',
      '--nv-node-blur': theme.nodeBlur || 'blur(8px)',
      '--nv-node-radius': (theme.nodeRadius || 9) + 'px',
      '--nv-head-bg': theme.headBg || 'rgba(255,255,255,.05)',
      '--nv-widget-bg': theme.widgetBg || 'rgba(255,255,255,.05)',
      '--nv-title': theme.titleColor || '#eaeaf5',
      '--nv-widget-key': theme.widgetKeyColor || '#8b8ba6',
      '--nv-widget-value': theme.widgetValueColor || '#e4e4f2',
      '--nv-group-border': theme.groupBorder || 'rgba(110,140,255,.22)',
      '--nv-group-bg': theme.groupBg || 'rgba(80,110,220,.06)',
      '--nv-group-label-bg': theme.groupLabelBg || '#111827',
      '--nv-group-label': theme.groupLabelColor || '#9fb4ff',
      '--nv-canvas-h': opts.canvasHeight || 'min(72vh, 720px)',
      '--nv-accent': opts.accent || '#5257b0',
      '--nv-text-color': theme.textColor || '#111',
      '--nv-lede-color': theme.ledeColor || '#3a3634'
    };

    var style = document.createElement('style');
    style.textContent = BASE_CSS + '\n' +
      '@keyframes nv-noodle-' + host.id + '{to{stroke-dashoffset:-100}}\n' +
      uid + ' .nv-pulse{animation:nv-noodle-' + host.id + ' ' + ((data.wireStyle && data.wireStyle.pulseAnimation) || '2.2s linear infinite') + ';filter:drop-shadow(0 0 5px currentColor)}\n' +
      Object.keys(vars).map(function (k) { return uid + '{' + k + ':' + vars[k] + '}'; }).join('\n');
    host.appendChild(style);

    // Optionaler Titel + Beschreibung
    if (opts.showHeading !== false && data.meta && (data.meta.title || data.meta.description)) {
      var head = document.createElement('div');
      head.innerHTML =
        (data.meta.title ? '<h2 style="margin:0 0 18px;font-size:clamp(24px,4.4vw,58px);font-weight:600;letter-spacing:-.02em;text-align:center;color:var(--nv-text-color)">' + esc(data.meta.title) + '</h2>' : '') +
        (data.meta.description ? '<p class="nv-lede">' + esc(data.meta.description) + '</p>' : '');
      host.appendChild(head);
    }

    var editor = document.createElement('div');
    editor.className = 'nv-editor';
    editor.innerHTML =
      '<div class="nv-bar">' +
        '<div class="nv-bar-title nv-mono"><span class="nv-bar-dot"></span>' + esc((data.meta && data.meta.name) || 'workflow') + '.json</div>' +
        '<div class="nv-zoom">' +
          '<button type="button" data-nv="out" aria-label="Verkleinern">−</button>' +
          '<span class="nv-pct nv-mono" data-nv="pct"></span>' +
          '<button type="button" data-nv="in" aria-label="Vergrößern">+</button>' +
          '<button type="button" data-nv="reset">Reset</button>' +
        '</div>' +
      '</div>' +
      // role="group" statt role="img": mit role="img" gilt der Canvas als ein
      // einziges Bild, alle Kinder sind fuer Screenreader unsichtbar. Die
      // Ueberschrift der Sektion steckt aber als h2 im Notiz-Knoten und muss
      // als Dokument-Ueberschrift lesbar bleiben. aria-label und tabindex
      // bleiben unveraendert, der Canvas ist weiterhin fokussierbar.
      '<div class="nv-canvas" tabindex="0" role="group" aria-label="ComfyUI-Workflow-Graph. Ziehen zum Verschieben, Strg+Mausrad zum Zoomen.">' +
        '<div class="nv-stage"><div class="nv-inner">' +
          '<svg class="nv-wires" viewBox="0 0 ' + cs.width + ' ' + cs.height + '" width="' + cs.width + '" height="' + cs.height + '"></svg>' +
          '<div class="nv-nodes"></div>' +
        '</div></div>' +
      '</div>';
    host.appendChild(editor);

    var q = function (sel) { return editor.querySelector(sel); };
    var inner = q('.nv-inner'), stage = q('.nv-stage'), canvas = q('.nv-canvas');
    var wires = q('.nv-wires'), nodeHost = q('.nv-nodes'), pct = q('[data-nv="pct"]');

    // Gruppen-Rahmen
    (data.groups || []).forEach(function (g) {
      var el = document.createElement('div');
      el.className = 'nv-group';
      el.style.cssText = 'left:' + g.x + 'px;top:' + g.y + 'px;width:' + g.w + 'px;height:' + g.h + 'px';
      el.innerHTML = '<span class="nv-mono">' + esc(g.label) + '</span>';
      inner.insertBefore(el, nodeHost);
    });

    // Nodes
    nodeHost.innerHTML = data.nodes.map(function (n) {
      var accent = n.accent || pal.model || '#b57bff';

      /* Notiz-Knoten (ComfyUI "Note") tragen keinen Datenfluss: keine Pins,
         keine Widgets, keine Draehte. Sie bekommen deshalb eigenes Markup mit
         Ueberschrift (h2) und Text (p) statt der IO-Zeilen - die Ueberschrift
         ist gleichzeitig die Abschnitts-Ueberschrift des Dokuments (siehe
         role="group" am Canvas).
         Der Zweig steht VOR dem generischen, weil pairedRows() fuer einen
         Knoten ohne Ein-/Ausgaenge sonst eine leere IO-Zeile rendern wuerde.
         Breite kommt aus den Daten (w), Hoehe bleibt auto: der Knoten waechst
         mit seinem Text, statt in eine feste Hoehe hineinzulaufen. */
      if (n.type === 'Note') {
        var heading = (isEn && n.headingEn) ? n.headingEn : n.heading;
        var noteText = (isEn && n.textEn) ? n.textEn : n.text;
        return '<div class="nv-node nv-note nv-mono" data-node="' + esc(n.id) + '" style="left:' + n.x + 'px;top:' + n.y + 'px;width:' + n.w + 'px">' +
          '<div class="nv-head"><span class="nv-acc" style="background:' + esc(accent) + ';box-shadow:0 0 8px ' + esc(accent) + '"></span>' +
            '<span class="nv-title">' + esc(n.title || n.type) + '</span></div>' +
          '<div class="nv-body nv-note__body">' +
            (heading ? '<h2 class="nv-note__title">' + esc(heading) + '</h2>' : '') +
            (noteText ? '<p class="nv-note__text">' + esc(noteText) + '</p>' : '') +
          '</div></div>';
      }

      return '<div class="nv-node nv-mono" data-node="' + esc(n.id) + '" style="left:' + n.x + 'px;top:' + n.y + 'px;width:' + n.w + 'px">' +
        '<div class="nv-head"><span class="nv-acc" style="background:' + esc(accent) + ';box-shadow:0 0 8px ' + esc(accent) + '"></span>' +
          '<span class="nv-title">' + esc(n.title || n.type || n.id) + '</span></div>' +
        '<div class="nv-body">' +
          pairedRows(n).map(function (p) {
            return '<div class="nv-io">' +
              '<div><span class="nv-pin in" style="background:' + esc(pal[p.inType] || pal.none || 'rgba(255,255,255,.22)') + '"></span>' +
              '<span class="nv-in-name">' + esc(p.in) + '</span></div>' +
              '<div><span class="nv-out-name">' + esc(p.out) + '</span>' +
              '<span class="nv-pin out" style="background:' + (p.out ? esc(pal[p.outType] || 'transparent') : 'transparent') + '"></span></div>' +
            '</div>';
          }).join('') +
          (n.widgets || []).map(function (w) {
            return '<div class="nv-widget"><span class="k">◄ ' + esc(w.k) + '</span><span class="v">' + esc(w.v) + ' ►</span></div>';
          }).join('') +
          (n.text ? '<div class="nv-text">' + esc(n.text) + '</div>' : '') +
          (n.image ? nodeImage(n, assetBase) : '') +
          (n.caption ? '<div class="nv-caption nv-mono">' + esc(n.caption) + '</div>' : '') +
        '</div></div>';
    }).join('');

    // Wires: statische Linie + pulsierender Noodle-Strich in derselben Bézier-Kurve
    var ws = data.wireStyle || {};
    var mk = function (tag, attrs) {
      var el = document.createElementNS(SVGNS, tag);
      Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
      return el;
    };
    (data.links || []).forEach(function (link) {
      var r = resolveLink(link, nodesById);
      if (!r) { if (window.console) console.warn('[nodeview] Link verweist auf unbekannten Node/Port:', link); return; }
      var color = pal[r.type] || pal.none || 'rgba(255,255,255,.22)';
      wires.appendChild(mk('path', { d: r.d, fill: 'none', stroke: color, 'stroke-linecap': 'round',
        'stroke-width': ws.baseWidth || 2, 'stroke-opacity': ws.baseOpacity != null ? ws.baseOpacity : 0.5 }));
      wires.appendChild(mk('path', { d: r.d, fill: 'none', stroke: color, 'stroke-linecap': 'round', class: 'nv-pulse',
        'stroke-width': ws.pulseWidth || 3.4, 'stroke-dasharray': ws.pulseDasharray || '4 46' }));
    });

    // Zoom (Buttons + Strg/Cmd+Mausrad, Zoom um den Cursor) und Drag-Pan
    var zoom = cs.initialZoom || 0.62;
    var minZ = cs.minZoom || 0.3, maxZ = cs.maxZoom || 1.4, step = cs.zoomStep || 0.12;
    function applyZoom() {
      inner.style.transform = 'scale(' + zoom + ')';
      inner.style.width = cs.width + 'px';
      inner.style.height = cs.height + 'px';
      stage.style.width = Math.round(cs.width * zoom) + 'px';
      stage.style.height = Math.round(cs.height * zoom) + 'px';
      pct.textContent = Math.round(zoom * 100) + '%';
      if (typeof opts.onZoom === 'function') opts.onZoom(zoom);
    }
    function setZoom(z, anchorEvent) {
      var next = Math.min(maxZ, Math.max(minZ, z));
      var prev = zoom;
      zoom = next;
      if (anchorEvent && prev !== next) {
        var rect = canvas.getBoundingClientRect();
        var mx = anchorEvent.clientX - rect.left, my = anchorEvent.clientY - rect.top;
        var wx = (canvas.scrollLeft + mx) / prev, wy = (canvas.scrollTop + my) / prev;
        applyZoom();
        canvas.scrollLeft = wx * zoom - mx;
        canvas.scrollTop = wy * zoom - my;
      } else applyZoom();
    }
    q('[data-nv="in"]').onclick = function () { setZoom(zoom + step); };
    q('[data-nv="out"]').onclick = function () { setZoom(zoom - step); };
    q('[data-nv="reset"]').onclick = function () { setZoom(cs.initialZoom || 0.62); };
    applyZoom();

    canvas.addEventListener('wheel', function (e) {
      if (!(e.ctrlKey || e.metaKey)) return;   // normales Scrollen bleibt Scrollen
      e.preventDefault();
      setZoom(zoom * (e.deltaY < 0 ? 1.08 : 0.925), e);
    }, { passive: false });

    canvas.addEventListener('mousedown', function (e) {
      if (e.button !== 0 || e.target.closest('button,a,input')) return;
      var sx = e.clientX, sy = e.clientY, l = canvas.scrollLeft, t = canvas.scrollTop;
      canvas.classList.add('is-panning');
      var move = function (ev) { canvas.scrollLeft = l - (ev.clientX - sx); canvas.scrollTop = t - (ev.clientY - sy); };
      var up = function () {
        canvas.classList.remove('is-panning');
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    });

    return {
      setZoom: setZoom,
      getZoom: function () { return zoom; },
      destroy: function () { host.innerHTML = ''; host.classList.remove('nv-root'); }
    };
  }

  return { renderNodeView: renderNodeView, resolveLink: resolveLink, portY: portY, wirePath: wirePath };
});