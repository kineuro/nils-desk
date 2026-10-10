// SPDX-License-Identifier: AGPL-3.0-only
// The dataset viewer (Wave 7a, the desk redesign of 2026-10-09): one
// dataset, or one cohort over its members from any dataset, seen as a grid
// (the subjects, one subject's visits, one visit's scans) or as a browser
// (the tree and one scan). Everything the page shows is said here as pure
// functions: the address that keeps the place, so back and forward work; the
// engine's doors and what they answer; and the words a card says. Subjects,
// never people (Nima, 2026-10-09).

import { door } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";
import { href, narrow, parse } from "../routes";
import { needsLook, SCANS_DOOR, scansOf, type PagePictures, type Scan, type ScanPage, type ScanRow } from "./scans";
import { FAMILY_SLOT, FAMILY_WORD, familyOf, type Family } from "./tree";

// ------------------------------------------------------------ where

/** What the viewer shows: a dataset, or a cohort's members across datasets. */
export interface Scope {
  kind: "dataset" | "cohort";
  name: string;
}

export type Mode = "grid" | "browser";

/** The viewer's place, as its address keeps it. */
export interface ViewState {
  mode: Mode;
  /** The subject open in the grid (its id), or the one the browser's scan belongs to. */
  subject: number | null;
  /** The visit open: `s<session>` for a session the engine keeps, `t<study>.<study>` for one it does not. */
  visit: string | null;
  /** The scan the browser shows. */
  scan: number | null;
  /** The subjects' search, held in memory for the page (searchOf), never in the address. */
  q: string;
  /** The subjects' filters, as the subjects door spells them. */
  filter: string[];
  /** The visits' filters. */
  vfilter: string[];
}

export const EMPTY_VIEW: ViewState = { mode: "grid", subject: null, visit: null, scan: null, q: "", filter: [], vfilter: [] };

/*
 * The subjects' search is what a person typed, and what they type can be an
 * identifier: the subjects door matches a full ID at the sensitive detail
 * level. So it is held in this page's memory alone, per scope, and never
 * goes into the address, the browser's history, a link passed on, browser
 * storage or a kept question (review of 2026-10-10). Going down a level and
 * back up keeps it; reloading the page forgets it.
 */
const searches = new Map<string, string>();
const searchHeard = new Set<() => void>();

/** The search held for a scope, "" where none is. */
export function searchOf(scope: Scope): string {
  return searches.get(`${scope.kind}:${scope.name}`) ?? "";
}

/** Holds a scope's search and tells whoever listens. */
export function setSearch(scope: Scope, text: string): void {
  const key = `${scope.kind}:${scope.name}`;
  if ((searches.get(key) ?? "") === text) return;
  if (text === "") searches.delete(key);
  else searches.set(key, text);
  for (const heard of [...searchHeard]) heard();
}

/** Listens for a change of any search; the returned function stops listening. */
export function onSearch(heard: () => void): () => void {
  searchHeard.add(heard);
  return () => searchHeard.delete(heard);
}

const pageOf = (s: Scope) => (s.kind === "dataset" ? "datasets" : "cohorts");

const id = (v: string | undefined): number | null => (v !== undefined && /^\d+$/.test(v) ? Number(v) : null);
const list = (v: string | undefined): string[] => (v ? v.split(",").map((x) => x.trim()).filter(Boolean) : []);

/** The view an address names: #data/datasets/NAME/view?mode=grid&subject=12&visit=s34. A search an older address carried is not read: the search is held in memory (searchOf). */
export function parseView(query: Record<string, string> | undefined): ViewState {
  const q = query ?? {};
  const visit = q.visit && /^(s\d+|t\d+(\.\d+)*)$/.test(q.visit) ? q.visit : null;
  return {
    mode: q.mode === "browser" ? "browser" : "grid",
    subject: id(q.subject),
    visit,
    scan: id(q.scan),
    q: "",
    filter: list(q.filter),
    vfilter: list(q.vfilter),
  };
}

/** The address of a view of a scope. The search is never part of it. */
export function viewHref(scope: Scope, v: Partial<ViewState> = {}): string {
  const s = { ...EMPTY_VIEW, ...v };
  return narrow(href("data", pageOf(scope), scope.name, "view"), {
    mode: s.mode,
    subject: s.subject,
    visit: s.visit,
    scan: s.scan,
    filter: s.filter.join(","),
    vfilter: s.vfilter.join(","),
  });
}

