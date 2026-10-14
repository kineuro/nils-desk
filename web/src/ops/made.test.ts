// SPDX-License-Identifier: AGPL-3.0-only
// What a run made, unit by unit (2026-10-12; Nima: "done-fail should be per
// unit of job not the whole thing"): a run reads as its units summed, never a
// bare done, in the engine's words where it gives `made` and from its
// summary's counts where an engine from before does not. The shapes are the
// engine's own answers (the engine of 2026-10-12).

import { describe, expect, it } from "vitest";
import { causeWords, madeOf, madeWords, runTag, unitsByWhy } from "./made";

/** A run every unit of which was skipped for want of a FLAIR, as the engine answers `made`. */
const NOTHING = {
  units: 4,
  made: 0,
  failed: 0,
  skipped: 4,
  left: 0,
  nothing: true,
  line: "nothing made · 4 of 4 skipped: no FLAIR picked",
  why: [{ status: "skipped", why: "no FLAIR picked", units: 4 }],
};

describe("what a run made", () => {
  it("reads the engine's made, and a run that made nothing says so though it is done", () => {
    const m = madeOf({ made: NOTHING });
    expect(m).toMatchObject({ units: 4, made: 0, skipped: 4, nothing: true });
    expect(madeWords(m!)).toEqual({ head: "nothing made", rest: "4 of 4 skipped: no FLAIR picked", tone: "caution" });
    expect(runTag({ status: "done", made: NOTHING })).toEqual({ className: "tag caution", words: "nothing made", rest: "4 of 4 skipped: no FLAIR picked" });
  });
  it("keeps a partly made run's counts, and an all-made run reads ok", () => {
    const partly = { ...NOTHING, made: 3, skipped: 1, nothing: false, why: [{ status: "skipped", why: "no FLAIR picked", units: 1 }] };
    expect(runTag({ status: "done", made: partly })).toEqual({ className: "tag caution", words: "3 of 4 made", rest: "1 skipped: no FLAIR picked" });
    const all = { ...NOTHING, made: 4, skipped: 0, nothing: false, why: [] };
    expect(runTag({ status: "done", made: all })).toEqual({ className: "tag ok", words: "4 of 4 made", rest: null });
  });
  it("says why units failed and were skipped, the counts beside several reasons, and the units left of a run that stopped", () => {
    const m = madeOf({
      made: {
        units: 9,
        made: 0,
        failed: 3,
        skipped: 6,
        left: 0,
        nothing: true,
        line: null,
        why: [
          { status: "failed", why: "out of memory", units: 2 },
          { status: "failed", why: "the pipeline's own error", units: 1 },
          { status: "skipped", why: "no FLAIR picked", units: 4 },
          { status: "skipped", why: "no T1w picked", units: 2 },
        ],
      },
    })!;
    expect(madeWords(m).rest).toBe("3 of 9 failed: out of memory (2), the pipeline's own error (1) · 6 skipped: no FLAIR picked (4), no T1w picked (2)");
    const stopped = madeOf({ made: { units: 6, made: 2, failed: 0, skipped: 0, left: 4, nothing: false, why: [] } })!;
    expect(madeWords(stopped)).toEqual({ head: "2 of 6 made", rest: "4 left", tone: "caution" });
  });
  it("reads an engine before made from its summary's counts, and holds a count withheld below detail quasi", () => {
    const old = madeOf({ summary: { units: { total: 4, succeeded: 0, failed: 0, skipped: 4, unreported: 0 } } })!;
    expect(old).toMatchObject({ units: 4, made: 0, nothing: true, why: [] });
    expect(madeWords(old)).toEqual({ head: "nothing made", rest: "4 of 4 skipped", tone: "caution" });
    const held = madeOf({ summary: { units: { total: 20, succeeded: null, failed: null, skipped: 0 } } })!;
    expect(madeWords(held)).toEqual({ head: "20 units", rest: "fewer than five failed", tone: "caution" });
    expect(madeOf({ summary: { phase: "run" } })).toBeNull();
    expect(madeOf(null)).toBeNull();
  });
  it("tags a run by its status where its units say nothing more", () => {
    expect(runTag({ status: "running" })).toEqual({ className: "tag brand", words: "running", rest: null });
    expect(runTag({ status: "failed", made: NOTHING })).toEqual({ className: "tag caution", words: "failed", rest: null });
    expect(runTag({ status: "cancelled" })).toEqual({ className: "tag", words: "cancelled", rest: null });
    expect(runTag({ status: "done" })).toEqual({ className: "tag ok", words: "done", rest: null });
    expect(runTag({ status: "partial" })).toEqual({ className: "tag caution", words: "partial", rest: null });
  });
  it("folds a run's units by why, one line a reason with the units under it", () => {
    const units = [
      { unit: "sub-a_ses-1", status: "skipped", lacks: ["no FLAIR picked"] },
      { unit: "sub-b_ses-1", status: "skipped", lacks: ["no FLAIR picked", "no T1w picked"] },
      { unit: "sub-c_ses-1", status: "failed", failure: { kind: "resource", cause: "memory" } },
      { unit: "sub-d_ses-1", status: "succeeded" },
    ];
    expect(unitsByWhy(units)).toEqual([
      { status: "skipped", why: "no FLAIR picked", units: ["sub-a_ses-1", "sub-b_ses-1"] },
      { status: "skipped", why: "no T1w picked", units: ["sub-b_ses-1"] },
      { status: "failed", why: "out of memory", units: ["sub-c_ses-1"] },
    ]);
    expect(causeWords("gpu_memory")).toBe("out of GPU memory");
    expect(causeWords("something_new")).toBe("something new");
  });
});
