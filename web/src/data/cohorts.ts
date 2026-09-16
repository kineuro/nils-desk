// SPDX-License-Identifier: AGPL-3.0-only
// Cohorts: a cohort is a membership and nothing else. Make one, rename it,
// retire it, add or take out whom you like; every join and leave is recorded
// with what brought it: a dataset fed it, a query promoted it, a hand did it.
// The doors the desk reads and writes them through, the releases beside them,
// and the words and points the pages draw from what the doors answer.

import { door, type Json } from "../ask/client";
import { pastedList } from "../ask/start";
import type { ReleaseRow } from "../ops/client";
import { whenWords, type Source } from "./sources";

const n = (v: number) => v.toLocaleString("en-US");

/** How a cohort came to be and how its members join: a dataset feeds it, a query promoted them, a hand added them, or a clinical import filed them. */
export type Origin = "source" | "promotion" | "manual" | "import";

/** What the origin names: the dataset, the card with its version, who did it by hand, or the file imported. */
export interface ProvenanceDetail {
  place?: string;
  card?: string;
  document?: number;
  version?: number;
  handle?: number;
  by?: string;
  subjects?: number;
  file?: string;
}

export interface Provenance {
  kind: Origin;
  detail: ProvenanceDetail | string | null;
}

/** A cohort as the cohorts door lists it. */
export interface Cohort {
  name: string;
  owner: string | null;
  description: string | null;
  subjects: number;
  sessions: number;
  stacks: number;
  /** The datasets whose digests feed it. */
  feeds: string[];
  from: Provenance;
  /** Stacks of its members still waiting on Review. */
  waiting: number;
  /** How many releases were made of it. */
  releases: number;
  created_at: string;
  last_joined: string | null;
  retired_at: string | null;
}

/** One event of a cohort's membership log: who joined or left at once, what brought them, and what did it. */
export interface Join {
  when: string;
  /** What brought them, in words: the batch of a dataset, the card promoted, a hand's reason. */
  what: string;
  /** How many joined, or left when `left` is set. */
  subjects: number;
  by: string;
  left?: boolean;
  batch?: number | null;
  handle?: number | null;
  actor?: string | null;
}

/** A dataset holding files of a cohort's subjects, whether it feeds the cohort or merely holds some of its people. */
export interface SourceHolding {
  name: string;
  subjects: number;
  feeds: boolean;
  arrives?: string;
  batches?: number;
}

export interface CohortRelease {
  id?: number;
  name: string;
  version?: string;
  layout: string | null;
  subjects: number | null;
  started_at?: string | null;
  handed_over?: string | null;
  withdrawn_at?: string | null;
}

/** A cohort as its own door answers it: the list row, its membership log, the datasets holding its people and its releases. */
export interface CohortDetail extends Omit<Cohort, "releases"> {
  joins: Join[];
  sources_holding: SourceHolding[];
  releases: CohortRelease[];
}

/** A cohort without its release count: what the list row and the cohort's own door share. */
export type CohortHead = Omit<Cohort, "releases">;

export interface MembersBody {
  add: string[];
  remove: string[];
  why: string;
}

/** A release as the releases door lists it, with what record 26 adds: how each dataset's files left, the sessions, and whether it was handed over. */
export interface Release extends ReleaseRow {
  actor?: string | null;
  withdrawn_at?: string | null;
  withdrawn_by?: string | null;
  withdrawn_why?: string | null;
  sessions?: number | null;
  dates?: string | null;
  uids?: string | null;
  handed_over?: string | null;
  policies?: { dataset: string; dates: string; uids: string }[];
}

/** What a selection reaches, from the select door, without anything written. */
export interface Selected {
  items?: { item: unknown; how: string }[];
  selection?: Json;
  unresolved?: { item: unknown; why: string }[];
  reaches: { subjects: number; studies?: number; stacks: number; files?: number; bytes?: number };
}

export const cohorts = {
  list: () => door<Cohort[] | { cohorts: Cohort[] }>("GET", "/api/cohorts").then((r) => (Array.isArray(r) ? r : (r.cohorts ?? []))),
  get: (name: string) => door<CohortDetail>("GET", `/api/cohorts/${encodeURIComponent(name)}`),
  make: (body: { name: string; owner?: string; description?: string }) => door<Cohort>("POST", "/api/cohorts", body),
  set: (name: string, body: { name?: string; owner?: string; description?: string; retired?: boolean }) => door<Cohort>("PUT", `/api/cohorts/${encodeURIComponent(name)}`, body),
  members: (name: string, body: MembersBody) => door<Json>("POST", `/api/cohorts/${encodeURIComponent(name)}/members`, body),
  /** A card's answer becomes members, at any grain: the subjects of its rows join. */
  promote: (handle: number, body: { cohort: string; create: boolean; reason?: string }) => door<{ job: number; state: string }>("POST", `/api/ask/handles/${handle}/promote`, body),
};

