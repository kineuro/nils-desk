// SPDX-License-Identifier: AGPL-3.0-only
// What the chooser makes of the policy the engine serves (record 28): what
// becomes of each tag under one dataset, the rows the chooser draws, and the
// counts that follow those same rules rather than subtracting from a round
// number, so a dataset that keeps four can never read every tag removed. What
// the engine removes is asserted in the engine; the counts here are read from
// what it serves, so that this file pins none of them. The datasets are made
// up.

import { describe, expect, it } from "vitest";
import served from "../../test/fixtures/pseudonymize_tags.json";
import type { Tags } from "./datasets";
import {
  addRemoved,
  countWords,
  demographicsKept,
  dropRemoved,
  extraTags,
  fateOf,
  keepTag,
  matches,
  neverRemoved,
  policyTag,
  sameTags,
  tagCounts,
  tagRows,
  tagsOf,
  type TagPolicy,
} from "./policy";

const policy = served as unknown as TagPolicy;
const NONE: Tags = { keep_demographics: true, remove: [], keep: [] };
const PATIENT_ID = policy.code.tag;
const PATIENT_AGE = "0010,1010";
const MANDATORY = policy.mandatory.map((m) => m.tag);
const one = (tag: string) => policyTag(policy, tag)!;
const why = (tags: Tags, text: string, p: TagPolicy | null = policy): string | null => {
  const asked = addRemoved(p, tags, text);
  return "refusal" in asked ? asked.refusal : null;
};

describe("what becomes of a tag under one dataset", () => {
  it("is removed with its group, kept as a covariate, kept as this dataset's exception, or replaced by the engine", () => {
    expect(fateOf(NONE, one("0010,0010"))).toMatchObject({ fate: "removed", words: "removed with the patient group", kept: false, fixed: false });
    expect(fateOf(NONE, one("0010,0040"))).toMatchObject({ fate: "kept", kept: true, fixed: false });
    expect(fateOf(NONE, one(PATIENT_AGE))).toMatchObject({ fate: "replaced", kept: true, fixed: true });
    expect(fateOf({ ...NONE, keep: ["0008,1010"] }, one("0008,1010"))).toMatchObject({ fate: "kept", kept: true, fixed: false });
    expect(fateOf({ ...NONE, keep_demographics: false }, one("0010,0040"))).toMatchObject({ fate: "removed", kept: false });
    // the words of a fate that is not the plain removal are the engine's own
    expect(fateOf(NONE, one(PATIENT_AGE)).words).toBe(one(PATIENT_AGE).why);
    expect(fateOf(NONE, one("0010,0040")).words).toBe(one("0010,0040").why);
  });

  it("takes the name from the desk, and says where the standard has none", () => {
    expect(fateOf(NONE, one("0010,0010")).name).toBe("PatientName");
    expect(fateOf(NONE, one("0008,106E")).name).toBeNull();
  });

  it("gives the chooser what the engine settles itself, what it serves, and this dataset's own, and lets no one tick the first", () => {
    const rows = tagRows(policy, { ...NONE, remove: ["0008,1030"] });
    expect(rows).toHaveLength(1 + MANDATORY.length + policy.count + 1);
    const fixed = rows.filter((r) => r.fixed);
    expect(fixed.map((r) => r.tag)).toEqual([PATIENT_ID, ...MANDATORY, PATIENT_AGE]);
    expect(rows.find((r) => r.tag === PATIENT_ID)?.words).toBe(policy.code.why);
    expect(rows.find((r) => r.tag === MANDATORY[0])?.words).toBe(policy.mandatory[0].why);
    expect(rows.find((r) => r.tag === "0008,1030")).toMatchObject({ fate: "added", category: null, fixed: false });
    // the code is served apart and is never one a person is offered to keep
    expect(policyTag(policy, PATIENT_ID)).toBeUndefined();
  });

  it("answers the search box by tag or by name", () => {
    const row = tagRows(policy, NONE).find((r) => r.tag === "0010,0010")!;
    expect(matches(row, "")).toBe(true);
    expect(matches(row, "patientname")).toBe(true);
    expect(matches(row, "0010,00")).toBe(true);
    expect(matches(row, "institution")).toBe(false);
  });
});

