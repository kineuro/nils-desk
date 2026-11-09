// SPDX-License-Identifier: AGPL-3.0-only
// The batch accept of a model's proposals (UX round 5, 2026-11-08): what a
// model left unsure is not read one by one. A person narrows the model's
// proposals on one axis by the value proposed and by the model's confidence,
// sees the scans densely, about five hundred at a time, sets only the wrong
// ones apart, and accepts the rest in one move, in their own name with the
// model's probability kept beside each decision. A set-apart scan the person
// can name takes its right value (UX round 6, item 4): 0 or the tile's
// corner opens the axis's value list once, the pick frames the tile in that
// value's colour, and the one Accept writes the model's value on the rest
// and the person's on the corrected, as corrections of the proposal. The
// rules' question grid (./questions.ts) is the seed: the same pictures, the
// same page shape, the same keys. Everything here is pure, so the page and
// its tests read one shape; the component is ProposalGrid.tsx.

import { door, DoorError, type JobRow, type Json } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";
import { href, narrow } from "../routes";
import { jobOver, sortedLine } from "./resort";

/** The doors, as the engine's capabilities name them. */
export const GRID_DOORS = {
  scans: "GET /api/review/proposals/scans",
  accept: "POST /api/review/proposals/accept",
} as const;

/** How many scans a page shows unless the person chooses otherwise, and the sizes offered. */
export const SIZE = 500;
export const SIZES = [250, 500, 1000] as const;

/** Whether the engine serves the grid and the person may read it. */
export function gridServed(caps: Capabilities): boolean {
  return served(caps, GRID_DOORS.scans) && may(caps, "review:see");
}

/** Whether the person may accept here. */
export function mayAccept(caps: Capabilities): boolean {
  return served(caps, GRID_DOORS.accept) && may(caps, "review:work");
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const obj = (v: unknown): Json | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null);
const nf = (v: number) => v.toLocaleString("en-US");

/** One scan of the grid as it draws it. */
export interface GScan {
  stack: number;
  item: number | null;
  /** The value the model proposes, and its probability of it. */
  proposed: string;
  probability: number;
  status: "open" | "staged";
  run: number | null;
  /** The value the sort holds on the axis now; null for none. */
  now: string | null;
  /** A person's decision is in force on it: the accept keeps that. */
  decided: boolean;
  subject: { id: number; code: string | null } | null;
  session: { id: number; label: string | null } | null;
  day: string | null;
  description: string | null;
  name: string | null;
  bids: string | null;
  axes: Record<string, string>;
  /** The middle plane as a data URL, where the engine sent one. */
  picture: string | null;
  partial: boolean;
}

/** One value's count in the band, for a chip. */
export interface ValueCount {
  value: string;
  count: number;
}

/** One band of the histogram. */
export interface Band {
  from: number;
  to: number;
  count: number;
}

export interface GPage {
  model: { id: number; name: string; version: string };
  /** name@version. */
  label: string;
  axis: string;
  /** The value the page was narrowed to; null for every value. */
  value: string | null;
  min: number | null;
  max: number | null;
  threshold: number | null;
  /** The model's whole range of probabilities on the axis; null where nothing waits. */
  range: { low: number; high: number } | null;
  values: ValueCount[];
  bands: Band[];
  total: number;
  page: number;
  pages: number;
  size: number;
  /** Scans an open campaign asks, left out. */
  asked: number;
  withheldSealed: number;
  pictures: { shown: boolean; why: string | null } | null;
  /** The axis's legal values from the served pack; empty on an engine before them, and then no correction is offered. */
  legal: string[];
  scans: GScan[];
}

/** What the accept door did. */
export interface Accepted {
  axis: string;
  value: string;
  decided: number;
  /** Scans written with the person's value in place of the model's. */
  corrected: number;
  decisions: { stack: number; decision: number }[];
  closed: number[];
  leftInItems: number;
  keptDecided: number;
  leftOutSealed: number;
  setApart: number;
  resort: { job: number | null; state: string; stacks: number } | null;
}

