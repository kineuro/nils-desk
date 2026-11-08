// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// Review's Questions page with an engine that gathers its questions (record
// 56 section 6.3; UX round 5, 2026-11-08): under Review's head, the axis or
// "Scans to answer", one card per question as Review's first page draws them,
// read for the dataset the page was opened for, and nothing else: no chips, no
// cohort chips, no zero cards, no table of what else waits; a question's
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

  it("draws the questions as cards under Review's head, for the dataset it was opened for, and nothing else", async () => {
    const caps = capsWith([QUESTION_DOORS.list, QUESTION_DOORS.scans, QUESTION_DOORS.answer, "GET /api/review/summary"], [...GRANTS] as Grant[]);
    act(() => root.render(<ReviewPage caps={caps} page="questions" query={{ dataset: "ms-a" }} />));
    await settle();
    expect(urls).toEqual(["/api/review/questions?dataset=ms-a"]);
    expect(el.querySelector(".data-head .eyebrow")?.textContent).toBe("Review");
    expect(el.querySelector("h1")?.textContent).toBe("Scans to answer");
    expect(el.querySelector(".q-where")?.textContent).toBe("in dataset ms-a · everywhere");
    expect(el.querySelector(".q-where a")?.getAttribute("href")).toBe("#review/questions");
    const cards = [...el.querySelectorAll(".rv-card.answer")];
    expect(cards.map((c) => c.querySelector(".rv-title")?.textContent)).toEqual(["T2w or PDw?", "Which base?"]);
    expect(cards.map((c) => c.querySelector(".rv-big b")?.textContent)).toEqual(["12", "7"]);
    expect(cards[1].querySelector(".rv-meta")?.textContent).toBe("The rules found no base for these scans.");
    expect(cards.map((c) => c.querySelector("a.button")?.getAttribute("href"))).toEqual(["#review/questions/base%3APDw%7CT2w?dataset=ms-a", "#review/questions/base%3Amissing?dataset=ms-a"]);
    expect(cards.map((c) => c.querySelector("a.button")?.textContent)).toEqual(["Answer", "Answer"]);
    // the old page's head, chips, cohort chips, zero cards and table are gone
    for (const gone of [".chips.pages", ".chips.cohorts", ".needs", "table.queue", ".lede", "h2", ".q-else", ".q-held"]) expect(el.querySelector(gone)).toBeNull();
    expect(el.textContent).not.toContain("What needs a person");
    expect(el.textContent).not.toContain("Also waiting");
  });

  it("narrowed to an axis, it is the axis's page; one with no question says so", async () => {
    const caps = capsWith([QUESTION_DOORS.list, QUESTION_DOORS.scans, QUESTION_DOORS.answer, "GET /api/review/summary"], [...GRANTS] as Grant[]);
    act(() => root.render(<ReviewPage caps={caps} page="questions" query={{ axis: "base" }} />));
    await settle();
    expect(urls).toEqual(["/api/review/questions"]);
    expect(el.querySelector("h1")?.textContent).toBe("Base");
    expect(el.querySelectorAll(".rv-card.answer")).toHaveLength(2);
    expect(el.querySelector(".q-where")).toBeNull();
    act(() => root.render(<ReviewPage caps={caps} page="questions" query={{ axis: "modifier", dataset: "ms-a" }} />));
    await settle();
    expect(el.querySelector("h1")?.textContent).toBe("Modifier");
    expect(el.querySelectorAll(".rv-card.answer")).toHaveLength(0);
    expect(el.querySelector(".q-none")?.textContent).toContain("Nothing to answer here.");
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

  it("keeps the queue alone with an engine before the doors, and for a batch", async () => {
    const caps = capsWith(["GET /api/review/summary"], [...GRANTS] as Grant[]);
    act(() => root.render(<ReviewPage caps={caps} page="questions" query={{ dataset: "ms-a" }} />));
    await settle();
    expect(urls.some((u) => u.startsWith("/api/review/questions"))).toBe(false);
    expect(el.querySelector(".questions")).toBeNull();
    expect(el.querySelector("h2")?.textContent).toBe("The queue");
    expect(el.querySelector(".chips.pages a.on b")?.textContent).toBe("4");
    expect(el.textContent).not.toContain("What needs a person");
    const served = capsWith([QUESTION_DOORS.list, QUESTION_DOORS.scans, QUESTION_DOORS.answer, "GET /api/review/summary"], [...GRANTS] as Grant[]);
    act(() => root.render(<ReviewPage caps={served} page="questions" query={{ batch: "3" }} />));
    await settle();
    expect(el.querySelector("h2")?.textContent).toBe("The queue");
    expect(el.querySelector(".rv-card")).toBeNull();
  });
});
