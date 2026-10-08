// SPDX-License-Identifier: AGPL-3.0-only
// The Data page as an app (Wave 7a, the tries of 2026-10-08): a root folder
// is only where folders live; a folder becomes a dataset when the person adds
// it, and only then does NILS read its structure. Each dataset shows one state
// word and the one button for its next step, so how to start is always on
// screen. These are the doors behind that and the reading of the next step.

import { door } from "../ask/client";
import type { Place } from "../objects/client";
import { datasetState, newInOriginals, type Dataset, type DatasetState, type Layout, type PlaceAnswer } from "./datasets";
import { notReadOf } from "./layout";

/** A folder under a root, as the engine lists it: whether it is a dataset yet. The list looks inside none of them. */
export interface RootFolder {
  name: string;
  path: string;
  added: boolean;
  dataset_id: number | null;
  /** The dataset's name where the folder is one. */
  dataset: string | null;
  has_derivatives: boolean;
}

/** One page of a root's folders, found by part of a name: `next` asks for the page after it. */
export interface RootFolders {
  root: string;
  root_id: number;
  path: string;
  count: number;
  folders: RootFolder[];
  next: string | null;
}

/** One folder looked at: whether it holds DICOM, and what NILS would find in it. */
export interface FolderLook {
  name: string;
  path: string;
  added: boolean;
  dataset_id: number | null;
  holds_dicom: "yes" | "no" | "unknown";
  has_derivatives: boolean;
  layout: Layout | null;
}

/** A page of folders is fifty: a root may hold thousands. */
export const PAGE = 50;

const GUARANTEES = { backup: null, snapshots: false, protected: false, fast: false };

export const roots = {
  /** A root folder added: only the root, nothing under it is a dataset yet. */
  add: (name: string, path: string) => door<PlaceAnswer>("POST", "/api/places", { name, role: "source", path, guarantees: GUARANTEES }),
  /** One page of the folders under a root whose name holds `q`. */
  folders: (root: number, q = "", after: string | null = null) =>
    door<RootFolders>("GET", `/api/places/${root}/folders?${new URLSearchParams({ q, limit: String(PAGE), ...(after ? { after } : {}) }).toString()}`),
  /** One folder looked at, once. */
  folder: (root: number, name: string) => door<FolderLook>("GET", `/api/places/${root}/folders/${encodeURIComponent(name)}`),
  /** One folder of a root made a dataset, named by the engine after the folder; its structure is read now. */
  addDataset: (root: string, folder: string) => door<PlaceAnswer & { not_read?: string | null }>("POST", "/api/places", { role: "source", root, folder }),
};

/** The roots among the places: the folders datasets live in. */
export function rootsOf(places: Place[]): Place[] {
  return places.filter((p) => p.role === "source" && p.retired_at === null && p.dataset?.kind === "root");
}

/** The state word a folder's structure would give the dataset. */
export function wouldBe(state: DatasetState | undefined): StateWord | null {
  if (state === "unknown") return "Unknown";
  if (state === "anonymised") return "Anonymised";
  if (state === "identified" || state === "both") return "Identified";
  return null;
}

/** A folder's DICOM, in three letters at most. */
export function dicomWord(f: Pick<FolderLook, "holds_dicom">): string {
  return f.holds_dicom === "yes" ? "yes" : f.holds_dicom === "no" ? "no" : "?";
}

/** The one word a dataset's card shows. */
export type StateWord = "Unknown" | "Anonymised" | "Identified" | "Ready";

/** What the card's one button does. */
export type StepId = "running" | "sort-files" | "set-ids" | "pseudonymise" | "read" | "sort" | "read-new";

export interface NextStep {
  word: StateWord;
  step: StepId;
  label: string;
  /** Pressing it does nothing now: a job of the dataset is running. */
  busy: boolean;
}

const LABEL: Record<StepId, string> = {
  running: "Running",
  "sort-files": "Sort the files",
  "set-ids": "Set the IDs",
  pseudonymise: "Pseudonymise",
  read: "Read",
  sort: "Sort",
  "read-new": "Read new files",
};

/**
 * A dataset's state word and its next step: unknown files are sorted into
 * their folder first, anonymised data says its IDs, identified data is
 * pseudonymised, what is ready is read, and what is read is sorted. `why` is
 * the reason it is not read, where the places door gave one.
 */
export function nextStep(d: Dataset, why: string | null = notReadOf(d)): NextStep {
  const running = d.digests.recent.some((b) => b.state === "running");
  const at = (word: StateWord, step: StepId): NextStep => ({ word, step: running ? "running" : step, label: LABEL[running ? "running" : step], busy: running });
  if (d.state === "unknown" || d.arrives === "undeclared") return at("Unknown", "sort-files");
  if (why !== null) return at("Anonymised", "set-ids");
  const identified = d.state === "identified" || d.state === "both" || (d.state === undefined && d.arrives === "identified");
  if (identified) {
    const waiting = newInOriginals(d);
    // nothing read and nothing in the anonymised copy yet: it was never pseudonymised
    const copied = d.trees?.anon?.files;
    const never = d.digests.count === 0 && !(typeof copied === "number" && copied > 0);
    if ((waiting ?? (never ? 1 : 0)) > 0) return at("Identified", "pseudonymise");
  }
  if (d.digests.count === 0) return at("Ready", "read");
  const s = datasetState(d).words;
  if (/to sort|not sorted/.test(s)) return at("Ready", "sort");
  return at("Ready", "read-new");
}

/** The command a step queues, and the name its job takes; null for a step that opens a dialog. */
export function stepCommand(d: Pick<Dataset, "name">, step: StepId, pack: string | null, today = new Date()): { command: string[]; name: string; then?: string[][] } | null {
  const name = `${d.name}-${today.toISOString().slice(0, 10)}`;
  const at = `@${d.name}`;
  switch (step) {
    case "pseudonymise":
      return { command: ["pseudonymize", at, "--name", name], name };
    case "read":
      return { command: ["digest", at, "--name", name], name };
    case "sort":
      return { command: ["fingerprint"], name, then: [["classify", ...(pack ? ["--pack", pack] : [])]] };
    case "read-new":
      return { command: ["bring-in", at, "--name", name, ...(pack ? ["--pack", pack] : [])], name };
    default:
      return null;
  }
}
