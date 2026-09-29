// SPDX-License-Identifier: AGPL-3.0-only
// Pair mode (the post-contrast study, P6): the picture gold of whether
// contrast was given is read two stacks at a time. The engine serves one
// pair's two stacks, left and right as its seed drew them, and nothing else
// of them: no time, no series name, no header, no value the rules gave. The
// person answers in one key: 1 the left is post, 2 the right is post, 3 both
// are pre, 4 both are post, 5 can't tell. The engine resolves each answer
// into the post-contrast value of each stack. This module reads the sheet,
// maps the keys, reads the summary, and keeps the two pictures on one slice
// where their geometry lets it.

import { door, type Json } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { dot, geometry, type Vec3 } from "../viewer/geometry";
import type { Manifest } from "../viewer/doors";
import type { Campaign } from "./client";

/** The doors of pair mode, as the engine's OpenAPI 7 names them. */
export const PAIR = {
  sheet: "GET /api/campaigns/{id}/items/{item}/pair",
  summary: "GET /api/campaigns/{id}/pair",
  values: "GET /api/campaigns/{id}/pair/values",
};

/** The five answers, in the order of the keys 1 to 5. */
export const PAIR_ANSWERS = ["left_post", "right_post", "both_pre", "both_post", "cant_tell"] as const;
export type PairAnswer = (typeof PAIR_ANSWERS)[number];

/** Each answer in a person's words. */
export const ANSWER_WORDS: Record<PairAnswer, string> = {
  left_post: "left is post",
  right_post: "right is post",
  both_pre: "both pre",
  both_post: "both post",
  cant_tell: "can't tell",
};

export interface PairSheet {
  item: number;
  left: number;
  right: number;
  answers: PairAnswer[];
}

const id = (c: number | string) => encodeURIComponent(String(c));

/** Whether a campaign asks of pairs: its question is a pair question. */
export function isPair(c: Pick<Campaign, "question"> | null | undefined): boolean {
  return c?.question?.kind === "pair";
}

/** Whether the engine serves the pair sheet. */
export const pairServed = (caps: Capabilities): boolean => served(caps, PAIR.sheet);

const stackOf = (v: unknown): number | null => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const s = (v as Json).stack;
  return typeof s === "number" ? s : null;
};

/** The sheet as the door answers it, read defensively; null where it names no two stacks. */
export function sheetOf(raw: Json): PairSheet | null {
  const left = stackOf(raw.left);
  const right = stackOf(raw.right);
  if (left === null || right === null || typeof raw.item !== "number") return null;
  const answers = Array.isArray(raw.answers) ? raw.answers.filter((a): a is PairAnswer => (PAIR_ANSWERS as readonly string[]).includes(a as string)) : [];
  return { item: raw.item, left, right, answers: answers.length === PAIR_ANSWERS.length ? answers : [...PAIR_ANSWERS] };
}

