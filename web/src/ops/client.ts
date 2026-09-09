// SPDX-License-Identifier: AGPL-3.0-only
// The operations and data doors (Wave 4c section 7.5), thin: each is one
// engine door with its parameters, through the desk's proxy.

import { type Json, type JobRow } from "../ask/client";

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
  members?: unknown[] | null;
  group_key?: string | null;
  accepted_by?: string | null;
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

export const ops = {
  jobs: (all = false, limit = 50) => door<{ count: number; jobs: JobRow[] }>("GET", `/api/jobs${q({ all: all ? 1 : undefined, limit })}`),
  job: (id: number) => door<JobRow>("GET", `/api/jobs/${id}`),
  cancel: (id: number) => door<{ job: number; state: string }>("POST", `/api/jobs/${id}/cancel`),
  enqueue: (command: string[], name?: string) => door<{ job: number; state: string }>("POST", "/api/jobs", name ? { command, name } : { command }),
  review: (status?: string, kind?: string, limit = 50) => door<{ count: number; items: ReviewItem[] }>("GET", `/api/review${q({ status, kind, limit })}`),
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
  selection: (name: string) => door<{ selection_id: number; name: string; version: number; current_version: number; ask: Json; hash?: string }>("GET", `/api/ask/selections/${encodeURIComponent(name)}`),
};

export const data = {
  packs: () => door<{ packs: { name: string; version: string; contract: number; modality: string; cases: number }[] }>("GET", "/api/packs"),
  pack: (name: string) => door<Json>("GET", `/api/packs/${encodeURIComponent(name)}`),
  batches: (limit = 50) => door<{ count: number; batches: Batch[] }>("GET", `/api/batches${q({ limit })}`),
  batch: (id: number) => door<Batch>("GET", `/api/batches/${id}`),
  quarantine: (batch?: number, cls?: string, limit = 100) => door<{ count: number; files: Json[] }>("GET", `/api/quarantine${q({ batch, class: cls, limit })}`),
};
