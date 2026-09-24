// SPDX-License-Identifier: AGPL-3.0-only
// A pipeline run, before and after (record 49 A7): the pre-flight the engine
// answers before anything runs (units, the ones that lack an input and why,
// the time, the GPU, the lane's budget), a run's units by state, resume and
// cancel, its table of measures as the ask reads them (per scan at detail
// quasi, totals over groups of 5 scans or more below it, R4 and R4b), its
// checks and breaches, and the assistant's plan (a run document from the
// analysis-plan station) as a run the person starts. The desk counts
// nothing itself: every number is the engine's.

import { door, type Json } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may, sees } from "../grants";
import type { Over, Pipeline } from "./catalog";

const n = (v: number) => v.toLocaleString("en-US");
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const text = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const obj = (v: unknown): Json => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});

/** The pre-flight as `POST /api/pipelines/{name}/preflight` answers it. */
export interface Preflight {
  pipeline: string;
  pipeline_id?: number;
  handle?: number | null;
  selection?: string | null;
  params?: Record<string, unknown> | null;
  layout?: string;
  level?: string;
  stacks?: number;
  units: { total: number; ready: number; missing: number };
  missing?: { unit: string | null; subject_id?: number | null; session_day?: string | null; stack_id?: number | null; why: string }[];
  roles?: string[] | null;
  left_out?: { stacks: number; why: string | null } | null;
  estimate?: { seconds_per_unit: number | null; source: string | null; runs?: number | null; slots?: number | null; units_apart?: boolean | null; seconds: number | null } | null;
  gpu?: { need: string; available: boolean | null; device: string | null } | null;
  needs?: { cores: number | null; memory_gb: number | null } | null;
  budget?: { cores: number | null; memory_gb: number | null; source?: string | null; why?: string | null; fits: boolean | null } | null;
  checks?: unknown[] | null;
  runtime?: string | Json | null;
  place?: string | null;
  ready: boolean;
  blockers?: string[] | null;
}

export interface UnitRun {
  unit: string | null;
  state: string;
  status: string | null;
  attempts: number | null;
  device?: string | null;
  gpu_card?: number | null;
  cores?: number | null;
  memory_mb?: number | null;
  exit_code?: number | null;
  started_at: string | null;
  finished_at: string | null;
}

export interface Breach {
  metric: string;
  value: number | null;
  check: string;
  op?: string;
  threshold?: number;
  description?: string | null;
}

/** One run as `GET /api/pipeline-runs/{id}` answers it. */
export interface RunDetail {
  id: number;
  pipeline_id: number;
  pipeline: string;
  job_id: number | null;
  handle_id?: number | null;
  selection?: string | null;
  params?: Record<string, unknown> | null;
  runtime?: string | null;
  device?: string | null;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  results_digest?: string | null;
  units?: string | null;
  resumes?: number | null;
  unit_states?: Record<string, number> | null;
  units_run?: UnitRun[] | null;
  summary?: Json | null;
  error?: string | null;
  derivatives?: number[] | null;
}

export interface Derivative {
  id: number;
  kind: string;
  scope?: string | null;
  stack_id?: number | null;
  bytes: number;
  sha256: string;
  media_type?: string | null;
  path?: string | null;
}

export const runs = {
  /** The pipeline by its catalog id, or a name; the door reads its path as it stands, so a name@version is not sent encoded. */
  preflight: (pipeline: number | string, over: Over, params: Record<string, string>) =>
    door<Preflight>("POST", `/api/pipelines/${typeof pipeline === "number" ? pipeline : encodeURIComponent(pipeline).replace(/%40/gu, "@")}/preflight`, { ...("selection" in over ? { select: `selection:${over.selection}@${over.version}` } : { handle: over.handle }), params }),
  get: (id: number) => door<RunDetail>("GET", `/api/pipeline-runs/${id}`),
  derivatives: (run: number) => door<{ derivatives: Derivative[] }>("GET", `/api/derivatives?run=${run}&limit=200`),
  job: (id: number) => door<{ id: number; state: string; started_at: string | null }>("GET", `/api/jobs/${id}`),
  /** The ask, as the Query page runs it: one bounded page of rows. */
  ask: (document: Json) =>
    door<{ columns: (string | { name: string })[]; rows: unknown[][]; truncated?: boolean }>("POST", "/api/ask/run", { document, limit: 500 }).then((a) => ({
      columns: a.columns.map((c) => (typeof c === "string" ? c : c.name)),
      rows: a.rows,
      truncated: a.truncated === true,
    })),
};

