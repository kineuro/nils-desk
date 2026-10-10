// SPDX-License-Identifier: AGPL-3.0-only
// What the dataset viewer's filters leave, kept (Wave 7a, 2026-10-10: a
// selection or a cohort "from the page"): the subjects, the visits or the
// scans a level shows, as the question that means them in the ask language,
// so the engine answers it as the viewer's own doors answered the filters. A
// dataset is the ask's `dataset` field; a cohort is a set of its own that
// the answer is `of`; a filter is the clause or the `has` that asks it. A
// filter no question can ask is named with why, and left out only on the
// person's word, never dropped. The browser's words are no question, so the
// scans they leave are named one by one. This is the one place the desk
// writes a document itself: the engine checks and counts it before anything
// is kept, and keeps it as a card, as a selection or as a cohort's source.

import { DoorError, ask, door, results, type Diagnosis, type Json } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";
import { maySave } from "../query/selections";
import { cohorts } from "./cohorts";
import type { Scan } from "./scans";
import { filterPhrase, plural, roleWord, type Scope, type Visit } from "./viewer";

/** The grain a level keeps: the subjects, a subject's visits as sessions, or scans. */
export type KeptGrain = "subject" | "session" | "stack";

/** One thing the page narrowed by, in words, and whether a question asks it. */
export interface Narrowed {
  /** The filter as the address keeps it, or what it stands for: `unread`, `no-session`, `ruled-out`. */
  key: string;
  words: string;
  asked: boolean;
  /** Why no question asks it, said behind a "?". */
  why?: string;
}

/** What a level shows, as the question that means it. */
export interface Kept {
  grain: KeptGrain;
  /** Where the rows are, in the page's own words: "ms-a", "ms-a · 9f3c0a7e · ses-20190913". */
  where: string;
  /** What the page narrowed by; the ones no question asks are left out of the document. */
  narrowed: Narrowed[];
  /** The question the page means, without what no question asks. */
  document: Json;
  /** How many the page shows of what the question can hold, to hold the engine's count against; null where the page does not know. */
  shown: number | null;
  /** The name to suggest for a selection or a cohort: the scope, then the filters, with no code and no date in it. */
  name: string;
}

// ------------------------------------------------------------ the clauses

type Clause = unknown[];
const field = (path: string): Clause => ["field", {}, path];
const axis = (name: string): Clause => ["axis", {}, name];
const eq = (l: Clause, r: unknown): Clause => ["=", {}, l, r];
const among = (l: Clause, items: unknown[]): Clause => ["in", {}, l, items];
const contains = (l: Clause, text: string): Clause => ["contains", {}, l, text];
const startsWith = (l: Clause, text: string): Clause => ["starts_with", {}, l, text];
const not = (c: Clause): Clause => ["not", {}, c];
const any = (cs: Clause[]): Clause => (cs.length === 1 ? cs[0] : ["or", {}, ...cs]);
const all = (cs: Clause[]): Clause => (cs.length === 1 ? cs[0] : ["and", {}, ...cs]);

/** A dataset's own stacks, sessions and subjects: the ask's dataset field, which on a session or a subject asks whether the name is among theirs. */
const inDataset = (name: string): Clause => eq(field("dataset"), name);

/** The body parts the pack stores that a region names, as the viewer reads them: the brain and the neck are each in `brain-neck`. */
const REGION_PARTS: Record<string, string[]> = { brain: ["brain", "brain-neck"], neck: ["neck", "brain-neck"] };

/** A stack in one of these regions. An axis is read through `=`, never `in`. */
export function regionClause(regions: string[]): Clause {
  const parts = [...new Set(regions.flatMap((r) => REGION_PARTS[r.toLowerCase()] ?? [r.toLowerCase()]))];
  return any(parts.map((p) => eq(axis("body_part"), p)));
}

/** The maker a stack was scanned on: its own, else its study's, as the viewer reads it. */
const MAKER: Clause = ["coalesce", {}, field("manufacturer"), field("study.manufacturer")];
const SIEMENS = contains(MAKER, "siemens");
const PHILIPS = contains(MAKER, "philips");
const GE = any([among(MAKER, ["GE", "Ge", "gE", "ge"]), startsWith(MAKER, "ge "), contains(MAKER, "general electric")]);
const CANON = any([contains(MAKER, "toshiba"), contains(MAKER, "canon")]);
const HITACHI = any([contains(MAKER, "hitachi"), contains(MAKER, "fujifilm")]);

