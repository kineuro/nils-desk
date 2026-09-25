// SPDX-License-Identifier: AGPL-3.0-only
// The rating workspace's pure parts (record 45 S4): the seat a person holds
// (an item under a lease, nothing left, or a refusal), what a heartbeat's
// answer does to it, what a key does, and the rows an axis question draws.
// The page and the headless walk share them, so the walk proves what the page
// does rather than a copy of it.

import type { PackDoc } from "../review/client";
import type { BoardCandidate } from "../review/SessionBoard";
import { answerBody, answeredAxes, answerWords, axisValues, CANDIDATE_KEYS, CANT_TELL, CANT_TELL_KEYS, cantTellOf, itemWords, jointOf, jointValue, keyValue, legalProblem, ROW_KEYS, stateWords, UNSURE_KEY, unsureOf, type Answer, type Answered, type Assignment, type Candidates, type Claimed, type Given, type Item, type Question } from "./client";
import { fold, hitWords, nameHit, vocabularyOf } from "./lookup";
import { choose, type Marks, type Row } from "./renderers";

export type Seat =
  | { kind: "claiming" }
  | { kind: "holding"; assignment: Assignment; item: Item; note: string | null }
  | { kind: "done"; why: string }
  | { kind: "failed"; why: string };

/** The seat a claim's answer gives: the item under its lease, or why nothing is left. */
export function seatOf(c: Claimed, note: string | null = null): Seat {
  if (c.assignment && c.item) return { kind: "holding", assignment: c.assignment, item: c.item, note };
  return { kind: "done", why: c.why ?? "Nothing is left for you here." };
}

/**
 * What a heartbeat's answer does to the seat. The same assignment back means
 * the lease holds, with its time as the engine has it; another means the
 * lease ended and the engine handed the next item; none means it ended and
 * nothing is left.
 */
export function beatSeat(seat: Seat, c: Claimed): Seat {
  if (seat.kind !== "holding") return seat;
  if (c.assignment && c.assignment.id === seat.assignment.id) return { ...seat, assignment: { ...seat.assignment, ...c.assignment } };
  // a renew door answers the assignment alone
  if (c.assignment && !c.item && c.assignment.id !== seat.assignment.id) return seat;
  const was = itemWords(seat.item);
  if (c.assignment && c.item) return { kind: "holding", assignment: c.assignment, item: c.item, note: `Your lease on ${was} ended; ${itemWords(c.item)} is yours now.` };
  return { kind: "done", why: `Your lease on ${was} ended, and ${c.why ?? "nothing is left for you"}.` };
}

/**
 * The rows an axis or axes question draws, with the pack's families and
 * multi-valued axes where the pack was read. Only the axes the rater answers:
 * a derived axis (record 48) is never a row.
 */
export function rowsOf(q: Question, pack: PackDoc | null): Row[] {
  const axes = answeredAxes(q);
  const vocab = vocabularyOf(q);
  return axes.map((axis) => {
    const p = pack?.axes.find((a) => a.axis === axis) ?? null;
    let values = axisValues(q, axis);
    if (values.length === 0 && p) values = p.values.map((v) => v.value);
    const families: Record<string, string | null> = {};
    let any = false;
    for (const v of p?.values ?? []) {
      families[v.value] = v.family;
      if (v.family) any = true;
    }
    // grouped by family, the pack's order kept inside each
    if (any) {
      const order: string[] = [];
      for (const v of values) {
        const f = families[v] ?? "";
        if (!order.includes(f)) order.push(f);
      }
      values = order.flatMap((f) => values.filter((v) => (families[v] ?? "") === f));
    }
    const multi = q.constraints?.multi ? q.constraints.multi.includes(axis) : p?.multi === true;
    const names = vocab[axis];
    return { axis, values, ...(any ? { families } : {}), ...(multi ? { multi: true } : {}), ...(names && Object.keys(names).length > 0 ? { names } : {}) };
  });
}

/** The given answer after a value is chosen on a row. */
export function given(q: Question, g: Given, row: Row, value: string): Given {
  if (q.kind === "axis") return { kind: "value", value: g.kind === "value" && g.value === value ? "" : value };
  if (q.kind === "axes") return { kind: "values", values: choose(g.kind === "values" ? g.values : {}, row, value) };
  return g;
}

/** An axes answer with one axis said to have no value here. */
export function givenNone(g: Given, axis: string): Given {
  const values = g.kind === "values" ? g.values : {};
  return { kind: "values", values: { ...values, [axis]: values[axis] === null ? "" : null } };
}

