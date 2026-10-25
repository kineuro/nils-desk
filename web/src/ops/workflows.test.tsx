// SPDX-License-Identifier: AGPL-3.0-only
// The Pipelines page without tabs, a workflow's plan, a workflow run, a run
// unit's notes and the provenance panel (Wave 7b sections 8.1 and 8.3 to
// 8.6), drawn from fixtures: the page's rows (a family one row that opens to
// its members, the workflows, the runs together, newest first), every
// verdict of a plan with its words and the step pre-flights, `runnable`
// deciding Start, a workflow run's sums and its steps' runs linked, the unit
// chips (the member and rule, reused from run N, judged as it started against
// its forecast, inputs fed by no step, why nothing was reused, the curation
// state in the caution colour where stale), and the provenance panel with
// its withheld count said plainly; and where the old addresses lead.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { capsWith } from "../review/caps.fixture";
import { moved, parse } from "../routes";
import { sections } from "../sections";
import { CatalogBody } from "./Catalog";
import { PipelinesPage } from "./PipelinesPage";
import { filesWords, ProvenanceView } from "./Provenance";
import { UnitPack } from "./RunPage";
import { packWords } from "./pack";
import { PlanLine, StepPreflight, WorkflowRunView, WorkflowSteps, overOfQuery } from "./Workflows";
import { curationTone, familyLastRun, forecastDiffers, linkWords, pageRows, planBody, provenanceOf, runSums, runsTogether, scanProvenance, stepOf, stepPreflight, stepsLine, typeWords, unitNotes, verdictCounts, verdictTone, workflowActs, workflowRows, workflowRunTag } from "./workflows";
import { FAMILIES, FAMILY_UNITS, PIPELINES, PLAN, PLAN_ALL, PROVENANCE, RUNS, UNITS, WORKFLOW_DOORS, WORKFLOW_RUN, WORKFLOW_RUN_GOING, WORKFLOW_RUNS, WORKFLOWS } from "./workflows.fixture";

const SEE = capsWith(WORKFLOW_DOORS, ["pipelines:see"]);
const WORK = capsWith(WORKFLOW_DOORS, ["pipelines:see", "pipelines:work", "install:work"]);
const name = (p: string) => p.replace(/^person:/u, "");

describe("what a person may do", () => {
  it("follows the grants and the doors", () => {
    expect(workflowActs(SEE)).toEqual({ see: true, plan: true, run: false, add: false, runs: true, openRun: true, cancel: false, provenance: true });
    expect(workflowActs(WORK)).toMatchObject({ run: true, add: true, cancel: true });
    expect(workflowActs(capsWith(["GET /api/pipelines"], ["pipelines:see"])).see).toBe(false);
    // provenance opens for data:see too
    expect(workflowActs(capsWith(["GET /api/provenance/{kind}/{id}"], ["data:see"])).provenance).toBe(true);
    expect(workflowActs(capsWith(["GET /api/provenance/{kind}/{id}"], ["review:see"])).provenance).toBe(false);
  });
});

