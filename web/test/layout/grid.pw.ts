// SPDX-License-Identifier: AGPL-3.0-only
// The dataset viewer's grid in a real browser: on a laptop the subjects fill
// rows of folders, a subject's visits sit side by side, and a visit's scans
// fill rows of pictures in their folders and families; on a phone every level
// is one column with nothing sideways. Screenshots go to test-results.

import { expect, test, type Page } from "@playwright/test";

/** How many cards share the first row. */
async function perRow(page: Page, selector: string): Promise<number> {
  return page.evaluate((sel) => {
    const tops = [...document.querySelectorAll(sel)].map((c) => Math.round(c.getBoundingClientRect().top));
    return tops.filter((t) => t === tops[0]).length;
  }, selector);
}

const LEVELS: [string, string, string][] = [
  ["subjects", "#data/datasets/ms-a/view?mode=grid", ".vw-card"],
  ["visits", "#data/datasets/ms-a/view?mode=grid&subject=1", ".vw-card.visit"],
  ["scans", "#data/datasets/ms-a/view?mode=grid&subject=1&visit=s30", ".vw-scan"],
];

test("on a laptop the cards fill rows on every level, and nothing scrolls sideways", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const [name, hash, card] of LEVELS) {
    await page.goto(`/grid.html${hash}`);
    await expect(page.locator(card).first()).toBeVisible();
    const wide = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(wide, name).toBeLessThanOrEqual(1440);
    const row = await perRow(page, card);
    expect(row, name).toBeGreaterThanOrEqual(name === "visits" ? 2 : 4);
    await page.screenshot({ path: `test-results/grid-${name}-laptop.png` });
  }
  // a visit's families are outlined apart from the plain scans, the scouts folded
  await expect(page.locator(".vw-family")).toHaveCount(2);
  await expect(page.locator(".vw-folder-head[aria-expanded='false']")).toHaveCount(1);
});

test("on a phone every level keeps within the gutters, nothing sideways", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [name, hash, card] of LEVELS) {
    await page.goto(`/grid.html${hash}`);
    await expect(page.locator(card).first()).toBeVisible();
    const wide = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(wide, name).toBeLessThanOrEqual(390);
    const box = await page.locator(card).first().boundingBox();
    expect(box!.x, name).toBeGreaterThanOrEqual(15);
    expect(box!.x + box!.width, name).toBeLessThanOrEqual(375 + 1);
    await page.screenshot({ path: `test-results/grid-${name}-phone.png` });
  }
});
