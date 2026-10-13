// SPDX-License-Identifier: AGPL-3.0-only
// Models under Pipelines (record 55 D4, spec sections 10.2 and 13.1), in a
// real browser in the desk's own shell (models.html): at a laptop's width and
// at a phone's, each task's models sit side by side as cards inside the
// window, the chosen one marked by its border, with nothing sideways; the side
// lists Models under Pipelines and marks it; an old #models address leads
// there; Choose moves what answers after its panel, and Back to default
// returns it; a model's own page draws the card's speeds and claims.
// SHOTS=<dir> keeps a screenshot of each.

import { expect, test, type Page } from "@playwright/test";

const SIZES = [
  { name: "1440", width: 1440, height: 900 },
  { name: "390", width: 390, height: 844 },
];

async function shot(page: Page, name: string) {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}-${test.info().project.name}.png`, fullPage: true });
}

async function noSideways(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
}

for (const vp of SIZES) {
  test(`at ${vp.name} px each task's models sit side by side inside the window, the chosen one by its border`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/models.html#pipelines/models");
    const tasks = page.locator("section.task-models");
    await expect(tasks).toHaveCount(2);
    const body = tasks.nth(0);
    await expect(body.locator("h2")).toHaveText("axis:body_part");
    await expect(body.locator(".section-head .meta")).toHaveText("bodypart-cascade@r7-fast answers · chosen by astrid@site");
    await expect(body.locator(".model-card")).toHaveCount(3);
    await expect(body.locator(".model-card.on")).toHaveCount(1);
    await expect(body.locator(".model-card.on .model-card-head a")).toHaveText("bodypart-cascade@r7-fast");
    // the chosen key is the only coloured one
    await expect(page.locator(".model-card .tag.brand")).toHaveCount(2);
    await expect(tasks.nth(1).locator(".section-head .meta")).toHaveText("bodypart-fusion-coarse@r7 answers · certificate 3");
    await expect(tasks.nth(1).locator(".model-card").filter({ hasText: "bodypart-coarse-next@r8" })).toContainText("missing trained on, tested, speed");
    for (const box of await page.locator(".model-card").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as DOMRect))) {
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(vp.width);
    }
    if (vp.width >= 1200) {
      // side by side at a laptop's width: the cards of one task share a row
      const tops = await body.locator(".model-card").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
      expect(new Set(tops).size).toBe(1);
    }
    await noSideways(page, vp.width);
    await shot(page, `models-${vp.name}`);
  });

  test(`at ${vp.name} px the side lists Models under Pipelines, and an old address leads there`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/models.html#models/model/3");
    await expect(page).toHaveURL(/#pipelines\/models\/3$/u);
    await expect(page.locator("h1")).toHaveText("bodypart-cascade@r7-fast");
    await expect(page.getByText("CPU 34.3 stacks/s on 64 cores · GPU 117.2 stacks/s on one 96 GB card")).toBeVisible();
    await expect(page.getByText("class I stated · I measured")).toBeVisible();
    await noSideways(page, vp.width);
    await shot(page, `model-${vp.name}`);
    if (vp.width >= 1200) {
      const models = page.locator(".side-pages a", { hasText: "Models" });
      await expect(models).toHaveAttribute("href", "#pipelines/models");
      await expect(models).toHaveClass(/\bon\b/u);
      await expect(page.locator(".side-link", { hasText: /^Models$/u })).toHaveCount(0);
    }
  });

  test(`at ${vp.name} px Choose moves what answers after its panel, and Back to default returns it`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/models.html#pipelines/models");
    const body = page.locator("section.task-models").nth(0);
    await body.locator(".model-card").filter({ hasText: "bodypart-fusion@r7" }).getByRole("button", { name: "Choose" }).click();
    const dialog = page.locator("dialog[open]");
    await expect(dialog).toContainText("bodypart-fusion@r7 answers axis:body_part, instead of bodypart-cascade@r7-fast.");
    await dialog.getByLabel("Why").fill("the cascade waits for its read");
    await shot(page, `choose-${vp.name}`);
    await dialog.getByRole("button", { name: "Choose" }).click();
    await expect(page.locator("p.said")).toHaveText("bodypart-fusion@r7 answers axis:body_part.");
    await expect(body.locator(".model-card.on .model-card-head a")).toHaveText("bodypart-fusion@r7");
    await body.getByRole("button", { name: "Back to default" }).click();
    await page.locator("dialog[open]").getByRole("button", { name: "Use the default" }).click();
    await expect(page.locator("p.said")).toHaveText("axis:body_part is back to the default: bodypart-fusion@r7 answers.");
    await expect(body.locator(".section-head .meta")).toHaveText("bodypart-fusion@r7 answers · promoted last");
    await expect(body.getByRole("button", { name: "Back to default" })).toHaveCount(0);
    await noSideways(page, vp.width);
  });
}
