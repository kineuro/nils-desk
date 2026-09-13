// SPDX-License-Identifier: AGPL-3.0-only
// The Query page's pure parts: a card's name, a card's versions, how a move's
// holes are typed in and read back as arguments, the counts a step of the
// timeline shows, and what the charts of a step draw. Nothing here composes ask JSON; a query changes only through
// a move the engine offered.

import type { CatalogField, ClauseGroup, DocumentHandle, Json, Move, Profile, ProfileValue } from "../ask/client";

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

const MOVE_WORDS: Record<string, string> = {
  add_set: "Add a step",
  add_where: "Where",
  set_strict: "How a condition reads",
  add_axis_where: "Where the scan is",
  exclude_scenario: "Leave out",
  add_near: "Near in time",
  set_window: "Within",
  set_policy: "Which one when several",
  set_optional: "Keep those without",
  add_has: "Must have",
  set_bound: "How many",
  add_attach: "Attach",
  add_bind: "Bring in a field",
  set_level: "At the level of",
  add_pick: "One per",
  set_out: "Answer with",
  add_measure: "Measure",
  add_column: "Show a column",
  add_order: "Order by",
  set_limit: "At most",
  set_param: "Set a value",
  rename_set: "Rename",
  keep_set: "Keep",
};

/** A move's words on its button: what it does, else the template up to its first hole. */
export function moveWords(m: Move): string {
  return MOVE_WORDS[m.kind] ?? (m.template.split("{")[0].trim() || m.kind.replace(/_/g, " "));
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

/** A count with its unit, singular for one: 1 subject, 1,497 stacks. */
export function unitWords(count: number, unit: string): string {
  return `${count.toLocaleString("en-US")} ${count === 1 && unit.endsWith("s") ? unit.slice(0, -1) : unit}`;
}

/** How a profile's value reads on a bar. */
export type ValueAs = "base" | "decade" | "sex" | "plain";

const SEX_WORDS: Record<string, string> = { F: "female", M: "male", O: "other" };

/** A value as a bar's label: a missing value named for what is missing, a decade as its span of years, a sex in words. */
export function valueWords(v: ProfileValue["value"], as: ValueAs = "plain"): string {
  if (v === null || v === "") return as === "decade" ? "age unknown" : as === "base" ? "no base" : "not recorded";
  if (as === "decade" && typeof v === "number") return `${v} to ${v + 9}`;
  if (as === "sex") return SEX_WORDS[String(v)] ?? String(v);
  return String(v);
}

export interface Bar {
  label: string;
  count: number;
  subjects: number;
  /** The bar's length against the longest, from 0 to 1. */
  share: number;
}

/** A chart's bars in the order they read: decades by age with the unknown last, anything else as the engine listed it, most first. */
export function barsOf(values: ProfileValue[], as: ValueAs = "plain"): Bar[] {
  const ordered = as === "decade" ? [...values].sort((a, b) => (a.value === null ? 1 : b.value === null ? -1 : Number(a.value) - Number(b.value))) : values;
  const widest = Math.max(1, ...ordered.map((v) => v.count));
  return ordered.map((v) => ({ label: valueWords(v.value, as), count: v.count, subjects: v.subjects, share: v.count / widest }));
}

export type Chart = { kind: "bars"; bars: Bar[] } | { kind: "words"; words: string } | { kind: "none" };

const sentence = (s: string): string => (s === "" ? s : `${s[0].toUpperCase()}${s.slice(1)}${s.endsWith(".") ? "" : "."}`);

/** What one part of a profile draws: its bars, the reason it has none, or nothing where the step's grain has no such part. */
export function chartOf(part: unknown, as: ValueAs = "plain", empty = "Nothing to count under this step."): Chart {
  if (part === null || part === undefined || typeof part !== "object") return { kind: "none" };
  if (Array.isArray(part)) return part.length > 0 ? { kind: "bars", bars: barsOf(part as ProfileValue[], as) } : { kind: "words", words: empty };
  const p = part as Record<string, unknown>;
  if (typeof p.withheld === "string") return { kind: "words", words: sentence(p.withheld) };
  if (typeof p.refused === "string") return { kind: "words", words: `This could not be counted: ${p.refused}` };
  if (Array.isArray(p.values)) return chartOf(p.values, as, empty);
  if (Array.isArray(p.kinds)) return chartOf(p.kinds, as, empty);
  return { kind: "none" };
}

/** A profile's headline numbers, each member counted once: subjects, sessions and stacks, or the rows and subjects of a set of another grain. */
export function countsOf(p: Profile | null): { label: string; value: number }[] {
  const c = (p?.counts ?? {}) as Record<string, unknown>;
  return ["subjects", "sessions", "stacks", "rows"].filter((k) => typeof c[k] === "number").map((k) => ({ label: k, value: c[k] as number }));
}

export type ChartTab = "stacks" | "field" | "people" | "clinical";

/** The charts a profile has, as tabs: a part the step's grain has none of is no tab. */
export function tabsOf(p: Profile | null): { id: ChartTab; words: string }[] {
  if (!p) return [];
  const tabs: { id: ChartTab; words: string }[] = [];
  if (p.stack_types !== null) tabs.push({ id: "stacks", words: "Stack types" });
  if (typeof (p.counts as Record<string, unknown>).stacks === "number") tabs.push({ id: "field", words: "By a field" });
  if (p.demographics !== null) tabs.push({ id: "people", words: "Demographics" });
  if (p.clinical !== null) tabs.push({ id: "clinical", words: "Clinical" });
  return tabs;
}

/** The stack fields a chart may count by value: categories a person reads, never a date, and only a technical or a clinical one. The scanner's maker comes first. */
export function fieldChoices(fields: CatalogField[]): string[] {
  const kind = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  const paths = fields
    .filter((f) => !f.dated && ["technical", "clinical"].includes(kind(f.class)) && ["text", "integer", "bool", "boolean"].includes(f.type))
    .map((f) => f.path);
  return [...new Set(paths)].sort((a, b) => (a === "manufacturer" ? -1 : b === "manufacturer" ? 1 : a.localeCompare(b)));
}

/** A change between two versions, in words: what it adds, takes away or changes, and in which step. The query's default scheme says nothing, and reads as nothing. */
export function changeWords(c: { set?: string | null; part: string; kind: string; after?: unknown }): string {
  const part = c.part.replace(/_/g, " ");
  if (!c.set) {
    if (c.part === "name") return c.kind === "removed" ? "" : typeof c.after === "string" && c.after.length <= 60 ? `names the query "${c.after}"` : "names the query";
    if (c.part === "scheme" && (c.after === "default" || c.after === null || c.after === undefined)) return "";
    // which sets a result keeps is bookkeeping a person never reads
    if (c.part === "keep") return "";
    if (c.part === "out") return "changes what the query answers with";
    return `${c.kind === "added" ? "adds" : c.kind === "removed" ? "takes away" : "changes"} the query's ${part}`;
  }
  if (c.part === "set") return c.kind === "added" ? `adds the step ${c.set}` : c.kind === "removed" ? `takes away the step ${c.set}` : `changes the step ${c.set}`;
  if (c.kind === "added") return `adds ${part} to ${c.set}`;
  if (c.kind === "removed") return `takes ${part} away from ${c.set}`;
  return `changes ${part} in ${c.set}`;
}
