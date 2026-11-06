// SPDX-License-Identifier: AGPL-3.0-only
// Where a label came from (UX round 2), in a real browser: in the browser's
// footer each fact is framed by its origin, a weighting a decision was not
// sorted into yet says what was decided, and a press opens its details above
// the footer, the re-sort and the campaign's link inside the screen; in the
// grid the visit's bar says a scan was sorted before its decision and offers
// the visit's re-sort, the card carrying what was decided. A laptop and a
// phone, no sideways scroll. Screenshots go to test-results for a look.

import { expect, test } from "@playwright/test";

for (const [device, width, height] of [
  ["laptop", 1440, 900],
  ["phone", 390, 844],
] as const) {
  test(`on a ${device} the browser's labels say where they came from`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/dataset.html");
    await expect(page.locator(".dview-row.scan.on")).toHaveCount(1);
    const stale = page.locator(".dview-facts button.origin[data-tone='stale']");
    await expect(stale).toHaveText("T1wdecided T2w");
    await expect(page.locator(".dview-facts button.origin[data-tone='rules']").first()).toBeVisible();
    await stale.click();
    const pop = page.locator(".origin-pop");
    await expect(pop).toContainText("Decided T2w; sorted before the decision");
    const again = pop.getByRole("button", { name: "Sort this scan again" });
    await expect(again).toBeInViewport();
    await expect(pop.getByRole("link", { name: "Campaign curate, item 412" })).toBeInViewport();
    const box = (await pop.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: `test-results/origins-browser-${device}.png` });
    // Esc closes the details and leaves the scan where it was
    await page.keyboard.press("Escape");
    await expect(pop).toHaveCount(0);
    await expect(page.locator(".dview-row.scan.on .dview-name")).toHaveText("Sag_T1w_3D_MPRAGE_ND");
    // the next scan: its weighting a person's decision, its press the campaign's link
    await page.locator(".dview-row.scan.on").focus();
    await page.keyboard.press("ArrowDown");
    const decided = page.locator(".dview-facts button.origin[data-tone='decision']");
    await expect(decided).toHaveText("T2w");
    await decided.click();
    await expect(page.locator(".origin-pop")).toContainText("Decided by anna@site");
    await page.screenshot({ path: `test-results/origins-decision-${device}.png` });
    await page.keyboard.press("Escape");
    // and the scan given contrast: that a model's
    await page.locator(".dview-row.scan .dview-name", { hasText: "Sag_T1w_3D_MPRAGE_ND_CE" }).first().click();
    const model = page.locator(".dview-facts button.origin[data-tone='model']");
    await expect(model).toHaveText("contrast");
    await model.click();
    await expect(page.locator(".origin-pop")).toContainText("Model post-contrast@1.2 · run 31 · p 0.94");
    await page.screenshot({ path: `test-results/origins-model-${device}.png` });
  });

  test(`on a ${device} the grid says a scan was sorted before its decision`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/grid.html#data/datasets/ms-a/view?mode=grid&subject=1&visit=s30");
    await expect(page.locator(".vw-scan").first()).toBeVisible();
    const bar = page.locator(".vw-stale");
    await expect(bar).toContainText("1 scan was sorted before its decision");
    await expect(bar.getByRole("button", { name: "Sort the visit again" })).toBeInViewport();
    await expect(page.locator(".vw-tag.stale")).toHaveText("decided neck");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: `test-results/origins-grid-${device}.png` });
    await page.locator(".vw-tag.stale").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/origins-grid-card-${device}.png` });
  });
}
