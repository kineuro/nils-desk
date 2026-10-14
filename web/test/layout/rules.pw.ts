// SPDX-License-Identifier: AGPL-3.0-only
// The Rules page in a real browser, in the desk's own shell (record 56,
// sections 6.4 and 6.5), at a laptop's width (1440) and a phone's (390):
// the proposals open the page, each approval card saying the answers it
// breaks with their pictures in the caution colour's frame before any
// button; Adopt is one press and one line follows the re-sort to what it
// did; the pack's quality with each row's mend; Change a rule with a form
// per operation, only the chosen key in colour, and the effect before
// anything is proposed; nothing sideways; and on a big screen the page, its
// keys and its cards grow by one factor. In chromium, and in Firefox where
// it is installed. Screenshots go to test-results for a look.

import { expect, test, type Locator, type Page } from "@playwright/test";

const VIEWPORTS = [
  { name: "laptop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
];

/** A made-up picture of a scan: a grey head on black, its shade by the scan's number. */
function picture(id: number): string {
  const g = 90 + (id % 7) * 15;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="black"/><ellipse cx="48" cy="50" rx="30" ry="37" fill="rgb(${g},${g},${g})"/><ellipse cx="48" cy="52" rx="17" ry="23" fill="rgb(${g - 45},${g - 45},${g - 45})"/></svg>`;
}

async function pictures(page: Page) {
  await page.route("**/api/instances/*/thumb", (route) => {
    const id = Number(/instances\/(\d+)\/thumb/u.exec(route.request().url())?.[1] ?? 0);
    return route.fulfill({ status: 200, contentType: "image/svg+xml", body: picture(id) });
  });
}

async function noSideways(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  const inner = await page.locator("main.page").evaluate((e) => e.scrollWidth - e.clientWidth);
  expect(inner).toBeLessThanOrEqual(1);
}

/** Every element inside stays inside the window's width, but for what a box that scrolls sideways holds; the ones past it named. */
async function inside(loc: Locator, width: number) {
  const past = await loc.evaluate((root, w) => {
    const scrolls = (e: Element) => ["auto", "scroll", "hidden", "clip"].includes(getComputedStyle(e).overflowX);
    const held = (e: Element) => {
      for (let p = e.parentElement; p && p !== root.parentElement; p = p.parentElement) if (scrolls(p)) return true;
      return false;
    };
    return [root, ...root.querySelectorAll("*")]
      .filter((e) => e.getBoundingClientRect().right > w + 0.5 && !held(e))
      .slice(0, 5)
      .map((e) => `${e.tagName.toLowerCase()}.${[...e.classList].join(".")} ${Math.round(e.getBoundingClientRect().right)}`);
  }, width);
  expect(past).toEqual([]);
}

const frame = (loc: Locator) =>
  loc.evaluate((e) => {
    const s = getComputedStyle(e);
    return { left: s.borderLeftWidth, top: s.borderTopWidth, leftColour: s.borderLeftColor, topColour: s.borderTopColor, radius: s.borderTopLeftRadius, background: s.backgroundColor };
  });

for (const vp of VIEWPORTS) {
  test.describe(`${vp.width} by ${vp.height}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test("the proposals open the page; a card says the answers it breaks with their pictures before any button", async ({ page }) => {
      await pictures(page);
      await page.goto("/rules.html#review/rules");
      await expect(page.locator("h1")).toHaveText("Rules");
      await expect(page.locator(".rules-tabs .opt.on")).toHaveText("Proposals2");
      await expect(page.locator(".rp > .rp-card")).toHaveCount(2);
      const card = page.locator("#rule-change-12 .rule-card");
      await expect(card.locator(".rule-line")).toHaveText("Moves 50 scans · base T2w → FLAIR, 47 · base nothing → FLAIR, 3 · fixes 47, breaks 3");
      await expect(card.locator(".rx-breaks-head")).toHaveText("Breaks 3 answers people settled");
      await expect(card.locator(".rx-breaks .rx-scan img")).toHaveCount(3);
      await expect.poll(() => card.locator(".rx-breaks img").first().evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
      // the caution colour as a frame: a thick bar on the left and a thin line round it, never a glyph
      const box = await frame(card.locator(".rx-breaks"));
      expect(parseFloat(box.left)).toBeGreaterThanOrEqual(3);
      expect(box.top).toBe("1px");
      expect(box.leftColour).not.toBe(box.topColour);
      expect(box.background).not.toBe("rgba(0, 0, 0, 0)");
      const breaks = (await card.locator(".rx-breaks").boundingBox())!;
      const foot = (await card.locator(".approval-foot").boundingBox())!;
      expect(breaks.y + breaks.height).toBeLessThanOrEqual(foot.y + 1);
      await expect(card.locator(".approval-foot button")).toHaveText(["Adopt", "Reject", "Details"]);
      await inside(page.locator(".rp"), vp.width);
      await noSideways(page, vp.width);
      await page.screenshot({ path: `test-results/rules-proposals-${vp.name}.png`, fullPage: true });
    });

    test("Adopt is one press; one line follows the re-sort to what it did", async ({ page }) => {
      await pictures(page);
      await page.goto("/rules.html#review/rules");
      const card = page.locator("#rule-change-12 .rule-card");
      await card.getByRole("button", { name: "Adopt" }).click();
      await expect(card.locator(".rule-applied")).toHaveText("Written as mri 1.2.1, to release · Re-sorted 1,003 scans: 50 moved (base 50)", { timeout: 10_000 });
      await expect(card.locator(".approval-kind .tag").first()).toHaveText("adopted");
      await expect(card.locator(".rule-measured")).toHaveText("base FLAIR 120 → 170 · T2w 300 → 253");
      await expect(page.locator(".rules-tabs .opt").first()).toHaveText("Proposals1");
      await noSideways(page, vp.width);
      await card.screenshot({ path: `test-results/rules-adopted-${vp.name}.png` });
    });

    test("a card opens its stored report: the moves with their pictures, the answers we know, names, main scans, Review and checks", async ({ page }) => {
      await pictures(page);
      await page.goto("/rules.html#review/rules/proposals/12");
      const card = page.locator("#rule-change-12 .rule-card");
      await expect(card.locator(".rx-sec > summary .eyebrow")).toHaveText(["Moves", "Answers we know", "Names", "Main scans", "Review", "Checks"]);
      await expect(card.locator(".rx-move")).toHaveCount(2);
      await expect(card.locator(".rx-move").first().locator(".value-tag")).toHaveText(["T2w", "FLAIR"]);
      await inside(card, vp.width);
      await noSideways(page, vp.width);
      await card.screenshot({ path: `test-results/rules-report-${vp.name}.png` });
    });

    test("the pack's quality: what it cannot rank, which rules win, System 1 not served yet, each row with its mend", async ({ page }) => {
      await pictures(page);
      await page.goto("/rules.html#review/rules/quality");
      await expect(page.locator(".rq-tie")).toHaveCount(2);
      await expect(page.locator(".rq-over")).toHaveCount(3);
      await expect(page.locator(".rq-sec").nth(2)).toContainText("Not served yet.");
      await expect(page.locator(".rq-tie").first().getByRole("button", { name: "Mend" })).toBeVisible();
      // a value is a framed tag in its colour: a 3px bar on the left, a thin frame, corners of 3px, a tint
      const tag = await frame(page.locator(".rq-tie .value-tag").first());
      expect(tag).toMatchObject({ left: "3px", top: "1px", radius: "3px" });
      expect(tag.background).not.toBe("rgba(0, 0, 0, 0)");
      await inside(page.locator(".rq"), vp.width);
      await noSideways(page, vp.width);
      await page.screenshot({ path: `test-results/rules-quality-${vp.name}.png`, fullPage: true });
    });

    test("change a rule: a form per operation, only the chosen key in colour, the effect before anything is proposed", async ({ page }) => {
      await pictures(page);
      await page.goto("/rules.html#review/rules/change");
      await expect(page.locator(".rf-ops .opt")).toHaveCount(14);
      const keys = await page.locator(".rf-ops .opt").evaluateAll((els) => els.map((e) => [e.getAttribute("aria-pressed"), getComputedStyle(e).borderTopColor]));
      const chosen = keys.filter(([p]) => p === "true").map(([, c]) => c);
      const offered = new Set(keys.filter(([p]) => p === "false").map(([, c]) => c));
      expect(chosen).toHaveLength(1);
      expect(offered.size).toBe(1);
      expect(offered.has(chosen[0])).toBe(false);
      await page.locator('.rf input[aria-label="Axis"]').fill("base");
      await page.locator('.rf input[aria-label="Value"]').fill("FLAIR");
      await page.locator('.rf input[aria-label="Words"]').fill("dark fluid");
      await page.locator('.rf input[aria-label="Why"]').fill("dark fluid is FLAIR");
      await page.screenshot({ path: `test-results/rules-form-${vp.name}.png`, fullPage: true });
      await page.getByRole("button", { name: "Show the effect" }).click();
      await expect(page.locator(".rx-line")).toHaveText("Moves 50 scans · base T2w → FLAIR, 47 scans · base nothing → FLAIR, 3 scans · 17 main scans change · fixes 47, breaks 3");
      await expect(page.locator(".rf .rx-breaks .rx-cases li")).toHaveCount(1);
      await expect(page.locator(".rf .rx-breaks .rx-scan")).toHaveCount(3);
      await expect(page.getByRole("button", { name: "Propose it" })).toBeVisible();
      await inside(page.locator(".rf"), vp.width);
      await noSideways(page, vp.width);
      await page.screenshot({ path: `test-results/rules-change-${vp.name}.png`, fullPage: true });
    });
  });
}

