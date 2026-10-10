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

/** The keep actions of the level shown: each within the page's gutters, and the page with nothing sideways. */
async function keepFits(page: Page, width: number, name: string) {
  const buttons = page.locator(".vw-keep > button");
  await expect(buttons, name).toHaveText(["Save as a selection", "Make a cohort"]);
  for (const b of await buttons.all()) {
    await expect(b, name).toBeVisible();
    const box = (await b.boundingBox())!;
    expect(box.x, name).toBeGreaterThanOrEqual(width < 500 ? 15 : 216);
    expect(box.x + box.width, name).toBeLessThanOrEqual(width - (width < 500 ? 15 : 31) + 1);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth), name).toBeLessThanOrEqual(width);
}

for (const [device, width, height] of [
  ["laptop", 1440, 900],
  ["phone", 390, 844],
] as const) {
  test(`on a ${device} every level's bar keeps its two actions in view, and their dialog fits`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    for (const [name, hash, card] of LEVELS) {
      await page.goto(`/grid.html${hash}`);
      await expect(page.locator(card).first()).toBeVisible();
      await keepFits(page, width, name);
      // on the subjects and the visits the actions end the filters' row; on a visit's scans, the row of Colour by and the names
      const bar = name === "scans" ? ".vw-title" : ".vw-filters";
      await expect(page.locator(`${bar} .vw-keep`), name).toHaveCount(1);
    }
    // a filter no question asks: the dialog names it and waits for the person's word, within the screen
    await page.goto("/grid.html#data/datasets/ms-a/view?mode=grid&filter=look,main:t1w");
    await page.getByRole("button", { name: "Make a cohort" }).click();
    const dialog = page.locator("dialog[open]");
    await expect(dialog.locator(".values")).toContainText("14 subjects");
    await expect(dialog.locator(".note.caution .note-lead")).toHaveText("Cannot be asked: with scans to look at?");
    const make = dialog.getByRole("button", { name: "Make the cohort" });
    await expect(make).toBeDisabled();
    await dialog.getByRole("checkbox").check();
    await expect(make).toBeEnabled();
    // measured once it has risen or faded in
    await dialog.evaluate((d) => Promise.all(d.getAnimations().map((a) => a.finished)));
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(height + 1);
    // on a phone it rises from the bottom as a sheet
    if (width < 500) expect(Math.abs(box.y + box.height - height)).toBeLessThan(2);
    await expect(make).toBeInViewport();
    await page.screenshot({ path: `test-results/grid-keep-${device}.png` });
    // Esc closes it and the page stays where it was
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    expect(new URL(page.url()).hash).toBe("#data/datasets/ms-a/view?mode=grid&filter=look,main:t1w");
  });
}
