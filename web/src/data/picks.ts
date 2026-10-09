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
  borders: number;
  tied: number;
  /** Open review items for this role: what the Review button counts. */
  review: number;
}

type Json = Record<string, unknown>;
const count = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

/**
 * The summary as the door answers it: roles as a map (`{roles: {T1: {...}}}`
 * or the map at the top) or as a list with a `role` each, so either shape
 * the engine settles on reads the same. A role that picked nothing is left out.
 */
export function pickLinesOf(a: unknown): PickLine[] {
  if (!a || typeof a !== "object") return [];
  const top = a as Json;
  const roles = top.roles ?? top;
  const entries: [string, Json][] = Array.isArray(roles)
    ? (roles as Json[]).filter((r) => r && typeof r.role === "string").map((r) => [r.role as string, r])
    : Object.entries(roles as Json).filter((e): e is [string, Json] => !!e[1] && typeof e[1] === "object" && !Array.isArray(e[1]));
  return entries
    .map(([role, r]) => ({ role, picked: count(r.picked), clear: count(r.clear), borders: count(r.borders), tied: count(r.tied), review: count(r.review ?? r.borders) }))
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
