// SPDX-License-Identifier: AGPL-3.0-only
// The reader, next level (record 55 H5, spec 13.4): a picture box of a
// fixed size per screen class, so a big screen shows the same layout every
// time; a compact and an expanded view of the whole reader, kept per
// person; and why the rules decided beside the picture, open. Measured on
// an item read in the open (its suggestion, its evidence) in the desk's
// shell, at two window sizes inside each class: the picture box and the
// panel are the same at both. At 390 px the picture stands over the panel
// and nothing scrolls sideways. SHOTS=<dir> keeps a screenshot of each.

import { expect, test, type Page } from "@playwright/test";

async function shot(page: Page, name: string) {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}-${test.info().project.name}.png` });
}

async function box(page: Page) {
  await expect(page.locator(".viewer-plane.own")).toBeVisible();
  await expect(page.locator(".rate-side .evidence-lines")).toContainText("technique:first");
  return page.evaluate(() => {
    const r = (s: string) => document.querySelector<HTMLElement>(s)!.getBoundingClientRect();
    const panel = document.querySelector<HTMLElement>("[data-reader-panel]")!;
    const ev = r(".rate-side .evidence-lines");
    const pic = r(".rate-picture");
    const doc = document.documentElement;
    return {
      pic: { w: Math.round(pic.width), h: Math.round(pic.height), right: pic.right, top: pic.top },
      answer: [...panel.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.startsWith("Answer"))!.getBoundingClientRect().bottom,
      panel: { w: Math.round(panel.getBoundingClientRect().width), scroll: panel.scrollHeight, client: panel.clientHeight, left: panel.getBoundingClientRect().left },
      evidence: { left: ev.left, top: ev.top, bottom: ev.bottom },
      size: document.querySelector(".reader-one")!.getAttribute("data-reader-size"),
      doc: { scroll: doc.scrollHeight, client: doc.clientHeight, scrollW: doc.scrollWidth, clientW: doc.clientWidth },
    };
  });
}

async function view(page: Page, v: "compact" | "expanded") {
  await page.locator(`.size-toggle button:has-text("${v}")`).click();
  await expect(page.locator(".reader-one")).toHaveAttribute("data-reader-size", v);
}

// each class at its smallest window and a larger one inside it, with the picture box it sets (campaigns.css)
const CLASSES = [
  { name: "laptop", sizes: [[1400, 760], [1440, 900], [1700, 920]], expanded: [584, 640], compact: [648, 640] },
  { name: "desktop", sizes: [[1880, 940], [1920, 1080], [2400, 1250]], expanded: [920, 820], compact: [1008, 820] },
  { name: "big", sizes: [[2520, 1280], [2560, 1440], [3200, 1800]], expanded: [1420, 1150], compact: [1528, 1150] },
] as const;

for (const c of CLASSES) {
  test(`the ${c.name} class: one picture box and one panel at every window inside it, in both views`, async ({ page }) => {
    for (const v of ["expanded", "compact"] as const) {
      const seen = new Set<string>();
      for (const [w, h] of c.sizes) {
        await page.setViewportSize({ width: w, height: h });
        await page.goto("/?mode=seen");
        await view(page, v);
        const m = await box(page);
        console.log(`${c.name} ${w}x${h} ${v}: picture ${m.pic.w} by ${m.pic.h}, panel ${m.panel.w}`);
        expect([m.pic.w, m.pic.h]).toEqual([...c[v]]);
        seen.add(`${m.pic.w}x${m.pic.h}/${m.panel.w}`);
        // the evidence stands beside the picture, in the panel to its right, and the page fits; compact holds an open
        // item with its suggestion, four candidates and seven axes without a scroll, expanded may scroll its panel
        // under an answer bar that stays on screen
        expect(m.evidence.left).toBeGreaterThanOrEqual(m.pic.right);
        if (v === "compact") expect(m.panel.scroll).toBeLessThanOrEqual(m.panel.client);
        expect(m.answer).toBeLessThanOrEqual(h);
        expect(m.doc.scroll).toBeLessThanOrEqual(m.doc.client);
        expect(m.doc.scrollW).toBeLessThanOrEqual(m.doc.clientW);
        if (w === 1440 && h === 900) await shot(page, `reader-1440-${v}`);
      }
      expect(seen.size).toBe(1);
    }
  });
}

test("compact gives the picture the room expanded gives the panel, and the choice is kept", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?mode=seen");
  await view(page, "expanded");
  const e = await box(page);
  await view(page, "compact");
  const c = await box(page);
  expect(c.pic.w).toBeGreaterThan(e.pic.w);
  expect(c.panel.w).toBeLessThan(e.panel.w);
  // expanded: the evidence with its clause and votes and the file whole; compact: a line per axis
  expect(await page.locator(".evidence-lines .ev-more").count()).toBe(0);
  await page.reload();
  await expect(page.locator(".reader-one")).toHaveAttribute("data-reader-size", "compact");
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("Shift+H");
  await expect(page.locator(".reader-one")).toHaveAttribute("data-reader-size", "expanded");
  await expect(page.locator(".evidence-lines .ev-more").first()).toBeVisible();
});

test("a blind item shows the file and no evidence", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator(".header-block")).toContainText("t1_mprage_sag");
  await expect(page.locator(".evidence-lines")).toHaveCount(0);
});

test("a phone: the picture over the panel, the evidence under it, nothing sideways", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?mode=seen");
  await expect(page.locator(".viewer-plane.own")).toBeVisible();
  const ev = page.locator(".rate-side .evidence-lines");
  await expect(ev).toContainText("technique:first");
  const m = await page.evaluate(() => {
    const pic = document.querySelector<HTMLElement>(".rate-picture")!.getBoundingClientRect();
    const ev = document.querySelector<HTMLElement>(".rate-side .evidence-lines")!.getBoundingClientRect();
    const doc = document.documentElement;
    return { picBottom: pic.bottom, evTop: ev.top, evRight: ev.right, scrollW: doc.scrollWidth, clientW: doc.clientWidth };
  });
  expect(m.evTop).toBeGreaterThanOrEqual(m.picBottom);
  expect(m.evRight).toBeLessThanOrEqual(390);
  expect(m.scrollW).toBeLessThanOrEqual(m.clientW);
  await shot(page, "reader-390");
  await ev.scrollIntoViewIfNeeded();
  await shot(page, "reader-390-evidence");
});
