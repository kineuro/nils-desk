// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// A draft the assistant proposed is a card on the Cards list once a person
// keeps it (record 55 K6): in the chat, Keep on the panel keeps the version in
// the assistant's record, in its card's line, and on the engine, whose mark
// says who kept the card and when; a kept card has Unkeep, which puts it back
// among the drafts and deletes nothing; the cards in the thread and the panel
// say kept as the engine does, whatever was decided in the conversation; and a
// person without work on the Query page, or an engine without the mark, is
// offered neither. Against a fake assistant and an engine that keeps the mark.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { button, caps7a, dialogs, engine, settle } from "../../test/safeWayIn";
import type { Kept } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { GRANTS } from "../grants";
import { AssistantPage } from "./AssistantPage";
import { fakeDoors } from "./onechat.fixture";
import { reads } from "./reads";

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

const caps = (doors: string[] = KEEP_DOORS, grants: readonly string[] = GRANTS): Capabilities => ({
  ...caps7a([...doors, "PUT /api/ask/selections/{name}", "POST /api/ask/profile"], grants),
  kvasir: { models: [{ id: "qwen38-27b", locality: "local" }] },
  assistant: { stations: [{ id: "nils" }] },
});

const MARK: Kept = { by: "astrid", at: "2026-10-16T09:00:00Z" };

/**
 * The engine as the Assistant's checks answer it, with the mark a card keeps: the mark sits on the first document
 * of a line, a document stored under a parent joins its line, and a document read says whether its card is kept.
 * `marks` is who kept which line's first document; `mark: false` is an engine from before, which says nothing.
 */
function marked(marks: Record<number, Kept | null> = {}, mark = true) {
  const base = fakeDoors();
  const line = new Map<number, number>();
  const first = (id: number): number => line.get(id) ?? id;
  return engine((c, nth) => {
    const u = new URL(c.url, "http://x");
    if (c.method === "POST" && u.pathname === "/api/ask/documents" && typeof c.body?.document_id === "number" && typeof c.body?.parent === "number") {
      line.set(c.body.document_id, first(c.body.parent));
    }
    const door = /^\/api\/ask\/documents\/(\d+)(\/kept)?$/.exec(u.pathname);
    if (mark && door?.[2]) {
      const id = Number(door[1]);
      marks[first(id)] = c.method === "PUT" ? (marks[first(id)] ?? MARK) : null;
      return { status: 200, body: { document: id, first: first(id), kept: marks[first(id)] } };
    }
    const answer = base(c, nth);
    if (mark && door && c.method === "GET" && answer) return { ...answer, body: { ...(answer.body as object), kept: marks[first(Number(door[1]))] ?? null } };
    return answer;
  });
}

async function mount(c: Capabilities = caps()) {
  act(() => root.render(<AssistantPage caps={c} conversation="c1" />));
  await settle(12);
}

/** An element's words, a space between the words of each part. */
const words = (el: Element | null): string => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const cards = () => [...host.querySelectorAll<HTMLElement>(".qcard")];
const panel = () => host.querySelector<HTMLElement>("aside.qpanel");
/** What each card in the thread says it is: kept, set aside, moved on, or nothing. */
const states = () => cards().map((c) => words(c.querySelector(".qcard-head .tag")) || null);

async function open(version: number) {
  act(() => button(cards()[version - 1], "Open")!.click());
  await settle(10);
}