/** Where Esc from the subjects goes: the scope's own card or page. */
export function scopeHome(scope: Scope): string {
  return href("data", pageOf(scope), scope.name);
}

/** The page the scope is listed on, the first crumb. */
export function scopeList(scope: Scope): { label: string; href: string } {
  return scope.kind === "dataset" ? { label: "Datasets", href: href("data", "datasets") } : { label: "Cohorts", href: href("data", "cohorts") };
}

// ------------------------------------------------------------ the doors

export const SUBJECTS_DOOR = "GET /api/datasets/{name}/subjects";
export const VISITS_DOOR = "GET /api/datasets/{name}/subjects/{subject}/visits";
export const COHORT_SUBJECTS_DOOR = "GET /api/cohorts/{name}/subjects";
export const COHORT_VISITS_DOOR = "GET /api/cohorts/{name}/subjects/{subject}/visits";
export const COHORT_SCANS_DOOR = "GET /api/cohorts/{name}/scans";

const base = (s: Scope) => `/api/${pageOf(s)}/${encodeURIComponent(s.name)}`;

/** Whether the browser is offered: Data reading and the scope's scans door. */
export function mayBrowse(caps: Capabilities, scope: Scope): boolean {
  return may(caps, "data:see") && served(caps, scope.kind === "dataset" ? SCANS_DOOR : COHORT_SCANS_DOOR);
}

/** Whether the grid is offered: the browser's, and the subjects and visits doors. */
export function mayGrid(caps: Capabilities, scope: Scope): boolean {
  if (!mayBrowse(caps, scope)) return false;
  return scope.kind === "dataset" ? served(caps, SUBJECTS_DOOR) && served(caps, VISITS_DOOR) : served(caps, COHORT_SUBJECTS_DOOR) && served(caps, COHORT_VISITS_DOOR);
}

/** One subject as a folder card draws it. */
export interface Subject {
  id: number;
  /** The code, as this caller is shown it (a shape below detail quasi). */
  code: string;
  /** What the card is named by: the code, or the chosen ID's value; null where the subject holds none. */
  label: string | null;
  visits: number;
  scans: number;
  look: number;
  regions: string[];
  makers: string[];
  /** The roles a main scan is picked for. */
  main: string[];
}

export interface Facet {
  name: string;
  subjects: number;
}

export interface SubjectsPage {
  detail: string;
  show: string;
  totals: { subjects: number; visits: number; scans: number; look: number };
  matched: number;
  subjects: Subject[];
  next: number | null;
  facets: { makers: Facet[]; regions: Facet[]; roles: Facet[]; idTypes: Facet[] };
}

/** One visit as its card draws it. */
export interface Visit {
  /** Its key in the address: `s<session>`, or `t<study>...` where the engine keeps no session. */
  key: string;
  session: number | null;
  studies: number[];
  label: string;
  first: string | null;
  /** Days from the subject's first visit, as the engine says it (a shape below detail quasi). */
  day: string | null;
  number: number;
  scans: number;
  look: number;
  regions: string[];
  kinds: { kind: string; scans: number }[];
  contrast: boolean;
  symri: number;
  main: { role: string; stack: number; name: string }[];
}

export interface VisitsPage {
  detail: string;
  subject: { id: number; code: string; label: string | null };
  totals: { visits: number; scans: number; look: number; span: string | null };
  matched: number;
  visits: Visit[];
}

type Json = Record<string, unknown>;
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const nul = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" ? v : typeof v === "number" ? String(v) : null);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const obj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const facets = (v: unknown): Facet[] =>
  Array.isArray(v) ? v.map(obj).filter((f) => typeof f.name === "string").map((f) => ({ name: f.name as string, subjects: num(f.subjects) })) : [];

/** The subjects door's answer as the page reads it. */
export function subjectsOf(a: Json): SubjectsPage {
  const t = obj(a.totals);
  const f = obj(a.facets);
  return {
    detail: str(a.detail) ?? "plain",
    show: str(a.show) ?? "code",
    totals: { subjects: num(t.subjects), visits: num(t.visits), scans: num(t.scans), look: num(t.look) },
    matched: num(a.matched),
    subjects: (Array.isArray(a.subjects) ? a.subjects : []).map(obj).map((s) => ({
      id: num(s.id),
      code: str(s.code) ?? `Subject ${num(s.id)}`,
      label: str(s.label),
      visits: num(s.visits),
      scans: num(s.scans),
      look: num(s.look),
      regions: strs(s.regions),
      makers: strs(s.makers),
      main: strs(s.main),
    })),
    next: nul(a.next),
    facets: { makers: facets(f.makers), regions: facets(f.regions), roles: facets(f.roles), idTypes: facets(f.id_types) },
  };
}