describe("a tag the desk has no word for", () => {
  const invented: TagPolicy = { ...policy, count: policy.count + 1, tags: [...policy.tags, { tag: "0099,0001", category: "provider", fate: "removed" }] };

  it("is a row all the same: its number, its group and its fate, with no name", () => {
    const row = tagRows(invented, NONE).find((r) => r.tag === "0099,0001");
    expect(row).toMatchObject({ category: "provider", fate: "removed", words: "removed with the provider group", kept: false, fixed: false });
    expect(row?.name).toBeUndefined();
    // and it counts as a removal like any other, since the door says it is one
    expect(tagCounts(invented, NONE).removed).toBe(tagCounts(policy, NONE).removed + 1);
  });

  it("is searched by its number, and answers to no name", () => {
    const row = tagRows(invented, NONE).find((r) => r.tag === "0099,0001")!;
    expect(matches(row, "0099")).toBe(true);
    expect(matches(row, "patient")).toBe(false);
  });
});

describe("the summary's counts", () => {
  it("follow the rules rather than a round number: the age and the covariates are kept, so the whole list is never removed", () => {
    const kept = policy.covariates.tags.length + 1;
    expect(tagCounts(policy, NONE)).toEqual({ removed: policy.count - kept, kept, extra: 0 });
    expect(countWords(tagCounts(policy, NONE))).toBe(`${policy.count - kept} removed · ${kept} kept · none added`);
  });

  it("move one for one as a dataset keeps a tag, drops the covariates, or names one of its own", () => {
    const base = tagCounts(policy, NONE);
    expect(tagCounts(policy, { ...NONE, keep_demographics: false })).toEqual({ removed: base.removed + 3, kept: base.kept - 3, extra: 0 });
    expect(tagCounts(policy, { ...NONE, keep: ["0010,0010", "0008,0080"] })).toEqual({ removed: base.removed - 2, kept: base.kept + 2, extra: 0 });
    // a tag of this dataset's own leaves beside the rest
    expect(tagCounts(policy, { ...NONE, remove: ["0008,1030"] })).toEqual({ removed: base.removed + 1, kept: base.kept, extra: 1 });
    // one the engine removes already is the same tag, removed once: it is no addition
    expect(tagCounts(policy, { ...NONE, remove: ["0010,0010"] })).toEqual(base);
    // what is removed and what is kept always add up to what the door serves
    for (const tags of [NONE, { ...NONE, keep_demographics: false }, { ...NONE, keep: ["0010,0010"] }, { ...NONE, remove: ["0008,1030"] }]) {
      const c = tagCounts(policy, tags);
      expect(c.removed - c.extra + c.kept).toBe(policy.count);
    }
  });
});

