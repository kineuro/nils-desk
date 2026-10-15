// SPDX-License-Identifier: AGPL-3.0-only
// Main scans' layers in a real browser, in the desk's own shell (record 55,
// decision 6: "The data map (v0's heatmap, for datasets and cohorts, with
// layers such as body part and post-contrast) is where the trade-off is
// seen"): the layer keys, only the chosen one in the brand's colour; a
// layer's values framed in their colours, never a dot or a square; each
// card's visit marked under its kind, inside the visit; the strips coloured
// by the layer, a visit with no scan taken outlined; the step's line with
// its Run; at a laptop's width and a phone's, with no sideways scroll, for
// a cohort and for a dataset. In chromium, and in Firefox where it is
// installed. Screenshots go to test-results for a look.

import { expect, test, type Page } from "@playwright/test";

async function opened(page: Page, width: number, height: number, scope = "cohort=ms-followup") {
  await page.setViewportSize({ width, height });
  await page.goto(`/mainscans.html#review/picks?${scope}`);
  await expect(page.locator(".ms-number")).toHaveCount(5);
  await expect(page.locator(".ms-card").first()).toBeVisible();
}

async function layer(page: Page, words: string) {
  await page.locator(".ms-layer").getByRole("button", { name: words, exact: true }).click();
  await expect(page.locator(".ms-layer .ms-kind-row").first()).toBeVisible();
  await expect(page.locator(".ms-card .ms-visit-layer").first()).toBeVisible();
}

async function noSidewaysScroll(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  const inner = await page.locator("main.page").evaluate((e) => e.scrollWidth - e.clientWidth);
  expect(inner).toBeLessThanOrEqual(1);
}

/** How a framed value tag is drawn: its left bar, its frame, its corner and its tint. */
const frame = (sel: ReturnType<Page["locator"]>) =>
  sel.evaluate((e) => {
    const s = getComputedStyle(e);
    return { left: s.borderLeftWidth, top: s.borderTopWidth, radius: s.borderTopLeftRadius, background: s.backgroundColor, leftColour: s.borderLeftColor, before: getComputedStyle(e, "::before").content };
  });

test("at a laptop's width the layer's keys, its values and the cards' marks are the desk's: only the chosen key in colour, each value framed", async ({ page }) => {
  await opened(page, 1440, 900);
  await layer(page, "Body region");
  await noSidewaysScroll(page, 1440);
  // the keys offered stay neutral; the chosen one alone takes the brand's frame
  const keys = await page.locator('.ms-layer [role="group"][aria-label="Layer"] .opt').evaluateAll((els) => els.map((e) => [e.getAttribute("aria-pressed"), getComputedStyle(e).borderTopColor, e.textContent]));
  expect(keys.map((k) => k[2])).toEqual(["Kinds", "Body region", "Body part", "Post-contrast"]);
  const chosen = keys.filter(([p]) => p === "true").map(([, c]) => c);
  const offered = new Set(keys.filter(([p]) => p === "false").map(([, c]) => c));
  expect(chosen).toHaveLength(1);
  expect(offered.size).toBe(1);
  expect(offered.has(chosen[0])).toBe(false);
  // a value is a framed tag in its colour: a 3px bar, a thin frame, the tint, no glyph
  const head = page.locator(".ms-layer .ms-kind-row .ms-layer-tag").first();
  await expect(head).toHaveText("head");
  const look = await frame(head);
  expect(look).toMatchObject({ left: "3px", top: "1px", radius: "3px" });
  expect(look.background).not.toBe("rgba(0, 0, 0, 0)");
  expect(["none", "normal", ""]).toContain(look.before);
  // the step's line says body part has not run over the cohort, with its Run beside it
  await expect(page.locator(".ms-layer-said")).toHaveText("Body part has not run on this cohort.");
  await expect(page.locator(".ms-layer").getByRole("button", { name: "Run", exact: true })).toBeEnabled();
  // each card's visit carries its mark under its kind, inside the visit and on one line
  for (const visit of (await page.locator(".ms-card .ms-visit:not(.blank)").all()).slice(0, 12)) {
    const fit = await visit.evaluate((v) => {
      const box = v.getBoundingClientRect();
      const mark = v.querySelector(".ms-visit-layer")!.getBoundingClientRect();
      const kind = v.querySelector(".ms-kind:not(.ms-layer-tag)")!.getBoundingClientRect();
      return { inside: mark.left >= box.left - 0.5 && mark.right <= box.right + 0.5, below: mark.top >= kind.bottom - 0.5, tall: mark.height, kind: kind.height };
    });
    expect(fit.inside).toBe(true);
    expect(fit.below).toBe(true);
    expect(fit.tall).toBeLessThan(fit.kind * 1.5);
  }
  // a visit that takes no scan with a value shows what most of its scans are, its colour as a frame alone
  const held = page.locator(".ms-card .ms-layer-tag.held").first();
  if ((await held.count()) > 0) expect((await frame(held)).background).toBe("rgba(0, 0, 0, 0)");
  await page.locator(".ms-layer").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/maplayers-1440.png", fullPage: true });
});

