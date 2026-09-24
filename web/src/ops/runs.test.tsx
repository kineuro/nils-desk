// SPDX-License-Identifier: AGPL-3.0-only
// Record 49 A7: the pre-flight before Run, a run's page (units, resume and
// cancel, the table per scan at quasi and as group totals below it, checks
// and breaches with their review items, files), and the assistant's plan
// shown as a run a person starts. The shapes are the engine's own answers
// (origin/w49), taken from a throwaway engine.

import { renderToStaticMarkup } from "react-dom/server";
import type { Capabilities } from "../capabilities";
import { describe, expect, it } from "vitest";
import { capsWith } from "../review/caps.fixture";
import { ofRun } from "../review/Queue";
import type { ReviewItem } from "./client";
import type { Pipeline } from "./catalog";
import { CatalogBody } from "./Catalog";
import { PipelinesPage } from "./PipelinesPage";
import { PlanView, plansOffered } from "./PlanPage";
import { PreflightPanel } from "./Preflight";
import { RunView, type Table } from "./RunPage";
import {
  breachesByCheck,
  cellWords,
  checksOf,
  durationWords,
  groupBy,
  measureColumns,
  missingByWhy,
  pipelineOf,
  preflightCells,
  preflightGate,
  rangeWords,
  resumable,
  resumeCommand,
  runActs,
  runDocumentOf,
  shownColumns,
  tableAsk,
  unitCounts,
  unitTone,
  type Preflight,
  type RunDetail,
} from "./runs";

const VOLUMES: Pipeline & { checks: string[] } = {
  id: 1,
  name: "volumes",
  version: "1",
  label: "volumes@1",
  image: `example.org/volumes@sha256:${"c".repeat(64)}`,
  layout: "stacks",
  level: "stack",
  state: "active",
  parameters: [
    { id: "low", name: "The stack whose SNR is low", type: "Number", "default-value": 0, integer: true },
    { id: "scale", name: "What each volume is multiplied by", type: "Number", "default-value": 1000, minimum: 1, maximum: 5000 },
  ],
  outputs: [{ id: "volumes", kind: "table", columns: [{ name: "brain_volume", unit: "mm3" }, { name: "site", type: "text" }] } as never],
  checks: ["snr >= 8", "brain_volume <= 100000000"],
};

const PRE: Preflight = {
  pipeline: "volumes@1",
  pipeline_id: 1,
  handle: 1,
  selection: "selection:every@1",
  params: { low: 3, scale: 1000 },
  layout: "stacks",
  level: "stack",
  stacks: 12,
  units: { total: 12, ready: 12, missing: 0 },
  missing: [],
  roles: [],
  left_out: { stacks: 0, why: null },
  estimate: { seconds_per_unit: 60, source: "descriptor", runs: 0, slots: 1, units_apart: false, seconds: 720 },
  gpu: { need: "none", available: null, device: "cpu" },
  needs: { cores: 1, memory_gb: 2 },
  budget: { cores: 32, memory_gb: 30.234375, why: "32 cores, since this machine offers 32 of the 48 set", fits: true },
  checks: ["snr >= 8"],
  runtime: { name: "podman", version: "9.9.9-test" },
  place: "scratch",
  ready: true,
  blockers: [],
};

const LESIONS: Preflight = {
  ...PRE,
  pipeline: "samseg-lesions@1",
  units: { total: 6, ready: 3, missing: 3 },
  missing: [
    { unit: "sub-1_ses-a", why: "no flair picked" },
    { unit: "sub-2_ses-a", why: "no flair picked" },
    { unit: null, why: "no t1w picked" },
  ],
  left_out: { stacks: 2, why: "no pick takes them" },
  gpu: { need: "optional", available: false, device: "cpu" },
  budget: { cores: 4, memory_gb: 8, fits: false },
  ready: false,
  blockers: ["a unit needs 16 GB of memory and the lane allows 8"],
};

const unit = (u: string, state: string, status: string | null, finished: string | null, attempts = 1) => ({ unit: u, state, status, attempts, device: "cpu", exit_code: status === "failed" ? 3 : 0, started_at: "2026-09-24T19:39:40Z", finished_at: finished });