export const releases = {
  list: (limit = 50) => door<{ count: number; releases: Release[] }>("GET", `/api/releases?limit=${limit}`),
  make: (body: Json) => door<{ job: number; state: string; command?: string[] }>("POST", "/api/releases", body),
  select: (body: Json) => door<Selected>("POST", "/api/select", body),
};

export type Tone = "brand" | "caution" | "ok" | "neutral";

const DAY = 24 * 60 * 60 * 1000;

function within(iso: string | null, ms: number, now: number): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && now - t < ms && now - t >= -ms;
}

/** What a cohort's card says first: what waits on Review, that it is empty, that it is new, or that it is sorted. */
export function cohortState(c: CohortHead, now = Date.now()): { words: string; tone: Tone; check?: boolean } {
  if (c.retired_at) return { words: "retired", tone: "neutral" };
  if (c.waiting > 0) return { words: `${n(c.waiting)} wait`, tone: "caution" };
  if (c.subjects === 0) return { words: "empty", tone: "neutral" };
  if (within(c.created_at, DAY, now)) return { words: "new", tone: "brand" };
  return { words: "sorted", tone: "ok", check: true };
}

const detailOf = (p: Provenance): ProvenanceDetail => (typeof p.detail === "string" ? { place: p.detail, card: p.detail, by: p.detail, file: p.detail } : (p.detail ?? {}));

export interface ProvenanceLine {
  icon: "folder" | "search" | "pencil" | "file";
  lead: string;
  /** What is named in bold, when something is. */
  name: string | null;
  tail: string;
}

/** The provenance line of a cohort's card: what made it and what it named, and when it last moved. */
export function provenanceLine(c: CohortHead, now = new Date()): ProvenanceLine {
  const d = detailOf(c.from);
  const since = whenWords(c.created_at, now);
  switch (c.from.kind) {
    case "source":
      return { icon: "folder", lead: "fed by the dataset", name: d.place ?? c.feeds[0] ?? null, tail: c.last_joined ? `last joined ${whenWords(c.last_joined, now)}` : "nothing read yet" };
    case "promotion":
      return { icon: "search", lead: "promoted from the card", name: d.card ?? (d.document !== undefined ? `document ${d.document}` : null), tail: [d.version !== undefined ? `v${d.version}` : null, since].filter(Boolean).join(" · ") };
    case "manual":
      return { icon: "pencil", lead: "by hand", name: d.by ?? c.owner, tail: [d.subjects !== undefined ? `${n(d.subjects)} subjects from a list` : null, since].filter(Boolean).join(" · ") };
    case "import":
      return { icon: "file", lead: "from a clinical import", name: d.file ?? null, tail: since };
  }
}

/** The provenance line as one string, for a title or a test. */
export function provenanceWords(c: CohortHead, now = new Date()): string {
  const p = provenanceLine(c, now);
  return [p.lead, p.name].filter(Boolean).join(" ") + (p.tail ? ` · ${p.tail}` : "");
}

/** The card's last line: its releases, its owner, since when; an empty cohort says what fills it. */
export function metaWords(c: Cohort, now = new Date()): string {
  const d = detailOf(c.from);
  if (c.subjects === 0 && c.from.kind === "source") return `fills when ${d.place ?? c.feeds[0] ?? "its dataset"} is digested`;
  const parts = [c.releases === 0 ? "no release yet" : `${c.releases} ${c.releases === 1 ? "release" : "releases"}`];
  if (c.owner) parts.push(`owner ${c.owner}`);
  parts.push(`since ${whenWords(c.created_at, now)}`);
  return parts.join(" · ");
}

/** A cohort page's lede: how it came to be, whose it is, how its members join. */
export function ledeWords(c: CohortHead, now = new Date()): string {
  const d = detailOf(c.from);
  const owner = c.owner ? ` Owner ${c.owner}.` : "";
  const when = whenWords(c.created_at, now);
  const retired = c.retired_at ? ` Retired ${whenWords(c.retired_at, now)}: its members and history stay.` : "";
  switch (c.from.kind) {
    case "source":
      return `Fed by the dataset ${d.place ?? c.feeds[0] ?? "it names"} since ${when}.${owner} Every subject a digest of that folder brings in joins here.${retired}`;
    case "promotion":
      return `Promoted from the card ${d.card ?? "it names"}${d.version !== undefined ? ` v${d.version}` : ""} on ${when}.${owner} The card keeps its version and epoch on every membership.${retired}`;
    case "manual":
      return `Made by hand${d.by ? ` by ${d.by}` : ""} on ${when}.${owner} Members are added and taken out with a reason.${retired}`;
    case "import":
      return `From a clinical import${d.file ? ` of ${d.file}` : ""} on ${when}.${owner}${retired}`;
  }
}

