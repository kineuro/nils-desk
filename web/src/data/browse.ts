// SPDX-License-Identifier: AGPL-3.0-only
// The engine's own doors for choosing what to digest: the ingest locations it
// was started with, the folders inside a folder of one, a page at a time, and
// what a few of those folders hold. Every folder is named as @root/relative,
// the way a queued digest names it, and the engine lists nothing outside its
// locations. They answer an operator, where the supervisor's folders answer an
// admin on the host.

import { door } from "../ask/client";

/** A place in force that holds a folder. */
export interface PlaceRef {
  name: string;
  role: string;
}

export interface IngestRoot {
  name: string;
  path: string;
  place: PlaceRef | null;
}

export interface FolderEntry {
  name: string;
  /** Null when the folder did not answer in time, so its access was not asked. */
  readable: boolean | null;
  place: PlaceRef | null;
}

export interface FolderPage {
  at: string;
  root: string;
  rel: string;
  /** The folder's path on the engine's machine. */
  path: string;
  parent: string | null;
  /** Null where the folder did not answer in time and nothing was read. */
  exists: boolean | null;
  directory: boolean | null;
  readable: boolean | null;
  place: PlaceRef | null;
  folders: FolderEntry[];
  next: string | null;
  /** The folders that hold the filter, once the folder was read to its end. */
  total: number | null;
  files: { count: number; more: boolean };
  partial: boolean;
  timed_out: boolean;
}

export interface LookedFolder {
  name: string;
  /** False for a folder the look's budget did not reach; nothing else is said of it. */
  looked: boolean;
  /** False for a name that is not a folder there. */
  directory?: boolean;
  sampled?: number;
  dicom?: number;
  modalities?: Record<string, number>;
  scanners?: number;
  files?: { count: number; more: boolean };
}

export interface Look {
  at: string;
  path: string;
  exists: boolean | null;
  directory: boolean | null;
  readable: boolean | null;
  here: Omit<LookedFolder, "name" | "looked"> | null;
  folders: LookedFolder[];
  timed_out: boolean;
}

/** The folders a page asks for. */
export const PAGE = 200;

export const ingest = {
  roots: () => door<{ at: null; roots: IngestRoot[]; timed_out: boolean }>("POST", "/api/ingest/folders", {}),
  folders: (at: string, filter: string, after: string | null, limit = PAGE) =>
    door<FolderPage>("POST", "/api/ingest/folders", { at, limit, ...(filter ? { filter } : {}), ...(after ? { after } : {}) }),
  look: (at: string, names: string[]) => door<Look>("POST", "/api/ingest/look", { at, names }),
};
