// SPDX-License-Identifier: AGPL-3.0-only
// Review round 1 (record 56 section 6.3; the design of
// studies/2026-10-09-review-round1): the few questions the sort leaves to a
// person, each answered as a grid of its scans. The engine gathers its own
// questions into plain ones with their distinct scans (`Which base? 7
// scans`, `T2w or PDw? 12 scans`), pages a question's scans with each one's
// picture and NILS's answer, and takes one answer for the scans a person saw
// with the scans set otherwise as exceptions, then re-sorts them at once.
//
// The grid reads like the gallery (UX round 6): the question's first answer
// is every scan's at open; keys 1 and 2 make theirs the answer of every scan
// not set otherwise; a click gives a scan the other answer and takes it back;
// space sets the focused scan apart (it stays open); 0 opens the axis's whole
// list once, for the focused scan or for the ones set apart; Enter applies,
// the arrows move, f opens a scan full size, ? shows each scan's rule. No
// dialog, no scope, no why field. Everything here is pure, so the page, the
// dataset viewer and their tests read one shape.

import { door, DoorError, type Json } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";
import { href, narrow } from "../routes";
import type { RulesReason } from "./s1";

/** The doors, as the engine's capabilities name them. */
export const QUESTION_DOORS = {
  list: "GET /api/review/questions",
  scans: "GET /api/review/questions/{key}/scans",
  answer: "POST /api/review/questions/{key}/answer",
} as const;

/** How many scans a page of the grid shows. */
export const PAGE = 50;

/** Whether the engine serves the questions and the person may read them. */
export function questionsServed(caps: Capabilities): boolean {
  return served(caps, QUESTION_DOORS.list) && served(caps, QUESTION_DOORS.scans) && may(caps, "review:see");
}

/** Whether the person may answer a question here. */
export function mayAnswer(caps: Capabilities): boolean {
  return served(caps, QUESTION_DOORS.answer) && may(caps, "review:work");
}

/** Where a question was read: a dataset's scans, a cohort's, or the whole registry's. */
export interface Where {
  dataset?: string;
  cohort?: string;
}

/** A question's shape: an axis the rules left empty, two values in dispute, or one answer in doubt. */
export type Shape = "missing" | "pair" | "doubt";

export interface Question {
  key: string;
  axis: string;
  shape: Shape;
  /** The answers keys 1 and 2 give. */
  values: string[];
  words: string;
  reason: string;
  scans: number;
  staged: number;
  kinds: Record<string, number>;
  /** Read for one scan (the dataset viewer): that scan's mode on the question. A blind-first one read there is shown beside NILS's answer, so its answer is never a blind label. */
  mode?: "routine" | "blind_first";
}

/** One value of an axis as a person chooses it: `value` is the form the axis stores. */
export interface Vocab {
  value: string;
  name: string;
  label: string | null;
}

/** A question answered on its own page: System 1's candidates, a broken constraint. */
export interface Elsewhere {
  kind: string;
  scans: number;
  words: string;
  page: string;
}

export interface QuestionList {
  scope: { kind: string; name: string | null; id: number | null };
  scans: number;
  questions: Question[];
  vocabularies: Record<string, Vocab[]>;
  elsewhere: Elsewhere[];
  held: { scans: number; campaigns: { id: number; name: string }[] };
}

/** System 1's answer on a scan's axis. */
export interface ScanOpinion {
  value: string | null;
  p: number | null;
  reliability: number | null;
  agrees: boolean | null;
}

/** An answer a model or an agent staged, waiting for a person to confirm it. */
export interface Staged {
  value: string | null;
  decision: number | null;
  author_kind: string | null;
  actor: string | null;
  model_id: number | null;
}

