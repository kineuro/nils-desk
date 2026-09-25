// SPDX-License-Identifier: AGPL-3.0-only
// The reader's layout check in a real browser (record 48, one screen):
// jsdom lays nothing out, so chromium measures the page vite serves from
// test/layout. `npx playwright install chromium` fetches the browser once.
import { defineConfig } from "@playwright/test";

const port = Number(process.env.PORT ?? 5191);
export default defineConfig({
  testDir: "test/layout",
  testMatch: "*.pw.ts",
  fullyParallel: true,
  reporter: [["list"]],
  use: { baseURL: `http://127.0.0.1:${port}`, browserName: "chromium" },
  webServer: { command: `npx vite --config vite.layout.config.ts --port ${port}`, url: `http://127.0.0.1:${port}/`, reuseExistingServer: false, timeout: 60_000 },
});
