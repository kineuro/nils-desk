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

export interface ReleaseForm {
  name: string;
  out: string;
  layout?: string;
  dates?: string;
  on_unknown?: string;
  pack?: string;
  scheme_name?: string;
}

/** The body of POST /api/releases, or why there is none yet. */
export function releaseBody(src: ReleaseSource, f: ReleaseForm, stacks: number[]): { ok: true; body: Json; summary: string } | { ok: false; why: string } {
  if (!f.name.trim()) return { ok: false, why: "a name for the release" };
  if (!f.out.trim()) return { ok: false, why: "where to write, a directory on the engine's host" };
  const body: Json = { name: f.name.trim(), out: f.out.trim() };
  for (const k of ["layout", "dates", "on_unknown", "pack", "scheme_name"] as const) {
    const v = f[k]?.trim();
    if (v) body[k] = v;
  }
  if (src.kind === "handle") {
    if (!src.handle) return { ok: false, why: "a handle" };
    if (src.handle.grain !== "stack") return { ok: false, why: `a release reads stacks; this handle is at the ${src.handle.grain} grain. Set the answer set to a stack set and run again` };
    if (src.handle.truncated) return { ok: false, why: "a truncated answer is not released" };
    if (stacks.length === 0) return { ok: false, why: "the handle's rows are not here yet" };
    body.stacks = stacks;
    return { ok: true, body, summary: `${stacks.length} stacks off handle ${src.handle.id}` };
  }
  const parts: string[] = [];
  if (src.cohorts?.length) {
    body.cohorts = src.cohorts;
    parts.push(`every current member of ${src.cohorts.join(", ")}`);
  }
  if (src.subjects?.length) {
    body.subjects = src.subjects;
    parts.push(`${src.subjects.length} subjects by code`);
  }
  if (src.axes?.length) {
    body.axes = src.axes;
    parts.push(`stacks holding ${src.axes.join(" and ")}`);
  }
  if (parts.length === 0) return { ok: false, why: "a cohort, subjects or an axis value to select by" };
  return { ok: true, body, summary: parts.join("; ") };
}

/** A comma or newline separated list, trimmed, empties dropped. */
export function list(text: string): string[] {
  return text.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
}
