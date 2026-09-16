// SPDX-License-Identifier: AGPL-3.0-only
// A batch's page, the pure parts: which dataset a batch belongs to, how long
// a job took, what a batch added by base, the lede, and how a timeline
// event is drawn.

import { describe, expect, it } from "vitest";
import type { JobRow } from "../ask/client";
import { addedByBase, datasetOf, eventMark, jobWords, ledeWords, tookWords, verbWords, type BatchDoc } from "./batch";
import type { Dataset } from "./pseudonyms";
import type { Source } from "./sources";

const source = (name: string, digests: number[] = []): Source =>
  ({
    id: 1,
    name,
    path: `/scans/${name}`,
    guarantees: {},
    probed: null,
    handling: { arrives: "identified", on_release: { dates: "shift", uids: "remap", deface: false } },
    handling_declared: true,
    roots: 1,
    digests: { count: digests.length, first: null, last: null, recent: digests.map((id) => ({ id, name: `${name}-${id}`, state: "done", started_at: null, finished_at: null, job_id: null, files: { seen: 0, new: 0, changed: 0, unchanged: 0, refused: 0 }, subjects_added: 0, stacks_added: 0 })) },
    totals: { subjects: 0, studies: 0, sessions: 0, stacks: 0, refused_files: 0, to_sort: 0 },
  }) as Source;

const batch = (over: Partial<BatchDoc> = {}): BatchDoc => ({ id: 12, name: "spring-scans-2026-08-20", state: "done", started_at: "2026-08-20T21:01:00Z", finished_at: "2026-08-20T21:05:00Z", epoch_after: 3, seen: 10, parsed: 10, quarantined: 0, ingested: 10, report: null, ...over });

describe("which dataset a batch belongs to", () => {
  it("is named on the row, else the source whose digests list it, else the source it is named after", () => {
    const spring = source("spring-scans", [12]);
    const other = source("spring", []);
    expect(datasetOf(batch({ dataset: "spring" }), [spring, other])?.name).toBe("spring");
    expect(datasetOf(batch(), [other, spring])?.name).toBe("spring-scans");
    expect(datasetOf(batch(), [other, source("spring-scans")])?.name).toBe("spring-scans");
    expect(datasetOf(batch({ name: "nothing-like-it" }), [other])).toBeNull();
  });
});

describe("the words of a batch", () => {
  it("say how long a job took, in a person's units", () => {
    expect(tookWords({ started_at: "2026-08-20T21:01:00Z", finished_at: "2026-08-20T21:01:40Z" })).toBe("40 s");
    expect(tookWords({ started_at: "2026-08-20T21:01:00Z", finished_at: "2026-08-20T21:03:10Z" })).toBe("2 min");
    expect(tookWords({ started_at: "2026-08-20T21:01:00Z", finished_at: "2026-08-20T22:06:00Z" })).toBe("1 h 5 min");
    expect(tookWords({ started_at: "2026-08-20T21:01:00Z", finished_at: null }, Date.parse("2026-08-20T21:01:05Z"))).toBe("5 s");
  });
  it("name one job or several", () => {
    expect(jobWords([120, 119])).toBe("jobs 119, 120");
    expect(jobWords([117])).toBe("job 117");
    expect(jobWords([])).toBe("");
  });
  it("read the verb off the command line", () => {
    expect(verbWords({ id: 1, kind: "digest", name: null, state: "done", started_at: "", heartbeat_at: null, finished_at: null, progress: null, error: null, args: { argv: ["digest", "@spring-scans"] }, result: null })).toBe("digest @spring-scans");
  });
  it("read the line the engine queued, not the worker's binary and registry", () => {
    const ran = (args: Record<string, unknown>): JobRow => ({ id: 1, kind: "pseudonymize", name: null, state: "done", started_at: "", heartbeat_at: null, finished_at: null, progress: null, error: null, args, result: null });
    expect(verbWords(ran({ queued: ["pseudonymize", "@spring-scans", "--name", "spring"], argv: ["/opt/nils/nils", "--registry", "/srv/registry", "pseudonymize", "@spring-scans", "--name", "spring"] }))).toBe("pseudonymize @spring-scans --name spring");
    expect(verbWords(ran({ argv: ["/opt/nils/nils", "--registry", "/srv/registry", "digest", "@spring-scans"] }))).toBe("digest @spring-scans");
    expect(verbWords(ran({}))).toBe("pseudonymize");
  });
  it("open with the dataset, the jobs that pseudonymised and read it, and the identity rule", () => {
    const d: Dataset = { ...source("spring-scans"), identity: { id_type: "personnummer", from: [{ field: "PatientID" }] } };
    const b = batch({ stages: { pseudonymised: { files: 1, changed: 0, held: 0, refused: 0, job: 117 }, walked: { files: 1, new: 1, changed: 0, unchanged: 0, refused: 0, job: 118 }, digested: { stacks: 1, sessions: 1, subjects: 1, moved: 0, job: 118 }, classified: { stacks: 0, of: 1, unsure: 0, pack: null, jobs: [] }, reviewed: { done: 0, of: 0, since: null } } });
    expect(ledeWords(b, d, "20 Aug")).toBe("A batch of spring-scans, brought in 20 Aug: pseudonymised by job 117, read by job 118. Who each file is about: PatientID, through the map.");
    expect(ledeWords(batch(), null, "today")).toBe("A batch brought in today.");
  });
});

describe("what a batch added by base", () => {
  it("reads counts from the classified stage, the row or the report, and puts the unsure last", () => {
    expect(addedByBase(batch())).toBeNull();
    expect(addedByBase(batch({ report: { by_base: { T1w: 142, FLAIR: 118, other: 24 } } }))).toEqual([
      { base: "T1w", count: 142, unsure: false },
      { base: "FLAIR", count: 118, unsure: false },
      { base: "other", count: 24, unsure: false },
    ]);
    const s = { pseudonymised: null, walked: { files: 1, new: 1, changed: 0, unchanged: 0, refused: 0, job: null }, digested: { stacks: 1, sessions: 1, subjects: 1, moved: 0, job: null }, classified: { stacks: 5, of: 6, unsure: 1, pack: "mri", jobs: [], by_base: [{ base: "DWI", stacks: 5 }] }, reviewed: { done: 0, of: 1, since: null } };
    expect(addedByBase(batch({ stages: s }))).toEqual([
      { base: "DWI", count: 5, unsure: false },
      { base: "unsure", count: 1, unsure: true },
    ]);
  });
});

describe("a timeline event", () => {
  it("is drawn by what its kind says", () => {
    const e = (kind: string) => ({ at: "", kind, actor: null, summary: "", produced: null, source: "" });
    expect(eventMark(e("job.finished"))).toBe("done");
    expect(eventMark(e("job.started"))).toBe("now");
    expect(eventMark(e("files.refused"))).toBe("failed");
    expect(eventMark(e("review.opened"))).toBe("wait");
  });
});