/** A visit's key in the address. */
export function visitKey(v: { session: number | null; studies: number[] }): string {
  return v.session !== null ? `s${v.session}` : `t${v.studies.join(".")}`;
}

/** The scans door's filter for a visit key. */
export function visitFilter(key: string): Record<string, string> | null {
  if (/^s\d+$/.test(key)) return { session: key.slice(1) };
  if (/^t\d+(\.\d+)*$/.test(key)) return { studies: key.slice(1).split(".").join(",") };
  return null;
}

/** The visits door's answer as the page reads it. */
export function visitsOf(a: Json): VisitsPage {
  const t = obj(a.totals);
  const s = obj(a.subject);
  return {
    detail: str(a.detail) ?? "plain",
    subject: { id: num(s.id), code: str(s.code) ?? `Subject ${num(s.id)}`, label: str(s.label) },
    totals: { visits: num(t.visits), scans: num(t.scans), look: num(t.look), span: str(t.span) },
    matched: num(a.matched),
    visits: (Array.isArray(a.visits) ? a.visits : []).map(obj).map((v) => {
      const session = nul(v.session);
      const studies = Array.isArray(v.studies) ? v.studies.filter((x): x is number => typeof x === "number") : [];
      return {
        key: visitKey({ session, studies }),
        session,
        studies,
        label: str(v.label) ?? "ses-none",
        first: str(v.first),
        day: str(v.day),
        number: num(v.number),
        scans: num(v.scans),
        look: num(v.look),
        regions: strs(v.regions),
        kinds: (Array.isArray(v.kinds) ? v.kinds : []).map(obj).filter((k) => typeof k.kind === "string").map((k) => ({ kind: k.kind as string, scans: num(k.scans) })),
        contrast: v.contrast === true,
        symri: num(v.symri),
        main: (Array.isArray(v.main) ? v.main : []).map(obj).filter((m) => typeof m.role === "string").map((m) => ({ role: m.role as string, stack: num(m.stack), name: str(m.name) ?? "" })),
      };
    }),
  };
}

/** The pictures block of a page of scans. */
export function picturesOf(p: unknown): PagePictures | null {
  if (!p || typeof p !== "object") return null;
  const o = p as Json;
  return { shown: o.shown === true, why: str(o.why), missing: num(o.missing), partial: num(o.partial) };
}

/** Pictures still to come on a page: none made yet, or a first one while the preview is made. */
export function picturesToCome(p: PagePictures | null | undefined): number {
  return p ? p.missing + p.partial : 0;
}

/**
 * The pictures a page read again brought, filled into the page shown: a scan
 * with no picture, or a partial one, takes the new one (a partial one only
 * where it had none); nothing else moves. The same page back where nothing came.
 */
export function fillPictures(was: ScanPage, fresh: ScanPage): ScanPage {
  const pics = new Map(fresh.scans.filter((s) => s.picture !== null).map((s) => [s.id, s]));
  let changed = false;
  const scans = was.scans.map((s) => {
    const f = s.picture === null || s.partial ? pics.get(s.id) : undefined;
    if (!f || (f.partial && s.picture !== null)) return s;
    changed = true;
    return { ...s, picture: f.picture, partial: f.partial };
  });
  const missing = fresh.pictures?.missing ?? 0;
  const partial = fresh.pictures?.partial ?? 0;
  if (!changed && (was.pictures?.missing ?? 0) === missing && (was.pictures?.partial ?? 0) === partial) return was;
  return { ...was, scans, pictures: was.pictures ? { ...was.pictures, missing, partial } : fresh.pictures };
}

/** The most a page of subjects holds when the page asks. */
export const SUBJECTS_PAGE = 60;

export interface SubjectsAsk {
  q: string;
  show: string;
  order: string;
  filter: string[];
}

interface ScansAnswer {
  total: number;
  scans: ScanRow[];
  next: number | null;
  pictures?: unknown;
}

