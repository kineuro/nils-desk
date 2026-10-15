// SPDX-License-Identifier: AGPL-3.0-only
// The Models page's doors and pure parts (record 45 S6; record 42 S2; record
// 55 D4, spec section 10.2): the registered models by task and slot, one
// model with its card and events, and the lifecycle a person moves it
// through: registered, admitted by a check that passed, promoted, retired.
// Since Wave 7a promotion retires nothing: several models live in a task and
// slot, and one is chosen there, by the site's admin or by default (the model
// a recorded certificate names, else the one promoted last, else the newest
// admitted). The engine refuses what the lifecycle does not allow, and the
// page shows its words. Record 55 ruling 22 (b): a certificate may cite the
// graded run that measured a model instead of a sample sealed in the
// registry; a person records it here, and the model shows it as certified.

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
  /** Spec section 10.2: whether its card is complete, and the fields it lacks. */
  complete?: boolean;
  missing?: string[];
  /** Whether it is the chosen model of its task and slot now. */
  chosen?: boolean;
  /** The CPU and GPU equivalence its admitting check measured (spec section 10.5). */
  equivalence_measured?: Measured | null;
  /** Record 55 ruling 22 (b): the newest certificate naming it, on a sealed sample or citing its graded run. */
  certificate?: Certificate | null;
}

/** The graded run a certificate cites instead of a sample sealed in the registry (record 55 ruling 22 b). */
export interface Citation {
  run: string;
  manifest_sha256: string;
  plan_commit: string;
  model_digest: string;
  plan?: string | null;
  equivalence?: { run: string; manifest_sha256: string; class: string } | null;
}

/** A recorded certificate as the engine answers it (GET /api/certificates, and a model's `certificate`). */
export interface Certificate {
  id: number;
  sample: string;
  model_ids: number[];
  result: Json;
  created_by: string;
  created_at: string;
  cites?: "sample" | "evidence";
  evidence?: Citation | null;
  unseals?: boolean;
  /** What it certified, in a line, as the engine says it. */
  words?: string;
}

/** The CPU and GPU equivalence an admission measured. */
export interface Measured {
  class: string | null;
  tolerance?: number | null;
  n?: number | null;
  changes?: number | null;
  flips?: number | null;
  max_difference?: number | null;
  set?: string | null;
}

/** Why a task's model answers it: chosen by the site, named by a certificate, or the default among the promoted or admitted. */
export type ChosenBy = "site" | "certificate" | "promoted" | "admitted";

export interface Chosen {
  model_id: number;
  by: ChosenBy;
  certificate_id?: number | null;
  chosen_by?: string | null;
  chosen_at?: string | null;
  why?: string | null;
}

/** One task and slot as `GET /api/models/tasks` answers it: the model chosen there and every model of it, newest first. */
export interface TaskEntry {
  task: string;
  slot: string;
  chosen: Chosen | null;
  models: Model[];
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
  promote: (id: number, why?: string) => door<{ model: Model }>("POST", `/api/models/${id}/promote`, why ? { why } : {}),
  retire: (id: number, why?: string) => door<Model>("POST", `/api/models/${id}/retire`, why ? { why } : {}),
  tasks: () => door<{ tasks: TaskEntry[] }>("GET", "/api/models/tasks"),
  /** Choose a model for its task and slot, or with model null go back to the default. */
  choose: (body: { model: number; why?: string } | { task: string; slot: string; model: null; why?: string }) => door<TaskEntry>("POST", "/api/models/choose", body),
  runs: (limit = 50) => door<{ runs: RunRow[] }>("GET", `/api/pipeline-runs?limit=${limit}`),
  /** Record a certificate (record 48 R2; record 55 ruling 22 b): a person's act under their own sign-in. */
  certify: (body: Json) => door<Certificate>("POST", "/api/certificates", body),
};

/** Whether a person may record a certificate here: models:work, where the engine serves the door. */
export function certifyAct(caps: Capabilities): boolean {
  return may(caps, "models:work") && served(caps, "POST /api/certificates");
}

/** The fields of Record a certificate, as typed. */
export interface CertifyForm {
  run: string;
  manifest: string;
  commit: string;
  bar: string;
  n: string;
  errors: string;
  bound: string;
  coverage: string;
  test: string;
  claim: string;
  /** The run that showed a repackaged artifact answers as the graded one did, where there is one. */
  eqRun: string;
  eqManifest: string;
  eqClass: string;
}

export const EMPTY_FORM: CertifyForm = { run: "", manifest: "", commit: "", bar: "0.01", n: "", errors: "", bound: "", coverage: "", test: "", claim: "", eqRun: "", eqManifest: "", eqClass: "" };

const HEX = /^[0-9a-f]+$/u;
const RUN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;

