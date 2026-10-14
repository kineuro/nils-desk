// SPDX-License-Identifier: AGPL-3.0-only
// The review rule's screens at 1440 and at 390 px (record 55 D3, D6, D7):
// both suggestions side by side on a laptop and one over the other on a
// phone; a blind-first question shows nothing of NILS's until the answer,
// then both; the rounds and the audit family. Nothing scrolls sideways.
// SHOTS=<dir> keeps a screenshot of each.

import { expect, test, type Page } from "@playwright/test";

async function shot(page: Page, name: string) {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png`, fullPage: true });
}

async function noSideways(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over).toBeLessThanOrEqual(1);
}

for (const [w, h] of [[1440, 900], [390, 844]] as const) {
  test(`routine question at ${w}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/s1.html?view=routine");
    await expect(page.locator(".both-row")).toHaveCount(1);
    await expect(page.getByText("System 1, not confirmed").first()).toBeVisible();
    await noSideways(page);
    await shot(page, `question-routine-${w}`);
  });

  test(`blind-first question at ${w}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/s1.html?view=blind");
    await expect(page.getByText("NILS's answers show after yours")).toBeVisible();
    await expect(page.locator(".both-row")).toHaveCount(0);
    await shot(page, `question-blind-before-${w}`);
    await page.getByLabel("The value of base").selectOption("FLAIR");
    await page.getByRole("button", { name: "Answer, then see the suggestions" }).click();
    await expect(page.locator(".both-row")).toHaveCount(1);
    await noSideways(page);
    await shot(page, `question-blind-after-${w}`);
  });

  test(`rounds at ${w}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/s1.html?view=rounds");
    await expect(page.locator(".round")).toHaveCount(2);
    await noSideways(page);
    await shot(page, `rounds-${w}`);
  });

  test(`work with the audit family at ${w}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/s1.html?view=work");
    await expect(page.locator(".work-group.job-audit")).toHaveCount(1);
    await noSideways(page);
    await shot(page, `work-audit-${w}`);
  });
}
