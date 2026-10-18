// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// Clinical, under Data (gate T31, walkthrough step 22.8; record 55, ruling
// 35 (c)): the vocabulary loaded from the pack or a file, and clinical rows
// imported from a CSV under a mapping, previewed first and applied only from
// the preview, at the engine's doors, as `nils clinical vocabulary load` and
// `nils clinical import` do.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { button, caps7a, dialogs, engine, settle } from "../../test/safeWayIn";
import { ClinicalPage } from "./ClinicalPage";
import { byIdentifier, importFailure, importReportOf, loadedWords, refusalWords, reportWords } from "./clinical";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  dialogs();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const DOORS = ["GET /api/clinical/vocabulary", "POST /api/clinical/vocabulary", "POST /api/clinical/import"];
const EMPTY = { diseases: [], observation_types: [] };
const HELD = { diseases: [{ id: 1, name: "MS", code: "G35", description: null, types: [] }], observation_types: [{ id: 1, name: "EDSS", category: "scale", value_type: "numeric", unit: null, primary: true, sensitive: false }] };
const LOADED = { diseases: { added: 8, updated: 0 }, disease_types: { added: 3, updated: 0 }, observation_types: { added: 16, updated: 0 }, from: "the pack's clinical/vocabulary.yml", changed: 27 };
const REPORT = (applied: boolean) => ({ target: "event", applied, rows: 2, added: 1, skipped: 0, updated: 0, superseded: 0, reviewed: 0, refused: { "a subject the registry does not know": 1 }, changes: 1, samples: [] });
const MAPPING = "import:\n  target: event\n  subject: {column: code}\n";

async function pick(input: HTMLInputElement, name: string, text: string) {
  const file = new File([text], name);
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle();
}

describe("the words", () => {
  it("say a load, an import and its preview", () => {
    expect(loadedWords(LOADED)).toBe("Loaded the pack's clinical/vocabulary.yml: 8 diseases added; 3 disease types added; 16 kinds of observation added.");
    expect(loadedWords({ ...LOADED, changed: 0 })).toBe("Loaded the pack's clinical/vocabulary.yml: nothing changed.");
    expect(reportWords(REPORT(false))).toBe("2 rows as event would give: 1 added, 0 already there, 1 refused.");
    expect(reportWords(REPORT(true))).toBe("Imported 2 rows as event: 1 added, 0 already there, 1 refused.");
    expect(byIdentifier(MAPPING)).toBe(false);
    expect(byIdentifier("import:\n  subject: {column: mrn, by: identifier, id_type: mrn}\n")).toBe(true);
    expect(byIdentifier("import:\n  subject:\n    column: mrn\n    by: identifier\n")).toBe(true);
  });
});

