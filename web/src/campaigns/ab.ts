// SPDX-License-Identifier: AGPL-3.0-only
// The A/B view (record 48, the reference read by judges): an item is a stack
// where independent voters (raters that read the header, the rules) differ
// on an axis, or one of a pre-registered audit of the stacks they agree on,
// and the person settles it blind. The engine serves each axis's candidates
// as letters with one reason each and never says who gave which, nor which
// items are the audit's; this module reads that sheet, keeps what the person
// chose, builds the answer, and reads the campaign's summary. Keyboard first:
// a letter takes a candidate, n is neither, x can't tell, 1 to 5 a cause.

import { door, type Json } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { CANT_TELL, jointOf, legalProblem, type Campaign, type Question } from "./client";

/** The doors of the A/B campaign, as the engine's OpenAPI 7 names them. */
export const AB = {
  sheet: "GET /api/campaigns/{id}/items/{item}/ab",
  summary: "GET /api/campaigns/{id}/ab",
  decisions: "GET /api/campaigns/{id}/ab/decisions",
  cause: "POST /api/campaigns/{id}/answers/{answer}/cause",
};

/** An axis's value as an axes answer says it: a value, a set, none (null), or can't tell. */
export type AbValue = string | string[] | null;

export interface AbCandidate {
  label: string;
  value: AbValue;
  reason: string | null;
}

export interface AbRow {
  axis: string;
  /** False for an axis a localizer is not asked, answered not_asked. */
  asked: boolean;
  /** The voters gave two or more values, or none gave any. */
  split: boolean;
  candidates: AbCandidate[];
}

export interface AbSheet {
  item: number;
  stack: number;
  localizer: boolean;
  notAsked: string;
  rows: AbRow[];
  causes: string[];
}

/** The causes a settled axis may be given (record 48's triage), in the engine's words, each with a person's. */
export const CAUSE_WORDS: Record<string, string> = {
  rule_bug: "rule bug",
  convention_gap: "convention gap",
  header_ambiguity: "header ambiguity",
  rater_error: "rater error",
  reader_slip: "reader slip",
};
export const CAUSES = Object.keys(CAUSE_WORDS);

/** The keys of the candidates, in letter order. */
export const LETTER_KEYS = "abcdef";

const id = (c: number | string) => encodeURIComponent(String(c));

/** Whether a campaign settles candidates: it was made by `nils campaign ab`. */
export function isAb(c: Pick<Campaign, "source"> | null | undefined): boolean {
  const ab = (c?.source as Json | undefined)?.ab;
  return !!ab && typeof ab === "object" && !Array.isArray(ab);
}

/** Whether the engine serves the A/B sheet. */
export const abServed = (caps: Capabilities): boolean => served(caps, AB.sheet);

function valueOfRaw(v: unknown): AbValue {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  return null;
}

/** The sheet as the door answers it, read defensively. */
export function sheetOf(raw: Json): AbSheet {
  const rows: AbRow[] = [];
  for (const r of Array.isArray(raw.axes) ? raw.axes : []) {
    if (!r || typeof r !== "object" || Array.isArray(r)) continue;
    const o = r as Json;
    if (typeof o.axis !== "string") continue;
    const candidates: AbCandidate[] = [];
    for (const c of Array.isArray(o.candidates) ? o.candidates : []) {
      if (!c || typeof c !== "object" || Array.isArray(c)) continue;
      const x = c as Json;
      if (typeof x.label !== "string") continue;
      candidates.push({ label: x.label, value: valueOfRaw(x.value), reason: typeof x.reason === "string" && x.reason.trim() !== "" ? x.reason : null });
    }
    candidates.sort((a, b) => a.label.localeCompare(b.label));
    rows.push({ axis: o.axis, asked: o.asked !== false, split: o.split === true, candidates });
  }
  return {
    item: typeof raw.item === "number" ? raw.item : 0,
    stack: typeof raw.stack === "number" ? raw.stack : 0,
    localizer: raw.localizer === true,
    notAsked: typeof raw.not_asked === "string" ? raw.not_asked : "not_asked",
    rows,
    causes: Array.isArray(raw.causes) ? raw.causes.filter((c): c is string => typeof c === "string") : CAUSES,
  };
}

export const abDoors = {
  sheet: (c: number | string, item: number) => door<Json>("GET", `/api/campaigns/${id(c)}/items/${item}/ab`).then(sheetOf),
  summary: (c: number | string) => door<Json>("GET", `/api/campaigns/${id(c)}/ab`).then(summaryOf),
  summaryRaw: (c: number | string) => door<Json>("GET", `/api/campaigns/${id(c)}/ab`),
  decisions: (c: number | string) => door<Json>("GET", `/api/campaigns/${id(c)}/ab/decisions`),
  cause: (c: number | string, answer: number, axis: string, cause: string | null) => door<Json>("POST", `/api/campaigns/${id(c)}/answers/${answer}/cause`, { axis, cause }),
};

/** A value in a few words: none for no value, a set joined. */
export function valueWords(v: AbValue): string {
  if (v === null) return "none";
  if (Array.isArray(v)) return v.length === 0 ? "none" : v.join(", ");
  if (v === CANT_TELL) return "can't tell";
  return v;
}

