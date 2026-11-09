// SPDX-License-Identifier: AGPL-3.0-only
// What a campaign's page says of its own upkeep (2026-11-05, a 4,838-item
// campaign read alone): the close as it runs, each open item's lease, the
// ways of reading it does not offer and why, and the items it keeps to be
// read one by one. Pure, so the page and its tests read the same words.

import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";
import { abServed, isAb } from "./ab";
import { anchoredServed, isAnchored } from "./anchored";
import { isCheck } from "./check";
import { answeredAxes, principalOf, purposeOf, suggestOf, type Assignment, type Campaign, type Closed, type Item, type Requestioned } from "./client";
import { isPair, pairServed } from "./pair";
import { R48 } from "./readerDoors";

const n = (v: number) => v.toLocaleString("en-US");

/** The close a campaign runs or ran as a job, as its door reports it; absent from an engine before it. */
export interface CloseJob {
  id: number;
  state: "running" | "cancelling" | "done" | "failed" | "cancelled" | string;
  /** Whether the close runs now; false for one that stopped part way. */
  running: boolean;
  by: string | null;
  started_at: string;
  finished_at: string | null;
  result: Closed | null;
  error: string | null;
}

/** Where a campaign's close stands: none running, one running now, or one that stopped part way and leaves the campaign closing. */
export function closeStage(c: Pick<Campaign, "status"> & { close_job?: CloseJob | null }): "none" | "running" | "stopped" {
  if (c.status !== "closing") return "none";
  // an engine before the close job says nothing: a campaign seen closing is taken to be closing now
  if (c.close_job === undefined) return "running";
  return c.close_job?.running ? "running" : "stopped";
}

/** How far a running close is, from the items' states as read: those written, and those still to write. */
export function closingWords(c: Campaign): string {
  const k = c.counts.items;
  const written = (k.resolved ?? 0) + (k.refused ?? 0);
  const left = (k.agreed ?? 0) + (k.adjudicated ?? 0);
  return left > 0 ? `${n(written)} written, ${n(left)} to go.` : `${n(written)} written; finishing.`;
}

/** The items a close refused, each with the engine's reason, at most `max` of them. */
export function refusedLines(r: Closed, max = 5): string[] {
  const lines = r.refused.slice(0, max).map((x) => `Item ${x.item}: ${x.why}`);
  if (r.refused.length > max) lines.push(`and ${n(r.refused.length - max)} more, each on its row`);
  return lines;
}

// ---------------------------------------------------------------- an open item's lease

/** What the page says of an open item's lease: in words, and the assignment Release gives back where the person may. */
export interface LeaseLine {
  words: string;
  /** The live lease the person may give back, or null. */
  release: Assignment | null;
}

const until = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
/** A person's short name where the page gives no other namer: the part before the @. */
const shortName = (p: string | null | undefined) => (p ? p.split("@")[0] : "someone");

/** Whether a rater's lease ran out by `now`, whatever state it is written in. */
export function ranOut(a: Assignment, now: number): boolean {
  return a.state === "expired" || (a.state === "leased" && a.lease_until !== null && Date.parse(a.lease_until) < now);
}

/** Whether the person may give back another's lease: its holder, the campaign's maker, an adjudicator it names, or a holder of Review work. */
export function mayRelease(caps: Capabilities, c: Campaign, a: Assignment): boolean {
  if (!served(caps, "POST /api/campaigns/{id}/assignments/{assignment}/release") || !may(caps, "campaigns:work")) return false;
  const me = principalOf(caps);
  return a.principal === me || c.owner === me || c.rater_policy.adjudicators.includes(me) || may(caps, "review:work");
}

/**
 * An open item's lease in words, for its maker or an adjudicator (2026-11-05:
 * two items sat open and unserved behind leases that had run out, and only the
 * database said so). Null where the item is not open or nothing holds it.
 */
export function leaseLine(caps: Capabilities, c: Campaign, i: Item, now = Date.now(), who: (p: string | null | undefined) => string = shortName): LeaseLine | null {
  if (i.state !== "open" || c.status !== "open") return null;
  const mine = (c.assignments ?? []).filter((a) => a.item_id === i.id && a.role === "rater");
  const live = mine.filter((a) => a.state === "leased" && !ranOut(a, now));
  if (live.length > 0) {
    const a = live[0];
    const more = live.length > 1 ? ` and ${live.length - 1} more` : "";
    return { words: `with ${who(a.principal)}${more} until ${a.lease_until ? until(a.lease_until) : "the lease ends"}`, release: mayRelease(caps, c, a) ? a : null };
  }
  const gone = mine.filter((a) => ranOut(a, now) || a.state === "released");
  const sole = c.rater_policy.raters.length === 1 ? c.rater_policy.raters[0] : null;
  const back = i.held_back ? "; read one by one" : "";
  if (gone.length > 0) {
    const last = gone[gone.length - 1];
    const how = ranOut(last, now) ? "lease ran out" : "given back";
    // where the campaign names one rater, an item they let go is theirs again; a study's rater reads an item once
    if (sole !== null) return { words: `${how}; free again for ${who(sole)}, no release needed${back}`, release: null };
    const named = c.rater_policy.raters;
    const held = new Set(mine.map((a) => a.principal));
    if (named.length > 0 && named.every((p) => held.has(p))) return { words: `${how}; every named rater held it once, so none is served it: add a rater, or close without it`, release: null };
    return { words: `${how}; free for another rater, no release needed${back}`, release: null };
  }
  if (i.held_back) return { words: "read one by one, never in a batch or the gallery", release: null };
  return null;
}

// ---------------------------------------------------------------- the ways of reading

