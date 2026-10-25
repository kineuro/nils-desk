// SPDX-License-Identifier: AGPL-3.0-only
// The operations and data doors (Wave 4c section 7.5), thin: each is one
// engine door with its parameters, through the desk's proxy.

import { door as typed, type ChainedJob, type Json } from "../ask/client";

async function door<T>(method: "GET" | "POST" | "PUT", path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, {
    method,
    headers: { "content-type": "application/json", "X-Nils-Desk": "1" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  const json = text ? (JSON.parse(text) as Json) : {};
  if (!r.ok) throw new Error(typeof json.error === "string" ? json.error : `the door answered ${r.status}`);
  return json as T;
}

const q = (params: Record<string, string | number | boolean | undefined | null>) => {
  const s = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  return s ? `?${s}` : "";
};

export interface ReviewItem {
  id: number;
  kind: string;
  scope: string;
  status: string;
  actor?: Json | null;
  created_at: string;
  decided_at?: string | null;
  ref?: Json | null;
  evidence?: Json | null;
  decision?: Json | null;
  /** The contract: for a grouped question, how many stacks it is about; older engines sent the list. */
  members?: number | unknown[] | null;
  group_key?: string | null;
  accepted_by?: string | null;
  /** Record 49 R4b: below detail quasi a run's pipeline:qc items come as one entry a check or reason, with no id and the count of units (null where it stands for 1 to 4). */
  grouped?: boolean;
  units?: number | null;
  withheld?: boolean;
  /** Record 55 D6: routine, or blind first (the person answers before the suggestions show); absent from an engine before it. */
  mode?: "routine" | "blind_first" | string;
  /** Record 55 D6: the caller's provisional answer to a blind-first item, once given. */
  provisional?: { answer: Json; seconds: number | null } | null;
}

export interface ReleaseRow {
  id: number;
  name: string;
  version: string;
  root: string;
  started_at: string | null;
  files: number | null;
  subjects: number | null;
  unchanged: number | null;
  moved: number | null;
  rewritten: number | null;
  added: number | null;
  removed: number | null;
  layout: string | null;
}

export interface CustodyStore {
  store: string;
  owner: string;
  what: string;
  where: string;
  files: { path: string; kind: string; bytes: number; mode: string }[];
  holds: string[];
  counts: Record<string, number>;
  kept: string;
  commands: { read: string[]; change: string[]; export: string[]; delete: string };
}

export interface AuditRow extends Json {
  id?: number;
  at?: string;
  principal?: string;
  action?: string;
}

export interface Batch {
  id: number;
  name: string;
  /** Record 26: the verb that made it, `digest` or `pseudonymize`; a thread's two batches share a name. An older engine names none. */
  kind?: string | null;
  state: string;
  started_at: string;
  finished_at: string | null;
  epoch_after: number | null;
  seen: number | null;
  parsed: number | null;
  quarantined: number | null;
  ingested: number | null;
  report?: Json | null;
}

export interface Signals extends Json {
  scope: string;
  axes: Record<string, { tiers: Record<string, number>; confidence: Record<string, number>; open_review: Record<string, number>; disagreeing_terms: unknown[] }>;
  open_review: Record<string, number>;
  diagnostics: Record<string, number>;
  shadowed_keywords: string[];
  unused_overlay_terms: string[];
  /** Record 26: per axis, per value, how many stacks were decided there and how many are unsure; an older engine sends none. */
  by_value?: Record<string, Record<string, { decided?: number; unsure?: number }>>;
}

export interface OverlayRow {
  id: number;
  name: string;
  version?: string;
  status: string;
  /** Where it applies: a string on an older engine, `{over, keyed}` since OpenAPI 5. */
  scope?: string | { over?: string; keyed?: Record<string, string> } | null;
  author?: string;
  actor?: unknown;
  tried?: Json;
  /** The overlay itself; the list door leaves it out, and each overlay's own door carries it. */
  document?: Json;
  why?: string;
}

/** An overlay's scope in words, whichever shape the engine answered it in; null when it names none. */
export function overlayScope(o: Pick<OverlayRow, "scope">): string | null {
  if (typeof o.scope === "string") return o.scope;
  if (o.scope && typeof o.scope === "object" && typeof o.scope.over === "string") return o.scope.over;
  return null;
}

export const ops = {
  jobs: (all = false, limit = 50) => door<{ count: number; jobs: ChainedJob[] }>("GET", `/api/jobs${q({ all: all ? 1 : undefined, limit })}`),
  job: (id: number) => door<ChainedJob>("GET", `/api/jobs/${id}`),
  cancel: (id: number) => door<{ job: number; state: string }>("POST", `/api/jobs/${id}/cancel`),
  /** A job, and at record 26 the commands queued after it once it ends done. */
  enqueue: (command: string[], name?: string, then?: string[][]) =>
    door<{ job: number; state: string }>("POST", "/api/jobs", { command, ...(name ? { name } : {}), ...(then && then.length > 0 ? { then } : {}) }),
  /** Record 26: `cohort` narrows the queue to the subjects with an open membership there, on an engine that serves the filter. */
  review: (status?: string, kind?: string, limit = 50, cohort?: string, dataset?: string) => door<{ count: number; items: ReviewItem[] }>("GET", `/api/review${q({ status, kind, limit, cohort, dataset })}`),
  reviewItem: (id: number) => door<ReviewItem>("GET", `/api/review/${id}`),
  reviewApply: (id: number, body: Json) => door<Json>("POST", `/api/review/${id}/apply`, body),
  reviewAccept: (id: number, why?: string) => door<Json>("POST", `/api/review/${id}/accept`, why ? { why } : {}),
  decisionCommit: (id: number, anyway = false) => door<Json>("POST", `/api/decisions/${id}/commit`, anyway ? { anyway } : {}),
  decisionWithdraw: (id: number) => door<Json>("POST", `/api/decisions/${id}/withdraw`, {}),
  releases: (limit = 50) => door<{ count: number; releases: ReleaseRow[] }>("GET", `/api/releases${q({ limit })}`),
  release: (body: Json) => door<{ job: number; state: string; command?: string[] }>("POST", "/api/releases", body),
  handover: (release: string, out: string, key?: string) => door<{ job: number; state: string; command?: string[] }>("POST", "/api/handovers", key ? { release, out, key } : { release, out }),
  custody: () => door<{ home: string; backend: string; registry_id: string; stores: CustodyStore[] }>("GET", "/api/custody"),
  deskCustody: () => door<{ stores: CustodyStore[] }>("GET", "/desk/custody"),
  audit: (f: { principal?: string; action?: string; since?: string; limit?: number }) => door<{ count: number; rows: AuditRow[] }>("GET", `/api/audit${q(f)}`),
  rebuild: (scheme_name?: string, force = false) => door<{ job: number; state: string }>("POST", "/api/sessions/rebuild", { ...(scheme_name ? { scheme_name } : {}), ...(force ? { force } : {}) }),
  /** Wave 4c section 6.6, the knob engine: the classifier's signals, the overlays, adoption. */
  signals: (scope: string) => door<Signals>("GET", `/api/classify/signals?scope=${encodeURIComponent(scope).replace(/%3A/giu, ":")}`),
  overlays: () => door<{ overlays: OverlayRow[] }>("GET", "/api/overlays"),
  overlay: (id: number) => door<OverlayRow & Json>("GET", `/api/overlays/${id}`),
  overlayAdopt: (id: number) => door<{ job: number; overlay: number; status: string }>("POST", `/api/overlays/${id}/adopt`, {}),
  selection: (name: string) => door<{ selection_id: number; name: string; version: number; current_version: number; ask: Json; hash?: string }>("GET", `/api/ask/selections/${encodeURIComponent(name)}`),
};

export const data = {
  packs: () => door<{ packs: { name: string; version: string; contract: number; modality: string; cases: number }[] }>("GET", "/api/packs"),
  pack: (name: string) => door<Json>("GET", `/api/packs/${encodeURIComponent(name)}`),
  batches: (limit = 50) => door<{ count: number; batches: Batch[] }>("GET", `/api/batches${q({ limit })}`),
  batch: (id: number) => door<Batch>("GET", `/api/batches/${id}`),
  quarantine: (batch?: number, cls?: string, limit = 100, cohort?: string) => door<{ count: number; files: Json[] }>("GET", `/api/quarantine${q({ batch, class: cls, limit, cohort })}`),
};

/* ---------------------------------------------------------------- Wave 7b: the software place and the pipeline pack */
// The doors of record 57 P1 to P5 (Wave 7b spec 5.5 to 5.7 and 6.7), as the
// engine's openapi v7 describes them. Each throws the ask client's DoorError,
// so a refusal (409, 422) keeps its body for the page to say.


/** One verification result: the probe, the fingerprint or the test run. */
export interface SoftwareCheck {
  ran: boolean;
  passed: boolean | null;
  said: string | null;
}

/** A tool's licence as the software place reads it from its pack. */
export interface SoftwareLicence {
  spdx: string | null;
  redistributable: boolean | null;
  terms: { address: string | null; version: string | null } | null;
  /** An administrator must accept the terms before a run. */
  accept: boolean;
  accepted: { by: string; at: string; terms?: { address?: string | null; version?: string | null } | null; file?: { sha256: string; name: string } | null } | null;
  site_file: { env: string | null; mount: string | null; name: string | null } | null;
  file: { present: boolean; name: string | null } | null;
}

/** One dependency check of a package, as the pre-flight makes it. */
export interface SoftwareNeed {
  check: string;
  ok: boolean;
  /** ok, warn or missing. */
  state: string;
  said: string;
  failure?: unknown;
}

/** One package of `GET /api/software`. */
export interface SoftwarePackage {
  app: string;
  version: string;
  spec: string;
  /** sif, sandbox, image or binary. */
  kind: string;
  /** installed or registered. */
  how: string | null;
  /** False for a registered install, which the engine never updates or removes. */
  managed: boolean;
  /** installed, registered, missing, failed verification or update available. */
  status: string;
  place?: string | null;
  path?: string | null;
  image?: string | null;
  source?: string | null;
  digest?: string | null;
  digest_asked?: string | null;
  pinned?: string[] | null;
  size_bytes?: number | null;
  runtime?: string | null;
  by?: string | null;
  at?: string | null;
  fingerprint?: string | null;
  verified_at?: string | null;
  verification?: { probe?: SoftwareCheck | null; fingerprint?: SoftwareCheck | null; test?: SoftwareCheck | null } | null;
  commands?: string[] | null;
  pack_sha256?: string | null;
  licence?: SoftwareLicence | null;
  /** The catalog's labels that use it. */
  pipelines?: string[] | null;
  needs?: SoftwareNeed[] | null;
  install?: { door: string | null; command: string | null; grant: string | null } | null;
  /** The converter's entry, as GET /api/tools answers it (kind binary). */
  tool?: Json | null;
}

export interface SoftwarePlace {
  place: { path: string | null; declared: string | null; read_only?: boolean | null; shared?: string | null } | null;
  packages: SoftwarePackage[];
  runtime: { name: string; version: string | null } | null;
}

/** The body that names a package: its spec, and the pack's text where the person gave one. */
export interface SoftwareAsk {
  spec: string;
  pack?: string;
  source?: string;
}

export const software = {
  list: () => typed<SoftwarePlace>("GET", "/api/software"),
  install: (a: SoftwareAsk) => typed<{ installed: boolean; why?: string; package: SoftwarePackage; needs?: SoftwareNeed[]; verified?: unknown }>("POST", "/api/software/install", a),
  register: (a: SoftwareAsk & { kind: "sif" | "sandbox" | "image"; path: string }) => typed<{ registered: boolean; package: SoftwarePackage; needs?: SoftwareNeed[]; verified?: unknown }>("POST", "/api/software/register", a),
  verify: (app: string, version: string) => typed<{ verified: boolean; verification: SoftwarePackage["verification"]; package: SoftwarePackage; needs?: SoftwareNeed[] }>("POST", `${softwarePath(app, version)}/verify`, {}),
  accept: (app: string, version: string, file: { text: string; name: string } | null = null, terms: { address: string } | null = null) =>
    typed<{ accepted: boolean; acceptance: { by: string; at: string; terms: { address: string | null; version: string | null } }; file: { sha256: string; name: string; under: string } | null }>(
      "POST",
      `${softwarePath(app, version)}/accept`,
      { ...(file ? { file: file.text, file_name: file.name } : {}), ...(terms ? { terms: { address: terms.address } } : {}) },
    ),
  forget: (app: string, version: string) => typed<{ forgotten: boolean; app: string; version: string }>("POST", `${softwarePath(app, version)}/forget`, {}),
  remove: (app: string, version: string) => typed<{ removed: boolean; app: string; version: string }>("DELETE", softwarePath(app, version)),
};

/** A package's own door, its app and version each one path segment. */
export function softwarePath(app: string, version: string): string {
  return `/api/software/${encodeURIComponent(app)}/${encodeURIComponent(version)}`;
}

/** Who chose a knob's value, as a unit records it: default, rule:<id>, person:<user> or fixed, with the assistant where it proposed it. */
export interface KnobChoice {
  value: unknown;
  by: string;
  rule?: string | null;
  facts?: Json | null;
  proposed?: string | null;
}

/** A pipeline version's pack as `GET /api/pipelines/{id}/pack` answers it; `pack` is "none" where the version has none. */
export interface PackDoc {
  pipeline: string;
  pipeline_id: number;
  pack: Json | "none" | { error: string };
  pack_digest?: string | null;
  version_digest?: string | null;
  facts?: string[] | null;
  breaking_knobs?: string[] | null;
  goals?: { goal: string[]; switches: Record<string, unknown[]>; defaults: Record<string, unknown> } | null;
  rules?: { id: string; when: string; set?: Record<string, unknown> | null; route?: string | null; why?: string | null; source?: string | null }[] | null;
  checks?: { metric: string; check: string; action: string; cohort?: boolean; source?: string | null }[] | null;
}

/** A run's numbers per comparability key, as `GET /api/pipeline-runs/{id}/numbers` answers them; never a total across keys. */
export interface RunNumbers {
  run: number;
  keys: { comparability_key: string; short: string; units: number; measures: Record<string, { count: number; sum: number; mean: number | null; unit: string | null }>; caveats?: { unit: string; caveats: unknown[] }[] }[];
  pooled: boolean;
  words: string | null;
  unkeyed?: number;
  unkeyed_measures?: number;
  measures: number;
}

export const packs = {
  /** A pipeline version's pack, its goals, rules and checks. */
  of: (pipeline: number) => typed<PackDoc>("GET", `/api/pipelines/${pipeline}/pack`),
  /** A run's numbers, grouped by comparability key. */
  numbers: (run: number) => typed<RunNumbers>("GET", `/api/pipeline-runs/${run}/numbers`),
};

/* ---------------------------------------------------------------- Wave 7b: families, workflows and provenance */
// The doors of record 57 P6 to P8 and record 58 P5 (Wave 7b spec, sections 7
// and 8), as the engine's openapi v7 describes them: a family as one catalog
// row that opens to its members, the workflow catalog, a workflow's plan and
// run, the workflow runs, and the provenance of a subject, a session or a
// stack with each result's curation state.

/** One member of a family: a pipeline of its own behind the family's row. */
export interface FamilyMember {
  member: string;
  pipeline: string;
  method?: string | null;
  words?: string | null;
  pipeline_id: number | null;
  label?: string | null;
  level?: string | null;
  standing?: string | null;
  tasks?: string[] | null;
}

/** A family as `GET /api/pipelines/family/{name}` answers it, and as `GET /api/pipelines` lists it under `families`. */
export interface Family {
  family: true;
  name: string;
  version?: string | null;
  words?: string | null;
  digest?: string | null;
  roles?: string[] | null;
  goals?: { goal?: string[] | null; switches?: Record<string, unknown[]> | null } | null;
  tasks?: Record<string, { level?: string | null; words?: string | null; members?: string[] | null }> | null;
  members: FamilyMember[];
  rules?: { id: string; when?: string | null; route?: string | null; why?: string | null; source?: string | null }[] | null;
  added_by?: string | null;
  added_at?: string | null;
}

/** One step of a workflow document: a pipeline or a family, its version, goal, the knobs a person may set and its switches. */
export interface WorkflowStepDoc {
  id: string;
  of?: string | null;
  name?: string | null;
  version?: string | null;
  reference?: string | null;
  pipeline?: string | null;
  family?: string | null;
  goal?: string | null;
  knobs?: string[] | null;
  switches?: Record<string, unknown> | null;
}

/** The workflow document as the catalog holds it (contracts/workflow/v1). */
export interface WorkflowDoc {
  name: string;
  title?: string | null;
  what?: string | null;
  replaces?: unknown;
  steps: WorkflowStepDoc[];
  links: { from: string; to: string }[];
}

/** One workflow version of `GET /api/workflows`. */
export interface WorkflowRow {
  id: number;
  name: string;
  version: string;
  label: string;
  digest?: string | null;
  state?: string | null;
  added_by?: string | null;
  added_at?: string | null;
  /** starter for a shipped one. */
  origin?: string | null;
  contract?: string | null;
  workflow: WorkflowDoc;
}

/** The verdicts a plan gives each link (spec 8.3). */
export type LinkVerdict = "satisfied" | "missing" | "redundant" | "refused" | "fed";

/** An output's or an input's type: its derivative kind, the role and contrast it stands for, and the grid or space it is on. */
export interface LinkType {
  kind?: string | null;
  role?: string | null;
  contrast?: string | null;
  grid?: string | null;
  space?: string | null;
}

export interface PlanLink {
  link?: string | null;
  /** Null for an implicit link: a need no step feeds. */
  from: { step?: string | null; output?: string | null; pipeline?: string | null; type?: LinkType | null } | null;
  to: { step: string; input?: string | null; pipeline?: string | null; type?: LinkType | null };
  verdict: LinkVerdict | string;
  words?: string | null;
  implicit?: boolean | null;
}

export interface PlanStep {
  step: string;
  of?: string | null;
  name?: string | null;
  reference?: string | null;
  /** The pipeline's label, or the family's name for a family step. */
  pipeline?: string | null;
  pipeline_id?: number | null;
  goal?: string | null;
  switches?: Record<string, unknown> | null;
  knobs?: Record<string, unknown> | string[] | null;
  /** Why the step cannot run: a family or a pipeline the catalog lacks, a goal or switch the family does not offer. */
  refused?: string | null;
  waits_for?: string[] | null;
  /** The steps it waits for whole: those whose link feeds a typed input or a role of it. */
  waits_whole?: string[] | null;
  /** The pre-flight door's answer for the step, or a family step's routing. */
  preflight?: Json | null;
  family?: string | null;
  members?: { member: string; pipeline: string; pipeline_id?: number | null }[] | null;
}

/** `POST /api/workflows/{id}/plan`'s answer. */
export interface WorkflowPlan {
  workflow: string;
  workflow_id: number;
  name?: string | null;
  version?: string | null;
  handle?: number | null;
  selection?: string | null;
  main?: Json | null;
  person?: Json | null;
  steps: PlanStep[];
  links: PlanLink[];
  verdicts?: Record<string, number> | null;
  runnable: boolean;
  words?: string | null;
}

/** The body a plan and a run take: the scope as the pipelines door takes it, the goal, and the knobs per step. */
export interface PlanBody {
  select?: string;
  handle?: number;
  pack?: string;
  goal?: string;
  knobs?: Record<string, Record<string, string>>;
}

/** A step's unit counts, as a workflow run sums them. */
export interface StepUnits {
  total?: number | null;
  succeeded?: number | null;
  failed?: number | null;
  skipped?: number | null;
  reused?: number | null;
  unreported?: number | null;
}

export interface WorkflowRunStep {
  step: string;
  id?: string | null;
  of?: string | null;
  name?: string | null;
  reference?: string | null;
  pipeline?: string | null;
  pipeline_id?: number | null;
  /** The step's pipeline run, once it claimed one. */
  run: number | null;
  /** queued, running, done, partial, failed, cancelled, interrupted, refused or skipped. */
  status: string;
  units?: StepUnits | null;
  error?: string | null;
  finished_at?: string | null;
  waits_for?: string[] | null;
  waits_whole?: string[] | null;
}

/** One workflow run of `GET /api/workflow-runs`. */
export interface WorkflowRun {
  id: number;
  workflow: string;
  workflow_id: number;
  job: number | null;
  handle?: number | null;
  selection?: string | null;
  person?: Json | null;
  /** running, done, partial, failed, cancelled or interrupted. */
  status: string;
  started_at: string | null;
  finished_at: string | null;
  steps: WorkflowRunStep[];
  summary?: { steps?: number | null; units?: StepUnits | null; steps_done?: number | null; steps_total?: number | null } | null;
  principal?: string | null;
  error?: string | null;
}

/** A result's curation state (record 58 P5): current, stale with the words every door says, or unknown. */
export interface Curation {
  state: "current" | "stale" | "unknown" | string;
  words?: string | null;
  recorded?: Json | null;
  changes?: { pack?: string | null; was?: string | null; now?: string | null }[] | null;
  overrides_now?: unknown;
}

export interface ProvenanceStep {
  run: number;
  pipeline: string;
  pipeline_id?: number | null;
  run_status?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  workflow_run?: number | null;
  step?: string | null;
  /** Null below detail quasi. */
  unit: string | null;
  state?: string | null;
  status?: string | null;
  reused_from?: number | null;
  keys?: { comparability?: string | null; result?: string | null; short?: string | null; members?: unknown } | null;
  knobs?: Record<string, { value: unknown; by: string; rule?: string | null }> | null;
  caveats?: unknown[] | null;
  flags?: unknown[] | null;
  pack_status?: string | null;
  words?: string | null;
  results?: {
    derivatives?: { id: number; kind: string; path?: string | null; sha256?: string | null; check?: string | null; run?: number | null; created_at?: string | null }[] | null;
    measures?: unknown;
    /** The run the files and measures were read from, where this unit reused them. */
    from_run?: number | null;
  } | null;
  stacks?: number[] | null;
  curation?: Curation | null;
}

/** `GET /api/provenance/{kind}/{id}`'s answer. */
export interface Provenance {
  of: { kind: string; id: string | number; subject?: number | null; session?: string | null };
  stacks?: number[] | null;
  steps: ProvenanceStep[];
  counts?: { steps?: number | null; stale?: number | null; unknown?: number | null } | null;
  stale_words?: string | null;
  withheld?: { steps?: number | null; why?: string | null } | null;
}

export const workflows = {
  list: () => typed<{ workflows: WorkflowRow[]; names?: unknown[] }>("GET", "/api/workflows"),
  of: (id: number | string) => typed<WorkflowRow>("GET", `/api/workflows/${encodeURIComponent(String(id))}`),
  /** The document's text or JSON; install:work. */
  add: (document: string) => typed<WorkflowRow & { added: boolean }>("POST", "/api/workflows", { document }),
  plan: (id: number | string, body: PlanBody) => typed<WorkflowPlan>("POST", `/api/workflows/${encodeURIComponent(String(id))}/plan`, body),
  run: (id: number | string, body: PlanBody) =>
    typed<{ job: number; state: string; workflow: string; workflow_id: number; handle?: number | null; plan?: Record<string, number> | null; message?: string | null }>("POST", `/api/workflows/${encodeURIComponent(String(id))}/run`, body),
  runs: () => typed<{ runs: WorkflowRun[] }>("GET", "/api/workflow-runs"),
  runOf: (id: number) => typed<WorkflowRun>("GET", `/api/workflow-runs/${id}`),
  family: (name: string) => typed<Family>("GET", `/api/pipelines/family/${encodeURIComponent(name)}`),
  /** kind is subject, session or stack; a session's id is <subject id>@<session label>. */
  provenance: (kind: "subject" | "session" | "stack", id: string) => typed<Provenance>("GET", `/api/provenance/${kind}/${encodeURIComponent(id)}`),
};
