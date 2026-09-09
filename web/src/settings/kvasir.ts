// SPDX-License-Identifier: AGPL-3.0-only
// Kvasir's settings doors through the desk's proxy (Wave 4c section 7.6,
// section 8.3): the backends and their health, the models table, the
// minted keys, the organisation's commercial key. Every write goes through
// the same identity as the data, and the desk's cross-origin defences.

import type { Json } from "../ask/client";

async function door<T>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: unknown): Promise<T> {
  const r = await fetch(`/kvasir${path}`, {
    method,
    headers: { "content-type": "application/json", "X-Nils-Desk": "1" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  const json = text ? (JSON.parse(text) as Json) : {};
  if (!r.ok) {
    const e = json.error as { message?: string; refusals?: { layer: string; fact: string; relaxation?: string }[] } | string | undefined;
    const message = typeof e === "string" ? e : e?.message ?? `Kvasir answered ${r.status}`;
    const refusals = typeof e === "object" && e?.refusals ? e.refusals.map((x) => `${x.layer}: ${x.fact}${x.relaxation ? ` (${x.relaxation})` : ""}`).join("; ") : "";
    throw new Error(refusals ? `${message}. ${refusals}` : message);
  }
  return json as T;
}

export interface Backend {
  id: string;
  kind: string;
  locality: "local" | "remote";
  provider: string | null;
  /** Whether a credential is stored for the provider; null for a local backend. */
  credential: boolean | null;
  models: string[];
  health: { warming?: boolean; ok?: boolean; queued?: number; [k: string]: unknown };
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

export const kvasir = {
  backends: () => door<{ backends: Backend[] }>("GET", "/v1/backends"),
  purposes: () => door<{ purposes: PurposeRow[] }>("GET", "/v1/purposes"),
  setPolicy: (purpose: string, backend: string, acknowledgement: string | null) =>
    door<Json>("PUT", `/v1/purposes/${encodeURIComponent(purpose)}/policy`, acknowledgement ? { backend, acknowledgement } : { backend }),
  keys: () => door<{ keys: KeyRow[] }>("GET", "/v1/keys"),
  mint: (principal: string, purposes: string[], max_class: string, expires_at: number | null) =>
    door<{ id: string; key: string; shown: string }>("POST", "/v1/keys", expires_at ? { principal, purposes, max_class, expires_at } : { principal, purposes, max_class }),
  revoke: (id: string) => door<Json>("DELETE", `/v1/keys/${encodeURIComponent(id)}`),
  credential: (provider: string, secret: string) => door<{ provider: string; stored: boolean; shown: string }>("PUT", `/v1/credentials/${encodeURIComponent(provider)}`, { secret }),
  forget: (provider: string) => door<Json>("DELETE", `/v1/credentials/${encodeURIComponent(provider)}`),
};

/** Whether a purpose may move to a backend without more, with an acknowledgement, or never (section 8.3). */
export function opening(p: PurposeRow, b: Backend): "yes" | "acknowledge" | "never" {
  if (b.locality === "local") return "yes";
  if (p.content === "identifiers") return "never";
  if (p.content === "rows") return "acknowledge";
  return "yes";
}
