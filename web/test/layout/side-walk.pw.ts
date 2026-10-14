// SPDX-License-Identifier: AGPL-3.0-only
// Gate T31's "every section is reachable from the side" (record 55 H2, round
// 4), walked in the real desk (walk.html: every grant, every door of the
// engine's contract, an engine that holds nothing): every section of the side
// opens, every page under it opens from its line, the line is marked as the
// page open, and the page draws a heading and never stops. On a laptop the
// side stands beside the page; on a phone it is the panel over the page,
// opened from the top bar. WALK_SHOTS=<dir> keeps a picture of each page, in
// the light and the dark theme. In chromium and, with LAYOUT_FIREFOX=1,
// Firefox.

import { expect, test, type Page } from "@playwright/test";

/** The sections down the side, and the foot's, as the side lists them: their titles and the addresses of their pages. */
async function sideOf(page: Page): Promise<{ title: string; href: string; pages: { title: string; href: string }[] }[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("nav.side .side-group")].map((g) => ({
      title: g.querySelector(".side-link .grow")!.textContent ?? "",
      href: g.querySelector<HTMLAnchorElement>(".side-link")!.getAttribute("href") ?? "",
      pages: [...g.querySelectorAll<HTMLAnchorElement>(".side-pages a")].map((a) => ({ title: a.textContent ?? "", href: a.getAttribute("href") ?? "" })),
    })),
  );
}

/** The page drew: a heading in the page, and not the stopped page's. */
async function drew(page: Page, where: string) {
  const main = page.locator("main.page");
  // what the page reads has come back, so a page that stops on its answer has stopped
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(150);
  // soft, so one walk names every page that did not draw
  await expect.soft(main.locator("h1").first(), `${where}: a heading`).toBeVisible();
  await expect.soft(main.getByText("This page stopped"), `${where}: the page stopped`).toHaveCount(0);
}

/** A page that opens a dialog of its own (New release) is shut, so the side can be reached again. */
async function shut(page: Page) {
  for (let i = 0; i < 3 && (await page.locator("dialog[open]").count()) > 0; i++) await page.keyboard.press("Escape");
}

const shots = process.env.WALK_SHOTS;
const name = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");

async function shoot(page: Page, width: number, section: string, title: string) {
  if (!shots) return;
  for (const theme of ["light", "dark"] as const) {
    await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
    await page.waitForTimeout(80);
    await page.screenshot({ path: `${shots}/${width}-${theme}-${name(section)}-${name(title)}.png`, fullPage: false });
  }
  await page.evaluate(() => document.documentElement.removeAttribute("data-theme"));
}

// what the walk expects the side to hold for a person who holds every grant (spec 13.1's map)
const MAP: Record<string, string[]> = {
  Home: [],
  Assistant: ["New conversation", "All conversations", "Shared", "Memory"],
  Ask: ["Cards", "Selections", "Exports"],
  Data: ["Datasets and cohorts", "Browse", "Pseudonyms"],
  Review: ["Work", "Main scans", "Subjects", "Rules", "Rounds", "Label sets"],
  Release: ["Releases", "New release", "Session schemes"],
  Pipelines: ["Jobs", "Catalog", "Runs", "Logs", "Models"],
  Settings: ["Overview", "Parts", "Engine", "Desk", "Language models", "Assistant", "Places", "Backups", "People", "Audit", "Setup"],
};

test.describe.configure({ mode: "serial" });

test("on a laptop every section of the side opens, and every page under it opens from its line", async ({ page }) => {
  test.setTimeout(180_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/walk.html#home");
  await expect(page.locator("nav.side .side-link").first()).toBeVisible();
  await drew(page, "Home");
  const side = await sideOf(page);
  // every section of the map, in its order, and only those
  expect(side.map((s) => s.title)).toEqual(Object.keys(MAP));
  for (const s of side) {
    await page.locator("nav.side a.side-link", { has: page.locator(".grow", { hasText: new RegExp(`^${s.title}$`) }) }).click();
    await drew(page, s.title);
    const open = await sideOf(page);
    const pages = open.find((o) => o.title === s.title)!.pages.filter((p) => p.href !== "");
    // Plans waiting and Standing grants join the Assistant where its ladder answers; this assistant answers nothing
    expect(pages.map((p) => p.title), s.title).toEqual(MAP[s.title]);
    if (pages.length === 0) await shoot(page, 1440, s.title, "page");
    for (const p of pages) {
      await page.locator(`nav.side .side-group.on .side-pages a[href="${p.href}"]`).click();
      await expect.poll(() => page.evaluate(() => location.hash), `${s.title} / ${p.title}`).toContain(p.href.split("?")[0]);
      await drew(page, `${s.title} / ${p.title}`);
      await expect(page.locator('nav.side .side-group.on .side-pages a[aria-current="page"]'), `${s.title} / ${p.title} marked`).toHaveText(p.title);
      await shoot(page, 1440, s.title, p.title);
      await shut(page);
    }
  }
});

test("on a phone every section opens from the panel over the page, and every page under it", async ({ page }) => {
  test.setTimeout(180_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/walk.html#home");
  const sections = page.getByRole("button", { name: "Sections" });
  await expect(sections).toBeVisible();
  await drew(page, "Home");
  for (const [title, pages] of Object.entries(MAP)) {
    await sections.click();
    const row = page.locator("nav.side a.side-link", { has: page.locator(".grow", { hasText: new RegExp(`^${title}$`) }) });
    await expect(row, title).toBeVisible();
    if (pages.length === 0) {
      await row.click();
      await drew(page, title);
      await shoot(page, 390, title, "page");
      continue;
    }
    for (const p of pages) {
      if (!(await page.locator("nav.side.open").isVisible())) await sections.click();
      if ((await row.getAttribute("aria-expanded")) !== "true") await row.click();
      const line = page.locator("nav.side .side-group.on .side-pages a", { hasText: new RegExp(`^${p}$`) }).first();
      await expect(line, `${title} / ${p}`).toBeVisible();
      await line.click();
      // a page chosen closes the panel, and the page draws under it
      await expect(page.locator("nav.side.open")).toHaveCount(0);
      await drew(page, `${title} / ${p}`);
      // nothing wider than the phone
      const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(wide, `${title} / ${p}: wider than the phone`).toBeLessThanOrEqual(1);
      await shoot(page, 390, title, p);
      await shut(page);
    }
  }
});
