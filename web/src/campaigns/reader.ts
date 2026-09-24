// SPDX-License-Identifier: AGPL-3.0-only
// The reader's pure parts (record 48 section 2, slice R1): the rating
// workspace of record 45 grown so a person reads a stack in seconds. The
// answer the rules and System 1 agree on is filled in and one key confirms
// it; where they disagree the legal candidates show with their
// probabilities; one line per axis says what decided it; the next items'
// pictures are warmed while this one is read; like stacks come as a batch;
// and every decision is timed. The page, the tests and the headless walk
// share these, so the walk proves what the page does.

import type { Json } from "../ask/client";
import type { AskedCandidate, AxisValue } from "../review/asked";
import { axisValues, CANDIDATE_KEYS, type Given, type Item, type Question } from "./client";
import { illegal } from "./workspace";

// ---------------------------------------------------------------- the evidence line

/** One axis as the reader shows it: what decided the value, in one line, with the rest one key away. */
export interface AxisLine {
  axis: string;
  /** The rules' value; a set on a multi-valued axis; null for no value. */
  value: AxisValue;
  /** The flags that decided it (the pack's flags on the header, such as `inversion`, `fat-sat`). */
  flags: string[];
  rule_set: string | null;
  rule: string | null;
  /** The clause of the rule that held, in the pack's words. */
  clause: string | null;
  /** The header values the clause read (TR, TE, TI, flip angle, sequence name, image type), name to value. */
  reads: [string, string][];
  /** Every rule that voted, the deciding one among them. */
  votes: { rule: string; value: string | null }[];
  /** The words it matched; null where the detail level does not allow them. */
  words: string[] | null;
  /** System 1's answer on the axis, and what it weighed most. */
  model: { value: string | null; p: number | null; weighed: string[] } | null;
  confidence: number | null;
  /** Whether the two systems name the same value; null where only one spoke. */
  agree: boolean | null;
}