describe("a refusal's words (Wave 7b, section 18)", () => {
  it("keeps what the reason is about and drops the cell or the name the engine put in it", () => {
    // the engine words a refusal with the cell that did not read, and the name a row gave that it did not find
    expect(refusalWords("birth: 199913241234 is not a day of the calendar")).toBe("birth: a cell is not a day of the calendar");
    expect(refusalWords("value: 7.5x is not a number")).toBe("value: a cell is not a number");
    expect(refusalWords("visit: a: b is not an integer")).toBe("visit: a cell is not an integer");
    expect(refusalWords("seen: maybe is not a yes or a no")).toBe("seen: a cell is not a yes or a no");
    expect(refusalWords("at: 25:99 is not a time of day")).toBe("at: a cell is not a time of day");
    expect(refusalWords("date: 15.01.2022 does not read as %Y-%m-%d")).toBe("date: a cell does not read as %Y-%m-%d");
    expect(refusalWords("no observation kind named Zephyr; load the vocabulary first")).toBe("a kind of observation the vocabulary does not have; load the vocabulary first");
    expect(refusalWords("no cohort named Zephyr clinic")).toBe("a cohort the registry does not have");
    expect(refusalWords("no disease named Quill")).toBe("a disease the registry does not have");
    expect(refusalWords("no type Oakmere of Quill")).toBe("a type of disease the registry does not have");
    expect(refusalWords("not a row: record 3 (line: 4, byte: 49): found record with 2 fields")).toBe("not a row");
  });

  it("leaves the engine's fixed words as they are, which name no cell", () => {
    for (const fixed of [
      "no subject",
      "a subject the registry does not know",
      "no date",
      "the row carries no demographic",
      "the kind is numeric and the value is not a number",
      "the kind carries a numeric value and the row has none",
      "the kind carries an enumerated value and the row has none",
      "birth: the format has no %Y",
      "birth: format %Y-% ends in %",
    ]) {
      expect(refusalWords(fixed), fixed).toBe(fixed);
    }
  });

  it("prints no reason it does not know, since the engine may word a new one with a cell in it", () => {
    expect(refusalWords("weight: 70413 is above the range")).toBe("another reason");
    expect(refusalWords("199001019999")).toBe("another reason");
    expect(refusalWords("")).toBe("another reason");
    // a cell of the file worded like a reason of the engine's is no reason
    expect(refusalWords("note: no subject")).toBe("another reason");
  });

  it("is kept in the report in place of the engine's: one line for a fault, the most rows first, the first rows never kept", () => {
    const report = importReportOf({
      target: "event",
      applied: false,
      rows: 40,
      added: 30,
      skipped: 2,
      refused: {
        "birth: 19991332-1234 is not a day of the calendar": 3,
        "birth: 19991333-1234 is not a day of the calendar": 4,
        "no cohort named Zephyr": 1,
        "a subject the registry does not know": 2,
        "weight: 70413 is above the range": 1,
        "weight: 70414 is above the range": "many",
      },
      samples: [{ row: 5, subject: "3e1b77c0a9d2f400", verdict: "refused", detail: "birth: 19991332-1234 is not a day of the calendar" }],
    });
    expect(report.refused).toEqual({ "birth: a cell is not a day of the calendar": 7, "a subject the registry does not know": 2, "a cohort the registry does not have": 1, "another reason": 1 });
    expect(Object.keys(report.refused)).toEqual(["birth: a cell is not a day of the calendar", "a subject the registry does not know", "a cohort the registry does not have", "another reason"]);
    expect(report).not.toHaveProperty("samples");
    expect(JSON.stringify(report)).not.toMatch(/1999133|Zephyr|70413|3e1b77c0a9d2f400/u);
    // what the engine left out is nothing, not undefined; the changes it did not count are its own sum
    expect(importReportOf({ added: 2, updated: 1, reviewed: 1 })).toEqual({ target: "", applied: false, rows: 0, added: 2, skipped: 0, updated: 1, superseded: 0, reviewed: 1, refused: {}, changes: 4 });
    expect(importReportOf(null).changes).toBe(0);
    expect(importReportOf({ changes: 0, added: 5 }).changes).toBe(0);
  });

  it("redraws the engine's list of the file's columns by names, and by places where the file has no header line", () => {
    const refusal = (list: string) => `csv: the file has no column visit; its columns are ${list}`;
    expect(importFailure(refusal("code, date, edss"), "code,date,edss\nS1,2022-01-15,2.50\n")).toBe(refusal("code, date, edss"));
    // a file whose first line is a row of values: the engine lists the row, and the desk lists the places
    const bare = "S-0001,3e1b77c0a9d2f400,2022-01-15\nS-0002,3e1b77c0a9d2f401,2022-01-16\nS-0003,3e1b77c0a9d2f402,2022-01-17\n";
    expect(importFailure(refusal("S-0001, 3e1b77c0a9d2f400, 2022-01-15"), bare)).toBe(refusal("column 1, column 2, column 3"));
    // the engine reads commas alone, so a file of semicolons is one column to it and to the list
    expect(importFailure(refusal("code;date"), "code;date\nS1;2022-01-15\n")).toBe(refusal("code;date"));
    // any other word of the engine's is spared a stray number
    expect(importFailure("csv: line 4: 199001019999 is no ID", "a\n1\n")).toBe("csv: line 4: [number hidden] is no ID");
    expect(importFailure("mapping: columns.date is a date, so it declares its format", "a\n1\n")).toBe("mapping: columns.date is a date, so it declares its format");
  });
});

