// SPDX-License-Identifier: AGPL-3.0-only
// The reader's lookup (record 48, the second real read): a value found by any
// name it goes by (BRAVO finds MPRAGE, and says so); what a choice settles on
// the other rows (implied, excluded with the reason, released on clear, can't
// tell always open); and the whole answer at once, the registry's most common
// first, the pack's shape after.

import { describe, expect, it } from "vitest";
import { COMBOS, QUESTION } from "../../test/layout/reader.fixture";
import { answerBody, type Given, type Question } from "./client";
import { combinationsOf, comboWords, conflictOf, findCombos, fold, nameHit, seedsOf, settle, takeCombo, vocabularyOf, type Combination } from "./lookup";
import { findMatches, illegal, rowsOf } from "./workspace";

const rows = rowsOf(QUESTION, null);
const row = (axis: string) => rows.find((r) => r.axis === axis)!;
const vocab = vocabularyOf(QUESTION);
const given = (values: Record<string, string | string[] | null>): Given => ({ kind: "values", values });
const values = (g: Given) => (g.kind === "values" ? g.values : {});

describe("a value by any name it goes by", () => {
  it("reads the question's vocabulary, leniently", () => {
    expect(vocab.technique.MPRAGE.terms).toContain("BRAVO");
    expect(vocab.technique["3D-TSE"].label).toBe("SPACE");
    expect(vocabularyOf({ kind: "axes" } as Question)).toEqual({});
    expect(vocabularyOf({ kind: "axes", vocabulary: { technique: { MPRAGE: { terms: [3, "BRAVO"] } } } } as unknown as Question)).toEqual({ technique: { MPRAGE: { terms: ["BRAVO"], keywords: [] } } });
  });

  it("finds MPRAGE by a vendor's name, and says why", () => {
    const found = findMatches(row("technique"), "bravo");
    expect(found[0]).toEqual({ kind: "value", value: "MPRAGE", via: "BRAVO → MPRAGE" });
    // a name several vendors share finds each value it names
    expect(findMatches(row("technique"), "tfl").map((f) => (f.kind === "value" ? f.value : f.kind))).toEqual(["MPRAGE", "FSP-GRE"]);
    // a label is the value's own name, and says nothing more
    expect(findMatches(row("technique"), "space")[0]).toEqual({ kind: "value", value: "3D-TSE" });
    // a word the rules read finds it too, after the pack's terms
    expect(findMatches(row("technique"), "ir spgr")[0]).toEqual({ kind: "value", value: "MPRAGE", via: "ir spgr → MPRAGE" });
  });

  it("does not count case, spaces, hyphens, underscores, stars or dots", () => {
    for (const t of ["3D TFE", "3d-tfe", "3dtfe", "3D_TFE", " 3d.tfe "]) expect(nameHit("MPRAGE", vocab.technique.MPRAGE, t)).toMatchObject({ fit: "exact", word: "3D TFE", from: "term" });
    expect(fold("T2*w")).toBe("t2w");
    expect(findMatches(row("base"), "t2 star")[0]).toMatchObject({ value: "T2starw", via: "T2 star → T2starw" });
    // its own name first: "t1" is T1w's term, and nothing is found before T1w
    expect(findMatches(row("base"), "t1")[0]).toMatchObject({ value: "T1w" });
  });
});