/** One scan of a question as the grid draws it. */
export interface QScan {
  stack: number;
  items: number[];
  status: "open" | "staged";
  mode: "routine" | "blind_first";
  /** A blind-first question the person has not answered: none of NILS's answers are given. */
  blind: boolean;
  subject: { id: number; code: string | null } | null;
  session: { id: number; label: string | null } | null;
  day: string | null;
  description: string | null;
  series: number | null;
  name: string | null;
  bids: string | null;
  axes: Record<string, string>;
  /** The middle plane as a data URL, where the engine sent one. */
  picture: string | null;
  partial: boolean;
  /** NILS's answer on the axis now, null where none. */
  nils: string | null;
  /** The other value in dispute on this scan. */
  other: string | null;
  rules: RulesReason | null;
  system1: ScanOpinion | null;
  staged: Staged | null;
}

export interface QPage {
  key: string;
  axis: string;
  shape: Shape;
  words: string;
  reason: string;
  values: string[];
  vocabulary: Vocab[];
  system1: { status: "confirmed" | "not_confirmed" | "no_model"; why: string | null };
  total: number;
  page: number;
  pages: number;
  limit: number;
  pictures: { shown: boolean; why: string | null } | null;
  scans: QScan[];
}

/** What the answer door took, and what it did. */
export interface Answered {
  key: string;
  axis: string;
  answered: number;
  decisions: { stack: number; value: string | null; decision: number; staged: boolean }[];
  skipped: number[];
  staged: boolean;
  blind: number;
  resort: { job: number | null; state: string; stacks: number; seconds: number | null; why: string | null } | null;
  picks: { job: number | null; why: string | null } | null;
  left: number;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const obj = (v: unknown): Json | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x !== "") : []);
const shapeOf = (v: unknown): Shape => (v === "pair" || v === "doubt" ? v : "missing");

/** An axis's name in words. */
export const axisWords = (axis: string): string => axis.replaceAll("_", " ");

/** The question in words where the engine gave none: `Which base?`, `T2w or PDw?`, `T2w?`. */
export function wordsOf(shape: Shape, axis: string, values: string[]): string {
  if (shape === "pair" && values.length >= 2) return `${values[0]} or ${values[1]}?`;
  if (shape === "doubt" && values.length >= 1) return `${values[0]}?`;
  return `Which ${axisWords(axis)}?`;
}

function vocabOf(v: unknown): Vocab[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x) => {
    const o = obj(x);
    const value = str(o?.value) ?? str(o?.name);
    return o && value ? [{ value, name: str(o.name) ?? value, label: str(o.label) }] : [];
  });
}

function questionOf(raw: Json): Question | null {
  const key = str(raw.key);
  const axis = str(raw.axis);
  if (!key || !axis) return null;
  const shape = shapeOf(raw.shape);
  const values = strings(raw.values).slice(0, 2);
  const kinds: Record<string, number> = {};
  for (const [k, n] of Object.entries(obj(raw.kinds) ?? {})) if (num(n) !== null) kinds[k] = n as number;
  const mode = raw.mode === "blind_first" || raw.mode === "routine" ? raw.mode : undefined;
  return { key, axis, shape, values, words: str(raw.words) ?? wordsOf(shape, axis, values), reason: str(raw.reason) ?? "", scans: num(raw.scans) ?? 0, staged: num(raw.staged) ?? 0, kinds, ...(mode ? { mode } : {}) };
}

/** The list door's answer, read into one shape whatever it left out. */
export function listOf(raw: Json): QuestionList {
  const scope = obj(raw.scope) ?? {};
  const vocabularies: Record<string, Vocab[]> = {};
  for (const [axis, v] of Object.entries(obj(raw.vocabularies) ?? {})) vocabularies[axis] = vocabOf(v);
  const held = obj(raw.held) ?? {};
  return {
    scope: { kind: str(scope.kind) ?? "registry", name: str(scope.name), id: num(scope.id) },
    scans: num(raw.scans) ?? 0,
    questions: (Array.isArray(raw.questions) ? (raw.questions as Json[]) : []).map(questionOf).filter((q): q is Question => q !== null),
    vocabularies,
    elsewhere: (Array.isArray(raw.elsewhere) ? (raw.elsewhere as Json[]) : []).flatMap((e) => (str(e.kind) ? [{ kind: e.kind as string, scans: num(e.scans) ?? 0, words: str(e.words) ?? (e.kind as string), page: str(e.page) ?? "queue" }] : [])),
    held: {
      scans: num(held.scans) ?? 0,
      campaigns: (Array.isArray(held.campaigns) ? (held.campaigns as Json[]) : []).flatMap((c) => (num(c.id) !== null ? [{ id: c.id as number, name: str(c.name) ?? `campaign ${c.id}` }] : [])),
    },
  };
}

