// SPDX-License-Identifier: AGPL-3.0-only
// The Data page in a real browser, in the desk's own shell: on a laptop the
// datasets sit four to a row, the chosen dataset's eight steps on one line and
// its three columns side by side; a cohort chosen draws how it grew with no
// event over another and its four steps on one line; a narrower window folds
// the rail four to a row; a phone's width is one column of cards with no
// sideways scroll; body part's, post-contrast's and main scans' Run sit inside their steps,
// main scans' Run, Rules and "?" on one line at 1280, 1440 and 1920 pixels also where an
// identified dataset has nine steps, which says whose its set-aside files are;
// a map copied as a person copies it reaches the pseudonymise step by Ctrl+V
// on the box or by Paste, in Firefox as in chromium. Screenshots go to
// test-results for a look.

import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";

const tops = async (l: Locator) => (await l.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)))) as number[];

/** Main scans' Run, Rules and "?" side by side on one line, in that order, inside their step. */
async function oneLine(run: Locator) {
  const [button, rules, hint] = [(await run.locator("button").boundingBox())!, (await run.locator("a").boundingBox())!, (await run.locator(".hint").boundingBox())!];
  expect(rules.x).toBeGreaterThanOrEqual(button.x + button.width);
  expect(hint.x).toBeGreaterThanOrEqual(rules.x + rules.width);
  for (const b of [rules, hint]) expect(Math.abs(b.y + b.height / 2 - (button.y + button.height / 2))).toBeLessThan(4);
  // the "?" whole, not squeezed
  expect(hint.width).toBeGreaterThan(15);
}

/** A map as a person copies it from a spreadsheet or an editor: from a page of its own, with the keys, onto the browser's clipboard. */
async function copied(context: BrowserContext, page: Page) {
  const editor = await context.newPage();
  await editor.setContent("<textarea></textarea>");
  const text = editor.locator("textarea");
  await text.fill("study ID,subject code\nABC123456,5a9f30c6e8b21d41\naBCD1234,5a9f30c6e8b21d42\naBCE1234,5a9f30c6e8b21d43\n");
  await text.press("ControlOrMeta+A");
  await text.press("ControlOrMeta+C");
  await editor.close();
  await page.bringToFront();
}

/** The identified dataset's step, its IDs given their subject codes from a map: the way beside Generate. */
async function givingCodes(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/data.html#data/datasets?dataset=study-identified");
  await page.getByRole("button", { name: "Give them from a map", exact: true }).click();
}

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

