// SPDX-License-Identifier: AGPL-3.0-only
// Job type 3, check a result (record 55 H3; the build spec of 2026-10-11,
// sections 6, 8.3, 8.4, 9 and 10, slice D2). A check is a campaign whose
// question is "is this result right?": its item is one result (a mask a
// pipeline made), shown over the scan it was made on and the visit's other
// main scans, with its parts (each lesion, or each structure) listed in it.
// The rater answers with one key: accept, reject, or one of the campaign's
// reasons, on the part in focus or on the whole result; a missed lesion is
// a point clicked on a picture. This file knows the engine's wire (the item
// door, the preview, the make body, the stats) and the page's pure parts:
// what an answer holds and when it may be sent, the keys, the grid by the
// count of panels, and the words. The reader is the comparison reader with
// a third spec (CheckReader.tsx); the New check dialog is NewCheck.tsx.

import { door, type Json } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";
import type { Manifest } from "../viewer/doors";
import { dot, geometry, planePosition, type Vec3 } from "../viewer/geometry";
import type { Assignment, Campaign } from "./client";

/** The doors of a check, as the engine's OpenAPI 7 names them (E2). */
export const CHECK = {
  item: "GET /api/campaigns/{id}/items/{item}/check",
  preview: "POST /api/campaigns/preview",
  make: "POST /api/campaigns",
  stats: "GET /api/campaigns/{id}/stats",
  parts: "GET /api/derivatives/{id}/parts",
};

// ---------------------------------------------------------------- the question

export const VERDICTS = ["accepted", "rejected", "flagged"] as const;
export type Verdict = (typeof VERDICTS)[number];

export const VERDICT_WORDS: Record<Verdict, string> = { accepted: "accepted", rejected: "rejected", flagged: "flagged" };

/** What a reason needs beside it: nothing, a note, or a point on a picture. */
export type Needs = "none" | "note" | "point";

/** A reason a check declares, the keys 3 to 9. */
export interface Reason {
  id: string;
  words: string;
  needs: Needs;
}

/** At most seven reasons (the keys 3 to 9), each id [a-z_]{1,24}, its words at most 32 characters. */
export const REASONS_MAX = 7;
export const WORDS_MAX = 32;
export const POINTS_MAX = 50;
export const NOTE_MAX = 2000;
export const PANELS_MAX = 8;

/** The kind of a part set: each lesion (a connected component), each structure (a label), or the result whole. */
export type SetKind = "components" | "labels" | "whole";

/**
 * The reasons the New check fills in by the kind of the part set (section
 * 6.1), as the engine's capabilities name them; these are the engine's own,
 * kept here for an engine that does not list them.
 */
export const PRESETS: Record<SetKind, Reason[]> = {
  components: [
    { id: "under", words: "Under-segmented", needs: "none" },
    { id: "over", words: "Over-segmented", needs: "none" },
    { id: "under_over", words: "Under and over", needs: "none" },
    { id: "joined", words: "Two or more joined", needs: "none" },
    { id: "not_lesion", words: "Not a lesion", needs: "none" },
    { id: "missed", words: "Missed lesion", needs: "point" },
    { id: "other", words: "Other", needs: "note" },
  ],
  labels: [
    { id: "boundary_off", words: "Boundary off", needs: "none" },
    { id: "wrong_label", words: "Wrong label", needs: "none" },
    { id: "part_missing", words: "Part missing", needs: "none" },
    { id: "extra_part", words: "Extra part", needs: "none" },
    { id: "other", words: "Other", needs: "note" },
  ],
  whole: [
    { id: "partly_wrong", words: "Partly wrong", needs: "none" },
    { id: "misplaced", words: "Misplaced", needs: "none" },
    { id: "other", words: "Other", needs: "note" },
  ],
};

const isNeeds = (v: unknown): v is Needs => v === "none" || v === "note" || v === "point";

/** A list of reasons as the engine writes them, read defensively; one without an id or words is left out. */
export function reasonsOf(v: unknown): Reason[] {
  if (!Array.isArray(v)) return [];
  const out: Reason[] = [];
  for (const x of v) {
    if (!x || typeof x !== "object") continue;
    const o = x as Json;
    if (typeof o.id !== "string" || !o.id || typeof o.words !== "string") continue;
    out.push({ id: o.id, words: o.words, needs: isNeeds(o.needs) ? o.needs : "none" });
  }
  return out;
}

/** The engine's check capabilities (GET /api/capabilities, `campaigns.check`), where it says them. */
function checkCaps(caps: Capabilities): Json | null {
  const c = (caps.engine as { campaigns?: { check?: unknown } } | null)?.campaigns?.check;
  return c && typeof c === "object" && !Array.isArray(c) ? (c as Json) : null;
}

/** The preset reasons for a kind of part set: the engine's where it names them, else the build spec's. */
export function presetFor(caps: Capabilities, kind: SetKind): Reason[] {
  const p = checkCaps(caps)?.presets;
  const listed = p && typeof p === "object" && !Array.isArray(p) ? reasonsOf((p as Json)[kind]) : [];
  return listed.length > 0 ? listed : PRESETS[kind].map((r) => ({ ...r }));
}

/** Whether a campaign is a check. */
export function isCheck(c: Pick<Campaign, "question"> | null | undefined): boolean {
  return c?.question?.kind === "check";
}

/** Whether this engine reads a check's items and makes checks: its campaigns say `check`, or it serves the item door. */
export function checkServed(caps: Capabilities): boolean {
  const kinds = (caps.engine as { campaigns?: { questions?: unknown } } | null)?.campaigns?.questions;
  if (Array.isArray(kinds) && !kinds.includes("check")) return false;
  return served(caps, CHECK.item);
}

