// SPDX-License-Identifier: AGPL-3.0-only
// One chat: what the assistant did, in plain words, one live line while it
// works and the last three steps behind a "?".

import { describe, expect, it } from "vitest";
import { type Chunk, empty, reduce } from "./parts";
import { lastSteps, liveLine, nothingYet, STARTING, stepLines, toolWords } from "./steps";

const live = (...chunks: Chunk[]) => chunks.reduce(reduce, empty());

describe("the assistant's steps", () => {
  it("say what a tool does, by family, and a skill by its plain name", () => {
    expect(toolWords("registry_search")).toBe("Looking in the registry");
    expect(toolWords("registry_describe")).toBe("Looking in the registry");
    expect(toolWords("query_draft")).toBe("Writing the query");
    expect(toolWords("plan_update")).toBe("Planning");
    expect(toolWords("activate_skill", "find-data")).toBe("Finding the data");
    expect(toolWords("activate_skill", "count_by_site")).toBe("Count by site");
    expect(toolWords("nils_diagnose")).toBe("Checking where the counts drop");
    expect(toolWords("nils_new_thing")).toBe("Using new thing");
  });
  it("never show a hand-off, a phase or the settling call", () => {
    for (const name of ["delegate", "delegation_status", "advance", "settle"]) expect(toolWords(name)).not.toMatch(/station|Moved on|Handed/);
    const tools = [
      { id: "1", name: "nils_draft", state: "done" as const },
      { id: "2", name: "advance", state: "done" as const },
      { id: "3", name: "nils_preview", state: "failed" as const },
      { id: "4", name: "settle", state: "done" as const },
    ];
    expect(stepLines(tools)).toEqual([
      { id: "1", words: "Writing the query", state: "done" },
      { id: "3", words: "Previewing the first rows", state: "failed" },
    ]);
  });
  it("show the last three behind the ?, and all on asking", () => {
    const tools = ["registry_summary", "activate_skill", "registry_search", "query_draft", "query_run_readonly"].map((name, i) => ({ id: String(i), name, state: "done" as const }));
    expect(lastSteps(tools).lines.map((l) => l.id)).toEqual(["2", "3", "4"]);
    expect(lastSteps(tools).more).toBe(2);
    expect(lastSteps(tools, true).lines).toHaveLength(5);
    expect(lastSteps(tools.slice(0, 2))).toEqual({ lines: stepLines(tools.slice(0, 2)), more: 0 });
  });
});

describe("the one live line", () => {
  it("follows the running tool, its own log line first, and goes when the answer arrives", () => {
    let s = live({ type: "message-appended", message: { id: "u1", role: "user", parts: [{ type: "text", text: "find T1w" }] } }, { type: "message-started", messageId: "a1" });
    expect(liveLine(s)).toBe("Thinking");
    s = reduce(s, { type: "tool-input", messageId: "a1", toolCallId: "t1", toolName: "activate_skill", input: { name: "find-data" } });
    expect(liveLine(s)).toBe("Finding the data");
    s = reduce(s, { type: "tool-output", toolCallId: "t1", output: "ok" });
    s = reduce(s, { type: "tool-input", messageId: "a1", toolCallId: "t2", toolName: "registry_search", input: { q: "T1w" } });
    expect(liveLine(s)).toBe("Looking in the registry");
    s = reduce(s, { type: "data-part", messageId: "a1", name: "progress", data: { kind: "progress", call: "t2", text: "Reading 12 of 40 datasets" } });
    expect(liveLine(s)).toBe("Reading 12 of 40 datasets");
    s = reduce(s, { type: "tool-output", toolCallId: "t2", output: "rows" });
    s = reduce(s, { type: "message-delta", messageId: "a1", kind: "text", delta: "There are 38." });
    expect(liveLine(s)).toBeNull();
    s = reduce(s, { type: "submission-settled", submissionId: "x", outcome: "completed" });
    expect(liveLine(s)).toBeNull();
  });

  it("says the model is starting once a turn has said nothing for a while, until its first step, reasoning or word (2026-10-09)", () => {
    const asked = { type: "message-appended", message: { id: "u1", role: "user", parts: [{ type: "text", text: "find T1w" }] } };
    // sent, and the person's words not back yet: what was answered before stays the last turn
    const sent = { ...live({ type: "message-started", messageId: "a0" }, { type: "message-delta", messageId: "a0", kind: "text", delta: "Hello." }, { type: "message-completed", messageId: "a0" }, { type: "submission-settled", submissionId: "x", outcome: "completed" }), busy: true, settled: null };
    expect(nothingYet(sent)).toBe(false);
    expect(nothingYet({ ...empty(), busy: true })).toBe(true);
    let s = reduce(sent, asked);
    expect(nothingYet(s)).toBe(true);
    s = reduce(s, { type: "message-started", messageId: "a1" });
    expect(nothingYet(s)).toBe(true);
    expect(liveLine(s)).toBe("Thinking");
    expect(liveLine(s, true)).toBe(STARTING);
    expect(liveLine(reduce(s, { type: "tool-input", messageId: "a1", toolCallId: "t1", toolName: "activate_skill", input: { name: "find-data" } }), true)).toBe("Finding the data");
    expect(liveLine(reduce(s, { type: "message-delta", messageId: "a1", kind: "reasoning", delta: "The person wants T1w." }), true)).toBe("Thinking");
    expect(liveLine(reduce(s, { type: "message-delta", messageId: "a1", kind: "text", delta: "There are 38." }), true)).toBeNull();
    expect(liveLine(reduce(s, { type: "submission-settled", submissionId: "x", outcome: "failed" }), true)).toBeNull();
  });
});
