// SPDX-License-Identifier: AGPL-3.0-only
// The question a viewer's level means: a dataset by the ask's dataset field
// and a cohort by a set of its own; each filter as the clause or the `has`
// that asks it, two values of one kind being either; what no question asks
// named with why and kept out of the document; the browser's words as the
// scans they leave; names with no code and no date in them; and who may keep
// what. That these documents answer what the viewer's doors answer is
// keep.live.test.ts's, against an engine.

import { describe, expect, it } from "vitest";
import type { Capabilities } from "../capabilities";
import type { Diagnosis } from "../ask/client";
import { browserKept, cannotPromote, countOf, grainWords, keepError, makerClause, mayCohort, maySelect, regionClause, scansKept, subjectsKept, unasked, visitsKept } from "./keep";
import type { Scan } from "./scans";
import type { Visit } from "./viewer";

const MS = { kind: "dataset" as const, name: "ms-a" };
const COHORT = { kind: "cohort" as const, name: "ms" };
const IN_MS = ["=", {}, ["field", {}, "dataset"], "ms-a"];

describe("the subjects' question", () => {
  it("is the dataset's subjects, by the dataset field, with nothing else when nothing narrows them", () => {
    const k = subjectsKept(MS, { found: null, filter: [] }, { shown: 25 });
    expect(k.grain).toBe("subject");
    expect(k.document).toEqual({
      ast_version: 1,
      name: "Subjects of ms-a",
      sets: { subjects: { grain: "subject", where: [IN_MS] } },
      out: { set: "subjects", level: "record" },
    });
    expect(k.narrowed).toEqual([]);
    expect(k.shown).toBe(25);
    expect(k.name).toBe("ms-a");
  });

  it("asks each filter as the subjects door reads it: visits as sessions, main scans as the pack's roles, regions and makers as scans", () => {
    const k = subjectsKept(MS, { found: null, filter: ["visits2", "main:t1w", "region:brain", "maker:Siemens"] }, { shown: 4 });
    const sets = k.document.sets as Record<string, unknown>;
    expect(sets.subjects).toEqual({
      grain: "subject",
      has: [
        { set: "visits", min: 2 },
        { set: "main", min: 1 },
        { set: "region", min: 1 },
        { set: "maker", min: 1 },
      ],
      where: [IN_MS],
    });
    expect(sets.visits).toEqual({ grain: "session", where: [IN_MS] });
    expect(sets.main).toEqual({ grain: "stack", from: "role:t1w", where: [IN_MS] });
    expect(sets.region).toEqual({ grain: "stack", where: [IN_MS, ["or", {}, ["=", {}, ["axis", {}, "body_part"], "brain"], ["=", {}, ["axis", {}, "body_part"], "brain-neck"]]] });
    expect(sets.maker).toEqual({ grain: "stack", where: [IN_MS, ["contains", {}, ["coalesce", {}, ["field", {}, "manufacturer"], ["field", {}, "study.manufacturer"]], "siemens"]] });
    expect(k.narrowed.map((x) => [x.key, x.asked])).toEqual([
      ["visits2", true],
      ["main", true],
      ["region", true],
      ["maker", true],
    ]);
    expect(k.document.name).toBe("Subjects of ms-a, with more than one visit, with a main T1w, with brain scans, scanned on a Siemens");
    expect(k.name).toBe("ms-a-visits2-t1w-brain-siemens");
  });

  it("reads two values of one kind as either: two roles are a union, two makers either clause", () => {
    const k = subjectsKept(MS, { found: null, filter: ["main:t1w", "main:flair", "maker:GE", "maker:Philips"] }, { shown: null });
    const sets = k.document.sets as Record<string, Record<string, unknown>>;
    expect(sets.main_1).toEqual({ grain: "stack", from: "role:t1w", where: [IN_MS] });
    expect(sets.main_2).toEqual({ grain: "stack", from: "role:flair", where: [IN_MS] });
    expect(sets.main).toEqual({ grain: "stack", algebra: { op: "union", sets: ["main_1", "main_2"] } });
    expect((sets.maker.where as unknown[])[1]).toEqual(["or", {}, makerClause("GE"), makerClause("Philips")]);
    expect(k.narrowed.map((x) => x.words)).toEqual(["with a main T1w or with a main FLAIR", "scanned on a GE or scanned on a Philips"]);
  });

  it("keeps a cohort's members by a cohort set the subjects are of, the scans of any dataset", () => {
    const k = subjectsKept(COHORT, { found: null, filter: ["region:spine"] }, { shown: 8 });
    expect(k.document.sets).toEqual({
      scope: { grain: "cohort", where: [["=", {}, ["field", {}, "name"], "ms"]] },
      subjects: { grain: "subject", of: "scope", has: [{ set: "region", min: 1 }] },
      region: { grain: "stack", where: [["=", {}, ["axis", {}, "body_part"], "spine"]] },
    });
    expect(k.document.name).toBe("Subjects of the cohort ms, with spine scans");
  });

  it("keeps a search as the subjects it found, by id, and never what was typed", () => {
    const k = subjectsKept(MS, { found: [4, 9], filter: [] }, { shown: 2 });
    expect((k.document.sets as Record<string, { where: unknown[] }>).subjects.where).toEqual([IN_MS, ["in", {}, ["field", {}, "id"], [4, 9]]]);
    expect(unasked(k)).toEqual([]);
    expect(k.narrowed).toEqual([{ key: "q", words: "found by the search, 2 subjects", asked: true }]);
    // the search names neither the selection nor the question
    expect(k.name).toBe("ms-a");
    expect(k.document.name).toBe("Subjects of ms-a");
  });

  it("names a filter no question asks, with why, and leaves it out of the document", () => {
    const k = subjectsKept(MS, { found: null, filter: ["look", "main:t1w"] }, { shown: 3 });
    expect(unasked(k)).toEqual([{ key: "look", words: "with scans to look at", asked: false, why: "No question asks whether a scan needs a look." }]);
    expect(JSON.stringify(k.document)).not.toContain("look");
    expect((k.document.sets as Record<string, { has: unknown[] }>).subjects.has).toEqual([{ set: "main", min: 1 }]);
  });
});

