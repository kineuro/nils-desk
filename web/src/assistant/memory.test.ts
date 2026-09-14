// SPDX-License-Identifier: AGPL-3.0-only
// Memory as the Memory page reads it.

import { describe, expect, it } from "vitest";
import { asked, budgetWords, charsLeft, fromWork, type MemoryItem, sourceWords } from "./memory";

const item = (id: number, o: Partial<MemoryItem>): MemoryItem => ({
  id,
  kind: "person",
  text: `memory ${id}`,
  source: "page",
  station: "desk",
  at: "2026-09-14T10:00:00Z",
  edited_at: null,
  used_at: null,
  ...o,
});

describe("a person's memory", () => {
  it("parts what they asked to keep from what their work left", () => {
    const items = [item(1, {}), item(2, { kind: "study", source: "work" }), item(3, { source: "said" }), item(4, { kind: "correction", source: null })];
    expect(asked(items).map((i) => i.id)).toEqual([1, 3]);
    expect(fromWork(items).map((i) => i.id)).toEqual([2, 4]);
  });

  it("says how each came to be kept, and how much room is left", () => {
    expect(sourceWords(item(1, { source: "said" }))).toBe("you asked in a conversation");
    expect(sourceWords(item(1, { source: "accepted" }))).toBe("you accepted it");
    expect(sourceWords(item(1, { kind: "study", source: "work" }))).toBe("from a query you settled");
    expect(sourceWords(item(1, { kind: "correction", source: null }))).toBe("from a proposal you disregarded");
    expect(charsLeft("  twelve chars  ")).toBe(288);
    expect(charsLeft("x".repeat(10), 4000)).toBe(3990);
  });

  it("says how much of what they asked to keep a new conversation reads", () => {
    expect(budgetWords([item(1, { text: "x".repeat(1200) }), item(2, { kind: "study", source: "work", text: "y".repeat(4000) })])).toBe("1,200 of 3,000 characters: a new conversation reads all of it.");
    expect(budgetWords([item(1, { text: "x".repeat(2000) }), item(2, { text: "z".repeat(1500) })])).toBe(
      "3,500 characters, past the 3,000 a new conversation reads: it reads what is closest to your first message, and the assistant looks up the rest when you refer to it.",
    );
  });
});