test("in the dark theme a value's frame and the caution frame still stand out from the ground", async ({ page }) => {
  await pictures(page);
  await page.emulateMedia({ colorScheme: "dark" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rules.html#review/rules/proposals/12");
  const card = page.locator("#rule-change-12 .rule-card");
  await expect(card.locator(".rx-breaks")).toBeVisible();
  const ground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const breaks = await frame(card.locator(".rx-breaks"));
  expect(breaks.leftColour).not.toBe(ground);
  expect(breaks.background).not.toBe(ground);
  const tag = await frame(card.locator(".rx-move .value-tag").first());
  expect(tag.leftColour).not.toBe(ground);
  await page.screenshot({ path: "test-results/rules-proposals-dark-laptop.png" });
  await page.goto("/rules.html#review/rules/quality");
  await expect(page.locator(".rq-tie")).toHaveCount(2);
  await page.screenshot({ path: "test-results/rules-quality-dark-laptop.png" });
});

test("on a big screen the page, its keys and its cards grow by one factor", async ({ page }) => {
  await pictures(page);
  const measure = async (width: number, height: number) => {
    await page.setViewportSize({ width, height });
    await page.goto("/rules.html#review/rules");
    await expect(page.locator("#rule-change-12 .rule-card")).toBeVisible();
    return page.evaluate(() => ({
      h1: parseFloat(getComputedStyle(document.querySelector(".data-head h1")!).fontSize),
      key: document.querySelector<HTMLElement>(".rules-tabs .opt")!.getBoundingClientRect().height,
      title: parseFloat(getComputedStyle(document.querySelector(".rule-card .approval-title")!).fontSize),
      scan: document.querySelector<HTMLElement>(".rule-card .rx-scan")!.getBoundingClientRect().width,
    }));
  };
  const small = await measure(1440, 900);
  const big = await measure(2560, 1440);
  await noSideways(page, 2560);
  const factor = big.h1 / small.h1;
  expect(factor).toBeGreaterThan(1.15);
  for (const k of ["key", "title", "scan"] as const) expect(Math.abs(big[k] / small[k] - factor), k).toBeLessThan(0.06);
  await page.screenshot({ path: "test-results/rules-big.png" });
});
