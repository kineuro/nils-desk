// SPDX-License-Identifier: AGPL-3.0-only
// Verify mode's pure parts (record 58 P1, spec 12): the fifth purpose; the
// make body with its planted share, seed and confusion table, read from
// pasted or uploaded text; the reading with A and B; the suggestion that
// fills every asked axis and leaves the split axes to A or B, unlabelled;
// the rows with the legal values first; the pace and results doors' names
// and the catch against the bar.

import { describe, expect, it } from "vitest";
import { ASKED, PROPOSAL, QUESTION, READER_A, READER_B, RESULTS_VERIFY, STATS_VERIFY, WHY_VERIFY, WHY_VERIFY_AB } from "../../test/layout/reader.fixture";
import type { Json } from "../ask/client";
import { confusionRows, confusionWords, emptyDraft, makeBody, plantedBody, PURPOSE_WORDS, purposeOf, type Campaign, type Draft, type Given } from "./client";
import { chosenSide, PLANTED_WORDS, readingOf, statsOf, suggestedValue, suggestionOf, takeCandidate, verifySuggestionOf, verifyWords } from "./reader";
import { catchWords, nameOf, raterNames, resultsOf, type Results } from "./results";
import { rowsOf, verifyRows } from "./workspace";

const draft = (p: Partial<Draft>): Draft => ({ ...emptyDraft(), name: "verify-december", source: "selection", from: "audit@3", kind: "axes", axes: ["technique", "base"], purpose: "verify", seed: "written-down", ...p });
const TABLE = "true\twrong\tcount\nMPRAGE\tMEMPRAGE\t12\nTSE\t3D-TSE\t4\n# a note\n\nMPRAGE\tMEMPRAGE\t3\n";

describe("the verify purpose", () => {
  it("is the fifth purpose, read from the campaign and said in the form's words", () => {
    expect(purposeOf({ purpose: "verify" })).toBe("verify");
    expect(purposeOf({ purpose: "measure" })).toBe("measure");
    expect(purposeOf({})).toBe("decide");
    expect(PURPOSE_WORDS.verify.words).toBe("Verify");
    expect(PURPOSE_WORDS.verify.says).toContain("planted");
  });

  it("makes a campaign with its planted share, seed and table as rows, suggesting the rules where nothing was chosen", () => {
    const made = makeBody(draft({ plantedFrom: TABLE, hideHeader: true }));
    expect(made.ok && made.body).toMatchObject({
      purpose: "verify",
      suggest: "rules",
      planted: { share: 0.1, seed: "written-down", from: [{ true: "MPRAGE", wrong: "MEMPRAGE", count: 15 }, { true: "TSE", wrong: "3D-TSE", count: 4 }] },
    });
    // the header text stays on a verify screen, whatever the pictures-only box says
    expect(made.ok && "hide_header" in made.body).toBe(false);
    // a suggestion chosen stays
    const imported = makeBody(draft({ suggest: "imported" }));
    expect(imported.ok && imported.body.suggest).toBe("imported");
    expect(imported.ok && imported.body.planted).toEqual({ share: 0.1, seed: "written-down", from: null });
    // another purpose plants nothing
    const measure = makeBody(draft({ purpose: "measure" }));
    expect(measure.ok && "planted" in measure.body).toBe(false);
  });

  it("needs a share from 0 to 1, a seed, and a table it can read or none", () => {
    expect(makeBody(draft({ plantedShare: "1.5" }))).toEqual({ ok: false, needs: "a planted share from 0 to 1" });
    expect(makeBody(draft({ plantedShare: "" }))).toEqual({ ok: false, needs: "a planted share from 0 to 1" });
    expect(makeBody(draft({ seed: " " }))).toEqual({ ok: false, needs: "a seed for the planted draw" });
    expect(makeBody(draft({ plantedFrom: "nothing here" })).ok).toBe(false);
    expect(plantedBody({ plantedShare: "0.2", seed: "s", plantedFrom: "" })).toEqual({ ok: true, body: { share: 0.2, seed: "s", from: null } });
  });
});

