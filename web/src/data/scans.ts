// SPDX-License-Identifier: AGPL-3.0-only
// A dataset's scans (Wave 7a, the try of 2026-10-09: "where should I open a
// scan?"): the stacks of the cohort the dataset feeds, asked of the engine's
// ask door as one record set at stack grain and paged through its handle.
// The engine has no door that lists a dataset's own stacks, so a dataset that
// feeds no cohort has no list here.

import { door } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";

/** One scan as the list draws it. */
export interface Scan {
  id: number;
  subject: string;
  /** The session it belongs to, or null where the engine has none built. */
  session: number | null;
  day: string | null;
  name: string;
  orientation: string | null;
  images: number | null;
}

/** One page of a dataset's scans, with the handle the next pages are read from. */
export interface ScanPage {
  handle: number;
  page: number;
  pages: number;
  total: number | null;
  scans: Scan[];
}

export type Column = string | { name: string };

const COLUMNS = ["subject.code", "session.id", "id", "text_series_description", "orientation", "n_instances", "day"];

/** The ask for every stack of the cohort's current members, as one record set. */
export function scanAsk(cohort: string): Record<string, unknown> {
  return {
    ast_version: 1,
    params: { cohorts: { type: "list", value: [cohort] } },
    sets: {
      scope: { grain: "cohort", where: [["in", {}, ["field", {}, "name"], ["param", {}, "cohorts"]]] },
      people: { grain: "subject", of: "scope" },
      scans: { grain: "stack", of: "people" },
    },
    out: { set: "scans", level: "record", columns: COLUMNS.map((c) => ["field", {}, c]) },
  };
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const text = (v: unknown): string | null => (v === null || v === undefined || v === "" ? null : String(v));

/** The rows of an answer as scans, read by column name; a row without a stack id is left out. */
export function scansOf(columns: Column[], rows: unknown[][]): Scan[] {
  const names = columns.map((c) => (typeof c === "string" ? c : c.name));
  const at = (name: string) => names.indexOf(name);
  const [key, id, subject, session, name, orientation, images, day] = ["_key", "id", "subject.code", "session.id", "text_series_description", "orientation", "n_instances", "day"].map(at);
  const out: Scan[] = [];
  for (const r of rows) {
    const stack = num(id >= 0 ? r[id] : undefined) ?? num(key >= 0 ? r[key] : undefined);
    if (stack === null) continue;
    out.push({
      id: stack,
      subject: text(subject >= 0 ? r[subject] : null) ?? "?",
      session: num(session >= 0 ? r[session] : null),
      day: text(day >= 0 ? r[day] : null),
      name: text(name >= 0 ? r[name] : null) ?? `Scan ${stack}`,
      orientation: text(orientation >= 0 ? r[orientation] : null),
      images: num(images >= 0 ? r[images] : null),
    });
  }
  return out;
}

export interface SessionGroup {
  key: string;
  day: string | null;
  scans: Scan[];
}
export interface SubjectGroup {
  subject: string;
  sessions: SessionGroup[];
}

/** The scans grouped by subject, then by session, in the order they came. */
export function groupScans(scans: Scan[]): SubjectGroup[] {
  const subjects: SubjectGroup[] = [];
  for (const s of scans) {
    let g = subjects.find((x) => x.subject === s.subject);
    if (!g) subjects.push((g = { subject: s.subject, sessions: [] }));
    const key = s.session !== null ? `s${s.session}` : `d${s.day ?? ""}`;
    let ses = g.sessions.find((x) => x.key === key);
    if (!ses) g.sessions.push((ses = { key, day: s.day, scans: [] }));
    ses.scans.push(s);
  }
  return subjects;
}

/** A scan's few facts in one line: its orientation and how many images. */
export function scanFacts(s: Scan): string {
  const parts: string[] = [];
  if (s.orientation) parts.push(s.orientation.toLowerCase());
  if (s.images !== null) parts.push(`${s.images.toLocaleString("en-US")} ${s.images === 1 ? "image" : "images"}`);
  return parts.join(" · ");
}

interface RunAnswer {
  handle: number;
  columns: Column[];
  rows: unknown[][];
  pages?: number;
  row_count?: number;
}

export const scanDoors = {
  /** The first page: the ask run, which the engine caches by content at this epoch. */
  first: (cohort: string): Promise<ScanPage> =>
    door<RunAnswer>("POST", "/api/ask/run", { document: scanAsk(cohort) }).then((a) => ({
      handle: a.handle,
      page: 0,
      pages: Math.max(1, a.pages ?? 1),
      total: a.row_count ?? null,
      scans: scansOf(a.columns, a.rows),
    })),
  /** Another page of the same handle. */
  page: (handle: number, page: number, total: number | null): Promise<ScanPage> =>
    door<{ columns: Column[]; rows: unknown[][]; page: number; pages: number }>("GET", `/api/ask/handles/${handle}/rows?page=${page}`).then((a) => ({
      handle,
      page,
      pages: Math.max(1, a.pages),
      total,
      scans: scansOf(a.columns, a.rows),
    })),
};

/** Whether this person may list scans here: query work, and the ask doors served. */
export function mayListScans(caps: Capabilities): boolean {
  return may(caps, "query:work") && served(caps, "POST /api/ask/run") && served(caps, "GET /api/ask/handles/{id}/rows");
}
