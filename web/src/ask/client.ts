// SPDX-License-Identifier: AGPL-3.0-only
// The engine's ask doors, through the desk's proxy. Every write carries the
// desk header; a stale options token is met by refetching, never by a blind
// retry (Wave 4c section 7.3). There is no code path here that composes ask
// JSON: a document changes only through apply.

export type Json = Record<string, unknown>;

export interface Move {
  id: number;
  kind: string;
  /** The set the move edits; absent on the document's own moves. */
  set?: string | null;
  template: string;
  holes: { name: string; type: string; fillers?: string[]; optional?: boolean }[];
}

export interface Options {
  token: string;
  hash: string;
  epoch: number;
  set: string;
  grain: string;
  describe: string;
  exposes: { fields: string[]; dated: string[]; bindings: string[] };
  moves: Move[];
  presets: { name: string; days: number }[];
}

export interface DocumentHandle {
  document: number;
  hash: string;
  digest?: string;
  principal?: string;
  created_at?: string;
  parent: number | null;
  ask: Json;
}

export interface Applied {
  document: number;
  parent: number;
  hash: string;
  epoch: number;
  changed: [string, string][];
  options: Options;
}

export interface Diff {
  same: boolean | null;
  canonical_a?: string;
  canonical_b?: string;
  changes?: { set: string; part: string; kind: string; before: unknown; after: unknown }[];
  refused?: string;
}

/** One side of a diff: a stored document, an inline one, or a handle. */
export type Side = { document_id: number } | { document: Json } | { handle: number };

export type Column = string | { name: string; type: string };
export const columnName = (c: Column): string => (typeof c === "string" ? c : c.name);

export interface Declaration {
  grain: string;
  session_scheme?: { name: string; digest: string };
  membership?: string;
  key_namespace?: string;
  pick_rule?: string;
  denominator?: string;
  disclosure?: string;
  truncated?: boolean;
  /** Wave 5 section 7.5: the timezone and the week start the engine read the dates under; the registry's, never the browser's. */
  timezone?: string;
  week_start?: string;
}

export interface Preview {
  level: string;
  columns: Column[];
  rows: unknown[][];
  truncated: boolean;
  declaration: Declaration | null;
}

export interface Run {
  handle: number;
  hash: string;
  grain: string;
  row_count: number;
  declaration: Declaration;
  content_hash: string;
  truncated: boolean;
  columns: Column[];
  rows: unknown[][];
  pages: number;
}

export interface Described {
  sets: [string, string][];
  conventions: string[];
  denominators?: string[];
  mechanisms?: string[];
  disclosure?: string;
  answer?: string;
  declaration: Declaration;
}

export interface Funnel {
  set: string;
  grain: string;
  stage: string;
  /** Wave 5 section 12.3: the clause group, when the diagnosis was asked by clause. */
  group?: string;
  rows: number;
  subjects: number;
  on_path: boolean;
}

export interface Diagnosis {
  valid: boolean;
  issues: { code: string; path: string; message: string; next: string }[];
  repairs: unknown[];
  warnings: string[];
  zero_rows: string | null;
  drops: unknown[];
  ties: unknown[];
  unresolved: unknown[];
  coarse: unknown[];
  cost: { sets: number; class: string };
  funnel: Funnel[];
  next: string[];
  /** Wave 5 section 12.3: present when the diagnosis was asked by clause; one row per set and clause group in the language's order. */
  by?: "set" | "clause";
  groups?: ClauseGroup[];
}

export interface ClauseGroup {
  set: string;
  grain: string;
  group: string;
  clauses: number;
  kept: number;
  subjects: number;
  lost: number;
}

/** One value of a profile's chart: how many members hold it, each once, and how many subjects. */
export interface ProfileValue {
  value: string | number | boolean | null;
  count: number;
  subjects: number;
}

type Refused = { refused: string };

/** The profile of one set of a document, for the Query card's charts; every number counts a member once. */
export interface Profile {
  set: string;
  grain: string;
  counts: { subjects: number; sessions: number; stacks: number } | { rows: number; subjects: number } | Refused;
  stack_types: ProfileValue[] | Refused | null;
  field: { name: string; values?: ProfileValue[]; truncated?: boolean; refused?: string; withheld?: string } | null;
  demographics: { sex: ProfileValue[] | Refused; age_decades: ProfileValue[] | Refused } | { withheld: string } | null;
  clinical: { kinds: ProfileValue[]; sensitive_withheld: boolean } | Refused | null;
}

