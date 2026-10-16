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
import { byIdentifier, loadedWords, reportWords } from "./clinical";

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
