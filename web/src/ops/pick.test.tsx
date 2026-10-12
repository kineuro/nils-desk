// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// The run form's Over (2026-10-12): the saved selections found as a person
// types, by name and words ("t1 3d" finds t1-3d-stacks, "siemens" finds
// 3d-t1-siemens), each with its newest version, size, maker and day; arrows,
// Enter and Escape; the newest version taken and an older one a step away on
// the chip; exact text taken as typed; past the pages read, the engine's own
// filter asked for the word typed. Record 55 (2026-10-12): beside them, each
// dataset (never a root) and open cohort, whose main scans of a role a run
// goes straight over, the role taken from a word typed and changed on the
// chip; main:ROLE@dataset:NAME taken as typed. Against a fake engine.

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SelectionRow } from "../query/selections";
import { capsWith } from "../review/caps.fixture";
import type { Over } from "./catalog";
import { OverPicker } from "./OverPicker";
import type { Grant } from "../grants";
import { askWord, findOver, findScopes, optionOf, roleOfWord, specOf, type ScopeOption } from "./pick";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const row = (name: string, versions: number, over: Partial<SelectionRow> = {}): SelectionRow => ({
  id: name.length,
  name,
  spec: `selection:${name}@${versions}`,
  description: null,
  versions,
  grain: "stack",
  owner: "astrid",
  created_at: "2026-10-01T09:00:00Z",
  updated_at: "2026-10-01T09:00:00Z",
  updated_by: "astrid",
  note: null,
  cohort: null,
  size: { rows: 120, grain: "stack", version: versions, handle: 7, at: "2026-10-01T09:00:00Z", truncated: false },
  ...over,
});

const ROWS = [
  row("t1-3d-stacks", 1, { updated_at: "2026-10-11T08:00:00Z", size: { rows: 1204, grain: "stack", version: 1, handle: 9, at: "2026-10-11T08:00:00Z", truncated: false } }),
  row("3d-t1-siemens", 2, { owner: "nils", updated_at: "2026-10-09T08:00:00Z" }),
  row("ms-followup-source", 3, { cohort: "ms-followup", description: "The source ask of the follow-up cohort", updated_at: "2026-09-30T08:00:00Z", size: null }),
  row("flair-2d-ge", 1, { updated_at: "2026-10-10T08:00:00Z" }),
];
const OPTIONS = ROWS.map(optionOf);
const names = (typed: string) => findOver(OPTIONS, typed).found.map((f) => f.option.name);

describe("finding a selection by name and words", () => {
  it("finds t1-3d-stacks by \"t1 3d\", the name in the order typed first", () => {
    expect(names("t1 3d")).toEqual(["t1-3d-stacks", "3d-t1-siemens"]);
    expect(names("t1-3d")).toEqual(["t1-3d-stacks", "3d-t1-siemens"]);
  });
  it("finds 3d-t1-siemens by \"siemens\", by part of a word, and by its letters in order where a letter is missed", () => {
    expect(names("siemens")).toEqual(["3d-t1-siemens"]);
    expect(names("siem")).toEqual(["3d-t1-siemens"]);
    expect(names("siemns")).toEqual(["3d-t1-siemens"]);
    expect(names("SIEMENS T1")).toEqual(["3d-t1-siemens"]);
  });
  it("finds a selection by its cohort, its maker and its description, after any found by name", () => {
    expect(names("followup")).toEqual(["ms-followup-source"]);
    expect(names("cohort")).toEqual(["ms-followup-source"]);
    expect(names("nils")).toEqual(["3d-t1-siemens"]);
  });
  it("leaves out an option a word does not find, and lists the most recently saved first with nothing typed", () => {
    expect(names("t1 flair")).toEqual([]);
    expect(names("")).toEqual(["t1-3d-stacks", "flair-2d-ge", "3d-t1-siemens", "ms-followup-source"]);
    expect(findOver(OPTIONS, "", 2)).toMatchObject({ more: 2 });
  });
  it("takes the newest version, or the one typed after @ where it stands", () => {
    expect(findOver(OPTIONS, "siemens").found[0].version).toBe(2);
    expect(findOver(OPTIONS, "3d-t1-siemens@1").found[0]).toMatchObject({ version: 1 });
    expect(findOver(OPTIONS, "3d-t1-siemens@9").found[0]).toMatchObject({ version: 2 });
    expect(findOver(OPTIONS, "selection:t1-3d-stacks@1").found[0].option.name).toBe("t1-3d-stacks");
  });
  it("reads exact text as a person types it, and the word to ask the engine for", () => {
    expect(specOf("selection:x@2")).toEqual({ selection: "x", version: 2 });
    expect(specOf(" x@2 ")).toEqual({ selection: "x", version: 2 });
    expect(specOf("t1-3d-stacks")).toEqual({ selection: "t1-3d-stacks", version: null });
    expect(specOf("handle:7")).toEqual({ handle: 7 });
    expect(specOf("t1 3d")).toBeNull();
    expect(askWord("selection:t1 siemens@2")).toBe("siemens");
  });
});

