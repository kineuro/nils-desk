// SPDX-License-Identifier: AGPL-3.0-only
// Main scans (record 55, decision 6 of 2026-10-10): a dataset's or a
// cohort's own rules for which scan stands for each role, and the doors that
// show what they keep and give up before they are saved. Per role, the kind
// of scan first (how scans are kept alike, the kinds in order, what is
// allowed), then NILS picks within the kind per visit. The rules are
// versioned, start as the pack's defaults, and are saved with a reason; a
// draft lives in the browser until then, and every change asks the map door
// what it would do. The engine's fields say sessions and stacks; the page
// says visits and scans.

import { door, DoorError, type Json } from "../ask/client";

// ---------------------------------------------------------------- the scope

export type ScopeKind = "dataset" | "cohort";

/** What the page is about: one dataset or one cohort, by name. */
export interface Scope {
  kind: ScopeKind;
  name: string;
}

/** The scope a page address names, `?cohort=NAME` or `?dataset=NAME`; none when it names neither. */
export function scopeOf(query?: Record<string, string>): Scope | null {
  const cohort = query?.cohort?.trim();
  if (cohort) return { kind: "cohort", name: cohort };
  const dataset = query?.dataset?.trim();
  if (dataset) return { kind: "dataset", name: dataset };
  return null;
}

/** The scope as a door's query names it. */
export const scopeParam = (s: Scope): string => `${s.kind}=${encodeURIComponent(s.name)}`;

/** The scope as a door's body names it. */
export const scopeBody = (s: Scope): Json => (s.kind === "cohort" ? { cohort: s.name } : { dataset: s.name });

export const scopeKey = (s: Scope): string => `${s.kind}:${s.name}`;

// ---------------------------------------------------------------- the rules

export type KeepAlike = "within_each_subject" | "across_the_data" | "balanced";
export type Contrast = "either" | "without" | "with";
export type Dimension = "any" | "3d";
export type BodyPart = "brain" | "any";

/** One role's rules: how its kinds are kept alike, their order, and what is allowed. */
export interface RoleRules {
  keep_alike: KeepAlike;
  /** Kind keys, the order a visit takes them in. A kind switched off keeps its place here and is named in not_used too. */
  kinds_in_order: string[];
  not_used: string[];
  contrast: Contrast;
  dimension: Dimension;
  body_part: BodyPart;
  /** Null is any thickness. */
  slice_thickness_at_most_mm: number | null;
  [key: string]: unknown;
}

export interface Weights {
  slice_count: number;
  field_of_view: number;
  modifiers: number;
  orientation: number;
  completeness: number;
  [key: string]: number;
}

/** How two scans of one kind in a visit are told apart. */
export interface SameKind {
  weights: Weights;
  derived_series_scores: number;
  near_tie_within_percent: number;
  near_tie_goes_to: string[];
  [key: string]: unknown;
}

/** A dataset's or a cohort's rules document, as the engine stores it (JSON) and shows it (YAML). */
export interface Rules {
  roles: Record<string, RoleRules>;
  same_kind_in_one_visit: SameKind;
  [key: string]: unknown;
}

export const KEEP_ALIKE: { key: KeepAlike; words: string; line: string }[] = [
  { key: "within_each_subject", words: "Within each subject", line: "Each subject keeps the kind it has at most visits." },
  { key: "across_the_data", words: "Across the data", line: "Every visit takes the first kind it has, in the rules' order." },
  { key: "balanced", words: "Balanced: the data first, then each subject", line: "The data's order first; a subject keeps one kind where one covers all its visits." },
];

export const WEIGHTS: { key: keyof Weights & string; words: string }[] = [
  { key: "slice_count", words: "Slice count" },
  { key: "field_of_view", words: "Field of view" },
  { key: "modifiers", words: "Modifiers" },
  { key: "orientation", words: "Orientation" },
  { key: "completeness", words: "Completeness" },
];

/** The tie keys of section 3, in words. */
export const TIE_WORDS: Record<string, string> = {
  axial_coronal_sagittal: "Axial, then coronal, then sagittal",
  thinner_slices: "Thinner slices",
  default_reconstruction: "The scanner's default reconstruction",
  later_full_repeat: "Of two full repeats, the later",
  earlier_series: "The earlier series",
};

export const tieWords = (key: string): string => TIE_WORDS[key] ?? key.replace(/_/gu, " ");

