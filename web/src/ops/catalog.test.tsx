// SPDX-License-Identifier: AGPL-3.0-only
// Pipelines / Catalog (record 45 S6): entries as the catalog door answers
// them, a run on a selection as the command line the jobs door queues, the
// parameters checked as the descriptor declares them, the runs counted, and
// no Run where the engine has no runtime, the person no work or the door no
// queue. Since 2026-10-12, one row a name with the versions a new run may
// take, newest first, and none a later version replaces.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { capsWith } from "../review/caps.fixture";
import { CatalogBody, RunDialog } from "./Catalog";
import { andWords, catalogActs, catalogRows, imageWords, mainOfSpec, mainRoles, mainSpec, mainWords, needsOf, overWords, paramError, pipelineRoles, runCommand, runCounts, selectOf, writesWords, type Pipeline, type Run } from "./catalog";
import { PipelinesPage } from "./PipelinesPage";
import { pipelineOf } from "./runs";

const TRAIN: Pipeline = {
  id: 4,
  name: "bodypart-train",
  version: "1",
  label: "bodypart-train@1",
  description: "Fit a calibrated body-part head on a label set.",
  image: `ghcr.io/kineuro/nils-bodypart@sha256:${"0a".repeat(32)}`,
  layout: "stacks",
  level: "stack",
  state: "active",
  parameters: [
    { id: "estimator", name: "Classifier", type: "String", "value-choices": ["logreg", "rf", "svm"], "default-value": "logreg", optional: true },
    { id: "min_per_class", name: "Samples per class", type: "Number", integer: true, minimum: 1, "default-value": 5, optional: true },
    { id: "threshold", name: "Staging threshold", type: "Number", minimum: 0.5, maximum: 1, "default-value": 0.7, optional: true },
  ],
  inputs: [
    { id: "labels", type: "label_set" },
    { id: "embeddings", type: "derivative:embedding" },
  ],
  outputs: [{ id: "head", kind: "model", level: "run" }],
  needs: { gpu: "none" },
  proposals: null,
};

const N4: Pipeline = { ...TRAIN, id: 1, name: "n4", label: "n4@1", description: null, parameters: [], inputs: [], outputs: [{ id: "corrected", kind: "output" }], proposals: [] };
const INFER: Pipeline = { ...TRAIN, id: 5, name: "bodypart-infer", label: "bodypart-infer@1", inputs: [{ id: "head", type: "model" }], outputs: [{ id: "probs", kind: "output" }], proposals: [{ axis: "body_part" }] };

const RUN: Run = {
  id: 7,
  pipeline_id: 5,
  pipeline: "bodypart-infer@1",
  job_id: 30,
  selection: "selection:chest-ct@2",
  status: "done",
  started_at: "2026-09-24T09:00:00Z",
  finished_at: "2026-09-24T09:04:00Z",
  summary: { units: { total: 120, succeeded: 118, failed: 1, unreported: 1 }, derivatives: 118, proposals: { ingested: { members: 120, staged_members: 97 } }, models: [] },
};

const DOORS = ["GET /api/pipelines", "GET /api/pipeline-runs", "POST /api/jobs", "GET /api/jobs", "GET /api/review"];
const ON = { enabled: true, runtime: { name: "podman", version: "5.2" } };

