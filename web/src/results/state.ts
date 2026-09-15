// SPDX-License-Identifier: AGPL-3.0-only
// The result surface (Wave 4c section 7.4) as a pure derivation: from the
// engine's handle rows, the jobs not over, the registry epoch and the desk's
// own record of runs and lineage, each result's named states and what its
// controls may do, with the reason on the control when they may not.

import type { DeskRecord, HandleRow, JobRow } from "../ask/client";
import { holdsGrant, type Grant } from "../grants";

export interface Running {
  job: number;
  name: string | null;
  state: JobRow["state"];
  document: number | null;
  since: string;
  heartbeat: string | null;
  progress: unknown;
}

export interface Stale {
  /** The named overlay the result is covered by. */
  overlay: string;
  document: number | null;
  /** The later document the desk knows, when the person went on editing. */
  moved_to: number | null;
}

export interface Truncated {
  /** "you" when the person's own limit cut the answer, "us" when the engine's cap did. */
  by: "you" | "us";
  limit: number | null;
}

export interface Control {
  enabled: boolean;
  reason: string | null;
}

export interface ResultState {
  handle: HandleRow;
  document: number | null;
  rows: "kept" | "dropped" | "withdrawn";
  stale: Stale | null;
  truncated: Truncated | null;
  release: Control;
  promote: Control;
  export: Control;
}

/** The ask run jobs not over, from the jobs door. */
export function running(jobs: JobRow[]): Running[] {
  return jobs
    .filter((j) => ["queued", "running", "cancelling"].includes(j.state))
    .filter((j) => {
      const argv = j.args?.argv ?? [];
      return argv[0] === "ask" && argv[1] === "run";
    })
    .map((j) => {
      const argv = j.args?.argv ?? [];
      const at = argv.indexOf("--document");
      const document = at >= 0 ? Number(argv[at + 1]) : null;
      return { job: j.id, name: j.name, state: j.state, document: Number.isFinite(document) ? document : null, since: j.started_at, heartbeat: j.heartbeat_at, progress: j.progress };
    });
}

/** Seconds since an ISO stamp, for the progress by 30 seconds. */
export function age(iso: string, now: number): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.max(0, Math.round((now - t) / 1000)) : 0;
}

function descendant(record: DeskRecord, document: number): number | null {
  // the newest document the desk knows that descends from this one
  let found: number | null = null;
  const seen = new Set<number>();
  const frontier = [document];
  while (frontier.length > 0) {
    const d = frontier.pop()!;
    if (seen.has(d)) continue;
    seen.add(d);
    for (const l of record.lineage) {
      if (l.parent === d) {
        found = found === null ? l.document : Math.max(found, l.document);
        frontier.push(l.document);
      }
    }
  }
  return found;
}

/** A result's states and controls for a person holding these grants; `canExport` is whether this desk's export is open to them (caps.desk.export). */
export function stateOf(h: HandleRow, record: DeskRecord, epoch: number, grants: readonly string[], canExport: boolean): ResultState {
  const document = record.results.find((r) => r.handle === h.id)?.document ?? null;
  const rows: ResultState["rows"] = h.withdrawn_at ? "withdrawn" : h.kept ? "kept" : "dropped";
  let stale: Stale | null = null;
  const moved = document !== null ? descendant(record, document) : null;
  if (moved !== null) stale = { overlay: `document ${document} moved on to ${moved}`, document, moved_to: moved };
  else if (h.epoch !== epoch) stale = { overlay: `the registry moved: epoch ${h.epoch} then, ${epoch} now`, document, moved_to: null };
  let truncated: Truncated | null = null;
  if (h.truncated) truncated = { by: h.limit !== null && h.row_count >= h.limit ? "you" : "us", limit: h.limit };
  const cannot = (why: string): Control => ({ enabled: false, reason: why });
  const can: Control = { enabled: true, reason: null };
  const gate = (need: Grant, what: string): Control | null => {
    if (rows === "withdrawn") return cannot("the handle was withdrawn");
    if (rows === "dropped") return cannot("the rows were dropped by retention");
    if (truncated) return cannot(truncated.by === "you" ? `a capped answer is not ${what}; raise your limit in the out step and run again` : `a truncated answer is not ${what}; narrow the question or run it as a job`);
    // the reason's order (Wave 5 section 6.6): truncated, stale, incomplete, grant
    if (stale) return cannot(stale.moved_to !== null ? `a stale answer is not ${what}; the question moved on to ${stale.moved_to}, run that` : `a stale answer is not ${what}; the registry moved to epoch ${epoch}, run the question again`);
    if (!holdsGrant(grants, need)) return cannot(`it is ${what} with the ${need} grant`);
    return null;
  };
  return {
    handle: h,
    document,
    rows,
    stale,
    truncated,
    release: gate("release:work", "released") ?? can,
    promote: h.grain === "subject" ? (gate("release:work", "promoted") ?? can) : cannot("only a subject handle is promoted into a cohort"),
    export: rows !== "kept" ? cannot(rows === "withdrawn" ? "the handle was withdrawn" : "the rows were dropped by retention") : stale ? cannot("a stale answer is not exported; run the question again") : canExport ? can : cannot("export is not open to you on this desk"),
  };
}

/** The states, newest first. */
export function surface(handles: HandleRow[], record: DeskRecord, epoch: number, grants: readonly string[], canExport: boolean): ResultState[] {
  return [...handles].sort((a, b) => b.id - a.id).map((h) => stateOf(h, record, epoch, grants, canExport));
}