/** A manifest's sha256 as the engine keeps it, or none where it is not one. */
function manifestHash(text: string): string | null {
  const sha = text.trim().toLowerCase().replace(/^sha256:/u, "");
  return sha.length === 64 && HEX.test(sha) ? `sha256:${sha}` : null;
}


/** The door's body for a certificate citing a graded run of this model, or the fields still wrong. The engine checks the rest, the bound against the counts among them. */
export function citeBody(m: Pick<Model, "id" | "digest">, f: CertifyForm): { body: Json } | { wrong: string[] } {
  const wrong: string[] = [];
  const run = f.run.trim();
  if (!RUN.test(run)) wrong.push("run");
  const sha = manifestHash(f.manifest);
  if (sha === null) wrong.push("manifest sha256");
  const commit = f.commit.trim().toLowerCase();
  if (commit.length < 7 || commit.length > 40 || !HEX.test(commit)) wrong.push("plan commit");
  const num = (s: string) => (s.trim() === "" ? null : Number(s.trim()));
  const bar = num(f.bar);
  if (bar === null || !Number.isFinite(bar) || bar <= 0 || bar >= 1) wrong.push("bar");
  const n = num(f.n);
  if (n === null || !Number.isInteger(n) || n <= 0) wrong.push("graded");
  const errors = num(f.errors);
  if (errors === null || !Number.isInteger(errors) || errors < 0 || (n !== null && errors > n)) wrong.push("wrong");
  const bound = num(f.bound);
  if (bound !== null && !Number.isFinite(bound)) wrong.push("bound");
  const coverage = num(f.coverage);
  if (coverage !== null && (!Number.isFinite(coverage) || coverage < 0 || coverage > 1)) wrong.push("coverage");
  const served = f.eqRun.trim() !== "" || f.eqManifest.trim() !== "" || f.eqClass.trim() !== "";
  const eqSha = manifestHash(f.eqManifest);
  if (served) {
    if (!RUN.test(f.eqRun.trim())) wrong.push("served as run");
    if (eqSha === null) wrong.push("served as sha256");
    if (!["I", "II", "III"].includes(f.eqClass.trim())) wrong.push("class");
  }
  if (wrong.length > 0) return { wrong };
  const result: Json = { bar, n, errors };
  if (bound !== null) result.bound = bound;
  if (coverage !== null) result.coverage = coverage;
  if (f.test.trim() !== "") result.test = f.test.trim();
  if (f.claim.trim() !== "") result.claim = f.claim.trim();
  const evidence: Json = { run, manifest_sha256: sha, plan_commit: commit, model_digest: m.digest };
  if (served) evidence.equivalence = { run: f.eqRun.trim(), manifest_sha256: eqSha, class: f.eqClass.trim() };
  return { body: { models: [m.id], evidence, result } };
}

/** A share as a percentage for a line. */
export function percentWords(share: unknown): string {
  if (typeof share !== "number" || !Number.isFinite(share)) return "?";
  const p = share * 100;
  return `${p.toLocaleString("en-US", { maximumFractionDigits: p >= 10 ? 1 : p >= 1 ? 2 : 3 })} %`;
}

