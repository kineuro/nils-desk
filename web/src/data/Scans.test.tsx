// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// A dataset's scans: the ask they are read with, the rows read by column
// name and grouped by subject and session, the pages turned through the
// handle, a click opening the viewer on that scan, Pick main scans beside the
// list, and the one line where the dataset feeds no cohort.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Capabilities } from "../capabilities";
import type { Dataset } from "./datasets";
import { groupScans, mayListScans, scanAsk, scanFacts, scansOf } from "./scans";

vi.mock("../campaigns/StackView", () => ({
  StackView: ({ stack }: { stack: number }) => <div data-testid="viewer" data-stack={stack} />,
}));

const { Scans } = await import("./Scans");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DOORS = ["POST /api/ask/run", "GET /api/ask/handles/{id}/rows", "POST /api/picks/run"];
const caps = (grants: string[] = ["data:see", "data:work", "query:see", "query:work", "pipelines:work"], doors: string[] = DOORS) =>
  ({
    engine: { engine: { name: "nils", version: "1" }, contracts: {}, doors, policy: [], auth: "off", principal: "astrid", roles: [], registry: { epoch: 4 }, packs: [] },
    kvasir: null,
    assistant: null,
    apps: [],
    person: { subject: "astrid", display_name: "Astrid", grants, detail: "sensitive", groups: [] },
    desk: { version: "1.0.0", mode: "off", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
  }) as unknown as Capabilities;

const dataset = (cohort: string | null) => ({ id: 3, name: "ms-a", cohort, totals: { subjects: 2, stacks: 3 }, digests: { count: 1, recent: [] } }) as unknown as Dataset;

const COLUMNS = ["_key", "_subject", "subject.code", "session.id", "id", "text_series_description", "orientation", "n_instances", "day"];
const ROWS = [
  [11, 1, "sub-a", 7, 11, "T1 MPRAGE", "SAG", 176, "2026-01-02"],
  [12, 1, "sub-a", 7, 12, "FLAIR", "AX", 40, "2026-01-02"],
  [13, 2, "sub-b", 9, 13, "DWI", "AX", 1, "2026-02-03"],
];

describe("the scans of a dataset, read", () => {
  it("asks for every stack of the dataset's cohort as one record set", () => {
    const a = scanAsk("ms-a") as { params: { cohorts: { value: string[] } }; sets: Record<string, { grain: string; of?: string }>; out: { set: string; level: string } };
    expect(a.params.cohorts.value).toEqual(["ms-a"]);
    expect(a.sets.scans).toEqual({ grain: "stack", of: "people" });
    expect(a.sets.people).toEqual({ grain: "subject", of: "scope" });
    expect(a.out).toMatchObject({ set: "scans", level: "record" });
  });

  it("reads the rows by column name and groups them by subject, then session", () => {
    const scans = scansOf(COLUMNS.map((name) => ({ name })), ROWS);
    expect(scans.map((s) => s.id)).toEqual([11, 12, 13]);
    expect(scans[0]).toEqual({ id: 11, subject: "sub-a", session: 7, day: "2026-01-02", name: "T1 MPRAGE", orientation: "SAG", images: 176 });
    const g = groupScans(scans);
    expect(g.map((x) => x.subject)).toEqual(["sub-a", "sub-b"]);
    expect(g[0].sessions).toHaveLength(1);
    expect(g[0].sessions[0].scans.map((s) => s.name)).toEqual(["T1 MPRAGE", "FLAIR"]);
    expect(scanFacts(scans[0])).toBe("sag · 176 images");
    expect(scanFacts(scans[2])).toBe("ax · 1 image");
  });

  it("is offered only with query work and the ask doors", () => {
    expect(mayListScans(caps())).toBe(true);
    expect(mayListScans(caps(["data:see", "data:work"]))).toBe(false);
    expect(mayListScans(caps(undefined, ["POST /api/ask/run"]))).toBe(false);
  });
});

describe("the scans of a dataset, on the page", () => {
  let root: Root;
  let el: HTMLDivElement;
  let calls: { method: string; url: string; body: unknown }[];
  beforeEach(() => {
    calls = [];
    el = document.createElement("div");
    document.body.appendChild(el);
    root = createRoot(el);
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ method: init.method ?? "GET", url, body: init.body ? JSON.parse(String(init.body)) : undefined });
      if (url === "/api/ask/run") return new Response(JSON.stringify({ handle: 5, columns: COLUMNS, rows: ROWS.slice(0, 2), pages: 2, row_count: 3 }));
      if (url === "/api/ask/handles/5/rows?page=1") return new Response(JSON.stringify({ columns: COLUMNS, rows: ROWS.slice(2), page: 1, pages: 2 }));
      return new Response("{}", { status: 404 });
    });
  });
  afterEach(() => {
    act(() => root.unmount());
    el.remove();
    vi.unstubAllGlobals();
  });
  const settle = async () => {
    await act(async () => {
      for (let i = 0; i < 6; i++) await Promise.resolve();
    });
  };
  const button = (label: string) => [...el.querySelectorAll("button")].find((b) => b.textContent === label || b.getAttribute("aria-label") === label) ?? null;

  it("lists the scans grouped by subject, with Pick main scans beside them", async () => {
    act(() => root.render(<Scans caps={caps()} dataset={dataset("ms-a")} />));
    await settle();
    expect(calls[0]).toMatchObject({ method: "POST", url: "/api/ask/run" });
    expect(el.querySelector("h2")?.textContent).toBe("Scans of ms-a");
    expect([...el.querySelectorAll(".scan-subject > b")].map((b) => b.textContent)).toEqual(["sub-a"]);
    expect([...el.querySelectorAll(".scan-name")].map((b) => b.textContent)).toEqual(["T1 MPRAGE", "FLAIR"]);
    expect(button("Pick main scans")).not.toBeNull();
    expect(el.textContent).toContain("1 / 2");
  });

  it("opens the viewer on the scan clicked", async () => {
    act(() => root.render(<Scans caps={caps()} dataset={dataset("ms-a")} />));
    await settle();
    expect(el.querySelector("[data-testid=viewer]")).toBeNull();
    act(() => [...el.querySelectorAll<HTMLButtonElement>(".scan-row")][1].click());
    expect(el.querySelector("[data-testid=viewer]")?.getAttribute("data-stack")).toBe("12");
    expect(el.querySelector(".scan-row.on .scan-name")?.textContent).toBe("FLAIR");
    act(() => button("Close the scan")!.click());
    expect(el.querySelector("[data-testid=viewer]")).toBeNull();
  });

  it("turns to the next page through the handle", async () => {
    act(() => root.render(<Scans caps={caps()} dataset={dataset("ms-a")} />));
    await settle();
    act(() => button("Next page")!.click());
    await settle();
    expect(calls.at(-1)).toMatchObject({ method: "GET", url: "/api/ask/handles/5/rows?page=1" });
    expect([...el.querySelectorAll(".scan-name")].map((b) => b.textContent)).toEqual(["DWI"]);
    expect(el.textContent).toContain("2 / 2");
  });

  it("says in one line that a dataset feeding no cohort has no list, and asks nothing", async () => {
    act(() => root.render(<Scans caps={caps()} dataset={dataset(null)} />));
    await settle();
    expect(calls).toHaveLength(0);
    expect(el.textContent).toContain("No scan list for this dataset yet");
    expect(button("Pick main scans")).not.toBeNull();
  });
});
