// SPDX-License-Identifier: AGPL-3.0-only
// The editor is derived from the ask document on every render; the only
// stored UI state is which empty step is open (Wave 4c section 7.3). A step
// per named set in the order the engine reads them, with sub-steps for the
// clause groups, each carrying valid, active, visible and revert. Every
// control is a move the engine offered; nothing here composes ask JSON.

import type { Json, Move, Options } from "./client";

export const PARTS = ["source", "near", "attach", "has", "where", "pick", "out", "window"] as const;
export type Part = (typeof PARTS)[number];

/** The sub-step a move's kind belongs to; `document` for the moves with no set. */
export function partOf(kind: string): Part | "document" {
  switch (kind) {
    case "add_where":
    case "remove_where":
    case "set_strict":
      return "where";
    case "add_has":
      return "has";
    case "add_bind":
      return "attach";
    case "add_near":
      return "near";
    case "set_window":
      return "window";
    case "set_pick":
      return "pick";
    case "set_out":
    case "set_limit":
      return "out";
    default:
      return "document";
  }
}

export interface SubStep {
  part: Part;
  /** The clause group is present in the document. */
  active: boolean;
  /** Offered for this set: a move exists that would fill it, or it is already there. */
  visible: boolean;
  /** Answered by the catalog and the grain: present, and the engine still offers a move on it. */
  valid: boolean;
  moves: Move[];
  /** The inverse of the last edit on this part, when the engine offers it. */
  revert: { move: Move; args: Json } | null;
}

export interface Step {
  set: string;
  grain: string;
  /** The engine's sentence for the set, when its options were fetched. */
  sentence: string;
  source: string;
  parts: SubStep[];
  /** True when the set is the document's answer. */
  answers: boolean;
  kept: boolean;
  /** The where clauses as the document holds them, for the chips; read, never composed. */
  where: unknown[];
  /** The other clause groups as text, read from the document. */
  clauses: Partial<Record<Part, string[]>>;
}

/** The document's sets in the order the engine reads them: a source before what reads it, children of `has` before the parent, ties by name. */
export function setsOf(document: Json): string[] {
  const sets = (document.sets as Record<string, Json> | undefined) ?? {};
  const names = Object.keys(sets).sort();
  const placed: string[] = [];
  const needs = (n: string): string[] => {
    const s = sets[n] ?? {};
    const out: string[] = [];
    for (const k of ["of", "from"]) if (typeof s[k] === "string") out.push(s[k] as string);
    if (Array.isArray(s.has)) for (const h of s.has as Json[]) if (typeof h.set === "string") out.push(h.set);
    if (Array.isArray(s.near)) for (const h of s.near as Json[]) if (typeof h.set === "string") out.push(h.set);
    return out.filter((x) => names.includes(x));
  };
  let progress = true;
  while (placed.length < names.length && progress) {
    progress = false;
    for (const n of names) {
      if (placed.includes(n)) continue;
      if (needs(n).every((d) => placed.includes(d))) {
        placed.push(n);
        progress = true;
      }
    }
  }
  // a cycle is refused by the engine; list the rest by name so nothing vanishes
  for (const n of names) if (!placed.includes(n)) placed.push(n);
  return placed;
}

function present(set: Json, part: Part): boolean {
  switch (part) {
    case "source":
      return typeof set.of === "string" || typeof set.from === "string";
    case "near":
    case "attach":
    case "has":
    case "where":
      return Array.isArray(set[part]) && (set[part] as unknown[]).length > 0;
    case "pick":
    case "window":
      return set[part] !== undefined && set[part] !== null;
    case "out":
      return false;
  }
}

/** One step from the document's set and the options the engine offered for it (null before they are fetched). */
export function step(document: Json, name: string, options: Options | null): Step {
  const sets = (document.sets as Record<string, Json>) ?? {};
  const set = sets[name] ?? {};
  const out = document.out as Json | undefined;
  const answers = out?.set === name;
  const moves = (options?.moves ?? []).filter((m) => setOf(m) === name || (setOf(m) === null && partOf(m.kind) === "out" && answers));
  const parts: SubStep[] = PARTS.map((part) => {
    const mine = moves.filter((m) => partOf(m.kind) === part);
    const active = part === "out" ? answers : present(set, part);
    let revert: SubStep["revert"] = null;
    if (part === "where" && Array.isArray(set.where) && (set.where as unknown[]).length > 0) {
      const remove = mine.find((m) => m.kind === "remove_where");
      if (remove) revert = { move: remove, args: { index: (set.where as unknown[]).length - 1 } };
    }
    return { part, active, visible: mine.length > 0 || active, valid: active && (mine.length > 0 || part === "source"), moves: mine, revert };
  });
  const source = typeof set.of === "string" ? `of ${set.of}` : typeof set.from === "string" ? `from ${set.from}` : "the registry";
  return {
    set: name,
    grain: options?.grain ?? String(set.grain ?? ""),
    sentence: options?.describe ?? "",
    source,
    parts,
    answers,
    kept: Array.isArray(document.keep) && (document.keep as unknown[]).includes(name),
    where: Array.isArray(set.where) ? (set.where as unknown[]) : [],
    clauses: {
      has: (Array.isArray(set.has) ? (set.has as Json[]) : []).map(hasText),
      near: (Array.isArray(set.near) ? (set.near as Json[]) : []).map((n) => `${n.set ?? "?"}${n.within !== undefined ? ` within ${JSON.stringify(n.within)}` : ""}`),
      attach: (Array.isArray(set.attach) ? (set.attach as Json[]) : []).map((a) => `${a.name ?? a.as ?? "?"} = ${JSON.stringify(a.field ?? a.of ?? a)}`),
      pick: set.pick !== undefined && set.pick !== null ? [JSON.stringify(set.pick)] : [],
      window: set.window !== undefined && set.window !== null ? [JSON.stringify(set.window)] : [],
    },
  };
}