function scanOf(raw: Json): GScan | null {
  const stack = num(raw.stack);
  const proposed = str(raw.proposed);
  if (stack === null || proposed === null) return null;
  const subject = obj(raw.subject);
  const session = obj(raw.session);
  const picture = obj(raw.picture);
  const axes: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj(raw.axes) ?? {})) if (typeof v === "string" && v !== "") axes[k] = v;
  return {
    stack,
    item: num(raw.item),
    proposed,
    probability: num(raw.probability) ?? 0,
    status: raw.status === "staged" ? "staged" : "open",
    run: num(raw.run),
    now: str(raw.now),
    decided: raw.decided === true,
    subject: subject && num(subject.id) !== null ? { id: subject.id as number, code: str(subject.code) } : null,
    session: session && num(session.id) !== null ? { id: session.id as number, label: str(session.label) } : null,
    day: str(raw.day),
    description: str(raw.series_description),
    name: str(raw.name),
    bids: str(raw.bids),
    axes,
    picture: picture && str(picture.data) ? (picture.data as string) : null,
    partial: picture?.partial === true,
  };
}

/** The scans door's answer, read into one shape whatever it left out. */
export function pageOf(raw: Json): GPage {
  const model = obj(raw.model) ?? {};
  const id = num(model.id) ?? 0;
  const name = str(model.name) ?? String(id);
  const version = str(model.version) ?? "";
  const range = obj(raw.range);
  const pictures = obj(raw.pictures);
  const scans = (Array.isArray(raw.scans) ? (raw.scans as Json[]) : []).map(scanOf).filter((s): s is GScan => s !== null);
  return {
    model: { id, name, version },
    label: str(raw.label) ?? (version ? `${name}@${version}` : name),
    axis: str(raw.axis) ?? "",
    value: str(raw.value),
    min: num(raw.min),
    max: num(raw.max),
    threshold: num(raw.threshold),
    range: range && num(range.low) !== null && num(range.high) !== null ? { low: range.low as number, high: range.high as number } : null,
    values: (Array.isArray(raw.values) ? (raw.values as Json[]) : []).flatMap((v) => (str(v.value) ? [{ value: v.value as string, count: num(v.count) ?? 0 }] : [])),
    bands: (Array.isArray(raw.bands) ? (raw.bands as Json[]) : []).flatMap((b) => (num(b.from) !== null && num(b.to) !== null ? [{ from: b.from as number, to: b.to as number, count: num(b.count) ?? 0 }] : [])),
    total: num(raw.total) ?? scans.length,
    page: num(raw.page) ?? 1,
    pages: num(raw.pages) ?? 1,
    size: num(raw.size) ?? SIZE,
    asked: num(raw.asked) ?? 0,
    withheldSealed: num(raw.withheld_sealed) ?? 0,
    pictures: pictures ? { shown: pictures.shown === true, why: str(pictures.why) } : null,
    legal: Array.isArray(raw.legal) ? raw.legal.filter((v): v is string => typeof v === "string" && v !== "") : [],
    scans,
  };
}

/** The accept door's reply, read into one shape. */
export function acceptedOf(raw: Json): Accepted {
  const resort = obj(raw.resort);
  return {
    axis: str(raw.axis) ?? "",
    value: str(raw.value) ?? "",
    decided: num(raw.decided) ?? 0,
    corrected: num(raw.corrected) ?? 0,
    decisions: (Array.isArray(raw.decisions) ? (raw.decisions as Json[]) : []).flatMap((d) => (num(d.stack) !== null ? [{ stack: d.stack as number, decision: num(d.decision) ?? 0 }] : [])),
    closed: Array.isArray(raw.closed) ? raw.closed.filter((c): c is number => typeof c === "number") : [],
    leftInItems: num(raw.left_in_items) ?? 0,
    keptDecided: num(raw.kept_decided) ?? 0,
    leftOutSealed: num(raw.left_out_sealed) ?? 0,
    setApart: num(raw.set_apart) ?? 0,
    resort: resort ? { job: num(resort.job), state: str(resort.state) ?? "done", stacks: num(resort.stacks) ?? 0 } : null,
  };
}

