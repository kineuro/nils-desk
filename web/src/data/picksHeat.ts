// SPDX-License-Identifier: AGPL-3.0-only
// A cohort's main scans as a heatmap (Wave 7a, record 55 H3, job type 2;
// spec 13.1, the picks door): one row a subject, one cell a session, for one
// role at a time, each cell picked, doubted or missing, read from
// `GET /api/cohorts/{name}/picks`, which reads the one pick resolver, so it
// agrees with Main scans. v0's heatmap gave "a sense of what we have in the
// data" (Nima, 2026-10-10); this is that sense on the cohort's own detail,
// and Main scans is where the choice is made.

import { door } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";

export const PICKS_DOOR = "GET /api/cohorts/{name}/picks";

export type CellState = "picked" | "doubted" | "missing";

export interface Cell {
  state: CellState;
  stack: number | null;
  by: "rules" | "person" | null;
  /** A pick of a stack of a sample sealed now, its scan not named to a caller who does not read sealed stacks (record 48). */
  withheld?: boolean;
}

export interface HeatSession {
  session: number | null;
  studies: number[];
  label: string;
  number: number;
  roles: Record<string, Cell>;
}

export interface HeatSubject {
  id: number;
  code: string;
  sessions: HeatSession[];
}

export interface HeatPage {
  detail: string;
  roles: string[];
  /** Sessions per role over the whole cohort. */
  totals: Record<string, Record<CellState, number>>;
  total: number;
  subjects: HeatSubject[];
  next: number | null;
}

/** The most subjects a page holds. */
export const HEAT_PAGE = 24;

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const nul = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const STATES: CellState[] = ["picked", "doubted", "missing"];

function cellOf(v: unknown): Cell {
  const c = obj(v);
  const state = STATES.includes(c.state as CellState) ? (c.state as CellState) : "missing";
  return { state, stack: nul(c.stack), by: c.by === "rules" || c.by === "person" ? c.by : null, ...(c.withheld === true ? { withheld: true } : {}) };
}

/** The picks door's answer as the heatmap reads it, whatever it left out. */
export function heatOf(a: Json): HeatPage {
  const roles = Array.isArray(a.roles) ? a.roles.filter((r): r is string => typeof r === "string") : [];
  const totals: HeatPage["totals"] = {};
  for (const [role, t] of Object.entries(obj(a.totals))) totals[role] = { picked: num(obj(t).picked), doubted: num(obj(t).doubted), missing: num(obj(t).missing) };
  return {
    detail: typeof a.detail === "string" ? a.detail : "plain",
    roles,
    totals,
    total: num(a.total),
    subjects: (Array.isArray(a.subjects) ? a.subjects : []).map(obj).map((s) => ({
      id: num(s.id),
      code: typeof s.code === "string" ? s.code : `Subject ${num(s.id)}`,
      sessions: (Array.isArray(s.sessions) ? s.sessions : []).map(obj).map((v, i) => ({
        session: nul(v.session),
        studies: Array.isArray(v.studies) ? v.studies.filter((x): x is number => typeof x === "number") : [],
        label: typeof v.label === "string" ? v.label : `visit ${i + 1}`,
        number: num(v.number) || i + 1,
        roles: Object.fromEntries(Object.entries(obj(v.roles)).map(([r, c]) => [r, cellOf(c)])),
      })),
    })),
    next: nul(a.next),
  };
}

export const picksDoors = {
  page: (cohort: string, after: number | null = null, limit = HEAT_PAGE): Promise<HeatPage> => {
    const q = new URLSearchParams({ limit: String(limit) });
    if (after !== null) q.set("after", String(after));
    return door<Json>("GET", `/api/cohorts/${encodeURIComponent(cohort)}/picks?${q}`).then(heatOf);
  },
};

/** Whether the heatmap is offered: the door, and review:see, as the engine asks it. */
export function mayHeat(caps: Capabilities): boolean {
  return may(caps, "review:see") && served(caps, PICKS_DOOR);
}

/** A role's sessions in words: how many picked, doubted and missing. */
export function totalsWords(t: Record<CellState, number> | undefined): string {
  if (!t) return "";
  const n = (v: number) => v.toLocaleString("en-US");
  return [`${n(t.picked)} picked`, t.doubted > 0 ? `${n(t.doubted)} doubted` : null, `${n(t.missing)} missing`].filter(Boolean).join(" · ");
}

/** One cell in words, for its hover: the session, and what stands for the role there. */
export function cellWords(s: HeatSession, role: string): string {
  const c = s.roles[role];
  if (!c || c.state === "missing") return `${s.label}: no ${role}`;
  const by = c.by === "person" ? ", a person's pick" : "";
  return `${s.label}: ${c.state === "doubted" ? "doubted" : "picked"}${c.withheld ? ", a sealed scan" : c.stack !== null ? `, scan ${c.stack}` : ""}${by}`;
}
