// SPDX-License-Identifier: AGPL-3.0-only
// Pipelines / Catalog (record 45 S6): entries as the catalog door answers
// them, a run on a selection as the command line the jobs door queues, the
// parameters checked as the descriptor declares them, the runs counted, and
// no Run where the engine has no runtime, the person no work or the door no
// queue.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { capsWith } from "../review/caps.fixture";
import { CatalogBody, RunDialog } from "./Catalog";
import { catalogActs, imageWords, needsOf, paramError, runCommand, runCounts, writesWords, type Pipeline, type Run } from "./catalog";
import { PipelinesPage } from "./PipelinesPage";

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
    expect(html).toContain("Over the selection");
    expect(html).toContain("Model: head");
    expect(html).toContain("choose an admitted model");
    expect(html).toContain("proposals on body_part");
    expect(html).toMatch(/<button type="button" class="button" disabled="">Run<\/button>/u);
  });
  it("adds the Catalog page beside the jobs only where the engine serves the catalog", () => {
    const withCatalog = renderToStaticMarkup(<PipelinesPage caps={capsWith(DOORS, ["pipelines:see"])} />);
    expect(withCatalog).toContain('href="#pipelines/catalog"');
    const older = renderToStaticMarkup(<PipelinesPage caps={capsWith(["GET /api/jobs"], ["pipelines:see"])} />);
    expect(older).not.toContain("#pipelines/catalog");
    // an address to the catalog on an engine without it opens the jobs
    expect(renderToStaticMarkup(<PipelinesPage caps={capsWith(["GET /api/jobs"], ["pipelines:see"])} page="catalog" />)).toContain("<h1>Jobs</h1>");
  });
});