// ------------------------------------------------------------ the filter

/** How the page is narrowed: the value proposed, the band, the size. Null leaves an edge open. */
export interface Filter {
  value: string | null;
  min: number | null;
  max: number | null;
  size: number;
}

const prob = (v: string | undefined): number | null => {
  if (v === undefined || v === "") return null;
  const p = Number(v);
  return Number.isFinite(p) && p >= 0 && p <= 1 ? p : null;
};

/** The filter an address names; the size held to those offered. */
export function filterOf(query: Record<string, string> | undefined): Filter {
  const size = Number(query?.size);
  return {
    value: query?.value && query.value !== "" ? query.value : null,
    min: prob(query?.min),
    max: prob(query?.max),
    size: (SIZES as readonly number[]).includes(size) ? size : SIZE,
  };
}

/**
 * The filter a page opens with where the address names none: the value with the most scans, over the whole
 * range the door gives, which is the band below the model's threshold (the sure ones are the commit's).
 */
export function defaultFilter(page: Pick<GPage, "values">, given: Filter): Filter {
  return { ...given, value: given.value ?? page.values[0]?.value ?? null };
}

/** The address of the grid, with the filter where it differs from the page's own defaults. */
export function gridHref(model: number | string, axis: string, f?: Partial<Filter>): string {
  return narrow(href("review", "proposals", String(model), axis), {
    value: f?.value ?? undefined,
    min: f?.min ?? undefined,
    max: f?.max ?? undefined,
    size: f?.size !== undefined && f.size !== SIZE ? f.size : undefined,
  });
}

const q = (params: Record<string, string | number | undefined | null>) => {
  const s = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  return s ? `?${s}` : "";
};

export interface AcceptBody extends Json {
  model: string;
  axis: string;
  value: string;
  min?: number;
  max?: number;
  seen: number[];
  except: number[];
  /** Scans among `seen` that get the person's value instead of the model's; never in `except`. Left out when none. */
  corrections?: { stack: number; value: string }[];
}

export const grid = {
  /** One page of a model's proposals on an axis, narrowed by the filter. */
  scans: (model: number | string, axis: string, f: Filter, page = 1, size = f.size) => door<Json>("GET", `/api/review/proposals/scans${q({ model, axis, value: f.value, min: f.min, max: f.max, page, size })}`).then(pageOf),
  accept: (body: AcceptBody) => door<Json>("POST", "/api/review/proposals/accept", body).then(acceptedOf),
};

// ------------------------------------------------------------ the grid's state

export interface GridState {
  page: GPage;
  /** The scans set apart: they stay proposals, unless a correction names their value. */
  apart: Record<number, true>;
  /** The person's value for a set-apart scan: Accept writes it in place of the model's. */
  corrections: Record<number, string>;
  /** The scan the keys act on. */
  focus: number | null;
  /** The last scan clicked, for a shift-click's range. */
  anchor: number | null;
  /** The value list open over one scan, or for every scan set apart; null for closed. */
  listing: number | "apart" | null;
}

/** A page's first state: nothing set apart, the focus on the first scan. */
export function gridOf(page: GPage): GridState {
  return { page, apart: {}, corrections: {}, focus: page.scans[0]?.stack ?? null, anchor: null, listing: null };
}

/** Whether the page offers a correction: the engine said what values the axis takes. */
export function corrects(s: Pick<GridState, "page">): boolean {
  return s.page.legal.length > 0;
}

/**
 * A click: set a scan apart, or put it back with the rest; a corrected scan goes back to the model's proposal (its
 * correction is dropped). It becomes the focus and the range's anchor, and an open list closes.
 */
export function toggleApart(s: GridState, stack: number): GridState {
  if (!s.page.scans.some((x) => x.stack === stack)) return s;
  const apart = { ...s.apart };
  const corrections = { ...s.corrections };
  if (stack in corrections) {
    delete corrections[stack];
    delete apart[stack];
  } else if (stack in apart) delete apart[stack];
  else apart[stack] = true;
  return { ...s, apart, corrections, focus: stack, anchor: stack, listing: null };
}

