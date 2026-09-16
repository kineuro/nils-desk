// SPDX-License-Identifier: AGPL-3.0-only
// The stage strip as it draws: five cells with their counts, the job under
// each, and the reviewed stage's way to Review; and the dataset's
// pseudonymisation facts at the side of its batch.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { JobRow } from "../ask/client";
import { PseudonymisationFacts, StageStrip } from "./BatchPage";
import type { BatchDoc } from "./batch";
import type { Dataset } from "./pseudonyms";
import { stages } from "./stages";

const job = (id: number, argv: string[]): JobRow => ({ id, kind: argv[0], name: null, state: "done", started_at: "2026-08-20T21:01:00Z", heartbeat_at: null, finished_at: "2026-08-20T21:03:00Z", progress: null, error: null, args: { argv, principal: "astrid" }, result: null });

const batch: BatchDoc = {
  id: 9,
  name: "lake-2026-08-20",
  state: "done",
  started_at: "2026-08-20T21:01:00Z",
  finished_at: "2026-08-20T21:05:00Z",
  epoch_after: 3,
  seen: 11324,
  parsed: 11321,
  quarantined: 3,
  ingested: 11321,
  report: null,
  stages: {
    pseudonymised: { files: 2222, changed: 14, held: 0, refused: 0, job: 117 },
    walked: { files: 11324, new: 2208, changed: 14, unchanged: 9102, refused: 3, job: 118 },
    digested: { stacks: 486, sessions: 41, subjects: 38, moved: 2, job: 118 },
    classified: { stacks: 474, of: 486, unsure: 12, pack: "mri 0.1.1", jobs: [119, 120] },
    reviewed: { done: 0, of: 12, since: "2026-08-20T21:40:00Z" },
  },
};

describe("the stage strip as it draws", () => {
  it("has five cells, each with its count and its job, and the reviewed stage opens Review by the batch", () => {
    const jobs = [job(117, ["pseudonymize", "@lake"]), job(118, ["digest", "@lake/dcm-anon"]), job(119, ["fingerprint"]), job(120, ["classify", "--pack", "mri"])];
    const html = renderToStaticMarkup(<StageStrip strip={stages(batch, jobs, [])} jobs={jobs} batch={batch} />);
    expect(html).toContain('class="strip five"');
    expect(html).toContain("pseudonymised");
    expect(html).toContain("2,222");
    expect(html).toContain("job 117 · 2 min");
    expect(html).toContain("jobs 119, 120");
    expect(html).toContain('href="#review?batch=9"');
    expect(html).toContain("Open on Review");
    expect(html).not.toContain("undefined");
  });
});

describe("the pseudonymisation facts beside a batch", () => {
  it("say how the dataset arrives, where the codes come from, what leaves, and open its page", () => {
    const d = {
      id: 1,
      name: "lake",
      path: "/scans/lake",
      guarantees: {},
      probed: null,
      handling: { arrives: "identified", on_release: { dates: "shift", uids: "remap", deface: false } },
      handling_declared: true,
      roots: 1,
      digests: { count: 0, first: null, last: null, recent: [] },
      totals: { subjects: 0, studies: 0, sessions: 0, stacks: 0, refused_files: 0, to_sort: 0 },
      arrives: "identified",
    } as Dataset;
    const html = renderToStaticMarkup(<PseudonymisationFacts dataset={d} />);
    expect(html).toContain("pseudonymised into dcm-anon");
    expect(html).toContain("codes from the map and the key");
    expect(html).toContain("dates shifted · UIDs remapped · faces kept");
    expect(html).toContain('href="#data/datasets/lake/pseudonymisation"');
  });
});
