// SPDX-License-Identifier: AGPL-3.0-only
// The reader's layout check (record 48, one screen): a page of its own,
// test/layout/index.html, that draws the rating workspace in the desk's
// shell against a fake engine, with the viewer swapped for a stand-in of the
// same boxes. Playwright serves it and measures it (playwright.config.ts):
//
//   npx playwright test
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const events = fileURLToPath(new URL("./node_modules/events/events.js", import.meta.url));
const stub = fileURLToPath(new URL("./test/layout/ViewerStub.tsx", import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL("./test/layout", import.meta.url)),
  plugins: [react()],
  resolve: { alias: [{ find: "events", replacement: events }, { find: /^\.\.\/viewer\/Viewer$/, replacement: stub }] },
  server: { port: Number(process.env.PORT ?? 5191), strictPort: true, host: "127.0.0.1" },
  logLevel: "warn",
});
