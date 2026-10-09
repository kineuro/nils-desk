// SPDX-License-Identifier: AGPL-3.0-only
// The dataset viewer's model: the address that keeps the view and the place
// in it, the doors' answers as the page reads them, the words a card says,
// the colours a card takes, a visit's folders, and where an arrow moves the
// cursor.

import { describe, expect, it } from "vitest";
import type { Scan } from "./scans";
import { compareScans } from "./tree";
import {
  colourOf,
  fillPictures,
  filterPhrase,
  foldersOf,
  kindsLine,
  legendOf,
  levelOfForTest,
  mainLine,
  paramsWords,
  parseView,
  scopeHome,
  short,
  showOptions,
  spanWords,
  step,
  subjectFacts,
  subjectsOf,
  toggled,
  viewHref,
  visitFilter,
  visitKey,
  visitOfScan,
  visitsOf,
  type Subject,
} from "./viewer";

const scan = (id: number, over: Partial<Scan> = {}): Scan => ({
  id,
  subjectId: 1,
  subject: "a1",
  session: 7,
  label: "20260102",
  day: "2026-01-02",
  name: `Scan ${id}`,
  description: null,
  bids: null,
  datatype: "anat",
  folder: "anat",
  axes: {},
  series: id,
  orientation: "AXIAL",
  images: 10,
  picture: null,
  partial: false,
  questions: [],
  ...over,
});

describe("the viewer's address", () => {
  it("keeps the view and the place, and reads them back", () => {
    const at = viewHref({ kind: "dataset", name: "study big" }, { subject: 12, visit: "s34", filter: ["look", "maker:GE"], q: "07" });
    expect(at).toBe("#data/datasets/study%20big/view?mode=grid&subject=12&visit=s34&q=07&filter=look%2Cmaker%3AGE");
    const q = Object.fromEntries(new URLSearchParams(at.split("?")[1]));
    expect(parseView(q)).toEqual({ mode: "grid", subject: 12, visit: "s34", scan: null, q: "07", filter: ["look", "maker:GE"], vfilter: [] });
    expect(viewHref({ kind: "cohort", name: "ms" }, { mode: "browser", scan: 5 })).toBe("#data/cohorts/ms/view?mode=browser&scan=5");
    expect(scopeHome({ kind: "cohort", name: "ms" })).toBe("#data/cohorts/ms");
  });

  it("knows a level whichever scan its cursor is on, and however its address is written", () => {
    expect(levelOfForTest("#data/datasets/a/view?mode=grid&subject=1&visit=s3&scan=12")).toBe(levelOfForTest("#data/datasets/a/view?mode=grid&subject=1&visit=s3"));
    expect(levelOfForTest("#data/datasets/a/view?mode=grid&scan=12&q=x")).toBe(levelOfForTest("#data/datasets/a/view?q=x&mode=grid"));
    expect(levelOfForTest("#data/datasets/a/view")).toBe(levelOfForTest("#data/datasets/a/view?mode=grid"));
    expect(levelOfForTest("#data/datasets/a/view?mode=grid&subject=1")).not.toBe(levelOfForTest("#data/datasets/a/view?mode=grid"));
    expect(levelOfForTest("#data/datasets/a/view?mode=browser")).not.toBe(levelOfForTest("#data/datasets/a/view?mode=grid"));
  });

  it("reads nothing it does not know: a bad id or visit is no place", () => {
    expect(parseView({ subject: "x", visit: "drop table", scan: "-1", mode: "other" })).toEqual({ mode: "grid", subject: null, visit: null, scan: null, q: "", filter: [], vfilter: [] });
    expect(parseView(undefined).mode).toBe("grid");
  });

  it("names a visit by its session, else by its studies, and asks the scans door so", () => {
    expect(visitKey({ session: 34, studies: [1, 2] })).toBe("s34");
    expect(visitKey({ session: null, studies: [101, 102] })).toBe("t101.102");
    expect(visitFilter("s34")).toEqual({ session: "34" });
    expect(visitFilter("t101.102")).toEqual({ studies: "101,102" });
    expect(visitFilter("x")).toBeNull();
    expect(visitOfScan({ session: 9, study: 3 })).toBe("s9");
    expect(visitOfScan({ session: null, study: 3 })).toBe("t3");
    expect(visitOfScan({ session: null, study: 3 }, [{ key: "t3.4", studies: [3, 4] } as never])).toBe("t3.4");
    expect(visitOfScan({ session: null, study: null })).toBeNull();
  });
});