/** What a person may do around a run, by grant and door; a door the engine lacks offers nothing. */
export function runActs(caps: Capabilities): { preflight: boolean; open: boolean; queue: boolean; cancel: boolean; table: boolean; perScan: boolean; review: boolean; files: boolean } {
  const see = may(caps, "pipelines:see");
  const work = may(caps, "pipelines:work") && sees(caps, "quasi");
  return {
    preflight: see && served(caps, "POST /api/pipelines/{name}/preflight"),
    open: see && served(caps, "GET /api/pipeline-runs/{id}"),
    queue: work && served(caps, "POST /api/jobs"),
    cancel: work && served(caps, "POST /api/jobs/{id}/cancel"),
    table: may(caps, "query:work") && served(caps, "POST /api/ask/run"),
    perScan: sees(caps, "quasi"),
    review: may(caps, "review:see") && served(caps, "GET /api/review"),
    files: see && served(caps, "GET /api/derivatives"),
  };
}

/** Seconds in a person's words: "under a minute", "about 40 min", "about 3 h". */
export function durationWords(s: number | null | undefined): string {
  if (s === null || s === undefined || !Number.isFinite(s)) return "not known";
  if (s < 60) return "under a minute";
  if (s < 5400) return `about ${n(Math.round(s / 60))} min`;
  if (s < 172_800) return `about ${n(Math.round(s / 360) / 10)} h`;
  return `about ${n(Math.round(s / 8640) / 10)} days`;
}

/** The pre-flight as the values a person reads before pressing Run. */
export function preflightCells(p: Preflight): { k: string; v: string; title?: string }[] {
  const cells: { k: string; v: string; title?: string }[] = [];
  cells.push({ k: "units", v: `${n(p.units.ready)} of ${n(p.units.total)} ready` });
  if (p.units.missing > 0) cells.push({ k: "missing an input", v: n(p.units.missing) });
  if (p.left_out && p.left_out.stacks > 0) cells.push({ k: "stacks left out", v: n(p.left_out.stacks), title: p.left_out.why ?? undefined });
  const e = p.estimate;
  if (e) {
    const src = e.source === "runs" ? `from ${e.runs ? `${n(e.runs)} ` : ""}past runs here` : e.source === "descriptor" ? "from the descriptor" : "no estimate";
    cells.push({ k: "time", v: e.seconds === null ? "not known" : durationWords(e.seconds), title: `${src}${e.slots ? `, ${n(e.slots)} at once` : ""}` });
  }
  const g = p.gpu;
  if (g) cells.push({ k: "GPU", v: g.need === "none" ? "none" : g.available ? `${g.need}, ${g.device ?? "free"}` : g.need === "optional" ? "optional, runs on the CPU" : "needed, none free" });
  const b = p.budget;
  if (b) {
    const unit = p.needs ? `${p.needs.cores ?? "?"} cores, ${p.needs.memory_gb ?? "?"} GB a unit` : null;
    const gb = b.memory_gb === null ? "?" : n(Math.round(b.memory_gb));
    cells.push({ k: "budget", v: b.fits === false ? "does not fit" : `${b.cores ?? "?"} cores, ${gb} GB`, title: [unit, b.why ?? null].filter(Boolean).join("; ") || undefined });
  }
  return cells;
}

