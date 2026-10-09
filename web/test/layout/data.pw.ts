// SPDX-License-Identifier: AGPL-3.0-only
// The Data page in a real browser, in the desk's own shell: on a laptop the
// datasets sit four to a row, the chosen dataset's eight steps on one line and
// its three columns side by side; a cohort chosen draws how it grew with no
// event over another and its four steps on one line; a narrower window folds
// the rail four to a row; a phone's width is one column of cards with no
// sideways scroll; body part's and post-contrast's Run sit inside their steps.
// Screenshots go to test-results for a look.

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
  // the eight steps on one line, body part and post-contrast after sorted, the three columns side by side
  await expect(page.locator(".dp-step")).toHaveCount(8);
  expect(new Set(await tops(page.locator(".dp-step"))).size).toBe(1);
  await expect(page.locator(".dp-step-title").nth(3)).toHaveText("Body part");
  await expect(page.locator(".dp-step-title").nth(4)).toHaveText("Post-contrast");
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
  // where it is: its four steps on one line
  await expect(page.locator(".dp-step")).toHaveCount(4);
  expect(new Set(await tops(page.locator(".dp-step"))).size).toBe(1);
  // the datasets that feed it light up, the rest dim
  await expect(page.locator(".dp-grid.datasets .dp-card.rel")).toHaveCount(2);
  await expect(page.locator(".dp-grid.datasets .dp-card.dim")).toHaveCount(2);
  await page.screenshot({ path: "test-results/data-cohort.png", fullPage: true });
});

test("body part and post-contrast carry their Run inside their steps, post-contrast's held with its reason", async ({ page }) => {
  for (const [width, rows] of [
    [1440, 1],
    [390, 4],
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/data.html#data/datasets");
    await expect(page.locator(".dp-detail")).toHaveAttribute("aria-label", "study-big");
    const runs = page.locator(".dp-detail .dp-step-run");
    await expect(runs).toHaveCount(2);
    await expect(runs.nth(0).locator("button")).toHaveText("Run again");
    await expect(runs.nth(0).locator("button")).toBeEnabled();
    await expect(runs.nth(1).locator("button")).toHaveText("Run");
    await expect(runs.nth(1).locator("button")).toBeDisabled();
    await expect(runs.nth(1).locator(".hint")).toHaveAttribute("title", "no post-contrast model is installed");
    // each Run on one line inside its step, the rail as it was
    for (const i of [3, 4]) {
      const cell = (await page.locator(".dp-detail .dp-step").nth(i).boundingBox())!;
      const run = (await page.locator(".dp-detail .dp-step").nth(i).locator(".dp-step-run").boundingBox())!;
      expect(run.x).toBeGreaterThanOrEqual(cell.x - 1);
      expect(run.x + run.width).toBeLessThanOrEqual(cell.x + cell.width + 1);
      expect(run.height).toBeLessThan(40);
    }
    expect(new Set(await tops(page.locator(".dp-detail .dp-step"))).size).toBe(rows);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.locator(".dp-detail .dp-steps").screenshot({ path: `test-results/data-step-run-${width}.png` });
  }
});

test("a narrower window folds the eight steps four to a row", async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 900 });
  await page.goto("/data.html#data/datasets");
  await expect(page.locator(".dp-detail")).toHaveAttribute("aria-label", "study-big");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1000);
  expect(new Set(await tops(page.locator(".dp-step"))).size).toBe(2);
  await page.screenshot({ path: "test-results/data-narrower.png", fullPage: true });
});

test("a phone's width is one column with no sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/data.html#data/datasets");
  await expect(page.locator(".dp-detail")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const lefts = await page.locator(".dp-card").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
  expect(new Set(lefts).size).toBe(1);
  // the eight steps two to a row
  expect(new Set(await tops(page.locator(".dp-step"))).size).toBe(4);
  await page.screenshot({ path: "test-results/data-phone.png", fullPage: true });
});

