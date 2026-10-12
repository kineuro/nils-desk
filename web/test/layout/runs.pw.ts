// SPDX-License-Identifier: AGPL-3.0-only
// Runs that say why, and the Over that finds what a person means (2026-10-12),
// in a real browser in the desk's own shell (runs.html): a failed run's reason
// is one line under its row, inside the window at a laptop's width and at a
// phone's, with nothing sideways; the run form's Over finds "t1 3d", moves by
// the arrows, takes by Enter and closes by Escape without closing the form;
// the refused pre-flight offers Install dcm2niix, which clears it; a run's
// page says the reason whole with Install and Run again; Settings, Parts
// lists dcm2niix under Tools, and an install that fails says why and the way
// by hand. SHOTS=<dir> keeps a screenshot of each.

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

for (const vp of SIZES) {
  test(`at ${vp.name} px a failed run's reason is one line under its row, inside the window`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/runs.html#pipelines/catalog");
    const lines = page.locator("tr.fail-row .fail-line");
    await expect(lines).toHaveCount(2);
    // the slice's kind and what to do on the first; today's engine's first sentence on the second
    await expect(lines.nth(0).locator(".kind-tag")).toHaveText("dependency");
    await expect(lines.nth(0).locator(".fail-words")).toHaveText("Install dcm2niix where the engine runs, then run it again.");
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
    const over = dialog.getByRole("combobox", { name: "The selection" });
    await over.click();
    // the recent ones before anything is typed, a cohort's source among them
    await expect(dialog.locator(".over-opt")).toHaveCount(5);
    await expect(dialog.locator(".over-opt .tag")).toHaveText("cohort ms-followup");
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
    // the pre-flight refuses for want of dcm2niix, and says so as a failed run does
    const refusal = dialog.locator(".fail-note");
    await expect(refusal.locator(".kind-tag")).toHaveText("dependency");
    await expect(dialog.getByRole("button", { name: "Run", exact: true })).toBeDisabled();
    await refusal.scrollIntoViewIfNeeded();
    await shot(page, `refused-${vp.name}`);
    await refusal.getByRole("button", { name: "Install dcm2niix" }).click();
    await expect(dialog.locator(".note.brand.preflight .note-lead")).toHaveText("Pre-flight");
    await expect(dialog.locator(".fail-note")).toHaveCount(0);
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
    await expect(note.locator(".tool-said")).toContainText("dcm2niix v1.0.20250506 is installed");
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
    await expect(tools.locator("tbody")).toContainText("v1.0.20250506");
    await expect(tools.locator("tbody")).toContainText("/usr/local/bin/dcm2niix");
    await noSideways(page, vp.width);
  });
}

test("an install that fails says the engine's reason and the way by hand", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/runs.html?offline#settings/parts");
  await page.locator("table.tools").getByRole("button", { name: "Install dcm2niix" }).click();
  const said = page.locator("table.tools .tool-said");
  await expect(said).toContainText("dcm2niix was not installed: the download of dcm2niix failed: github.com could not be reached (no route to host).");
  await expect(said).toContainText("By hand: install a current build from github.com/rordenlab/dcm2niix where the engine runs, on its path.");
  await expect(page.locator("table.tools").getByRole("button", { name: "Try again" })).toBeVisible();
  await shot(page, "parts-offline-1440");
});

test("a failed unit's reason sits under the unit, its kind beside it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/runs.html#pipelines/runs/12");
  const line = page.locator("tr.fail-row .fail-line");
  await expect(line).toHaveCount(1);
  await expect(line.locator(".kind-tag")).toHaveText("resource");
  await expect(line.locator(".fail-words")).toHaveText("Give the lane more memory, or run fewer units at once.");
  await shot(page, "run-units-1440");
});
