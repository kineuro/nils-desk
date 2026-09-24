// SPDX-License-Identifier: AGPL-3.0-only
// System 1's candidate list (record 45 R5, S7) against the fixture of the
// fixed evidence shape: only legal candidates render, most probable first;
// the axes the two systems disagree on are marked; both systems' evidence
// and the certificate sit in disclosures; choosing one decides each axis
// through the stack's open item of it.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ReviewItem } from "../ops/client";
import { ASKED_ITEM, ASKED_PACK } from "./asked.fixture";
import { askedOf, choosePlan, legal } from "./asked";
import { CandidateList } from "./CandidateList";
import { familyOf } from "./client";

describe("the asked evidence", () => {
  it("keeps only legal candidates, most probable first, and counts what it left out", () => {
    const a = askedOf(ASKED_ITEM, ASKED_PACK)!;
    expect(a.stack).toBe(4410);
    expect(a.candidates.map((c) => [c.values.base, c.p])).toEqual([
      ["FLAIR", 0.71],
      ["T2w", 0.22],
      ["PDw", 0.04],
      ["T1w", 0.02],
    ]);
    expect(a.dropped).toBe(4);
    expect(a.differ).toEqual(["base", "modifier"]);
    expect(a.certificate).toEqual({ epsilon: 0.05, delta: 0.01, threshold: 0.9, score: 0.71, group: "T2-like" });
    expect(familyOf(ASKED_ITEM.kind)).toBe("asked");
  });
  it("refuses a candidate the pack does not allow, a probability that is not one, and a set on a single axis", () => {
    expect(legal({ values: { base: "DIR" }, p: 0.1 }, ASKED_PACK)).toBeNull();
    expect(legal({ values: { base: "T2w" }, p: 1.2 }, ASKED_PACK)).toBeNull();
    expect(legal({ values: { base: ["T2w"] }, p: 0.1 }, ASKED_PACK)).toBeNull();
    expect(legal({ values: { nowhere: "x" }, p: 0.1 }, ASKED_PACK)).toBeNull();
    expect(legal({ values: {}, p: 0.1 }, ASKED_PACK)).toBeNull();
    expect(legal({ values: { modifier: [] }, p: 0.1 }, ASKED_PACK)).toEqual({ values: { modifier: [] }, p: 0.1 });
  });
});

describe("the candidate list", () => {
  const a = askedOf(ASKED_ITEM, ASKED_PACK)!;
  const html = renderToStaticMarkup(<CandidateList asked={a} onChoose={() => undefined} onNone={() => undefined} />);
  it("renders the legal candidates and nothing else", () => {
    expect(html.match(/<li class="candidate">/gu)).toHaveLength(4);
    expect(html).not.toContain("base DIR");
    expect(html).not.toContain("GRE");
    expect(html).toContain("4 candidates left out: not legal under this pack.");
    const order = [...html.matchAll(/<span class="p num">([0-9.]+)<\/span>/gu)].map((m) => m[1]);
    expect(order).toEqual(["0.71", "0.22", "0.04", "0.02"]);
    expect(html.match(/>Choose<\/button>/gu)).toHaveLength(4);
    expect(html).toContain(">None of these</button>");
  });
  it("marks the axes the systems disagree on and keeps their evidence and the certificate closed", () => {
    expect(html).toContain('<span class="tag caution differ" title="the two systems disagree here">base FLAIR</span>');
    expect(html).toContain('<span class="tag">technique TSE</span>');
    expect(html).toContain("modifier none");
    expect(html).toContain("<summary>Both systems, disagreeing on base, modifier</summary>");
    expect(html).toContain("T2w<span class=\"meta\"> · base/te_long</span><span class=\"meta\"> · 2 votes</span>");
    expect(html).toContain("<td>FLAIR · p 0.74</td>");
    expect(html).toContain("<summary>The certificate</summary>");
    expect(html).toContain('<span class="k">group</span><span class="v">T2-like</span>');
  });
  it("offers no choice to a person who may only see", () => {
    const seen = renderToStaticMarkup(<CandidateList asked={a} onChoose={null} onNone={null} />);
    expect(seen).not.toContain(">Choose</button>");
    expect(seen).not.toContain("None of these");
  });
  it("chooses through the stack's open item of each axis, and names the axes that have none", () => {
    const open: ReviewItem[] = [
      { id: 11, kind: "base:low_confidence", scope: "stack", status: "open", created_at: "", ref: { stack_id: 4410 } },
      { id: 12, kind: "technique:vote", scope: "stack", status: "open", created_at: "", ref: { stack_id: 4410 } },
      { id: 13, kind: "base:missing", scope: "stack", status: "open", created_at: "", ref: { stack_id: 9 } },
    ];
    const plan = choosePlan(a.candidates[0], a.stack, open);
    expect(plan.applies.map((x) => [x.item.id, x.axis, x.value])).toEqual([
      [11, "base", "FLAIR"],
      [12, "technique", "TSE"],
    ]);
    expect(plan.left).toEqual(["modifier", "post_contrast"]);
  });
});