/** A join's signed count: how many the event added, negative when they left. */
export const delta = (j: Join): number => (j.left || j.subjects < 0 ? -Math.abs(j.subjects) : j.subjects);

export interface StepPoint {
  x: number;
  y: number;
  total: number;
  when: string;
  delta: number;
}

export interface StepChart {
  points: StepPoint[];
  /** The step line's points, oldest first, ending at today. */
  line: string;
  /** The area under it, closed on the axis. */
  area: string;
  end: { x: number; y: number };
  width: number;
  height: number;
  base: number;
}

/**
 * Members over time as a step chart: each join adds its subjects and each
 * leave takes them away, oldest first, the steps spaced evenly and the last
 * one carried to today. Drawn in a box of `width` by `height`, the axis at
 * `base`; null when nothing has joined yet.
 */
export function stepChart(joins: Join[], width = 640, height = 120): StepChart | null {
  const ordered = [...joins].filter((j) => Number.isFinite(Date.parse(j.when))).sort((a, b) => Date.parse(a.when) - Date.parse(b.when));
  if (ordered.length === 0) return null;
  const left = 60;
  const right = width - 100;
  const today = width - 40;
  const top = 5;
  const base = height - 20;
  let total = 0;
  const totals = ordered.map((j) => (total = Math.max(0, total + delta(j))));
  const most = Math.max(1, ...totals);
  const step = ordered.length > 1 ? (right - left) / (ordered.length - 1) : 0;
  const r = (v: number) => Math.round(v * 10) / 10;
  const points: StepPoint[] = ordered.map((j, i) => ({ x: r(left + i * step), y: r(base - (totals[i] / most) * (base - top)), total: totals[i], when: j.when, delta: delta(j) }));
  const line: string[] = [];
  points.forEach((p, i) => {
    if (i > 0) line.push(`${p.x},${points[i - 1].y}`);
    line.push(`${p.x},${p.y}`);
  });
  const last = points[points.length - 1];
  line.push(`${today},${last.y}`);
  return { points, line: line.join(" "), area: `${points[0].x},${base} ${line.join(" ")} ${today},${base}`, end: { x: today, y: last.y }, width, height, base };
}

/** A label under or above the step chart: a step's date with its members, or "today" at the end. */
export interface ChartLabel {
  kind: "step" | "today";
  x: number;
  y: number;
  total: number;
  words: string;
  anchor: "start" | "end";
}

/** About how wide a label draws in the chart's units at the face the chart sets: six a character. */
const LABEL_CHAR = 6;

/**
 * The labels of a step chart, thinned so that no two draw within `gap` of
 * each other and none over another: the first and the last step always, the
 * steps between them that keep their distance from both, and "today" at
 * the end only where it clears the last label. A step's members are written
 * above the same steps.
 */
export function chartLabels(chart: StepChart, now = new Date(), gap = 60): ChartLabel[] {
  const pts = chart.points;
  if (pts.length === 0) return [];
  const label = (p: StepPoint, i: number): ChartLabel => ({ kind: "step", x: p.x, y: p.y, total: p.total, words: i === 0 && p.delta > 0 ? `${whenWords(p.when, now)} · first` : whenWords(p.when, now), anchor: "start" });
  const width = (l: ChartLabel) => l.words.length * LABEL_CHAR;
  // b stands clear of a when it starts at least the gap after a, and past a's words
  const clears = (a: ChartLabel, b: ChartLabel) => b.x - a.x >= gap && b.x >= a.x + width(a) + 8;
  const out: ChartLabel[] = [label(pts[0], 0)];
  const last = pts.length > 1 ? label(pts[pts.length - 1], pts.length - 1) : null;
  for (let i = 1; i < pts.length - 1; i++) {
    const l = label(pts[i], i);
    if (last && clears(out[out.length - 1], l) && clears(l, last)) out.push(l);
  }
  if (last) {
    // the last step is always named; a step too near it gives way, the first never
    while (out.length > 1 && !clears(out[out.length - 1], last)) out.pop();
    out.push(last);
  }
  const tail = out[out.length - 1];
  const today: ChartLabel = { kind: "today", x: chart.end.x, y: chart.end.y, total: tail.total, words: "today", anchor: "end" };
  if (chart.end.x - width(today) >= tail.x + width(tail) + 8 && chart.end.x - tail.x >= gap) out.push(today);
  return out;
}