describe("the Pipelines page's rows (8.1)", () => {
  it("make a family one row with its members under it, taken out of the pipelines", () => {
    const rows = pageRows(PIPELINES, FAMILIES);
    expect(rows.map((r) => (r.kind === "family" ? `family:${r.family.name}` : r.row.name))).toEqual(["family:registration", "samseg-lesions", "synthseg", "segcsvd", "n4"]);
    const fam = rows[0];
    expect(fam.kind === "family" && fam.members.map((m) => m.name)).toEqual(["ants", "synthmorph"]);
    // a replaced version is not offered on its name's row
    const samseg = rows[1];
    expect(samseg.kind === "pipeline" && samseg.row.versions.map((v) => v.id)).toEqual([5]);
    // an engine before lists no families: the rows are the pipelines
    expect(pageRows(PIPELINES, null).every((r) => r.kind === "pipeline")).toBe(true);
    // a family none of whose members is in the catalog still has its row
    expect(pageRows(PIPELINES.slice(2), FAMILIES).some((r) => r.kind === "family" && r.members.length === 0)).toBe(true);
    expect(familyLastRun(fam.kind === "family" ? fam.members : [], RUNS, PIPELINES)?.id).toBe(40);
  });
  it("list the runs going and done together, newest first, a step's run naming its workflow run", () => {
    const together = runsTogether(RUNS, WORKFLOW_RUNS);
    expect(together.map((r) => `${r.kind[0]}${r.run.id}`)).toEqual(["w13", "p42", "p41", "p40", "p39", "p38", "w12", "p33"]);
    expect(stepOf(RUNS[1], WORKFLOW_RUNS)).toEqual({ workflowRun: WORKFLOW_RUN, step: "samseg" });
    expect(stepOf(RUNS[5], WORKFLOW_RUNS)).toBeNull();
    expect(workflowRows([...WORKFLOWS, { ...WORKFLOWS[0], id: 3, version: "2", label: "flair-lesions@2" }]).map((w) => w.label)).toEqual(["flair-lesions@2", "cortical@1"]);
    expect(stepsLine(WORKFLOWS[0].workflow)).toBe("registration → samseg-lesions → synthseg → segcsvd");
  });
  it("draws them, each row opening its own page by a click anywhere on it", () => {
    const html = renderToStaticMarkup(<CatalogBody caps={SEE} pipelines={PIPELINES} families={FAMILIES} capability={{ enabled: true }} runs={RUNS} workflows={WORKFLOWS} workflowRuns={WORKFLOW_RUNS} onRun={() => undefined} />);
    expect(html).toContain("<h2>Pipelines</h2>");
    expect(html).toContain("4 pipelines · 1 family");
    expect(html).toContain("<h2>Workflows</h2>");
    expect(html).toContain("<h2>Runs</h2>");
    expect(html).not.toContain('class="chips pages"');
    // the family row, closed, with its members counted; the member rows come when it opens
    expect(html).toMatch(/<tr class="family openable" tabindex="0" aria-expanded="false">/u);
    expect(html).toContain("2 members of 3");
    expect(html).not.toContain("<b>ants</b>");
    // a workflow row opens its page, a workflow run its own, a pipeline run its own
    expect(html).toContain('href="#pipelines/workflows/1"');
    expect(html).toContain('href="#pipelines/workflow-runs/12"');
    expect(html).toContain('href="#pipelines/runs/41"');
    // a step's run names its workflow run
    expect(html).toContain('step samseg of <a href="#pipelines/workflow-runs/12">W12</a>');
    // the workflow run's row sums its steps
    expect(html).toContain("15 of 16 made");
    expect(html).toContain("16 · 2 reused · 1 failed");
    // the workflow's row says its last run
    expect(html).toMatch(/last run 13 · running/u);
  });
  it("is what the section opens on; the jobs are a page beside it; the old addresses lead to it", () => {
    expect(renderToStaticMarkup(<PipelinesPage caps={SEE} />)).toContain("<h1>Pipelines</h1>");
    expect(renderToStaticMarkup(<PipelinesPage caps={SEE} page="jobs" />)).toContain("<h1>Jobs</h1>");
    expect(renderToStaticMarkup(<PipelinesPage caps={SEE} page="catalog" />)).toContain("<h1>Pipelines</h1>");
    expect(renderToStaticMarkup(<PipelinesPage caps={capsWith(["GET /api/jobs"], ["pipelines:see"])} />)).toContain("<h1>Jobs</h1>");
    expect(renderToStaticMarkup(<PipelinesPage caps={SEE} page="workflows" arg="1" />)).toContain("<h1>Workflow</h1>");
    expect(renderToStaticMarkup(<PipelinesPage caps={SEE} page="workflow-runs" arg="12" />)).toContain("<h1>Workflow run 12</h1>");
    // without the doors the pages fall back to the Pipelines page
    expect(renderToStaticMarkup(<PipelinesPage caps={capsWith(["GET /api/pipelines", "GET /api/jobs"], ["pipelines:see"])} page="workflows" arg="1" />)).toContain("<h1>Pipelines</h1>");
    expect(renderToStaticMarkup(<PipelinesPage caps={WORK} />)).toContain("Add a workflow");
    expect(renderToStaticMarkup(<PipelinesPage caps={SEE} />)).not.toContain("Add a workflow");
    expect(moved(parse("#pipelines/catalog"))).toBe("#pipelines");
    expect(moved(parse("#pipelines/runs"))).toBe("#pipelines");
    expect(moved(parse("#pipelines/runs/3"))).toBeNull();
    expect(moved(parse("#pipelines"))).toBeNull();
    const pages = sections(capsWith([...WORKFLOW_DOORS, "GET /api/models"], ["pipelines:see", "models:see"])).find((s) => s.id === "pipelines")!.pages!;
    expect(pages.map((p) => [p.title, p.to ?? `#pipelines/${p.id}`])).toEqual([
      ["Pipelines", "#pipelines"],
      ["Jobs", "#pipelines/jobs"],
      ["Models", "#pipelines/models"],
    ]);
    // without the catalog the jobs keep the section's own address
    expect(sections(capsWith(["GET /api/jobs"], ["pipelines:see"])).find((s) => s.id === "pipelines")!.pages!.map((p) => [p.title, p.to])).toEqual([["Jobs", "#pipelines"]]);
  });
});

