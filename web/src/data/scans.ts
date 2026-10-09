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
  /** The picture is a first one from the scan's one file while its preview is made: taken over when the whole one comes. */
  partial: boolean;
  /** The kinds of review still open on it; empty when the sort is sure of it. */
  questions: string[];
}

/** Whether the page's pictures were shown, and if not why; how many are still being made. */
export interface PagePictures {
  shown: boolean;
  why: string | null;
  /** Scans on the page whose picture is not made yet (the engine makes them now). */
  missing: number;
  /** Scans on the page whose picture is a first one while their preview is made: waited for like the missing. */
  partial: number;
}

/** One page of a dataset's scans and the cursor of the next. */
export interface ScanPage {
  total: number;
  scans: Scan[];
  /** The stack id the next page is read after, or null at the end. */
  next: number | null;
  /** Null where the engine answered no pictures block. */
  pictures: PagePictures | null;
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
  /** With `pictures=1`: the middle plane's picture, about 256 px, its data a JPEG data URL; null where none is made yet. */
  picture?: { data: string; width: number; height: number; digest: string | null; held: boolean; partial?: boolean } | null;
  /** With `pictures=1`: the open review kinds; empty is sure. */
  questions?: string[] | null;
}

interface ScansAnswer {
  total: number;
  scans: ScanRow[];
  next: number | null;
  /** With `pictures=1`. */
  pictures?: { shown?: boolean; why?: string | null; missing?: number; partial?: number; place?: string | null } | null;
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
    picture: r.picture && typeof r.picture.data === "string" && r.picture.data !== "" ? r.picture.data : null,
    partial: r.picture?.partial === true,
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

/** The page's pictures block as the list reads it. */
export function picturesOf(p: ScansAnswer["pictures"]): PagePictures | null {
  if (!p || typeof p !== "object") return null;
  return {
    shown: p.shown === true,
    why: typeof p.why === "string" && p.why !== "" ? p.why : null,
    missing: typeof p.missing === "number" && p.missing > 0 ? p.missing : 0,
    partial: typeof p.partial === "number" && p.partial > 0 ? p.partial : 0,
  };
}

/** Pictures still to come on a page: the missing and the partial ones. */
export function picturesToCome(p: PagePictures | null | undefined): number {
  return p ? p.missing + p.partial : 0;
}

/**
 * The pictures a page read again brought, filled into the page shown: a
 * scan with no picture, or a partial one, takes the new one (a partial one
 * only where it had none), nothing else moves; the page's counts are the
 * new ones. The same page back where nothing came.
 */
export function fillPictures(was: ScanPage, fresh: ScanPage): ScanPage {
  const pics = new Map(fresh.scans.filter((s) => s.picture !== null).map((s) => [s.id, s]));
  let changed = false;
  const scans = was.scans.map((s) => {
    const f = s.picture === null || s.partial ? pics.get(s.id) : undefined;
    if (!f || (f.partial && s.picture !== null)) return s;
    changed = true;
    return { ...s, picture: f.picture, partial: f.partial };
  });
  const missing = fresh.pictures?.missing ?? 0;
  const partial = fresh.pictures?.partial ?? 0;
  if (!changed && (was.pictures?.missing ?? 0) === missing && (was.pictures?.partial ?? 0) === partial) return was;
  return { ...was, scans, pictures: was.pictures ? { ...was.pictures, missing, partial } : fresh.pictures };
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
      pictures: picturesOf(a.pictures),
    }));
  },
};

/** Whether this person may list scans here: Data reading, and the scans door served. */
export function mayListScans(caps: Capabilities): boolean {
  return may(caps, "data:see") && served(caps, SCANS_DOOR);
}
