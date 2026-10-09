// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";
import { acceptPart, answersSummarize, asPart, empty, fromHistory, type History, reduce, settledError, SUMMARIZE_ASKED, withStored, type Chunk } from "./parts";

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
    expect(s.turns[1].tools).toEqual([{ id: "t1", name: "nils_store", state: "done", words: "Using store" }]);
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
  it("takes the decisions the assistant kept, so a reload shows what was accepted", () => {
    let s = empty();
    s = acceptPart(s, "a1", { kind: "move_proposal", document: 7, parent: null, sentence: "one" });
    s = acceptPart(s, "a1", { kind: "move_proposal", document: 8, parent: 7, sentence: "two" });
    s = acceptPart(s, "a2", { kind: "move_proposal", document: 9, parent: 8, sentence: "three" });
    const kept = withStored(s, [
      { document: 7, decided: "accepted", stale: false },
      { document: 8, decided: null, stale: true },
      { document: 99, decided: "rejected", stale: false },
    ]);
    expect(kept.proposals.map((p) => [p.document, p.decided, p.stale ?? null])).toEqual([
      [7, "accepted", null],
      [8, null, { moved_to: null }],
      [9, null, null],
    ]);
  });
});

describe("a turn that failed", () => {
  // the runtime's own shape, as a history keeps it and the stream carries it
  const failure = {
    name: "FlueError",
    message: "direct(sub_1) failed: 403 Forbidden: the key's purposes do not include assistant.operator (refused)",
    type: "operation_failed",
    details: "the model gateway refused the request",
  };
  it("reads the words out of the error a history kept, so opening the conversation draws a sentence", () => {
    const s = fromHistory({
      messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: "plan the digest" }] }],
      settlements: [{ submissionId: "x", outcome: "failed", error: failure }],
    });
    expect(s.settled).toEqual({ outcome: "failed", error: failure.message });
  });
  it("reads the same words out of the stream", () => {
    const s = reduce(empty(), { type: "submission-settled", submissionId: "x", outcome: "failed", error: failure });
    expect(s.settled).toEqual({ outcome: "failed", error: failure.message });
  });
  it("keeps a sentence as it is and has no words for an error without a message", () => {
    expect(settledError(" the model did not answer ")).toBe("the model did not answer");
    expect(settledError({ type: "internal_error" })).toBeUndefined();
    expect(settledError("")).toBeUndefined();
    expect(settledError(null)).toBeUndefined();
    expect(settledError(undefined)).toBeUndefined();
    expect(fromHistory({ messages: [], settlements: [{ submissionId: "x", outcome: "failed", error: { type: "internal_error" } }] }).settled).toEqual({ outcome: "failed" });
  });
});

describe("a turn that settled without words", () => {
  it("keeps the sentence it settled on, live and from the history", () => {
    const live = reduce(reduce(empty(), { type: "message-started", messageId: "a1" }), { type: "data-part", messageId: "a1", data: { kind: "status", phase: "finish", text: "It was titled Sessions per cohort." } });
    expect(live.finals).toEqual({ a1: "It was titled Sessions per cohort." });
    const working = reduce(live, { type: "data-part", messageId: "a2", data: { kind: "status", phase: "plan", text: "planning" } });
    expect(working.finals).toEqual({ a1: "It was titled Sessions per cohort." });
    const read = fromHistory({ messages: [{ id: "a1", role: "assistant", parts: [{ type: "data-status", data: { kind: "status", phase: "finish", text: "done" } }] }] });
    expect(read.finals).toEqual({ a1: "done" });
  });
});

