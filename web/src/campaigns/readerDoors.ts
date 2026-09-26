// SPDX-License-Identifier: AGPL-3.0-only
// The reader's doors (record 48 R1), each behind a small adapter so the
// page reads one shape whatever the engine's exact words: the evidence line
// per axis, the batches of like stacks and their accept, the claim in value
// order, the time an answer took, and the raters' pace. An engine before
// record 48 serves none of the new doors; the reader then builds its lines
// from the classify.asked item and the explain door, claims by position and
// shows no batches. The door names here are the one place to follow the
// engine's OpenAPI 7 as it lands.

import { door, type Json } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";
import { review } from "../review/client";
import { DoorError } from "../ask/client";
import { campaigns, DERIVE, HEADER, type Claimed, type Derived, type HeaderDoc, type Item, type Question } from "./client";
import { acceptedOf, askedAxes, batchesOf, blindReading, bound, derivedOf, HOLD_BACK, readingFromAsked, readingOf, statsOf, type Batch, type Order, type RaterStats, type Reading } from "./reader";

/** The doors a record 48 engine adds, as its OpenAPI 7 names them. */
export const R48 = {
  line: "GET /api/campaigns/{id}/items/{item}/why",
  batches: "GET /api/campaigns/{id}/batches",
  accept: "POST /api/campaigns/{id}/batches/{batch}/accept",
  stats: "GET /api/campaigns/{id}/stats",
};

const id = (c: number | string) => encodeURIComponent(String(c));

/** Whether the engine orders a claim by value: its contract says so, or it serves record 48's other doors. */
export function valueOrderServed(caps: Capabilities): boolean {
  const orders = (caps.engine as { campaigns?: { claim_orders?: unknown } } | null)?.campaigns?.claim_orders;
  if (Array.isArray(orders)) return orders.includes("value");
  return served(caps, R48.line) || served(caps, R48.batches) || served(caps, R48.stats);
}

/**
 * A claim, in value order where the engine offers it (record 48 R1: `order`
 * value; an adjudicator's is always by position). `alone` asks only for the
 * items held back to be read one by one and those of a sealed sample
 * (record 50, after the first gold campaign).
 */
export function claimIn(c: number | string, role: "rater" | "adjudicator", order: Order, alone = false): Promise<Claimed & { next?: unknown }> {
  const body: Json = { role };
  if (order === "value" && role === "rater") body.order = "value";
  if (alone && role === "rater") body.alone = true;
  return door<Claimed & { next?: unknown }>("POST", `/api/campaigns/${id(c)}/claim`, body);
}

/** The items the engine says come next, where a claim names them: `{item, stack}`, or a list of those or of stacks. */
export function nextOf(c: { next?: unknown }): { item: number | null; stack: number }[] {
  const n = c.next;
  const one = (x: unknown): { item: number | null; stack: number }[] => {
    if (typeof x === "number") return [{ item: null, stack: x }];
    if (!x || typeof x !== "object") return [];
    const o = x as Json;
    const stack = typeof o.stack === "number" ? o.stack : typeof o.stack_id === "number" ? o.stack_id : null;
    const item = typeof o.item === "number" ? o.item : typeof o.item_id === "number" ? o.item_id : null;
    return stack === null ? [] : [{ item, stack }];
  };
  return Array.isArray(n) ? n.flatMap(one) : one(n);
}

/** The stacks the engine says come next, where a claim names them. */
export function hintOf(c: { next?: unknown }): number[] {
  return nextOf(c).map((x) => x.stack);
}

const PREFETCH_KEY = "nils.reader.prefetch";

/**
 * Whether the reader reads ahead (record 50, after the first gold campaign:
 * "we can cache and make them ready"): the next item's evidence, header and
 * pictures while this one is read. On unless a person turned it off on a
 * slow link, `off` under nils.reader.prefetch.
 */
export function prefetchOn(): boolean {
  try {
    return localStorage.getItem(PREFETCH_KEY) !== "off";
  } catch {
    return true;
  }
}

const lines = new Map<string, Promise<Reading | null>>();

/**
 * One item's reading: the engine's evidence door where it serves one; else
 * the classify.asked item behind it and the explain door, where the person
 * may read the queue. Read once per item while the page lives, so the next
 * items' readings can be asked for before they are shown.
 */
export function readingFor(caps: Capabilities, c: number | string, q: Question, item: Pick<Item, "id" | "stack_id" | "review_item_id" | "blind">): Promise<Reading | null> {
  const k = `${c}/${item.id}`;
  const have = lines.get(k);
  if (have) return have;
  let p: Promise<Reading | null>;
  if (served(caps, R48.line)) p = door<Json>("GET", `/api/campaigns/${id(c)}/items/${item.id}/why`).then((raw) => narrowed(readingOf(raw), askedAxes(q)));
  else if (may(caps, "review:see")) {
    const ev = item.review_item_id !== null ? campaigns.reviewItem(item.review_item_id).then((r) => r.evidence ?? null, () => null) : Promise.resolve(null);
    const ex = item.stack_id !== null && served(caps, "GET /api/explain/{stack}") ? review.explain(item.stack_id).catch(() => null) : Promise.resolve(null);
    p = Promise.all([ev, ex]).then(([e, x]) => (e || x ? readingFromAsked(e, x, item.stack_id, askedAxes(q)) : null));
  } else p = Promise.resolve(null);
  const blind = item.blind === true;
  const kept = p.catch(() => null).then((r) => (blind ? blindReading(r, item.stack_id, askedAxes(q)) : r));
  lines.set(k, kept);
  bound(lines);
  return kept;
}