const SCOPES: ScopeOption[] = [
  { kind: "dataset", name: "study-anon", scans: 1204, subjects: 48 },
  { kind: "dataset", name: "ms-2026", scans: 310, subjects: 12 },
  { kind: "cohort", name: "ms-followup", scans: 2210, subjects: 41 },
];
const ROLES = ["t1w", "flair", "t2w"];
const scoped = (typed: string) => findScopes(SCOPES, typed, ROLES).found.map((f) => `${f.option.name} ${f.role}`);

describe("finding a dataset's or a cohort's main scans", () => {
  it("finds a dataset or a cohort by its name, the role from a word typed, else the pack's first", () => {
    expect(scoped("study")).toEqual(["study-anon t1w"]);
    expect(scoped("anon flair")).toEqual(["study-anon flair"]);
    expect(scoped("FLAIR anon")).toEqual(["study-anon flair"]);
    // a tie goes to the dataset, then the name
    expect(scoped("ms t2")).toEqual(["ms-2026 t2w", "ms-followup t2w"]);
    expect(scoped("cohort")).toEqual(["ms-followup t1w"]);
    expect(scoped("siemens")).toEqual([]);
  });
  it("lists every one with nothing typed, or only a role, the datasets first", () => {
    expect(scoped("")).toEqual(["ms-2026 t1w", "study-anon t1w", "ms-followup t1w"]);
    expect(scoped("t2")).toEqual(["ms-2026 t2w", "study-anon t2w", "ms-followup t2w"]);
    expect(findScopes(SCOPES, "", ROLES, 2)).toMatchObject({ more: 1 });
    expect(findScopes(SCOPES, "study", [])).toEqual({ found: [], more: 0 });
  });
  it("reads a role from the word a person types for it", () => {
    expect(roleOfWord("T1", ROLES)).toBe("t1w");
    expect(roleOfWord("t1w", ROLES)).toBe("t1w");
    expect(roleOfWord("Flair", ROLES)).toBe("flair");
    expect(roleOfWord("t2", ROLES)).toBe("t2w");
    expect(roleOfWord("dwi", ROLES)).toBeNull();
  });
  it("takes main:ROLE@dataset:NAME as typed, and finds nothing else for it", () => {
    expect(specOf("main:t1w@dataset:study-anon")).toEqual({ main: { role: "t1w", kind: "dataset", name: "study-anon" } });
    expect(specOf(" main:FLAIR@Cohort:ms followup ")).toEqual({ main: { role: "flair", kind: "cohort", name: "ms followup" } });
    expect(specOf("main:t1w@study-anon")).toBeNull();
    expect(specOf("main:t1w")).toBeNull();
    expect(findScopes(SCOPES, "main:t1w@dataset:study-anon", ROLES).found).toEqual([]);
  });
});