describe("what a choice settles", () => {
  it("fills in what a choice implies, marked with the choice, and greys what can no longer hold", () => {
    const s = settle(QUESTION, given({ technique: "MPRAGE" }), rows);
    expect(values(s.given).base).toBe("T1w");
    expect(s.implied.base).toEqual({ values: ["T1w"], by: "technique is MPRAGE" });
    // the base row's other values and none can no longer hold, and say why
    expect(s.excluded.base.T2w).toBe("technique is MPRAGE sets base T1w");
    expect(s.excluded.base.T1w).toBeUndefined();
    expect(s.noneExcluded.base).toBe("technique is MPRAGE sets base T1w");
    // another technique is still open: choosing it moves the implication with it
    expect(s.excluded.technique?.["ME-GRE"]).toBeUndefined();
    expect(values(settle(QUESTION, given({ technique: "ME-GRE" }), rows).given).base).toBe("T2starw");
    // the answer sent carries what was implied
    const b = answerBody(QUESTION, given({ ...Object.fromEntries(rows.map((r) => [r.axis, "cant_tell"])), technique: "MPRAGE", base: "" }));
    expect(b.ok).toBe(false);
    const whole = settle(QUESTION, given({ ...Object.fromEntries(rows.map((r) => [r.axis, "cant_tell"])), technique: "MPRAGE", base: "" }), rows);
    const sent = answerBody(QUESTION, whole.given);
    expect(sent.ok && (sent.body.value as Record<string, unknown>).base).toBe("T1w");
  });

  it("greys a technique whose implication the chosen base contradicts, with the reason", () => {
    const s = settle(QUESTION, given({ base: "T2w" }), rows);
    for (const t of ["MPRAGE", "MEMPRAGE", "MP2RAGE", "TOF-MRA"]) expect(s.excluded.technique[t]).toBe(`technique is ${t} sets base T1w`);
    expect(s.excluded.technique["ME-GRE"]).toBe("technique is ME-GRE sets base T2starw");
    expect(s.excluded.technique.TSE).toBeUndefined();
    expect(s.implied).toEqual({});
  });

  it("greys the rest of an exclusion group on a multi-valued row, and keeps the others", () => {
    const s = settle(QUESTION, given({ modifier: ["FLAIR"] }), rows);
    for (const m of ["STIR", "DIR", "PSIR", "IR"]) expect(s.excluded.modifier[m]).toBe(`FLAIR and ${m} exclude each other (ir contrast)`);
    expect(s.excluded.modifier.FatSat).toBeUndefined();
    expect(s.excluded.modifier.FLAIR).toBeUndefined();
    expect(settle(QUESTION, given({ construct: ["T1map"] }), rows).excluded.construct.T2map).toBe("T1map and T2map exclude each other (quant map)");
  });

  it("releases what a choice implied when the choice is cleared", () => {
    const on = settle(QUESTION, given({ technique: "MPRAGE" }), rows);
    expect(values(on.given).base).toBe("T1w");
    const off = settle(QUESTION, given({ technique: "" }), rows);
    expect(values(off.given).base).toBeUndefined();
    expect(off.implied).toEqual({});
    expect(off.excluded.base).toBeUndefined();
  });

  it("keeps can't tell open everywhere, and never fills an axis the rater said none or can't tell on", () => {
    const s = settle(QUESTION, given({ technique: "MPRAGE", base: "cant_tell" }), rows);
    expect(values(s.given).base).toBe("cant_tell");
    expect(s.implied).toEqual({});
    expect(illegal(QUESTION, s.given)).toBeNull();
    // can't tell on the technique implies nothing
    expect(settle(QUESTION, given({ technique: "cant_tell" }), rows).implied).toEqual({});
    // can't tell is never among what is greyed
    for (const axis of Object.keys(s.excluded)) expect(Object.keys(s.excluded[axis])).not.toContain("cant_tell");
    // none on the base, chosen before, is the rater's and stands; the pack then says it cannot hold
    const n = settle(QUESTION, given({ technique: "MPRAGE", base: null }), rows);
    expect(values(n.given).base).toBeNull();
    expect(illegal(QUESTION, n.given)).toContain("sets base to T1w");
  });

  it("settles nothing on a question without constraints, or another kind", () => {
    const g = given({ technique: "MPRAGE" });
    expect(settle({ ...QUESTION, constraints: undefined }, g, rows)).toEqual({ given: g, implied: {}, excluded: {}, noneExcluded: {} });
    expect(settle({ kind: "axis", axis: "base" } as Question, { kind: "value", value: "T1w" }, rows).implied).toEqual({});
  });

  it("says in a few words why a joint answer cannot hold", () => {
    const c = QUESTION.constraints!;
    expect(conflictOf(c, { technique: ["MPRAGE"], base: ["T2w"] })).toBe("technique is MPRAGE sets base T1w");
    expect(conflictOf(c, { modifier: ["Radial", "Spiral"] })).toBe("Radial and Spiral exclude each other (trajectory)");
    expect(conflictOf(c, { technique: ["MPRAGE"], base: ["T1w"] })).toBeNull();
  });
});

describe("the whole answer at once", () => {
  const counted = combinationsOf(COMBOS);
  const all: Combination[] = [...counted, ...seedsOf(QUESTION, rows)];
  const axes = rows.map((r) => r.axis);

  it("reads the combinations door, and offers each value with what it implies as the pack's shape", () => {
    expect(counted).toHaveLength(3);
    expect(counted[0].count).toBe(700);
    expect(combinationsOf({ combinations: [{ values: "x" }, null, { values: { base: "T1w" }, count: "9" }] })).toEqual([{ values: { base: "T1w" }, count: 0 }]);
    const seed = seedsOf(QUESTION, rows).find((c) => c.values.technique === "MPRAGE")!;
    expect(seed).toEqual({ values: { technique: "MPRAGE", base: "T1w" }, count: 0, seed: true });
    expect(comboWords(seed, axes)).toBe("MPRAGE · T1w");
  });

  it("finds MPRAGE's combinations by BRAVO, the registry's most common first, the shape's after", () => {
    const found = findCombos(all, "bravo", vocab);
    expect(found.map((h) => [h.combo.count, h.combo.seed ?? false])).toEqual([
      [400, false],
      [110, false],
      [0, true],
    ]);
    expect(found[0].hits.map((h) => `${h.word} → ${h.value}`)).toEqual(["BRAVO → MPRAGE"]);
    expect(comboWords(found[0].combo, axes)).toBe("RawRecon · MPRAGE · none · none · T1w · brain · not_given");
    // each word may name a value of its own
    const gd = findCombos(all, "mprage gd", vocab);
    expect(gd[0].combo.values.post_contrast).toBe("given");
    expect(gd.every((h) => h.combo.values.technique === "MPRAGE")).toBe(true);
    // a whole name beats a part of one
    expect(findCombos(all, "flair", vocab)[0].combo.count).toBe(700);
    expect(findCombos(all, "", vocab)).toEqual([]);
    expect(findCombos(all, "zzz", vocab)).toEqual([]);
  });

  it("fills every row a registry combination names, none for an empty set; a shape's leaves the rest", () => {
    const g = takeCombo(QUESTION, given({ body_part: "spine" }), counted[1]);
    expect(values(g)).toEqual({ provenance: "RawRecon", technique: "MPRAGE", modifier: null, construct: null, base: "T1w", body_part: "brain", post_contrast: "not_given" });
    const seed = seedsOf(QUESTION, rows).find((c) => c.values.technique === "MPRAGE")!;
    expect(values(takeCombo(QUESTION, given({ body_part: "spine" }), seed))).toEqual({ body_part: "spine", technique: "MPRAGE", base: "T1w" });
    // what no longer holds beside it is cleared
    const me = seedsOf(QUESTION, rows).find((c) => c.values.technique === "ME-GRE")!;
    expect(values(takeCombo(QUESTION, given({ base: "T1w" }), me))).toEqual({ base: "T2starw", technique: "ME-GRE" });
  });
});
