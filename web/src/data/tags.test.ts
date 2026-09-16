// SPDX-License-Identifier: AGPL-3.0-only
// The tag chooser's rules (record 27, R3a): that the hundred carried here are
// the engine's hundred, group for group; what becomes of each tag under a
// dataset; and that the summary's counts follow those rules rather than
// subtracting from a round number, so a dataset that keeps four of them can
// never read a hundred removed. The datasets here are made up.

import { describe, expect, it } from "vitest";
import type { Tags } from "./datasets";
import { REMOVED_GROUPS, REMOVED_TOTAL } from "./pseudonyms";
import {
  addRemoved,
  countWords,
  demographicsKept,
  dropRemoved,
  extraTags,
  fateOf,
  keepTag,
  matches,
  MANDATORY,
  neverRemoved,
  normaliseTag,
  PATIENT_AGE,
  PATIENT_ID,
  sameTags,
  STANDARD,
  STANDARD_TOTAL,
  standardTag,
  tagCounts,
  tagRows,
  tagsOf,
  DEMOGRAPHICS,
  GROUP_TAGS,
} from "./tags";

const NONE: Tags = { keep_demographics: true, remove: [], keep: [] };

describe("the hundred the pseudonymiser removes", () => {
  it("is the engine's list, group for group", () => {
    // engine/crates/nils-release/src/tags.rs: patient 34, provider 38, trial 23, institution 5
    expect(STANDARD_TOTAL).toBe(100);
    expect(GROUP_TAGS).toEqual([
      { group: "patient", tags: 34 },
      { group: "provider", tags: 38 },
      { group: "trial", tags: 23 },
      { group: "institution", tags: 5 },
    ]);
    // the card's bar reads the same list, so the two can never disagree
    expect(REMOVED_TOTAL).toBe(100);
    expect(REMOVED_GROUPS).toBe(GROUP_TAGS);
  });

  it("holds every tag once, as gggg,eeee, and holds neither the mandatory pair nor a date the leaving policy governs", () => {
    const tags = STANDARD.map((t) => t.tag);
    expect(new Set(tags).size).toBe(tags.length);
    for (const t of tags) expect(t).toMatch(/^[0-9A-F]{4},[0-9A-F]{4}$/);
    for (const m of MANDATORY) expect(tags).not.toContain(m);
    // the identifier is replaced rather than removed, and the dates are the leaving policy's
    expect(tags).not.toContain(PATIENT_ID);
    for (const date of ["0008,0020", "0008,0021", "0008,0022", "0008,0023", "0008,0012"]) expect(tags).not.toContain(date);
    // the age and the three covariates are in the list; what happens to them is not a removal
    expect(tags).toContain(PATIENT_AGE);
    for (const d of DEMOGRAPHICS) expect(tags).toContain(d);
    expect(standardTag("0010,0010")?.name).toBe("PatientName");
    // five of them are in no standard dictionary, so they carry no name rather than an invented one
    expect(STANDARD.filter((t) => t.name === null).map((t) => t.tag)).toEqual(["0008,106E", "0012,0088", "0012,0089", "0012,0090", "0012,0091"]);
  });

  it("says which tags can never be removed, and why", () => {
    expect(neverRemoved(PATIENT_ID)).toContain("replaced by the subject's code");
    expect(neverRemoved(PATIENT_AGE)).toContain("computed");
    expect(neverRemoved("0008,0016")).toContain("not a file");
    expect(neverRemoved("0008,0018")).toContain("not a file");
    expect(neverRemoved("0010,0010")).toBeNull();
  });
});

describe("what becomes of a tag under one dataset", () => {
  it("is removed with its group, kept as a covariate, kept as this dataset's exception, or written", () => {
    expect(fateOf(NONE, standardTag("0010,0010")!)).toMatchObject({ fate: "removed", words: "removed with the patient group", kept: false, fixed: false });
    expect(fateOf(NONE, standardTag("0010,0040")!)).toMatchObject({ fate: "covariate", kept: true, fixed: false });
    expect(fateOf(NONE, standardTag(PATIENT_AGE)!)).toMatchObject({ fate: "written", kept: true, fixed: true });
    expect(fateOf({ ...NONE, keep: ["0008,1010"] }, standardTag("0008,1010")!)).toMatchObject({ fate: "kept", kept: true, fixed: false });
    expect(fateOf({ ...NONE, keep_demographics: false }, standardTag("0010,0040")!)).toMatchObject({ fate: "removed", kept: false });
  });

  it("gives the chooser the three the engine settles itself, the hundred, and this dataset's own, and lets no one toggle the first", () => {
    const rows = tagRows({ ...NONE, remove: ["0008,1030"] });
    expect(rows).toHaveLength(3 + 100 + 1);
    const fixed = rows.filter((r) => r.fixed);
    expect(fixed.map((r) => r.tag)).toEqual([PATIENT_ID, "0008,0016", "0008,0018", PATIENT_AGE]);
    expect(rows.find((r) => r.tag === PATIENT_ID)?.words).toBe("replaced by the subject's code");
    expect(rows.find((r) => r.tag === "0008,0016")?.words).toContain("remapped when the scans leave");
    expect(rows.find((r) => r.tag === "0008,1030")).toMatchObject({ fate: "added", group: null, fixed: false });
  });

  it("answers the search box by tag or by name", () => {
    const row = tagRows(NONE).find((r) => r.tag === "0010,0010")!;
    expect(matches(row, "")).toBe(true);
    expect(matches(row, "patientname")).toBe(true);
    expect(matches(row, "0010,00")).toBe(true);
    expect(matches(row, "institution")).toBe(false);
  });
});