test("every subject as a strip in the layer's colours, a visit with no scan taken outlined, nothing sideways", async ({ page }) => {
  await opened(page, 1440, 900);
  await layer(page, "Body region");
  await page.getByRole("button", { name: "All subjects" }).click();
  await expect(page.locator(".ms-strip-group")).toHaveCount(4);
  const cells = await page.locator(".ms-strip > i:not(.blank)").evaluateAll((els) =>
    els.map((e) => ({ slot: e.getAttribute("data-slot"), held: e.classList.contains("held"), none: e.classList.contains("none"), changed: e.classList.contains("changed"), background: getComputedStyle(e).backgroundColor, shadow: getComputedStyle(e).boxShadow })),
  );
  expect(cells.length).toBeGreaterThan(600);
  expect(cells.filter((c) => c.slot === "1").length).toBeGreaterThan(cells.length / 2);
  expect(cells.some((c) => c.slot === "3")).toBe(true);
  expect(cells.some((c) => c.held)).toBe(true);
  for (const c of cells.filter((x) => x.held)) {
    expect(c.background).toBe("rgba(0, 0, 0, 0)");
    expect(c.shadow).toContain("inset");
  }
  expect(cells.some((c) => c.changed)).toBe(false);
  await noSidewaysScroll(page, 1440);
  await page.screenshot({ path: "test-results/maplayers-strips-1440.png", fullPage: true });
});

test("post-contrast: the step has run, the 72-hour flag in the caution colour, in light and dark", async ({ page }) => {
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await opened(page, 1440, 900);
    await layer(page, "Post-contrast");
    await expect(page.locator(".ms-layer-said")).toHaveText(/^Post-contrast has run on this cohort · 11,800 of 12,600 answered\.$/);
    await expect(page.locator(".ms-layer").getByRole("button", { name: "Run", exact: true })).toHaveCount(0);
    await expect(page.locator(".ms-layer-flag .tag.caution")).toHaveText("72 h");
    const values = await page.locator(".ms-layer .ms-kind-row .ms-layer-tag").allTextContents();
    expect(values.slice(0, 2)).toEqual(["pre", "post"]);
    await noSidewaysScroll(page, 1440);
    await page.locator(".ms-layer").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/maplayers-contrast-${scheme}-1440.png`, fullPage: true });
  }
});

test("at a phone's width the layer is one column with its keys wrapping inside its box, the cards' marks inside their visits, nothing sideways", async ({ page }) => {
  await opened(page, 390, 844);
  await layer(page, "Body region");
  await noSidewaysScroll(page, 390);
  const box = (await page.locator(".ms-layer").boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  for (const key of await page.locator(".ms-layer .opt").all()) {
    const k = (await key.boundingBox())!;
    expect(k.x + k.width).toBeLessThanOrEqual(box.x + box.width + 0.5);
  }
  for (const row of await page.locator(".ms-layer .ms-kind-row").all()) {
    const r = (await row.boundingBox())!;
    expect(r.x + r.width).toBeLessThanOrEqual(box.x + box.width + 0.5);
  }
  for (const card of await page.locator(".ms-card").all()) {
    const c = (await card.boundingBox())!;
    expect(c.x + c.width).toBeLessThanOrEqual(390);
  }
  await page.locator(".ms-layer").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/maplayers-390.png", fullPage: true });
  await page.getByRole("button", { name: "All subjects" }).click();
  await expect(page.locator(".ms-strip-group")).toHaveCount(4);
  await noSidewaysScroll(page, 390);
  await page.screenshot({ path: "test-results/maplayers-strips-390.png", fullPage: true });
});

test("a dataset's page has its layers too, and its Run is the dataset's", async ({ page }) => {
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
  ] as const) {
    await opened(page, width, height, "dataset=study-big");
    await expect(page.locator(".ms-head .eyebrow")).toHaveText("Main scans · dataset");
    await layer(page, "Body part");
    await expect(page.locator(".ms-layer-said")).toHaveText("Body part has not run on this dataset.");
    await page.evaluate(() => {
      (window as unknown as { runs?: string[] }).runs = [];
    });
    await page.locator(".ms-layer").getByRole("button", { name: "Run", exact: true }).click();
    await expect(page.locator(".ms-layer .ms-said")).toHaveText("study-big: body part queued.");
    // the fake engine answers in the page, so the run it was asked for is read from there
    expect(await page.evaluate(() => (window as unknown as { runs?: string[] }).runs)).toEqual(["/api/datasets/study-big/steps/body_part/run"]);
    await noSidewaysScroll(page, width);
    await page.locator(".ms-layer").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/maplayers-dataset-${width}.png`, fullPage: true });
  }
});