describe("a run on a selection", () => {
  it("is the command line the jobs door queues, with only what was changed from a default", () => {
    expect(runCommand({ pipeline: TRAIN, over: { selection: "chest-ct", version: 2 }, params: { estimator: "rf" }, models: [], labels: 9 })).toEqual(["run", "bodypart-train@1", "--select", "selection:chest-ct@2", "--param", "estimator=rf", "--labels", "9"]);
    expect(runCommand({ pipeline: INFER, over: { handle: 71 }, params: {}, models: ["bodypart-head@3"], labels: null })).toEqual(["run", "bodypart-infer@1", "--handle", "71", "--model", "bodypart-head@3"]);
  });
  it("goes straight over a dataset's or a cohort's main scans of a role (record 55, 2026-10-12)", () => {
    const over = { main: { kind: "dataset" as const, name: "study-anon", role: "t1w" } };
    expect(runCommand({ pipeline: INFER, over, params: {}, models: [], labels: null })).toEqual(["run", "bodypart-infer@1", "--select", "main:t1w@dataset:study-anon"]);
    expect(selectOf({ main: { kind: "cohort", name: "ms-followup", role: "flair" } })).toEqual({ select: "main:flair@cohort:ms-followup" });
    expect(selectOf({ selection: "x", version: 2 })).toEqual({ select: "selection:x@2" });
    expect(selectOf({ handle: 7 })).toEqual({ handle: 7 });
    expect(mainOfSpec("main:t1w@dataset:study-anon")).toEqual(over.main);
    expect(mainOfSpec("selection:x@2")).toBeNull();
    // the runs table names a run's main scans in words, a selection as it is
    expect(overWords("main:flair@cohort:ms-followup")).toBe("ms-followup · main FLAIR");
    expect(overWords("selection:x@2")).toBe("selection:x@2");
    expect(overWords(null)).toBe("");
    // the roles are the served pack's, else the MRI pack's
    expect(mainRoles(capsWith([], [], [{ name: "mri", version: "1.0.3", main_roles: ["t1w", "flair"] } as { name: string; version: string }]))).toEqual(["t1w", "flair"]);
    expect(mainRoles(capsWith([], []))).toEqual(["t1w", "flair", "t2w"]);
  });
  it("goes over the main scans of each role a pipeline needs, sent without a role (2026-10-12)", () => {
    const every = { kind: "dataset" as const, name: "study-anon", role: null, roles: ["t1w", "flair"] };
    expect(mainSpec(every)).toBe("main@dataset:study-anon");
    expect(runCommand({ pipeline: { label: "samseg-lesions@1" }, over: { main: every }, params: {}, models: [], labels: null })).toEqual(["run", "samseg-lesions@1", "--select", "main@dataset:study-anon"]);
    expect(mainWords(every)).toBe("study-anon · main T1w + FLAIR");
    expect(mainOfSpec("main@cohort:ms-followup")).toEqual({ kind: "cohort", name: "ms-followup", role: null });
    // a selection named main is no scope
    expect(mainOfSpec("main@2")).toBeNull();
    // the runs table: the roles where the run says them, else its main scans
    expect(overWords("main@dataset:study-anon", ["t1w", "flair"])).toBe("study-anon · main T1w + FLAIR");
    expect(overWords("main@dataset:study-anon")).toBe("study-anon · main scans");
    // a role named stays the role, whatever the pipeline needs
    expect(overWords("main:t1w@dataset:study-anon", ["t1w", "flair"])).toBe("study-anon · main T1w");
    expect(pipelineRoles({ roles: ["t1w", "flair"] })).toEqual(["t1w", "flair"]);
    expect(pipelineRoles({ roles: null, descriptor: { "x-nils": { input: { layout: "bids", roles: ["t1w"] } } } })).toEqual(["t1w"]);
    expect(pipelineRoles({})).toEqual([]);
    expect(andWords(["T1w", "FLAIR", "T2w"])).toBe("T1w, FLAIR and T2w");
  });
  it("checks each parameter as the descriptor declares it", () => {
    const [estimator, per, threshold] = TRAIN.parameters!;
    expect(paramError(estimator, "")).toBeNull();
    expect(paramError(estimator, "knn")).toBe("Classifier is one of logreg, rf, svm");
    expect(paramError(per, "2.5")).toBe("Samples per class is a whole number");
    expect(paramError(per, "0")).toBe("Samples per class is at least 1");
    expect(paramError(threshold, "0.4")).toBe("Staging threshold is at least 0.5");
    expect(paramError(threshold, "x")).toBe("Staging threshold is a number");
  });
  it("names the inputs a person gives and what the run writes", () => {
    expect(needsOf(TRAIN).labels?.id).toBe("labels");
    expect(needsOf(INFER).models.map((m) => m.id)).toEqual(["head"]);
    expect(writesWords(TRAIN)).toBe("one model for the run");
    expect(writesWords(INFER)).toBe("an output per stack; proposals on body_part, staged at the model's threshold for a person to commit");
    expect(imageWords(TRAIN)).toBe("ghcr.io/kineuro/nils-bodypart@sha256:0a0a0a0a0a0a");
  });
  it("counts a run's account", () => {
    expect(runCounts(RUN)).toEqual({ units: 120, failed: 2, derivatives: 118, staged: 97, asked: 23, models: 0 });
  });
});

