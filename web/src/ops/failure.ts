// SPDX-License-Identifier: AGPL-3.0-only
// Why a run failed, as a person reads it (2026-10-12): the engine's error, and
// beside it since the engine's failure slice `failure` {kind, cause, advice,
// fix}: the kind (dependency, resource, input or pipeline), the cause
// (dcm2niix, runtime, subuid, image, gpu_driver, memory, disk, gpu_memory,
// lane, time, input or pipeline), one plain sentence of what to do, safe at
// every detail, and the install the engine offers where it has one. The line
// a person reads first is that sentence; an engine without the slice gets
// the error's first sentence. The same failure rides on a run, a unit, a job,
// a pre-flight and each of its checks (`requirements`), and on a run the
// jobs door or a step's Run door refused before queueing it (409).
//
// The names the engine gives these live in SLICE.

import { DoorError, type Json } from "../ask/client";

/** The engine's names for a failure and what rides with it. */
export const SLICE = {
  /** A run's, a unit's, a job's or a refusal's error, as every engine says it. */
  error: "error",
  /** Beside it: {kind, cause, advice, fix}, or null. */
  failure: "failure",
  /** What a run needs of this machine, each {check, ok, said, failure}: on a pre-flight and on a refused run. */
  requirements: "requirements",
  /** In a run's summary: the units that failed, by cause, [{kind, cause, units, withheld}]. */
  byCause: "failures_by_cause",
  /** In a run's summary: the dcm2niix its release ran, {version, path, found_by}. */
  converter: "converter",
  /** The tools the engine runs beside itself, each as `tools` names it in the capabilities. */
  tools: "GET /api/tools",
  toolsInCaps: "tools",
} as const;

/** The kinds the engine sorts a failure into. */
export const KINDS = ["dependency", "resource", "input", "pipeline"] as const;

/** The install the engine offers for a failure: the tool, its door, its command and the grant they need. */
export interface Fix {
  tool: string;
  door: string;
  command: string | null;
  grant: string | null;
}

export interface Failure {
  /** The engine's error, whole. */
  error: string;
  kind: string | null;
  cause: string | null;
  /** What to do, in the engine's words. */
  advice: string | null;
  /** The one line a person reads first: what to do, else the error's first sentence. */
  line: string;
  fix: Fix | null;
}

/** One check of what a run needs of this machine, as the pre-flight answers it. */
export interface Requirement {
  check: string;
  ok: boolean;
  said: string;
  failure: Failure | null;
}

const obj = (v: unknown): Json => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

/** The first sentence of an engine's words: up to the first stop followed by a space, the whole when there is none. */
export function firstSentence(words: string): string {
  const t = words.trim();
  const m = /^.*?[.!?](?=\s|$)/su.exec(t);
  return m ? m[0] : t;
}

/** The fix a failure offers, where it names a tool and its door. */
export function fixOf(v: unknown): Fix | null {
  const f = obj(v);
  const tool = text(f.tool);
  const door = text(f.door);
  return tool && door ? { tool, door, command: text(f.command), grant: text(f.grant) } : null;
}

/** The failure an answer holds: its error, and the slice's `failure` beside it where the engine gives one; null where it holds neither. */
export function failureOf(answer: unknown): Failure | null {
  const o = obj(answer);
  const error = text(o[SLICE.error]);
  const f = obj(o[SLICE.failure]);
  const kind = text(f.kind);
  const advice = text(f.advice);
  if (error === null && advice === null && kind === null) return null;
  const whole = error ?? advice ?? kind!;
  return { error: whole, kind, cause: text(f.cause), advice, line: advice ?? firstSentence(whole), fix: fixOf(f.fix) };
}

/** The checks an answer holds (a pre-flight, or a refused run), each with its failure where it fails. */
export function requirementsOf(answer: unknown): Requirement[] {
  const list = obj(answer)[SLICE.requirements];
  return (Array.isArray(list) ? list : []).flatMap((r): Requirement[] => {
    const c = obj(r);
    const check = text(c.check);
    if (!check) return [];
    const said = text(c.said) ?? "";
    const ok = c.ok === true;
    return [{ check, ok, said, failure: ok ? null : failureOf({ [SLICE.error]: said || check, [SLICE.failure]: c[SLICE.failure] }) }];
  });
}

/** A refused door's failure: the engine's answer read as one, else the error's own words. */
export function refusalOf(e: unknown): Failure {
  const body = e instanceof DoorError ? e.body : null;
  const words = e instanceof DoorError ? `the engine answered ${e.status}` : e instanceof Error ? e.message : String(e);
  return failureOf(body) ?? failureWords(words);
}

/** A failure held as words only, as an older page keeps it. */
export function failureWords(words: string): Failure {
  return { error: words, kind: null, cause: null, advice: null, line: firstSentence(words), fix: null };
}
