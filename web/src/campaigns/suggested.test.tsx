// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// Several suggestions for one item (after the first gold campaign): the
// reader fills in the most confident, not the latest imported, and the line
// above the rows says who suggested it, how sure, and what every other voice
// said; "agreed" only where two voices or more say it and none differs. The
// gallery shows the most confident first as well.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Json } from "../ask/client";
import type { Question } from "./client";
import { mostConfidentShown, type GalleryItem } from "./gallery";
import { consensusOf, mostConfident, readingOf, suggestionOf, suggestionWords, type Suggestion } from "./reader";
import { SuggestionBar } from "./ReaderParts";

const Q: Question = { kind: "axis", axis: "body_part", values: ["brain", "brain-neck", "neck", "spine", "chest", "other"] };

const why = (more: Json): Json => ({ item: 9, stack: 5, axes: [], blind: false, ...more });
const told = (id: number, author: string, value: string, confidence: number | null) => ({ id, item: 9, author, value, confidence, source: "v0" });

function bar(s: Suggestion): { tag: string; words: string } {
  const html = renderToStaticMarkup(<SuggestionBar s={s} chosen={null} onChoose={() => undefined} busy={false} />);
  const doc = new DOMParser().parseFromString(html, "text/html");
  return { tag: doc.querySelector(".suggest-words .tag")?.textContent ?? "", words: doc.querySelector(".suggest-words")?.textContent ?? "" };
}

describe("several suggestions for an item", () => {
  it("fills in the most confident, not the latest imported the engine names first", () => {
    const r = readingOf(why({ suggested: "neck", suggested_by: "v0-person", suggestions: [told(1, "v0-model", "brain", 0.95), told(2, "v0-person", "neck", 0.6)] }));
    expect([r.suggestedOne, r.suggestedBy, r.suggestedP]).toEqual(["brain", "v0-model", 0.95]);
    const s = suggestionOf(Q, r)!;
    expect(s.values).toEqual({ body_part: "brain" });
    expect(consensusOf(s)).toBe("differ");
    expect(suggestionWords(s)).toBe("Suggested by v0-model 95 %; v0-person says neck 60 %. Enter confirms.");
    expect(bar(s).tag).toBe("differ");
  });

  it("says agreed only where two voices say the same and none differs; one voice alone is a suggestion", () => {
    const both = suggestionOf(Q, readingOf(why({ suggestions: [told(1, "v0-model", "brain", 0.8), told(2, "v0-person", "brain", null)] })))!;
    expect(both.by).toBe("v0-model");
    expect(consensusOf(both)).toBe("agree");
    expect(bar(both)).toEqual({ tag: "agreed", words: "agreed Suggested by v0-model 80 %; v0-person says the same. Enter confirms." });
    const one = suggestionOf(Q, readingOf(why({ suggestions: [told(1, "v0-model", "spine", 0.7)] })))!;
    expect(bar(one)).toEqual({ tag: "suggested", words: "suggested Suggested by v0-model 70 %. Enter confirms." });
    // the engine's own rules, named as its author, are one voice: never "Rules and System 1 agree"
    const rules = suggestionOf(Q, readingOf(why({ suggested: "brain", suggested_by: "rules" })))!;
    expect(bar(rules)).toEqual({ tag: "suggested", words: "suggested Suggested by rules. Enter confirms." });
  });

  it("puts a suggestion without a confidence after every one with, and the latest first between equals", () => {
    expect(mostConfident([{ id: 5, by: "a", value: "x", confidence: null }, { id: 1, by: "b", value: "y", confidence: 0.1 }])?.by).toBe("b");
    expect(mostConfident([{ id: 1, by: "a", value: "x", confidence: 0.5 }, { id: 2, by: "b", value: "y", confidence: 0.5 }])?.by).toBe("b");
    expect(mostConfident([{ id: 1, by: "a", value: "x", confidence: null }, { id: 2, by: "b", value: "y", confidence: null }])?.by).toBe("b");
    expect(mostConfident([])).toBeNull();
  });

  it("fills in nothing on a blind item, whatever came with it", () => {
    const r = readingOf(why({ blind: true, suggested: "brain", suggestions: [told(1, "v0-model", "brain", 0.99)] }));
    expect(r.suggestedOne ?? null).toBeNull();
    expect(suggestionOf(Q, r)).toBeNull();
  });

  it("shows the most confident first in the gallery, the latest among the others", () => {
    const item: GalleryItem = { item: 9, stack: 5, position: 0, suggested: "neck", by: "v0-person", confidence: 0.6, confidences: { neck: 0.6 }, others: [{ by: "v0-model", value: "brain", confidence: 0.95 }], disagree: true, thumb: "" };
    const shown = mostConfidentShown(item);
    expect([shown.suggested, shown.by, shown.confidence, shown.confidences]).toEqual(["brain", "v0-model", 0.95, null]);
    expect(shown.others).toEqual([{ by: "v0-person", value: "neck", confidence: 0.6 }]);
    // the first stays where it is the most sure, or where the other gave no confidence
    expect(mostConfidentShown({ ...item, confidence: 0.97 })).toEqual({ ...item, confidence: 0.97 });
    expect(mostConfidentShown({ ...item, others: [{ by: "v0-model", value: "brain", confidence: null }] }).by).toBe("v0-person");
  });
});
