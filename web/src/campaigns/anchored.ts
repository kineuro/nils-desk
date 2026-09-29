// SPDX-License-Identifier: AGPL-3.0-only
// Anchored reading (the post-contrast study, record 48 of 2026-09-29,
// night). When both scans of a pair look alike nobody can tell pre from
// post: a lone scan's brightness says nothing. So a candidate stack is read
// beside a known-pre and a known-post anchor of the same subject, in three
// panels whose order the engine's seed drew. The engine serves the three
// stacks and nothing else of them: the anchors are labelled "reference pre"
// and "reference post", an anchor of another session is flagged, and no
// time, series name, header or value the rules gave is served. The person
// answers in one key: 1 like the pre, 2 like the post, 3 can't tell. The
// engine resolves the answer into the candidate's post-contrast value
// alone; the anchors are never labelled by it. This module reads the sheet,
// maps the keys, reads the summary, and keeps the three pictures on one
// slice where their geometry lets it.

import { door, type Json } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import type { Manifest } from "../viewer/doors";
import type { Campaign } from "./client";
import { sliceMap, type SliceMap } from "./pair";

/** The doors of anchored reading, as the engine's OpenAPI 7 names them. */
export const ANCHORED = {
  sheet: "GET /api/campaigns/{id}/items/{item}/anchored",
  summary: "GET /api/campaigns/{id}/anchored",
  values: "GET /api/campaigns/{id}/anchored/values",
};

/** The three answers, in the order of the keys 1 to 3. */
export const ANCHORED_ANSWERS = ["like_pre", "like_post", "cant_tell"] as const;
export type AnchoredAnswer = (typeof ANCHORED_ANSWERS)[number];

export const ANCHORED_WORDS: Record<AnchoredAnswer, string> = {
  like_pre: "like the pre",
  like_post: "like the post",
  cant_tell: "can't tell",
};

/** What a panel shows: the candidate, or one of the two references. */
export type Role = "candidate" | "reference_pre" | "reference_post";
export const ROLES: readonly Role[] = ["candidate", "reference_pre", "reference_post"];
export const ROLE_WORDS: Record<Role, string> = {
  candidate: "candidate",
  reference_pre: "reference pre",
  reference_post: "reference post",
};

export interface Panel {
  panel: number;
  role: Role;
  stack: number;
  /** An anchor of another session than the candidate's. */
  otherSession: boolean;
}

export interface AnchoredSheet {
  item: number;
  /** In the order the seed drew, left to right. */
  panels: Panel[];
  answers: AnchoredAnswer[];
}

const id = (c: number | string) => encodeURIComponent(String(c));

export function isAnchored(c: Pick<Campaign, "question"> | null | undefined): boolean {
  return c?.question?.kind === "anchored";
}

export const anchoredServed = (caps: Capabilities): boolean => served(caps, ANCHORED.sheet);

/** The sheet as the door answers it, read defensively; null unless it names one stack for each of the three roles. */
export function anchoredSheetOf(raw: Json): AnchoredSheet | null {
  if (typeof raw.item !== "number" || !Array.isArray(raw.panels)) return null;
  const panels: Panel[] = [];
  for (const p of raw.panels as unknown[]) {
    if (!p || typeof p !== "object" || Array.isArray(p)) return null;
    const x = p as Json;
    if (typeof x.stack !== "number" || !(ROLES as readonly string[]).includes(x.role as string)) return null;
    panels.push({ panel: typeof x.panel === "number" ? x.panel : panels.length, role: x.role as Role, stack: x.stack, otherSession: x.other_session === true });
  }
  panels.sort((a, b) => a.panel - b.panel);
  if (panels.length !== 3 || new Set(panels.map((p) => p.role)).size !== 3) return null;
  const answers = Array.isArray(raw.answers) ? raw.answers.filter((a): a is AnchoredAnswer => (ANCHORED_ANSWERS as readonly string[]).includes(a as string)) : [];
  return { item: raw.item, panels, answers: answers.length === ANCHORED_ANSWERS.length ? answers : [...ANCHORED_ANSWERS] };
}