const RUN: RunDetail = {
  id: 1,
  pipeline_id: 1,
  pipeline: "volumes@1",
  job_id: 7,
  handle_id: 1,
  selection: "selection:every@1",
  runtime: "podman",
  device: "cpu",
  status: "done",
  started_at: "2026-09-24T19:39:40Z",
  finished_at: "2026-09-24T19:39:48Z",
  results_digest: "ab",
  units: "together",
  resumes: null,
  units_run: [unit("stack-1", "over", "succeeded", "2026-09-24T19:39:47Z"), unit("stack-2", "over", "succeeded", "2026-09-24T19:39:47Z"), unit("stack-3", "over", "succeeded", "2026-09-24T19:39:47Z")],
  summary: {
    units: { total: 3, succeeded: 3, failed: 0 },
    numbers: { tables: { files: 3, rows: 3 }, measures: 9, checks: { declared: 2, breaches: 1, unchecked: 0 } },
    breaches: [{ unit: "stack-3", breaches: [{ metric: "snr", value: 3.5, check: "snr >= 8", op: ">=", threshold: 8, description: null }] }],
    review_items: [1],
  },
};

const DOORS = ["GET /api/pipelines", "GET /api/pipeline-runs", "GET /api/pipeline-runs/{id}", "POST /api/pipelines/{name}/preflight", "POST /api/jobs", "POST /api/jobs/{id}/cancel", "GET /api/jobs", "GET /api/review", "POST /api/ask/run", "GET /api/derivatives"];
const WORK = ["pipelines:see", "pipelines:work", "query:work", "review:see"] as const;
const plain = (doors = DOORS): Capabilities => {
  const c = capsWith(doors, [...WORK]);
  return { ...c, person: { ...c.person, detail: "plain" } };
};

describe("the pre-flight", () => {
  it("reads as the values a person weighs before Run", () => {
    const cells = Object.fromEntries(preflightCells(PRE).map((c) => [c.k, c.v]));
    expect(cells).toEqual({ units: "12 of 12 ready", time: "about 12 min", GPU: "none", budget: "32 cores, 30 GB" });
    expect(preflightGate(PRE)).toEqual({ go: true, why: null });
    expect(durationWords(30)).toBe("under a minute");
    expect(durationWords(3 * 3600)).toBe("about 3 h");
  });
  it("folds the units that lack an input by why, and holds Run on the engine's blockers", () => {
    expect(missingByWhy(LESIONS)).toEqual([
      { why: "no flair picked", count: 2, units: ["sub-1_ses-a", "sub-2_ses-a"] },
      { why: "no t1w picked", count: 1, units: [] },
    ]);
    const cells = Object.fromEntries(preflightCells(LESIONS).map((c) => [c.k, c.v]));
    expect(cells["missing an input"]).toBe("3");
    expect(cells["stacks left out"]).toBe("2");
    expect(cells.GPU).toBe("optional, runs on the CPU");
    expect(cells.budget).toBe("does not fit");
    expect(preflightGate(LESIONS)).toEqual({ go: false, why: "a unit needs 16 GB of memory and the lane allows 8" });
    const html = renderToStaticMarkup(<PreflightPanel p={LESIONS} />);
    expect(html).toContain("Not ready");
    expect(html).toContain("<b class=\"num\">2</b> no flair picked");
    expect(html).toContain("sub-1_ses-a, sub-2_ses-a");
    expect(html).toContain("a unit needs 16 GB of memory and the lane allows 8");
  });
  it("says each parameter's range from the descriptor", () => {
    expect(rangeWords(VOLUMES.parameters![1])).toBe("1 to 5000");
    expect(rangeWords(VOLUMES.parameters![0])).toBe("a whole number");
    expect(rangeWords({ id: "e", name: "E", type: "String", "value-choices": ["rf", "svm"] })).toBe("one of rf, svm");
  });
});

