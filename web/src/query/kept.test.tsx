// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// The Cards list and a card keep what a person kept (record 55 K6): the list
// reads the kept cards, and the drafts nobody kept under a tab of their own
// with how many, a page at a time; a card says kept or draft, and Keep or
// Unkeep puts it on the list or back among the drafts; a person without work
// on the Query page sees the word and no control, and an engine from before the
// mark is read as it always was.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { button, caps7a, dialogs, engine, settle } from "../../test/safeWayIn";
import { fakeDoors } from "../assistant/onechat.fixture";
import { reads } from "../assistant/reads";
import type { Kept } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { GRANTS } from "../grants";
import { QueryPage } from "./QueryPage";
import { isKept, mayKeep } from "./kept";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  dialogs();
  reads.forget();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const KEEP_DOORS = ["PUT /api/ask/documents/{id}/kept", "DELETE /api/ask/documents/{id}/kept"];
const caps = (doors: string[] = KEEP_DOORS, grants: readonly string[] = GRANTS): Capabilities => caps7a([...doors, "GET /api/ask/documents", "PUT /api/ask/selections/{name}", "POST /api/ask/profile"], grants);
const MARK: Kept = { by: "astrid", at: "2026-10-16T09:00:00Z" };
const words = (el: Element | null): string => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

describe("the Cards list", () => {
  const row = (i: number, kept: Kept | null | undefined) => ({
    document: i,
    root: i,
    name: `Card ${i}`,
    grain: "stack",
    out: "scans",
    level: "count",
    versions: 1,
    author: "astrid",
    created_at: "2026-10-15T10:00:00Z",
    updated_at: "2026-10-15T10:00:00Z",
    last_used_at: "2026-10-15T10:00:00Z",
    hash: `h${i}`,
    last_run: null,
    ...(kept === undefined ? {} : { kept }),
  });

  /** The engine's list: two kept cards, and fifty-one drafts, fifty to a page. */
  const list = (drafts = 51, mark = true) =>
    engine((c) => {
      const u = new URL(c.url, "http://x");
      if (u.pathname !== "/api/ask/documents" || c.method !== "GET") return undefined;
      const counts = mark ? { cards: 2, drafts } : {};
      const kept = u.searchParams.get("kept");
      if (kept === "no") {
        if (u.searchParams.get("after")) return { status: 200, body: { count: drafts - 50, documents: [row(100, null)], next: null, ...counts } };
        return { status: 200, body: { count: Math.min(drafts, 50), documents: Array.from({ length: Math.min(drafts, 50) }, (_, i) => row(200 - i, null)), next: drafts > 50 ? 151 : null, ...counts } };
      }
      return { status: 200, body: { count: 2, documents: [row(7, mark ? MARK : undefined), row(5, mark ? MARK : undefined)], next: null, ...counts } };
    });

  it("lists the kept cards by default and the drafts under their own tab, with how many, fifty at a time", async () => {
    const e = list();
    act(() => root.render(<QueryPage caps={caps()} open={null} />));
    await settle();
    expect(e.calls[0].url).toBe("/api/ask/documents");
    expect([...host.querySelectorAll(".query-card-title")].map(words)).toEqual(["Card 7v1", "Card 5v1"]);
    const tabs = [...host.querySelectorAll('[role="tab"]')];
    expect(tabs.map(words)).toEqual(["Cards", "Drafts 51"]);
    expect(tabs.map((t) => t.getAttribute("aria-selected"))).toEqual(["true", "false"]);
    act(() => button(host, "Drafts 51")!.click());
    await settle();
    expect(e.calls[1].url).toBe("/api/ask/documents?kept=no");
    expect(host.querySelectorAll(".query-card-link")).toHaveLength(50);
    expect([...host.querySelectorAll('[role="tab"]')].map((t) => t.getAttribute("aria-selected"))).toEqual(["false", "true"]);
    act(() => button(host, "More")!.click());
    await settle();
    expect(e.calls[2].url).toBe("/api/ask/documents?kept=no&after=151");
    expect(host.querySelectorAll(".query-card-link")).toHaveLength(51);
    expect(button(host, "More")).toBeNull();
    // and back to the cards
    act(() => button(host, "Cards")!.click());
    await settle();
    expect(e.calls[3].url).toBe("/api/ask/documents");
    expect(host.querySelectorAll(".query-card-link")).toHaveLength(2);
  }, 20_000);

  it("shows the Drafts tab with none in it, and says what would fill it", async () => {
    list(0);
    act(() => root.render(<QueryPage caps={caps()} open={null} />));
    await settle();
    expect([...host.querySelectorAll('[role="tab"]')].map(words)).toEqual(["Cards", "Drafts 0"]);
    act(() => button(host, "Drafts 0")!.click());
    await settle();
    expect(words(host.querySelector(".lede"))).toBe("No draft. What the assistant proposes waits here until you keep it.");
  }, 20_000);

  it("is read as it always was from an engine that has no mark: every card, and no tabs", async () => {
    const e = list(0, false);
    act(() => root.render(<QueryPage caps={caps([])} open={null} />));
    await settle();
    expect(host.querySelector('[role="tablist"]')).toBeNull();
    expect(host.querySelectorAll(".query-card-link")).toHaveLength(2);
    expect(e.calls).toHaveLength(1);
  }, 20_000);
});

