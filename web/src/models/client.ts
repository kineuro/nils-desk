// SPDX-License-Identifier: AGPL-3.0-only
// The Models section's doors and pure parts (record 45 S6; record 42 S2): the
// registered models by task and slot, one model with its card and events,
// and the lifecycle a person moves it through: registered, admitted by a
// check that passed, promoted in its task and slot (which retires the one
// promoted before), retired. The engine refuses what the lifecycle does not
// allow, and the page shows its words.

import { door, type Json } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";

export type ModelState = "registered" | "admitted" | "promoted" | "retired";

export interface Check {
  suite: string;
  version?: string;
  passed: boolean;
  checks: { name: string; passed: boolean; value?: number | string | null; threshold?: number | string | null }[];
  at?: string;
}

export interface ModelEvent {
  transition: string;
  by: string;
  at: string;
  detail?: Json | null;
}

/** A model as `GET /api/models/{id}` answers it (contracts/model/v1/lifecycle.schema.json). */
export interface Model {
  id: number;
  name: string;
  version: string;
  kind: string;
  digest: string;
  task: string;
  slot: string;
  state: ModelState;
  card: Json;
  encoder_model_id?: number | null;
  encoder_model_ids?: number[];
  threshold?: number | null;
  trained_on?: string | null;
  check?: Check | null;
  registered_by: string;
  registered_at: string;
  admitted_by?: string | null;
  admitted_at?: string | null;
  promoted_by?: string | null;
  promoted_at?: string | null;
  retired_by?: string | null;
  retired_at?: string | null;
  review_item?: number | null;
  events?: ModelEvent[];
}

/** A model a pipeline run fitted and registered, as the run's summary names it. */
export interface Fitted {
  output: string;
  model: string;
  derivative: number | null;
  encoders: number[];
  trained_on: string | null;
}

export interface RunRow {
  id: number;
  pipeline: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  summary?: Json | null;
}

export const models = {
  list: (f: { task?: string; slot?: string; state?: ModelState } = {}) => {
    const q = Object.entries(f)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join("&");
    return door<{ count: number; models: Model[] }>("GET", `/api/models${q ? `?${q}` : ""}`);
  },
  get: (id: number) => door<Model>("GET", `/api/models/${id}`),
  register: (card: Json) => door<Model>("POST", "/api/models", card),
  admit: (id: number, check: Check) => door<Model>("POST", `/api/models/${id}/admit`, check),
  promote: (id: number, why?: string) => door<{ model: Model; retired: Model | null }>("POST", `/api/models/${id}/promote`, why ? { why } : {}),
  retire: (id: number, why?: string) => door<Model>("POST", `/api/models/${id}/retire`, why ? { why } : {}),
  runs: (limit = 50) => door<{ runs: RunRow[] }>("GET", `/api/pipeline-runs?limit=${limit}`),
};

const STATES: ModelState[] = ["promoted", "admitted", "registered", "retired"];

/** One task's slots, each with its promoted model and the rest by state. */
export interface TaskSlot {
  task: string;
  slot: string;
  promoted: Model | null;
  others: Model[];
}

/** The models by task and slot, the tasks in name order, a slot's models promoted first and then newest first. */
export function byTask(list: Model[]): TaskSlot[] {
  const map = new Map<string, TaskSlot>();
  for (const m of list) {
    const key = `${m.task}\u0000${m.slot}`;
    const t = map.get(key) ?? { task: m.task, slot: m.slot, promoted: null, others: [] };
    if (m.state === "promoted" && t.promoted === null) t.promoted = m;
    else t.others.push(m);
    map.set(key, t);
  }
  for (const t of map.values()) t.others.sort((a, b) => STATES.indexOf(a.state) - STATES.indexOf(b.state) || b.id - a.id);
  return [...map.values()].sort((a, b) => a.task.localeCompare(b.task) || (a.slot === "site" ? -1 : b.slot === "site" ? 1 : a.slot.localeCompare(b.slot)));
}

/** A model by its name, as people call it. */
export function label(m: Pick<Model, "name" | "version">): string {
  return `${m.name}@${m.version}`;
}

/** A digest shortened for a line: the first twelve hex digits. */
export function shortDigest(d: string | null | undefined): string {
  if (!d) return "";
  const hex = d.replace(/^sha256:/, "");
  return `sha256:${hex.slice(0, 12)}`;
}

/** The state in words and its tone. */
export function stateTag(s: ModelState): { words: string; tone: "ok" | "brand" | "caution" | "" } {
  if (s === "promoted") return { words: "promoted", tone: "ok" };
  if (s === "admitted") return { words: "admitted", tone: "brand" };
  if (s === "registered") return { words: "registered", tone: "caution" };
  return { words: "retired", tone: "" };
}

