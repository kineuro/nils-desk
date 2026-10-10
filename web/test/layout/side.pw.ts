// SPDX-License-Identifier: AGPL-3.0-only
// The side as the 2026-10-09 design draws it, measured in the real desk
// (desk.html, every section open to one account): on Home only Settings sits
// at the foot; opening a section unfolds its pages under it and sends every
// section after it down to the foot, under one line; Settings, opened, rises
// under the last section with nothing left at the foot. On a phone the panel
// over the page unfolds a section without leaving the page, and choosing one
// of its pages closes the panel. In chromium and, with LAYOUT_FIREFOX=1,
// Firefox.

import { expect, test, type Page } from "@playwright/test";

interface Stand {
  title: string;
  top: number;
  bottom: number;
  /** The height its pages take: nothing while it is folded. */
  pages: number;
  /** Whether the line over the foot is drawn above it. */
  line: boolean;
}

async function measure(page: Page): Promise<{ top: number; bottom: number; groups: Stand[] }> {
  return page.evaluate(() => {
    const nav = document.querySelector<HTMLElement>("nav.side")!;
    const cs = getComputedStyle(nav);
    const box = nav.getBoundingClientRect();
    const groups = [...nav.querySelectorAll<HTMLElement>(".side-group")].map((g) => {
      const row = g.querySelector<HTMLElement>(".side-link")!.getBoundingClientRect();
      return {
        title: g.querySelector(".side-link .grow")!.textContent ?? "",
        top: row.top,
        bottom: row.bottom,
        pages: g.querySelector<HTMLElement>(".side-pages")?.getBoundingClientRect().height ?? 0,
        line: getComputedStyle(g, "::before").opacity === "1",
      };
    });
    return { top: box.top + parseFloat(cs.paddingTop), bottom: box.bottom - parseFloat(cs.paddingBottom), groups };
  });
}

const WORK = ["Home", "Query", "Data", "Review", "Campaigns", "Models", "Release", "Pipelines"];
const of = (m: { groups: Stand[] }, title: string) => m.groups.find((g) => g.title === title)!;

/** The rows from `from` to the last sit one after another, with only the side's gap between them. */
function packed(m: { groups: Stand[] }, from: string) {
  const at = m.groups.findIndex((g) => g.title === from);
  for (let i = at + 1; i < m.groups.length; i++) {
    const gap = m.groups[i].top - (m.groups[i - 1].bottom + m.groups[i - 1].pages);
    expect(gap, `${m.groups[i - 1].title} to ${m.groups[i].title}`).toBeLessThanOrEqual(4);
  }
}

const row = (page: Page, title: string) => page.locator("a.side-link", { has: page.locator(".grow", { hasText: new RegExp(`^${title}$`) }) });

for (const motion of ["reduce", "no-preference"] as const) {
  test(`the side opens one section at a time and the rest go down to the foot (motion: ${motion})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: motion });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/desk.html#home");
    await expect(row(page, "Settings")).toBeVisible();
    const settle = () => (motion === "reduce" ? Promise.resolve() : page.waitForTimeout(450));

    // Home: every section at the top, Settings alone at the foot under the line
    let m = await measure(page);
    expect(m.groups.map((g) => g.title)).toEqual([...WORK, "Settings"]);
    expect(Math.abs(of(m, "Settings").bottom - m.bottom)).toBeLessThanOrEqual(2);
    expect(of(m, "Settings").top - of(m, "Pipelines").bottom).toBeGreaterThan(200);
    expect(m.groups.filter((g) => g.line).map((g) => g.title)).toEqual(["Settings"]);
    expect(m.groups.every((g) => g.pages === 0)).toBe(true);

    // Review: its pages under it, and every section after it at the foot
    await row(page, "Review").click();
    await expect(page).toHaveURL(/#review$/);
    await expect(row(page, "Review")).toHaveAttribute("aria-expanded", "true");
    await settle();
    m = await measure(page);
    expect(of(m, "Review").pages).toBeGreaterThan(100);
    await expect(page.locator(".side-group.on .side-pages a")).toHaveText(["Questions", "Main scans", "Subjects", "Rules"]);
    await expect(page.locator('.side-group.on .side-pages a[aria-current="page"]')).toHaveText("Questions");
    expect(of(m, "Campaigns").top - (of(m, "Review").bottom + of(m, "Review").pages)).toBeGreaterThan(100);
    packed(m, "Campaigns");
    expect(Math.abs(of(m, "Settings").bottom - m.bottom)).toBeLessThanOrEqual(2);
    expect(m.groups.filter((g) => g.line).map((g) => g.title)).toEqual(["Campaigns"]);

    // one of its pages: the address moves and the section stays open
    await page.locator('.side-pages a[href="#review/rules"]').click();
    await expect(page).toHaveURL(/#review\/rules$/);
    await expect(page.locator('.side-group.on .side-pages a[aria-current="page"]')).toHaveText("Rules");

    // Settings rises under the last section, and nothing is left at the foot
    await row(page, "Settings").click();
    await expect(page).toHaveURL(/#settings$/);
    await expect(row(page, "Settings")).toHaveAttribute("aria-expanded", "true");
    await settle();
    m = await measure(page);
    expect(of(m, "Settings").top - of(m, "Pipelines").bottom).toBeLessThanOrEqual(4);
    expect(of(m, "Settings").pages).toBeGreaterThan(100);
    expect(of(m, "Review").pages).toBe(0);
    expect(m.groups.some((g) => g.line)).toBe(false);

    // its row folds it in place, and it goes back down to the foot
    await row(page, "Settings").click();
    await expect(row(page, "Settings")).toHaveAttribute("aria-expanded", "false");
    await expect(page).toHaveURL(/#settings$/);
    await settle();
    m = await measure(page);
    expect(of(m, "Settings").pages).toBe(0);
    expect(Math.abs(of(m, "Settings").bottom - m.bottom)).toBeLessThanOrEqual(2);
    expect(m.groups.filter((g) => g.line).map((g) => g.title)).toEqual(["Settings"]);
  });
}

test("on a phone the panel unfolds a section without leaving the page, and a page of it closes the panel", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/desk.html#home");
  await page.getByRole("button", { name: "Sections" }).click();
  await expect(page.locator("nav.side")).toBeVisible();
  await row(page, "Review").click();
  await expect(row(page, "Review")).toHaveAttribute("aria-expanded", "true");
  await expect(page).toHaveURL(/#home$/);
  await expect(page.locator(".side-group.on .side-pages a")).toHaveText(["Questions", "Main scans", "Subjects", "Rules"]);
  const m = await measure(page);
  expect(of(m, "Review").pages).toBeGreaterThan(100);
  expect(Math.abs(of(m, "Settings").bottom - m.bottom)).toBeLessThanOrEqual(2);
  await page.locator('.side-pages a[href="#review/identifiers"]').click();
  await expect(page).toHaveURL(/#review\/identifiers$/);
  await expect(page.locator("nav.side")).toBeHidden();
  const doc = await page.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth }));
  expect(doc.scrollW).toBeLessThanOrEqual(doc.clientW);
});
