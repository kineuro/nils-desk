// SPDX-License-Identifier: AGPL-3.0-only
// Wave 7b's screens (spec 17) in a real browser, in the desk's shell
// (software.html), at a laptop's width and at a phone's: Settings > Software
// with its packages, a run's units with who chose each knob and the numbers
// per comparability key, a refused total that says its pooling words, and
// the start of a run with the pack's goal, switches and judged units.
// Nothing scrolls sideways. SHOTS=<dir> keeps a screenshot of each.

import { expect, test, type Page } from "@playwright/test";

const SIZES = [
  { name: "1440", width: 1440, height: 900 },
  { name: "390", width: 390, height: 844 },
];

async function shot(page: Page, name: string) {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png`, fullPage: true });
}

async function noSideways(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
}

test.setTimeout(90_000);

for (const vp of SIZES) {
  test(`at ${vp.name} px Settings > Software lists each package with its next act`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/software.html#settings/software");
    const table = page.locator("table.software-table");
    await expect(table.locator("tbody tr.software-row")).toHaveCount(5);
    await expect(table).toContainText("LicenseRef-FreeSurfer: terms not accepted");
    await expect(table).toContainText("the image changed since it was installed");
    await expect(table).toContainText("CC-BY-NC-4.0: accepted by Astrid");
    await expect(table.getByRole("button", { name: "Accept", exact: true })).toBeVisible();
    await noSideways(page, vp.width);
    await shot(page, `software-${vp.name}`);
    await table.getByRole("button", { name: "Accept", exact: true }).click();
    const dialog = page.locator("dialog[open]");
    await expect(dialog).toContainText("https://surfer.nmr.mgh.harvard.edu/registration.html");
    await noSideways(page, vp.width);
    await shot(page, `software-accept-${vp.name}`);
  });

  test(`at ${vp.name} px a run's units say who chose each knob, with caveats, flags and keys`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/software.html#pipelines/runs/41");
    await expect(page.locator(".knob.person").first()).toContainText("threads8Astrid");
    await expect(page.locator(".knob.rule").first()).toContainText("rule lesions-off-without-flair");
    await expect(page.locator(".keys-apart")).toContainText("never summed together");
    await expect(page.locator(".unit-caveat")).toContainText("the T1 was acquired below 1.5 T");
    await noSideways(page, vp.width);
    await shot(page, `run-units-${vp.name}`);
  });

  test(`at ${vp.name} px a total across keys is refused in its pooling words`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/software.html?pooled#pipelines/runs/41");
    await expect(page.getByText("Not summed: several comparability keys")).toBeVisible();
    await expect(page.getByText("The table could not be read")).toHaveCount(0);
    await noSideways(page, vp.width);
    await shot(page, `run-pooled-${vp.name}`);
  });

  test(`at ${vp.name} px the start of a run offers the pack's goal and switches and the judged units`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/software.html#pipelines/catalog");
    await page.getByRole("button", { name: "Run on a selection" }).first().click();
    const dialog = page.locator("dialog[open]");
    await expect(dialog.getByRole("group", { name: "the run's goal" })).toBeVisible();
    await expect(dialog).toContainText("fixed at 0.3");
    const over = dialog.getByRole("combobox", { name: "What the run goes over" });
    await over.click();
    await page.keyboard.type("study");
    await page.keyboard.press("Enter");
    await expect(dialog.locator(".judged-list")).toContainText("skipped: the T1 is 2D");
    await dialog.getByRole("button", { name: "research" }).click();
    await expect(dialog.locator("code")).toContainText("--goal research");
    await expect(dialog.locator(".judged-list")).toContainText("skipped: the T1 is 2D");
    await noSideways(page, vp.width);
    await dialog.locator(".judged-list").scrollIntoViewIfNeeded();
    await shot(page, `run-start-${vp.name}`);
  });
}
