// SPDX-License-Identifier: AGPL-3.0-only
// The Pipelines page without tabs, workflows and provenance (Wave 7b spec
// sections 8.1 and 8.3 to 8.6; record 57 P7 and P8, record 58 P5), the pure
// parts: what a person may do by grant and door; the page's rows (a family
// one row that opens to its members, the workflows, the runs going and done,
// pipeline and workflow runs together, newest first); a plan's links with
// their verdicts and words; a step's pre-flight in a few numbers; a workflow
// run's sums; a run unit's notes (the member and rule of a family run, a
// result reused from another run, a judgement made as the unit started
// against its forecast, inputs fed by no step, why nothing was reused, and
// the curation state); and which provenance a unit's name opens.

import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";
import { href } from "../routes";
import { catalogRows, type CatalogRow, type Pipeline, type Run } from "./catalog";
import type { Curation, Family, LinkType, PlanLink, PlanStep, StepUnits, WorkflowDoc, WorkflowRow, WorkflowRun } from "./client";
import { lastRunOf } from "./results";
import { runActs, type UnitRun } from "./runs";
import type { JobRow } from "../ask/client";

const n = (v: number) => v.toLocaleString("en-US");

/** What a person may do with workflows and provenance, by grant and door. */
export function workflowActs(caps: Capabilities): { see: boolean; plan: boolean; run: boolean; add: boolean; runs: boolean; openRun: boolean; cancel: boolean; provenance: boolean } {
  const see = may(caps, "pipelines:see") && served(caps, "GET /api/workflows");
  return {
    see,
    plan: see && served(caps, "POST /api/workflows/{id}/plan"),
    run: see && may(caps, "pipelines:work") && served(caps, "POST /api/workflows/{id}/run"),
    add: may(caps, "install:work") && served(caps, "POST /api/workflows"),
    runs: may(caps, "pipelines:see") && served(caps, "GET /api/workflow-runs"),
    openRun: may(caps, "pipelines:see") && served(caps, "GET /api/workflow-runs/{id}"),
    cancel: runActs(caps).cancel,
    provenance: (may(caps, "pipelines:see") || may(caps, "data:see")) && served(caps, "GET /api/provenance/{kind}/{id}"),
  };
}

/* ---------------------------------------------------------------- the page's rows */

/** One row of the Pipelines page's first table: a pipeline with its versions, or a family that opens to its members' rows. */
export type PageRow = { kind: "pipeline"; row: CatalogRow } | { kind: "family"; family: Family; members: CatalogRow[] };

/** The pipelines and families, in the catalog's order, a family's members under its row and not among the pipelines. */
export function pageRows(pipelines: Pipeline[], families: Family[] | null | undefined): PageRow[] {
  const fams = families ?? [];
  const memberOf = new Map<string, string>();
  for (const f of fams) for (const m of f.members ?? []) memberOf.set(m.pipeline, f.name);
  for (const p of pipelines) if (p.family) memberOf.set(p.name, p.family);
  const rows = catalogRows(pipelines);
  const out: PageRow[] = [];
  const placed = new Set<string>();
  for (const row of rows) {
    const fam = memberOf.get(row.name);
    if (fam === undefined || !fams.some((f) => f.name === fam)) {
      out.push({ kind: "pipeline", row });
      continue;
    }
    if (placed.has(fam)) continue;
    placed.add(fam);
    const family = fams.find((f) => f.name === fam)!;
    out.push({ kind: "family", family, members: rows.filter((r) => memberOf.get(r.name) === fam) });
  }
  // a family none of whose members the catalog offers still has its row
  for (const f of fams) if (!placed.has(f.name)) out.push({ kind: "family", family: f, members: [] });
  return out;
}

/** The newest run of any of a family's members. */
export function familyLastRun(members: CatalogRow[], runs: Run[], pipelines: Pipeline[]): Run | null {
  let last: Run | null = null;
  for (const m of members) {
    const r = lastRunOf(m.name, runs, pipelines);
    if (r && (last === null || r.id > last.id)) last = r;
  }
  return last;
}

/** A run of the page's table: a pipeline run or a workflow run. */
export type PageRun = { kind: "pipeline"; run: Run } | { kind: "workflow"; run: WorkflowRun };