describe("a card", () => {
  /** The engine of the Assistant's checks, with the mark the card's line has: `marks` is who kept the first of the line, and 102 is the card opened. */
  function marked(marks: Record<number, Kept | null>, mark = true) {
    const base = fakeDoors();
    return engine((c, nth) => {
      const u = new URL(c.url, "http://x");
      const door = /^\/api\/ask\/documents\/(\d+)(\/kept)?$/.exec(u.pathname);
      if (mark && door?.[2]) {
        marks[102] = c.method === "PUT" ? (marks[102] ?? MARK) : null;
        return { status: 200, body: { document: 102, first: 102, kept: marks[102] } };
      }
      const answer = base(c, nth);
      if (mark && door && c.method === "GET" && answer) return { ...answer, body: { ...(answer.body as object), kept: marks[Number(door[1])] ?? null } };
      return answer;
    });
  }

  it("says draft and offers Keep, then says kept and offers Unkeep, each the engine's door and the card read again", async () => {
    const e = marked({});
    act(() => root.render(<QueryPage caps={caps()} open="102" />));
    await settle(14);
    const head = host.querySelector(".query-head")!;
    expect(words(head.querySelector(".tag"))).toBe("draft");
    expect(button(head, "Unkeep")).toBeNull();
    act(() => button(head, "Keep")!.click());
    await settle(14);
    expect(e.of("PUT", "/api/ask/documents/102/kept")).toHaveLength(1);
    expect(words(head.querySelector(".tag.ok"))).toBe("kept");
    // who kept it, and when, on hover
    expect(head.querySelector(".tag.ok")!.getAttribute("title")).toMatch(/^astrid, \S/);
    expect(button(head, "Keep")).toBeNull();
    act(() => button(head, "Unkeep")!.click());
    await settle(14);
    expect(e.of("DELETE", "/api/ask/documents/102/kept")).toHaveLength(1);
    expect(words(head.querySelector(".tag"))).toBe("draft");
    expect(head.querySelector(".tag.ok")).toBeNull();
    expect(button(head, "Keep")).not.toBeNull();
  }, 20_000);

  it("says the word and offers no control to a person without work on the Query page", async () => {
    marked({ 102: MARK });
    act(() => root.render(<QueryPage caps={caps(KEEP_DOORS, GRANTS.filter((g) => g !== "query:work"))} open="102" />));
    await settle(14);
    const head = host.querySelector(".query-head")!;
    expect(words(head.querySelector(".tag.ok"))).toBe("kept");
    expect(button(head, "Unkeep")).toBeNull();
    expect(button(head, "Keep")).toBeNull();
  }, 20_000);

  it("says nothing of a mark an engine from before does not have", async () => {
    marked({}, false);
    act(() => root.render(<QueryPage caps={caps([])} open="102" />));
    await settle(14);
    const head = host.querySelector(".query-head")!;
    expect(head.querySelector(".tag")).toBeNull();
    expect(button(head, "Keep")).toBeNull();
    expect(button(head, "Unkeep")).toBeNull();
  }, 20_000);
});

describe("the engine's word on a card", () => {
  it("is a yes, a no, or nothing for an engine without the mark", () => {
    expect(isKept(MARK)).toBe(true);
    expect(isKept(null)).toBe(false);
    expect(isKept(undefined)).toBeUndefined();
  });

  it("is kept or put back by a person with work on the Query page where the engine serves the door", () => {
    expect(mayKeep(caps())).toBe(true);
    expect(mayKeep(caps([]))).toBe(false);
    expect(mayKeep(caps(KEEP_DOORS, ["query:see"]))).toBe(false);
  });
});
