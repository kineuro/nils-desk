// SPDX-License-Identifier: AGPL-3.0-only
// Record 55, ruling 24, in a real browser in the desk's own shell
// (access.html), at a laptop's width and at a phone's: an admin's People form
// draws every page at its top with nothing to give; another person's form and
// a group's offer every page, every setting and everything at once; the
// Assistant's Standing grants say what each lets the assistant do, under its
// page, with no door on the screen, for a person who is not an admin, and
// tell an admin there is nothing to give. Nothing scrolls sideways.
// SHOTS=<dir> keeps a screenshot of each.

import { expect, test, type Page } from "@playwright/test";

const SIZES = [
  { name: "1440", width: 1440, height: 900 },
  { name: "390", width: 390, height: 844 },
];

async function shot(page: Page, name: string) {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/access-${name}-${test.info().project.name}.png`, fullPage: true });
}

async function noSideways(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
}

/** No engine door, as a method and a path, anywhere on the page. */
async function noDoor(page: Page) {
  const text = await page.locator("body").innerText();
  expect(text).not.toMatch(/\/api\/|\b(GET|POST|PUT|DELETE) \//u);
}

for (const vp of SIZES) {
  test(`at ${vp.name} px an admin's form holds every page and every detail, with nothing to give`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/access.html#settings/people");
    await page.getByRole("button", { name: "Change Astrid Berg" }).click();
    const dialog = page.locator("dialog[open]");
    await expect(dialog.getByText("Every page, every detail. Nothing to give.")).toBeVisible();
    await expect(dialog.getByText("Astrid Berg is an admin: every page, every detail.")).toBeVisible();
    await expect(dialog.getByRole("group", { name: "Campaigns" }).getByRole("button", { name: "Work" })).toHaveAttribute("aria-pressed", "true");
    await expect(dialog.getByRole("group", { name: "Campaigns" }).getByRole("button", { name: "See" })).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "Everything", exact: true })).toHaveAttribute("aria-pressed", "true");
    await noSideways(page, vp.width);
    await shot(page, `admin-form-${vp.name}`);
  });

  test(`at ${vp.name} px a person's form gives every page, every setting or everything at once`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/access.html#settings/people");
    await page.getByRole("button", { name: "Change Erik Lund" }).click();
    const dialog = page.locator("dialog[open]");
    await dialog.getByRole("button", { name: "Every page" }).click();
    await expect(dialog.getByRole("group", { name: "Campaigns" }).getByRole("button", { name: "Work" })).toHaveAttribute("aria-pressed", "true");
    await expect(dialog.getByRole("group", { name: "Places" }).getByRole("button", { name: "Hidden" })).toHaveAttribute("aria-pressed", "true");
    await noSideways(page, vp.width);
    await shot(page, `person-pages-${vp.name}`);
    await dialog.getByRole("button", { name: "Everything", exact: true }).first().click();
    await expect(dialog.getByText("Erik Lund is an admin: every page, every detail.")).toBeVisible();
    await shot(page, `person-everything-${vp.name}`);
  });

  test(`at ${vp.name} px Standing grants say what each lets the assistant do, under its page, with no door`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/access.html?as=erik#assistant/grants");
    await expect(page.getByRole("heading", { name: "Standing grants" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Campaigns" })).toBeVisible();
    await expect(page.getByText("Bring in identifier maps")).toBeVisible();
    await expect(page.getByRole("button", { name: "Revoke all of Campaigns" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Give everything" })).toBeVisible();
    await noDoor(page);
    await noSideways(page, vp.width);
    await shot(page, `grants-${vp.name}`);
  });

  test(`at ${vp.name} px Standing grants tell an admin there is nothing to give`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/access.html#assistant/grants");
    await expect(page.getByText("You are an admin. The assistant may do everything you may; nothing to give.")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Give/u })).toHaveCount(0);
    await noDoor(page);
    await noSideways(page, vp.width);
    await shot(page, `grants-admin-${vp.name}`);
  });

  test(`at ${vp.name} px Plans waiting says why a step is held in words, with no door`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/access.html#assistant/plans");
    await expect(page.getByRole("heading", { name: "Plans waiting" })).toBeVisible();
    await expect(page.getByText(/no standing grant for this step/u)).toBeVisible();
    await noDoor(page);
    await noSideways(page, vp.width);
    await shot(page, `plans-${vp.name}`);
  });
}
