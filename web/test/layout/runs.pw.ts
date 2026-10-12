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
// Since 2026-10-12: a run that made nothing reads so on its tag, the rest on
// one line under its row, inside the window at both widths; its page says
// each session skipped and why; Run again opens the run's pre-flight first,
// and its Start queues it; and on the Jobs page a stopped run's job whose run
// a later job took up again leaves Now and says which job, while that job,
// which made nothing, waits in Now.
//
// Since 2026-10-12, for samseg-lesions, which needs a T1w and a FLAIR, a
// dataset reads "study-anon · main T1w + FLAIR", is sent without a role, and
// its pre-flight says the visits that lack one, inside the window too.
// Since 2026-10-12 (pipeline versions): the catalog is one row a name with a
// plain select of the versions a new run may take, newest first, a replaced
// one not among them; the row and the run follow the version chosen, and the
// runs keep the version each ran, inside the window at both widths.
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
    // Run again opens the run's pre-flight first; Start waits on it, then queues the run up again
    await note.getByRole("button", { name: "Run again" }).click();
    const dialog = page.locator("dialog[open]");
    await expect(dialog.locator(".preflight .note-lead")).toHaveText("Pre-flight");
    await expect(dialog.locator(".can-run")).toHaveText("All 140 sessions can run.");
    await shot(page, `run-again-preflight-${vp.name}`);
    await dialog.getByRole("button", { name: "Start" }).click();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await expect(page.locator(".run-page")).toContainText("Run 14 is queued again as job 51.");
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
    await expect(dialog.locator(".note-body code")).toHaveText("nils run n4-bias-correction@2 --select main:t1w@dataset:study-anon");
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

for (const vp of SIZES) {
  test(`at ${vp.name} px a run that made nothing reads so on its tag, the rest on one line under its row`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/runs.html#pipelines/catalog");
    const row = page.locator("tr", { has: page.locator('a[href="#pipelines/runs/15"]') });
    await expect(row.locator(".tag")).toHaveText("nothing made");
    await expect(row.locator(".tag")).toHaveClass(/caution/u);
    const line = page.locator("tr.made-row .made-line").first();
    await expect(line).toHaveText("4 of 4 skipped: no FLAIR picked");
    // the partly made run keeps its counts, and the one that made all it was for reads ok
    await expect(page.locator(".tag", { hasText: "2 of 3 made" })).toHaveClass(/caution/u);
    await expect(page.locator("tr.made-row .made-line").nth(1)).toHaveText("1 failed: out of memory");
    await expect(page.locator(".tag", { hasText: "41 of 41 made" })).toHaveClass(/ok/u);
    await expect(page.locator("table.thin .tag", { hasText: /^done$/u })).toHaveCount(0);
    const box = (await line.boundingBox())!;
    expect(box.height).toBeLessThanOrEqual(34);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
    await noSideways(page, vp.width);
    await shot(page, `made-${vp.name}`);
  });

  test(`at ${vp.name} px a stopped run's job taken up again leaves Now and says which job, and the job that made nothing waits there`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/runs.html#pipelines");
    const now = page.locator(".jobs-now").first();
    const nothing = now.locator(".job", { hasText: "Pipeline run of samseg-lesions@1: nothing made" });
    await expect(nothing).toHaveCount(1);
    await expect(nothing).toHaveClass(/short/u);
    await expect(nothing.locator(".made-rest")).toHaveText("4 of 4 skipped: no FLAIR picked");
    await expect(now.locator(".job", { hasText: "job 18" })).toHaveCount(0);
    // under All jobs, the job that stopped says which job took its run up again, with no fix to make and no Run again
    const old = page.locator(".jobs-now").nth(1).locator(".job", { hasText: "job 18" });
    await expect(old).toContainText("ran again as job 46, done");
    await expect(old.locator(".fail-line")).toHaveCount(0);
    await expect(old.getByRole("button", { name: "Run again" })).toHaveCount(0);
    for (const card of [nothing, old]) {
      const b = (await card.boundingBox())!;
      expect(b.x + b.width).toBeLessThanOrEqual(vp.width);
    }
    await noSideways(page, vp.width);
    await shot(page, `jobs-taken-up-${vp.name}`);
  });

  test(`at ${vp.name} px a pipeline that needs a T1w and a FLAIR takes a dataset's main scans of both, and the pre-flight says the visits that lack one`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/runs.html?installed#pipelines/catalog");
    await page.getByRole("button", { name: "Run on a selection" }).nth(0).click();
    const dialog = page.locator("dialog[open]");
    await dialog.getByRole("combobox", { name: "What the run goes over" }).click();
    await page.keyboard.type("anon");
    const lit = dialog.locator('.over-opt[aria-selected="true"]');
    await expect(lit.locator(".over-name")).toHaveText("study-anon");
    await expect(lit.locator(".over-v")).toHaveText("main T1w + FLAIR");
    await expect(lit.locator(".over-about")).toHaveText("5,120 scans · 412 subjects, one main scan of each a visit");
    await page.keyboard.press("Enter");
    await expect(dialog.locator(".over-chip")).toHaveText("study-anon");
    await expect(dialog.locator(".over-roles")).toHaveText("main T1w + FLAIR");
    await expect(dialog.getByRole("combobox", { name: "The role" })).toHaveCount(0);
    await expect(dialog.locator(".over-pick > .meta")).toContainText("main@dataset:study-anon: the dataset's main T1w and FLAIR scans, one of each a visit");
    const pre = dialog.locator(".preflight");
    await expect(pre.locator(".preflight-main")).toContainText("16 visits lack a main FLAIR or T1w; the run goes over the 470 that have both.");
    await expect(pre.locator(".preflight-without li")).toHaveCount(2);
    await expect(dialog.locator(".note-body code")).toHaveText("nils run samseg-lesions@2 --select main@dataset:study-anon");
    for (const box of await pre.locator(".preflight-without li").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as DOMRect))) expect(box.right).toBeLessThanOrEqual(vp.width);
    const chosen = (await dialog.locator(".over-chosen").boundingBox())!;
    expect(chosen.x + chosen.width).toBeLessThanOrEqual(vp.width);
    await pre.scrollIntoViewIfNeeded();
    await shot(page, `over-every-role-${vp.name}`);
    await noSideways(page, vp.width);
  });
}

