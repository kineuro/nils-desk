// SPDX-License-Identifier: AGPL-3.0-only
// A campaign's upkeep in the desk's own shell (2026-11-05), at a laptop's
// width and a phone's: the lines that say why there is no gallery and why
// some items are read one by one, each open item's lease with Release, the
// pace's bound in its heading, and the close followed as a job until the
// page stands closed. Nothing goes sideways. SHOTS=<dir> keeps a screenshot
// of each.

import { expect, test, type Page } from "@playwright/test";

async function shot(page: Page, name: string) {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}-${test.info().project.name}.png` });
}

// the close is followed over a few reads of the campaign, each a second and a half apart
test.describe.configure({ timeout: 60_000 });

const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

for (const vp of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`a campaign's upkeep at ${vp.width} by ${vp.height}: why no gallery, the items read one by one, the leases, the pace's bound`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/upkeep.html");
    await expect(page.locator("h1")).toHaveText("body-part-curation");
    await expect(page.locator(".mode-missing")).toHaveText(/^No gallery: it shows one axis at a time, and this campaign asks 2 \(body_part, body_region\)/);
    await expect(page.locator(".read-alone")).toContainText("2 open items are read one by one");
    await expect(page.locator(".read-alone").getByRole("button", { name: "Read all in batches" })).toBeVisible();
    const held = page.locator(".campaign-items tbody tr").filter({ hasText: "with rune until" });
    await expect(held).toHaveCount(1);
    await expect(held.getByRole("button", { name: "Release" })).toBeVisible();
    await expect(page.locator(".campaign-items")).toContainText("lease ran out; free again for rune, no release needed");
    await expect(page.locator("h2").filter({ hasText: "Pace" })).toContainText("a claim open over 5 min is a break, not reading");
    await expect(page.locator("body")).not.toContainText(/held back|take the suggestion|earlier close/i);
    expect(await sideways(page)).toBeLessThanOrEqual(0);
    await shot(page, `upkeep-campaign-${vp.width}x${vp.height}`);
    await held.scrollIntoViewIfNeeded();
    await shot(page, `upkeep-items-${vp.width}x${vp.height}`);
  });

  test(`the close followed as a job at ${vp.width} by ${vp.height}: running, then what it wrote, then the page closed`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/upkeep.html");
    await page.locator(".data-head").getByRole("button", { name: "Close", exact: true }).click();
    await page.locator("dialog").getByRole("button", { name: "Close the campaign" }).click();
    await expect(page.locator("dialog")).toContainText("to go.");
    await expect(page.locator("dialog").getByRole("button", { name: "Close the campaign" })).toHaveCount(0);
    await shot(page, `upkeep-closing-${vp.width}x${vp.height}`);
    await expect(page.locator("dialog")).toContainText("Closed: 2 decisions, 4 unresolved; 1 refused: a decision of a higher rank holds body_part on stack 4003.", { timeout: 15_000 });
    await expect(page.locator("dialog")).toContainText("Item 3: a decision of a higher rank holds body_part on stack 4003");
    await expect(page.locator("dialog")).toContainText(`Close body-part-curation`);
    await expect(page.locator("dialog")).not.toContainText("again");
    await shot(page, `upkeep-closed-dialog-${vp.width}x${vp.height}`);
    await page.locator("dialog").getByRole("button", { name: "Done" }).click();
    await expect(page.locator(".lede .tag")).toHaveText("closed");
    await expect(page.locator(".data-head").getByRole("button", { name: "Close", exact: true })).toHaveCount(0);
    expect(await sideways(page)).toBeLessThanOrEqual(0);
  });

  test(`a close running seen on the page at ${vp.width} by ${vp.height}: how far, and no second close`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/upkeep.html?closing=1");
    await expect(page.locator("p.said[role=status]")).toContainText("Closing (started by astrid): 2 written, 1 to go. The page follows it.");
    await expect(page.locator(".data-head").getByRole("button", { name: /Close|Run the close again/ })).toHaveCount(0);
    expect(await sideways(page)).toBeLessThanOrEqual(0);
    await shot(page, `upkeep-closing-page-${vp.width}x${vp.height}`);
  });
}
