// SPDX-License-Identifier: AGPL-3.0-only
// System 1's slot (record 45 R5, S7): a `classify.asked` item read as its
// evidence fixes it. Only legal joint assignments are candidates, most
// probable first; beside them both systems' evidence (the rules' value,
// rule and votes per axis, the model's probabilities per axis) and the
// certificate's facts. The desk renders only what is legal: a candidate the
// pack does not allow, or whose probability is not one, is left out and
// counted, whatever the evidence carried. The shape is the review-item
// contract's classify.asked evidence (contracts/review-item/v4); the study's
// first draft of it (rules per axis at the top, epsilon) is read as well.

import type { Json } from "../ask/client";
import type { ReviewItem } from "../ops/client";
import type { PackDoc } from "./client";

export const CLASSIFY_ASKED = "classify.asked";

/** A value, a set of values on a multi-valued axis, or null for no value. */
export type AxisValue = string | string[] | null;

export interface AskedCandidate {
  values: Record<string, AxisValue>;
  p: number;
}

export interface RulesAxis {
  value: string | null;
  rule_set: string | null;
  rule: string | null;
  votes: { rule: string; value: string | null }[];
  /** The label model's probability of each value, or of the rules' value alone in the first draft. */
  label_model_p: Record<string, number> | number | null;
}

export interface Certificate {
  /** The risk the stack is held to (epsilon). */
  risk: number | null;
  delta: number | null;
  threshold: number | null;
  score: number | null;
  group: string | null;
  auto: boolean | null;
}

export interface Asked {
  item: ReviewItem;
  stack: number | null;
  candidates: AskedCandidate[];
  /** Candidates the evidence carried that the desk would not render. */
  dropped: number;
  rules: Record<string, RulesAxis>;
  model: { id: number | null; digest: string | null; name: string | null; p: Record<string, Record<string, number>> } | null;
  /** The axes the stack is asked about. */
  axes: string[];
  certificate: Certificate | null;
  agree: string[];
  /** The axes the candidates name where the two systems do not agree. */
  differ: string[];
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const text = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const obj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});

function axisValue(v: unknown): AxisValue | undefined {
  if (v === null) return null;
  if (typeof v === "string" && v !== "") return v;
  // a set on a multi-valued axis, which may be empty: no modifier at all
  if (Array.isArray(v) && v.every((x) => typeof x === "string" && x !== "")) return v as string[];
  return undefined;
}