function scanOf(raw: Json): QScan | null {
  const stack = num(raw.stack);
  if (stack === null) return null;
  const subject = obj(raw.subject);
  const session = obj(raw.session);
  const picture = obj(raw.picture);
  const s1 = obj(raw.system1);
  const staged = obj(raw.staged);
  const axes: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj(raw.axes) ?? {})) if (typeof v === "string" && v !== "") axes[k] = v;
  const blind = raw.blind === true;
  return {
    stack,
    items: Array.isArray(raw.items) ? raw.items.filter((i): i is number => typeof i === "number") : [],
    status: raw.status === "staged" ? "staged" : "open",
    mode: raw.mode === "blind_first" ? "blind_first" : "routine",
    blind,
    subject: subject && num(subject.id) !== null ? { id: subject.id as number, code: str(subject.code) } : null,
    session: session && num(session.id) !== null ? { id: session.id as number, label: str(session.label) } : null,
    day: str(raw.day),
    description: str(raw.series_description),
    series: num(raw.series_number),
    name: blind ? null : str(raw.name),
    bids: blind ? null : str(raw.bids),
    axes: blind ? {} : axes,
    picture: picture && str(picture.data) ? (picture.data as string) : null,
    partial: picture?.partial === true,
    // a blind scan shows none of NILS's answers, whatever came
    nils: blind ? null : str(raw.nils),
    other: blind ? null : str(raw.other),
    rules: blind ? null : ((obj(raw.rules) as RulesReason | null) ?? null),
    system1: blind || !s1 ? null : { value: str(s1.value), p: num(s1.p), reliability: num(s1.reliability), agrees: typeof s1.agrees === "boolean" ? s1.agrees : null },
    staged: blind || !staged ? null : { value: str(staged.value), decision: num(staged.decision), author_kind: str(staged.author_kind), actor: str(staged.actor), model_id: num(staged.model_id) },
  };
}

/** A page of a question's scans, read into one shape. */
export function pageOf(raw: Json): QPage {
  const shape = shapeOf(raw.shape);
  const axis = str(raw.axis) ?? "";
  const values = strings(raw.values).slice(0, 2);
  const s1 = obj(raw.system1) ?? {};
  const status = s1.status === "confirmed" || s1.status === "not_confirmed" ? s1.status : "no_model";
  const pictures = obj(raw.pictures);
  const scans = (Array.isArray(raw.scans) ? (raw.scans as Json[]) : []).map(scanOf).filter((s): s is QScan => s !== null);
  return {
    key: str(raw.key) ?? "",
    axis,
    shape,
    words: str(raw.words) ?? wordsOf(shape, axis, values),
    reason: str(raw.reason) ?? "",
    values,
    vocabulary: vocabOf(raw.vocabulary),
    system1: { status, why: str(s1.why) },
    total: num(raw.total) ?? scans.length,
    page: num(raw.page) ?? 1,
    pages: num(raw.pages) ?? 1,
    limit: num(raw.limit) ?? PAGE,
    pictures: pictures ? { shown: pictures.shown === true, why: str(pictures.why) } : null,
    scans,
  };
}