/**
 * A stack of this maker, as the viewer names makers: the scanner's own
 * spellings of the big makers brought to one word, the first that matches in
 * its order, any other maker as written.
 */
export function makerClause(maker: string): Clause {
  switch (maker.trim().toLowerCase()) {
    case "siemens":
      return SIEMENS;
    case "philips":
      return all([PHILIPS, not(SIEMENS)]);
    case "ge":
      return all([GE, not(SIEMENS), not(PHILIPS)]);
    case "canon":
      return all([CANON, not(SIEMENS), not(PHILIPS), not(GE)]);
    case "hitachi":
      return all([HITACHI, not(SIEMENS), not(PHILIPS), not(GE), not(CANON)]);
    default:
      return eq(MAKER, maker.trim());
  }
}

/** A kind's filters in words, two values of one kind being either: "with a main T1w or with a main FLAIR". */
function phraseOf(kind: string, values: string[]): string {
  return values.length === 0 ? filterPhrase([kind]) : values.map((v) => filterPhrase([`${kind}:${v}`])).join(" or ");
}

/** A filter's values by kind, as the doors read `kind:value` (two values of one kind are either). */
function byKind(filters: string[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const f of filters) {
    const [kind, value = ""] = f.split(/:(.*)/s);
    const list = out.get(kind) ?? [];
    if (value !== "" && !list.includes(value)) list.push(value);
    out.set(kind, list);
  }
  return out;
}

// ------------------------------------------------------------ the scope

/** The name of the cohort's own set in a document over a cohort. */
const SCOPE_SET = "scope";

/**
 * How a scope keeps a set inside it: a dataset by the dataset field on the
 * set itself; a cohort by a cohort set of its own, which the answer is `of`
 * (its current members), the helper sets then reading their subject's rows.
 */
function scopeOf(scope: Scope): { sets: Record<string, Json>; where: Clause[]; of: string | null } {
  const dataset = scope.kind === "dataset";
  return {
    /** The sets the scope brings: none for a dataset, the cohort for a cohort. */
    sets: dataset ? {} : { [SCOPE_SET]: { grain: "cohort", where: [eq(field("name"), scope.name)] } },
    /** The clauses that keep a set's rows in the scope. */
    where: dataset ? [inDataset(scope.name)] : [],
    /** What the answer set (or the set a level hangs from) is `of`. */
    of: dataset ? null : SCOPE_SET,
  };
}

/** A set: its grain, an ancestor, its clauses, its counts of other sets; empty parts left out. */
function set(grain: string, parts: { of?: string | null; from?: string; where?: Clause[]; has?: { set: string; min: number }[]; algebra?: Json }): Json {
  const s: Json = { grain };
  if (parts.from) s.from = parts.from;
  if (parts.of) s.of = parts.of;
  if (parts.algebra) s.algebra = parts.algebra;
  if (parts.has && parts.has.length > 0) s.has = parts.has;
  if (parts.where && parts.where.length > 0) s.where = parts.where;
  return s;
}

function documentOf(name: string, sets: Record<string, Json>, answer: string): Json {
  return { ast_version: 1, name, sets, out: { set: answer, level: "record" } };
}

