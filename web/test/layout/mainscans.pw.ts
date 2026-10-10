// SPDX-License-Identifier: AGPL-3.0-only
// Main scans in a real browser, in the desk's own shell (record 55, decision
// 6): on a laptop the page and its Rules panel sit side by side, the five
// numbers on one line, with no sideways scroll; on a big screen the page,
// its keys and its panel grow by one factor; a phone's width is one column,
// the panel under the page, the table of where the kinds come from scrolling
// inside its box and nothing sideways; every subject as a strip, the group
// lit; and a card's visit opens its pick in the window. In chromium, and in
// Firefox where it is installed. Screenshots go to test-results for a look.

import { expect, test, type Page } from "@playwright/test";

const tops = async (page: Page, sel: string) => (await page.locator(sel).evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)))) as number[];

async function opened(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto("/mainscans.html#review/picks?cohort=ms-followup");
  await expect(page.locator(".ms-number")).toHaveCount(5);
  await expect(page.locator(".ms-card").first()).toBeVisible();
}

async function noSidewaysScroll(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  const inner = await page.locator("main.page").evaluate((e) => e.scrollWidth - e.clientWidth);
  expect(inner).toBeLessThanOrEqual(1);
}

test("on a laptop the page and its Rules panel sit side by side, the five numbers on one line", async ({ page }) => {
  await opened(page, 1440, 900);
  await noSidewaysScroll(page, 1440);
  const main = (await page.locator(".ms-main").boundingBox())!;
  const panel = (await page.locator(".ms-rules").boundingBox())!;
  expect(panel.x).toBeGreaterThanOrEqual(main.x + main.width - 1);
  expect(Math.abs(panel.y - main.y)).toBeLessThan(2);
  expect(new Set(await tops(page, ".ms-number")).size).toBe(1);
  // the role keys and the three ways of keeping alike in one row under the title
  expect(new Set(await tops(page, '.ms-keys [role="group"][aria-label="Role"] .opt')).size).toBe(1);
  // the panel holds to the window while the page scrolls under it
  await page.locator("main.page").evaluate((e) => e.scrollTo(0, 900));
  const held = (await page.locator(".ms-rules").boundingBox())!;
  expect(held.y).toBeGreaterThanOrEqual(0);
  expect(held.y).toBeLessThan(120);
  await page.locator("main.page").evaluate((e) => e.scrollTo(0, 0));
  await page.screenshot({ path: "test-results/mainscans-laptop.png", fullPage: true });
});

test("a kind is a framed tag in its colour, never a dot or a square, and only the chosen key is in colour", async ({ page }) => {
  await opened(page, 1440, 900);
  const tag = page.locator(".ms-kinds .ms-kind-row .ms-kind").first();
  const look = await tag.evaluate((e) => {
    const s = getComputedStyle(e);
    return { left: s.borderLeftWidth, top: s.borderTopWidth, leftColour: s.borderLeftColor, radius: s.borderTopLeftRadius, background: s.backgroundColor };
  });
  expect(look).toMatchObject({ left: "3px", top: "1px", radius: "3px" });
  expect(look.background).not.toBe("rgba(0, 0, 0, 0)");
  // the keys offered stay neutral; the chosen one alone takes the brand's frame
  const keys = await page.locator('.ms-keys [role="group"][aria-label="Role"] .opt').evaluateAll((els) => els.map((e) => [e.getAttribute("aria-pressed"), getComputedStyle(e).borderTopColor]));
  const chosen = keys.filter(([p]) => p === "true").map(([, c]) => c);
  const offered = new Set(keys.filter(([p]) => p === "false").map(([, c]) => c));
  expect(chosen).toHaveLength(1);
  expect(offered.size).toBe(1);
  expect(offered.has(chosen[0])).toBe(false);
});