describe("Clinical", () => {
  it("asks for a vocabulary first, and loads the pack's own", async () => {
    let held = false;
    const e = engine((c) => {
      if (c.url === "/api/clinical/vocabulary" && c.method === "GET") return { status: 200, body: held ? HELD : EMPTY };
      if (c.url === "/api/clinical/vocabulary" && c.method === "POST") {
        held = true;
        return { status: 200, body: LOADED };
      }
      return undefined;
    });
    act(() => root.render(<ClinicalPage caps={caps7a(DOORS)} />));
    await settle();
    expect(host.querySelector("h1")?.textContent).toBe("Clinical");
    expect(host.textContent).toContain("No vocabulary yet. Load one before importing rows.");
    expect(button(host, /Import a file/u)).toBeFalsy();
    act(() => button(host, /^Load a vocabulary$/u)!.click());
    await settle();
    act(() => button(host.querySelector("dialog[open]")!, /^Load$/u)!.click());
    await settle();
    expect(e.of("POST", "/api/clinical/vocabulary").map((c) => c.body)).toEqual([{}]);
    expect(host.textContent).toContain("16 kinds of observation added");
    expect(host.textContent).toContain("EDSS");
    expect(button(host, /Import a file/u)).toBeTruthy();
  });

  it("previews an import, then applies it from the preview", async () => {
    const e = engine((c) => {
      if (c.url === "/api/clinical/vocabulary") return { status: 200, body: HELD };
      if (c.url === "/api/clinical/import") return { status: 200, body: REPORT((c.body as { apply: boolean }).apply) };
      return undefined;
    });
    act(() => root.render(<ClinicalPage caps={caps7a(DOORS)} />));
    await settle();
    act(() => button(host, /Import a file/u)!.click());
    await settle();
    const dialog = host.querySelector("dialog[open]")!;
    expect(button(dialog, /^Preview$/u)!.disabled).toBe(true);
    await pick(dialog.querySelector('input[aria-label="Mapping"]')!, "edss.yml", MAPPING);
    await pick(dialog.querySelector('input[aria-label="Rows"]')!, "edss.csv", "code,date,edss\nS1,2022-01-15,2.5\n");
    act(() => button(dialog, /^Preview$/u)!.click());
    await settle();
    expect(dialog.textContent).toContain("2 rows as event would give: 1 added");
    expect(dialog.textContent).toContain("a subject the registry does not know");
    act(() => button(dialog, /^Import$/u)!.click());
    await settle();
    expect(e.of("POST", "/api/clinical/import").map((c) => (c.body as { apply: boolean }).apply)).toEqual([false, true]);
    expect(e.of("POST", "/api/clinical/import")[1].body).toMatchObject({ mapping: MAPPING, csv: "code,date,edss\nS1,2022-01-15,2.5\n" });
    expect(host.textContent).toContain("Imported 2 rows as event");
  });

  it("holds a mapping by ID back for a person who does not see every detail", async () => {
    const e = engine((c) => (c.url === "/api/clinical/vocabulary" ? { status: 200, body: HELD } : undefined));
    const caps = caps7a(DOORS, ["data:see", "data:work"]);
    caps.person.detail = "quasi";
    act(() => root.render(<ClinicalPage caps={caps} />));
    await settle();
    act(() => button(host, /Import a file/u)!.click());
    await settle();
    const dialog = host.querySelector("dialog[open]")!;
    await pick(dialog.querySelector('input[aria-label="Mapping"]')!, "mrn.yml", "import:\n  subject: {column: mrn, by: identifier, id_type: mrn}\n");
    await pick(dialog.querySelector('input[aria-label="Rows"]')!, "rows.csv", "mrn\n1\n");
    expect(dialog.textContent).toContain("needs every detail");
    expect(button(dialog, /^Preview$/u)!.disabled).toBe(true);
    expect(e.of("POST", "/api/clinical/import")).toHaveLength(0);
  });

  it("offers nothing to change to a person who only sees data", async () => {
    engine((c) => (c.url === "/api/clinical/vocabulary" ? { status: 200, body: HELD } : undefined));
    act(() => root.render(<ClinicalPage caps={caps7a(DOORS, ["data:see"])} />));
    await settle();
    expect(button(host, /Load a vocabulary/u)).toBeFalsy();
    expect(button(host, /Import a file/u)).toBeFalsy();
    expect(host.textContent).toContain("EDSS");
  });
});
