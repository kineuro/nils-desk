// SPDX-License-Identifier: AGPL-3.0-only
// The release form (Wave 4c section 7.5): the desk shows exactly what will
// be released and who authored each edit, and requires the person to type
// the selection's name before the door is called. What goes to the door is
// what the engine's release door accepts: a stack list read off a handle,
// or cohorts, subjects and axes named by hand.

import { countText } from "../ask/held";
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

/** What the dialog's UID select holds while nothing is overridden: each dataset's own declared policy, which the body must not name. */
export const DATASETS_OWN = "datasets";

/** What the choice of BIDS names says on hover, in the engine's own terms (record 55 C4). The engine writes full unless asked. */
export const NAMES_HINT = "Full spells in acq- every slot a BIDS entity has no place for: the body part, orientation, 2D or 3D, modifiers, technique and construct. Minimal spells 2D or 3D, the modifiers and the technique, and nothing else. Every axis is in the sidecar either way.";

export interface ReleaseForm {
  name: string;
  out: string;
  layout?: string;
  /**
   * Which BIDS names the release writes, sent only where the person chose
   * the other than the engine's own (minimal) and the layout is BIDS: the
   * descriptive tree is v0's grammar whatever is asked, and the engine
   * refuses minimal beside it. Absent, or full, leaves the engine's own.
   */
  naming?: string;
  /**
   * The run's UID policy, sent only where the person overrode each
   * dataset's own. Record 26 section 13: a body naming `uids` is a run under
   * the caller's flags, and then no dataset's declared policy applies.
   * Absent, or `datasets`, leaves each dataset's own. There is no date
   * policy to send: every release keeps the real date (record 38 S3), and
   * the door refuses any but `keep`.
   */
  uids?: string;
  on_unknown?: string;
  pack?: string;
  scheme_name?: string;
  /** The expert options (gate T31, step 13.8), sent only where the person changed one and the engine reads it. */
  expert?: Expert;
  /** The expert options the engine reads (`expertOffered`). */
  offered?: readonly string[];
}

/**
 * The release door's expert options (gate T31, step 13.8): where a
 * localizer, a vendor's synthetic contrast and a DICOM copy go in a BIDS
 * tree, the converter, uncompressed NIfTI, the authors, the categories of
 * element removed, the UID root, only the picked stacks and only some roles.
 * Each empty or default field is left for the engine's own default.
 */
export interface Expert {
  localizers?: string;
  synthetic?: string;
  dicom?: string;
  converter?: string;
  /** False writes .nii; true or absent leaves the engine's .nii.gz. */
  compress?: boolean;
  /** Comma or newline separated. */
  authors?: string;
  /** The categories removed; absent or every one leaves the engine's own (all). */
  categories?: string[];
  uid_root?: string;
  picked?: boolean;
  /** Comma or newline separated. */
  roles?: string;
}

/** The categories of element a release removes, all by default, in the engine's words. */
export const CATEGORIES = ["patient", "trial", "provider", "institution", "times", "ids"] as const;

/** The choices of the BIDS placements, each with the engine's default first. */
export const PLACEMENTS = {
  localizers: [
    ["sourcedata", "Localizers in sourcedata"],
    ["datatype", "Localizers in their datatype"],
    ["anat", "Localizers in anat"],
    ["drop", "Localizers left out"],
  ],
  synthetic: [
    ["folder", "Synthetic contrasts in their folder"],
    ["anat", "Synthetic contrasts in anat"],
    ["derivatives", "Synthetic contrasts in derivatives"],
  ],
  dicom: [
    ["all", "DICOM copy of every stack"],
    ["folders", "DICOM copy of stacks in a folder"],
    ["none", "No DICOM copy"],
  ],
} as const;

/** The expert options this engine's release door reads, as its capabilities name them; none from an engine before them. */
export function expertOffered(engine: Record<string, unknown> | null | undefined): string[] {
  const r = engine?.["releases"] as { expert?: unknown } | undefined;
  return Array.isArray(r?.expert) ? r.expert.filter((x): x is string => typeof x === "string") : [];
}

/**
 * The expert options as the door's fields, only what differs from the
 * engine's own default and only what `offered` names; the placements and the
 * converter only beside BIDS, where the engine reads them. A field that is not
 * well formed is the reason there is no body.
 */
