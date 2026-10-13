// SPDX-License-Identifier: AGPL-3.0-only
// Settings, Parts with rules releases of their own (record 55 B5), in a real
// browser in the desk's own shell (parts.html): a row per first-party pack,
// the MRI rules with their own newer release and an Update that takes the
// rules alone, the clinical rules' newer release waiting for a newer engine,
// and the site's own pack kept; the update panel says the rules move with
// nothing started again; and with ?pinned the MRI rules say their pin and
// offer nothing. Inside the window at a laptop's width and at a phone's.
// SHOTS=<dir> keeps a screenshot of each.

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

const row = (page: Page, title: string) => page.locator("tr").filter({ has: page.locator("b", { hasText: new RegExp(`^${title}$`, "u") }) });

for (const vp of SIZES) {
  test(`at ${vp.name} px Parts has a row per rule pack, the MRI rules' own release with its Update`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/parts.html#settings/parts");
    const mri = row(page, "MRI rules");
    await expect(mri).toContainText("mri 1.0.3");
    await expect(mri.locator(".tag.brand")).toHaveText("1.1.0");
    await expect(row(page, "Clinical rules")).toContainText("0.4.0 waits for a newer engine");
    await expect(row(page, "Clinical rules").getByRole("button", { name: "Update" })).toHaveCount(0);
    await expect(row(page, "Site's packs")).toContainText("site-ct 2.0.0");
    await expect(page.locator("section.update")).toContainText("The MRI rules move from 1.0.3 to 1.1.0, their own release; the engine reads them at its next look, and nothing is started again.");
    await shot(page, `parts-rules-${vp.name}`);
    await noSideways(page, vp.width);
    await mri.getByRole("button", { name: "Update" }).click();
    // the rules alone, as nils update --part rules takes them
    await expect.poll(() => page.evaluate(() => (window as unknown as { updates: unknown[] }).updates)).toEqual([{ part: "rules" }]);
  });

  test(`at ${vp.name} px a pinned pack says its pin and offers nothing`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/parts.html?pinned#settings/parts");
    const mri = row(page, "MRI rules");
    await expect(mri).toContainText("mri 1.0.0");
    await expect(mri).toContainText("pinned at 1.0.0");
    await expect(mri).toContainText("pinned; 1.1.0 is out");
    await expect(mri.getByRole("button", { name: "Update" })).toHaveCount(0);
    await shot(page, `parts-pinned-${vp.name}`);
    await noSideways(page, vp.width);
  });
}
