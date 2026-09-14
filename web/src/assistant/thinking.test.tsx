// SPDX-License-Identifier: AGPL-3.0-only
// The chat, slice 9: what a model reasoned shows as thinking, folded, and never
// as its answer, whether its runtime separated it or left it inline, live and
// after a reload; each step's words stay a paragraph apart.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { type Chunk, empty, fromHistory, joinSteps, reduce } from "./parts";
import { TurnView } from "./TurnView";

const live = (...chunks: Chunk[]) => chunks.reduce(reduce, empty());

const view = (turn: Parameters<typeof TurnView>[0]["turn"]) =>
  renderToStaticMarkup(<TurnView turn={turn} open={false} onToggle={() => undefined} proposals={[]} choice={null} onChoose={() => undefined} />);

describe("thinking kept apart from the answer", () => {
  it("gathers separated and inline reasoning as thinking while a reply streams, step by step", () => {
    const state = live(
      { type: "message-started", messageId: "a1" },
      { type: "message-delta", messageId: "a1", kind: "reasoning", delta: "The runtime " },
      { type: "message-delta", messageId: "a1", kind: "reasoning", delta: "separated this." },
      { type: "message-delta", messageId: "a1", kind: "text", delta: "<think>\nAnd left" },
      { type: "message-delta", messageId: "a1", kind: "text", delta: " this inline.</think>\n\nLet me count." },
      { type: "message-started", messageId: "a1" },
      { type: "message-delta", messageId: "a1", kind: "text", delta: "<|channel>thought\nSumming.<channel|>There are 38." },
    );
    expect(state.turns[0]?.text).toBe("Let me count.\n\nThere are 38.");
    expect(state.turns[0]?.thinking).toBe("The runtime separated this.\n\nAnd left this inline.\n\nSumming.");
  });

  it("reads the same from a reloaded history", () => {
    const state = fromHistory({
      messages: [
        {
          id: "a1",
          role: "assistant",
          parts: [
            { type: "reasoning", text: "The runtime separated this." },
            { type: "text", text: "<think>\nAnd left this inline.</think>\n\nLet me count." },
            { type: "dynamic-tool", toolCallId: "c1", toolName: "nils_describe", state: "output-available" },
            { type: "text", text: "<|channel>thought\nSumming.<channel|>There are 38." },
          ],
        },
      ],
    });
    expect(state.turns[0]?.text).toBe("Let me count.\n\nThere are 38.");
    expect(state.turns[0]?.thinking).toBe("The runtime separated this.\n\nAnd left this inline.\n\nSumming.");
    expect(state.turns[0]?.tools).toHaveLength(1);
  });

  it("folds the thinking above the answer, and keeps it out of the answer", () => {
    const turn = { id: "a1", role: "assistant" as const, text: "There are 38.", thinking: "Summing the cohorts.", done: true, tools: [] };
    const html = view(turn);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("Reasoning");
    expect(html).toContain("3 words");
    expect(html).not.toContain("Summing the cohorts.");
    expect(html).toContain("There are 38.");
    expect(view({ ...turn, text: "", done: false })).toContain('class="grow thinking-live">Thinking</span>');
    expect(view({ ...turn, thinking: "" })).not.toContain("Reasoning");
  });

  it("joins two steps' words a paragraph apart", () => {
    expect(joinSteps("a", "b")).toBe("a\n\nb");
    expect(joinSteps("a\n", "b")).toBe("a\n\nb");
    expect(joinSteps("", "b")).toBe("b");
  });
});