function hasText(h: Json): string {
  const parts: string[] = [];
  if (h.min !== undefined) parts.push(`at least ${h.min}`);
  if (h.max !== undefined) parts.push(`at most ${h.max}`);
  parts.push(String(h.set ?? "?"));
  if (h.as) parts.push(`as ${h.as}`);
  return parts.join(" ");
}

/** The whole editor: one step per set, in order. `options` is per set, as fetched. */
export function editor(document: Json, options: Record<string, Options | null>): Step[] {
  return setsOf(document).map((name) => step(document, name, options[name] ?? null));
}

/** The document's own moves: a new set, a rename, the answer, the limit, a parameter, a kept handle. */
export function documentMoves(options: Options | null): Move[] {
  return (options?.moves ?? []).filter((m) => setOf(m) === null && partOf(m.kind) !== "out");
}

/** The set a move edits; the engine leaves the key out on the document's own moves. */
export const setOf = (m: Move): string | null => m.set ?? null;

export interface Offer {
  set: string;
  move: Move;
  args: Json;
}

/** The moves a clicked result cell may fill: a template with a hole the clicked value can fill, on the sets whose fields carry the column. */
export function movesForCell(options: Options[], column: string, value: unknown): Offer[] {
  const out: Offer[] = [];
  for (const o of options) {
    for (const m of o.moves) {
      const field = m.holes.find((h) => h.type === "field");
      const val = m.holes.find((h) => h.type === "value");
      const set = setOf(m);
      if (!field || !val || !set) continue;
      if (field.fillers && !field.fillers.includes(column)) continue;
      const args: Json = { [field.name]: column, [val.name]: value };
      const op = m.holes.find((h) => h.type === "op");
      if (op) args[op.name] = value === null ? "is_null" : "=";
      out.push({ set, move: m, args });
    }
  }
  return out;
}

/** The empty step to open first: the first set with no where and a where to offer, else the answer set. */
export function firstEmpty(steps: Step[]): string | null {
  for (const s of steps) {
    const where = s.parts.find((p) => p.part === "where");
    if (where && !where.active && where.moves.length > 0) return s.set;
  }
  return steps.find((s) => s.answers)?.set ?? steps[0]?.set ?? null;
}

/** The template with its holes filled, as the engine would read it: the sentence an audit line carries. */
export function sentence(move: Move, args: Json): string {
  return move.template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const v = args[name];
    if (v === undefined || v === null || v === "") return `{${name}}`;
    return Array.isArray(v) ? v.join(", ") : String(v);
  });
}

/**
 * The audit shape of an edit, the same for a chip click, a cell click and an
 * accepted proposal (section 7.9): where it came from is a word, the rest is
 * the move as applied.
 */
export interface Edit {
  origin: "chip" | "cell" | "proposal";
  document: number;
  set: string;
  move_id: number;
  kind: string;
  args: Json;
  sentence: string;
}

export function edit(origin: Edit["origin"], document: number, offer: Offer): Edit {
  return { origin, document, set: offer.set, move_id: offer.move.id, kind: offer.move.kind, args: offer.args, sentence: sentence(offer.move, offer.args) };
}

/** The column presets of the out step (section 7.3): the list the corpus asked for by name, and its extension on request. */
export const PROJECTIONS: Record<string, string[]> = {
  "the named list": ["subject", "cohort", "session_date", "stack", "base", "modifier", "technique", "contrast", "plane", "purpose"],
  "on request": ["subject", "cohort", "session_date", "stack", "base", "modifier", "technique", "contrast", "plane", "purpose", "slices", "resolution", "sex", "birth_date", "age_at_session"],
};

/** The columns of a result the preset keeps, in the preset's order; a column the result lacks is left out, never invented. */
export function project(columns: string[], preset: string | null): string[] {
  const want = preset ? PROJECTIONS[preset] : undefined;
  if (!want) return columns;
  return want.filter((c) => columns.includes(c));
}
