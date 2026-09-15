// SPDX-License-Identifier: AGPL-3.0-only
// Kvasir's doors through the desk's proxy (Wave 4c section 7.6, section 8.3,
// record 23): the backends Kvasir holds and their health, a model tried,
// added, checked and removed, a backend's key, where each purpose goes, the
// admission records, the minted keys, the ChatGPT subscription, and the local
// models Kvasir downloads with where they go, the Hugging Face token, and a
// model started or stopped on llama.cpp (record 24). Every write goes through
// the same identity as the data, and the desk's cross-origin defences. Kvasir
// guards each door with the person's grants (record 25) and says which grants
// a refused door needs.

import type { Json } from "../ask/client";

/** A door's refusal: Kvasir's words, the status it answered with, and its body. */
export class KvasirError extends Error {
  readonly status: number;
  readonly body: Json;
  constructor(status: number, message: string, body: Json) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function door<T>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: unknown): Promise<T> {
  const r = await fetch(`/kvasir${path}`, {
    method,
    headers: { "content-type": "application/json", "X-Nils-Desk": "1" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let json: Json = {};
  try {
    json = text ? (JSON.parse(text) as Json) : {};
  } catch {
    if (r.ok) throw new KvasirError(r.status, "Kvasir answered with something other than JSON", {});
  }
  if (!r.ok) {
    const e = json.error as { message?: string; refusals?: { layer: string; fact: string; relaxation?: string }[] } | string | undefined;
    const message = typeof e === "string" ? e : (e?.message ?? `Kvasir answered ${r.status}`);
    const refusals = typeof e === "object" && e?.refusals ? e.refusals.map((x) => `${x.layer}: ${x.fact}${x.relaxation ? ` (${x.relaxation})` : ""}`).join("; ") : "";
    throw new KvasirError(r.status, refusals ? `${message}. ${refusals}` : message, json);
  }
  return json as T;
}

/** A door Kvasir does not serve yet answers null, and the page leaves its part out. */
function unlessAbsent<T>(p: Promise<T>): Promise<T | null> {
  return p.catch((e: unknown) => {
    if (e instanceof KvasirError && e.status === 404) return null;
    throw e;
  });
}

export type Locality = "local" | "remote";

/** Record 24: the backend Kvasir holds the models it started on llama.cpp under; an added backend takes another name. */
export const RUNTIME_BACKEND = "llama-cpp";

/** One model a backend serves, as Kvasir holds it. */
export interface BackendEntry {
  id: string;
  name: string;
  reasoning: boolean;
  context_window: number;
  max_tokens: number;
  /** Whether a local model passed its admission; null for a provider's. */
  admitted: boolean | null;
}

export interface BackendHealth {
  warming?: boolean;
  firstTokenAt?: number | null;
  lastError?: string | null;
  /** Streams running now, of the concurrency admitted. */
  running?: number;
  concurrency?: number;
  queued?: number;
  [k: string]: unknown;
}

export interface Backend {
  id: string;
  kind: string;
  locality: Locality;
  /** Where the backend answers, who added it and when (milliseconds): shown only to a person with Kvasir: Work. */
  base_url?: string;
  added_by?: string;
  added_at?: number;
  provider: string | null;
  /** Whether a key is stored for the backend; null where it takes none. */
  credential: boolean | null;
  models: string[];
  entries?: BackendEntry[];
  concurrency?: number;
  health: BackendHealth;
  /** ChatGPT through people's own subscriptions: the backend Kvasir has itself, never added or removed. */
  builtin?: boolean;
}

/** One check of the admission suite on one model. */
export interface AdmissionCheck {
  name: string;
  /** true passed, false failed, null not applicable to this model. */
  passed: boolean | null;
  detail?: string;
}

/** Section 8.6: one run of the admission suite for a model on a runtime, as Kvasir recorded it. */
export interface AdmissionRecord {
  id: number;
  backend: string;
  model: string;
  runtime: { name: string; version: string; build: string };
  /** Milliseconds since the epoch. */
  at: number;
  passed: boolean;
  checks?: AdmissionCheck[];
}

export interface PurposeRow {
  purpose: string;
  app: string;
  content: "catalog" | "rows" | "identifiers";
  kind: "foreground" | "background";
  backend: string | null;
  locality: "local" | "remote" | null;
  default: boolean;
  acknowledged: { by: string; at: number | null; text: string | null } | null;
  may_open_remote: string;
}

export interface KeyRow {
  id: string;
  principal: string;
  purposes: string[];
  max_class?: string;
  maxClass?: string;
  expires_at?: number | null;
  expiresAt?: number | null;
  created_at?: number;
  [k: string]: unknown;
}

export type BackendKind = "openai-completions" | "anthropic-messages";

/** A model named for a test or an add: the id the server knows it by, and what Kvasir should know of it. */
export interface ModelDescription {
  id: string;
  name?: string;
  contextWindow?: number;
  maxTokens?: number;
  reasoning?: boolean;
}

/** A backend as an admin describes it to Kvasir. The key is sealed there and never shown. */
export interface BackendDescription {
  kind?: BackendKind;
  baseUrl: string;
  locality: Locality;
  key?: string;
  models?: (string | ModelDescription)[];
  id?: string;
}

/** How a model did not answer, in the few ways a person can act on. */
export type TryKind = "unreachable" | "key_refused" | "no_model" | "refused_for_now" | "other";

export interface TriedModel {
  id: string;
  answered: boolean;
  error: { kind: TryKind; message: string } | null;
}

/** What one short request to each model found, and the models the server lists where it lists them. */
export interface Tried {
  listed: string[] | null;
  models: TriedModel[];
}

/** A subscription a person signs in with (record 23). */
export interface Subscription {
  provider: string;
  name: string;
  /** A person's own, or, on a desk that signs nobody in, the one the whole install uses. */
  for: "person" | "system";
  state: "signed_out" | "waiting" | "signed_in" | "failed";
  user_code: string | null;
  verification_uri: string | null;
  /** Milliseconds since the epoch, as `since` is. */
  expires_at: number | null;
  since: number | null;
  model: string | null;
  models: { id: string; name: string; context_window: number }[];
  error: string | null;
}

export interface SignInStarted {
  state: "waiting";
  user_code: string;
  verification_uri: string;
  expires_at: number;
}

/** Record 23: where a local model's download stands. */
export type LocalState = "queued" | "downloading" | "paused" | "done" | "failed";

/** A command a model server runs a downloaded model with, by its runtime: llama.cpp, ollama, sglang or vllm. Kvasir only says it. */
export interface LocalServe {
  runtime: string;
  command: string;
}

/** A model Kvasir downloads, or downloaded, from the Hugging Face Hub (record 23). */
export interface LocalModel {
  id: number;
  repo: string;
  revision: string;
  /** The commit the revision named when the model was queued. */
  commit: string;
  /** The model's own folder, in the location it was downloaded into. */
  path: string;
  state: LocalState;
  /** How many files it has. */
  files: number;
  bytes_total: number;
  bytes_done: number;
  error: string | null;
  added_by: string;
  /** Milliseconds since the epoch, as `finished_at` is. */
  added_at: number;
  finished_at: number | null;
  /** The commands a model server runs it with, once it is downloaded; empty before. */
  serve: LocalServe[];
  /** Record 24: whether Kvasir can start it on the runtime, a finished GGUF download on an install with one. A Kvasir before record 24 says nothing. */
  startable?: boolean;
  /** Record 24: where it stands on the runtime; null before a first start. A Kvasir before record 24 says nothing. */
  run?: LocalRun | null;
}

/** Record 24: where a started model stands on the runtime. */
export type RunState = "starting" | "serving" | "stopped" | "failed";

/** Record 24: a local model an admin started on the runtime, as Kvasir follows it. */
export interface LocalRun {
  state: RunState;
  /** The model's id on the runtime's backend in Kvasir. */
  model: string;
  /** Why it did not start, in Kvasir's words. */
  error: string | null;
  /** The last lines llama.cpp logged for it, where it did not start. */
  log: string[];
  /** The context and slots llama.cpp settled on, once it serves. */
  context: number | null;
  slots: number | null;
  started_by: string | null;
  /** Milliseconds since the epoch. */
  started_at: number | null;
}

/** Record 24: the runtime Kvasir starts downloaded models on, llama.cpp's server on this machine. */
export interface LocalRuntime {
  /** llama.cpp's build, such as b10964. */
  build: string;
  /** The archive the build came from, such as ubuntu-vulkan-x64. */
  variant: string;
  /** Whether it answers now. */
  reachable: boolean;
  /** The local model it loads or serves now, by its id; null for none. */
  serving: number | null;
}

/** Where new downloads go and the room there, whether a Hugging Face token is set, every local model, and the runtime where the install has one. */
export interface LocalStatus {
  location: string;
  free_bytes: number | null;
  token: boolean;
  models: LocalModel[];
  /** Record 24: null where the install runs no runtime for Kvasir. A Kvasir before record 24 says nothing. */
  runtime?: LocalRuntime | null;
}

/** One file a download would bring, as the hub lists it; a small file kept in git has no sha256. */
export interface LocalFile {
  path: string;
  size: number;
  sha256: string | null;
}

/** What a download would bring: the commit the revision names now, and the files the patterns choose. */
export interface LocalLookup {
  repo: string;
  revision: string;
  commit: string;
  include: string[];
  files: LocalFile[];
  bytes_total: number;
}

/** A model asked for by its name on the hub and, where given, a revision and the patterns of its files. */
export interface LocalAsk {
  repo: string;
  revision?: string;
  include?: string[];
}

/** A local model door's refusal: its status, the code Kvasir gave, its words, and the sizes a refusal for room carries. */
export interface LocalRefusal {
  status: number;
  code: string | null;
  message: string;
  free_bytes: number | null;
  needed_bytes: number | null;
}

export const kvasir = {
  backends: () => door<{ backends: Backend[] }>("GET", "/v1/backends"),
  /** Record 23: each model named asked one short question, and nothing kept; with none named, what the server lists. */
  test: (d: BackendDescription) => door<Tried>("POST", "/v1/backends/test", d),
  /** A backend held once every one of its models answered; a refusal carries what each said. */
  add: (d: BackendDescription) => door<{ backend: { id: string; locality: Locality; models: string[] }; tried: Tried }>("POST", "/v1/backends", d),
  remove: (id: string) => door<Json>("DELETE", `/v1/backends/${encodeURIComponent(id)}`),
  admission: (limit = 20) => door<{ records: AdmissionRecord[] }>("GET", `/v1/admission?limit=${limit}`),
  /** The admission suite run now on a backend's models, or one of them; it takes minutes. */
  admit: (backend: string, model?: string) => door<{ records: AdmissionRecord[] }>("POST", "/v1/admission/run", model ? { backend, model } : { backend }),
  purposes: () => door<{ purposes: PurposeRow[] }>("GET", "/v1/purposes"),
  setPolicy: (purpose: string, backend: string, acknowledgement: string | null) =>
    door<Json>("PUT", `/v1/purposes/${encodeURIComponent(purpose)}/policy`, acknowledgement ? { backend, acknowledgement } : { backend }),
  keys: () => door<{ keys: KeyRow[] }>("GET", "/v1/keys"),
  mint: (principal: string, purposes: string[], max_class: string, expires_at: number | null) =>
    door<{ id: string; key: string; shown: string }>("POST", "/v1/keys", expires_at ? { principal, purposes, max_class, expires_at } : { principal, purposes, max_class }),
  revoke: (id: string) => door<Json>("DELETE", `/v1/keys/${encodeURIComponent(id)}`),
  /** A backend's key, kept under the backend's id and never shown. */
  credential: (backend: string, secret: string) => door<{ provider: string; stored: boolean; shown: string }>("PUT", `/v1/credentials/${encodeURIComponent(backend)}`, { secret }),
  forget: (backend: string) => door<Json>("DELETE", `/v1/credentials/${encodeURIComponent(backend)}`),
  /** This person's own subscription, or the install's where nobody signs in; null where Kvasir does not serve the door yet. */
  subscriptions: () => unlessAbsent(door<{ subscriptions: Subscription[] }>("GET", "/v1/subscriptions")),
  /** A sign-in begun: a code the person enters at a link, then approves. Record 25: it needs the assistant and Kvasir: See. */
  signIn: (provider: string) => door<SignInStarted>("POST", `/v1/subscriptions/${encodeURIComponent(provider)}/sign-in`, {}),
  chooseModel: (provider: string, model: string) => door<Subscription>("PUT", `/v1/subscriptions/${encodeURIComponent(provider)}`, { model }),
  /** Signing out needs only the person. */
  signOut: (provider: string) => door<Json>("DELETE", `/v1/subscriptions/${encodeURIComponent(provider)}`),
  /** Record 23: the models Kvasir downloads from the Hugging Face Hub; record 25: every door needs Kvasir: Work. */
  local: {
    /** Where new downloads go, the token and every model; null where Kvasir does not serve local models yet. */
    status: () => unlessAbsent(door<LocalStatus>("GET", "/v1/local")),
    /** Where new downloads go from now on; models downloaded before stay where they are. */
    setLocation: (path: string) => door<LocalStatus>("PUT", "/v1/local/location", { path }),
    /** The files a download would bring, with their sizes and the total; nothing is kept. */
    lookup: (ask: LocalAsk) => door<LocalLookup>("POST", "/v1/local/lookup", ask),
    /** A model looked up again and queued to download. */
    download: (ask: LocalAsk) => door<LocalModel>("POST", "/v1/local/models", ask),
    pause: (id: number) => door<LocalModel>("POST", `/v1/local/models/${id}/pause`, {}),
    resume: (id: number) => door<LocalModel>("POST", `/v1/local/models/${id}/resume`, {}),
    /** Record 24: started on llama.cpp, which stops the model it serves now; answers the row, starting. */
    start: (id: number) => door<LocalModel>("POST", `/v1/local/models/${id}/start`, {}),
    /** Record 24: unloaded from llama.cpp and let go from Kvasir's backend; answers the row. */
    stop: (id: number) => door<LocalModel>("POST", `/v1/local/models/${id}/stop`, {}),
    /** A model and its files deleted; one gone already answers 404, and then null. */
    remove: (id: number) => unlessAbsent(door<Json>("DELETE", `/v1/local/models/${id}`)),
    /** The token for gated and private models, sealed and never shown. */
    setToken: (token: string) => door<{ token: boolean; shown: string }>("PUT", "/v1/local/token", { token }),
    /** The token cleared; where none was set Kvasir answers 404, and then null. */
    clearToken: () => unlessAbsent(door<Json>("DELETE", "/v1/local/token")),
  },
};

/** A local model door's refusal as the dialogs read it, or null for anything but Kvasir's own refusal. */
export function localRefusalOf(e: unknown): LocalRefusal | null {
  if (!(e instanceof KvasirError)) return null;
  const error = (typeof e.body.error === "object" && e.body.error !== null ? e.body.error : {}) as { code?: unknown; free_bytes?: unknown; needed_bytes?: unknown };
  const size = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return { status: e.status, code: typeof error.code === "string" ? error.code : null, message: e.message, free_bytes: size(error.free_bytes), needed_bytes: size(error.needed_bytes) };
}

/** A door refused for want of a grant (record 25): the grants Kvasir names, or a subscription asked for with no person behind the call. */
export interface GrantRefusal {
  code: "no_grant" | "not_a_person";
  needs: string[];
}

/** A refusal for want of a grant as the page reads it, or null for any other answer. */
export function grantRefusalOf(e: unknown): GrantRefusal | null {
  if (!(e instanceof KvasirError) || e.status !== 403) return null;
  const error = (typeof e.body.error === "object" && e.body.error !== null ? e.body.error : {}) as { code?: unknown; needs?: unknown };
  if (error.code === "not_a_person") return { code: "not_a_person", needs: [] };
  if (error.code !== "no_grant") return null;
  const needs = Array.isArray(error.needs) ? error.needs.filter((g): g is string => typeof g === "string") : [];
  return { code: "no_grant", needs };
}

/** What each model said, where an add was refused because one did not answer. */
export function triedOf(e: unknown): TriedModel[] | null {
  if (!(e instanceof KvasirError)) return null;
  const models = (e.body.error as { models?: unknown } | undefined)?.models;
  return Array.isArray(models) ? (models as TriedModel[]) : null;
}

/** Whether a purpose may move to a backend without more, with an acknowledgement, or never (section 8.3). */
export function opening(p: PurposeRow, b: Backend): "yes" | "acknowledge" | "never" {
  if (b.locality === "local") return "yes";
  if (p.content === "identifiers") return "never";
  if (p.content === "rows") return "acknowledge";
  return "yes";
}
