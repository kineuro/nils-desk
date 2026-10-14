// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// Download CSV beside the Ask page card's preview (2026-10-12), as on the
// chat's answer card: the version run, every page of its answer read for an
// export at the person's own detail, the file named after the question and
// saved, and the card saying how many rows it holds, or why the engine would
// not export it. Against the fake engine of the Assistant's checks.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { button, caps7a, dialogs, settle } from "../../test/safeWayIn";
import { fakeDoors } from "../assistant/onechat.fixture";
import { reads } from "../assistant/reads";
import { fakeAssistant } from "../assistant/stream.fixture";
import { QueryPage } from "./QueryPage";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
let saved: { name: string; text: string }[];
let asked: string[];

beforeEach(() => {
  dialogs();
  reads.forget();
  saved = [];
  asked = [];
  host = document.createElement("div");
  document.body.appendChild(host);
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

/** The Assistant's fake engine, with the run door answered by `run` and two pages of rows. */
function open(run: { status: number; body: unknown }) {
  const doors = fakeDoors();
  fakeAssistant({
    chat: { id: "q1", station: "ask-help", title: "Only women", title_by: "model", document: 102 },
    engine: (c, nth) => {
      const u = new URL(c.url, "http://x");
      asked.push(`${c.method} ${u.pathname}${u.search}`);
      if (u.pathname === "/api/ask/run") return run;
      if (u.pathname === "/api/ask/handles/7/rows") {
        const page = Number(u.searchParams.get("page"));
        return { status: 200, body: { handle: 7, page, pages: 2, columns: [], rows: page === 0 ? [["S-1", "MPRAGE"]] : [["S-2", "SPACE, sag"]], withheld_sealed: page === 1 ? 2 : 0 } };
      }
      return doors(c, nth);
    },
  });
  act(() => root.render(<QueryPage caps={caps7a(["PUT /api/ask/selections/{name}", "POST /api/ask/profile"])} open="102" />));
}

describe("Download CSV on the Ask page card", () => {
  it("sits beside Preview 10 rows, saves every row of the answer for an export, and says how many", async () => {
    open({ status: 200, body: { handle: 7, pages: 2, row_count: 2, truncated: false, grain: "stack", columns: [{ name: "code", type: "text" }, { name: "technique", type: "text" }], rows: [] } });
    await settle(20);
    const row = [...host.querySelectorAll(".panel.card")].find((p) => p.querySelector("h2")?.textContent === "Rows")!;
    expect([...row.querySelectorAll(".row button")].map((b) => b.textContent)).toEqual(["Preview 10 rows", "Download CSV"]);
    act(() => button(row as HTMLElement, "Download CSV")?.click());
    await settle(20);
    expect(asked).toEqual(expect.arrayContaining(["GET /api/ask/handles/7/rows?page=0&purpose=export", "GET /api/ask/handles/7/rows?page=1&purpose=export"]));
    expect(saved).toHaveLength(1);
    expect(saved[0].name).toMatch(/\.csv$/u);
    expect(saved[0].text).toBe('code,technique\nS-1,MPRAGE\nS-2,"SPACE, sag"\n');
    expect(row.querySelector("p.meta")?.textContent).toBe(`Saved ${saved[0].name}: 2 rows. 2 stacks of a sealed sample left out.`);
  });
  it("says why when the engine will not export the answer, and saves nothing", async () => {
    open({ status: 409, body: { error: "the answer is stale: the registry moved on since it was run" } });
    await settle(20);
    const row = [...host.querySelectorAll(".panel.card")].find((p) => p.querySelector("h2")?.textContent === "Rows")!;
    act(() => button(row as HTMLElement, "Download CSV")?.click());
    await settle(20);
    expect(saved).toEqual([]);
    expect(row.querySelector("p.warn")?.textContent).toBe("The file could not be made: the answer no longer reproduces (the answer is stale: the registry moved on since it was run). Open the question and run it again, or narrow it.");
  });
});