/** Space: a corrected scan stays set apart with no value; any other is set apart or put back as a click does. */
export function spaceApart(s: GridState, stack: number): GridState {
  return stack in s.corrections ? dropCorrection(s, stack) : toggleApart(s, stack);
}

/** The person's value for a set-apart scan; nothing for a scan not on the page or a value the axis does not take. */
export function setCorrection(s: GridState, stack: number, value: string): GridState {
  if (!s.page.scans.some((x) => x.stack === stack) || !s.page.legal.includes(value)) return s;
  return { ...s, apart: { ...s.apart, [stack]: true }, corrections: { ...s.corrections, [stack]: value } };
}

/** The correction dropped: the scan stays set apart with no value. */
export function dropCorrection(s: GridState, stack: number): GridState {
  if (!(stack in s.corrections)) return s;
  const corrections = { ...s.corrections };
  delete corrections[stack];
  return { ...s, corrections, focus: stack, anchor: stack };
}

/** The scans set apart, in the page's order. */
export function apartOf(s: GridState): number[] {
  return s.page.scans.filter((x) => x.stack in s.apart).map((x) => x.stack);
}

/**
 * 0 or a tile's corner: the value list opens for that scan (the focused one where none is named), or for every scan
 * set apart where several are and the focus is one of them; a scan not set apart is set apart in the same move.
 * Again closes it. Nothing where the engine said no values.
 */
export function openList(s: GridState, forStack: number | null = null): GridState {
  if (!corrects(s)) return s;
  const focus = forStack ?? s.focus;
  if (focus === null || !s.page.scans.some((x) => x.stack === focus)) return s;
  const apart: Record<number, true> = focus in s.apart ? s.apart : { ...s.apart, [focus]: true as const };
  const want: number | "apart" = focus in s.apart && Object.keys(s.apart).length > 1 ? "apart" : focus;
  return { ...s, apart, focus, anchor: focus, listing: s.listing === want ? null : want };
}

/** The list's pick: the value for what the list is open for; the list closes. */
export function chooseValue(s: GridState, value: string): GridState {
  if (s.listing === null) return s;
  let out: GridState = { ...s, listing: null };
  if (s.listing === "apart") for (const stack of apartOf(s)) out = setCorrection(out, stack, value);
  else out = setCorrection(out, s.listing, value);
  return out;
}

/** The list closed, nothing chosen. */
export function closeList(s: GridState): GridState {
  return s.listing === null ? s : { ...s, listing: null };
}

/** Set apart every scan from the anchor to this one (a shift-click); with no anchor, this one alone. */
export function rangeApart(s: GridState, stack: number): GridState {
  const list = s.page.scans;
  const to = list.findIndex((x) => x.stack === stack);
  if (to < 0) return s;
  const from = s.anchor === null ? to : list.findIndex((x) => x.stack === s.anchor);
  const [a, b] = from <= to ? [from, to] : [to, from];
  const apart = { ...s.apart };
  for (let i = a; i <= b; i++) apart[list[i].stack] = true;
  return { ...s, apart, focus: stack, listing: null };
}

/** The focus moved by some scans, held to the page. */
export function moved(s: GridState, by: number): GridState {
  const list = s.page.scans;
  if (list.length === 0) return s;
  const i = Math.max(0, list.findIndex((x) => x.stack === s.focus));
  const next = Math.min(list.length - 1, Math.max(0, i + by));
  return { ...s, focus: list[next].stack };
}

/** The scans the accept writes: shown, not set apart, and not a person's already. */
export function accepting(s: GridState): GScan[] {
  return s.page.scans.filter((x) => !(x.stack in s.apart) && !x.decided);
}

/** The scans corrected, in the page's order, each with the person's value. */
export function correctionsOf(s: GridState): { stack: number; value: string }[] {
  return s.page.scans.filter((x) => x.stack in s.corrections).map((x) => ({ stack: x.stack, value: s.corrections[x.stack] }));
}

