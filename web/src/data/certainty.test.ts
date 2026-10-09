// SPDX-License-Identifier: AGPL-3.0-only
// What the sort is sure of in a dataset (record 55 H2): the card's line, and
// Review as the one next step once something needs a look after sorting.

import { describe, expect, it } from "vitest";
import type { Dataset } from "./datasets";
import { certainty, certaintyWords, kindWords, nextStep } from "./steps";

const ds = (totals: Partial<Dataset["totals"]>, classified: number | null = 10, extra: Partial<Dataset> = {}) =>
  ({
    id: 1,
    name: "ms-a",
    state: "anonymised",
    arrives: "deidentified",
    patient_id: "subject-code",
    subjects: "generated",
    trees: { originals: null, anon: { path: "/x", files: 10, last_written: null } },
    digests: { count: 1, first: null, last: null, recent: classified === null ? [] : [{ id: 1, name: "r", state: "done", classified, to_sort: 0, files: { seen: 10 } }] },
    totals: { subjects: 1, studies: 1, sessions: 1, stacks: 0, refused_files: 0, to_sort: 0, ...totals },
    ...extra,
  }) as unknown as Dataset;

describe("a dataset's certainty", () => {
  it("is the engine's sure count, else the stacks less those to sort", () => {
    expect(certainty(ds({ stacks: 120, to_sort: 8, sure: 112 }))).toEqual({ scans: 120, sure: 112, look: 8, kinds: {} });
    expect(certainty(ds({ stacks: 120, to_sort: 8 }))).toMatchObject({ sure: 112, look: 8 });
    expect(certainty(ds({ stacks: 120, to_sort: 0 }))).toMatchObject({ sure: 120, look: 0 });
  });

  it("is nothing before a sort: no scans, or no read classified any", () => {
    expect(certainty(ds({ stacks: 0 }))).toBeNull();
    expect(certainty(ds({ stacks: 30, to_sort: 30 }, 0))).toBeNull();
  });

  it("says itself in one line, and its kinds behind a hover", () => {
    expect(certaintyWords({ scans: 120, sure: 112, look: 8, kinds: {} })).toBe("120 scans · 112 sure · 8 need a look");
    expect(certaintyWords({ scans: 1, sure: 1, look: 0, kinds: {} })).toBe("1 scan · 1 sure");
    expect(kindWords({ "orientation:missing": 3, "body_part:low_confidence": 5, axis_conflict: 0 })).toBe("body part, low confidence: 5; orientation, missing: 3");
  });

  it("makes Review the next step after sorting where something needs a look, else reading new files", () => {
    expect(nextStep(ds({ stacks: 120, to_sort: 8, sure: 112 }))).toMatchObject({ step: "review", label: "Review 8", busy: false });
    expect(nextStep(ds({ stacks: 120, sure: 120 }))).toMatchObject({ step: "read-new" });
    // not sorted yet: Sort comes first
    expect(nextStep(ds({ stacks: 30, to_sort: 30 }, 0))).toMatchObject({ step: "sort" });
    // a read running: Running, never Review
    const running = ds({ stacks: 120, to_sort: 8 }, 10);
    running.digests.recent[0].state = "running";
    expect(nextStep(running)).toMatchObject({ label: "Running", busy: true });
  });
});