/** What a certificate certified, in a few words for a card: the run it cites or the sample it measured, and its numbers. */
export function certifiedWords(c: Certificate): string {
  const r = c.result ?? {};
  const counts = typeof r.errors === "number" && typeof r.n === "number" ? `${r.errors.toLocaleString("en-US")} of ${r.n.toLocaleString("en-US")} wrong` : "";
  if (c.evidence) return [c.evidence.run, counts, typeof r.bound === "number" ? `bound ${percentWords(r.bound)}` : ""].filter(Boolean).join(" · ");
  return [c.sample, counts, typeof r.risk === "number" ? `risk ${percentWords(r.risk)}` : ""].filter(Boolean).join(" · ");
}

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
export function modelActs(caps: Capabilities): { register: boolean; admit: boolean; promote: boolean; retire: boolean; choose: boolean; runs: boolean } {
  const work = may(caps, "models:work");
  return {
    choose: work && served(caps, "POST /api/models/choose"),
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

/** The tasks as the page draws them: from `GET /api/models/tasks` where the engine serves it, else from the list, with what it marks chosen. Tasks in name order, the site slot first. */
export function tasksOf(list: Model[], served: TaskEntry[] | null = null): TaskEntry[] {
  const out: TaskEntry[] = served
    ? served.map((t) => ({ ...t, models: [...t.models].sort((a, b) => b.id - a.id) }))
    : byTask(list).map((t) => {
        const models = [...(t.promoted ? [t.promoted] : []), ...t.others].sort((a, b) => b.id - a.id);
        // an engine before the tasks door: what it marks chosen, else its old default, the one promoted last, then the newest admitted
        const on = models.find((m) => m.chosen === true) ?? models.find((m) => m.state === "promoted") ?? models.find((m) => m.state === "admitted");
        return { task: t.task, slot: t.slot, chosen: on ? { model_id: on.id, by: on.state === "promoted" ? "promoted" : "admitted" } : null, models };
      });
  return out.sort((a, b) => a.task.localeCompare(b.task) || (a.slot === "site" ? -1 : b.slot === "site" ? 1 : a.slot.localeCompare(b.slot)));
}

/** The model a task's entry has chosen, or none. */
export function chosenOf(t: TaskEntry): Model | null {
  return t.chosen ? (t.models.find((m) => m.id === t.chosen!.model_id) ?? null) : null;
}

/** Why the chosen model answers, in a few words. */
export function chosenWords(c: Chosen | null): string {
  if (!c) return "nothing answers";
  if (c.by === "site") return `chosen${c.chosen_by ? ` by ${c.chosen_by}` : " by the site"}`;
  if (c.by === "certificate") return c.certificate_id != null ? `certificate ${c.certificate_id}` : "certified";
  if (c.by === "promoted") return "promoted last";
  return "newest admitted";
}

/** Whether a model may be chosen: one that answers, admitted or promoted. */
export function choosable(m: Pick<Model, "state">): boolean {
  return m.state === "admitted" || m.state === "promoted";
}

/** One claim a card states it tested, with the evidence run it comes from. */
export interface Claim {
  claim: string;
  value: string;
  bound: string | null;
  n: number | null;
  evidence: string;
}

const text = (v: unknown): string | null => (typeof v === "number" ? v.toLocaleString("en-US", { maximumFractionDigits: 6 }) : typeof v === "string" && v !== "" ? v : null);

/** The claims a card states it tested (spec section 10.2). */
export function testedOf(m: Model): Claim[] {
  const list = Array.isArray(m.card?.tested) ? (m.card.tested as Json[]) : [];
  return list.flatMap((c) => (c && typeof c.claim === "string" ? [{ claim: c.claim, value: text(c.value) ?? "", bound: text(c.bound), n: typeof c.n === "number" ? c.n : null, evidence: typeof c.evidence === "string" ? c.evidence : "" }] : []));
}

/** A speed as its card states it. */
export interface Speed {
  rate: number;
  hardware: string;
  evidence: string;
}

/** The card's speeds on CPU and on GPU, stacks a second. */
export function speedOf(m: Model): { cpu: Speed | null; gpu: Speed | null } {
  const one = (v: unknown): Speed | null => {
    const s = v as Json | null | undefined;
    return s && typeof s.stacks_per_second === "number" ? { rate: s.stacks_per_second, hardware: typeof s.hardware === "string" ? s.hardware : "", evidence: typeof s.evidence === "string" ? s.evidence : "" } : null;
  };
  const sp = (m.card?.speed ?? null) as Json | null;
  return { cpu: one(sp?.cpu), gpu: one(sp?.gpu) };
}

/** A rate in stacks a second, for a line. */
export function rateWords(s: Speed | null): string {
  if (!s) return "not stated";
  return `${s.rate.toLocaleString("en-US", { maximumFractionDigits: s.rate < 10 ? 2 : 1 })} stacks/s`;
}

/** What the card says it needs of a GPU. */
export function gpuOf(m: Model): "none" | "optional" | "required" | null {
  const g = m.card?.gpu;
  return g === "none" || g === "optional" || g === "required" ? g : null;
}

/** The CPU and GPU equivalence the card states. */
export function equivalenceOf(m: Model): { cls: string; tolerance: number | null; set: string; evidence: string } | null {
  const e = (m.card?.equivalence ?? null) as Json | null;
  if (!e || typeof e.class !== "string") return null;
  return { cls: e.class, tolerance: typeof e.tolerance === "number" ? e.tolerance : null, set: typeof e.set === "string" ? e.set : "", evidence: typeof e.evidence === "string" ? e.evidence : "" };
}

/** The equivalence in a few words: stated, and measured where an admission measured it. */
export function equivalenceWords(m: Model): string {
  const stated = equivalenceOf(m);
  const measured = m.equivalence_measured?.class ?? null;
  if (!stated && !measured) return gpuOf(m) === "none" ? "CPU only" : "not stated";
  const parts = [stated ? `class ${stated.cls} stated` : "not stated"];
  parts.push(measured ? `${measured} measured` : "not measured");
  return parts.join(" · ");
}

/** The card's fields in the words of the page, for what is missing. */
export function missingWords(m: Model): string | null {
  if (m.complete === true) return null;
  if (!m.missing || m.missing.length === 0) return m.complete === false ? "incomplete" : null;
  return `missing ${m.missing.map((f) => f.replace(/_/g, " ")).join(", ")}`;
}
