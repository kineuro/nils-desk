// SPDX-License-Identifier: AGPL-3.0-only
// The doors Wave 5 adds for the shell: the summary (section 12.1), the
// timeline (12.2) and the document list (12.1). Each is optional to the
// desk: a missing door removes the band or the panel that reads it.

import { door } from "../ask/client";

export interface Summary {
  epoch: number;
  synthetic: string | null;
  /** How many cohorts the registry names; the names are the keys of by_cohort. */
  cohorts: number;
  subjects: Counts;
  sessions: Counts & { window_days?: number };
  stacks: Counts;
  /** Null unless the summary was asked since a date. */
  since: { date: string; subjects: number; sessions: number; stacks: number; handles: number; releases: number } | null;
}

export interface Counts {
  total: number;
  /** Memberships by cohort name: a subject in two cohorts counts in each, so the rows need not sum to the total. */
  by_cohort: Record<string, number>;
  /** By the pack version that classified the stacks; sessions have none. */
  by_pack_version?: Record<string, number>;
}

export interface Event {
  at: string;
  kind: string;
  actor: string | null;
  summary: string;
  produced: { kind: string; id: number | string } | null;
  source: string;
}

export interface DocumentRow {
  document: number;
  root: number;
  name: string | null;
  grain: string | null;
  out: string | null;
  level: string | null;
  versions: number;
  author: string | null;
  created_at: string;
  updated_at: string | null;
  last_used_at: string | null;
  hash: string;
  last_run: { handle: number; at: string } | null;
}

/** The cohort names a summary carries, from the by-cohort keys of its three counts. */
export function cohortNames(s: Summary): string[] {
  const names = new Set<string>([...Object.keys(s.subjects.by_cohort), ...Object.keys(s.sessions.by_cohort), ...Object.keys(s.stacks.by_cohort)]);
  return [...names].sort();
}

/** Wave 5 section 12.4: the closure of an irreversible act. */
export interface Closure {
  kind: string;
  id: string | number;
  stacks: { count: number; sample: number[] };
  review: { opens: number; closes: number };
  handles: { handle: number; name: string | null; reason: string }[];
  releases: { release: number; name: string; version: string }[];
  moves?: { axis: string; from: string | null; to: string; stacks: number }[];
}

/** Wave 5 section 12.5: a place, a named location with a role and the guarantees behind it. */
export interface Place {
  id: number;
  name: string;
  role: "source" | "registry" | "working" | "export" | "share" | "exchange" | "backup";
  path: string;
  guarantees: Record<string, unknown>;
  probed: Record<string, unknown> | null;
  probed_at: string | null;
  bound?: string[];
  retired_at: string | null;
}

export const objects = {
  depends: (kind: string, id: string | number) => door<Closure>("GET", `/api/depends/${kind}/${encodeURIComponent(String(id))}`),
  places: (probe = false) => door<{ places: Place[]; enforced?: boolean }>("GET", `/api/places${probe ? "?probe=1" : ""}`),
  summary: (since?: string | null) => door<Summary>("GET", `/api/summary${since ? `?since=${encodeURIComponent(since)}` : ""}`),
  timeline: (kind: string, id: string | number) => door<{ kind: string; id: string | number; events: Event[] }>("GET", `/api/timeline/${kind}/${id}`),
  documents: (after?: string | null) => door<{ count: number; documents: DocumentRow[]; next: string | null }>("GET", `/api/ask/documents${after ? `?after=${encodeURIComponent(after)}` : ""}`),
};
