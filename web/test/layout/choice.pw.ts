// SPDX-License-Identifier: AGPL-3.0-only
// A checkbox or radio row (`label.choice`) keeps its box beside its words, level
// with them, in the dialogs that use one, at a laptop's width and at a phone's:
// Decide's "no value here", the Admit panel's "passed", a cohort's "Which way",
// the Places panel's guarantees and the commit panel's "commit anyway", each
// against a fake engine. A second `.choice` rule, left in the stylesheet by the
// chat's first design, laid the box above its words on every page that has one.
// SHOTS=<dir> keeps a screenshot of each.

import { expect, test, type Locator, type Page } from "@playwright/test";

const SIZES = [
  { name: "1440", width: 1440, height: 900 },
  { name: "390", width: 390, height: 844 },
];

async function shot(page: Page, name: string) {
  if (process.env.SHOTS) {
    await page.waitForTimeout(400); // a dialog fades in
    await page.screenshot({ path: `${process.env.SHOTS}/choice-${name}-${test.info().project.name}.png`, fullPage: true });
  }
}

/** These are the rows in the scope, and in each the words begin after the box and the box is level with them. */
async function besideTheirWords(scope: Locator, rows: number) {
  const seen = await scope.locator("label.choice").evaluateAll((labels) =>
    labels.map((label) => {
      const box = label.querySelector("input")!.getBoundingClientRect();
      const text = [...label.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim() !== "")!;
      const range = document.createRange();
      range.selectNodeContents(text);
      const words = range.getBoundingClientRect();
      return { words: (text.textContent ?? "").trim(), boxRight: box.right, boxMiddle: (box.top + box.bottom) / 2, wordsLeft: words.left, wordsTop: words.top, wordsBottom: words.bottom };
    }),
  );
  expect(seen).toHaveLength(rows);
  for (const r of seen) {
    expect(r.wordsLeft, `"${r.words}" begins after its box`).toBeGreaterThanOrEqual(r.boxRight - 0.5);
    expect(r.boxMiddle, `"${r.words}" is level with its box`).toBeGreaterThanOrEqual(r.wordsTop - 0.5);
    expect(r.boxMiddle, `"${r.words}" is level with its box`).toBeLessThanOrEqual(r.wordsBottom + 0.5);
  }
}

for (const vp of SIZES) {
  test(`at ${vp.name} px the review question's "no value here" sits beside its box`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/s1.html?view=routine");
    await expect(page.getByText("no value here")).toBeVisible();
    await shot(page, `decide-${vp.name}`);
    await besideTheirWords(page.locator("main.page"), 1);
  });

  test(`at ${vp.name} px the Admit panel's "passed" sits beside its box`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/models.html#pipelines/models/5");
    await page.getByRole("button", { name: "Admit" }).click();
    const dialog = page.locator("dialog[open]");
    await expect(dialog).toContainText("Name what was checked.");
    await shot(page, `admit-${vp.name}`);
    await besideTheirWords(dialog, 1);
  });

  test(`at ${vp.name} px a cohort's Which way sits each radio beside its words`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/data.html#data/datasets?cohort=ms-followup");
    await page.getByLabel("More for ms-followup").click();
    await page.getByRole("button", { name: "Add or take out by hand" }).click();
    const dialog = page.locator("dialog[open]");
    await expect(dialog).toContainText("Which way");
    await shot(page, `cohort-way-${vp.name}`);
    await besideTheirWords(dialog, 2);
  });

  test(`at ${vp.name} px the Places panel's guarantees sit each box beside its word`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/round5.html#settings/places");
    await page.getByRole("button", { name: "Add a place" }).click();
    const dialog = page.locator("dialog[open]");
    await dialog.getByLabel("Role").selectOption("working");
    await expect(dialog).toContainText("What this storage guarantees");
    await shot(page, `places-${vp.name}`);
    await besideTheirWords(dialog, 3);
  });

  test(`at ${vp.name} px the commit panel's "commit anyway" sits beside its box`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/choice.html");
    const dialog = page.locator("dialog[open]");
    await dialog.getByRole("button", { name: "Commit 8" }).click();
    await expect(dialog).toContainText("commit anyway");
    await shot(page, `commit-anyway-${vp.name}`);
    await besideTheirWords(dialog, 1);
  });
}
