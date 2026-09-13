// SPDX-License-Identifier: AGPL-3.0-only
// The Audit page's words: when, who acted for whom, and what an act touched.

import { describe, expect, it } from "vitest";
import { actionsOf, actorWords, scopeWords, whenWords } from "./audit";

describe("an act", () => {
  it("says when it was done, in the log's own UTC", () => {
    expect(whenWords("2026-09-13T01:37:36Z")).toMatch(/13 Sept? 2026.*01:37 UTC$/);
    expect(whenWords(undefined)).toBe("");
    expect(whenWords("not a time")).toBe("not a time");
  });

  it("says who acted for the principal", () => {
    expect(actorWords({ kind: "absent" })).toBeNull();
    expect(actorWords(null)).toBeNull();
    expect(actorWords({ kind: "person", name: "anna" })).toBe("anna");
    expect(actorWords({ kind: "agent", name: "operator", model: "qwen38-27b" })).toBe("the assistant, operator, qwen38-27b");
  });

  it("says what it touched on one line", () => {
    expect(scopeWords({ archive: "78195d1d-20260913013736", files: 3, pruned: [] })).toBe("archive 78195d1d-20260913013736 · files 3 · pruned []");
    expect(scopeWords({ every: "day", at: "02:00", day: null, keep: 14 })).toBe("every day · at 02:00 · keep 14");
    expect(scopeWords({ a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7 })).toBe("a 1 · b 2 · c 3 · d 4 · e 5 · and 2 more");
    expect(scopeWords(null)).toBe("");
  });

  it("names the acts the rows hold, once each", () => {
    expect(actionsOf([{ action: "backup" }, { action: "place.add" }, { action: "backup" }, {}])).toEqual(["backup", "place.add"]);
  });
});
