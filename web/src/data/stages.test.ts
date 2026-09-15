// SPDX-License-Identifier: AGPL-3.0-only
// The stage strip: five stages from an engine that reports them on the
// batch row, with the job under each and the reviewed stage waiting; four
// from an older engine, read from the batch's counts, its report and the
// jobs; the refused files counted by reason.

import { describe, expect, it } from "vitest";
import type { JobRow } from "../ask/client";
import type { Batch } from "../ops/client";
import type { BatchDoc, BatchStages } from "./batch";
import { byReason, jobsOfBatch, reasonWords, stageJobIds, stages } from "./stages";

const batch: Batch = { id: 7, name: "walk of the spring source", state: "done", started_at: "2026-09-01T08:00:00Z", finished_at: "2026-09-01T09:00:00Z", epoch_after: 4, seen: 1200, parsed: 1180, quarantined: 20, ingested: 1160, report: { classified: 310 } };
function job(id: number, kind: string, state: JobRow["state"], argv: string[], name: string | null = null): JobRow {
  return { id, kind, name, state, started_at: "2026-09-01T08:30:00Z", heartbeat_at: null, finished_at: state === "done" ? "2026-09-01T08:34:00Z" : null, progress: null, error: null, args: { argv }, result: null };
}

const reported: BatchStages = {
  pseudonymised: { files: 2222, changed: 14, held: 0, refused: 0, job: 117 },
  walked: { files: 11324, new: 2208, changed: 14, unchanged: 9102, refused: 3, job: 118 },
  digested: { stacks: 486, sessions: 41, subjects: 38, moved: 2, job: 118 },
  classified: { stacks: 474, of: 486, unsure: 12, pack: "mri 0.1.1", jobs: [119, 120] },
  reviewed: { done: 0, of: 12, since: "2026-08-20T21:40:00Z" },
};

describe("the stage strip of an older engine", () => {
  const jobs = [job(1, "digest", "done", ["digest", "--batch", "7"]), job(2, "classify", "running", ["classify", "--batch", "7", "--pack", "mri"]), job(3, "classify", "done", ["classify", "--batch", "8"])];
  it("finds the jobs of a batch by name or by its id in the arguments", () => {
    expect(jobsOfBatch(batch, jobs).map((j) => j.id)).toEqual([1, 2]);
  });
  it("shows four stages with their count, their mark and their job", () => {
    const s = stages(batch, jobs, [{ id: 1, kind: "base:vote", scope: "batch", status: "open", created_at: "2026-09-01T09:00:00Z" }]);
    expect(s.map((x) => [x.name, x.count, x.mark, x.jobs])).toEqual([
      ["walked", 1200, "done", [1]],
      ["digested", 1160, "done", [1]],
      ["classified", 310, "now", [2]],
      ["reviewed", 0, "wait", []],
    ]);
    expect(s[1].words).toBe("1,160 ingested, 20 quarantined");
    expect(s[3].unit).toBe("of 1");
  });
});

describe("the stage strip of an engine that reports the stages", () => {
  const doc: BatchDoc = { ...batch, id: 9, name: "spring-scans-2026-08-20", stages: reported };
  const jobs = [job(117, "pseudonymize", "done", ["pseudonymize", "@spring-scans"]), job(118, "digest", "done", ["digest", "@spring-scans/dcm-anon"]), job(119, "fingerprint", "done", ["fingerprint"]), job(120, "classify", "done", ["classify", "--pack", "mri"])];
  it("shows five stages, each with its count and the job that did it", () => {
    const s = stages(doc, jobs, []);
    expect(s.map((x) => [x.name, x.count, x.unit, x.mark, x.jobs])).toEqual([
      ["pseudonymised", 2222, "files", "done", [117]],
      ["walked", 11324, "files", "done", [118]],
      ["digested", 486, "stacks", "done", [118]],
      ["classified", 474, "of 486", "done", [120, 119]],
      ["reviewed", 0, "of 12", "wait", []],
    ]);
    expect(s[0].words).toBe("14 changed · 0 held");
    expect(s[1].words).toBe("2,208 new · 14 changed · 9,102 unchanged · 3 refused");
    expect(s[2].words).toBe("41 sessions · 38 subjects · 2 sessions moved");
    expect(s[3].words).toBe("by mri 0.1.1 · 12 unsure");
    expect(s[4].since).toBe("2026-08-20T21:40:00Z");
  });
  it("marks a stage by its job while one runs, and says when a dataset has no first step", () => {
    const running = stages(doc, [job(118, "digest", "running", ["digest", "@spring-scans/dcm-anon"])], []);
    expect(running[1].mark).toBe("now");
    expect(running[0].mark).toBe("done");
    const coded = stages({ ...doc, stages: { ...reported, pseudonymised: null, reviewed: { done: 12, of: 12, since: null } } }, jobs, []);
    expect(coded[0].mark).toBe("none");
    expect(coded[0].words).toContain("not a step here");
    expect(coded[4].mark).toBe("done");
    // stacks still to sort, and no job that sorted: the stage waits
    const unsorted = stages({ ...doc, stages: { ...reported, classified: { stacks: 0, of: 486, unsure: 0, pack: null, jobs: [] } } }, jobs, []);
    expect(unsorted[3].mark).toBe("wait");
    expect(unsorted[3].words).toBe("no pack yet");
  });
  it("names every job the stages carry, so the jobs table finds them without their arguments", () => {
    expect(stageJobIds(reported)).toEqual([117, 118, 118, 119, 120]);
    expect(jobsOfBatch(doc, jobs).map((j) => j.id)).toEqual([117, 118, 119, 120]);
  });
});

describe("the refused files", () => {
  it("are counted by reason, largest first, and read in a person's words", () => {
    expect(byReason([{ class: "no_pixel_data" }, { class: "not_dicom" }, { class: "no_pixel_data" }])).toEqual([{ reason: "no_pixel_data", count: 2 }, { reason: "not_dicom", count: 1 }]);
    expect(reasonWords("not_dicom")).toBe("not DICOM");
    expect(reasonWords("something_else")).toBe("something else");
  });
});
