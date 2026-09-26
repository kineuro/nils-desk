// SPDX-License-Identifier: AGPL-3.0-only
// The reader on one screen (record 48, after the first real read): at a
// laptop's 1440 by 900 and 1366 by 768, a blind Phase 0 item (seven asked
// axes, five derived, the MRI pack's long vocabularies, long header text)
// fits with nothing to scroll: not the page, not the right panel. Measured
// in chromium, since jsdom lays nothing out. After the second real read: the
// key facts are pieces of their own that are never cut, long text wraps, a
// row finds a value by a vendor's name, `/` fills a whole answer, and the
// picture's view is kept. After the learners report: on the large screens
// as well.

import { expect, test, type Page } from "@playwright/test";

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
];

async function measure(page: Page) {
  return page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>("[data-reader-panel]")!;
    const main = document.querySelector<HTMLElement>("main.page")!;
    const doc = document.documentElement;
    const answer = [...panel.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.startsWith("Answer"))!;
    const planes = [...document.querySelectorAll<HTMLElement>(".viewer-plane")].map((p) => p.getBoundingClientRect());
    // how tall the panel's content is, whatever the panel's own height
    const top = panel.getBoundingClientRect().top;
    const used = Math.max(...[...panel.children].filter((c) => !c.classList.contains("drawer")).map((c) => c.getBoundingClientRect().bottom)) - top;
    return {
      used: Math.round(used),
      panel: { scroll: panel.scrollHeight, client: panel.clientHeight },
      page: { scroll: main.scrollHeight, client: main.clientHeight },
      doc: { scroll: doc.scrollHeight, client: doc.clientHeight, scrollW: doc.scrollWidth, clientW: doc.clientWidth },
      answerBottom: answer.getBoundingClientRect().bottom,
      planesBottom: Math.max(...planes.map((r) => r.bottom)),
      planeSide: Math.round(planes[0]?.width ?? 0),
      rows: panel.querySelectorAll(".axis-row").length,
    };
  });
}

