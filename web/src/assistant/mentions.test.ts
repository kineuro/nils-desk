// SPDX-License-Identifier: AGPL-3.0-only
// The chat, slice 12: a card, a cohort or a result named in a message, written
// into the words as a mention and read back out of them as a chip.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { type Mentionable, mentionables, mentionAt, mentionToken, plainMentions, saidWithMentions, withMention } from "./mentions";
import { TurnView } from "./TurnView";

const card: Mentionable = { kind: "card", id: "12", name: "Women in cohort A", detail: "3 versions" };
const cohort: Mentionable = { kind: "cohort", id: "MS cohort", name: "MS cohort" };
const result: Mentionable = { kind: "result", id: "45", name: "T1 series [2024]" };

describe("a mention in a message", () => {
  it("is offered while a word is typed after an @, and only then", () => {
    expect(mentionAt("count the subjects in @wom")).toBe("wom");
    expect(mentionAt("@")).toBe("");
    expect(mentionAt("write to anna@example.org")).toBeNull();
    expect(mentionAt("in @cohort then more")).toBeNull();
    expect(mentionables("COHORT", [card, cohort, result]).map((m) => m.id)).toEqual(["12", "MS cohort"]);
    expect(mentionables("", [card, cohort, result], 2)).toHaveLength(2);
    // many cards crowd out no cohort and no result
    const cards = Array.from({ length: 10 }, (_, i): Mentionable => ({ kind: "card", id: String(i), name: `Card ${i}` }));
    expect(mentionables("", [...cards, cohort, result]).map((m) => m.kind)).toEqual(["card", "card", "card", "card", "card", "card", "cohort", "result"]);
  });

  it("is written into the words in place of what was typed, with its name escaped and its id encoded", () => {
    expect(withMention("count the subjects in @wom", card)).toBe("count the subjects in @[Women in cohort A](card:12) ");
    expect(mentionToken(cohort)).toBe("@[MS cohort](cohort:MS%20cohort)");
    expect(mentionToken(result)).toBe("@[T1 series \\[2024\\]](result:45)");
    expect(withMention("no mention being typed", card)).toBe("no mention being typed");
  });

  it("is read back out of the words as a chip, the words around it kept", () => {
    const text = `How many in ${mentionToken(cohort)} match ${mentionToken(result)}?`;
    expect(saidWithMentions(text)).toEqual([
      { kind: "words", text: "How many in " },
      { kind: "mention", mention: { kind: "cohort", id: "MS cohort", name: "MS cohort" } },
      { kind: "words", text: " match " },
      { kind: "mention", mention: { kind: "result", id: "45", name: "T1 series [2024]" } },
      { kind: "words", text: "?" },
    ]);
    expect(saidWithMentions("plain words, and [a link](https://example.org)")).toEqual([{ kind: "words", text: "plain words, and [a link](https://example.org)" }]);
  });

  it("is drawn as a chip in the person's message, a card's opening the card, and copied as its name", () => {
    const text = `How many in ${mentionToken(cohort)} match ${mentionToken(card)}?`;
    const html = renderToStaticMarkup(createElement(TurnView, { turn: { id: "u1", role: "user", text, done: true, tools: [] }, open: false, onToggle: () => undefined, proposals: [], choice: null, onChoose: () => undefined }));
    expect(html).toContain('<a class="mention" href="#query/12"');
    expect(html).toContain('<span class="mention" title="Cohort">MS cohort</span>');
    expect(html).not.toContain("@[");
    expect(plainMentions(text)).toBe("How many in MS cohort match Women in cohort A?");
  });
});
