// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";
import { acceptPart, asPart, empty, fromHistory, reduce, type Chunk } from "./parts";

describe("the closed union of parts (section 9.8)", () => {
  it("admits exactly the eight shapes and drops the rest", () => {
    expect(asPart({ kind: "move_proposal", document: 12, parent: 11, sentence: "narrow to one cohort" })).toEqual({ kind: "move_proposal", document: 12, parent: 11, sentence: "narrow to one cohort" });
    expect(asPart({ kind: "move_proposal", document: "12", parent: null, sentence: "x" })).toBeNull();
    expect(asPart({ kind: "choice", question: "which cohort", options: [{ label: "a", count: 3 }, { label: "b" }, { nope: 1 }] })).toEqual({ kind: "choice", question: "which cohort", options: [{ label: "a", count: 3 }, { label: "b", count: null }] });
    expect(asPart({ kind: "status", phase: "shape", text: "storing" })).toEqual({ kind: "status", phase: "shape", text: "storing" });
    expect(asPart({ kind: "handle_ref", handle: 4 })).toEqual({ kind: "handle_ref", handle: 4 });
    expect(asPart({ kind: "navigate", to: "#settings" })).toBeNull();
    expect(asPart({ kind: "note" })).toBeNull();
    expect(asPart("note")).toBeNull();
    expect(asPart({ kind: "funnel", rows: [{ set: "a", stage: "scope", rows: 3, subjects: 2 }, { set: "b" }] })).toEqual({ kind: "funnel", rows: [{ set: "a", stage: "scope", rows: 3, subjects: 2 }] });
  });

  it("lets each part touch one thing", () => {
    let s = empty();
    s = acceptPart(s, "m1", { kind: "move_proposal", document: 5, parent: 4, sentence: "count" });
    s = acceptPart(s, "m1", { kind: "move_proposal", document: 5, parent: 4, sentence: "count again" });
    s = acceptPart(s, "m1", { kind: "status", phase: "refine", text: "one move" });
    s = acceptPart(s, "m1", { kind: "handle_ref", handle: 9 });
    s = acceptPart(s, "m1", { kind: "handle_ref", handle: 9 });
    s = acceptPart(s, "m1", { kind: "lookup", level: "cohort", field: "name", values: ["a"] });
    s = acceptPart(s, "m1", { kind: "surprise", text: "dropped" });
    expect(s.proposals).toEqual([{ document: 5, parent: 4, sentence: "count", turn: "m1", decided: null }]);
    expect(s.status).toEqual({ phase: "refine", text: "one move" });
    expect(s.handles).toEqual([9]);
    expect(s.aside).toHaveLength(1);
  });
});

describe("the reducer over the live stream", () => {
  const chunks: Chunk[] = [
    { type: "message-appended", message: { id: "u1", role: "user", display: "visible", parts: [{ type: "text", text: "how many subjects" }] } },
    { type: "message-appended", message: { id: "s1", role: "system", display: "hidden", parts: [{ type: "text", text: "a signal" }] } },
    { type: "message-appended", message: { id: "s2", role: "system", display: "visible", parts: [{ type: "text", text: "System instructions updated." }] } },
    { type: "message-started", messageId: "a1" },
    { type: "message-delta", messageId: "a1", kind: "reasoning", delta: "hmm" },
    { type: "message-delta", messageId: "a1", kind: "text", delta: "Count" },
    { type: "message-delta", messageId: "a1", kind: "text", delta: "ing." },
    { type: "tool-input", messageId: "a1", toolCallId: "t1", toolName: "nils_store", input: {} },
    { type: "tool-output", toolCallId: "t1", output: { document: 7 } },
    { type: "data-part", messageId: "a1", name: "status", data: { kind: "status", phase: "check", text: "diagnosing" } },
    { type: "data-part", messageId: "a1", name: "move_proposal", data: { kind: "move_proposal", document: 7, parent: null, sentence: "the count of subjects" } },
    { type: "data-part", messageId: "a1", name: "choice", data: { kind: "choice", question: "which", options: [{ label: "a", count: 1 }] } },
    { type: "message-started", messageId: "a1" },
    { type: "message-completed", messageId: "a1" },
    { type: "stream-checkpoint" },
    { type: "submission-settled", submissionId: "x", outcome: "completed" },
  ];
  it("builds the turns, the tools, the proposal, the choice and the settlement", () => {
    const s = chunks.reduce(reduce, empty());
    expect(s.turns.map((t) => [t.id, t.role, t.text, t.done])).toEqual([
      ["u1", "user", "how many subjects", true],
      ["a1", "assistant", "Counting.", true],
    ]);
    expect(s.turns[1].tools).toEqual([{ id: "t1", name: "nils_store", state: "done" }]);
    expect(s.proposals).toEqual([{ document: 7, parent: null, sentence: "the count of subjects", turn: "a1", decided: null }]);
    expect(s.choice?.options).toEqual([{ label: "a", count: 1 }]);
    expect(s.status?.phase).toBe("check");
    expect(s.busy).toBe(false);
    expect(s.settled).toEqual({ outcome: "completed" });
  });
  it("is busy from the first assistant chunk to the settlement, and a new turn clears the old choice", () => {
    const mid = chunks.slice(0, 12).reduce(reduce, empty());
    expect(mid.busy).toBe(true);
    expect(mid.choice).not.toBeNull();
    const next = reduce(mid, { type: "message-started", messageId: "a2" });
    expect(next.choice).toBeNull();
  });
  it("rebuilds from a history snapshot and keeps decided proposals decided", () => {
    const live = chunks.reduce(reduce, empty());
    const decided = { ...live, proposals: live.proposals.map((p) => ({ ...p, decided: "rejected" as const })) };
    const h = {
      offset: "3_0",
      messages: [
        { id: "u1", role: "user", display: "visible", parts: [{ type: "text", text: "how many subjects" }] },
        { id: "a1", role: "assistant", parts: [{ type: "text", text: "Counting." }, { type: "dynamic-tool", toolCallId: "t1", toolName: "nils_store", state: "output-available" }, { type: "data-move_proposal", data: { kind: "move_proposal", document: 7, parent: null, sentence: "the count of subjects" } }] },
      ],
      settlements: [{ submissionId: "x", outcome: "completed" }],
    };
    const s = fromHistory(h, decided);
    expect(s.offset).toBe("3_0");
    expect(s.turns).toHaveLength(2);
    expect(s.proposals[0].decided).toBe("rejected");
    expect(s.busy).toBe(false);
    expect(reduce(decided, { type: "conversation-reset", snapshot: h }).turns).toHaveLength(2);
  });
});