export function expertBody(e: Expert | undefined, layout: string | undefined, offered: readonly string[]): { ok: true; body: Json } | { ok: false; why: string } {
  const body: Json = {};
  if (!e) return { ok: true, body };
  const may = (k: string) => offered.includes(k);
  const bids = layout?.trim() === "bids";
  const defaults: Record<string, string> = { localizers: "sourcedata", synthetic: "folder", dicom: "all" };
  for (const k of ["localizers", "synthetic", "dicom"] as const) {
    const v = e[k]?.trim();
    if (bids && v && v !== defaults[k] && may(k)) body[k] = v;
  }
  const converter = e.converter?.trim();
  if (bids && converter && converter !== "dcm2niix" && may("converter")) {
    const name = converter.split("/").pop() ?? "";
    if (!converter.startsWith("/") || (name !== "dcm2niix" && name !== "dcm2niix.exe")) return { ok: false, why: "a converter that is the full path of a file named dcm2niix" };
    body.converter = converter;
  }
  if (bids && e.compress === false && may("compress")) body.compress = false;
  const authors = list(e.authors ?? "");
  if (authors.length > 0 && may("authors")) body.authors = authors;
  if (e.categories && e.categories.length < CATEGORIES.length && may("categories")) {
    if (e.categories.length === 0) return { ok: false, why: "at least one category of element to remove" };
    body.categories = CATEGORIES.filter((c) => e.categories?.includes(c));
  }
  const root = e.uid_root?.trim().replace(/\.$/, "");
  if (root && may("uid_root")) {
    if (!/^(0|[1-9][0-9]*)(\.(0|[1-9][0-9]*))*$/.test(root) || root.length > 55) return { ok: false, why: "a UID root of numbers joined by dots, at most 55 characters, such as 1.2.826.0.1.3680043.10.543" };
    body.uid_root = root;
  }
  if (e.picked === true && may("picked")) body.picked = true;
  const roles = list(e.roles ?? "");
  if (roles.length > 0 && may("roles")) body.roles = roles;
  return { ok: true, body };
}

/** How many expert options differ from the engine's own, for the fold's summary. */
export function expertCount(e: Expert | undefined, layout: string | undefined, offered: readonly string[]): number {
  const b = expertBody(e, layout, offered);
  return b.ok ? Object.keys(b.body).length : 0;
}

/**
 * What an override costs, for the dialog to say before the run: naming the
 * UID policy makes the run one under the caller's flags, so no dataset's own
 * applies to its own files (record 26 section 13). Null where nothing is
 * overridden.
 */
export function overrideNote(uids: string | undefined): string | null {
  const u = uids?.trim() || DATASETS_OWN;
  if (u === DATASETS_OWN) return null;
  return "An override sets the UID policy for every file of this release, so no dataset's own applies to its own files.";
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
  // body carrying uids is a run under the caller's flags, under which a
  // dataset's own declared policy can never take effect. The dates are never
  // named: every release keeps the real date (record 38 S3).
  const uids = f.uids?.trim();
  if (uids && uids !== DATASETS_OWN) body.uids = uids;
  // record 55 C4: only the choice the engine does not make by itself is named, and only beside BIDS
  if (f.layout?.trim() === "bids" && f.naming?.trim() === "minimal") body.naming = "minimal";
  // gate T31, step 13.8: the expert options the person changed, where the engine reads them
  const expert = expertBody(f.expert, f.layout, f.offered ?? []);
  if (!expert.ok) return { ok: false, why: expert.why };
  Object.assign(body, expert.body);
  if (src.kind === "handle") {
    if (!src.handle) return { ok: false, why: "a handle" };
    if (src.handle.grain !== "stack") return { ok: false, why: `a release reads stacks; this handle is at the ${src.handle.grain} grain. Set the answer set to a stack set and run again` };
    if (src.handle.truncated) return { ok: false, why: "a truncated answer is not released" };
    // the door reads a stack handle's keys itself, and refuses one that no longer reproduces; rows read here are sent as they are
    if (stacks.length === 0) {
      body.handle = src.handle.id;
      return { ok: true, body, summary: `${countText(src.handle.row_count)} stacks of handle ${src.handle.id}` };
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
