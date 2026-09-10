// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";
import type { JobRow } from "../ask/client";
import type { Batch } from "../ops/client";
import { byReason, jobsOfBatch, stages } from "./stages";

const batch: Batch = { id: 7, name: "walk of the spring source", state: "done", started_at: "2026-09-01T08:00:00Z", finished_at: "2026-09-01T09:00:00Z", epoch_after: 4, seen: 1200, parsed: 1180, quarantined: 20, ingested: 1160, report: { classified: 310 } };
function job(id: number, kind: string, state: JobRow["state"], argv: string[], name: string | null = null): JobRow {
  return { id, kind, name, state, started_at: "2026-09-01T08:30:00Z", heartbeat_at: null, finished_at: null, progress: null, error: null, args: { argv }, result: null };
}

describe("the stage strip", () => {
  const jobs = [job(1, "digest", "done", ["digest", "--batch", "7"]), job(2, "classify", "running", ["classify", "--batch", "7", "--pack", "mri"]), job(3, "classify", "done", ["classify", "--batch", "8"])];
  it("finds the jobs of a batch by name or by its id in the arguments", () => {
    expect(jobsOfBatch(batch, jobs).map((j) => j.id)).toEqual([1, 2]);
  });
  it("shows every stage with its count, its state and its job", () => {
    const s = stages(batch, jobs, [{ id: 1, kind: "base:vote", scope: "batch", status: "open", created_at: "2026-09-01T09:00:00Z" }]);
    expect(s.map((x) => [x.name, x.count, x.state, x.jobs.map((j) => j.id)])).toEqual([
      ["walked", 1200, "done", [1]],
      ["digested", 1160, "done", [1]],
      ["classified", 310, "running", [2]],
      ["reviewed", 1, "pending", []],
    ]);
    expect(s[1].words).toBe("1160 ingested, 20 quarantined");
  });
  it("counts the quarantine by reason, largest first", () => {
    expect(byReason([{ class: "no_pixel_data" }, { class: "not_dicom" }, { class: "no_pixel_data" }])).toEqual([{ reason: "no_pixel_data", count: 2 }, { reason: "not_dicom", count: 1 }]);
  });
});
