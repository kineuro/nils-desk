// SPDX-License-Identifier: AGPL-3.0-only
// A dataset's scans (Wave 7a, the try of 2026-10-09: "where should I open a
// scan?"): the engine's scans door lists the stacks a dataset's digests
// created, a page at a time, read from the registry and never through a
// cohort, each with its picture and its open questions (record 55 H2). Below detail quasi the engine answers the subject's code, the day
// and a date label as their shapes, so the list groups by the subject's and
// the session's ids, which it always answers.

import { door } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";

/** One scan as the list draws it. */
export interface Scan {
  id: number;
  subjectId: number;
  subject: string;
  /** The session it belongs to, or null where the engine has none built. */
  session: number | null;
  label: string | null;
  day: string | null;
  name: string;
  orientation: string | null;
  images: number | null;
  /** The middle plane as a small picture (a data URL), where the engine made one at sort time. */
  picture: string | null;
  /** The kinds of review still open on it; empty when the sort is sure of it. */
  questions: string[];
}

/** One page of a dataset's scans and the cursor of the next. */
export interface ScanPage {
  total: number;
  scans: Scan[];
  /** The stack id the next page is read after, or null at the end. */
  next: number | null;
}

/** One scan as the engine's scans door answers it. */
export interface ScanRow {
  stack: number;
  subject: { id: number; code: string | null };
  session: { id: number; label: string | null } | null;
  series_description: string | null;
  orientation: string | null;
  images: number | null;
  day: string | null;
  /** With `pictures=1`: the middle plane's picture, about 256 px, as a data URL. */
  picture?: string | null;
  /** With `pictures=1`: the open review kinds; empty is sure. */
  questions?: string[] | null;
}

interface ScansAnswer {
  total: number;
  scans: ScanRow[];
  next: number | null;
}

export const SCANS_DOOR = "GET /api/datasets/{name}/scans";
export const SCANS_PAGE = 50;

/** The door's rows as the list's scans. */
export function scansOf(rows: ScanRow[]): Scan[] {
  return rows.map((r) => ({
    id: r.stack,
    subjectId: r.subject.id,
    subject: r.subject.code ?? `Subject ${r.subject.id}`,
    session: r.session?.id ?? null,
    label: r.session?.label ?? null,
    day: r.day,
    name: r.series_description || `Scan ${r.stack}`,
    orientation: r.orientation,
    images: r.images,
    picture: typeof r.picture === "string" && r.picture !== "" ? r.picture : null,
    questions: Array.isArray(r.questions) ? r.questions.filter((q): q is string => typeof q === "string") : [],
  }));
}

export interface SessionGroup {
  key: string;
  day: string | null;
  scans: Scan[];
}
export interface SubjectGroup {
  key: number;
  subject: string;
  sessions: SessionGroup[];
}

/** The scans grouped by subject, then by session, in the order they came. */
export function groupScans(scans: Scan[]): SubjectGroup[] {
  const subjects: SubjectGroup[] = [];
  for (const s of scans) {
    let g = subjects.find((x) => x.key === s.subjectId);
    if (!g) subjects.push((g = { key: s.subjectId, subject: s.subject, sessions: [] }));
    const key = s.session !== null ? `s${s.session}` : `d${s.day ?? ""}`;
    let ses = g.sessions.find((x) => x.key === key);
    if (!ses) g.sessions.push((ses = { key, day: s.day, scans: [] }));
    ses.scans.push(s);
  }
  return subjects;
}

/** A scan's open questions in words, for its picture's hover: "body_part:low_confidence" reads "body part, low confidence". */
export function questionWords(s: Pick<Scan, "questions">): string {
  return s.questions.map((q) => q.replaceAll("_", " ").replace(":", ", ")).join("; ");
}

/** A scan's few facts in one line: its orientation and how many images. */
export function scanFacts(s: Scan): string {
  const parts: string[] = [];
  if (s.orientation) parts.push(s.orientation.toLowerCase());
  if (s.images !== null) parts.push(`${s.images.toLocaleString("en-US")} ${s.images === 1 ? "image" : "images"}`);
  return parts.join(" · ");
}

export const scanDoors = {
  /** A page of the dataset's scans with their pictures, after the stack the page before ended on: fifty pictures in one request. */
  page: (dataset: string, after: number | null = null): Promise<ScanPage> => {
    const q = new URLSearchParams({ pictures: "1", limit: String(SCANS_PAGE) });
    if (after !== null) q.set("after", String(after));
    return door<ScansAnswer>("GET", `/api/datasets/${encodeURIComponent(dataset)}/scans?${q}`).then((a) => ({
      total: a.total,
      scans: scansOf(a.scans ?? []),
      next: a.next ?? null,
    }));
  },
};

/** Whether this person may list scans here: Data reading, and the scans door served. */
export function mayListScans(caps: Capabilities): boolean {
  return may(caps, "data:see") && served(caps, SCANS_DOOR);
}
