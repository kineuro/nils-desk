// SPDX-License-Identifier: AGPL-3.0-only
// The Review page's pure parts against fixtures shaped as record 26's
// contract: the chips from a summary, a pack read into axes and words, the
// overlay a word makes at each pack contract, what a rehearsal and a closure
// say, why an axis was judged so, and the words of a refusal.

import { describe, expect, it } from "vitest";
import { DoorError } from "../ask/client";
import type { Capabilities } from "../capabilities";
import type { OverlayRow, ReviewItem, Signals } from "../ops/client";
import {
  acts,
  axisCounts,
  axisWords,
  batchOf,
  becauseWords,
  closureWords,
  cohortChips,
  familyOf,
  itemWords,
  kindTag,
  overlayChange,
  refusalWords,
  scopeDoc,
  scopeString,
  siteWords,
  stackOf,
  tryWords,
  valueCounts,
  wordOverlay,
  type PackDoc,
} from "./client";
import { PACK } from "./pack.fixture";

function item(id: number, kind: string, scope: string, over: Partial<ReviewItem> = {}): ReviewItem {
  return { id, kind, scope, status: "open", created_at: "2026-09-10T10:00:00Z", ...over };
}

describe("the chips from a summary", () => {
  it("count everything, each cohort, and the subjects in no cohort", () => {
    const chips = cohortChips({ by_kind: { "base:vote": 60, "identity.collision": 14, "session.moved": 4 }, cohorts: [{ name: "alpha", open: 62 }, { name: "beta", open: 12 }, { name: "pilot", open: 0 }], none: 4 }, []);
    expect(chips.map((c) => [c.key, c.words, c.open])).toEqual([
      ["", "All", 78],
      ["alpha", "alpha", 62],
      ["beta", "beta", 12],
      ["pilot", "pilot", 0],
      ["none", "in no cohort", 4],
    ]);
  });
  it("are everything alone, counted from the page, on an engine without the summary door", () => {
    expect(cohortChips(null, [item(1, "base:vote", "stack"), item(2, "base:vote", "stack", { status: "accepted" })])).toEqual([{ key: "", words: "All", open: 1 }]);
  });
});

describe("what an item says", () => {
  it("names its family and its tone", () => {
    expect(familyOf("base:vote")).toBe("unsure");
    expect(familyOf("identity.collision")).toBe("identity");
    expect(familyOf("linkage.conflict")).toBe("identity");
    expect(familyOf("session.moved")).toBe("moved");
    expect(familyOf("release.stale")).toBeNull();
    expect(kindTag("identity.unmapped")).toEqual({ words: "identity", tone: "gated" });
    expect(kindTag("technique:low_confidence")).toEqual({ words: "unsure", tone: "caution" });
  });
  it("says what it is about from its evidence, never a value the registry keeps in confidence", () => {
    expect(itemWords(item(1, "base:vote", "group", { members: 14, evidence: { values: ["T1w", "T2w"] } }))).toBe("T1w or T2w, the vote split · 14 stacks alike");
    expect(itemWords(item(2, "base:missing", "group", { members: 21 }))).toBe("no base fits · 21 stacks alike");
    expect(itemWords(item(3, "identity.collision", "subject", { evidence: { sessions: 6 } }))).toBe("two codes share one identifier · 6 sessions between them");
    expect(itemWords(item(4, "identity.unmapped", "batch", { evidence: { files: 18, shape: "AAA999" } }))).toBe("18 files held until the map names an identifier shaped AAA999");
    expect(itemWords(item(5, "session.moved", "subject", { evidence: { from: 2, to: 3, scheme: "visits-90d" } }))).toBe("a session moved from visit 2 to visit 3 under visits-90d");
    expect(itemWords(item(6, "identity.provisional", "subject"))).toBe("a subject coded from an identifier the map does not know");
  });
  it("finds the batch and the stack an item names", () => {
    expect(batchOf(item(1, "base:vote", "stack", { ref: { stack_id: 48112, batch_id: 7 }, evidence: { batch_name: "alpha-2026-08-20" } }))).toEqual({ id: 7, name: "alpha-2026-08-20" });
    expect(stackOf(item(1, "base:vote", "stack", { ref: { stack_id: 48112 } }))).toBe(48112);
    expect(stackOf(item(2, "identity.collision", "subject", { ref: { subject_id: 3 } }))).toBeNull();
  });
});

