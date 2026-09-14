// SPDX-License-Identifier: AGPL-3.0-only
// Kvasir's doors through the desk's proxy (Wave 4c section 7.6, section 8.3,
// record 23): the backends Kvasir holds and their health, a model tried,
// added, checked and removed, a backend's key, where each purpose goes, the
// admission records, the minted keys, and the ChatGPT subscription. Every
// write goes through the same identity as the data, and the desk's
// cross-origin defences.

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
  /** Where the backend answers, who added it and when (milliseconds): an admin's to see. */
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
  /** The subscriptions this person may sign in with; null where Kvasir does not serve the door yet. */
  subscriptions: () => unlessAbsent(door<{ subscriptions: Subscription[] }>("GET", "/v1/subscriptions")),
  /** A sign-in begun: a code the person enters at a link, then approves. */
  signIn: (provider: string) => door<SignInStarted>("POST", `/v1/subscriptions/${encodeURIComponent(provider)}/sign-in`, {}),
  chooseModel: (provider: string, model: string) => door<Subscription>("PUT", `/v1/subscriptions/${encodeURIComponent(provider)}`, { model }),
  signOut: (provider: string) => door<Json>("DELETE", `/v1/subscriptions/${encodeURIComponent(provider)}`),
};

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
