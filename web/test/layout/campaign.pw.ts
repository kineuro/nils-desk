// SPDX-License-Identifier: AGPL-3.0-only
// A campaign's page as an app page (UX round 5, finding 7) in the desk's own
// shell, at a laptop's width and a phone's: the head says what it asks and who
// reads it, its state is the head's border, one next action is chosen from
// the state (Read the N left, Settle the N, Close, Results) with Export and
// Change raters small beside it; every person is a name, the subject hash
// only on hover and never whole; each row is the scan, its state the row's
// colour, its answers value words; the facts wait under a closed Details
// fold. Nothing goes sideways. Screenshots go to test-results for the report.

import { expect, test, type Page } from "@playwright/test";

const VIEWPORTS = [
  { name: "laptop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
];

const STATES = [
  { state: "open", next: "Read the 2 left", lede: "Is the scan like the pre or the post? · post_contrast · 6 scans · you read them", tag: "open", controls: 4 },
  { state: "settle", next: "Settle the 3", lede: "Rune and a rater read them", tag: "open", controls: 4 },
  { state: "done", next: "Close", lede: "Rune reads them", tag: "open", controls: 3 },
  { state: "closed", next: "Results", lede: "Rune reads them", tag: "closed", controls: 2 },
];

async function noSideways(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  const inner = await page.locator("main.page").evaluate((e) => e.scrollWidth - e.clientWidth);
  expect(inner).toBeLessThanOrEqual(1);
}

for (const vp of VIEWPORTS) {
  test.describe(`${vp.width} by ${vp.height}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    for (const s of STATES) {
      test(`${s.state}: the head, its border, the one next action "${s.next}", names and no hash, the fold closed`, async ({ page }) => {
        await page.goto(`/campaign.html?state=${s.state}`);
        await expect(page.locator("h1")).toHaveText("postcontrast-anchored-r1");
        await expect(page.locator(".lede")).toContainText(s.lede);
        await expect(page.locator(".lede .tag")).toHaveText(s.tag);
        // one primary act, the rest small; every control counted
        const head = page.locator(".campaign-head");
        await expect(head.locator(".button.next")).toHaveText(s.next);
        await expect(head.locator(".button")).toHaveCount(s.controls);
        await expect(head.locator(".button:not(.next)").first()).toHaveClass(/small/u);
        // the state is the head's border: 3 px, the brand's while open, quiet once closed
        expect(await head.evaluate((e) => getComputedStyle(e).borderLeftWidth)).toBe("3px");
        await expect(page.locator("section.campaign")).toHaveClass(s.state === "closed" ? /tone-neutral/u : /tone-brand/u);
        // the facts under one closed fold
        const details = page.locator(".campaign-details");
        expect(await details.evaluate((d) => (d as HTMLDetailsElement).open)).toBe(false);
        await expect(details.locator("summary")).toHaveText("Details");
        // nobody is a hash: not in the text, and on hover only its first eight characters
        const words = await page.locator("main.page").innerText();
        expect(words).not.toMatch(/[0-9a-f]{16,}/u);
        const titles = await page.locator("[title]").evaluateAll((es) => es.map((e) => e.getAttribute("title") ?? ""));
        for (const t of titles) expect(t).not.toMatch(/[0-9a-f]{16,}/u);
        // each row is the scan, its state the row's colour, its answers value words, never null or the engine's key
        const rows = page.locator(".campaign-items tbody tr");
        await expect(rows).toHaveCount(6);
        await expect(rows.first().locator(".item-name")).toHaveText("t1_mprage_sag_p2");
        await expect(rows.first().locator(".item-name")).toHaveAttribute("title", "stack 5001");
        expect(await rows.first().locator("td").first().evaluate((e) => getComputedStyle(e).borderLeftWidth)).toBe("3px");
        expect(words).not.toContain("anchored:");
        expect(words).not.toContain("like_post");
        expect(words).not.toContain("null");
        if (s.state !== "open") {
          await expect(page.locator(".campaign-items")).toContainText("Rune like the pre");
          await expect(page.locator(".rater-stats")).toContainText("Rune");
        }
        if (s.state === "settle") await expect(page.locator(".campaign-items")).toContainText("a rater like the post");
        await noSideways(page, vp.width);
        await page.screenshot({ path: `test-results/campaign-${s.state}-${vp.name}.png`, fullPage: true });
      });
    }

    test("the fold opens on the facts in the words of before, with the pace's caveat", async ({ page }) => {
      await page.goto("/campaign.html?state=settle");
      const details = page.locator(".campaign-details");
      await details.locator("summary").click();
      await expect(details.locator("dt")).toHaveText(["source", "raters", "adjudicators", "adjudicated", "closes into", "lease", "made"]);
      await expect(details).toContainText("nothing: the answers are the labels");
      await expect(details.locator(".pace-caveat")).toContainText("a claim open over 5 min is a break, not reading");
      await expect(details.locator("dd").nth(1)).toHaveText("Rune, a rater");
      await expect(details.locator("dd").nth(6)).toContainText("Astrid · ");
      await noSideways(page, vp.width);
      await page.screenshot({ path: `test-results/campaign-details-${vp.name}.png`, fullPage: true });
    });

    test("the next action opens the reader", async ({ page }) => {
      await page.goto("/campaign.html?state=open");
      await expect(page.locator(".campaign-head .button.next")).toHaveAttribute("href", "#review/campaigns/3/anchored");
    });

    test("Results opens the results view; the border's colour changes with the state", async ({ page, context }) => {
      const colour = (p: Page) => p.locator(".campaign-head").evaluate((e) => getComputedStyle(e).borderLeftColor);
      const other = await context.newPage();
      await other.goto("/campaign.html?state=open");
      const open = await colour(other);
      await other.close();
      await page.goto("/campaign.html?state=closed");
      expect(await colour(page)).not.toBe(open);
      await page.locator(".campaign-head .button.next").click();
      await expect(page.locator('[role=tab][aria-selected="true"]')).toHaveText("Results");
      await expect(page.locator(".campaign-head .button.next")).toHaveCount(0);
    });

    test("a campaign made to show the pictures alone names no scan: each row is its place in the campaign", async ({ page }) => {
      await page.goto("/campaign.html?state=open&blind=1");
      await expect(page.locator(".campaign-items tbody tr").first().locator(".item-name")).toHaveText("scan 1 of the campaign");
      await expect(page.locator("main.page")).not.toContainText("t1_mprage");
    });
  });
}
