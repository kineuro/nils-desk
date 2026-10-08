// SPDX-License-Identifier: AGPL-3.0-only
// One safe way in for data (Wave 7a, B2 and H2 round 1): a folder is never
// read without the layout. The engine answers what a folder holds with every
// declaration and every look, and a source place is undeclared until a person
// says how its files arrive; nothing in an undeclared place is read. Where the
// tree an arrival reads is missing and loose entries wait beside
// `derivatives/`, a declaration is refused with the question, naming the
// entries and the tree they would go into, and nothing moves until the person
// confirms. These are the words and the reading of those answers; the dialog
// that asks is Add a dataset.

import { DoorError } from "../ask/client";
import type { Capabilities } from "../capabilities";
import type { Arrives, Layout, LayoutDeclaration } from "./datasets";

/** The arrival of a place nobody has declared: nothing in it is read. */
export const UNDECLARED = "undeclared";

/** What an undeclared place is, in the words every page shows it with. */
export const NOT_READ = "not read until you say how its files arrive";

/** The button every page offers on an undeclared place, into Add a dataset. */
export const SAY_HOW = "Say how its files arrive";

const n = (v: number) => v.toLocaleString("en-US");
const entries = (k: number) => `${n(k)} loose ${k === 1 ? "entry" : "entries"}`;

/** The places block of the engine's capabilities, as far as the dataset goes. */
function datasetCaps(caps: Capabilities): { arrives?: unknown; patient_id?: unknown } | null {
  const places = caps.engine?.["places"];
  if (!places || typeof places !== "object") return null;
  const dataset = (places as { dataset?: unknown }).dataset;
  return dataset && typeof dataset === "object" ? (dataset as { arrives?: unknown; patient_id?: unknown }) : null;
}

/** Whether the engine never reads a folder without the layout: it knows an undeclared dataset, and asks before it moves. */
export function asksFirst(caps: Capabilities): boolean {
  const arrives = datasetCaps(caps)?.arrives;
  return Array.isArray(arrives) && arrives.includes(UNDECLARED);
}

/** Whether a dataset may declare what PatientID holds in its pseudonymised tree. */
export function patientIdServed(caps: Capabilities): boolean {
  return Array.isArray(datasetCaps(caps)?.patient_id);
}

/** Whether a source place, or a dataset, is undeclared: by its own field, or by the dataset the places door carries. */
export function isUndeclared(p: { arrives?: unknown; dataset?: unknown; role?: string }): boolean {
  if (p.role !== undefined && p.role !== "source") return false;
  if (p.arrives === UNDECLARED) return true;
  const d = p.dataset;
  return d !== null && typeof d === "object" && (d as { arrives?: unknown }).arrives === UNDECLARED;
}

/** The question a declaration was answered with: why, and what the folder holds. */
export interface MoveAsked {
  why: string;
  layout: Layout;
}

/**
 * The engine's question, when a declaration was refused because it would move
 * loose entries no person confirmed: a 409 that names `confirm_move` and
 * carries the layout. Anything else is not a question, and null.
 */
export function moveAskedOf(e: unknown): MoveAsked | null {
  if (!(e instanceof DoorError) || e.status !== 409) return null;
  const body = (e.body ?? {}) as { error?: unknown; confirm?: unknown; layout?: unknown };
  if (body.confirm !== "confirm_move" || !body.layout || typeof body.layout !== "object") return null;
  return { why: typeof body.error === "string" ? body.error : "", layout: body.layout as Layout };
}

/** Whether a door's answer says the dataset is undeclared, which the engine says in its refusal of a digest or a bring-in. */
export function undeclaredRefusal(e: unknown): boolean {
  return e instanceof DoorError && e.status === 409 && typeof e.body.error === "string" && /undeclared/.test(e.body.error);
}

/** Whether a layout is one an engine that asks first answered: it says what each declaration would do. */
export function speaksLayout(l: Layout | null | undefined): l is Layout & { declarations: Partial<Record<Arrives, LayoutDeclaration>> } {
  return !!l && typeof l.declarations === "object" && l.declarations !== null;
}

/** What a folder holds, as facts: its two trees, a v0 folder's dcm-raw, and the loose entries beside them. */
export function foundFacts(l: Layout): { k: string; v: string }[] {
  const out = [
    { k: "derivatives/dcm-original", v: l.originals ? "there" : "not there" },
    { k: "derivatives/dcm-anon", v: l.anon ? "there" : l.raw ? "not there; dcm-raw becomes it" : "not there" },
  ];
  if (l.raw && !l.anon) out.push({ k: "derivatives/dcm-raw", v: "there, from v0" });
  out.push({ k: "beside derivatives/", v: (l.loose ?? 0) === 0 ? "nothing" : entries(l.loose ?? 0) });
  return out;
}

/** The loose entries by name, the first hundred, and how many more there are. */
export function looseNamed(l: Layout): { names: string[]; more: number } {
  const names = l.loose_entries ?? [];
  return { names, more: Math.max(0, (l.loose ?? names.length) - names.length) };
}

/** What one declaration of this folder would read and move, in words; null where the engine does not say. */
export function declarationWords(l: Layout | null | undefined, arrives: Arrives | typeof UNDECLARED | null): { reads: string; move: string | null; stays: string | null } | null {
  if (arrives === UNDECLARED) return { reads: "Nothing in it is read. It shows as not read until you say how its files arrive.", move: null, stays: null };
  if (arrives === null || !speaksLayout(l)) return null;
  const d = l.declarations[arrives];
  if (!d) return null;
  const reads = `Reads ${d.reads} only.`;
  if (d.needed) return { reads, move: `Moves the ${entries(d.moves)} beside derivatives/ into ${d.into}, once you confirm.`, stays: null };
  if (!d.tree_there) return { reads: `${reads} An empty ${d.into} is made.`, move: null, stays: null };
  return { reads, move: null, stays: d.moves > 0 ? `The ${entries(d.moves)} beside derivatives/ ${d.moves === 1 ? "stays where it is" : "stay where they are"}, not read.` : null };
}

/** The question itself: which entries go where, said before anything moves. */
export function questionWords(asked: MoveAsked, arrives: Arrives): { lead: string; detail: string; into: string; count: number } {
  const d = asked.layout.declarations?.[arrives];
  const into = d?.into ?? (arrives === "identified" ? "derivatives/dcm-original" : "derivatives/dcm-anon");
  const count = d?.moves ?? asked.layout.loose ?? 0;
  const how = arrives === "identified" ? "identified" : arrives === "deidentified" ? "de-identified" : "with our codes in PatientID";
  return {
    lead: `Move ${entries(count)} into ${into}?`,
    detail: `The folder holds no ${into}. Arriving ${how}, its files are read from there, so the entries beside derivatives/ go into it by a rename on the same disk: nothing is copied and nothing is read. Nothing was written yet.`,
    into,
    count,
  };
}

/** The declaration of what PatientID holds, as the places door takes it. */
export function patientIdOf(choice: "subject-code" | "id-type", idType: string): string | null {
  if (choice === "subject-code") return "subject-code";
  const t = idType.trim();
  return t ? `id-type:${t}` : null;
}
