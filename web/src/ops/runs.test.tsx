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
  allPassed,
  breachesByCheck,
  cannotOf,
  cellWords,
  checksOf,
  durationWords,
  failuresByReason,
  heldWords,
  groupBy,
  handleGone,
  measureColumns,
  mainReadOf,
  missingByWhy,
  pipelineOf,
  rulesWords,
  withoutByWhy,
  planSelectionName,
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
  unitTotals,
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
  layout: "bids",
  level: "session",
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
    // an engine from before `cannot`: its units missing an input folded by why, one line a reason with the units under it
    expect(html).toContain("<b class=\"num\">2</b> sessions cannot run: no flair picked<div class=\"meta cannot-units\">sub-1_ses-a, sub-2_ses-a</div>");
    expect(html).toContain("<b class=\"num\">1</b> session cannot run: no t1w picked</li>");
    expect(html).toContain("a unit needs 16 GB of memory and the lane allows 8");
  });
  it("says what a dataset's main scans resolve to, under which rules, and the visits that have none, by why", () => {
    const main = {
      main: "t1w",
      of: "main:t1w@dataset:study-anon",
      scope: { kind: "dataset", id: 3, name: "study-anon" },
      picks: { scope: { kind: "dataset", id: 3, name: "study-anon" }, version: 3, digest: "ab", run: 41 },
      read: "dataset study-anon's main scans under its own rules, version 3",
      visits: 140,
      main_visits: 128,
      stacks: 131,
      without: {
        visits: 12,
        why: [
          { why: "it holds no t1w scan", visits: 9 },
          { why: "it holds a t1w scan and none is picked", visits: 3 },
        ],
        named: [
          { subject_id: 4, subject: "a1b2c3", session_day: "2023-01-15", why: "it holds a t1w scan and none is picked" },
          { subject_id: 5, subject: "d4e5f6", session_day: "2022-04-01", why: "it holds no t1w scan" },
        ],
      },
    };
    const p: Preflight = { ...PRE, selection: main.of, stacks: 131, main };
    expect(mainReadOf(p)).toBe(main);
    expect(mainReadOf(PRE)).toBeNull();
    const cells = Object.fromEntries(preflightCells(p).map((c) => [c.k, c.v]));
    expect(cells["main T1w"]).toBe("131 scans of 128 visits");
    expect(cells["no main T1w"]).toBe("12 of 140 visits");
    expect(rulesWords(main)).toBe("its own rules, v3");
    expect(rulesWords({ ...main, picks: { scope: null, version: 1, defaults: true, pack: "mri" } })).toBe("the pack's rules");
    expect(withoutByWhy(main)).toEqual([
      { why: "it holds no t1w scan", count: 9, visits: ["d4e5f6 2022-04-01"] },
      { why: "it holds a t1w scan and none is picked", count: 3, visits: ["a1b2c3 2023-01-15"] },
    ]);
    const html = renderToStaticMarkup(<PreflightPanel p={p} />);
    expect(html).toContain("Dataset study-anon&#x27;s main scans under its own rules, version 3.");
    expect(html).toContain("<b class=\"num\">12</b> visits have no main T1w; the run goes over the 128 that have one.");
    expect(html).toContain("<b class=\"num\">9</b> it holds no t1w scan<span class=\"meta\"> · d4e5f6 2022-04-01 and 8 more</span>");
    // below detail quasi the engine names no visit: only the counts by why
    const plainP: Preflight = { ...p, main: { ...main, without: { ...main.without, named: main.without.named.map((v) => ({ why: v.why })) } } };
    const plainHtml = renderToStaticMarkup(<PreflightPanel p={plainP} />);
    expect(plainHtml).toContain("<b class=\"num\">3</b> it holds a t1w scan and none is picked</li>");
    expect(plainHtml).not.toContain("a1b2c3");
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
    expect(html).toContain('href="#review/questions?run=1"');
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
    expect(unitCounts(cancelled.units_run!, resumedAt)).toEqual({ running: 1, waiting: 1, done: 0, skipped: 0, failed: 0, kept: 1 });
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
  it("reads the engine's totals below detail quasi: counts by check and reason, a withheld count fewer than five, never none", () => {
    // as the engine answers a run below detail quasi (w49 e4d20ac)
    const held: RunDetail = {
      ...RUN,
      status: "partial",
      error: "withheld below detail quasi",
      unit_states: { over: 12 },
      units_run: [],
      summary: {
        detail: "totals",
        units: { total: 12, succeeded: null, failed: null, skipped: 0, unreported: 0 },
        numbers: { tables: { files: 10, rows: 10 }, measures: 20, checks: { declared: 2, breaches: null, unchecked: 0 } },
        breaches: [],
        breaches_by_check: [
          { check: "holes <= 200", metric: "holes", units: null, withheld: true },
          { check: "snr >= 8", metric: "snr", units: 6 },
        ],
        failures_by_reason: [{ reason: "failed", units: null, withheld: true }],
        withheld: ["numbers.checks.breaches", "units"],
        review_items: [1, 2],
      },
    };
    expect(checksOf(held)).toMatchObject({ declared: 2, breaches: null, totals: true, units: [] });
    expect(breachesByCheck(held)).toEqual([
      { check: "snr >= 8", units: 6 },
      { check: "holes <= 200", units: null },
    ]);
    expect(failuresByReason(held)).toEqual([{ reason: "failed", units: null }]);
    expect(unitTotals(held)).toEqual({ total: 12, succeeded: null, failed: null, over: 12 });
    expect(heldWords(null)).toBe("fewer than five");
    expect(allPassed(held)).toBe(false);
    // a withheld breach count with no check listed still never reads as all passed
    expect(allPassed({ ...held, summary: { ...held.summary, breaches_by_check: [] } })).toBe(false);
    expect(allPassed({ ...RUN, summary: { ...RUN.summary, breaches: [], numbers: { checks: { declared: 2, breaches: 0 } } } })).toBe(true);
    const html = draw(plain(), held, totals);
    expect(html).toContain("fewer than five breaches");
    expect(html).toContain("<td class=\"path\">holes &lt;= 200</td><td class=\"num\">fewer than five</td>");
    expect(html).toContain("<td class=\"num\">6</td>");
    expect(html).toContain("Failed, by reason");
    expect(html).toContain("12 of 12 over");
    expect(html).not.toContain("Every unit that finished passed");
    expect(html).not.toContain(">0<");
    expect(html).toContain("withheld below detail quasi");
    expect(html).toContain('href="#review/questions?run=1"');
    // review_items as the engine counts them since dd41d9a: a number, null where withheld
    expect(checksOf({ ...held, summary: { ...held.summary, review_items: null } }).items).toBeNull();
    expect(checksOf({ ...held, summary: { ...held.summary, review_items: 7 } }).items).toBe(7);
    expect(checksOf({ ...held, summary: { ...held.summary, review_items: 0 } }).items).toBe(0);
    expect(draw(plain(), { ...held, summary: { ...held.summary, review_items: null } }, totals)).toContain(">fewer than five review items</a>");
    expect(draw(plain(), { ...held, summary: { ...held.summary, review_items: 7 } }, totals)).toContain(">7 review items</a>");
    expect(draw(plain(), { ...held, summary: { ...held.summary, review_items: 0 } }, totals)).not.toContain("review item");
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
    // a plan may go straight over a dataset's main scans (record 55, 2026-10-12)
    expect(docOf({ station: "analysis-plan", result: { run_document: { pipeline: "volumes", select: "main:t1w@dataset:study-anon" } } }).over).toEqual({ main: { kind: "dataset", name: "study-anon", role: "t1w" } });
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
  it("says when the plan named a version a later one replaces, and runs the current one (2026-10-12)", () => {
    const caps = capsWith(DOORS, [...WORK]);
    const doc = { ...docOf(verdict), pipeline: "volumes@1" };
    const v2 = { ...VOLUMES, id: 9, version: "2", label: "volumes@2", standing: "current" as const };
    const html = renderToStaticMarkup(<PlanView caps={caps} doc={doc} pipeline={pipelineOf([{ ...VOLUMES, standing: "replaced" }, v2], doc.pipeline)} live={PRE} liveWhy={null} busy={false} said={null} onStart={() => undefined} />);
    expect(html).toContain("<b>volumes@2</b>");
    expect(html).toContain("The plan named volumes@1, which a later version replaces; it runs volumes@2.");
  });
  it("holds the button when the pre-flight is not ready, and offers none without the work grant", () => {
    const doc = docOf(verdict);
    const held = renderToStaticMarkup(<PlanView caps={capsWith(DOORS, [...WORK])} doc={doc} pipeline={VOLUMES} live={LESIONS} liveWhy={null} busy={false} said={null} onStart={() => undefined} />);
    expect(held).toMatch(/disabled="">.*Start this run/u);
    const reader = renderToStaticMarkup(<PlanView caps={capsWith(DOORS, ["pipelines:see"])} doc={doc} pipeline={VOLUMES} live={PRE} liveWhy={null} busy={false} said={null} onStart={null} />);
    expect(reader).not.toContain("Start this run");
    expect(reader).toContain("Starting a run needs Pipelines: Work");
  });
  it("says when the engine's words mean the plan's handle is gone, and names a selection for it", () => {
    expect(handleGone("no handle 41")).toBe(true);
    expect(handleGone("handle 41 keeps no complete list of stacks; run its question again")).toBe(true);
    expect(handleGone("no pipeline volumes@9 in the catalog")).toBe(false);
    expect(handleGone(null)).toBe(false);
    expect(planSelectionName("Brain volume in every scan?", new Date("2026-09-24T10:00:00Z"))).toBe("brain-volume-in-every-scan-2026-09-24");
    expect(planSelectionName(null, new Date("2026-09-24T10:00:00Z"))).toBe("plan-2026-09-24");
  });
  it("offers to save the proposed ask as a selection when the handle is gone, and holds Start until a fresh pre-flight", () => {
    const withHandle = { station: "analysis-plan", result: { run_document: { pipeline: "volumes", handle: 41, params: {}, preflight: PRE, proposed: { document: 88, cohorts: ["ms"], sessions: "all" }, question: "brain volume in every scan" } } };
    const doc = docOf(withHandle);
    expect(doc.proposed).toBe(88);
    const caps = capsWith([...DOORS, "PUT /api/ask/selections/{name}"], [...WORK]);
    const gone = renderToStaticMarkup(<PlanView caps={caps} doc={doc} pipeline={VOLUMES} live={null} liveWhy="no handle 41" busy={false} said={null} onStart={() => undefined} gone onSave={() => undefined} />);
    expect(gone).toContain("no longer kept");
    expect(gone).toContain(">Save as a selection</button>");
    expect(gone).toContain('value="brain-volume-in-every-scan-');
    expect(gone).toMatch(/disabled="">.*Start this run/u);
    // saved: the run goes over the selection, and waits for its own pre-flight
    const saved = { selection: "brain-volume-in-every-scan-2026-09-24", version: 1 };
    const waiting = renderToStaticMarkup(<PlanView caps={caps} doc={doc} over={saved} pipeline={VOLUMES} live={null} liveWhy={null} busy={false} said={null} onStart={() => undefined} />);
    expect(waiting).toContain("selection:brain-volume-in-every-scan-2026-09-24@1");
    expect(waiting).not.toContain("12 of 12 ready");
    expect(waiting).toMatch(/disabled="">.*Start this run/u);
    const fresh = renderToStaticMarkup(<PlanView caps={caps} doc={doc} over={saved} pipeline={VOLUMES} live={PRE} liveWhy={null} busy={false} said={null} onStart={() => undefined} />);
    expect(fresh).not.toMatch(/disabled="">.*Start this run/u);
    // no save where the person may not save a selection, or the engine has no door
    const reader = renderToStaticMarkup(<PlanView caps={capsWith(DOORS, [...WORK])} doc={doc} pipeline={VOLUMES} live={null} liveWhy="no handle 41" busy={false} said={null} onStart={() => undefined} gone onSave={null} />);
    expect(reader).not.toContain("Save as a selection</button>");
    expect(reader).toContain("Saving it as a selection needs Ask: Work at detail quasi.");
    expect(runActs(capsWith(DOORS, [...WORK])).save).toBe(false);
    expect(runActs(caps).save).toBe(true);
  });
  it("is offered only where the assistant serves the analysis-plan station", () => {
    const caps = capsWith(DOORS, [...WORK]);
    expect(plansOffered(caps)).toBe(false);
    expect(plansOffered({ ...caps, assistant: { stations: [{ id: "analysis-plan" }] } })).toBe(true);
    expect(renderToStaticMarkup(<PipelinesPage caps={caps} page="plan" arg="r1" />)).toContain("<h1>Jobs</h1>");
  });
});

describe("what cannot run, and what a run made (2026-10-12)", () => {
  const SESSIONS = ["sub-7a8b9c0d_ses-1", "sub-1e2f3a4b_ses-1", "sub-5c6d7e8f_ses-2", "sub-9d0e1f2a_ses-1"];
  const T1_ONLY: Preflight = {
    ...PRE,
    pipeline: "samseg-lesions@1",
    layout: "bids",
    level: "session",
    unit: "session",
    stacks: 4,
    units: { total: 4, ready: 0, missing: 4 },
    missing: SESSIONS.map((unit) => ({ unit, why: ["no flair is picked for it among the selection's stacks"], lacks: ["no FLAIR picked"] })),
    cannot: [{ why: "no FLAIR picked", units: 4, named: SESSIONS }],
    ready: false,
    blockers: ["no session can run: 4 of 4 lack an input (no FLAIR picked)"],
  };
  it("the pre-flight names the sessions that cannot run, one line a reason with the sessions under it, and holds Run", () => {
    expect(cannotOf(T1_ONLY)).toEqual([{ why: "no FLAIR picked", count: 4, units: SESSIONS }]);
    expect(preflightGate(T1_ONLY)).toEqual({ go: false, why: "no session can run: 4 of 4 lack an input (no FLAIR picked)" });
    const html = renderToStaticMarkup(<PreflightPanel p={T1_ONLY} />);
    expect(html).toContain("Not ready");
    expect(html).toContain(`<b class="num">4</b> sessions cannot run: no FLAIR picked<div class="meta cannot-units">${SESSIONS.join(", ")}</div>`);
    expect(html).toContain("no session can run: 4 of 4 lack an input (no FLAIR picked)");
    // below detail quasi the engine names no session: the count and the reason
    const plainP: Preflight = { ...T1_ONLY, cannot: [{ why: "no FLAIR picked", units: 4, named: [] }] };
    const flat = renderToStaticMarkup(<PreflightPanel p={plainP} />);
    expect(flat).toContain('<b class="num">4</b> sessions cannot run: no FLAIR picked</li>');
    expect(flat).not.toContain("sub-");
  });
  it("says so plainly where every session can run, and how many a run taken up again keeps", () => {
    const all: Preflight = { ...T1_ONLY, units: { total: 4, ready: 4, missing: 0 }, missing: [], cannot: [], ready: true, blockers: [] };
    expect(renderToStaticMarkup(<PreflightPanel p={all} />)).toContain("All 4 sessions can run.");
    expect(renderToStaticMarkup(<PreflightPanel p={{ ...all, units: { total: 1, ready: 1, missing: 0 } }} />)).toContain("The one session can run.");
    const again: Preflight = { ...all, units: { total: 2, ready: 2, missing: 0 }, resume: { run: 14, status: "cancelled", job: 51, kept: 2, made: 2 } };
    expect(renderToStaticMarkup(<PreflightPanel p={again} />)).toContain("2 sessions over before are kept (2 made).");
  });
  const skipped = (u: string) => ({ unit: u, state: "over", status: "skipped", attempts: 0, device: null, exit_code: null, started_at: null, finished_at: "2026-10-12T10:23:56Z", error: "missing an input: no flair is picked for it among the selection's stacks", lacks: ["no FLAIR picked"] });
  const NOTHING: RunDetail = {
    ...RUN,
    id: 1,
    pipeline: "samseg-lesions@1",
    status: "done",
    selection: "selection:t1-3d-stacks@1",
    units_run: SESSIONS.map(skipped),
    summary: { units: { total: 4, succeeded: 0, failed: 0, skipped: 4, unreported: 0, missing_input: 4 }, numbers: { checks: { declared: 2, breaches: 0 } }, breaches: [], review_items: [] },
    made: { units: 4, made: 0, failed: 0, skipped: 4, left: 0, nothing: true, line: "nothing made · 4 of 4 skipped: no FLAIR picked", why: [{ status: "skipped", why: "no FLAIR picked", units: 4 }] },
  };
  it("a run's page reads as its units summed, each unit says its own status, and a run that made nothing says why", () => {
    expect(unitTone(NOTHING.units_run![0], null)).toBe("skipped");
    const html = renderToStaticMarkup(<RunView caps={capsWith(DOORS, [...WORK])} run={NOTHING} pipeline={VOLUMES} resumedAt={null} jobAlive={false} table={{ kind: "off", why: null }} files={null} by="subject.sex" onBy={() => undefined} said={null} onCancel={null} onResume={null} />);
    expect(html).toContain('<span class="tag caution">nothing made</span><b>samseg-lesions@1</b>');
    expect(html).not.toContain(">done</span>");
    expect(html).toContain('<p class="note-lead">Nothing made</p>');
    expect(html).toContain(`<b class="num">4</b> skipped: no FLAIR picked<div class="meta cannot-units">${SESSIONS.join(", ")}</div>`);
    expect(html.match(/<span class="tag caution">skipped<\/span>/gu)).toHaveLength(4);
    expect(html.match(/<span class="made-words" title="missing an input: no flair is picked for it among the selection&#x27;s stacks">no FLAIR picked<\/span>/gu)).toHaveLength(4);
    expect(html).toContain("4 skipped");
    expect(html).not.toContain("Every unit that finished passed its checks.");
    // a run that made all it was for is ok, with no note
    const all: RunDetail = { ...RUN, made: { units: 3, made: 3, failed: 0, skipped: 0, left: 0, nothing: false, line: "3 of 3 made", why: [] } };
    const fine = renderToStaticMarkup(<RunView caps={capsWith(DOORS, [...WORK])} run={all} pipeline={VOLUMES} resumedAt={null} jobAlive={false} table={{ kind: "off", why: null }} files={null} by="subject.sex" onBy={() => undefined} said={null} onCancel={null} onResume={null} />);
    expect(fine).toContain('<span class="tag ok">3 of 3 made</span>');
    expect(fine).not.toContain("made-note");
  });
  it("the Runs table carries each run's units summed on its tag, and the rest on one line under its row", () => {
    const row = (id: number, made: unknown, status = "done") => ({ id, pipeline_id: 1, pipeline: "samseg-lesions@1", job_id: 40 + id, selection: "selection:t1-3d-stacks@1", status, started_at: null, finished_at: null, made });
    const html = renderToStaticMarkup(
      <CatalogBody
        caps={capsWith(DOORS, ["pipelines:see"])}
        pipelines={[VOLUMES]}
        capability={{ enabled: true }}
        runs={[row(1, NOTHING.made), row(2, { units: 4, made: 3, failed: 0, skipped: 1, left: 0, nothing: false, line: null, why: [{ status: "skipped", why: "no FLAIR picked", units: 1 }] }), row(3, { units: 4, made: 4, failed: 0, skipped: 0, left: 0, nothing: false, line: null, why: [] })]}
        onRun={() => undefined}
      />,
    );
    expect(html).toContain('<span class="tag caution">nothing made</span>');
    expect(html).toContain('<span class="made-words" title="4 of 4 skipped: no FLAIR picked">4 of 4 skipped: no FLAIR picked</span>');
    expect(html).toContain('<span class="tag caution">3 of 4 made</span>');
    expect(html).toContain(">1 skipped: no FLAIR picked</span>");
    expect(html).toContain('<span class="tag ok">4 of 4 made</span>');
    expect(html.match(/made-row/gu)).toHaveLength(2);
    expect(html).not.toContain(">done</span>");
  });
});

describe("a dataset's main scans of every role a pipeline needs (2026-10-12)", () => {
  const MAIN = {
    main: "t1w+flair",
    roles: ["t1w", "flair"],
    of: "main@dataset:study-anon",
    scope: { kind: "dataset", id: 3, name: "study-anon" },
    picks: { scope: null, version: 1, defaults: true, pack: "mri" },
    read: "the pack's main scans of dataset study-anon",
    visits: 3,
    main_visits: 2,
    stacks: 4,
    without: {
      visits: 1,
      why: [{ role: "flair", why: "it holds no flair scan", visits: 1 }],
      named: [{ subject_id: 4, subject: "a1b2c3", session_day: "2022-03-01", role: "flair", why: "it holds no flair scan" }],
    },
    by_role: [
      { main: "t1w", main_visits: 3, stacks: 2, without: { visits: 0 } },
      { main: "flair", main_visits: 2, stacks: 2, without: { visits: 1 } },
    ],
  };
  it("the pre-flight says the roles, the visits with each, and the visits that lack one by role and why", () => {
    const p: Preflight = { ...PRE, pipeline: "samseg-lesions@1", selection: MAIN.of, stacks: 4, main: MAIN, units: { total: 2, ready: 2, missing: 0 } };
    expect(mainReadOf(p)).toBe(MAIN);
    const cells = Object.fromEntries(preflightCells(p).map((c) => [c.k, c.v]));
    expect(cells["main T1w + FLAIR"]).toBe("4 scans of 2 visits");
    expect(cells["lacking a role"]).toBe("1 of 3 visits");
    const html = renderToStaticMarkup(<PreflightPanel p={p} />);
    expect(html).toContain('<b class="num">1</b> visit lacks a main FLAIR; the run goes over the 2 that have both.');
    expect(html).toContain('<b class="num">1</b> it holds no flair scan<span class="meta"> · a1b2c3 2022-03-01</span>');
    // one role, as before
    const one = { ...MAIN, main: "t1w", roles: undefined, by_role: undefined, without: { visits: 1, why: [{ why: "it holds no t1w scan", visits: 1 }] } };
    expect(renderToStaticMarkup(<PreflightPanel p={{ ...p, main: one }} />)).toContain('<b class="num">1</b> visit has no main T1w; the run goes over the 2 that have one.');
  });
  it("the Runs table names the roles of a run over every role its pipeline needs", () => {
    const LESIONS_PIPE = { ...VOLUMES, id: 9, name: "samseg-lesions", label: "samseg-lesions@1", roles: ["t1w", "flair"] };
    const row = { id: 3, pipeline_id: 9, pipeline: "samseg-lesions@1", job_id: 40, selection: "main@dataset:study-anon", status: "running", started_at: null, finished_at: null };
    const html = renderToStaticMarkup(<CatalogBody caps={capsWith(DOORS, ["pipelines:see"])} pipelines={[LESIONS_PIPE]} capability={{ enabled: true }} runs={[row]} onRun={() => undefined} />);
    expect(html).toContain("study-anon · main T1w + FLAIR");
  });
  it("a run's page names the roles it went over", () => {
    const run: RunDetail = { ...RUN, selection: MAIN.of, main: MAIN };
    const html = renderToStaticMarkup(<RunView caps={capsWith(DOORS, [...WORK])} run={run} pipeline={VOLUMES} resumedAt={null} jobAlive={false} table={{ kind: "off", why: null }} files={null} by="subject.sex" onBy={() => undefined} said={null} onCancel={null} onResume={null} />);
    expect(html).toContain("study-anon · main T1w + FLAIR");
  });
});