export const viewerDoors = {
  subjects: (scope: Scope, ask: SubjectsAsk, after: number | null = null): Promise<SubjectsPage> => {
    const q = new URLSearchParams({ limit: String(SUBJECTS_PAGE), order: ask.order, show: ask.show });
    if (ask.q.trim() !== "") q.set("q", ask.q.trim());
    if (ask.filter.length > 0) q.set("filter", ask.filter.join(","));
    if (after !== null) q.set("after", String(after));
    return door<Json>("GET", `${base(scope)}/subjects?${q}`).then(subjectsOf);
  },
  visits: (scope: Scope, subject: number, ask: { name: string; show: string; filter: string[] }): Promise<VisitsPage> => {
    const q = new URLSearchParams({ name: ask.name, show: ask.show });
    if (ask.filter.length > 0) q.set("filter", ask.filter.join(","));
    return door<Json>("GET", `${base(scope)}/subjects/${subject}/visits?${q}`).then(visitsOf);
  },
  /** One visit's scans with their pictures, the most a page holds. */
  visit: (scope: Scope, key: string, pictures = true, after: number | null = null): Promise<ScanPage> => {
    const f = visitFilter(key);
    if (!f) return Promise.reject(new Error("no such visit"));
    const q = new URLSearchParams({ ...f, limit: "200" });
    if (pictures) q.set("pictures", "1");
    if (after !== null) q.set("after", String(after));
    return door<ScansAnswer>("GET", `${base(scope)}/scans?${q}`).then((a) => ({
      total: a.total,
      scans: scansOf(a.scans ?? []),
      next: a.next ?? null,
      pictures: picturesOf(a.pictures),
    }));
  },
  /** A page of the scope's scans without pictures, for the browser's tree. */
  tree: (scope: Scope, after: number | null = null): Promise<ScanPage> => {
    const q = new URLSearchParams({ limit: "200" });
    if (after !== null) q.set("after", String(after));
    return door<ScansAnswer>("GET", `${base(scope)}/scans?${q}`).then((a) => ({
      total: a.total,
      scans: scansOf(a.scans ?? []),
      next: a.next ?? null,
      pictures: null,
    }));
  },
};

/** The most scans a visit is read with; past it the page says how many it shows of how many. */
export const VISIT_MOST = 2000;

/**
 * One visit's scans, every page of them up to VISIT_MOST: a visit whose
 * series the scanner wrote one image a stack holds hundreds (review of
 * 2026-10-10: a visit was read as its first page of 200 and shown as if that
 * were all). `next` stays set where the page stopped short of the visit.
 */
export async function visitAll(scope: Scope, key: string, pictures = true): Promise<ScanPage> {
  let page = await viewerDoors.visit(scope, key, pictures);
  while (page.next !== null && page.scans.length < VISIT_MOST) {
    const more = await viewerDoors.visit(scope, key, pictures, page.next);
    if (more.scans.length === 0) break;
    const sum = (k: "missing" | "partial") => (page.pictures?.[k] ?? 0) + (more.pictures?.[k] ?? 0);
    page = {
      total: page.total,
      scans: [...page.scans, ...more.scans],
      next: more.next,
      pictures: page.pictures ? { ...page.pictures, missing: sum("missing"), partial: sum("partial") } : more.pictures,
    };
  }
  return page;
}

/** The most subjects a search is kept as; a search that finds more is narrowed first. */
export const FOUND_MOST = 5000;

/**
 * Every subject a search and the filters find, by id, read a page at a time:
 * what a selection or a cohort made from a search keeps, since the typed text
 * itself is never kept. Refused past FOUND_MOST.
 */
export async function foundIds(scope: Scope, ask: SubjectsAsk): Promise<number[]> {
  const ids: number[] = [];
  let after: number | null = null;
  for (;;) {
    const page: SubjectsPage = await viewerDoors.subjects(scope, ask, after);
    ids.push(...page.subjects.map((s) => s.id));
    if (ids.length > FOUND_MOST) throw new Error(`The search finds more than ${n(FOUND_MOST)} subjects; narrow it before keeping them.`);
    if (page.next === null || page.subjects.length === 0) return ids;
    after = page.next;
  }
}

// ------------------------------------------------------------ the words

const n = (v: number) => v.toLocaleString("en-US");
export const plural = (v: number, one: string, many = `${one}s`) => `${n(v)} ${v === 1 ? one : many}`;

