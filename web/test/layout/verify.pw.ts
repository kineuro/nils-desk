// SPDX-License-Identifier: AGPL-3.0-only
// Verify mode (record 58 P1, spec 12) in a real browser, in the desk's
// shell (verify.html), at a laptop's width and at a phone's: the verify
// screen with every axis filled in, the Accept key saying Enter and the one
// line on planted values; an A/B item with its two unlabelled sides; a
// closed verify campaign's Results with the catch rate under the bar and the
// readers by account name; the make form with the Verify purpose. Nothing
// scrolls sideways. SHOTS=<dir> keeps a screenshot of each.

import { expect, test, type Page } from "@playwright/test";

const SIZES = [
  { name: "1440", width: 1440, height: 900 },
  { name: "390", width: 390, height: 844 },
];

async function shot(page: Page, name: string) {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}-${test.info().project.name}.png`, fullPage: true });
}

async function noSideways(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
}

test.setTimeout(90_000);

for (const vp of SIZES) {
  test(`at ${vp.name} px the verify screen comes filled in, Accept says Enter, one line says planted values exist`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/verify.html");
    await expect(page.locator(".suggest-words")).toHaveText("filled in Filled in: Enter accepts, or change an axis.");
    await expect(page.locator(".verify-note")).toHaveText("Some items carry a planted wrong value: check each axis.");
    await expect(page.locator(".act-answer")).toHaveText("Accept Enter");
    await expect(page.locator(".pending")).toContainText("technique MPRAGE · modifier none · construct none · base T1w · body_part brain · post_contrast not_given");
    // the header text stays
    await expect(page.locator(".rate-side")).toContainText("t1_mprage_sag");
    await noSideways(page, vp.width);
    await shot(page, `verify-screen-${vp.name}`);
    // the Accept key is on the screen without scrolling the page at a laptop's width
    if (vp.width > 1000) {
      const b = (await page.locator(".act-answer").boundingBox())!;
      expect(b.y + b.height).toBeLessThanOrEqual(vp.height);
    }
  });

  test(`at ${vp.name} px an item two sources differ on offers A and B unlabelled`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/verify.html?mode=ab");
    await expect(page.locator(".ab-side")).toHaveText(["zAtechnique MPRAGE", "xBtechnique MEMPRAGE"]);
    await expect(page.locator(".ab-bar")).not.toContainText(/rules|System 1|imported/u);
    await expect(page.locator(".act-answer")).toHaveText("Answer Enter");
    await page.keyboard.press("x");
    await expect(page.locator('.ab-side[aria-pressed="true"]')).toContainText("B");
    await expect(page.locator(".pending")).toContainText("technique MEMPRAGE");
    await noSideways(page, vp.width);
    await shot(page, `verify-ab-${vp.name}`);
  });

  test(`at ${vp.name} px Results carry the catch rate against the bar and name the readers by account`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/verify.html?mode=results");
    // the campaign's page first: what its answers are for, the planted values as the door reports them, the pace by account name
    await expect(page.locator(".facts")).toContainText("25 planted");
    await expect(page.locator(".facts")).toContainText("Verify");
    await expect(page.locator(".rater-stats tbody tr").first().locator("td").first()).toHaveText("Astrid");
    await page.getByRole("tab", { name: "Results" }).click();
    await expect(page.locator(".campaign-results .values")).toContainText("21 of 25 · 84%");
    await expect(page.locator(".catch-bar")).toContainText("under the bar");
    await expect(page.locator(".results-raters tbody tr").first().locator("td").first()).toHaveText("Astrid");
    await expect(page.locator(".results-raters tbody tr").first().locator("td").first()).toHaveAttribute("title", /^7f3a9c2e/u);
    await noSideways(page, vp.width);
    await shot(page, `verify-results-${vp.name}`);
  });

  test(`at ${vp.name} px the make form takes the Verify purpose with its share, seed and table`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/verify.html?mode=form");
    const dialog = page.locator(".dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Verify" }).click();
    await expect(dialog.getByRole("button", { name: "Verify" })).toHaveAttribute("aria-pressed", "true");
    await expect(dialog.getByLabel("Planted share")).toHaveValue("0.1");
    // a seed is made the moment Verify is chosen, as for a drawn campaign
    await expect(dialog.getByLabel("Seed")).toHaveValue(/^[0-9a-f]{16}$/u);
    await dialog.getByLabel("Confusion table").fill("MPRAGE\tMEMPRAGE\t12\nTSE\t3D-TSE\t4\nT2w\tPDw\t7\n");
    await expect(dialog.locator(".verify-fields")).toContainText("3 rows · 23 confusions");
    // nothing shown beside each item cannot be chosen: the proposal is what is verified
    await expect(dialog.getByRole("button", { name: "Nothing" })).toBeDisabled();
    await noSideways(page, vp.width);
    await shot(page, `verify-form-${vp.name}`);
  });
}
