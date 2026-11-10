// SPDX-License-Identifier: AGPL-3.0-only
// The batch accept grid in a real browser, in the desk's own shell (UX round
// 5): at a laptop's width and a phone's, Review's card offers Review the N
// for what the model left unsure; the grid opens on the most proposed value
// below the threshold (the whole range the door gives) with its chips, its histogram and its state line; the
// pictures are dense (about a hundred pixels on a laptop, five a row on a
// phone) and each is framed in the proposed value's colour; a click sets a
// scan apart, a shift-click a range, space the focused one; Enter accepts
// the page but the exceptions, the line says what was written and the job,
// and the next page loads; a set-apart tile takes its value from the axis's
// list, opened over it by 0 or its corner, and Accept writes the correction
// (UX round 6, item 4); a second, quieter button takes the whole band after
// a confirm, the line follows its job and then the re-sort, and the page is
// read again (UX round 6, item 5); nothing scrolls sideways. SHOTS=<dir>
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
test.setTimeout(120_000);

for (const vp of VIEWPORTS) {
  test.describe(`${vp.width} by ${vp.height}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test("Review's card offers Review the N for what the model left unsure, the campaign second", async ({ page }) => {
      await page.goto("/proposalgrid.html#review");
      const card = page.locator(".rv-card.proposed").first();
      await expect(card).toContainText("Body part");
      await expect(card.getByRole("link", { name: "Review the 74,132" })).toHaveAttribute("href", "#review/proposals/12/body_part");
      await expect(card.getByRole("button", { name: "Read the 74,132" })).toHaveClass(/secondary/);
      await noSidewaysScroll(page, vp.width);
      await shot(page, `proposalgrid-card-${vp.name}`);
      await card.getByRole("link", { name: "Review the 74,132" }).click();
      await expect(page.locator(".qgrid-head h1")).toHaveText("Body part · what the model is unsure of");
    });

    test("the grid opens dense on the most proposed value below the threshold; clicks set apart; Enter accepts the page and the next loads", async ({ page }) => {
      await page.goto("/proposalgrid.html#review/proposals/12/body_part");
      await expect(page.locator(".pg-tile")).toHaveCount(500);
      await expect(page.locator(".pg-values .opt.on")).toHaveText("neck41,212");
      await expect(page.locator(".pg-bar")).toHaveCount(10);
      await expect(page.locator(".pg-state")).toHaveText("page 1 of 83 · 41,212 neck");
      await expect(page.getByRole("button", { name: /^Accept 499 as neck/u })).toBeVisible();
      // every picture drawn, each framed in the proposed value's colour
      await expect.poll(() => page.evaluate(() => [...document.querySelectorAll<HTMLImageElement>(".pg-tile img")].filter((i) => i.complete && i.naturalWidth > 0).length)).toBe(500);
      await expect(page.locator(".pg-tile[data-slot]")).toHaveCount(500);
      // dense: about a hundred pixels across on a laptop, five a row on a phone
      const boxes = await page.locator(".pg-tile").evaluateAll((els) => els.slice(0, 12).map((e) => e.getBoundingClientRect().toJSON() as DOMRect));
      const columns = boxes.filter((b) => Math.round(b.top) === Math.round(boxes[0].top)).length;
      if (vp.width >= 1000) {
        expect(columns).toBeGreaterThanOrEqual(10);
        expect(boxes[0].width).toBeGreaterThanOrEqual(90);
        expect(boxes[0].width).toBeLessThanOrEqual(130);
      } else {
        expect(columns).toBe(5);
      }
      // square, never a strip: a tile is about as tall as it is wide
      for (const b of boxes) expect(Math.abs(b.height - b.width)).toBeLessThanOrEqual(12);
      await noSidewaysScroll(page, vp.width);
      await shot(page, `proposalgrid-${vp.name}`);
      // a click sets apart, a shift-click a range, space the focused one
      await page.locator('.pg-tile[data-stack="1003"]').click();
      await page.locator('.pg-tile[data-stack="1006"]').click({ modifiers: ["Shift"] });
      await expect(page.locator(".pg-tile.apart")).toHaveCount(4);
      await page.locator("body").click({ position: { x: 2, y: 2 } });
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press(" ");
      await expect(page.locator('.pg-tile[data-stack="1007"]')).toHaveClass(/apart/);
      await expect(page.locator(".pg-foot .q-tally")).toContainText("5 set apart");
      await expect(page.getByRole("button", { name: /^Accept 494 as neck/u })).toBeVisible();
      await shot(page, `proposalgrid-apart-${vp.name}`);
      if (vp.width >= 1000) {
        // the primary button stays in view under the grid, which scrolls inside the page
        const accept = (await page.getByRole("button", { name: /^Accept \d/u }).boundingBox())!;
        expect(accept.y + accept.height).toBeLessThanOrEqual(vp.height);
        // f opens the focused scan full size; Esc closes it and the exceptions stay
        await page.keyboard.press("f");
        await expect(page.locator(".qgrid-full .scan-view")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.locator(".qgrid-full")).toHaveCount(0);
        await expect(page.locator(".pg-tile.apart")).toHaveCount(5);
      }
      // the histogram's handles narrow the band, and the address keeps it
      const low = page.getByLabel("Lowest confidence");
      await low.focus();
      await low.press("ArrowRight");
      await expect(page.locator(".pg-state")).toContainText("neck at 0.31 or above");
      expect(page.url()).toContain("value=neck&min=0.31");
      await expect(page.locator(".pg-tile")).toHaveCount(500);
      // Enter accepts the page but the exceptions: nothing of them is written
      await page.locator("body").click({ position: { x: 2, y: 2 } });
      await page.locator('.pg-tile[data-stack="1003"]').click();
      await page.keyboard.press("Enter");
      await expect(page.locator(".qgrid-said")).toContainText("Accepted 498 as neck in your name · 1 set apart stays a proposal");
      // the line follows the re-sort job the accept queued: the job while it runs, then done
      await expect(page.locator(".qgrid-said")).toHaveText(/(sorted again as job 356|249 of 498 sorted again \(job 356\))$/u);
      await expect(page.locator(".qgrid-said")).toContainText("498 of 498 sorted again", { timeout: 8000 });
      const posted = await page.evaluate(() => (window as unknown as { posted: { seen: number[]; except: number[]; value: string; min?: number; max?: number }[] }).posted);
      expect(posted).toHaveLength(1);
      expect(posted[0].value).toBe("neck");
      expect(posted[0].min).toBe(0.31);
      expect(posted[0].max).toBeUndefined();
      expect(posted[0].seen).toHaveLength(500);
      expect(posted[0].except).toEqual([1003]);
      // the next page: the state line counts what is left, no exception carried over
      await expect(page.locator(".pg-state")).toContainText("40,714 neck at 0.31 or above");
      await expect(page.locator(".pg-tile.apart")).toHaveCount(0);
      await noSidewaysScroll(page, vp.width);
      await shot(page, `proposalgrid-accepted-${vp.name}`);
    });

    test("a set-apart tile takes its value: 0 opens the axis's list over it, the pick frames and names it, Accept writes the correction beside the rest", async ({ page }) => {
      await page.goto("/proposalgrid.html#review/proposals/12/body_part");
      await expect(page.locator(".pg-tile")).toHaveCount(500);
      await expect(page.locator(".pg-foot .q-help")).toContainText("0other value");
      const tile = page.locator('.pg-tile[data-stack="1003"]');
      await tile.click();
      await expect(tile.locator(".pg-corner")).toHaveText("apart");
      await page.locator("body").click({ position: { x: 2, y: 2 } });
      await page.keyboard.press("0");
      const pop = tile.locator(".q-pop");
      await expect(pop).toBeVisible();
      await expect(pop.locator(".q-pop-for")).toHaveText("scan 1003 · body part");
      await expect(pop.getByRole("button")).toHaveText(["brain", "brain-neck", "chest", "neck", "spine"]);
      const pb = (await pop.boundingBox())!;
      expect(pb.x).toBeGreaterThanOrEqual(0);
      expect(pb.x + pb.width).toBeLessThanOrEqual(vp.width);
      await shot(page, `proposalgrid-list-${vp.name}`);
      // the pick: the tile takes the value's frame and word; the button and the tally count it
      await pop.getByRole("button", { name: "brain", exact: true }).click();
      await expect(pop).toHaveCount(0);
      await expect(tile).toHaveClass(/corrected/);
      await expect(tile.locator(".pg-corner")).toHaveText("brain");
      await expect(tile).toHaveAttribute("data-slot", "1");
      await expect(page.locator('.pg-tile[data-stack="1004"]')).toHaveAttribute("data-slot", "2");
      await expect(page.getByRole("button", { name: /^Accept 498 as neck · 1 corrected/u })).toBeVisible();
      await expect(page.locator(".pg-foot .q-tally")).toContainText("1 corrected (1 brain)");
      // the last tile of the first row: its list opens within the grid, leftward; with two set apart and still without
      // a value, for both (the tile corrected to brain already is left alone)
      const boxes = await page.locator(".pg-tile").evaluateAll((els) => els.slice(0, 24).map((e) => e.getBoundingClientRect().toJSON() as DOMRect));
      const columns = boxes.filter((b) => Math.round(b.top) === Math.round(boxes[0].top)).length;
      const last = page.locator(`.pg-tile[data-stack="${1000 + columns - 1}"]`);
      const other = page.locator(`.pg-tile[data-stack="${1000 + columns}"]`);
      await other.click();
      await last.click();
      await last.locator(".pg-corner").click();
      const pop2 = last.locator(".q-pop");
      await expect(pop2).toBeVisible();
      await expect(pop2.locator(".q-pop-for")).toContainText("the 2 set apart");
      const gb = (await page.locator(".pgrid").boundingBox())!;
      const pb2 = (await pop2.boundingBox())!;
      expect(pb2.x + pb2.width).toBeLessThanOrEqual(Math.max(gb.x + gb.width, vp.width) + 1);
      await noSidewaysScroll(page, vp.width);
      await shot(page, `proposalgrid-corrected-${vp.name}`);
      await page.keyboard.press("Escape");
      await expect(pop2).toHaveCount(0);
      await last.click();
      await expect(last).not.toHaveClass(/apart/);
      await other.click();
      await expect(page.locator(".pg-tile.apart")).toHaveCount(0);
      // Enter: the correction goes with the body, out of except; the line says both
      await page.locator("body").click({ position: { x: 2, y: 2 } });
      await page.keyboard.press("Enter");
      await expect(page.locator(".qgrid-said")).toContainText("Accepted 498 as neck and corrected 1 (1 brain) in your name");
      const posted = await page.evaluate(() => (window as unknown as { posted: { seen: number[]; except: number[]; corrections?: { stack: number; value: string }[] }[] }).posted);
      expect(posted).toHaveLength(1);
      expect(posted[0].except).toEqual([]);
      expect(posted[0].corrections).toEqual([{ stack: 1003, value: "brain" }]);
      await expect(page.locator(".pg-tile.corrected")).toHaveCount(0);
    });

    test("the whole band is accepted in one move: the second button, its confirm, the line that follows the job then the re-sort, and the page read again", async ({ page }) => {
      await page.goto("/proposalgrid.html#review/proposals/12/body_part");
      await expect(page.locator(".pg-tile")).toHaveCount(500);
      const band = page.locator(".pg-foot .pg-band-accept");
      await expect(band).toHaveText("Accept all 41,212 neck");
      await expect(band).toHaveClass(/secondary/);
      // the page's Accept stays first and the second button sits after it in the foot, within the window's width;
      // on a laptop the foot is in view under the grid, which scrolls inside the page
      const accept = (await page.getByRole("button", { name: /^Accept 499 as neck/u }).boundingBox())!;
      const bb = (await band.boundingBox())!;
      expect(bb.x + bb.width).toBeLessThanOrEqual(vp.width);
      if (vp.width >= 1000) expect(bb.y + bb.height).toBeLessThanOrEqual(vp.height);
      expect(bb.y > accept.y || bb.x > accept.x).toBe(true);
      // one corrected, one set apart: the confirm names both
      const tile = page.locator('.pg-tile[data-stack="1004"]');
      await tile.click();
      await tile.locator(".pg-corner").click();
      await tile.locator(".q-pop").getByRole("button", { name: "brain", exact: true }).click();
      await page.locator('.pg-tile[data-stack="1003"]').click();
      await expect(page.locator(".pg-foot .q-tally")).toContainText("1 corrected (1 brain) · 1 set apart");
      await band.click();
      const dialog = page.locator("dialog.dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog.locator("h2")).toHaveText("Accept them all");
      await expect(dialog.locator(".lede")).toHaveText("41,212 scans get body part = neck, what the model proposed, in your name, without a look at each picture. 1 set apart on this page stays a proposal; 1 corrected gets its value. Every page shows it once they are sorted again.");
      const db = (await dialog.boundingBox())!;
      expect(db.x).toBeGreaterThanOrEqual(0);
      expect(db.x + db.width).toBeLessThanOrEqual(vp.width);
      await shot(page, `proposalgrid-band-confirm-${vp.name}`);
      // Escape closes it with nothing sent; the button opens it again
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      expect(await page.evaluate(() => (window as unknown as { banded: unknown[] }).banded.length)).toBe(0);
      await band.click();
      await dialog.getByRole("button", { name: "Accept all 41,212" }).click();
      // the dialog closes on the answer; the line says the job, follows it, then the re-sort, and the page is read again
      await expect(dialog).toHaveCount(0);
      await expect(page.locator(".qgrid-said")).toHaveText(/^Accepting 41,211 as neck in your name · (job 357|20,605 of 41,211 accepted \(job 357\))$/u);
      await expect(page.locator(".qgrid-said")).toHaveText("Accepting 41,211 as neck in your name · 20,605 of 41,211 accepted (job 357)");
      await expect(band).toBeDisabled();
      await shot(page, `proposalgrid-band-running-${vp.name}`);
      await expect(page.locator(".qgrid-said")).toHaveText("Accepted 41,209 as neck and corrected 1 (1 brain) in your name · 1 set apart stays a proposal · 1 keeps a person's decision · 3 questions closed · 41,210 of 41,210 sorted again", { timeout: 8000 });
      const banded = await page.evaluate(() => (window as unknown as { banded: { value: string; count: number; except: number[]; corrections?: { stack: number; value: string }[]; min?: number; seen?: unknown }[] }).banded);
      expect(banded).toHaveLength(1);
      expect(banded[0].value).toBe("neck");
      expect(banded[0].count).toBe(41212);
      expect(banded[0].min).toBeUndefined();
      expect(banded[0].seen).toBeUndefined();
      expect(banded[0].except).toEqual([1003]);
      expect(banded[0].corrections).toEqual([{ stack: 1004, value: "brain" }]);
      // the band holds the one scan a person decided meanwhile: it fits the page, so the band button is gone
      await expect(page.locator(".pg-state")).toHaveText("page 1 of 1 · 1 neck");
      await expect(page.locator(".pg-tile")).toHaveCount(1);
      await expect(band).toHaveCount(0);
      await noSidewaysScroll(page, vp.width);
      await shot(page, `proposalgrid-band-done-${vp.name}`);
    });
  });
}