/** A fake engine: the list of selections (paged where `paged`), one selection by name, the datasets and the cohorts, and what was asked. */
let asked: string[] = [];
let paged = false;
let root: Root;
let el: HTMLDivElement;
let chosen: (Over | null)[] = [];

beforeEach(() => {
  asked = [];
  paged = false;
  chosen = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://desk.test");
    asked.push(`${url.pathname}${url.search}`);
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
    if (url.pathname === "/api/ask/selections") {
      const q = url.searchParams.get("q");
      if (q) return json(200, { count: 1, total: 900, matching: 1, selections: q === "dwi" ? [row("dwi-b1000-ge", 4)] : [], next: null });
      return json(200, { count: ROWS.length, total: paged ? 900 : ROWS.length, matching: ROWS.length, selections: ROWS, next: paged ? "zz" : null });
    }
    if (url.pathname === "/api/ask/selections/kept-aside%402") return json(200, { name: "kept-aside", version: 2 });
    if (url.pathname === "/api/sources")
      return json(200, {
        count: 2,
        window_days: 0,
        sources: [
          { id: 3, name: "study-anon", kind: "dataset", totals: { subjects: 48, studies: 60, sessions: 60, stacks: 1204, refused_files: 0, to_sort: 0 } },
          { id: 2, name: "archive", kind: "root", totals: { subjects: 0, studies: 0, sessions: 0, stacks: 0, refused_files: 0, to_sort: 0 } },
        ],
      });
    if (url.pathname === "/api/cohorts")
      return json(200, [
        { name: "ms-followup", subjects: 41, stacks: 2210, retired_at: null },
        { name: "pilot-2024", subjects: 9, stacks: 300, retired_at: "2026-01-02T10:00:00Z" },
      ]);
    return json(404, { error: "no selection kept-asid" });
  }) as typeof fetch;
  el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
});

afterEach(() => {
  act(() => root.unmount());
  el.remove();
});

function Form({ doors = ["GET /api/ask/selections", "GET /api/ask/selections/{name}"], grants = ["pipelines:see", "pipelines:work", "query:see"] }: { doors?: string[]; grants?: Grant[] }) {
  const [over, setOver] = useState<Over | null>(null);
  return (
    <OverPicker
      caps={capsWith(doors, grants)}
      over={over}
      onOver={(o) => {
        chosen.push(o);
        setOver(o);
      }}
    />
  );
}

const settle = async (ms = 0) => {
  for (let i = 0; i < 4; i++) await act(async () => new Promise((r) => setTimeout(r, ms)));
};
const field = () => el.querySelector<HTMLInputElement>('input[role="combobox"]')!;
async function type(text: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    set.call(field(), text);
    field().dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const key = async (k: string) => {
  const e = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true });
  await act(async () => field().dispatchEvent(e));
  await settle();
  return e;
};
const lit = () => el.querySelector('[role="option"][aria-selected="true"] .over-name')?.textContent ?? null;