/** The units that lack an input, folded by why: "3 · no FLAIR picked". Below detail quasi the engine names no unit. */
export function missingByWhy(p: Preflight): { why: string; count: number; units: string[] }[] {
  const by = new Map<string, { why: string; count: number; units: string[] }>();
  for (const m of p.missing ?? []) {
    const k = m.why || "no reason given";
    const row = by.get(k) ?? { why: k, count: 0, units: [] };
    row.count += 1;
    if (m.unit) row.units.push(m.unit);
    by.set(k, row);
  }
  return [...by.values()].sort((a, b) => b.count - a.count);
}

/** Whether the pre-flight lets the Run press go: the engine's own `ready`, and its blockers as said. */
export function preflightGate(p: Preflight | null): { go: boolean; why: string | null } {
  if (p === null) return { go: true, why: null };
  if (p.ready) return { go: true, why: null };
  const b = (p.blockers ?? []).filter(Boolean);
  return { go: false, why: b.length > 0 ? b.join("; ") : "the pre-flight says the run is not ready" };
}

/** The range a parameter takes, in a few words, from its descriptor. */
export function rangeWords(p: Pipeline["parameters"] extends (infer P)[] | null | undefined ? P : never): string | null {
  if (!p) return null;
  if (p["value-choices"]) return `one of ${p["value-choices"].join(", ")}`;
  const lo = p.minimum;
  const hi = p.maximum;
  const whole = p.integer ? "whole, " : "";
  if (lo !== undefined && hi !== undefined) return `${whole}${lo} to ${hi}`;
  if (lo !== undefined) return `${whole}at least ${lo}`;
  if (hi !== undefined) return `${whole}at most ${hi}`;
  return p.integer ? "a whole number" : null;
}

export type UnitTone = "running" | "waiting" | "done" | "failed" | "kept";

/** A unit's state in one word: running, waiting, done, failed, or kept (finished before the run was taken up again). */
export function unitTone(u: UnitRun, resumedAt: string | null): UnitTone {
  if (u.state === "running" || u.state === "registering") return "running";
  if (u.state === "queued") return "waiting";
  const ok = u.status === "succeeded" || u.status === "skipped";
  if (ok && resumedAt !== null && u.finished_at !== null && Date.parse(u.finished_at) < Date.parse(resumedAt)) return "kept";
  return ok ? "done" : "failed";
}

/** The units counted by tone, in the order a person reads them. */
export function unitCounts(units: UnitRun[], resumedAt: string | null): Record<UnitTone, number> {
  const out: Record<UnitTone, number> = { running: 0, waiting: 0, done: 0, failed: 0, kept: 0 };
  for (const u of units) out[unitTone(u, resumedAt)] += 1;
  return out;
}

/** Whether a run can be taken up again: one that stopped with units left, as `nils run --resume` takes it. */
export function resumable(r: RunDetail, jobAlive: boolean): boolean {
  if (r.status === "cancelled" || r.status === "interrupted") return true;
  if (r.status === "failed") return !r.results_digest;
  if (r.status === "running") return !jobAlive;
  return false;
}

/** The command line that takes a run up again. */
export function resumeCommand(r: Pick<RunDetail, "id">): string[] {
  return ["run", "--resume", String(r.id)];
}

/** A run's checks and breaches, from its summary. */
export function checksOf(r: RunDetail): { declared: number; breaches: number; unchecked: number; units: { unit: string | null; breaches: Breach[] }[]; items: number } {
  const s = obj(r.summary);
  const numbers = obj(s.numbers);
  const c = obj(numbers.checks);
  const list = Array.isArray(s.breaches) ? (s.breaches as Json[]) : [];
  const items = Array.isArray(s.review_items) ? s.review_items.length : (num(s.review_items) ?? 0);
  return {
    declared: num(c.declared) ?? 0,
    breaches: num(c.breaches) ?? 0,
    unchecked: num(c.unchecked) ?? 0,
    units: list.map((b) => ({
      unit: text(b.unit),
      breaches: (Array.isArray(b.breaches) ? (b.breaches as Json[]) : []).map((x) => ({ metric: String(x.metric ?? ""), value: num(x.value), check: String(x.check ?? ""), op: text(x.op) ?? undefined, threshold: num(x.threshold) ?? undefined, description: text(x.description) })),
    })),
    items,
  };
}

