// SPDX-License-Identifier: AGPL-3.0-only
// The question workbench's pure parts (Wave 5 section 7): what a person may
// start from and how it is asked of the start door, the next moves of a set
// in the language's order, the clause-group funnel, and the one condition
// picker across every set.

import type { ClauseGroup, Funnel, Move, Options } from "./client";
import { PARTS, type Part, partOf, type Step } from "./editor";

/** What a new question starts from (section 7.1). */
export type From =
  | { kind: "nothing" }
  | { kind: "cohorts"; cohorts: string[] }
  | { kind: "selection"; selection: string }
  | { kind: "handle"; handle: number }
  | { kind: "document"; document: number }
  | { kind: "values"; upload: number };

/** The body of POST /api/ask/start. */
export function startBody(from: From): { from: Record<string, unknown> } {
  switch (from.kind) {
    case "nothing":
      return { from: {} };
    case "cohorts":
      return { from: { cohorts: from.cohorts } };
    case "selection":
      return { from: { selection: from.selection } };
    case "handle":
      return { from: { handle: from.handle } };
    case "document":
      return { from: { document: from.document } };
    case "values":
      return { from: { values: from.upload } };
  }
}

export interface Started {
  document: Record<string, unknown>;
  set: string;
  grain: string;
  count: number;
  subjects: number | null;
  sessions: number | null;
  epoch: number;
}

/** The count under the picker: the set, then the subjects and the sessions under it. */
export function countWords(s: Started): string {
  const head = `${s.count} ${s.grain}${s.count === 1 ? "" : "s"}`;
  const under: string[] = [];
  if (s.subjects !== null && s.grain !== "subject") under.push(`${s.subjects} subjects`);
  if (s.sessions !== null && s.grain !== "session") under.push(`${s.sessions} sessions`);
  return under.length > 0 ? `${head}, ${under.join(", ")}` : head;
}

/** The pasted list, one identifier per line or comma, trimmed, without duplicates. */
export function pastedList(text: string): string[] {
  const seen = new Set<string>();
  for (const raw of text.split(/[\n,;]+/)) {
    const v = raw.trim();
    if (v) seen.add(v);
  }
  return [...seen];
}

/** The language's own order of the clause groups (section 7.2). */
export const GROUP_ORDER: Part[] = ["source", "near", "attach", "has", "where", "pick", "out"];

export interface GroupRow {
  group: string;
  rows: number;
  subjects: number;
  /** What this group lost against the group before it. */
  lost: number;
}

/** The funnel of one set keyed by clause group, in the language's order (section 12.3); an engine that answered by set gives its stages instead. */
export function clauseGroups(funnel: Funnel[], set: string, groups?: ClauseGroup[] | null): GroupRow[] {
  if (groups && groups.length > 0) {
    const mine = groups.filter((g) => g.set === set);
    const order = [...GROUP_ORDER.filter((g) => mine.some((m) => m.group === g)), ...mine.map((m) => m.group).filter((g) => !(GROUP_ORDER as string[]).includes(g))];
    return order.map((g) => {
      const m = mine.find((x) => x.group === g)!;
      return { group: g, rows: m.kept, subjects: m.subjects, lost: m.lost };
    });
  }
  const mine = funnel.filter((f) => f.set === set);
  const byGroup = new Map<string, Funnel>();
  for (const f of mine) {
    const g = (f as Funnel & { group?: string }).group ?? f.stage;
    byGroup.set(g, f);
  }
  const order = [...GROUP_ORDER.filter((g) => byGroup.has(g)), ...[...byGroup.keys()].filter((g) => !(GROUP_ORDER as string[]).includes(g))];
  let before: number | null = null;
  return order.map((g) => {
    const f = byGroup.get(g)!;
    const lost = before === null ? 0 : Math.max(0, before - f.rows);
    before = f.rows;
    return { group: g, rows: f.rows, subjects: f.subjects, lost };
  });
}

export interface NextMove {
  part: Part;
  move: Move;
}

/** The legal next moves of a set as one row in a fixed order (section 7.3); an illegal move is not on the screen. */
export function nextMoves(step: Step): NextMove[] {
  const out: NextMove[] = [];
  for (const part of PARTS) {
    const sub = step.parts.find((p) => p.part === part);
    if (!sub) continue;
    for (const m of sub.moves) if (partOf(m.kind) === part && m.kind !== "remove_where") out.push({ part, move: m });
  }
  return out;
}

/** A chip's word: the template up to its first hole. */
export function chipWord(m: Move): string {
  const head = m.template.split("{")[0].trim();
  return head || m.kind.replace(/_/g, " ");
}

export interface PickerSection {
  set: string;
  grain: string;
  fields: string[];
}

/** One picker across every set: a section per set headed by its name and grain, its fields under it, a search across all (section 7.3). */
export function pickerSections(options: Record<string, Options | null>, sets: string[], search: string): PickerSection[] {
  const q = search.trim().toLowerCase();
  const out: PickerSection[] = [];
  for (const set of sets) {
    const o = options[set];
    if (!o) continue;
    const fields = [...o.exposes.fields, ...o.exposes.dated, ...o.exposes.bindings].filter((f, i, a) => a.indexOf(f) === i);
    const kept = q ? fields.filter((f) => f.toLowerCase().includes(q) || set.toLowerCase().includes(q)) : fields;
    if (kept.length > 0) out.push({ set, grain: o.grain, fields: kept });
  }
  return out;
}

/** The set a chosen field lands on: the picker's section, and the add_where move of that set. */
export function landing(options: Record<string, Options | null>, set: string): Move | null {
  return options[set]?.moves.find((m) => m.kind === "add_where" && (m.set ?? null) === set) ?? null;
}
