// SPDX-License-Identifier: AGPL-3.0-only
// The Pipelines page's cards: a running job with its progress, a queued
// chain waiting for the job before it, a failed job with what stopped it
// and the next move, the grant that cancels each by its verb, and the
// filter by state. The names are made up.

import { describe, expect, it } from "vitest";
import type { JobRow } from "../ask/client";
import { parseJobsEvent } from "./events";
import { cancelGrant, cardOf, countByFilter, filterJobs, nextMove, progressOf, targetOf, thenWords, titleOf, type ChainedJob } from "./pipelines";

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
    expect(c.title).toBe("Then digesting lake");
    expect(c.tone).toBe("queued");
    expect(c.icon).toBe("clock");
    expect(c.waits).toBe(120);
    expect(c.then).toEqual(["then fingerprint", "then classification with mri"]);
    expect(c.meta).toBe("job 122 · astrid");
    expect(thenWords(["session", "--scheme", "x"])).toBe("then session build");
  });
  it("says what stopped a failed job and offers the same command again", () => {
    const c = cardOf(job(117, ["digest", "@ct-lab", "--restart"], "failed", { error: "No pack reads CT. Add a pack that does, then read again." }), now);
    expect(c.title).toBe("Digest of ct-lab stopped");
    expect(c.tone).toBe("failed");
    expect(c.icon).toBe("alert");
    expect(c.error).toBe("No pack reads CT. Add a pack that does, then read again.");
    expect(c.next).toEqual({ label: "Read again", command: ["digest", "@ct-lab"] });
    expect(nextMove(job(1, ["classify", "--pack", "mri"], "cancelled"))?.label).toBe("Sort again");
    expect(nextMove(job(1, ["digest", "@a"], "done"))).toBeNull();
    expect(titleOf(job(2, ["release", "--name", "spring-v1"], "done"))).toBe("Release of spring-v1 done");
    expect(titleOf(job(3, ["backup"], "cancelled"))).toBe("Backup cancelled");
  });
  it("finds what the verb acts on", () => {
    expect(targetOf(job(1, ["digest", "@lake/dcm-anon"], "done"))).toBe("lake");
    expect(targetOf(job(1, ["classify", "--pack", "mri"], "done"))).toBe("mri");
    expect(targetOf(job(1, ["backup"], "done", { name: "nightly" }))).toBe("nightly");
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