/** Why the person may not make a check, or null: campaigns:work and pipelines:see, and the doors. */
export function makeCheckRefusal(caps: Capabilities): string | null {
  if (!checkServed(caps) || !served(caps, CHECK.preview)) return "This engine makes no check.";
  if (!may(caps, "campaigns:work")) return "Making a check needs work on Campaigns.";
  if (!may(caps, "pipelines:see")) return "Making a check needs Pipelines.";
  return null;
}

/** A check's question as the campaign keeps it. */
export interface CheckQuestion {
  partSet: string;
  grain: "result" | "part";
  reasons: Reason[];
}

export function checkQuestionOf(c: Pick<Campaign, "question">): CheckQuestion {
  const q = c.question as unknown as Json;
  return { partSet: typeof q.part_set === "string" ? q.part_set : "whole", grain: q.grain === "part" ? "part" : "result", reasons: reasonsOf(q.reasons) };
}

// ---------------------------------------------------------------- an item

/** A part of a result: a lesion or a structure, placed in the patient (mm, LPS). */
export interface Part {
  label: number;
  name: string | null;
  voxels: number;
  volumeMm3: number;
  anchor: Vec3;
  box: [Vec3, Vec3];
  /** Its place bottom to top, from 0. */
  position: number;
  /** The status a check wrote on it, or null. */
  check: string | null;
  checkReason: string | null;
}

export type LayerReady = "ready" | "building" | "missing";

/** One panel of an item: a scan, what it shows (the role's word, or a sealed scan's series description), how the result is tied to it. */
export interface CheckPanel {
  panel: number;
  stack: number;
  shows: string;
  /** The role, null on a scan of a sample sealed now. */
  role: string | null;
  madeOn: boolean;
  /** same: voxel for voxel; world: placed by the scanner's position. */
  link: "same" | "world" | string;
  layer: LayerReady;
  /** Shown for this item alone, from "+ scan". */
  added?: boolean;
}

/** One's own answer as the item door gives it back. */
export interface Given {
  answer: number | null;
  value: string;
  form: CheckForm;
  why: string | null;
}

/** An adjudicator's view of a rater's answer, by letter and never by name. */
export interface Voter {
  as: string;
  value: string;
  form: CheckForm;
  why: string | null;
}

export interface CheckSheet {
  item: number;
  /** From 1. */
  position: number;
  of: number;
  state: string;
  result: { id: number; pipeline: string | null; version: string | null; output: string | null; run: number | null; check: string | null };
  set: { key: string; words: string; kind: SetKind; grain: "result" | "part"; count: number; note: string | null };
  /** At part grain, the item's own part. */
  part: Part | null;
  panels: CheckPanel[];
  /** The other scans of the made-on scan's frame, for "+ scan". */
  more: { stack: number; shows: string }[];
  /** In order; up to 2,000 inline. */
  parts: Part[];
  /** Where the rest are read, when the set holds more than the item carries. */
  partsDoor: string | null;
  reasons: Reason[];
  mine: Given | null;
  warming: number | null;
  answers: Voter[];
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const vec = (v: unknown): Vec3 | null => (Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === "number" && Number.isFinite(x)) ? (v as Vec3) : null);

export function partOf(v: unknown): Part | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Json;
  const label = num(o.label);
  const anchor = vec(o.anchor_mm);
  const box = Array.isArray(o.box_mm) && o.box_mm.length === 2 ? [vec(o.box_mm[0]), vec(o.box_mm[1])] : null;
  if (label === null || !anchor || !box || !box[0] || !box[1]) return null;
  return { label, name: str(o.name), voxels: num(o.voxels) ?? 0, volumeMm3: num(o.volume_mm3) ?? 0, anchor, box: [box[0], box[1]], position: num(o.position) ?? 0, check: str(o.check), checkReason: str(o.check_reason) };
}

/** An answer's form as the engine keeps it, read defensively. */
export function formOf(v: unknown): CheckForm {
  const o = v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {};
  const strings = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : []);
  const nums = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is number => typeof s === "number" && Number.isFinite(s)) : []);
  const parts = Array.isArray(o.parts) ? o.parts.flatMap((p) => (p && typeof p === "object" && num((p as Json).label) !== null && typeof (p as Json).reason === "string" ? [{ label: (p as Json).label as number, reason: (p as Json).reason as string }] : [])) : [];
  const points = Array.isArray(o.points) ? o.points.flatMap((p) => (p && typeof p === "object" && typeof (p as Json).reason === "string" && vec((p as Json).mm) ? [{ reason: (p as Json).reason as string, mm: vec((p as Json).mm)! }] : [])) : [];
  return { reasons: strings(o.reasons), parts, points, seen: nums(o.seen), shown: nums(o.shown) };
}

const KINDS: readonly string[] = ["components", "labels", "whole"];