const when = (r: { started_at: string | null }): number | null => {
  const t = r.started_at ? Date.parse(r.started_at) : NaN;
  return Number.isFinite(t) ? t : null;
};

/** Newest first: a run with no start time yet (queued) is the newest of all and goes by id among its kind, never as the epoch. */
function newer(a: PageRun, b: PageRun): number {
  const ta = when(a.run);
  const tb = when(b.run);
  if (ta !== null && tb !== null && ta !== tb) return tb - ta;
  if (ta === null && tb !== null) return -1;
  if (ta !== null && tb === null) return 1;
  return a.kind === b.kind ? b.run.id - a.run.id : a.kind === "workflow" ? -1 : 1;
}

/** The runs going and done, pipeline and workflow runs together, newest first; a pipeline run of a workflow's step stays in the list, its row naming the workflow run. */
export function runsTogether(runs: Run[], workflowRuns: WorkflowRun[] | null | undefined): PageRun[] {
  const out: PageRun[] = [...runs.map((run): PageRun => ({ kind: "pipeline", run })), ...(workflowRuns ?? []).map((run): PageRun => ({ kind: "workflow", run }))];
  // a workflow run and its first step's run start together: the workflow run reads first
  return out.sort(newer);
}

/** The workflow run a pipeline run is a step of, where the workflow runs name it. */
export function stepOf(run: Run, workflowRuns: WorkflowRun[] | null | undefined): { workflowRun: WorkflowRun; step: string } | null {
  for (const w of workflowRuns ?? []) {
    const s = w.steps.find((x) => x.run === run.id);
    if (s) return { workflowRun: w, step: s.step };
  }
  return null;
}

/** The address of a workflow's page, and of a workflow run's. */
export const workflowHref = (id: number | string): string => href("pipelines", "workflows", String(id));
export const workflowRunHref = (id: number): string => href("pipelines", "workflow-runs", String(id));

/** A workflow in one line: its steps, in order, as the document names them. */
export function stepsLine(d: WorkflowDoc): string {
  return d.steps.map((s) => s.pipeline ?? s.family ?? s.id).join(" → ");
}

/** The pipeline or family a step runs, with its version where the document names one. */
export function stepRuns(s: { pipeline?: string | null; family?: string | null; version?: string | null; of?: string | null; name?: string | null }): string {
  const what = s.pipeline ?? s.family ?? s.name ?? "?";
  const v = s.version && s.version !== "current" ? `@${s.version}` : "";
  return `${what}${v}`;
}

/** The workflow rows one a name, newest version first, as the Pipelines page lists them. */
export function workflowRows(rows: WorkflowRow[]): WorkflowRow[] {
  const byName = new Map<string, WorkflowRow>();
  for (const r of rows) {
    const had = byName.get(r.name);
    if (!had || Number(r.version) > Number(had.version) || (!Number.isFinite(Number(r.version)) && r.id > had.id)) byName.set(r.name, r);
  }
  return [...byName.values()];
}

/* ---------------------------------------------------------------- a plan */

/** The tone a verdict reads in: satisfied ok, fed brand, missing and redundant caution, refused blocked. */
export function verdictTone(v: string): "ok" | "brand" | "caution" | "blocked" | "neutral" {
  switch (v) {
    case "satisfied":
      return "ok";
    case "fed":
      return "brand";
    case "missing":
    case "redundant":
      return "caution";
    case "refused":
      return "blocked";
    default:
      return "neutral";
  }
}

/** The order the verdicts are counted in. */
export const VERDICTS = ["satisfied", "fed", "missing", "redundant", "refused"] as const;

