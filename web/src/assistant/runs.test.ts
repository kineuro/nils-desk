// SPDX-License-Identifier: AGPL-3.0-only
// A station run's phases: waiting while it runs, filled from the verdict
// once it settles, the first marked failed when the run does; what a
// prediction, a rehearsal, a rule and what the probe saw say in words.

import { describe, expect, it } from "vitest";
import { checkWords, phasesOf, predictionWords, rehearsalWords, ruleWords, runTag, sawOf } from "./runs";
import type { StationRun, Verdict } from "./stations";

const run = (state: StationRun["state"], error: string | null = null): StationRun => ({ run: "run-1", conversation: "c-1", state, error });

const tune: Verdict = {
  station: "keyword-tune",
  terminal: "proposed",
  result: {
    axis: "post_contrast",
    scope: "batch:12",
    survey: "14 stacks unsure on post_contrast; 9 decisions by people turned no into yes; the words their descriptions share: km ×9, gado ×5.",
    prediction: { axis: "post_contrast", bucket: "contrast_positive", add: ["km", "gado"], remove: [], flip: ["post_contrast:low_confidence|no|keyword"], must_not_regress: ["base=T1w", "base=T2w", "technique=TSE"], at: 1789000000000 },
    rehearsal: { moves: [{ axis: "post_contrast", from: "no", to: "yes", stacks: 17 }], review_items: { close: 14, open: 0 }, cases: { passed: 2, failed: 0 }, diff: "keep" },
    left: 3,
  },
  checks: [
    { name: "one_list_touched", passed: true, why: null },
    { name: "prediction_before_rehearsal", passed: true, why: null },
  ],
  proposals: [{ kind: "overlay", ref: { id: 9, review_item: 44 }, sentence: "Overlay tune-post_contrast 1.0.0, scope batch 12." }],
};

describe("a keyword-tune run's phases", () => {
  it("wait while it runs, the first now", () => {
    expect(phasesOf("keyword-tune", null, null).map((p) => [p.key, p.state])).toEqual([
      ["survey", "wait"],
      ["prediction", "wait"],
      ["rehearsal", "wait"],
      ["check", "wait"],
      ["proposal", "wait"],
    ]);
    expect(phasesOf("keyword-tune", run("running"), null)[0].state).toBe("now");
    expect(runTag(run("running"), null)).toEqual({ words: "running", tone: "brand" });
  });
  it("fill from the verdict once settled, the proposal now, as the person's", () => {
    const phases = phasesOf("keyword-tune", run("settled"), tune);
    expect(phases.map((p) => p.state)).toEqual(["done", "done", "done", "done", "now"]);
    expect(phases[0].words).toMatch(/^14 stacks unsure on post_contrast/u);
    expect(phases[1].words).toBe("Add km and gado to contrast_positive. Expect the group post_contrast:low_confidence|no|keyword to close. base and technique must not move.");
    expect(phases[1].when).toBe(new Date(1789000000000).toISOString());
    expect(phases[2].words).toBe("post_contrast moved on 17. Closes 14 items, opens 0. The 2 cases pass. Read as keep. Wrote nothing.");
    expect(phases[3].words).toBe("keep · one list touched · prediction before rehearsal");
    expect(phases[4].words).toBe("Overlay tune-post_contrast 1.0.0, scope batch 12. On the queue beside its review item; the station never adopts.");
    expect(runTag(run("settled"), tune)).toEqual({ words: "proposed", tone: "ok" });
  });
  it("mark a failed check and a run that failed", () => {
    const failed = { ...tune, checks: [{ name: "rehearsal_wrote_nothing", passed: false, why: "an overlay was proposed before the last rehearsal" }], proposals: [] };
    const phases = phasesOf("keyword-tune", run("settled"), failed);
    expect(phases[3].state).toBe("failed");
    expect(phases[3].words).toBe("rehearsal wrote nothing: an overlay was proposed before the last rehearsal");
    expect(phases[4].state).toBe("wait");
    expect(phases[4].words).toBe("No proposal: proposed.");
    expect(checkWords(null)).toBe("");
    const broke = phasesOf("keyword-tune", run("failed", "the model did not answer"), null);
    expect(broke[0]).toMatchObject({ state: "failed", words: "the model did not answer" });
    expect(runTag(run("aborted"), null)).toEqual({ words: "stopped", tone: "" });
  });
  it("say a prediction and a rehearsal in words whatever the station kept", () => {
    expect(predictionWords(null)).toBe("no prediction was written");
    expect(predictionWords({ list: "technique.SS-GRE", add: ["fl3d_vibe"], remove: ["flash"], flip: [], must_not_regress: [] })).toBe("Add fl3d_vibe to technique.SS-GRE. Take flash out of technique.SS-GRE.");
    expect(rehearsalWords({ moved: 3 })).toBe("3 stacks moved.");
    expect(rehearsalWords({ moves: [], review_items: { close: 0, open: 1 }, cases: { passed: 1, failed: 1 } })).toBe("Closes 0 items, opens 1. 1 of the cases fail.");
  });
});

