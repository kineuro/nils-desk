// SPDX-License-Identifier: AGPL-3.0-only
// The pipeline catalog's doors and pure parts (record 45 S6; record 43 S1 and
// S2): each entry by name and version with its pinned image, layout, level,
// parameters, typed inputs, outputs and the axes it may propose on; a run on
// a selection as the command line the jobs door queues, `run <pipeline>
// --select selection:<name>@<v> [--param id=value]... [--model m]...
// [--labels id]`, or since record 55 (2026-10-12) straight over a dataset's
// or a cohort's main scans of a role, `--select main:<role>@dataset:<name>`,
// or of each role the pipeline needs, `--select main@dataset:<name>`; and a
// run's own account, counted.

import { door, type Json } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";
import { roleWord } from "../review/mainScans";

export interface Param {
  id: string;
  name: string;
  type: "Number" | "String" | "Flag";
  description?: string;
  "default-value"?: number | string | boolean;
  optional?: boolean;
  integer?: boolean;
  minimum?: number;
  maximum?: number;
  "value-choices"?: (number | string)[];
}

export interface TypedInput {
  id: string;
  type: string;
  optional?: boolean;
  description?: string;
}

export interface Output {
  id: string;
  kind: string;
  level?: "unit" | "run";
}

export interface Pipeline {
  id: number;
  name: string;
  version: string;
  label: string;
  tool_version?: string | null;
  description?: string | null;
  image: string;
  image_digest?: string | null;
  descriptor_digest?: string | null;
  layout: string;
  level: string;
  state: string;
  parameters?: Param[] | null;
  inputs?: TypedInput[] | null;
  outputs?: Output[] | null;
  needs?: { gpu?: string; "memory-gb"?: number; cores?: number } | null;
  proposals?: { axis: string }[] | null;
  /** The pick roles a unit of a bids input needs (`x-nils.input.roles`): a T1w and a FLAIR for samseg-lesions. */
  roles?: string[] | null;
}

/** The runtime as the catalog door answers it: whether this engine can run anything, and why not. */
export interface Capability {
  enabled: boolean;
  reason?: string | null;
  runtime?: { name: string; version?: string; gpu?: boolean } | null;
  place?: string | null;
}

export interface Run {
  id: number;
  pipeline_id: number;
  pipeline: string;
  job_id: number | null;
  /** A saved selection's spec, or a dataset's or a cohort's main scans (`main:t1w@dataset:study-anon`). */
  selection?: string | null;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  device?: string | null;
  summary?: Json | null;
  error?: string | null;
  derivatives?: number[] | null;
  /** Set once its containers ended; a failed run without it is taken up again (`nils run --resume`). */
  results_digest?: string | null;
}

export interface LabelSet {
  id: number;
  name: string;
  version: number | string;
  what?: string | null;
  rows?: number | null;
  sealed?: boolean | null;
}

export const catalog = {
  list: () => door<{ pipelines: Pipeline[]; capability: Capability | null }>("GET", "/api/pipelines"),
  runs: (limit = 50) => door<{ runs: Run[] }>("GET", `/api/pipeline-runs?limit=${limit}`),
  selection: (name: string) => door<{ name: string; version: number }>("GET", `/api/ask/selections/${encodeURIComponent(name)}`),
  labelSets: () => door<{ label_sets: LabelSet[] }>("GET", "/api/label-sets"),
  models: () => door<{ models: { id: number; name: string; version: string; task: string; state: string; kind: string }[] }>("GET", "/api/models"),
};

/** What a person may do on the catalog, by grant, door and runtime. */
export function catalogActs(caps: Capabilities, capability: Capability | null): { see: boolean; run: boolean; why: string | null } {
  const see = may(caps, "pipelines:see") && served(caps, "GET /api/pipelines");
  if (!see) return { see, run: false, why: null };
  if (!capability?.enabled) return { see, run: false, why: capability?.reason ?? "No container runtime is available to this engine." };
  if (!may(caps, "pipelines:work")) return { see, run: false, why: "Running a pipeline needs work on the Pipelines page." };
  if (!served(caps, "POST /api/jobs")) return { see, run: false, why: "This engine queues no jobs at its door." };
  return { see, run: true, why: null };
}

/** A parameter's value as the run takes it, or why it is not one. */
export function paramError(p: Param, raw: string): string | null {
  const v = raw.trim();
  if (v === "") return p.optional || p["default-value"] !== undefined ? null : `${p.name} is needed`;
  if (p.type === "Number") {
    const x = Number(v);
    if (!Number.isFinite(x)) return `${p.name} is a number`;
    if (p.integer && !Number.isInteger(x)) return `${p.name} is a whole number`;
    if (p.minimum !== undefined && x < p.minimum) return `${p.name} is at least ${p.minimum}`;
    if (p.maximum !== undefined && x > p.maximum) return `${p.name} is at most ${p.maximum}`;
  }
  if (p["value-choices"] && !p["value-choices"].map(String).includes(v)) return `${p.name} is one of ${p["value-choices"].join(", ")}`;
  return null;
}

