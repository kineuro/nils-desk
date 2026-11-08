// SPDX-License-Identifier: AGPL-3.0-only
// Review's first page and Data's Browse on a screen (Wave 7a, record 55 H3;
// spec 13.1 and 13.2; the cards of 2026-11-08): at a laptop's width (1440)
// and a phone's (390), in the desk's own shell. The page's bands of cards,
// each card's kind told by its left border's colour and never a glyph, the
// cards one to a column on a phone, nothing sideways; the make dialog
// choosing its selections from lists, drawing a pair campaign with its seed
// and its preview's counts on the foot; Browse's subjects and a subject's
// sessions from the registry's doors. Screenshots go to test-results for the
// report.

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

    test("Review opens on bands of cards, each told apart by its border, one to a column on a phone, nothing sideways", async ({ page }) => {
      await page.goto("/work.html#review");
      await expect(page.locator("h1")).toHaveText("Review");
      await expect(page.locator(".rv-band")).toHaveCount(3);
      expect(await page.locator(".rv-band").evaluateAll((bands) => bands.map((b) => b.getAttribute("aria-label")))).toEqual(["Proposed by models", "Scans to answer", "Campaigns"]);
      // what models proposed: Commit and Read on the card, the matrix a quiet link away
      const proposed = page.locator(".rv-card.proposed");
      await expect(proposed).toHaveCount(2);
      await expect(proposed.first().getByRole("button")).toHaveText(["Commit 1,701", "Read the 190"]);
      await expect(proposed.first()).toContainText("1,701 sure at 0.99 or above · 190 unsure · 12 in a campaign already · 3 proposed before the data changed");
      // UX round 5, finding 2: the model as a person names it, the registry's name under it
      await expect(proposed.first().locator(".rv-title")).toHaveText("Post-contrast · Post-contrast model");
      await expect(proposed.first().locator(".rv-sub")).toHaveText("nils-postcontrast@0.3.1");
      await expect(page.getByRole("link", { name: "Value by value" })).toHaveAttribute("href", "#review/proposals");
      // the scans to answer, one card per axis, its Answer one click from the scans
      await expect(page.locator(".rv-card.answer")).toHaveCount(3);
      await expect(page.locator(".rv-card.answer").first().getByRole("link", { name: "Answer" })).toHaveAttribute("href", "#review/questions/body_part%3Adecision");
      // the campaigns, the adjudication its own card, the person's share
      await expect(page.locator(".rv-card.campaign")).toHaveCount(6);
      await expect(page.locator(".rv-card.adjudication")).toHaveCount(1);
      await expect(page.locator(".rv-card.campaign", { hasText: "body-part-curation-round-9" })).toContainText("34 of 300 yours");
      // the fold, closed, counting what else waits; no job groups, no engine words
      const fold = page.locator(".rv-fold");
      await expect(fold.locator("summary")).toHaveText("Also waiting: 1,171 subjects, files and checks");
      expect(await fold.evaluate((d) => (d as HTMLDetailsElement).open)).toBe(false);
      await expect(page.locator(".work-group")).toHaveCount(0);
      await expect(page.getByText("Waiting in the queue.")).toHaveCount(0);
      // the side carries Review's pages (record 55 H2, round 4): no tabs in the page
      await expect(page.locator(".chips.pages")).toHaveCount(0);
      // a card's kind is the colour of its left border: three kinds, three colours, and no glyph before the title
      const borders = await page.locator(".rv-card").evaluateAll((cards) => cards.map((c) => [c.className, getComputedStyle(c).borderLeftWidth, getComputedStyle(c).borderLeftColor]));
      for (const [, w] of borders) expect(w).toBe("3px");
      const colour = (k: string) => new Set(borders.filter(([c]) => c.includes(k)).map(([, , c]) => c));
      expect(colour("proposed").size).toBe(1);
      expect(colour("campaign").size).toBe(1);
      expect([...colour("proposed")][0]).not.toBe([...colour("campaign")][0]);
      expect([...colour("adjudication")][0]).not.toBe([...colour("campaign")][0]);
      // every act sits inside the window
      for (const b of await page.locator(".rv-acts .button").all()) {
        const box = (await b.boundingBox())!;
        expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
      }
      // on a phone the cards stack to one column; on a laptop a band holds several across
      const xs = await page.locator(".rv-grid.campaigns .rv-card").evaluateAll((cards) => cards.map((c) => c.getBoundingClientRect().left));
      if (vp.width < 700) expect(new Set(xs).size).toBe(1);
      else expect(new Set(xs).size).toBeGreaterThan(1);
      await noSideways(page, vp.width);
      await page.screenshot({ path: `test-results/work-${vp.name}.png`, fullPage: true });
    });

    test("Commit closes its dialog the moment the engine answers and the page follows the re-sort; Read asks how many and which first with the estimate", async ({ page }) => {
      await page.goto("/work.html#review");
      const first = page.locator(".rv-card.proposed").first();
      await first.getByRole("button", { name: "Commit 1,701" }).click();
      const dialog = page.locator("dialog[open]");
      await expect(dialog.locator(".lede")).toHaveText("1,701 scans get post-contrast = what the model proposed, at 0.99 or above, in your name. Every page shows it once they are sorted again.");
      await expect(dialog.locator(".dialog-body p")).toHaveCount(1);
      await page.screenshot({ path: `test-results/work-commit-${vp.name}.png`, animations: "disabled" });
      await dialog.getByRole("button", { name: "Commit 1,701" }).click();
      await expect(page.locator("dialog[open]")).toHaveCount(0);
      await expect(page.locator(".said")).toContainText("Committed 1,701 post-contrast answers");
      await expect(page.locator(".said")).toHaveText("Committed 1,701 post-contrast answers · 1,701 of 1,701 sorted again", { timeout: 15000 });
      await page.screenshot({ path: `test-results/work-committed-${vp.name}.png`, fullPage: true });
      await first.getByRole("button", { name: "Read the 190" }).click();
      const read = page.locator("dialog[open]");
      await expect(read.getByRole("radiogroup", { name: "How many" }).getByRole("radio")).toHaveText(["All 190"]);
      await expect(read.getByRole("radiogroup", { name: "Which first" }).getByRole("radio")).toHaveText(["Least sure first", "Most sure first", "Random"]);
      await expect(read.locator(".rest-estimate")).toHaveText("You alone read them: about 32 min at 10 s a scan.");
      await expect(read.getByRole("button", { name: "Make a campaign of 190" })).toBeEnabled();
      const box = (await read.boundingBox())!;
      expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
      await page.screenshot({ path: `test-results/work-read-${vp.name}.png`, animations: "disabled" });
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
      await expect(page.locator("h1")).toHaveText("Review");
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
