// SPDX-License-Identifier: AGPL-3.0-only
// The rating workspace's pure parts (record 45 S4): the seat a person holds
// (an item under a lease, nothing left, or a refusal), what a heartbeat's
// answer does to it, what a key does, and the rows an axis question draws.
// The page and the headless walk share them, so the walk proves what the page
// does rather than a copy of it.

import type { PackDoc } from "../review/client";
import { answerBody, answerWords, axisValues, itemWords, jointOf, jointValue, keyValue, legalProblem, ROW_KEYS, stateWords, type Answer, type Answered, type Assignment, type Claimed, type Given, type Item, type Question } from "./client";
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

/** The rows an axis or axes question draws, with the pack's families and multi-valued axes where the pack was read. */
export function rowsOf(q: Question, pack: PackDoc | null): Row[] {
  const axes = q.kind === "axis" ? (q.axis ? [q.axis] : []) : q.kind === "axes" ? (q.axes ?? []) : [];
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
    return { axis, values, ...(any ? { families } : {}), ...(multi ? { multi: true } : {}) };
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

/** Why the pack forbids the axes chosen so far, or null. */
export function illegal(q: Question, g: Given): string | null {
  if (q.kind !== "axes" || !q.constraints || g.kind !== "values") return null;
  return legalProblem(q.constraints, jointOf(g.values));
}

/** The given answer as rows show it chosen. */
export function chosenOf(q: Question, g: Given): Record<string, string | string[] | null> {
  if (g.kind === "value" && q.axis) return { [q.axis]: g.value };
  if (g.kind === "values") return g.values;
  return {};
}

export type KeyAct = { kind: "choose"; row: Row; value: string } | { kind: "pick"; stack: number } | { kind: "answer" } | { kind: "skip" } | { kind: "keys" };

/**
 * What a key does in the workspace (v0's keys where they fit): `1` to `0` on
 * the first row of values, `q` to `p` on the second, Enter answers, `s` gives
 * the item back, `?` lists the keys. In a text field only Ctrl+Enter acts.
 */
export function keyAct(key: string, opts: { ctrl: boolean; inField: boolean; q: Question; rows: Row[]; candidates?: number[] }): KeyAct | null {
  if (opts.inField) return key === "Enter" && opts.ctrl ? { kind: "answer" } : null;
  if (key === "Enter") return { kind: "answer" };
  if (key === "?") return { kind: "keys" };
  if (opts.ctrl) return null;
  if (opts.q.kind === "pick" && opts.candidates) {
    const s = keyValue(key, 0, opts.candidates.map(String));
    if (s !== null) return { kind: "pick", stack: Number(s) };
  }
  for (let r = 0; r < Math.min(opts.rows.length, ROW_KEYS.length); r++) {
    const v = keyValue(key, r, opts.rows[r].values);
    if (v !== null) return { kind: "choose", row: opts.rows[r], value: v };
  }
  if (key === "s" || key === "S") return { kind: "skip" };
  return null;
}

/** What the adjudicator sees beside the options: who gave what, by axis and value, from the raters' answers to this item. */
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
