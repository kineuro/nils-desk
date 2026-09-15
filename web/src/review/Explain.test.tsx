// SPDX-License-Identifier: AGPL-3.0-only
// Why is this a T2w, as the table draws it from the explain door's answer:
// each axis with its value, how sure, and because of what; an unsure axis
// marked; and the explanation an older engine cannot give, made from the
// item's own evidence.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ReviewItem } from "../ops/client";
import type { Explain } from "./client";
import { explainFromItem, ExplainTable } from "./Explain";

const explain: Explain = {
  stack: 48112,
  pack: "mri",
  version: "0.1.1",
  overlay: "site-localizer",
  axes: [
    { axis: "technique", value: "TSE", confidence: 0.9, tier: "flag", evidence: [{ rule_set: "technique", rule: "tse", source: "sequence_name", matched: null }] },
    { axis: "base", value: "T2w", confidence: 0.85, tier: "keyword", evidence: [{ rule_set: "base", rule: "T2w", source: "series_description", matched: "t2_tse" }] },
    { axis: "body_part", value: "head", confidence: 0.55, tier: "physics", evidence: [{ rule_set: "physics", rule: "fov_head", source: "field_of_view", matched: null }] },
    { axis: "post_contrast", value: null, confidence: 0, tier: "", evidence: [] },
    { axis: "role", value: "t2w", confidence: 0.9, tier: "rule", evidence: [{ rule_set: "role", rule: "an anatomical T2w acquisition", source: "", matched: null }] },
  ],
};

describe("the explanation's table", () => {
  it("draws each axis with its value, how sure, and because of what, and marks the unsure ones", () => {
    const html = renderToStaticMarkup(<ExplainTable axes={explain.axes} below={0.65} />);
    expect(html).toContain("<td>technique</td><td><b>TSE</b></td>");
    expect(html).toContain('<td class="num">0.90</td><td class="meta">a flag: tse in the sequence name</td>');
    expect(html).toContain("a word: t2_tse in the series description");
    expect(html).toContain('<span class="tag caution">unsure</span> head?');
    expect(html).toContain("physics: fov_head in the field of view · below 0.65, so it asked");
    expect(html).toContain('<span class="tag caution">unsure</span> nothing');
    expect(html).toContain("a rule: an anatomical T2w acquisition of role");
  });
  it("stands in for the door on an older engine with the item's own evidence", () => {
    const item: ReviewItem = { id: 1, kind: "base:low_confidence", scope: "stack", status: "open", created_at: "2026-09-10T10:00:00Z", ref: { stack_id: 48112 }, evidence: { value: "T2w", confidence: 0.55, pack: "mri", pack_version: "0.1.1" } };
    const e = explainFromItem(item, 48112);
    expect(e).toEqual({ stack: 48112, pack: "mri", version: "0.1.1", overlay: null, axes: [{ axis: "base", value: "T2w", confidence: 0.55, tier: "low_confidence", evidence: null, decision: null }] });
    expect(explainFromItem({ ...item, kind: "identity.collision" }, 48112).axes).toEqual([]);
  });
});