/** An axes answer with one axis said to be can't tell (record 48), in the question's word; again, it clears. */
export function givenCantTell(q: Question, g: Given, axis: string): Given {
  const word = cantTellOf(q);
  if (!word) return g;
  const values = g.kind === "values" ? g.values : {};
  return { kind: "values", values: { ...values, [axis]: values[axis] === word ? "" : word } };
}

/** Why the pack forbids the axes chosen so far, or null; an axis the rater cannot tell names nothing. */
export function illegal(q: Question, g: Given): string | null {
  if (q.kind !== "axes" || !q.constraints || g.kind !== "values") return null;
  return legalProblem(q.constraints, jointOf(g.values, cantTellOf(q) ?? CANT_TELL));
}

/**
 * The answer about to be sent, in one line: each asked axis with its value,
 * none, can't tell, or a dash where nothing is chosen yet; and the unsure
 * mark where it is set. Null for a question without rows.
 */
export function pendingWords(q: Question, g: Given, unsure = false): string | null {
  const mark = unsure && unsureOf(q) ? "unsure" : null;
  if (q.kind === "axis") {
    const v = g.kind === "value" && g.value ? g.value : "–";
    return [`${q.axis ?? "the axis"} ${v}`, mark].filter(Boolean).join(" · ");
  }
  if (q.kind !== "axes") return mark;
  const word = cantTellOf(q);
  const values = g.kind === "values" ? g.values : {};
  const said = answeredAxes(q).map((axis) => {
    const v = values[axis];
    const w = v === undefined || v === "" || (Array.isArray(v) && v.length === 0) ? "–" : v === null ? "none" : word !== null && v === word ? "can't tell" : Array.isArray(v) ? v.join("+") : v;
    return `${axis} ${w}`;
  });
  return [...said, mark].filter(Boolean).join(" · ");
}

/** The given answer as rows show it chosen. */
export function chosenOf(q: Question, g: Given): Record<string, string | string[] | null> {
  if (g.kind === "value" && q.axis) return { [q.axis]: g.value };
  if (g.kind === "values") return g.values;
  return {};
}

export type KeyAct =
  | { kind: "choose"; row: Row; value: string }
  | { kind: "pick"; stack: number }
  | { kind: "answer" }
  | { kind: "skip" }
  | { kind: "keys" }
  | { kind: "candidate"; index: number }
  | { kind: "evidence" }
  | { kind: "reset" }
  | { kind: "batch" }
  | { kind: "cant_tell"; row: Row }
  | { kind: "unsure" }
  | { kind: "header" }
  | { kind: "find"; row: Row }
  | { kind: "combo" };

/**
 * Whether the rows are drawn compact (record 48, one screen): more rows than
 * there are banks of value keys. Each row is then found by its number and
 * answered by typing the first letters of a value; the value keys are not
 * used.
 */
export const compactRows = (rows: Row[]): boolean => rows.length > ROW_KEYS.length;

/** The key that finds a row in the compact rows: its number, `1` for the first, `0` for the tenth. */
export const findKeyOf = (row: number): string | null => (row < 10 ? String((row + 1) % 10) : null);

/** A row's values past this many are found by typing, never all drawn: a long vocabulary keeps to one line. */
export const LONG_ROW = 16;

/** One thing a row's find can choose: a value (and the name it was found by, where not its own: "BRAVO → MPRAGE"), none, or can't tell. */
export type Found = { kind: "value"; value: string; via?: string } | { kind: "none" } | { kind: "cant_tell" };

/** Whether two finds choose the same thing, whatever name found them. */
export const sameFound = (a: Found | null, b: Found | null): boolean => !!a && !!b && a.kind === b.kind && (a.kind !== "value" || (b.kind === "value" && a.value === b.value));

/**
 * What a row's find offers for the letters typed, best first (record 48, the
 * second real read): a value by any name it goes by, its identity, its
 * label, the pack's terms (a vendor's name: BRAVO finds MPRAGE) or a word
 * its rules read; a whole name before one the letters begin, before one
 * that holds them; the value's own name before a term, before a rule's
 * word; the pack's order among equals. None and can't tell by their words
 * (can't tell also by `?`). Case, spaces, hyphens, stars and dots do not
 * count. Empty letters offer every value.
 */
