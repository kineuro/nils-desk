// SPDX-License-Identifier: AGPL-3.0-only
// The Data page in a real browser, in the desk's own shell: on a laptop the
// datasets sit four to a row, the chosen dataset's steps on one line and its
// three columns side by side; a cohort chosen draws how it grew with no event
// over another; a phone's width is one column of cards with no sideways
// scroll. Screenshots go to test-results for a look.

import { expect, test, type Locator } from "@playwright/test";

const tops = async (l: Locator) => (await l.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)))) as number[];

test("the bands and the chosen dataset use a laptop's width", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/data.html#data/datasets");
  await expect(page.locator(".dp-detail")).toHaveAttribute("aria-label", "study-big");
  await expect(page.locator(".dp-running")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
  // four datasets to a row, two cohorts beside each other
  expect(new Set(await tops(page.locator(".dp-grid.datasets .dp-card"))).size).toBe(1);
  expect(new Set(await tops(page.locator(".dp-grid.cohorts .dp-card"))).size).toBe(1);
  // the steps on one line, the three columns side by side
  expect(new Set(await tops(page.locator(".dp-step"))).size).toBe(1);
  expect(new Set(await tops(page.locator(".dp-col"))).size).toBe(1);
  // a card's six steps are one thin bar, and the chosen card is framed
  const rail = await page.locator(".dp-card.on .dp-rail").boundingBox();
  expect(rail!.height).toBeLessThan(8);
  await page.screenshot({ path: "test-results/data-laptop.png", fullPage: true });
});

test("a cohort chosen draws how it grew, no event over another", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/data.html#data/datasets?cohort=ms-followup");
  await expect(page.locator(".dp-detail")).toHaveAttribute("aria-label", "ms-followup");
  await expect(page.locator(".dp-ev")).toHaveCount(5);
  const boxes = await page.locator(".dp-ev").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ left: r.left, right: r.right })));
  for (let i = 1; i < boxes.length; i++) expect(boxes[i].left).toBeGreaterThanOrEqual(boxes[i - 1].right - 1);
  const line = await page.locator(".dp-grew").boundingBox();
  expect(boxes[boxes.length - 1].right).toBeLessThanOrEqual(line!.x + line!.width + 1);
  // the datasets that feed it light up, the rest dim
  await expect(page.locator(".dp-grid.datasets .dp-card.rel")).toHaveCount(2);
  await expect(page.locator(".dp-grid.datasets .dp-card.dim")).toHaveCount(2);
  await page.screenshot({ path: "test-results/data-cohort.png", fullPage: true });
});

test("a phone's width is one column with no sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/data.html#data/datasets");
  await expect(page.locator(".dp-detail")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const lefts = await page.locator(".dp-card").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
  expect(new Set(lefts).size).toBe(1);
  // the steps two to a row
  expect(new Set(await tops(page.locator(".dp-step"))).size).toBe(3);
  await page.screenshot({ path: "test-results/data-phone.png", fullPage: true });
});