/** A role's word: t1w is T1w, flair FLAIR. */
export function roleWord(role: string): string {
  const known: Record<string, string> = { t1w: "T1w", t2w: "T2w", flair: "FLAIR", pdw: "PDw", dwi: "DWI", swi: "SWI" };
  return known[role.toLowerCase()] ?? role;
}

/** The ID types a person may show subjects by, with the words for them; the scanner's study UID is no person's ID. */
export function showOptions(idTypes: Facet[]): { value: string; label: string }[] {
  const words: Record<string, string> = { "study-id": "Study ID", "subject-code": "Alias", "patient-id": "Patient ID" };
  return [
    { value: "code", label: "Subject code" },
    ...idTypes
      .filter((t) => t.name !== "study-instance-uid" && t.subjects > 0)
      .map((t) => ({ value: t.name, label: words[t.name] ?? t.name.replaceAll("-", " ").replace(/^./, (c) => c.toUpperCase()) })),
  ];
}

/** A subject card's facts line: where in the body, by which maker, and a main scan the dataset picks that it lacks. */
export function subjectFacts(s: Subject, roles: string[]): string {
  const parts: string[] = [];
  if (s.regions.length > 0) parts.push(s.regions.join(", "));
  if (s.makers.length > 0) parts.push(s.makers.join(", "));
  // only where picking has run on this dataset at all
  if (s.scans > 0) for (const r of roles.filter((r) => r === "t1w" || r === "flair")) if (!s.main.includes(r)) parts.push(`no ${roleWord(r)} main`);
  return parts.join(" · ");
}

/** The filters the subjects grid offers, in their order: the ones with words, then the makers present. */
export function subjectFilters(f: SubjectsPage["facets"] | null): { key: string; label: string; caution?: boolean }[] {
  const out: { key: string; label: string; caution?: boolean }[] = [
    { key: "look", label: "with scans to look at", caution: true },
    { key: "visits2", label: "more than one visit" },
    { key: "main:t1w", label: "with a main T1w" },
    { key: "main:flair", label: "with a main FLAIR" },
    { key: "region:brain", label: "brain" },
    { key: "region:spine", label: "spine" },
  ];
  for (const m of f?.makers ?? []) out.push({ key: `maker:${m.name}`, label: m.name });
  return out;
}

/** The filters the visits grid offers. */
export const VISIT_FILTERS: { key: string; label: string; caution?: boolean }[] = [
  { key: "look", label: "with scans to look at", caution: true },
  { key: "contrast", label: "with contrast" },
  { key: "region:brain", label: "brain" },
  { key: "region:spine", label: "spine" },
  { key: "symri", label: "with SyMRI" },
];

/** A filter turned on or off in a list, the order of the offer kept. */
export function toggled(list: string[], key: string): string[] {
  return list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
}

/** What the filters keep, in words, for the line under the grid: "with more than one visit, scanned on a Siemens". */
export function filterPhrase(keys: string[]): string {
  return keys
    .map((k) => {
      if (k === "look") return "with scans to look at";
      if (k === "visits2") return "with more than one visit";
      if (k === "contrast") return "with contrast";
      if (k === "symri") return "with SyMRI";
      const [kind, value = ""] = k.split(/:(.*)/s);
      if (kind === "main") return `with a main ${roleWord(value)}`;
      if (kind === "region") return `with ${value} scans`;
      if (kind === "maker") return `scanned on a ${value}`;
      return k;
    })
    .join(", ");
}

/** The order a visit's kinds are read in: the structural weightings first, then what the scanner made, the scouts never (they sit apart, folded). */
const KIND_ORDER = ["T1w", "FLAIR", "T2w", "PDw", "T2*w", "SWI", "DWI", "Perfusion", "fMRI", "Field map", "SyMRI", "Other"];
const kindRank = (k: string) => {
  const i = KIND_ORDER.indexOf(k);
  return i < 0 ? KIND_ORDER.length : i;
};

/** A visit's kinds in words, in reading order and without the scouts: "T1w 3 · FLAIR 2 · with contrast". */
export function kindsLine(v: Pick<Visit, "kinds" | "contrast">): string {
  const parts = v.kinds
    .filter((k) => k.kind !== "Scout")
    .sort((a, b) => kindRank(a.kind) - kindRank(b.kind))
    .map((k) => `${k.kind} ${n(k.scans)}`);
  if (v.contrast) parts.push("with contrast");
  return parts.join(" · ");
}

