// SPDX-License-Identifier: AGPL-3.0-only
// The Review queue on a screen (record 51, G4 and R5): at a phone's width, a
// laptop's and a desktop's, the cards and the table stay inside the page and
// nothing scrolls sideways; since Review round 1 (record 56 section 6.3,
// DR4) no chips choose an axis or a reason and no card sorts or accepts in
// bulk, while a filter the address names still narrows the table and says
// how to undo it; and the badge of a model disagreeing with a person's
// decision stays inside its row and shows again in Look.

import { expect, test, type Page } from "@playwright/test";

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
];

async function sideways(page: Page) {
  return page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
}

for (const vp of VIEWPORTS) {
  test.describe(`${vp.width} by ${vp.height}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test("no chips and no bulk act; a filter the address names narrows the table, nothing sideways", async ({ page }) => {
      await page.goto("/queue.html");
      await expect(page.getByRole("group", { name: "Axis" })).toHaveCount(0);
      await expect(page.getByRole("group", { name: "Reason" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Sort them" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /Accept the rules/u })).toHaveCount(0);
      let s = await sideways(page);
      expect(s.scroll).toBeLessThanOrEqual(s.client);
      await page.goto("/queue.html#review/questions?axis=base&reason=conflict");
      await expect(page.locator("tbody tr")).toHaveCount(1);
      await expect(page.locator(".section-head .meta").first()).toContainText("base: rules conflict, 1 open");
      await expect(page.getByRole("link", { name: "every question" })).toHaveAttribute("href", "#review/questions");
      await expect(page.getByRole("link", { name: "Ask people about these" })).toHaveAttribute("href", "#review/campaigns?make=review&from=base%3Aconflict");
      // a pick border's reason, named in the address
      await page.goto("/queue.html#review/questions?reason=pick.border&border=retake");
      await expect(page.locator("tbody tr")).toHaveCount(1);
      for (const box of [await page.locator(".needs").boundingBox(), await page.locator("table.queue").boundingBox()]) {
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width);
      }
      s = await sideways(page);
      expect(s.scroll).toBeLessThanOrEqual(s.client);
    });

    test("the badge stays inside its row and shows again in Look", async ({ page }) => {
      await page.goto("/queue.html#review/questions?reason=decision");
      const badge = page.locator("tbody .tag.badge");
      await expect(badge).toHaveCount(1);
      await expect(badge).toHaveText("a model disagrees with this person's decision");
      const b = (await badge.boundingBox())!;
      const cell = (await page.locator("tbody tr").filter({ has: page.locator(".tag.badge") }).locator("td").nth(1).boundingBox())!;
      expect(b.x).toBeGreaterThanOrEqual(cell.x - 1);
      expect(b.x + b.width).toBeLessThanOrEqual(cell.x + cell.width + 1);
      const s = await sideways(page);
      expect(s.scroll).toBeLessThanOrEqual(s.client);
      await page.locator("tbody tr").filter({ has: page.locator(".tag.badge") }).getByRole("button", { name: "Look" }).click();
      const dialog = page.locator("dialog[open]");
      await expect(dialog.locator(".tag.badge")).toHaveText("a model disagrees with this person's decision");
      await expect(dialog.getByRole("button", { name: "Decide" })).toBeVisible();
      await expect(dialog).toContainText("bodypart-infer-fusion-head 0.2.0 proposes brain-neck at 0.97 where a person decided body_part is spine");
    });
  });
}
