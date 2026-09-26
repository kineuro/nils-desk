// SPDX-License-Identifier: AGPL-3.0-only
// The desk on any screen (record 48, after the learners report): "on big
// screen I see fixed size". At a laptop's 1366 by 768 and 1440 by 900 and at
// 1920 by 1080 and 2560 by 1440, every page takes the window's width (only
// running text keeps a measure), the reader's three planes fill the left side
// and grow with it, the right panel keeps a readable width and holds a seven
// axis item in both its views without a scroll, and nothing scrolls sideways.
// The compact view makes every axis a find box whose list clears and moves on
// after a pick, and the viewer's numbers stay out of the way until asked for.

import { expect, test, type Page } from "@playwright/test";

const VIEWPORTS = [
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
];

async function planes(page: Page) {
  await expect(page.locator(".viewer-plane.own")).toBeVisible();
  return page.evaluate(() => {
    const side = document.querySelector<HTMLElement>(".rate-picture")!.getBoundingClientRect();
    const rects = [...document.querySelectorAll<HTMLElement>(".viewer-plane")].map((p) => p.getBoundingClientRect());
    const own = document.querySelector<HTMLElement>(".viewer-plane.own")!.getBoundingClientRect();
    const panel = document.querySelector<HTMLElement>("[data-reader-panel]")!;
    const doc = document.documentElement;
    const left = Math.min(...rects.map((r) => r.left));
    const right = Math.max(...rects.map((r) => r.right));
    const top = Math.min(...rects.map((r) => r.top));
    const bottom = Math.max(...rects.map((r) => r.bottom));
    return {
      side: { w: side.width, h: side.height, bottom: side.bottom },
      block: { w: right - left, h: bottom - top, bottom },
      own: Math.round(Math.min(own.width, own.height)),
      overlap: rects.some((a, i) => rects.some((b, j) => i < j && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1)),
      panelW: panel.getBoundingClientRect().width,
      panel: { scroll: panel.scrollHeight, client: panel.clientHeight },
      doc: { scrollW: doc.scrollWidth, clientW: doc.clientWidth, scroll: doc.scrollHeight, client: doc.clientHeight },
    };
  });
}

for (const vp of VIEWPORTS) {
  test.describe(`${vp.width} by ${vp.height}`, () => {
    test.use({ viewport: vp });

    test("the three planes fill the left side, the panel keeps a readable width, nothing scrolls", async ({ page }) => {
      await page.goto("/");
      await expect(page.locator(".derived-line")).toContainText("derived:");
      const m = await planes(page);
      console.log(`${vp.width}x${vp.height}: planes ${Math.round(m.block.w)} by ${Math.round(m.block.h)} in ${Math.round(m.side.w)} by ${Math.round(m.side.h)}, the large one ${m.own} px, panel ${Math.round(m.panelW)} px`);
      expect(m.overlap).toBe(false);
      // the block reaches the side's full width or its full height (less the view tabs' line)
      expect(Math.max(m.block.w / m.side.w, m.block.h / (m.side.h - 40))).toBeGreaterThan(0.95);
      expect(m.block.bottom).toBeLessThanOrEqual(vp.height);
      expect(m.block.w).toBeLessThanOrEqual(m.side.w + 0.5);
      // the plane the stack was acquired in is the large one
      expect(m.own).toBeGreaterThan(m.side.w / 2.2);
      expect(m.panelW).toBeGreaterThanOrEqual(34 * 16 - 1);
      expect(m.panelW).toBeLessThanOrEqual(42 * 16 + 1);
      expect(m.panel.scroll).toBeLessThanOrEqual(m.panel.client);
      expect(m.doc.scrollW).toBeLessThanOrEqual(m.doc.clientW);
      expect(m.doc.scroll).toBeLessThanOrEqual(m.doc.client);
    });

    test("compact: every axis is a find box, and the seven still fit", async ({ page }) => {
      await page.goto("/");
      await expect(page.locator(".derived-line")).toContainText("derived:");
      await page.locator('.rows-toggle button:has-text("compact")').click();
      await expect(page.locator(".axis-find:not(.quiet)")).toHaveCount(7);
      const m = await planes(page);
      expect(m.panel.scroll).toBeLessThanOrEqual(m.panel.client);
      expect(m.doc.scrollW).toBeLessThanOrEqual(m.doc.clientW);
      // kept for the next visit
      await page.reload();
      await expect(page.locator(".axis-find:not(.quiet)")).toHaveCount(7);
      await page.locator('.rows-toggle button:has-text("expanded")').click();
      await expect(page.locator(".axis-find:not(.quiet)")).toHaveCount(2);
    });

    test("the viewer's numbers are one click away, not on the page", async ({ page }) => {
      await page.goto("/");
      await expect(page.locator(".derived-line")).toContainText("derived:");
      await expect(page.locator(".viewer-foot")).toHaveCount(0);
      await page.locator(".viewer-numbers-toggle").click();
      await expect(page.locator(".viewer-foot")).toContainText("first image");
      const m = await planes(page);
      expect(m.doc.scroll).toBeLessThanOrEqual(m.doc.client);
    });
  });
}

