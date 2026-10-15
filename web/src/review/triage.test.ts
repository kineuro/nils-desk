// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";
import type { ReviewItem } from "../ops/client";
import { costOf, kindOf, kindWords, needsReading, sortByCost } from "./triage";

function item(id: number, kind: string, scope: string, members: number | null = null, status = "open"): ReviewItem {
  return { id, kind, scope, status, created_at: `2026-09-0${(id % 9) + 1}T10:00:00Z`, members };
}

describe("review triage", () => {
  it("reads a kind's two halves", () => {
    expect(kindOf("technique:low_confidence")).toEqual({ area: "technique", what: "low_confidence", classifier: true });
    expect(kindOf("identity.conflict")).toEqual({ area: "identity", what: "conflict", classifier: false });
    expect(kindWords("base:vote")).toBe("base: rules disagree");
    expect(kindWords("session.overlap")).toBe("session overlap");
  });
  it("sorts by what an item costs if wrong: identity, then a vote, then low confidence, wider scope and more members first", () => {
    const items = [item(1, "technique:missing", "stack"), item(2, "identity.conflict", "subject"), item(3, "base:vote", "stack", 40), item(4, "base:low_confidence", "series"), item(5, "base:decision", "stack", null, "decided")];
    expect(sortByCost(items).map((i) => i.id)).toEqual([2, 3, 4, 1, 5]);
    expect(costOf(item(6, "base:vote", "stack", 400))).toBeGreaterThan(costOf(item(7, "base:vote", "stack", 4)));
  });
  it("names the items that need reading", () => {
    expect(needsReading(item(1, "identity.conflict", "subject"))).toMatch(/identity/);
    expect(needsReading(item(2, "base:vote", "stack"))).toMatch(/disagreed/);
    expect(needsReading(item(3, "base:low_confidence", "stack"))).toMatch(/not confident/);
    expect(needsReading(item(4, "technique:missing", "stack"))).toBeNull();
  });
});