/** The answer door's reply, read into one shape. */
export function answeredOf(raw: Json): Answered {
  const resort = obj(raw.resort);
  const picks = obj(raw.picks);
  return {
    key: str(raw.key) ?? "",
    axis: str(raw.axis) ?? "",
    answered: num(raw.answered) ?? 0,
    decisions: (Array.isArray(raw.decisions) ? (raw.decisions as Json[]) : []).flatMap((d) => (num(d.stack) !== null ? [{ stack: d.stack as number, value: str(d.value), decision: num(d.decision) ?? 0, staged: d.staged === true }] : [])),
    skipped: Array.isArray(raw.skipped) ? raw.skipped.filter((s): s is number => typeof s === "number") : [],
    staged: raw.staged === true,
    blind: num(raw.blind) ?? 0,
    resort: resort ? { job: num(resort.job), state: str(resort.state) ?? "done", stacks: num(resort.stacks) ?? 0, seconds: num(resort.seconds), why: str(resort.why) } : null,
    picks: picks ? { job: num(picks.job), why: str(picks.why) } : null,
    left: num(raw.left) ?? 0,
  };
}

const q = (params: Record<string, string | number | undefined | null>) => {
  const s = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  return s ? `?${s}` : "";
};

const at = (key: string) => `/api/review/questions/${encodeURIComponent(key)}`;

export const questions = {
  /** The questions of a dataset, a cohort or the registry; with `stack`, only those asking that scan. */
  list: (where: Where, stack?: number) => door<Json>("GET", `/api/review/questions${q({ dataset: where.dataset, cohort: where.cohort, stack })}`).then(listOf),
  scans: (key: string, where: Where, page = 1, limit = PAGE) => door<Json>("GET", `${at(key)}/scans${q({ dataset: where.dataset, cohort: where.cohort, page, limit })}`).then(pageOf),
  answer: (key: string, body: AnswerBody) => door<Json>("POST", `${at(key)}/answer`, body).then(answeredOf),
};

// ------------------------------------------------------------ addresses

/** The list's address, narrowed to where it was opened for. */
export function listHref(where: Where): string {
  return narrow(href("review", "questions"), { dataset: where.dataset, cohort: where.cohort });
}

/** A question's grid, at its key, narrowed the same way. */
export function gridHref(key: string, where: Where): string {
  return narrow(href("review", "questions", key), { dataset: where.dataset, cohort: where.cohort });
}

/** Where a question answered on its own page is answered: System 1's candidates on Asked, the rest in the list under the questions. */
export function elsewhereHref(e: Pick<Elsewhere, "page">, where: Where): string | null {
  if (e.page === "asked") return href("review", "asked");
  if (e.page === "queue") return null;
  return narrow(href("review", e.page), { dataset: where.dataset });
}

/** The scope an address names: a dataset, else a cohort, else the registry. */
export function whereOf(query: Record<string, string> | undefined): Where {
  if (query?.dataset) return { dataset: query.dataset };
  if (query?.cohort && query.cohort !== "none") return { cohort: query.cohort };
  return {};
}

/** The kinds the list's questions are made of: what the grid answers, so the queue under it leaves them out. */
export function kindsAnswered(list: QuestionList | null): Set<string> {
  return new Set((list?.questions ?? []).flatMap((x) => Object.keys(x.kinds)));
}

// ------------------------------------------------------------ the grid's state

/** A key's answer under an open scan (ScanQuestion): one of the two keys, a value from the full list, or no value. */
export type Choice = { kind: "value"; value: string; key: "1" | "2" | "0" } | { kind: "nothing" };

/** What the person set on one scan, apart from the answer every scan gets: a value of its own, no value, or set apart for later. */
export type Tile = { kind: "value"; value: string } | { kind: "nothing" } | { kind: "apart" };

/** What one scan gets when the page is applied. */
export type TileAnswer = { kind: "value"; value: string } | { kind: "nothing" } | { kind: "skip" };

