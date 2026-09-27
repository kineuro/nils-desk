// SPDX-License-Identifier: AGPL-3.0-only
// The reader and the gallery grow with the screen (after the reader's
// large keys: "all items remain same size and only images get bigger ... the
// elements should get bigger based on available size"). On a laptop the
// panel is the compact one it was before the large keys; on a big screen
// the panel, its keys, the file's words, the answer's bar and the head line
// grow together, by one factor, and the pictures take the rest. The values
// are coloured by a frame and a bar, no shape beside them. Measured in the
// desk's own shell (rater.html) and on the gallery's page, in chromium and,
// with LAYOUT_FIREFOX=1, Firefox. SHOTS=<dir> keeps a screenshot of each.

import { expect, test, type Page } from "@playwright/test";

// the shapes the values once carried beside their names
const SHAPES = ["●", "■", "▲", "◆", "★", "✚", "⬟", "▼", "◐", "✱"];
const PICTURE = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAADAAAAAQCAAAAAB1xaNtAAAAFElEQVR4nGNoIBEwjGoY1TB8NQAAJYSAEGy7FvQAAAAASUVORK5CYII=", "base64");

async function shot(page: Page, name: string) {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}-${test.info().project.name}.png` });
}

/** The reader's sizes as drawn: a box's height or width, a font's size times the zoom it is drawn at. */
async function reader(page: Page) {
  await expect(page.locator(".viewer-plane.own")).toBeVisible();
  await expect(page.locator('.axis-row[aria-label="body_part"] .opt')).toHaveCount(6);
  return page.evaluate((shapes) => {
    const q = (s: string) => document.querySelector<HTMLElement>(s)!;
    const font = (el: HTMLElement) => parseFloat(getComputedStyle(el).fontSize) * ((el as HTMLElement & { currentCSSZoom?: number }).currentCSSZoom ?? 1);
    const key = q('.axis-row[aria-label="body_part"] .opt');
    const words = [...document.querySelectorAll<HTMLElement>(".axis-values, .rate-side")].map((e) => e.textContent ?? "").join(" ");
    return {
      key: key.getBoundingClientRect().height,
      keyFont: font(key),
      header: font(q(".header-block")),
      h1: font(q(".reader-head h1")),
      answer: q(".reader-one .act-answer").getBoundingClientRect().height,
      panel: q("[data-reader-panel]").getBoundingClientRect().width,
      own: q(".viewer-plane.own").getBoundingClientRect().width,
      marks: document.querySelectorAll(".vmark").length,
      shapes: shapes.filter((s) => words.includes(s)).length,
      doc: { scroll: document.documentElement.scrollHeight, client: document.documentElement.clientHeight, scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth },
    };
  }, SHAPES);
}

type Sizes = Awaited<ReturnType<typeof reader>>;
const round = (m: Sizes) => `key ${m.key.toFixed(1)} px (${m.keyFont.toFixed(1)} px text), header ${m.header.toFixed(1)} px, h1 ${m.h1.toFixed(1)} px, answer ${m.answer.toFixed(1)} px, panel ${Math.round(m.panel)} px, lead plane ${Math.round(m.own)} px`;

async function readerAt(page: Page, width: number, height: number): Promise<Sizes> {
  await page.setViewportSize({ width, height });
  await page.goto("/rater.html");
  const m = await reader(page);
  console.log(`reader ${width}x${height}: ${round(m)}`);
  await shot(page, `reader-${width}x${height}`);
  return m;
}

test("the reader on a laptop is the compact panel it was before the large keys", async ({ page }) => {
  for (const [w, h] of [[1366, 768], [1440, 900]]) {
    const m = await readerAt(page, w, h);
    // .opt's 1.75rem and 13px, the file's words at 12.5px, the heading at 1.25rem, the panel 34rem
    expect(m.key).toBeCloseTo(28, 0);
    expect(m.keyFont).toBeCloseTo(13, 1);
    expect(m.header).toBeCloseTo(12.5, 1);
    expect(m.h1).toBeCloseTo(20, 1);
    expect(m.panel).toBeCloseTo(544, 0);
    expect(m.doc.scroll).toBeLessThanOrEqual(m.doc.client);
  }
});

test("on a big screen the whole panel grows by one factor, and the pictures still take the rest", async ({ page }) => {
  const small = await readerAt(page, 1366, 768);
  for (const [w, h, lo, hi, lead] of [[2000, 1230, 1.3, 1.5, 690], [2000, 1320, 1.3, 1.5, 690], [1920, 1080, 1.2, 1.35, 600]]) {
    const big = await readerAt(page, w, h);
    const f = big.key / small.key;
    console.log(`reader ${w}x${h}: grows ${f.toFixed(3)} times`);
    expect(f).toBeGreaterThanOrEqual(lo);
    expect(f).toBeLessThanOrEqual(hi);
    // everything by the same factor, the laptop's proportions kept
    for (const k of ["keyFont", "header", "h1", "answer", "panel"] as const) expect(big[k] / small[k]).toBeCloseTo(f, 1);
    expect(big.own).toBeGreaterThan(lead);
    expect(big.doc.scroll).toBeLessThanOrEqual(big.doc.client);
    expect(big.doc.scrollW).toBeLessThanOrEqual(big.doc.clientW);
  }
});

test("a phone keeps the compact panel under the pictures, nothing sideways", async ({ page }) => {
  const m = await readerAt(page, 390, 844);
  expect(m.key).toBeCloseTo(28, 0);
  expect(m.doc.scrollW).toBeLessThanOrEqual(m.doc.clientW);
});

test("the values carry no shape; each key is framed in its colour, thin all round and a bar on its left, legible in both themes", async ({ page }) => {
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto("/rater.html");
    const m = await reader(page);
    expect(m.marks).toBe(0);
    expect(m.shapes).toBe(0);
    await shot(page, `reader-colours-${scheme}`);
    const keys = await page.evaluate(() => {
      const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
      const lum = (c: number[]) => {
        const [r, g, b] = c.map((v) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4));
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const contrast = (a: string, b: string) => {
        const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((p, q) => q - p);
        return (x + 0.05) / (y + 0.05);
      };
      const page = getComputedStyle(document.body).backgroundColor;
      return [...document.querySelectorAll<HTMLElement>('.axis-row[aria-label="body_part"] .opt[data-slot]')].map((el) => {
        const s = getComputedStyle(el);
        return { left: parseFloat(s.borderLeftWidth), top: parseFloat(s.borderTopWidth), same: s.borderTopColor === s.borderLeftColor && s.borderRightColor === s.borderLeftColor && s.borderBottomColor === s.borderLeftColor, contrast: contrast(s.borderLeftColor, page), text: contrast(s.color, s.backgroundColor === "rgba(0, 0, 0, 0)" ? page : s.backgroundColor) };
      });
    });
    expect(keys.length).toBe(6);
    for (const k of keys) {
      expect(k.same).toBe(true);
      expect(k.left).toBeGreaterThan(k.top);
      expect(k.top).toBeGreaterThanOrEqual(1);
      // a frame is a mark of the interface: 3 to 1 against the page; the words 4.5 to 1
      expect(k.contrast).toBeGreaterThanOrEqual(3);
      expect(k.text).toBeGreaterThanOrEqual(4.5);
    }
  }
});

/** The gallery's sizes as drawn, and each card's frame against the value it shows. */
async function gallery(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.route("**/api/instances/*/thumb", (route) => route.fulfill({ status: 200, contentType: "image/png", body: PICTURE }));
  await page.goto("/gallery.html");
  await expect(page.locator(".g-cell")).toHaveCount(100);
  const m = await page.evaluate((shapes) => {
    const font = (el: HTMLElement) => parseFloat(getComputedStyle(el).fontSize) * ((el as HTMLElement & { currentCSSZoom?: number }).currentCSSZoom ?? 1);
    const cell = document.querySelector<HTMLElement>(".g-cell")!;
    const bar = document.querySelector<HTMLElement>(".gallery-bar")!;
    const words = document.querySelector<HTMLElement>(".gallery-page")!.textContent ?? "";
    return {
      cell: cell.getBoundingClientRect().width,
      pic: cell.querySelector<HTMLElement>(".g-pic")!.getBoundingClientRect().height,
      pick: font(cell.querySelector<HTMLElement>(".g-pick")!),
      bar: bar.getBoundingClientRect().height,
      marks: document.querySelectorAll(".vmark").length,
      shapes: shapes.filter((s) => words.includes(s)).length,
      doc: { scroll: document.documentElement.scrollHeight, client: document.documentElement.clientHeight, scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth },
    };
  }, SHAPES);
  console.log(`gallery ${width}x${height}: card ${m.cell.toFixed(1)} px wide, picture ${m.pic.toFixed(1)} px high, picker text ${m.pick.toFixed(1)} px, bar ${m.bar.toFixed(1)} px`);
  await shot(page, `gallery-${width}x${height}`);
  return m;
}

test("the gallery's cards and words grow with the screen as well", async ({ page }) => {
  const small = await gallery(page, 1366, 768);
  expect(small.pic).toBeCloseTo(96, 0);
  expect(small.pick).toBeCloseTo(13, 1);
  const big = await gallery(page, 2000, 1230);
  const f = big.pic / small.pic;
  expect(f).toBeGreaterThanOrEqual(1.3);
  expect(f).toBeLessThanOrEqual(1.5);
  expect(big.pick / small.pick).toBeCloseTo(f, 1);
  expect(big.bar / small.bar).toBeCloseTo(f, 1);
  for (const m of [small, big]) {
    expect(m.marks).toBe(0);
    expect(m.shapes).toBe(0);
    expect(m.doc.scroll).toBeLessThanOrEqual(m.doc.client);
    expect(m.doc.scrollW).toBeLessThanOrEqual(m.doc.clientW);
  }
  const phone = await gallery(page, 390, 844);
  expect(phone.doc.scrollW).toBeLessThanOrEqual(phone.doc.clientW);
});

test("a gallery card is framed in the colour of the value it shows, and takes the new one when it changes", async ({ page }) => {
  await gallery(page, 1366, 768);
  const frame = (n: number) =>
    page.locator(".g-cell").nth(n).evaluate((el) => {
      const s = getComputedStyle(el);
      const key = [...document.querySelectorAll<HTMLElement>(".g-key")].find((k) => k.textContent?.endsWith((el.querySelector("select") as HTMLSelectElement).value));
      return { top: s.borderTopColor, left: s.borderLeftColor, right: s.borderRightColor, bottom: s.borderBottomColor, leftW: parseFloat(s.borderLeftWidth), topW: parseFloat(s.borderTopWidth), key: key ? getComputedStyle(key).borderLeftColor : null };
    });
  const before = await frame(2);
  expect(before.key).not.toBeNull();
  expect([before.top, before.right, before.bottom]).toEqual([before.left, before.left, before.left]);
  expect(before.left).toBe(before.key);
  expect(before.leftW).toBeGreaterThan(before.topW);
  await page.locator(".g-cell").nth(2).locator("select").selectOption("chest");
  const after = await frame(2);
  expect(after.left).not.toBe(before.left);
  expect([after.top, after.right, after.bottom]).toEqual([after.left, after.left, after.left]);
  expect(after.left).toBe(after.key);
});
