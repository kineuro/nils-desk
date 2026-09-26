// SPDX-License-Identifier: AGPL-3.0-only
// The time to the next item (record 50, after the first gold campaign): the
// reader answers an item after reading it for a moment, and the clock runs
// from the Enter to the next item's file text on the screen. With reading
// ahead the next item's evidence and header were asked for while the one
// before was read, so it shows at once; without, it waits for the far
// engine's evidence door. Both are measured and printed; ahead is faster.

import { expect, test, type Page } from "@playwright/test";

const ITEMS = 4;

async function timeToNext(page: Page, prefetch: boolean): Promise<number[]> {
  await page.goto(`/next.html${prefetch ? "" : "?prefetch=off"}`);
  const times: number[] = [];
  await expect(page.locator(".header-block")).toContainText("series of item 1000");
  for (let n = 0; n < ITEMS; n++) {
    // the rater reads the item for a moment, then answers by keys
    await page.waitForTimeout(900);
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("5");
    const t = await page.evaluate(() => performance.now());
    await page.keyboard.press("Enter");
    const shown = await page.evaluate(
      (want) =>
        new Promise<number>((resolve) => {
          const seen = () => document.querySelector(".header-block")?.textContent?.includes(want);
          if (seen()) return resolve(performance.now());
          const o = new MutationObserver(() => {
            if (seen()) {
              o.disconnect();
              resolve(performance.now());
            }
          });
          o.observe(document.body, { subtree: true, childList: true, characterData: true });
        }),
      `series of item ${1001 + n}`,
    );
    times.push(Math.round(shown - t));
  }
  return times;
}

const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];

test.use({ viewport: { width: 1440, height: 900 } });

test("reading ahead shows the next item sooner", async ({ page }) => {
  const off = await timeToNext(page, false);
  const on = await timeToNext(page, true);
  console.log(`time to the next item: without reading ahead ${off.join(", ")} ms (median ${median(off)}), with it ${on.join(", ")} ms (median ${median(on)})`);
  expect(median(on)).toBeLessThan(median(off));
  // the evidence door alone takes 450 ms: ahead, the next item does not wait for it
  expect(median(on)).toBeLessThan(300);
  expect(median(off)).toBeGreaterThanOrEqual(450);
});