export interface GridState {
  page: QPage;
  /** The answer every scan gets unless the person set it otherwise: the first of the question's answers at open, then the key pressed. Null where the question offers none. */
  answer: string | null;
  /** The scans set otherwise, by stack. */
  tiles: Record<number, Tile>;
  /** The scan the keys act on. */
  focus: number | null;
  /** The axis's whole value list open: for one scan, or for the scans set apart. */
  listing: number | "apart" | null;
  /** Each scan's rule shown under it. */
  reasons: boolean;
}

/** A page's first state: the first answer for every scan, none set otherwise, the focus on the first scan. */
export function gridOf(page: QPage): GridState {
  return { page, answer: page.values[0] ?? null, tiles: {}, focus: page.scans[0]?.stack ?? null, listing: null, reasons: false };
}

/** The answer key 1 or 2 gives, where the question has one. */
export function keyValue(s: Pick<GridState, "page">, key: "1" | "2"): string | null {
  return s.page.values[key === "1" ? 0 : 1] ?? null;
}

/** A scan set to the answer every scan gets says nothing of its own. */
function settled(s: GridState): GridState {
  const tiles: Record<number, Tile> = {};
  for (const [k, t] of Object.entries(s.tiles)) if (!(t.kind === "value" && t.value === s.answer)) tiles[Number(k)] = t;
  return { ...s, tiles };
}

/** Press key 1 or 2: that answer for every scan not set otherwise. */
export function chooseKey(s: GridState, key: "1" | "2"): GridState {
  const value = keyValue(s, key);
  return value === null ? s : settled({ ...s, answer: value, listing: null });
}

/** The other of the question's two answers: what a click gives a scan. Null where the question offers one answer. */
export function otherOf(s: Pick<GridState, "page" | "answer">): string | null {
  return s.page.values.find((v) => v !== s.answer) ?? null;
}

/** A scan set to one thing: a value, no value, or apart. */
function setTile(s: GridState, stack: number, t: Tile): GridState {
  if (!s.page.scans.some((x) => x.stack === stack)) return s;
  return settled({ ...s, tiles: { ...s.tiles, [stack]: t } });
}

/** A scan put back with the rest. */
function clearTile(s: GridState, stack: number): GridState {
  const tiles = { ...s.tiles };
  delete tiles[stack];
  return { ...s, tiles };
}

/** A click on a scan: the other answer where it has the page's, else back to the page's. Unchanged where the question offers one answer. */
export function toggleTile(s: GridState, stack: number): GridState {
  if (!s.page.scans.some((x) => x.stack === stack)) return s;
  const other = otherOf(s);
  if (other === null) return s;
  const t = s.tiles[stack];
  const at = { ...s, focus: stack, listing: s.listing === stack ? null : s.listing };
  return t ? clearTile(at, stack) : setTile(at, stack, { kind: "value", value: other });
}

/** Set a scan apart for later (it stays open), or put it back with the rest. */
export function toggleApart(s: GridState, stack: number): GridState {
  if (!s.page.scans.some((x) => x.stack === stack)) return s;
  const at = { ...s, focus: stack, listing: s.listing === stack ? null : s.listing };
  return s.tiles[stack]?.kind === "apart" ? clearTile(at, stack) : setTile(at, stack, { kind: "apart" });
}

/** Give a scan a value of the whole list, or no value. */
export function setTileValue(s: GridState, stack: number, v: { kind: "value"; value: string } | { kind: "nothing" }): GridState {
  return setTile(s, stack, v);
}

/** The scans set apart, in the page's order. */
export function apartOf(s: GridState): number[] {
  return s.page.scans.filter((x) => s.tiles[x.stack]?.kind === "apart").map((x) => x.stack);
}

/** Whether the scan in focus is set apart: then 0 acts on every scan set apart. */
export function focusApart(s: Pick<GridState, "focus" | "tiles">): boolean {
  return s.focus !== null && s.tiles[s.focus]?.kind === "apart";
}

/** Open the whole value list for the focused scan, or for every scan set apart where the focused one is; again closes it. */
export function openList(s: GridState, forStack: number | null = null): GridState {
  const want = forStack !== null ? forStack : focusApart(s) ? "apart" : s.focus;
  if (want === null) return s;
  return { ...s, listing: s.listing === want ? null : want };
}

