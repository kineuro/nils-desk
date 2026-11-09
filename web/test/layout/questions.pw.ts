// SPDX-License-Identifier: AGPL-3.0-only
// Review round 1 in a real browser, in the desk's own shell (record 56
// section 6.3; UX round 5): on a laptop and on a phone the questions read as
// cards under Review's head with nothing scrolling sideways; a question opens as a grid
// of its scans framed by NILS's answer, the keys above it; 1 chooses the
// answer, the arrows and space set a scan apart, Enter sends one answer for
// the page with that scan as its exception, and the next question opens,
// where ? shows each scan's rule and what it was decided over. SHOTS=<dir>
// keeps a screenshot of each.

import { expect, test, type Page } from "@playwright/test";

const VIEWPORTS = [
  { name: "1440", width: 1440, height: 900 },
  { name: "390", width: 390, height: 844 },
];

async function shot(page: Page, name: string) {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` });
}

async function noSidewaysScroll(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  const inner = await page.locator("main.page").evaluate((e) => e.scrollWidth - e.clientWidth);
  expect(inner).toBeLessThanOrEqual(1);
}

// the whole desk is compiled on the first look, which takes a while on a busy machine
test.setTimeout(90_000);

for (const vp of VIEWPORTS) {
  test.describe(`${vp.width} by ${vp.height}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test("the questions read as cards under Review's head, each with its scans and why, and nothing else", async ({ page }) => {
      await page.goto("/questions.html#review/questions?dataset=ms-a");
      await expect(page.locator(".questions .rv-card.answer")).toHaveCount(2);
      await expect(page.locator(".questions h1")).toHaveText("Scans to answer");
      await expect(page.locator(".questions .data-head .eyebrow")).toHaveText("Review");
      await expect(page.locator(".questions .q-where")).toContainText("in dataset ms-a");
      await expect(page.locator(".rv-card.answer .rv-title")).toHaveText(["T2w or PDw?", "Which base?"]);
      await expect(page.locator(".rv-card.answer").nth(1)).toContainText("The rules found no base for these scans.");
      await expect(page.locator(".rv-card.answer").nth(1).locator(".rv-big")).toContainText("7");
      await expect(page.locator(".rv-card.answer a.button")).toHaveText(["Answer", "Answer"]);
      // the old head, its chips, the cohort chips, the zero cards and the table of what else waits are gone
      await expect(page.locator(".chips.pages")).toHaveCount(0);
      await expect(page.locator(".chips.cohorts")).toHaveCount(0);
      await expect(page.locator(".needs")).toHaveCount(0);
      await expect(page.locator("table.queue")).toHaveCount(0);
      await expect(page.getByText("Also waiting")).toHaveCount(0);
      await expect(page.getByText("What needs a person")).toHaveCount(0);
      const boxes = [];
      for (const card of await page.locator(".rv-card.answer").all()) {
        const b = (await card.boundingBox())!;
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x + b.width).toBeLessThanOrEqual(vp.width);
        boxes.push(b);
      }
      // a phone stacks the cards; a laptop puts them side by side
      if (vp.width < 640) expect(boxes[1].y).toBeGreaterThanOrEqual(boxes[0].y + boxes[0].height);
      else expect(Math.round(boxes[1].y)).toBe(Math.round(boxes[0].y));
      await noSidewaysScroll(page, vp.width);
      await shot(page, `questions-list-${vp.name}`);
    });

    test("a question is a grid answered with one key, a scan set apart, and Enter; the next question opens", async ({ page }) => {
      await page.goto("/questions.html#review/questions/base%3Amissing?dataset=ms-a");
      await expect(page.locator(".q-tile")).toHaveCount(7);
      await expect(page.locator(".qgrid-head h1")).toHaveText("Which base?");
      // every picture drawn
      await expect.poll(() => page.evaluate(() => [...document.querySelectorAll<HTMLImageElement>(".q-pic img")].filter((i) => i.complete && i.naturalWidth > 0).length)).toBe(7);
      // NILS has no base on these: dashed in the caution colour; the blind one neutral, with none of NILS's marks
      await expect(page.locator(".q-tile.none")).toHaveCount(6);
      await expect(page.locator('.q-tile[data-stack="205"] .q-blind')).toHaveText("blind");
      await expect(page.locator('.q-tile[data-stack="203"] .q-staged')).toHaveText("proposed T2w");
      await page.locator("body").click({ position: { x: 2, y: 2 } });
      await page.keyboard.press("1");
      await expect(page.locator(".q-keys .opt.on")).toHaveText("1T1w");
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press(" ");
      await expect(page.locator('.q-tile[data-stack="203"]')).toHaveClass(/apart/);
      await expect(page.locator(".q-tally")).toContainText("7 scans · T1w · 1 set apart");
      await noSidewaysScroll(page, vp.width);
      if (vp.width >= 1000) {
        // the keys and Apply stay in view over the grid, which scrolls inside the page
        const apply = (await page.getByRole("button", { name: /^Apply/u }).boundingBox())!;
        expect(apply.y + apply.height).toBeLessThanOrEqual(vp.height);
      }
      await shot(page, `questions-grid-${vp.name}`);
      if (vp.width >= 1000) {
        // f opens the focused scan full size over the grid, its picture at once; Esc closes it and the choice stays
        await page.keyboard.press("f");
        await expect(page.locator(".qgrid-full .scan-view")).toBeVisible();
        await expect(page.locator(".qgrid-full .scan-still")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.locator(".qgrid-full")).toHaveCount(0);
        await expect(page.locator(".q-tally")).toContainText("7 scans · T1w · 1 set apart");
      } else {
        // a phone reads two scans a row
        const tops = await page.locator(".q-tile").evaluateAll((els) => els.slice(0, 2).map((e) => Math.round(e.getBoundingClientRect().top)));
        expect(tops[0]).toBe(tops[1]);
      }
      await page.keyboard.press("Enter");
      await expect(page.locator(".qgrid-head h1")).toHaveText("T2w or PDw?");
      const posted = await page.evaluate(() => (window as unknown as { posted: unknown[] }).posted);
      expect(posted).toEqual([{ value: "T1w", stacks: [201, 202, 203, 204, 205, 206, 207], except: [{ stack: 203, value: "T2w" }], dataset: "ms-a" }]);
      await expect(page.locator(".qgrid-said")).toContainText("7 scans answered");
      // the next question: System 1's answer on each scan, the four it agrees on stepping back
      await expect(page.locator(".q-tile")).toHaveCount(12);
      await expect(page.locator(".q-tile.dim")).toHaveCount(4);
      await page.keyboard.press("?");
      await expect(page.locator(".q-rule").first()).toContainText("over physics/pd_by_te (PDw)");
      await noSidewaysScroll(page, vp.width);
      await shot(page, `questions-pair-${vp.name}`);
    });
  });
}
