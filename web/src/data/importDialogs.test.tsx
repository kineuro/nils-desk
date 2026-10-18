// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// The import dialogs show shapes and counts and never a value (Wave 7b,
// section 18). A made-up table (test/mapFixture.ts) is chosen in the map
// dialog and in the clinical import, and every value of it is searched for in
// everything the page holds: its text, every attribute of every element (the
// titles, the hints, the test ids), what each field holds, the document's own
// title and everything written to the console. The engine's words are made to
// carry the file's cells, as the clinical import's refusals do, and none of
// them may reach the screen. Every name and number here is made up.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mapTable, type Fact, type MapTable } from "../../test/mapFixture";
import { button, caps7a, dialogs, engine, settle } from "../../test/safeWayIn";
import { ClinicalPage } from "./ClinicalPage";
import { MapDialog, PseudonymsPage } from "./PseudonymsPage";
import type { Dataset, IdType } from "./pseudonyms";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const table: MapTable = mapTable();
const n = (v: number) => v.toLocaleString("en-US");

let host: HTMLDivElement;
let root: Root;
let written: unknown[][];
beforeEach(() => {
  dialogs();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  written = [];
  for (const method of ["log", "info", "warn", "error", "debug", "trace"] as const) vi.spyOn(console, method).mockImplementation((...args: unknown[]) => void written.push(args));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/**
 * Which of the values the page holds, anywhere a person or a screen reader can
 * reach it: text, every attribute of every element, what each field holds, the
 * document's title, and the console. A value of four characters or more is
 * searched for as a part of any of them; a shorter one, which the dialog's own
 * words and numbers could spell by chance, as a whole word of any of them.
 */
function found(values: readonly string[], logged: readonly unknown[][] = written): string[] {
  const parts: string[] = [document.title, document.body.textContent ?? "", document.body.innerText ?? ""];
  for (const el of document.body.querySelectorAll("*")) {
    for (const name of el.getAttributeNames()) parts.push(name, el.getAttribute(name) ?? "");
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) parts.push(el.value);
    if (el instanceof HTMLSelectElement) for (const o of [...el.options]) parts.push(o.value, o.text);
  }
  parts.push(JSON.stringify(logged, (_, v: unknown) => (v instanceof Error ? v.message : v)));
  const whole = parts.join("\n");
  const words = new Set(whole.split(/[\s"'<>=,;()[\]{}]+/u));
  return values.filter((v) => (v.length >= 4 ? whole.includes(v) : words.has(v)));
}

const TYPES: IdType[] = [
  { name: "personnummer", description: "the national number", identifiers: 3, subjects: 3 },
  { name: "study-id", description: "the study's own number", identifiers: 8, subjects: 8 },
];
const DOORS = ["GET /api/linkage/types", "POST /api/linkage/types", "POST /api/linkage/imports"];

/** What the dialog is to say of a column: its header, what its values read as and how long they are, then how many rows hold one and how many differ; counted by the fixture, not by the code under test. */
function shapeLines(f: Fact, rows: number): string[] {
  if (f.kind === "empty") return [f.name, "empty"];
  const length = f.shortest === f.longest ? `${f.longest} ${f.longest === 1 ? "character" : "characters"}` : `${f.shortest} to ${f.longest} characters`;
  const filled = f.filled === rows ? `${n(rows)} rows` : `${n(f.filled)} of ${n(rows)} rows`;
  return [f.name, `${f.mostly ? "mostly " : ""}${f.kind} · ${length}`, `${filled} filled · ${n(f.distinct)} distinct`];
}

/** A file chosen in the file field, read as text the way the browser reads one. */
async function choose(input: HTMLInputElement, name: string, text: string) {
  const file = new File([text], name, { type: "text/csv" });
  Object.defineProperty(file, "text", { value: () => Promise.resolve(text) });
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle();
}

async function select(el: HTMLSelectElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(el, value);
  await act(async () => {
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function type(el: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
  await act(async () => {
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const without = (csv: string) => csv.slice(csv.indexOf("\n") + 1);

describe("the search itself", () => {
  it("finds a value in text, in an attribute, in a field and in the console, so that finding none means something", async () => {
    act(() =>
      root.render(
        <div title="zq-4471-aa">
          <span data-testid="Berglund-Quox">text only Tolvan</span>
          <input defaultValue="Narwhale99" aria-label="field" />
        </div>,
      ),
    );
    console.warn("Wibblesome-77");
    expect(found(["zq-4471-aa", "Berglund-Quox", "Tolvan", "Narwhale99", "Wibblesome-77", "absent-value"])).toEqual(["zq-4471-aa", "Berglund-Quox", "Tolvan", "Narwhale99", "Wibblesome-77"]);
    // a short value is found as a word and not inside another
    act(() => root.render(<p>Q7 and ward Q9x</p>));
    expect(found(["Q7", "Q9", "Z3"])).toEqual(["Q7"]);
  });
});

describe("Give a map", () => {
  it("draws each column by its header and its shape, and not one value of the file anywhere on the page", async () => {
    const e = engine((c) => {
      if (c.method === "GET" && c.url === "/api/linkage/types") return { status: 200, body: TYPES };
      if (c.method === "POST" && c.url === "/api/linkage/imports") {
        return {
          status: 200,
          body: {
            rows: 1300,
            subjects: { named: 420, known: 380, new: 40 },
            identifiers: { filed: 1260, known: 1180, new: 80, types_new: [] },
            // an engine that quoted a cell: a personnummer of the file in its words
            conflicts: [{ row: 3, why: `${table.rows[2][0]} appeared on line 2 with another code` }],
          },
        };
      }
      return undefined;
    });
    act(() => root.render(<PseudonymsPage caps={caps7a(DOORS)} />));
    await settle();
    act(() => button(host, "Give a map")!.click());
    await choose(host.querySelector<HTMLInputElement>('dialog input[type="file"]')!, "map.csv", table.csv);
    const dialog = host.querySelector("dialog")!;
    // the file is counted, and each column is its header and its shape: what its values read as, how long they are, how many rows hold one, how many differ
    expect(dialog.textContent).toContain("1,300 rows · 9 columns");
    const drawn = [...dialog.querySelectorAll("table.map-cols tbody tr")].map((r) => [...r.querySelectorAll("td.col-name > span")].map((s) => s.textContent));
    expect(drawn).toEqual(table.facts.map((f) => shapeLines(f, 1300)));
    // no cell, no first row, no pattern made from a value: not a sample under a header, not a preview table
    expect(dialog.querySelectorAll("td.col-name > span")).toHaveLength(table.facts.reduce((all, f) => all + shapeLines(f, 1300).length, 0));
    expect(found(table.values)).toEqual([]);
    // the columns can be changed, each change reading the file's shape again and showing no more of it
    for (const name of ["scan_date", "edss", "ward", "note", "labno", "comment"]) await select(dialog.querySelector<HTMLSelectElement>(`select[aria-label="What ${name} means"]`)!, "ignore");
    expect(found(table.values)).toEqual([]);
    await select(dialog.querySelector<HTMLSelectElement>('select[aria-label="The type of study_id"]')!, "new");
    await type(dialog.querySelector<HTMLInputElement>('input[aria-label="Describe the type study-id"]')!, "the study's own number, made here");
    expect(found(table.values)).toEqual([]);
    // the rehearsal: the file goes to the engine once, with its rows, and what comes back shows no value, though the engine's words carried one
    await act(async () => {
      button(dialog, "See what it will do")!.click();
    });
    await settle();
    const posted = e.of("POST", "/api/linkage/imports");
    expect(posted).toHaveLength(1);
    expect(posted[0].body).toMatchObject({ dry_run: true, make_types: true });
    expect((posted[0].body!.columns as { header: string }[]).map((c) => c.header)).toEqual(table.header);
    expect(posted[0].body!.rows).toEqual(table.rows);
    expect(dialog.textContent).toContain("appeared on line 2 with another code");
    expect(dialog.textContent).toContain("[number hidden]");
    expect(found(table.values)).toEqual([]);
    // nothing was written to the console that carried a value
    expect(found(table.values, written)).toEqual([]);
  });

  it("names a file with no header line by its places, to the screen and to the engine, and draws none of its first row", async () => {
    const e = engine((c) => {
      if (c.method === "GET" && c.url === "/api/linkage/types") return { status: 200, body: TYPES };
      if (c.method === "POST" && c.url === "/api/linkage/imports") return { status: 200, body: { rows: 1299, subjects: { named: 1, known: 0, new: 1 }, identifiers: { filed: 1, known: 0, new: 1, types_new: 0 }, conflicts: [] } };
      return undefined;
    });
    act(() => root.render(<PseudonymsPage caps={caps7a(DOORS)} />));
    await settle();
    act(() => button(host, "Give a map")!.click());
    // the file the table makes, less its first line: the first row of values stands where the header would
    await choose(host.querySelector<HTMLInputElement>('dialog input[type="file"]')!, "bare.csv", without(table.csv));
    const dialog = host.querySelector("dialog")!;
    expect([...dialog.querySelectorAll("table.map-cols td.col-name .path")].map((s) => s.textContent)).toEqual(table.header.map((_, i) => `column ${i + 1}`));
    // what the first row was: the file's own values, which are none of them on the page
    expect(found(table.values)).toEqual([]);
    expect(found(table.rows[0].filter((v) => v !== ""))).toEqual([]);
    // no type is named after a value: the new types are the plain word
    expect([...dialog.querySelectorAll("select")].flatMap((s) => [...s.options].map((o) => o.text)).filter((t) => t.startsWith("a new type"))).toEqual(Array(8).fill("a new type: identifier"));
    for (const name of table.header.map((_, i) => `column ${i + 1}`)) await select(dialog.querySelector<HTMLSelectElement>(`select[aria-label="What ${name} means"]`)!, "ignore");
    await select(dialog.querySelector<HTMLSelectElement>('select[aria-label="What column 1 means"]')!, "identifier");
    await select(dialog.querySelector<HTMLSelectElement>('select[aria-label="The type of column 1"]')!, "type:personnummer");
    await act(async () => {
      button(dialog, "See what it will do")!.click();
    });
    await settle();
    const columns = e.of("POST", "/api/linkage/imports")[0].body!.columns as { header: string }[];
    expect(columns.map((c) => c.header)).toEqual(table.header.map((_, i) => `column ${i + 1}`));
    expect(found(table.values)).toEqual([]);
  });

  it("is the same dialog for one dataset, and draws the same shapes and no value", async () => {
    const e = engine((c) => (c.method === "POST" && c.url === "/api/linkage/imports" ? { status: 200, body: { rows: 1300, subjects: { named: 1, known: 0, new: 1 }, identifiers: { filed: 1, known: 0, new: 1, types_new: 0 }, conflicts: [] } } : undefined));
    const incoming = { name: "incoming" } as Dataset;
    act(() => root.render(<MapDialog caps={caps7a(DOORS)} dataset={incoming} types={TYPES} onClose={() => undefined} onFiled={() => undefined} />));
    await choose(host.querySelector<HTMLInputElement>('dialog input[type="file"]')!, "map.csv", table.csv);
    const dialog = host.querySelector("dialog")!;
    expect(dialog.querySelector("h2")?.textContent).toBe("Provide a map for incoming");
    expect([...dialog.querySelectorAll("table.map-cols tbody tr")].map((r) => [...r.querySelectorAll("td.col-name > span")].map((s) => s.textContent))).toEqual(table.facts.map((f) => shapeLines(f, 1300)));
    expect(found(table.values)).toEqual([]);
    expect(e.of("POST", "/api/linkage/imports")).toHaveLength(0);
  });

  it("says a file with only a header, or no column, in words, with none of it drawn", async () => {
    engine((c) => (c.url === "/api/linkage/types" ? { status: 200, body: TYPES } : undefined));
    act(() => root.render(<PseudonymsPage caps={caps7a(DOORS)} />));
    await settle();
    act(() => button(host, "Give a map")!.click());
    await choose(host.querySelector<HTMLInputElement>('dialog input[type="file"]')!, "head.csv", `${table.csv.split("\n")[0]}\n`);
    expect(host.querySelector("dialog")!.textContent).toContain("The file has a header and no rows under it.");
    expect(host.querySelector("table.map-cols")).toBeNull();
    expect(found(table.values)).toEqual([]);
  });
});

describe("Import clinical rows", () => {
  const HELD = { diseases: [{ id: 1, name: "MS", code: "G35", description: null, types: [] }], observation_types: [{ id: 1, name: "EDSS", category: "scale", value_type: "numeric", unit: null, primary: true, sensitive: false }] };
  const DOORS_CLINICAL = ["GET /api/clinical/vocabulary", "POST /api/clinical/vocabulary", "POST /api/clinical/import"];
  const MAPPING = "import:\n  target: event\n  subject: {column: subject_code}\n";
  /** The k-th value of a column of four characters or more, which the page's own words cannot spell by chance. */
  const cell = (column: number, k = 0) => table.rows.map((r) => r[column]).filter((v) => v.length >= 4)[k];
  const [PN, CODE, STUDY, DATE, , WARD, NOTE, LABNO] = [0, 1, 2, 3, 4, 5, 6, 7];
  /** The engine's refusals as it words them: each with the cell that did not read, or the name a row gave that it did not find. */
  const REFUSED: Record<string, number> = {
    // a column of personnummer aimed at a date: the engine says which cell did not read
    [`scan_date: ${cell(PN, 0)} is not a day of the calendar`]: 1,
    [`scan_date: ${cell(PN, 1)} is not a day of the calendar`]: 1,
    [`labno: ${cell(LABNO, 0)} is not an integer`]: 2,
    [`edss: ${cell(DATE, 0)} is not a number`]: 1,
    [`edss: ${cell(CODE, 0)} does not read as %Y-%m-%d`]: 1,
    [`no cohort named ${cell(NOTE, 0)}`]: 2,
    [`no disease named ${cell(STUDY, 0)}`]: 1,
    [`no type ${cell(NOTE, 1)} of ${cell(STUDY, 1)}`]: 1,
    [`no observation kind named ${cell(CODE, 1)}; load the vocabulary first`]: 1,
    [`not a row: record 5 (line: 6, byte: 120): found record with 3 fields, but the previous record has ${cell(PN, 2)}`]: 1,
    [`something new: ${cell(PN, 3)} is odd`]: 1,
    "a subject the registry does not know": 3,
    "no subject": 1,
  };
  void WARD;

  async function open(route: (c: { method: string; url: string; body: Record<string, unknown> | null }) => { status: number; body?: unknown } | undefined) {
    const e = engine((c) => (c.url === "/api/clinical/vocabulary" && c.method === "GET" ? { status: 200, body: HELD } : route(c)));
    act(() => root.render(<ClinicalPage caps={caps7a(DOORS_CLINICAL)} />));
    await settle();
    act(() => button(host, /Import a file/u)!.click());
    await settle();
    return { e, dialog: host.querySelector("dialog[open]")! };
  }

  it("draws a refused row's reason as its field and its fault, one line for a fault, and nothing of the cell or the name", async () => {
    const { e, dialog } = await open((c) =>
      c.url === "/api/clinical/import"
        ? {
            status: 200,
            body: {
              target: "event",
              applied: c.body!.apply === true,
              rows: 1300,
              added: 1180,
              skipped: 100,
              updated: 0,
              superseded: 0,
              reviewed: 0,
              refused: REFUSED,
              changes: 1180,
              // the engine's first rows: a subject code and the reason with the cell in it; the desk draws none of them
              samples: [{ row: 5, subject: cell(CODE, 2), verdict: "refused", detail: `scan_date: ${cell(PN, 4)} is not a day of the calendar` }],
            },
          }
        : undefined,
    );
    await choose(dialog.querySelector<HTMLInputElement>('input[aria-label="Mapping"]')!, "edss.yml", MAPPING);
    await choose(dialog.querySelector<HTMLInputElement>('input[aria-label="Rows"]')!, "edss.csv", table.csv);
    await act(async () => {
      button(dialog, /^Preview$/u)!.click();
    });
    await settle();
    expect(e.of("POST", "/api/clinical/import")).toHaveLength(1);
    const lines = [...dialog.querySelectorAll('ul[aria-label="refused rows"] li')].map((li) => li.textContent);
    expect(lines).toEqual([
      "3 a subject the registry does not know",
      "2 a cohort the registry does not have",
      "2 labno: a cell is not an integer",
      "2 scan_date: a cell is not a day of the calendar",
      "1 a disease the registry does not have",
      "1 a kind of observation the vocabulary does not have; load the vocabulary first",
      "1 a type of disease the registry does not have",
      "1 another reason",
      "and 4 more reasons",
    ]);
    expect(dialog.querySelector(".lede")?.textContent).toBe("1,300 rows as event would give: 1,180 added, 100 already there, 17 refused.");
    // the cells, the names and the engine's first rows are on no part of the page, and not in the console
    expect(found(table.values)).toEqual([]);
    expect(found(table.values, written)).toEqual([]);
    // applying it goes from the preview, and says the counts alone
    await act(async () => {
      button(dialog, /^Import$/u)!.click();
    });
    await settle();
    expect(e.of("POST", "/api/clinical/import").map((c) => c.body!.apply)).toEqual([false, true]);
    expect(host.textContent).toContain("Imported 1,300 rows as event: 1,180 added, 100 already there, 17 refused.");
    expect(found(table.values)).toEqual([]);
  });

  it("lists the rest as another reason where it does not know the engine's words, and counts the reasons it does not list", async () => {
    const many: Record<string, number> = {};
    for (const field of ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]) many[`${field}: ${cell(PN, 0)} is not a number`] = 1;
    many[`new words: ${cell(PN, 1)}`] = 4;
    const { dialog } = await open((c) => (c.url === "/api/clinical/import" ? { status: 200, body: { target: "event", rows: 20, added: 0, skipped: 0, refused: many, changes: 0 } } : undefined));
    await choose(dialog.querySelector<HTMLInputElement>('input[aria-label="Mapping"]')!, "edss.yml", MAPPING);
    await choose(dialog.querySelector<HTMLInputElement>('input[aria-label="Rows"]')!, "edss.csv", table.csv);
    await act(async () => {
      button(dialog, /^Preview$/u)!.click();
    });
    await settle();
    const lines = [...dialog.querySelectorAll('ul[aria-label="refused rows"] li')].map((li) => li.textContent);
    expect(lines[0]).toBe("4 another reason");
    expect(lines).toHaveLength(9);
    expect(lines[8]).toBe("and 3 more reasons");
    expect(found(table.values)).toEqual([]);
    // nothing to change: the Import button waits for something to change
    expect(button(dialog, /^Import$/u)!.disabled).toBe(true);
  });

  it("draws the engine's list of the file's columns by names and places when the mapping names a column the file lacks", async () => {
    // the engine's refusal lists the file's first line as its columns, as it read it
    const { dialog } = await open((c) => {
      if (c.url !== "/api/clinical/import") return undefined;
      const first = String(c.body!.csv).split("\n", 1)[0].split(",").map((h) => h.trim());
      return { status: 400, body: { error: `csv: the file has no column scan_date; its columns are ${first.join(", ")}` } };
    });
    await choose(dialog.querySelector<HTMLInputElement>('input[aria-label="Mapping"]')!, "edss.yml", MAPPING);
    // a file with no header line: its first row stands where the names would
    await choose(dialog.querySelector<HTMLInputElement>('input[aria-label="Rows"]')!, "bare.csv", without(table.csv));
    await act(async () => {
      button(dialog, /^Preview$/u)!.click();
    });
    await settle();
    expect(dialog.textContent).toContain(`csv: the file has no column scan_date; its columns are ${table.header.map((_, i) => `column ${i + 1}`).join(", ")}`);
    expect(found(table.values)).toEqual([]);
    expect(found(table.values, written)).toEqual([]);
    // a file with its header line: the engine's list is its names, which are as the engine had them
    await choose(dialog.querySelector<HTMLInputElement>('input[aria-label="Rows"]')!, "edss.csv", table.csv);
    await act(async () => {
      button(dialog, /^Preview$/u)!.click();
    });
    await settle();
    expect(dialog.textContent).toContain(`its columns are ${table.header.join(", ")}`);
    expect(found(table.values)).toEqual([]);
  });
});
