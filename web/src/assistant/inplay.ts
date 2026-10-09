// SPDX-License-Identifier: AGPL-3.0-only
// The query a conversation works on (the Assistant redesign, 2026-10-09): the
// versions the conversation proposed or made by hand, numbered in their line
// as they came; an answer's funnel as subjects, visits and scans, with how
// many the version it was made from held; the question's conditions as a
// person reads them; and what a bar of a chart narrows the question to, as a
// move the engine offered. Nothing here composes ask JSON.

import { columnName, type Json, type Move, type Options, type Preview, type Profile, type ProfileValue } from "../ask/client";
import { movesForCell, type Step as SetStep } from "../ask/editor";
import { clauseText } from "../query/cards";

/** A version the conversation knows: proposed by the assistant, made by hand on the panel, or the card it was opened on. */
export interface Known {
  document: number;
  parent: number | null;
}

/** A version in its line: the line's first version, and the version's number in the line. */
export interface Placed {
  document: number;
  root: number;
  n: number;
  label: string;
}

/**
 * Every version numbered in its line as it came: a version whose parent the
 * conversation knows continues that line, any other starts a line of its own
 * at v1, or after the versions its first one already has on the Query page
 * (`base`, the length of the engine's chain there).
 */
export function placed(known: Known[], base: Record<number, number> = {}): Map<number, Placed> {
  const out = new Map<number, Placed>();
  const last = new Map<number, number>();
  for (const k of known) {
    if (out.has(k.document)) continue;
    const up = k.parent !== null ? out.get(k.parent) : undefined;
    const root = up ? up.root : k.document;
    const n = up ? (last.get(root) ?? up.n) + 1 : Math.max(1, base[k.document] ?? 1);
    last.set(root, n);
    out.set(k.document, { document: k.document, root, n, label: `v${n}` });
  }
  return out;
}

/** The versions of a document's line, in order; none for a document the conversation does not know. */
export function lineOf(all: Map<number, Placed>, document: number | null): Placed[] {
  const me = document === null ? undefined : all.get(document);
  if (!me) return [];
  return [...all.values()].filter((p) => p.root === me.root).sort((a, b) => a.n - b.n);
}

/** What a grain counts, in the words of the page (subject, not people: Nima, 2026-10-09). */
export const GRAIN_WORDS: Record<string, string> = {
  subject: "subjects",
  session: "visits",
  stack: "scans",
  instance: "images",
  event: "events",
  cohort: "cohorts",
  group: "groups",
};

export const grainWord = (grain: string): string => GRAIN_WORDS[grain] ?? `${grain}s`;

/** The levels an answer's profile counts each member of once, in the order a funnel reads them. */
const LEVELS: { key: "subjects" | "sessions" | "stacks"; grain: string }[] = [
  { key: "subjects", grain: "subject" },
  { key: "sessions", grain: "session" },
  { key: "stacks", grain: "stack" },
];

export interface FunnelStep {
  grain: string;
  word: string;
  /** The engine's word for it, where it is not the page's own. */
  hint: string | null;
  n: number;
  /** How many the version it was made from held, when that differs. */
  before: number | null;
  /** What the answer counts. */
  answer: boolean;
}

const countIn = (counts: unknown, key: string): number | null => {
  const v = (counts as Record<string, unknown> | null | undefined)?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
};

/**
 * An answer's funnel from its profile: its subjects, the visits they were
 * seen in and the scans, each counted once, as far as the answer reaches,
 * and the answer's own rows where it counts something else; the step the
 * answer counts marked. Given the version it was made from, each step says
 * how many that one held.
 */
export function funnelOf(p: Profile | null, before: Profile | null = null): FunnelStep[] {
  if (!p) return [];
  const steps: FunnelStep[] = [];
  const push = (grain: string, n: number | null, was: number | null) => {
    if (n === null) return;
    const word = grainWord(grain);
    steps.push({ grain, word, hint: word === `${grain}s` ? null : grain, n, before: was !== null && was !== n ? was : null, answer: grain === p.grain });
  };
  for (const l of LEVELS) push(l.grain, countIn(p.counts, l.key), countIn(before?.counts, l.key));
  if (!LEVELS.some((l) => l.grain === p.grain)) push(p.grain, countIn(p.counts, "rows"), countIn(before?.counts, "rows"));
  return steps;
}

/** How a step compares with the version before: fewer of so many, or up from so many. */
export function beforeWords(s: FunnelStep): string | null {
  if (s.before === null) return null;
  return `${s.n < s.before ? "of" : "was"} ${s.before.toLocaleString("en-US")}`;
}

/** The sets the answer reads from, the answer first, by `of` and `from` back to where it starts. */
export function pathOf(document: Json | null | undefined): { set: string; grain: string }[] {
  const sets = ((document?.sets as Record<string, Json> | undefined) ?? {}) as Record<string, Json>;
  const out: { set: string; grain: string }[] = [];
  let at = (document?.out as Json | undefined)?.set as string | undefined;
  while (typeof at === "string" && sets[at] && !out.some((x) => x.set === at)) {
    const s = sets[at];
    out.push({ set: at, grain: String(s.grain ?? "") });
    at = (typeof s.of === "string" ? s.of : typeof s.from === "string" ? s.from : undefined) as string | undefined;
  }
  return out;
}

