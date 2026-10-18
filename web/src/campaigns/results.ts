// SPDX-License-Identifier: AGPL-3.0-only
// A campaign's results (record 55, ruling 35 (d)): the person who made it,
// and an administrator, read per item each rater's answer, the
// adjudication, the settled value and what the close wrote, with the
// agreement, the unsure count and the counts by value, from the engine's
// results door. Blind as the answers are: while a campaign is open a rater
// who neither made it nor adjudicates it reads none of it.

import { door, type Json } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";
import { pct, principalOf, type Agreement, type Answer, type Campaign, type Item, type LabelSet } from "./client";

export const RESULTS = "GET /api/campaigns/{id}/results";

/** One answer as the results door lists it: the rater by name, or as "rater N" to who may not see names. */
export interface ResultAnswer {
  id: number;
  rater: string;
  role: "rater" | "adjudicator" | string;
  round: number;
  author_kind?: string;
  value?: unknown;
  form?: Json | null;
  derivative_id?: number | null;
  why?: string | null;
  unsure?: boolean;
  answered_at?: string;
}

export interface ResultItem extends Item {
  answers: ResultAnswer[];
  adjudicated: boolean;
}

export interface Results {
  campaign: number;
  name: string;
  status: string;
  owner: string;
  closes_into: string;
  closed_at: string | null;
  /** Whether the raters are named: to the maker and a holder of Review work alone. */
  named: boolean;
  agreement: Agreement | null;
  unsure: number;
  settled: number;
  adjudicated: number;
  decisions: number;
  picks: number;
  raters: { rater: string; name?: string | null; answers: number; adjudications: number; unsure: number }[];
  /** Raters' answers and settled items by value, per axis on an axes question; null for free text. */
  values: { axis: string | null; value: string; answers: number; settled: number }[] | null;
  count: number;
  items: ResultItem[];
  /** Record 58 P1, a verify campaign: the planted values caught, against the bar; null or absent on another campaign or an older engine. */
  catch?: Catch | null;
  /** The catch rate is under the bar: the result does not stand alone. */
  below_bar?: boolean;
}

/** Record 58 P1: how many planted values the readers caught (the planted axis not accepted), overall and per reader, against the registered bar. */
export interface Catch {
  planted: number;
  caught: number;
  /** Null where nothing was planted. */
  rate: number | null;
  bar: number;
  per_rater: { rater: string; name?: string | null; planted: number; caught: number; rate: number | null }[];
}

/** The catch-rate bar a verify campaign is reported against where the engine names none (record 58, question 11). */
export const CATCH_BAR = 0.9;

const id = (c: number | string) => encodeURIComponent(String(c));

export const resultsDoor = (c: number | string) => door<Results>("GET", `/api/campaigns/${id(c)}/results`).then(resultsOf);

const num = (v: unknown, d: number | null = null): number | null => (typeof v === "number" && Number.isFinite(v) ? v : d);

/** The door's answer read leniently where record 58 added to it: the catch with its bar, and `below_bar` from the rate where the engine does not say it. */
export function resultsOf(r: Results): Results {
  const raw = (r as unknown as Json).catch;
  const c = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Json) : null;
  if (!c) return { ...r, catch: null, below_bar: r.below_bar === true };
  const planted = num(c.planted, 0) as number;
  const caught = num(c.caught, 0) as number;
  const rate = num(c.rate) ?? (planted > 0 ? caught / planted : null);
  const bar = num(c.bar) ?? CATCH_BAR;
  const per_rater = (Array.isArray(c.per_rater) ? c.per_rater : []).flatMap((x) => {
    const o = x && typeof x === "object" && !Array.isArray(x) ? (x as Json) : null;
    if (!o || typeof o.rater !== "string") return [];
    const p = num(o.planted, 0) as number;
    const k = num(o.caught, 0) as number;
    return [{ rater: o.rater, name: typeof o.name === "string" ? o.name : null, planted: p, caught: k, rate: num(o.rate) ?? (p > 0 ? k / p : null) }];
  });
  return { ...r, catch: { planted, caught, rate, bar, per_rater }, below_bar: typeof r.below_bar === "boolean" ? r.below_bar : rate !== null && rate < bar };
}

