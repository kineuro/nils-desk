// SPDX-License-Identifier: AGPL-3.0-only
// The chat, slice 12: a card, a cohort or a result named in a message, written
// into the words as a mention and read back out of them as a chip.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadMentionables, type Mentionable, mentionables, mentionAt, mentionToken, plainMentions, saidWithMentions, SELECTIONS_OFFERED, withMention } from "./mentions";
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

// record 55 K6: a saved selection named like a kept result
const selection: Mentionable = { kind: "selection", id: "ms-baseline@2", name: "ms-baseline", detail: "v2 · 412 stacks" };

describe("a saved selection named with @", () => {
  afterEach(() => vi.unstubAllGlobals());

  /** The engine as the menu reads it: a card, a cohort, a kept result and two selections, one whose size is held back. */
  const engine = (paths: string[]) =>
    vi.fn(async (url: string) => {
      paths.push(url);
      const p = url.split("?")[0];
      const body =
        p === "/api/ask/documents"
          ? { count: 1, next: null, documents: [{ document: 12, root: 12, name: "Women", versions: 1 }] }
          : p === "/api/summary"
            ? { subjects: { by_cohort: { MS: 3 } }, sessions: { by_cohort: {} }, stacks: { by_cohort: {} } }
            : p === "/api/ask/handles"
              ? { count: 1, handles: [{ id: 45, name: "T1 series", kept: true, grain: "stack", row_count: 9 }] }
              : p === "/api/ask/selections"
                ? {
                    count: 2,
                    total: 2,
                    matching: 2,
                    next: null,
                    selections: [
                      { id: 1, name: "ms-baseline", spec: "selection:ms-baseline@2", versions: 2, size: { rows: 412, grain: "stack", version: 2, handle: 70, at: "", truncated: false } },
                      { id: 2, name: "ms-small", spec: "selection:ms-small@1", versions: 1, size: { rows: null, grain: "subject", version: 1, handle: 71, at: "", truncated: false } },
                    ],
                  }
                : null;
      return new Response(body === null ? JSON.stringify({ error: "no door" }) : JSON.stringify(body), { status: body === null ? 404 : 200 });
    });

  it("is offered beside the cards, cohorts and results, at the version current now, its size held back as held", async () => {
    const paths: string[] = [];
    vi.stubGlobal("fetch", engine(paths));
    const all = await loadMentionables({ selections: true });
    expect(all.map((m) => `${m.kind}:${m.id}`)).toEqual(["card:12", "cohort:MS", "result:45", "selection:ms-baseline@2", "selection:ms-small@1"]);
    expect(all.find((m) => m.id === "ms-baseline@2")?.detail).toBe("v2 · 412 stacks");
    expect(all.find((m) => m.id === "ms-small@1")?.detail).toMatch(/^v1 · held back/u);
    expect(paths).toContain(`/api/ask/selections?limit=${SELECTIONS_OFFERED}`);
    // the kinds take turns, so many cards crowd no selection out
    const cards = Array.from({ length: 10 }, (_, i): Mentionable => ({ kind: "card", id: String(i), name: `Card ${i}` }));
    expect(mentionables("", [...cards, ...all]).map((m) => m.kind)).toContain("selection");
    expect(mentionables("small", all).map((m) => m.id)).toEqual(["ms-small@1"]);
  });

  it("is not read where the engine does not list selections to this person", async () => {
    const paths: string[] = [];
    vi.stubGlobal("fetch", engine(paths));
    const all = await loadMentionables();
    expect(all.some((m) => m.kind === "selection")).toBe(false);
    expect(paths.some((p) => p.startsWith("/api/ask/selections"))).toBe(false);
  });

  it("is sent in the words as @[name](selection:name%40version), the shape the assistant reads, and read back as a chip", () => {
    expect(mentionToken(selection)).toBe("@[ms-baseline](selection:ms-baseline%402)");
    expect(withMention("scans in @ms-b", selection)).toBe("scans in @[ms-baseline](selection:ms-baseline%402) ");
    const text = `How many in ${mentionToken(selection)}?`;
    expect(saidWithMentions(text)[1]).toEqual({ kind: "mention", mention: { kind: "selection", id: "ms-baseline@2", name: "ms-baseline" } });
    const html = renderToStaticMarkup(createElement(TurnView, { turn: { id: "u1", role: "user", text, done: true, tools: [] }, open: false, onToggle: () => undefined, proposals: [], choice: null, onChoose: () => undefined }));
    expect(html).toContain('<a class="mention" href="#query/selections" title="Saved selection ms-baseline@2">ms-baseline</a>');
    expect(plainMentions(text)).toBe("How many in ms-baseline?");
  });
});
