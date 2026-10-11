// SPDX-License-Identifier: AGPL-3.0-only
// What the shell shows across its reads of the capabilities. The shell reads
// them every 15 s, and a read can miss: the desk gives the engine 5 s, and an
// engine busy for longer, or a desk restarting, answers nothing in time. One
// such read replaced the whole page with "The engine did not answer" while
// everything else (a chat, a job) went on, and the next read brought it back.
// A page that was shown stays shown now: a read that misses keeps the last
// good one, and only reads that keep missing say that the engine is slow,
// above the page and without taking it away.

import type { Capabilities } from "./capabilities";
import { state } from "./deployment";

/** The capabilities as the shell holds them; `missed` counts the reads in a row that missed since they were read. */
export type Load =
  | { kind: "loading" }
  | { kind: "failed"; why: string }
  | { kind: "ready"; caps: Capabilities; missed: number; since: number | null };

/** One read of `/desk/capabilities`: what came back, or why nothing did. */
export type Read = { caps: Capabilities } | { error: string };

/** How often the shell reads the capabilities while they answer. */
export const READ_EVERY_MS = 15_000;
/** How soon it reads again after a read that missed, so a real outage is told and a passing one is over sooner. */
export const RETRY_MS = 3_000;
/** How many reads in a row must miss before the shell says the engine is slow. */
export const OUTAGE_AFTER = 3;

/** Whether a read missed: the desk did not answer, or it answered that the engine did not. */
export function missed(read: Read): boolean {
  return "error" in read || state(read.caps).kind === "no_engine";
}

/** The load after one more read, at `now`. */
export function next(prev: Load, read: Read, now: number): Load {
  if (!missed(read) && "caps" in read) return { kind: "ready", caps: read.caps, missed: 0, since: null };
  // a page that was shown stays shown, and the miss is counted
  if (prev.kind === "ready" && state(prev.caps).kind !== "no_engine") {
    return { ...prev, missed: prev.missed + 1, since: prev.since ?? now };
  }
  // nothing to keep: what the desk said is shown, as it said it
  if ("caps" in read) return { kind: "ready", caps: read.caps, missed: 0, since: null };
  if (prev.kind === "ready") return prev;
  return { kind: "failed", why: read.error };
}

/** Since when the engine has not answered, once enough reads in a row missed; null while it answers. */
export function outage(load: Load): number | null {
  return load.kind === "ready" && load.missed >= OUTAGE_AFTER ? load.since : null;
}
