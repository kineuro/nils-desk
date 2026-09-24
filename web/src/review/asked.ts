// SPDX-License-Identifier: AGPL-3.0-only
// System 1's slot (record 45 R5, S7): a `classify.asked` item read as its
// evidence fixes it. Only legal joint assignments are candidates, most
// probable first; beside them both systems' evidence (the rules' value,
// rule and votes per axis, the model's probabilities per axis) and the
// certificate's facts. The desk renders only what is legal: a candidate the
// pack does not allow, or whose probability is not one, is left out and
// counted, whatever the evidence carried.

import type { Json } from "../ask/client";
import type { ReviewItem } from "../ops/client";
import type { PackDoc } from "./client";

export const CLASSIFY_ASKED = "classify.asked";

export type AxisValue = string | string[];

export interface AskedCandidate {
  values: Record<string, AxisValue>;
  p: number;
}

export interface RulesAxis {
  value: string | null;
  rule_set: string | null;
  rule: string | null;
  votes: { rule: string; value: string }[];
  label_model_p: number | null;
}

export interface Certificate {
  epsilon: number | null;
  delta: number | null;
  threshold: number | null;
  score: number | null;
  group: string | null;
}

export interface Asked {
  item: ReviewItem;
  stack: number | null;
  candidates: AskedCandidate[];
  /** Candidates the evidence carried that the desk would not render. */
  dropped: number;
  rules: Record<string, RulesAxis>;
  model: { id: number | null; digest: string | null; p: Record<string, Record<string, number>> } | null;
  certificate: Certificate | null;
  agree: string[];
  /** The axes the candidates name where the two systems do not agree. */
  differ: string[];
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const text = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const obj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});

function axisValue(v: unknown): AxisValue | null {
  if (typeof v === "string" && v !== "") return v;
  // a set on a multi-valued axis, which may be empty: no modifier at all
  if (Array.isArray(v) && v.every((x) => typeof x === "string" && x !== "")) return v as string[];
  return null;
}

/** Whether a candidate may be rendered: a probability, at least one axis, and every value one the pack allows on its axis where the pack lists them. */
export function legal(raw: Json, pack: PackDoc | null): AskedCandidate | null {
  if (raw.legal === false) return null;
  const p = num(raw.p);
  if (p === null || p < 0 || p > 1) return null;
  const given = obj(raw.values);
  const values: Record<string, AxisValue> = {};
  for (const [axis, v] of Object.entries(given)) {
    const value = axisValue(v);
    if (value === null) return null;
    if (pack) {
      const a = pack.axes.find((x) => x.axis === axis);
      if (!a) return null;
      if (Array.isArray(value) && !a.multi) return null;
      if (a.values.length > 0) {
        const allowed = new Set(a.values.map((x) => x.value));
        if ((Array.isArray(value) ? value : [value]).some((x) => !allowed.has(x))) return null;
      }
    }
    values[axis] = value;
  }
  if (Object.keys(values).length === 0) return null;
  return { values, p };
}

/** A `classify.asked` item as the page reads it, or null for any other kind. */
export function askedOf(item: ReviewItem, pack: PackDoc | null = null): Asked | null {
  if (item.kind !== CLASSIFY_ASKED) return null;
  const ev = obj(item.evidence);
  const ref = obj(item.ref);
  const raw = Array.isArray(ev.candidates) ? (ev.candidates as unknown[]).map(obj) : [];
  const seen = new Set<string>();
  const candidates: AskedCandidate[] = [];
  for (const r of raw) {
    const c = legal(r, pack);
    if (!c) continue;
    const key = JSON.stringify(Object.entries(c.values).sort(([a], [b]) => a.localeCompare(b)));
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(c);
  }
  candidates.sort((a, b) => b.p - a.p);
  const systems = obj(ev.systems);
  const rules: Record<string, RulesAxis> = {};
  for (const [axis, v] of Object.entries(obj(systems.rules))) {
    const r = obj(v);
    rules[axis] = {
      value: text(r.value),
      rule_set: text(r.rule_set),
      rule: text(r.rule),
      votes: Array.isArray(r.votes) ? (r.votes as unknown[]).map(obj).flatMap((x) => (text(x.rule) && text(x.value) ? [{ rule: x.rule as string, value: x.value as string }] : [])) : [],
      label_model_p: num(r.label_model_p),
    };
  }
  const m = obj(systems.model);
  const probs: Record<string, Record<string, number>> = {};
  for (const [axis, v] of Object.entries(obj(m.p))) {
    const row: Record<string, number> = {};
    for (const [value, q] of Object.entries(obj(v))) if (num(q) !== null) row[value] = q as number;
    probs[axis] = row;
  }
  const model = Object.keys(m).length > 0 ? { id: num(m.model_id), digest: text(m.digest), p: probs } : null;
  const c = obj(ev.certificate);
  const certificate = Object.keys(c).length > 0 ? { epsilon: num(c.epsilon), delta: num(c.delta), threshold: num(c.threshold), score: num(c.score), group: text(c.group) ?? (num(c.group) !== null ? String(c.group) : null) } : null;
  const agree = Array.isArray(ev.agree) ? (ev.agree as unknown[]).flatMap((a) => (typeof a === "string" ? [a] : [])) : [];
  const named = [...new Set(candidates.flatMap((x) => Object.keys(x.values)))];
  return {
    item,
    stack: num(ref.stack_id) ?? num(ev.stack_id),
    candidates,
    dropped: raw.length - candidates.length,
    rules,
    model,
    certificate,
    agree,
    differ: named.filter((a) => !agree.includes(a)),
  };
}

/** The model's most probable value on an axis, with its probability. */
export function modelTop(a: Asked, axis: string): { value: string; p: number } | null {
  const row = a.model?.p[axis];
  if (!row) return null;
  const best = Object.entries(row).sort((x, y) => y[1] - x[1])[0];
  return best ? { value: best[0], p: best[1] } : null;
}

/** A value in words: a set of values joined. */
export function valueWords(v: AxisValue): string {
  return Array.isArray(v) ? (v.length > 0 ? v.join(" + ") : "none") : v;
}

/** The decisions choosing a candidate writes in Review: one apply per axis, on the stack's open item of that axis; an axis without one is named as left. */
export function choosePlan(c: AskedCandidate, stack: number | null, open: ReviewItem[]): { applies: { item: ReviewItem; axis: string; value: string }[]; left: string[] } {
  const applies: { item: ReviewItem; axis: string; value: string }[] = [];
  const left: string[] = [];
  for (const [axis, v] of Object.entries(c.values)) {
    const item = open.find((i) => i.status === "open" && i.kind.startsWith(`${axis}:`) && !i.kind.endsWith(":model") && num(obj(i.ref).stack_id) === stack);
    if (item && typeof v === "string") applies.push({ item, axis, value: v });
    else left.push(axis);
  }
  return { applies, left };
}
