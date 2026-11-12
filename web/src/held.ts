// SPDX-License-Identifier: AGPL-3.0-only
// What the shell shows across its reads of the capabilities. The shell reads
// them every 15 s, and a read can miss: the desk gives the engine 5 s, and an
// engine busy for longer, or a desk restarting, answers nothing in time. One
// such read replaced the whole page with "The engine did not answer" while
// everything else (a chat, a job) went on, and the next read brought it back.
// A page that was shown stays shown now: a read that misses keeps the last
// good one, and only reads that keep missing say that the engine is slow,
// above the page and without taking it away.
//
// And the capabilities the pages are handed (2026-11-12): every read made a
// new object, a page that read its lists on arrival listed that object among
// what its arrival depends on, and so an open Data page asked for the datasets
// and the cohorts again with every read, 313 and 315 times in 100 minutes.
// The pages now keep the object they were handed for as long as the document
// says the same; a document that says something else (a grant, a door, a
// part's health, the registry's epoch) is handed on as before. The engine's
// uptime counts on with every read, so it is left out of that comparison and
// kept beside the document for the pages that say it.

import type { Capabilities } from "./capabilities";
import { state } from "./deployment";

/** The capabilities as the shell holds them; `missed` counts the reads in a row that missed since they were read. */
export type Load =
  | { kind: "loading" }
  | { kind: "failed"; why: string }
  | { kind: "ready"; caps: Capabilities; missed: number; since: number | null; /** The engine's uptime in seconds as last read, which `caps` keeps only as first read. */ uptime: number | null };

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

/** Whether two documents say the same: every key and every value, in arrays by their order. */
export function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => same(v, b[i]));
  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  const keys = Object.keys(x);
  return keys.length === Object.keys(y).length && keys.every((k) => k in y && same(x[k], y[k]));
}

/** The engine's uptime in seconds, as a read of the capabilities says it. */
export function uptimeOf(caps: Capabilities): number | null {
  const v = caps.engine?.["uptime_seconds"];
  return typeof v === "number" ? v : null;
}

/** The document without what counts on with every read: the engine's uptime. */
function steady(caps: Capabilities): unknown {
  if (!caps.engine || !("uptime_seconds" in caps.engine)) return caps;
  const { uptime_seconds: _counts, ...engine } = caps.engine;
  return { ...caps, engine };
}

/** The capabilities the pages are handed after a read: the object they hold already while the document says the same, so nothing that depends on it runs again. */
export function handed(prev: Load, caps: Capabilities): Capabilities {
  return prev.kind === "ready" && same(steady(prev.caps), steady(caps)) ? prev.caps : caps;
}

/** The load after one more read, at `now`. */
export function next(prev: Load, read: Read, now: number): Load {
  if (!missed(read) && "caps" in read) return { kind: "ready", caps: handed(prev, read.caps), missed: 0, since: null, uptime: uptimeOf(read.caps) };
  // a page that was shown stays shown, and the miss is counted
  if (prev.kind === "ready" && state(prev.caps).kind !== "no_engine") {
    return { ...prev, missed: prev.missed + 1, since: prev.since ?? now };
  }
  // nothing to keep: what the desk said is shown, as it said it
  if ("caps" in read) return { kind: "ready", caps: handed(prev, read.caps), missed: 0, since: null, uptime: uptimeOf(read.caps) };
  if (prev.kind === "ready") return prev;
  return { kind: "failed", why: read.error };
}

/** Since when the engine has not answered, once enough reads in a row missed; null while it answers. */
export function outage(load: Load): number | null {
  return load.kind === "ready" && load.missed >= OUTAGE_AFTER ? load.since : null;
}