describe("a workflow's plan (8.3)", () => {
  it("gives every verdict its tone and words", () => {
    expect(["satisfied", "fed", "missing", "redundant", "refused"].map(verdictTone)).toEqual(["ok", "brand", "caution", "caution", "blocked"]);
    expect(verdictCounts(PLAN_ALL)).toEqual([
      { verdict: "satisfied", count: 1 },
      { verdict: "fed", count: 1 },
      { verdict: "missing", count: 1 },
      { verdict: "redundant", count: 1 },
      { verdict: "refused", count: 1 },
    ]);
    expect(verdictCounts({ links: PLAN.links })).toEqual([
      { verdict: "satisfied", count: 1 },
      { verdict: "fed", count: 3 },
    ]);
    expect(linkWords(PLAN.links[0])).toBe("register.flair_aligned → samseg.aligned_flair");
    expect(linkWords(PLAN.links[3])).toBe("(no step) → samseg");
    expect(typeWords({ kind: "image", role: "flair", contrast: "FLAIR", grid: "t1w" })).toBe("image, flair FLAIR on t1w");
    expect(typeWords({ kind: "transform", space: "MNI152NLin2009cAsym" })).toBe("transform in MNI152NLin2009cAsym");
  });
  it("reads each step's pre-flight: units, fed inputs, waits whole, a family's routing, blockers", () => {
    expect(stepPreflight(PLAN.steps[3])).toEqual({ units: { total: 4, ready: 4, missing: 0 }, fed: [{ input: "aligned_flair", words: "fed by step register" }, { input: "synthseg", words: "fed by step synthseg" }], waitsWhole: ["register", "synthseg"], family: null, blockers: [], ready: true });
    expect(stepPreflight(PLAN.steps[0]).family).toEqual({ task: "within_session", level: "session", units: 4, counts: { ants: 3, synthmorph: 1 } });
    expect(stepPreflight(PLAN_ALL.steps[2]).blockers).toEqual(["no unit can run: its mask input is of another type"]);
    expect(planBody({ select: "main@dataset:study-anon" }, null, { segcsvd: { wmh_threshold: "0.6", pvs_threshold: " " } })).toEqual({ select: "main@dataset:study-anon", knobs: { segcsvd: { wmh_threshold: "0.6" } } });
    expect(planBody({ handle: 71 }, "research", {})).toEqual({ handle: 71, goal: "research" });
    expect(overOfQuery({ select: "main@dataset:study-anon" })).toEqual({ main: { kind: "dataset", name: "study-anon", role: null } });
    expect(overOfQuery({ select: "selection:ms-baseline@4" })).toEqual({ selection: "ms-baseline", version: 4 });
    expect(overOfQuery({ handle: "71" })).toEqual({ handle: 71 });
    expect(overOfQuery({ select: "nonsense" })).toBeNull();
  });
  it("draws every link with its verdict and words under the step it feeds, and the refused step", () => {
    const doc = { name: "by-hand", steps: PLAN_ALL.steps.map((s) => ({ id: s.step, pipeline: s.of === "pipeline" ? s.pipeline!.replace(/@.*$/u, "") : null, family: s.of === "family" ? s.pipeline : null, version: "current", knobs: s.step === "segcsvd" ? ["wmh_threshold"] : null })), links: [] };
    const html = renderToStaticMarkup(<WorkflowSteps doc={doc} plan={PLAN_ALL}>{(ps) => (ps ? <StepPreflight s={ps} /> : null)}</WorkflowSteps>);
    for (const [verdict, tone] of [["satisfied", "ok"], ["fed", "brand"], ["missing", "caution"], ["redundant", "caution"], ["refused", "blocked"]]) {
      expect(html).toContain(`<div class="wf-link ${tone}"`);
      expect(html).toContain(`<span class="tag ${tone}">${verdict}</span>`);
    }
    expect(html).toContain("N4 before SAMSEG is redundant: SAMSEG corrects bias itself");
    expect(html).toContain("a mask on t1w does not meet an input on flair");
    expect(html).toContain("(no step) → samseg");
    // the types on hover
    expect(html).toContain('title="from mask on t1w; to mask on flair"');
    // the refused step says why, in the blocked colour
    expect(html).toContain('<span class="unit-flag drop">the catalog holds no family cortical-registration</span>');
    expect(html).toContain('class="stepno attention"');
    // the pre-flight: the fed input, waits whole, the blocker
    expect(html).toContain('<span class="unit-note brand">synthseg: fed by step synthseg</span>');
    expect(html).toContain("waits for synthseg whole");
    expect(html).toContain('<span class="unit-flag">no unit can run: its mask input is of another type</span>');
    expect(html).toContain("knobs wmh_threshold");
    // a document not yet planned draws its links as arrows with no verdict
    const bare = renderToStaticMarkup(<WorkflowSteps doc={WORKFLOWS[0].workflow} />);
    expect(bare).toContain("register.flair_aligned → samseg.aligned_flair");
    expect(bare).not.toContain('class="tag ok"');
    expect(bare).toContain('<span class="tag" title="the family&#x27;s task, as the document fixes it">task within_session</span>');
  });
  it("decides whether a run is offered by runnable, with the plan's words", () => {
    expect(renderToStaticMarkup(<PlanLine plan={PLAN} />)).toContain('<span class="tag ok">can run</span>');
    const no = renderToStaticMarkup(<PlanLine plan={PLAN_ALL} />);
    expect(no).toContain('<span class="tag blocked">cannot run</span>');
    expect(no).toContain("step reg: the catalog holds no family cortical-registration");
    expect(no).toContain('<span class="tag caution">1 missing</span>');
  });
});