/** What the person chose on an axis. */
export type Choice = { kind: "candidate"; label: string } | { kind: "free"; value: AbValue } | { kind: "cant_tell" };

/** What the person holds of one item. */
export interface AbState {
  picks: Record<string, Choice>;
  causes: Record<string, string>;
  /** The row the keys act on, among the asked rows. */
  active: number;
  /** The axis whose free choice is open (after neither). */
  free: string | null;
  /** The axis settled last, which 1 to 5 give a cause. */
  last: string | null;
}

export const askedRows = (s: AbSheet): AbRow[] => s.rows.filter((r) => r.asked);

/** A new item: the axes the voters agree on filled in, the keys on the first split axis. */
export function startOf(s: AbSheet): AbState {
  const picks: Record<string, Choice> = {};
  const rows = askedRows(s);
  for (const r of rows) if (!r.split && r.candidates.length === 1) picks[r.axis] = { kind: "candidate", label: r.candidates[0].label };
  const first = rows.findIndex((r) => !picks[r.axis]);
  return { picks, causes: {}, active: first < 0 ? 0 : first, free: null, last: null };
}

/** The asked axes not settled yet. */
export function unsettled(s: AbSheet, st: AbState): string[] {
  return askedRows(s)
    .filter((r) => !st.picks[r.axis])
    .map((r) => r.axis);
}

/** The value a choice gives an axis. */
export function chosenValue(r: AbRow, c: Choice | undefined): AbValue | undefined {
  if (!c) return undefined;
  if (c.kind === "cant_tell") return CANT_TELL;
  if (c.kind === "free") return c.value;
  return r.candidates.find((x) => x.label === c.label)?.value;
}

/** Whether a settled axis is one the person decided, and so may be given a cause: a split axis, or an agreed one changed. */
export function decided(r: AbRow, c: Choice | undefined): boolean {
  if (!c) return false;
  if (r.split) return true;
  return !(c.kind === "candidate" && r.candidates.length === 1 && c.label === r.candidates[0].label);
}

/** The answer's value: every axis of the question, a localizer's unasked ones not_asked. Null while an asked axis is unsettled. */
export function answerOf(s: AbSheet, st: AbState): Record<string, AbValue> | null {
  const out: Record<string, AbValue> = {};
  for (const r of s.rows) {
    if (!r.asked) {
      out[r.axis] = s.notAsked;
      continue;
    }
    const v = chosenValue(r, st.picks[r.axis]);
    if (v === undefined) return null;
    out[r.axis] = v;
  }
  return out;
}

/** What the pack refuses of the answer as it stands, the unasked axes left out; null where it holds. */
export function abProblem(q: Question, s: AbSheet, st: AbState): string | null {
  if (!q.constraints) return null;
  const values: Record<string, string | string[] | null> = {};
  for (const r of askedRows(s)) {
    const v = chosenValue(r, st.picks[r.axis]);
    if (v !== undefined) values[r.axis] = v;
  }
  return legalProblem(q.constraints, jointOf(values));
}

/** The next unsettled asked row after `from`, wrapping; `from` itself where every other is settled. */
function nextOpen(s: AbSheet, st: AbState, from: number): number {
  const rows = askedRows(s);
  for (let k = 1; k <= rows.length; k++) {
    const i = (from + k) % rows.length;
    if (!st.picks[rows[i].axis]) return i;
  }
  return from;
}

/** Settle the active row (or the one named) with a choice; the keys move on to the next unsettled row. */
export function choose(s: AbSheet, st: AbState, c: Choice, at = st.active): AbState {
  const rows = askedRows(s);
  const r = rows[at];
  if (!r) return st;
  const picks = { ...st.picks, [r.axis]: c };
  const causes = { ...st.causes };
  // a cause is of what was decided; an axis back at the agreed value keeps none
  if (!decided(r, c)) delete causes[r.axis];
  const next: AbState = { ...st, picks, causes, free: null, last: decided(r, c) ? r.axis : st.last === r.axis ? null : st.last };
  return { ...next, active: nextOpen(s, next, at) };
}

/** Undo the active row's choice: back to the agreed value, or unsettled on a split axis. */
export function reset(s: AbSheet, st: AbState, at = st.active): AbState {
  const r = askedRows(s)[at];
  if (!r) return st;
  const picks = { ...st.picks };
  const causes = { ...st.causes };
  delete causes[r.axis];
  if (!r.split && r.candidates.length === 1) picks[r.axis] = { kind: "candidate", label: r.candidates[0].label };
  else delete picks[r.axis];
  return { ...st, picks, causes, free: null, last: st.last === r.axis ? null : st.last };
}

/** Give or take away a cause of an axis the person decided. */
export function toggleCause(st: AbState, axis: string, cause: string): AbState {
  const causes = { ...st.causes };
  if (causes[axis] === cause) delete causes[axis];
  else causes[axis] = cause;
  return { ...st, causes };
}