const KEEPS: readonly string[] = KEEP_ALIKE.map((k) => k.key);
const DEFAULT_WEIGHTS: Weights = { slice_count: 0.2, field_of_view: 0.1, modifiers: 0.12, orientation: 0.05, completeness: 0.05 };
const DEFAULT_TIES = Object.keys(TIE_WORDS);

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const count = (v: unknown): number => {
  const n = num(v);
  return n !== null && n > 0 ? n : 0;
};
const text = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const texts = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const ints = (v: unknown): number[] => (Array.isArray(v) ? v.filter((x): x is number => typeof x === "number" && Number.isInteger(x)) : []);
/** A kind as the doors name it, `null` for no pick. */
const kindOf = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

export const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function roleRulesOf(raw: unknown): RoleRules {
  const r = obj(raw);
  const keep = text(r.keep_alike);
  const contrast = text(r.contrast);
  const dimension = text(r.dimension);
  const body = text(r.body_part);
  const mm = num(r.slice_thickness_at_most_mm);
  return {
    ...clone(r),
    keep_alike: keep && KEEPS.includes(keep) ? (keep as KeepAlike) : "balanced",
    kinds_in_order: texts(r.kinds_in_order),
    not_used: texts(r.not_used),
    contrast: contrast === "without" || contrast === "with" ? contrast : "either",
    dimension: dimension === "3d" ? "3d" : "any",
    body_part: body === "any" ? "any" : "brain",
    slice_thickness_at_most_mm: mm,
  };
}

/** The rules as the engine answered them, every field there: what it left out takes the pack's default, and what the desk does not know is kept as it came. */
export function rulesOf(raw: unknown): Rules {
  const r = obj(raw);
  const roles = Object.fromEntries(Object.entries(obj(r.roles)).map(([role, v]) => [role, roleRulesOf(v)]));
  const s = obj(r.same_kind_in_one_visit);
  const w = obj(s.weights);
  const weights = { ...DEFAULT_WEIGHTS } as Weights;
  for (const [k, v] of Object.entries(w)) if (num(v) !== null) weights[k] = v as number;
  const ties = texts(s.near_tie_goes_to);
  return {
    ...clone(r),
    roles,
    same_kind_in_one_visit: {
      ...clone(s),
      weights,
      derived_series_scores: num(s.derived_series_scores) ?? 0.5,
      near_tie_within_percent: num(s.near_tie_within_percent) ?? 5,
      near_tie_goes_to: ties.length > 0 ? ties : [...DEFAULT_TIES],
    },
  };
}

/** One JSON text for a value whatever the order of its keys, so two rules documents compare by what they say. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as Raw)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Raw)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v === undefined ? null : v);
}

export const sameRules = (a: Rules, b: Rules): boolean => canonical(a) === canonical(b);

/** The roles in the order the desk shows them: the usual ones first. */
export function rolesOf(rules: Rules): string[] {
  const order = ["t1w", "flair", "t2w", "dwi", "swi"];
  const at = (r: string) => {
    const i = order.indexOf(r.toLowerCase());
    return i < 0 ? 99 : i;
  };
  return Object.keys(rules.roles).sort((a, b) => at(a) - at(b) || a.localeCompare(b));
}

/** A role's word on the page: T1w, FLAIR. */
export function roleWord(role: string): string {
  const known: Record<string, string> = { t1w: "T1w", t2w: "T2w", flair: "FLAIR", dwi: "DWI", swi: "SWI", pdw: "PDw" };
  return known[role.toLowerCase()] ?? role;
}

/**
 * A role's kinds in the order the rules take them: the list's own, then a
 * kind switched off that the list does not name, then the kinds the data
 * holds that the rules name nowhere, which come last, used, and new.
 */
export function kindsOrder(rr: Pick<RoleRules, "kinds_in_order" | "not_used">, held: readonly string[]): string[] {
  const out: string[] = [];
  for (const k of [...rr.kinds_in_order, ...rr.not_used, ...held]) if (!out.includes(k)) out.push(k);
  return out;
}

/** A kind of the data the saved rules name nowhere: it comes last, used, and the panel marks it new. */
export const isNewKind = (saved: Pick<RoleRules, "kinds_in_order" | "not_used"> | undefined, kind: string): boolean =>
  !saved || (!saved.kinds_in_order.includes(kind) && !saved.not_used.includes(kind));

