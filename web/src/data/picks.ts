// SPDX-License-Identifier: AGPL-3.0-only
// What picking main scans found in a dataset (record 55 H2: picking is a
// pipeline step after the sort, not a Data action): per role how many
// occasions have a pick, how many are clear, how many sit on a border and
// wait for a person. The Data page says it in one line a role.

import { door } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";

export const PICKS_SUMMARY_DOOR = "GET /api/picks/summary";

/** One role's pick result. */
export interface PickLine {
  role: string;
  picked: number;
  clear: number;
  /** Occasions on a border, all reasons together. */
  borders: number;
  /** The borders by reason, as the engine counts them. */
  reasons: Record<string, number>;
  tied: number;
  /** Open review items for this role: what the Review button counts. */
  review: number;
}

type Json = Record<string, unknown>;
const count = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

/** A role's borders by reason (`{reason: n}`), summed for the line; a bare number reads as one total. */
function bordersOf(v: unknown): { total: number; reasons: Record<string, number> } {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const reasons = Object.fromEntries(Object.entries(v as Json).map(([k, n]) => [k, count(n)]).filter(([, n]) => (n as number) > 0)) as Record<string, number>;
    return { total: Object.values(reasons).reduce((a, b) => a + b, 0), reasons };
  }
  return { total: count(v), reasons: {} };
}

/**
 * The summary as the engine's door answers it: `{roles: {role: {picked,
 * clear, tied, borders: {reason: n}, review_items}}}`. The Review count is
 * the role's open review items. A role that picked nothing is left out.
 */
export function pickLinesOf(a: unknown): PickLine[] {
  if (!a || typeof a !== "object") return [];
  const top = a as Json;
  const roles = top.roles ?? top;
  const entries: [string, Json][] = Array.isArray(roles)
    ? (roles as Json[]).filter((r) => r && typeof r.role === "string").map((r) => [r.role as string, r])
    : Object.entries(roles as Json).filter((e): e is [string, Json] => !!e[1] && typeof e[1] === "object" && !Array.isArray(e[1]));
  return entries
    .map(([role, r]) => {
      const b = bordersOf(r.borders);
      return { role, picked: count(r.picked), clear: count(r.clear), borders: b.total, reasons: b.reasons, tied: count(r.tied), review: count(r.review_items) };
    })
    .filter((l) => l.picked + l.borders + l.tied + l.review > 0);
}

/** A role's line in words: "T1: 112 picked · 104 clear · 8 borders". */
export function pickLineWords(l: PickLine): string {
  const n = (v: number) => v.toLocaleString("en-US");
  const parts = [`${n(l.picked)} picked`, `${n(l.clear)} clear`];
  if (l.borders > 0) parts.push(`${n(l.borders)} ${l.borders === 1 ? "border" : "borders"}`);
  if (l.tied > 0) parts.push(`${n(l.tied)} tied`);
  return `${l.role}: ${parts.join(" · ")}`;
}

export const picksSummary = {
  read: (dataset: string) => door<unknown>("GET", `/api/picks/summary?dataset=${encodeURIComponent(dataset)}`).then(pickLinesOf),
};

/** Whether the pick result is read here: Data reading, and the door served. */
export function maySeePicks(caps: Capabilities): boolean {
  return may(caps, "data:see") && served(caps, PICKS_SUMMARY_DOOR);
}
