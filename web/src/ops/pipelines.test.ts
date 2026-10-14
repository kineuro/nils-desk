// SPDX-License-Identifier: AGPL-3.0-only
// The Pipelines page's cards: a running job with its progress, a queued
// chain waiting for the job before it, a failed job with what stopped it
// and the next move, the grant that cancels each by its verb, and the
// filter by state. The names are made up.

import { describe, expect, it } from "vitest";
import type { JobRow } from "../ask/client";
import { parseJobsEvent } from "../data/now";
import { cancelGrant, cardOf, countByFilter, filterJobs, needsALook, nextMove, progressOf, targetOf, thenWords, titleOf, againOfJob, type ChainedJob } from "./pipelines";
import { overOfCommand, requeued } from "./catalog";

const at = "2026-09-15T21:02:00Z";
const now = Date.parse("2026-09-15T21:04:00Z");
const job = (id: number, argv: string[], state: JobRow["state"], over: Partial<ChainedJob> = {}): ChainedJob => ({
  id,
  kind: argv[0],
  name: null,
  state,
  started_at: at,
  heartbeat_at: null,
  finished_at: state === "done" || state === "failed" || state === "cancelled" ? "2026-09-15T21:03:00Z" : null,
  progress: null,
  error: null,
  args: { argv, principal: "astrid" },
  result: null,
  ...over,
});

describe("a job's card", () => {
  it("says what a running job is doing, to what, for whom, and how far it is", () => {
    const c = cardOf(job(120, ["pseudonymize", "@lake"], "running", { progress: { done: 1766, of: 2208, elapsed_s: 1.3, held: 4 } }), now);
    expect(c.title).toBe("Pseudonymising lake");
    expect(c.tone).toBe("running");
    expect(c.icon).toBe("shield");
    expect(c.meta).toMatch(/^job 120 · astrid · since /);
    expect(c.progress?.fraction).toBeCloseTo(0.8, 2);
    expect(c.progress?.words).toBe("1,766 of 2,208 files · 1,358 a second · under 2 min left · 4 held until mapped");
    expect(c.cancel).toBe("data:work");
  });
  it("reads a digest's own counters when the whole is not known", () => {
    const p = progressOf(job(121, ["digest", "@archive/dcm-anon"], "running", { progress: { seen: 11420, parsed: 11000, quarantined: 3, unchanged: 0, ingested: 9000, elapsed_s: 27.9 } }), now);
    expect(p?.fraction).toBeNull();
    expect(p?.words).toBe("11,420 files so far · 409 a second · 3 refused");
    expect(progressOf(job(1, ["digest", "@a"], "done"), now)).toBeNull();
  });
  it("draws a queued job in a chain as waiting for the job before it, with what follows", () => {
    const c = cardOf(job(122, ["digest", "@lake/dcm-anon"], "queued", { chain: { before: 120, after: 123 }, then: [["fingerprint"], ["classify", "--pack", "mri"]] }), now);
    expect(c.title).toBe("Then reading lake");
    expect(c.tone).toBe("queued");
    expect(c.icon).toBe("clock");
    expect(c.waits).toBe(120);
    expect(c.then).toEqual(["then preparation", "then sort with mri"]);
    expect(c.meta).toBe("job 122 · astrid");
    expect(thenWords(["session", "--scheme", "x"])).toBe("then session build");
  });
  it("says what stopped a failed job and offers the same command again", () => {
    const c = cardOf(job(117, ["digest", "@ct-lab", "--restart"], "failed", { error: "No pack reads CT. Add a pack that does, then read again." }), now);
    expect(c.title).toBe("Read of ct-lab stopped");
    expect(c.tone).toBe("failed");
    expect(c.icon).toBe("alert");
    expect(c.error).toBe("No pack reads CT. Add a pack that does, then read again.");
    expect(c.next).toEqual({ label: "Read again", command: ["digest", "@ct-lab"] });
    // an engine before the failure slice names no failure: the card says the error
    expect(c.failure).toMatchObject({ kind: null, line: "No pack reads CT." });
    // since it, a failed job's failure: its kind and what to do (2026-10-12)
    const run = cardOf(job(118, ["run", "n4-bias-correction@1", "--select", "selection:3d-t1-siemens@1"], "failed", { error: "the release of the input failed: dcm2niix is not runnable", failure: { kind: "dependency", cause: "dcm2niix", advice: "Install dcm2niix where the engine runs.", fix: null } } as Partial<ChainedJob>), now);
    expect(run.failure).toMatchObject({ kind: "dependency", cause: "dcm2niix", line: "Install dcm2niix where the engine runs." });
    expect(cardOf(job(119, ["digest", "@a"], "done"), now).failure).toBeNull();
    expect(nextMove(job(1, ["classify", "--pack", "mri"], "cancelled"))?.label).toBe("Sort again");
    expect(nextMove(job(1, ["digest", "@a"], "done"))).toBeNull();
    expect(titleOf(job(2, ["release", "--name", "spring-v1"], "done"))).toBe("Release of spring-v1 done");
    expect(titleOf(job(3, ["backup"], "cancelled"))).toBe("Backup cancelled");
  });
  it("finds what the verb acts on", () => {
    expect(targetOf(job(1, ["digest", "@lake/dcm-anon"], "done"))).toBe("lake");
    expect(targetOf(job(1, ["classify", "--pack", "mri"], "done"))).toBe("mri");
    // a backup is not of its name: the name is the schedule's
    expect(targetOf(job(1, ["backup"], "done", { name: "nightly" }))).toBeNull();
    expect(targetOf(job(1, ["linkage", "import", "/x/map.csv", "--place", "north"], "done", { name: "north" }))).toBe("north");
    expect(targetOf(job(1, ["backup"], "done"))).toBeNull();
  });
});

