// SPDX-License-Identifier: AGPL-3.0-only
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// cornerstone3D reaches for Node's events module; the browser gets the package of the same name
const events = fileURLToPath(new URL("./node_modules/events/events.js", import.meta.url));

// The front end is built into web/dist and embedded into the desk binary;
// in development it is served by vite and talks to a running desk.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { events } },
  optimizeDeps: { include: ["@cornerstonejs/core", "@cornerstonejs/tools", "events"] },
  build: { outDir: "dist", emptyOutDir: true },
  server: { proxy: { "/desk": "http://127.0.0.1:7200", "/api": "http://127.0.0.1:7200" } },
});
