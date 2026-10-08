// SPDX-License-Identifier: AGPL-3.0-only
// Saved selections (Wave 7a, H2 round 3: no command line inside a flow): a
// query card's answer kept under a name, as the next version of that name,
// and the list of every selection a page at a time, found by part of its
// name, each with how big its newest answer was.

import { door } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may, sees } from "../grants";

export interface SelectionSize {
  rows: number;
  grain: string;
  version: number;
  handle: number;
  at: string;
  truncated: boolean;
}

export interface SelectionRow {
  id: number;
  name: string;
  /** selection:NAME@V of the current version, as a run, a campaign or a pyramid job takes it. */
  spec: string;
  description: string | null;
  versions: number;
  grain: string | null;
  owner: string | null;
  created_at: string;
  updated_at: string | null;
  updated_by: string | null;
  note: string | null;
  cohort: string | null;
  size: SelectionSize | null;
}

export interface SelectionsPage {
  count: number;
  total: number;
  matching: number;
  selections: SelectionRow[];
  next: string | null;
}

export const SELECTIONS_PAGE = 50;

export const selections = {
  list: (q = "", after: string | null = null, limit = SELECTIONS_PAGE) =>
    door<SelectionsPage>("GET", `/api/ask/selections?${new URLSearchParams({ limit: String(limit), ...(q.trim() ? { q: q.trim() } : {}), ...(after ? { after } : {}) }).toString()}`),
  /** A card's version saved as the next version of the selection `name`. */
  save: (name: string, document_id: number, note: string | null) =>
    door<{ id: number; name: string; version: number; hash: string }>("PUT", `/api/ask/selections/${encodeURIComponent(name)}`, { document_id, ...(note && note.trim() ? { note: note.trim() } : {}) }),
};

/** Whether this person may save a selection: query work at quasi, and the door served. */
export function maySave(caps: Capabilities): boolean {
  return may(caps, "query:work") && sees(caps, "quasi") && served(caps, "PUT /api/ask/selections/{name}");
}

/** Whether the list is served to this person. */
export function mayList(caps: Capabilities): boolean {
  return may(caps, "query:see") && served(caps, "GET /api/ask/selections");
}

/** A selection's name as the engine takes it: letters, digits, hyphens and underscores; null when empty. */
export function selectionName(typed: string): string | null {
  const n = typed
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return n === "" ? null : n;
}

/** A selection's size in a few words: "1,204 stacks", or nothing run yet. */
export function sizeWords(s: SelectionSize | null): string {
  if (!s) return "not run yet";
  return `${s.truncated ? "at least " : ""}${s.rows.toLocaleString("en-US")} ${s.grain}${s.rows === 1 ? "" : "s"}`;
}