describe("the doors' answers", () => {
  it("reads a page of subjects, with what it may lack", () => {
    const p = subjectsOf({
      detail: "quasi",
      show: "code",
      totals: { subjects: 70, visits: 112, scans: 991, look: 203 },
      matched: 31,
      subjects: [{ id: 4, code: "sub-1", label: null, visits: 2, scans: 19, look: 3, regions: ["brain"], makers: ["GE"], main: ["t1w"] }, { id: 5 }],
      next: 5,
      facets: { makers: [{ name: "GE", subjects: 40 }], id_types: [{ name: "study-id", subjects: 70 }] },
    });
    expect(p.totals).toEqual({ subjects: 70, visits: 112, scans: 991, look: 203 });
    expect(p.subjects[0]).toEqual({ id: 4, code: "sub-1", label: null, visits: 2, scans: 19, look: 3, regions: ["brain"], makers: ["GE"], main: ["t1w"] });
    expect(p.subjects[1]).toMatchObject({ id: 5, code: "Subject 5", regions: [], main: [] });
    expect(p.next).toBe(5);
    expect(p.facets.idTypes).toEqual([{ name: "study-id", subjects: 70 }]);
    expect(p.facets.roles).toEqual([]);
  });

  it("reads a subject's visits, a visit the engine keeps no session for named by its studies", () => {
    const v = visitsOf({
      subject: { id: 4, code: "sub-1", label: "S-0001" },
      totals: { visits: 2, scans: 19, look: 3, span: "418" },
      matched: 2,
      visits: [
        { session: 34, studies: [1], label: "ses-20190913", first: "2019-09-13", day: "0", number: 1, scans: 13, look: 3, regions: ["brain", "spine"], kinds: [{ kind: "T1w", scans: 3 }], contrast: true, symri: 4, main: [{ role: "t1w", stack: 9, name: "Sag_T1w_3D_MPRAGE" }] },
        { session: null, studies: [7, 8], label: "ses-20201104", day: "418", number: 2, scans: 6 },
      ],
    });
    expect(v.subject).toEqual({ id: 4, code: "sub-1", label: "S-0001" });
    expect(v.totals.span).toBe("418");
    expect(v.visits.map((x) => x.key)).toEqual(["s34", "t7.8"]);
    expect(v.visits[0].main).toEqual([{ role: "t1w", stack: 9, name: "Sag_T1w_3D_MPRAGE" }]);
    expect(v.visits[1]).toMatchObject({ contrast: false, kinds: [], main: [], regions: [] });
  });
});

describe("the words", () => {
  const subject = (over: Partial<Subject> = {}): Subject => ({ id: 1, code: "sub-1", label: "sub-1", visits: 1, scans: 5, look: 0, regions: ["brain", "spine"], makers: ["Siemens"], main: ["t1w"], ...over });

  it("says a subject's facts, and a main scan the dataset picks that it lacks", () => {
    expect(subjectFacts(subject(), ["t1w", "flair", "t2w"])).toBe("brain, spine · Siemens · no FLAIR main");
    expect(subjectFacts(subject(), [])).toBe("brain, spine · Siemens");
    expect(subjectFacts(subject({ regions: [], makers: [], main: ["t1w", "flair"] }), ["t1w", "flair"])).toBe("");
  });

  it("says what the filters keep, and turns one on and off in its place", () => {
    expect(filterPhrase(["visits2"])).toBe("with more than one visit");
    expect(filterPhrase(["look", "main:flair", "region:spine", "maker:GE"])).toBe("with scans to look at, with a main FLAIR, with spine scans, scanned on a GE");
    expect(toggled(["look"], "visits2")).toEqual(["look", "visits2"]);
    expect(toggled(["look", "visits2"], "look")).toEqual(["visits2"]);
  });

  it("says a visit's kinds and its main scans, 3D where they are", () => {
    expect(kindsLine({ kinds: [{ kind: "T1w", scans: 3 }, { kind: "FLAIR", scans: 2 }], contrast: true })).toBe("T1w 3 · FLAIR 2 · with contrast");
    // read as a person reads them, the scouts left out, whatever order the engine decided them in
    expect(kindsLine({ kinds: [{ kind: "SyMRI", scans: 3 }, { kind: "DWI", scans: 1 }, { kind: "Scout", scans: 1 }, { kind: "FLAIR", scans: 1 }, { kind: "T1w", scans: 3 }, { kind: "T2*w", scans: 1 }], contrast: false })).toBe(
      "T1w 3 · FLAIR 1 · T2*w 1 · DWI 1 · SyMRI 3",
    );
    expect(mainLine([{ role: "flair", stack: 2, name: "Sag_T2w_3D_FLAIR" }, { role: "t1w", stack: 1, name: "Sag_T1w_3D_MPRAGE" }, { role: "t2w", stack: 3, name: "Ax_T2w_2D_TSE" }])).toBe("T1w 3D, FLAIR 3D, T2w");
    expect(mainLine([])).toBe("none picked");
  });

  it("says how long the visits span, and nothing for a shape, which at plain only looks like a number", () => {
    expect(spanWords("418", "quasi")).toBe("over 14 months");
    expect(spanWords("30", "sensitive")).toBe("over 30 days");
    expect(spanWords("1100", "quasi")).toBe("over 3 years");
    expect(spanWords("0", "quasi")).toBe("");
    // 418 at plain comes as its shape
    expect(spanWords("999", "plain")).toBe("");
    expect(spanWords("9a9", "quasi")).toBe("");
    expect(spanWords(null, "quasi")).toBe("");
  });

  it("says a scan's timing short", () => {
    expect(short(2.26)).toBe("2.3");
    expect(short(2300)).toBe("2300");
    expect(short(8)).toBe("8");
    expect(paramsWords({ te: 2.26, tr: 2300, ti: 900, fa: 8 })).toBe("TE 2.3 TR 2300 TI 900 FA 8");
    expect(paramsWords({ te: null, tr: undefined, ti: 0, fa: null })).toBe("");
  });

  it("offers the codes and the ID types the subjects hold, never the scanner's study UID", () => {
    expect(
      showOptions([
        { name: "study-id", subjects: 70 },
        { name: "subject-code", subjects: 3 },
        { name: "study-instance-uid", subjects: 70 },
        { name: "lab-number", subjects: 2 },
        { name: "patient-id", subjects: 0 },
      ]),
    ).toEqual([
      { value: "code", label: "Subject code" },
      { value: "study-id", label: "Study ID" },
      { value: "subject-code", label: "Alias" },
      { value: "lab-number", label: "Lab number" },
    ]);
  });
});

