// SPDX-License-Identifier: AGPL-3.0-only
// A rule change's effect on the sorting (record 56, section 5.4), as the
// rehearse door answers it (POST /api/packs/{name}/rehearse) and as a
// proposal keeps it: how many scans change and from what to what per axis,
// with their datasets, sites, makes and example scans; the names before and
// after; the main scans' picks by role; the Review questions that appear and
// go; right to wrong, wrong to right and the net on the answers people
// settled; and its reach, the rules version it ships as or the scope of the
// overlay. Nima, 2026-10-09: "the change in rule should show how it affect
// the sorting (like how many stack and to what)". Read evenly from whatever
// the door answered, so a field an engine does not send reads as nothing.

type Json = Record<string, unknown>;

const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const tally = (v: unknown): Record<string, number> => (isObj(v) ? Object.fromEntries(Object.entries(v).map(([k, n]) => [k, num(n)])) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export interface NamePair {
  name: string;
  bids: string | null;
}

export interface Renamed {
  stack: number;
  before: NamePair;
  after: NamePair;
}

export interface Transition {
  /** The axis as stored, comma-joined for an axis that holds several values; empty for none. */
  from: string;
  to: string;
  stacks: number;
  datasets: Record<string, number>;
  sites: Record<string, number>;
  makes: Record<string, number>;
  scanners: Record<string, number>;
  examples: { stack: number; names: { before: NamePair; after: NamePair } | null }[];
}

export interface AxisMoves {
  axis: string;
  moved: number;
  held_by_decision: number;
  transitions: Transition[];
}

export interface PickCounts {
  occasions: number;
  kept: number;
  changed: number;
  removed: number;
  added: number;
  moved: number;
  held_by_a_person: number;
  borders: { raised: number; settled: number; still: number };
}

export interface PickModel extends PickCounts {
  model: string;
  by_role: Record<string, PickCounts>;
}

export interface Picks extends PickCounts {
  models: PickModel[];
  /** Why the picks were not replayed, where they were not. */
  why: string | null;
}

export interface AnswerCase {
  stack: number;
  axis: string;
  /** The answer a person settled. */
  answer: string;
  before: string;
  after: string;
}

export interface AxisAnswers {
  answers: number;
  right_to_wrong: number;
  wrong_to_right: number;
  unanswered_to_right: number;
  unanswered_to_wrong: number;
  right_to_unanswered: number;
  wrong_to_unanswered: number;
  wrong_to_wrong: number;
  unchanged: number;
}

export interface Answers {
  measured_on: string;
  sets: { name: string; holds: string; answers: number; sealed_left_out: number }[];
  fixes: number;
  breaks: number;
  net: number;
  by_axis: Record<string, AxisAnswers>;
  /** The answers it breaks, right before and not after (wrong or unanswered), the first of them. */
  right_to_wrong: AnswerCase[];
  wrong_to_right: AnswerCase[];
}

export type Ships = { as: "rules release"; pack: string; version: string; from: string } | { as: "overlay"; pack: string; on: string; scopes: string[]; with_pack_edits: boolean };

export interface Effect {
  pack: string;
  operations: Json[];
  applied: { at: number; op: string; scope: string; changes: string[] }[];
  cases: { held: boolean; failures: string | null };
  ships: Ships;
  scope: { replayed: string; stacks: number; sealed_left_out: number; by_operation: { at: number; op: string; scope: string; stacks: number }[] };
  moved: number;
  axes: AxisMoves[];
  names: { descriptive: number; bids: number; examples: Renamed[] };
  picks: Picks;
  review: { before: number; after: number; by_kind: { kind: string; appear: number; disappear: number }[] };
  answers: Answers;
  seconds: number | null;
}

function pair(v: unknown): NamePair {
  const o = isObj(v) ? v : {};
  return { name: str(o.name), bids: typeof o.bids === "string" ? o.bids : null };
}

function counts(v: unknown): PickCounts {
  const o = isObj(v) ? v : {};
  const b = isObj(o.borders) ? o.borders : {};
  const changed = num(o.changed);
  const removed = num(o.removed);
  const added = num(o.added);
  return {
    occasions: num(o.occasions),
    kept: num(o.kept),
    changed,
    removed,
    added,
    moved: typeof o.moved === "number" ? o.moved : changed + removed + added,
    held_by_a_person: num(o.held_by_a_person),
    borders: { raised: num(b.raised), settled: num(b.settled), still: num(b.still) },
  };
}

function answerCase(v: unknown): AnswerCase {
  const o = isObj(v) ? v : {};
  return { stack: num(o.stack), axis: str(o.axis), answer: str(o.answer), before: str(o.before), after: str(o.after) };
}

/** The effect report as the door answered it, made even. */
export function effectOf(raw: unknown): Effect {
  const r = isObj(raw) ? raw : {};
  const patch = isObj(r.patch) ? r.patch : {};
  const cases = isObj(patch.cases) ? patch.cases : {};
  const ships = isObj(r.ships) ? r.ships : {};
  const scope = isObj(r.scope) ? r.scope : {};
  const names = isObj(r.names) ? r.names : {};
  const picks = isObj(r.picks) ? r.picks : {};
  const review = isObj(r.review) ? r.review : {};
  const asked = isObj(review.stacks_asked) ? review.stacks_asked : {};
  const answers = isObj(r.answers) ? r.answers : {};
  const seconds = isObj(r.seconds) ? r.seconds : {};
  return {
    pack: str(r.pack),
    operations: arr(patch.operations).filter(isObj),
    applied: arr(patch.applied)
      .filter(isObj)
      .map((a) => ({ at: num(a.at), op: str(a.op), scope: str(a.scope), changes: arr(a.changes).map(String) })),
    cases: { held: cases.held !== false, failures: typeof cases.failures === "string" ? cases.failures : null },
    ships:
      ships.as === "overlay"
        ? { as: "overlay", pack: str(ships.pack), on: str(ships.on), scopes: arr(ships.scopes).map(String), with_pack_edits: ships.with_pack_edits === true }
        : { as: "rules release", pack: str(ships.pack), version: str(ships.version), from: str(ships.from) },
    scope: {
      replayed: str(scope.replayed),
      stacks: num(scope.stacks),
      sealed_left_out: num(scope.sealed_left_out),
      by_operation: arr(scope.by_operation)
        .filter(isObj)
        .map((b) => ({ at: num(b.at), op: str(b.op), scope: str(b.scope), stacks: num(b.stacks) })),
    },
    moved: num(isObj(r.moved) ? r.moved.stacks : r.moved),
    axes: arr(r.axes)
      .filter(isObj)
      .map((a) => ({
        axis: str(a.axis),
        moved: num(a.moved),
        held_by_decision: num(a.held_by_decision),
        transitions: arr(a.transitions)
          .filter(isObj)
          .map((t) => ({
            from: str(t.from),
            to: str(t.to),
            stacks: num(t.stacks),
            datasets: tally(t.datasets),
            sites: tally(t.sites),
            makes: tally(t.makes),
            scanners: tally(t.scanners),
            examples: arr(t.examples).map((e) => {
              const o = isObj(e) ? e : { stack: e };
              const n = isObj(o.names) ? o.names : null;
              return { stack: num(o.stack), names: n ? { before: pair(n.before), after: pair(n.after) } : null };
            }),
          })),
      })),
    names: {
      descriptive: num(isObj(names.descriptive) ? names.descriptive.changed : 0),
      bids: num(isObj(names.bids) ? names.bids.changed : 0),
      examples: arr(names.examples)
        .filter(isObj)
        .map((e) => ({ stack: num(e.stack), before: pair(e.before), after: pair(e.after) })),
    },
    picks: {
      ...counts(picks),
      models: arr(picks.models)
        .filter(isObj)
        .map((m) => ({ ...counts(m), model: str(m.model), by_role: isObj(m.by_role) ? Object.fromEntries(Object.entries(m.by_role).map(([role, c]) => [role, counts(c)])) : {} })),
      why: typeof picks.why === "string" ? picks.why : null,
    },
    review: {
      before: num(asked.before),
      after: num(asked.after),
      by_kind: arr(review.by_kind)
        .filter(isObj)
        .map((k) => ({ kind: str(k.kind), appear: num(k.appear), disappear: num(k.disappear) })),
    },
    answers: {
      measured_on: str(answers.measured_on),
      sets: arr(answers.sets)
        .filter(isObj)
        .map((s) => ({ name: str(s.name), holds: str(s.holds), answers: num(s.answers), sealed_left_out: num(s.sealed_left_out) })),
      fixes: num(answers.fixes),
      breaks: num(answers.breaks),
      net: num(answers.net),
      by_axis: isObj(answers.by_axis)
        ? Object.fromEntries(
            Object.entries(answers.by_axis).map(([axis, t]) => {
              const o = isObj(t) ? t : {};
              return [
                axis,
                {
                  answers: num(o.answers),
                  right_to_wrong: num(o.right_to_wrong),
                  wrong_to_right: num(o.wrong_to_right),
                  unanswered_to_right: num(o.unanswered_to_right),
                  unanswered_to_wrong: num(o.unanswered_to_wrong),
                  right_to_unanswered: num(o.right_to_unanswered),
                  wrong_to_unanswered: num(o.wrong_to_unanswered),
                  wrong_to_wrong: num(o.wrong_to_wrong),
                  unchanged: num(o.unchanged),
                },
              ];
            }),
          )
        : {},
      right_to_wrong: arr(answers.right_to_wrong).map(answerCase),
      wrong_to_right: arr(answers.wrong_to_right).map(answerCase),
    },
    seconds: typeof seconds.total === "number" ? seconds.total : null,
  };
}

const n = (v: number) => v.toLocaleString("en-US");
const plural = (v: number, one: string, many: string) => `${n(v)} ${v === 1 ? one : many}`;

/** A value as stored, in words: "nothing" for none, a comma-joined set as it is. */
export function valueWords(v: string): string {
  return v === "" ? "nothing" : v.replace(/,/gu, ", ");
}

/** The transitions of every axis, the most scans first, each with its axis. */
export function topTransitions(e: Effect, limit = 3): (Transition & { axis: string })[] {
  return e.axes
    .flatMap((a) => a.transitions.map((t) => ({ ...t, axis: a.axis })))
    .sort((x, y) => y.stacks - x.stacks || x.axis.localeCompare(y.axis))
    .slice(0, limit);
}

/** One transition in words: `base T2w → FLAIR, 47 scans`. */
export function transitionWords(t: Transition & { axis: string }): string {
  return `${t.axis} ${valueWords(t.from)} → ${valueWords(t.to)}, ${plural(t.stacks, "scan", "scans")}`;
}

/** What the answers people settled say of the change: "fixes 47, breaks 3", or that it was measured on none. */
export function answersWords(a: Answers): string {
  const measured = a.sets.reduce((s, x) => s + x.answers, 0);
  if (measured === 0 && a.fixes === 0 && a.breaks === 0) return "no settled answer to measure it on";
  return `fixes ${n(a.fixes)}, breaks ${n(a.breaks)}`;
}

/** The effect in a line: how many scans move, the largest moves, and what it does to the answers we know. */
export function effectLine(e: Effect): string {
  if (e.moved === 0 && e.picks.moved === 0 && e.names.descriptive === 0 && e.names.bids === 0) return `Moves nothing · ${answersWords(e.answers)}`;
  const top = topTransitions(e, 2).map(transitionWords);
  const parts = [`Moves ${plural(e.moved, "scan", "scans")}`, ...top];
  if (e.picks.moved > 0) parts.push(`${plural(e.picks.moved, "main scan changes", "main scans change")}`);
  parts.push(answersWords(e.answers));
  return parts.join(" · ");
}

/** Where the change lands, in words: a new rules version, or an overlay for its scopes. */
export function reachWords(s: Ships): string {
  if (s.as === "rules release") return `A new rules version, ${s.pack} ${s.version}${s.from ? ` (from ${s.from})` : ""}, for everyone`;
  const scopes = s.scopes.map((x) => x.replace(/^(site|dataset|scanner|batch):/u, "$1 ")).join(", ");
  return `Only ${scopes || "its scope"}, on ${s.pack} ${s.on}${s.with_pack_edits ? ", with pack edits beside it" : ""}`;
}

/** The questions the change raises and settles, in a line. */
export function reviewWords(r: Effect["review"]): string {
  if (r.before === r.after && r.by_kind.length === 0) return `Review unchanged: ${plural(r.before, "scan asked", "scans asked")}`;
  return `Scans asked: ${n(r.before)} → ${n(r.after)}`;
}

/** The names that change, in a line. */
export function namesWords(x: Effect["names"]): string {
  if (x.descriptive === 0 && x.bids === 0) return "No name changes";
  return `${plural(x.descriptive, "name", "names")} and ${plural(x.bids, "BIDS name", "BIDS names")} change`;
}

/** The main scans' picks, in a line. */
export function picksWords(p: Picks): string {
  if (p.why) return `Main scans not replayed: ${p.why}`;
  if (p.moved === 0 && p.borders.raised === 0 && p.borders.settled === 0) return `Main scans unchanged on ${plural(p.occasions, "visit", "visits")}`;
  const parts = [`${plural(p.moved, "pick moves", "picks move")} of ${n(p.occasions)}`];
  if (p.borders.raised > 0) parts.push(`${n(p.borders.raised)} borders raised`);
  if (p.borders.settled > 0) parts.push(`${n(p.borders.settled)} settled`);
  return parts.join(" · ");
}

/** The roles of every pick model, their counts summed, in the order the door listed them. */
export function rolesOf(p: Picks): { role: string; counts: PickCounts }[] {
  const out = new Map<string, PickCounts>();
  for (const m of p.models) {
    for (const [role, c] of Object.entries(m.by_role)) {
      const was = out.get(role);
      out.set(
        role,
        was
          ? {
              occasions: was.occasions + c.occasions,
              kept: was.kept + c.kept,
              changed: was.changed + c.changed,
              removed: was.removed + c.removed,
              added: was.added + c.added,
              moved: was.moved + c.moved,
              held_by_a_person: was.held_by_a_person + c.held_by_a_person,
              borders: { raised: was.borders.raised + c.borders.raised, settled: was.borders.settled + c.borders.settled, still: was.borders.still + c.borders.still },
            }
          : c,
      );
    }
  }
  return [...out.entries()].map(([role, c]) => ({ role, counts: c }));
}

/** The largest few of a tally, in words: `study-big 40, ward-c 11`. */
export function tallyWords(t: Record<string, number>, limit = 3): string {
  const rows = Object.entries(t).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const shown = rows.slice(0, limit).map(([k, v]) => `${k === "(none)" ? "none" : k} ${n(v)}`);
  return rows.length > limit ? `${shown.join(", ")}, +${n(rows.length - limit)} more` : shown.join(", ");
}

/** Answers that changed alike, in a line: the axis, what the rules said and say now, and what people settled. */
export function caseWords(c: Omit<AnswerCase, "stack">): string {
  return `${c.axis} ${valueWords(c.before)} → ${valueWords(c.after)}, settled ${valueWords(c.answer)}`;
}

/** The answers grouped by what changed alike, each group with its scans, the largest first. */
export function caseGroups(cases: AnswerCase[]): (Omit<AnswerCase, "stack"> & { stacks: number[] })[] {
  const by = new Map<string, Omit<AnswerCase, "stack"> & { stacks: number[] }>();
  for (const c of cases) {
    const key = `${c.axis}\u0000${c.answer}\u0000${c.before}\u0000${c.after}`;
    const g = by.get(key) ?? { axis: c.axis, answer: c.answer, before: c.before, after: c.after, stacks: [] };
    g.stacks.push(c.stack);
    by.set(key, g);
  }
  return [...by.values()].sort((x, y) => y.stacks.length - x.stacks.length);
}

/** Whether the change breaks any answer we know, which its card must say with the scans (record 56, 5.6). */
export function breaks(e: Effect): boolean {
  return e.answers.breaks > 0 || e.answers.right_to_wrong.length > 0;
}
