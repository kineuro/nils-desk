// SPDX-License-Identifier: AGPL-3.0-only
// A cohort's main scans, visit by visit, on a screen (Wave 7a, record 55
// H3): at a laptop's width (1440) and a phone's (390) a row's cells stay
// inside the window, wrapping on a phone, nothing scrolls sideways; a cell's
// state is its fill and a person's pick its border, never a glyph; only the
// chosen role's key is in colour; More subjects reads the next page.

import { expect, test } from "@playwright/test";

for (const vp of [
  { name: "laptop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
]) {
  test(`at ${vp.width}: cells inside the window, states by fill, a person's pick by its border, more subjects on a press`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/heat.html");
    await expect(page.locator(".heat-row")).toHaveCount(24);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(vp.width);
    for (const c of await page.locator(".heat-rows .heat-cell").all()) {
      const b = (await c.boundingBox())!;
      expect(b.x + b.width).toBeLessThanOrEqual(vp.width);
    }
    const fill = (sel: string) => page.locator(`.heat-rows ${sel}`).first().evaluate((e) => getComputedStyle(e).backgroundColor);
    const [picked, doubted, missing] = [await fill(".heat-cell.picked:not(.by-person)"), await fill(".heat-cell.doubted"), await fill(".heat-cell.missing")];
    expect(new Set([picked, doubted, missing]).size).toBe(3);
    expect(await page.locator(".heat-rows .heat-cell.by-person").first().evaluate((e) => getComputedStyle(e).borderTopWidth)).toBe("2px");
    expect(await page.locator(".heat-rows .heat-cell").first().evaluate((e) => e.textContent)).toBe("");
    const keys = await page.locator('[role="group"][aria-label="Role"] .opt').evaluateAll((els) => els.map((e) => [e.getAttribute("aria-pressed"), getComputedStyle(e).borderTopColor]));
    expect(keys.filter(([p]) => p === "true")).toHaveLength(1);
    await page.screenshot({ path: `test-results/heat-${vp.name}.png`, fullPage: true });
    await page.getByRole("button", { name: "More subjects" }).click();
    await expect(page.locator(".heat-row")).toHaveCount(48);
  });
}
