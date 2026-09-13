// SPDX-License-Identifier: AGPL-3.0-only
// A person's conversations as the side and the page of all conversations show them.

import { describe, expect, it } from "vitest";
import { type Chat, ChatError, chatTitle, groupsOf, importHere, meterOf, sidePages, toImport } from "./chats";

const chat = (id: string, updated: string, o: Partial<Chat> = {}): Chat => ({
  id,
  station: "ask-help",
  title: `talk ${id}`,
  title_by: "person",
  lineage: null,
  document: null,
  created_at: updated,
  updated_at: updated,
  pinned: false,
  archived: false,
  forked_from: null,
  ...o,
});

describe("a person's conversations", () => {
  it("are grouped pinned first, then by the day they were last used", () => {
    const now = new Date(2026, 8, 13, 15, 0);
    const rows = [
      chat("p", new Date(2026, 7, 1).toISOString(), { pinned: true }),
      chat("t", new Date(2026, 8, 13, 9, 0).toISOString()),
      chat("y", new Date(2026, 8, 12, 23, 0).toISOString()),
      chat("w", new Date(2026, 8, 8, 12, 0).toISOString()),
      chat("e", new Date(2026, 8, 6, 12, 0).toISOString()),
    ];
    expect(groupsOf(rows, now).map((g) => [g.label, g.chats.map((c) => c.id)])).toEqual([
      ["Pinned", ["p"]],
      ["Today", ["t"]],
      ["Yesterday", ["y"]],
      ["This week", ["w"]],
      ["Earlier", ["e"]],
    ]);
    expect(groupsOf([], now)).toEqual([]);
  });

  it("put the pinned and the latest in the side, and name one that has no name", () => {
    const rows = [chat("a", "2026-09-13T10:00:00Z", { pinned: true }), ...Array.from({ length: 10 }, (_, i) => chat(`r${i}`, "2026-09-13T09:00:00Z"))];
    expect(sidePages(rows).map((p) => p.id)).toEqual(["a", "r0", "r1", "r2", "r3", "r4", "r5", "r6", "r7"]);
    expect(sidePages(rows)[0]).toEqual({ id: "a", title: "talk a", depth: 1 });
    expect(chatTitle({ title: null })).toBe("A conversation");
    expect(chatTitle({ title: "  " })).toBe("A conversation");
  });

  it("kept by an older desk in this browser are offered to the assistant once, and keep their names", async () => {
    const stored = new Map<string, string>();
    const storage = { getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => void stored.set(k, v) };
    const local = [
      { id: "c-mine", parent: null, document: null, at: "2026-09-10T10:00:00Z", station: "ask-help", title: "T1w after contrast" },
      { id: "c-gone", parent: null, document: null, at: "2026-09-10T10:00:00Z" },
      { id: "c-later", parent: null, document: null, at: "2026-09-10T10:00:00Z", title: "asked when the assistant was away" },
    ];
    let away = true;
    const named: [string, string | null | undefined][] = [];
    const get = async (id: string) => {
      if (id === "c-later" && away) throw new TypeError("fetch failed");
      if (id === "c-gone") throw new ChatError(404, "no conversation c-gone");
      return { ...chat(id, "2026-09-10T10:00:00Z", { title: null }), proposals: [] };
    };
    const patch = async (id: string, p: { title?: string | null }) => {
      named.push([id, p.title]);
      return chat(id, "2026-09-10T10:00:00Z");
    };
    expect(await importHere({ local: () => local, storage, get, patch })).toBe(1);
    expect(named).toEqual([["c-mine", "T1w after contrast"]]);
    // the one the assistant could not be asked about is offered again, and nothing else is
    away = false;
    expect(await importHere({ local: () => local, storage, get, patch })).toBe(1);
    expect(named).toEqual([
      ["c-mine", "T1w after contrast"],
      ["c-later", "asked when the assistant was away"],
    ]);
    expect(await importHere({ local: () => local, storage, get, patch })).toBe(0);
    expect(toImport(local, ["c-mine"]).map((c) => c.id)).toEqual(["c-gone", "c-later"]);
  });
});

describe("a conversation's context", () => {
  it("reads as its share of the model's window, amber from 70%, and not at all while unknown", () => {
    expect(meterOf({ tokens: 24_810, window: 65_536, compactions: 0, compacted_at: null })).toMatchObject({ percent: 38, words: "38% of 64k", tone: "plain" });
    expect(meterOf({ tokens: 47_000, window: 65_536, compactions: 1, compacted_at: "2026-09-14T10:00:00Z" })?.tone).toBe("caution");
    expect(meterOf({ tokens: 90_000, window: 65_536, compactions: 0, compacted_at: null })?.percent).toBe(100);
    expect(meterOf({ tokens: null, window: 65_536, compactions: 0, compacted_at: null })).toBeNull();
    expect(meterOf({ tokens: 10, window: null, compactions: 0, compacted_at: null })).toBeNull();
    expect(meterOf(undefined)).toBeNull();
  });
});
