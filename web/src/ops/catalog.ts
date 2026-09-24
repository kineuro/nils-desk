// SPDX-License-Identifier: AGPL-3.0-only
// The pipeline catalog's doors and pure parts (record 45 S6; record 43 S1 and
// S2): each entry by name and version with its pinned image, layout, level,
// parameters, typed inputs, outputs and the axes it may propose on; a run on
// a selection as the command line the jobs door queues, `run <pipeline>
// --select selection:<name>@<v> [--param id=value]... [--model m]...
// [--labels id]`; and a run's own account, counted.

import { door, type Json } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";

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
  selection?: string | null;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  device?: string | null;
  summary?: Json | null;
  error?: string | null;
  derivatives?: number[] | null;
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

/** What a run is asked over: a saved selection's version, or a frozen handle. */
export type Over = { selection: string; version: number } | { handle: number };

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
  if ("selection" in a.over) out.push("--select", `selection:${a.over.selection}@${a.over.version}`);
  else out.push("--handle", String(a.over.handle));
  for (const [id, v] of Object.entries(a.params)) if (v.trim() !== "") out.push("--param", `${id}=${v.trim()}`);
  for (const m of a.models) out.push("--model", m);
  if (a.labels !== null) out.push("--labels", String(a.labels));
  return out;
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
