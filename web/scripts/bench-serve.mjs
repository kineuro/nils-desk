// SPDX-License-Identifier: AGPL-3.0-only
// The viewer's bench page served in front of an engine (record 45 S2): the
// built dist-bench/ from this origin, /api/ passed to the engine. FIXTURES
// names a JSON file of manifest fields by stack ({"12": {"orientation": [...],
// "origin": [...], "frame": true}}), merged into that stack's manifest on the
// way through: how the orientation labels are gated before the engine names
// orientation itself (record 45 E2), and how an old manifest is tried.
//
//   ENGINE_URL=http://127.0.0.1:18190 PORT=5191 [FIXTURES=f.json] node scripts/bench-serve.mjs

import { createServer, request } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const root = new URL("../dist-bench/", import.meta.url).pathname;
const engine = new URL(process.env.ENGINE_URL ?? "http://127.0.0.1:18190");
const port = Number(process.env.PORT ?? 5191);
const fixtures = process.env.FIXTURES ? JSON.parse(readFileSync(process.env.FIXTURES, "utf8")) : {};
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".txt": "text/plain" };

createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname.startsWith("/api/")) {
    const manifest = /^\/api\/instances\/(\d+)\/manifest$/.exec(url.pathname);
    const up = request({ host: engine.hostname, port: engine.port, path: req.url, method: req.method, headers: { ...req.headers, host: engine.host } }, (r) => {
      const extra = manifest && fixtures[manifest[1]];
      if (!extra || r.statusCode !== 200) {
        res.writeHead(r.statusCode, r.headers);
        r.pipe(res);
        return;
      }
      const chunks = [];
      r.on("data", (c) => chunks.push(c));
      r.on("end", () => {
        const body = JSON.stringify({ ...JSON.parse(Buffer.concat(chunks).toString("utf8")), ...extra });
        res.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
        res.end(body);
      });
    });
    up.on("error", (e) => {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: `the engine did not answer: ${e.message}` }));
    });
    req.pipe(up);
    return;
  }
  const path = normalize(join(root, url.pathname === "/" ? "bench.html" : url.pathname));
  if (!path.startsWith(root) || !existsSync(path) || !statSync(path).isFile()) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { "content-type": types[extname(path)] ?? "application/octet-stream" });
  res.end(readFileSync(path));
}).listen(port, "127.0.0.1", () => console.log(`bench on http://127.0.0.1:${port}/bench.html, engine ${engine.origin}`));