/** What the reader reads for one item: the lines, the legal candidates, and the suggestion where the engine made one. */
export interface Reading {
  item: number | null;
  stack: number | null;
  axes: string[];
  lines: AxisLine[];
  /** Legal joint answers, most probable first. */
  candidates: AskedCandidate[];
  /** The engine's own suggestion, where it names one; else the desk derives it from the lines and candidates. */
  suggested: Record<string, AxisValue> | null;
  /** The item's value to the model (record 48 "order by value"), where the engine says it. */
  value: number | null;
  /** The batch of like stacks the item belongs to, where the engine groups them. */
  batch: string | null;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const text = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const obj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const texts = (v: unknown): string[] => (Array.isArray(v) ? v.flatMap((x) => (typeof x === "string" && x !== "" ? [x] : typeof x === "number" ? [String(x)] : [])) : typeof v === "string" && v !== "" ? [v] : []);

function axisValue(v: unknown): AxisValue | undefined {
  if (v === null) return null;
  if (typeof v === "string" && v !== "") return v;
  if (Array.isArray(v) && v.every((x) => typeof x === "string" && x !== "")) return v as string[];
  return undefined;
}

/** Header values as pairs, from an object or a list of {name, value}. */
function pairs(v: unknown): [string, string][] {
  if (Array.isArray(v))
    return v.flatMap((x) => {
      const o = obj(x);
      const k = text(o.name) ?? text(o.tag) ?? text(o.field);
      return k && o.value !== undefined && o.value !== null ? [[k, Array.isArray(o.value) ? o.value.join("\\") : String(o.value)] as [string, string]] : [];
    });
  return Object.entries(obj(v)).flatMap(([k, x]) => (x === undefined || x === null ? [] : [[k, Array.isArray(x) ? x.join("\\") : String(x)] as [string, string]]));
}

function votes(v: unknown): { rule: string; value: string | null }[] {
  return Array.isArray(v) ? v.map(obj).flatMap((x) => (text(x.rule) ? [{ rule: x.rule as string, value: text(x.value) }] : [])) : [];
}

/** One line from the engine's evidence door (record 48 R1), read leniently: a field it does not name stays empty. */
export function lineOf(axis: string, raw: Json): AxisLine {
  const m = raw.model === undefined || raw.model === null ? null : obj(raw.model);
  const value = axisValue(raw.value);
  const words = raw.words === null || raw.matched === null ? null : raw.words !== undefined ? texts(raw.words) : raw.matched !== undefined ? texts(raw.matched) : [];
  return {
    axis,
    value: value === undefined ? null : value,
    flags: texts(raw.flags ?? raw.flag),
    rule_set: text(raw.rule_set),
    rule: text(raw.rule),
    clause: text(raw.clause) ?? text(raw.held),
    reads: pairs(raw.reads ?? raw.header ?? raw.headers),
    votes: votes(raw.votes),
    words,
    model: m ? { value: text(m.value), p: num(m.p), weighed: texts(m.weighed ?? m.features ?? m.top) } : null,
    confidence: num(raw.confidence),
    agree: typeof raw.agree === "boolean" ? raw.agree : null,
  };
}

/** A legal candidate from the evidence, or null; illegal or odd ones are never drawn (record 45 R5). */
function candidateOf(raw: unknown, axes: string[]): AskedCandidate | null {
  const r = obj(raw);
  if (r.legal === false) return null;
  const p = num(r.p);
  if (p === null || p < 0 || p > 1) return null;
  const values: Record<string, AxisValue> = {};
  for (const [axis, v] of Object.entries(obj(r.values))) {
    const x = axisValue(v);
    if (x === undefined) return null;
    values[axis] = x;
  }
  if (Object.keys(values).length === 0 || axes.some((a) => !(a in values))) return null;
  return { values, p };
}

/**
 * The engine's reading of one campaign item (record 48 R1's evidence door),
 * read leniently: `lines` as a list of {axis, ...} or `axes` as {axis: {...}},
 * candidates as classify.asked carries them, and a `suggestion` where the
 * engine names one.
 */
export function readingOf(raw: Json): Reading {
  const lines: AxisLine[] = [];
  if (Array.isArray(raw.lines)) for (const l of raw.lines.map(obj)) if (text(l.axis)) lines.push(lineOf(l.axis as string, l));
  const perAxis = raw.axes && typeof raw.axes === "object" && !Array.isArray(raw.axes) ? obj(raw.axes) : {};
  for (const [axis, l] of Object.entries(perAxis)) if (!lines.some((x) => x.axis === axis)) lines.push(lineOf(axis, obj(l)));
  const asked = Array.isArray(raw.axes) ? texts(raw.axes) : Array.isArray(raw.asked) ? texts(raw.asked) : lines.map((l) => l.axis);
  const candidates = (Array.isArray(raw.candidates) ? raw.candidates : []).flatMap((c) => candidateOf(c, asked) ?? []).sort((a, b) => b.p - a.p);
  const s = raw.suggestion ?? raw.suggested;
  const sv = s && typeof s === "object" && !Array.isArray(s) ? obj(obj(s).values ?? s) : null;
  let suggested: Record<string, AxisValue> | null = null;
  if (sv) {
    suggested = {};
    for (const [axis, v] of Object.entries(sv)) {
      const x = axisValue(v);
      if (x !== undefined) suggested[axis] = x;
    }
  }
  return {
    item: num(raw.item) ?? num(raw.item_id),
    stack: num(raw.stack) ?? num(raw.stack_id),
    axes: asked,
    lines,
    candidates,
    suggested,
    value: num(raw.value),
    batch: text(raw.batch) ?? (num(raw.batch) !== null ? String(raw.batch) : null),
  };
}

/** The explain door's axis rows (GET /api/explain/{stack}), as far as it goes. */
export interface ExplainRows {
  axes: { axis: string; value: string | null; confidence?: number; evidence?: { rule_set: string; rule: string; source: string; matched: string | null; value?: string | null }[] | null }[];
}

/** Header fields a rule reads, as the explain door names its sources; anything else a rule matched is words. */
const HEADER = /^(tr|te|ti|flip|flip ?angle|repetition|echo|inversion|scanning ?sequence|sequence ?(name|variant)|image ?type|mr ?acquisition ?type|b ?value|slice ?thickness|contrast|modality|manufacturer|\(?[0-9a-f]{4},[0-9a-f]{4}\)?)/iu;

/**
 * A reading from what an engine before record 48 serves: a classify.asked
 * item's evidence (the candidates, both systems, where they agree) and the
 * explain door's rows (the rule, what it read, what it matched). Flags and
 * clauses are the new door's; this reads what is there.
 */
export function readingFromAsked(evidence: Json | null, explain: ExplainRows | null, stack: number | null, askedAxes: string[]): Reading {
  const ev = obj(evidence);
  const axes = texts(ev.axes).length > 0 ? texts(ev.axes) : askedAxes;
  const systems = obj(ev.systems);
  const rulesDoc = obj(systems.rules);
  const perAxis = rulesDoc.axes && typeof rulesDoc.axes === "object" ? obj(rulesDoc.axes) : {};
  const model = obj(systems.model);
  const modelP = obj(model.p);
  const agree = texts(ev.agree);
  const all = [...new Set([...axes, ...askedAxes, ...(explain?.axes ?? []).map((a) => a.axis)])].filter((a) => askedAxes.length === 0 || askedAxes.includes(a));
  const lines = all.map((axis): AxisLine => {
    const r = obj(perAxis[axis]);
    const x = explain?.axes.find((a) => a.axis === axis) ?? null;
    const rows = x?.evidence ?? [];
    const top = Object.entries(obj(modelP[axis])).flatMap(([v, p]) => (typeof p === "number" ? [[v, p] as const] : [])).sort((a, b) => b[1] - a[1])[0];
    const reads: [string, string][] = [];
    const words: string[] = [];
    for (const e of rows) {
      if (!e.matched) continue;
      if (HEADER.test(e.source)) reads.push([e.source, e.matched]);
      else if (!words.includes(e.matched)) words.push(e.matched);
    }
    const decided = rows[0] ?? null;
    const rulesValue = r.value !== undefined ? axisValue(r.value) : undefined;
    const value = rulesValue !== undefined ? rulesValue : (x?.value ?? null);
    return {
      axis,
      value,
      flags: texts(r.flags),
      rule_set: text(r.rule_set) ?? decided?.rule_set ?? null,
      rule: text(r.rule) ?? decided?.rule ?? null,
      clause: text(r.clause),
      reads,
      votes: votes(r.votes).length > 0 ? votes(r.votes) : rows.map((e) => ({ rule: e.rule_set ? `${e.rule_set}/${e.rule}` : e.rule, value: e.value ?? null })),
      words: rows.length > 0 || words.length > 0 ? words : null,
      model: top ? { value: top[0], p: top[1], weighed: [] } : null,
      confidence: x?.confidence ?? null,
      // where the item lists the axes both systems agree on, any other asked axis is a disagreement
      agree: agree.includes(axis) ? true : Array.isArray(ev.agree) && axes.includes(axis) ? false : top && typeof value === "string" ? top[0] === value : null,
    };
  });
  const candidates = (Array.isArray(ev.candidates) ? ev.candidates : []).flatMap((c) => candidateOf(c, axes) ?? []).sort((a, b) => b.p - a.p);
  return { item: null, stack, axes: all, lines, candidates, suggested: null, value: null, batch: null };
}

// ---------------------------------------------------------------- the suggestion

/** The answer filled in, and why. */
export interface Suggestion {
  /** The values filled in, by axis: the ones both systems agree on. */
  values: Record<string, AxisValue>;
  /** The axes both systems agree on, filled in. */
  agreed: string[];
  /** The axes they differ on, left for the person; the candidates show. */
  differ: string[];
  /** The legal candidates shown where they differ, most probable first, at most four. */
  offered: AskedCandidate[];
  /** The first candidate's probability, where there is one. */
  p: number | null;
}

/** The axes a question asks. */
export function askedAxes(q: Question): string[] {
  return q.kind === "axis" ? (q.axis ? [q.axis] : []) : q.kind === "axes" ? (q.axes ?? []) : [];
}

/** How sure a lone candidate must be to be filled in when no rule speaks to its axis. */
const SURE = 0.9;

export { CANDIDATE_KEYS };

/** Whether a value may stand in the question's answer: one of its listed values, where it lists them. */
function allowed(q: Question, axis: string, v: AxisValue): boolean {
  const list = axisValues(q, axis);
  if (list.length === 0 || v === null) return true;
  return (Array.isArray(v) ? v : [v]).every((x) => list.includes(x));
}

const same = (a: AxisValue | undefined, b: AxisValue | undefined) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));
function norm(v: AxisValue | undefined): string[] | string | null {
  if (v === undefined || v === null) return null;
  if (Array.isArray(v)) return v.length === 0 ? null : [...v].sort();
  return v;
}