test("a run's page says each session skipped and why, and that the run made nothing", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/runs.html#pipelines/runs/15");
  await expect(page.locator(".run-page > .row.actions .tag")).toHaveText("nothing made");
  await expect(page.locator(".made-note .note-lead")).toHaveText("Nothing made");
  await expect(page.locator(".made-why li")).toHaveText("4 skipped: no FLAIR picked" + "sub-7a8b_ses-1, sub-9c0d_ses-1, sub-1e2f_ses-2, sub-3a4b_ses-1");
  await expect(page.locator("table.thin .tag.caution", { hasText: "skipped" })).toHaveCount(4);
  await expect(page.locator("tr.made-row .made-line")).toHaveCount(4);
  await expect(page.locator("tr.made-row .made-line").first()).toHaveText("no FLAIR picked");
  await expect(page.locator(".run-page")).not.toContainText("Every unit that finished passed its checks.");
  await shot(page, "run-nothing-1440");
});

for (const vp of SIZES) {
  test(`at ${vp.name} px the catalog is one row a name, its versions in a select, and the run follows the version chosen`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/runs.html?installed#pipelines/catalog");
    const catalog = page.locator("table.thin").first();
    await expect(catalog.locator("tbody > tr")).toHaveCount(2);
    await expect(page.locator(".section-head .meta").first()).toContainText("2 pipelines");
    // samseg-lesions@1 is replaced, so its row offers @2 alone, with no select
    const samseg = catalog.locator("tbody > tr").nth(0);
    await expect(samseg.locator(".catalog-name b")).toHaveText("samseg-lesions");
    await expect(samseg.locator(".catalog-name .meta")).toHaveText("v2");
    await expect(samseg.getByRole("combobox")).toHaveCount(0);
    // n4's two versions, newest first and chosen
    const n4 = catalog.locator("tbody > tr").nth(1);
    const version = n4.getByRole("combobox", { name: "The version of n4-bias-correction" });
    await expect(version.locator("option")).toHaveText(["v2, newest", "v1"]);
    await expect(version).toHaveValue("6");
    await expect(n4.locator("td").first().locator("> .meta")).toHaveText("N4 bias field correction of a T1, with its bias field.");
    await expect(n4.locator("td.path")).toHaveText("ghcr.io/kineuro/nils-pipelines@sha256:5c5c5c5c5c5c");
    await shot(page, `versions-${vp.name}`);
    // the older one: the row reads as it
    await version.selectOption("4");
    await expect(n4.locator("td").first().locator("> .meta")).toHaveText("N4 bias field correction of a T1.");
    await expect(n4.locator("td.path")).toHaveText("ghcr.io/kineuro/nils-pipelines@sha256:4b4b4b4b4b4b");
    for (const box of await catalog.locator(".catalog-name").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as DOMRect))) {
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(vp.width);
    }
    // the runs keep the version each ran, the replaced one too
    await expect(page.locator("table.thin").nth(1).locator("tbody td", { hasText: /^samseg-lesions@1$/u }).first()).toBeVisible();
    await noSideways(page, vp.width);
    // the run of the version chosen: its title and the command it queues
    await n4.getByRole("button", { name: "Run on a selection" }).click();
    const dialog = page.locator("dialog[open]");
    await expect(dialog.getByRole("heading")).toContainText("Run n4-bias-correction@1");
    await dialog.getByRole("combobox", { name: "What the run goes over" }).click();
    await page.keyboard.type("t1 3d");
    await page.keyboard.press("Enter");
    await expect(dialog.locator(".note-body code")).toHaveText("nils run n4-bias-correction@1 --select selection:t1-3d-stacks@1");
    await shot(page, `versions-run-${vp.name}`);
    await noSideways(page, vp.width);
  });
}