for (const vp of VIEWPORTS) {
  test.describe(`${vp.width} by ${vp.height}`, () => {
    test.use({ viewport: vp });

    test("a blind seven-axis item fits on one screen", async ({ page }) => {
      await page.goto("/");
      await expect(page.locator(".header-block")).toContainText("t1_mprage_sag");
      await expect(page.locator(".derived-line")).toContainText("derived: dir ?");
      const m = await measure(page);
      console.log(`${vp.width}x${vp.height}: content ${m.used} of ${m.panel.client} px in the panel, page ${m.page.scroll}/${m.page.client} px, planes ${m.planeSide} px`);
      expect(m.rows).toBe(7);
      expect(m.panel.scroll).toBeLessThanOrEqual(m.panel.client);
      expect(m.used).toBeLessThanOrEqual(m.panel.client);
      expect(m.page.scroll).toBeLessThanOrEqual(m.page.client);
      expect(m.doc.scroll).toBeLessThanOrEqual(m.doc.client);
      expect(m.doc.scrollW).toBeLessThanOrEqual(m.doc.clientW);
      expect(m.answerBottom).toBeLessThanOrEqual(vp.height);
      expect(m.planesBottom).toBeLessThanOrEqual(vp.height);
      // no derived axis is a row
      for (const axis of ["role", "directory_type", "disposition", "convertible", "quality"]) await expect(page.locator(`.axis-row[aria-label="${axis}"]`)).toHaveCount(0);
    });

    test("answered by keys, it still fits, and the derived line follows", async ({ page }) => {
      await page.goto("/");
      await expect(page.locator(".derived-line")).toContainText("derived:");
      await page.locator("body").click({ position: { x: 5, y: 5 } });
      // provenance, technique, modifier (several), construct, body part, contrast
      await page.keyboard.press("1");
      await page.keyboard.type("raw");
      await page.keyboard.press("Enter");
      await page.keyboard.type("mprage");
      await page.keyboard.press("Enter");
      await page.keyboard.type("fatsat");
      await page.keyboard.press("Enter");
      await page.keyboard.press("Enter");
      await page.keyboard.type("none");
      await page.keyboard.press("Enter");
      // base is implied by MPRAGE: the focus goes on past it to the next axis unanswered
      await page.keyboard.type("brain");
      await page.keyboard.press("Enter");
      await page.keyboard.type("not");
      await page.keyboard.press("Enter");
      await expect(page.locator(".derived-line")).toHaveText("derived: dir anat · disposition acquisition · convertible yes · role t1w · quality none");
      await expect(page.locator(".pending")).toContainText("provenance RawRecon · technique MPRAGE · modifier FatSat · construct none · base T1w · body_part brain · post_contrast not_given");
      const m = await measure(page);
      console.log(`${vp.width}x${vp.height} answered: content ${m.used} of ${m.panel.client} px in the panel`);
      expect(m.panel.scroll).toBeLessThanOrEqual(m.panel.client);
      expect(m.doc.scroll).toBeLessThanOrEqual(m.doc.client);
    });

    test("the whole header opens on h over the panel and closes on Escape", async ({ page }) => {
      await page.goto("/");
      await expect(page.locator(".header-block")).toBeVisible();
      await page.locator("body").click({ position: { x: 5, y: 5 } });
      await page.keyboard.press("h");
      await expect(page.locator(".header-drawer")).toContainText("SeriesDescription");
      await page.keyboard.type("flip");
      await expect(page.locator(".header-table tr")).toHaveCount(1);
      const m = await measure(page);
      expect(m.doc.scroll).toBeLessThanOrEqual(m.doc.client);
      await page.keyboard.press("Escape");
      await expect(page.locator(".header-drawer")).toHaveCount(0);
    });

    test("an item read in the open fits with its suggestion, the evidence one key away", async ({ page }) => {
      await page.goto("/?mode=seen");
      await expect(page.locator(".suggest")).toContainText("differ on technique, modifier");
      await expect(page.locator(".candidate")).toHaveCount(4);
      const m = await measure(page);
      console.log(`${vp.width}x${vp.height} in the open: content ${m.used} of ${m.panel.client} px in the panel`);
      expect(m.used).toBeLessThanOrEqual(m.panel.client);
      expect(m.doc.scroll).toBeLessThanOrEqual(m.doc.client);
      await page.locator("body").click({ position: { x: 5, y: 5 } });
      await page.keyboard.press("Shift+H");
      await expect(page.locator(".evidence-drawer")).toContainText("technique:first");
      await page.keyboard.press("Escape");
      await expect(page.locator(".evidence-drawer")).toHaveCount(0);
    });

    test("the key facts stand on their own, never cut, and long text wraps inside the block", async ({ page }) => {
      await page.goto("/");
      await expect(page.locator(".hb-facts")).toContainText("slices176");
      const facts = await page.evaluate(() => {
        const block = document.querySelector<HTMLElement>(".header-block")!.getBoundingClientRect();
        const each = [...document.querySelectorAll<HTMLElement>(".hb-fact")].map((f) => {
          const r = f.getBoundingClientRect();
          return { text: f.textContent, cut: f.scrollWidth > f.clientWidth + 1, inside: r.left >= block.left - 1 && r.right <= block.right + 1 && r.bottom <= block.bottom + 1 };
        });
        const series = document.querySelector<HTMLElement>(".hb-line .hb-v")!;
        return { each, seriesCut: series.scrollWidth > series.clientWidth + 1, seriesLines: Math.round(series.getBoundingClientRect().height / parseFloat(getComputedStyle(series).lineHeight)), seriesText: series.textContent };
      });
      expect(facts.each.map((f) => f.text)).toEqual(["slices176", "sagittal", "thick1 mm", "spacing1 mm", "px1×1 mm", "matrix256×240", "3 T", "SIEMENS Prisma_fit"]);
      for (const f of facts.each) {
        expect(f.cut, f.text ?? "").toBe(false);
        expect(f.inside, f.text ?? "").toBe(true);
      }
      // the series description is whole on the page, wrapped rather than cut
      expect(facts.seriesText).toBe("t1_mprage_sag_p2_iso_1.0mm_ND_research_protocol_repeat_after_motion_second_attempt_with_prescan_normalize");
      expect(facts.seriesCut).toBe(false);
      expect(facts.seriesLines).toBeGreaterThan(1);
    });

    test("bravo finds MPRAGE on its row, fills the base it implies and greys the others", async ({ page }) => {
      await page.goto("/");
      await expect(page.locator(".derived-line")).toContainText("derived:");
      await page.locator("body").click({ position: { x: 5, y: 5 } });
      await page.keyboard.press("2");
      await page.keyboard.type("bravo");
      await expect(page.locator('.axis-row[aria-label="technique"] .find-why')).toHaveText("BRAVO → MPRAGE");
      await page.keyboard.press("Enter");
      await expect(page.locator('.axis-row[aria-label="base"] .opt[data-value="T1w"]')).toHaveClass(/implied/);
      await expect(page.locator('.axis-row[aria-label="base"] .opt[data-value="T2w"]')).toHaveClass(/out/);
      await expect(page.locator('.axis-row[aria-label="base"] .opt[data-value="T2w"]')).toHaveAttribute("title", "not with this answer: technique is MPRAGE sets base T1w");
      const m = await measure(page);
      expect(m.panel.scroll).toBeLessThanOrEqual(m.panel.client);
      expect(m.doc.scroll).toBeLessThanOrEqual(m.doc.client);
    });

    test("/ finds a whole answer by bravo and fills every row, and it still fits", async ({ page }) => {
      await page.goto("/");
      await expect(page.locator(".derived-line")).toContainText("derived:");
      await page.locator("body").click({ position: { x: 5, y: 5 } });
      await page.keyboard.press("/");
      await expect(page.locator(".combo-find")).toBeFocused();
      await page.keyboard.type("bravo");
      await expect(page.locator(".combo-pop .combo").first()).toContainText("RawRecon · MPRAGE · none · none · T1w · brain · not_given");
      await expect(page.locator(".combo-pop .combo").first()).toContainText("BRAVO → MPRAGE");
      let m = await measure(page);
      expect(m.doc.scroll).toBeLessThanOrEqual(m.doc.client);
      await page.keyboard.press("Enter");
      await expect(page.locator(".pending")).toContainText("provenance RawRecon · technique MPRAGE · modifier none · construct none · base T1w · body_part brain · post_contrast not_given");
      await expect(page.locator(".derived-line")).toHaveText("derived: dir anat · disposition acquisition · convertible yes · role t1w · quality none");
      m = await measure(page);
      expect(m.used).toBeLessThanOrEqual(m.panel.client);
      expect(m.doc.scroll).toBeLessThanOrEqual(m.doc.client);
    });

    test("the picture's view a reader chose is kept for the next visit", async ({ page }) => {
      await page.goto("/");
      await expect(page.locator('.viewer-axes [role="tab"]').nth(1)).toHaveAttribute("aria-selected", "true");
      await page.locator('.viewer-axes [role="tab"]').first().click();
      await page.reload();
      await expect(page.locator(".header-block")).toBeVisible();
      await expect(page.locator('.viewer-axes [role="tab"]').first()).toHaveAttribute("aria-selected", "true");
    });

    test("an engine before the new doors still fits", async ({ page }) => {
      await page.goto("/?mode=plain");
      await expect(page.locator(".header-block")).toContainText("TR 2300");
      await expect(page.locator(".derived-line")).toHaveCount(0);
      const m = await measure(page);
      expect(m.panel.scroll).toBeLessThanOrEqual(m.panel.client);
      expect(m.doc.scroll).toBeLessThanOrEqual(m.doc.client);
    });
  });
}