describe("a turn still running when its conversation is opened again (2026-10-09)", () => {
  // the runtime's history while a turn runs: the person's words, a notice and the answer carry their submission, which has not settled
  const before = [
    { id: "u0", role: "user", display: "visible", submissionId: "sub_0", parts: [{ type: "text", text: "Stop that." }] },
    { id: "a0", role: "assistant", display: "visible", submissionId: "sub_0", parts: [] },
  ];
  const asked = { id: "u1", role: "user", display: "visible", submissionId: "sub_1", parts: [{ type: "text", text: "Which datasets have a FLAIR?" }] };
  const notice = { id: "s1", role: "system", display: "diagnostic", submissionId: "sub_1", parts: [{ type: "text", text: "The tools for this turn." }] };
  const answer = (parts: History["messages"][number]["parts"]) => ({ id: "a1", role: "assistant", display: "visible", submissionId: "sub_1", parts });
  const stopped = [{ submissionId: "sub_0", outcome: "aborted" }];

  it("is running while the model has said nothing, its answer open and the turn before's ending not shown", () => {
    const s = fromHistory({ offset: "4", messages: [...before, asked, notice, answer([])], settlements: stopped });
    expect(s.busy).toBe(true);
    expect(s.settled).toBeNull();
    expect(s.offset).toBe("4");
    expect(s.turns.map((t) => [t.id, t.done])).toEqual([
      ["u0", true],
      ["a0", true],
      ["u1", true],
      ["a1", false],
    ]);
  });

  it("is running before its answer has begun", () => {
    const s = fromHistory({ offset: "3", messages: [...before, asked, notice], settlements: stopped });
    expect(s.busy).toBe(true);
    expect(s.settled).toBeNull();
  });

  it("is running past its steps, and the words still to come begin a step of their own", () => {
    const s = fromHistory({
      offset: "27",
      messages: [asked, answer([{ type: "text", text: "Let me look." }, { type: "dynamic-tool", toolCallId: "t1", toolName: "registry_search", state: "output-available" }])],
      settlements: [],
    });
    expect(s.busy).toBe(true);
    expect(s.turns[1]).toMatchObject({ text: "Let me look.", done: false, tools: [{ id: "t1", state: "done" }] });
    const next = (
      [
        { type: "message-delta", messageId: "a1", kind: "text", delta: "Two of them: ds-a and ds-b." },
        { type: "message-completed", messageId: "a1" },
        { type: "submission-settled", submissionId: "sub_1", outcome: "completed" },
      ] as Chunk[]
    ).reduce(reduce, s);
    expect(next.turns[1]).toMatchObject({ text: "Let me look.\n\nTwo of them: ds-a and ds-b.", done: true });
    expect(next.busy).toBe(false);
    expect(next.settled).toEqual({ outcome: "completed" });
  });

  it("is over once its submission settled", () => {
    const s = fromHistory({ offset: "44", messages: [asked, answer([{ type: "text", text: "Two of them." }])], settlements: [...stopped, { submissionId: "sub_1", outcome: "completed" }] });
    expect(s.busy).toBe(false);
    expect(s.settled).toEqual({ outcome: "completed" });
    expect(s.turns.every((t) => t.done)).toBe(true);
  });

  it("is still followed when the stream sends the conversation again in the middle of it", () => {
    // a summary or a retried step resets the stream while the turn runs
    const live = (
      [
        { type: "message-appended", message: asked },
        { type: "message-started", messageId: "a1" },
      ] as Chunk[]
    ).reduce(reduce, fromHistory({ offset: "1", messages: before, settlements: stopped }));
    const reset = reduce(live, { type: "conversation-reset", snapshot: { offset: "9", messages: [...before, asked, answer([])], settlements: stopped } });
    expect(reset.busy).toBe(true);
    expect(reset.settled).toBeNull();
  });
});

