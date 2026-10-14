// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// The Query page card whose answer lists 1 to 4 subjects a quasi-identifying
// field chose, at detail plain (record 55 K7, small lists, the ruling of
// 2026-10-13): the engine answers no row, row_count null, pages 0 and every
// column in held_back. The card says the rows are held back, the why on
// hover, never 0 rows or an empty result; it offers no cohort of them, and
// Download CSV makes no file and says why without a warning.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { button, caps7a, dialogs, settle } from "../../test/safeWayIn";
import { fakeDoors } from "../assistant/onechat.fixture";
import { reads } from "../assistant/reads";
import { fakeAssistant } from "../assistant/stream.fixture";
import { QueryPage } from "./QueryPage";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LIST = "a list of fewer than 5 subjects that a quasi identifying field chose; its length is a count, so no row is shown";
const HELD = [
  { column: "code", why: LIST },
  { column: "age", why: LIST },
];

let host: HTMLDivElement;
let root: Root;
let asked: string[];
let blobs: number;
beforeEach(() => {
  dialogs();
  reads.forget();
  asked = [];
  blobs = 0;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => { blobs += 1; return "blob:x"; }, revokeObjectURL: () => undefined }));
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function open() {
  const doors = fakeDoors();
  fakeAssistant({
    chat: { id: "q1", station: "ask-help", title: "Women over 80", title_by: "model", document: 102 },
    engine: (c, nth) => {
      const u = new URL(c.url, "http://x");
      asked.push(`${c.method} ${u.pathname}`);
      if (u.pathname === "/api/ask/run")
        return { status: 200, body: { handle: 7, hash: "h", grain: "subject", row_count: null, pages: 0, truncated: false, columns: [{ name: "code", type: "text" }, { name: "age", type: "integer" }], rows: [], shaped: [], held_back: HELD, declaration: {} } };
      if (u.pathname === "/api/ask/preview") return { status: 200, body: { level: "record", columns: ["code", "age"], rows: [], truncated: false, shaped: [], held_back: HELD } };
      if (u.pathname.startsWith("/api/ask/handles/7/rows")) return { status: 404, body: { error: "handle 7 has no page 0" } };
      return doors(c, nth);
    },
  });
  act(() => root.render(<QueryPage caps={caps7a(["PUT /api/ask/selections/{name}", "POST /api/ask/profile", "POST /api/ask/handles/{id}/promote"])} open="102" />));
}

const panelOf = (title: RegExp) => [...host.querySelectorAll<HTMLElement>(".panel.card")].find((p) => title.test(p.querySelector("h2")?.textContent ?? ""))!;

describe("the Ask page card, its list held back at plain (record 55 K7, small lists)", () => {
  it("says the rows are held back with why on hover, never 0 rows or an empty table, and offers no cohort of them", async () => {
    open();
    await settle(20);
    act(() => button(host, "Run")!.click());
    await settle(10);
    const tag = host.querySelector(".tag.held")!;
    expect(tag.textContent).toBe("rows held back");
    expect(tag.getAttribute("title")).toBe(LIST);
    const answer = host.querySelector(".timeline-step.answer")!;
    expect(answer.querySelector(".held")?.textContent).toBe("rows held back");
    expect(button(answer as HTMLElement, "Make a cohort")).toBeNull();
    act(() => button(panelOf(/^Rows$/u), "Preview 10 rows")!.click());
    await settle(10);
    const rows = panelOf(/^Rows$/u);
    expect(rows.querySelector("table")).toBeNull();
    expect(rows.querySelector(".held-words")?.textContent).toBe("The rows are held back.");
    expect(rows.querySelector(".held-words")?.getAttribute("title")).toBe(LIST);
    expect(host.textContent).not.toMatch(/\b0 rows\b|null|NaN/u);
  });

  it("makes no file of the held list, reads no page, and says so without a warning", async () => {
    open();
    await settle(20);
    act(() => button(panelOf(/^Rows$/u), "Download CSV")!.click());
    await settle(20);
    expect(asked.filter((a) => a.includes("/rows"))).toEqual([]);
    expect(blobs).toBe(0);
    const said = panelOf(/^Rows$/u).querySelector("p.meta[title]")!;
    expect(said.textContent).toBe("The rows are held back, so no file is made.");
    expect(said.getAttribute("title")).toBe(LIST);
    expect(panelOf(/^Rows$/u).querySelector("p.warn")).toBeNull();
  });
});