/** The breaches folded by check: "snr >= 8 · 3 units". What a reader below detail quasi is shown: no unit, no value. */
export function breachesByCheck(r: RunDetail): { check: string; units: number }[] {
  const by = new Map<string, number>();
  for (const u of checksOf(r).units) for (const b of u.breaches) by.set(b.check || b.metric, (by.get(b.check || b.metric) ?? 0) + 1);
  return [...by.entries()].map(([check, units]) => ({ check, units })).sort((a, b) => b.units - a.units);
}

/** The measure columns a pipeline declares: each table output's columns, and each check's metric, as the ask names them. */
export interface MeasureColumn {
  name: string;
  field: string;
  numeric: boolean;
  unit: string | null;
}

export function measureColumns(p: Pick<Pipeline, "name" | "outputs"> & { descriptor?: Json | null; checks?: unknown[] | null }): MeasureColumn[] {
  const out: MeasureColumn[] = [];
  const seen = new Set<string>();
  const add = (name: string, numeric: boolean, unit: string | null) => {
    if (!/^[a-z][a-z0-9_]*$/.test(name) || seen.has(name)) return;
    seen.add(name);
    out.push({ name, field: `measure.${p.name}.${name}`, numeric, unit });
  };
  const xn = obj(obj(p.descriptor)["x-nils"]);
  const outputs = (Array.isArray(xn.outputs) ? xn.outputs : (p.outputs ?? [])) as Json[];
  for (const o of outputs) {
    if (o.kind !== "table" || !Array.isArray(o.columns)) continue;
    for (const c of o.columns as Json[]) {
      const name = text(c.name);
      if (name) add(name, c.type !== "text", text(c.unit));
    }
  }
  const checks = (Array.isArray(xn.qc) ? xn.qc : (p.checks ?? [])) as unknown[];
  for (const c of checks) {
    const metric = typeof c === "string" ? /^\s*([a-z][a-z0-9_]*)/.exec(c)?.[1] : text(obj(c).metric);
    if (metric) add(metric, true, null);
  }
  return out;
}

/** The ask's grain for a pipeline's unit: a stack, a session or a subject. */
export function grainOf(level: string | null | undefined): "stack" | "session" | "subject" {
  return level === "session" ? "session" : level === "participant" || level === "subject" ? "subject" : "stack";
}

/** The fields a reader below detail quasi may group a run's totals by, per grain: none of them a measure. */
export function groupBy(level: string | null | undefined): { field: string; label: string }[] {
  const sex = { field: "subject.sex", label: "sex" };
  return grainOf(level) === "stack" ? [sex, { field: "manufacturer", label: "scanner maker" }, { field: "field_strength_tesla", label: "field strength" }] : [sex];
}

/**
 * The ask that reads a run's table. At detail quasi, one row per scan the
 * run measured (the values the ask reads now name this run). Below it, the
 * totals over groups of the chosen field: the scans, and each numeric
 * column's mean; the engine withholds a group's totals under 5 scans.
 */
export function tableAsk(a: { pipeline: string; level: string | null | undefined; run: number; columns: MeasureColumn[]; perScan: boolean; by: string }): Json {
  const grain = grainOf(a.level);
  const f = (path: string) => ["field", {}, path];
  const where = [["=", {}, f(`measure.${a.pipeline}.run`), a.run]];
  if (a.perScan) {
    return {
      ast_version: 1,
      sets: { s: { grain, where } },
      out: { set: "s", level: "record", columns: [f("id"), ...a.columns.map((c) => f(c.field))], order: [[f("id"), "asc"]] },
    };
  }
  const numeric = a.columns.filter((c) => c.numeric);
  const bind: Json = { scans: ["count", { set: "s" }] };
  for (const c of numeric) bind[`mean_${c.name}`] = ["avg", { set: "s" }, f(c.field)];
  return {
    ast_version: 1,
    sets: { s: { grain, where }, g: { grain: "group", group: { of: "s", by: [f(a.by)] }, bind } },
    out: { set: "g", level: "aggregate", columns: [f(a.by), f("scans"), ...numeric.map((c) => f(`mean_${c.name}`))] },
  };
}

