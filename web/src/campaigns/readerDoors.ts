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
import { campaigns, type AnswerBody, type Claimed, type Item, type Question } from "./client";
import { acceptedOf, batchesOf, readingFromAsked, readingOf, statsOf, askedAxes, type Batch, type Order, type RaterStat, type Reading } from "./reader";

/** The doors a record 48 engine adds, as its OpenAPI 7 names them. */
export const R48 = {
  line: "GET /api/campaigns/{id}/items/{item}/evidence",
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

/** A claim, in value order where the engine offers it; `item` asks for a held-back stack by name, which an engine that does not know it ignores. */
export function claimIn(c: number | string, role: "rater" | "adjudicator", order: Order, item: number | null = null): Promise<Claimed & { next?: unknown }> {
  const body: Json = { role };
  if (order === "value") body.order = "value";
  if (item !== null) body.item = item;
  return door<Claimed & { next?: unknown }>("POST", `/api/campaigns/${id(c)}/claim`, body);
}

/** The stacks the engine says come next, where a claim names them. */
export function hintOf(c: { next?: unknown }): number[] {
  const n = c.next;
  if (!Array.isArray(n)) return [];
  return n.flatMap((x) => (typeof x === "number" ? [x] : x && typeof x === "object" && typeof (x as Json).stack_id === "number" ? [(x as Json).stack_id as number] : []));
}

/**
 * The answer with what the reader knew beside it (record 48 R1): the seconds
 * it took on the desk's clock, the answer that was suggested, as an answer's
 * value says it (the engine compares the two and keeps whether it changed),
 * and how many axes changed. An engine before record 48 ignores them.
 */
export function timed(body: AnswerBody, seconds: number | null, changes: number | null, suggested: AnswerBody["value"] | null): AnswerBody {
  const out: AnswerBody = { ...body };
  if (seconds !== null) out.seconds = Math.round(seconds * 1000) / 1000;
  if (suggested !== null && suggested !== undefined) out.suggested = suggested;
  if (changes !== null) out.changes = changes;
  return out;
}

const lines = new Map<string, Promise<Reading | null>>();

/**
 * One item's reading: the engine's evidence door where it serves one; else
 * the classify.asked item behind it and the explain door, where the person
 * may read the queue. Read once per item while the page lives, so the next
 * items' readings can be asked for before they are shown.
 */
export function readingFor(caps: Capabilities, c: number | string, q: Question, item: Pick<Item, "id" | "stack_id" | "review_item_id">): Promise<Reading | null> {
  const k = `${c}/${item.id}`;
  const have = lines.get(k);
  if (have) return have;
  let p: Promise<Reading | null>;
  if (served(caps, R48.line)) p = door<Json>("GET", `/api/campaigns/${id(c)}/items/${item.id}/evidence`).then(readingOf);
  else if (may(caps, "review:see")) {
    const ev = item.review_item_id !== null ? campaigns.reviewItem(item.review_item_id).then((r) => r.evidence ?? null, () => null) : Promise.resolve(null);
    const ex = item.stack_id !== null && served(caps, "GET /api/explain/{stack}") ? review.explain(item.stack_id).catch(() => null) : Promise.resolve(null);
    p = Promise.all([ev, ex]).then(([e, x]) => (e || x ? readingFromAsked(e, x, item.stack_id, askedAxes(q)) : null));
  } else p = Promise.resolve(null);
  const kept = p.catch(() => null);
  lines.set(k, kept);
  return kept;
}

/** Forget the readings (a test). */
export function forgetReadings(): void {
  lines.clear();
}

export function batchesFor(c: number | string): Promise<Batch[]> {
  return door<Json>("GET", `/api/campaigns/${id(c)}/batches`).then(batchesOf);
}

/**
 * Accept a batch's suggestion for every stack in it but the held back; the
 * engine leases and answers each as its own item, marked as given to a
 * batch, the suggestion kept beside it.
 */
export function acceptBatch(c: number | string, q: Question, b: Batch, plan: { accept: number[]; read: number[] }, seconds: number | null): Promise<{ accepted: number; held: number[] }> {
  const value = q.kind === "axis" && q.axis ? b.values[q.axis] : b.values;
  const body: Json = { items: plan.accept, hold: plan.read, value: value as Json[string], suggested: value as Json[string], ...(seconds !== null ? { seconds: Math.round(seconds * 1000) / 1000 } : {}) };
  return door<Json>("POST", `/api/campaigns/${id(c)}/batches/${encodeURIComponent(b.key)}/accept`, body).then((r) => acceptedOf(r, plan));
}

export function statsFor(c: number | string): Promise<RaterStat[]> {
  return door<Json>("GET", `/api/campaigns/${id(c)}/stats`).then(statsOf);
}