/** The item door's answer, read defensively; null unless it names a result and at least the made-on panel. */
export function checkSheetOf(raw: Json): CheckSheet | null {
  const item = num(raw.item);
  const r = raw.result && typeof raw.result === "object" ? (raw.result as Json) : null;
  const s = raw.set && typeof raw.set === "object" ? (raw.set as Json) : null;
  if (item === null || !r || num(r.id) === null || !s || !Array.isArray(raw.panels)) return null;
  const panels: CheckPanel[] = [];
  for (const x of raw.panels as unknown[]) {
    if (!x || typeof x !== "object") continue;
    const p = x as Json;
    const stack = num(p.stack);
    if (stack === null) continue;
    const layer = p.layer === "ready" || p.layer === "building" ? p.layer : "missing";
    panels.push({ panel: num(p.panel) ?? panels.length, stack, shows: str(p.shows) ?? "", role: str(p.role), madeOn: p.made_on === true, link: str(p.link) ?? "world", layer });
  }
  panels.sort((a, b) => a.panel - b.panel);
  if (panels.length === 0) return null;
  const kind = KINDS.includes(s.kind as string) ? (s.kind as SetKind) : "whole";
  const mineRaw = raw.mine && typeof raw.mine === "object" ? (raw.mine as Json) : null;
  return {
    item,
    position: num(raw.position) ?? 1,
    of: num(raw.of) ?? 0,
    state: str(raw.state) ?? "open",
    result: { id: r.id as number, pipeline: str(r.pipeline), version: r.version === null || r.version === undefined ? null : String(r.version), output: str(r.output), run: num(r.run), check: str(r.check) },
    set: { key: str(s.key) ?? "whole", words: str(s.words) ?? "", kind, grain: s.grain === "part" ? "part" : "result", count: num(s.count) ?? 0, note: str(s.note) },
    part: partOf(raw.part),
    panels,
    more: Array.isArray(raw.more) ? raw.more.flatMap((m) => (m && typeof m === "object" && num((m as Json).stack) !== null ? [{ stack: (m as Json).stack as number, shows: str((m as Json).shows) ?? "" }] : [])) : [],
    parts: Array.isArray(raw.parts) ? raw.parts.map(partOf).filter((p): p is Part => p !== null) : [],
    partsDoor: str(raw.parts_door),
    reasons: reasonsOf(raw.reasons),
    mine: mineRaw && typeof mineRaw.value === "string" ? { answer: num(mineRaw.answer), value: mineRaw.value, form: formOf(mineRaw.form), why: str(mineRaw.why) } : null,
    warming: num(raw.warming),
    answers: Array.isArray(raw.answers) ? raw.answers.flatMap((a) => (a && typeof a === "object" && typeof (a as Json).value === "string" ? [{ as: str((a as Json).as) ?? "?", value: (a as Json).value as string, form: formOf((a as Json).form), why: str((a as Json).why) }] : [])) : [],
  };
}

const id = (c: number | string) => encodeURIComponent(String(c));

/** What the preview door answers: what a body would make, written nowhere. */
export interface Preview {
  results: number;
  items: number;
  parts: number;
  drawable: number;
  notDrawable: { why: string; count: number }[];
  /** Results left out first: made from a scan of a sample sealed for certification (record 55). How many, never which. */
  leftOutSealed: number;
  checkedAlready: number;
  held: number;
  partsPending: number;
  panelsMissing: Record<string, number>;
  panelsOtherFrame: Record<string, number>;
  panels: { roles: string[]; most: number | null; fewest: number | null };
  picturesToBuild: number;
  layersToBuild: number;
  seed: string | null;
}

const counts = (v: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (v && typeof v === "object" && !Array.isArray(v)) for (const [k, n] of Object.entries(v as Json)) if (typeof n === "number") out[k] = n;
  return out;
};

export function previewOf(raw: Json): Preview {
  const p = raw.panels && typeof raw.panels === "object" ? (raw.panels as Json) : {};
  return {
    results: num(raw.results) ?? 0,
    items: num(raw.items) ?? 0,
    parts: num(raw.parts) ?? 0,
    drawable: num(raw.drawable) ?? 0,
    notDrawable: Array.isArray(raw.not_drawable) ? raw.not_drawable.flatMap((x) => (x && typeof x === "object" && typeof (x as Json).why === "string" && num((x as Json).count) !== null ? [{ why: (x as Json).why as string, count: (x as Json).count as number }] : [])) : [],
    leftOutSealed: num(raw.left_out_sealed) ?? 0,
    checkedAlready: num(raw.checked_already) ?? 0,
    held: num(raw.held) ?? 0,
    partsPending: num(raw.parts_pending) ?? 0,
    panelsMissing: counts(raw.panels_missing),
    panelsOtherFrame: counts(raw.panels_other_frame),
    panels: { roles: Array.isArray(p.roles) ? p.roles.filter((r): r is string => typeof r === "string") : [], most: num(p.most), fewest: num(p.fewest) },
    picturesToBuild: num(raw.pictures_to_build) ?? 0,
    layersToBuild: num(raw.layers_to_build) ?? 0,
    seed: str(raw.seed),
  };
}

/** A check's counts from the stats door: by verdict and by reason, and the pace, over every rater where the caller reads them, else their own. */
export interface CheckStats {
  verdicts: Record<string, number>;
  reasons: Record<string, number>;
  median: number | null;
  answers: number;
  /** Only the caller's own row was read (a rater reads blind). */
  own: boolean;
}

/**
 * The stats door's counts: every rater's where the caller reads them, else
 * their own row. With `own`, the caller's own row whatever else they read
 * (the reader's band): none yet is nothing, never another rater's row.
 */
export function checkStatsOf(raw: Json, principal: string | null = null, own = false): CheckStats {
  const all = raw.all && typeof raw.all === "object" && !Array.isArray(raw.all) ? (raw.all as Json) : null;
  const rows = (Array.isArray(raw.raters) ? (raw.raters as Json[]) : []).filter((r): r is Json => !!r && typeof r === "object");
  const mine = rows.find((r) => r.principal === principal) ?? null;
  const row = own ? (mine ?? (!all && rows.length === 1 ? rows[0] : {})) : (all ?? mine ?? rows[0] ?? {});
  return { verdicts: counts(row.verdicts), reasons: counts(row.reasons), median: num(row.median_seconds), answers: num(row.answers) ?? 0, own: own || !all };
}

/**
 * A reader's own progress in a check: their own answers against the items
 * given to them, never every rater's (with two raters to an item, the other
 * rater's answers are not this one's reads). A rater's items are those they
 * answered or hold, and those a claim may still give them: open, never given
 * to them in any role or state (a result given back is not offered again),
 * and wanting more raters than the campaign shows holding it. A rater who
 * reads blind sees only their own assignments, so there another rater's
 * lease still counts as open until it is answered. An adjudicator's items
 * are those they settled or hold, and those waiting for one that they did
 * not rate and no other adjudicator holds.
 */
