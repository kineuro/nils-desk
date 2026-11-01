// SPDX-License-Identifier: AGPL-3.0-only
// Settings > Participation (Wave 7b step 5) in a real browser in the desk's
// own shell (participation.html): off by default, the page says nothing
// leaves and offers Take part; with ?on the status card names the site, the
// counts file previews as tables with the raw JSON folded away, Send shows
// the digest and the receiver before it posts, and the sealed read's card
// shows the draw with its rater half way and no step past Read enabled.
// Inside the window at a laptop's width and at a phone's, with no sideways
// scroll. SHOTS=<dir> keeps a screenshot of each.

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
  test(`at ${vp.name} px the page is off by default and offers Take part`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/participation.html#settings/participation");
    await expect(page.locator("h1")).toHaveText("Participation");
    await expect(page.locator('[aria-label="how the site takes part"] h2')).toHaveText("Nothing leaves this install.");
    await expect(page.getByRole("button", { name: "Take part" })).toBeDisabled();
    await expect(page.locator('[aria-label="the sealed read"]')).toHaveCount(0);
    await shot(page, `participation-off-${vp.name}`);
    await noSideways(page, vp.width);
  });

  test(`at ${vp.name} px a site taking part previews, sends after the digest is shown, and sees its draw`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/participation.html?on#settings/participation");
    await expect(page.locator('[aria-label="how the site takes part"] h2')).toHaveText("example-site shares counts and a sealed read.");
    const counts = page.locator('[aria-label="counts: preview and send"]');
    await expect(counts.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
    await counts.getByRole("button", { name: "Preview" }).click();
    await expect(counts.getByText("This is the file. Nothing else leaves.")).toBeVisible();
    await expect(counts.locator(".preview h3")).toHaveText(["about", "versions", "archive", "answers", "review", "releases", "audit"]);
    await expect(counts.locator("details pre")).toBeHidden();
    await shot(page, `participation-preview-${vp.name}`);
    await noSideways(page, vp.width);
    await counts.getByRole("button", { name: "Send", exact: true }).click();
    await expect(counts.locator('[aria-label="what the send posts"]')).toContainText("goes to https://participation.example.org");
    await counts.getByRole("button", { name: "Send it" }).click();
    await expect(counts.getByText(/^Sent\. The receiver's receipt is /)).toBeVisible();
    const sealed = page.locator('[aria-label="the sealed read"]');
    await expect(sealed).toContainText("draw 7: 1,000 stacks, seed participation-example-site-2026-11-01");
    await expect(sealed).toContainText("share 20 %");
    await expect(sealed).toContainText("rater astrid@site: 488 answered, 2 refused");
    await expect(sealed.locator("button")).toHaveCount(0);
    await shot(page, `participation-on-${vp.name}`);
    await noSideways(page, vp.width);
  });
}
