// SPDX-License-Identifier: AGPL-3.0-only
// How far a running model run is, and why a failed step failed, in the
// engine's words (2026-11-05: a body-part run over a cohort stood at "0 of
// 20,000" for twenty minutes, and a failed one said only "failed"). The run's
// beat carries `done` of `total` `what`, the part of a split run and since
// when its job runs; a failed step carries the engine's failure. The numbers
// here are made up.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { caps7a } from "../../test/safeWayIn";
import type { JobRow } from "../ask/client";
import { StepNotes, stepNotes } from "../data/StepNotes";
import { runningWords, stepWords, type SummaryStep } from "../data/summary";
import { firstClause, liveOf, liveWords, runningFor, stepFailureOf, stepProgressWords, whatWords } from "./progress";

const NOW = Date.parse("2026-11-05T22:47:00Z");
const SINCE = "2026-11-05T22:00:00Z";

/** A beat as the engine's run sends it while one container holds every scan of part 4 of 23. */
const BEAT = {
  run: 162,
  phase: "run",
  units: 870,
  over: 0,
  running: 870,
  queued: 0,
  done: 312,
  total: 870,
  what: "stacks",
  together: true,
  reported: { done: 312, of: 870, what: "stacks", units: 1 },
  part: { at: 4, of: 23 },
  since: SINCE,
};

const CAP =
  "a container was killed at its memory cap, the memory its pipeline declares for a unit of the cores it took: run it with fewer threads where its memory grows with them, or add a version of the pipeline that declares more memory (nils pipeline add) within what the lane holds (nils pipeline lane --memory-gb)";

const step = (over: Partial<SummaryStep> = {}): SummaryStep => ({
  step: "body_part",
  state: "running",
  job: 41,
  started_at: "2026-11-05T22:30:00Z",
  finished_at: null,
  progress: BEAT,
  run: 162,
  served: true,
  answered: 0,
  look: 0,
  of: 20000,
  jobs: [41],
  refusal: null,
  ...over,
});

describe("how far a run is", () => {
  it("reads the engine's count, part and time", () => {
    const p = liveOf(BEAT);
    expect(p).toEqual({ done: 312, total: 870, what: "stacks", part: { at: 4, of: 23 }, since: SINCE, reported: { done: 312, of: 870, units: 1 } });
    expect(liveWords(p)).toBe("312 of 870 scans in part 4 of 23");
    expect(stepProgressWords(BEAT, null, NOW)).toBe("312 of 870 scans in part 4 of 23 · 47 min");
  });

  // engine 2026-11-06: parts that run at once beat their job summed
  it("says the parts running at once and their counts summed", () => {
    const p = liveOf({ ...BEAT, done: 1200, total: 2610, part: { at: 3, to: 5, of: 23 } });
    expect(p.part).toEqual({ at: 3, to: 5, of: 23 });
    expect(liveWords(p)).toBe("1,200 of 2,610 scans in parts 3 to 5 of 23");
    expect(liveOf({ ...BEAT, part: { at: 4, to: 4, of: 23 } }).part).toEqual({ at: 4, of: 23 });
  });

  it("says the engine's words in the desk's", () => {
    expect([whatWords("stacks", 2), whatWords("stacks", 1), whatWords("sessions", 3), whatWords("subjects", 1), whatWords("slices", 1), whatWords(null, 4)]).toEqual([
      "scans",
      "scan",
      "visits",
      "subject",
      "slice",
      "scans",
    ]);
  });

  it("counts units where no container says how far, and says only the time before anything is counted", () => {
    const quiet = { run: 9, phase: "run", units: 40, over: 12, running: 4, queued: 24, done: 12, total: 40, what: "sessions", together: false, reported: null, part: null, since: SINCE };
    expect(stepProgressWords(quiet, null, NOW)).toBe("12 of 40 visits · 47 min");
    // the input still being prepared: only how long, from the step's start where the beat names none
    expect(stepProgressWords({ run: 9, phase: "materialise" }, "2026-11-05T22:46:20Z", NOW)).toBe("40 s");
    expect(stepProgressWords(null, null, NOW)).toBeNull();
    // a part of one is no part
    expect(liveOf({ part: { at: 1, of: 1 } }).part).toBeNull();
  });

  it("says how long in a few words", () => {
    expect(runningFor("2026-11-05T19:42:00Z", NOW)).toBe("3 h 5 min");
    expect(runningFor("2026-11-05T21:47:00Z", NOW)).toBe("1 h");
    expect(runningFor(null, NOW)).toBe("");
    expect(runningFor("not a time", NOW)).toBe("");
  });

  it("moves the step's node and the log's box with the container's own count", () => {
    expect(stepWords(step(), new Date(NOW)).what).toBe("312 of 870");
    const row: Pick<JobRow, "kind" | "progress" | "started_at" | "state"> = { kind: "pipeline", progress: BEAT as JobRow["progress"], started_at: SINCE, state: "running" };
    expect(runningWords(row, NOW).words).toMatch(/^312 of 870 scans · part 4 of 23/u);
    // an engine from before: units over of units, as before
    const before: Pick<JobRow, "kind" | "progress" | "started_at" | "state"> = { kind: "pipeline", progress: { run: 3, phase: "run", units: 20000, over: 0 } as JobRow["progress"], started_at: SINCE, state: "running" };
    expect(runningWords(before, NOW).words).toBe("0 of 20,000 scans");
  });
});