describe("the catalog page", () => {
  it("offers Run on each entry with a runtime, the work grant and the queue", () => {
    const caps = capsWith(DOORS, ["pipelines:see", "pipelines:work", "review:see"]);
    expect(catalogActs(caps, ON)).toEqual({ see: true, run: true, why: null });
    const html = renderToStaticMarkup(<CatalogBody caps={caps} pipelines={[N4, TRAIN, INFER]} capability={ON} runs={[RUN]} onRun={() => undefined} />);
    expect(html.match(/>Run on a selection<\/button>/gu)).toHaveLength(3);
    expect(html).toContain("3 pipelines · podman");
    expect(html).toContain('<a href="#review/proposals">97</a>');
    expect(html).toContain("120 · 2 failed");
  });
  it("says why and offers no Run where the engine has no runtime", () => {
    const caps = capsWith(DOORS, ["pipelines:see", "pipelines:work"]);
    const off = { enabled: false, reason: "no container runtime found: looked for podman, apptainer and docker" };
    expect(catalogActs(caps, off).run).toBe(false);
    const html = renderToStaticMarkup(<CatalogBody caps={caps} pipelines={[N4]} capability={off} runs={[]} onRun={() => undefined} />);
    expect(html).not.toContain("Run on a selection");
    expect(html).toContain("no container runtime found: looked for podman, apptainer and docker");
  });
  it("offers no Run to a person who may only see, nor where the engine queues no jobs, and links no proposals without Review", () => {
    expect(catalogActs(capsWith(DOORS, ["pipelines:see"]), ON)).toEqual({ see: true, run: false, why: "Running a pipeline needs work on the Pipelines page." });
    expect(catalogActs(capsWith(DOORS.filter((d) => d !== "POST /api/jobs"), ["pipelines:see", "pipelines:work"]), ON).run).toBe(false);
    const html = renderToStaticMarkup(<CatalogBody caps={capsWith(DOORS, ["pipelines:see"])} pipelines={[INFER]} capability={ON} runs={[RUN]} onRun={() => undefined} />);
    expect(html).not.toContain("Run on a selection");
    expect(html).not.toContain("#review");
  });
  it("draws the run dialog with the selection, the parameters and the model the descriptor asks for", () => {
    const html = renderToStaticMarkup(<RunDialog caps={capsWith(DOORS, ["pipelines:see", "pipelines:work"])} pipeline={INFER} onClose={() => undefined} onDone={() => undefined} />);
    expect(html).toContain('aria-label="What the run goes over"');
    expect(html).toContain("Model: head");
    expect(html).toContain("choose an admitted model");
    expect(html).toContain("proposals on body_part");
    expect(html).toMatch(/<button type="button" class="button" disabled="">Run<\/button>/u);
  });
  // record 55 H2, round 4: the side carries Jobs, Catalog and Runs (sections.test.ts); the page draws no tabs of them
  it("opens the Catalog and the Runs as pages of their own only where the engine serves the catalog", () => {
    const jobs = renderToStaticMarkup(<PipelinesPage caps={capsWith(DOORS, ["pipelines:see"])} />);
    expect(jobs).not.toContain('class="chips pages"');
    expect(renderToStaticMarkup(<PipelinesPage caps={capsWith(DOORS, ["pipelines:see"])} page="catalog" />)).toContain("<h1>Catalog</h1>");
    expect(renderToStaticMarkup(<PipelinesPage caps={capsWith(DOORS, ["pipelines:see"])} page="runs" />)).toContain("<h1>Runs</h1>");
    expect(renderToStaticMarkup(<PipelinesPage caps={capsWith(["GET /api/jobs"], ["pipelines:see"])} page="runs" />)).toContain("<h1>Jobs</h1>");
    // an address to the catalog on an engine without it opens the jobs
    expect(renderToStaticMarkup(<PipelinesPage caps={capsWith(["GET /api/jobs"], ["pipelines:see"])} page="catalog" />)).toContain("<h1>Jobs</h1>");
  });
});