describe("a pack read into axes and words", () => {
  it("lists values in the pack's order whether the door sent them as a list or by name, with their flag in words", () => {
    expect(PACK.axes.map((a) => a.axis)).toEqual(["provenance", "technique", "base", "body_part", "post_contrast"]);
    const t = PACK.axes[1];
    expect(t.values.map((v) => v.value)).toEqual(["MS-EPI", "DWI-EPI", "SS-GRE"]);
    expect(t.values[0]).toEqual({ value: "MS-EPI", label: "RESOLVE", family: "EPI", keywords: ["resolve", "muse"], flag: "is_epi_diff_resolve, else has_segmented_kspace and has_epi", threshold: null });
    expect(PACK.axes[2].values[0].flag).toBe("is_t1");
    expect(PACK.axes[2].values[0].threshold).toBe(0.65);
  });
  it("says what an axis's rules are made of, and counts values an older door only numbered", () => {
    expect(axisWords(PACK.axes[1])).toBe("3 lists");
    expect(axisWords(PACK.axes[0])).toBe("1 list");
    expect(axisWords(PACK.axes[2])).toBe("flags and physics");
    expect(axisWords(PACK.axes[3])).toBe("4 values");
    expect(PACK.axes[3].counted).toBe(4);
    expect(PACK.flags).toBe(138);
  });
});

describe("the overlay a word makes", () => {
  const scope = { kind: "batch" as const, id: 12, name: "alpha-2026-08-20" };
  it("names any list by axis.value at pack contract 5, on the scope as provenance", () => {
    const made = wordOverlay(PACK, "technique", "SS-GRE", ["fl3d_vibe", " "], [], scope, "site-technique-ss-gre");
    expect(made.why).toBeNull();
    expect(made.overlay).toEqual({ pack: "mri", scope: { batch: "12" }, name: "site-technique-ss-gre", version: "1.0.0", lists: { "technique.SS-GRE": { add: ["fl3d_vibe"], remove: [] } } });
    expect(scopeString(scope)).toBe("batch:12");
    expect(scopeDoc({ kind: "origin", name: "Prisma 3T" })).toEqual({ station: "Prisma 3T" });
    expect(scopeString({ kind: "everything", pack: "mri", version: "0.1.1" })).toBe("pack:0.1.1");
  });
  it("names the bucket a value stands for at contract 4, and refuses a list the pack does not let a site edit", () => {
    const four: PackDoc = { ...PACK, contract: 4 };
    expect(wordOverlay(four, "post_contrast", "yes", ["km", "gado"], [], scope).overlay).toEqual({ pack: "mri", scope: { batch: "12" }, buckets: { contrast_positive: { add: ["km", "gado"], remove: [] } } });
    const refused = wordOverlay(four, "technique", "SS-GRE", ["fl3d_vibe"], [], scope);
    expect(refused.overlay).toBeNull();
    expect(refused.why).toMatch(/only contrast_positive, contrast_negative, localizer_words, diffusion_tokens/u);
    expect(wordOverlay(PACK, "technique", "SS-GRE", [], [], scope).why).toBe("Write a word first.");
  });
});

describe("what a rehearsal, a closure and a proposal say", () => {
  it("count what moved, what closes and opens, and the cases", () => {
    expect(tryWords({ moves: [{ axis: "post_contrast", from: "no", to: "yes", stacks: 17 }], review_items: { close: 14, open: 0 }, cases: { passed: 2, failed: 0 } })).toBe("moves 17 stacks · closes 14 items · opens 0 · cases 2 of 2");
    expect(tryWords({ moves: [], review_items: { close: 0, open: 1 }, cases: { passed: 0, failed: 0 } })).toBe("moves 0 stacks · closes 0 items · opens 1");
  });
  it("say what adopting would move, and which cards stop reproducing", () => {
    const c = closureWords({ stacks: { count: 17, sample: [1, 2] }, review: { opens: 0, closes: 14 }, handles: [{ handle: 3, name: "T1w of alpha", reason: "a stack moved" }, { handle: 4, name: null, reason: "a stack moved" }], releases: [] });
    expect(c.act).toBe("Adopt: move 17");
    expect(c.note).toBe("It re-sorts 17 stacks, closes 14 items, 2 query cards stop reproducing until they run again.");
  });
  it("read an overlay row's change, and the site's words on a value", () => {
    const rows: OverlayRow[] = [
      { id: 1, name: "site-mprage", version: "1.0.0", status: "adopted", scope: "scanner Prisma 3T", document: { lists: { "technique.VFA-GRE": { add: ["t1_mpr"], remove: [] } } } },
      { id: 2, name: "tune-technique", version: "1.0.0", status: "proposed", scope: "batch alpha-2026-08-20", document: { lists: { "technique.SP-GRE": { add: ["fl3d_vibe"], remove: ["flash"] } } } },
      { id: 3, name: "tune-post_contrast", version: "1.0.0", status: "adopted", document: { scope: { batch: "12" }, buckets: { contrast_positive: { add: ["km", "gado"], remove: [] } } } },
    ];
    expect(overlayChange(rows[1])).toEqual([{ title: "technique · SP-GRE", words: "+ fl3d_vibe - flash" }]);
    expect(overlayChange(rows[2])).toEqual([{ title: "contrast_positive", words: "+ km, gado" }]);
    expect(siteWords(rows, "technique", "VFA-GRE")).toEqual({ adopted: [{ word: "t1_mpr", scope: "scanner Prisma 3T" }], proposed: [] });
    expect(siteWords(rows, "technique", "SP-GRE").proposed).toEqual([{ word: "fl3d_vibe", scope: "batch alpha-2026-08-20" }]);
    expect(siteWords(rows, "post_contrast", "yes").adopted).toEqual([
      { word: "km", scope: "batch 12" },
      { word: "gado", scope: "batch 12" },
    ]);
  });
});