describe("the Over field, by keyboard", () => {
  it("lists the recent selections on focus, finds as a person types, moves with the arrows and takes with Enter", async () => {
    await act(async () => root.render(<Form />));
    await settle();
    await act(async () => field().focus());
    expect(field().getAttribute("aria-expanded")).toBe("true");
    expect([...el.querySelectorAll(".over-opt .over-name")].map((e) => e.textContent)).toEqual(["t1-3d-stacks", "flair-2d-ge", "3d-t1-siemens", "ms-followup-source"]);
    // each entry: its name, newest version, size, maker and day
    expect(el.querySelector(".over-opt")?.textContent).toBe("t1-3d-stacksv11,204 stacks · by astrid · 1 Oct");
    await type("t1 3d");
    expect(lit()).toBe("t1-3d-stacks");
    await key("ArrowDown");
    expect(lit()).toBe("3d-t1-siemens");
    expect(field().getAttribute("aria-activedescendant")).toBe(el.querySelector('[role="option"][aria-selected="true"]')?.id);
    await key("ArrowDown");
    expect(lit()).toBe("3d-t1-siemens");
    await key("ArrowUp");
    await key("ArrowDown");
    await key("Enter");
    expect(chosen).toEqual([{ selection: "3d-t1-siemens", version: 2 }]);
    // the choice is a chip, the newest version taken and the older one a step away
    expect(el.querySelector(".over-chip")?.textContent).toBe("3d-t1-siemens");
    const version = el.querySelector<HTMLSelectElement>('select[aria-label="The version"]')!;
    expect([...version.options].map((o) => o.textContent)).toEqual(["v2, newest", "v1"]);
    await act(async () => {
      version.value = "1";
      version.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(chosen.at(-1)).toEqual({ selection: "3d-t1-siemens", version: 1 });
    expect(el.querySelector(".over-pick > .meta")?.textContent).toContain("selection:3d-t1-siemens@1, frozen when the run starts");
    // and another is chosen from the chip
    await act(async () => el.querySelector<HTMLButtonElement>('button[aria-label="Choose another"]')!.click());
    await settle();
    expect(chosen.at(-1)).toBeNull();
    expect(field()).not.toBeNull();
  });
  it("closes the list on Escape and keeps the key from the dialog around it", async () => {
    let outside = 0;
    const count = () => outside++;
    document.addEventListener("keydown", count);
    await act(async () => root.render(<Form />));
    await settle();
    await act(async () => field().focus());
    await type("siemens");
    const e = await key("Escape");
    expect(e.defaultPrevented).toBe(true);
    expect(outside).toBe(0);
    expect(field().getAttribute("aria-expanded")).toBe("false");
    expect(el.querySelector('[role="listbox"]')).toBeNull();
    // closed, Escape is the dialog's again
    expect((await key("Escape")).defaultPrevented).toBe(false);
    expect(outside).toBe(1);
    document.removeEventListener("keydown", count);
    // and the arrow opens the list again
    await key("ArrowDown");
    expect(field().getAttribute("aria-expanded")).toBe("true");
  });
  it("takes exact text as typed, the engine checking a selection the list does not hold", async () => {
    await act(async () => root.render(<Form />));
    await settle();
    await act(async () => field().focus());
    await type("selection:kept-aside@2");
    expect(lit()).toBe("selection:kept-aside@2");
    await key("Enter");
    await settle();
    expect(asked).toContain("/api/ask/selections/kept-aside%402");
    expect(chosen).toEqual([{ selection: "kept-aside", version: 2 }]);
  });
  it("says why exact text is not a selection, and takes a handle as typed", async () => {
    await act(async () => root.render(<Form />));
    await settle();
    await act(async () => field().focus());
    await type("kept-asid");
    await key("Enter");
    await settle();
    expect(el.querySelector(".over-pick .warn")?.textContent).toBe("no selection kept-asid");
    expect(chosen).toEqual([]);
    await type("handle:7");
    await key("Enter");
    expect(chosen).toEqual([{ handle: 7 }]);
    expect(el.querySelector(".over-chip")?.textContent).toBe("handle 7");
  });
  it("takes a name typed whole where the list is not served to the person", async () => {
    await act(async () => root.render(<Form doors={["GET /api/ask/selections/{name}"]} />));
    await settle();
    expect(asked).toEqual([]);
    await act(async () => field().focus());
    await type("kept-aside@2");
    await key("Enter");
    await settle();
    expect(chosen).toEqual([{ selection: "kept-aside", version: 2 }]);
  });
  it("asks the engine's own filter for the word typed where the pages read are not every selection", async () => {
    paged = true;
    await act(async () => root.render(<Form />));
    await settle();
    expect(asked.filter((a) => a.startsWith("/api/ask/selections?")).length).toBe(5);
    await act(async () => field().focus());
    await type("dwi");
    await settle(100);
    await settle(100);
    expect(asked).toContain("/api/ask/selections?limit=50&q=dwi");
    expect(lit()).toBe("dwi-b1000-ge");
    await key("Enter");
    expect(chosen).toEqual([{ selection: "dwi-b1000-ge", version: 4 }]);
  });
});

describe("the Over field, over a dataset's or a cohort's main scans", () => {
  const SCOPED = ["GET /api/ask/selections", "GET /api/ask/selections/{name}", "GET /api/sources", "GET /api/cohorts"];
  const SEES: Grant[] = ["pipelines:see", "pipelines:work", "query:see", "data:see"];
  const names = () => [...el.querySelectorAll(".over-opt")].map((e) => `${e.querySelector(".over-name")?.textContent} ${e.querySelector(".over-v")?.textContent}`);

  it("lists each dataset and open cohort after the selections, never a root or a retired cohort", async () => {
    await act(async () => root.render(<Form doors={SCOPED} grants={SEES} />));
    await settle();
    expect(asked).toContain("/api/sources?recent=0");
    expect(asked).toContain("/api/cohorts");
    await act(async () => field().focus());
    expect(names()).toEqual(["t1-3d-stacks v1", "flair-2d-ge v1", "3d-t1-siemens v2", "ms-followup-source v3", "study-anon main T1w", "ms-followup main T1w"]);
    const scope = el.querySelectorAll(".over-opt.over-scope");
    expect(scope[0].textContent).toBe("study-anonmain T1wdataset1,204 scans · 48 subjects, one main scan a visit");
    expect(scope[1].querySelector(".tag")?.textContent).toBe("cohort");
  });
  it("takes a dataset's main scans of the role a word names, and the role changes on the chip", async () => {
    await act(async () => root.render(<Form doors={SCOPED} grants={SEES} />));
    await settle();
    await act(async () => field().focus());
    await type("anon flair");
    expect(lit()).toBe("study-anon");
    expect(el.querySelector('[role="option"][aria-selected="true"] .over-v')?.textContent).toBe("main FLAIR");
    await key("Enter");
    expect(chosen).toEqual([{ main: { kind: "dataset", name: "study-anon", role: "flair" } }]);
    expect(el.querySelector(".over-chip")?.textContent).toBe("study-anon");
    expect(el.querySelector(".over-chosen .tag")?.textContent).toBe("dataset");
    const role = el.querySelector<HTMLSelectElement>('select[aria-label="The role"]')!;
    expect([...role.options].map((o) => o.textContent)).toEqual(["main T1w", "main FLAIR", "main T2w"]);
    expect(role.value).toBe("flair");
    await act(async () => {
      role.value = "t2w";
      role.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(chosen.at(-1)).toEqual({ main: { kind: "dataset", name: "study-anon", role: "t2w" } });
    const meta = el.querySelector(".over-pick > .meta")?.textContent ?? "";
    expect(meta).toContain("1,204 scans · 48 subjects");
    expect(meta).toContain("main:t2w@dataset:study-anon: the dataset's main T2w scans, one a visit, resolved and frozen when the run starts");
  });
  it("takes main:ROLE@cohort:NAME as typed, where the lists are not served too", async () => {
    await act(async () => root.render(<Form />));
    await settle();
    expect(asked.filter((a) => a.startsWith("/api/sources") || a.startsWith("/api/cohorts"))).toEqual([]);
    await act(async () => field().focus());
    await type("main:FLAIR@cohort:ms-followup");
    expect(lit()).toBe("main:flair@cohort:ms-followup");
    await key("Enter");
    expect(chosen).toEqual([{ main: { kind: "cohort", name: "ms-followup", role: "flair" } }]);
    expect(el.querySelector(".over-chip")?.textContent).toBe("ms-followup");
  });
});
