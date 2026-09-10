// SPDX-License-Identifier: AGPL-3.0-only
// The front end in development against a running desk, with the instance
// doors taken from another source when one is named: how the viewer's bench
// runs before an engine serves the doors, or against a tile server of its own.
//
//   INSTANCES_URL=http://127.0.0.1:8766 DESK_URL=http://127.0.0.1:7203 npx vite --config vite.bench.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// cornerstone3D reaches for Node's events module; the browser gets the package of the same name
const events = fileURLToPath(new URL("./node_modules/events/events.js", import.meta.url));

const desk = process.env.DESK_URL ?? "http://127.0.0.1:7203";
const instances = process.env.INSTANCES_URL ?? desk;
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { events } },
  optimizeDeps: { include: ["@cornerstonejs/core", "@cornerstonejs/tools", "events"] },
  server: {
    port: Number(process.env.PORT ?? 5183),
    proxy: {
      "/api/instances": instances,
      "/api": desk,
      "/desk": desk,
      "/assistant": desk,
      "/kvasir": desk,
      "/supervise": desk,
    },
  },
});
