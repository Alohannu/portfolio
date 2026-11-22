# Scroll-Test: Lenis-Schicht (`feature/smooth-scroll-lenis`)

Dieser Branch stellt das Scrollen des Portfolios auf die gedämpfte Kurve der
Referenzseite (`dejvidkavazovic.com`) um. Grundlage ist die Untersuchung in
`_scroll-diagnose/` (nicht Teil dieses Repos).

## Was drin ist

| Datei | Änderung |
|---|---|
| `js/lenis.min.js` | Lenis 1.1.13 (MIT), unverändert von unpkg |
| `js/smooth-scroll.js` | **neu** — startet Lenis, A/B-Schalter, `window.SmoothScroll` als API |
| `js/track.js` | Snap, Track-Grenzen und Deep-Links laufen über `window.SmoothScroll` statt `window.scrollTo` |
| `js/script.js` | Rad über dem ComfyUI-Graphen koppelt Lenis ab, solange der Graph aktiv ist |
| `css/style.css` | Lenis-Standardregeln, `scroll-behavior: auto` |
| `index.html`, `index-engl.html` | beide Skripte vor `js/script.js` eingebunden |

## Umschalten (A/B im selben Browser)

```
http://127.0.0.1:8801/index.html            -> Lenis an  (Default)
http://127.0.0.1:8801/index.html?lenis=0    -> Lenis aus (bisheriges Verhalten)
http://127.0.0.1:8801/index.html?lenis=1    -> Lenis an, explizit
```

Bei `prefers-reduced-motion: reduce` ist die Schicht **immer** aus.

Prüfen, ob sie läuft: in der Konsole `window.SmoothScroll.enabled` →
`true`/`false`, und `document.documentElement.className` enthält `lenis has-lenis`.

## Was getestet werden soll

1. **Gefühl beim Rad-Scrollen** — ist der Unterschied zum bisherigen Verhalten
   spürbar, und wirkt er wie auf der Referenzseite?
2. **Track-Grenzen** — bleibt die Position am Ende einer Spur stehen, ohne
   sichtbares Zurückspringen? (Der Rad-Handler hält die Grenze jetzt aktiv,
   statt `preventDefault` zu rufen.)
3. **Snap nach Ruhe** — rastet es nach ~150 ms noch sauber ein?
4. **Pfeile und Menüleiste** — landen Vor/Zurück und die Deep-Links
   (`#serum`, `#curtain-view`, …) exakt auf dem Screen?
5. **ComfyUI-Graph** — scrollt das Rad im Graphen den Graphen (nicht die
   Seite), und kommt man am Graph-Ende wieder auf die Seite?
6. **Overlays** — Showroom, Bildansicht und Tool-Dialog müssen weiter
   scrollen; die Seite dahinter darf stehen bleiben.
7. **Tastatur und Touch** — Leertaste/Bild-runter und Touch sind bewusst
   **nicht** gedämpft (Lenis-Default); prüfen, ob das konsistent wirkt.

## Messwerte aus der Vorabprüfung

Identischer Input (60 Wheel-Events à 120 px), Chromium headless, 1440×900:

| | `?lenis=1` | `?lenis=0` |
|---|---|---|
| Frames ohne Scroll-Bewegung | **1,3 %** | 85,2 % |
| Längster Stillstand | 1 Frame | 45 Frames |
| Scroll-Delta pro Frame | 1–5 px | 0 oder 120 px |
| Frame-Zeit Median | 16,7 ms | 16,7 ms |

Zum Vergleich: Die Referenzseite liegt bei 0,35 % stillstehenden Frames.

Deep-Link `#serum`, Pfeil-Snap und Seitenende landen in beiden Modi
pixelgenau (`delta = 0`), ohne JS-Fehler.

## Bekannte Punkte

- **Doppelte Dämpfung an den Track-Grenzen.** An einer Track-Grenze hält der
  Rad-Handler die Position per `SmoothScroll.to(lim, {immediate:true})` fest.
  Das ist ein harter Stopp innerhalb einer sonst gedämpften Bewegung — dort
  bewusst prüfen, ob es weich genug wirkt.
- **Snap-Dauer.** `track.js` gibt 320 ms vor; Lenis bekommt das als
  `duration` und eigene Easing-Kurve. Falls das Einrasten anders wirkt als
  vorher, ist das der erste Ort zum Nachjustieren.
- `lerp: 0.09` ist bewusst identisch zur Referenz (8,6 %/Frame @60 Hz,
  Halbwertszeit 128 ms). Kleiner = träger, größer = direkter.

## Nicht Teil dieses Branches

Die Performance-Befunde der Untersuchung (9 `backdrop-filter`-Elemente,
Endlos-`box-shadow`-Animationen, Videovorlauf) sind hier **nicht** angefasst.
Sie sind unabhängig von der Scroll-Kurve und gehören in einen eigenen Branch.