describe("the clauses of a filter", () => {
  it("reads a region as the body parts that hold it: the brain and the neck are each in brain-neck", () => {
    expect(regionClause(["spine"])).toEqual(["=", {}, ["axis", {}, "body_part"], "spine"]);
    expect(regionClause(["neck", "brain"])).toEqual(["or", {}, ...["neck", "brain-neck", "brain"].map((v) => ["=", {}, ["axis", {}, "body_part"], v])]);
  });

  it("names a maker as the viewer does, the first of the big makers that matches, any other as written", () => {
    const M = ["coalesce", {}, ["field", {}, "manufacturer"], ["field", {}, "study.manufacturer"]];
    expect(makerClause("Siemens")).toEqual(["contains", {}, M, "siemens"]);
    expect(makerClause("Philips")).toEqual(["and", {}, ["contains", {}, M, "philips"], ["not", {}, ["contains", {}, M, "siemens"]]]);
    const ge = makerClause("GE") as unknown[];
    expect(ge[0]).toBe("and");
    expect(ge[2]).toEqual(["or", {}, ["in", {}, M, ["GE", "Ge", "gE", "ge"]], ["starts_with", {}, M, "ge "], ["contains", {}, M, "general electric"]]);
    expect(makerClause(" Bruker ")).toEqual(["=", {}, M, "Bruker"]);
  });
});

const visit = (session: number | null, studies: number[], over: Partial<Visit> = {}): Visit => ({
  key: session !== null ? `s${session}` : `t${studies.join(".")}`,
  session,
  studies,
  label: "ses-20190913",
  first: "2019-09-13",
  day: "0",
  number: 1,
  scans: 5,
  look: 0,
  regions: ["brain"],
  kinds: [],
  contrast: false,
  symri: 0,
  main: [],
  ...over,
});