/** A dataset's or a cohort's main scans of a role (record 55, 2026-10-12): resolved and frozen when the run is made. Since 2026-10-12 a role of null takes those of each role the run's pipeline needs (`main@dataset:<name>`). */
export interface MainOver {
  kind: "dataset" | "cohort";
  name: string;
  role: string | null;
  /** Where the role is null, the roles the pipeline needs, for the words alone: the engine reads them from the pipeline. */
  roles?: string[] | null;
}

/** What a run is asked over: a saved selection's version, a dataset's or a cohort's main scans of a role, or a frozen handle. */
export type Over = { selection: string; version: number } | { main: MainOver } | { handle: number };

/** The roles a run over main scans takes: the served pack's, as the engine names them (`main_roles`), else the MRI pack's. */
export function mainRoles(caps: Capabilities): string[] {
  const packs = caps.engine?.packs ?? [];
  const pack = packs.find((p) => p.name === "mri" && p.main_roles?.length) ?? packs.find((p) => p.main_roles?.length);
  return pack?.main_roles?.length ? pack.main_roles : ["t1w", "flair", "t2w"];
}

/** A dataset's or a cohort's main scans as the engine takes them: `main:t1w@dataset:study-anon`, or of each role the pipeline needs `main@dataset:study-anon`. */
export const mainSpec = (m: MainOver): string => (m.role ? `main:${m.role}@${m.kind}:${m.name}` : `main@${m.kind}:${m.name}`);

/** The main scans a spec names, or null where it names none: of a role, or (role null) of each role the pipeline needs. */
export function mainOfSpec(spec: string | null | undefined): MainOver | null {
  const m = /^\s*main:\s*([a-z0-9_+-]+)\s*@\s*(dataset|cohort)\s*:\s*(\S(?:.*\S)?)\s*$/iu.exec(spec ?? "");
  if (m) return { role: m[1].toLowerCase(), kind: m[2].toLowerCase() as MainOver["kind"], name: m[3] };
  const e = /^\s*main\s*@\s*(dataset|cohort)\s*:\s*(\S(?:.*\S)?)\s*$/iu.exec(spec ?? "");
  return e ? { role: null, kind: e[1].toLowerCase() as MainOver["kind"], name: e[2] } : null;
}

/** Words joined as a person lists them: "T1w and FLAIR", "T1w, FLAIR and T2w". */
export function andWords(words: string[]): string {
  return words.length <= 1 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** The roles of a scope's main scans in words: "T1w", "T1w + FLAIR"; "scans" where the roles are not known here. */
export function mainRolesWords(m: Pick<MainOver, "role" | "roles">): string {
  if (m.role) return roleWord(m.role);
  const r = (m.roles ?? []).map(roleWord);
  return r.length > 0 ? r.join(" + ") : "scans";
}

/** A dataset's or a cohort's main scans in a person's words: "study-anon · main T1w", "study-anon · main T1w + FLAIR". */
export const mainWords = (m: MainOver): string => `${m.name} · main ${mainRolesWords(m)}`;

/** What a run went over, as the runs table shows it: a scope's main scans in words (with the roles its run read, where it says them), a selection's spec as it is. */
export function overWords(selection: string | null | undefined, roles: string[] | null = null): string {
  const m = mainOfSpec(selection);
  return m ? mainWords(m.role ? m : { ...m, roles }) : (selection ?? "");
}

/** The pick roles a pipeline's units need, as its catalog entry names them. */
export function pipelineRoles(p: Pick<Pipeline, "roles"> & { descriptor?: Json | null }): string[] {
  if (Array.isArray(p.roles)) return p.roles.filter((r): r is string => typeof r === "string");
  const xn = ((p.descriptor ?? {}) as Json)["x-nils"] as Json | undefined;
  const roles = ((xn?.input ?? {}) as Json).roles;
  return Array.isArray(roles) ? roles.filter((r): r is string => typeof r === "string") : [];
}

/** The body a pre-flight is asked with, and the `--select` or `--handle` a run is queued with. */
export function selectOf(over: Over): { select: string } | { handle: number } {
  if ("selection" in over) return { select: `selection:${over.selection}@${over.version}` };
  if ("main" in over) return { select: mainSpec(over.main) };
  return { handle: over.handle };
}

export interface RunAsk {
  pipeline: Pick<Pipeline, "label">;
  over: Over;
  /** Only the parameters a person changed from their default; the rest take theirs, and the run records every one. */
  params: Record<string, string>;
  models: string[];
  labels: number | null;
}

/** The command line the jobs door queues for a run. */
export function runCommand(a: RunAsk): string[] {
  const out = ["run", a.pipeline.label];
  const over = selectOf(a.over);
  if ("select" in over) out.push("--select", over.select);
  else out.push("--handle", String(over.handle));
  for (const [id, v] of Object.entries(a.params)) if (v.trim() !== "") out.push("--param", `${id}=${v.trim()}`);
  for (const m of a.models) out.push("--model", m);
  if (a.labels !== null) out.push("--labels", String(a.labels));
  return out;
}

/** The flags the engine adds to a run it queues, which a door refuses from a caller: dropped when a stopped job's command is queued again. */
const ADDED = new Set(["--pack-dir", "--dcm2niix"]);

/** A queued run's command line as a door takes it again: without the flags the engine added to it. */
export function requeued(command: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < command.length; i++) {
    if (ADDED.has(command[i])) {
      i++;
      continue;
    }
    out.push(command[i]);
  }
  return out;
}