test("on a big screen the page, its keys and its panel grow by one factor", async ({ page }) => {
  await opened(page, 1440, 900);
  const small = await page.evaluate(() => ({
    h1: parseFloat(getComputedStyle(document.querySelector(".ms-head h1")!).fontSize),
    key: document.querySelector<HTMLElement>('.ms-keys .opt')!.getBoundingClientRect().height,
    panel: document.querySelector<HTMLElement>(".ms-rules")!.getBoundingClientRect().width,
  }));
  await opened(page, 2560, 1440);
  await noSidewaysScroll(page, 2560);
  const big = await page.evaluate(() => ({
    h1: parseFloat(getComputedStyle(document.querySelector(".ms-head h1")!).fontSize),
    key: document.querySelector<HTMLElement>('.ms-keys .opt')!.getBoundingClientRect().height,
    panel: document.querySelector<HTMLElement>(".ms-rules")!.getBoundingClientRect().width,
  }));
  const factor = big.h1 / small.h1;
  expect(factor).toBeGreaterThan(1.15);
  expect(Math.abs(big.key / small.key - factor)).toBeLessThan(0.06);
  expect(Math.abs(big.panel / small.panel - factor)).toBeLessThan(0.06);
  expect(new Set(await tops(page, ".ms-number")).size).toBe(1);
  await page.screenshot({ path: "test-results/mainscans-big.png" });
});

test("a phone's width is one column with no sideways scroll, the panel under the page", async ({ page }) => {
  await opened(page, 390, 844);
  await noSidewaysScroll(page, 390);
  const main = (await page.locator(".ms-main").boundingBox())!;
  const panel = (await page.locator(".ms-rules").boundingBox())!;
  expect(panel.y).toBeGreaterThanOrEqual(main.y + main.height - 1);
  // where the kinds come from scrolls inside its box
  const where = await page.locator(".ms-matrix-wrap").evaluate((e) => ({ scroll: e.scrollWidth, width: e.clientWidth }));
  expect(where.scroll).toBeGreaterThan(where.width);
  // a card's visits fold within the card
  for (const card of await page.locator(".ms-card").all()) {
    const box = (await card.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  }
  await page.screenshot({ path: "test-results/mainscans-phone.png", fullPage: true });
});

test("every subject as a strip, the group lit and the rest dimmed, nothing sideways", async ({ page }) => {
  await opened(page, 1440, 900);
  await page.getByRole("button", { name: "All subjects" }).click();
  await expect(page.locator(".ms-strip-group")).toHaveCount(4);
  const lit = await page.locator(".ms-strip.lit").count();
  const dim = await page.locator(".ms-strip:not(.lit)").count();
  expect(lit).toBeGreaterThan(0);
  expect(dim).toBeGreaterThan(0);
  expect(lit + dim).toBe(600);
  expect(await page.locator(".ms-strip:not(.lit)").first().evaluate((e) => getComputedStyle(e).opacity)).toBe("0.22");
  await noSidewaysScroll(page, 1440);
  await page.screenshot({ path: "test-results/mainscans-strips.png", fullPage: true });
});

test("a card's visit opens its pick in the window, its candidates and a why", async ({ page }) => {
  await opened(page, 1440, 900);
  await page.locator(".ms-card .ms-visit:not(.blank)").first().click();
  const dialog = page.locator("dialog[open]");
  await expect(dialog.locator("h2")).toHaveText("This visit's T1w");
  await expect(dialog.locator(".bundle")).toHaveCount(2);
  const box = (await dialog.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(900);
  await expect(dialog.getByRole("button", { name: "Keep my pick" })).toBeDisabled();
  await page.screenshot({ path: "test-results/mainscans-visit.png" });
});

test("a change in the panel shows its effect first, in light and dark", async ({ page }) => {
  for (const scheme of ["dark", "light"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await opened(page, 1440, 900);
    await page.locator(".ms-rules").getByRole("button", { name: "Across the data" }).click();
    await expect(page.locator(".ms-effect-line")).toHaveText("37 visits change their pick · 21 subjects their series");
    await expect(page.locator(".ms-rules-toggle")).toHaveText("Rules · version 2 · changed");
    await expect(page.locator(".ms-number.given")).toHaveCount(1);
    await page.screenshot({ path: `test-results/mainscans-changed-${scheme}.png` });
  }
});
