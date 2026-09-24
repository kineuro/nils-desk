// SPDX-License-Identifier: AGPL-3.0-only
// Picks in Review (record 45 S5): a `pick.border` item as a pick run writes
// it (the shape copied from a synthetic engine's answer), read as its
// occasion with the run's pick marked first; the board with a main toggle
// and a required why; the pick question as the rating workspace draws it;
// and the acts each grant and door leaves open.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ReviewItem } from "../ops/client";
import { capsWith } from "./caps.fixture";
import { BORDER } from "./picks.fixture";
import { familyOf, itemWords, kindTag } from "./client";
import { PickDialog, pickActs } from "./PickDialog";
import { answeredIndex, borderOf, borderWords, occasionWords, pickBody } from "./picks";
import { PickQuestion, SessionBoard } from "./SessionBoard";

const ANSWERED: ReviewItem = { ...BORDER, status: "accepted", decision: { pick_id: 97, stacks: [409], author_kind: "person", actor: "astrid", why: "sharper, no motion" } };

const WORK = ["review:see", "review:work"] as const;
const DOORS = ["GET /api/review", "POST /api/picks", "POST /api/picks/{id}/withdraw", "POST /api/review/{id}/accept"];

describe("a pick.border item", () => {
  it("reads as its occasion, the run's pick first and marked, and belongs to the picks family", () => {
    const b = borderOf(BORDER)!;
    expect(occasionWords(b)).toBe("t1w of subject 21 on 2010-11-27");
    expect(borderWords(b)).toBe("the two best too close");
    expect(b.candidates.map((c) => [c.stacks, c.chosen])).toEqual([
      [[406], true],
      [[409], false],
      [[405], false],
    ]);
    expect(b.runPick).toBe(81);
    expect(familyOf(BORDER.kind)).toBe("picks");
    expect(kindTag(BORDER.kind).words).toBe("pick");
    expect(itemWords(BORDER)).toBe("t1w of subject 21 on 2010-11-27: the pick run doubts it");
    // nothing eligible: the run picked nothing, so no candidate is its pick
    const none = borderOf({ ...BORDER, evidence: { ...(BORDER.evidence as object), borders: ["nothing_eligible"] } })!;
    expect(none.candidates.some((c) => c.chosen)).toBe(false);
  });
  it("names a person's pick that answered it, and which candidate that was", () => {
    const b = borderOf(ANSWERED)!;
    expect(b.answered).toEqual({ pick: 97, stacks: [409], why: "sharper, no motion" });
    expect(answeredIndex(b)).toBe(1);
  });
  it("writes a pick as the door takes it: the role, the stacks, the why and the pick that declares the role", () => {
    expect(pickBody(borderOf(BORDER)!, [409], "  sharper  ")).toEqual({ role: "t1w", stacks: [409], why: "sharper", pick: "main" });
  });
});

describe("the session board", () => {
  it("draws each candidate with its score, the run's pick marked, a main toggle and a why", () => {
    const b = borderOf(BORDER)!;
    const html = renderToStaticMarkup(<SessionBoard candidates={b.candidates} main={1} onMain={() => undefined} why="" onWhy={() => undefined} pictures={false} />);
    expect(html.match(/type="radio"/gu)).toHaveLength(3);
    expect(html).toContain("the run&#x27;s pick");
    expect(html).toContain('class="bundle on"');
    expect(html).toContain("score 0.66");
    expect(html).toContain("stack 409");
    expect(html).toMatch(/<input required=""[^>]*aria-label="Why"/u);
  });
  it("draws read only with the main marked when no one may choose", () => {
    const b = borderOf(ANSWERED)!;
    const html = renderToStaticMarkup(<SessionBoard candidates={b.candidates} main={1} onMain={null} why="" onWhy={null} pictures={false} />);
    expect(html).not.toContain('type="radio"');
    expect(html).not.toContain('aria-label="Why"');
    expect(html).toContain('<span class="tag brand">main</span>');
  });
  it("renders the pick question with the chosen acquisition marked main and the why left to the workspace", () => {
    const html = renderToStaticMarkup(<PickQuestion role="t1w" candidates={borderOf(BORDER)!.candidates} stacks={[409]} onStacks={() => undefined} pictures={false} />);
    expect(html).toContain("Which acquisition stands for t1w on this occasion?");
    expect(html).toContain('class="bundle on"');
    expect(html).not.toContain('aria-label="Why"');
    expect(html).not.toContain(">Answer</button>");
  });
});

describe("the acts on a border", () => {
  it("offer Pick and Keep on an open item to a person with review work, and Withdraw once a person picked", () => {
    const caps = capsWith(DOORS, [...WORK]);
    expect(pickActs(caps, borderOf(BORDER)!)).toEqual({ pick: true, keep: true, withdraw: false });
    expect(pickActs(caps, borderOf(ANSWERED)!)).toEqual({ pick: false, keep: false, withdraw: true });
  });
  it("offer nothing to a person who may only see, nor where the engine has no picks door", () => {
    expect(pickActs(capsWith(DOORS, ["review:see"]), borderOf(BORDER)!)).toEqual({ pick: false, keep: false, withdraw: false });
    expect(pickActs(capsWith(["GET /api/review", "POST /api/review/{id}/accept"], [...WORK]), borderOf(BORDER)!)).toEqual({ pick: false, keep: true, withdraw: false });
  });
  it("draw the dialog with the doubt, the board and only the buttons the acts allow", () => {
    const html = renderToStaticMarkup(<PickDialog caps={capsWith(DOORS, [...WORK])} item={BORDER} onClose={() => undefined} onDone={() => undefined} pictures={false} />);
    expect(html).toContain("t1w of subject 21 on 2010-11-27: the two best too close · margin 0.00");
    expect(html).toContain(">Pick</button>");
    expect(html).toContain("Keep the run&#x27;s pick");
    expect(html).not.toContain("Withdraw my pick");
    const seen = renderToStaticMarkup(<PickDialog caps={capsWith(DOORS, ["review:see"])} item={BORDER} onClose={() => undefined} onDone={() => undefined} pictures={false} />);
    expect(seen).not.toContain(">Pick</button>");
    expect(seen).not.toContain('type="radio"');
  });
});