describe("who may cancel", () => {
  it("goes by the verb: a digest is Data work, a sort Pipelines work, a release Release work, a backup Database work", () => {
    expect(cancelGrant(job(1, ["digest", "@a"], "running"))).toBe("data:work");
    expect(cancelGrant(job(1, ["bring-in", "@a"], "running"))).toBe("data:work");
    expect(cancelGrant(job(1, ["linkage", "import"], "running"))).toBe("data:work");
    expect(cancelGrant(job(1, ["classify"], "running"))).toBe("pipelines:work");
    expect(cancelGrant(job(1, ["fingerprint"], "running"))).toBe("pipelines:work");
    expect(cancelGrant(job(1, ["release"], "running"))).toBe("release:work");
    expect(cancelGrant(job(1, ["handover"], "running"))).toBe("release:work");
    expect(cancelGrant(job(1, ["backup"], "running"))).toBe("database:work");
    expect(cancelGrant(job(1, ["ask", "run"], "running"))).toBe("query:work");
    expect(cancelGrant(job(1, ["something-new"], "running"))).toBe("pipelines:work");
  });
});

describe("the filter by state", () => {
  const jobs = [job(1, ["digest", "@a"], "running"), job(2, ["digest", "@b"], "queued"), job(3, ["classify"], "done"), job(4, ["backup"], "failed"), job(5, ["backup"], "cancelled"), job(6, ["digest", "@c"], "cancelling")];
  it("keeps the jobs in one state, cancelling with running and cancelled with failed", () => {
    expect(filterJobs(jobs, "all").length).toBe(6);
    expect(filterJobs(jobs, "running").map((j) => j.id)).toEqual([1, 6]);
    expect(filterJobs(jobs, "queued").map((j) => j.id)).toEqual([2]);
    expect(filterJobs(jobs, "done").map((j) => j.id)).toEqual([3]);
    expect(filterJobs(jobs, "failed").map((j) => j.id)).toEqual([4, 5]);
    expect(countByFilter(jobs)).toEqual({ all: 6, running: 2, queued: 1, done: 1, failed: 2 });
  });
});

describe("the event stream", () => {
  it("carries the epoch and the open jobs, or nothing the page can read", () => {
    expect(parseJobsEvent('{"epoch": 4, "jobs": []}')).toEqual({ epoch: 4, jobs: [] });
    expect(parseJobsEvent('{"jobs": [{"id": 1}]}')?.jobs.length).toBe(1);
    expect(parseJobsEvent("{}")).toBeNull();
    expect(parseJobsEvent("not json")).toBeNull();
  });
});