describe("the confusion table", () => {
  it("reads tabs, commas and semicolons, skips the header, blanks and # lines, sums a pair given twice", () => {
    const t = confusionRows(TABLE);
    expect(t).toEqual({ rows: [{ true: "MPRAGE", wrong: "MEMPRAGE", count: 15 }, { true: "TSE", wrong: "3D-TSE", count: 4 }], skipped: 0, header: true });
    expect(confusionRows('"T1w",T2w,2\nPDw;T2w;5').rows).toEqual([{ true: "T1w", wrong: "T2w", count: 2 }, { true: "PDw", wrong: "T2w", count: 5 }]);
  });

  it("skips and counts a row without a count, a count that is no whole number above zero, or the same value twice; reads only three cells", () => {
    const t = confusionRows("T1w\tT2w\n T1w\tT2w\t0\nT1w\tT2w\t2.5\nT1w\tT1w\t3\nT1w\tT2w\t3\tbase\tmore");
    expect(t.rows).toEqual([{ true: "T1w", wrong: "T2w", count: 3 }]);
    expect(t.skipped).toBe(4);
    expect(t.header).toBe(false);
    expect(confusionRows("")).toEqual({ rows: [], skipped: 0, header: false });
  });

  it("says what was read under the field", () => {
    expect(confusionWords(confusionRows(""), "")).toBe("None: a random other legal value is planted.");
    expect(confusionWords(confusionRows("x"), "x")).toBe("No row read: true value, wrong value, count, one row a line.");
    expect(confusionWords(confusionRows(TABLE + "bad line\n"), TABLE)).toBe("2 rows · 19 confusions · 1 line skipped. The commonest wrong value for each true value is planted.");
  });
});

describe("a verify item's reading", () => {
  const r = readingOf(WHY_VERIFY as unknown as Json);
  const ab = readingOf(WHY_VERIFY_AB as unknown as Json);

  it("fills in every asked axis with the proposal, and says what to do", () => {
    expect(r.suggested).toEqual(PROPOSAL);
    expect(r.ab).toBeUndefined();
    const s = verifySuggestionOf(QUESTION, r)!;
    expect(s.agreed).toEqual(ASKED);
    expect(s.differ).toEqual([]);
    expect(s.values).toEqual(PROPOSAL);
    expect(s.sides).toBeUndefined();
    expect(verifyWords(s)).toBe("Filled in: Enter accepts, or change an axis.");
    expect(PLANTED_WORDS).not.toMatch(/\d/);
  });

  it("leaves the axes A and B differ on open, offers the two unlabelled, and suggests nothing whole", () => {
    expect(ab.ab).toEqual([{ technique: "MPRAGE" }, { technique: "MEMPRAGE" }]);
    const s = verifySuggestionOf(QUESTION, ab)!;
    expect(s.differ).toEqual(["technique"]);
    expect("technique" in s.values).toBe(false);
    expect(s.agreed).toEqual(ASKED.filter((a) => a !== "technique"));
    expect(s.sides).toEqual([{ technique: "MPRAGE" }, { technique: "MEMPRAGE" }]);
    expect(s.offered.map((c) => c.values.technique)).toEqual(["MPRAGE", "MEMPRAGE"]);
    expect(s.offered.map((c) => c.p)).toEqual([0, 0]);
    // nothing says whose side is which
    expect(s.by).toBeUndefined();
    expect(JSON.stringify(s)).not.toContain("rules");
    expect(suggestedValue(QUESTION, s)).toBeNull();
    expect(verifyWords(s)).toBe("A and B differ on technique: pick one, or choose below.");
    // a side taken changes the split axis alone; the rest of the answer stands
    const was: Given = { kind: "values", values: { ...s.values, body_part: "neck" } };
    const took = takeCandidate(QUESTION, was, s.offered[1], s);
    expect(took).toEqual({ kind: "values", values: { ...s.values, body_part: "neck", technique: "MEMPRAGE" } });
    expect(chosenSide(s, took)).toBe(1);
    expect(chosenSide(s, was)).toBeNull();
    expect(chosenSide(s, takeCandidate(QUESTION, was, s.offered[0], s))).toBe(0);
  });

  it("is blind as any blind item: nothing filled in, no A or B", () => {
    const blind = readingOf({ ...(WHY_VERIFY_AB as unknown as Json), blind: true });
    expect(blind.suggested).toBeNull();
    expect(blind.ab).toBeUndefined();
    expect(suggestionOf(QUESTION, blind)).toBeNull();
    expect(verifySuggestionOf(QUESTION, blind)).toBeNull();
  });
});

