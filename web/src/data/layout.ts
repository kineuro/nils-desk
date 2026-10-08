// SPDX-License-Identifier: AGPL-3.0-only
// One safe way in for data (Wave 7a, B2 and H2 round 1): NILS reads what a
// dataset is from its structure, never from a choice. A source is a root
// folder; each folder under it is a dataset. Under derivatives/, dcm-original
// is identified data, dcm-anon (or v0's dcm-raw) is already anonymised, and
// both is identified data with its anonymised copy. DICOM beside derivatives/,
// or no tree at all, is unknown: a person says which tree those entries go
// into, and they move only once the person confirms what the engine named.
// An anonymised dataset is read only once it says what its PatientID holds
// and how its subjects are found. These are the words and the reading of the
// engine's answers; the dialogs are Add a source and Finish a dataset.

import { DoorError } from "../ask/client";
import type { Capabilities } from "../capabilities";
import type { Place } from "../objects/client";
import type { DatasetState, Layout } from "./datasets";

/** The line every page shows a dataset with until it is read. */
export const NOT_READ = "not read";

/** The button every page offers on a dataset that is not read yet. */
export const FINISH = "Finish it";

const n = (v: number) => v.toLocaleString("en-US");
const entries = (k: number) => `${n(k)} ${k === 1 ? "entry" : "entries"}`;

/** The places block of the engine's capabilities, as far as the dataset goes. */
function datasetCaps(caps: Capabilities): Record<string, unknown> | null {
  const places = caps.engine?.["places"];
  if (!places || typeof places !== "object") return null;
  const dataset = (places as { dataset?: unknown }).dataset;
  return dataset && typeof dataset === "object" ? (dataset as Record<string, unknown>) : null;
}

/** Whether the engine reads a dataset from its structure, and explores a source into its datasets. */
export function readsStructure(caps: Capabilities): boolean {
  const states = datasetCaps(caps)?.["states"];
  return Array.isArray(states) && states.includes("unknown");
}

/** A source place's dataset, from the places door (`dataset`) or the sources door (its fields at the top). */
type Declared = { kind?: unknown; state?: unknown; arrives?: unknown; root?: unknown; patient_id?: unknown; subjects?: unknown; trees?: unknown };

function declared(p: { dataset?: unknown } & Declared): Declared {
  const d = p.dataset;
  return d && typeof d === "object" ? (d as Declared) : p;
}

/** Whether a source place is a root: a folder whose folders are datasets, read by their own names. */
export function isRoot(p: { role?: string; dataset?: unknown } & Declared): boolean {
  return (p.role === undefined || p.role === "source") && declared(p).kind === "root";
}

/**
 * Why a dataset is not read yet, in words, or null where it is read: the
 * engine's own reason where its door gives one (`not_read`), else the same
 * reasoning from the dataset it declares. A root is never a dataset, and is
 * not said to be unread.
 */
export function notReadOf(p: { role?: string; not_read?: unknown; dataset?: unknown } & Declared): string | null {
  if (p.role !== undefined && p.role !== "source") return null;
  if (isRoot(p)) return null;
  if (typeof p.not_read === "string") return p.not_read;
  if (p.not_read === null) return null;
  const d = declared(p);
  if (d.arrives === "undeclared" || d.state === "unknown") return "its structure is unknown: entries beside derivatives/, or no tree at all; say which tree they go into";
  const anonymised = d.state === "anonymised" || (d.state === undefined && (d.arrives === "deidentified" || d.arrives === "coded"));
  if (!anonymised) return null;
  const missing: string[] = [];
  if (d.patient_id === null || d.patient_id === undefined) missing.push("what PatientID holds");
  if (d.subjects === null || d.subjects === undefined) missing.push("how its subjects are found");
  return missing.length > 0 ? `it is anonymised and does not say ${missing.join(", nor ")}` : null;
}