/** The label set a model was trained on, from its card. */
export function trainedOn(m: Model): { digest: string; name: string | null; rows: number | null; sealed: boolean | null } | null {
  const t = (m.card?.trained_on ?? null) as Json | null;
  const digest = t && typeof t.label_set === "string" ? t.label_set : (m.trained_on ?? null);
  if (!digest) return null;
  return {
    digest,
    name: t && typeof t.name === "string" ? t.name : null,
    rows: t && typeof t.rows === "number" ? t.rows : null,
    sealed: t && typeof t.sealed === "boolean" ? t.sealed : null,
  };
}

/** The encoders a head reads, in order: the registered ids where the engine names them, else the card's references. */
export function encodersOf(m: Model): { id: number | null; words: string }[] {
  const ids = m.encoder_model_ids && m.encoder_model_ids.length > 0 ? m.encoder_model_ids : m.encoder_model_id != null ? [m.encoder_model_id] : [];
  const refs = Array.isArray(m.card?.encoders) ? (m.card.encoders as Json[]) : m.card?.encoder ? [m.card.encoder as Json] : [];
  const n = Math.max(ids.length, refs.length);
  const out: { id: number | null; words: string }[] = [];
  for (let i = 0; i < n; i++) {
    const r = refs[i] ?? {};
    const named = typeof r.name === "string" ? `${r.name}${typeof r.version === "string" ? `@${r.version}` : ""}` : shortDigest(typeof r.digest === "string" ? r.digest : null);
    out.push({ id: ids[i] ?? null, words: named || `model ${ids[i]}` });
  }
  return out;
}

/** The models a run fitted and registered, from its summary. */
export function fittedBy(run: RunRow): Fitted[] {
  const list = (run.summary?.models ?? null) as Json[] | null;
  if (!Array.isArray(list)) return [];
  return list.map((f) => ({
    output: typeof f.output === "string" ? f.output : "",
    model: typeof f.model === "string" ? f.model : String(f.model ?? ""),
    derivative: typeof f.derivative === "number" ? f.derivative : null,
    encoders: Array.isArray(f.encoders) ? f.encoders.filter((x): x is number => typeof x === "number") : [],
    trained_on: typeof f.trained_on === "string" ? f.trained_on : null,
  }));
}

/** Why a run's model outputs were not registered, in the engine's words. */
export function refusedModels(run: RunRow): string[] {
  const refused = (run.summary?.refused_files ?? null) as Json[] | null;
  if (!Array.isArray(refused)) return [];
  // a model output's refusal names its output; a unit's file refusal names a unit and is the pipeline:qc item's
  return refused.flatMap((r) => (typeof r.why === "string" && typeof r.output === "string" && r.unit === undefined ? [`${r.output}: ${r.why}`] : []));
}

/** What a person may do on the Models pages, by grant and door. */
export function modelActs(caps: Capabilities): { register: boolean; admit: boolean; promote: boolean; retire: boolean; runs: boolean } {
  const work = may(caps, "models:work");
  return {
    register: work && served(caps, "POST /api/models"),
    admit: work && served(caps, "POST /api/models/{id}/admit"),
    promote: work && served(caps, "POST /api/models/{id}/promote"),
    retire: work && served(caps, "POST /api/models/{id}/retire"),
    runs: may(caps, "pipelines:see") && served(caps, "GET /api/pipeline-runs"),
  };
}

/** Which acts a model's state leaves open. Promote is offered on a registered model too: the engine refuses it until a check admits it, and says why. */
export function openActs(m: Pick<Model, "state">): { admit: boolean; promote: boolean; retire: boolean } {
  return { admit: m.state === "registered", promote: m.state === "registered" || m.state === "admitted", retire: m.state !== "retired" };
}

/** A check whose passed agrees with its checks, as the admit door insists. */
export function checkOf(suite: string, rows: { name: string; passed: boolean; value: string; threshold: string }[]): Check {
  const val = (s: string): number | string | null => (s.trim() === "" ? null : Number.isFinite(Number(s)) ? Number(s) : s.trim());
  const checks = rows.filter((r) => r.name.trim() !== "").map((r) => ({ name: r.name.trim(), passed: r.passed, value: val(r.value), threshold: val(r.threshold) }));
  return { suite: suite.trim(), passed: checks.length > 0 && checks.every((c) => c.passed), checks };
}

/** The model promoted now in the same task and slot, which a promotion retires. */
export function promotedBeside(m: Model, list: Model[]): Model | null {
  return list.find((x) => x.id !== m.id && x.task === m.task && x.slot === m.slot && x.state === "promoted") ?? null;
}
