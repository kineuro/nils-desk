// SPDX-License-Identifier: AGPL-3.0-only
// Runs that say why, and the Over that finds what a person means (2026-10-12),
// in a real browser in the desk's own shell (runs.html): a failed run's reason
// is one line under its row, inside the window at a laptop's width and at a
// phone's, with nothing sideways; the run form's Over finds "t1 3d", moves by
// the arrows, takes by Enter and closes by Escape without closing the form;
// the pre-flight lists each check of what the run needs of this machine and
// offers Install dcm2niix on the one that fails, which clears it; a run the
// jobs door refused says why with its checks; a run's page says the reason
// whole with Install and Run again, and its failed units by cause; a failed
// job says why on the Jobs page; Settings, Parts lists dcm2niix under Tools,
// and an install that fails offline says the engine's reason with the way by
// hand. Record 55 (2026-10-12): the Over offers each dataset and cohort beside
// the selections, takes a dataset's main FLAIR scans from "anon flair", the
// role changes on the chip, and the pre-flight says how many scans they
// resolve to and the visits with none, inside the window at both widths.
// SHOTS=<dir> keeps a screenshot of each.

import { expect, test, type Page } from "@playwright/test";

const ADVICE = "Install dcm2niix where the engine runs: an admin can from Settings, Parts, or with nils tools install dcm2niix; then run it again.";

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
  test(`at ${vp.name} px a failed run's reason is one line under its row, inside the window`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/runs.html#pipelines/catalog");
    const lines = page.locator("tr.fail-row .fail-line");
    await expect(lines).toHaveCount(2);
    // the slice's kind and what to do on the first; today's engine's first sentence on the second
    await expect(lines.nth(0).locator(".kind-tag")).toHaveText("dependency");
    await expect(lines.nth(0).locator(".fail-words")).toHaveText(ADVICE);
    await expect(lines.nth(1).locator(".kind-tag")).toHaveCount(0);
    await expect(lines.nth(1).locator(".fail-words")).toHaveText("the release of the input failed: dcm2niix is not runnable (No such file or directory (os error 2)).");
    await expect(lines.nth(0).getByRole("button", { name: "Install dcm2niix" })).toBeVisible();
    for (const box of await lines.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as DOMRect))) {
      expect(box.height).toBeLessThanOrEqual(34);
      expect(box.right).toBeLessThanOrEqual(vp.width);
      expect(box.left).toBeGreaterThanOrEqual(0);
    }
    // the words end in an ellipsis where the line is too short for them, never on a second line
    const words = await lines.nth(1).locator(".fail-words").evaluate((e) => ({ h: e.getBoundingClientRect().height, lh: parseFloat(getComputedStyle(e).lineHeight) || 20 }));
    expect(words.h).toBeLessThan(words.lh * 1.6);
    await noSideways(page, vp.width);
    await shot(page, `catalog-${vp.name}`);
  });

  test(`at ${vp.name} px the Over finds "t1 3d", moves by the arrows, takes by Enter, and Install clears the refused pre-flight`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/runs.html#pipelines/catalog");
    await page.getByRole("button", { name: "Run on a selection" }).nth(1).click();
    const dialog = page.locator("dialog[open]");
    await expect(dialog).toHaveCount(1);
    const over = dialog.getByRole("combobox", { name: "What the run goes over" });
    await over.click();
    // the recent ones before anything is typed, a cohort's source among them, then each dataset's and cohort's main scans
    await expect(dialog.locator(".over-opt:not(.over-scope)")).toHaveCount(5);
    await expect(dialog.locator(".over-opt:not(.over-scope) .tag")).toHaveText("cohort ms-followup");
    await expect(dialog.locator(".over-opt.over-scope .over-name")).toHaveText(["ms-2026", "study-anon", "ms-followup"]);
    await shot(page, `over-recent-${vp.name}`);
    await page.keyboard.type("x");
    await page.keyboard.press("Escape");
    await expect(dialog.locator('[role="listbox"]')).toHaveCount(0);
    await expect(dialog).toHaveCount(1);
    await over.fill("");
    await page.keyboard.type("t1 3d");
    const lit = dialog.locator('.over-opt[aria-selected="true"] .over-name');
    await expect(lit).toHaveText("t1-3d-stacks");
    await expect(dialog.locator(".over-opt .over-name")).toHaveText(["t1-3d-stacks", "3d-t1-siemens"]);
    const list = await dialog.locator(".over-list").boundingBox();
    expect(list!.x).toBeGreaterThanOrEqual(0);
    expect(list!.x + list!.width).toBeLessThanOrEqual(vp.width);
    await shot(page, `over-list-${vp.name}`);
    await page.keyboard.press("ArrowDown");
    await expect(lit).toHaveText("3d-t1-siemens");
    await page.keyboard.press("Enter");
    await expect(dialog.locator(".over-chip")).toHaveText("3d-t1-siemens");
    await expect(dialog.getByRole("combobox", { name: "The version" })).toHaveValue("2");
    // the pre-flight is not ready for want of dcm2niix: each check in the engine's words, and the failing one says what to do
    const pre = dialog.locator(".preflight");
    await expect(pre.locator(".req")).toHaveCount(5);
    await expect(pre.locator(".req.not .req-check")).toHaveText("converter");
    await expect(pre.locator(".fail-said .kind-tag")).toHaveText("dependency");
    await expect(pre.locator(".fail-said")).toContainText(ADVICE);
    await expect(dialog.getByRole("button", { name: "Run", exact: true })).toBeDisabled();
    for (const box of await pre.locator(".req").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as DOMRect))) expect(box.right).toBeLessThanOrEqual(vp.width);
    await pre.scrollIntoViewIfNeeded();
    await shot(page, `refused-${vp.name}`);
    await pre.getByRole("button", { name: "Install dcm2niix" }).click();
    await expect(dialog.locator(".note.brand.preflight .note-lead")).toHaveText("Pre-flight");
    await expect(dialog.locator(".preflight .req.not")).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Run", exact: true })).toBeEnabled();
    await shot(page, `installed-${vp.name}`);
    await noSideways(page, vp.width);
  });

  test(`at ${vp.name} px a run's page says its reason whole, with Install and then Run again`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/runs.html#pipelines/runs/14");
    const note = page.locator(".run-page .fail-note");
    await expect(note.locator(".note-lead .kind-tag")).toHaveText("dependency");
    await expect(note.locator(".note-detail")).toContainText("is a prerequisite of a deployment");
    await shot(page, `run-${vp.name}`);
    await note.getByRole("button", { name: "Install dcm2niix" }).click();
    await expect(note.locator(".tool-said")).toContainText("dcm2niix v1.0.20260724 is installed");
    await note.getByRole("button", { name: "Run again" }).click();
    await expect(note.locator(".tool-said")).toContainText("Run 14 is queued again as job 51.");
    await shot(page, `run-again-${vp.name}`);
    await noSideways(page, vp.width);
  });

  test(`at ${vp.name} px Settings, Parts lists dcm2niix under Tools, missing with Install, then its version`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/runs.html#settings/parts");
    const tools = page.locator("table.tools");
    await expect(tools.locator(".tag.caution")).toHaveText("missing");
    await shot(page, `parts-${vp.name}`);
    await tools.getByRole("button", { name: "Install dcm2niix" }).click();
    await expect(tools.locator("tbody")).toContainText("v1.0.20260724");
    await expect(tools.locator("tbody")).toContainText("/usr/local/lib/nils/tools/dcm2niix");
    await expect(tools.locator("tbody")).toContainText("in the registry's tools folder");
    await noSideways(page, vp.width);
  });
}