test("body part, post-contrast and main scans carry their Run inside their steps, post-contrast's held with its reason", async ({ page }) => {
  // four widths, each a page of its own
  test.setTimeout(120_000);
  for (const [width, rows] of [
    [1280, 1],
    [1440, 1],
    [1920, 1],
    [390, 4],
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/data.html#data/datasets");
    await expect(page.locator(".dp-detail")).toHaveAttribute("aria-label", "study-big");
    const runs = page.locator(".dp-detail .dp-step-run");
    await expect(runs).toHaveCount(3);
    await expect(runs.nth(0).locator("button")).toHaveText("Run again");
    await expect(runs.nth(0).locator("button")).toBeEnabled();
    await expect(runs.nth(1).locator("button")).toHaveText("Run");
    await expect(runs.nth(1).locator("button")).toBeDisabled();
    await expect(runs.nth(1).locator(".hint")).toHaveAttribute("title", "no post-contrast model is installed");
    // main scans: picked again by the dataset's rules, the 3D views running beside it, and the way to their page
    await expect(runs.nth(2).locator("button")).toHaveText("Run again");
    await expect(runs.nth(2).locator("button")).toBeEnabled();
    await expect(runs.nth(2).locator("a")).toHaveText("Rules");
    // each Run on one line inside its step, the rail as it was; main scans' Rules and "?" beside their Run
    // on the same line (Nima, 2026-10-11: the "?" fell under them on a 1440 screen)
    for (const i of [3, 4, 5]) {
      const step = page.locator(".dp-detail .dp-step").nth(i);
      const cell = (await step.boundingBox())!;
      const run = (await step.locator(".dp-step-run").boundingBox())!;
      const button = (await step.locator(".dp-step-run button").boundingBox())!;
      expect(run.x).toBeGreaterThanOrEqual(cell.x - 1);
      expect(run.x + run.width).toBeLessThanOrEqual(cell.x + cell.width + 1);
      expect(run.y + run.height).toBeLessThanOrEqual(cell.y + cell.height + 1);
      expect(button.height).toBeLessThan(40);
      expect(run.height).toBeLessThan(40);
    }
    const ms = page.locator(".dp-detail .dp-step").nth(5).locator(".dp-step-run");
    await oneLine(ms);
    expect(new Set(await tops(page.locator(".dp-detail .dp-step"))).size).toBe(rows);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.locator(".dp-detail .dp-steps").screenshot({ path: `test-results/data-step-run-${width}.png` });
  }
});

test("an identified dataset read keeps main scans' Run, Rules and \"?\" on one line, and says whose its set-aside files are", async ({ page }) => {
  // five widths, each a page of its own
  test.setTimeout(120_000);
  for (const [width, rows] of [
    [1280, 1],
    [1440, 1],
    [1920, 1],
    [1000, 3],
    [390, 5],
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/data.html?read#data/datasets?dataset=study-identified");
    await expect(page.locator(".dp-detail")).toHaveAttribute("aria-label", "study-identified");
    await expect(page.locator(".dp-detail .dp-step")).toHaveCount(9);
    expect(new Set(await tops(page.locator(".dp-detail .dp-step"))).size).toBe(rows);
    const ms = page.locator(".dp-detail .dp-step").filter({ hasText: "Main scans" });
    await expect(ms.locator(".dp-step-run button")).toHaveText("Run again");
    await oneLine(ms.locator(".dp-step-run"));
    const cell = (await ms.boundingBox())!;
    const run = (await ms.locator(".dp-step-run").boundingBox())!;
    expect(run.x + run.width).toBeLessThanOrEqual(cell.x + cell.width + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    // the files set aside are of a subject with no stack in it, which it does not count among its subjects: said of the files
    await expect(page.locator(".dp-detail .dp-funnel")).toContainText("15 subjects");
    await expect(page.locator(".dp-detail .meta").filter({ hasText: "set aside" }).first()).toContainText("183 set aside, all from 1 subject with no scans, why · 216 refused, why");
    await page.locator(".dp-detail").screenshot({ path: `test-results/data-no-scans-${width}.png` });
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
  // files that wait for subject codes: one line says why, generating them is the primary act and a map the other way
  await expect(page.locator(".ps-step .ps-next")).toContainText("Next: 4 IDs have no subject code yet");
  await expect(page.locator(".ps-step .ps-actions .button").first()).toHaveText("Generate subject codes");
  await expect(page.locator(".ps-step .ps-actions .button.secondary")).toHaveText("Give them from a map");
  await page.locator(".dp-detail").screenshot({ path: "test-results/data-pseudonymise.png" });
  // giving the IDs their subject codes from a map, in place: one row each, the code's column and the way out on the row's own line
  await page.getByRole("button", { name: "Give them from a map", exact: true }).click();
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
  await page.getByRole("button", { name: "Give them from a map", exact: true }).click();
  await expect(page.locator(".ps-table .ps-row:not(.head)")).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const table = await page.locator(".ps-table").boundingBox();
  expect(table!.x + table!.width).toBeLessThanOrEqual(390);
  await page.locator(".dp-detail").screenshot({ path: "test-results/data-pseudonymise-phone.png" });
});

test("the rules open from Change and fit a phone, five choices and no paragraph", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/data.html#data/datasets?dataset=study-identified");
  await page.locator(".ps-step .ps-change").click();
  // what PatientID holds, what the copy's gets, an ID with no subject code, tags, the originals once done
  await expect(page.locator("dialog .ps-rule")).toHaveCount(5);
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

test("a pasted map fills the IDs' rows, a code and where its subject is already beside it, on one line each", async ({ page, context }) => {
  await givingCodes(page);
  await copied(context, page);
  // Ctrl+V on the box focused as Tab or Paste leaves it, not clicked: Firefox aims a paste at the selection, then outside the box
  await page.locator(".ps-drop").focus();
  await page.keyboard.press("ControlOrMeta+V");
  await expect(page.locator(".ps-code-value")).toHaveCount(3);
  await expect(page.locator(".ps-drop")).toContainText("3 of 4 IDs matched");
  for (const row of await page.locator(".ps-table .ps-row:not(.head)").all()) expect((await row.boundingBox())!.height).toBeLessThan(48);
  await expect(page.locator(".ps-foot .button").last()).toHaveText("Pseudonymise and sort 201 files");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.locator(".dp-detail").screenshot({ path: "test-results/data-pseudonymise-matched-dark.png" });
});

test("Paste the browser will not read says Ctrl+V on the box, and Ctrl+V there takes the map", async ({ page, context }) => {
  await givingCodes(page);
  await copied(context, page);
  // the browser says no: chromium without the permission, Firefox when its own Paste prompt is turned down,
  // which headless Firefox does not answer the same way twice, so a refusal stands in for both
  await page.evaluate(() => Object.defineProperty(navigator.clipboard, "readText", { value: () => Promise.reject(new DOMException("No.", "NotAllowedError")) }));
  await page.getByRole("button", { name: "Paste", exact: true }).click();
  const words = page.locator(".ps-codes > p.warn");
  await expect(words).toHaveText("Press Ctrl+V on the box to paste.");
  await page.keyboard.press("ControlOrMeta+V");
  await expect(page.locator(".ps-code-value")).toHaveCount(3);
  await expect(words).toHaveCount(0);
});

test("Paste the browser lets read takes the map", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "Firefox asks with a Paste of its own, outside the page");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await givingCodes(page);
  await copied(context, page);
  await page.getByRole("button", { name: "Paste", exact: true }).click();
  await expect(page.locator(".ps-code-value")).toHaveCount(3);
  await expect(page.locator(".ps-drop")).toContainText("pasted · 3 of 4 IDs matched");
});

for (const [device, width, height] of [
  ["laptop", 1440, 900],
  ["phone", 390, 844],
] as const) {
  test(`on a ${device} a count that stopped short of a large tree reads at least, on the card and the found step`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/data.html?partial#data/datasets?dataset=study-big");
    const card = page.locator(".dp-card").filter({ has: page.locator(".dp-pick", { hasText: "study-big" }) });
    const files = card.locator(".dp-nums > span").first();
    await expect(files).toHaveText("at least 49,836files");
    // the found step says it in the same words, and the detail's line too
    await expect(page.locator(".dp-step").first()).toContainText("at least 49,836 files");
    await expect(page.locator(".dp-detail")).toContainText("at least 49,836 files");
    // the card's numbers stay within it, and nothing goes sideways
    const box = (await card.boundingBox())!;
    for (const n of await card.locator(".dp-nums > span").all()) {
      const b = (await n.boundingBox())!;
      expect(b.x + b.width).toBeLessThanOrEqual(box.x + box.width + 1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/data-partial-${device}.png` });
  });
}