/** The roles in the order a person names them. */
const ROLE_ORDER = ["t1w", "flair", "t2w"];
const roleRank = (r: string) => {
  const i = ROLE_ORDER.indexOf(r.toLowerCase());
  return i < 0 ? ROLE_ORDER.length : i;
};

/** A visit's main scans in words, a role each with 3D where the scan is: "T1w 3D, FLAIR 3D, T2w". */
export function mainLine(main: Visit["main"]): string {
  if (main.length === 0) return "none picked";
  return [...main]
    .sort((a, b) => roleRank(a.role) - roleRank(b.role) || a.role.localeCompare(b.role))
    .map((m) => `${roleWord(m.role)}${/(^|_)3D(_|$)/.test(m.name) ? " 3D" : ""}`)
    .join(", ");
}

/** Whether the engine answered days as numbers: below detail quasi a day is a shape (418 comes as 999), which only looks like one. */
export function daysAreNumbers(detail: string | null | undefined): boolean {
  return detail === "quasi" || detail === "sensitive";
}

/** How long a subject's visits span, in words; nothing where the engine shapes the days. */
export function spanWords(span: string | null, detail: string | null | undefined): string {
  if (span === null || !daysAreNumbers(detail) || !/^\d+$/.test(span)) return "";
  const days = Number(span);
  if (days === 0) return "";
  if (days < 62) return `over ${plural(days, "day")}`;
  const months = Math.round(days / 30.44);
  if (months < 24) return `over ${plural(months, "month")}`;
  return `over ${plural(Math.round(days / 365.25), "year")}`;
}

/** A number of milliseconds or degrees as a scan card says it: 2.26 is 2.3, 2300 is 2300. */
export function short(v: number): string {
  if (Math.abs(v) >= 100) return String(Math.round(v));
  const r = Math.round(v * 10) / 10;
  return String(r);
}

/** A scan's timing in a line: "TE 2.3 TR 2300 TI 900 FA 8"; empty where it has none. */
export function paramsWords(s: Pick<Scan, "te" | "tr" | "ti" | "fa">): string {
  const parts: string[] = [];
  for (const [k, v] of [["TE", s.te], ["TR", s.tr], ["TI", s.ti], ["FA", s.fa]] as const) if (typeof v === "number" && v > 0) parts.push(`${k} ${short(v)}`);
  return parts.join(" ");
}

// ------------------------------------------------------------ colour

export type ColourBy = "family" | "contrast" | "plane" | "nothing";
export const COLOUR_BY: { value: ColourBy; label: string }[] = [
  { value: "family", label: "Family" },
  { value: "contrast", label: "Contrast" },
  { value: "plane", label: "Plane" },
  { value: "nothing", label: "Nothing" },
];

/** A scan's family: the engine's word, else worked out from its axes as the tree does. */
export function scanFamily(s: Pick<Scan, "axes" | "family">): Family {
  return s.family ?? familyOf(s);
}

/** Whether a contrast agent was given, in words; null where it is not known. */
export function contrastOf(s: Pick<Scan, "axes">): "contrast" | "no contrast" | null {
  const v = s.axes.post_contrast;
  if (v === "1" || v === "given") return "contrast";
  if (v === "0" || v === "not_given") return "no contrast";
  return null;
}

/** The plane a scan was taken in, in words; null where not known. */
export function planeOf(s: Pick<Scan, "orientation">): string | null {
  const o = s.orientation?.toLowerCase() ?? "";
  return o === "" ? null : o;
}

const CONTRAST_SLOT: Record<string, number> = { contrast: 2, "no contrast": 1 };
const PLANE_SLOT: Record<string, number> = { axial: 1, coronal: 3, sagittal: 7 };

/** The value a card is coloured by, and its slot among the theme's value colours; none for a plain scan or a value not known. */
export function colourOf(s: Scan, by: ColourBy): { word: string; slot: number } | null {
  if (by === "contrast") {
    const c = contrastOf(s);
    return c ? { word: c, slot: CONTRAST_SLOT[c] } : null;
  }
  if (by === "plane") {
    const p = planeOf(s);
    return p ? { word: p, slot: PLANE_SLOT[p] ?? 10 } : null;
  }
  if (by === "family") {
    const f = scanFamily(s);
    const slot = FAMILY_SLOT[f];
    return slot === null ? null : { word: FAMILY_WORD[f], slot };
  }
  return null;
}

