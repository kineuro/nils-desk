// SPDX-License-Identifier: AGPL-3.0-only
// The lines a conversation shows for what the assistant did.

import { describe, expect, it } from "vitest";
import { foldedSteps, stepLines, toolWords } from "./steps";

describe("the assistant's steps", () => {
  it("name known tools by what they do and others by their name", () => {
    expect(toolWords("nils_diagnose")).toBe("Checked where the counts drop");
    expect(toolWords("nils_new_thing")).toBe("Used new thing");
  });
  it("leave out the settling call and keep the order", () => {
    const tools = [
      { id: "1", name: "nils_draft", state: "done" as const },
      { id: "2", name: "nils_preview", state: "failed" as const },
      { id: "3", name: "settle", state: "done" as const },
    ];
    expect(stepLines(tools)).toEqual([
      { id: "1", words: "Drafted the query", state: "done" },
      { id: "2", words: "Previewed the first rows", state: "failed" },
    ]);
    expect(foldedSteps(tools)).toEqual({ last: "Previewed the first rows", earlier: 1 });
    expect(foldedSteps([])).toBeNull();
  });
});