export function findMatches(row: Row, typed: string, opts: { none?: boolean; cantTell?: boolean } = {}): Found[] {
  const t = fold(typed);
  const own: { found: Found; words: string[] }[] = [
    ...(opts.none ? [{ found: { kind: "none" } as Found, words: ["none"] }] : []),
    ...(opts.cantTell ? [{ found: { kind: "cant_tell" } as Found, words: ["can't tell", "?"] }] : []),
  ];
  if (t === "") return [...row.values.map((value) => ({ kind: "value", value }) as Found), ...own.map((x) => x.found)];
  const scored: { found: Found; score: number; at: number }[] = [];
  row.values.forEach((value, at) => {
    const h = nameHit(value, row.names?.[value], typed);
    if (!h) return;
    const via = hitWords(h);
    scored.push({ found: { kind: "value", value, ...(via ? { via } : {}) }, score: (h.fit === "exact" ? 0 : h.fit === "begins" ? 3 : 6) + (h.from === "own" ? 0 : h.from === "term" ? 1 : 2), at });
  });
  own.forEach((x, i) => {
    const w = x.words.map(fold);
    const score = w.some((f) => f === t) ? 0 : w.some((f) => f.startsWith(t)) ? 3 : w.some((f) => f.includes(t)) ? 6 : null;
    if (score !== null) scored.push({ found: x.found, score, at: row.values.length + i });
  });
  return scored.sort((a, b) => a.score - b.score || a.at - b.at).map((x) => x.found);
}

/**
 * What a key does in the workspace (v0's keys where they fit): `1` to `0` on
 * the first row of values, `q` to `p` on the second, Enter answers, `s` gives
 * the item back, `?` lists the keys. In a text field only Ctrl+Enter acts.
 * The reader's keys (record 48) on an axis or axes question: `z` to `v`
 * choose a shown candidate, `h` opens the evidence, Backspace goes back to
 * the suggestion, `b` opens the batches where the engine offers them.
 * Where the engine takes them (record 48): on an axes question `a`, `d`,
 * `f`, `g`, `j`, `k`, `l` say can't tell on the first row, the second and
 * so on, and on any question `m` marks the answer unsure.
 * After the first real read (record 48): `h` opens the whole header where
 * the engine serves it and `H` the evidence; on three rows or more a row's
 * number finds it (`1` the first) and its first letters answer it, in
 * place of the value keys. After the second real read: `/` finds a whole
 * answer on those rows.
 */
export function keyAct(key: string, opts: { ctrl: boolean; inField: boolean; q: Question; rows: Row[]; candidates?: number[]; offered?: number; batches?: boolean; header?: boolean }): KeyAct | null {
  if (opts.inField) return key === "Enter" && opts.ctrl ? { kind: "answer" } : null;
  if (key === "Enter") return { kind: "answer" };
  if (key === "?") return { kind: "keys" };
  if (opts.ctrl) return null;
  // the whole-answer search (record 48, the second real read), on the compact rows of an axes question
  if (key === "/" && opts.q.kind === "axes" && compactRows(opts.rows)) return { kind: "combo" };
  if (opts.q.kind === "pick" && opts.candidates) {
    const s = keyValue(key, 0, opts.candidates.map(String));
    if (s !== null) return { kind: "pick", stack: Number(s) };
  }
  if (opts.q.kind === "axis" || opts.q.kind === "axes") {
    const c = CANDIDATE_KEYS.indexOf(key.toLowerCase());
    if (c >= 0 && c < (opts.offered ?? 0)) return { kind: "candidate", index: c };
    // h opens the whole header where the engine serves it (record 48), else the evidence as before; H is always the evidence
    if (key === "h") return opts.header ? { kind: "header" } : { kind: "evidence" };
    if (key === "H") return { kind: "evidence" };
    if (key === "Backspace") return { kind: "reset" };
    if ((key === "b" || key === "B") && opts.batches) return { kind: "batch" };
  }
  if (cantTellOf(opts.q)) {
    const r = CANT_TELL_KEYS.indexOf(key.toLowerCase());
    if (r >= 0 && r < opts.rows.length) return { kind: "cant_tell", row: opts.rows[r] };
  }
  if ((key === UNSURE_KEY || key === UNSURE_KEY.toUpperCase()) && unsureOf(opts.q)) return { kind: "unsure" };
  if (opts.q.kind === "axes" && compactRows(opts.rows)) {
    const r = opts.rows.findIndex((_, i) => findKeyOf(i) === key);
    if (r >= 0) return { kind: "find", row: opts.rows[r] };
    return key === "s" || key === "S" ? { kind: "skip" } : null;
  }
  for (let r = 0; r < Math.min(opts.rows.length, ROW_KEYS.length); r++) {
    const v = keyValue(key, r, opts.rows[r].values);
    if (v !== null) return { kind: "choose", row: opts.rows[r], value: v };
  }
  if (key === "s" || key === "S") return { kind: "skip" };
  return null;
}

/** An element as the key handler reads it (the DOM's, or a test's stand-in). */
export interface KeyTarget {
  tagName: string;
  closest?: (selector: string) => unknown;
  getAttribute?: (name: string) => string | null;
}