/** A field as the catalog lists it for the caller. */
export interface CatalogField {
  level: string;
  path: string;
  type: string;
  class: string;
  dated: boolean;
  description: string;
}

export class DoorError extends Error {
  constructor(
    readonly status: number,
    readonly body: Json,
  ) {
    super(typeof body.error === "string" ? body.error : `the door answered ${status}`);
  }
  get stale(): boolean {
    return this.status === 409 && this.body.error === "stale_options";
  }
}

export async function door<T>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, {
    method,
    headers: { "content-type": "application/json", "X-Nils-Desk": "1" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  const json = text ? (JSON.parse(text) as Json) : {};
  if (!r.ok) throw new DoorError(r.status, json);
  return json as T;
}

export const ask = {
  store: (document: Json) => door<DocumentHandle>("POST", "/api/ask/documents", { document }),
  /** A stored document kept under another as its next version: a draft the assistant proposed joins the card's line. */
  storeUnder: (document_id: number, parent: number) => door<DocumentHandle>("POST", "/api/ask/documents", { document_id, parent }),
  get: (id: number) => door<DocumentHandle>("GET", `/api/ask/documents/${id}`),
  options: (document_id: number, set: string) => door<Options>("POST", "/api/ask/options", { document_id, set }),
  apply: (document_id: number, o: Options, set: string, moves: { move_id: number; args: Json }[]) =>
    door<Applied>("POST", "/api/ask/apply", { document_id, epoch: o.epoch, token: o.token, set, moves }),
  describe: (document_id: number) => door<Described>("POST", "/api/ask/describe", { document_id }),
  explain: (document_id: number) => door<{ sqlite: string; postgres: string; columns: string[] }>("POST", "/api/ask/explain", { document_id }),
  preview: (document_id: number, rows = 10) => door<Preview>("POST", "/api/ask/preview", { document_id, rows }),
  /** The profile of one set, the document's answer by default: its subjects, sessions and stacks, its stack types, one stack field by value, and the demographics and clinical event kinds the role may read. */
  profile: (document_id: number, set?: string, field?: string) =>
    door<Profile>("POST", "/api/ask/profile", { document_id, ...(set ? { set } : {}), ...(field ? { field } : {}) }),
  /** One page of a level's fields as the catalog lists them for the caller. */
  fields: (level: string, after?: string) =>
    door<{ level: string; fields: CatalogField[]; next: string | null; total: number }>(
      "GET",
      `/api/ask/catalog/${encodeURIComponent(level)}${after ? `?after=${encodeURIComponent(after)}` : ""}`,
    ),
  diagnose: (document_id: number, by?: "set" | "clause") => door<Diagnosis>("POST", "/api/ask/diagnose", by ? { document_id, by } : { document_id }),
  /** Wave 5 section 12.1: the opening set of a new question, from anything a person may start from. */
  start: (body: { from: Record<string, unknown> }) => door<{ document: Json; set: string; grain: string; count: number; subjects: number | null; sessions: number | null; epoch: number }>("POST", "/api/ask/start", body),
  /** An uploaded identifier list, resolved through the linkage store; reviewer and above. */
  upload: (values: string[], namespace?: string) => door<{ upload: number; resolved?: number; unresolved?: number }>("POST", "/api/ask/values", namespace ? { values, namespace } : { values }),
  diff: (a: Side, b: Side) => door<Diff>("POST", "/api/ask/diff", { a, b }),
  run: (document_id: number, name?: string) => door<Run>("POST", "/api/ask/run", name ? { document_id, name } : { document_id }),
  rows: (handle: number, page: number) => door<{ columns: Column[]; rows: unknown[][]; page: number; pages: number }>("GET", `/api/ask/handles/${handle}/rows?page=${page}`),
  handle: (id: number) => door<Json>("GET", `/api/ask/handles/${id}`),
  /** The value sampler: a capped sample of a field's values at a level, under the caller's scope. */
  values: (level: string, field: string, limit = 20) =>
    door<{ items?: [unknown, number][]; distinct?: number; truncated?: boolean }>("GET", `/api/ask/catalog/${encodeURIComponent(level)}/${encodeURIComponent(field)}/values?limit=${limit}`),
  /** Authored text in (YAML or JSON), add-only repair, a diagnosis, a stored document when it validates. */
  draft: (text: string) => door<Drafted>("POST", "/api/ask/draft", { text }),
  /** The pack's grounding and worked examples, the schema digest, the policy table and the caps. */
  guide: () => door<Guide>("GET", "/api/ask/guide"),
};

export interface HandleRow {
  id: number;
  name: string | null;
  grain: string;
  row_count: number;
  content_hash: string | null;
  principal: string;
  actor: Json;
  created_at: string;
  epoch: number;
  pack_version: string | null;
  disclosure: string;
  truncated: boolean;
  /** The person's own limit in the document's out, when they set one. */
  limit: number | null;
  /** Whether the rows are still kept. */
  kept: boolean;
  last_read_at: string | null;
  withdrawn_at: string | null;
  ask_hash: string | null;
  columns: string[];
}

export interface JobRow {
  id: number;
  kind: string;
  name: string | null;
  state: "queued" | "running" | "cancelling" | "done" | "failed" | "cancelled";
  started_at: string;
  heartbeat_at: string | null;
  finished_at: string | null;
  progress: Json | null;
  error: string | null;
  args: { argv?: string[]; principal?: string } & Json;
  result: Json | null;
}

/** A job row at record 26: the commands queued after it once it ends done, and the jobs before and after it in a chain; an older engine sends neither. */
export interface ChainedJob extends JobRow {
  then?: string[][] | null;
  chain?: { before: number | null; after: number | null } | null;
}

/** The desk's own record: which document a run came from, which document followed which. */
export interface DeskRecord {
  results: { handle: number; document: number; subject: string; made_at: string }[];
  lineage: { document: number; parent: number }[];
  export: string | null;
}

export const desk = {
  results: () => door<DeskRecord>("GET", "/desk/results"),
  record: (handle: number, document: number) => door<Json>("POST", "/desk/results", { handle, document }),
  lineage: (document: number, parent: number) => door<Json>("POST", "/desk/lineage", { document, parent }),
};

export const results = {
  handles: (withdrawn = false) => door<{ count: number; handles: HandleRow[] }>("GET", `/api/ask/handles?limit=200${withdrawn ? "&withdrawn=1" : ""}`),
  jobs: () => door<{ count: number; jobs: JobRow[] }>("GET", "/api/jobs"),
  job: (id: number) => door<JobRow>("GET", `/api/jobs/${id}`),
  promote: (handle: number, cohort: string, create: boolean, reason: string) =>
    door<{ job: number; state: string }>("POST", `/api/ask/handles/${handle}/promote`, reason ? { cohort, create, reason } : { cohort, create }),
};

export interface Drafted {
  document: number | null;
  hash: string | null;
  repairs: unknown[];
  diagnosis: Diagnosis;
}

export interface Guide {
  grounding: unknown;
  examples: { question: string; document: Json; note?: string }[];
  content_version: string | null;
  schema_digest: string | null;
}

const runs = new Map<string, Promise<Run>>();

/**
 * Presenting a result twice executes the query once (section 7.9): a run is
 * keyed by the document and the registry epoch, and a second presentation
 * reads the handle the first one made.
 */
export function runOnce(document_id: number, epoch: number, run: typeof ask.run = ask.run): Promise<Run> {
  const key = `${document_id}@${epoch}`;
  let p = runs.get(key);
  if (!p) {
    p = run(document_id).catch((e) => {
      runs.delete(key);
      throw e;
    });
    runs.set(key, p);
  }
  return p;
}

/** The version chain: every ancestor of a document, oldest first, each with who made it. */
export async function chain(id: number, get: (id: number) => Promise<DocumentHandle> = ask.get): Promise<DocumentHandle[]> {
  const out: DocumentHandle[] = [];
  let at: number | null = id;
  const seen = new Set<number>();
  while (at !== null && !seen.has(at) && out.length < 200) {
    seen.add(at);
    const d = await get(at);
    out.push(d);
    at = d.parent;
  }
  return out.reverse();
}

/** Every field of a level the caller may read, page after page. */
export async function catalogFields(level: string, page: typeof ask.fields = ask.fields): Promise<CatalogField[]> {
  const out: CatalogField[] = [];
  let after: string | undefined;
  for (let i = 0; i < 20; i++) {
    const p = await page(level, after);
    out.push(...p.fields);
    if (!p.next) break;
    after = p.next;
  }
  return out;
}