describe("a workflow run (8.4)", () => {
  it("sums each step's units and reads its state", () => {
    expect(runSums(WORKFLOW_RUN)).toMatchObject({ steps: 4, stepsDone: 3, total: 16, succeeded: 13, failed: 1, reused: 2, skipped: 0, line: "4 steps · 16 units: 13 made, 2 reused, 1 failed" });
    // without a summary the steps are summed
    expect(runSums({ ...WORKFLOW_RUN, summary: null })).toMatchObject({ total: 16, succeeded: 13, reused: 2, failed: 1, stepsDone: 3 });
    expect(runSums(WORKFLOW_RUN_GOING)).toMatchObject({ total: 4, succeeded: 1, line: "4 steps · 4 units: 1 made" });
    expect(workflowRunTag(WORKFLOW_RUN)).toEqual({ className: "tag caution", words: "15 of 16 made" });
    expect(workflowRunTag(WORKFLOW_RUN_GOING)).toEqual({ className: "tag brand", words: "running" });
    expect(workflowRunTag({ ...WORKFLOW_RUN, status: "cancelled" })).toEqual({ className: "tag", words: "cancelled" });
  });
  it("draws the steps with their status, unit counts and runs, the sum line, and Cancel where the job is open", () => {
    const html = renderToStaticMarkup(<WorkflowRunView caps={WORK} run={WORKFLOW_RUN} onCancel={null} />);
    expect(html).toContain("4 steps · 16 units: 13 made, 2 reused, 1 failed");
    expect(html).toContain("<td>4 · 2 made · 2 reused</td>");
    expect(html).toContain("<td>4 · 3 made · 1 failed</td>");
    expect(html).toContain('<a href="#pipelines/runs/41">41</a>');
    expect(html).toContain('<span class="tag caution">partial</span>');
    expect(html).toContain("1 unit failed: out of memory");
    expect(html).toContain("waits for register, synthseg whole");
    expect(html).not.toContain(">Cancel<");
    const going = renderToStaticMarkup(<WorkflowRunView caps={WORK} run={WORKFLOW_RUN_GOING} onCancel={() => undefined} />);
    expect(going).toContain(">Cancel</button>");
    expect(going).toContain('<span class="tag brand">queued</span>');
    expect(going).toContain("0 of 4 done");
  });
});