describe("the rows of a verify item", () => {
  const rows = rowsOf(QUESTION, null);
  const ordered = verifyRows(QUESTION, rows, PROPOSAL);

  it("puts the values the pack allows beside the proposal first and the forbidden after them, with the reason", () => {
    const technique = ordered.find((r) => r.axis === "technique")!;
    const unfit = Object.keys(technique.unfit ?? {});
    // a technique that implies another base cannot stand beside base T1w
    expect(unfit.sort()).toEqual(["ASL-EPI", "DWI-EPI", "ME-GRE", "comb-ME-GRE"].sort());
    expect(technique.values.slice(-4).sort()).toEqual(unfit.sort());
    expect(technique.values.slice(0, -4).some((v) => v in (technique.unfit ?? {}))).toBe(false);
    expect(technique.unfit?.["ME-GRE"]).toContain("T2starw");
    expect(technique.values).toHaveLength(rows.find((r) => r.axis === "technique")!.values.length);
    // MPRAGE sets base T1w, so every other base is forbidden and T1w stands first
    const base = ordered.find((r) => r.axis === "base")!;
    expect(base.values[0]).toBe("T1w");
    expect(Object.keys(base.unfit ?? {})).not.toContain("T1w");
    expect(base.unfit?.T2w).toContain("T1w");
  });

  it("leaves a row without a forbidden value as it was, and a question without constraints alone", () => {
    const body = ordered.find((r) => r.axis === "body_part")!;
    expect(body).toBe(rows.find((r) => r.axis === "body_part"));
    const plain = { ...QUESTION, constraints: undefined };
    expect(verifyRows(plain, rows, PROPOSAL)).toBe(rows);
  });
});

describe("the readers' names and the catch", () => {
  it("reads the account's name on the pace door", () => {
    const s = statsOf(STATS_VERIFY as unknown as Json);
    expect(s.raters.map((r) => [r.principal, r.name])).toEqual([
      [READER_A, "Astrid"],
      [READER_B, "Bo"],
    ]);
  });

  it("reads the catch against the bar, leniently, and names a rater by the account", () => {
    const r = resultsOf(RESULTS_VERIFY as unknown as Results);
    expect(r.catch).toEqual(RESULTS_VERIFY.catch);
    expect(r.below_bar).toBe(true);
    expect(catchWords(r.catch!)).toBe("21 of 25 · 84%");
    expect(catchWords({ planted: 0, caught: 0, rate: null })).toBe("nothing planted");
    expect(nameOf(r, READER_A)).toBe("Astrid");
    expect(nameOf(r, "someone@site")).toBe("someone");
    // the rate and the bar from the counts where the engine leaves them out; under the bar from the rate
    const bare = resultsOf({ ...RESULTS_VERIFY, catch: { planted: 20, caught: 19, per_rater: [{ rater: READER_A, planted: 20, caught: 19 }] }, below_bar: undefined } as unknown as Results);
    expect(bare.catch).toEqual({ planted: 20, caught: 19, rate: 0.95, bar: 0.9, per_rater: [{ rater: READER_A, name: null, planted: 20, caught: 19, rate: 0.95 }] });
    expect(bare.below_bar).toBe(false);
    // another campaign has no catch
    const none = resultsOf({ ...RESULTS_VERIFY, catch: undefined, below_bar: undefined } as unknown as Results);
    expect([none.catch, none.below_bar]).toEqual([null, false]);
  });

  it("names the raters of the items table by their account where a door gave it", () => {
    const answers = [{ id: 1, principal: READER_A, role: "rater" as const }, { id: 2, principal: READER_B, role: "rater" as const }];
    const named = raterNames(answers, "nima@site", true, new Map([[READER_A, "Astrid"]]));
    expect(named.get(READER_A)).toBe("Astrid");
    expect(named.get(READER_B)).toBe(READER_B);
    // numbered to anyone else, as before
    expect(raterNames(answers, READER_B, false, new Map([[READER_A, "Astrid"]])).get(READER_A)).toBe("rater 1");
  });

  it("reads the campaign's planted values as the door reports them", () => {
    const c = { purpose: "verify", planted: { share: 0.1, count: 25, opened: false } } as unknown as Campaign;
    expect(purposeOf(c)).toBe("verify");
    expect(c.planted).toEqual({ share: 0.1, count: 25, opened: false });
  });
});