describe("a run's table", () => {
  const cols = measureColumns(VOLUMES);
  it("names the measures the ask reads: the table's columns and each check's metric", () => {
    expect(cols.map((c) => [c.field, c.numeric])).toEqual([
      ["measure.volumes.brain_volume", true],
      ["measure.volumes.site", false],
      ["measure.volumes.snr", true],
    ]);
  });
  it("asks per scan at detail quasi, the rows this run measured", () => {
    const doc = tableAsk({ pipeline: "volumes", level: "stack", run: 1, columns: cols, perScan: true, by: "subject.sex" });
    expect(doc).toEqual({
      ast_version: 1,
      sets: { s: { grain: "stack", where: [["=", {}, ["field", {}, "measure.volumes.run"], 1]] } },
      out: { set: "s", level: "record", columns: [["field", {}, "id"], ["field", {}, "measure.volumes.brain_volume"], ["field", {}, "measure.volumes.site"], ["field", {}, "measure.volumes.snr"]], order: [[["field", {}, "id"], "asc"]] },
    });
  });
  it("asks below quasi only totals of a group set, never a scan's value, and no measure as the key", () => {
    const doc = tableAsk({ pipeline: "volumes", level: "session", run: 1, columns: cols, perScan: false, by: "subject.sex" }) as { sets: Record<string, Record<string, unknown>>; out: Record<string, unknown> };
    expect(doc.sets.s.grain).toBe("session");
    expect(doc.sets.g.group).toEqual({ of: "s", by: [["field", {}, "subject.sex"]] });
    expect(doc.sets.g.bind).toEqual({ scans: ["count", { set: "s" }], mean_brain_volume: ["avg", { set: "s" }, ["field", {}, "measure.volumes.brain_volume"]], mean_snr: ["avg", { set: "s" }, ["field", {}, "measure.volumes.snr"]] });
    expect(doc.out).toEqual({ set: "g", level: "aggregate", columns: [["field", {}, "subject.sex"], ["field", {}, "scans"], ["field", {}, "mean_brain_volume"], ["field", {}, "mean_snr"]] });
    expect(JSON.stringify(doc.out)).not.toContain("measure.");
    expect(groupBy("stack").map((g) => g.field)).toEqual(["subject.sex", "manufacturer", "field_strength_tesla"]);
    expect(groupBy("session").map((g) => g.field)).toEqual(["subject.sex"]);
  });
  it("shows a withheld total as withheld and leaves the engine's keys out", () => {
    expect(cellWords(null)).toBe("withheld");
    expect(cellWords(6333.333333333)).toBe("6,333");
    expect(shownColumns(["_key", "_subject", "subject.sex", "scans"]).map((c) => c.at)).toEqual([2, 3]);
  });
});

