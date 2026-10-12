// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// The answer's card in the chat saves its rows as a CSV file (2026-10-12):
// Download CSV runs the version and reads every page of its answer for an
// export, at the person's own detail, saves the file named after the
// question and its version, and says how many rows it holds; an answer the
// engine will not export says why.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { button, settle } from "../../test/safeWayIn";
import { QueryCard } from "./QueryCard";
import { reads } from "./reads";

let host: HTMLDivElement;
let root: Root;
let asked: string[];
let saved: { name: string; text: string }[];

/** The engine's doors the card reads, the run answered by `run`. */
function engine(run: { status: number; body: unknown }) {
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const u = new URL(url, "http://x");
    asked.push(`${init?.method ?? "GET"} ${u.pathname}${u.search}`);
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
    if (u.pathname === "/api/ask/documents/12") return json(200, { document: 12, hash: "h12", ask: { ast_version: 1, name: "T1 scans of cohort A", out: { set: "scans", level: "record" } } });
    // the profile is not what this card is tested for: the card says it could not be counted
    if (u.pathname === "/api/ask/profile") return json(503, { error: "not counted here" });
    if (u.pathname === "/api/ask/run") return json(run.status, run.body);
    if (u.pathname === "/api/ask/handles/7/rows") {
      const page = Number(u.searchParams.get("page"));
      return json(200, { handle: 7, page, pages: 2, columns: [], rows: page === 0 ? [["S-1", "MPRAGE"], ["S-2", "MPRAGE"]] : [["S-3", "SPACE, sag"]] });
    }
    return json(404, { error: `no ${u.pathname}` });
  });
}

beforeEach(() => {
  asked = [];
  saved = [];
  reads.forget();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  // the browser's download: the file's name and the text of its blob
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: (b: Blob) => { void b.text().then((text) => saved.push({ name: "", text })); return "blob:x"; }, revokeObjectURL: () => undefined }));
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    const name = this.download;
    queueMicrotask(() => {
      const last = saved.at(-1);
      if (last && !last.name) last.name = name;
    });
  });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const card = () => <QueryCard document={12} label="v3" epoch={1} state="open" compact={false} shown={false} onOpen={() => undefined} />;

describe("Download CSV on the answer's card", () => {
  it("saves every row of the answer as a file named after the question and its version, and says how many", async () => {
    engine({ status: 200, body: { handle: 7, pages: 2, row_count: 3, truncated: false, grain: "stack", columns: [{ name: "code", type: "text" }, { name: "technique", type: "text" }], rows: [] } });
    act(() => root.render(card()));
    await settle();
    const download = button(host, "Download CSV");
    expect(download).not.toBeNull();
    act(() => download?.click());
    await settle(10);
    expect(asked).toEqual(expect.arrayContaining(["POST /api/ask/run", "GET /api/ask/handles/7/rows?page=0&purpose=export", "GET /api/ask/handles/7/rows?page=1&purpose=export"]));
    expect(saved).toEqual([{ name: "t1-scans-of-cohort-a-v3.csv", text: 'code,technique\nS-1,MPRAGE\nS-2,MPRAGE\nS-3,"SPACE, sag"\n' }]);
    expect(host.textContent).toContain("Saved t1-scans-of-cohort-a-v3.csv: 3 rows.");
  });

  it("says why when the engine will not export the answer, and saves nothing", async () => {
    engine({ status: 409, body: { error: "the answer is truncated: it holds more rows than one run keeps" } });
    act(() => root.render(card()));
    await settle();
    act(() => button(host, "Download CSV")?.click());
    await settle(10);
    expect(saved).toEqual([]);
    expect(host.querySelector("p.warn")?.textContent).toBe(
      "The file could not be made: the answer no longer reproduces (the answer is truncated: it holds more rows than one run keeps). Open the question and run it again, or narrow it.",
    );
  });
});