/** A draft changed by one edit, the rules it came from untouched. */
export function edited(rules: Rules, change: (r: Rules) => void): Rules {
  const next = clone(rules);
  change(next);
  return next;
}

/** One kind moved up or down among the ones shown, its whole order written into the draft so a new kind keeps its place. */
export function moveKind(rules: Rules, role: string, held: readonly string[], kind: string, dir: -1 | 1, shown?: readonly string[]): Rules {
  const rr = rules.roles[role];
  if (!rr) return rules;
  const full = kindsOrder(rr, held);
  const among = shown ?? full;
  const i = among.indexOf(kind);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= among.length) return rules;
  const other = among[j];
  return edited(rules, (r) => {
    const order = full.filter((k) => k !== kind);
    const at = order.indexOf(other);
    order.splice(dir < 0 ? at : at + 1, 0, kind);
    r.roles[role].kinds_in_order = order;
  });
}

/** One kind switched off or on again; it keeps its place in the order. */
export function toggleKind(rules: Rules, role: string, held: readonly string[], kind: string): Rules {
  const rr = rules.roles[role];
  if (!rr) return rules;
  const full = kindsOrder(rr, held);
  return edited(rules, (r) => {
    const x = r.roles[role];
    x.kinds_in_order = full;
    x.not_used = x.not_used.includes(kind) ? x.not_used.filter((k) => k !== kind) : [...x.not_used, kind];
  });
}

/** A tie key moved up or down. */
export function moveTie(rules: Rules, key: string, dir: -1 | 1): Rules {
  const order = rules.same_kind_in_one_visit.near_tie_goes_to;
  const i = order.indexOf(key);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return rules;
  return edited(rules, (r) => {
    const o = r.same_kind_in_one_visit.near_tie_goes_to;
    [o[i], o[j]] = [o[j], o[i]];
  });
}

/** Whether a role has kinds with contrast, so contrast is asked of it. */
export const hasContrastKinds = (kinds: readonly string[]): boolean => kinds.some((k) => /\+C$/u.test(k.trim()));

// ---------------------------------------------------------------- the versions

export interface RulesVersion {
  version: number;
  reason: string;
  author: string | null;
  at: string | null;
}

export interface CurrentRules extends RulesVersion {
  /** False for version 1 while nothing is saved: the pack's defaults. */
  saved: boolean;
  digest: string | null;
  rules: Rules;
}

/** `GET /api/picks/rules`: the rules in force for the scope and the versions saved. */
export interface RulesDoc {
  pack: { name: string; version: string } | null;
  current: CurrentRules;
  versions: RulesVersion[];
}

const versionOf = (raw: unknown): RulesVersion => {
  const v = obj(raw);
  return { version: count(v.version) || 1, reason: text(v.reason) ?? "", author: text(v.author), at: text(v.at) };
};

export function rulesDocOf(raw: unknown): RulesDoc {
  const a = obj(raw);
  const c = obj(a.current);
  const pack = obj(a.pack);
  const current: CurrentRules = { ...versionOf(c), saved: c.saved === true, digest: text(c.digest), rules: rulesOf(c.rules) };
  if (!current.reason && !current.saved) current.reason = "the pack's defaults";
  const versions = (Array.isArray(a.versions) ? a.versions : []).map(versionOf);
  if (!versions.some((v) => v.version === current.version)) versions.push({ version: current.version, reason: current.reason, author: current.author, at: current.at });
  versions.sort((x, y) => y.version - x.version);
  return { pack: text(pack.name) ? { name: text(pack.name) as string, version: text(pack.version) ?? "" } : null, current, versions };
}

/** The versions in one line, newest first, as the panel's foot says them. */
export function versionsWords(versions: readonly RulesVersion[]): string {
  const said = versions.map((v) => `Version ${v.version}: ${v.reason || "no reason given"}`).join(" · ");
  return said ? `${said}. A release records its version.` : "";
}

// ---------------------------------------------------------------- the map

export type Columns = "scanner" | "dataset";

export interface MapKind {
  key: string;
  visits_with: number;
  visits_taken: number;
  allowed: boolean;
  used: boolean;
  new: boolean;
}

export interface Metrics {
  visits: number;
  visits_taken: number;
  subjects: number;
  subjects_taken: number;
  alike_data: { kind: string | null; visits: number };
  alike_within: { subjects: number; of: number };
  series_complete: { subjects: number; of: number };
}

