// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// The yield funnel beside a saved selection (record 58 P4): a selection's
// Funnel opens a panel that asks which pipeline or family, reads the
// engine's funnel for the selection's own version, shows each row's
// subjects, sessions, stacks and what it dropped, opens a row for its years,
// bases and 2D or 3D, and ends with the error-budget line as the engine says
// it. A person without the Pipelines page's reading grant, or an engine
// without the door, sees no Funnel.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { button, caps7a, dialogs, engine, settle } from "../../test/safeWayIn";
import { GRANTS } from "../grants";
import { Selections } from "./Selections";
import { droppedWords, groupWords, mayFunnel, type Funnel } from "./funnel";

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

const words = (el: Element | null): string => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
/** A table row's cells, one word group a cell. */
const cells = (tr: Element): string => [...tr.querySelectorAll("td")].map((td) => words(td)).filter(Boolean).join(" ");

const SELECTION = {
  id: 7,
  name: "t1",
  spec: "selection:t1@2",
  description: null,
  versions: 2,
  grain: "stack",
  owner: "astrid",
  created_at: "2026-10-01T10:00:00Z",
  updated_at: "2026-10-08T10:00:00Z",
  updated_by: "astrid",
  note: null,
  cohort: null,
  size: { rows: 3, grain: "stack", version: 2, handle: 9, at: "2026-10-08T10:00:00Z", truncated: false },
};

const g = (value: string, stacks: number) => ({ value, subjects: stacks, sessions: stacks, stacks });

const FUNNEL: Funnel = {
  selection: "selection:t1@2",
  pipeline: "samseg@1",
  unit: "session",
  monotone: true,
  rows: [
    { row: 0, kind: "selection", what: "the stacks the selection starts from, before its filters", subjects: 3, sessions: 3, stacks: 6, by_year: [g("2022", 2), g("2023", 4)], by_base: [g("FLAIR", 3), g("T1w", 3)], by_dimension: [g("3D", 6)] },
    { row: 1, kind: "filter", what: "base = T1w", axes: ["base"], subjects: 3, sessions: 3, stacks: 3, removed: { subjects: 0, sessions: 0, stacks: 3 }, by_year: [g("2022", 1), g("2023", 2)], by_base: [g("T1w", 3)], by_dimension: [g("2D", 1), g("3D", 2)] },
    { row: 2, kind: "units", what: "in a session of the run", units: 3, subjects: 3, sessions: 3, stacks: 3, removed: { subjects: 0, sessions: 0, stacks: 0 }, left_out: [], by_year: [], by_base: [], by_dimension: [] },
    { row: 3, kind: "inputs", what: "with every input the pipeline takes", units: 3, subjects: 3, sessions: 3, stacks: 3, lacking: [], removed: { subjects: 0, sessions: 0, stacks: 0 }, by_year: [], by_base: [], by_dimension: [] },
    { row: 4, kind: "need", what: "the T1 is not 3D", need: "t1w: dimension == '3D'", cannot_tell: 0, units: 2, subjects: 2, sessions: 2, stacks: 2, removed: { subjects: 1, sessions: 1, stacks: 1 }, by_year: [g("2022", 1), g("2023", 1)], by_base: [g("T1w", 2)], by_dimension: [g("3D", 2)] },
  ],
  budget: {
    certificate: 2,
    certificate_words: "certificate 2 cites the graded run run-1",
    at_most: 1,
    words: "at most 1 stack misplaced by label error",
    terms: [{ row: 1, axis: "base", bound: 0.0013, bound_from: "axis", stacks: 6, product: 0.0078 }],
  },
};

const DOORS = ["GET /api/ask/selections", "GET /api/pipelines", "GET /api/funnel"];

function routes() {
  return engine((c) => {
    if (c.url.startsWith("/api/ask/selections?")) return { status: 200, body: { count: 1, total: 1, matching: 1, selections: [SELECTION], next: null } };
    if (c.url === "/api/pipelines")
      return {
        status: 200,
        body: {
          capability: null,
          pipelines: [
            { id: 1, name: "samseg", version: "1", label: "samseg@1", image: "x", layout: "bids", level: "session", state: "active", standing: "current" },
            { id: 2, name: "old", version: "1", label: "old@1", image: "x", layout: "bids", level: "session", state: "retired", standing: "retired" },
          ],
          families: [{ family: true, name: "registration", members: [] }],
        },
      };
    if (c.url.startsWith("/api/funnel?")) return { status: 200, body: FUNNEL };
    return undefined;
  });
}

