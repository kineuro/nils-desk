// SPDX-License-Identifier: AGPL-3.0-only
// Wave 7b's screens (spec 17) in a real browser, in the desk's shell
// (software.html), at a laptop's width and at a phone's: Settings > Software
// with where tools live and its tools, a run's units with who chose each
// knob and the numbers per comparability key, a refused total that says its
// pooling words, and the start of a run with the pack's goal, switches and
// judged units.
// Nothing scrolls sideways. SHOTS=<dir> keeps a screenshot of each.

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
  test(`at ${vp.name} px Settings > Software says where tools live and lists each tool with its state and next act`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/software.html#settings/software");
    await expect(page.locator(".software-where")).toContainText("Tools live in");
    const list = page.locator("ul.software-tools");
    await expect(list.locator("li.software-tool")).toHaveCount(5);
    await expect(list).toContainText("Needs its licence");
    await expect(list).toContainText("Did not pass its check");
    await expect(list).toContainText("the image changed since it was installed");
    await expect(list).toContainText("the site's copy at /srv/shared/software/pyment/5.1.0");
    await expect(list.getByRole("button", { name: "Accept the terms", exact: true })).toBeVisible();
    await noSideways(page, vp.width);
    await shot(page, `software-${vp.name}`);
    // the packages as the engine lists them stay under each tool's Details
    await list.locator("li.software-tool").first().locator("summary").click();
    await expect(list.locator("table.software-table").first()).toContainText("LicenseRef-FreeSurfer: terms not accepted");
    await noSideways(page, vp.width);
    await list.getByRole("button", { name: "Accept the terms", exact: true }).click();
    const dialog = page.locator("dialog[open]");
    await expect(dialog).toContainText("https://surfer.nmr.mgh.harvard.edu/registration.html");
    await noSideways(page, vp.width);
    await shot(page, `software-accept-${vp.name}`);
  });

  test(`at ${vp.name} px a fresh install offers a folder of tools first and lists ten tools`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/software.html?fresh#settings/software");
    await expect(page.locator("li.software-tool")).toHaveCount(10);
    await expect(page.getByRole("button", { name: "Use a folder of tools" })).toBeVisible();
    await expect(page.locator("ul.software-tools")).toContainText("Not here yet; a first run fetches it");
    await noSideways(page, vp.width);
    await shot(page, `software-fresh-${vp.name}`);
  });

  test(`at ${vp.name} px a shared folder offers its FreeSurfer copy and the folder's other tools`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/software.html?shared#settings/software");
    await expect(page.getByRole("button", { name: /Use the copy at/u })).toBeVisible();
    await expect(page.locator(".software-found")).toContainText("Not used by any pipeline");
    await noSideways(page, vp.width);
    await shot(page, `software-shared-${vp.name}`);
    await page.getByRole("button", { name: "Change folder" }).click();
    await expect(page.locator("dialog[open]")).toContainText("It installs into /srv/shared/tools/nils and changes nothing else.");
    await noSideways(page, vp.width);
    await shot(page, `software-place-${vp.name}`);
  });

  test(`at ${vp.name} px a run's units say who chose each knob, with caveats, flags and keys`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/software.html#pipelines/runs/41");
    await expect(page.locator(".knob.person").first()).toContainText("threads8Astrid");
    await expect(page.locator(".knob.rule").first()).toContainText("rule lesions-off-without-flair");
    await expect(page.locator(".keys-apart")).toContainText("never summed together");
    await expect(page.locator(".unit-caveat")).toContainText("the T1 was acquired below 1.5 T");
    await noSideways(page, vp.width);
    await shot(page, `run-units-${vp.name}`);
  });

  test(`at ${vp.name} px a total across keys is refused in its pooling words`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/software.html?pooled#pipelines/runs/41");
    await expect(page.getByText("Not summed: several comparability keys")).toBeVisible();
    await expect(page.getByText("The table could not be read")).toHaveCount(0);
    await noSideways(page, vp.width);
    await shot(page, `run-pooled-${vp.name}`);
  });

  test(`at ${vp.name} px the start of a run offers the pack's goal and switches and the judged units`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/software.html#pipelines/catalog");
    await page.getByRole("button", { name: "Run on a selection" }).first().click();
    const dialog = page.locator("dialog[open]");
    await expect(dialog.getByRole("group", { name: "the run's goal" })).toBeVisible();
    await expect(dialog).toContainText("fixed at 0.3");
    const over = dialog.getByRole("combobox", { name: "What the run goes over" });
    await over.click();
    await page.keyboard.type("study");
    await page.keyboard.press("Enter");
    await expect(dialog.locator(".judged-list")).toContainText("skipped: the T1 is 2D");
    await dialog.getByRole("button", { name: "research" }).click();
    await expect(dialog.locator("code")).toContainText("--goal research");
    await expect(dialog.locator(".judged-list")).toContainText("skipped: the T1 is 2D");
    await noSideways(page, vp.width);
    await dialog.locator(".judged-list").scrollIntoViewIfNeeded();
    await shot(page, `run-start-${vp.name}`);
  });
}