describe("one subject's visits", () => {
  it("are the subject's sessions in the dataset, by its id, each filter a has of the scans that hold it", () => {
    const k = visitsKept(MS, { id: 3, label: "9f3c0a7e" }, ["symri", "region:spine"], [visit(8, [9]), visit(11, [12])], 2);
    expect(k.grain).toBe("session");
    expect(k.document.sets).toEqual({
      subject: { grain: "subject", where: [["=", {}, ["field", {}, "id"], 3]] },
      visits: { grain: "session", of: "subject", where: [IN_MS], has: [{ set: "symri", min: 1 }, { set: "region", min: 1 }] },
      symri: { grain: "stack", where: [IN_MS, ["=", {}, ["axis", {}, "provenance"], "SyMRI"]] },
      region: { grain: "stack", where: [IN_MS, ["=", {}, ["axis", {}, "body_part"], "spine"]] },
    });
    expect(k.document.out).toEqual({ set: "visits", level: "record" });
    // the page's own words, the subject as shown; no code and no date in what is stored
    expect(k.where).toBe("ms-a · 9f3c0a7e");
    expect(k.document.name).toBe("Visits of subject 3 in ms-a, with SyMRI, with spine scans");
    expect(k.name).toBe("ms-a-subject-3-symri-spine");
    expect(k.shown).toBe(2);
  });

  it("names contrast, which no question can ask yet, and the visits no session holds", () => {
    const k = visitsKept(COHORT, { id: 7, label: "9f3c" }, ["contrast"], [visit(26, [27]), visit(null, [28, 29])], 2);
    expect(unasked(k).map((x) => [x.key, x.words])).toEqual([
      ["contrast", "with contrast"],
      ["no-session", "1 visit with no session yet"],
    ]);
    expect(k.document.sets).toEqual({
      scope: { grain: "cohort", where: [["=", {}, ["field", {}, "name"], "ms"]] },
      subject: { grain: "subject", of: "scope", where: [["=", {}, ["field", {}, "id"], 7]] },
      visits: { grain: "session", of: "subject" },
    });
    // the page counted the visit with no session too
    expect(k.shown).toBe(1);
  });
});

const scan = (id: number, over: Partial<Scan> = {}): Scan => ({
  id,
  subjectId: 1,
  subject: "9f3c",
  session: 34,
  study: 5,
  label: null,
  day: null,
  name: `Scan_${id}`,
  description: null,
  bids: null,
  datatype: "anat",
  folder: "anat",
  axes: { base: "T1w" },
  series: id,
  orientation: "AXIAL",
  images: 10,
  picture: null,
  partial: false,
  questions: [],
  ...over,
});

describe("one visit's scans", () => {
  it("are its studies' scans in the dataset, the ones the pack ruled out named", () => {
    const k = scansKept(MS, { subject: 1, subjectLabel: "9f3c", visit: "s34", label: "ses-20190913", number: 2, studies: [5, 6], session: 34 }, [scan(11), scan(12, { axes: { disposition: "excluded" } })], 2);
    expect(k.document.sets).toEqual({ scans: { grain: "stack", where: [["in", {}, ["field", {}, "study.id"], [5, 6]], IN_MS] } });
    expect(k.where).toBe("ms-a · 9f3c · ses-20190913");
    expect(k.document.name).toBe("Scans of visit 2 of subject 1 in ms-a");
    expect(k.name).toBe("ms-a-subject-1-visit-2");
    expect(unasked(k).map((x) => x.words)).toEqual(["1 scan the pack ruled out"]);
    expect(k.shown).toBe(1);
  });

  it("is the session where no study is known, of the cohort's members", () => {
    const k = scansKept(COHORT, { subject: 1, subjectLabel: "9f3c", visit: "s34", label: "ses-1", number: null, studies: [], session: 34 }, null, null);
    expect(k.document.sets).toEqual({
      scope: { grain: "cohort", where: [["=", {}, ["field", {}, "name"], "ms"]] },
      scans: { grain: "stack", of: "scope", where: [["=", {}, ["field", {}, "session.id"], 34]] },
    });
  });
});