export interface MapAnswer {
  role: string;
  rules_version: number | null;
  kinds: MapKind[];
  metrics: Metrics;
  columns: { key: string; visits: number }[];
  matrix: { kind: string | null; cells: number[] }[];
  series: { steps: (string | null)[]; subjects: number }[];
  single_visit_subjects: number;
  by_visit: { visit: number; visits: number; kinds: { kind: string | null; visits: number }[] }[];
  /** With a draft: what saving it would change, against the saved version. */
  effect: { visits_changed: number; subjects_changed: number; before: Metrics } | null;
}

export function metricsOf(raw: unknown): Metrics {
  const m = obj(raw);
  const d = obj(m.alike_data);
  const w = obj(m.alike_within);
  const s = obj(m.series_complete);
  return {
    visits: count(m.visits),
    visits_taken: count(m.visits_taken),
    subjects: count(m.subjects),
    subjects_taken: count(m.subjects_taken),
    alike_data: { kind: kindOf(d.kind), visits: count(d.visits) },
    alike_within: { subjects: count(w.subjects), of: count(w.of) },
    series_complete: { subjects: count(s.subjects), of: count(s.of) },
  };
}

export function mapOf(raw: unknown): MapAnswer {
  const a = obj(raw);
  const columns = (Array.isArray(a.columns) ? a.columns : []).map((c) => (typeof c === "string" ? { key: c, visits: 0 } : { key: text(obj(c).key) ?? "", visits: count(obj(c).visits) }));
  const e = a.effect && typeof a.effect === "object" ? obj(a.effect) : null;
  return {
    role: text(a.role) ?? "",
    rules_version: num(a.rules_version),
    kinds: (Array.isArray(a.kinds) ? a.kinds : [])
      .map(obj)
      .filter((k) => text(k.key) !== null)
      .map((k) => ({ key: k.key as string, visits_with: count(k.visits_with), visits_taken: count(k.visits_taken), allowed: k.allowed !== false, used: k.used !== false, new: k.new === true })),
    metrics: metricsOf(a.metrics),
    columns,
    matrix: (Array.isArray(a.matrix) ? a.matrix : []).map(obj).map((r) => ({ kind: kindOf(r.kind), cells: columns.map((_, i) => count((Array.isArray(r.cells) ? r.cells : [])[i])) })),
    series: (Array.isArray(a.series) ? a.series : [])
      .map(obj)
      .map((r) => ({ steps: (Array.isArray(r.steps) ? r.steps : []).map(kindOf), subjects: count(r.subjects) }))
      .filter((r) => r.steps.length > 0)
      .sort((x, y) => y.subjects - x.subjects),
    single_visit_subjects: count(a.single_visit_subjects),
    by_visit: (Array.isArray(a.by_visit) ? a.by_visit : [])
      .map(obj)
      .map((r) => ({ visit: count(r.visit), visits: count(r.visits), kinds: (Array.isArray(r.kinds) ? r.kinds : []).map(obj).map((k) => ({ kind: kindOf(k.kind), visits: count(k.visits) })) }))
      .sort((x, y) => x.visit - y.visit),
    effect: e ? { visits_changed: count(e.visits_changed), subjects_changed: count(e.subjects_changed), before: metricsOf(e.before) } : null,
  };
}

// ---------------------------------------------------------------- the subjects

/** Which subjects the page shows: those whose kind changes between visits, those of one series, or those of one cell of where the kinds come from. */
export type Group = { by: "breaks" } | { by: "series"; steps: (string | null)[] } | { by: "cell"; kind: string | null; column: string };
export type Order = "changes" | "visits";

export const PER_PAGE = 24;

/** One candidate of a visit, where the engine names them. */
export interface VisitCandidate {
  stacks: number[];
  kind: string | null;
  score: number | null;
}

export interface MapVisit {
  /** The engine's id of the visit, which a pick names; never its date. */
  sessionId: number | null;
  visit: number;
  column: string | null;
  field: string | null;
  kind: string | null;
  /** The scans picked: none where nothing is. */
  stacks: number[];
  /** Who picked: the rules or a person. */
  by: string | null;
  /** The draft picks this visit otherwise than the saved rules do. */
  redrawn: boolean;
  /** The pick's own id, where the engine gives it, so a person's pick can be withdrawn. */
  pick: number | null;
  why: string | null;
  /** The visit's candidates for the role, where the engine names them; null where it does not. */
  candidates: VisitCandidate[] | null;
}