export interface AnchoredSummary {
  items: number;
  answered: number;
  median: number | null;
  answers: Record<string, number>;
  otherSession: number;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function anchoredSummaryOf(raw: Json): AnchoredSummary {
  const secs = (raw.seconds && typeof raw.seconds === "object" && !Array.isArray(raw.seconds) ? raw.seconds : {}) as Json;
  const answers: Record<string, number> = {};
  if (raw.answers && typeof raw.answers === "object" && !Array.isArray(raw.answers)) for (const [k, n] of Object.entries(raw.answers as Json)) if (typeof n === "number") answers[k] = n;
  return { items: num(raw.items) ?? 0, answered: num(raw.answered) ?? 0, median: num(secs.median), answers, otherSession: num(raw.items_with_an_anchor_of_another_session) ?? 0 };
}

export const anchoredDoors = {
  sheet: (c: number | string, item: number) =>
    door<Json>("GET", `/api/campaigns/${id(c)}/items/${item}/anchored`).then((raw) => {
      const s = anchoredSheetOf(raw);
      if (!s) throw new Error("the engine served no candidate and two anchors for this item");
      return s;
    }),
  summary: (c: number | string) => door<Json>("GET", `/api/campaigns/${id(c)}/anchored`).then(anchoredSummaryOf),
  values: (c: number | string) => door<Json>("GET", `/api/campaigns/${id(c)}/anchored/values`),
};

export function anchoredCounts(s: Pick<AnchoredSummary, "answers">): string {
  const total = ANCHORED_ANSWERS.reduce((n, a) => n + (s.answers[a] ?? 0), 0);
  if (total === 0) return "nothing read yet";
  return ANCHORED_ANSWERS.filter((a) => (s.answers[a] ?? 0) > 0)
    .map((a) => `${ANCHORED_WORDS[a]} ${s.answers[a]}`)
    .join(" · ");
}

/** What a key does on the anchored page. */
export type AnchoredAct =
  | { kind: "answer"; answer: AnchoredAnswer }
  | { kind: "send" }
  | { kind: "skip" }
  | { kind: "keys" }
  | { kind: "sync" }
  | { kind: "window" }
  | { kind: "difference" }
  | { kind: "region"; region: number };

/**
 * A key's act: 1 to 3 choose an answer, Enter sends it, `s` gives the item
 * back, `l` ties the pictures to one slice or lets them go, `w` one window
 * for all or each its own, `d` the difference, 7 to 0 the region jumps, `?`
 * the keys. The arrows, Page Up and Down and Space are the pictures'.
 */
export function anchoredKey(key: string, o: { inField: boolean; ctrl?: boolean }): AnchoredAct | null {
  if (o.inField) return null;
  if (o.ctrl) return key === "Enter" ? { kind: "send" } : null;
  if (key === "Enter") return { kind: "send" };
  if (key === "s") return { kind: "skip" };
  if (key === "l") return { kind: "sync" };
  if (key === "w") return { kind: "window" };
  if (key === "d") return { kind: "difference" };
  if (key === "?") return { kind: "keys" };
  if (/^[1-3]$/u.test(key)) return { kind: "answer", answer: ANCHORED_ANSWERS[Number(key) - 1] };
  const region = ["7", "8", "9", "0"].indexOf(key);
  if (region >= 0) return { kind: "region", region };
  return null;
}

/**
 * The slice maps of the three panels through the candidate: each anchor's
 * plane to the candidate's and back, where their geometry matches; null for
 * an anchor whose geometry does not.
 */
export interface Links {
  toCandidate: Partial<Record<Role, SliceMap | null>>;
  fromCandidate: Partial<Record<Role, SliceMap | null>>;
}

export function linksOf(manifests: Partial<Record<Role, Manifest>>): Links | null {
  const c = manifests.candidate;
  if (!c) return null;
  const out: Links = { toCandidate: {}, fromCandidate: {} };
  for (const r of ["reference_pre", "reference_post"] as const) {
    const m = manifests[r];
    if (!m) continue;
    const to = sliceMap(m, c);
    const from = sliceMap(c, m);
    out.toCandidate[r] = to && from ? to : null;
    out.fromCandidate[r] = to && from ? from : null;
  }
  return out;
}

/** Where every panel goes when one moves to plane z: the candidate's place, then each anchor tied to it; an untied anchor stays. */
export function follow(links: Links | null, moved: Role, z: number, now: Record<Role, number | null>): Record<Role, number | null> {
  const next = { ...now, [moved]: z };
  if (!links) return next;
  const zc = moved === "candidate" ? z : (links.toCandidate[moved]?.map(z) ?? null);
  if (zc === null) return next;
  next.candidate = zc;
  for (const r of ["reference_pre", "reference_post"] as const) {
    if (r === moved) continue;
    const f = links.fromCandidate[r];
    if (f) next[r] = f.map(zc);
  }
  return next;
}