describe("a run's page", () => {
  const perScan: Table = { kind: "ready", perScan: true, columns: ["_key", "_subject", "id", "measure.volumes.brain_volume", "measure.volumes.site", "measure.volumes.snr"], rows: [[1, 1, 1, 1000, "lab", 20], [2, 4, 3, 3000, "lab", 3.5]], truncated: false };
  const totals: Table = { kind: "ready", perScan: false, columns: ["_key", "_subject", "subject.sex", "scans", "mean_brain_volume"], rows: [[1, null, "F", 6, 6333.333333333], [2, null, "M", null, null]], truncated: false };
  const draw = (caps: Capabilities, run: RunDetail, table: Table, extra: Partial<Parameters<typeof RunView>[0]> = {}) =>
    renderToStaticMarkup(<RunView caps={caps} run={run} pipeline={VOLUMES} resumedAt={null} jobAlive={false} table={table} files={null} by="subject.sex" onBy={() => undefined} said={null} onCancel={null} onResume={null} {...extra} />);

  it("draws the table per scan at detail quasi, the checks with the unit and value, and the way to the review items", () => {
    const html = draw(capsWith(DOORS, [...WORK]), RUN, perScan);
    expect(html).toContain("<th>brain volume</th>");
    expect(html).not.toContain("_subject");
    expect(html).toContain("3,000");
    expect(html).toContain("2 declared · 1 breach");
    expect(html).toContain("stack-3 (3.5)");
    expect(html).toContain('href="#review?run=1"');
    expect(html).toContain("3 done");
    expect(html).not.toContain("Totals by");
  });
  it("draws below quasi only group totals, the k = 5 note, and breaches without a unit or a value", () => {
    const html = draw(plain(), RUN, totals);
    expect(html).toContain("Totals by");
    expect(html).toContain("k = 5");
    expect(html).toContain("withheld");
    expect(html).toContain("snr &gt;= 8");
    expect(html).not.toContain("stack-3 (3.5)");
    expect(html).not.toContain("<th>Which</th>");
  });
  it("offers resume on a cancelled run, says which units were kept, and cancel while its job lives", () => {
    const cancelled: RunDetail = {
      ...RUN,
      status: "cancelled",
      results_digest: null,
      resumes: 1,
      units_run: [unit("stack-1", "over", "succeeded", "2026-09-24T19:39:47Z"), unit("stack-2", "running", null, null, 2), unit("stack-3", "queued", null, null, 0)],
    };
    const resumedAt = "2026-09-24T19:40:00Z";
    expect(unitTone(cancelled.units_run![0], resumedAt)).toBe("kept");
    expect(unitCounts(cancelled.units_run!, resumedAt)).toEqual({ running: 1, waiting: 1, done: 0, failed: 0, kept: 1 });
    expect(resumable(cancelled, false)).toBe(true);
    expect(resumable(RUN, false)).toBe(false);
    expect(resumable({ ...RUN, status: "failed", results_digest: "x" }, false)).toBe(false);
    expect(resumable({ ...RUN, status: "running" }, true)).toBe(false);
    expect(resumeCommand(cancelled)).toEqual(["run", "--resume", "1"]);
    const html = draw(capsWith(DOORS, [...WORK]), cancelled, { kind: "off", why: null }, { resumedAt, onResume: () => undefined, onCancel: () => undefined });
    expect(html).toContain(">Resume</button>");
    expect(html).toContain(">Cancel</button>");
    expect(html).toContain("kept on resume");
    expect(html).toContain("taken up 1 time");
  });
  it("counts the breaches by check from the run's summary", () => {
    expect(checksOf(RUN)).toMatchObject({ declared: 2, breaches: 1, unchecked: 0, items: 1 });
    expect(breachesByCheck(RUN)).toEqual([{ check: "snr >= 8", units: 1 }]);
  });
  it("links no review items without Review, and offers nothing an engine without the doors lacks", () => {
    const caps = capsWith(DOORS.filter((d) => d !== "GET /api/review"), ["pipelines:see", "query:work"]);
    const html = draw(caps, RUN, perScan);
    expect(html).not.toContain("#review");
    const acts = runActs(capsWith(["GET /api/pipelines"], ["pipelines:see", "pipelines:work"]));
    expect(acts).toMatchObject({ preflight: false, open: false, queue: false, cancel: false, table: false, files: false });
  });
  it("opens from a run's number in the catalog only where the engine serves one run", () => {
    const row = { id: 1, pipeline_id: 1, pipeline: "volumes@1", job_id: 7, selection: "selection:every@1", status: "done", started_at: null, finished_at: null };
    const on = renderToStaticMarkup(<CatalogBody caps={capsWith(DOORS, ["pipelines:see"])} pipelines={[VOLUMES]} capability={{ enabled: true }} runs={[row]} onRun={() => undefined} />);
    expect(on).toContain('<a href="#pipelines/runs/1">1</a>');
    const off = renderToStaticMarkup(<CatalogBody caps={capsWith(["GET /api/pipelines", "GET /api/pipeline-runs"], ["pipelines:see"])} pipelines={[VOLUMES]} capability={{ enabled: true }} runs={[row]} onRun={() => undefined} />);
    expect(off).not.toContain("#pipelines/runs/");
    // an address to a run on an engine without the door opens the jobs
    expect(renderToStaticMarkup(<PipelinesPage caps={capsWith(["GET /api/jobs", "GET /api/pipelines"], ["pipelines:see"])} page="runs" arg="1" />)).toContain("<h1>Jobs</h1>");
  });
  it("narrows the review queue to one run's items", () => {
    const items = [{ id: 1, kind: "pipeline:qc", ref: { run_id: 1 } }, { id: 2, kind: "pipeline:qc", ref: { run_id: 2 } }, { id: 3, kind: "classify.unsure", ref: {} }] as unknown as ReviewItem[];
    expect(ofRun(items, 1).map((i) => i.id)).toEqual([1]);
    expect(ofRun(items, null)).toHaveLength(3);
  });
});