/**
 * The suggestion for an item: the engine's where it names one; else the
 * first legal candidate's values on the axes the two systems agree on; else
 * the rules' value on an axis System 1 does not contradict. Only values the
 * question allows are filled in, and never a combination the pack forbids.
 */
export function suggestionOf(q: Question, r: Reading | null): Suggestion | null {
  if (!r || (q.kind !== "axis" && q.kind !== "axes")) return null;
  const axes = askedAxes(q);
  const top = r.candidates[0] ?? null;
  const values: Record<string, AxisValue> = {};
  const agreed: string[] = [];
  const differ: string[] = [];
  for (const axis of axes) {
    const line = r.lines.find((l) => l.axis === axis) ?? null;
    const cand = top && axis in top.values ? top.values[axis] : undefined;
    let v: AxisValue | undefined;
    if (r.suggested && axis in r.suggested) v = r.suggested[axis];
    else if (line?.agree === false) v = undefined;
    else if (cand !== undefined && line?.agree === true) v = cand;
    else if (cand !== undefined && line && line.value !== null && same(cand, line.value)) v = cand;
    else if (cand !== undefined && !line && top!.p >= SURE) v = cand;
    // the rules alone, where System 1 has not spoken
    else if (cand === undefined && line && line.value !== null && line.model === null) v = line.value;
    if (v !== undefined && allowed(q, axis, v)) {
      values[axis] = v;
      agreed.push(axis);
    } else differ.push(axis);
  }
  // a combination the pack forbids is never filled in: the differing axes are left open
  const g = givenOf(q, { values });
  if (g && illegal(q, g)) return { values: {}, agreed: [], differ: axes, offered: r.candidates.slice(0, CANDIDATE_KEYS.length), p: top?.p ?? null };
  if (agreed.length === 0 && differ.length === 0) return null;
  return { values, agreed, differ, offered: differ.length > 0 ? r.candidates.slice(0, CANDIDATE_KEYS.length) : [], p: top?.p ?? null };
}