test("an install that fails offline says the engine's reason whole, the way by hand in it, and the command", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/runs.html?offline#settings/parts");
  await page.locator("table.tools").getByRole("button", { name: "Install dcm2niix" }).click();
  const said = page.locator("table.tools .tool-said");
  await expect(said).toContainText("dcm2niix was not installed: the releases of dcm2niix could not be reached (github.com: no route to host). By hand: fetch dcm2niix_lnx.zip");
  await expect(said).toContainText("At the command line: nils tools install dcm2niix");
  await expect(page.locator("table.tools").getByRole("button", { name: "Try again" })).toBeVisible();
  await shot(page, "parts-offline-1440");
});

test("a failed unit's reason sits under the unit, and the run counts its failed units by cause", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/runs.html#pipelines/runs/12");
  const line = page.locator("tr.fail-row .fail-line");
  await expect(line).toHaveCount(1);
  await expect(line.locator(".kind-tag")).toHaveText("resource");
  await expect(line.locator(".fail-words")).toHaveText("Give the lane more memory, or run fewer units at once.");
  await expect(page.locator("th", { hasText: "Failed, by cause" })).toBeVisible();
  await expect(page.locator(".values")).toContainText("v1.0.20260724");
  await shot(page, "run-units-1440");
});

for (const vp of SIZES) {
  test(`at ${vp.name} px a run the jobs door refused says why with its checks, and nothing is queued`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/runs.html?refuse#pipelines/catalog");
    await page.getByRole("button", { name: "Run on a selection" }).nth(1).click();
    const dialog = page.locator("dialog[open]");
    await dialog.getByRole("combobox", { name: "What the run goes over" }).click();
    await page.keyboard.type("siemens");
    await page.keyboard.press("Enter");
    await expect(dialog.locator(".note.brand.preflight .note-lead")).toHaveText("Pre-flight");
    await dialog.getByRole("button", { name: "Run", exact: true }).click();
    const note = dialog.locator(".dialog-foot .fail-note");
    await expect(note.locator(".note-lead")).toHaveText("Not queued");
    await expect(note.locator(".fail-said .kind-tag")).toHaveText("resource");
    await expect(note.locator(".req.not .req-check")).toHaveText("disk");
    await expect(dialog).toHaveCount(1);
    await shot(page, `run-refused-${vp.name}`);
    await noSideways(page, vp.width);
  });
}