/** A reading's lines narrowed to the axes the question asks; the why door speaks of every axis of the stack. */
function narrowed(r: Reading, axes: string[]): Reading {
  return axes.length === 0 ? r : { ...r, lines: r.lines.filter((l) => axes.includes(l.axis)) };
}

/** Forget the readings (a test). */
export function forgetReadings(): void {
  lines.clear();
}

/** The batches of like stacks open to the caller, each with as many of its items as `sample` asks (a grid's worth). */
export function batchesFor(c: number | string, q: Question, items: Pick<Item, "id" | "stack_id" | "blind">[], sample = 60): Promise<Batch[]> {
  const stacks = new Map(items.map((i) => [i.id, i.stack_id]));
  const blind = new Set(items.filter((i) => i.blind === true).map((i) => i.id));
  return door<Json>("GET", `/api/campaigns/${id(c)}/batches?sample=${sample}`).then((r) => batchesOf(r, (i) => stacks.get(i) ?? null, q.kind === "axis" ? (q.axis ?? null) : null, (i) => blind.has(i)));
}

/**
 * Accept a batch's suggestion in one move: the engine leases and answers
 * each item as its own, marked as given to a batch, and holds a tenth back
 * at random to be read alone. Where the person held some back, only the
 * others shown are named.
 */
export function acceptBatch(c: number | string, b: Batch, plan: { items: number[] | null }, holdBack = HOLD_BACK): Promise<{ accepted: number; held: number[]; refused: number }> {
  const body: Json = { hold_back: holdBack, ...(plan.items ? { items: plan.items } : {}) };
  return door<Json>("POST", `/api/campaigns/${id(c)}/batches/${encodeURIComponent(b.key)}/accept`, body).then(acceptedOf);
}

export function statsFor(c: number | string): Promise<RaterStats> {
  return door<Json>("GET", `/api/campaigns/${id(c)}/stats`).then(statsOf);
}

// ---------------------------------------------------------------- record 48, after the first real read

/**
 * The whole-header door of an item: the path the why door names, else the
 * door's own path where the engine serves it; null on an engine without it,
 * where `h` keeps opening the evidence.
 */
export function headerDoorOf(caps: Capabilities, c: number | string, item: number, reading: Reading | null): string | null {
  if (reading?.headerDoor) return reading.headerDoor;
  return served(caps, HEADER) ? `/api/campaigns/${id(c)}/items/${item}/header` : null;
}

const headers = new Map<string, Promise<HeaderDoc>>();

/** Read an item's whole header, once per item while the page lives, so the next item's can be read before it is shown. A refusal is not kept. */
export function headerFor(path: string): Promise<HeaderDoc> {
  const have = headers.get(path);
  if (have) return have;
  const p = campaigns.header(path).then((d) => ({ ...d, fields: Array.isArray(d.fields) ? d.fields : [] }));
  headers.set(path, p);
  bound(headers);
  p.catch(() => headers.delete(path));
  return p;
}

/** Forget the headers read (a test). */
export function forgetHeaders(): void {
  headers.clear();
}

/** Whether to ask the derive door: the question names derived axes, or the engine lists the door. */
export function deriveAsked(caps: Capabilities, q: Question): boolean {
  return q.kind === "axes" && ((Array.isArray(q.derive) && q.derive.length > 0) || served(caps, DERIVE));
}

/** The derive door for one item, answering the derived axes of a partial answer. */
export type DeriveDoor = (value: Record<string, string | string[] | null>) => Promise<Derived | null>;

export function deriveDoor(c: number | string, item: number): DeriveDoor {
  return (value) => campaigns.derive(c, item, value).then(derivedOf);
}

/**
 * The derived line's clock (record 48): each change of the answer asks the
 * derive door once the answer has been still for `wait` ms, and only the
 * latest question's answer is shown; an earlier one arriving late is
 * dropped. A 404 says the engine has no such door: the line is hidden and
 * nothing more is asked. Another refusal leaves the line as it was.
 */
export class Deriver {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private asked = 0;
  private gone = false;
  constructor(
    private door: DeriveDoor,
    private show: (d: Derived | null, absent: boolean) => void,
    private wait = 150,
  ) {}

  want(value: Record<string, string | string[] | null>): void {
    if (this.gone) return;
    if (this.timer !== null) clearTimeout(this.timer);
    const n = ++this.asked;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.door(value).then(
        (d) => {
          if (n === this.asked && !this.gone) this.show(d, false);
        },
        (e: unknown) => {
          if (e instanceof DoorError && e.status === 404) {
            this.gone = true;
            this.show(null, true);
          }
        },
      );
    }, this.wait);
  }

  /** Stop: a timer pending is dropped and a late answer is not shown. */
  stop(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.asked++;
    this.gone = true;
  }
}
