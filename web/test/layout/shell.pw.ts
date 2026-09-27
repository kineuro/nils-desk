// SPDX-License-Identifier: AGPL-3.0-only
// The reader in the desk's own shell (after the first gold campaign: "the
// planes are still small on the big screen"). The rating section is also a
// .data page, and in the desk's bundle shell.css comes after campaigns.css,
// so .data's grid won the tie with the reader's column and the pictures took
// the panel's height: a body part item's three planes a row of small squares.
// rater.html draws the real App (top bar, sections, page) on a one-axis
// campaign against the reader's fake engine, in the bundle's order, and this
// measures it at the screens the first raters use, in chromium and, with
// LAYOUT_FIREFOX=1, Firefox.

import { expect, test, type Page } from "@playwright/test";

async function measure(page: Page) {
  await expect(page.locator(".viewer-plane.own")).toBeVisible();
  return page.evaluate(() => {
    const box = (s: string) => document.querySelector<HTMLElement>(s)!.getBoundingClientRect();
    const doc = document.documentElement;
    return {
      picture: box(".rate-picture"),
      panel: box("[data-reader-panel]"),
      own: box(".viewer-plane.own"),
      doc: { scroll: doc.scrollHeight, client: doc.clientHeight, scrollW: doc.scrollWidth, clientW: doc.clientWidth },
    };
  });
}

// on a big screen the panel grows with the screen as well (scale.pw.ts), so the lead plane gives up a little of its side to it
const SCREENS = [
  { width: 2000, height: 1154, lead: 640 },
  { width: 2000, height: 1230, lead: 690 },
  { width: 1920, height: 1080, lead: 600 },
  { width: 1440, height: 900, lead: 380 },
  { width: 1366, height: 768, lead: 330 },
];

for (const vp of SCREENS) {
  test(`a one-axis item in the desk at ${vp.width} by ${vp.height}: the pictures take the window's height, not the panel's`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/rater.html");
    await expect(page.locator('.axis-row[aria-label="body_part"] .opt')).toHaveCount(6);
    const m = await measure(page);
    console.log(`${vp.width}x${vp.height}: picture side ${Math.round(m.picture.width)} by ${Math.round(m.picture.height)}, the lead plane ${Math.round(m.own.width)} px, panel ${Math.round(m.panel.height)} px high`);
    expect(m.picture.height).toBeGreaterThan(vp.height - 160);
    expect(m.own.width).toBeGreaterThan(vp.lead);
    expect(m.own.bottom).toBeLessThanOrEqual(vp.height);
    expect(m.doc.scroll).toBeLessThanOrEqual(m.doc.client);
    expect(m.doc.scrollW).toBeLessThanOrEqual(m.doc.clientW);
    // the stack view: the largest square the side holds
    await page.locator('.viewer-axes button[role="tab"]:has-text("the stack")').click();
    const stage = await page.locator(".viewer-stage").boundingBox();
    expect(Math.min(stage!.width, stage!.height)).toBeGreaterThan(Math.min(m.picture.width, m.picture.height - 40) * 0.97);
  });
}

test("seven axes in the desk at 1366 by 768 still fit, pictures and panel", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/rater.html?mode=axes");
  await expect(page.locator(".derived-line")).toContainText("derived:");
  const m = await measure(page);
  expect(m.picture.height).toBeGreaterThan(768 - 160);
  expect(m.doc.scroll).toBeLessThanOrEqual(m.doc.client);
});

test("on a phone in the desk: the pictures over the panel, as wide as the screen, nothing sideways", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/rater.html");
  await expect(page.locator('.axis-row[aria-label="body_part"] .opt')).toHaveCount(6);
  const m = await measure(page);
  expect(m.doc.scrollW).toBeLessThanOrEqual(m.doc.clientW);
  expect(m.own.width).toBeGreaterThan(m.picture.width * 0.95);
  expect(m.panel.top).toBeGreaterThanOrEqual(m.own.bottom);
});