/** The given answer a suggestion fills in: an axis's value, or an axes answer with the agreed axes set (none for an empty set). */
export function givenOf(q: Question, s: Pick<Suggestion, "values"> | null): Given | null {
  if (!s) return null;
  if (q.kind === "axis" && q.axis) {
    const v = s.values[q.axis];
    return typeof v === "string" ? { kind: "value", value: v } : { kind: "value", value: "" };
  }
  if (q.kind === "axes") {
    const values: Record<string, string | string[] | null> = {};
    for (const [axis, v] of Object.entries(s.values)) values[axis] = Array.isArray(v) && v.length === 0 ? null : v;
    return { kind: "values", values };
  }
  return null;
}

/** A candidate as a given answer, every asked axis set. */
export function givenOfCandidate(q: Question, c: AskedCandidate): Given | null {
  const values: Record<string, AxisValue> = {};
  for (const axis of askedAxes(q)) values[axis] = c.values[axis] ?? null;
  return givenOf(q, { values });
}

/** How many asked axes the answer changed from what was filled in; null when nothing was. */
export function changesOf(q: Question, suggested: Given | null, final: Given): number | null {
  if (!suggested) return null;
  const at = (g: Given, axis: string): AxisValue | undefined => (g.kind === "value" ? g.value || undefined : g.kind === "values" ? (g.values[axis] === "" ? undefined : g.values[axis]) : undefined);
  return askedAxes(q).filter((axis) => !same(at(suggested, axis), at(final, axis))).length;
}

/**
 * The suggestion as an answer's value would say it, for the engine to keep
 * beside the answer: the values filled in where every axis is, else the first
 * candidate shown; null where nothing was suggested whole.
 */