/** The membership dialog's body: the codes pasted, added or taken out, and the reason recorded on every membership. */
export function membersBody(add: string, remove: string, why: string): { ok: true; body: MembersBody; summary: string } | { ok: false; why: string } {
  const adding = pastedList(add);
  const removing = pastedList(remove);
  if (adding.length === 0 && removing.length === 0) return { ok: false, why: "codes to add or take out, one per line" };
  const both = adding.filter((c) => removing.includes(c));
  if (both.length > 0) return { ok: false, why: `${both[0]} is both added and taken out` };
  if (!why.trim()) return { ok: false, why: "a reason; it is recorded on every membership" };
  const parts: string[] = [];
  if (adding.length > 0) parts.push(`${adding.length} added`);
  if (removing.length > 0) parts.push(`${removing.length} taken out`);
  return { ok: true, body: { add: adding, remove: removing, why: why.trim() }, summary: parts.join(", ") };
}

/** A release's suggested name: the cohort or card it is of, the day, and the next number of that day. */
export function suggestedName(base: string, existing: readonly { name: string }[], now = new Date()): string {
  const stem = base.trim().replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "").toLowerCase() || "release";
  const day = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}`;
  const prefix = `${stem}-${day}.`;
  const taken = existing.filter((r) => r.name.startsWith(prefix)).length;
  return `${prefix}${taken + 1}`;
}

export interface LeavingLine {
  dataset: string;
  words: string;
  note: string | null;
}

/** How files leave under a dataset's leaving policy, in words. */
export function leavingWords(h: Source["handling"] | null): string {
  if (!h) return "handling not read";
  const dates = h.on_release.dates === "shift" ? "dates shifted, one offset per subject" : h.on_release.dates === "year" ? "dates cut to the year" : "dates kept";
  const uids = h.on_release.uids === "remap" ? "UIDs remapped" : "UIDs kept";
  return [dates, uids, h.on_release.deface ? "faces removed" : "faces kept"].join(" · ");
}

/** One line per dataset holding files of the selection: how its files leave, read from its own handling, and why it is in the list. */
export function leavingLines(sources: readonly Source[], holding: readonly SourceHolding[] | null): LeavingLine[] {
  if (holding === null) return sources.map((s) => ({ dataset: s.name, words: leavingWords(s.handling), note: null }));
  return holding.map((h) => {
    const s = sources.find((x) => x.name === h.name) ?? null;
    return { dataset: h.name, words: leavingWords(s?.handling ?? null), note: h.feeds ? "the dataset's handling" : `${n(h.subjects)} ${h.subjects === 1 ? "subject has" : "subjects have"} files there too` };
  });
}

/** A release row's dates and UIDs policy, in a word each: from its own columns, else from the policies it recorded per dataset. */
export function policyWords(r: Release): { dates: string; uids: string } {
  const word = (v: string | null | undefined, kind: "dates" | "uids"): string | null => {
    if (!v) return null;
    if (kind === "dates") return v === "shift" ? "shifted" : v === "year" ? "to the year" : "kept";
    return v === "remap" ? "remapped" : "kept";
  };
  const fold = (kind: "dates" | "uids"): string => {
    const own = word(r[kind], kind);
    if (own) return own;
    const each = [...new Set((r.policies ?? []).map((p) => word(p[kind], kind)).filter((w): w is string => w !== null))];
    return each.length === 0 ? "" : each.join(", ");
  };
  return { dates: fold("dates"), uids: fold("uids") };
}

/** What a selection reaches, in one line. */
export function reachesWords(s: Selected, sizeWords: (bytes: number) => string): string {
  const r = s.reaches;
  const parts = [`${n(r.subjects)} subjects`];
  if (typeof r.studies === "number") parts.push(`${n(r.studies)} studies`);
  parts.push(`${n(r.stacks)} stacks`);
  if (typeof r.files === "number") parts.push(`${n(r.files)} files${typeof r.bytes === "number" ? ` (${sizeWords(r.bytes)})` : ""}`);
  const un = s.unresolved?.length ?? 0;
  return `Reaches ${parts.join(", ")}${un > 0 ? `; ${un} ${un === 1 ? "item" : "items"} could not be resolved` : ""}.`;
}