const identity: Verdict = {
  station: "identity-check",
  terminal: "proposed",
  result: {
    location: "alpha",
    probe_jobs: [123],
    saw: [
      { rule: { id_type: "patient-id", from: [{ field: "PatientID" }, { field: "StudyInstanceUID" }] }, shapes: { "9999999999": 18402, AAA999: 18 }, subjects: 214, empty: 0 },
      { rule: { id_type: "subject-code", code: "verbatim", from: [{ path: { segment: 2 } }] }, shapes: [{ shape: "AAA-999", count: 18420 }], subjects: 212, empty: 0 },
    ],
    proposed: { id_type: "subject-code", code: "verbatim", from: [{ path: { segment: 2 } }] },
    path_is_direct_identifier: false,
    sentence: "Read the code from folder 2 of the path, verbatim; every file has one.",
  },
  checks: [{ name: "shapes_only", passed: true, why: null }],
  proposals: [{ kind: "identity_rule", ref: { rule: { id_type: "subject-code", code: "verbatim", from: [{ path: { segment: 2 } }] } }, sentence: "Read the code from folder 2 of the path, verbatim." }],
};

describe("an identity-check run", () => {
  it("draws the rule in use and the candidate from what the probe saw, shapes and counts only", () => {
    const saw = sawOf(identity);
    expect(saw.map((s) => s.title)).toEqual(["Now: PatientID, then StudyInstanceUID", "Candidate: folder 2 of the path, the code verbatim"]);
    expect(saw[0].shapes).toEqual([
      { shape: "9999999999", count: 18402 },
      { shape: "AAA999", count: 18 },
    ]);
    expect(saw[0].people).toBe(214);
    expect(saw[1].pathAnswer).toBe("no: a study code, not a person's number");
    expect(saw[0].pathAnswer).toBeNull();
    expect(ruleWords(null)).toBe("no rule");
    expect(ruleWords({ from: [] })).toBe("the default rule");
  });
  it("has its phases: read, probe, proposal, and yours, which waits for the person", () => {
    const phases = phasesOf("identity-check", run("settled"), identity);
    expect(phases.map((p) => [p.key, p.state])).toEqual([
      ["read", "done"],
      ["probe", "done"],
      ["proposal", "done"],
      ["yours", "wait"],
    ]);
    expect(phases[0].words).toBe("the location alpha");
    expect(phases[1].words).toBe("ran as job 123; shapes and counts only");
    expect(phases[2].words).toBe("folder 2 of the path, the code verbatim. Read the code from folder 2 of the path, verbatim.");
    expect(phasesOf("identity-check", run("queued"), null).map((p) => p.state)).toEqual(["wait", "wait", "wait", "wait"]);
  });
});
