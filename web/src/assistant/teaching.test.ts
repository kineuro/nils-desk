// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";
import { type Candidate, type FineTuneJob, gateWords, jobWords, nextStep, promotable, promotionWords, recipeOf, rollbackWords, running } from "./teaching";

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
  it("offers each candidate one next step, blocked with the reason where it may not be taken", () => {
    const passed = { suite: "s", version: "1", passed: true, failed: [], record: 1, at: 0 };
    const bench = { id: 1, candidate: 2, at: 0, passed: 36, of: 36, strict: 36, median_seconds: 15, dry: true, note: null };
    expect(nextStep(candidate({}), true)).toEqual({ verb: "admit", label: "Admit", reason: null });
    expect(nextStep(candidate({ admission: { ...passed, passed: false, failed: ["schema"] } }), true)?.label).toBe("Admit again");
    expect(nextStep(candidate({ admission: passed, gates: { admission: true, bench: false, refused: "r" } }), true)).toEqual({ verb: "bench", label: "Bench", reason: null });
    expect(nextStep(candidate({ admission: passed, bench: { ...bench, passed: 30 }, gates: { admission: true, bench: false, refused: "r" } }), true)?.label).toBe("Bench again");
    expect(nextStep(candidate({ admission: passed, bench, state: "admitted", gates: { admission: true, bench: true, refused: null } }), true)).toEqual({ verb: "promote", label: "Promote", reason: null });
    expect(nextStep(candidate({ state: "promoted", gates: { admission: true, bench: true, refused: null } }), true)).toEqual({ verb: "retire", label: "Roll back", reason: null });
    expect(nextStep(candidate({ state: "retired" }), true)).toBeNull();
    expect(nextStep(candidate({}), false)?.reason).toBe("needs kvasir:work");
  });
  it("says what a roll back changes", () => {
    expect(rollbackWords(candidate({ state: "promoted" }))[0]).toBe("b+lora-set1-job1 is retired, and card0 routes every purpose to the model it is configured with again.");
  });
  it("reads a recipe from the form, refused in words where the assistant would refuse it", () => {
    expect(recipeOf({ base: " flash-next ", steps: "20", rank: "8", lr: "0.0001" })).toEqual({ base: "flash-next", method: "lora", steps: 20, rank: 8, lr: 0.0001 });
    expect(recipeOf({ base: "", steps: "20", rank: "8", lr: "0.0001" })).toEqual({ refused: "Name the base model." });
    expect(recipeOf({ base: "b", steps: "2.5", rank: "8", lr: "0.0001" })).toHaveProperty("refused");
    expect(recipeOf({ base: "b", steps: "20", rank: "513", lr: "0.0001" })).toHaveProperty("refused");
    expect(recipeOf({ base: "b", steps: "20", rank: "8", lr: "0" })).toHaveProperty("refused");
    expect(recipeOf({ base: "b", steps: "", rank: "8", lr: "0.1" })).toHaveProperty("refused");
  });
  it("says a job's state and what it left", () => {
    const j: FineTuneJob = { id: 1, set_id: 3, subject: "a", recipe: { base: "b", method: "lora", steps: 20, rank: 8, lr: 0.0001 }, state: "running", started_at: "", finished_at: null, outcome: null, candidate: null, error: null };
    expect(jobWords(j)).toEqual({ tone: "caution", state: "running", result: "set 3, 20 steps on b" });
    expect(jobWords({ ...j, state: "failed", error: "no torch" })).toEqual({ tone: "blocked", state: "failed", result: "no torch" });
    expect(jobWords({ ...j, state: "done", candidate: 2, outcome: { dry: false, base: "b", steps: 20, adapter: "a", set_digest: "d", note: "" } }).result).toBe("candidate 2");
    expect(running([j])).toBe(true);
    expect(running([{ ...j, state: "done" }])).toBe(false);
  });
});
