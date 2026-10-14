// SPDX-License-Identifier: AGPL-3.0-only
// Review round 1 in the dataset viewer (record 56 section 6.3, DR3): under a
// scan whose rules and System 1 disagree, its question with the grid's mark
// and keys, on a laptop and on a phone with nothing scrolling sideways; 2
// chooses System 1's answer, Enter answers this scan alone, and its look
// goes from the tree. SHOTS=<dir> keeps a screenshot of each.

import { expect, test } from "@playwright/test";

for (const [name, width, height] of [
  ["1440", 1440, 900],
  ["390", 390, 844],
] as const) {
  test(`at ${width} by ${height} the scan's question sits under it and answers it alone`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/dataset.html");
    await expect(page.locator(".dview-row.scan.on")).toHaveCount(1);
    // a scan with no question has no bar
    await expect(page.locator(".scan-question")).toHaveCount(0);
    await page.locator(".dview-row.scan", { hasText: "Ax_T2w_2D_FLAIR_IR-TSE_ND" }).first().click();
    const bar = page.locator(".scan-question");
    await expect(bar.locator(".q-ask")).toHaveText("T2w or FLAIR?");
    await expect(bar).toContainText("NILS: T2w");
    // the picture is framed in the colour of NILS's answer
    await expect(page.locator(".dview-stage.asks")).toHaveAttribute("data-slot", "4");
    await page.locator(".scan-canvas").click();
    await page.keyboard.press("2");
    await expect(bar.locator(".opt.on")).toHaveText("2FLAIR");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const box = (await bar.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/dataset-question-${name}.png` });
    await page.keyboard.press("Enter");
    await expect(bar).toContainText("base: FLAIR · sorted again");
    const posted = await page.evaluate(() => (window as unknown as { posted: unknown[] }).posted);
    expect(posted).toEqual([{ value: "FLAIR", stacks: [102], except: [], dataset: "ms-a" }]);
    await expect(page.locator(".dview-row.scan.on")).not.toHaveClass(/look/u);
    await expect(page.locator(".dview-stage.asks")).toHaveCount(0);
  });
}
