// SPDX-License-Identifier: AGPL-3.0-only
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { promisify } from "node:util";
import { join } from "node:path";
import { brotliCompress, constants, gzip } from "node:zlib";

const br = promisify(brotliCompress);
const gz = promisify(gzip);

/**
 * Every text-like file of the build written beside itself as .br and .gz, at
 * the highest levels, once: the desk binary embeds them and answers the one
 * the browser accepts, so nothing is compressed per request.
 */
function precompress(): Plugin {
  const worth = /\.(js|mjs|css|html|svg|json|wasm|txt)$/;
  let out = "dist";
  return {
    name: "nils-precompress",
    apply: "build",
    configResolved(c) {
      out = c.build.outDir;
    },
    async closeBundle() {
      const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
      const files = walk(out).filter((f) => worth.test(f));
      // in parallel on node's thread pool, the largest (lazy workers) at a faster level; kept only where it saves a tenth or more
      await Promise.all(
        files.map(async (file) => {
          const raw = readFileSync(file);
          if (raw.length < 1024) return;
          const [b, g] = await Promise.all([br(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: raw.length > 2_000_000 ? 9 : 11, [constants.BROTLI_PARAM_SIZE_HINT]: raw.length } }), gz(raw, { level: 9 })]);
          if (b.length < raw.length * 0.9) writeFileSync(`${file}.br`, b);
          if (g.length < raw.length * 0.9) writeFileSync(`${file}.gz`, g);
        }),
      );
    },
  };
}

// cornerstone3D reaches for Node's events module; the browser gets the package of the same name
const events = fileURLToPath(new URL("./node_modules/events/events.js", import.meta.url));

// The front end is built into web/dist and embedded into the desk binary;
// in development it is served by vite and talks to a running desk.
export default defineConfig({
  plugins: [react(), precompress()],
  resolve: { alias: { events } },
  optimizeDeps: { include: ["@cornerstonejs/core", "@cornerstonejs/tools", "events"] },
  build: { outDir: "dist", emptyOutDir: true },
  server: { proxy: { "/desk": "http://127.0.0.1:7200", "/api": "http://127.0.0.1:7200" } },
});
