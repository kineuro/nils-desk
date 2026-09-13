// SPDX-License-Identifier: AGPL-3.0-only
// The Query page's pure parts: a card's name, a card's versions, how a move's
// holes are typed in and read back as arguments, and the counts a step of the
// timeline shows. Nothing here composes ask JSON; a query changes only through
// a move the engine offered.

import type { ClauseGroup, DocumentHandle, Json, Move } from "../ask/client";

/** A card's name: the query's own name, else the set it answers, else plain words. */
export function cardTitle(name: string | null | undefined, answer?: string | null): string {
  const n = (name ?? "").trim();
  if (n) return n;
  const a = (answer ?? "").trim();
  return a ? a.replace(/[_-]+/g, " ") : "A query";
}

export interface Version {
  id: number;
  label: string;
  principal: string | null;
  at: string | null;
}

/** A card's versions, oldest first, labelled v1 to vn. */
export function versionsOf(chain: DocumentHandle[]): Version[] {
  return chain.map((d, i) => ({ id: d.document, label: `v${i + 1}`, principal: d.principal ?? null, at: d.created_at ?? null }));
}

export type HoleInput = "choice" | "yesno" | "number" | "words";

/** How a hole is typed in: a yes or no, a choice among the engine's fillers, a number, or words. */
export function inputOf(hole: Move["holes"][number]): HoleInput {
  if (hole.type === "bool") return "yesno";
  if (hole.fillers && hole.fillers.length > 0) return "choice";
  if (hole.type === "int" || hole.type === "index") return "number";
  return "words";
}

/** A move's arguments from what was typed: numbers as numbers, yes and no as booleans, empty optional holes left out, and the required holes still empty named. */
export function argsOf(move: Move, typed: Record<string, string>): { args: Json; missing: string[] } {
  const args: Json = {};
  const missing: string[] = [];
  for (const h of move.holes) {
    const raw = (typed[h.name] ?? "").trim();
    if (raw === "") {
      if (!h.optional) missing.push(h.name);
      continue;
    }
    const kind = inputOf(h);
    if (kind === "yesno") args[h.name] = raw === "true" || raw === "yes";
    else if (kind === "number") {
      const n = Number(raw);
      if (Number.isFinite(n)) args[h.name] = n;
      else missing.push(h.name);
    } else if ((h.type === "int" || h.type === "index") && /^-?\d+$/.test(raw)) args[h.name] = Number(raw);
    else args[h.name] = raw;
  }
  return { args, missing };
}

/** A move's template with what was typed so far, holes still empty shown by name. */
export function preview(move: Move, typed: Record<string, string>): string {
  return move.template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const v = (typed[name] ?? "").trim();
    return v === "" ? `{${name}}` : v;
  });
}

const isClause = (v: unknown[]): boolean => typeof v[0] === "string" && v.length >= 2 && typeof v[1] === "object" && v[1] !== null && !Array.isArray(v[1]);

const INFIX = new Set(["=", "!=", "<", "<=", ">", ">=", "in", "not_in", "contains", "starts_with", "like"]);

/** A clause as a person reads it: `sex = F`, `base in T1w, T2w`, a function by its name. Read from the document, never composed back into it. */
export function clauseText(clause: unknown): string {
  if (!Array.isArray(clause)) return clause === null || clause === undefined ? "nothing" : String(clause);
  // a clause is `[op, {options}, ...arguments]`; any other list is a list of values
  if (!isClause(clause)) return clause.map((v) => clauseText(v)).join(", ");
  const [head, , ...args] = clause as unknown[];
  if (head === "field" || head === "axis" || head === "derived") return String(args[0] ?? "?").replace(/_/g, " ");
  if (head === "param") return `$${String(args[0] ?? "?")}`;
  const words = args.map((a) => clauseText(a));
  if (typeof head === "string" && INFIX.has(head) && words.length === 2) return `${words[0]} ${head.replace(/_/g, " ")} ${words[1]}`;
  if (head === "and" || head === "or") return words.join(` ${head} `);
  if (head === "not") return `not ${words[0] ?? ""}`;
  return `${String(head).replace(/_/g, " ")}(${words.join(", ")})`;
}

/** What a step of the timeline counts: the rows and subjects its last clause group kept, and what its clauses lost in all. */
export function stepCounts(groups: ClauseGroup[] | undefined, set: string): { rows: number; subjects: number; lost: number } | null {
  const mine = (groups ?? []).filter((g) => g.set === set);
  if (mine.length === 0) return null;
  const last = mine[mine.length - 1];
  return { rows: last.kept, subjects: last.subjects, lost: mine.reduce((a, g) => a + g.lost, 0) };
}