describe("colour", () => {
  it("colours by family, contrast or plane, and not a value not known", () => {
    const symri = scan(1, { family: "symri" });
    const ce = scan(2, { axes: { post_contrast: "1" }, orientation: "SAGITTAL" });
    const plain = scan(3, { axes: { post_contrast: "not_given" }, orientation: null });
    expect(colourOf(symri, "family")).toEqual({ word: "SyMRI", slot: 7 });
    expect(colourOf(plain, "family")).toBeNull();
    expect(colourOf(ce, "contrast")).toEqual({ word: "contrast", slot: 2 });
    expect(colourOf(plain, "contrast")).toEqual({ word: "no contrast", slot: 1 });
    expect(colourOf(symri, "contrast")).toBeNull();
    expect(colourOf(ce, "plane")).toEqual({ word: "sagittal", slot: 7 });
    expect(colourOf(plain, "plane")).toBeNull();
    expect(colourOf(ce, "nothing")).toBeNull();
    expect(legendOf([ce, plain, symri, ce], "contrast")).toEqual([
      { word: "no contrast", slot: 1 },
      { word: "contrast", slot: 2 },
    ]);
  });
});

describe("a visit's folders", () => {
  it("puts the scans in datatype folders in BIDS's order, the families together after the plain ones, scouts and the rest last", () => {
    const scans = [
      scan(1, { datatype: "other", folder: "localizer", axes: { disposition: "scout" } }),
      scan(2, { datatype: "dwi" }),
      scan(3, { axes: { provenance: "SyMRI" }, series: 9 }),
      scan(4, { series: 2, main: ["t1w"] }),
      scan(5, { axes: { body_part: "spine" }, series: 3, questions: ["base:conflict"] }),
      scan(6, { series: 1 }),
    ];
    const f = foldersOf(scans, compareScans);
    expect(f.map((x) => x.label)).toEqual(["anat", "dwi", "scouts and other"]);
    expect(f[0].groups.map((g) => [g.family, g.scans.map((s) => s.id)])).toEqual([
      ["plain", [6, 4]],
      ["symri", [3]],
      ["body", [5]],
    ]);
    expect(f[0]).toMatchObject({ scans: 4, main: 1, look: 1 });
  });

  it("fills pictures that came into the page shown, and nothing else", () => {
    const was = { total: 2, next: null, scans: [scan(1), scan(2, { picture: "data:a" })], pictures: { shown: true, why: null, missing: 1, partial: 0 } };
    const fresh = { total: 2, next: null, scans: [scan(1, { picture: "data:b" }), scan(2, { picture: "data:c" })], pictures: { shown: true, why: null, missing: 0, partial: 0 } };
    const at = fillPictures(was, fresh);
    expect(at.scans.map((s) => s.picture)).toEqual(["data:b", "data:a"]);
    expect(at.pictures?.missing).toBe(0);
    expect(fillPictures(at, fresh)).toBe(at);
  });
});

describe("the arrows", () => {
  // three in a row, then two
  const spots = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 200, y: 0 },
    { x: 0, y: 120 },
    { x: 100, y: 121 },
  ];
  it("move left and right in order, and up and down to the nearest card of the row", () => {
    expect(step(spots, 0, "ArrowRight")).toBe(1);
    expect(step(spots, 2, "ArrowRight")).toBe(3);
    expect(step(spots, 0, "ArrowLeft")).toBe(0);
    expect(step(spots, 1, "ArrowDown")).toBe(4);
    expect(step(spots, 2, "ArrowDown")).toBe(4);
    expect(step(spots, 4, "ArrowUp")).toBe(1);
    expect(step(spots, 3, "ArrowDown")).toBe(3);
    expect(step([], 0, "ArrowDown")).toBe(-1);
    expect(step(spots, -1, "ArrowDown")).toBe(0);
  });
});
