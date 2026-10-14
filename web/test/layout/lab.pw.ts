// SPDX-License-Identifier: AGPL-3.0-only
// T32's look in a real browser (record 55 H3): the desk's own pages over a
// lab engine (lab.tsx), at a laptop's width and a phone's: Review's one list
// with the lab's campaigns and questions, the make dialog choosing a real
// selection, Browse over the lab registry, and a cohort's heatmap. Pictures
// go to test-results. Skipped unless LAB_ENGINE names a lab engine
// (LAB_TOKEN its person's token, LAB_COHORT a cohort of it).

import { expect, test } from "@playwright/test";

const LAB = process.env.LAB_ENGINE ?? "";
const COHORT = process.env.LAB_COHORT ?? "";

for (const vp of [
  { name: "laptop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
]) {
  test.describe(`the lab at ${vp.width}`, () => {
    test.skip(!LAB, "no lab engine named");
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test("Review's one list, the make dialog, Browse and the heatmap, nothing sideways", async ({ page }) => {
      const sideways = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(vp.width);
      await page.goto("/lab.html#review");
      await expect(page.locator("h1")).toHaveText("Work");
      await expect(page.locator(".work-row").first()).toBeVisible();
      await sideways();
      await page.screenshot({ path: `test-results/lab-work-${vp.name}.png`, fullPage: true });
      await page.goto("/lab.html#review/campaigns?make=1");
      await expect(page.locator("dialog")).toBeVisible();
      await expect(page.locator("dialog").getByLabel("A selection", { exact: true }).locator("option").nth(1)).toBeAttached();
      await page.screenshot({ path: `test-results/lab-make-${vp.name}.png` });
      await page.goto("/lab.html#data/browse");
      await expect(page.locator(".vw h1")).toHaveText("Every subject");
      await sideways();
      await page.screenshot({ path: `test-results/lab-browse-${vp.name}.png`, fullPage: true });
      if (COHORT) {
        await page.goto(`/lab.html#data/datasets?cohort=${encodeURIComponent(COHORT)}`);
        await expect(page.locator(".heat-row").first()).toBeVisible({ timeout: 30_000 });
        await sideways();
        await page.locator(".heat").screenshot({ path: `test-results/lab-heat-${vp.name}.png` });
      }
    });
  });
}
