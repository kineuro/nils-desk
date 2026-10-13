// SPDX-License-Identifier: AGPL-3.0-only
// A finished run and what it made (2026-10-13), in a real browser in the
// desk's own shell (results.html), at a laptop's width and at a phone's: a
// pipeline run's job, in Now and in All jobs, opens its run on a click
// anywhere on its card and by Open run from the keyboard; the Catalog's
// row says its newest run on one line, inside its cell, and the line opens
// the run, as does a Runs table row anywhere but its links; the run's page
// lists the files by session and offers View on each session with a mask;
// View draws the session's scan with its chips, the mask's switch and the
// way through the sessions, and nothing scrolls sideways. SHOTS=<dir> keeps a
// screenshot of each.

import { expect, test, type Page } from "@playwright/test";

const SIZES = [
  { name: "1440", width: 1440, height: 900 },
  { name: "390", width: 390, height: 844 },
];

async function shot(page: Page, name: string) {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}-${test.info().project.name}.png`, fullPage: true });
}

/** Nothing scrolls sideways: the page is no wider than the window. */
async function noSideways(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
}

for (const vp of SIZES) {
  test(`at ${vp.name} px a pipeline run's job opens its run, in Now and in All jobs`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/results.html#pipelines");
    const running = page.locator(".job", { hasText: "job 74" }).first();
    await expect(running.getByRole("link", { name: "Open run" })).toHaveAttribute("href", "#pipelines/runs/17");
    const done = page.locator(".job", { hasText: "3 of 3 made" });
    await expect(done).toHaveCount(1);
    const open = done.getByRole("link", { name: "Open run" });
    const box = (await open.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
    await noSideways(page, vp.width);
    await shot(page, `results-jobs-${vp.name}`);
    // a click anywhere on the card but its buttons opens the run; Open run is the same by the keyboard
    await done.locator(".what b").click();
    await expect(page).toHaveURL(/#pipelines\/runs\/16$/u);
    await expect(page.locator("h1")).toHaveText("Run 16");
    await page.goto("/results.html#pipelines");
    await page.locator(".job", { hasText: "3 of 3 made" }).getByRole("link", { name: "Open run" }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#pipelines\/runs\/16$/u);
  });

  test(`at ${vp.name} px a catalog row says its newest run on one line, which opens it, and a Runs row opens its run`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/results.html#pipelines/catalog");
    const last = page.locator("a.catalog-last");
    await expect(last).toHaveCount(2);
    await expect(last.first()).toHaveText(/^last run 16 · 3 of 3 made · today \d\d:\d\d$/u);
    await expect(last.first()).toHaveClass(/\bok\b/u);
    await expect(last.nth(1)).toHaveClass(/\bcaution\b/u);
    for (const b of await last.evaluateAll((els) => els.map((e) => ({ r: e.getBoundingClientRect().toJSON() as DOMRect, cell: e.closest("td")!.getBoundingClientRect().toJSON() as DOMRect, lh: parseFloat(getComputedStyle(e).lineHeight) || 20 })))) {
      // one line, inside its cell
      expect(b.r.height).toBeLessThan(b.lh * 1.6);
      expect(b.r.right).toBeLessThanOrEqual(b.cell.right + 0.5);
    }
    await noSideways(page, vp.width);
    await shot(page, `results-catalog-${vp.name}`);
    await last.first().click();
    await expect(page).toHaveURL(/#pipelines\/runs\/16$/u);
    // the Runs table: a click anywhere on the row but its links opens the run
    await page.goto("/results.html#pipelines/catalog");
    const row = page.locator("tr.openable", { hasText: "n4-bias-correction@1" }).first();
    await row.locator("td").nth(1).click();
    await expect(page).toHaveURL(/#pipelines\/runs\/12$/u);
  });

  test(`at ${vp.name} px a run's page lists its files by session and View draws a session's mask over its scan`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/results.html#pipelines/runs/16");
    const views = page.locator(".run-page").getByRole("link", { name: /^View / });
    await expect(views).toHaveCount(2);
    const files = page.locator("table.run-files tbody tr");
    await expect(files).toHaveCount(5);
    await expect(files.first().locator("td").nth(1)).toHaveText("acq-Sag+3D+MPRAGE_desc-samseg_dseg.nii.gz");
    await expect(files.first().locator("td").nth(3)).toHaveText("101 KB");
    await noSideways(page, vp.width);
    await shot(page, `results-run-${vp.name}`);
    await views.first().click();
    await expect(page).toHaveURL(/#pipelines\/runs\/16\?view=sub-7a8b9c0d_ses-20240312$/u);
    const result = page.locator(".run-result");
    await expect(result.locator(".result-unit")).toHaveText("sub-7a8b9c0d_ses-20240312");
    await expect(result.getByRole("group", { name: "what is drawn" }).getByRole("button")).toHaveText(["Lesions 3", "Structures 6"]);
    await expect(result.locator(".viewer")).toHaveCount(1);
    await expect(result.getByRole("button", { name: /^Mask/u })).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("o");
    await expect(result.getByRole("button", { name: /^Mask/u })).toHaveAttribute("aria-pressed", "false");
    await result.getByRole("button", { name: "Structures 6" }).click();
    await expect(result.getByRole("button", { name: "Structures 6" })).toHaveAttribute("aria-pressed", "true");
    const stage = (await result.locator(".viewer").boundingBox())!;
    expect(stage.x).toBeGreaterThanOrEqual(0);
    expect(stage.x + stage.width).toBeLessThanOrEqual(vp.width);
    await noSideways(page, vp.width);
    await shot(page, `results-view-${vp.name}`);
    // Next goes to the other session with a mask; the session with none is not stepped to
    await result.getByRole("link", { name: "Next" }).click();
    await expect(result.locator(".result-unit")).toHaveText("sub-1e2f3a4b_ses-20240605");
    await expect(result.getByRole("link", { name: "Next" })).toHaveCount(0);
    await result.getByRole("link", { name: "Back to run 16" }).click();
    await expect(page).toHaveURL(/#pipelines\/runs\/16$/u);
  });
}