/** Choose a value of the whole list for what the list is open for. */
export function chooseValue(s: GridState, value: string): GridState {
  return chooseListed(s, { kind: "value", value });
}

/** No value for what the list is open for. */
export function chooseNothing(s: GridState): GridState {
  return chooseListed(s, { kind: "nothing" });
}

function chooseListed(s: GridState, t: { kind: "value"; value: string } | { kind: "nothing" }): GridState {
  if (s.listing === null) return s;
  let out: GridState = { ...s, listing: null };
  if (s.listing === "apart") for (const stack of apartOf(s)) out = setTile(out, stack, t);
  else out = setTile(out, s.listing, t);
  return out;
}

/** What a scan gets when the page is applied: the page's answer, its own, no value, or nothing yet (set apart). Null where the question offers no answer. */
export function tileAnswer(s: GridState, stack: number): TileAnswer | null {
  const t = s.tiles[stack];
  if (t?.kind === "apart") return { kind: "skip" };
  if (t) return t;
  return s.answer === null ? null : { kind: "value", value: s.answer };
}

export interface AnswerBody extends Json {
  value?: string;
  nothing?: true;
  stacks: number[];
  except: Json[];
  dataset?: string;
  cohort?: string;
}

/** The answer door's body for the page as it stands: every scan shown, the ones set otherwise as exceptions; null where no answer is offered. */
export function answerBody(s: GridState, where: Where): AnswerBody | null {
  if (s.answer === null) return null;
  const except: Json[] = [];
  for (const scan of s.page.scans) {
    const t = s.tiles[scan.stack];
    if (!t) continue;
    if (t.kind === "apart") except.push({ stack: scan.stack, skip: true });
    else if (t.kind === "nothing") except.push({ stack: scan.stack, nothing: true });
    else if (t.value !== s.answer) except.push({ stack: scan.stack, value: t.value });
  }
  return {
    value: s.answer,
    stacks: s.page.scans.map((x) => x.stack),
    except,
    ...(where.dataset ? { dataset: where.dataset } : {}),
    ...(where.cohort ? { cohort: where.cohort } : {}),
  };
}

/** How the page stands: how many scans get each answer (the page's first), how many get no value, how many are set apart. */
export function tally(s: GridState): { total: number; counts: [string, number][]; nothing: number; apart: number } {
  const by = new Map<string, number>();
  if (s.answer !== null) by.set(s.answer, 0);
  let nothing = 0;
  let apart = 0;
  for (const scan of s.page.scans) {
    const t = tileAnswer(s, scan.stack);
    if (!t) continue;
    if (t.kind === "skip") apart++;
    else if (t.kind === "nothing") nothing++;
    else by.set(t.value, (by.get(t.value) ?? 0) + 1);
  }
  return { total: s.page.scans.length, counts: [...by.entries()], nothing, apart };
}

/** The tally in words: `10 scans · brain-neck 6 · brain 4 · 1 set apart`. */
export function tallyWords(s: GridState): string {
  const n = (v: number) => v.toLocaleString("en-US");
  const t = tally(s);
  const parts = [`${n(t.total)} ${t.total === 1 ? "scan" : "scans"}`];
  for (const [v, c] of t.counts) if (c > 0 || v === s.answer) parts.push(`${v} ${n(c)}`);
  if (t.nothing > 0) parts.push(`no value ${n(t.nothing)}`);
  if (t.apart > 0) parts.push(`${n(t.apart)} set apart`);
  return parts.join(" · ");
}

/** The focus moved by some scans, held to the page. */
export function moved(s: GridState, by: number): GridState {
  const list = s.page.scans;
  if (list.length === 0) return s;
  const i = Math.max(0, list.findIndex((x) => x.stack === s.focus));
  const next = Math.min(list.length - 1, Math.max(0, i + by));
  return { ...s, focus: list[next].stack };
}