for (const vp of SIZES) {
  test(`at ${vp.name} px the Over offers a dataset's main scans, the role on the chip, and the pre-flight says the visits with none`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/runs.html?installed#pipelines/catalog");
    await page.getByRole("button", { name: "Run on a selection" }).nth(1).click();
    const dialog = page.locator("dialog[open]");
    await dialog.getByRole("combobox", { name: "What the run goes over" }).click();
    await page.keyboard.type("anon flair");
    const lit = dialog.locator('.over-opt[aria-selected="true"]');
    await expect(lit.locator(".over-name")).toHaveText("study-anon");
    await expect(lit.locator(".over-v")).toHaveText("main FLAIR");
    await expect(lit.locator(".tag")).toHaveText("dataset");
    await expect(lit.locator(".over-about")).toHaveText("5,120 scans · 412 subjects, one main scan a visit");
    const list = await dialog.locator(".over-list").boundingBox();
    expect(list!.x).toBeGreaterThanOrEqual(0);
    expect(list!.x + list!.width).toBeLessThanOrEqual(vp.width);
    await shot(page, `over-scope-list-${vp.name}`);
    await page.keyboard.press("Enter");
    await expect(dialog.locator(".over-chip")).toHaveText("study-anon");
    const role = dialog.getByRole("combobox", { name: "The role" });
    await expect(role).toHaveValue("flair");
    await role.selectOption("t1w");
    await expect(dialog.locator(".over-pick > .meta")).toContainText("main:t1w@dataset:study-anon: the dataset's main T1w scans, one a visit");
    // the pre-flight: how many scans they resolve to, under which rules, and the visits with none by why
    const pre = dialog.locator(".preflight");
    await expect(pre.locator(".note-lead")).toHaveText("Pre-flight");
    await expect(pre.locator(".preflight-main")).toContainText("Dataset study-anon's main scans under its own rules, version 3.");
    await expect(pre.locator(".preflight-main")).toContainText("12 visits have no main T1w; the run goes over the 474 that have one.");
    const without = pre.locator(".preflight-without li");
    await expect(without).toHaveCount(2);
    await expect(without.nth(0)).toContainText("9 it holds no t1w scan");
    await expect(without.nth(1)).toContainText("3 it holds a t1w scan and none is picked · 7a8b9c0d 2023-01-15, 1e2f3a4b 2022-11-02, 5c6d7e8f 2024-03-09");
    await expect(dialog.locator(".note-body code")).toHaveText("nils run n4-bias-correction@1 --select main:t1w@dataset:study-anon");
    await expect(dialog.getByRole("button", { name: "Run", exact: true })).toBeEnabled();
    for (const box of await pre.locator(".preflight-without li").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as DOMRect))) expect(box.right).toBeLessThanOrEqual(vp.width);
    await pre.scrollIntoViewIfNeeded();
    await shot(page, `over-scope-preflight-${vp.name}`);
    await noSideways(page, vp.width);
  });
}

test("a failed job says why on the Jobs page, its kind beside the line", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/runs.html#pipelines");
  const line = page.locator(".fail-line").first();
  await expect(line.locator(".kind-tag")).toHaveText("dependency");
  await expect(line.locator(".fail-words")).toHaveText(ADVICE);
  await shot(page, "jobs-1440");
});
