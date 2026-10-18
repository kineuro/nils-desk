// SPDX-License-Identifier: AGPL-3.0-only
// The import dialogs in a real browser in the desk's own shell (mapdialog.html,
// Wave 7b section 18): at a laptop's width and at a phone's, a map's columns
// are each a header with its shape under it (what the values read as, how long
// they are, how many rows hold one and how many differ) and nothing of the
// file, in either dialog, in its text, its attributes, its fields or the
// console, whatever the engine's words carry. SHOTS=<dir> keeps a screenshot
// of each. Every file here is made up (test/mapFixture.ts).

import { expect, test, type Page } from "@playwright/test";
import { mapTable } from "../mapFixture";

/** `tall` is the height that shows every column of the table at once, for a screenshot of the whole of it. */
const SIZES = [
  { name: "1440", width: 1440, height: 900, tall: 1700 },
  { name: "390", width: 390, height: 844, tall: 2900 },
];

const table = mapTable();
const MAPPING = "import:\n  target: event\n  subject: {column: subject_code}\n";

async function shot(page: Page, name: string, size: string) {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}-${size}.png`, fullPage: true });
}

async function noSideways(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
}

/**
 * Which values of the file stand anywhere in the page, in what a person or a
 * screen reader can reach: its text, every attribute of every element (the
 * titles, the hints, the test ids), what each field holds and the document's
 * title. A value of four characters or more is looked for as a part of any of
 * them, a shorter one, which the page's own words could spell by chance, as a
 * whole word. The style sheet in the head is not the page's text.
 */
async function valuesOnPage(page: Page): Promise<string[]> {
  return page.evaluate((values) => {
    const parts: string[] = [document.title, document.body.innerText];
    for (const el of Array.from(document.body.querySelectorAll("*"))) {
      for (const name of el.getAttributeNames()) parts.push(name, el.getAttribute(name) ?? "");
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) parts.push(el.value);
      if (el instanceof HTMLSelectElement) for (const o of Array.from(el.options)) parts.push(o.value, o.text);
    }
    const whole = parts.join("\n");
    const words = new Set(whole.split(/[\s"'<>=,;()[\]{}]+/u));
    return values.filter((v) => (v.length >= 4 ? whole.includes(v) : words.has(v)));
  }, table.values);
}

/** What the page wrote to the console while a test ran. */
function listen(page: Page): string[] {
  const written: string[] = [];
  page.on("console", (m) => written.push(m.text()));
  page.on("pageerror", (e) => written.push(e.message));
  return written;
}

for (const vp of SIZES) {
  test(`at ${vp.name} px a map's columns are shapes and counts under their headers, and no value of the file is on the page`, async ({ page }) => {
    test.setTimeout(120_000);
    const written = listen(page);
    await page.setViewportSize(vp);
    await page.goto("/mapdialog.html#data/pseudonyms");
    await page.getByRole("button", { name: "Give a map" }).click();
    const dialog = page.locator("dialog[open]");
    await dialog.locator('input[type="file"]').setInputFiles({ name: "map.csv", mimeType: "text/csv", buffer: Buffer.from(table.csv) });
    const rows = dialog.locator("table.map-cols tbody tr");
    await expect(rows).toHaveCount(table.header.length);
    // each column: its header, then what its values read as and how long they are, then how many rows hold one and how many differ
    const shapes = await rows.evaluateAll((els) => els.map((e) => [...e.querySelectorAll("td.col-name > span")].map((s) => s.textContent)));
    expect(shapes[0]).toEqual(["personnummer", "identifier-like · 12 characters", "1,300 rows filled · 420 distinct"]);
    expect(shapes[3][1]).toBe("date · 10 characters");
    expect(shapes[4][1]).toBe("decimal · 4 characters");
    expect(shapes[7][1]).toMatch(/^mostly integer · 3 to 5 characters$/u);
    expect(shapes[8]).toEqual(["comment", "empty"]);
    // the shape is on the screen at a phone's width as well, inside the window, and the dialog scrolls nowhere sideways
    for (const box of await dialog.locator("td.col-name").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as DOMRect))) {
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(vp.width);
      expect(box.width).toBeGreaterThan(0);
    }
    expect(await dialog.locator(".dialog-body").evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
    await noSideways(page, vp.width);
    expect(await valuesOnPage(page)).toEqual([]);
    await shot(page, "map-columns", vp.name);
    // the whole table at once: a window tall enough for every column, the dialog let grow
    await page.setViewportSize({ width: vp.width, height: vp.tall });
    const grown = await page.addStyleTag({ content: ".dialog { max-height: none !important; }" });
    await shot(page, "map-columns-all", vp.name);
    expect(await valuesOnPage(page)).toEqual([]);
    await grown.evaluate((e) => e.remove());
    await page.setViewportSize({ width: vp.width, height: vp.height });
    // the columns that are no identifier are not read; then the engine's rehearsal can be asked for
    for (const name of ["scan_date", "edss", "ward", "note", "labno", "comment"]) await dialog.getByLabel(`What ${name} means`).selectOption("ignore");
    await dialog.getByRole("button", { name: "See what it will do" }).click();
    await expect(dialog.getByText("The map is read whole and applied whole")).toBeVisible();
    expect(await valuesOnPage(page)).toEqual([]);
    await noSideways(page, vp.width);
    // and nothing the page wrote to the console carried a value
    expect(table.values.filter((v) => written.join("\n").includes(v))).toEqual([]);
    await dialog.locator(".dialog-body").evaluate((e) => e.scrollTo(0, e.scrollHeight));
    await shot(page, "map-rehearsal", vp.name);
  });

  test(`at ${vp.name} px the clinical import prints the engine's refusals without the cells they name`, async ({ page }) => {
    test.setTimeout(120_000);
    const written = listen(page);
    await page.setViewportSize(vp);
    await page.goto("/mapdialog.html#data/clinical");
    await page.getByRole("button", { name: "Import a file" }).click();
    const dialog = page.locator("dialog[open]");
    await dialog.locator('input[aria-label="Mapping"]').setInputFiles({ name: "edss.yml", mimeType: "text/yaml", buffer: Buffer.from(MAPPING) });
    await dialog.locator('input[aria-label="Rows"]').setInputFiles({ name: "edss.csv", mimeType: "text/csv", buffer: Buffer.from(table.csv) });
    await dialog.getByRole("button", { name: "Preview" }).click();
    const list = dialog.getByRole("list", { name: "refused rows" });
    await expect(list).toBeVisible();
    const lines = await list.locator("li").allTextContents();
    // the same fault of one field is one line, the most rows first
    expect(lines).toEqual([
      "3 a subject the registry does not know",
      "2 a cohort the registry does not have",
      "2 labno: a cell is not an integer",
      "2 scan_date: a cell is not a day of the calendar",
      "1 edss: a cell is not a number",
    ]);
    const page_ = await page.evaluate(() => document.body.outerHTML + "\n" + document.body.innerText);
    for (const cell of ["2021-13-45", "2019-02-31", "7.5x", "12ab4", "Zephyr clinic", "3e1b77c0a9d2f400"]) expect(page_).not.toContain(cell);
    expect(await valuesOnPage(page)).toEqual([]);
    await noSideways(page, vp.width);
    await shot(page, "clinical-preview", vp.name);
    // a file with no header line: the engine lists its first row, and the desk lists names and places
    const bare = table.csv.split("\n").slice(1, 4).join("\n");
    await dialog.locator('input[aria-label="Rows"]').setInputFiles({ name: "bare.csv", mimeType: "text/csv", buffer: Buffer.from(bare) });
    await dialog.getByRole("button", { name: "Preview" }).click();
    await expect(dialog.getByText("the file has no column scan_date; its columns are column 1, column 2, column 3")).toBeVisible();
    expect(await valuesOnPage(page)).toEqual([]);
    expect(table.values.filter((v) => written.join("\n").includes(v))).toEqual([]);
    await shot(page, "clinical-refused", vp.name);
  });
}