export function checkProgress(c: Pick<Campaign, "items" | "assignments" | "raters_per_item">, me: string, role: "rater" | "adjudicator" = "rater"): { items: number; answered: number } {
  const all: Assignment[] = c.assignments ?? [];
  const mine = all.filter((a) => a.principal === me);
  const done = new Set(mine.filter((a) => a.role === role && a.state === "submitted").map((a) => a.item_id));
  const held = new Set(mine.filter((a) => a.role === role && (a.state === "leased" || a.state === "offered") && !done.has(a.item_id)).map((a) => a.item_id));
  // a rater is never given an item twice; an adjudicator never one they rated
  const given = new Set(mine.filter((a) => role === "rater" || a.role === "adjudicator" || a.state === "submitted").map((a) => a.item_id));
  const taken = new Map<number, number>();
  for (const a of all) if (a.principal !== me && a.role === role && (a.state === "leased" || a.state === "submitted" || (role === "adjudicator" && a.state === "offered"))) taken.set(a.item_id, (taken.get(a.item_id) ?? 0) + 1);
  const want = role === "rater" ? Math.max(1, c.raters_per_item || 1) : 1;
  const waiting = role === "rater" ? "open" : "needs_adjudication";
  const left = (c.items ?? []).filter((i) => i.state === waiting && !given.has(i.id) && (taken.get(i.id) ?? 0) < want).length;
  return { answered: done.size, items: done.size + held.size + left };
}

export const checkDoors = {
  sheet: (c: number | string, item: number) =>
    door<Json>("GET", `/api/campaigns/${id(c)}/items/${item}/check`).then((raw) => {
      const s = checkSheetOf(raw);
      if (!s) throw new Error("the engine served no result and no scan for this item");
      return s;
    }),
  preview: (body: Json) => door<Json>("POST", "/api/campaigns/preview", body).then(previewOf),
  /** A result's parts by name, the first page of its set (the campaign's table). */
  parts: (derivative: number, set: string) => door<Json>("GET", `/api/derivatives/${derivative}/parts?set=${encodeURIComponent(set)}&per_page=500`).then(partNamesOf),
  stats: (c: number | string, principal: string | null = null, own = false) => door<Json>("GET", `/api/campaigns/${id(c)}/stats`).then((r) => checkStatsOf(r, principal, own)),
};

// ---------------------------------------------------------------- an answer

/** What an answer rests on (section 6.2). */
export interface CheckForm {
  /** On the whole result. */
  reasons: string[];
  parts: { label: number; reason: string }[];
  points: { reason: string; mm: Vec3 }[];
  /** The parts the rater had in focus for half a second or more. */
  seen: number[];
  /** Scans shown for this item alone. */
  shown: number[];
}

/** The rater's marks on an item as they are made: 1 or 2 chosen, the reasons on the result, the flags on parts, the points, the note. */
export interface Marks {
  chosen: "accepted" | "rejected" | null;
  reasons: string[];
  parts: { label: number; reason: string }[];
  points: { reason: string; mm: Vec3 }[];
  seen: number[];
  shown: number[];
  note: string;
}

export const NO_MARKS: Marks = { chosen: null, reasons: [], parts: [], points: [], seen: [], shown: [], note: "" };

/** One's own answer opened again, as marks. */
export function marksOf(g: Given | null): Marks {
  if (!g) return NO_MARKS;
  return { chosen: g.value === "accepted" || g.value === "rejected" ? g.value : null, reasons: [...g.form.reasons], parts: g.form.parts.map((p) => ({ ...p })), points: g.form.points.map((p) => ({ reason: p.reason, mm: [...p.mm] as Vec3 })), seen: [...g.form.seen], shown: [...g.form.shown], note: g.why ?? "" };
}

/** The verdict the marks come to: any flag, reason or point is flagged; else what 1 or 2 chose; else nothing yet. */
export function verdictOf(m: Marks): Verdict | null {
  if (m.chosen === "rejected") return "rejected";
  if (m.reasons.length > 0 || m.parts.length > 0 || m.points.length > 0) return "flagged";
  return m.chosen;
}

/** 1: accepted, nothing else. */
export const accept = (m: Marks): Marks => ({ ...m, chosen: "accepted", reasons: [], parts: [], points: [] });

/** 2: rejected, the whole result unusable: no part or point; the result's reasons stay. */
export const reject = (m: Marks): Marks => ({ ...m, chosen: "rejected", parts: [], points: [] });

/**
 * A reason's key: on the part in focus (its reason now, or none again when
 * it had that one), else on the whole result (on, or off again). A flag
 * takes the place of 1 or 2.
 */
export function flag(m: Marks, reason: string, part: number | null): Marks {
  if (part !== null) {
    const had = m.parts.find((p) => p.label === part);
    const parts = m.parts.filter((p) => p.label !== part);
    return { ...m, chosen: null, parts: had?.reason === reason ? parts : [...parts, { label: part, reason }] };
  }
  const reasons = m.reasons.includes(reason) ? m.reasons.filter((r) => r !== reason) : [...m.reasons, reason];
  return { ...m, chosen: m.chosen === "rejected" ? "rejected" : null, reasons };
}

/** A point placed for a reason that needs one. */
export function placePoint(m: Marks, reason: string, mm: Vec3): Marks {
  if (m.points.length >= POINTS_MAX) return m;
  return { ...m, chosen: null, points: [...m.points, { reason, mm }] };
}

/** Backspace: the focused part's reason, else the last point, else the last reason on the result, else 1 or 2. */
export function clearLast(m: Marks, part: number | null): Marks {
  if (part !== null && m.parts.some((p) => p.label === part)) return { ...m, parts: m.parts.filter((p) => p.label !== part) };
  if (m.points.length > 0) return { ...m, points: m.points.slice(0, -1) };
  if (m.reasons.length > 0) return { ...m, reasons: m.reasons.slice(0, -1) };
  if (m.chosen !== null) return { ...m, chosen: null };
  return m;
}