describe("the summary's counts", () => {
  it("follow the rules rather than a round number: the age and the three covariates are kept, so a hundred are never removed", () => {
    expect(tagCounts(NONE)).toEqual({ removed: 96, kept: 4, extra: 0 });
    expect(countWords(tagCounts(NONE))).toBe("96 removed · 4 kept · none added");
  });

  it("move one for one as a dataset keeps a tag, drops the covariates, or names one of its own", () => {
    expect(tagCounts({ ...NONE, keep_demographics: false })).toEqual({ removed: 99, kept: 1, extra: 0 });
    expect(tagCounts({ ...NONE, keep: ["0010,0010", "0008,0080"] })).toEqual({ removed: 94, kept: 6, extra: 0 });
    // a tag of this dataset's own leaves beside the hundred
    expect(tagCounts({ ...NONE, remove: ["0008,1030"] })).toEqual({ removed: 97, kept: 4, extra: 1 });
    // one already among the hundred is the same tag, removed once: it is no addition
    expect(tagCounts({ ...NONE, remove: ["0010,0010"] })).toEqual({ removed: 96, kept: 4, extra: 0 });
    // what the hundred removes and what it keeps always add up to the hundred
    for (const tags of [NONE, { ...NONE, keep_demographics: false }, { ...NONE, keep: ["0010,0010"] }, { ...NONE, remove: ["0008,1030"] }]) {
      const c = tagCounts(tags);
      expect(c.removed - c.extra + c.kept).toBe(STANDARD_TOTAL);
    }
  });
});

describe("keeping a tag, and naming one of this dataset's own", () => {
  it("keeps one of the hundred as this dataset's exception, and lets it go again", () => {
    const kept = keepTag(NONE, "0010,0010", true);
    expect(kept.keep).toEqual(["0010,0010"]);
    expect(keepTag(kept, "0010,0010", false).keep).toEqual([]);
    // keeping a tag this dataset removes takes it off that list: the engine refuses a tag on both
    const both = keepTag({ ...NONE, remove: ["0008,1030"] }, "0008,1030", true);
    expect(both.remove).toEqual([]);
    expect(both.keep).toEqual(["0008,1030"]);
  });

  it("lets one covariate go without taking the other two with it", () => {
    const tags = keepTag(NONE, "0010,0040", false);
    expect(tags.keep_demographics).toBe(false);
    expect(tags.keep).toEqual(["0010,1030", "0010,1020"]);
    expect(demographicsKept(NONE)).toBe(true);
    expect(demographicsKept(tags)).toBe(false);
    // weight and size are where they were; only sex changed
    expect(tagCounts(tags)).toEqual({ removed: 97, kept: 3, extra: 0 });
    // ticking it again keeps it, one by one
    expect(keepTag(tags, "0010,0040", true).keep).toContain("0010,0040");
    expect(demographicsKept(keepTag(tags, "0010,0040", true))).toBe(true);
  });

  it("takes a tag of this dataset's own, and refuses one that is already removed, kept, listed, or beyond removing", () => {
    const added = addRemoved(NONE, "0008,1030");
    expect(added).toEqual({ tags: { keep_demographics: true, remove: ["0008,1030"], keep: [] } });
    // the refusal, where there is one: an answer carries the lists or the words, never both
    const why = (tags: Tags, text: string): string | null => {
      const asked = addRemoved(tags, text);
      return "refusal" in asked ? asked.refusal : null;
    };
    expect(why(NONE, "nonsense")).toBe("A tag is four hexadecimal digits, a comma, four more: 0008,1030.");
    expect(why(NONE, "0010,0010")).toBe("0010,0010 is already removed: it is one of the hundred, in the patient group.");
    expect(why(NONE, PATIENT_ID)).toContain("cannot be removed");
    expect(why(NONE, PATIENT_AGE)).toContain("cannot be removed");
    expect(why(NONE, "0008,0018")).toContain("cannot be removed");
    expect(why({ ...NONE, keep: ["0008,1030"] }, "0008,1030")).toContain("Keeping beats removing");
    expect(why({ ...NONE, remove: ["0008,1030"] }, "0008,1030")).toBe("0008,1030 is on this dataset's list already.");
    // a covariate the dataset keeps is kept, so removing it is refused until it is let go
    expect(why(NONE, "0010,0040")).toContain("Keeping beats removing");
    expect(dropRemoved({ ...NONE, remove: ["0008,1030"] }, "0008,1030").remove).toEqual([]);
  });

  it("reads a tag as the engine writes it, and a dataset that says nothing as the defaults", () => {
    expect(normaliseTag(" 0008,1030 ")).toBe("0008,1030");
    expect(normaliseTag("0010,21a0")).toBe("0010,21A0");
    expect(normaliseTag("0010-0010")).toBeNull();
    expect(normaliseTag("10,10")).toBeNull();
    expect(tagsOf(null)).toEqual({ keep_demographics: true, remove: [], keep: [] });
    expect(tagsOf({ keep_demographics: false, remove: ["0010,21a0"], keep: [] })).toEqual({ keep_demographics: false, remove: ["0010,21A0"], keep: [] });
    expect(extraTags({ ...NONE, remove: ["0008,1030", "0010,0010"] })).toEqual(["0008,1030"]);
    expect(sameTags(NONE, { ...NONE })).toBe(true);
    expect(sameTags(NONE, { ...NONE, keep: ["0010,0010"] })).toBe(false);
  });
});
