// SPDX-License-Identifier: AGPL-3.0-only
// The identity questions by kind: collisions, files held until mapped,
// subjects coded without a map, and whatever else the engine raised; each
// the costliest first, and decided items left out.

import { describe, expect, it } from "vitest";
import type { ReviewItem } from "../ops/client";
import { byKind } from "./Identifiers";

function item(id: number, kind: string, over: Partial<ReviewItem> = {}): ReviewItem {
  return { id, kind, scope: "subject", status: "open", created_at: `2026-09-0${(id % 9) + 1}T10:00:00Z`, ...over };
}

describe("the identity questions by kind", () => {
  it("group the three kinds, and the rest apart, open ones only", () => {
    const groups = byKind([
      item(1, "identity.unmapped", { scope: "batch", evidence: { files: 18, shape: "AAA999", place: "alpha" } }),
      item(2, "identity.collision", { evidence: { sessions: 6 } }),
      item(3, "identity.collision", { status: "accepted" }),
      item(4, "identity.provisional"),
      item(5, "linkage.conflict"),
      item(6, "base:vote", { scope: "stack" }),
    ]);
    expect(groups.map((g) => [g.what, g.items.map((i) => i.id)])).toEqual([
      ["collision", [2]],
      ["unmapped", [1]],
      ["provisional", [4]],
      ["other", [5]],
    ]);
  });
  it("names no other group when every question is one of the three", () => {
    expect(byKind([item(1, "identity.collision")]).map((g) => g.what)).toEqual(["collision", "unmapped", "provisional"]);
  });
});