describe("the assistant's plan", () => {
  const result = {
    run_document: { pipeline: "volumes", select: "selection:every@1", params: { low: 3 }, preflight: PRE, why: "Brain volume per scan is what the question asks; SNR is checked." },
    question: "brain volume in every scan",
  };
  const verdict = { station: "analysis-plan", result };
  const docOf = (v: Parameters<typeof runDocumentOf>[0]) => {
    const r = runDocumentOf(v);
    if ("refused" in r) throw new Error(r.refused);
    return r.doc;
  };
  it("reads the run document from an analysis-plan verdict's run_document", () => {
    const doc = docOf(verdict);
    expect(doc.over).toEqual({ selection: "every", version: 1 });
    expect(doc.params).toEqual({ low: "3" });
    expect(doc.preflight?.units.total).toBe(12);
    expect(doc.question).toBe("brain volume in every scan");
    expect(docOf({ station: "analysis-plan", result: { run_document: { pipeline: "volumes@1", handle: 4, params: ["low=2"] } } })).toMatchObject({ over: { handle: 4 }, params: { low: "2" } });
  });
  it("refuses another station's verdict, and any shape but run_document", () => {
    expect(runDocumentOf({ station: "ask-help", result })).toEqual({ refused: "this is not a plan: the run is of the ask-help station, not analysis-plan" });
    expect(runDocumentOf({ result })).toMatchObject({ refused: expect.stringContaining("unnamed station") });
    expect(runDocumentOf({ station: "analysis-plan", result: { document: result.run_document } })).toEqual({ refused: "the plan holds no run document" });
    expect(runDocumentOf({ station: "analysis-plan", result: result.run_document })).toEqual({ refused: "the plan holds no run document" });
    expect(runDocumentOf({ station: "analysis-plan", result: { run_document: { pipeline: "volumes" } } })).toEqual({ refused: "the run document names no selection or handle" });
    expect(runDocumentOf(null)).toEqual({ refused: "the station's run left no verdict" });
  });
  it("finds the plan's pipeline in the catalog", () => {
    expect(pipelineOf([VOLUMES, { ...VOLUMES, id: 9, version: "2", label: "volumes@2" }], "volumes")?.label).toBe("volumes@2");
  });
  it("draws the plan filled in with its pre-flight and one button to start it", () => {
    const caps = capsWith(DOORS, [...WORK]);
    const html = renderToStaticMarkup(<PlanView caps={caps} doc={docOf(verdict)} pipeline={VOLUMES} live={PRE} liveWhy={null} busy={false} said={null} onStart={() => undefined} />);
    expect(html).toContain("brain volume in every scan");
    expect(html).toContain("Brain volume per scan is what the question asks");
    expect(html).toContain("selection:every@1");
    expect(html).toContain("12 of 12 ready");
    expect(html.match(/Start this run<\/button>/gu)).toHaveLength(1);
    expect(html).not.toMatch(/disabled="">.*Start this run/u);
  });
  it("holds the button when the pre-flight is not ready, and offers none without the work grant", () => {
    const doc = docOf(verdict);
    const held = renderToStaticMarkup(<PlanView caps={capsWith(DOORS, [...WORK])} doc={doc} pipeline={VOLUMES} live={LESIONS} liveWhy={null} busy={false} said={null} onStart={() => undefined} />);
    expect(held).toMatch(/disabled="">.*Start this run/u);
    const reader = renderToStaticMarkup(<PlanView caps={capsWith(DOORS, ["pipelines:see"])} doc={doc} pipeline={VOLUMES} live={PRE} liveWhy={null} busy={false} said={null} onStart={null} />);
    expect(reader).not.toContain("Start this run");
    expect(reader).toContain("Starting a run needs Pipelines: Work");
  });
  it("is offered only where the assistant serves the analysis-plan station", () => {
    const caps = capsWith(DOORS, [...WORK]);
    expect(plansOffered(caps)).toBe(false);
    expect(plansOffered({ ...caps, assistant: { stations: [{ id: "analysis-plan" }] } })).toBe(true);
    expect(renderToStaticMarkup(<PipelinesPage caps={caps} page="plan" arg="r1" />)).toContain("<h1>Jobs</h1>");
  });
});
