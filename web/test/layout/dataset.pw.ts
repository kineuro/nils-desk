// SPDX-License-Identifier: AGPL-3.0-only
// The dataset viewer's browser in a real browser: under the top bar the page
// is the dataset's, the scan fills most of it, the chrome is two slim lines
// and a tree, the arrows walk the tree and the picture follows, and a phone's
// width is one column with no sideways scroll. Screenshots go to
// test-results for a look.

import { expect, test } from "@playwright/test";

test("the scan is the hero on a laptop screen", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dataset.html");
  await expect(page.locator(".dview-row.scan.on")).toHaveCount(1);
  await expect(page.locator(".scan-canvas canvas.on")).toHaveCount(1, { timeout: 10_000 });
  const view = await page.locator(".dview").boundingBox();
  const bar = await page.locator(".top").boundingBox();
  const canvas = await page.locator(".scan-canvas").boundingBox();
  const top = await page.locator(".dview-top").boundingBox();
  const facts = await page.locator(".dview-facts").boundingBox();
  // everything under the shell's top bar, the side folded away
  expect(view).toMatchObject({ x: 0, width: 1440 });
  expect(Math.abs(view!.y - bar!.height)).toBeLessThan(2);
  expect(Math.abs(view!.y + view!.height - 900)).toBeLessThan(2);
  // the picture takes most of the page; the chrome above and below stays slim
  expect((canvas!.width * canvas!.height) / (1440 * 900)).toBeGreaterThan(0.6);
  expect(top!.height).toBeLessThan(56);
  expect(facts!.height).toBeLessThan(64);
  await page.screenshot({ path: "test-results/dataset-laptop.png" });
  // the arrows walk the tree, and the picture follows
  await page.locator(".dview-row.scan.on").focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".dview-row.scan.on .dview-name")).toHaveText("Ax_T2w_2D_FLAIR_IR-TSE_ND");
  await expect(page.locator(".dview-where b")).toHaveText("Ax_T2w_2D_FLAIR_IR-TSE_ND");
  await page.screenshot({ path: "test-results/dataset-look.png" });
});

test("a phone's width is one column with no sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dataset.html");
  await expect(page.locator(".dview-row.scan.on")).toHaveCount(1);
  const wide = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(wide).toBeLessThanOrEqual(390);
  const side = await page.locator(".dview-side").boundingBox();
  const main = await page.locator(".dview-main").boundingBox();
  expect(main!.y).toBeGreaterThanOrEqual(side!.y + side!.height - 1);
  await page.screenshot({ path: "test-results/dataset-phone.png" });
});

for (const [device, width, height] of [
  ["laptop", 1440, 900],
  ["phone", 390, 844],
] as const) {
  test(`on a ${device} the filter's line keeps what it leaves, within the tree's width`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/dataset.html");
    await expect(page.locator(".dview-row.scan.on")).toHaveCount(1);
    const line = page.locator(".dview-keep");
    await expect(line.locator(".meta")).toHaveText("72");
    await page.locator(".dview-filter input").fill("flair");
    await expect(line.locator(".meta")).toHaveText("9 of 72");
    const side = (await page.locator(".dview-side").boundingBox())!;
    for (const b of await line.locator(".vw-keep > button").all()) {
      await expect(b).toBeVisible();
      const box = (await b.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(side.x);
      expect(box.x + box.width).toBeLessThanOrEqual(side.x + side.width + 1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: `test-results/dataset-keep-${device}.png` });
    // the dialog says what the words left and fits the screen
    await page.getByRole("button", { name: "Save as a selection" }).click();
    const dialog = page.locator("dialog[open]");
    await expect(dialog.locator(".values")).toContainText("matching flair");
    await expect(dialog.locator(".values")).toContainText("9 scans of 6 subjects");
    await expect(dialog.locator(".note")).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Save" })).toBeInViewport();
    // measured once it has risen or faded in
    await dialog.evaluate((d) => Promise.all(d.getAnimations().map((a) => a.finished)));
    const box = (await dialog.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(height + 1);
    await page.screenshot({ path: `test-results/dataset-keep-dialog-${device}.png` });
    // its keys are its own: Esc closes it, and the scan stays open where it was
    const before = new URL(page.url()).hash;
    await dialog.getByRole("button", { name: "Cancel" }).focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    expect(new URL(page.url()).hash).toBe(before);
    await expect(page.locator(".dview-row.scan.on .dview-name")).toHaveText("Ax_T2w_2D_FLAIR_IR-TSE_ND");
  });
}