/** The catch in words: "18 of 20 · 90%", or that nothing was planted. */
export function catchWords(c: Pick<Catch, "planted" | "caught" | "rate">): string {
  if (c.planted === 0) return "nothing planted";
  return `${c.caught.toLocaleString("en-US")} of ${c.planted.toLocaleString("en-US")} · ${pct(c.rate)}`;
}

/**
 * Why the person may not read the results, or null. Closed, they are every
 * participant's; open, they are the maker's (unless the maker rates in it),
 * a named adjudicator's and a Review worker's. The engine decides; this only
 * keeps the view from offering what it would refuse.
 */
export function resultsRefusal(caps: Capabilities, c: Campaign): string | null {
  if (!served(caps, RESULTS)) return "This engine has no door for a campaign's results.";
  if (c.status === "closed") return null;
  if (may(caps, "review:work")) return null;
  const me = principalOf(caps);
  if (c.rater_policy.adjudicators.includes(me)) return null;
  if (c.owner === me && !c.rater_policy.raters.includes(me)) return null;
  return "Blind until it closes: the results are its maker's, its adjudicators' and a reviewer's.";
}

/** Whether the person reads the raters by name: the campaign's maker and a Review worker. */
export function namesRaters(caps: Capabilities, c: Campaign): boolean {
  return c.owner === principalOf(caps) || may(caps, "review:work");
}

/**
 * A short name for each person who answered, in the order they first
 * answered: their own name to the maker and a Review worker, and to anyone
 * else "rater N" or "adjudicator N", their own answers by their own name.
 */
export function raterNames(answers: readonly Pick<Answer, "principal" | "role" | "id">[], me: string, named: boolean): Map<string, string> {
  const out = new Map<string, string>();
  const n = { rater: 0, adjudicator: 0 };
  for (const a of [...answers].sort((x, y) => x.id - y.id)) {
    if (out.has(a.principal)) continue;
    if (named || a.principal === me) {
      out.set(a.principal, a.principal.split("@")[0]);
      continue;
    }
    const word = a.role === "adjudicator" ? "adjudicator" : "rater";
    n[word] += 1;
    out.set(a.principal, `${word} ${n[word]}`);
  }
  return out;
}

/** The raters as columns of the results table, in the door's order: those who gave a rater's answer. */
export function raterColumns(r: Results): string[] {
  return r.raters.filter((x) => x.answers > 0).map((x) => x.rater);
}

/** The short form of a rater's name the table shows: the part before the @. */
export const short = (rater: string) => rater.split("@")[0];

/**
 * A rater as the tables name them (record 58 P1): the account's name where
 * the door gives one, else the part before the @ as before; the sign-in
 * subject itself is only ever a hover title, never a column.
 */
export function nameOf(r: Pick<Results, "raters" | "catch">, rater: string): string {
  const row = r.raters.find((x) => x.rater === rater) ?? r.catch?.per_rater.find((x) => x.rater === rater) ?? null;
  const name = row?.name?.trim();
  return name ? name : short(rater);
}

/** One item's answer of one rater in its first round, or the latest where it was read again. */
export function answerOf(i: ResultItem, rater: string): ResultAnswer | null {
  const mine = i.answers.filter((a) => a.rater === rater && a.role !== "adjudicator");
  return mine.length === 0 ? null : mine[mine.length - 1];
}

/** The campaign's label sets newest first, each with the file it downloads as. */
export function downloads(sets: readonly LabelSet[]): { set: LabelSet; file: string }[] {
  return [...sets]
    .sort((a, b) => b.id - a.id)
    .map((set) => ({ set, file: `${set.name.replace(/[^\w.-]+/gu, "-")}-v${set.version}-${set.kind}.tsv` }));
}

/** The values table's rows grouped by axis (one group, axis null, for a question of one value). */
export function byAxis(values: Results["values"]): { axis: string | null; rows: NonNullable<Results["values"]> }[] {
  const out: { axis: string | null; rows: NonNullable<Results["values"]> }[] = [];
  for (const v of values ?? []) {
    const last = out[out.length - 1];
    if (last && last.axis === v.axis) last.rows.push(v);
    else out.push({ axis: v.axis, rows: [v] });
  }
  return out;
}