/** A part seen: in focus for half a second. */
export const sawPart = (m: Marks, label: number): Marks => (m.seen.includes(label) ? m : { ...m, seen: [...m.seen, label] });

/** How long a part must be in focus to count as seen. */
export const SEEN_MS = 500;

export type Built = { ok: true; value: Verdict; body: Json & { value: Verdict; form: Json; why?: string }; words: string } | { ok: false; needs: string; note?: boolean };

/**
 * The answer the marks make, held to section 6.2 before it is sent: a
 * verdict; a reason that needs a note with the note; at most 50 points and
 * 2,000 characters of note; accepted with no reason, part or point;
 * rejected with no part or point. At part grain a flag is on the item's own
 * part, and rejected (not a lesion) carries no reason.
 */
export function buildAnswer(m: Marks, o: { reasons: readonly Reason[]; grain: "result" | "part"; part: number | null }): Built {
  const v = verdictOf(m);
  if (!v) return { ok: false, needs: "Choose first: 1 accept, 2 reject, or a reason." };
  const byId = new Map(o.reasons.map((r) => [r.id, r]));
  const note = m.note.trim();
  const reasons = v === "accepted" ? [] : o.grain === "part" && v === "rejected" ? [] : m.reasons.filter((r) => byId.has(r));
  const parts = v === "flagged" ? m.parts.filter((p) => byId.has(p.reason) && (o.grain !== "part" || p.label === o.part)) : [];
  const points = v === "flagged" ? m.points.filter((p) => byId.get(p.reason)?.needs === "point") : [];
  const used = [...reasons, ...parts.map((p) => p.reason), ...points.map((p) => p.reason)];
  const noted = used.map((r) => byId.get(r)).find((r) => r?.needs === "note");
  if (noted && !note) return { ok: false, needs: `${noted.words} needs a note: e.`, note: true };
  if (note.length > NOTE_MAX) return { ok: false, needs: `The note is at most ${NOTE_MAX.toLocaleString("en-US")} characters.`, note: true };
  if (points.length > POINTS_MAX) return { ok: false, needs: `At most ${POINTS_MAX} points.` };
  if (v === "flagged" && used.length === 0) return { ok: false, needs: "A flag needs a reason." };
  const form: Json = { reasons, parts: parts.map((p) => ({ label: p.label, reason: p.reason })), points: points.map((p) => ({ reason: p.reason, mm: p.mm.map((x) => Math.round(x * 100) / 100) })), seen: [...m.seen].sort((a, b) => a - b), shown: [...m.shown] };
  const body = { value: v, form, ...(note ? { why: note } : {}) } as Json & { value: Verdict; form: Json; why?: string };
  return { ok: true, value: v, body, words: answerWords(v, { parts: parts.length, points: points.length, reasons: reasons.length }) };
}

/** An answer in a few words: "flagged · 2 lesions, 1 point". */
export function answerWords(v: Verdict, n: { parts: number; points: number; reasons: number }, partWord = "part"): string {
  const bits = [n.parts > 0 ? `${n.parts} ${n.parts === 1 ? partWord : `${partWord}s`}` : "", n.points > 0 ? `${n.points} ${n.points === 1 ? "point" : "points"}` : "", n.reasons > 0 ? `${n.reasons} on the result` : ""].filter(Boolean);
  return bits.length > 0 && v !== "accepted" ? `${VERDICT_WORDS[v]} · ${bits.join(", ")}` : VERDICT_WORDS[v];
}

// ---------------------------------------------------------------- an answer in a table

/** A result's parts by label, as the parts door names them, for an answer in words. */
export interface PartNames {
  kind: SetKind | null;
  names: ReadonlyMap<number, string>;
}

/** The parts door read for names: the kind of the set, and each named part by its label. */
export function partNamesOf(raw: Json): PartNames {
  const kind = typeof raw.kind === "string" && KINDS.includes(raw.kind) ? (raw.kind as SetKind) : null;
  const names = new Map<number, string>();
  for (const p of Array.isArray(raw.parts) ? raw.parts : []) {
    const o = p && typeof p === "object" ? (p as Json) : {};
    const label = num(o.label);
    const name = str(o.name);
    if (label !== null && name) names.set(label, name);
  }
  return { kind, names };
}

/** A part in a word or two: a structure by its name, a lesion by its number bottom up, else its label. */
export function partName(label: number, p: PartNames | null = null): string {
  const name = p?.names.get(label);
  if (name) return name;
  return p?.kind === "components" ? `lesion ${label}` : p?.kind === "labels" ? `structure ${label}` : `part ${label}`;
}

/**
 * The reasons one text gives: a reason id, or the reasons of a part several
 * raters flagged for different reasons, which the engine joins with ", " in
 * an outcome's part, in the part's status (`check_reason`) and in its
 * decision's why ("under, not_lesion"). Reason ids hold no comma, so the
 * join reads back whole: each reason once, in its order.
 */