describe("a pipeline run's job (2026-10-12)", () => {
  const DCM2NIIX = { kind: "dependency", cause: "dcm2niix", advice: "Install dcm2niix where the engine runs; then run it again.", fix: null };
  const queued = ["run", "samseg-lesions@1", "--select", "selection:t1-3d-stacks@1", "--pack-dir", "/srv/packs"];
  /** The job that stopped for want of dcm2niix, as the engine answers it once a later job took its run up again. */
  const stopped = (over: Partial<ChainedJob> = {}): ChainedJob =>
    job(18, ["/usr/bin/nils", "--registry", "/srv/reg", ...queued], "failed", {
      kind: "pipeline",
      name: "samseg-lesions@1",
      error: "run 1 the release of the input failed: dcm2niix is not runnable",
      args: { argv: ["/usr/bin/nils", "--registry", "/srv/reg", ...queued], queued, principal: "astrid", pipeline: "samseg-lesions@1", run: 1, handle: 2 },
      result: { run: 1, status: "failed", summary: {}, results_digest: null, failure: DCM2NIIX },
      failure: DCM2NIIX,
      ...over,
    } as Partial<ChainedJob>);
  const MADE_NOTHING = { units: 4, made: 0, failed: 0, skipped: 4, left: 0, nothing: true, line: "nothing made · 4 of 4 skipped: no FLAIR picked", why: [{ status: "skipped", why: "no FLAIR picked", units: 4 }] };
  /** The job that took run 1 up again, done with every session skipped. */
  const again = job(44, ["run", "--resume", "1"], "done", {
    kind: "pipeline",
    name: "samseg-lesions@1",
    args: { argv: ["run", "--resume", "1"], queued: ["run", "--resume", "1", "--pack-dir", "/srv/packs"], principal: "astrid", pipeline: "samseg-lesions@1", resume: 1, run: 1, handle: 2 },
    result: { run: 1, status: "done", summary: { units: { total: 4, succeeded: 0, failed: 0, skipped: 4 } }, results_digest: "ab" },
    made: MADE_NOTHING,
  } as Partial<ChainedJob>);

  it("a stopped job whose run was taken up again says which job did, offers no Run again, and leaves Now", () => {
    const c = cardOf({ ...stopped(), taken_up: { job: 44, state: "done", run: 1 } }, now);
    expect(c.title).toBe("Pipeline run of samseg-lesions@1 stopped");
    expect(c.meta).toMatch(/· ran again as job 44, done$/u);
    expect(c.taken).toEqual({ job: 44, state: "done" });
    expect(c.next).toBeNull();
    expect(c.again).toBeNull();
    expect(c.failure).toBeNull();
    expect(c.error).toBeNull();
    expect(needsALook({ ...stopped(), taken_up: { job: 44, state: "done", run: 1 } }, now)).toBe(false);
    // not taken up yet: it needs a look, and Run again takes its run up again
    const open = cardOf(stopped(), now);
    expect(open.failure?.kind).toBe("dependency");
    expect(open.next?.label).toBe("Run again");
    expect(open.again).toEqual({ kind: "resume", run: 1, pipeline: "samseg-lesions@1", label: "samseg-lesions@1" });
    expect(needsALook(stopped(), now)).toBe(true);
  });
  it("a run's job that ended reads as its units summed, never a bare done, and one that made nothing needs a look", () => {
    const c = cardOf(again, now);
    expect(c.title).toBe("Pipeline run of samseg-lesions@1: nothing made");
    expect(c.made).toEqual({ head: "nothing made", rest: "4 of 4 skipped: no FLAIR picked", tone: "caution" });
    expect(needsALook(again, now)).toBe(true);
    const partly = { ...again, made: { ...MADE_NOTHING, made: 3, skipped: 1, nothing: false, why: [{ status: "skipped", why: "no FLAIR picked", units: 1 }] } };
    expect(cardOf(partly, now).title).toBe("Pipeline run of samseg-lesions@1: 3 of 4 made");
    expect(cardOf(partly, now).made?.rest).toBe("1 skipped: no FLAIR picked");
    expect(needsALook(partly, now)).toBe(false);
    // an engine before `made`: its result's counts
    const before = { ...again, made: undefined };
    expect(cardOf(before, now).title).toBe("Pipeline run of samseg-lesions@1: nothing made");
    expect(cardOf(before, now).made?.rest).toBe("4 of 4 skipped");
    // any other job is as it was
    expect(cardOf(job(9, ["digest", "@a"], "done"), now).made).toBeNull();
    expect(cardOf(job(9, ["digest", "@a"], "done"), now).title).toBe("Read of a done");
  });
  it("Run again of a run that cannot be taken up runs its command again as a new run, without the flags the engine added", () => {
    const after = stopped({ result: { run: 1, status: "failed", summary: {}, results_digest: "ab" } });
    expect(againOfJob(after)).toEqual({ kind: "new", pipeline: "samseg-lesions@1", over: { selection: "t1-3d-stacks", version: 1 }, params: {}, command: ["run", "samseg-lesions@1", "--select", "selection:t1-3d-stacks@1"] });
    expect(overOfCommand(["run", "n4@1", "--select", "main:t1w@dataset:study-anon", "--param", "shrink=2", "--pack-dir", "/p"])).toEqual({ pipeline: "n4@1", over: { main: { kind: "dataset", name: "study-anon", role: "t1w" } }, params: { shrink: "2" } });
    expect(overOfCommand(["run", "n4@1", "--handle", "7"])).toEqual({ pipeline: "n4@1", over: { handle: 7 }, params: {} });
    expect(overOfCommand(["run", "--resume", "3"])).toBeNull();
    expect(overOfCommand(["digest", "@a"])).toBeNull();
    expect(requeued(["run", "n4@1", "--select", "selection:a@1", "--pack-dir", "/srv/packs", "--dcm2niix", "/x"])).toEqual(["run", "n4@1", "--select", "selection:a@1"]);
    // a job of no run, or one that never stopped, has no Run again of its own
    expect(againOfJob(job(9, ["digest", "@a"], "failed"))).toBeNull();
    expect(againOfJob(again)).toBeNull();
  });
});