/** The values a page's cards are coloured by, each once, for the legend. */
export function legendOf(scans: Scan[], by: ColourBy): { word: string; slot: number }[] {
  const seen = new Map<string, number>();
  for (const s of scans) {
    const c = colourOf(s, by);
    if (c && !seen.has(c.word)) seen.set(c.word, c.slot);
  }
  return [...seen].map(([word, slot]) => ({ word, slot })).sort((a, b) => a.slot - b.slot);
}

// ------------------------------------------------------------ a visit's folders

/** The datatype folders of a visit, in BIDS's order; scouts and the rest last, folded at first. */
export const FOLDERS: { key: string; label: string }[] = [
  { key: "anat", label: "anat" },
  { key: "dwi", label: "dwi" },
  { key: "func", label: "func" },
  { key: "fmap", label: "fmap" },
  { key: "perf", label: "perf" },
  { key: "other", label: "scouts and other" },
];

export interface FolderGroup {
  family: Family;
  scans: Scan[];
}
export interface Folder {
  key: string;
  label: string;
  scans: number;
  main: number;
  look: number;
  groups: FolderGroup[];
}

/** A visit's scans in folders by datatype, each folder's scans in families (the plain ones first), in the order the tree sorts them. */
export function foldersOf(scans: Scan[], compare: (a: Scan, b: Scan) => number): Folder[] {
  const out: Folder[] = [];
  for (const f of FOLDERS) {
    const mine = scans.filter((s) => (FOLDERS.some((x) => x.key === s.datatype) ? s.datatype : "other") === f.key).sort(compare);
    if (mine.length === 0) continue;
    const groups: FolderGroup[] = [];
    for (const s of mine) {
      const fam = scanFamily(s);
      const last = groups[groups.length - 1];
      if (last && last.family === fam) last.scans.push(s);
      else groups.push({ family: fam, scans: [s] });
    }
    out.push({
      key: f.key,
      label: f.label,
      scans: mine.length,
      main: mine.filter((s) => (s.main ?? []).length > 0).length,
      look: mine.filter(needsLook).length,
      groups,
    });
  }
  return out;
}

// ------------------------------------------------------------ the keys

/** A card's place on the screen, as the arrows read it. */
export interface Spot {
  x: number;
  y: number;
}

/**
 * Where an arrow takes the cursor among cards laid out in rows: left and
 * right to the card before and after, up and down to the nearest card in the
 * row above or below (rows are the cards whose tops are within a few pixels).
 * The same index where it can go no further.
 */
export function step(spots: Spot[], at: number, key: "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown"): number {
  if (spots.length === 0) return -1;
  if (at < 0 || at >= spots.length) return 0;
  if (key === "ArrowLeft") return Math.max(0, at - 1);
  if (key === "ArrowRight") return Math.min(spots.length - 1, at + 1);
  const here = spots[at];
  const down = key === "ArrowDown";
  const rows = spots.map((s, i) => ({ s, i })).filter(({ s }) => (down ? s.y > here.y + 4 : s.y < here.y - 4));
  if (rows.length === 0) return at;
  const nextY = down ? Math.min(...rows.map(({ s }) => s.y)) : Math.max(...rows.map(({ s }) => s.y));
  const row = rows.filter(({ s }) => Math.abs(s.y - nextY) <= 4);
  row.sort((a, b) => Math.abs(a.s.x - here.x) - Math.abs(b.s.x - here.x) || a.i - b.i);
  return row[0].i;
}

// ------------------------------------------------------------ what a viewer keeps

/** A person's choices that hold from visit to visit, each in this browser alone. */
export const KEPT = {
  show: "nils.viewer.show",
  visits: "nils.viewer.visits",
  order: "nils.viewer.order",
  colour: "nils.viewer.colour",
  names: "nils.dataset-view.names",
} as const;

export function kept<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v !== null && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}

export function keep(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // the choice holds for this visit
  }
}