export interface MapSubject {
  subject_id: number;
  subject: string;
  visits: MapVisit[];
}

export interface SubjectsPage {
  total: number;
  page: number;
  per_page: number;
  subjects: MapSubject[];
}

function visitOf(raw: unknown, i: number): MapVisit {
  const v = obj(raw);
  const stacks = ints(v.stacks);
  const one = num(v.stack);
  return {
    sessionId: num(v.session_id),
    visit: count(v.visit) || i + 1,
    column: text(v.column),
    field: text(v.field),
    kind: kindOf(v.kind),
    stacks: stacks.length > 0 ? stacks : one !== null ? [one] : [],
    by: text(v.by),
    redrawn: v.changed === true,
    pick: num(v.pick) ?? num(v.pick_id),
    why: text(v.why),
    candidates: Array.isArray(v.candidates)
      ? v.candidates
          .map(obj)
          .map((c) => ({ stacks: ints(c.stacks).length > 0 ? ints(c.stacks) : num(c.stack) !== null ? [num(c.stack) as number] : [], kind: kindOf(c.kind), score: num(c.score) }))
          .filter((c) => c.stacks.length > 0)
      : null,
  };
}

export function subjectsOf(raw: unknown): SubjectsPage {
  const a = obj(raw);
  return {
    total: count(a.total),
    page: count(a.page),
    per_page: count(a.per_page) || PER_PAGE,
    subjects: (Array.isArray(a.subjects) ? a.subjects : []).map(obj).map((s) => ({
      subject_id: count(s.subject_id),
      subject: text(s.subject) ?? String(count(s.subject_id)),
      visits: (Array.isArray(s.visits) ? s.visits : []).map(visitOf),
    })),
  };
}

/** Every subject's kinds per visit, compactly: a kind by its place in `kinds`, -1 for no pick. */
export interface Strips {
  kinds: string[];
  columns: string[];
  subjects: { subject_id: number; column: number; visits: number[] }[];
}

export function stripsOf(raw: unknown): Strips {
  const a = obj(raw);
  return {
    kinds: texts(a.kinds),
    columns: (Array.isArray(a.columns) ? a.columns : []).map((c) => (typeof c === "string" ? c : (text(obj(c).key) ?? ""))),
    subjects: (Array.isArray(a.subjects) ? a.subjects : []).map(obj).map((s) => ({ subject_id: count(s.subject_id), column: num(s.column) ?? -1, visits: (Array.isArray(s.visits) ? s.visits : []).map((v) => (typeof v === "number" && Number.isInteger(v) ? v : -1)) })),
  };
}

/** A strip's kinds by visit, null where nothing is picked. */
export const stripKinds = (strips: Pick<Strips, "kinds">, visits: readonly number[]): (string | null)[] => visits.map((i) => (i >= 0 && i < strips.kinds.length ? strips.kinds[i] : null));

/** A subject's series: its kinds visit by visit, repeats folded, a visit with no pick left out, as the engine counts series. */
export function runOf(kinds: readonly (string | null)[]): string[] {
  const out: string[] = [];
  for (const k of kinds) if (k !== null && out[out.length - 1] !== k) out.push(k);
  return out;
}

/** Visit by visit, whether its kind differs from the last visit before it that has a pick. */
export function kindChanges(kinds: readonly (string | null)[]): boolean[] {
  let last: string | null = null;
  return kinds.map((k) => {
    if (k === null) return false;
    const changed = last !== null && last !== k;
    last = k;
    return changed;
  });
}

