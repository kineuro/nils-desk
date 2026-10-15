// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// Review's Questions page with an engine that gathers its questions (record
// 56 section 6.3): the list in plain words on top, read for the dataset the
// page was opened for, the Questions chip counting its distinct scans, and
// what else waits under it without the kinds the grid answers; a question's
// address opens its grid; an engine before the doors keeps the queue alone.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GRANTS, type Grant } from "../grants";
import { capsWith } from "./caps.fixture";
import { QUESTION_DOORS } from "./questions";
import { LIST, PAGE_PAIR } from "./questions.fixture";
import { ReviewPage } from "./ReviewPage";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ITEMS = [
  { id: 1, kind: "base:missing", scope: "group", status: "open", created_at: "2026-10-14T10:00:00Z", members: 7, evidence: { axis: "base" } },
  { id: 2, kind: "base:disagree", scope: "stack", status: "open", created_at: "2026-10-14T10:00:00Z", ref: { stack_id: 301 }, evidence: { axis: "base" } },
  { id: 3, kind: "identity.collision", scope: "subject", status: "open", created_at: "2026-10-14T10:00:00Z", evidence: { sessions: 2 } },
  { id: 4, kind: "modifier:session", scope: "group", status: "open", created_at: "2026-10-14T10:00:00Z", members: 3, evidence: { axis: "modifier" } },
];

describe("Review's Questions page", () => {
  let root: Root;
  let el: HTMLDivElement;
  let urls: string[];
  beforeEach(() => {
    urls = [];
    el = document.createElement("div");
    document.body.appendChild(el);
    root = createRoot(el);
    vi.stubGlobal("fetch", async (url: string) => {
      urls.push(url);
      const reply = (doc: unknown) => new Response(JSON.stringify(doc));
      if (url.startsWith("/api/review/questions/")) return reply(PAGE_PAIR);
      if (url.startsWith("/api/review/questions")) return reply(LIST);
      if (url.startsWith("/api/review/summary")) return reply({ by_kind: { "base:missing": 1, "base:disagree": 1, "identity.collision": 1, "modifier:session": 1 }, cohorts: [], none: 0 });
      if (url.startsWith("/api/review")) return reply({ count: ITEMS.length, items: ITEMS });
      return reply({});
    });
  });
  afterEach(() => {
    act(() => root.unmount());
    el.remove();
    vi.unstubAllGlobals();
  });
  const settle = async () => {
    await act(async () => {
      for (let i = 0; i < 8; i++) await Promise.resolve();
    });
  };

  it("puts the questions on top, counts their scans on the chip, and leaves the kinds the grid answers out of what else waits", async () => {
    const caps = capsWith([QUESTION_DOORS.list, QUESTION_DOORS.scans, QUESTION_DOORS.answer, "GET /api/review/summary"], [...GRANTS] as Grant[]);
    act(() => root.render(<ReviewPage caps={caps} page="questions" query={{ dataset: "ms-a" }} />));
    await settle();
    expect(urls).toContain("/api/review/questions?dataset=ms-a");
    expect([...el.querySelectorAll(".q-row .q-words")].map((w) => w.textContent)).toEqual(["T2w or PDw?", "Which base?"]);
    expect(el.querySelector(".chips.pages a.on b")?.textContent).toBe("21");
    // what else waits: the identity question and a pass's, never the questions answered above
    const rows = [...el.querySelectorAll("table.queue tbody tr")].map((r) => r.textContent ?? "");
    expect(rows.some((r) => r.includes("two codes share one identifier"))).toBe(true);
    expect(rows.some((r) => r.includes("modifier"))).toBe(true);
    expect(rows.some((r) => r.includes("no base fits"))).toBe(false);
    expect(el.querySelector("h2")?.textContent).toBe("Also waiting");
    // the unsure card is the list's now; the identity card stays
    expect([...el.querySelectorAll(".needs .need .value")].map((v) => v.textContent)).toEqual(["1 subject", "0 sessions"]);
  });

  it("opens a question's grid at its address", async () => {
    const caps = capsWith([QUESTION_DOORS.list, QUESTION_DOORS.scans, QUESTION_DOORS.answer, "POST /api/campaigns"], [...GRANTS] as Grant[]);
    act(() => root.render(<ReviewPage caps={caps} page="questions" arg="base:PDw|T2w" query={{ dataset: "ms-a" }} />));
    await settle();
    expect(urls[0]).toBe("/api/review/questions/base%3APDw%7CT2w/scans?dataset=ms-a&page=1&limit=50");
    expect(el.querySelector(".qgrid-head h1")?.textContent).toBe("T2w or PDw?");
    expect(el.querySelectorAll(".q-tile")).toHaveLength(12);
    // the four System 1 agrees on step back, the eight it disputes stay bright
    expect(el.querySelectorAll(".q-tile.dim")).toHaveLength(4);
    expect(el.querySelector(".q-tile")?.getAttribute("data-slot")).toBe("4");
    // the grid's head asks people about this question's kind
    expect(el.querySelector('.qgrid-head a[href*="make=review"]')?.getAttribute("href")).toContain("from=base%3Adisagree");
  });

  it("keeps the queue alone with an engine before the doors", async () => {
    const caps = capsWith(["GET /api/review/summary"], [...GRANTS] as Grant[]);
    act(() => root.render(<ReviewPage caps={caps} page="questions" query={{ dataset: "ms-a" }} />));
    await settle();
    expect(urls.some((u) => u.startsWith("/api/review/questions"))).toBe(false);
    expect(el.querySelector(".questions")).toBeNull();
    expect(el.querySelector("h2")?.textContent).toBe("The queue");
    expect(el.querySelector(".chips.pages a.on b")?.textContent).toBe("4");
  });
});
