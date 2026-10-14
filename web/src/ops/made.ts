// SPDX-License-Identifier: AGPL-3.0-only
// What a run made, unit by unit (2026-10-12; Nima, trying the desk: "done-fail
// should be per unit of job not the whole thing"). A run keeps its status;
// what a person reads of it is its units summed, as the engine says them
// (`made`): how many made what they were for, failed and for what, were
// skipped and for what they lacked, and whether it made nothing at all, as a
// run every unit of which was skipped did though it is done. The Runs table,
// a run's page and the run's job all read it the same way: a tag that sums
// the units ("3 of 4 made", "nothing made"), never a bare done, and the rest
// on one line ("1 skipped: no FLAIR picked"). The reasons are the engine's
// words; an engine from before `made` gives the counts alone.

import type { Json } from "../ask/client";

/** One reason of a run's units, with how many units it holds (null where the engine withholds a count below detail quasi). */
export interface MadeWhy {
  status: string;
  why: string;
  units: number | null;
}

/** A run's units summed, as the engine answers `made`. */
export interface Made {
  units: number;
  /** null where the engine withholds it below detail quasi. */
  made: number | null;
  failed: number | null;
  skipped: number | null;
  left: number;
  nothing: boolean;
  line: string | null;
  why: MadeWhy[];
}

const n = (v: number) => v.toLocaleString("en-US");
const obj = (v: unknown): Json => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** A count of a summary's units: null where withheld, 0 where not said. */
function counted(units: Json, key: string): number | null {
  if (!(key in units)) return 0;
  return units[key] === null ? null : (num(units[key]) ?? 0);
}

/** What a run made: the engine's `made`, else its summary's counts from an engine before it; null where no unit was counted yet. */
export function madeOf(r: { made?: unknown; summary?: Json | null } | null | undefined): Made | null {
  if (!r) return null;
  const m = obj(r.made);
  if (typeof m.units === "number") {
    return {
      units: m.units,
      made: num(m.made),
      failed: num(m.failed),
      skipped: num(m.skipped),
      left: num(m.left) ?? 0,
      nothing: m.nothing === true,
      line: typeof m.line === "string" ? m.line : null,
      why: (Array.isArray(m.why) ? (m.why as Json[]) : []).flatMap((w) => (typeof w.why === "string" ? [{ status: String(w.status ?? ""), why: w.why, units: num(w.units) }] : [])),
    };
  }
  const units = obj(obj(r.summary).units);
  const total = num(units.total);
  if (total === null) return null;
  const made = counted(units, "succeeded");
  const f = counted(units, "failed");
  const u = counted(units, "unreported");
  const failed = f === null || u === null ? null : f + u;
  const skipped = counted(units, "skipped");
  const left = made !== null && failed !== null && skipped !== null ? Math.max(0, total - made - failed - skipped) : 0;
  return { units: total, made, failed, skipped, left, nothing: total > 0 && made === 0 && left === 0, line: null, why: [] };
}

/** One status's reasons, after a colon: ": no FLAIR picked", or with their counts where there are several. */
function reasonsWords(m: Made, status: string): string {
  const mine = m.why.filter((w) => w.status === status);
  if (mine.length === 0) return "";
  if (mine.length === 1) return `: ${mine[0].why}`;
  const shown = mine.slice(0, 3).map((w) => (w.units === null ? w.why : `${w.why} (${n(w.units)})`));
  if (mine.length > 3) shown.push(`${n(mine.length - 3)} more`);
  return `: ${shown.join(", ")}`;
}

/** The units summed as a person reads them: the head a tag carries, the rest on one line, and whether it needs a look. */
export interface MadeWords {
  /** "4 of 4 made", "3 of 4 made", "nothing made". */
  head: string;
  /** "1 skipped: no FLAIR picked"; null where every unit made what it was for. */
  rest: string | null;
  tone: "ok" | "caution";
}

export function madeWords(m: Made): MadeWords {
  if (m.units === 0) return { head: "no units", rest: null, tone: "caution" };
  const head = m.made === null ? `${n(m.units)} units` : m.made === 0 ? "nothing made" : `${n(m.made)} of ${n(m.units)} made`;
  const parts: string[] = [];
  // after "nothing made" the first count says of how many
  let ofTotal = m.made === 0;
  for (const [status, count] of [
    ["failed", m.failed],
    ["skipped", m.skipped],
  ] as const) {
    if (count === 0) continue;
    const reasons = reasonsWords(m, status);
    if (count === null) parts.push(`fewer than five ${status}${reasons}`);
    else {
      parts.push(`${ofTotal ? `${n(count)} of ${n(m.units)}` : n(count)} ${status}${reasons}`);
      ofTotal = false;
    }
  }
  if (m.left > 0) parts.push(`${n(m.left)} left`);
  const all = m.made !== null && m.made === m.units;
  return { head, rest: parts.length > 0 ? parts.join(" · ") : null, tone: all ? "ok" : "caution" };
}

/** The tag a run carries, by its status and what its units made: running in the brand's colour, failed in caution, a run that ended its units summed (all made, ok; anything less, caution), and the rest of the line for under its row. */
export function runTag(r: { status: string; made?: unknown; summary?: Json | null }): { className: string; words: string; rest: string | null } {
  if (r.status === "running" || r.status === "queued") return { className: "tag brand", words: r.status, rest: null };
  if (r.status === "failed") return { className: "tag caution", words: "failed", rest: null };
  if (r.status === "done" || r.status === "partial") {
    const m = madeOf(r);
    if (m && m.units > 0) {
      const w = madeWords(m);
      return { className: w.tone === "ok" ? "tag ok" : "tag caution", words: w.head, rest: w.rest };
    }
    return { className: r.status === "done" ? "tag ok" : "tag caution", words: r.status, rest: null };
  }
  return { className: "tag", words: r.status, rest: null };
}

/** The units of a run folded by why, one line a reason with the units under it: skipped ones by what they lacked, failed ones by their failure's line. */
export function unitsByWhy(units: { unit: string | null; status: string | null; lacks?: string[] | null; failure?: unknown; error?: string | null }[]): { status: string; why: string; units: string[] }[] {
  const by = new Map<string, { status: string; why: string; units: string[] }>();
  for (const u of units) {
    let said: string[];
    if (u.status === "skipped") said = u.lacks && u.lacks.length > 0 ? u.lacks : ["skipped"];
    else if (u.status === "failed" || u.status === "unreported") {
      const f = obj(u.failure);
      said = [typeof f.cause === "string" ? causeWords(f.cause) : (u.error ?? "failed")];
    } else continue;
    for (const why of said) {
      const k = `${u.status === "skipped" ? "skipped" : "failed"}\u0000${why}`;
      const row = by.get(k) ?? { status: u.status === "skipped" ? "skipped" : "failed", why, units: [] };
      if (u.unit) row.units.push(u.unit);
      by.set(k, row);
    }
  }
  return [...by.values()].sort((a, b) => b.units.length - a.units.length);
}

/** A failure's cause in a few words, as the engine's line says it. */
export function causeWords(cause: string): string {
  const words: Record<string, string> = {
    dcm2niix: "no dcm2niix",
    runtime: "the container runtime failed",
    subuid: "too few subordinate ids",
    image: "the image did not pull",
    gpu_driver: "no GPU driver",
    memory: "out of memory",
    disk: "the disk is full",
    gpu_memory: "out of GPU memory",
    lane: "beyond the lane",
    time: "out of time",
    input: "an input refused",
    pipeline: "the pipeline's own error",
  };
  return words[cause] ?? cause.replace(/_/gu, " ");
}