/** A type in a few words: "image, flair FLAIR on t1w", "mask on t1w", "transform". */
export function typeWords(t: LinkType | null | undefined): string {
  if (!t) return "";
  const head = [t.kind, [t.role, t.contrast].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const on = t.grid ? ` on ${t.grid}` : t.space ? ` in ${t.space}` : "";
  return `${head}${on}`;
}

/** A link as an arrow: "register.flair_aligned → samseg.aligned_flair"; an implicit one names what no step feeds. */
export function linkWords(l: PlanLink): string {
  const to = `${l.to.step}${l.to.input ? `.${l.to.input}` : ""}`;
  if (!l.from || (!l.from.step && !l.from.output)) return `(no step) → ${to}`;
  return `${l.from.step ?? "?"}${l.from.output ? `.${l.from.output}` : ""} → ${to}`;
}

/** A plan's verdicts counted, from the engine's counts or the links. */
export function verdictCounts(p: { verdicts?: Record<string, number> | null; links: PlanLink[] }): { verdict: string; count: number }[] {
  const counts = p.verdicts ?? Object.fromEntries(VERDICTS.map((v) => [v, p.links.filter((l) => l.verdict === v).length]));
  return VERDICTS.map((v) => ({ verdict: v, count: Number(counts[v] ?? 0) })).filter((c) => c.count > 0);
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** A step's pre-flight in a few numbers: its units, the inputs a link feeds, the steps it waits for whole, a family's routing, and its blockers. */
export function stepPreflight(s: PlanStep): { units: { total: number | null; ready: number | null; missing: number | null } | null; fed: { input: string; words: string }[]; waitsWhole: string[]; family: { task: string | null; level: string | null; units: number | null; counts: Record<string, number> } | null; blockers: string[]; ready: boolean | null } {
  const p = obj(s.preflight);
  const u = obj(p.units);
  const fed = Object.entries(obj(p.fed)).map(([input, words]) => ({ input, words: String(words) }));
  const blockers = Array.isArray(p.blockers) ? p.blockers.filter((b): b is string => typeof b === "string") : [];
  const family = s.family || typeof p.family === "string" ? { task: typeof p.task === "string" ? p.task : null, level: typeof p.level === "string" ? p.level : null, units: num(p.units), counts: Object.fromEntries(Object.entries(obj(p.counts)).map(([k, v]) => [k, num(v) ?? 0])) } : null;
  const units = family || Object.keys(u).length === 0 ? null : { total: num(u.total), ready: num(u.ready), missing: num(u.missing) };
  return { units, fed, waitsWhole: s.waits_whole ?? [], family, blockers, ready: typeof p.ready === "boolean" ? p.ready : null };
}

/** The knobs a document's step lets a person set. */
export function knobIds(s: { knobs?: Record<string, unknown> | string[] | null }): string[] {
  if (Array.isArray(s.knobs)) return s.knobs.filter((k): k is string => typeof k === "string");
  return Object.keys(s.knobs ?? {});
}

/** The body the plan and the run take: the scope, the goal, and only the knobs a person filled in. */
export function planBody(scope: { select: string } | { handle: number }, goal: string | null, knobs: Record<string, Record<string, string>>): { select?: string; handle?: number; goal?: string; knobs?: Record<string, Record<string, string>> } {
  const filled: Record<string, Record<string, string>> = {};
  for (const [step, ks] of Object.entries(knobs)) {
    const kept = Object.fromEntries(Object.entries(ks).filter(([, v]) => v.trim() !== ""));
    if (Object.keys(kept).length > 0) filled[step] = kept;
  }
  return { ...scope, ...(goal ? { goal } : {}), ...(Object.keys(filled).length > 0 ? { knobs: filled } : {}) };
}

/* ---------------------------------------------------------------- a workflow run */

/** The tone of a step's or a run's status. */
export function statusTone(status: string): "ok" | "brand" | "caution" | "blocked" | "neutral" {
  switch (status) {
    case "done":
      return "ok";
    case "running":
    case "queued":
      return "brand";
    case "partial":
    case "failed":
    case "interrupted":
      return "caution";
    case "refused":
      return "blocked";
    default:
      return "neutral";
  }
}

const sum = (steps: WorkflowRunStep0[], k: keyof StepUnits): number => steps.reduce((t, s) => t + (num(s.units?.[k]) ?? 0), 0);
type WorkflowRunStep0 = WorkflowRun["steps"][number];

/** A workflow run's units summed over its steps (the engine's summary where it has one), and the line a person reads: "3 steps · 12 units: 8 made, 2 reused, 1 failed, 1 skipped". */
export function runSums(r: WorkflowRun): { steps: number; stepsDone: number; total: number; succeeded: number; failed: number; skipped: number; reused: number; unreported: number; stepsWords: string; unitsWords: string; line: string } {
  const s = r.summary?.units ?? null;
  const steps = r.steps ?? [];
  const total = num(s?.total) ?? sum(steps, "total");
  const succeeded = num(s?.succeeded) ?? sum(steps, "succeeded");
  const failed = num(s?.failed) ?? sum(steps, "failed");
  const skipped = num(s?.skipped) ?? sum(steps, "skipped");
  const reused = num(s?.reused) ?? sum(steps, "reused");
  const unreported = num(s?.unreported) ?? sum(steps, "unreported");
  const stepsTotal = num(r.summary?.steps_total) ?? num(r.summary?.steps) ?? steps.length;
  const stepsDone = num(r.summary?.steps_done) ?? steps.filter((x) => x.status === "done").length;
  const parts = [
    succeeded > 0 ? `${n(succeeded)} made` : null,
    reused > 0 ? `${n(reused)} reused` : null,
    failed + unreported > 0 ? `${n(failed + unreported)} failed` : null,
    skipped > 0 ? `${n(skipped)} skipped` : null,
  ].filter((x): x is string => x !== null);
  const stepsWords = `${n(stepsTotal)} ${stepsTotal === 1 ? "step" : "steps"}`;
  const unitsWords = `${n(total)} ${total === 1 ? "unit" : "units"}${parts.length > 0 ? `: ${parts.join(", ")}` : ""}`;
  return { steps: stepsTotal, stepsDone, total, succeeded, failed, skipped, reused, unreported, stepsWords, unitsWords, line: `${stepsWords} · ${unitsWords}` };
}

/** A step's units in one cell: "4 · 3 made · 1 reused". */
export function stepUnitsWords(u: StepUnits | null | undefined): string {
  if (!u) return "";
  const total = num(u.total);
  const parts = [
    (num(u.succeeded) ?? 0) > 0 ? `${n(u.succeeded!)} made` : null,
    (num(u.reused) ?? 0) > 0 ? `${n(u.reused!)} reused` : null,
    (num(u.failed) ?? 0) + (num(u.unreported) ?? 0) > 0 ? `${n((num(u.failed) ?? 0) + (num(u.unreported) ?? 0))} failed` : null,
    (num(u.skipped) ?? 0) > 0 ? `${n(u.skipped!)} skipped` : null,
  ].filter((x): x is string => x !== null);
  return [total === null ? null : n(total), ...parts].filter(Boolean).join(" · ");
}

/** The tag a workflow run reads as: its status, or its units summed once it ended. */
export function workflowRunTag(r: WorkflowRun): { className: string; words: string; tone: "ok" | "brand" | "caution" | "blocked" | "neutral" } {
  const tone = statusTone(r.status);
  if (r.status === "done" || r.status === "partial") {
    const s = runSums(r);
    if (s.total > 0) {
      const all = s.succeeded + s.reused === s.total ? "ok" : "caution";
      return { className: `tag ${all}`, words: `${n(s.succeeded + s.reused)} of ${n(s.total)} made`, tone: all };
    }
  }
  return { className: tone === "neutral" ? "tag" : `tag ${tone}`, words: r.status, tone };
}

/** The workflow run a job made, where the job's result, progress or arguments name it. */
export function workflowRunOfJob(job: Pick<JobRow, "result" | "progress" | "args">): number | null {
  for (const v of [job.result, job.progress, job.args]) {
    const id = obj(v).workflow_run;
    if (typeof id === "number" && Number.isInteger(id)) return id;
  }
  return null;
}

/** Whether a cancel is offered: the run's job is open. */
export function cancellable(r: WorkflowRun): boolean {
  return r.job !== null && (r.status === "running" || r.status === "queued" || r.status === "cancelling");
}

/* ---------------------------------------------------------------- a run's units */

/** One note under a run's unit, drawn as a chip with a coloured border. */
export interface UnitNote {
  kind: "variant" | "reused" | "judged" | "fed" | "reuse" | "curation";
  words: string;
  tone: "ok" | "brand" | "caution" | "neutral";
  title?: string | null;
  href?: string | null;
}

/** The tone a curation state reads in: current ok, stale caution (the desk's colour for a caution), unknown neutral. */
export function curationTone(state: string | null | undefined): "ok" | "caution" | "neutral" {
  return state === "current" ? "ok" : state === "stale" ? "caution" : "neutral";
}

/** A curation state in words: "current", "stale: the rules version on an input changed (...)", "unknown". */
export function curationWords(c: Curation | null | undefined): string | null {
  if (!c) return null;
  if (c.state === "stale") return c.words ? (c.words.startsWith("stale") ? c.words : `stale: ${c.words}`) : "stale";
  if (c.state === "unknown") return c.words ? `unknown: ${c.words}` : "unknown";
  return c.state;
}

/** Whether a judgement made as the unit started differs from the forecast at the run's start. */
export function forecastDiffers(u: Pick<UnitRun, "forecast" | "pack_status" | "words">): boolean {
  const f = u.forecast;
  if (!f) return false;
  return (f.status ?? null) !== (u.pack_status ?? null) || (f.words ?? null) !== (u.words ?? null);
}

/** The notes of a unit of a run (Wave 7b sections 8.4 to 8.6), in the order a person reads them. */
export function unitNotes(u: UnitRun): UnitNote[] {
  const out: UnitNote[] = [];
  const v = u.variant;
  if (u.family?.name && v && (v.variant || v.pipeline)) {
    out.push({ kind: "variant", words: `${u.family.name}: ${v.variant ?? v.pipeline}${v.rule ? ` by rule ${v.rule}` : ""}`, tone: "brand", title: v.why ?? null });
  }
  if (typeof u.reused_from === "number") {
    out.push({ kind: "reused", words: `reused from run ${n(u.reused_from)}`, tone: "ok", title: u.words_reused ?? null, href: href("pipelines", "runs", String(u.reused_from)) });
  }
  if (u.judged_at === "start") {
    const differs = forecastDiffers(u);
    const f = u.forecast;
    const forecast = f ? [f.status, f.words].filter(Boolean).join(": ") : "";
    out.push({ kind: "judged", words: differs ? `judged as it started; the forecast was ${forecast || "otherwise"}` : "judged as it started", tone: differs ? "caution" : "neutral", title: differs ? null : forecast ? `the forecast agreed: ${forecast}` : null });
  }
  for (const [input, words] of Object.entries(u.fed ?? {})) out.push({ kind: "fed", words: `${input}: ${words}`, tone: "caution" });
  const considered = (u.reuse?.considered ?? []).filter((c) => !c.reused);
  if (typeof u.reused_from !== "number" && considered.length > 0) {
    out.push({ kind: "reuse", words: `not reused: ${considered.map((c) => `${typeof c.run === "number" ? `run ${n(c.run)}, ` : ""}${c.why ?? "no reason given"}`).join("; ")}`, tone: "neutral" });
  }
  const cur = curationWords(u.curation);
  if (cur) out.push({ kind: "curation", words: cur, tone: curationTone(u.curation?.state) });
  return out;
}

/** The provenance a unit's name opens: a session `sub-<s>_ses-<label>` as <s>@<label>, a subject `sub-<s>`, or a stack by its id, where <s> is a subject id or a subject code (lower-case letters and digits); null where the name is withheld or of another form. */
export function provenanceOf(unit: string | null | undefined): { kind: "subject" | "session" | "stack"; id: string } | null {
  if (!unit) return null;
  const ses = /^sub-([0-9a-z]+)_ses-([^/\s]+)$/u.exec(unit);
  if (ses) return { kind: "session", id: `${ses[1]}@${ses[2]}` };
  const sub = /^sub-([0-9a-z]+)$/u.exec(unit);
  if (sub) return { kind: "subject", id: sub[1] };
  if (/^\d+$/u.test(unit)) return { kind: "stack", id: unit };
  return null;
}

/** The provenance a run's unit opens: the engine's `provenance` where it gives the field (null there means none), else what the unit's name tells. */
export function unitProvenance(u: UnitRun): { kind: "subject" | "session" | "stack"; id: string } | null {
  if (u.provenance !== undefined) return u.provenance && u.provenance.kind && u.provenance.id ? u.provenance : null;
  return provenanceOf(u.unit);
}

/** The provenance of a scan in the viewer: the stack's, and its session's as the runs name it. */
export function scanProvenance(s: { id: number; subjectId: number; label: string | null; day: string | null }): { stack: { kind: "stack"; id: string }; session: { kind: "session"; id: string } | null } {
  const label = s.label && s.label !== "" ? s.label : s.day ? s.day.replaceAll("-", "") : null;
  return { stack: { kind: "stack", id: String(s.id) }, session: label ? { kind: "session", id: `${s.subjectId}@${label}` } : null };
}
