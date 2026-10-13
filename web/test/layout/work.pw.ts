// SPDX-License-Identifier: AGPL-3.0-only
// Review's one list of work and Data's Browse on a screen (Wave 7a, record
// 55 H3; spec 13.1 and 13.2): at a laptop's width (1440) and a phone's
// (390), in the desk's own shell. The list's four jobs, each row's kind
// told by its left border's colour and never a glyph, nothing sideways; the
// make dialog choosing its selections from lists, drawing a pair campaign
// with its seed and its preview's counts on the foot; Browse's subjects and
// a subject's sessions from the registry's doors. Screenshots go to
// test-results for the report.

import { expect, test, type Page } from "@playwright/test";

const VIEWPORTS = [
  { name: "laptop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
];

async function noSideways(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  const inner = await page.locator("main.page").evaluate((e) => e.scrollWidth - e.clientWidth);
  expect(inner).toBeLessThanOrEqual(1);
}

for (const vp of VIEWPORTS) {
  test.describe(`${vp.width} by ${vp.height}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test("Review is one list of work by job, its rows told apart by their borders, nothing sideways", async ({ page }) => {
      await page.goto("/work.html#review");
      await expect(page.locator("h1")).toHaveText("Work");
      await expect(page.locator(".work-group h2")).toHaveText(["Answer a question", "Pick a main scan", "Check a result", "Settle a disagreement"]);
      await expect(page.locator(".work-row.from-campaign")).toHaveCount(6);
      await expect(page.locator(".work-row.from-adjudication")).toHaveCount(1);
      await expect(page.getByText("219 questions are held by campaigns, answered there.")).toBeVisible();
      await expect(page.locator(".chips.pages a", { hasText: "Questions" })).toContainText("62");
      // a row's kind is the colour of its left border: three kinds, three colours, and no glyph before the title
      const borders = await page.locator(".work-row").evaluateAll((rows) => rows.map((r) => [r.className, getComputedStyle(r).borderLeftWidth, getComputedStyle(r).borderLeftColor]));
      for (const [, w] of borders) expect(w).toBe("3px");
      const colour = (k: string) => new Set(borders.filter(([c]) => c.includes(k)).map(([, , c]) => c));
      expect(colour("from-machine").size).toBe(1);
      expect(colour("from-campaign").size).toBe(1);
      expect([...colour("from-machine")][0]).not.toBe([...colour("from-campaign")][0]);
      expect([...colour("from-adjudication")][0]).not.toBe([...colour("from-campaign")][0]);
      // every row's act sits inside the window
      for (const b of await page.locator(".work-row .work-act a").all()) {
        const box = (await b.boundingBox())!;
        expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
      }
      await expect(page.locator(".work-row", { hasText: "body-part-curation-round-9" })).toContainText("34 of 300 yours");
      await noSideways(page, vp.width);
      await page.screenshot({ path: `test-results/work-${vp.name}.png`, fullPage: true });
    });

    test("the side holds Review's pages, Campaigns among them, and no Campaigns section", async ({ page }) => {
      await page.goto("/work.html#review");
      if (vp.width < 700) await page.getByRole("button", { name: "Sections" }).click();
      const side = page.locator("#side");
      await expect(side.getByRole("link", { name: "Work" })).toBeVisible();
      await expect(side.getByRole("link", { name: "Label sets" })).toBeVisible();
      await expect(side.getByRole("link", { name: "Campaigns", exact: true })).toHaveCount(0);
    });

    test("an old Campaigns address opens the same page inside Review", async ({ page }) => {
      await page.goto("/work.html#campaigns");
      await expect(page).toHaveURL(/#review\/campaigns$/u);
      await expect(page.locator("h1")).toHaveText("Work");
    });

    test("the make dialog chooses its selections from lists and draws a pair campaign with its seed", async ({ page }) => {
      await page.goto("/work.html#review/campaigns?make=1");
      const dialog = page.locator("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog.getByLabel("A selection", { exact: true }).locator("option")).toHaveText(["choose", "t1-pre v1 · 120 stacks", "t1-post v2 · 160 stacks", "body-part-unsure v3 · 200 stacks", "sealed-cert-3 v4 · 240 stacks"]);
      await dialog.getByRole("button", { name: "Two stacks side by side" }).click();
      await dialog.getByLabel("Name").fill("pairs-r4");
      await dialog.getByLabel("Stacks", { exact: true }).selectOption("t1-pre@1");
      await dialog.getByLabel("Paired with").selectOption("t1-post@2");
      await expect(dialog.getByLabel("Seed")).toHaveValue(/^[0-9a-f]{16}$/u);
      await expect(dialog.locator(".row.actions .meta")).toHaveText("Draws 118 pairs · 236 stacks · 0 stacks in two or more pairs · 4 pairs across studies · 6 left out.");
      await expect(dialog.getByRole("button", { name: "Make the campaign" })).toBeEnabled();
      const box = (await dialog.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
      await page.screenshot({ path: `test-results/work-make-pair-${vp.name}.png` });
      // an A/B campaign takes the rules and a folder for each other voter
      await dialog.getByRole("button", { name: "Settle readings (A/B)" }).click();
      await expect(dialog.getByText("Add a voter's folder")).toBeVisible();
      await expect(dialog.getByLabel("Audit share")).toHaveValue("0.1");
      await page.screenshot({ path: `test-results/work-make-ab-${vp.name}.png` });
    });

    test("Browse shows the registry's subjects, then a subject's sessions, nothing sideways", async ({ page }) => {
      await page.goto("/work.html#data/browse");
      await expect(page.locator(".vw h1")).toHaveText("Every subject");
      await expect(page.locator(`a[href^="#data/browse?mode=grid&subject="]`).first()).toBeVisible();
      await noSideways(page, vp.width);
      await page.screenshot({ path: `test-results/browse-subjects-${vp.name}.png`, fullPage: true });
      await page.locator(`a[href^="#data/browse?mode=grid&subject=100"]`).first().click();
      await expect(page).toHaveURL(/subject=100/u);
      await expect(page.locator(`a[href*="visit=s400"]`).first()).toBeVisible();
      await noSideways(page, vp.width);
      await page.screenshot({ path: `test-results/browse-sessions-${vp.name}.png`, fullPage: true });
    });
  });
}