/** A kept choice that is free text (an ID type's name). */
export function keptText(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

// ------------------------------------------------------------ what the page holds in memory

interface Held {
  at: number;
  value: unknown;
}
const held = new Map<string, Held>();
/** How long a list read is shown again as it was before it is read anew. */
export const HELD_MS = 60_000;

/** A list read lately, shown at once when a person comes back to it; null where none is held or it is old. */
export function heldValue<T>(key: string): T | null {
  const h = held.get(key);
  return h && Date.now() - h.at < HELD_MS ? (h.value as T) : null;
}

/** A list kept for coming back to; the oldest let go past sixty-four. */
export function hold(key: string, value: unknown): void {
  held.delete(key);
  held.set(key, { at: Date.now(), value });
  while (held.size > 64) held.delete(held.keys().next().value as string);
}

/** Everything let go (a test). */
export function forgetHeld(): void {
  held.clear();
  last.clear();
  searches.clear();
  downs = [];
  searchAsked = false;
}

const scopeKey = (s: Scope) => `${s.kind}:${s.name}`;
export const subjectsKey = (s: Scope, a: SubjectsAsk) => `subjects|${scopeKey(s)}|${a.q.trim()}|${a.show}|${a.order}|${a.filter.join(",")}`;
export const visitsKey = (s: Scope, subject: number, a: { name: string; show: string; filter: string[] }) => `visits|${scopeKey(s)}|${subject}|${a.name}|${a.show}|${a.filter.join(",")}`;
export const scansKey = (s: Scope, visit: string) => `scans|${scopeKey(s)}|${visit}`;

/** Where the cursor was on a level, so coming back up finds it: the subject last opened in a scope, the visit last opened of a subject. */
const last = new Map<string, string>();
export function lastAt(key: string): string | null {
  return last.get(key) ?? null;
}
export function setLastAt(key: string, value: string): void {
  last.set(key, value);
}
export const lastSubjectKey = (s: Scope) => `subject|${scopeKey(s)}`;
export const lastVisitKey = (s: Scope, subject: number) => `visit|${scopeKey(s)}|${subject}`;
export const lastScanKey = (s: Scope, visit: string) => `scan|${scopeKey(s)}|${visit}`;

/** An address without the scan it names: the grid's level is the same whichever scan its cursor is on. */
export const levelOfForTest = (hash: string) => levelOf(hash);
function levelOf(hash: string): string {
  const r = parse(hash);
  const v = parseView(r.query);
  return JSON.stringify([r.section, r.page, r.arg, r.sub, v.mode, v.subject, v.visit, v.filter, v.vfilter]);
}

/** The steps down a person took, the last on top, so each Esc goes back up one rather than adding a page to the history. */
let downs: { from: string; to: string }[] = [];

/** A step down from the address shown now to `to`. */
export function steppingDown(to: string): void {
  downs.push({ from: location.hash, to });
  if (downs.length > 16) downs = downs.slice(-16);
}

/** The search was asked for from a level below the subjects: the subjects' page focuses it when it opens. */
let searchAsked = false;
export function askSearch(): void {
  searchAsked = true;
}
export function takeSearch(): boolean {
  const was = searchAsked;
  searchAsked = false;
  return was;
}

/** Whether a key went to a dialog over the page, which takes its own keys: none of them moves the page. */
export function inDialog(t: EventTarget | null): boolean {
  return !!(t as HTMLElement | null)?.closest?.("dialog");
}

/** Whether the side is open over the page (the browser's sections, a narrow window's menu): its Esc closes it and goes nowhere. */
export function sideOpen(): boolean {
  return typeof document !== "undefined" && document.querySelector(".side.open") !== null;
}

/** Up a level: back where the person came down from it, else to the level above. */
export function goUp(parent: string): void {
  if (sideOpen()) return;
  const down = downs[downs.length - 1];
  // the browser turns its scan in place, so a step down is the same step whichever scan it shows now
  if (down && levelOf(down.from) === levelOf(parent) && levelOf(down.to) === levelOf(location.hash)) {
    downs.pop();
    history.back();
    return;
  }
  downs = [];
  location.hash = parent;
}

/** The visit a scan belongs to, as the address names it: its session, else the visit read for its subject that holds its study, else its study. */
export function visitOfScan(s: Pick<Scan, "session" | "study">, visits: Visit[] | null = null): string | null {
  if (s.session !== null) return `s${s.session}`;
  if (s.study === null || s.study === undefined) return null;
  const v = visits?.find((x) => x.studies.includes(s.study as number));
  return v ? v.key : `t${s.study}`;
}
