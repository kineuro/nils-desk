// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";
import { type Candidate, gateWords, promotable, promotionWords } from "./teaching";

function candidate(over: Partial<Candidate>): Candidate {
  return { id: 2, model: "b+lora-set1-job1", backend: "card0", source: { kind: "fine-tune", job: 1, recipe: {} }, state: "registered", admission: null, proposal: null, notes: null, bench: null, gates: { admission: false, bench: false, refused: "candidate 2 is not promoted: the admission suite has not passed and the bench has not run" }, job: null, ...over };
}

describe("the Teaching page's words", () => {
  it("names both gates, and blocks promotion with the reason while either is not green", () => {
    const c = candidate({});
    expect(gateWords(c)).toEqual({ admission: "not run", bench: "not run" });
    expect(promotable(c)).toEqual({ enabled: false, reason: c.gates.refused });
    const green = candidate({ state: "admitted", admission: { suite: "s", version: "1", passed: true, failed: [], record: 1, at: 0 }, bench: { id: 1, candidate: 2, at: 0, passed: 36, of: 36, strict: 36, median_seconds: 15, dry: true, note: null }, gates: { admission: true, bench: true, refused: null } });
    expect(gateWords(green)).toEqual({ admission: "passed", bench: "36 of 36 (recorded, not live), median 15 s" });
    expect(promotable(green)).toEqual({ enabled: true, reason: null });
    expect(promotable(candidate({ state: "promoted", gates: { admission: true, bench: true, refused: null } })).reason).toBe("already the promoted model");
  });
  it("says what a promotion changes", () => {
    expect(promotionWords(candidate({}), [{ backend: "card0", model: "b" }])).toEqual(["card0 routes every purpose to b+lora-set1-job1.", "b is retired.", "The candidate came from fine-tune job 1 with its recipe recorded."]);
  });
});