export function suggestedValue(q: Question, s: Suggestion | null): string | Record<string, AxisValue> | null {
  if (!s) return null;
  const axes = askedAxes(q);
  const whole = s.differ.length === 0 ? s.values : (s.offered[0]?.values ?? null);
  if (!whole || axes.some((a) => !(a in whole))) return null;
  if (q.kind === "axis" && q.axis) return typeof whole[q.axis] === "string" ? (whole[q.axis] as string) : null;
  const out: Record<string, AxisValue> = {};
  for (const a of axes) out[a] = Array.isArray(whole[a]) && (whole[a] as string[]).length === 0 ? null : whole[a];
  return out;
}

/** What an answer's changes are counted against: the suggestion whole, as the engine is told it. */
export function baselineOf(q: Question, s: Suggestion | null): Given | null {
  const v = suggestedValue(q, s);
  if (v === null) return null;
  return typeof v === "string" ? { kind: "value", value: v } : givenOf(q, { values: v });
}

/** The shown candidate the answer now matches, if any. */
export function chosenCandidate(q: Question, offered: AskedCandidate[], g: Given): AskedCandidate | null {
  return offered.find((c) => changesOf(q, givenOfCandidate(q, c), g) === 0) ?? null;
}

/** Whether every asked axis is filled in, so Enter alone answers. */
export function complete(q: Question, g: Given): boolean {
  if (g.kind === "value") return g.value !== "";
  if (g.kind === "values") return askedAxes(q).every((a) => a in g.values && g.values[a] !== "" && !(Array.isArray(g.values[a]) && (g.values[a] as string[]).length === 0));
  return false;
}

/** The suggestion in words, for the line above the rows. */
export function suggestionWords(s: Suggestion): string {
  if (s.differ.length === 0) return `Rules and System 1 agree${s.p !== null ? ` · p ${s.p.toFixed(2)}` : ""}. Enter confirms.`;
  if (s.agreed.length === 0) return `They differ on ${s.differ.join(", ")}: choose one below.`;
  return `They agree on ${s.agreed.join(", ")} and differ on ${s.differ.join(", ")}: choose one below.`;
}

// ---------------------------------------------------------------- the line in words

const valueWords = (v: AxisValue) => (v === null ? "no value" : Array.isArray(v) ? (v.length > 0 ? v.join("+") : "none") : v);

/** The short line: value, then what decided it, most telling first. */
export function lineWords(l: AxisLine): { value: string; why: string[] } {
  const why: string[] = [];
  if (l.flags.length > 0) why.push(`flags ${l.flags.join(", ")}`);
  if (l.rule) why.push(`rule ${l.rule}${l.clause ? ` (${l.clause})` : ""}`);
  if (l.reads.length > 0) why.push(l.reads.map(([k, v]) => `${k} ${v}`).join(" "));
  if (l.words && l.words.length > 0) why.push(`“${l.words.join("”, “")}”`);
  const others = l.votes.filter((v) => v.rule !== l.rule);
  if (others.length > 0) why.push(`${others.length} more ${others.length === 1 ? "vote" : "votes"}`);
  if (l.model && l.model.value !== null) why.push(`System 1 ${l.model.value}${l.model.p !== null ? ` ${l.model.p.toFixed(2)}` : ""}`);
  return { value: valueWords(l.value), why };
}

// ---------------------------------------------------------------- timing

/** When each item was first shown, so an answer knows how long it took. */
export class Clock {
  private shown = new Map<number, number>();
  /** The item is on screen; a second call keeps the first time. */
  start(item: number, at: number): void {
    if (!this.shown.has(item)) this.shown.set(item, at);
  }
  /** Seconds since the item was shown, and forget it; null when it was never started. */
  stop(item: number, at: number): number | null {
    const t = this.shown.get(item);
    if (t === undefined) return null;
    this.shown.delete(item);
    return Math.max(0, (at - t) / 1000);
  }
}

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** The session's pace: each decision's seconds, and how many changed the suggestion. */
export interface Pace {
  seconds: number[];
  suggested: number;
  changed: number;
  /** Decisions taken by accepting a batch, each counted once. */
  batched: number;
}

export const NO_PACE: Pace = { seconds: [], suggested: 0, changed: 0, batched: 0 };

