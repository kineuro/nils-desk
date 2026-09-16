// SPDX-License-Identifier: AGPL-3.0-only
// The release form (Wave 4c section 7.5): the desk shows exactly what will
// be released and who authored each edit, and requires the person to type
// the selection's name before the door is called. What goes to the door is
// what the engine's release door accepts: a stack list read off a handle,
// or cohorts, subjects and axes named by hand.

import type { Column, HandleRow, Json } from "../ask/client";
import { columnName } from "../ask/client";

export interface ReleaseSource {
  kind: "handle" | "hand";
  handle?: HandleRow;
  cohorts?: string[];
  /** Record 26: every subject a digest of these datasets brought in. */
  datasets?: string[];
  subjects?: string[];
  axes?: string[];
}

/** The name the person has to type: the handle's, or `handle <id>` when unnamed; the release's own for a hand selection. */
export function confirmName(src: ReleaseSource, releaseName: string): string {
  if (src.kind === "handle" && src.handle) return src.handle.name ?? `handle ${src.handle.id}`;
  return releaseName.trim();
}

export function confirmed(src: ReleaseSource, releaseName: string, typed: string): boolean {
  const want = confirmName(src, releaseName);
  return want.length > 0 && typed.trim() === want;
}

/** The stack ids on a stack grain handle's rows: the `id` column, else the key. */
export function stackIds(columns: Column[], rows: unknown[][]): number[] {
  const names = columns.map(columnName);
  const at = names.indexOf("id") >= 0 ? names.indexOf("id") : names.indexOf("_key");
  if (at < 0) return [];
  return rows.map((r) => Number(r[at])).filter((n) => Number.isInteger(n));
}

/** What the dialog's date and UID selects hold while nothing is overridden: each dataset's own declared policy, which the body must not name. */
export const DATASETS_OWN = "datasets";

export interface ReleaseForm {
  name: string;
  out: string;
  layout?: string;
  /**
   * The run's date policy, sent only where the person overrode each
   * dataset's own. Record 26 section 13: a body naming `dates` or `uids` is
   * a run under the caller's flags, and then no dataset's declared policy
   * applies and moved dates with sessions named by the date are refused
   * rather than numbered. Absent, or `datasets`, leaves each dataset's own.
   */
  dates?: string;
  /** The same for the UIDs. */
  uids?: string;
  on_unknown?: string;
  pack?: string;
  scheme_name?: string;
}

/**
 * What an override costs, for the dialog to say before the run: naming
 * either policy makes the run one under the caller's flags, so no dataset's
 * own applies to its own files, and dates that move are then refused where
 * the sessions are named by the date rather than numbered in date order
 * (record 26 section 13 with section 4.3). Null where nothing is overridden.
 */
export function overrideNote(dates: string | undefined, uids: string | undefined): string | null {
  const d = dates?.trim() || DATASETS_OWN;
  const u = uids?.trim() || DATASETS_OWN;
  if (d === DATASETS_OWN && u === DATASETS_OWN) return null;
  const said = "An override sets the policy for every file of this release, so no dataset's own applies to its own files.";
  const moves = d === "shift" || d === "year";
  return moves ? `${said} Dates that move are then refused where the sessions are named by the date: name a months or ordinal scheme above, or keep the dates.` : said;
}

/** The body of POST /api/releases, or why there is none yet. */
export function releaseBody(src: ReleaseSource, f: ReleaseForm, stacks: number[]): { ok: true; body: Json; summary: string } | { ok: false; why: string } {
  if (!f.name.trim()) return { ok: false, why: "a name for the release" };
  if (!f.out.trim()) return { ok: false, why: "where to write, a directory on the engine's host" };
  const body: Json = { name: f.name.trim(), out: f.out.trim() };
  for (const k of ["layout", "on_unknown", "pack", "scheme_name"] as const) {
    const v = f[k]?.trim();
    if (v) body[k] = v;
  }
  // record 26 section 13: only an override the person chose is named here. A
  // body carrying dates or uids is a run under the caller's flags, under
  // which a dataset's own declared policy can never take effect.
  for (const k of ["dates", "uids"] as const) {
    const v = f[k]?.trim();
    if (v && v !== DATASETS_OWN) body[k] = v;
  }
  if (src.kind === "handle") {
    if (!src.handle) return { ok: false, why: "a handle" };
    if (src.handle.grain !== "stack") return { ok: false, why: `a release reads stacks; this handle is at the ${src.handle.grain} grain. Set the answer set to a stack set and run again` };
    if (src.handle.truncated) return { ok: false, why: "a truncated answer is not released" };
    // the door reads a stack handle's keys itself, and refuses one that no longer reproduces; rows read here are sent as they are
    if (stacks.length === 0) {
      body.handle = src.handle.id;
      return { ok: true, body, summary: `${src.handle.row_count.toLocaleString("en-US")} stacks of handle ${src.handle.id}` };
    }
    body.stacks = stacks;
    return { ok: true, body, summary: `${stacks.length} stacks off handle ${src.handle.id}` };
  }
  const parts: string[] = [];
  if (src.cohorts?.length) {
    body.cohorts = src.cohorts;
    parts.push(`every current member of ${src.cohorts.join(", ")}`);
  }
  if (src.datasets?.length) {
    body.datasets = src.datasets;
    parts.push(`every subject brought in by ${src.datasets.join(", ")}`);
  }
  if (src.subjects?.length) {
    body.subjects = src.subjects;
    parts.push(`${src.subjects.length} subjects by code`);
  }
  if (src.axes?.length) {
    body.axes = src.axes;
    parts.push(`stacks holding ${src.axes.join(" and ")}`);
  }
  if (parts.length === 0) return { ok: false, why: "a cohort, a dataset, subjects or an axis value to select by" };
  return { ok: true, body, summary: parts.join("; ") };
}

/** A comma or newline separated list, trimmed, empties dropped. */
export function list(text: string): string[] {
  return text.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
}
