// SPDX-License-Identifier: AGPL-3.0-only
// The Assistant in a real browser (the redesign Nima confirmed on 2026-10-09):
// messages first in one column of about 800px, the person's words on the
// right and the input at the foot; Open puts the query on a panel beside a
// chat narrowed to about 460px; a chart's columns line up; a phone's width
// has no sideways scroll and gives the panel the page. Screenshots go to
// test-results for a look.

import { expect, test, type Page } from "@playwright/test";

/** Where a screenshot goes, by browser. */
const shot = (name: string) => `test-results/assistant-${test.info().project.name}-${name}.png`;

const box = async (page: Page, selector: string) => (await page.locator(selector).first().boundingBox())!;
const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

for (const vp of [
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
]) {
  test(`at ${vp.width} by ${vp.height}: one column of about 800px, the words on the right, the input at the foot, the panel beside a narrow chat`, async ({ page }) => {
    await page.setViewportSize(vp);
    // the canvas Nima confirmed is drawn dark
    await page.goto("/assistant.html?theme=dark");
    await expect(page.locator(".qcard")).toHaveCount(2);
    const thread = await box(page, ".one-chat-thread");
    const main = await box(page, ".one-chat-main");
    expect(thread.width).toBeLessThanOrEqual(800);
    expect(thread.width).toBeGreaterThan(700);
    // the column sits in the middle of the page
    expect(Math.abs(thread.x - main.x - (main.x + main.width - (thread.x + thread.width)))).toBeLessThan(24);
    const asked = await box(page, ".said.you");
    expect(Math.abs(asked.x + asked.width - (thread.x + thread.width))).toBeLessThan(2);
    expect(asked.width).toBeLessThanOrEqual(thread.width * 0.8 + 1);
    // the input is at the foot of the window, the page itself does not scroll
    const composer = await box(page, ".one-chat-composer");
    expect(vp.height - (composer.y + composer.height)).toBeLessThan(4);
    expect(composer.width).toBeLessThanOrEqual(800);
    expect(await sideways(page)).toBeLessThanOrEqual(0);
    expect(await page.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: shot(`${vp.width}`) });

    await page.locator(".qcard").nth(1).getByRole("button", { name: "Open" }).click();
    await expect(page.locator(".qpanel .qbar")).toHaveCount(3);
    const narrow = await box(page, ".one-chat-main");
    const panel = await box(page, ".qpanel");
    expect(narrow.width).toBeGreaterThan(380);
    expect(narrow.width).toBeLessThanOrEqual(461);
    expect(Math.abs(panel.x - (narrow.x + narrow.width))).toBeLessThan(2);
    expect(Math.abs(panel.x + panel.width - vp.width)).toBeLessThan(2);
    expect(panel.height).toBeGreaterThan(vp.height - 120);
    // a chart's labels, bars and counts line up from row to row
    const rows = await page.locator(".qpanel .qbar").evaluateAll((els) =>
      els.map((el) => {
        const r = (s: string) => el.querySelector(s)!.getBoundingClientRect();
        return { label: r(".qbar-label").left, track: r(".qbar-track").left, count: r(".qbar-n").right, subjects: r(".qbar-subjects").right };
      }),
    );
    for (const k of ["label", "track", "count", "subjects"] as const) expect(new Set(rows.map((r) => Math.round(r[k]))).size).toBe(1);
    expect(await sideways(page)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: shot(`${vp.width}-panel`) });
    await page.getByRole("button", { name: "Close the query" }).click();
    await expect(page.locator(".qpanel")).toHaveCount(0);
  });
}

test("the light theme draws the same page from the theme's own tokens", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/assistant.html?theme=light");
  await expect(page.locator(".qcard")).toHaveCount(2);
  const ground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const raised = await page.locator(".said.you").first().evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(raised).not.toBe(ground);
  await page.locator(".qcard").nth(1).getByRole("button", { name: "Open" }).click();
  await expect(page.locator(".qpanel .qbar")).toHaveCount(3);
  await page.screenshot({ path: shot("light-panel") });
});

test("on a phone: nothing sideways, the words on the right, and the panel takes the page", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/assistant.html");
  await expect(page.locator(".qcard")).toHaveCount(2);
  expect(await sideways(page)).toBeLessThanOrEqual(0);
  const asked = await box(page, ".said.you");
  expect(asked.x + asked.width).toBeLessThanOrEqual(390 - 12);
  await page.screenshot({ path: shot("phone") });
  await page.locator(".qcard").nth(1).getByRole("button", { name: "Open" }).click();
  await expect(page.locator(".qpanel .qbar")).toHaveCount(3);
  await expect(page.locator(".one-chat-main")).toBeHidden();
  const panel = await box(page, ".qpanel");
  expect(panel.width).toBeGreaterThan(380);
  expect(await sideways(page)).toBeLessThanOrEqual(0);
  await page.screenshot({ path: shot("phone-panel") });
});

test("a new conversation: one line, the ways to begin, the input at the foot", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/assistant.html?theme=dark#assistant/new");
  await expect(page.locator(".one-chat-thread .lede")).toHaveText("Ask about your data, or say what to do.");
  const composer = await box(page, ".one-chat-composer");
  expect(900 - (composer.y + composer.height)).toBeLessThan(4);
  await expect(page.locator(".one-chat-head h1")).toHaveText("New conversation");
  await expect(page.locator(".one-chat-head .chat-menu")).toHaveCount(0);
  expect(await sideways(page)).toBeLessThanOrEqual(0);
  await page.screenshot({ path: shot("new") });
});