export function reasonsIn(text: string | null | undefined): string[] {
  const out: string[] = [];
  for (const r of (text ?? "").split(",")) {
    const id = r.trim();
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

/**
 * A check's answer, or an item's outcome, in a few words for the campaign's
 * table: the verdict, then each reason with what it is on, the parts by name;
 * a part an outcome joined several reasons on is named under each of them.
 * "flagged · Boundary off: Left-Hippocampus, Right-Thalamus · Missed lesion: 2 points".
 */
export function checkAnswerLine(value: unknown, form: unknown, reasons: readonly Reason[], parts: PartNames | null = null): string {
  const f = formOf(form);
  const words = (id: string) => reasons.find((r) => r.id === id)?.words ?? id;
  const on = new Map<string, number[]>();
  for (const p of f.parts)
    for (const r of reasonsIn(p.reason)) {
      const labels = on.get(r) ?? [];
      if (!labels.includes(p.label)) on.set(r, [...labels, p.label]);
    }
  const points = new Map<string, number>();
  for (const p of f.points) points.set(p.reason, (points.get(p.reason) ?? 0) + 1);
  const verdict = typeof value === "string" ? ((VERDICTS as readonly string[]).includes(value) ? VERDICT_WORDS[value as Verdict] : value) : "";
  return [
    verdict,
    ...f.reasons.map(words),
    ...[...on].map(([r, labels]) => `${words(r)}: ${labels.map((l) => partName(l, parts)).join(", ")}`),
    ...[...points].map(([r, n]) => `${words(r)}: ${n} ${n === 1 ? "point" : "points"}`),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Whether a check's answer or outcome flags any part, so its names are worth reading. */
export const flagsParts = (form: unknown): boolean => formOf(form).parts.length > 0;

/** The decisions a closed check's item wrote: the result's, and how many on its parts. */
export function checkDecisionsWords(d: unknown): string {
  const o = d && typeof d === "object" && !Array.isArray(d) ? (d as Json) : {};
  const result = num(o.result);
  const parts = o.parts && typeof o.parts === "object" && !Array.isArray(o.parts) ? Object.keys(o.parts).length : 0;
  return [result !== null ? `decision ${result}` : "", parts > 0 ? `${parts} ${parts === 1 ? "part decision" : "part decisions"}` : ""].filter(Boolean).join(" · ");
}

// ---------------------------------------------------------------- the keys

/** What a key of the check's own does; the rest are the comparison reader's (compare.ts, `compareKey`). */
export type CheckAct = { kind: "next" } | { kind: "previous" } | { kind: "whole" } | { kind: "clear" } | { kind: "note" } | { kind: "cancel" };

/**
 * A key of a check's own (section 10.3): `n` and `p` the next and previous
 * part, `r` the whole result again, Backspace clears, `e` the note, Escape
 * calls off a point being placed. None of them is a key `compareKey` takes,
 * nor the mask's (`o`, `f`, `[`, `]`), nor the pictures' (the arrows, Page
 * Up and Down, Space).
 */
export function checkKey(key: string, o: { inField: boolean; modifier?: boolean; placing?: boolean }): CheckAct | null {
  if (o.inField || o.modifier) return null;
  if (key === "n") return { kind: "next" };
  if (key === "p") return { kind: "previous" };
  if (key === "r") return { kind: "whole" };
  if (key === "Backspace") return { kind: "clear" };
  if (key === "e") return { kind: "note" };
  if (key === "Escape" && o.placing) return { kind: "cancel" };
  return null;
}

/** The answer keys: 1 accept, 2 reject, then each reason on 3 to 9. */
export function answerKeys(reasons: readonly Reason[], grain: "result" | "part", partWord = "lesion"): { key: string; id: string; words: string; needs: Needs }[] {
  return [
    { key: "1", id: "accepted", words: grain === "part" ? `Good ${partWord}` : "Accept", needs: "none" as Needs },
    { key: "2", id: "rejected", words: grain === "part" ? `Not a ${partWord}` : "Reject", needs: "none" as Needs },
    ...reasons.slice(0, REASONS_MAX).map((r, i) => ({ key: String(i + 3), id: r.id, words: r.words, needs: r.needs })),
  ];
}

/** The part after (or before) the one in focus, in the order shown; the first (or last) from the whole result. */
export function stepPart(order: readonly number[], at: number | null, delta: 1 | -1): number | null {
  if (order.length === 0) return null;
  const i = at === null ? -1 : order.indexOf(at);
  if (i < 0) return delta > 0 ? order[0] : order[order.length - 1];
  const j = i + delta;
  return j < 0 || j >= order.length ? order[i] : order[j];
}

/** The parts in the order the reader steps through them: bottom to top (the engine's), or the largest first. */
export function partOrder(parts: readonly Part[], by: "position" | "size"): number[] {
  const list = [...parts];
  if (by === "size") list.sort((a, b) => b.volumeMm3 - a.volumeMm3 || a.position - b.position);
  else list.sort((a, b) => a.position - b.position);
  return list.map((p) => p.label);
}

/** The part a click lands in: the one whose box holds the point, the nearest anchor first; null outside every box. */
export function partAt(parts: readonly Part[], p: Vec3, slack = 1): Part | null {
  let best: Part | null = null;
  let bestD = Infinity;
  for (const x of parts) {
    const [a, b] = x.box;
    const inside = [0, 1, 2].every((i) => p[i] >= Math.min(a[i], b[i]) - slack && p[i] <= Math.max(a[i], b[i]) + slack);
    if (!inside) continue;
    const d = Math.hypot(p[0] - x.anchor[0], p[1] - x.anchor[1], p[2] - x.anchor[2]);
    if (d < bestD) {
      best = x;
      bestD = d;
    }
  }
  return best;
}

// ---------------------------------------------------------------- words and layout

/** A part's word by the kind of its set: lesion, structure. */
export function partWord(kind: SetKind): string {
  return kind === "labels" ? "structure" : "lesion";
}

/** A volume in millilitres, to two places, three for a small one. */
export function mlWords(mm3: number): string {
  const ml = mm3 / 1000;
  return `${ml.toFixed(ml < 0.1 ? 3 : 2)} ml`;
}

/** The part strip: "Lesion 3 of 14 · 0.21 ml", a structure by its name, or "Whole result". */
export function stripWords(s: Pick<CheckSheet, "set" | "parts">, focus: Part | null): string {
  if (!focus) return s.set.kind === "whole" ? "Whole result" : `Whole result · ${s.set.count.toLocaleString("en-US")} ${s.set.count === 1 ? partWord(s.set.kind) : `${partWord(s.set.kind)}s`}`;
  const word = partWord(s.set.kind);
  const at = s.parts.findIndex((p) => p.label === focus.label);
  const name = s.set.kind === "labels" && focus.name ? focus.name : `${word.charAt(0).toUpperCase()}${word.slice(1)} ${at >= 0 ? at + 1 : focus.label} of ${s.set.count.toLocaleString("en-US")}`;
  return `${name} · ${mlWords(focus.volumeMm3)}`;
}

/** An item in words, by its place in the campaign: never a file, a scan or a day. */
export const checkItemWords = (i: { position: number }): string => `result ${i.position + 1}`;

/** The grid the panels lie in, by their count (section 5.4): 1 by 2, 1 by 3, 2 by 2, 2 by 3, 2 by 4. */
export function gridOf(n: number): { rows: number; cols: number } {
  if (n <= 1) return { rows: 1, cols: 1 };
  if (n <= 3) return { rows: 1, cols: n };
  if (n === 4) return { rows: 2, cols: 2 };
  if (n <= 6) return { rows: 2, cols: 3 };
  return { rows: 2, cols: 4 };
}

/** A status's tag: accepted in the ok colours, rejected in the blocked, flagged in the caution, not checked neutral. */
export function checkTag(status: string | null | undefined): { words: string; className: string } {
  if (status === "accepted") return { words: "accepted", className: "tag ok" };
  if (status === "rejected") return { words: "rejected", className: "tag blocked" };
  if (status === "flagged") return { words: "flagged", className: "tag caution" };
  return { words: "not checked", className: "tag" };
}

/** The counts by verdict, as the campaign page's line: "300 accepted · 4 rejected · 34 flagged". */
export function verdictLine(v: Record<string, number>): string {
  const bits = VERDICTS.filter((k) => (v[k] ?? 0) > 0).map((k) => `${(v[k] ?? 0).toLocaleString("en-US")} ${VERDICT_WORDS[k]}`);
  return bits.length > 0 ? bits.join(" · ") : "nothing checked yet";
}

// ---------------------------------------------------------------- New check

/** Which of a run's results: those no check decided, all, those the run's checks flagged, or a sample. */
export type Which = "unchecked" | "all" | "breached" | "sample";

/** A mask output of a pipeline and the part sets it declares (none: the result whole). */
export interface MaskOutput {
  id: string;
  sets: { key: string; words: string; kind: SetKind }[];
}

/** The mask outputs of a pipeline as the catalog names them (`outputs` from x-nils), each with its part sets. */
export function maskOutputs(outputs: unknown): MaskOutput[] {
  if (!Array.isArray(outputs)) return [];
  const out: MaskOutput[] = [];
  for (const x of outputs) {
    if (!x || typeof x !== "object") continue;
    const o = x as Json;
    if (o.kind !== "mask" || typeof o.id !== "string") continue;
    const sets = Array.isArray(o.parts)
      ? o.parts.flatMap((p) => {
          if (!p || typeof p !== "object") return [];
          const s = p as Json;
          if (typeof s.key !== "string") return [];
          return [{ key: s.key, words: typeof s.words === "string" && s.words ? s.words : s.key, kind: (s.kind === "labels" ? "labels" : "components") as SetKind }];
        })
      : [];
    out.push({ id: o.id, sets: sets.length > 0 ? sets : [{ key: "whole", words: "Whole result", kind: "whole" }] });
  }
  return out;
}

/** What the New check dialog holds. */
export interface CheckDraft {
  run: number | null;
  pipeline: string;
  output: string;
  setKey: string;
  setWords: string;
  setKind: SetKind;
  grain: "result" | "part";
  which: Which;
  sample: number;
  /** The roles beside the made-on scan, in order. */
  roles: string[];
  reasons: Reason[];
  /** Who rates: principals; the maker is among them by default. */
  raters: string[];
  perItem: 1 | 2;
  name: string;
}

/** The roles beside the made-on scan by default (section 5). */
export const DEFAULT_ROLES = ["t1w", "flair"];

/** The roles the dialog offers by default, beside any the pack names. */
export const OFFERED_ROLES = ["t1w", "flair", "t2w"];

/** A role's word on a panel or a key. */
export function roleWord(role: string): string {
  const known: Record<string, string> = { made_on: "made on", t1w: "T1w", t2w: "T2w", flair: "FLAIR", pd: "PD", pdw: "PD", swi: "SWI", dwi: "DWI" };
  return known[role] ?? role;
}

/** The name the dialog fills: "SAMSEG lesions, run 77". */
export function checkNameOf(pipeline: string, setWords: string, run: number | null): string {
  const tool = pipeline.replace(/[-_](lesions?|segmentation|seg)$/iu, "").replace(/[-_]+/gu, " ").trim();
  const head = tool.length <= 8 ? tool.toUpperCase() : tool;
  const what = setWords && setWords !== "Whole result" ? ` ${setWords.toLowerCase()}` : "";
  return `${head}${what}${run !== null ? `, run ${run}` : ""}`.trim();
}

/** The source part of a body: a run's output, which of its results, and a sample's size. */
export function sourceOf(d: Pick<CheckDraft, "run" | "output" | "which" | "sample">): Json {
  if (d.run === null) return {};
  return d.which === "sample" ? { run: d.run, output: d.output, which: "unchecked", sample: Math.max(1, Math.floor(d.sample)) } : { run: d.run, output: d.output, which: d.which };
}

/** The make body the dialog sends (section 8.3); the preview takes the same. */
export function checkBody(d: CheckDraft): { ok: true; body: Json } | { ok: false; needs: string } {
  if (d.run === null || !d.output) return { ok: false, needs: "a run that made masks" };
  if (!d.name.trim()) return { ok: false, needs: "a name" };
  if (d.reasons.length === 0) return { ok: false, needs: "at least one answer beside accept and reject" };
  if (d.reasons.length > REASONS_MAX) return { ok: false, needs: `at most ${REASONS_MAX} reasons` };
  for (const r of d.reasons) {
    if (!/^[a-z_]{1,24}$/u.test(r.id)) return { ok: false, needs: `a plain id for ${r.words || "a reason"}` };
    if (!r.words.trim() || r.words.length > WORDS_MAX) return { ok: false, needs: `words of at most ${WORDS_MAX} characters for ${r.id}` };
  }
  if (new Set(d.reasons.map((r) => r.id)).size !== d.reasons.length) return { ok: false, needs: "each reason once" };
  if (d.roles.length + 1 > PANELS_MAX) return { ok: false, needs: `at most ${PANELS_MAX} scans` };
  if (d.grain === "part" && d.setKind !== "components") return { ok: false, needs: "one item per result: a part is a lesion" };
  if (d.which === "sample" && !(d.sample >= 1)) return { ok: false, needs: "a sample of at least one" };
  const raters = [...new Set(d.raters.filter(Boolean))];
  return {
    ok: true,
    body: {
      name: d.name.trim(),
      question: { kind: "check", part_set: d.setKey, grain: d.grain, reasons: d.reasons.map((r) => ({ id: r.id, words: r.words.trim(), needs: r.needs })) },
      source: sourceOf(d),
      panels: ["made_on", ...d.roles],
      raters,
      raters_per_item: Math.min(d.perItem, Math.max(1, raters.length)),
      closes_into: "check",
    },
  };
}

/** A reason's id from its words, for one the person adds: "Partly hidden" is partly_hidden. */
export function reasonIdOf(words: string, taken: readonly string[]): string {
  const base = words.toLowerCase().replace(/[^a-z]+/gu, "_").replace(/^_+|_+$/gu, "").slice(0, 20) || "reason";
  let id = base;
  for (let i = 2; taken.includes(id); i++) id = `${base.slice(0, 20)}_${"abcdefghij"[(i - 2) % 10]}`;
  return id;
}

/** The foot's line from the preview: "338 results · 2,140 lesions · 3 scans each". */
export function previewLine(p: Preview, setKind: SetKind, grain: "result" | "part"): string {
  const n = (v: number) => v.toLocaleString("en-US");
  const bits = [`${n(p.drawable)} ${p.drawable === 1 ? "result" : "results"}`];
  if (setKind !== "whole") bits.push(`${n(p.parts)} ${p.parts === 1 ? partWord(setKind) : `${partWord(setKind)}s`}`);
  if (grain === "part") bits.push(`${n(p.items)} ${p.items === 1 ? "item" : "items"}`);
  const most = p.panels.most;
  const fewest = p.panels.fewest;
  if (most !== null) bits.push(fewest !== null && fewest !== most ? `${fewest} to ${most} scans each` : `${most} ${most === 1 ? "scan" : "scans"} each`);
  return bits.join(" · ");
}

/** What the preview leaves out, each as a short tag with its why on hover. */
export function leftOutTags(p: Preview): { words: string; why: string }[] {
  const n = (v: number) => v.toLocaleString("en-US");
  const out: { words: string; why: string }[] = [];
  if (p.leftOutSealed > 0) out.push({ words: `${n(p.leftOutSealed)} left out: sealed for certification`, why: "made from a scan of a sample sealed for certification; a check never holds one until a certificate unseals it" });
  const cant = p.notDrawable.reduce((a, x) => a + x.count, 0);
  if (cant > 0) out.push({ words: `${n(cant)} can't be drawn`, why: p.notDrawable.map((x) => `${n(x.count)}: ${x.why}`).join("; ") });
  if (p.held > 0) out.push({ words: `${n(p.held)} in another check`, why: "an open check holds them; it decides them" });
  if (p.partsPending > 0) out.push({ words: `${n(p.partsPending)} being read`, why: "their parts are being read; the check is made once they are" });
  const missing = Object.entries(p.panelsMissing).filter(([, c]) => c > 0);
  if (missing.length > 0) out.push({ words: missing.map(([r, c]) => `${roleWord(r)} missing for ${n(c)}`).join(" · "), why: "a visit without that main scan shows one panel fewer" });
  return out;
}

/**
 * The linked point moved to a panel's plane z, as the wheel pages it: along
 * that panel's normal only, so the other panels follow it to the same place
 * in the patient whatever their own planes. With no point yet, the middle
 * of the plane.
 */
export function pointOnSlice(m: Manifest, p: Vec3 | null, z: number): Vec3 {
  const g = geometry(m);
  const q = planePosition(g, m.spacing, 0, z);
  if (!p) {
    const [, ny, nx] = m.shape;
    const [, dy, dx] = m.spacing;
    return [0, 1, 2].map((i) => q[i] + g.row[i] * ((nx - 1) * dx) / 2 + g.col[i] * ((ny - 1) * dy) / 2) as Vec3;
  }
  const d = dot([q[0] - p[0], q[1] - p[1], q[2] - p[2]], g.normal);
  return [p[0] + g.normal[0] * d, p[1] + g.normal[1] * d, p[2] + g.normal[2] * d];
}

/** The rows of the New check by the body's fields, so a refusal names the row it is about. */
const ROWS: [RegExp, string][] = [
  [/^source\.(which|sample|seed)\b/u, "Results"],
  [/^source\.output\b/u, "Look at"],
  [/^source\b/u, "Results"],
  [/^question\.part_set\b/u, "Look at"],
  [/^question\.grain\b/u, "One item per"],
  [/^question\.reasons\b/u, "Answers"],
  [/^panels\b/u, "Beside it"],
  [/^raters\b/u, "Who"],
];

/** An engine's refusal of a check's body in the dialog's words: the row it is about, then what the engine said of it. */
export function refusalWords(text: string): string {
  const t = text.trim();
  for (const [re, row] of ROWS) {
    if (!re.test(t)) continue;
    const said = t.replace(/^[a-z_.]+:\s*/u, "");
    return `${row}: ${said.charAt(0).toLowerCase()}${said.slice(1)}`;
  }
  return t;
}
