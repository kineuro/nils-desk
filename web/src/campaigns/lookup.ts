// SPDX-License-Identifier: AGPL-3.0-only
// The reader's lookup (record 48, after the second real read): answering is
// looking up, not selecting. Three pure parts the page, the tests and the
// layout check share:
//
// - the names a value goes by: its identity, its label, the pack's terms (a
//   vendor's name for the sequence) and the words its rules read, so typing
//   "bravo" finds MPRAGE and says why;
// - what a choice settles on the other rows: the pack's implications fill
//   what they imply (marked implied, held until the choice that implied it
//   changes), and the exclusion groups and implications grey out what can no
//   longer hold, with the reason; can't tell stays open on every row;
// - the whole answer at once: the combinations of the asked axes, the
//   registry's most common first (a count across the registry that never
//   includes this campaign's stacks or a sealed one), then what each value
//   settles alone, found by any name of any value in them.
//
// The names and the counts are the pack's and the registry's, the same for
// every stack; nothing here reads what any system said of the stack being
// read, so a blind item is looked up exactly as an open one.

import type { Json } from "../ask/client";
import { answeredAxes, CANT_TELL, cantTellOf, conditionWords, holds, jointOf, type AxesConstraints, type Given, type Joint, type Question } from "./client";

// ---------------------------------------------------------------- the names

/** The names one value goes by, as the question serves them (record 48, `vocabulary`). */
export interface ValueNames {
  label?: string;
  description?: string;
  /** The pack's display names: vendors' names, spellings, a radiologist's words. */
  terms: string[];
  /** The words the pack's rules read for the value. */
  keywords: string[];
}

/** Per axis, per value, the names it goes by. */
export type Vocabulary = Record<string, Record<string, ValueNames>>;

const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : []);

/** The question's vocabulary, read leniently; empty on an engine before it. */
export function vocabularyOf(q: Question | null): Vocabulary {
  const raw = (q as { vocabulary?: unknown } | null)?.vocabulary;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Vocabulary = {};
  for (const [axis, values] of Object.entries(raw as Json)) {
    if (!values || typeof values !== "object" || Array.isArray(values)) continue;
    out[axis] = {};
    for (const [value, n] of Object.entries(values as Json)) {
      const o = n && typeof n === "object" && !Array.isArray(n) ? (n as Json) : {};
      out[axis][value] = {
        ...(typeof o.label === "string" && o.label !== "" ? { label: o.label } : {}),
        ...(typeof o.description === "string" && o.description !== "" ? { description: o.description } : {}),
        terms: strs(o.terms),
        keywords: strs(o.keywords),
      };
    }
  }
  return out;
}

