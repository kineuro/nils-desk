// SPDX-License-Identifier: AGPL-3.0-only
// A release names its subjects by ID types, in the order they are tried, and
// the subject code is the last one, always. The pure half of New release's
// "Name subjects by": the types a person may choose, the order as they move
// one, what a rehearsed plan says in the form's few words, the choices a
// subject holding several IDs asks for, and what a release's row says it
// named by. A subject's ID passes through only as a choice a person made, on
// its way to the release door.

import type { NameChoice, NamesPlan, Release } from "../data/cohorts";
import { FALLBACK_TYPE } from "../data/pseudoStep";
import { neverKept, type IdType } from "../data/pseudonyms";
import { idTypeWords, SUBJECT_CODE_WORDS } from "../data/viewer";

/** The rehearsal's door: an engine that names it reads `name_by`, and one that does not gets the form as it was. */
export const NAMES_DOOR = "POST /api/releases/names";

/** The last name tried, and the only one until a person adds a type. */
export const LAST = SUBJECT_CODE_WORDS;

/** What cleaning does to a name, with an ID nobody holds. */
export const CLEANED_WORDS = "A name keeps letters and digits only: AB_01 is written sub-AB01.";

const n = (v: number) => v.toLocaleString("en-US");
const subjects = (k: number) => `${n(k)} ${k === 1 ? "subject" : "subjects"}`;

export interface NameType {
  name: string;
  label: string;
}

/**
 * The ID types the form never offers as a name, whatever they keep: the study
 * UID that stands in for a missing ID is no subject's ID, PatientID as a
 * hospital wrote it is not a name a release carries out, and a subject code
 * filed as an ID is the code of a subject merged into this one.
 */
export const NOT_A_NAME: readonly string[] = [FALLBACK_TYPE, "patient-id", "subject-code"];

/**
 * The ID types a release may name its subjects by: those the engine says keep
 * at least one value, less the ones the form never offers. A type NILS never
 * keeps a value of names nobody, and a type the engine counts no kept values
 * for is not offered.
 */
export function nameTypes(types: readonly IdType[]): NameType[] {
  return types.filter((t) => !neverKept(t) && !NOT_A_NAME.includes(t.name) && typeof t.kept === "number" && t.kept > 0).map((t) => ({ name: t.name, label: idTypeWords(t.name) }));
}

/** The list with one type moved a place earlier (-1) or later (1); unchanged at either end. */
export function moved(by: readonly string[], type: string, step: -1 | 1): string[] {
  const at = by.indexOf(type);
  const to = at + step;
  if (at < 0 || to < 0 || to >= by.length) return [...by];
  const next = [...by];
  [next[at], next[to]] = [next[to], next[at]];
  return next;
}

/** How many subjects each type names and how many keep their subject code, in the order tried: "12 by Study ID · 1 by subject code". */
export function planWords(plan: Pick<NamesPlan, "types" | "code">): string {
  return [...plan.types.map((t) => `${n(t.subjects)} by ${idTypeWords(t.type)}`), `${n(plan.code)} by subject code`].join(" · ");
}

/** Why a plan that is not ready stops the release, as the form's foot says what it needs; null for a ready one. */
export function planNeeds(plan: Pick<NamesPlan, "needs_choice" | "collisions" | "values" | "ready">): string | null {
  if (plan.ready) return null;
  if (plan.needs_choice.length > 0) return plan.values === "withheld" ? "someone who may see IDs to choose the names" : `an ID chosen for ${subjects(plan.needs_choice.length)}`;
  return "names that differ";
}

/**
 * The subjects the form asks a choice for: those the plan still asks about,
 * and those a person already chose for, which the plan no longer lists, so
 * that a choice can still be changed.
 */
export function asked(before: readonly NameChoice[], chosen: Readonly<Record<string, string>>, plan: Pick<NamesPlan, "needs_choice">): NameChoice[] {
  const now = new Map(plan.needs_choice.map((c) => [c.subject, c]));
  const kept = before.filter((c) => !now.has(c.subject) && (chosen[c.subject] ?? "") !== "");
  return [...kept, ...plan.needs_choice].sort((a, b) => a.subject.localeCompare(b.subject));
}

/** A shared name's subjects in one line: each subject code and what would name it. */
export function sharedBy(subjects: readonly { subject: string; type: string | null }[]): string {
  return subjects.map((s) => `${s.subject} (${s.type === null ? "subject code" : idTypeWords(s.type)})`).join(", ");
}

/** What a release named its subjects by, for its row: "Study ID 12 · subject code 1"; null where every subject kept its subject code. */
export function namedWords(r: Pick<Release, "name_by" | "names">): string | null {
  const by = Array.isArray(r.name_by) ? r.name_by : [];
  if (by.length === 0) return null;
  const counts = new Map((r.names?.types ?? []).map((t) => [t.type, t.subjects]));
  const parts = by.map((t) => (counts.has(t) ? `${idTypeWords(t)} ${n(counts.get(t) ?? 0)}` : idTypeWords(t)));
  if (typeof r.names?.code === "number" && r.names.code > 0) parts.push(`subject code ${n(r.names.code)}`);
  return parts.join(" · ");
}
