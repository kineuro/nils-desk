// SPDX-License-Identifier: AGPL-3.0-only
// The dataset as a tree: subject, session, datatype, scan as BIDS folders
// read; a session's scans in the order they were acquired, each family
// together after the plain ones, acquisitions before what the scanner made of
// them; a filter that keeps the matching scans and their branches; the rows on
// screen as the folds say; and the facts strip's values in words.

import { describe, expect, it } from "vitest";
import type { Scan } from "./scans";
import { buildTree, factsOf, familyOf, filterTree, filterWords, matches, pathOf, rowsOf, sessionLabel, treeOrder } from "./tree";

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

describe("a dataset as a tree", () => {
  const scans = [
    scan(1, { datatype: "other", folder: "localizer", axes: { disposition: "scout" }, series: 1 }),
    scan(5, { datatype: "dwi", folder: "dwi", series: 5 }),
    scan(4, { axes: { disposition: "scanner_derived" }, series: 2 }),
    scan(3, { series: 4, questions: ["base:conflict"] }),
    scan(2, { series: 3 }),
    scan(6, { axes: { provenance: "SyMRI" }, datatype: "anat", folder: "anat/SyMRI", series: 6 }),
    scan(7, { axes: { provenance: "ProjectionDerived" }, series: 1 }),
    scan(8, { axes: { body_part: "spine" }, series: 1 }),
    scan(9, { subjectId: 2, subject: "b2", session: 9, label: "20250101", day: "2025-01-01" }),
    scan(10, { session: 8, label: "20251201", day: "2025-12-01" }),
  ];
  const tree = buildTree(scans);

  it("reads as BIDS folders: subjects as they came, sessions by day, datatypes in BIDS's order", () => {
    expect(tree.map((u) => u.label)).toEqual(["sub-a1", "sub-b2"]);
    expect(tree[0].sessions.map((s) => s.label)).toEqual(["ses-20251201", "ses-20260102"]);
    expect(tree[0].sessions[1].types.map((t) => t.folder)).toEqual(["anat", "anat/SyMRI", "dwi", "other"]);
    expect(tree[0].count).toBe(9);
    expect(tree[0].look).toBe(1);
    expect(tree[0].sessions[1].types[0].look).toBe(1);
  });

  it("orders a session's scans as acquired, families together after the plain ones, the scanner's own images after their acquisitions", () => {
    const anat = tree[0].sessions[1].types[0].scans.map((s) => s.id);
    // plain acquisitions by series (2, 3), then what the scanner made (4), then derived (7), then the spine (8)
    expect(anat).toEqual([2, 3, 4, 7, 8]);
    expect(treeOrder(tree).map((s) => s.id)).toEqual([10, 2, 3, 4, 7, 8, 6, 5, 1, 9]);
  });

  it("names a family by what made it, else where in the body it is", () => {
    expect(familyOf(scan(1, { axes: { provenance: "SWIRecon" } }))).toBe("swi");
    expect(familyOf(scan(1, { axes: { provenance: "EPIMix" } }))).toBe("mix");
    expect(familyOf(scan(1, { axes: { disposition: "reformat" } }))).toBe("derived");
    expect(familyOf(scan(1, { axes: { body_part: "neck" } }))).toBe("body");
    expect(familyOf(scan(1, { axes: { body_part: "brain" } }))).toBe("plain");
  });

  it("shows a branch's children only while it is open, every branch open while filtering, a family's quiet divider before it", () => {
    expect(rowsOf(tree, new Set()).map((r) => r.key)).toEqual(["u1", "u2"]);
    const open = new Set(pathOf(tree, 7));
    const rows = rowsOf(tree, open);
    expect(rows.filter((r) => r.kind === "scan").map((r) => (r.kind === "scan" ? r.scan.id : 0))).toEqual([2, 3, 4, 7, 8]);
    expect(rows.filter((r) => r.kind === "family").map((r) => r.label)).toEqual(["Derived", "Spine and neck"]);
    expect(rowsOf(tree, new Set(), true).filter((r) => r.kind === "scan")).toHaveLength(10);
  });

  it("filters by every word, in names, place and what NILS says", () => {
    const named = scan(11, { name: "Ax_T2w_2D_FLAIR_TSE", bids: "acq-Ax+2D+FLAIR+TSE_T2w", description: "flair ax", axes: { base: "T2w" } });
    expect(matches(named, filterWords("flair t2w"))).toBe(true);
    expect(matches(named, filterWords("sub-a1 ses-20260102"))).toBe(true);
    expect(matches(named, filterWords("dwi"))).toBe(false);
    const looks = filterTree(tree, (s) => s.questions.length > 0);
    expect(treeOrder(looks).map((s) => s.id)).toEqual([3]);
    expect(looks[0].count).toBe(1);
    expect(looks[0].sessions).toHaveLength(1);
  });

  it("says a session without a label by its day, and one without either as none", () => {
    expect(sessionLabel({ label: null, day: "2026-01-02" })).toBe("ses-20260102");
    expect(sessionLabel({ label: null, day: null })).toBe("ses-none");
  });

  it("says what NILS says a scan is in short values, no engine words", () => {
    const f = factsOf(scan(1, { axes: { base: "T1w", technique: "MPRAGE", construct: "ND", post_contrast: "1", disposition: "acquisition", provenance: "RawRecon" }, orientation: "SAGITTAL", images: 176 }));
    expect(f.map((x) => x.value)).toEqual(["T1w", "MPRAGE", "contrast", "sagittal", "176 images"]);
    expect(f.map((x) => x.what)).toEqual(["Weighting", "Sequence", "Contrast agent", "Plane", "Images"]);
  });
});