/** A name as it is compared: case, spaces, hyphens, underscores, stars, dots and quotes do not count. */
export const fold = (s: string): string => s.toLowerCase().replace(/[\s\-_*'.]/gu, "");

/** How well a name matches what was typed: the whole of it, its beginning, or somewhere inside. */
export type Fit = "exact" | "begins" | "holds";
const FIT_RANK: Record<Fit, number> = { exact: 0, begins: 1, holds: 2 };

/** One value found by a name: the name it was found by, and whether that is the value's own. */
export interface NameHit {
  value: string;
  fit: Fit;
  /** The name that matched, as the pack writes it. */
  word: string;
  /** Where the name came from: the identity or label (own), a term, or a word the rules read. */
  from: "own" | "term" | "keyword";
}

/** Every name of a value, its own first, then the pack's terms, then the rules' words. */
export function namesOf(value: string, names: ValueNames | undefined): { word: string; from: NameHit["from"] }[] {
  return [
    { word: value, from: "own" as const },
    ...(names?.label ? [{ word: names.label, from: "own" as const }] : []),
    ...(names?.terms ?? []).map((word) => ({ word, from: "term" as const })),
    ...(names?.keywords ?? []).map((word) => ({ word, from: "keyword" as const })),
  ];
}

/** The best name of a value for what was typed, or null: an exact name before one it begins, before one it holds; its own before the pack's. */
export function nameHit(value: string, names: ValueNames | undefined, typed: string): NameHit | null {
  const t = fold(typed);
  if (t === "") return null;
  let best: NameHit | null = null;
  for (const n of namesOf(value, names)) {
    const f = fold(n.word);
    if (f === "") continue;
    const fit: Fit | null = f === t ? "exact" : f.startsWith(t) ? "begins" : f.includes(t) ? "holds" : null;
    if (!fit) continue;
    if (!best || FIT_RANK[fit] < FIT_RANK[best.fit]) best = { value, fit, word: n.word, from: n.from };
  }
  return best;
}

/** Why a value was found, where it was not by its own name: "BRAVO → MPRAGE". */
export const hitWords = (h: NameHit): string | null => (h.from === "own" ? null : `${h.word} → ${h.value}`);

// ---------------------------------------------------------------- what a choice settles

/** A value filled in because another choice implies it, and which. */
export interface Implied {
  values: string[];
  /** The choices that imply it, in words: "technique is MPRAGE". */
  by: string;
}

/** What the choices so far settle on every asked axis. */
export interface Settled {
  /** The answer as it will be sent: the choices, and what they imply where the rater chose nothing. */
  given: Given;
  /** Per axis, what is filled in by implication. */
  implied: Record<string, Implied>;
  /** Per axis, per value, why it can no longer hold. */
  excluded: Record<string, Record<string, string>>;
  /** Per axis, why none can no longer hold, where it cannot. */
  noneExcluded: Record<string, string>;
}

type Values = Record<string, string | string[] | null>;

const unset = (v: string | string[] | null | undefined): boolean => v === undefined || v === "" || (Array.isArray(v) && v.length === 0);

/**
 * The pack's implications carried through the choices until nothing more
 * follows: an implication whose condition holds fills its value on an axis
 * the rater has not chosen (a single-valued axis takes it, a multi-valued
 * one adds it to what was chosen). An axis said none or can't tell is the
 * rater's and is never filled. The rater's own choices always stand; where
 * one contradicts an implication, the answer is illegal and says why.
 */
export function implied(c: AxesConstraints, chosen: Values, axes: string[], multi: string[], cant: string): { values: Values; implied: Record<string, Implied> } {
  const out: Values = { ...chosen };
  const filled: Record<string, Implied> = {};
  for (let round = 0; round < 12; round++) {
    let moved = false;
    const joint = jointOf(out, cant);
    for (const imp of c.implications ?? []) {
      if (holds(imp.when, joint) !== true) continue;
      for (const t of imp.then) {
        if (!axes.includes(t.axis)) continue;
        if (t.when !== undefined && t.when !== null && holds(t.when, joint) !== true) continue;
        const mine = chosen[t.axis];
        if (mine === null || mine === cant) continue;
        const isMulti = multi.includes(t.axis);
        if (!isMulti && !unset(mine)) continue;
        const now = out[t.axis];
        const held = Array.isArray(now) ? now : typeof now === "string" && now !== "" ? [now] : [];
        if (held.includes(t.value)) continue;
        out[t.axis] = isMulti ? [...held, t.value] : t.value;
        const by = conditionWords(imp.when);
        const was = filled[t.axis];
        filled[t.axis] = { values: [...(was?.values ?? []), t.value], by: was && was.by !== by ? `${was.by}; ${by}` : by };
        moved = true;
      }
    }
    if (!moved) break;
  }
  return { values: out, implied: filled };
}

/**
 * Why the pack forbids a joint answer, in a few words, or null: two values
 * of one exclusion group, an implication whose condition holds and whose
 * value the answer lacks, or an exclusion between axes (record 48) whose
 * condition holds and whose value the answer has. The engine's check (legalProblem) says the same at
 * length; this is what a greyed value says on hover.
 */
export function conflictOf(c: AxesConstraints, joint: Joint): string | null {
  const a: Joint = Object.fromEntries(Object.entries(joint).filter(([, v]) => !(v.length === 1 && v[0] === CANT_TELL)));
  for (const [axis, groups] of Object.entries(c.groups ?? {})) {
    const held = a[axis];
    if (!held) continue;
    for (const [group, members] of Object.entries(groups)) {
      const both = held.filter((v) => members.includes(v));
      if (both.length > 1) return `${both.join(" and ")} exclude each other (${group.toLowerCase().replace(/_/g, " ")})`;
    }
  }
  for (const imp of c.implications ?? []) {
    if (holds(imp.when, a) !== true) continue;
    for (const t of imp.then) {
      if (t.when !== undefined && t.when !== null && holds(t.when, a) !== true) continue;
      const held = a[t.axis];
      if (!held || held.includes(t.value)) continue;
      return `${conditionWords(imp.when)} sets ${t.axis} ${t.value}`;
    }
  }
  for (const x of c.excludes ?? []) {
    if (holds(x.when, a) !== true) continue;
    const bad = (a[x.axis] ?? []).find((v) => x.values.includes(v));
    if (bad !== undefined) return `${conditionWords(x.when)} rules out ${x.axis} ${bad}${x.why ? ` (${x.why})` : ""}`;
  }
  return null;
}

/** The asked axes' values each row may show, from the question or the rows. */
export type RowValues = { axis: string; values: string[]; multi?: boolean }[];

/**
 * What the choices settle (record 48, the second real read): the answer
 * with what they imply filled in, and on every row the values that can no
 * longer hold, each with the reason. A value is greyed where choosing it
 * now (in place of the row's choice, or beside it on a multi-valued row)
 * would leave an answer the pack forbids, what it implies carried through.
 * None is greyed the same way; can't tell never is. Nothing settles on a
 * question without constraints, or before anything is chosen.
 */
export function settle(q: Question | null, g: Given, rows: RowValues): Settled {
  const empty: Settled = { given: g, implied: {}, excluded: {}, noneExcluded: {} };
  if (!q || q.kind !== "axes" || !q.constraints || g.kind !== "values") return empty;
  const c = q.constraints;
  const cant = cantTellOf(q) ?? CANT_TELL;
  const axes = answeredAxes(q);
  const multi = c.multi ?? rows.filter((r) => r.multi).map((r) => r.axis);
  const chosen: Values = Object.fromEntries(Object.entries(g.values).filter(([a]) => axes.includes(a)));
  const now = implied(c, chosen, axes, multi, cant);
  const out: Settled = { given: { kind: "values", values: { ...g.values, ...now.values } }, implied: now.implied, excluded: {}, noneExcluded: {} };
  const problem = (values: Values) => conflictOf(c, jointOf(implied(c, values, axes, multi, cant).values, cant));
  for (const r of rows) {
    if (!axes.includes(r.axis)) continue;
    const mine = chosen[r.axis];
    const isMulti = multi.includes(r.axis);
    const held = Array.isArray(mine) ? mine : [];
    for (const v of r.values) {
      if (isMulti ? held.includes(v) : mine === v) continue;
      const tried: Values = { ...chosen, [r.axis]: isMulti ? [...held, v] : v };
      const why = problem(tried);
      if (why) (out.excluded[r.axis] ??= {})[v] = why;
    }
    if (mine !== null) {
      const why = problem({ ...chosen, [r.axis]: null });
      if (why) out.noneExcluded[r.axis] = why;
    }
  }
  return out;
}

// ---------------------------------------------------------------- the whole answer at once

/** One whole answer the search offers: a value (or a set, or none) per axis it names. */
export interface Combination {
  values: Values;
  /** How many of the registry's stacks hold it (never this campaign's, never a sealed one); zero for one the pack's shape alone offers. */
  count: number;
  /** Offered by the pack's shape (a value and what it implies), not found in the registry. */
  seed?: boolean;
}

/** The combinations door's answer (GET /api/campaigns/{id}/combinations), read leniently. */
export function combinationsOf(raw: unknown): Combination[] {
  const list = raw && typeof raw === "object" && Array.isArray((raw as Json).combinations) ? ((raw as Json).combinations as unknown[]) : [];
  return list.flatMap((x) => {
    const o = x && typeof x === "object" && !Array.isArray(x) ? (x as Json) : null;
    const v = o && o.values && typeof o.values === "object" && !Array.isArray(o.values) ? (o.values as Json) : null;
    if (!v) return [];
    const values: Values = {};
    for (const [axis, val] of Object.entries(v)) {
      if (val === null) values[axis] = null;
      else if (typeof val === "string") values[axis] = val;
      else if (Array.isArray(val)) values[axis] = strs(val);
    }
    return [{ values, count: typeof o!.count === "number" ? o!.count : 0 }];
  });
}

/**
 * What the pack's shape offers alone: each value of each row, with what it
 * implies, so a value the registry has never held (or an engine without the
 * combinations door) is still found as a whole answer. Only values legal on
 * their own.
 */
export function seedsOf(q: Question, rows: RowValues): Combination[] {
  if (q.kind !== "axes") return [];
  const out: Combination[] = [];
  for (const r of rows) {
    for (const v of r.values) {
      const s = settle(q, { kind: "values", values: { [r.axis]: r.multi ? [v] : v } }, []);
      if (s.given.kind !== "values") continue;
      const c = q.constraints;
      if (c && conflictOf(c, jointOf(s.given.values, cantTellOf(q) ?? CANT_TELL))) continue;
      const values: Values = {};
      for (const [a, x] of Object.entries(s.given.values)) if (!unset(x)) values[a] = x;
      out.push({ values, count: 0, seed: true });
    }
  }
  return out;
}

/** A combination found, with the names it was found by. */
export interface ComboHit {
  combo: Combination;
  /** Per axis, the value that matched and why (a term or a word), for the line. */
  hits: NameHit[];
  score: number;
}

const valuesIn = (v: string | string[] | null | undefined): string[] => (Array.isArray(v) ? v : typeof v === "string" && v !== "" ? [v] : []);

/**
 * The combinations for what was typed, best first. The whole of it may name
 * one value ("3d tfe"), or each word a value of the combination ("bravo
 * t1"). A value's own name beats a term, a term beats a word the rules read;
 * a whole name beats its beginning, which beats a part. Among equals the
 * registry's more common come first, then the shape's own offers.
 */
export function findCombos(combos: Combination[], typed: string, vocab: Vocabulary, limit = 8): ComboHit[] {
  const whole = fold(typed);
  if (whole === "") return [];
  const words = typed.split(/\s+/u).filter((w) => fold(w) !== "");
  const out: ComboHit[] = [];
  const hitIn = (combo: Combination, word: string): NameHit | null => {
    let best: NameHit | null = null;
    for (const [axis, v] of Object.entries(combo.values)) {
      for (const value of valuesIn(v)) {
        const h = nameHit(value, vocab[axis]?.[value], word);
        if (h && (!best || rank(h) < rank(best))) best = h;
      }
    }
    return best;
  };
  for (const combo of combos) {
    const one = hitIn(combo, typed);
    let hits: NameHit[] | null = one ? [one] : null;
    if (!hits && words.length > 1) {
      const each = words.map((w) => hitIn(combo, w));
      if (each.every((h) => h !== null)) hits = each as NameHit[];
    }
    if (!hits) continue;
    const score = hits.reduce((s, h) => s + rank(h), 0) / hits.length;
    out.push({ combo, hits, score });
  }
  out.sort((a, b) => a.score - b.score || Number(a.combo.seed ?? false) - Number(b.combo.seed ?? false) || b.combo.count - a.combo.count || size(b.combo) - size(a.combo));
  return out.slice(0, limit);
}

const rank = (h: NameHit) => FIT_RANK[h.fit] * 3 + (h.from === "own" ? 0 : h.from === "term" ? 1 : 2);
const size = (c: Combination) => Object.values(c.values).filter((v) => !unset(v)).length;

/** A combination in one line, the asked axes in the rows' order: none for no value; an axis it leaves open is left out. */
export function comboWords(c: Combination, axes: string[]): string {
  return axes
    .filter((a) => c.values[a] !== undefined)
    .map((a) => {
      const v = c.values[a];
      if (v === undefined || v === null || (Array.isArray(v) && v.length === 0)) return "none";
      return Array.isArray(v) ? v.join("+") : v;
    })
    .join(" · ");
}

/**
 * The answer after a combination is taken: every axis it names is set (a
 * multi-valued axis's empty set as none), and an axis it leaves open keeps
 * what was chosen, unless that no longer holds beside it, when it is
 * cleared. A combination from the registry names every asked axis.
 */
export function takeCombo(q: Question, g: Given, c: Combination): Given {
  const was: Values = g.kind === "values" ? g.values : {};
  const set: Values = {};
  for (const [a, v] of Object.entries(c.values)) set[a] = Array.isArray(v) && v.length === 0 ? null : v;
  const values: Values = { ...was, ...set };
  const cons = q.constraints;
  if (cons) {
    const cant = cantTellOf(q) ?? CANT_TELL;
    for (const a of answeredAxes(q)) {
      if (a in set || unset(values[a])) continue;
      const without = { ...values, [a]: "" };
      if (conflictOf(cons, jointOf(values, cant)) && !conflictOf(cons, jointOf(without, cant))) values[a] = "";
    }
  }
  return { kind: "values", values };
}
