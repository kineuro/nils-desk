// SPDX-License-Identifier: AGPL-3.0-only
// The check reader on one screen (job type 3, record 55 H3; the build spec
// of 2026-10-11, section 16, D2): in the desk's own shell (check.html), one
// to eight panels in their grid (1 by 2, 1 by 3, 2 by 2, 2 by 3, 2 by 4),
// proportional to the screen, the made-on scan first and framed, the
// lesions listed beside them, the bar with the mask's tools and the answer
// keys under all of them, nothing scrolls on a big screen; on a phone of
// 420 px one panel over the next and nothing sideways. A check of
// structures lists each by its whole name, none cut. New check fits the
// same two screens. Chromium, and Firefox with LAYOUT_FIREFOX=1. SHOTS=<dir>
// keeps a screenshot of each.

import { expect, test, type Page } from "@playwright/test";

async function shot(page: Page, name: string) {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}-${test.info().project.name}.png` });
}

const GRID: Record<number, [number, number]> = { 1: [1, 1], 2: [1, 2], 3: [1, 3], 4: [2, 2], 5: [2, 3], 6: [2, 3], 7: [2, 4], 8: [2, 4] };

async function measure(page: Page, n: number) {
  await expect(page.locator(".check-reader .compare-panel")).toHaveCount(n);
  await expect(page.locator(".check-reader .compare-panel .viewer")).toHaveCount(n);
  await expect(page.locator(".check-answers .pair-answer")).toHaveCount(9);
  return page.evaluate(() => {
    const box = (el: Element) => el.getBoundingClientRect();
    const doc = document.documentElement;
    const panels = [...document.querySelectorAll(".check-reader .compare-panel")].map(box);
    const stages = [...document.querySelectorAll(".check-reader .compare-panel .viewer")].map(box);
    const keys = [...document.querySelectorAll(".check-answers .pair-answer")].map(box);
    return {
      panels,
      stages,
      keys,
      labels: [...document.querySelectorAll(".check-reader .compare-name")].map((e) => e.textContent),
      madeOn: [...document.querySelectorAll(".check-reader .compare-panel")].map((e) => e.classList.contains("is-made-on")),
      madeOnBorder: getComputedStyle(document.querySelector(".compare-panel.is-made-on")!).borderTopColor,
      brandLine: getComputedStyle(document.documentElement).getPropertyValue("--n-brand-line").trim(),
      parts: box(document.querySelector(".check-parts")!),
      grid: box(document.querySelector(".compare-grid")!),
      bar: box(document.querySelector(".compare-bar")!),
      send: box(document.querySelector(".act-answer")!),
      tools: (() => {
        const t = document.querySelector(".compare-tools")!;
        return { scroll: t.scrollWidth - t.clientWidth, out: [...t.querySelectorAll("button, label")].filter((b) => b.getBoundingClientRect().right > t.getBoundingClientRect().right + 1).length };
      })(),
      doc: { scroll: doc.scrollHeight, client: doc.clientHeight, scrollW: doc.scrollWidth, clientW: doc.clientWidth },
    };
  });
}

const distinct = (xs: number[]) => new Set(xs.map((x) => Math.round(x))).size;

const BIG = [
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
];

for (const vp of BIG) {
  for (let n = 1; n <= 8; n++) {
    test(`${n} ${n === 1 ? "panel" : "panels"} at ${vp.width} by ${vp.height}: the grid by the count, the lesions beside, one screen, nothing scrolls`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.goto(`/check.html?panels=${n}`);
      const m = await measure(page, n);
      const [rows, cols] = GRID[n];
      console.log(`${vp.width}x${vp.height} ${test.info().project.name} ${n}: panel ${Math.round(m.panels[0].width)} by ${Math.round(m.panels[0].height)}, bar ${Math.round(m.bar.height)} px`);
      await shot(page, `check-${n}-${vp.width}x${vp.height}`);
      expect(distinct(m.panels.map((p) => p.top))).toBe(rows);
      expect(distinct(m.panels.map((p) => p.left))).toBe(cols);
      // equal panels, filling the grid's share of the screen
      for (const p of m.panels) {
        expect(Math.abs(p.width - m.panels[0].width)).toBeLessThanOrEqual(2);
        expect(Math.abs(p.height - m.panels[0].height)).toBeLessThanOrEqual(2);
        expect(p.right).toBeLessThanOrEqual(m.parts.left + 1);
        expect(p.bottom).toBeLessThanOrEqual(m.bar.top + 1);
      }
      expect(m.panels[0].width * cols).toBeGreaterThan(m.grid.width * 0.9);
      expect(m.panels[0].height * rows).toBeGreaterThan((vp.height - 340) * 0.85);
      for (const s of m.stages) expect(s.height).toBeGreaterThan((vp.height - 340) / rows - 60);
      // the made-on scan first, framed in the brand line
      expect(m.madeOn[0]).toBe(true);
      expect(m.madeOn.slice(1).every((x) => !x)).toBe(true);
      // the lesions beside the panels, as tall as they are
      expect(m.parts.width).toBeGreaterThan(100);
      expect(m.parts.width).toBeLessThan(vp.width * 0.16);
      expect(m.parts.height).toBeGreaterThan(m.grid.height * 0.9);
      // the keys on one line under every panel, nothing pushed out, nothing scrolls
      expect(distinct(m.keys.map((k) => k.top + k.height / 2))).toBe(1);
      expect(m.tools.out).toBe(0);
      expect(m.tools.scroll).toBeLessThanOrEqual(1);
      expect(m.send.bottom).toBeLessThanOrEqual(vp.height);
      expect(m.doc.scroll).toBeLessThanOrEqual(m.doc.client);
      expect(m.doc.scrollW).toBeLessThanOrEqual(m.doc.clientW);
    });
  }
}

test("the bar and the panels grow with the screen", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/check.html?panels=3");
  const small = await measure(page, 3);
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto("/check.html?panels=3");
  const big = await measure(page, 3);
  expect(big.keys[0].height).toBeGreaterThan(small.keys[0].height * 1.25);
  expect(big.parts.width).toBeGreaterThan(small.parts.width * 1.25);
  expect(big.panels[0].width).toBeGreaterThan(small.panels[0].width * 1.5);
});

for (const n of [3, 8]) {
  test(`${n} panels on a laptop of 1366 by 768: one screen, the keys on their own line, nothing pushed out`, async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(`/check.html?panels=${n}`);
    const m = await measure(page, n);
    await shot(page, `check-${n}-1366x768`);
    expect(distinct(m.keys.map((k) => k.top + k.height / 2))).toBe(1);
    expect(m.tools.out).toBe(0);
    expect(m.send.bottom).toBeLessThanOrEqual(768);
    expect(m.doc.scroll).toBeLessThanOrEqual(m.doc.client);
    expect(m.doc.scrollW).toBeLessThanOrEqual(m.doc.clientW);
    const words = await page.evaluate(() => [...document.querySelectorAll(".check-answers .answer-words")].filter((w) => w.scrollWidth > w.clientWidth + 1).length);
    expect(words).toBe(0);
  });
}

for (let n = 1; n <= 8; n++) {
  test(`${n} ${n === 1 ? "panel" : "panels"} on a phone of 420 px: one over the next, the lesions under them, nothing sideways`, async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 900 });
    await page.goto(`/check.html?panels=${n}`);
    const m = await measure(page, n);
    await shot(page, `check-${n}-phone`);
    expect(m.doc.scrollW).toBeLessThanOrEqual(m.doc.clientW);
    for (let i = 1; i < n; i++) expect(m.panels[i].top).toBeGreaterThanOrEqual(m.panels[i - 1].bottom - 1);
    for (const p of m.panels) {
      expect(p.left).toBeGreaterThanOrEqual(0);
      expect(p.right).toBeLessThanOrEqual(420);
      expect(p.width).toBeGreaterThan(420 - 60);
    }
    expect(m.parts.top).toBeGreaterThanOrEqual(m.panels[n - 1].bottom - 1);
    for (const k of m.keys) expect(k.right).toBeLessThanOrEqual(420);
  });
}

test("the keys read a result: n opens a lesion, a reason flags it in its colour, 1 on another sends and the next comes", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/check.html?panels=3");
  await measure(page, 3);
  await page.keyboard.press("n");
  await expect(page.locator(".check-part")).toHaveText("Lesion 1 of 4 · 0.21 ml");
  await expect(page.locator(".check-part-row.on")).toHaveCount(1);
  await page.keyboard.press("3");
  await expect(page.locator(".check-part-row.on .check-flag")).toHaveText("Under-segmented");
  await expect(page.locator(".check-reason.on")).toHaveAttribute("data-slot", "1");
  await expect(page.locator(".act-answer")).toContainText("Send · flagged");
  await shot(page, "check-flagged-1920x1080");
  await page.keyboard.press("Enter");
  await expect(page.locator(".said")).toContainText("flagged · 1 lesion");
  await expect(page.locator(".rate-item > b")).toHaveText("result 13");
  // the next result drawn, then one key accepts it
  await expect(page.locator(".compare-grid")).toHaveAttribute("aria-busy", "false");
  await page.keyboard.press("1");
  await expect(page.locator(".rate-item > b")).toHaveText("result 14");
  await page.keyboard.press("?");
  await expect(page.locator("dialog.keys-overlay h3")).toHaveText(["Answer", "Parts", "Mask", "View", "Pictures"]);
  await shot(page, "check-keys-1920x1080");
});

for (const vp of [
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
  { width: 420, height: 900 },
]) {
  test(`a check of structures at ${vp.width} by ${vp.height}: each by its whole name, none cut, nothing sideways`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/check.html?panels=3&set=structures");
    await expect(page.locator(".check-reader .compare-panel .viewer")).toHaveCount(3);
    // accept, reject and the five reasons for structures
    await expect(page.locator(".check-answers .pair-answer")).toHaveCount(7);
    await expect(page.locator(".check-part-row.named")).toHaveCount(8);
    await shot(page, `check-structures-${vp.width}x${vp.height}`);
    const m = await page.evaluate(() => {
      const names = [...document.querySelectorAll(".check-part-row.named .check-n")];
      const doc = document.documentElement;
      return {
        names: names.map((e) => e.textContent),
        cut: names.filter((e) => e.scrollWidth > e.clientWidth + 1 || e.getBoundingClientRect().right > e.closest(".check-part-row")!.getBoundingClientRect().right + 1).map((e) => e.textContent),
        scroll: doc.scrollHeight - doc.clientHeight,
        scrollW: doc.scrollWidth - doc.clientWidth,
      };
    });
    expect(m.names).toContain("Left-Cerebral-White-Matter");
    expect(m.cut).toEqual([]);
    expect(m.scrollW).toBeLessThanOrEqual(0);
    if (vp.width > 420) expect(m.scroll).toBeLessThanOrEqual(0);
  });
}

for (const vp of [
  { width: 1366, height: 768 },
  { width: 420, height: 900 },
]) {
  test(`New check from a run at ${vp.width} by ${vp.height}: every row and the foot inside the dialog, nothing sideways`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/check.html?page=new");
    const d = page.locator("dialog.new-check");
    await expect(d.locator("h2")).toHaveText("SAMSEG · lesions");
    await expect(d.locator(".check-preview")).toContainText("results");
    await expect(d.locator(".opt-count").first()).toBeVisible();
    await shot(page, `newcheck-${vp.width}x${vp.height}`);
    const m = await page.evaluate(() => {
      const dlg = document.querySelector("dialog.new-check")!;
      const r = dlg.getBoundingClientRect();
      const body = dlg.querySelector(".dialog-body")!;
      const out = [...dlg.querySelectorAll("button, input, .tag, .value-tag")].filter((e) => {
        const b = e.getBoundingClientRect();
        return b.width > 0 && (b.right > r.right + 1 || b.left < r.left - 1);
      }).length;
      return { out, bodyScrollW: body.scrollWidth - body.clientWidth, docW: document.documentElement.scrollWidth - document.documentElement.clientWidth, right: r.right };
    });
    expect(m.out).toBe(0);
    expect(m.bodyScrollW).toBeLessThanOrEqual(1);
    expect(m.docW).toBeLessThanOrEqual(0);
    expect(m.right).toBeLessThanOrEqual(vp.width);
    await expect(d.getByRole("button", { name: "Start checking" })).toBeVisible();
  });
}