describe("keeping a tag, and naming one of this dataset's own", () => {
  it("keeps one the engine removes as this dataset's exception, and lets it go again", () => {
    const kept = keepTag(policy, NONE, "0010,0010", true);
    expect(kept.keep).toEqual(["0010,0010"]);
    expect(keepTag(policy, kept, "0010,0010", false).keep).toEqual([]);
    // keeping a tag this dataset removes takes it off that list: the engine refuses a tag on both
    const both = keepTag(policy, { ...NONE, remove: ["0008,1030"] }, "0008,1030", true);
    expect(both.remove).toEqual([]);
    expect(both.keep).toEqual(["0008,1030"]);
  });

  it("lets one covariate go without taking the others with it", () => {
    const [first, ...others] = policy.covariates.tags;
    const tags = keepTag(policy, NONE, first, false);
    expect(tags.keep_demographics).toBe(false);
    expect(tags.keep).toEqual(others);
    expect(demographicsKept(policy, NONE)).toBe(true);
    expect(demographicsKept(policy, tags)).toBe(false);
    // the others are where they were; only the first changed
    expect(tagCounts(policy, tags)).toEqual({ removed: tagCounts(policy, NONE).removed + 1, kept: tagCounts(policy, NONE).kept - 1, extra: 0 });
    expect(keepTag(policy, tags, first, true).keep).toContain(first);
    expect(demographicsKept(policy, keepTag(policy, tags, first, true))).toBe(true);
  });

  it("takes a tag of this dataset's own, and refuses one that is already removed, kept, listed, or beyond removing", () => {
    expect(addRemoved(policy, NONE, "0008,1030")).toEqual({ tags: { keep_demographics: true, remove: ["0008,1030"], keep: [] } });
    expect(why(NONE, "nonsense")).toBe("A tag is four hexadecimal digits, a comma, four more: 0008,1030.");
    expect(why(NONE, "0010,0010")).toBe("0010,0010 is already removed: the pseudonymiser removes it with the patient group.");
    expect(why(NONE, PATIENT_ID)).toContain("cannot be removed");
    expect(why(NONE, PATIENT_AGE)).toContain("cannot be removed");
    expect(why(NONE, MANDATORY[1])).toContain("cannot be removed");
    expect(why({ ...NONE, keep: ["0008,1030"] }, "0008,1030")).toContain("Keeping beats removing");
    expect(why({ ...NONE, remove: ["0008,1030"] }, "0008,1030")).toBe("0008,1030 is on this dataset's list already.");
    // a covariate the dataset keeps is kept, so removing it is refused until it is let go
    expect(why(NONE, policy.covariates.tags[0])).toContain("Keeping beats removing");
    expect(dropRemoved({ ...NONE, remove: ["0008,1030"] }, "0008,1030").remove).toEqual([]);
  });

  it("reads a dataset that says nothing as the defaults, and its own list apart from the engine's", () => {
    expect(extraTags(policy, { ...NONE, remove: ["0008,1030", "0010,0010"] })).toEqual(["0008,1030"]);
    expect(tagsOf(null)).toEqual({ keep_demographics: true, remove: [], keep: [] });
    expect(tagsOf({ keep_demographics: false, remove: ["0010,21a0"], keep: [] })).toEqual({ keep_demographics: false, remove: ["0010,21A0"], keep: [] });
    expect(sameTags(NONE, { ...NONE })).toBe(true);
    expect(sameTags(NONE, { ...NONE, keep: ["0010,0010"] })).toBe(false);
  });
});

describe("an engine that serves no policy", () => {
  it("shows what this dataset says of itself, and nothing the desk kept of its own", () => {
    const rows = tagRows(null, { keep_demographics: true, remove: ["0008,1030"], keep: ["0008,1010"] });
    expect(rows.map((r) => r.tag)).toEqual(["0008,1010", "0008,1030"]);
    expect(rows[0]).toMatchObject({ fate: "kept", kept: true, fixed: false, category: null });
    expect(rows[0].name).toBe("StationName");
    expect(rows[1]).toMatchObject({ fate: "added", kept: false, fixed: false });
    // a dataset that says nothing has nothing to show: the desk holds no list to fall back on
    expect(tagRows(null, NONE)).toEqual([]);
  });

  it("knows of nothing that cannot be removed, and leaves that to the engine", () => {
    expect(neverRemoved(null, PATIENT_ID)).toBeNull();
    expect(neverRemoved(null, MANDATORY[0])).toBeNull();
    expect(addRemoved(null, NONE, PATIENT_ID)).toEqual({ tags: { keep_demographics: true, remove: [PATIENT_ID], keep: [] } });
  });

  it("still refuses what it can see for itself", () => {
    expect(why(NONE, "nonsense", null)).toContain("four hexadecimal digits");
    expect(why({ ...NONE, keep: ["0008,1030"] }, "0008,1030", null)).toContain("Keeping beats removing");
    expect(why({ ...NONE, remove: ["0008,1030"] }, "0008,1030", null)).toContain("already");
  });

  it("keeps and lets go a tag without knowing which are covariates", () => {
    const kept = keepTag(null, NONE, "0010,0040", true);
    expect(kept.keep).toEqual(["0010,0040"]);
    expect(keepTag(null, kept, "0010,0040", false).keep).toEqual([]);
    // the switch is left as it stands: what the engine does about the covariates is the engine's
    expect(keepTag(null, NONE, "0010,0040", false).keep_demographics).toBe(true);
  });
});