/**
 * Whether Enter on the focused element is that element's own: a link, a
 * button, a tile or a disclosure presses itself and nothing more. Only on
 * the workspace's body or its answer controls (a value on the rows, a form's
 * choice) does Enter answer, or accept a batch.
 */
export function enterOwnedBy(t: KeyTarget | null): boolean {
  if (!t) return false;
  const role = t.getAttribute?.("role") ?? null;
  const interactive = ["A", "BUTTON", "SUMMARY"].includes(t.tagName) || (role !== null && ["button", "tab", "link", "checkbox", "option", "menuitem", "switch"].includes(role));
  if (!interactive) return false;
  return !t.closest?.(".axis-rows, .form-fields");
}

/** What the adjudicator sees beside the options: who gave what, by axis and value, from the raters' answers to this item; can't tell is marked under its own word, apart from none. */
export function marksOf(q: Question, answers: Answer[], item: number): Marks {
  const out: Marks = {};
  const put = (axis: string, value: string, who: string) => {
    out[axis] ??= {};
    out[axis][value] = [...(out[axis][value] ?? []), who];
  };
  for (const a of answers) {
    if (a.item_id !== item || a.role !== "rater") continue;
    if (q.kind === "axis" && q.axis && typeof a.value === "string") put(q.axis, a.value, a.principal);
    const joint = q.kind === "axes" ? jointValue(a.value) : null;
    if (joint) {
      for (const [axis, v] of Object.entries(joint)) for (const x of Array.isArray(v) ? v : v === null ? [] : [v]) put(axis, String(x), a.principal);
    }
  }
  return out;
}

/** The disagreement named: which axes the raters differ on, or that they differ, in one line. */
export function disagreementWords(q: Question, answers: Answer[], item: number): string | null {
  const mine = answers.filter((a) => a.item_id === item && a.role === "rater");
  if (mine.length < 2) return null;
  if (q.kind === "axes") {
    const axes = q.axes ?? [];
    const said = (a: Answer, axis: string) => {
      const v = (jointValue(a.value) ?? {})[axis];
      return JSON.stringify(v === undefined || v === null || (Array.isArray(v) && v.length === 0) ? null : Array.isArray(v) ? [...v].sort() : v);
    };
    const differ = axes.filter((axis) => new Set(mine.map((a) => said(a, axis))).size > 1);
    return differ.length > 0 ? `The raters differ on ${differ.join(", ")}.` : "The raters agree on every axis; the metric sent it here.";
  }
  const distinct = new Set(mine.map((a) => answerWords(a)));
  return distinct.size > 1 ? `The raters differ: ${[...distinct].join(" or ")}.` : "The raters gave the same answer; the metric sent it here.";
}

/** What an answer did, in one line. */
export function answeredWords(r: Answered, item: Item): string {
  const next = r.adjudication !== null ? "; it goes to an adjudicator" : "";
  return `Answered ${itemWords(item)}: ${stateWords(r.state)}${next}.`;
}

/** The body the workspace sends, or what it still needs; one place, so the page and the walk agree. */
export const bodyOf = answerBody;

/**
 * The session board's candidates from the candidates door (record 45): what
 * the run considered, best first, its own pick marked, then the session's
 * other stacks one acquisition (series) a candidate, so a stack the run did
 * not weigh can still be chosen.
 */
export function boardOf(c: Candidates): BoardCandidate[] {
  const key = (x: number[]) => [...x].sort((a, b) => a - b).join(",");
  const out: BoardCandidate[] = [];
  const add = (stacks: number[], score: number | null, chosen: boolean) => {
    if (stacks.length > 0 && !out.some((b) => key(b.stacks) === key(stacks))) out.push({ stacks, score, chosen });
  };
  const run = c.picks.find((p) => p.author_kind !== "person" && Array.isArray(p.considered));
  for (const x of run?.considered ?? []) {
    const stacks = Array.isArray(x.stacks) ? x.stacks.filter((s) => Number.isInteger(s)) : [];
    add(stacks, typeof x.score === "number" ? x.score : null, run !== undefined && run.stacks.length > 0 && key(stacks) === key(run.stacks));
  }
  const taken = new Set(out.flatMap((b) => b.stacks));
  const bySeries = new Map<string, number[]>();
  for (const s of c.candidates) {
    if (taken.has(s.stack_id)) continue;
    const k = s.series_id != null ? `series ${s.series_id}` : `stack ${s.stack_id}`;
    bySeries.set(k, [...(bySeries.get(k) ?? []), s.stack_id]);
  }
  for (const stacks of bySeries.values()) add(stacks, null, false);
  return out;
}