describe("the counts from the signals", () => {
  const signals = {
    scope: "batch:12",
    axes: { technique: { tiers: { keyword: 200, flag: 40 }, confidence: {}, open_review: { "technique:vote": 2, "technique:low_confidence": 1 }, disagreeing_terms: [] } },
    open_review: { "technique:vote": 2 },
    diagnostics: {},
    shadowed_keywords: ["space"],
    unused_overlay_terms: [],
    by_value: { technique: { "SS-GRE": { decided: 118, unsure: 0 }, "MS-EPI": { decided: 12 } } },
  } as Signals;
  it("read by value when the engine gives it, else by axis", () => {
    expect(valueCounts(signals, "technique", "SS-GRE")).toEqual({ decided: 118, unsure: 0 });
    expect(valueCounts(signals, "technique", "MS-EPI")).toEqual({ decided: 12, unsure: 0 });
    expect(valueCounts(signals, "technique", "GRE")).toBeNull();
    expect(valueCounts({ ...signals, by_value: undefined }, "technique", "SS-GRE")).toBeNull();
    expect(axisCounts(signals, "technique")).toEqual({ sorted: 240, unsure: 3 });
    expect(axisCounts(signals, "base")).toBeNull();
  });
});

describe("why an axis was judged so", () => {
  it("names the word, the flag, the physics, the rule, or the decision", () => {
    expect(becauseWords({ axis: "base", value: "T2w", confidence: 0.85, tier: "keyword", evidence: [{ rule_set: "base", rule: "T2w", source: "series_description", matched: "t2_tse" }] })).toBe("a word: t2_tse in the series description");
    expect(becauseWords({ axis: "technique", value: "TSE", confidence: 0.9, tier: "flag", evidence: [{ rule_set: "technique", rule: "tse", source: "sequence_name", matched: null }] })).toBe("a flag: tse in the sequence name");
    expect(becauseWords({ axis: "body_part", value: "head", confidence: 0.55, tier: "physics", evidence: [{ rule_set: "physics", rule: "fov_head", source: "field_of_view", matched: null }] })).toBe("physics: fov_head in the field of view");
    expect(becauseWords({ axis: "role", value: "t2w", confidence: 0.9, tier: "rule", evidence: [{ rule_set: "role", rule: "anatomical T2w", source: "", matched: null }] })).toBe("a rule: anatomical T2w of role");
    expect(becauseWords({ axis: "base", value: "T1w", confidence: 1, tier: "decision", evidence: [], decision: { kind: "person", actor: "astrid", why: "looked" } })).toBe("a person, astrid, decided: looked");
    expect(becauseWords({ axis: "base", value: null, confidence: 0, tier: "" })).toBe("no rule fired; nothing");
  });
});

describe("a refusal and the person's acts", () => {
  it("says who decided before and that a decision stands", () => {
    expect(refusalWords(new DoorError(409, { error: "item 4 was decided by a person, and an agent does not decide over them" }))).toMatch(/^Refused: item 4 was decided by a person.*A decision stands/u);
    expect(refusalWords(new DoorError(409, { error: "overlay 3 is adopted, and only a proposed one is adopted" }))).toBe("Refused: overlay 3 is adopted, and only a proposed one is adopted");
    expect(refusalWords(new DoorError(403, { error: "no" }))).toBe("Deciding needs work on the Review page.");
    expect(refusalWords(new Error("the engine did not answer"))).toBe("the engine did not answer");
  });
  it("follow the grants and the detail", () => {
    const caps = (grants: string[], detail: string) => ({ person: { grants, detail } }) as unknown as Capabilities;
    expect(acts(caps(["review:work", "data:work"], "sensitive"))).toEqual({ decide: true, adopt: true, merge: true });
    expect(acts(caps(["review:work"], "quasi"))).toEqual({ decide: true, adopt: false, merge: false });
    expect(acts(caps(["review:see", "data:work"], "sensitive"))).toEqual({ decide: false, adopt: false, merge: true });
  });
});