/** The set a level's condition goes to: the nearest to the answer on its path with that grain, or null. */
export function levelSet(document: Json | null | undefined, grain: string): string | null {
  return pathOf(document).find((s) => s.grain === grain)?.set ?? null;
}

/** The axes whose value says it all ("T1w", "MPRAGE", "FLAIR"). */
const PLAIN_AXES = new Set(["base", "technique", "modifier", "construct", "provenance"]);

/** A condition as a person reads it: a cohort by its name, a scan's kind by its value, contrast in words, anything else as the language writes it. */
export function conditionWords(clause: unknown, grain: string): string {
  if (Array.isArray(clause) && clause[0] === "=" && clause.length === 4 && Array.isArray(clause[2])) {
    const [kind, , name] = clause[2] as unknown[];
    const value = clause[3];
    if (kind === "field" && name === "name" && grain === "cohort" && typeof value === "string") return `in ${value}`;
    if (kind === "axis" && typeof name === "string" && typeof value === "string") {
      if (PLAIN_AXES.has(name)) return value;
      if (name === "post_contrast" && value === "given") return "with contrast";
      if (name === "post_contrast" && value === "not_given") return "without contrast";
    }
  }
  return clauseText(clause);
}

export interface Condition {
  set: string;
  words: string;
  /** The move that takes it away, with its arguments; null where the engine offers none. */
  remove: { move: Move; args: Json } | null;
}

/**
 * Every condition of the question, step by step: each where clause, removable
 * where the engine offers it, then what a step must have or be near. A step
 * off the answer's path (a set another one has or is near) says its name, so
 * "flair: FLAIR" is not read as the answer's own.
 */
export function conditionsOf(steps: SetStep[], options: Record<string, Options | null>, path: string[] = steps.map((s) => s.set)): Condition[] {
  const out: Condition[] = [];
  for (const s of steps) {
    const remove = options[s.set]?.moves.find((m) => m.kind === "remove_where" && (m.set ?? s.set) === s.set) ?? null;
    const named = (w: string) => (path.includes(s.set) ? w : `${s.set}: ${w}`);
    s.where.forEach((c, i) => out.push({ set: s.set, words: named(conditionWords(c, s.grain)), remove: remove ? { move: remove, args: { index: i } } : null }));
    for (const line of s.clauses.has ?? []) out.push({ set: s.set, words: `has ${line}`, remove: null });
    for (const line of s.clauses.near ?? []) out.push({ set: s.set, words: `near ${line}`, remove: null });
  }
  return out;
}

/** The charts of the panel, as the Query page's profile names them. */
export type ChartKey = "stacks" | "field" | "people" | "clinical";

export interface Narrowing {
  set: string;
  move: Move;
  args: Json;
}

/**
 * What clicking a bar narrows the question to: the move the engine offered
 * that holds the bar's value, on the set the chart counts. A scan kind is a
 * value of the base axis, a field's value is a where on the answer, a sex is
 * a where on the subjects; an age band, a clinical kind and a missing value
 * narrow nothing.
 */
export function narrowing(chart: ChartKey, value: ProfileValue["value"], set: string | null, options: Options | null, field: string): Narrowing | null {
  if (value === null || value === "" || !set || !options) return null;
  if (chart === "stacks") {
    for (const m of options.moves) {
      if (m.kind !== "add_axis_where" || (m.set ?? set) !== set) continue;
      const axis = m.holes.find((h) => h.type === "axis");
      const val = m.holes.find((h) => h.type === "value");
      if (!axis || !val || !(axis.fillers ?? []).includes("base")) continue;
      if (val.fillers && val.fillers.length > 0 && !val.fillers.includes(String(value))) return null;
      return { set, move: m, args: { [axis.name]: "base", [val.name]: value } };
    }
    return null;
  }
  const column = chart === "field" ? field : chart === "people" ? "sex" : null;
  if (!column) return null;
  return movesForCell([options], column, value).find((o) => o.set === set && o.move.kind === "add_where") ?? null;
}

/** The scans a preview names, at most `limit`: a scan set's own key at the record level (`_key`), else a stack column. */
export function stacksOf(p: Preview | null, grain: string | null, limit = 24): number[] {
  if (!p || p.level !== "record") return [];
  const names = p.columns.map(columnName);
  const at = grain === "stack" && names.includes("_key") ? names.indexOf("_key") : names.findIndex((c) => c === "stack" || c === "stack_id");
  if (at < 0) return [];
  const out: number[] = [];
  for (const r of p.rows) {
    const v = Number(r[at]);
    if (Number.isInteger(v) && v > 0 && !out.includes(v)) out.push(v);
    if (out.length >= limit) break;
  }
  return out;
}

/** The record-level answer the Pictures need: "answer with {set} at the record level", where the engine offers it. */
export function listingMove(options: Options | null, set: string | null): Narrowing | null {
  if (!options || !set) return null;
  const m = options.moves.find((x) => x.kind === "set_out");
  if (!m) return null;
  const s = m.holes.find((h) => h.name === "set");
  const level = m.holes.find((h) => h.name === "level");
  if (!s || !level || (s.fillers && !s.fillers.includes(set)) || (level.fillers && !level.fillers.includes("record"))) return null;
  return { set, move: m, args: { [s.name]: set, [level.name]: "record" } };
}
