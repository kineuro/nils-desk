// SPDX-License-Identifier: AGPL-3.0-only
// The pack's quality (record 56, sections 2 and 4.1): the pairs the pack
// cannot rank, read from the disagreements door, and the overrides by rule
// pair; each offers the typed change that would mend it, filled in: a
// priority where two values share one, a rule moved before the other where
// a set collects both, a narrower rule before the one that writes both; and
// for an override, the losing set or rule moved first or its priority
// changed; a person's answer is no rule, and offers no change.

import { describe, expect, it } from "vitest";
import { draftOfOverride, draftOfTie, overridesOf, rankWords, tieWhy, tiesOf } from "./quality";
import { buildOp } from "./ruleOps";
import { TIES } from "./rules.fixture";

describe("the pairs the pack cannot rank", () => {
  const { stacks, ties } = tiesOf(TIES);

  it("are read from the disagreements door, the most scans first as it lists them", () => {
    expect(stacks).toBe(14);
    expect(ties.map((t) => [t.axis, t.stacks, t.why])).toEqual([
      ["base", 9, ["one_rule"]],
      ["body_part", 5, ["priority_tie"]],
    ]);
    expect(ties[0].sides.map((s) => `${s.rule_set}/${s.rule}=${s.value}`)).toEqual(["base/named=FLAIR", "base/named=T2w"]);
    expect(ties[0].examples).toHaveLength(9);
    expect(tieWhy(ties[0])).toBe("one rule writes both");
    expect(tieWhy({ why: ["priority_tie", "collected"] })).toBe("the same priority, a set collects both");
  });

  it("offer the change that would rank them, filled in for the pack", () => {
    const tie = draftOfTie(ties[1]);
    expect(tie.form.op).toBe("set_priority");
    expect(tie.form.values).toMatchObject({ axis: "body_part", value: "neck", priority: "" });
    expect(tie.scope.kind).toBe("pack");
    expect(tie.evidence).toEqual({ equal_rank: "body_part: body_part/neck_words=neck | body_part/spine_words=spine" });
    // the priority is the person's to give, so the form says it lacks it
    expect(buildOp(tie.form, tie.scope, tie.reason, tie.evidence).missing).toEqual(["priority"]);

    const one = draftOfTie(ties[0]);
    expect(one.form.op).toBe("add_rule");
    expect(one.form.values).toMatchObject({ axis: "base", value: "FLAIR", set: "base" });
    expect(one.form.place).toEqual({ at: "before", ref: "named" });

    const collected = draftOfTie({ ...ties[0], why: ["collected"] });
    expect(collected.form.op).toBe("move_rule");
    expect(collected.form.values.rule).toBe("base/named");
  });
});

describe("the overrides by rule pair", () => {
  const rows = overridesOf({
    pairs: [
      { axis: "technique", by: { rule_set: "symri", rule: "mdme", value: "MDME" }, over: { rule_set: "technique", rule: "se_words", value: "SE" }, rank: "rule_set_order", stacks: 51, examples: [1, 2, 3] },
      { axis: "base", value: "FLAIR", other: "T2w", by: { rule_set: "base", rule: "physics", value: "" }, over: { rule_set: "base", rule: "named", value: "" }, rank: "rule_order", stacks: 47, examples: [4] },
      { axis: "modifier", by: { rule_set: "modifier", rule: "ir", value: "IR" }, over: { rule_set: "modifier", rule: "fs", value: "FS" }, rank: "priority", stacks: 12, examples: [] },
      { axis: "base", by: { rule_set: "", rule: "answer", value: "T1w" }, over: { rule_set: "base", rule: "named", value: "T2w" }, rank: "answer", stacks: 2, examples: [] },
    ],
  });

  it("are read whichever names the engine gives the two sides", () => {
    expect(rows.map((r) => [r.axis, r.winner.value, r.loser.value, r.rank, r.stacks])).toEqual([
      ["technique", "MDME", "SE", ["rule_set_order"], 51],
      ["base", "FLAIR", "T2w", ["rule_order"], 47],
      ["modifier", "IR", "FS", ["priority"], 12],
      ["base", "T1w", "T2w", ["answer"], 2],
    ]);
    expect(rows[0].pair).toBe("technique: symri/mdme=MDME over technique/se_words=SE");
    expect(overridesOf({ overrides: [{ axis: "a", winner: { rule: "x", value: "1" }, loser: { rule: "y", value: "2" }, rank: "rule_order", stacks: 1 }] })[0].winner.rule).toBe("x");
    expect(overridesOf(null)).toEqual([]);
    expect(rankWords("rule_set_order")).toBe("its rule set runs first");
    expect(rankWords(["rule_order", "priority"])).toBe("it comes first in its set, its value's priority is lower");
  });

  it("offer the change that would turn each round, and none for a person's answer", () => {
    expect(draftOfOverride(rows[0])).toMatchObject({ form: { op: "move_set", values: { set: "technique" }, place: { at: "before", ref: "symri" } }, evidence: { overrides: rows[0].pair } });
    expect(draftOfOverride(rows[1])).toMatchObject({ form: { op: "move_rule", values: { rule: "base/named" }, place: { at: "before", ref: "physics" } } });
    expect(draftOfOverride(rows[2])).toMatchObject({ form: { op: "set_priority", values: { axis: "modifier", value: "FS" } } });
    expect(draftOfOverride(rows[3])).toBeNull();
  });
});