/** A cell as the table shows it: a number rounded to what a reader needs, a blank the engine withheld as withheld. */
export function cellWords(v: unknown): string {
  if (v === null || v === undefined || v === "") return "withheld";
  if (typeof v === "number") return Number.isInteger(v) ? n(v) : v.toLocaleString("en-US", { maximumSignificantDigits: 4 });
  return String(v);
}

/** The columns a person reads: the engine's own keys (`_key`, `_subject`) left out, with the index of each kept. */
export function shownColumns(columns: string[]): { name: string; at: number }[] {
  return columns.map((name, at) => ({ name, at })).filter((c) => !c.name.startsWith("_"));
}

/** A column's header as a person reads it: the measure's own name. */
export function headerWords(name: string): string {
  const last = name.split(".").pop() ?? name;
  return last.replace(/^mean_/, "mean ").replace(/_/g, " ");
}

/**
 * The assistant's run document (record 49 A5): the selection, the pipeline
 * and its version, the parameters within the descriptor's ranges, and the
 * pre-flight it saw, with the sentence that says why. Read from the station
 * run's verdict, where the result holds it as `run_document`, `document` or
 * itself; anything else is not a plan.
 */
export interface RunDocument {
  pipeline: string;
  over: Over;
  params: Record<string, string>;
  preflight: Preflight | null;
  why: string | null;
  question: string | null;
}

export function runDocumentOf(result: unknown): RunDocument | null {
  const r = obj(result);
  const d = [r.run_document, r.document, r].map(obj).find((x) => typeof x.pipeline === "string") ?? null;
  if (!d) return null;
  const pipeline = String(d.pipeline);
  let over: Over | null = null;
  const sel = typeof d.select === "string" ? d.select : typeof d.selection === "string" ? d.selection : null;
  const m = sel ? /^(?:selection:)?([^@]+)@(\d+)$/.exec(sel) : null;
  if (m) over = { selection: m[1], version: Number(m[2]) };
  else if (d.selection && typeof d.selection === "object") {
    const s = obj(d.selection);
    if (typeof s.name === "string" && num(s.version) !== null) over = { selection: s.name, version: num(s.version)! };
  }
  if (!over && num(d.handle) !== null) over = { handle: num(d.handle)! };
  if (!over) return null;
  const params: Record<string, string> = {};
  const p = d.params;
  if (Array.isArray(p)) {
    for (const w of p) if (typeof w === "string" && w.includes("=")) params[w.slice(0, w.indexOf("="))] = w.slice(w.indexOf("=") + 1);
  } else for (const [k, v] of Object.entries(obj(p))) if (v !== null && v !== undefined) params[k] = String(v);
  const pf = obj(d.preflight);
  return {
    pipeline,
    over,
    params,
    preflight: pf.units && typeof pf.ready === "boolean" ? (pf as unknown as Preflight) : null,
    why: text(d.why) ?? text(d.explanation) ?? text(r.sentence),
    question: text(d.question) ?? text(r.question),
  };
}

/** The pipeline a run document names, from the catalog: by id, name@version, or the newest active version of a name. */
export function pipelineOf(catalog: Pipeline[], name: string): Pipeline | null {
  const exact = catalog.find((p) => p.label === name || String(p.id) === name);
  if (exact) return exact;
  const versions = catalog.filter((p) => p.name === name && p.state !== "retired");
  return versions.sort((a, b) => b.id - a.id)[0] ?? null;
}
