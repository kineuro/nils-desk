// SPDX-License-Identifier: AGPL-3.0-only
// The cohort's heatmap with a layer, on a screen (record 55, decision 6: the
// data map's layers): at a laptop's width and a phone's the layer keys sit
// with the role's, only the chosen one in colour; a cell takes its value's
// colour, filled for the scan picked and as a frame alone where none is
// picked, never a glyph; the values stand as framed tags under the rows; the
// step's line says body part has not run on the cohort; nothing scrolls
// sideways. Screenshots go to test-results for a look.

import { expect, test } from "@playwright/test";

for (const vp of [
  { name: "laptop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
]) {
  test(`at ${vp.width}: the layer's colours on the cells, filled or framed, its values under the rows, nothing sideways`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/heat.html");
    await expect(page.locator(".heat-row")).toHaveCount(24);
    await page.locator('[role="group"][aria-label="Layer"]').getByRole("button", { name: "Body region" }).click();
    await expect(page.locator(".heat-rows .heat-cell.layered").first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(vp.width);
    const keys = await page.locator('[role="group"][aria-label="Layer"] .opt').evaluateAll((els) => els.map((e) => [e.getAttribute("aria-pressed"), getComputedStyle(e).borderTopColor]));
    expect(keys.filter(([p]) => p === "true")).toHaveLength(1);
    expect(new Set(keys.filter(([p]) => p === "false").map(([, c]) => c)).size).toBe(1);
    const filled = await page.locator(".heat-rows .heat-cell.layered:not(.held):not(.none)").first().evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(filled).not.toBe("rgba(0, 0, 0, 0)");
    const held = page.locator(".heat-rows .heat-cell.layered.held");
    if ((await held.count()) > 0) expect(await held.first().evaluate((e) => [getComputedStyle(e).backgroundColor, getComputedStyle(e).borderTopWidth])).toEqual(["rgba(0, 0, 0, 0)", "2px"]);
    expect(await page.locator(".heat-rows .heat-cell").first().evaluate((e) => e.textContent)).toBe("");
    await expect(page.locator(".heat-value")).toHaveText(["head", "spine"]);
    await expect(page.locator(".heat-step")).toContainText("Body part has not run on this cohort.");
    for (const c of await page.locator(".heat-rows .heat-cell").all()) {
      const b = (await c.boundingBox())!;
      expect(b.x + b.width).toBeLessThanOrEqual(vp.width);
    }
    await page.screenshot({ path: `test-results/heatlayers-${vp.name}.png`, fullPage: true });
  });
}
