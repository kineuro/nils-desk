// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// A cohort's main scans, visit by visit (Wave 7a, record 55 H3): the picks
// door read into one row a subject and one cell a session per role, each
// picked, doubted or missing, a person's pick marked by its border, the
// role chosen as a key, and the subjects paged.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { capsFor } from "../campaigns/caps.fixture";
import { HeatMap } from "./HeatMap";
import { cellWords, heatOf, mayHeat, totalsWords } from "./picksHeat";

const session = (n: number, t1: string, by: string | null = "rules") => ({ session: 300 + n, studies: [400 + n], label: `ses-${n}`, number: n, roles: { t1w: { state: t1, stack: t1 === "missing" ? null : 900 + n, by: t1 === "missing" ? null : by }, flair: { state: "missing", stack: null, by: null } } });
const ANSWER = {
  cohort: { name: "north", id: 3 },
  detail: "quasi",
  roles: ["t1w", "flair"],
  totals: { t1w: { picked: 40, doubted: 2, missing: 5 }, flair: { picked: 30, doubted: 0, missing: 17 } },
  total: 30,
  count: 2,
  subjects: [
    { id: 1, code: "a1b2c3", sessions: [session(1, "picked"), session(2, "doubted"), session(3, "picked", "person")] },
    { id: 2, code: "d4e5f6", sessions: [session(1, "missing")] },
  ],
  next: 2,
};

describe("the picks door read", () => {
  it("into rows, sessions and cells, whatever it left out", () => {
    const h = heatOf(ANSWER);
    expect(h.roles).toEqual(["t1w", "flair"]);
    expect(h.subjects[0].sessions.map((s) => s.roles.t1w.state)).toEqual(["picked", "doubted", "picked"]);
    expect(h.subjects[0].sessions[2].roles.t1w.by).toBe("person");
    expect(heatOf({ subjects: [{ id: 9, sessions: [{ roles: { t1w: { state: "odd" } } }] }] }).subjects[0]).toEqual({ id: 9, code: "Subject 9", sessions: [{ session: null, studies: [], label: "visit 1", number: 1, roles: { t1w: { state: "missing", stack: null, by: null } } }] });
    expect(totalsWords(h.totals.t1w)).toBe("40 picked · 2 doubted · 5 missing");
    expect(totalsWords(h.totals.flair)).toBe("30 picked · 17 missing");
    expect(cellWords(h.subjects[0].sessions[2], "t1w")).toBe("ses-3: picked, scan 903, a person's pick");
    expect(cellWords(h.subjects[1].sessions[0], "t1w")).toBe("ses-1: no t1w");
  });

  it("is offered with review:see and the door", () => {
    expect(mayHeat(capsFor({ doors: ["GET /api/cohorts/{name}/picks"] }))).toBe(true);
    expect(mayHeat(capsFor({ doors: [] }))).toBe(false);
    expect(mayHeat(capsFor({ doors: ["GET /api/cohorts/{name}/picks"], grants: ["data:see"] }))).toBe(false);
  });
});

describe("the heatmap drawn", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.append(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  it("a cell a session, the role a key, a person's pick by its border, and the next subjects on a press", async () => {
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      asked.push(url);
      const body = url.includes("after=2") ? { ...ANSWER, subjects: [{ id: 3, code: "g7h8i9", sessions: [session(1, "picked")] }], next: null } : ANSWER;
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    });
    root = createRoot(host);
    await act(async () => root.render(<HeatMap cohort="north" />));
    for (let i = 0; i < 20 && !host.querySelector(".heat-row"); i++) await act(async () => new Promise((r) => setTimeout(r, 5)));
    expect(asked[0]).toBe("/api/cohorts/north/picks?limit=24");
    expect([...host.querySelectorAll(".heat-row")].map((r) => [...r.querySelectorAll(".heat-cell")].map((c) => c.className))).toEqual([
      ["heat-cell picked", "heat-cell doubted", "heat-cell picked by-person"],
      ["heat-cell missing"],
    ]);
    expect(host.querySelector(".heat-totals")?.textContent).toBe("40 picked · 2 doubted · 5 missing sessions");
    expect(host.querySelector('[aria-pressed="true"]')?.textContent).toBe("T1w");
    expect(host.querySelector(".heat-cell")?.getAttribute("href")).toBe("#review/picks?cohort=north");
    // the next role: its own cells and totals
    await act(async () => (host.querySelectorAll<HTMLButtonElement>('[role="group"] button')[1]).click());
    expect(host.querySelector(".heat-totals")?.textContent).toBe("30 picked · 17 missing sessions");
    expect([...host.querySelectorAll(".heat-row")][0].querySelectorAll(".heat-cell.missing").length).toBe(3);
    // the next subjects
    const more = [...host.querySelectorAll("button")].find((b) => b.textContent === "More subjects")!;
    await act(async () => more.click());
    for (let i = 0; i < 20 && host.querySelectorAll(".heat-row").length < 3; i++) await act(async () => new Promise((r) => setTimeout(r, 5)));
    expect(asked[1]).toBe("/api/cohorts/north/picks?limit=24&after=2");
    expect(host.querySelectorAll(".heat-row")).toHaveLength(3);
    expect([...host.querySelectorAll("button")].some((b) => b.textContent === "More subjects")).toBe(false);
  });
});
