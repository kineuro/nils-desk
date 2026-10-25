// SPDX-License-Identifier: AGPL-3.0-only
// Wave 7b's Pipelines page without tabs, a workflow's plan and the provenance
// panel (spec sections 8.1 and 8.3 to 8.6) in a real browser, in the desk's
// shell (workflows.html), at a laptop's width and at a phone's: the page's
// three lists with the family row opening to its members and the runs
// together; a workflow filled in from its address, planned at once, every
// link with its verdict and Start offered; a workflow run's steps; and on a
// run's unit the provenance panel with a stale result. Nothing scrolls
// sideways. SHOTS=<dir> keeps a screenshot of each.

import { expect, test, type Page } from "@playwright/test";

const SIZES = [
  { name: "1440", width: 1440, height: 900 },
  { name: "390", width: 390, height: 844 },
];

async function shot(page: Page, name: string) {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png`, fullPage: true });
}

async function noSideways(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
}

test.setTimeout(90_000);

for (const vp of SIZES) {
  test(`at ${vp.name} px the Pipelines page lists pipelines and families, workflows and the runs together`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/workflows.html#pipelines");
    await expect(page.locator("h1")).toHaveText("Pipelines");
    const family = page.locator("tr.family");
    await expect(family).toHaveCount(1);
    await expect(family).toContainText("registration");
    await expect(page.locator("tr.member")).toHaveCount(0);
    await expect(page.locator("table.workflows tbody tr")).toHaveCount(2);
    const runs = page.locator("table.runs tbody tr");
    await expect(runs.first()).toContainText("W13");
    await expect(page.locator("table.runs")).toContainText("15 of 16 made");
    await noSideways(page, vp.width);
    await shot(page, `pipelines-${vp.name}`);
    // the family row opens to its members on a click anywhere on it
    await family.click();
    await expect(page.locator("tr.member")).toHaveCount(2);
    await expect(page.locator("tr.member").first()).toContainText("ants");
    await noSideways(page, vp.width);
    await shot(page, `pipelines-family-open-${vp.name}`);
    // a workflow's row opens its page
    await page.locator("table.workflows tbody tr").first().click();
    await expect(page).toHaveURL(/#pipelines\/workflows\/1$/u);
    await expect(page.locator("h1")).toHaveText("Workflow");
  });

  test(`at ${vp.name} px a workflow filled in from its address is planned at once, every link with its verdict`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/workflows.html#pipelines/workflows/1?select=main@dataset:study-anon");
    await expect(page.locator(".wf-steps li")).toHaveCount(4);
    await expect(page.locator(".wf-plan-line .tag.ok").first()).toHaveText("can run");
    await expect(page.locator(".wf-link.brand")).toHaveCount(3);
    await expect(page.locator(".wf-link.ok")).toHaveCount(1);
    await expect(page.locator(".wf-link").first()).toContainText("meets aligned(flair, t1w)");
    await expect(page.locator(".wf-pre").nth(3)).toContainText("waits for register, synthseg whole");
    await expect(page.getByRole("button", { name: "Start" })).toBeEnabled();
    await noSideways(page, vp.width);
    await shot(page, `workflow-plan-${vp.name}`);
  });

  test(`at ${vp.name} px a workflow run lists its steps and their runs, and a run's unit opens its provenance`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/workflows.html#pipelines/workflow-runs/12");
    await expect(page.locator("h1")).toHaveText("Workflow run 12");
    await expect(page.locator("table.wf-run-steps tbody tr")).toHaveCount(5);
    await expect(page.locator(".wf-run")).toContainText("4 steps · 16 units: 13 made, 2 reused, 1 failed");
    await noSideways(page, vp.width);
    await shot(page, `workflow-run-${vp.name}`);
    await page.locator("table.wf-run-steps a", { hasText: /^41$/u }).click();
    await expect(page.locator("h1")).toHaveText("Run 41");
    // the unit's notes: reused, judged as it started, stale in the caution colour
    await expect(page.locator(".unit-note.reused").first()).toHaveText("reused from run 33");
    await expect(page.locator(".unit-note.caution.curation").first()).toContainText("stale");
    await expect(page.locator(".unit-note.fed").first()).toContainText("fed by no step for this unit");
    await noSideways(page, vp.width);
    await shot(page, `run-units-${vp.name}`);
    await page.getByRole("button", { name: /^Provenance of session 13@20260113/u }).click();
    const dialog = page.locator("dialog[open]");
    await expect(dialog).toContainText("4 steps over 2 stacks");
    await expect(dialog).toContainText("1 step withheld");
    await expect(dialog.locator(".provenance-step")).toHaveCount(4);
    await expect(dialog.locator(".provenance-step.caution")).toHaveCount(1);
    const box = await dialog.boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width);
    await shot(page, `provenance-${vp.name}`);
  });

  test(`at ${vp.name} px units named by subject code open their provenance`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/workflows.html#pipelines/runs/43");
    await expect(page.locator("h1")).toHaveText("Run 43");
    await expect(page.getByRole("button", { name: "Provenance of session 1a9c46b76b0aa6e4@20241119" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Provenance of subject 0f3e22d9c1b47a85" })).toBeVisible();
    await noSideways(page, vp.width);
  });
}