describe("why a step failed", () => {
  it("leads with what happened where the engine says it, what to do a hover away", () => {
    const f = stepFailureOf({ kind: "resource", cause: "memory", advice: CAP, said: "killed at its memory cap of 16 GB", cap_gb: 16 });
    expect(f).toEqual({ kind: "resource", cause: "memory", line: "killed at its memory cap of 16 GB", advice: CAP, capGb: 16 });
  });

  it("else with what to do, up to its colon, the rest a hover away", () => {
    const advice =
      "dcm2niix is not installed where the engine can find it: an admin installs it from the software place, with nils software install dcm2niix or the desk's Settings > Software";
    const f = stepFailureOf({ kind: "dependency", cause: "dcm2niix", advice, fix: null });
    expect(f?.line).toBe("dcm2niix is not installed where the engine can find it");
    expect(f?.advice).toBe(advice);
    expect(firstClause("no colon here")).toBe("no colon here");
    expect(stepFailureOf({ kind: "pipeline", cause: "pipeline", advice: "short" })?.advice).toBeNull();
    expect(stepFailureOf(null)).toBeNull();
    expect(stepFailureOf({ kind: "pipeline" })).toBeNull();
  });
});

describe("the line under the rail", () => {
  const caps = caps7a(["GET /api/pipeline-runs/{id}"]);

  it("says how far a model's step is while it runs, and nothing of a step that does not run", () => {
    const notes = stepNotes([step(), step({ step: "post_contrast", state: "waiting", progress: null }), step({ step: "read", progress: { files: 3 } })], NOW);
    expect(notes).toEqual([{ step: "body_part", title: "Body part", failed: false, words: "312 of 870 scans in part 4 of 23 · 47 min", failure: null, run: 162 }]);
    const html = renderToStaticMarkup(<StepNotes caps={caps} steps={[step()]} now={NOW} />);
    expect(html).toContain("<b>Body part</b>: 312 of 870 scans in part 4 of 23 · 47 min");
    expect(html).toContain('href="#pipelines/runs/162"');
  });

  it("says why a failed one failed, with its kind and the way to its run", () => {
    const failed = step({ state: "failed", progress: null, failure: { kind: "resource", cause: "memory", advice: CAP, said: "killed at its memory cap of 16 GB", cap_gb: 16 } });
    const html = renderToStaticMarkup(<StepNotes caps={caps} steps={[failed]} now={NOW} />);
    expect(html).toContain('class="dp-step-note failed"');
    expect(html).toContain('data-kind="resource"');
    expect(html).toContain("<b>Body part failed</b>: killed at its memory cap of 16 GB");
    expect(html).toContain(">Run 162</a>");
    expect(html).toContain('class="hint"');
    // a failed step an engine from before says nothing of: no line
    expect(stepNotes([step({ state: "failed", progress: null })], NOW)).toEqual([]);
  });

  it("offers the run only to a person who may open it", () => {
    const html = renderToStaticMarkup(<StepNotes caps={caps7a([])} steps={[step()]} now={NOW} />);
    expect(html).not.toContain("Run 162");
    expect(renderToStaticMarkup(<StepNotes caps={caps} steps={[]} now={NOW} />)).toBe("");
  });
});

describe("a failure that says what happened", () => {
  it("leads with it on a run's page, what to do under it", async () => {
    const { failureOf } = await import("./failure");
    const { FailNote } = await import("./Reason");
    const f = failureOf({ error: "the container exited 137 and wrote no results.json", failure: { kind: "resource", cause: "memory", advice: CAP, said: "killed at its memory cap of 16 GB", cap_gb: 16, fix: null } });
    expect(f?.line).toBe("killed at its memory cap of 16 GB");
    expect(f?.said).toBe("killed at its memory cap of 16 GB");
    const html = renderToStaticMarkup(<FailNote f={f!} />);
    expect(html).toContain("<span>killed at its memory cap of 16 GB</span>");
    expect(html).toContain(CAP);
    expect(html).toContain("the container exited 137");
    // a failure that says nothing of what happened is read as before, with no `said`
    expect(failureOf({ error: "x", failure: { kind: "pipeline", cause: "pipeline", advice: "the pipeline itself failed" } })).toEqual({
      error: "x",
      kind: "pipeline",
      cause: "pipeline",
      advice: "the pipeline itself failed",
      line: "the pipeline itself failed",
      fix: null,
    });
  });
});
