// SPDX-License-Identifier: AGPL-3.0-only
// Record 55 H2, round 5 (spec 13.1), in a real browser in the desk's own
// shell (round5.html), at a laptop's width and at a phone's: each page this
// round changed draws inside the window with nothing sideways. Settings lands
// on Overview with Engine, Desk, Language models and Assistant set in under
// Parts; an admin's reset and removal of another person open in their form;
// one's own password opens on the profile; Backups prints restore as three
// steps; a release's row hands it over and withdraws it; the Logs page shows
// the jobs beside a log, stacked on a phone, and a run's units; the
// Assistant's Plans waiting and Standing grants are in its side.
// SHOTS=<dir> keeps a screenshot of each.

import { expect, test, type Page } from "@playwright/test";

const SIZES = [
  { name: "1440", width: 1440, height: 900 },
  { name: "390", width: 390, height: 844 },
];

async function shot(page: Page, name: string) {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/round5-${name}-${test.info().project.name}.png`, fullPage: true });
}

/** Nothing scrolls sideways: the page is no wider than the window. */
async function noSideways(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
}

/** Every box of these is inside the window's width. */
async function inside(page: Page, selector: string, width: number) {
  const boxes = await page.locator(selector).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as DOMRect));
  expect(boxes.length).toBeGreaterThan(0);
  for (const b of boxes) {
    expect(b.left).toBeGreaterThanOrEqual(-0.5);
    expect(b.right).toBeLessThanOrEqual(width + 0.5);
  }
}

/** On a phone the side is a panel opened from the top bar. */
async function openSide(page: Page, vp: { width: number }) {
  if (vp.width < 700) await page.getByRole("button", { name: "Sections" }).click();
}

for (const vp of SIZES) {
  test(`at ${vp.name} px Settings lands on Overview, with Engine, Desk, Language models and Assistant under Parts`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/round5.html#settings");
    await expect(page.locator(".settings-head h1")).toBeVisible();
    await openSide(page, vp);
    const side = page.locator("#side");
    // the landing page is Overview: the side marks it as the page open
    await expect(side.locator('.side-pages a[aria-current="page"]')).toHaveText("Overview");
    const deep = side.locator(".side-pages a.deep");
    await expect(deep).toHaveText(["Engine", "Desk", "Language models", "Assistant"]);
    await expect(side.getByRole("link", { name: "Kvasir" })).toHaveCount(0);
    await noSideways(page, vp.width);
    await shot(page, `settings-${vp.name}`);
  });

  test(`at ${vp.name} px an admin resets another person's password and removes them from their form, inside the window`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/round5.html#settings/identity");
    await page.getByRole("button", { name: "Change Erik Lund" }).click();
    const dialog = page.locator("dialog[open]");
    await dialog.getByRole("button", { name: "Reset the password" }).click();
    await expect(dialog.getByLabel("New password")).toBeVisible();
    await inside(page, "dialog[open] .person-act", vp.width);
    await noSideways(page, vp.width);
    await shot(page, `reset-${vp.name}`);
    await dialog.getByRole("button", { name: "Keep the old one" }).click();
    await dialog.getByRole("button", { name: "Remove the person" }).click();
    await expect(dialog.getByLabel("Hand their kept results to")).toHaveValue("astrid");
    await inside(page, "dialog[open] .person-act", vp.width);
    await shot(page, `remove-${vp.name}`);
    // the admin's own row offers neither
    await dialog.getByRole("button", { name: "Keep" }).click();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Change Astrid Berg" }).click();
    await expect(page.locator("dialog[open]").getByRole("button", { name: "Remove the person" })).toHaveCount(0);
  });

  test(`at ${vp.name} px one's own password opens on the profile`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/round5.html#profile");
    await page.getByRole("button", { name: "Change your password" }).click();
    await expect(page.getByLabel("Current password")).toBeVisible();
    await inside(page, ".password-form", vp.width);
    await noSideways(page, vp.width);
    await shot(page, `profile-${vp.name}`);
  });

  test(`at ${vp.name} px Backups prints restore as three steps to copy`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/round5.html#settings/database");
    await page.locator("details.restore summary").click();
    const steps = page.locator(".restore-steps li");
    await expect(steps).toHaveCount(3);
    await expect(steps.nth(1).locator("code")).toHaveText("nils restore /srv/backups/nils/nils-registry-2026-10-13T020000Z --yes --registry /srv/nils/registry");
    await inside(page, ".restore-steps li", vp.width);
    await noSideways(page, vp.width);
    await shot(page, `restore-${vp.name}`);
  });

  test(`at ${vp.name} px a release's row hands it over and withdraws it`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/round5.html#release");
    await expect(page.getByRole("button", { name: "Hand over ms-cohort-2026-10-01" })).toHaveCount(1);
    await expect(page.getByRole("button", { name: /^Withdraw / })).toHaveCount(2);
    await noSideways(page, vp.width);
    await shot(page, `release-${vp.name}`);
    await page.getByRole("button", { name: "Hand over ms-cohort-2026-10-01" }).click();
    const dialog = page.locator("dialog[open]");
    await dialog.getByLabel("Key").fill("partner-2026");
    await expect(dialog.locator("code")).toHaveText("nils handover password --key partner-2026");
    await inside(page, "dialog[open] .dialog-body, dialog[open] .handover-out", vp.width);
    await shot(page, `handover-${vp.name}`);
    await dialog.getByRole("button", { name: "Hand over", exact: true }).click();
    await expect(page.locator(".ok-words")).toContainText("queued as job 61");
    await page.getByRole("button", { name: "Withdraw ms-cohort-2026-10-01 version 1" }).click();
    await page.locator("dialog[open]").getByLabel("Why").fill("a subject withdrew consent");
    await shot(page, `withdraw-${vp.name}`);
    await page.locator("dialog[open]").getByRole("button", { name: "Withdraw", exact: true }).click();
    await expect(page.locator(".ok-words")).toContainText("queued as job 62");
    await noSideways(page, vp.width);
  });

  test(`at ${vp.name} px the Logs page shows the jobs beside a log, and a run's units`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/round5.html#pipelines/logs/51");
    await expect(page.locator(".log-text")).toContainText("nothing refused");
    await expect(page.getByRole("button", { name: "Earlier" })).toBeVisible();
    await inside(page, ".logs-list, .log-text", vp.width);
    const list = await page.locator(".logs-list").boundingBox();
    const log = await page.locator(".log-text").boundingBox();
    // beside on a laptop, stacked on a phone
    if (vp.width >= 1000) expect(log!.x).toBeGreaterThan(list!.x + list!.width - 1);
    else expect(log!.y).toBeGreaterThan(list!.y + list!.height - 1);
    await noSideways(page, vp.width);
    await shot(page, `logs-${vp.name}`);
    await page.goto("/round5.html#pipelines/logs/52");
    await page.getByRole("button", { name: "sub-3c4d_ses-1" }).click();
    await expect(page.locator(".log-text")).toContainText("N4BiasFieldCorrection");
    await inside(page, ".logs-units .opt", vp.width);
    await noSideways(page, vp.width);
    await shot(page, `unit-log-${vp.name}`);
    await page.goto("/round5.html#pipelines/logs/50");
    await expect(page.locator(".logs-open .warn")).toHaveText("Job 50 ran before this engine kept jobs' logs.");
    await openSide(page, vp);
    await expect(page.locator("#side").getByRole("link", { name: "Logs" })).toBeVisible();
  });

  test(`at ${vp.name} px the Assistant's Plans waiting and Standing grants draw inside the window`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/round5.html#assistant/plans");
    await expect(page.getByRole("heading", { name: "Plans waiting" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirm" })).toBeVisible();
    await inside(page, ".plan-row", vp.width);
    await noSideways(page, vp.width);
    await shot(page, `plans-${vp.name}`);
    await page.goto("/round5.html#assistant/grants");
    await expect(page.getByRole("heading", { name: "Standing grants" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Revoke POST /api/ask/run" })).toBeVisible();
    await inside(page, ".grant-row, .grant-add", vp.width);
    await noSideways(page, vp.width);
    await shot(page, `grants-${vp.name}`);
    await openSide(page, vp);
    await expect(page.locator("#side").getByRole("link", { name: "Plans waiting" })).toBeVisible();
    await expect(page.locator("#side").getByRole("link", { name: "Standing grants" })).toBeVisible();
  });
}