describe("an answer of several steps (2026-10-09)", () => {
  const asked = { id: "u1", role: "user", display: "visible", submissionId: "sub_1", parts: [{ type: "text", text: "Which datasets have a FLAIR?" }] };
  const settled: Chunk = { type: "submission-settled", submissionId: "sub_1", outcome: "completed" };

  it("stays open while its later steps run, and is done when its turn settles", () => {
    let s = (
      [
        { type: "message-appended", message: asked },
        { type: "message-started", messageId: "a1", submissionId: "sub_1" },
        { type: "tool-input", messageId: "a1", toolCallId: "t1", toolName: "registry_search", input: {} },
        { type: "message-completed", messageId: "a1" },
      ] as Chunk[]
    ).reduce(reduce, empty());
    // the step that called the tool ended; the tool still runs
    expect(s.turns[1]).toMatchObject({ done: false, tools: [{ id: "t1", state: "running" }] });
    s = (
      [
        { type: "tool-output", toolCallId: "t1", output: "rows" },
        { type: "message-started", messageId: "a1", submissionId: "sub_1" },
        { type: "message-delta", messageId: "a1", kind: "text", delta: "Two of them." },
        { type: "message-completed", messageId: "a1" },
      ] as Chunk[]
    ).reduce(reduce, s);
    expect(s.turns[1]).toMatchObject({ text: "Two of them.", done: false });
    expect(reduce(s, settled).turns[1].done).toBe(true);
  });

  it("is open again at a later step where its turn is not tracked, and done at each step's end", () => {
    let s = (
      [
        { type: "message-started", messageId: "a1" },
        { type: "message-completed", messageId: "a1" },
      ] as Chunk[]
    ).reduce(reduce, empty());
    expect(s.turns[0].done).toBe(true);
    s = reduce(s, { type: "message-started", messageId: "a1" });
    expect(s.turns[0].done).toBe(false);
    expect(reduce(s, { type: "message-completed", messageId: "a1" }).turns[0].done).toBe(true);
  });

  it("read from a history while it runs, stays open through the steps that follow", () => {
    const s = fromHistory({ offset: "4", messages: [asked, { id: "a1", role: "assistant", display: "visible", submissionId: "sub_1", parts: [] }], settlements: [] });
    const next = (
      [
        { type: "tool-input", messageId: "a1", toolCallId: "t1", toolName: "registry_search", input: {} },
        { type: "message-completed", messageId: "a1" },
      ] as Chunk[]
    ).reduce(reduce, s);
    expect(next.turns[1].done).toBe(false);
    expect(reduce(next, settled).turns[1].done).toBe(true);
  });
});

describe("where the person asked to summarize (the chat, slice 11)", () => {
  // the runtime keeps a signal out of sight, with the tag it was sent with
  const mark = { id: "s1", role: "system", display: "diagnostic", purpose: "dispatch", signal: { tagName: "summarize" }, parts: [{ type: "text", text: "The person asked to summarize the conversation so far." }] };
  const asked = { id: "u1", role: "user", display: "visible", parts: [{ type: "text", text: "how many cohorts" }] };

  it("shows as a quiet line, live and from the history, and the one line that answered takes no actions", () => {
    let s = empty();
    for (const c of [
      { type: "message-appended", message: asked },
      { type: "message-appended", message: mark },
      { type: "message-appended", message: mark },
      { type: "message-started", messageId: "a2" },
      { type: "message-delta", messageId: "a2", kind: "text", delta: "The earlier conversation is being summarized." },
    ] as Chunk[])
      s = reduce(s, c);
    expect(s.turns.map((t) => [t.id, t.role, t.text])).toEqual([
      ["u1", "user", "how many cohorts"],
      ["s1", "system", SUMMARIZE_ASKED],
      ["a2", "assistant", "The earlier conversation is being summarized."],
    ]);
    expect(answersSummarize(s.turns, "a2")).toBe(true);
    expect(answersSummarize(s.turns, "u1")).toBe(false);
    const read = fromHistory({ messages: [asked, mark, { id: "a2", role: "assistant", display: "visible", parts: [{ type: "text", text: "Summarizing." }] }] });
    expect(read.turns.map((t) => t.role)).toEqual(["user", "system", "assistant"]);
    expect(answersSummarize(read.turns, "a2")).toBe(true);
    // a signal with no tag, or another tag, stays out of the thread
    const other = { ...mark, signal: { tagName: "registry" } };
    expect(fromHistory({ messages: [other] }).turns).toEqual([]);
  });
});