export interface PairSummary {
  items: number;
  answered: number;
  median: number | null;
  answers: Record<string, number>;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function summaryOf(raw: Json): PairSummary {
  const secs = (raw.seconds && typeof raw.seconds === "object" && !Array.isArray(raw.seconds) ? raw.seconds : {}) as Json;
  const answers: Record<string, number> = {};
  if (raw.answers && typeof raw.answers === "object" && !Array.isArray(raw.answers)) for (const [k, n] of Object.entries(raw.answers as Json)) if (typeof n === "number") answers[k] = n;
  return { items: num(raw.items) ?? 0, answered: num(raw.answered) ?? 0, median: num(secs.median), answers };
}

export const pairDoors = {
  sheet: (c: number | string, item: number) =>
    door<Json>("GET", `/api/campaigns/${id(c)}/items/${item}/pair`).then((raw) => {
      const s = sheetOf(raw);
      if (!s) throw new Error("the engine served no two stacks for this pair");
      return s;
    }),
  summary: (c: number | string) => door<Json>("GET", `/api/campaigns/${id(c)}/pair`).then(summaryOf),
  values: (c: number | string) => door<Json>("GET", `/api/campaigns/${id(c)}/pair/values`),
};

/** How often each answer was given, in key order: "left is post 4 · right is post 5 · …". */
export function answerCounts(s: Pick<PairSummary, "answers">): string {
  const total = PAIR_ANSWERS.reduce((n, a) => n + (s.answers[a] ?? 0), 0);
  if (total === 0) return "nothing read yet";
  return PAIR_ANSWERS.filter((a) => (s.answers[a] ?? 0) > 0)
    .map((a) => `${ANSWER_WORDS[a]} ${s.answers[a]}`)
    .join(" · ");
}

/** What a key does in pair mode. */
export type PairAct = { kind: "answer"; answer: PairAnswer } | { kind: "send" } | { kind: "skip" } | { kind: "keys" } | { kind: "sync" };

/**
 * A key's act: 1 to 5 choose an answer, Enter sends the chosen one, `s`
 * gives the pair back, `l` keeps the two pictures on one slice or lets them
 * go, `?` the keys. The arrows, Page Up and Down and Space are the
 * pictures'. Nothing from a text field.
 */
export function pairKey(key: string, o: { inField: boolean; ctrl?: boolean }): PairAct | null {
  if (o.inField) return null;
  if (o.ctrl) return key === "Enter" ? { kind: "send" } : null;
  if (key === "Enter") return { kind: "send" };
  if (key === "s") return { kind: "skip" };
  if (key === "l") return { kind: "sync" };
  if (key === "?") return { kind: "keys" };
  if (/^[1-5]$/u.test(key)) return { kind: "answer", answer: PAIR_ANSWERS[Number(key) - 1] };
  return null;
}

/** What an answer says of each side, as the engine resolves it: post, pre or can't tell. */
export function sidesOf(a: PairAnswer): { left: "post" | "pre" | "?"; right: "post" | "pre" | "?" } {
  switch (a) {
    case "left_post":
      return { left: "post", right: "pre" };
    case "right_post":
      return { left: "pre", right: "post" };
    case "both_pre":
      return { left: "pre", right: "pre" };
    case "both_post":
      return { left: "post", right: "post" };
    default:
      return { left: "?", right: "?" };
  }
}

/**
 * How one picture's plane maps onto the other's, where their geometry lets
 * the two be kept on one slice:
 *
 * - `position`: the planes are parallel (within two degrees) and both
 *   manifests say where they lie, so a plane of one is matched to the plane
 *   of the other nearest it along the normal, whatever their depths;
 * - `index`: neither says where it lies, and both have the same shape and
 *   spacing, so plane z is plane z;
 * - null: the geometry does not match (another orientation, another shape,
 *   or two stacks that do not overlap), and each picture moves alone.
 */
export interface SliceMap {
  kind: "position" | "index";
  /** Plane z of `from` to the nearest plane of `to`. */
  map: (z: number) => number;
}

const COS_TWO_DEGREES = Math.cos((2 * Math.PI) / 180);

function placed(m: Manifest): boolean {
  return Array.isArray(m.origin) && m.origin.length === 3 && m.origin.every((v) => Number.isFinite(v));
}

export function sliceMap(from: Manifest, to: Manifest): SliceMap | null {
  const nFrom = from.shape?.[0] ?? 0;
  const nTo = to.shape?.[0] ?? 0;
  if (nFrom < 1 || nTo < 1) return null;
  const clamp = (k: number) => Math.min(nTo - 1, Math.max(0, k));
  const a = geometry(from);
  const b = geometry(to);
  if (a.known && b.known && placed(from) && placed(to)) {
    if (Math.abs(dot(a.normal, b.normal)) < COS_TWO_DEGREES) return null;
    const n: Vec3 = a.normal;
    const stepA = dot(a.step, n);
    const stepB = dot(b.step, n);
    if (Math.abs(stepA) < 1e-6 || Math.abs(stepB) < 1e-6) return null;
    const a0 = dot(a.origin, n);
    const b0 = dot(b.origin, n);
    // the two must overlap along the normal, by at least half a plane
    const [aLo, aHi] = [Math.min(a0, a0 + stepA * (nFrom - 1)), Math.max(a0, a0 + stepA * (nFrom - 1))];
    const [bLo, bHi] = [Math.min(b0, b0 + stepB * (nTo - 1)), Math.max(b0, b0 + stepB * (nTo - 1))];
    const slack = Math.max(Math.abs(stepA), Math.abs(stepB)) / 2;
    if (aHi + slack < bLo || bHi + slack < aLo) return null;
    return { kind: "position", map: (z) => clamp(Math.round((a0 + stepA * z - b0) / stepB)) };
  }
  if (!a.known && !b.known && !placed(from) && !placed(to)) {
    const same = from.shape.every((v, i) => v === to.shape[i]) && from.spacing.every((v, i) => Math.abs(v - to.spacing[i]) < 1e-3);
    return same ? { kind: "index", map: (z) => clamp(z) } : null;
  }
  return null;
}

/** Both directions at once, or null where the geometry does not match either way. */
export function pairSync(left: Manifest, right: Manifest): { toRight: SliceMap; toLeft: SliceMap } | null {
  const toRight = sliceMap(left, right);
  const toLeft = sliceMap(right, left);
  return toRight && toLeft ? { toRight, toLeft } : null;
}

/** Which side goes first: the engine drew it, and the page says only "left" and "right". */
export const SIDES = ["left", "right"] as const;
export type Side = (typeof SIDES)[number];