/** Whether a candidate may be rendered: a probability, at least one axis, and every value one the pack allows on its axis where the pack lists them. */
export function legal(raw: Json, pack: PackDoc | null, axes: string[] = []): AskedCandidate | null {
  if (raw.legal === false) return null;
  const p = num(raw.p);
  if (p === null || p < 0 || p > 1) return null;
  const given = obj(raw.values);
  const values: Record<string, AxisValue> = {};
  for (const [axis, v] of Object.entries(given)) {
    const value = axisValue(v);
    if (value === undefined) return null;
    if (axes.length > 0 && !axes.includes(axis)) return null;
    if (pack && value !== null) {
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
  // every axis the stack is asked about has its answer in a candidate
  if (axes.some((a) => !(a in values))) return null;
  return { values, p };
}

/** A `classify.asked` item as the page reads it, or null for any other kind. */
export function askedOf(item: ReviewItem, pack: PackDoc | null = null): Asked | null {
  if (item.kind !== CLASSIFY_ASKED) return null;
  const ev = obj(item.evidence);
  const ref = obj(item.ref);
  const raw = Array.isArray(ev.candidates) ? (ev.candidates as unknown[]).map(obj) : [];
  const axes = Array.isArray(ev.axes) ? (ev.axes as unknown[]).flatMap((a) => (typeof a === "string" ? [a] : [])) : [];
  const seen = new Set<string>();
  const candidates: AskedCandidate[] = [];
  for (const r of raw) {
    const c = legal(r, pack, axes);
    if (!c) continue;
    const key = JSON.stringify(Object.entries(c.values).sort(([a], [b]) => a.localeCompare(b)));
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(c);
  }
  candidates.sort((a, b) => b.p - a.p);
  const systems = obj(ev.systems);
  const rules: Record<string, RulesAxis> = {};
  const rulesDoc = obj(systems.rules);
  // the contract keeps the rules' axes under `axes` beside the pack; the first draft kept them at the top
  const perAxis = rulesDoc.axes && typeof rulesDoc.axes === "object" && !Array.isArray(rulesDoc.axes) ? obj(rulesDoc.axes) : rulesDoc;
  for (const [axis, v] of Object.entries(perAxis)) {
    if (axis === "pack" && typeof v === "string") continue;
    const r = obj(v);
    rules[axis] = {
      value: text(r.value),
      rule_set: text(r.rule_set),
      rule: text(r.rule),
      votes: Array.isArray(r.votes) ? (r.votes as unknown[]).map(obj).flatMap((x) => (text(x.rule) ? [{ rule: x.rule as string, value: text(x.value) }] : [])) : [],
      label_model_p: num(r.label_model_p) ?? probs(r.label_model_p),
    };
  }
  const m = obj(systems.model);
  const modelP: Record<string, Record<string, number>> = {};
  for (const [axis, v] of Object.entries(obj(m.p))) modelP[axis] = probs(v) ?? {};
  const named = text(m.name) ? `${m.name as string}${text(m.version) ? `@${m.version as string}` : ""}` : null;
  const model = Object.keys(m).length > 0 ? { id: num(m.model_id), digest: text(m.digest), name: named, p: modelP } : null;
  const c = obj(ev.certificate);
  const certificate =
    Object.keys(c).length > 0
      ? { risk: num(c.risk_level) ?? num(c.epsilon), delta: num(c.delta), threshold: num(c.threshold), score: num(c.score), group: text(c.group) ?? (num(c.group) !== null ? String(c.group) : null), auto: typeof c.auto_decided === "boolean" ? c.auto_decided : null }
      : null;
  const agree = Array.isArray(ev.agree) ? (ev.agree as unknown[]).flatMap((a) => (typeof a === "string" ? [a] : [])) : [];
  const asked = axes.length > 0 ? axes : [...new Set(candidates.flatMap((x) => Object.keys(x.values)))];
  return {
    item,
    stack: num(ref.stack_id) ?? num(ev.stack_id),
    candidates,
    dropped: raw.length - candidates.length,
    rules,
    model,
    certificate,
    agree,
    axes: asked,
    differ: asked.filter((a) => !agree.includes(a)),
  };
}

/** The model's most probable value on an axis, with its probability. */
export function modelTop(a: Asked, axis: string): { value: string; p: number } | null {
  const row = a.model?.p[axis];
  if (!row) return null;
  const best = Object.entries(row).sort((x, y) => y[1] - x[1])[0];
  return best ? { value: best[0], p: best[1] } : null;
}

/** A value in words: a set of values joined, and no value said so. */
export function valueWords(v: AxisValue): string {
  if (v === null) return "no value";
  return Array.isArray(v) ? (v.length > 0 ? v.join(" + ") : "none") : v;
}

/** A map of probabilities by value, or null. */
function probs(v: unknown): Record<string, number> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const row: Record<string, number> = {};
  for (const [value, q] of Object.entries(v as Json)) if (typeof q === "number" && Number.isFinite(q)) row[value] = q;
  return row;
}

/** The label model's probability of the rules' own value on an axis. */
export function rulesP(r: RulesAxis): number | null {
  if (typeof r.label_model_p === "number") return r.label_model_p;
  if (r.label_model_p && r.value !== null) return r.label_model_p[r.value] ?? null;
  return null;
}

/** The decisions choosing a candidate writes in Review: one apply per axis, on the stack's open item of that axis, a value or no value; an axis without one, or a set on a multi-valued axis, is named as left. */
export function choosePlan(c: AskedCandidate, stack: number | null, open: ReviewItem[]): { applies: { item: ReviewItem; axis: string; value: string | null }[]; left: string[] } {
  const applies: { item: ReviewItem; axis: string; value: string | null }[] = [];
  const left: string[] = [];
  for (const [axis, v] of Object.entries(c.values)) {
    const item = open.find((i) => i.status === "open" && i.kind.startsWith(`${axis}:`) && !i.kind.endsWith(":model") && num(obj(i.ref).stack_id) === stack);
    if (item && !Array.isArray(v)) applies.push({ item, axis, value: v });
    else left.push(axis);
  }
  return { applies, left };
}