/** What a queued run's command line names (2026-10-12, for Run again on a stopped job): its pipeline, what it goes over and the parameters given; null for a run taken up again, or one it cannot read. */
export function overOfCommand(command: string[]): { pipeline: string; over: Over; params: Record<string, string> } | null {
  if (command[0] !== "run") return null;
  let pipeline: string | null = null;
  let over: Over | null = null;
  const params: Record<string, string> = {};
  for (let i = 1; i < command.length; i++) {
    const w = command[i];
    const v = command[i + 1];
    if (w === "--resume") return null;
    if (w.startsWith("--")) {
      if (v === undefined) return null;
      if (w === "--select") {
        const main = mainOfSpec(v);
        const sel = /^(?:selection:)?([^@]+)@(\d+)$/u.exec(v);
        over = main ? { main } : sel ? { selection: sel[1], version: Number(sel[2]) } : null;
      } else if (w === "--handle") over = /^\d+$/u.test(v) ? { handle: Number(v) } : null;
      else if (w === "--param" && v.includes("=")) params[v.slice(0, v.indexOf("="))] = v.slice(v.indexOf("=") + 1);
      i++;
    } else if (pipeline === null) pipeline = w;
  }
  return pipeline && over ? { pipeline, over, params } : null;
}

/** The typed inputs a person names for a run: the models it reads and the label set, where the descriptor declares them. */
export function needsOf(p: Pipeline): { models: TypedInput[]; labels: TypedInput | null; derivatives: TypedInput[] } {
  const inputs = p.inputs ?? [];
  return {
    models: inputs.filter((i) => i.type === "model"),
    labels: inputs.find((i) => i.type === "label_set") ?? null,
    derivatives: inputs.filter((i) => i.type.startsWith("derivative:")),
  };
}

/** What a run writes, in words: the derivatives by kind and level, and the axes it proposes on. */
export function writesWords(p: Pipeline): string {
  const outs = (p.outputs ?? []).map((o) => (o.level === "run" ? `one ${o.kind} for the run` : `${/^[aeiou]/u.test(o.kind) ? "an" : "a"} ${o.kind} per ${p.level}`));
  const axes = (p.proposals ?? []).map((x) => x.axis);
  return [...outs, axes.length > 0 ? `proposals on ${axes.join(", ")}, staged at the model's threshold for a person to commit` : null].filter(Boolean).join("; ");
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** A run's account, counted: units, derivatives, proposals staged and asked, models registered. */
export function runCounts(r: Run): { units: number; failed: number; derivatives: number; staged: number; asked: number; models: number } {
  const s = (r.summary ?? {}) as Json;
  const units = (s.units ?? {}) as Json;
  const proposals = (s.proposals ?? {}) as Json;
  const ingested = (proposals.ingested ?? {}) as Json;
  return {
    units: num(units.total),
    failed: num(units.failed) + num(units.unreported),
    derivatives: num(s.derivatives) || (r.derivatives?.length ?? 0),
    staged: num(ingested.staged_members),
    asked: Math.max(0, num(ingested.members) - num(ingested.staged_members)),
    models: Array.isArray(s.models) ? s.models.length : 0,
  };
}

/** The image as a line: the repository and the short digest it is pinned by. */
export function imageWords(p: Pick<Pipeline, "image">): string {
  const m = /^(.*)@sha256:([0-9a-f]{12})[0-9a-f]*$/.exec(p.image);
  return m ? `${m[1]}@sha256:${m[2]}` : p.image;
}