/** The corrected values and their counts, most first, then by name: `[["brain", 2], ["neck", 1]]`. */
export function correctedCounts(s: GridState): [string, number][] {
  const counts = new Map<string, number>();
  for (const { value } of correctionsOf(s)) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/**
 * How the page stands: what Accept writes as the model's value, how many take the person's, how many are set apart
 * with no value (they stay proposals), how many a person decided.
 */
export function tally(s: GridState): { accept: number; corrected: number; apart: number; decided: number; total: number } {
  const corrected = Object.keys(s.corrections).length;
  return { accept: accepting(s).length, corrected, apart: Object.keys(s.apart).length - corrected, decided: s.page.scans.filter((x) => x.decided).length, total: s.page.scans.length };
}

/**
 * The accept door's body for the page as it stands: every scan shown, the set-apart ones without a value as
 * exceptions, the corrected ones with the person's value (never in `except`); null without a value.
 */
export function acceptBody(s: GridState, f: Filter): AcceptBody | null {
  const value = s.page.value ?? f.value;
  if (!value || s.page.scans.length === 0) return null;
  const corrections = corrects(s) ? correctionsOf(s) : [];
  return {
    model: String(s.page.model.id),
    axis: s.page.axis,
    value,
    ...(f.min !== null ? { min: f.min } : {}),
    ...(f.max !== null ? { max: f.max } : {}),
    seen: s.page.scans.map((x) => x.stack),
    except: s.page.scans.filter((x) => x.stack in s.apart && !(x.stack in s.corrections)).map((x) => x.stack),
    ...(corrections.length > 0 ? { corrections } : {}),
  };
}

export type GridAct = { kind: "apart" } | { kind: "list" } | { kind: "apply" } | { kind: "move"; by: number } | { kind: "full" } | { kind: "back" } | { kind: "none" };

/** What a key does on the grid. `columns` is how many scans a row holds now, for up and down. */
export function keyAct(key: string, columns = 1): GridAct {
  const cols = Math.max(1, columns);
  switch (key) {
    case " ":
      return { kind: "apart" };
    case "0":
      return { kind: "list" };
    case "Enter":
      return { kind: "apply" };
    case "ArrowRight":
      return { kind: "move", by: 1 };
    case "ArrowLeft":
      return { kind: "move", by: -1 };
    case "ArrowDown":
      return { kind: "move", by: cols };
    case "ArrowUp":
      return { kind: "move", by: -cols };
    case "f":
      return { kind: "full" };
    case "Escape":
      return { kind: "back" };
    default:
      return { kind: "none" };
  }
}

// ------------------------------------------------------------ words

const p2 = (p: number) => p.toFixed(2);

/** The band in words: `at 0.60 to 0.90`, `below 0.90`, `at 0.60 or above`, or nothing for the whole range. */
export function bandWords(min: number | null, max: number | null): string {
  if (min !== null && max !== null) return `at ${p2(min)} to ${p2(max)}`;
  if (max !== null) return `below ${p2(max)}`;
  if (min !== null) return `at ${p2(min)} or above`;
  return "";
}

/** The quiet line of state at the top right: `page 1 of 83 · 41,212 neck at 0.60 to 0.90`. */
export function stateLine(page: GPage, f: Filter): string {
  const what = [nf(page.total), page.value ?? f.value, bandWords(f.min, f.max)].filter(Boolean).join(" ");
  return `page ${nf(page.page)} of ${nf(page.pages)} · ${what}`;
}

/** The corrected values in words: `2 brain, 1 neck`; empty for none. */
export function correctedWords(s: GridState): string {
  return correctedCounts(s)
    .map(([v, c]) => `${nf(c)} ${v}`)
    .join(", ");
}

/** The primary button: `Accept 497 as neck`, and `· 3 corrected` where set-apart scans took a value. */
export function acceptWords(s: GridState, f: Filter): string {
  const value = s.page.value ?? f.value ?? "the value";
  const t = tally(s);
  return `Accept ${nf(t.accept)} as ${value}${t.corrected > 0 ? ` · ${nf(t.corrected)} corrected` : ""}`;
}

/** What the accept did, before the re-sort: what was written as the model's value and as the person's, set apart, kept and closed. */
function acceptedHead(a: Accepted, s: GridState | null): string[] {
  const values = s && a.corrected > 0 ? correctedWords(s) : "";
  const corrected = a.corrected > 0 ? ` and corrected ${nf(a.corrected)}${values ? ` (${values})` : ""}` : "";
  const parts = [`Accepted ${nf(a.decided)} as ${a.value}${corrected} in your name`];
  const apart = s ? tally(s).apart : a.setApart;
  if (apart > 0) parts.push(`${nf(apart)} set apart ${apart === 1 ? "stays a proposal" : "stay proposals"}`);
  if (a.keptDecided > 0) parts.push(`${nf(a.keptDecided)} ${a.keptDecided === 1 ? "keeps" : "keep"} a person's decision`);
  if (a.closed.length > 0) parts.push(`${nf(a.closed.length)} ${a.closed.length === 1 ? "question" : "questions"} closed`);
  return parts;
}

/** What the accept did, in a line, and that the sort runs again. */
export function acceptedWords(a: Accepted, s: GridState | null = null): string {
  const parts = acceptedHead(a, s);
  if (a.resort?.job) parts.push(`sorted again as job ${a.resort.job}`);
  else if (a.resort && a.resort.state === "done" && a.decided > 0) parts.push("sorted again");
  return parts.join(" · ");
}

/**
 * The line while the page follows the re-sort job the accept queued, as the commit's line does: what the accept did,
 * then how far the job is (`120 of 497 sorted again (job 356)`, then `497 of 497 sorted again`).
 */
export function acceptedFollowLine(a: Accepted, s: GridState | null, job: Pick<JobRow, "state" | "progress" | "error" | "result">): string {
  const parts = acceptedHead(a, s);
  parts.push(`${sortedLine(job, a.resort?.stacks ?? a.decided)}${jobOver(job.state) || a.resort?.job === null ? "" : ` (job ${a.resort?.job})`}`);
  return parts.join(" · ");
}

/** Why an accept was refused, in words: a page someone else answered meanwhile is read again. */
export function refusedWords(e: unknown): { words: string; stale: boolean } {
  if (e instanceof DoorError) {
    const said = typeof e.body.error === "string" ? e.body.error : "";
    if (e.status === 409) return { words: `${said || "Refused"}. The page is read again.`, stale: true };
    if (e.status === 403) return { words: "Accepting needs work on the Review page.", stale: false };
    if (e.status === 404) return { words: said || "No such model.", stale: false };
    return { words: said || e.message, stale: false };
  }
  return { words: e instanceof Error ? e.message : String(e), stale: false };
}

/** A tile's hover: the scan's name, the value now, the probability, and the person's value where one is set. */
export function tileTitle(x: GScan, correction: string | null = null): string {
  return [x.name ?? x.description ?? `scan ${x.stack}`, `now ${x.now ?? "no value"}`, `${x.proposed} ${p2(x.probability)}`, correction ? `your value ${correction}` : null, x.decided ? "decided by a person" : null, x.subject?.code ? `subject ${x.subject.code}` : null].filter(Boolean).join(" · ");
}

/**
 * The values the colours are slotted by: the page's values in name order, so a value keeps its colour across pages,
 * then the others as they come (the filter's value, the values corrected to), each on the next slot.
 */
export function slots(values: readonly ValueCount[], extra: readonly string[] = []): string[] {
  const out = values.map((v) => v.value).sort((a, b) => a.localeCompare(b));
  for (const v of extra) if (v && !out.includes(v)) out.push(v);
  return out;
}

/**
 * The colour slots for a page as it stands: the page's values, the filter's, the values corrected to and then the
 * axis's other legal values, the last two in the pack's order, so a corrected value's colour holds while the page is
 * worked (the slots run out after ten: a value past them keeps its word and a plain frame).
 */
export function paletteOf(s: GridState): string[] {
  const used = new Set(Object.values(s.corrections));
  return slots(s.page.values, [s.page.value ?? "", ...s.page.legal.filter((v) => used.has(v)), ...s.page.legal]);
}