export function paced(p: Pace, seconds: number | null, changes: number | null, n = 1): Pace {
  // a batch's time is split over its stacks, each its own decision
  const each = seconds === null ? [] : Array.from({ length: n }, () => seconds / n);
  return {
    seconds: [...p.seconds, ...each],
    suggested: p.suggested + (changes === null ? 0 : n),
    changed: p.changed + (changes !== null && changes > 0 ? 1 : 0),
    batched: p.batched + (n > 1 ? n : 0),
  };
}

export function paceWords(p: Pace): string {
  const n = p.seconds.length;
  if (n === 0) return "no decisions yet";
  const m = median(p.seconds) ?? 0;
  return `${n.toLocaleString("en-US")} decided · median ${m < 10 ? m.toFixed(1) : Math.round(m)} s`;
}

// ---------------------------------------------------------------- the order

export type Order = "value" | "position";

/**
 * The items the reader is likely to be handed next, for the pictures to be
 * ready: the engine's hint where the claim names one; else the open items
 * after this one, by value where the items carry it and the order is by
 * value, by position otherwise, less those this person already answered.
 */
export function upcoming(current: Item | null, items: (Item & { value?: number | null })[], done: Set<number>, order: Order, n = 2, hinted: number[] = []): number[] {
  const stacks: number[] = [];
  const add = (s: number | null | undefined) => {
    if (typeof s === "number" && s !== current?.stack_id && !stacks.includes(s) && stacks.length < n) stacks.push(s);
  };
  for (const s of hinted) add(s);
  const open = items.filter((i) => i.id !== current?.id && !done.has(i.id) && (i.state === "open" || i.state === "needs_adjudication") && i.stack_id !== null);
  const byValue = order === "value" && open.some((i) => typeof i.value === "number");
  const sorted = byValue ? [...open].sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity) || a.position - b.position) : [...open].sort((a, b) => a.position - b.position);
  const after = byValue || !current ? sorted : [...sorted.filter((i) => i.position > current.position), ...sorted.filter((i) => i.position <= current.position)];
  for (const i of after) add(i.stack_id);
  return stacks;
}

/**
 * Warms the next stacks' pictures a few at a time: each stack once, the
 * newest wish first, and a stack no longer wanted is dropped from the queue
 * before it starts. The warming itself is given (the viewer's manifest and
 * first planes), so the scheduling is tested alone.
 */
export class Prefetcher {
  private warm: (stack: number) => Promise<unknown>;
  private at: number;
  private done = new Set<number>();
  private running = new Set<number>();
  private queue: number[] = [];
  /** The stacks warmed, in order; for the tests and the walk. */
  readonly warmed: number[] = [];

  constructor(warm: (stack: number) => Promise<unknown>, atOnce = 2) {
    this.warm = warm;
    this.at = atOnce;
  }

  /** The stacks wanted now, most urgent first; anything queued and not wanted any more is dropped. */
  want(stacks: number[]): void {
    this.queue = stacks.filter((s) => !this.done.has(s) && !this.running.has(s));
    this.pump();
  }

  /** Whether a stack was warmed, or is being. */
  has(stack: number): boolean {
    return this.done.has(stack) || this.running.has(stack);
  }

  private pump(): void {
    while (this.running.size < this.at && this.queue.length > 0) {
      const s = this.queue.shift()!;
      this.running.add(s);
      this.warm(s)
        .catch(() => undefined)
        .finally(() => {
          this.running.delete(s);
          this.done.add(s);
          this.warmed.push(s);
          this.pump();
        });
    }
  }
}

// ---------------------------------------------------------------- batches

/** Like stacks the engine groups (same sequence, same answer suggested), offered as one move (record 48 R1). */
export interface Batch {
  key: string;
  /** What the stacks share, in a few words. */
  words: string;
  /** The answer suggested for every stack in it. */
  values: Record<string, AxisValue>;
  items: { item: number; stack: number | null }[];
  /** The items the engine holds back for individual reading: a random few that stay in the certificate's draw. */
  held: number[];
}

