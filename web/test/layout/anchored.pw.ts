// SPDX-License-Identifier: AGPL-3.0-only
// The anchored view on one screen (the post-contrast study, anchored
// reading): in the desk's own shell (anchored.html), the candidate and its
// two references side by side, each a third of the window and as tall as
// the window leaves it, the bar with the window, the difference, the jumps
// and the three answers under all three, nothing scrolls, and the bar grows
// with the screen as the reader's panel does. Chromium, and Firefox with
// LAYOUT_FIREFOX=1. SHOTS=<dir> keeps a screenshot of each.

import { expect, test, type Page } from "@playwright/test";

async function shot(page: Page, name: string) {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}-${test.info().project.name}.png` });
}

async function measure(page: Page) {
  await expect(page.locator(".anchored-panel")).toHaveCount(3);
  await expect(page.locator(".pair-answer")).toHaveCount(3);
  await expect(page.locator(".compare-region")).toHaveCount(4);
  await expect(page.locator(".anchored-panel .viewer")).toHaveCount(3);
  return page.evaluate(() => {
    const box = (el: Element) => el.getBoundingClientRect();
    const font = (el: HTMLElement) => parseFloat(getComputedStyle(el).fontSize) * ((el as HTMLElement & { currentCSSZoom?: number }).currentCSSZoom ?? 1);
    const doc = document.documentElement;
    const panels = [...document.querySelectorAll(".anchored-panel")].map(box);
    const stages = [...document.querySelectorAll(".anchored-panel .viewer")].map(box);
    return {
      panels,
      stages,
      labels: [...document.querySelectorAll(".anchored-panel .pair-label")].map((e) => (e.firstChild?.textContent ?? "").trim()),
      flagged: [...document.querySelectorAll(".anchored-panel")].map((e) => e.querySelector(".anchored-other") !== null),
      bar: box(document.querySelector(".anchored-bar")!),
      answer: box(document.querySelector(".act-answer")!),
      key: font(document.querySelector<HTMLElement>(".pair-answer")!),
      doc: { scroll: doc.scrollHeight, client: doc.clientHeight, scrollW: doc.scrollWidth, clientW: doc.clientWidth },
    };
  });
}

const SCREENS = [
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 2000, height: 1230 },
];

for (const vp of SCREENS) {
  test(`an anchored item in the desk at ${vp.width} by ${vp.height}: three side by side, one screen, nothing scrolls`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/anchored.html");
    const m = await measure(page);
    const [a, b, c] = m.panels;
    console.log(`${vp.width}x${vp.height} ${test.info().project.name}: each panel ${Math.round(a.width)} by ${Math.round(a.height)}, bar ${Math.round(m.bar.height)} px high, answer text ${m.key.toFixed(1)} px`);
    await shot(page, `anchored-${vp.width}x${vp.height}`);
    // three equal panels in a row, the bar under all three
    for (const p of [b, c]) {
      expect(Math.abs(p.width - a.width)).toBeLessThanOrEqual(2);
      expect(Math.abs(p.top - a.top)).toBeLessThanOrEqual(1);
    }
    expect(b.left).toBeGreaterThan(a.right - 1);
    expect(c.left).toBeGreaterThan(b.right - 1);
    expect(a.width).toBeGreaterThan(vp.width * 0.25);
    expect(a.height).toBeGreaterThan(vp.height - 300);
    expect(m.bar.top).toBeGreaterThanOrEqual(a.bottom - 1);
    for (const s of m.stages) expect(s.height).toBeGreaterThan(vp.height - 340);
    expect(m.doc.scroll).toBeLessThanOrEqual(m.doc.client);
    expect(m.doc.scrollW).toBeLessThanOrEqual(m.doc.clientW);
    expect(m.answer.bottom).toBeLessThanOrEqual(vp.height);
    // the panels in the order the engine drew, named by their role alone
    expect(m.labels).toEqual(["reference post", "candidate", "reference pre"]);
    expect(m.flagged).toEqual([false, false, true]);
  });
}

test("the bar grows with the screen", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/anchored.html");
  const small = await measure(page);
  await page.setViewportSize({ width: 2000, height: 1230 });
  await page.goto("/anchored.html");
  const big = await measure(page);
  expect(big.key).toBeGreaterThan(small.key * 1.25);
  expect(big.panels[0].width).toBeGreaterThan(small.panels[0].width * 1.25);
});

test("one key and Enter answer; the page names the roles and no stack", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/anchored.html");
  await measure(page);
  const text = await page.locator(".anchored-reader").innerText();
  for (const n of ["8121", "8104", "8133", "anchored:12"]) expect(text).not.toContain(n);
  await page.keyboard.press("2");
  await expect(page.locator(".pair-answer.on")).toContainText("like the post");
  await expect(page.locator('[data-role="candidate"] .pair-says')).toHaveText("like the post");
  // one window is the default; w gives each its own
  await expect(page.locator(".compare-toggle").first()).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("w");
  await expect(page.locator(".compare-toggle").first()).toHaveText("each its own window");
  await shot(page, "anchored-chosen-1366x768");
  await page.keyboard.press("Enter");
  await expect(page.locator(".said")).toContainText("like the post");
});

test("on a phone: one panel over the next, the bar under them, nothing sideways", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/anchored.html");
  const m = await measure(page);
  await shot(page, "anchored-phone");
  expect(m.doc.scrollW).toBeLessThanOrEqual(m.doc.clientW);
  expect(m.panels[1].top).toBeGreaterThanOrEqual(m.panels[0].bottom - 1);
  expect(m.bar.top).toBeGreaterThanOrEqual(m.panels[2].bottom - 1);
});