describe("the browser's scans", () => {
  it("are the scope's scans without words", () => {
    const k = browserKept(MS, [], [scan(1), scan(2)], { read: 2, total: 2 });
    expect(k.document.sets).toEqual({ scans: { grain: "stack", where: [IN_MS] } });
    expect(k.narrowed).toEqual([]);
    expect(k.shown).toBe(2);
    expect(k.name).toBe("ms-a-scans");
  });

  it("are the scans the words leave, named one by one, the words in no name", () => {
    const k = browserKept(COHORT, ["flair"], [scan(4), scan(9)], { read: 30, total: 30 });
    expect(k.document.sets).toEqual({
      scope: { grain: "cohort", where: [["=", {}, ["field", {}, "name"], "ms"]] },
      scans: { grain: "stack", of: "scope", where: [["in", {}, ["field", {}, "id"], [4, 9]]] },
    });
    expect(k.narrowed).toEqual([{ key: "words", words: "matching flair", asked: true }]);
    expect(k.shown).toBe(2);
    expect(JSON.stringify(k.document)).not.toContain("flair");
    expect(k.name).toBe("ms-filtered");
  });

  it("names the scans not read yet, which the words have not met", () => {
    const k = browserKept(MS, ["t2w"], [scan(4)], { read: 5000, total: 6200 });
    expect(unasked(k)).toEqual([{ key: "unread", words: "1,200 scans not read yet", asked: false, why: "The filter has matched only the scans read so far." }]);
  });
});

describe("counts, words and who may keep", () => {
  it("counts a document by the last stage of its answer's funnel", () => {
    const d = { funnel: [{ set: "main", rows: 40, subjects: 20 }, { set: "subjects", rows: 40, subjects: 40 }, { set: "subjects", rows: 20, subjects: 20 }] } as unknown as Diagnosis;
    expect(countOf(d, "subjects")).toEqual({ rows: 20, subjects: 20 });
    expect(countOf(d, "visits")).toBeNull();
    expect(grainWords("session", 1)).toBe("1 visit");
    expect(grainWords("stack", 1204)).toBe("1,204 scans");
  });

  it("refuses to promote a cut-off answer or an empty one, and knows the engine's refusals", () => {
    expect(cannotPromote({ truncated: true, row_count: 5000 })).toMatch(/cut off/);
    expect(cannotPromote({ truncated: false, row_count: 0 })).toBe("Nothing to add.");
    expect(cannotPromote({ truncated: false, row_count: 3 })).toBeNull();
    expect(keepError(new Error("ms is a cohort; a selection may take a cohort's name only as that cohort's own source ask"))).toBe("That name is a cohort's. Choose another.");
    expect(keepError(new Error("ms-a is a selection's name; a cohort cannot be named so (Wave 4b section 8.2)"))).toBe("That name is a selection's. Choose another.");
    expect(keepError(new Error("something else"))).toBeNull();
  });

  it("offers a selection to query work at quasi and a cohort to data work with query work, where the engine serves the doors", () => {
    const doors = ["POST /api/ask/diagnose", "POST /api/ask/documents", "POST /api/ask/run", "PUT /api/ask/selections/{name}", "POST /api/ask/handles/{id}/promote"];
    const caps = (grants: string[], detail = "quasi", served = doors) => ({ engine: { doors: served }, person: { grants, detail } }) as unknown as Capabilities;
    expect(maySelect(caps(["query:work"]))).toBe(true);
    expect(maySelect(caps(["query:work"], "plain"))).toBe(false);
    expect(maySelect(caps(["query:see"]))).toBe(false);
    expect(maySelect(caps(["query:work"], "quasi", doors.slice(1)))).toBe(false);
    expect(mayCohort(caps(["data:work", "query:work"], "plain"))).toBe(true);
    expect(mayCohort(caps(["data:work", "query:see"]))).toBe(false);
    expect(mayCohort(caps(["data:see", "query:work"]))).toBe(false);
    expect(mayCohort(caps(["data:work", "query:work"], "quasi", doors.filter((d) => !d.includes("promote"))))).toBe(false);
  });
});