const sameSteps = (a: readonly (string | null)[], b: readonly (string | null)[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * The subjects of the strips a group lights, as the engine groups them:
 * breaks are two kinds or more and series leave out the visits with no
 * pick; a cell is read from a strip's own column (the one most of its
 * visits are at), since a strip carries one column for its subject.
 */
export function litOf(strips: Strips, g: Group): Set<number> {
  const out = new Set<number>();
  const columnAt = g.by === "cell" ? strips.columns.indexOf(g.column) : -1;
  for (const s of strips.subjects) {
    const kinds = stripKinds(strips, s.visits);
    const hit =
      g.by === "breaks"
        ? new Set(kinds.filter((k) => k !== null)).size >= 2
        : g.by === "series"
          ? kinds.length > 1 && sameSteps(runOf(kinds), g.steps)
          : (columnAt < 0 || s.column === columnAt) && kinds.some((k) => k === g.kind);
    if (hit) out.add(s.subject_id);
  }
  return out;
}

export const stepWord = (k: string | null): string => k ?? "none";

/** What the group shows, as its title says it. */
export function groupTitle(g: Group): string {
  if (g.by === "series") return `Subjects whose series is ${g.steps.map(stepWord).join(" then ")}`;
  if (g.by === "cell") return `Subjects with a visit at ${g.column} taking ${g.kind ?? "nothing"}`;
  return "Subjects whose series breaks";
}

export const sameGroup = (a: Group, b: Group): boolean => canonical(a) === canonical(b);

// ---------------------------------------------------------------- the five numbers

export type NumberKey = "visits" | "subjects" | "data" | "within" | "series";

/** What a way of keeping alike keeps, and what it gives up. */
export function keptBy(k: KeepAlike): { kept: NumberKey[]; given: NumberKey[] } {
  if (k === "across_the_data") return { kept: ["data"], given: ["within"] };
  if (k === "within_each_subject") return { kept: ["within", "series"], given: ["data"] };
  return { kept: ["data", "within"], given: [] };
}

/** A share in whole percent, null where there is nothing to share. */
export const pct = (part: number, of: number): number | null => (of > 0 ? Math.round((part / of) * 100) : null);

export const pctWords = (p: number | null): string => (p === null ? "none" : `${p} %`);

const n = (v: number) => v.toLocaleString("en-US");

export interface NumberLine {
  key: NumberKey;
  label: string;
  value: number | null;
  sub: string;
}

/** The five numbers of a role's map. */
export function numbersOf(m: Metrics, role: string): NumberLine[] {
  return [
    { key: "visits", label: "Visits", value: pct(m.visits_taken, m.visits), sub: `${n(m.visits_taken)} of ${n(m.visits)} have a ${roleWord(role)}` },
    { key: "subjects", label: "Subjects", value: pct(m.subjects_taken, m.subjects), sub: `${n(m.subjects_taken)} of ${n(m.subjects)} have one at some visit` },
    { key: "data", label: "Alike across the data", value: pct(m.alike_data.visits, m.visits_taken), sub: `of visits take ${m.alike_data.kind ?? "nothing"}` },
    { key: "within", label: "Alike within subjects", value: pct(m.alike_within.subjects, m.alike_within.of), sub: "of subjects with repeat visits keep one kind" },
    { key: "series", label: "Series complete", value: pct(m.series_complete.subjects, m.series_complete.of), sub: `${n(m.series_complete.subjects)} of ${n(m.series_complete.of)} have one at every visit` },
  ];
}

export interface EffectRow {
  label: string;
  before: number | null;
  after: number | null;
  /** Which way it went. */
  way: "up" | "down" | "same";
}

/** The five numbers before and after the draft. */
export function effectRows(before: Metrics, after: Metrics, role: string): EffectRow[] {
  const b = numbersOf(before, role);
  return numbersOf(after, role).map((a, i) => {
    const was = b[i].value;
    const way = a.value === null || was === null || a.value === was ? "same" : a.value > was ? "up" : "down";
    return { label: a.label, before: was, after: a.value, way };
  });
}

/** What saving the draft changes, in one line. */
export function effectWords(e: { visits_changed: number; subjects_changed: number }): string {
  const v = e.visits_changed === 1 ? "1 visit changes its pick" : `${n(e.visits_changed)} visits change their pick`;
  const s = e.subjects_changed === 1 ? "1 subject its series" : `${n(e.subjects_changed)} subjects their series`;
  return `${v} · ${s}`;
}

// ---------------------------------------------------------------- the colours

/**
 * A role's kinds in the order they take their colours: the saved rules'
 * order, then the kinds the data holds as the map lists them. Only ever
 * added to, so a kind keeps its colour while the draft moves it.
 */
export function paletteOf(was: readonly string[], saved: readonly string[], held: readonly string[]): string[] {
  const out = [...was];
  for (const k of [...saved.filter((x) => held.includes(x)), ...held]) if (!out.includes(k)) out.push(k);
  return out;
}

// ---------------------------------------------------------------- the doors

export const RULES_DOOR = "GET /api/picks/rules";
export const RULES_TEXT_DOOR = "GET /api/picks/rules/text";
export const RULES_SAVE_DOOR = "POST /api/picks/rules";
export const MAP_DOOR = "POST /api/picks/map";
export const MAP_SUBJECTS_DOOR = "POST /api/picks/map/subjects";
export const MAP_STRIPS_DOOR = "POST /api/picks/map/strips";

/** A door that answers text (the rules as YAML); a refusal is read as the JSON doors' are. */
async function textDoor(path: string): Promise<string> {
  const r = await fetch(path, { method: "GET", headers: { accept: "text/yaml", "X-Nils-Desk": "1" } });
  const body = await r.text();
  if (!r.ok) {
    let said: Json = {};
    try {
      said = body ? (JSON.parse(body) as Json) : {};
    } catch {
      said = { error: body };
    }
    throw new DoorError(r.status, said);
  }
  return body;
}

export interface Saved {
  version: number;
  job: number | null;
}

export const mainScans = {
  rules: (s: Scope) => door<unknown>("GET", `/api/picks/rules?${scopeParam(s)}`).then(rulesDocOf),
  text: (s: Scope, version: number) => textDoor(`/api/picks/rules/text?${scopeParam(s)}&version=${version}`),
  save: (s: Scope, rules: Rules, reason: string, basedOn: number) =>
    door<unknown>("POST", `/api/picks/rules?${scopeParam(s)}`, { rules, reason: reason.trim(), based_on: basedOn }).then((a): Saved => ({ version: count(obj(a).version), job: num(obj(a).job) })),
  map: (s: Scope, role: string, columns: Columns, rules: Rules | null) =>
    door<unknown>("POST", "/api/picks/map", { scope: scopeBody(s), role, columns, ...(rules ? { rules } : {}) }).then(mapOf),
  /** A cell names its column in the columns asked by, so the subjects and the strips are asked by the same ones as the map. */
  subjects: (s: Scope, role: string, columns: Columns, group: Group, order: Order, page: number, rules: Rules | null, perPage = PER_PAGE) =>
    door<unknown>("POST", "/api/picks/map/subjects", { scope: scopeBody(s), role, columns, group, order, page, per_page: perPage, ...(rules ? { rules } : {}) }).then(subjectsOf),
  strips: (s: Scope, role: string, columns: Columns, rules: Rules | null) =>
    door<unknown>("POST", "/api/picks/map/strips", { scope: scopeBody(s), role, columns, ...(rules ? { rules } : {}) }).then(stripsOf),
  /** A person's pick of one visit, in the scope: it stands through later runs of the scope's rules. No scans is "no scan for this visit". */
  pick: (s: Scope, role: string, visit: { subject_id: number; session_id: number | null }, stacks: number[], why: string) =>
    door<{ id: number; stacks: number[] }>("POST", "/api/picks", { role, stacks, why: why.trim(), subject_id: visit.subject_id, ...(visit.session_id !== null ? { session_id: visit.session_id } : {}), ...scopeBody(s) }),
  withdraw: (s: Scope, id: number, why?: string) => door<{ id: number }>("POST", `/api/picks/${id}/withdraw`, { ...scopeBody(s), ...(why && why.trim() ? { why: why.trim() } : {}) }),
};

/** Why a save was refused, as the panel says it. */
export type SaveRefusal = { kind: "stale" } | { kind: "field"; field: string | null; words: string } | { kind: "reason" } | { kind: "other"; words: string };

export function saveRefusal(e: unknown): SaveRefusal {
  if (e instanceof DoorError) {
    const said = typeof e.body.error === "string" ? e.body.error : "";
    if (e.status === 409) return { kind: "stale" };
    if (e.status === 422) return { kind: "reason" };
    if (e.status === 400) return { kind: "field", field: text(e.body.field), words: said };
    return { kind: "other", words: said || e.message };
  }
  return { kind: "other", words: e instanceof Error ? e.message : String(e) };
}

/** A refusal of a save, in one line. */
export function refusalWords(r: SaveRefusal): string {
  if (r.kind === "reason") return "Not saved: say why this version.";
  if (r.kind === "field") return `Not saved: ${[r.field, r.words].filter(Boolean).join(": ") || "a rule is out of range"}.`;
  if (r.kind === "other") return `Not saved: ${r.words}`;
  return "Someone saved first.";
}