/** A batch door's answer, read leniently. */
export function batchesOf(raw: Json): Batch[] {
  const list = Array.isArray(raw.batches) ? raw.batches : Array.isArray(raw) ? (raw as unknown[]) : [];
  return list.map(obj).flatMap((b, i) => {
    const items = (Array.isArray(b.items) ? b.items : []).flatMap((x) => {
      if (typeof x === "number") return [{ item: x, stack: null }];
      const o = obj(x);
      const item = num(o.item) ?? num(o.item_id) ?? num(o.id);
      return item === null ? [] : [{ item, stack: num(o.stack) ?? num(o.stack_id) }];
    });
    if (items.length === 0) return [];
    const values: Record<string, AxisValue> = {};
    for (const [axis, v] of Object.entries(obj(b.values ?? b.suggestion ?? b.value))) {
      const x = axisValue(v);
      if (x !== undefined) values[axis] = x;
    }
    const held = (Array.isArray(b.held) ? b.held : Array.isArray(b.held_back) ? b.held_back : []).flatMap((x) => (typeof x === "number" ? [x] : num(obj(x).item) !== null ? [num(obj(x).item)!] : num(obj(x).item_id) !== null ? [num(obj(x).item_id)!] : []));
    const key = text(b.key) ?? (num(b.key) !== null ? String(b.key) : num(b.id) !== null ? String(b.id) : `batch ${i + 1}`);
    return [{ key, words: text(b.words) ?? text(b.about) ?? text(b.sequence) ?? key, values, items, held }];
  });
}

export type BatchAct = { kind: "accept" } | { kind: "back" } | { kind: "next" } | { kind: "keys" };

/** What a key does in the batch view: Enter accepts for all, `n` shows the next batch, `b` or Escape goes back to one by one. */
export function batchKey(key: string, inField: boolean): BatchAct | null {
  if (inField) return null;
  if (key === "Enter") return { kind: "accept" };
  if (key === "n" || key === "N") return { kind: "next" };
  if (key === "b" || key === "B" || key === "Escape") return { kind: "back" };
  if (key === "?") return { kind: "keys" };
  return null;
}

/** What accepting a batch does: which stacks take the suggestion now, and which are read one by one (the engine's held back, and any the person held). */
export function acceptPlan(b: Batch, mine: Set<number>): { accept: number[]; read: number[] } {
  const read = b.items.filter((i) => b.held.includes(i.item) || mine.has(i.item)).map((i) => i.item);
  return { accept: b.items.map((i) => i.item).filter((i) => !read.includes(i)), read };
}

export function planWords(p: { accept: number[]; read: number[] }): string {
  const a = `${p.accept.length} ${p.accept.length === 1 ? "stack takes" : "stacks take"} the suggestion`;
  return p.read.length === 0 ? `${a}.` : `${a}; ${p.read.length} held back to read one by one.`;
}

/** What the accept door answered, read leniently. */
export function acceptedOf(raw: Json, plan: { accept: number[]; read: number[] }): { accepted: number; held: number[] } {
  const accepted = Array.isArray(raw.accepted) ? raw.accepted.length : (num(raw.accepted) ?? (Array.isArray(raw.answers) ? raw.answers.length : plan.accept.length));
  const held = Array.isArray(raw.held) ? raw.held.flatMap((x) => (typeof x === "number" ? [x] : [])) : plan.read;
  return { accepted, held };
}

// ---------------------------------------------------------------- the raters' pace

export interface RaterStat {
  principal: string;
  decisions: number;
  median_seconds: number | null;
  /** Share of suggestions the rater changed, where the engine counts them. */
  changed: number | null;
  batched: number | null;
}

/** The stats door's per-rater rows, read leniently. */
export function statsOf(raw: Json): RaterStat[] {
  const list = Array.isArray(raw.raters) ? raw.raters : Array.isArray(raw.readers) ? raw.readers : Array.isArray(raw.by_rater) ? raw.by_rater : [];
  return list.map(obj).flatMap((r) => {
    const who = text(r.principal) ?? text(r.rater) ?? text(r.reader);
    if (!who) return [];
    const decisions = num(r.decisions) ?? num(r.answers) ?? 0;
    const suggested = num(r.suggested);
    const changedN = num(r.changed);
    const changed = num(r.share_changed) ?? num(r.changed_share) ?? num(r.change_rate) ?? (changedN !== null && suggested ? changedN / suggested : null);
    return [{ principal: who, decisions, median_seconds: num(r.median_seconds) ?? num(r.seconds_median) ?? num(r.median), changed, batched: num(r.batched) }];
  });
}
