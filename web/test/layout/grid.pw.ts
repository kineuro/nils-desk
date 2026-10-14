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
  // a visit's families are outlined apart from the plain scans (SyMRI, SWI, the spine), the scouts folded
  await expect(page.locator(".vw-family")).toHaveCount(3);
  await expect(page.locator(".vw-folder-head[aria-expanded='false']")).toHaveCount(1);
});

for (const [device, width, height] of [
  ["laptop", 1440, 900],
  ["phone", 390, 844],
] as const) {
  test(`on a ${device} an acquisition's own images sit in its family's box, and a reverse b0 says what it is for`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/grid.html#data/datasets/ms-a/view?mode=grid&subject=1&visit=s30");
    await expect(page.locator(".vw-scan").first()).toBeVisible();
    const box = (word: string) => page.locator(".vw-family").filter({ has: page.locator(".vw-family-name", { hasText: word }) });
    // SyMRI's acquisition first, beside its three synthetic images
    await expect(box("SyMRI").locator(".vw-scan-name")).toHaveText(["Ax_2D_MDME_Magnitude-ND", "Ax_T1w_2D_MDME_SyntheticT1w", "Ax_T2w_2D_MDME_SyntheticT2w", "Ax_FLAIR_2D_MDME_SyntheticFLAIR"]);
    // the SWI's magnitude, phase, processed image and minIP in one box
    await expect(box("SWI").locator(".vw-scan-name")).toHaveText(["Sag_T2starw_3D_GRE-EPI_Magnitude_WaterExc", "Sag_3D_GRE-EPI_Phase_WaterExc", "Ax_SWI_3D_FLASH_SWI", "Ax_SWI_3D_FLASH_MinIP"]);
    await expect(page.locator(".vw-family-name")).toHaveText(["SyMRI", "SWI", "Spine and neck"]);
    // the folders, ASL's named for what it holds
    await expect(page.locator(".vw-folder-name")).toHaveText(["anat", "dwi", "fmap", "Perfusion (ASL)", "scouts and other"]);
    // the reverse phase-encoding b0's line, inside its card and readable
    const hint = page.locator(".vw-scan-hint");
    await expect(hint).toHaveText(["reverse phase encoding, used to correct the DWI's distortion"]);
    const card = (await page.locator(".vw-scan").filter({ has: hint }).boundingBox())!;
    const line = (await hint.boundingBox())!;
    expect(line.x).toBeGreaterThanOrEqual(card.x);
    expect(line.x + line.width).toBeLessThanOrEqual(card.x + card.width + 1);
    expect(line.y + line.height).toBeLessThanOrEqual(card.y + card.height + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    // a look at each: SyMRI's box from its top, SWI's (on a phone a screen of its own), and fmap with perf
    await box("SyMRI").evaluate((e) => e.scrollIntoView({ block: "start" }));
    await page.screenshot({ path: `test-results/grid-families-${device}.png` });
    if (width < 500) {
      await box("SWI").evaluate((e) => e.scrollIntoView({ block: "start" }));
      await page.screenshot({ path: `test-results/grid-families-swi-${device}.png` });
    }
    await page.locator(".vw-folder", { has: hint }).evaluate((e) => e.scrollIntoView({ block: "start" }));
    await page.screenshot({ path: `test-results/grid-families-fmap-${device}.png` });
  });
}

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