/**
 * Why the page offers no gallery, or no batches, each in one line with what
 * would bring it (2026-11-05: the gallery went away without a word while the
 * campaign asked two axes). Only for a campaign read one stack at a time by
 * axes; a pair, anchored, A/B or check campaign has its own reader.
 */
export function missingModes(caps: Capabilities, c: Campaign): string[] {
  const q = c.question;
  if (q.kind !== "axis" && q.kind !== "axes") return [];
  if ((isAb(c) && abServed(caps)) || (isPair(c) && pairServed(caps)) || (isAnchored(c) && anchoredServed(caps)) || isCheck(c)) return [];
  const purpose = purposeOf(c);
  if (purpose === "verify") return ["No gallery or batches: a verify campaign is read one stack per screen, its proposal first."];
  const suggest = suggestOf(c);
  if ((purpose === "train" || purpose === "measure" || purpose === "audit") && suggest !== "none") return [`No gallery or batches: its answers ${purpose === "audit" ? "audit" : purpose}, so each item is answered before its suggestion shows.`];
  const out: string[] = [];
  const axes = q.kind === "axes" ? (q.axes ?? []) : q.axis ? [q.axis] : [];
  if (served(caps, "GET /api/campaigns/{id}/gallery")) {
    if (axes.length > 1) out.push(`No gallery: it shows one axis at a time, and this campaign asks ${axes.length} (${axes.join(", ")}). Asking one axis, the others derived from it, brings it.`);
  }
  if (served(caps, R48.batches) && suggest !== "rules") {
    out.push(`No batches: a batch groups stacks by the rules' answer, and this campaign ${suggest === "none" ? "shows no suggestion" : "shows only imported suggestions"}, as it was made.`);
  }
  return out;
}

// ---------------------------------------------------------------- ask one axis

/** The door that moves an open campaign to fewer asked axes (2026-11-06). */
export const REQUESTION = "POST /api/campaigns/{id}/requestion";

/** The line of {@link missingModes} that a campaign asking one axis would not have. */
export const isAxesGalleryLine = (w: string): boolean => w.startsWith("No gallery: it shows one axis at a time");

/**
 * Whether the person may ask one axis alone in this campaign, which brings
 * the gallery: an open axes campaign asking more than one, its maker or a
 * Review worker, and an engine with the door.
 */
export function mayAskOneAxis(caps: Capabilities, c: Campaign): boolean {
  if (c.status !== "open" || c.question.kind !== "axes" || answeredAxes(c.question).length < 2) return false;
  if (!served(caps, REQUESTION) || !may(caps, "campaigns:work")) return false;
  return c.owner === principalOf(caps) || may(caps, "review:work");
}

/** What asking fewer axes changes, as the confirm lists it, from the engine's dry run. */
export function askOnePlan(r: Requestioned): { k: string; v: string }[] {
  const dropped = r.asked_before.filter((a) => !r.asked.includes(a) && !r.derive.includes(a));
  const n = r.answers_kept;
  return [
    { k: "Asked", v: r.asked.join(", ") },
    ...(r.derive.length > 0 ? [{ k: "Derived from it", v: r.derive.join(", ") }] : []),
    ...(dropped.length > 0 ? [{ k: "Not asked any more", v: dropped.join(", ") }] : []),
    { k: "Answers given", v: n === 0 ? "none yet" : `${n.toLocaleString("en-US")} kept, read on ${r.asked.join(", ")}` },
  ];
}

/** The page's line once the campaign asks fewer axes. */
export function askOneSaid(r: Requestioned): string {
  const derived = r.derive.length > 0 ? `; ${r.derive.join(", ")} derived from it` : "";
  const kept = r.answers_kept > 0 ? ` ${r.answers_kept.toLocaleString("en-US")} ${r.answers_kept === 1 ? "answer" : "answers"} kept.` : "";
  return `Asks ${r.asked.join(", ")} alone now${derived}.${kept}`;
}

/** The engine's refusal of a move, in the page's words where it names leased items. */
export function askOneRefused(why: string): string {
  const m = /(\d+) item\(s\) of .* are leased/u.exec(why);
  if (m) return `${m[1]} ${m[1] === "1" ? "item is" : "items are"} being read now. Ask again once ${m[1] === "1" ? "it is" : "they are"} answered or given back.`;
  return `Refused: ${why.replace(/\.$/u, "")}.`;
}

// ---------------------------------------------------------------- read one by one

/** The open items kept to be read one by one, never in a batch or the gallery. */
export function aloneCount(c: Campaign): number {
  return (c.items ?? []).filter((i) => i.state === "open" && i.held_back === true).length;
}

/**
 * Why some items are read one by one, in plain words, or null where none
 * is (2026-11-05: about 500 items came one by one, and the page never said
 * why). The share is a check against accepting a page without reading it.
 */
export function aloneWords(c: Campaign & { hold_back?: number }): string | null {
  const k = aloneCount(c);
  if (k === 0) return null;
  const share = typeof c.hold_back === "number" && c.hold_back > 0 ? `${Math.round(c.hold_back * 100)} % of every batch and gallery page` : "a share of every batch and gallery page";
  return `${n(k)} open ${k === 1 ? "item is" : "items are"} read one by one: the campaign sets aside ${share}, at random, to check how often a page accepted at once is right.`;
}

/** Whether the person may have every item read in batches again: the campaign's maker or a Review worker, where its purpose allows none set aside and the engine has the door. */
export function mayReadAllInBatches(caps: Capabilities, c: Campaign & { hold_back?: number; hold_back_none?: boolean }): boolean {
  if (c.status !== "open" || c.hold_back_none !== true || !served(caps, "POST /api/campaigns/{id}/hold-back")) return false;
  if (!may(caps, "campaigns:work")) return false;
  return c.owner === principalOf(caps) || may(caps, "review:work");
}