describe("a pipeline's versions (Nima's ruling of 2026-10-12)", () => {
  // seg@1 is replaced by seg@2, which fixes it; seg@3 changes what it makes and replaces nothing, so seg@2 stays selectable
  const SEG1: Pipeline = { ...N4, id: 21, name: "seg", version: "1", label: "seg@1", description: "Segments, as the first did.", standing: "replaced", replaced_by: "seg@2", replaced_why: "the first missed small lesions" };
  const SEG2: Pipeline = { ...SEG1, id: 22, version: "2", label: "seg@2", description: "Segments small lesions too.", standing: "selectable", replaced_by: null, replaced_why: null };
  const SEG3: Pipeline = { ...SEG2, id: 23, version: "3", label: "seg@3", description: "Segments, with a bias field.", image: `ghcr.io/kineuro/seg@sha256:${"3c".repeat(32)}`, standing: "current" };
  const OLD: Pipeline = { ...N4, id: 30, name: "old", version: "1", label: "old@1", state: "retired", standing: "retired" };
  const RAN: Run = { ...RUN, id: 8, pipeline_id: 21, pipeline: "seg@1" };

  it("offers each name once, with the versions a new run may take, newest first", () => {
    const rows = catalogRows([N4, SEG1, SEG2, SEG3, OLD]);
    expect(rows.map((r) => [r.name, r.versions.map((v) => v.label)])).toEqual([
      ["n4", ["n4@1"]],
      ["seg", ["seg@3", "seg@2"]],
    ]);
    // an engine that says no standing: every version not retired, newest first
    expect(catalogRows([{ ...SEG1, standing: undefined }, { ...SEG2, standing: undefined }])[0].versions.map((v) => v.label)).toEqual(["seg@2", "seg@1"]);
  });
  it("draws one row a name with a plain select, the newest chosen, and names each run's own version", () => {
    const caps = capsWith(DOORS, ["pipelines:see", "pipelines:work"]);
    const html = renderToStaticMarkup(<CatalogBody caps={caps} pipelines={[N4, SEG1, SEG2, SEG3]} capability={ON} runs={[RAN]} onRun={() => undefined} />);
    expect(html).toContain("2 pipelines · podman");
    expect(html.match(/>Run on a selection<\/button>/gu)).toHaveLength(2);
    expect(html).toContain('aria-label="The version of seg"');
    expect(html).toMatch(/<option value="23" selected="">v3, newest<\/option><option value="22">v2<\/option><\/select>/u);
    expect(html).not.toContain('<option value="21"');
    // the row reads as the version chosen: its description and its image
    expect(html).toContain("Segments, with a bias field.");
    expect(html).not.toContain("Segments small lesions too.");
    expect(html).toContain("ghcr.io/kineuro/seg@sha256:3c3c3c3c3c3c");
    // a name with one version offered says it, with no select
    expect(html).not.toContain('aria-label="The version of n4"');
    expect(html).toContain('<span class="meta">v1</span>');
    // the runs keep the version they ran, a replaced one too
    expect(html).toContain("<td>seg@1</td>");
  });
  it("titles the run dialog and its command by the version chosen", () => {
    const html = renderToStaticMarkup(<RunDialog caps={capsWith(DOORS, ["pipelines:see", "pipelines:work"])} pipeline={SEG2} onClose={() => undefined} onDone={() => undefined} />);
    expect(html).toContain("Run seg@2");
    expect(runCommand({ pipeline: SEG2, over: { selection: "ms", version: 1 }, params: {}, models: [], labels: null })[1]).toBe("seg@2");
  });
  it("reads a plan that names a replaced version as the name's current one", () => {
    expect(pipelineOf([SEG1, SEG2, SEG3], "seg@1")?.label).toBe("seg@3");
    expect(pipelineOf([SEG1, SEG2, SEG3], "seg@2")?.label).toBe("seg@2");
    expect(pipelineOf([SEG1, SEG2, SEG3], "seg")?.label).toBe("seg@3");
  });
});
