// SPDX-License-Identifier: AGPL-3.0-only
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The front end is built into web/dist and embedded into the desk binary;
// in development it is served by vite and talks to a running desk.
export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
  server: { proxy: { "/desk": "http://127.0.0.1:7200", "/api": "http://127.0.0.1:7200" } },
});