/** What a dataset's structure says, in plain words, by whether it is read yet. */
export function stateWords(state: DatasetState | undefined, read: boolean, legacy = false): string {
  if (legacy) return read ? "anonymised: a tree named itself, read as it is" : "anonymised: a tree named itself; needs its PatientID and how subjects are found";
  switch (state) {
    case "identified":
      return "identified: will be pseudonymised";
    case "both":
      return "both: identified, with its anonymised copy beside it";
    case "anonymised":
      return read ? "anonymised: read as it is" : "anonymised: needs its PatientID and how subjects are found";
    case "unknown":
      return "unknown: tell us where its loose entries go";
    default:
      return "not explored yet";
  }
}

/** The state a place's dataset, or the layout found for it, says. */
export function stateOf(p: { dataset?: unknown } & Declared, layout?: Layout | null): DatasetState | undefined {
  const s = layout?.state ?? declared(p).state;
  return s === "identified" || s === "anonymised" || s === "both" || s === "unknown" ? s : undefined;
}

/** The question a move was answered with: why, and what the folder holds. */
export interface MoveAsked {
  why: string;
  layout: Layout;
}

/**
 * The engine's question, when a move no person confirmed was refused: a 409
 * that names `confirm_move` and carries the layout. Anything else is not a
 * question, and null.
 */
export function moveAskedOf(e: unknown): MoveAsked | null {
  if (!(e instanceof DoorError) || e.status !== 409) return null;
  const body = (e.body ?? {}) as { error?: unknown; confirm?: unknown; layout?: unknown };
  if (body.confirm !== "confirm_move" || !body.layout || typeof body.layout !== "object") return null;
  return { why: typeof body.error === "string" ? body.error : "", layout: body.layout as Layout };
}

/** What a dataset's folder holds, as facts: its two trees, a v0 folder's dcm-raw, and what lies beside derivatives/. */
export function foundFacts(l: Layout): { k: string; v: string }[] {
  const out = [
    { k: "derivatives/dcm-original", v: l.originals ? "there" : "not there" },
    { k: "derivatives/dcm-anon", v: l.anon ? "there" : l.raw ? "not there; dcm-raw becomes it" : "not there" },
  ];
  if (l.raw && !l.anon) out.push({ k: "derivatives/dcm-raw", v: "there, from v0" });
  const dicom = l.loose_dicom?.length ?? 0;
  const loose = l.loose ?? 0;
  out.push({ k: "beside derivatives/", v: loose === 0 ? "nothing" : dicom > 0 ? `${entries(loose)}, ${n(dicom)} with DICOM` : `${entries(loose)}, none with DICOM` });
  return out;
}

/** The entries with DICOM by name, the first hundred, and how many more there are. */
export function dicomNamed(l: Layout): { names: string[]; more: number } {
  const names = l.loose_dicom ?? [];
  const total = l.move_into?.entries ?? names.length;
  return { names, more: Math.max(0, total - names.length) };
}

/** The question itself: which entries go where, said before anything moves; the folder is named by its path beside it. */
export function questionWords(asked: MoveAsked, into: "originals" | "anon"): { lead: string; tree: string; count: number } {
  const tree = asked.layout.move_into?.trees[into] ?? (into === "originals" ? "derivatives/dcm-original" : "derivatives/dcm-anon");
  const count = asked.layout.move_into?.entries ?? asked.layout.loose_dicom?.length ?? 0;
  return { lead: `Move ${entries(count)} into the ${into === "originals" ? "identified" : "anonymised"} folder?`, tree, count };
}

/** The declaration of what PatientID holds, as the places door takes it; null until a type is named. */
export function patientIdOf(choice: "subject-code" | "id-type", idType: string): string | null {
  if (choice === "subject-code") return "subject-code";
  const t = idType.trim();
  return t ? `id-type:${t}` : null;
}

/** The dataset places a root holds, by the root's name, from the places door. */
export function datasetsOf(root: Place, places: Place[]): Place[] {
  return places.filter((p) => p.role === "source" && p.retired_at === null && p.dataset?.root === root.name);
}