test("the planes grow with the screen, and follow the window when it changes", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/");
  await expect(page.locator(".derived-line")).toContainText("derived:");
  const small = (await planes(page)).own;
  await page.setViewportSize({ width: 2560, height: 1440 });
  await expect.poll(async () => (await planes(page)).own).toBeGreaterThan(small * 1.6);
});

test.describe("a pick clears the box and goes on", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".derived-line")).toContainText("derived:");
    await page.locator('.rows-toggle button:has-text("compact")').click();
    await page.locator("body").click({ position: { x: 5, y: 5 } });
  });

  test("Enter takes the value, empties the box and moves to the next unanswered axis", async ({ page }) => {
    await page.keyboard.press("2");
    await page.keyboard.type("bravo");
    await expect(page.locator('.axis-row[aria-label="technique"] .find-why')).toHaveText("BRAVO → MPRAGE");
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-find="technique"]')).toHaveValue("");
    await expect(page.locator('.axis-row[aria-label="technique"] .opt.on[data-value="MPRAGE"]')).toHaveCount(1);
    await expect(page.locator('[data-find="modifier"]')).toBeFocused();
    // a multi-valued axis keeps the focus for another value, then Enter on an empty box goes on
    await page.keyboard.type("fatsat");
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-find="modifier"]')).toHaveValue("");
    await expect(page.locator('[data-find="modifier"]')).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-find="construct"]')).toBeFocused();
    await page.keyboard.type("none");
    await page.keyboard.press("Enter");
    // base is implied by MPRAGE, so the focus skips it to body part
    await expect(page.locator('[data-find="body_part"]')).toBeFocused();
    await expect(page.locator(".pending")).toContainText("technique MPRAGE · modifier FatSat · construct none · base T1w");
  });

  test("a click in the list does the same", async ({ page }) => {
    await page.keyboard.press("1");
    await page.keyboard.type("raw");
    await page.locator('.axis-row[aria-label="provenance"] .axis-pop .opt[data-value="RawRecon"]').click();
    await expect(page.locator('[data-find="provenance"]')).toHaveValue("");
    await expect(page.locator('[data-find="technique"]')).toBeFocused();
    await expect(page.locator(".pending")).toContainText("provenance RawRecon");
  });

  test("/ still finds a whole answer", async ({ page }) => {
    await page.keyboard.press("/");
    await expect(page.locator(".combo-find")).toBeFocused();
    await page.keyboard.type("bravo");
    await page.keyboard.press("Enter");
    await expect(page.locator(".pending")).toContainText("provenance RawRecon · technique MPRAGE · modifier none · construct none · base T1w · body_part brain · post_contrast not_given");
  });
});

// ---------------------------------------------------------------- the other pages

const PAGES = ["home", "data", "campaigns", "review", "pipelines", "settings"];

for (const vp of VIEWPORTS) {
  test.describe(`the desk at ${vp.width} by ${vp.height}`, () => {
    test.use({ viewport: vp });
    for (const route of PAGES) {
      test(`${route} takes the page's width`, async ({ page }) => {
        await page.goto(`/desk.html#${route}`);
        await expect(page.locator("main.page > *").first()).toBeVisible();
        await page.waitForTimeout(300);
        const m = await page.evaluate(() => {
          const main = document.querySelector<HTMLElement>("main.page")!;
          const cs = getComputedStyle(main);
          const inner = main.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
          const first = main.firstElementChild as HTMLElement;
          const doc = document.documentElement;
          return { inner, first: first.getBoundingClientRect().width, cls: first.className, scrollW: doc.scrollWidth, clientW: doc.clientWidth };
        });
        console.log(`${vp.width} ${route}: .${m.cls.split(" ").join(".")} ${Math.round(m.first)} of ${Math.round(m.inner)} px`);
        expect(m.first).toBeGreaterThanOrEqual(m.inner - 2);
        expect(m.scrollW).toBeLessThanOrEqual(m.clientW);
      });
    }
  });
}
