// SPDX-License-Identifier: AGPL-3.0-only
// What the Start a query dialog offers to start from and what each needs
// (gate T31, walkthrough step 14.7): everyone, cohorts, a saved selection, a
// kept result and a list of IDs, each chosen from a list where the desk has
// one. Pure: the dialog draws these and the start door answers them.

import { needsWork } from "../access";
import { DoorError, type HandleRow, type Uploaded } from "../ask/client";
import { HELD } from "../ask/held";
import { pastedList, type From } from "../ask/start";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may, sees } from "../grants";
import { sizeWords, type SelectionRow } from "./selections";

/** What a new question starts from, in the dialog's order. */
export type StartKind = "nothing" | "cohorts" | "selection" | "handle" | "values";

/** Whether the person finds saved selections to start from: the list is query:see and the door served. */
export function startsFromSelection(caps: Capabilities): boolean {
  return may(caps, "query:see") && served(caps, "GET /api/ask/selections");
}

/** Whether the person finds kept results to start from. */
export function startsFromResult(caps: Capabilities): boolean {
  return may(caps, "query:see") && served(caps, "GET /api/ask/handles");
}

/** Whether the engine takes a list of IDs to start from. */
export function startsFromIds(caps: Capabilities): boolean {
  return served(caps, "POST /api/ask/values");
}

/** Why this person may not start from a list of IDs, in words, or null when they may: the upload is query:work at detail quasi. */
export function idsRefusal(caps: Capabilities): string | null {
  const work = needsWork(caps, "A list of IDs", [["query:work", "the Query page"]]);
  if (work !== null) return work;
  return sees(caps, "quasi") ? null : "A list of IDs asks to see sex and age in records.";
}

/** A saved selection as the start door takes it: its name and the version listed. */
export function selectionRef(s: Pick<SelectionRow, "name" | "versions">): string {
  return `${s.name}@${s.versions}`;
}

/** A saved selection in the list: its name, version and how big its newest answer was. */
export function selectionWords(s: SelectionRow): string {
  return `${s.name} · v${s.versions} · ${sizeWords(s.size)}`;
}

/**
 * The kept results a question may start from, newest first: the rows are
 * kept, none is withdrawn, the answer was not cut off and its list was not
 * held back whole (the door refuses such a handle).
 */
export function startableResults(handles: readonly HandleRow[]): HandleRow[] {
  return handles.filter((h) => h.kept && !h.withdrawn_at && !h.truncated && h.row_count !== null).sort((a, b) => b.id - a.id);
}

/** A kept result in the list: its name, grain and rows. */
export function resultWords(h: HandleRow): string {
  const rows = h.row_count === null ? HELD : `${h.row_count.toLocaleString("en-US")} ${h.row_count === 1 ? "row" : "rows"}`;
  return `${h.name ?? `Result ${h.id}`} · ${h.grain} · ${rows}`;
}

/** What the person chose, as far as the start door can be asked yet; null while a choice is missing or a list of IDs awaits its upload. */
export function startFrom(kind: StartKind, chosen: { cohorts: string; selection: string; handle: number | null }): From | null {
  switch (kind) {
    case "nothing":
      return { kind: "nothing" };
    case "cohorts": {
      const names = chosen.cohorts.split(/[\s,]+/).filter(Boolean);
      return names.length > 0 ? { kind: "cohorts", cohorts: names } : null;
    }
    case "selection":
      return chosen.selection !== "" ? { kind: "selection", selection: chosen.selection } : null;
    case "handle":
      return chosen.handle !== null ? { kind: "handle", handle: chosen.handle } : null;
    case "values":
      return null;
  }
}

/** The IDs pasted and their type, or null while either is missing. */
export function pastedIds(idType: string, text: string): { type: string; values: string[] } | null {
  const values = pastedList(text);
  return idType !== "" && values.length > 0 ? { type: idType, values } : null;
}

/** How many of the IDs matched no subject, in a line; null where all matched. */
export function unmatchedWords(u: Pick<Uploaded, "n" | "unresolved">): string | null {
  const k = u.unresolved.length;
  if (k === 0) return null;
  if (u.n === 1) return "The ID matched no subject.";
  return k === u.n ? `None of the ${u.n.toLocaleString("en-US")} IDs matched a subject.` : `${k.toLocaleString("en-US")} of ${u.n.toLocaleString("en-US")} IDs matched no subject.`;
}

/** A refused start in words: the engine's own, and what it says is wrong with the opening document ("the opening document: upload u-... is not known"). */
export function startRefusal(e: unknown): string {
  if (!(e instanceof DoorError)) return e instanceof Error ? e.message : String(e);
  const issues = Array.isArray(e.body.issues) ? (e.body.issues as { message?: unknown }[]).flatMap((i) => (typeof i?.message === "string" && i.message !== "" ? [i.message] : [])) : [];
  return issues.length > 0 ? `${e.message}: ${issues.join("; ")}` : e.message;
}
