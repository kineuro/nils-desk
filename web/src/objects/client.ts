// SPDX-License-Identifier: AGPL-3.0-only
// The doors Wave 5 adds for the shell: the summary (section 12.1), the
// timeline (12.2) and the document list (12.1). Each is optional to the
// desk: a missing door removes the band or the panel that reads it.

import { door } from "../ask/client";

export interface Summary {
  epoch: number;
  synthetic: string | null;
  cohorts: string[];
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
  id: number;
  name: string | null;
  grain: string | null;
  last_run: string | null;
  versions: number;
  author: string | null;
  created_at: string;
}

export const objects = {
  summary: (since?: string | null) => door<Summary>("GET", `/api/summary${since ? `?since=${encodeURIComponent(since)}` : ""}`),
  timeline: (kind: string, id: string | number) => door<{ kind: string; id: string | number; events: Event[] }>("GET", `/api/timeline/${kind}/${id}`),
  documents: (after?: string | null) => door<{ documents: DocumentRow[]; next: string | null }>("GET", `/api/ask/documents${after ? `?after=${encodeURIComponent(after)}` : ""}`),
};