describe("keeping a draft the assistant proposed", () => {
  it("keeps the version in the assistant's record, in its card's line and on the engine, and the cards say kept as the engine does", async () => {
    const e = marked();
    await mount();
    expect(states()).toEqual([null, null]);
    await open(2);
    expect(button(panel()!, "Keep v2")).not.toBeNull();
    expect(panel()!.querySelector(".tag.ok")).toBeNull();
    expect(button(panel()!, "Unkeep")).toBeNull();
    act(() => button(panel()!, "Keep v2")!.click());
    await settle(12);
    // the record, the line and the mark, in that order, each once
    const order = e.calls.filter((c) => c.method !== "GET" && /feedback|\/api\/ask\/documents/.test(c.url)).map((c) => `${c.method} ${c.url}`);
    expect(order).toEqual(["POST /assistant/conversations/c1/feedback", "POST /api/ask/documents", "PUT /api/ask/documents/102/kept"]);
    expect(e.of("PUT", "/api/ask/documents/102/kept")[0].body).toBeNull();
    expect(e.of("POST", "/api/ask/documents")[0].body).toEqual({ document_id: 102, parent: 101 });
    expect(words(panel()!.querySelector(".tag.ok"))).toBe("kept");
    // who kept it, and when, on hover
    expect(panel()!.querySelector(".tag.ok")!.getAttribute("title")).toMatch(/^astrid, \S/);
    expect(button(panel()!, "Keep v2")).toBeNull();
    expect(button(panel()!, "Unkeep")).not.toBeNull();
    // the card is a line: the first version is kept with it
    act(() => button(panel()!, "Close the query")!.click());
    await settle(12);
    expect(states()).toEqual(["kept", "kept"]);
  }, 20_000);

  it("puts a kept card back among the drafts with Unkeep, deletes nothing, and keeps it again without deciding twice", async () => {
    const e = marked();
    await mount();
    await open(2);
    act(() => button(panel()!, "Keep v2")!.click());
    await settle(12);
    act(() => button(panel()!, "Unkeep")!.click());
    await settle(12);
    expect(e.of("DELETE", "/api/ask/documents/102/kept")).toHaveLength(1);
    expect(e.calls.filter((c) => c.method === "DELETE")).toHaveLength(1);
    expect(panel()!.querySelector(".tag.ok")).toBeNull();
    expect(button(panel()!, "Unkeep")).toBeNull();
    expect(button(panel()!, "Keep v2")).not.toBeNull();
    act(() => button(panel()!, "Close the query")!.click());
    await settle(12);
    expect(states()).toEqual([null, null]);
    // kept again: the engine's mark only, the assistant had the decision and the line had the version
    await open(2);
    act(() => button(panel()!, "Keep v2")!.click());
    await settle(12);
    expect(e.of("PUT", "/api/ask/documents/102/kept")).toHaveLength(2);
    expect(e.of("POST", "/assistant/conversations/c1/feedback")).toHaveLength(1);
    expect(e.of("POST", "/api/ask/documents")).toHaveLength(1);
    expect(words(panel()!.querySelector(".tag.ok"))).toBe("kept");
  }, 20_000);

  it("says a card kept elsewhere is kept, with nothing decided in the conversation, and offers Unkeep rather than Keep", async () => {
    marked({ 101: MARK });
    await mount();
    expect(states()).toEqual(["kept", null]);
    await open(1);
    expect(words(panel()!.querySelector(".tag.ok"))).toBe("kept");
    expect(button(panel()!, "Keep v1")).toBeNull();
    expect(button(panel()!, "Unkeep")).not.toBeNull();
  }, 20_000);

  it("says the mark and offers no Unkeep to a person without work on the Query page, and no Keep either", async () => {
    marked({ 101: MARK });
    await mount(caps(KEEP_DOORS, GRANTS.filter((g) => g !== "query:work")));
    await open(1);
    expect(words(panel()!.querySelector(".tag.ok"))).toBe("kept");
    expect(button(panel()!, "Unkeep")).toBeNull();
    act(() => button(panel()!, "v2")!.click());
    await settle(8);
    expect(button(panel()!, /^Keep/)).toBeNull();
  }, 20_000);
});

describe("an engine from before the mark", () => {
  it("keeps a version in the assistant's record and its line as before, asks the engine nothing about the card, and offers no Unkeep", async () => {
    const e = marked({}, false);
    await mount(caps([]));
    await open(2);
    act(() => button(panel()!, "Keep v2")!.click());
    await settle(12);
    expect(e.of("POST", "/assistant/conversations/c1/feedback")).toHaveLength(1);
    expect(e.of("POST", "/api/ask/documents")).toHaveLength(1);
    expect(e.calls.filter((c) => /\/kept$/.test(c.url))).toEqual([]);
    expect(words(panel()!.querySelector(".tag.ok"))).toBe("kept");
    expect(button(panel()!, "Unkeep")).toBeNull();
  }, 20_000);
});
