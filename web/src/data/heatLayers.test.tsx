// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// The cohort's heatmap with a layer (record 55, decision 6: the data map's
// layers, as on the Main scans map): the picks door asked with `layer`; a
// cell in the colour of the value of the scan picked, filled, or of what
// most of the session's scans are, outlined; the values as the legend; the
// step that answers the layer over the cohort, with its Run where it has
// not run; and the picks back on a press of Picks.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { capsWith } from "../review/caps.fixture";
import { GRANTS, type Grant } from "../grants";
import { HeatMap } from "./HeatMap";
import { heatDrawn, heatOf } from "./picksHeat";

const cell = (state: string, stack: number | null, layer?: string | null) => ({ state, stack, by: stack === null ? null : "rules", ...(layer !== undefined ? { layer } : {}) });
const STEP = { step: "body_part", state: "waiting", job: null, run: null, started_at: null, finished_at: null, progress: null, served: true, answered: 0, look: 0, of: 40, jobs: [], refusal: null };

function answer(layer: string | null) {
  const on = layer !== null;
  return {
    cohort: { name: "north", id: 3 },
    detail: "quasi",
    roles: ["t1w"],
    totals: { t1w: { picked: 2, doubted: 0, missing: 1 } },
    total: 2,
    count: 2,
    subjects: [
      {
        id: 1,
        code: "a1b2c3",
        sessions: [
          { session: 301, studies: [401], label: "ses-1", number: 1, roles: { t1w: cell("picked", 901, on ? "head" : undefined) }, ...(on ? { layer: { scans: { head: 6 }, none: 1 } } : {}) },
          { session: 302, studies: [402], label: "ses-2", number: 2, roles: { t1w: cell("picked", 902, on ? "spine" : undefined) }, ...(on ? { layer: { scans: { spine: 3, head: 1 }, none: 0 } } : {}) },
        ],
      },
      {
        id: 2,
        code: "d4e5f6",
        sessions: [
          { session: 303, studies: [403], label: "ses-1", number: 1, roles: { t1w: cell("missing", null, on ? null : undefined) }, ...(on ? { layer: { scans: { spine: 5 }, none: 0 } } : {}) },
          { session: 304, studies: [404], label: "ses-2", number: 2, roles: { t1w: cell("missing", null, on ? null : undefined) }, ...(on ? { layer: { scans: {}, none: 4 } } : {}) },
        ],
      },
    ],
    next: null,
    ...(on ? { layer: { layer, operation: "body_part", values: ["head", "spine"], step: STEP } } : {}),
  };
}