/** What a key does in the A/B view. */
export type AbAct =
  | { kind: "letter"; index: number }
  | { kind: "neither" }
  | { kind: "cant_tell" }
  | { kind: "move"; by: 1 | -1 }
  | { kind: "cause"; index: number }
  | { kind: "reset" }
  | { kind: "answer" }
  | { kind: "skip" }
  | { kind: "header" }
  | { kind: "keys" };

/**
 * A key's act. Letters take the active row's candidates in order, `n` opens
 * its free choice, `x` says can't tell; `j` and Tab move down the rows, `k`
 * and Shift+Tab up; 1 to 5 give the last decided axis a cause; Backspace
 * undoes the active row; Enter answers; `s` gives the item back; `h` the
 * whole header; `?` the keys. The arrows, Page Up and Down and Space are
 * the pictures'. Nothing from a text field but Ctrl+Enter.
 */
export function abKey(key: string, o: { ctrl?: boolean; shift?: boolean; inField: boolean; candidates: number; causes: number; header: boolean }): AbAct | null {
  if (o.inField) return o.ctrl && key === "Enter" ? { kind: "answer" } : null;
  if (o.ctrl) return key === "Enter" ? { kind: "answer" } : null;
  if (key === "Enter") return { kind: "answer" };
  if (key === "Tab") return { kind: "move", by: o.shift ? -1 : 1 };
  if (key === "j") return { kind: "move", by: 1 };
  if (key === "k") return { kind: "move", by: -1 };
  if (key === "n") return { kind: "neither" };
  if (key === "x") return { kind: "cant_tell" };
  if (key === "Backspace") return { kind: "reset" };
  if (key === "s") return { kind: "skip" };
  if (key === "h" && o.header) return { kind: "header" };
  if (key === "?") return { kind: "keys" };
  const l = LETTER_KEYS.indexOf(key.toLowerCase());
  if (l >= 0 && l < o.candidates && key.length === 1) return { kind: "letter", index: l };
  if (/^[1-9]$/u.test(key) && Number(key) <= o.causes) return { kind: "cause", index: Number(key) - 1 };
  return null;
}

/** The summary as the door answers it. */
export interface AbSummary {
  items: number;
  answered: number;
  median: number | null;
  p90: number | null;
  /** On the split axes: how often each letter, neither and can't tell was chosen. */
  split: Record<string, number>;
  /** Per axis, each cause and how often. */
  causes: Record<string, Record<string, number>>;
  sources: boolean;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function counts(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  for (const [k, n] of Object.entries(v as Json)) if (typeof n === "number") out[k] = n;
  return out;
}

export function summaryOf(raw: Json): AbSummary {
  const secs = (raw.seconds && typeof raw.seconds === "object" && !Array.isArray(raw.seconds) ? raw.seconds : {}) as Json;
  const causes: Record<string, Record<string, number>> = {};
  if (raw.causes && typeof raw.causes === "object" && !Array.isArray(raw.causes)) for (const [axis, m] of Object.entries(raw.causes as Json)) causes[axis] = counts(m);
  return { items: num(raw.items) ?? 0, answered: num(raw.answered) ?? 0, median: num(secs.median), p90: num(secs.p90), split: counts(raw.split_choices), causes, sources: raw.sources === true };
}

/** The share of each choice on the split axes, letters first: "A 40% · B 45% · neither 10% · can't tell 5%". */
export function shareWords(s: Pick<AbSummary, "split">): string {
  const total = Object.values(s.split).reduce((a, b) => a + b, 0);
  if (total === 0) return "nothing settled yet";
  const keys = Object.keys(s.split).sort((a, b) => (a.length === 1 ? 0 : 1) - (b.length === 1 ? 0 : 1) || a.localeCompare(b));
  return keys.map((k) => `${k === "cant_tell" ? "can't tell" : k} ${Math.round((100 * s.split[k]) / total)}%`).join(" · ");
}

/** The causes given, most first. */
export function causeWords(s: Pick<AbSummary, "causes">): string {
  const all: Record<string, number> = {};
  for (const m of Object.values(s.causes)) for (const [c, n] of Object.entries(m)) all[c] = (all[c] ?? 0) + n;
  const list = Object.entries(all).sort((a, b) => b[1] - a[1]);
  return list.length === 0 ? "no cause given" : list.map(([c, n]) => `${CAUSE_WORDS[c] ?? c} ${n}`).join(" · ");
}

/** The answer in a line, for the "Sends" line and the confirmation. */
export function sendsWords(s: AbSheet, st: AbState): string {
  return askedRows(s)
    .map((r) => {
      const c = st.picks[r.axis];
      if (!c) return `${r.axis} ?`;
      const what = c.kind === "candidate" ? (r.split ? c.label : "agreed") : c.kind === "free" ? "neither" : "can't tell";
      return `${r.axis} ${what}${st.causes[r.axis] ? ` (${CAUSE_WORDS[st.causes[r.axis]] ?? st.causes[r.axis]})` : ""}`;
    })
    .join(" · ");
}

/** A file name for the decisions saved. */
export const decisionsFile = (name: string): string => `${name.replace(/[^\w.-]+/gu, "-")}-decisions.json`;