const choose = (el: HTMLSelectElement, value: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });

describe("the funnel beside a selection", () => {
  it("asks which pipeline, reads the engine's funnel for the selection's version and shows its rows and line", async () => {
    const e = routes();
    act(() => root.render(<Selections caps={caps7a(DOORS)} />));
    await settle();
    const open = button(host, "Funnel");
    expect(open).not.toBeNull();
    act(() => open!.click());
    await settle();
    const select = host.querySelector<HTMLSelectElement>('select[aria-label="Pipeline"]')!;
    const offered = [...select.options].map((o) => o.value).filter(Boolean);
    // a family and the active pipelines, by name; a retired one is not offered
    expect(offered).toEqual(["registration", "samseg"]);
    choose(select, "samseg");
    await settle();
    const asked = e.calls.find((c) => c.url.startsWith("/api/funnel?"))!;
    const p = new URL(asked.url, "http://x").searchParams;
    expect(p.get("selection")).toBe("selection:t1@2");
    expect(p.get("pipeline")).toBe("samseg");
    const rows = [...host.querySelectorAll(".funnel-rows tbody tr")];
    expect(rows).toHaveLength(5);
    expect(cells(rows[0])).toBe("Start 3 3 6");
    expect(cells(rows[1])).toBe("base = T1w · reads base 3 3 3 −3");
    expect(cells(rows[2])).toBe("In a session 3 3 3");
    expect(cells(rows[3])).toBe("Has its inputs 3 3 3");
    expect(cells(rows[4])).toBe("t1w: dimension == '3D' 2 2 2 −1");
    expect(words(host.querySelector(".funnel-budget"))).toContain("at most 1 stack misplaced by label error");
    // a row opens to its years, bases and 2D or 3D
    act(() => button(host, "base = T1w")!.click());
    expect(words(host.querySelector(".funnel-by"))).toContain("Year: 2022 1 · 2023 2");
    expect(words(host.querySelector(".funnel-by"))).toContain("2D/3D: 2D 1 · 3D 2");
    // counts only: nothing of a subject is on the panel
    expect(host.textContent).not.toMatch(/sub-|\/data\//);
  });

  it("says why when the engine refuses", async () => {
    engine((c) => {
      if (c.url.startsWith("/api/ask/selections?")) return { status: 200, body: { count: 1, total: 1, matching: 1, selections: [SELECTION], next: null } };
      if (c.url === "/api/pipelines") return { status: 200, body: { capability: null, pipelines: [{ id: 1, name: "samseg", version: "1", label: "samseg@1", image: "x", layout: "bids", level: "session", state: "active" }] } };
      if (c.url.startsWith("/api/funnel?")) return { status: 400, body: { error: "the selection is a cohort set, and a funnel counts the stacks of subjects, sessions or stacks" } };
      return undefined;
    });
    act(() => root.render(<Selections caps={caps7a(DOORS)} />));
    await settle();
    act(() => button(host, "Funnel")!.click());
    await settle();
    choose(host.querySelector<HTMLSelectElement>('select[aria-label="Pipeline"]')!, "samseg");
    await settle();
    expect(words(host.querySelector(".funnel .warn"))).toContain("a funnel counts the stacks");
  });

  it("is not offered without the grant or the door", async () => {
    routes();
    expect(mayFunnel(caps7a(DOORS))).toBe(true);
    expect(mayFunnel(caps7a(DOORS.filter((d) => d !== "GET /api/funnel")))).toBe(false);
    expect(mayFunnel(caps7a(DOORS, GRANTS.filter((x) => !x.startsWith("pipelines:"))))).toBe(false);
    expect(mayFunnel(undefined)).toBe(false);
    act(() => root.render(<Selections caps={caps7a(DOORS.filter((d) => d !== "GET /api/funnel"))} />));
    await settle();
    expect(host.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(button(host, "Funnel")).toBeNull();
  });

  it("says a row in few words", () => {
    expect(droppedWords(FUNNEL.rows[0])).toBe("");
    expect(droppedWords(FUNNEL.rows[4])).toBe("−1");
    expect(groupWords([g("2022", 1200), g("unknown", 3)])).toBe("2022 1,200 · unknown 3");
  });
});
