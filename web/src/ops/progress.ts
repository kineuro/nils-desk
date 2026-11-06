// SPDX-License-Identifier: AGPL-3.0-only
// How far a running model run is, as the engine says it (2026-11-05: a
// body-part run over a cohort stood at "0 of 20,000" for twenty minutes, since
// its one container held every scan of the part and only finished units were
// counted). The engine's beat now carries the count a person reads first:
// `done` of `total` `what`, a container's own where its scans run together in
// it and it says how far it is, else the units over; which part of a split
// run it is (`part`), and since when its job runs (`since`). The desk counts
// nothing itself: these are words for the engine's numbers.

import { firstSentence } from "./failure";

const n = (v: number) => v.toLocaleString("en-US");
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const obj = (v: unknown): Record<string, unknown> => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** A run's progress as its job's beat says it, the fields this page reads. */
export interface LiveProgress {
  done: number | null;
  total: number | null;
  /** What it counts, in the engine's word: stacks, sessions, subjects, or a container's own (slices, steps). */
  what: string | null;
  /** Which part runs; where parts run at once (engine, 2026-11-06), from the first going (`at`) to the last (`to`), their counts summed. */
  part: { at: number; to?: number; of: number } | null;
  /** Since when its job runs, every part's. */
  since: string | null;
  /** What the running containers said of themselves, where any did. */
  reported: { done: number; of: number | null; units: number } | null;
}

/** The fields of a progress record this page reads; nothing it cannot read is guessed. */
export function liveOf(progress: unknown): LiveProgress {
  const p = obj(progress);
  const part = obj(p.part);
  const at = num(part.at);
  const to = num(part.to);
  const of = num(part.of);
  const r = obj(p.reported);
  const rd = num(r.done);
  return {
    done: num(p.done),
    total: num(p.total),
    what: text(p.what),
    part: at !== null && of !== null && of > 1 ? { at, ...(to !== null && to > at ? { to } : {}), of } : null,
    since: text(p.since),
    reported: rd !== null ? { done: rd, of: num(r.of), units: num(r.units) ?? 1 } : null,
  };
}

/** The engine's word for what a run counts, in the desk's: a stack is a scan, a session a visit. */
export function whatWords(what: string | null, count: number): string {
  const one = count === 1;
  switch (what) {
    case null:
    case "stacks":
      return one ? "scan" : "scans";
    case "sessions":
      return one ? "visit" : "visits";
    case "subjects":
      return one ? "subject" : "subjects";
    default:
      return one && what.endsWith("s") ? what.slice(0, -1) : what;
  }
}

/** "312 of 870 scans in part 4 of 23", "1,200 of 2,610 scans in parts 3 to 5 of 23", "12 of 40 visits", "part 2 of 3"; null where the record says nothing a person can read. */
export function liveWords(p: LiveProgress): string | null {
  const count = p.done !== null && p.total !== null ? `${n(p.done)} of ${n(p.total)} ${whatWords(p.what, p.total)}` : null;
  const part = p.part ? (p.part.to !== undefined ? `parts ${n(p.part.at)} to ${n(p.part.to)} of ${n(p.part.of)}` : `part ${n(p.part.at)} of ${n(p.part.of)}`) : null;
  if (count && part) return `${count} in ${part}`;
  return count ?? part;
}

/** How long it has run, briefly: "40 s", "47 min", "3 h 5 min"; nothing where it cannot be told. */
export function runningFor(since: string | null | undefined, now: number): string {
  if (!since) return "";
  const s = (now - Date.parse(since)) / 1000;
  if (!Number.isFinite(s) || s < 0) return "";
  if (s < 60) return `${Math.max(1, Math.round(s))} s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  const h = Math.floor(s / 3600);
  const m = Math.round((s - h * 3600) / 60);
  return m > 0 && m < 60 ? `${h} h ${m} min` : `${h} h`;
}

/** A running step's line: "312 of 870 scans in part 4 of 23 · 47 min"; just the time where nothing is counted yet. */
export function stepProgressWords(progress: unknown, started: string | null | undefined, now: number): string | null {
  const p = liveOf(progress);
  const words = liveWords(p);
  const time = runningFor(p.since ?? started, now);
  const parts = [words, time].filter((w): w is string => !!w);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Why a step failed, as the engine says it on the step: its kind, what happened where it says so, and what to do. */
export interface StepFailure {
  kind: string | null;
  cause: string | null;
  /** The line a person reads: what happened ("killed at its memory cap of 16 GB"), else what to do. */
  line: string;
  /** What to do, where the line is what happened; else null. */
  advice: string | null;
  capGb: number | null;
}

/** A failed step's failure, where the engine gives one (since 2026-11-05); null otherwise. */
export function stepFailureOf(failure: unknown): StepFailure | null {
  const f = obj(failure);
  const said = text(f.said);
  const advice = text(f.advice);
  const base = { kind: text(f.kind), cause: text(f.cause), capGb: num(f.cap_gb) };
  if (said) return { ...base, line: said, advice };
  if (!advice) return null;
  const line = firstClause(advice);
  return { ...base, line, advice: line === advice ? null : advice };
}

/** The engine's advice up to its colon, where it has one: "dcm2niix is not installed where the engine can find it"; the rest stays a hover away. */
export function firstClause(words: string): string {
  const s = firstSentence(words);
  const at = s.indexOf(": ");
  return at > 0 ? s.slice(0, at) : s;
}
