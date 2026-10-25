// SPDX-License-Identifier: AGPL-3.0-only
// Setup after a command-line install (agenda 3.8), in a real browser in the
// desk's own shell (setup.html): the registry holds stacks and names no
// source place, so the root-folder step holds and says the data came in from
// the command line; the backup and sign-in steps stay listed; the page says
// the desk is open and Home opens from it, and the side holds Review and
// Data. With ?empty nothing was digested: the step is needed, the line is
// gone and the side holds Home alone. Inside the window at a laptop's width
// and at a phone's. SHOTS=<dir> keeps a screenshot of each.

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

const card = (page: Page, title: string) => page.locator("li.setup-card").filter({ has: page.locator("b", { hasText: new RegExp(`^${title}$`, "u") }) });
const side = (page: Page, title: string) => page.locator("#side").getByText(title, { exact: true });

for (const vp of SIZES) {
  test(`at ${vp.name} px a registry digested from the command line opens on Home, keeps Setup in Settings and says nobody signs in`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/setup.html#home");
    await expect(page.locator("h1")).toHaveText("What NILS holds, and what needs you");
    const banner = page.locator(".banner");
    await expect(banner).toContainText("Nobody signs in: anyone who reaches this address can do everything.");
    await expect(banner.locator('a[href$="settings/people"]')).toHaveText("Decide who signs in.");
    // the side is the whole desk's and its Home opens Home
    await expect(side(page, "Review")).toBeAttached();
    await expect(side(page, "Data")).toBeAttached();
    await expect(side(page, "Get started")).toHaveCount(0);
    await shot(page, `setup-data-home-${vp.name}`);
    await noSideways(page, vp.width);
    // Settings > Setup keeps the page
    await page.goto("/setup.html#settings/setup");
    await expect(page.locator("h1")).toHaveText("Set up NILS");
    const folder = card(page, "Add a root folder");
    await expect(folder).toContainText("done");
    await expect(folder).toContainText("12,480 stacks are in the registry. A root folder can still be added.");
    await expect(card(page, "Keep the registry safe")).toContainText("needed");
    await expect(card(page, "Decide who signs in")).toContainText("needed");
    await expect(page.locator(".progress-row .meta")).toHaveText("2 of the 4 steps the desk needs are done.");
    await expect(page.locator(".banner")).toContainText("Nobody signs in");
    const line = page.locator("a.setup-line");
    await expect(line).toContainText("Your data is in. Review, Browse and the viewer are open.");
    await shot(page, `setup-data-${vp.name}`);
    await noSideways(page, vp.width);
    // the in-page line lands on Home
    await line.click();
    await expect(page.locator("h1")).toHaveText("What NILS holds, and what needs you");
    // and so does the side's Home, from the setup page
    await page.goto("/setup.html#settings/setup");
    await expect(page.locator("h1")).toHaveText("Set up NILS");
    if (vp.width < 700) await page.getByRole("button", { name: "Sections" }).click();
    await page.locator("#side").getByRole("link", { name: "Home", exact: true }).click();
    await expect(page.locator("h1")).toHaveText("What NILS holds, and what needs you");
  });

  test(`at ${vp.name} px an empty registry with no source place needs the root folder and holds the desk`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/setup.html?empty#home");
    await expect(page.locator("h1")).toHaveText("Set up NILS");
    const folder = card(page, "Add a root folder");
    await expect(folder).toContainText("needed");
    await expect(folder).toContainText("Where your dataset folders live.");
    await expect(page.locator(".progress-row .meta")).toHaveText("1 of the 4 steps the desk needs is done.");
    await expect(page.locator("a.setup-line")).toHaveCount(0);
    await expect(side(page, "Review")).toHaveCount(0);
    await expect(side(page, "Get started")).toBeAttached();
    await expect(page.locator(".banner")).toContainText("Nobody signs in");
    await shot(page, `setup-empty-${vp.name}`);
    await noSideways(page, vp.width);
  });
}
