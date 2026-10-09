// SPDX-License-Identifier: AGPL-3.0-only
// The dataset view in a real browser: the page is the dataset's, the scan
// fills most of it, the chrome is two slim lines and a tree, the arrows walk
// the tree and the picture follows, and a phone's width is one column with
// no sideways scroll. Screenshots go to test-results for a look.

import { expect, test } from "@playwright/test";

test("the scan is the hero on a laptop screen", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dataset.html");
  await expect(page.locator(".dview-row.scan.on")).toHaveCount(1);
  await expect(page.locator(".scan-canvas canvas.on")).toHaveCount(1, { timeout: 10_000 });
  const view = await page.locator(".dview").boundingBox();
  const canvas = await page.locator(".scan-canvas").boundingBox();
  const top = await page.locator(".dview-top").boundingBox();
  const facts = await page.locator(".dview-facts").boundingBox();
  expect(view).toMatchObject({ x: 0, y: 0, width: 1440, height: 900 });
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