test("an identified dataset's pseudonymise step opens in place, its three boxes side by side", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/data.html#data/datasets?dataset=study-identified");
  await expect(page.locator(".dp-detail")).toHaveAttribute("aria-label", "study-identified");
  await expect(page.locator(".dp-detail .ps-step")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
  // the nine steps on one line, Pseudonymised between Found and Read, next and open
  await expect(page.locator(".dp-step")).toHaveCount(9);
  expect(new Set(await tops(page.locator(".dp-step"))).size).toBe(1);
  await expect(page.locator(".dp-step-title").nth(1)).toHaveText("Pseudonymised");
  await expect(page.locator(".dp-step.next .dp-step-pick")).toHaveAttribute("aria-expanded", "true");
  // the three boxes on one line, the IDs' box between the originals and the copy
  expect(new Set(await tops(page.locator(".ps-step .ps-box"))).size).toBe(1);
  await expect(page.locator(".ps-step .ps-actions .button").first()).toHaveText("Give the 4 IDs a code");
  await page.locator(".dp-detail").screenshot({ path: "test-results/data-pseudonymise.png" });
  // giving the IDs a code, in place: one row each, the code's column and the way out on the row's own line
  await page.locator(".ps-step .ps-actions .button").first().click();
  await expect(page.locator(".ps-table .ps-row:not(.head)")).toHaveCount(4);
  // each row one line: no cell wraps under another
  for (const row of await page.locator(".ps-table .ps-row:not(.head)").all()) expect((await row.boundingBox())!.height).toBeLessThan(48);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
  await page.locator(".dp-detail").screenshot({ path: "test-results/data-pseudonymise-codes.png" });
});

test("on a phone the step's boxes stack and its IDs fit, with no sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/data.html#data/datasets?dataset=study-identified");
  await expect(page.locator(".dp-detail .ps-step")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(new Set(await tops(page.locator(".ps-step .ps-box"))).size).toBe(3);
  await page.locator(".ps-step .ps-actions .button").first().click();
  await expect(page.locator(".ps-table .ps-row:not(.head)")).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const table = await page.locator(".ps-table").boundingBox();
  expect(table!.x + table!.width).toBeLessThanOrEqual(390);
  await page.locator(".dp-detail").screenshot({ path: "test-results/data-pseudonymise-phone.png" });
});

test("the rules open from Change and fit a phone, four choices and no paragraph", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/data.html#data/datasets?dataset=study-identified");
  await page.locator(".ps-step .ps-change").click();
  await expect(page.locator("dialog .ps-rule")).toHaveCount(4);
  const dialog = await page.locator("dialog").boundingBox();
  expect(dialog!.x).toBeGreaterThanOrEqual(0);
  expect(dialog!.x + dialog!.width).toBeLessThanOrEqual(390);
  await page.locator("dialog").screenshot({ path: "test-results/data-pseudonymise-rules.png" });
});

test("once pseudonymised, what every file got sits beside the dataset's log", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/data.html?done=1#data/datasets/study-identified/pseudonymisation");
  await expect(page.locator(".dp-detail .ps-done")).toHaveCount(1);
  expect(new Set(await tops(page.locator(".ps-cols > .dp-col"))).size).toBe(1);
  expect(new Set(await tops(page.locator(".ps-done .ps-box"))).size).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
  await page.locator(".dp-detail").screenshot({ path: "test-results/data-pseudonymised.png" });
});

test("a pasted map fills the IDs' rows, a code and where its subject is already beside it, on one line each", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/data.html#data/datasets?dataset=study-identified");
  await page.locator(".ps-step .ps-actions .button").first().click();
  await page.locator(".ps-drop").evaluate((zone) => {
    const data = new DataTransfer();
    data.setData("text/plain", "study ID,subject code\nABC123456,5a9f30c6e8b21d41\naBCD1234,5a9f30c6e8b21d42\naBCE1234,5a9f30c6e8b21d43\n");
    zone.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect(page.locator(".ps-code-value")).toHaveCount(3);
  await expect(page.locator(".ps-drop")).toContainText("3 of 4 IDs matched");
  for (const row of await page.locator(".ps-table .ps-row:not(.head)").all()) expect((await row.boundingBox())!.height).toBeLessThan(48);
  await expect(page.locator(".ps-foot .button").last()).toHaveText("Pseudonymise and sort 201 files");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.locator(".dp-detail").screenshot({ path: "test-results/data-pseudonymise-matched-dark.png" });
});
