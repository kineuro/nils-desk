// SPDX-License-Identifier: AGPL-3.0-only
// The A/B view on one screen (record 48, the reference read by judges): in
// the desk's own shell (ab.html), the pictures take the window's height, the
// panel holds the file's header and every asked axis with its candidates and
// reasons, nothing scrolls, and the panel grows with the screen as the
// reader's does. Chromium, and Firefox with LAYOUT_FIREFOX=1. SHOTS=<dir>
// keeps a screenshot of each.

import { expect, test, type Page } from "@playwright/test";

async function shot(page: Page, name: string) {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}-${test.info().project.name}.png` });
}

async function measure(page: Page) {
  await expect(page.locator(".viewer-plane.own")).toBeVisible();
  await expect(page.locator(".ab-row")).not.toHaveCount(0);
  return page.evaluate(() => {
    const box = (s: string) => document.querySelector<HTMLElement>(s)!.getBoundingClientRect();
    const font = (el: HTMLElement) => parseFloat(getComputedStyle(el).fontSize) * ((el as HTMLElement & { currentCSSZoom?: number }).currentCSSZoom ?? 1);
    const doc = document.documentElement;
    const rows = [...document.querySelectorAll<HTMLElement>(".ab-row")];
    const side = document.querySelector<HTMLElement>("[data-reader-panel]")!;
    return {
      picture: box(".rate-picture"),
      panel: box("[data-reader-panel]"),
      last: rows[rows.length - 1].getBoundingClientRect(),
      answer: box(".act-answer"),
      cand: font(document.querySelector<HTMLElement>(".ab-cand")!),
      sideScroll: side.scrollHeight - side.clientHeight,
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
  test(`an A/B item in the desk at ${vp.width} by ${vp.height}: one screen, nothing scrolls`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/ab.html");
    const m = await measure(page);
    console.log(`${vp.width}x${vp.height} ${test.info().project.name}: picture ${Math.round(m.picture.width)} by ${Math.round(m.picture.height)}, panel ${Math.round(m.panel.width)} px wide, candidate text ${m.cand.toFixed(1)} px, panel overflow ${m.sideScroll} px`);
    await shot(page, `ab-${vp.width}x${vp.height}`);
    expect(m.picture.height).toBeGreaterThan(vp.height - 160);
    expect(m.doc.scroll).toBeLessThanOrEqual(m.doc.client);
    expect(m.doc.scrollW).toBeLessThanOrEqual(m.doc.clientW);
    expect(m.sideScroll).toBeLessThanOrEqual(1);
    expect(m.answer.bottom).toBeLessThanOrEqual(vp.height);
  });
}

test("the panel grows with the screen: the candidates' text is larger on a big screen", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/ab.html");
  const small = await measure(page);
  await page.setViewportSize({ width: 2000, height: 1230 });
  await page.goto("/ab.html");
  const big = await measure(page);
  expect(big.cand).toBeGreaterThan(small.cand * 1.25);
  expect(big.panel.width).toBeGreaterThan(small.panel.width * 1.25);
});

test("keys settle an item: b, a cause, a, then the answer; a localizer in one key", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/ab.html");
  await measure(page);
  await expect(page.locator(".ab-row.active")).toHaveAttribute("aria-label", "technique");
  await page.keyboard.press("b");
  await page.keyboard.press("2");
  await expect(page.locator(".ab-row.active")).toHaveAttribute("aria-label", "body_part");
  await shot(page, "ab-chosen-1440x900");
  await page.keyboard.press("a");
  await page.keyboard.press("Enter");
  await expect(page.locator(".said")).toContainText("technique B (convention gap)");
  await page.goto("/ab.html?mode=localizer");
  await expect(page.locator(".ab-row")).toHaveCount(2);
  await shot(page, "ab-localizer-1440x900");
});

test("on a phone: the pictures over the panel, nothing sideways", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ab.html");
  const m = await measure(page);
  await shot(page, "ab-phone");
  expect(m.doc.scrollW).toBeLessThanOrEqual(m.doc.clientW);
  expect(m.panel.top).toBeGreaterThanOrEqual(m.picture.bottom - 1);
});
