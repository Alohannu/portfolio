/* ==========================================================================
   Lokaler Server fuer die Portfolio-Seite

   Warum nicht `python3 -m http.server`: der beantwortet keine
   Range-Requests. Audio und Video koennen dann nicht springen - die
   Fortschrittsleiste des Soundtracks wirkt beim Testen wie ein
   No-Op, obwohl der Code stimmt. GitHub Pages liefert Range, dieser
   Server deshalb auch.

   Start (aus dem Repo-Wurzelverzeichnis):
     node tools/serve.mjs            -> http://127.0.0.1:8799/
     node tools/serve.mjs 8080       -> anderer Port
   ========================================================================== */
import { createServer } from "node:http";
import { createReadStream, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";

const ROOT = resolve(process.cwd());
const PORT = Number(process.argv[2] || process.env.PORT || 8799);
const BIND = "127.0.0.1";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf"
};

function send404(res) {
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Nicht gefunden");
}

createServer((req, res) => {
  let path;
  try {
    path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  } catch {
    return send404(res);
  }
  if (path.endsWith("/")) path += "index.html";

  const file = normalize(join(ROOT, path));
  if (!file.startsWith(ROOT)) return send404(res); // kein Ausbruch aus dem Repo

  let stat;
  try {
    stat = statSync(file);
  } catch {
    return send404(res);
  }
  if (stat.isDirectory()) return send404(res);

  const type = TYPES[extname(file).toLowerCase()] || "application/octet-stream";
  const size = stat.size;
  const range = req.headers.range;

  /* Range-Request: 206 mit Content-Range, sonst kann der Browser in
     Audio/Video nicht springen. */
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (m) {
      const start = m[1] === "" ? size - Number(m[2]) : Number(m[1]);
      const end = m[1] !== "" && m[2] !== "" ? Number(m[2]) : size - 1;
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
        res.writeHead(416, { "Content-Range": `bytes */${size}` });
        return res.end();
      }
      res.writeHead(206, {
        "Content-Type": type,
        "Content-Length": end - start + 1,
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-cache"
      });
      if (req.method === "HEAD") return res.end();
      return createReadStream(file, { start, end }).pipe(res);
    }
  }

  res.writeHead(200, {
    "Content-Type": type,
    "Content-Length": size,
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-cache"
  });
  if (req.method === "HEAD") return res.end();
  createReadStream(file).pipe(res);
}).listen(PORT, BIND, () => {
  console.log(`Portfolio laeuft auf http://${BIND}:${PORT}/ (mit Range-Support)`);
});
