// SPDX-License-Identifier: AGPL-3.0-only
// A dataset's scans (Wave 7a, the try of 2026-10-09: "where should I open a
// scan?"): the engine's scans door lists the stacks a dataset's digests
// created, a page at a time, read from the registry and never through a
// cohort, each with its open questions (record 55 H2) and, since the dataset
// view (2026-10-09), its names, datatype and what NILS says it is. Below
// detail quasi the engine answers the subject's code, the day and a date
// label as their shapes, so the tree groups by the subject's and the
// session's ids, which it always answers.

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
  /** What NILS calls it: its descriptive name, else the series description, else the scan's number. */
  name: string;
  /** The series description as the scanner wrote it, shown beside the name. */
  description: string | null;
  /** Its BIDS name without sub- and ses-, null where the standard has none. */
  bids: string | null;
  /** anat, dwi, func, perf, fmap or other. */
  datatype: string;
  /** The folder a descriptive release puts it in: anat, anat/SyMRI, dwi, localizer, misc ... */
  folder: string;
  /** What NILS says it is, axis by axis, as stored. */
  axes: Record<string, string>;
  /** The scanner's series number, the order it was acquired in. */
  series: number | null;
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
  /** The dataset view's names (added 2026-10-09); absent from an engine before them. */
  name?: string | null;
  bids?: string | null;
  datatype?: string | null;
  folder?: string | null;
  axes?: Record<string, string> | null;
  series_number?: number | null;
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

/** The datatypes a scan is shown under, in the tree's order. */
export const DATATYPES = ["anat", "dwi", "func", "fmap", "perf", "other"];

/** A scan's name: NILS's own where the engine gave one it could build, else what the scanner wrote, else its number. */
function nameOf(r: ScanRow): string {
  const n = typeof r.name === "string" ? r.name.trim() : "";
  if (n !== "" && n !== "unknown") return n;
  return r.series_description || `Scan ${r.stack}`;
}

function axesOf(a: ScanRow["axes"]): Record<string, string> {
  const out: Record<string, string> = {};
  if (!a || typeof a !== "object") return out;
  for (const [k, v] of Object.entries(a)) if (typeof v === "string" && v !== "") out[k] = v;
  return out;
}

/** The door's rows as the list's scans. */
export function scansOf(rows: ScanRow[]): Scan[] {
  return rows.map((r) => ({
    id: r.stack,
    subjectId: r.subject.id,
    subject: r.subject.code ?? `Subject ${r.subject.id}`,
    session: r.session?.id ?? null,
    label: r.session?.label ?? null,
    day: r.day,
    name: nameOf(r),
    description: r.series_description || null,
    bids: typeof r.bids === "string" && r.bids !== "" ? r.bids : null,
    datatype: DATATYPES.includes(r.datatype ?? "") ? (r.datatype as string) : "other",
    folder: typeof r.folder === "string" && r.folder !== "" ? r.folder : (r.datatype ?? "other"),
    axes: axesOf(r.axes),
    series: typeof r.series_number === "number" ? r.series_number : null,
    orientation: r.orientation,
    images: r.images,
    picture: r.picture && typeof r.picture.data === "string" && r.picture.data !== "" ? r.picture.data : null,
    partial: r.picture?.partial === true,
    questions: Array.isArray(r.questions) ? r.questions.filter((q): q is string => typeof q === "string") : [],
  }));
}

/** A scan's open questions in words, for its picture's hover: "body_part:low_confidence" reads "body part, low confidence". */
export function questionWords(s: Pick<Scan, "questions">): string {
  return s.questions.map((q) => q.replaceAll("_", " ").replace(":", ", ")).join("; ");
}

/** How many scans a page of the tree reads: the most the door gives. */
export const TREE_PAGE = 200;

export const scanDoors = {
  /** A page of the dataset's scans without pictures, the most at a time, for the tree: names, places and questions. */
  tree: (dataset: string, after: number | null = null): Promise<ScanPage> => {
    const q = new URLSearchParams({ limit: String(TREE_PAGE) });
    if (after !== null) q.set("after", String(after));
    return door<ScansAnswer>("GET", `/api/datasets/${encodeURIComponent(dataset)}/scans?${q}`).then((a) => ({
      total: a.total,
      scans: scansOf(a.scans ?? []),
      next: a.next ?? null,
      pictures: null,
    }));
  },
};

/** Whether this person may list scans here: Data reading, and the scans door served. */
export function mayListScans(caps: Capabilities): boolean {
  return may(caps, "data:see") && served(caps, SCANS_DOOR);
}