/** A name as a selection or a cohort takes it: letters, digits and hyphens. */
function tagged(parts: string[]): string {
  return parts
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const n = (v: number) => v.toLocaleString("en-US");

// ------------------------------------------------------------ the subjects

const NO_LOOK = "No question asks whether a scan needs a look.";

/**
 * The subjects a scope's grid shows: the filters as clauses on the subjects
 * and as `has` of the visits and the scans that hold what a filter asks for,
 * and a search as the subjects it found, by their ids (`found`, null where
 * nothing was searched). What was typed is never written: it can be an
 * identifier, and a kept question is stored and shown again (review of
 * 2026-10-10). Two values of one kind are either, as the subjects door reads
 * them; kinds are all of them.
 */
export function subjectsKept(scope: Scope, view: { found: number[] | null; filter: string[] }, opts: { shown: number | null }): Kept {
  const s = scopeOf(scope);
  const sets: Record<string, Json> = { ...s.sets };
  const where: Clause[] = [...s.where];
  const has: { set: string; min: number }[] = [];
  const narrowed: Narrowed[] = [];
  const tags: string[] = [scope.name];
  if (view.found !== null) {
    where.push(among(field("id"), view.found));
    narrowed.push({ key: "q", words: `found by the search, ${plural(view.found.length, "subject")}`, asked: true });
  }
  const kinds = byKind(view.filter);
  /** A stack set inside the scope with these clauses, counted from the subject. */
  const stacks = (name: string, clauses: Clause[]) => {
    sets[name] = set("stack", { where: [...s.where, ...clauses] });
    has.push({ set: name, min: 1 });
  };
  for (const [kind, values] of kinds) {
    const words = phraseOf(kind, values);
    if (kind === "look") {
      narrowed.push({ key: kind, words, asked: false, why: NO_LOOK });
    } else if (kind === "visits2") {
      sets.visits = set("session", { where: s.where });
      has.push({ set: "visits", min: 2 });
      narrowed.push({ key: kind, words, asked: true });
      tags.push("visits2");
    } else if (kind === "main" && values.length > 0) {
      // a role is the pack's library set of the live picks; two roles are either
      if (values.length === 1) {
        sets.main = set("stack", { from: `role:${values[0]}`, where: s.where });
      } else {
        values.forEach((r, i) => (sets[`main_${i + 1}`] = set("stack", { from: `role:${r}`, where: s.where })));
        sets.main = set("stack", { algebra: { op: "union", sets: values.map((_, i) => `main_${i + 1}`) } });
      }
      has.push({ set: "main", min: 1 });
      narrowed.push({ key: kind, words, asked: true });
      tags.push(...values.map((r) => roleWord(r)));
    } else if (kind === "region" && values.length > 0) {
      stacks("region", [regionClause(values)]);
      narrowed.push({ key: kind, words, asked: true });
      tags.push(...values);
    } else if (kind === "maker" && values.length > 0) {
      stacks("maker", [any(values.map(makerClause))]);
      narrowed.push({ key: kind, words, asked: true });
      tags.push(...values);
    } else {
      narrowed.push({ key: kind, words, asked: false, why: "No question asks this filter." });
    }
  }
  sets.subjects = set("subject", { of: s.of, where, has });
  const asked = narrowed.filter((x) => x.asked && x.key !== "q").map((x) => x.words);
  const name = `Subjects of ${scope.kind === "cohort" ? `the cohort ${scope.name}` : scope.name}${asked.length > 0 ? `, ${asked.join(", ")}` : ""}`;
  return { grain: "subject", where: scope.name, narrowed, document: documentOf(name, sets, "subjects"), shown: opts.shown, name: tagged(tags) };
}

// ------------------------------------------------------------ one subject's visits

const NO_CONTRAST = "No question can ask for contrast yet.";
const NO_SESSION = "A question reads visits as the sessions NILS built, and these have none yet.";

/**
 * One subject's visits in a scope, as sessions: the subject by its id, its
 * sessions with a scan in the scope, and each filter as a `has` of the
 * scans that hold it. A visit of studies that no session holds yet is no
 * session, so it is named and left out only on the person's word.
 */
export function visitsKept(scope: Scope, subject: { id: number; label: string }, vfilter: string[], visits: Visit[] | null, shown: number | null): Kept {
  const s = scopeOf(scope);
  const sets: Record<string, Json> = { ...s.sets };
  const has: { set: string; min: number }[] = [];
  const narrowed: Narrowed[] = [];
  const tags: string[] = [scope.name, `subject-${subject.id}`];
  const kinds = byKind(vfilter);
  const stacks = (name: string, clauses: Clause[]) => {
    sets[name] = set("stack", { where: [...s.where, ...clauses] });
    has.push({ set: name, min: 1 });
  };
  for (const [kind, values] of kinds) {
    const words = phraseOf(kind, values);
    if (kind === "look") narrowed.push({ key: kind, words, asked: false, why: NO_LOOK });
    else if (kind === "contrast") narrowed.push({ key: kind, words, asked: false, why: NO_CONTRAST });
    else if (kind === "symri") {
      stacks("symri", [eq(axis("provenance"), "SyMRI")]);
      narrowed.push({ key: kind, words, asked: true });
      tags.push("symri");
    } else if (kind === "region" && values.length > 0) {
      stacks("region", [regionClause(values)]);
      narrowed.push({ key: kind, words, asked: true });
      tags.push(...values);
    } else narrowed.push({ key: kind, words, asked: false, why: "No question asks this filter." });
  }
  const loose = (visits ?? []).filter((v) => v.session === null).length;
  if (loose > 0) narrowed.push({ key: "no-session", words: `${plural(loose, "visit")} with no session yet`, asked: false, why: NO_SESSION });
  sets.subject = set("subject", { of: s.of, where: [eq(field("id"), subject.id)] });
  sets.visits = set("session", { of: "subject", where: s.where, has });
  const asked = narrowed.filter((x) => x.asked).map((x) => x.words);
  const name = `Visits of subject ${subject.id} in ${scope.kind === "cohort" ? `the cohort ${scope.name}` : scope.name}${asked.length > 0 ? `, ${asked.join(", ")}` : ""}`;
  return {
    grain: "session",
    where: `${scope.name} · ${subject.label}`,
    narrowed,
    document: documentOf(name, sets, "visits"),
    shown: shown === null ? null : Math.max(0, shown - (visits ?? []).filter((v) => v.session === null).length),
    name: tagged(tags),
  };
}

// ------------------------------------------------------------ one visit's scans

/** Whether the pack ruled a scan out: no question holds it (§4.4 rule 10). */
export const ruledOut = (s: Pick<Scan, "axes">): boolean => s.axes.disposition === "excluded";
const RULED_OUT = "No question holds a scan the pack ruled out.";

/**
 * One visit's scans in a scope: its studies (a visit is its studies, with a
 * session or without), inside the scope. The scans the pack ruled out are
 * shown on the page but held by no question, so they are named.
 */
export function scansKept(scope: Scope, at: { subject: number; subjectLabel: string; visit: string; label: string; number: number | null; studies: number[]; session: number | null }, scans: Scan[] | null, total: number | null): Kept {
  const s = scopeOf(scope);
  const sets: Record<string, Json> = { ...s.sets };
  const of = at.studies.length > 0 ? among(field("study.id"), at.studies) : eq(field("session.id"), at.session);
  sets.scans = set("stack", { of: s.of, where: [of, ...s.where] });
  const out = (scans ?? []).filter(ruledOut).length;
  const narrowed: Narrowed[] = out > 0 ? [{ key: "ruled-out", words: `${plural(out, "scan")} the pack ruled out`, asked: false, why: RULED_OUT }] : [];
  const visit = at.number !== null ? `visit ${at.number}` : "a visit";
  const name = `Scans of ${visit} of subject ${at.subject} in ${scope.kind === "cohort" ? `the cohort ${scope.name}` : scope.name}`;
  return {
    grain: "stack",
    where: `${scope.name} · ${at.subjectLabel} · ${at.label}`,
    narrowed,
    document: documentOf(name, sets, "scans"),
    shown: total === null ? null : Math.max(0, total - out),
    name: tagged([scope.name, `subject-${at.subject}`, at.number !== null ? `visit-${at.number}` : "visit"]),
  };
}

// ------------------------------------------------------------ the browser

const NOT_READ = "The filter has matched only the scans read so far.";

/**
 * The scans the browser shows: the scope's, or, with words in its filter,
 * the ones they leave, named one by one, since words are no question (the
 * engine names a curated set of scans so too). Scans not read yet have not
 * met the filter, and the ones the pack ruled out no question holds: both
 * are named.
 */
export function browserKept(scope: Scope, words: string[], matched: Scan[], read: { read: number; total: number | null }): Kept {
  const s = scopeOf(scope);
  const sets: Record<string, Json> = { ...s.sets };
  const narrowed: Narrowed[] = [];
  const filtered = words.length > 0;
  const unread = read.total !== null ? Math.max(0, read.total - read.read) : 0;
  const where: Clause[] = [...s.where];
  if (filtered) {
    where.unshift(among(field("id"), matched.map((m) => m.id)));
    narrowed.push({ key: "words", words: `matching ${words.join(" ")}`, asked: true });
    if (unread > 0) narrowed.push({ key: "unread", words: `${n(unread)} ${unread === 1 ? "scan" : "scans"} not read yet`, asked: false, why: NOT_READ });
  }
  const out = matched.filter(ruledOut).length;
  if (out > 0) narrowed.push({ key: "ruled-out", words: `${plural(out, "scan")} the pack ruled out`, asked: false, why: RULED_OUT });
  sets.scans = set("stack", { of: s.of, where });
  const name = `Scans of ${scope.kind === "cohort" ? `the cohort ${scope.name}` : scope.name}${filtered ? ", as the browser's filter left them" : ""}`;
  const seen = filtered ? matched.length : (read.total ?? matched.length);
  return {
    grain: "stack",
    where: scope.name,
    narrowed,
    document: documentOf(name, sets, "scans"),
    shown: Math.max(0, seen - out),
    name: tagged([scope.name, filtered ? "filtered" : "scans"]),
  };
}

// ------------------------------------------------------------ in words

const GRAIN_WORD: Record<KeptGrain, [string, string]> = { subject: ["subject", "subjects"], session: ["visit", "visits"], stack: ["scan", "scans"] };

/** A count at a kept grain, in words: "12 subjects", "1 visit". */
export function grainWords(grain: KeptGrain, count: number): string {
  const [one, many] = GRAIN_WORD[grain];
  return plural(count, one, many);
}

/** What no question asks, the ones the person's word leaves out. */
export const unasked = (k: Kept): Narrowed[] => k.narrowed.filter((x) => !x.asked);

// ------------------------------------------------------------ the doors

export const KEEP_DOORS = {
  count: "POST /api/ask/diagnose",
  store: "POST /api/ask/documents",
  run: "POST /api/ask/run",
  save: "PUT /api/ask/selections/{name}",
  promote: "POST /api/ask/handles/{id}/promote",
  job: "GET /api/jobs/{id}",
} as const;

/** Whether this person may keep what a level shows as a selection: saving one, and the doors that check and keep its question. */
export function maySelect(caps: Capabilities): boolean {
  return maySave(caps) && served(caps, KEEP_DOORS.count) && served(caps, KEEP_DOORS.store);
}

/** Whether this person may make a cohort of it: Data work for the promotion, Query work to keep the question it runs. */
export function mayCohort(caps: Capabilities): boolean {
  return may(caps, "data:work") && may(caps, "query:work") && served(caps, KEEP_DOORS.count) && served(caps, KEEP_DOORS.store) && served(caps, KEEP_DOORS.run) && served(caps, KEEP_DOORS.promote);
}

/** The engine's count of a document: the last stage of its answer's funnel, its rows and their subjects. */
export function countOf(d: Diagnosis, answer: string): { rows: number; subjects: number } | null {
  const stage = d.funnel.filter((f) => f.set === answer).at(-1);
  return stage ? { rows: stage.rows, subjects: stage.subjects } : null;
}

export const keepDoors = {
  /** The document checked and counted, without keeping it. */
  count: (document: Json) => door<Diagnosis>("POST", "/api/ask/diagnose", { document }),
  /** The document kept as a card; the same document is the same card. */
  store: (document: Json) => ask.store(document).then((d) => d.document),
  run: (documentId: number) => ask.run(documentId),
  promote: cohorts.promote,
  job: (id: number) => results.job(id),
};

/** A refusal the desk says itself, in its own words, where the engine would have taken the act. */
export class Refusal extends Error {}

/** Why a promotion cannot take a run's answer, in words; null where it can. */
export function cannotPromote(run: { truncated: boolean; row_count: number }): string | null {
  if (run.truncated) return "The answer is cut off at the run's limit; a cohort needs all of it.";
  if (run.row_count === 0) return "Nothing to add.";
  return null;
}

/** The refusals the dialog knows, in its own words. */
export function keepError(e: unknown): string | null {
  if (e instanceof Refusal) return e.message;
  const m = e instanceof Error ? e.message : String(e);
  if (/is a cohort; a selection may take/i.test(m)) return "That name is a cohort's. Choose another.";
  if (/is a selection's name; a cohort cannot/i.test(m)) return "That name is a selection's. Choose another.";
  if (/is truncated/i.test(m)) return "The answer is cut off at the run's limit; a cohort needs all of it.";
  if (/is retired/i.test(m)) return "That cohort is retired.";
  if (e instanceof DoorError && (e.status === 401 || e.status === 403)) return "You may not do this.";
  return null;
}
