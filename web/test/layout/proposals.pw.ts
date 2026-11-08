// SPDX-License-Identifier: AGPL-3.0-only
// Review / Proposals per model and axis on a screen (UX round 1): at a
// laptop's width (1440) and a phone's (390), in the desk's own shell. Opened
// from the model's row low on Work, the page shows its head and the
// Proposals tab in view; each model and axis is a card with its two acts,
// nothing sideways; the commit's confirm and the campaign's dialog fit.
// Screenshots go to test-results for the report.

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

    test("Review's first page shows the proposals as cards with Commit and Read; Value by value opens the Proposals page on its tab, and each model and axis is a card with its two acts", async ({ page }) => {
      await page.goto("/proposals.html#review");
      await expect(page.locator("h1")).toHaveText("Review");
      await expect(page.locator(".rv-card.proposed")).toHaveCount(2);
      await expect(page.locator(".rv-card.proposed").first().getByRole("button")).toHaveText(["Commit 1,204", "Read the 4,838"]);
      const open = page.getByRole("link", { name: "Value by value" });
      await open.scrollIntoViewIfNeeded();
      await open.click();
      await expect(page.locator("h1")).toHaveText("What models proposed");
      await expect(page.locator(".chips.pages .opt.on")).toBeInViewport();
      await expect(page.locator(".proposal-card")).toHaveCount(2);
      const first = page.locator(".proposal-card").first();
      await expect(first.getByRole("button")).toHaveText(["Commit the 1,204 at or above the threshold", "Make a campaign of the other 4,838 for me"]);
      for (const b of await page.locator(".proposal-card button").all()) {
        const box = (await b.boundingBox())!;
        expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
      }
      await noSideways(page, vp.width);
      await page.screenshot({ path: `test-results/proposals-${vp.name}.png`, fullPage: true });
    });

    test("the commit's confirm says what happens in one paragraph, closes on the answer, and the page follows the re-sort and shows what is left", async ({ page }) => {
      await page.goto("/proposals.html#review/proposals");
      await expect(page.locator(".proposal-card").first()).toContainText("Body part model");
      await page.getByRole("button", { name: "Commit the 1,204 at or above the threshold" }).click();
      const dialog = page.locator("dialog[open]");
      await expect(dialog.locator(".lede")).toHaveText("1,204 scans get body part = what the model proposed, at 0.90 or above, in your name. Every page shows it once they are sorted again.");
      await expect(dialog.locator(".dialog-body p")).toHaveCount(1);
      await page.screenshot({ path: `test-results/proposals-commit-${vp.name}.png`, animations: "disabled" });
      await dialog.getByRole("button", { name: "Commit 1,204" }).click();
      await expect(page.locator("dialog[open]")).toHaveCount(0);
      await expect(page.locator(".said")).toContainText("Committed 1,204 body part answers");
      await expect(page.locator(".said")).toHaveText("Committed 1,204 body part answers · 1,204 of 1,204 sorted again", { timeout: 15000 });
      await expect(page.locator(".proposal-card").first().getByRole("button")).toHaveText(["Make a campaign of the other 4,838 for me"]);
      await noSideways(page, vp.width);
      await page.screenshot({ path: `test-results/proposals-after-${vp.name}.png`, fullPage: true });
    });

    test("the campaign of the rest asks its name, how many and which first, says what it would take, and lands on the new campaign", async ({ page }) => {
      await page.goto("/proposals.html#review/proposals");
      await page.getByRole("button", { name: "Make a campaign of the other 4,838 for me" }).click();
      const dialog = page.locator("dialog[open]");
      await expect(dialog.getByLabel("Name")).toHaveValue("bodypart-head-body_part-unsure");
      await expect(dialog.getByRole("radiogroup", { name: "How many" }).getByRole("radio")).toHaveText(["500", "All 4,838"]);
      await expect(dialog.getByRole("radiogroup", { name: "Which first" }).getByRole("radio")).toHaveText(["Least sure first", "Most sure first", "Random"]);
      await expect(dialog.locator(".rest-estimate")).toHaveText("You alone read them: about 1 h 25 min at 10 s a scan.");
      await dialog.getByRole("radio", { name: "All 4,838" }).click();
      await expect(dialog.locator(".rest-estimate")).toHaveText("You alone read them: about 13 h 42 min at 10 s a scan.");
      await dialog.getByRole("radio", { name: "500" }).click();
      const box = (await dialog.boundingBox())!;
      expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
      await page.screenshot({ path: `test-results/proposals-campaign-${vp.name}.png`, animations: "disabled" });
      await dialog.getByRole("button", { name: "Make a campaign of 500" }).click();
      await expect(page).toHaveURL(/#review\/campaigns\/12$/u);
    });
  });
}