export type GridAct =
  | { kind: "key"; key: "1" | "2" }
  | { kind: "list" }
  | { kind: "apart" }
  | { kind: "apply" }
  | { kind: "move"; by: number }
  | { kind: "full" }
  | { kind: "reasons" }
  | { kind: "back" }
  | { kind: "none" };

/** What a key does on the grid. `columns` is how many scans a row of the grid holds now, for up and down. */
export function keyAct(key: string, columns = 1): GridAct {
  const cols = Math.max(1, columns);
  switch (key) {
    case "1":
    case "2":
      return { kind: "key", key };
    case "0":
      return { kind: "list" };
    case " ":
      return { kind: "apart" };
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
    case "?":
      return { kind: "reasons" };
    case "Escape":
      return { kind: "back" };
    default:
      return { kind: "none" };
  }
}

/** What an answer did, in a line: how many were answered and how, and the re-sort. */
export function answeredWords(a: Answered, s: GridState | null = null): string {
  const n = (v: number) => v.toLocaleString("en-US");
  const parts = [`${n(a.answered)} ${a.answered === 1 ? "scan" : "scans"} answered`];
  const t = s ? tally(s) : null;
  if (t) {
    const got = t.counts.filter(([, c]) => c > 0).map(([v, c]) => (t.counts.length === 1 && t.nothing === 0 ? v : `${v} ${n(c)}`));
    if (t.nothing > 0) got.push(`no value ${n(t.nothing)}`);
    if (got.length > 0) parts[0] += `: ${got.join(", ")}`;
  }
  if (a.skipped.length > 0) parts.push(`${n(a.skipped.length)} left for later`);
  if (a.staged) parts.push("waiting for a person to confirm");
  if (a.resort?.state === "done") parts.push("sorted again");
  else if (a.resort?.why) parts.push(a.resort.why);
  return parts.join(" · ");
}

/** Why an answer was refused, in words: a page someone else answered meanwhile is read again. */
export function refusedWords(e: unknown): { words: string; stale: boolean } {
  if (e instanceof DoorError) {
    const said = typeof e.body.error === "string" ? e.body.error : "";
    if (e.status === 409) return { words: `${said || "Refused"}. The page is read again.`, stale: true };
    if (e.status === 403) return { words: "Answering needs work on the Review page.", stale: false };
    if (e.status === 404) return { words: "This question asks no scan here now.", stale: true };
    return { words: said || e.message, stale: false };
  }
  return { words: e instanceof Error ? e.message : String(e), stale: false };
}

/** A value's words as a key shows it: its label where it has one. */
export function valueLabel(vocabulary: Vocab[], value: string): string {
  const v = vocabulary.find((x) => x.value === value || x.name === value);
  return v?.label && v.label !== v.value ? `${v.value} (${v.label})` : value;
}

/** The values the colours are slotted by: the axis's own order, so a value keeps its colour everywhere. */
export function slots(vocabulary: Vocab[], values: string[]): string[] {
  const out = vocabulary.map((v) => v.value);
  for (const v of values) if (!out.includes(v)) out.push(v);
  return out;
}

/** System 1's answer on a scan, in a few words: its value and probability. */
export function opinionWords(o: ScanOpinion | null): string | null {
  if (!o || !o.value) return null;
  return `${o.value}${o.p !== null ? ` ${o.p.toFixed(2)}` : ""}`;
}

/** The rules' line on a scan, with the rules it was decided over by the pack's order. */
export function ruleLine(r: RulesReason | null): string | null {
  if (!r) return null;
  const line = typeof r.line === "string" && r.line !== "" ? r.line : null;
  const over = (r.overridden ?? []).map((o) => `over ${o.rule_set}/${o.rule}${o.value ? ` (${o.value})` : ""}`);
  const all = [line, ...over].filter((x): x is string => x !== null);
  return all.length > 0 ? all.join(" · ") : null;
}
