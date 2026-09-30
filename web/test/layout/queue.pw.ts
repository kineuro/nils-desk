// SPDX-License-Identifier: AGPL-3.0-only
// The Review queue on a screen (record 51, G4 and R5): at a phone's width, a
// laptop's and a desktop's, the filter chips by axis and by reason wrap
// inside the page, nothing scrolls sideways, a reason narrows the table, a
// pick border's reasons open under it, and the badge of a model disagreeing
// with a person's decision stays inside its row and shows again in Look.

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

    test("the filter chips wrap inside the page and narrow the table", async ({ page }) => {
      await page.goto("/queue.html");
      const axis = page.getByRole("group", { name: "Axis" });
      const reason = page.getByRole("group", { name: "Reason" });
      await expect(axis.getByRole("button")).toHaveCount(10);
      await expect(reason.getByRole("button")).toHaveCount(7);
      for (const g of [axis, reason]) {
        const box = (await g.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
      }
      let s = await sideways(page);
      expect(s.scroll).toBeLessThanOrEqual(s.client);
      await axis.getByRole("button", { name: "base", exact: true }).click();
      await reason.getByRole("button", { name: "rules conflict" }).click();
      await expect(page.locator("tbody tr")).toHaveCount(1);
      await expect(page.locator(".section-head .meta").first()).toContainText("base: rules conflict, 1 open");
      await expect(page.getByRole("link", { name: "Ask people about these" })).toHaveAttribute("href", "#campaigns?make=review&from=base%3Aconflict");
      // a pick border's reasons open under the reasons, in words
      await reason.getByRole("button", { name: "pick borders" }).click();
      const border = page.getByRole("group", { name: "Border" });
      await expect(border.getByRole("button")).toHaveCount(8);
      await border.getByRole("button", { name: "a retake: the winner is more than one stack" }).click();
      await expect(page.locator("tbody tr")).toHaveCount(1);
      const box = (await border.boundingBox())!;
      expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
      s = await sideways(page);
      expect(s.scroll).toBeLessThanOrEqual(s.client);
    });

    test("the badge stays inside its row and shows again in Look", async ({ page }) => {
      await page.goto("/queue.html");
      await page.getByRole("group", { name: "Reason" }).getByRole("button", { name: "a decision disagrees" }).click();
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
