// SPDX-License-Identifier: AGPL-3.0-only
// The pair view on one screen (the post-contrast study, pair mode): in the
// desk's own shell (pair.html), the two pictures side by side, each as tall
// as the window leaves it and half its width, the bar with the five answers
// under both, nothing scrolls, and the bar grows with the screen as the
// reader's panel does. Chromium, and Firefox with LAYOUT_FIREFOX=1.
// SHOTS=<dir> keeps a screenshot of each.

import { expect, test, type Page } from "@playwright/test";

async function shot(page: Page, name: string) {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}-${test.info().project.name}.png` });
}

async function measure(page: Page) {
  await expect(page.locator(".pair-side")).toHaveCount(2);
  await expect(page.locator(".pair-answer")).toHaveCount(5);
  return page.evaluate(() => {
    const box = (el: Element) => el.getBoundingClientRect();
    const font = (el: HTMLElement) => parseFloat(getComputedStyle(el).fontSize) * ((el as HTMLElement & { currentCSSZoom?: number }).currentCSSZoom ?? 1);
    const doc = document.documentElement;
    const [left, right] = [...document.querySelectorAll(".pair-side")].map(box);
    const stages = [...document.querySelectorAll(".pair-side .viewer")].map(box);
    return {
      left,
      right,
      stages,
      bar: box(document.querySelector(".pair-bar")!),
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
  test(`a pair in the desk at ${vp.width} by ${vp.height}: side by side, one screen, nothing scrolls`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/pair.html");
    const m = await measure(page);
    console.log(`${vp.width}x${vp.height} ${test.info().project.name}: each side ${Math.round(m.left.width)} by ${Math.round(m.left.height)}, bar ${Math.round(m.bar.height)} px high, answer text ${m.key.toFixed(1)} px`);
    await shot(page, `pair-${vp.width}x${vp.height}`);
    // two equal sides, left beside right, the bar under both
    expect(Math.abs(m.left.width - m.right.width)).toBeLessThanOrEqual(2);
    expect(Math.abs(m.left.top - m.right.top)).toBeLessThanOrEqual(1);
    expect(m.right.left).toBeGreaterThan(m.left.right - 1);
    expect(m.left.width).toBeGreaterThan(vp.width * 0.4);
    expect(m.left.height).toBeGreaterThan(vp.height - 260);
    expect(m.bar.top).toBeGreaterThanOrEqual(m.left.bottom - 1);
    for (const s of m.stages) expect(s.height).toBeGreaterThan(vp.height - 300);
    expect(m.doc.scroll).toBeLessThanOrEqual(m.doc.client);
    expect(m.doc.scrollW).toBeLessThanOrEqual(m.doc.clientW);
    expect(m.answer.bottom).toBeLessThanOrEqual(vp.height);
  });
}

test("the bar grows with the screen", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/pair.html");
  const small = await measure(page);
  await page.setViewportSize({ width: 2000, height: 1230 });
  await page.goto("/pair.html");
  const big = await measure(page);
  expect(big.key).toBeGreaterThan(small.key * 1.25);
  expect(big.left.width).toBeGreaterThan(small.left.width * 1.25);
});

test("one key and Enter answer; the page names left and right and no stack", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/pair.html");
  await measure(page);
  const text = await page.locator(".pair-reader").innerText();
  for (const n of ["7311", "7302", "pair:12"]) expect(text).not.toContain(n);
  await page.keyboard.press("1");
  await expect(page.locator(".pair-answer.on")).toContainText("left is post");
  await expect(page.locator('[data-side="left"] .pair-says')).toHaveText("post");
  await shot(page, "pair-chosen-1440x900");
  await page.keyboard.press("Enter");
  await expect(page.locator(".said")).toContainText("left is post");
});

test("on a phone: one picture over the other, the bar under them, nothing sideways", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/pair.html");
  const m = await measure(page);
  await shot(page, "pair-phone");
  expect(m.doc.scrollW).toBeLessThanOrEqual(m.doc.clientW);
  expect(m.right.top).toBeGreaterThanOrEqual(m.left.bottom - 1);
  expect(m.bar.top).toBeGreaterThanOrEqual(m.right.bottom - 1);
});