describe("the heatmap with a layer", () => {
  let host: HTMLDivElement;
  let root: Root | null = null;
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    sessionStorage.clear();
    host = document.createElement("div");
    document.body.append(host);
  });
  afterEach(() => {
    if (root) act(() => root?.unmount());
    root = null;
    host.remove();
    vi.unstubAllGlobals();
  });

  it("reads a session's scans and the value of the scan picked, and draws a cell filled, outlined or as nothing", () => {
    const h = heatOf(answer("body_region"));
    expect(h.layer).toMatchObject({ layer: "body_region", operation: "body_part", values: ["head", "spine"], step: { state: "waiting" } });
    const [s1, s2] = h.subjects[0].sessions;
    expect(s1.roles.t1w.layer).toBe("head");
    expect(heatDrawn(s1, "t1w")).toEqual({ value: "head", taken: true });
    expect(heatDrawn(s2, "t1w")).toEqual({ value: "spine", taken: true });
    expect(heatDrawn(h.subjects[1].sessions[0], "t1w")).toEqual({ value: "spine", taken: false });
    expect(heatDrawn(h.subjects[1].sessions[1], "t1w")).toBeNull();
    expect(heatOf(answer(null)).layer).toBeUndefined();
  });

  it("asks for the layer chosen, colours the cells by it, says the step has not run, and its Run asks the cohort's door", async () => {
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      asked.push(`${init?.method ?? "GET"} ${url}`);
      if (url.includes("/steps/")) return new Response(JSON.stringify({ job: 7, state: "queued", step: "body_part", for: "cohort:north", scans: 40, handle: 1, command: [] }), { status: 202 });
      const layer = new URL(url, "http://desk.test").searchParams.get("layer");
      return new Response(JSON.stringify(answer(layer)), { status: 200 });
    });
    const caps = capsWith(["GET /api/cohorts/{name}/picks", "POST /api/cohorts/{name}/steps/{step}/run", "GET /api/picks/layer-step"], [...GRANTS] as Grant[]);
    const r = createRoot(host);
    root = r;
    await act(async () => r.render(<HeatMap cohort="north" caps={caps} />));
    for (let i = 0; i < 20 && !host.querySelector(".heat-row"); i++) await act(async () => new Promise((r) => setTimeout(r, 5)));
    const keys = () => [...host.querySelectorAll('[role="group"][aria-label="Layer"] button')];
    expect(keys().map((b) => [b.textContent, b.getAttribute("aria-pressed")])).toEqual([
      ["Picks", "true"],
      ["Body region", "false"],
      ["Body part", "false"],
      ["Post-contrast", "false"],
    ]);
    await act(async () => (keys()[1] as HTMLButtonElement).click());
    for (let i = 0; i < 20 && !host.querySelector(".heat-cell.layered"); i++) await act(async () => new Promise((r) => setTimeout(r, 5)));
    expect(asked.at(-1)).toBe("GET /api/cohorts/north/picks?limit=24&layer=body_region");
    expect(keys().filter((b) => b.classList.contains("on")).map((b) => b.textContent)).toEqual(["Body region"]);
    const cells = [...host.querySelectorAll(".heat-cell.layered")].map((c) => [c.getAttribute("data-slot"), c.classList.contains("held"), c.classList.contains("none")]);
    expect(cells).toEqual([
      ["1", false, false],
      ["3", false, false],
      ["3", true, false],
      [null, false, true],
    ]);
    expect(host.querySelector(".heat-cell.layered.held")?.getAttribute("title")).toBe("ses-1: no t1w; body region spine, none picked (5 scans: spine 5)");
    expect([...host.querySelectorAll(".heat-value")].map((v) => [v.textContent, v.getAttribute("data-slot")])).toEqual([
      ["head", "1"],
      ["spine", "3"],
    ]);
    expect(host.querySelector(".heat-step")?.textContent).toContain("Body part has not run on this cohort.");
    const runButton = [...host.querySelectorAll<HTMLButtonElement>(".heat-step button")].find((b) => b.textContent === "Run")!;
    await act(async () => runButton.click());
    for (let i = 0; i < 20 && !asked.some((a) => a.includes("/steps/")); i++) await act(async () => new Promise((r) => setTimeout(r, 5)));
    expect(asked).toContain("POST /api/cohorts/north/steps/body_part/run");
    for (let i = 0; i < 20 && !host.textContent?.includes("queued"); i++) await act(async () => new Promise((r) => setTimeout(r, 5)));
    expect(host.textContent).toContain("north: body part queued.");
    // the picks again
    await act(async () => (keys()[0] as HTMLButtonElement).click());
    for (let i = 0; i < 20 && host.querySelector(".heat-cell.layered"); i++) await act(async () => new Promise((r) => setTimeout(r, 5)));
    expect(host.querySelectorAll(".heat-cell.layered")).toHaveLength(0);
    expect(host.querySelectorAll(".heat-cell.picked").length).toBeGreaterThan(0);
  });

  /** A heatmap over a fetch that answers each picks page as `answer` says, the cohort's door with `step`, and keeps what it was asked. */
  async function drawn(answer: (url: URL) => Promise<unknown> | unknown, step?: () => unknown) {
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      asked.push(`${init?.method ?? "GET"} ${url}`);
      const u = new URL(url, "http://desk.test");
      if (u.pathname === "/api/picks/layer-step") return new Response(JSON.stringify({ layer: u.searchParams.get("layer"), operation: "body_part", step: step?.() }), { status: 200 });
      return new Response(JSON.stringify(await answer(u)), { status: 200 });
    });
    const caps = capsWith(["GET /api/cohorts/{name}/picks", "POST /api/cohorts/{name}/steps/{step}/run", "GET /api/picks/layer-step"], [...GRANTS] as Grant[]);
    const r = createRoot(host);
    root = r;
    await act(async () => r.render(<HeatMap cohort="north" caps={caps} />));
    for (let i = 0; i < 20 && !host.querySelector(".heat-row"); i++) await act(async () => new Promise((res) => setTimeout(res, 5)));
    return asked;
  }

  const paged = (layer: string | null, after: string | null) => {
    const a = answer(layer);
    return after === null ? { ...a, subjects: a.subjects.slice(0, 1), next: 1 } : { ...a, subjects: a.subjects.slice(1), next: null };
  };

  it("clears the page when the layer changes, so neither the last layer's rows nor a false note show while it is read", async () => {
    let hold: (() => void) | null = null;
    await drawn((u) => {
      const layer = u.searchParams.get("layer");
      if (layer === null) return answer(null);
      return new Promise((res) => {
        hold = () => res(answer(layer));
      });
    });
    expect(host.querySelectorAll(".heat-row")).toHaveLength(2);
    const keys = [...host.querySelectorAll<HTMLButtonElement>('[role="group"][aria-label="Layer"] button')];
    await act(async () => keys[1].click());
    expect(host.querySelectorAll(".heat-row")).toHaveLength(0);
    expect(host.textContent).not.toContain("does not draw layers");
    expect(host.textContent).toContain("Reading the main scans.");
    await act(async () => hold?.());
    for (let i = 0; i < 20 && !host.querySelector(".heat-cell.layered"); i++) await act(async () => new Promise((res) => setTimeout(res, 5)));
    expect(host.querySelectorAll(".heat-row")).toHaveLength(2);
  });

  it("appends a later page only to the reading it was asked for, never another layer's", async () => {
    let hold: (() => void) | null = null;
    await drawn((u) => {
      const layer = u.searchParams.get("layer");
      const after = u.searchParams.get("after");
      if (after !== null && layer === null)
        return new Promise((res) => {
          hold = () => res(paged(null, after));
        });
      return paged(layer, after);
    });
    expect(host.querySelectorAll(".heat-row")).toHaveLength(1);
    const more = [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "More subjects")!;
    await act(async () => more.click());
    // the layer changes while the picks' next page is on its way
    const keys = [...host.querySelectorAll<HTMLButtonElement>('[role="group"][aria-label="Layer"] button')];
    await act(async () => keys[1].click());
    for (let i = 0; i < 20 && !host.querySelector(".heat-cell.layered"); i++) await act(async () => new Promise((res) => setTimeout(res, 5)));
    await act(async () => hold?.());
    await act(async () => new Promise((res) => setTimeout(res, 20)));
    expect(host.querySelectorAll(".heat-row")).toHaveLength(1);
    expect(host.querySelectorAll(".heat-cell:not(.layered)").length).toBe(0);
  });

  it("reads the step alone again while it runs, and keeps the pages read with More", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const running = { ...STEP, state: "running", progress: { done: 1, total: 4 } };
      const asked = await drawn(
        (u) => {
          const a = paged(u.searchParams.get("layer"), u.searchParams.get("after"));
          return "layer" in a && a.layer ? { ...a, layer: { ...a.layer, step: running } } : a;
        },
        () => running,
      );
      const keys = [...host.querySelectorAll<HTMLButtonElement>('[role="group"][aria-label="Layer"] button')];
      await act(async () => keys[1].click());
      for (let i = 0; i < 20 && !host.querySelector(".heat-cell.layered"); i++) await act(async () => new Promise((res) => setTimeout(res, 5)));
      const more = [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "More subjects")!;
      await act(async () => more.click());
      for (let i = 0; i < 20 && host.querySelectorAll(".heat-row").length < 2; i++) await act(async () => new Promise((res) => setTimeout(res, 5)));
      expect(host.querySelectorAll(".heat-row")).toHaveLength(2);
      const pages = asked.filter((a) => a.includes("/picks?")).length;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_000);
      });
      for (let i = 0; i < 20 && !asked.some((a) => a.includes("/api/picks/layer-step")); i++) await act(async () => new Promise((res) => setTimeout(res, 5)));
      expect(asked.some((a) => a === "GET /api/picks/layer-step?cohort=north&layer=body_region")).toBe(true);
      expect(asked.filter((a) => a.includes("/picks?")).length, asked.join("\n")).toBe(pages);
      expect(host.querySelectorAll(".heat-row")).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the pages read with More when the step is over, and its key names the values of every page", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      let polls = 0;
      const step = () => {
        polls += 1;
        return polls === 1 ? { ...STEP, state: "done", answered: 40 } : STEP;
      };
      let firsts = 0;
      const asked = await drawn((u) => {
        const layer = u.searchParams.get("layer");
        const a = answer(layer);
        if (!layer) return a;
        const first = { ...a, layer: { ...a.layer, values: ["head"], step: { ...STEP, state: "running" } } };
        if (u.searchParams.get("after") !== null) return { ...a, subjects: a.subjects.slice(1), next: null, layer: { ...a.layer, values: ["spine"] } };
        firsts += 1;
        // the first reading answers one subject and more to come; a reading again, every subject shown
        return firsts === 1 ? { ...first, subjects: first.subjects.slice(0, 1), next: 1 } : { ...first, next: null };
      }, step);
      const keys = [...host.querySelectorAll<HTMLButtonElement>('[role="group"][aria-label="Layer"] button')];
      await act(async () => keys[1].click());
      for (let i = 0; i < 20 && !host.querySelector(".heat-cell.layered"); i++) await act(async () => new Promise((res) => setTimeout(res, 5)));
      const more = [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "More subjects")!;
      await act(async () => more.click());
      for (let i = 0; i < 20 && host.querySelectorAll(".heat-row").length < 2; i++) await act(async () => new Promise((res) => setTimeout(res, 5)));
      // the key names the values of both pages
      expect([...host.querySelectorAll(".heat-value")].map((v) => v.textContent)).toEqual(["head", "spine"]);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_000);
      });
      for (let i = 0; i < 40 && firsts < 2; i++) await act(async () => new Promise((res) => setTimeout(res, 5)));
      // the first page read again, as long as every subject shown
      expect(asked.filter((a) => a === "GET /api/cohorts/north/picks?limit=24&layer=body_region")).toHaveLength(2);
      for (let i = 0; i < 20 && host.querySelectorAll(".heat-row").length < 2; i++) await act(async () => new Promise((res) => setTimeout(res, 5)));
      expect(host.querySelectorAll(".heat-row")).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("says it does not show the step's progress where it cannot ask for it, with a Reload", async () => {
    vi.stubGlobal("fetch", async (url: string) => {
      const u = new URL(url, "http://desk.test");
      const a = answer(u.searchParams.get("layer"));
      return new Response(JSON.stringify("layer" in a && a.layer ? { ...a, layer: { ...a.layer, step: { ...STEP, state: "running" } } } : a), { status: 200 });
    });
    const r = createRoot(host);
    root = r;
    await act(async () => r.render(<HeatMap cohort="north" />));
    for (let i = 0; i < 20 && !host.querySelector(".heat-row"); i++) await act(async () => new Promise((res) => setTimeout(res, 5)));
    const keys = [...host.querySelectorAll<HTMLButtonElement>('[role="group"][aria-label="Layer"] button')];
    await act(async () => keys[1].click());
    for (let i = 0; i < 20 && !host.querySelector(".heat-cell.layered"); i++) await act(async () => new Promise((res) => setTimeout(res, 5)));
    expect(host.textContent).toContain("This page does not show the step's progress.");
    expect([...host.querySelectorAll("button")].some((b) => b.textContent === "Reload")).toBe(true);
  });

  it("reads every page shown again when the step is over, in more than one request beyond the door's most", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const subject = (id: number) => ({ id, code: `c${id}`, sessions: [{ session: id, studies: [id], label: "ses-1", number: 1, roles: { t1w: cell("picked", id, "head") }, layer: { scans: { head: 1 }, none: 0 } }] });
      const block = (from: number) => Array.from({ length: 150 }, (_, i) => subject(from + i));
      let polls = 0;
      const asked = await drawn(
        (u) => {
          const layer = u.searchParams.get("layer");
          const a = answer(layer);
          if (!layer) return a;
          const after = u.searchParams.get("after");
          const head = { ...a.layer, values: ["head"], step: after === null ? { ...STEP, state: "running" } : null };
          return after === null ? { ...a, subjects: block(1000), next: 1149, layer: head } : { ...a, subjects: block(2000), next: null, layer: head };
        },
        () => {
          polls += 1;
          return { ...STEP, state: "done", answered: 40 };
        },
      );
      const keys = [...host.querySelectorAll<HTMLButtonElement>('[role="group"][aria-label="Layer"] button')];
      await act(async () => keys[1].click());
      for (let i = 0; i < 40 && host.querySelectorAll(".heat-row").length < 150; i++) await act(async () => new Promise((res) => setTimeout(res, 5)));
      const more = [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "More subjects")!;
      await act(async () => more.click());
      for (let i = 0; i < 40 && host.querySelectorAll(".heat-row").length < 300; i++) await act(async () => new Promise((res) => setTimeout(res, 5)));
      expect(host.querySelectorAll(".heat-row")).toHaveLength(300);
      const before = asked.length;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_000);
      });
      for (let i = 0; i < 60 && asked.slice(before).filter((a) => a.includes("/picks?")).length < 2; i++) await act(async () => new Promise((res) => setTimeout(res, 5)));
      expect(polls).toBe(1);
      const again = asked.slice(before).filter((a) => a.includes("/picks?"));
      expect(again).toEqual(["GET /api/cohorts/north/picks?limit=200&layer=body_region", "GET /api/cohorts/north/picks?limit=150&after=1149&layer=body_region"]);
      for (let i = 0; i < 40 && host.querySelectorAll(".heat-row").length < 300; i++) await act(async () => new Promise((res) => setTimeout(res, 5)));
      expect(host.querySelectorAll(".heat-row")).toHaveLength(300);
    } finally {
      vi.useRealTimers();
    }
  });
});

