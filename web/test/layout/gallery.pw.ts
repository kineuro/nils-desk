// SPDX-License-Identifier: AGPL-3.0-only
// The gallery on a screen (record 50 R3): at 1920 by 1080 and at a laptop's
// 1366 by 768, a hundred items of a body-part campaign draw as a grid that
// scrolls inside the page while the bar with its accept stays in view;
// nothing scrolls the page or sideways; the hundred pictures load at once;
// a number key corrects the focused item and Ctrl+Enter sends every item's
// own value in one move. The pictures are answered here, a small picture
// each, as the engine's thumb door answers them.

import { expect, test } from "@playwright/test";

const VIEWPORTS = [
  { width: 1920, height: 1080, columns: 6 },
  { width: 1366, height: 768, columns: 4 },
];

// a small grey picture, three planes wide, as the thumb door draws them
const PICTURE = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAADAAAAAQCAAAAAB1xaNtAAAAFElEQVR4nGNoIBEwjGoY1TB8NQAAJYSAEGy7FvQAAAAASUVORK5CYII=", "base64");

for (const vp of VIEWPORTS) {
  test.describe(`${vp.width} by ${vp.height}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test("a hundred items fit the page, the grid scrolls, the accept stays in view", async ({ page }) => {
      let thumbs = 0;
      await page.route("**/api/instances/*/thumb", (route) => {
        thumbs++;
        return route.fulfill({ status: 200, contentType: "image/png", body: PICTURE });
      });
      const t = Date.now();
      await page.goto("/gallery.html");
      await expect(page.locator(".g-cell")).toHaveCount(100);
      // every picture of the page is drawn, and the next page's were asked for too
      await expect.poll(() => page.evaluate(() => [...document.querySelectorAll<HTMLImageElement>(".g-pic img")].filter((i) => i.complete && i.naturalWidth > 0).length)).toBe(100);
      const loaded = Date.now() - t;
      await expect.poll(() => thumbs).toBeGreaterThanOrEqual(200);
      const m = await page.evaluate(() => {
        const doc = document.documentElement;
        const grid = document.querySelector<HTMLElement>("[data-gallery-grid]")!;
        const accept = [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.startsWith("Accept all"))!;
        const cells = [...grid.querySelectorAll<HTMLElement>(".g-cell")];
        const top = cells[0].getBoundingClientRect().top;
        return {
          doc: { scroll: doc.scrollHeight, client: doc.clientHeight, scrollW: doc.scrollWidth, clientW: doc.clientWidth },
          grid: { scroll: grid.scrollHeight, client: grid.clientHeight },
          accept: accept.getBoundingClientRect(),
          columns: cells.filter((c) => Math.abs(c.getBoundingClientRect().top - top) < 2).length,
        };
      });
      console.log(`${vp.width}x${vp.height}: ${m.columns} columns, grid ${m.grid.client} of ${m.grid.scroll} px, pictures in ${loaded} ms`);
      expect(m.doc.scroll).toBeLessThanOrEqual(m.doc.client);
      expect(m.doc.scrollW).toBeLessThanOrEqual(m.doc.clientW);
      expect(m.grid.scroll).toBeGreaterThan(m.grid.client);
      expect(m.accept.bottom).toBeLessThanOrEqual(vp.height);
      expect(m.accept.top).toBeGreaterThan(0);
      expect(m.columns).toBeGreaterThanOrEqual(vp.columns);
    });

    test("a key corrects the focused item and Ctrl+Enter accepts each item's own value", async ({ page }) => {
      await page.route("**/api/instances/*/thumb", (route) => route.fulfill({ status: 200, contentType: "image/png", body: PICTURE }));
      await page.goto("/gallery.html");
      await expect(page.locator(".g-cell")).toHaveCount(100);
      const first = page.locator(".g-cell").first();
      // the least certain first: the suggesters that disagree
      await expect(first.locator(".g-conf")).toContainText("differ");
      await page.locator("body").click({ position: { x: 5, y: 5 } });
      await page.keyboard.press("6");
      await expect(first).toHaveClass(/changed/);
      await expect(page.locator(".g-tally")).toContainText("1 corrected");
      // down a row with the arrow, and the grid follows
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("1");
      await expect(page.locator(".g-cell.changed")).toHaveCount(2);
      // a picker by mouse
      await page.locator(".g-cell").nth(2).locator("select").selectOption("chest");
      await expect(page.locator(".g-cell.changed")).toHaveCount(3);
      await page.keyboard.press("Control+Enter");
      await expect(page.locator(".g-said")).toContainText("answers kept");
      const posted = await page.evaluate(() => (window as unknown as { posted: { answers: { item: number; value: string }[] }[] }).posted);
      expect(posted).toHaveLength(1);
      const sent = posted[0].answers;
      // every item with a value, each its own
      expect(sent.length).toBeGreaterThan(90);
      expect(sent[0].value).toBe("other");
      expect(sent.filter((a) => a.value === "chest")).toHaveLength(1);
    });
  });
}