describe("a run's units (8.4 to 8.6)", () => {
  it("note the member and rule, the reuse, the judgement against its forecast, the inputs fed by no step, why nothing was reused, and the curation state", () => {
    expect(unitNotes(FAMILY_UNITS[0])).toEqual([
      { kind: "variant", words: "registration: ants by rule r1", tone: "brand", title: "both 3D at 1.5 mm or finer" },
      { kind: "curation", words: "current", tone: "ok" },
    ]);
    expect(unitNotes(UNITS[0]).map((x) => [x.kind, x.words, x.tone, x.href ?? null])).toEqual([
      ["reused", "reused from run 33", "ok", "#pipelines/runs/33"],
      ["judged", "judged as it started", "neutral", null],
      ["curation", "current", "ok", null],
    ]);
    expect(forecastDiffers(UNITS[0])).toBe(false);
    expect(forecastDiffers(UNITS[1])).toBe(true);
    expect(unitNotes(UNITS[1]).map((x) => [x.kind, x.words, x.tone])).toEqual([
      ["judged", "judged as it started; the forecast was ready", "caution"],
      ["curation", "stale: the rules version on an input changed (mri 1.0.0 to 1.0.1)", "caution"],
    ]);
    expect(unitNotes(UNITS[2]).map((x) => [x.kind, x.words, x.tone])).toEqual([
      ["fed", "aligned_flair: fed by no step for this unit: the unit failed in step register", "caution"],
      ["reuse", "not reused: run 33, its files fail their sha256", "neutral"],
      ["curation", "unknown: recorded before the door", "neutral"],
    ]);
    // below detail quasi the engine answers no curation: no note
    expect(unitNotes({ ...UNITS[3], curation: null })).toEqual([]);
    expect(curationTone("stale")).toBe("caution");
  });
  it("draws them as chips in the unit's row, stale in the caution colour", () => {
    const html = renderToStaticMarkup(<UnitPack u={UNITS[1]} said={packWords(UNITS[1])} skippedShown={false} name={name} pack={null} />);
    expect(html).toContain('<span class="unit-note caution judged"');
    expect(html).toContain('<span class="unit-note caution curation">stale: the rules version on an input changed (mri 1.0.0 to 1.0.1)</span>');
    const reused = renderToStaticMarkup(<UnitPack u={UNITS[0]} said={packWords(UNITS[0])} skippedShown={false} name={name} pack={null} />);
    expect(reused).toContain('<a class="unit-note ok reused" href="#pipelines/runs/33" title="reused from run 33: the result key matched a kept result">reused from run 33</a>');
    const routed = renderToStaticMarkup(<UnitPack u={FAMILY_UNITS[1]} said={packWords(FAMILY_UNITS[1])} skippedShown={false} name={name} pack={null} />);
    expect(routed).toContain('<span class="unit-note brand variant" title="2D or slices over 2.5 mm">registration: synthmorph by rule r2</span>');
  });
  it("opens the provenance a unit's name tells", () => {
    expect(provenanceOf("sub-13_ses-20260113")).toEqual({ kind: "session", id: "13@20260113" });
    expect(provenanceOf("sub-13")).toEqual({ kind: "subject", id: "13" });
    expect(provenanceOf("1041")).toEqual({ kind: "stack", id: "1041" });
    expect(provenanceOf(null)).toBeNull();
    expect(provenanceOf("unit 3")).toBeNull();
    expect(scanProvenance({ id: 1041, subjectId: 13, label: "20260113", day: "2026-01-13" })).toEqual({ stack: { kind: "stack", id: "1041" }, session: { kind: "session", id: "13@20260113" } });
    expect(scanProvenance({ id: 1041, subjectId: 13, label: null, day: "2026-01-13" }).session).toEqual({ kind: "session", id: "13@20260113" });
    expect(scanProvenance({ id: 1041, subjectId: 13, label: null, day: null }).session).toBeNull();
  });
});

describe("the provenance panel (8.6)", () => {
  it("lists the steps with their keys, results and curation state, the withheld count plainly", () => {
    const html = renderToStaticMarkup(<ProvenanceView p={PROVENANCE} />);
    expect(html).toContain("4 steps over 2 stacks");
    expect(html).toContain('<span class="tag caution">1 stale</span>');
    expect(html).toContain("1 step withheld: a stack of a sample sealed now");
    expect(html).toContain("1 result is stale: the rules version on an input changed since it ran");
    expect(html).toContain('<div class="provenance-step caution">');
    expect(html).toContain('<span class="unit-note caution" title="mri: 1.0.0 → 1.0.1">stale: the rules version on an input changed (mri 1.0.0 to 1.0.1)</span>');
    expect(html).toContain('<a href="#pipelines/runs/41">run 41</a>');
    expect(html).toContain('<a class="meta" href="#pipelines/workflow-runs/12">workflow run 12 · step samseg</a>');
    expect(html).toContain("2 files: image, transform");
    expect(html).toContain("2 files: 2 mask");
    expect(html).toContain("2 measures");
    expect(html).toContain('<a class="unit-note ok" href="#pipelines/runs/30">reused from run 30</a>');
    expect(html).toContain("key cccccccccccc");
    expect(filesWords(PROVENANCE.steps[2])).toBe("1 file: mask");
    // below detail quasi the engine names no unit
    const quasi = renderToStaticMarkup(<ProvenanceView p={{ ...PROVENANCE, steps: PROVENANCE.steps.map((s) => ({ ...s, unit: null })) }} />);
    expect(quasi).toContain("a unit");
    expect(quasi).not.toContain("sub-13_ses-20260113");
    expect(renderToStaticMarkup(<ProvenanceView p={{ of: { kind: "stack", id: 9 }, steps: [] }} />)).toContain("Nothing ran on it yet.");
  });
});
