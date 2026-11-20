# `_unused` – Altbestand aus dem ehemaligen `assets/`

Diese Dateien werden von der Seite **nicht** geladen. Sie stammen aus dem
früheren `ai-portfolio`-Entwurf und aus Zwischenständen und wurden beim
Zusammenlegen von `assets/` und `media/` (2026-11-20) hierher verschoben,
statt sie zu löschen.

Geprüft gegen `index.html`, `css/*.css`, `js/*.js`, `context/*`: keine
Referenz auf eine dieser Dateien.

Die Dateien aus `assets/`, die die Seite wirklich lädt, liegen jetzt in:

| Datei | neuer Ort | benutzt von |
| --- | --- | --- |
| `grain-curve-3840x900.png` | `media/background/` | `css/style.css` (`.placeholder`) |
| `sandgrain-curve-3840x900.webp` | `media/background/` | `css/track.css` (`.seam`) |
| `model.webp`, `pose.webp`, `outfit.webp`, `output.webp` | `media/projects/projekt-1/` | `index.html` (`assetBase` für den ComfyUI-Graphen) |

Musik-Teil: `Pantomime.mp3` und `pantomime-background.avif` liegen in
`media/projects/projekt-4/`.

Dieser Ordner kann gefahrlos gelöscht werden.
