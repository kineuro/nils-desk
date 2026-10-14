// SPDX-License-Identifier: AGPL-3.0-only
// What a run goes over, found as a person types (2026-10-12, Nima: "the
// selection finder is dumb. you need to write exactly the name"): the saved
// selections the engine lists (GET /api/ask/selections), matched on their
// name and words, so "t1 3d" finds t1-3d-stacks and "siemens" finds
// 3d-t1-siemens; each with its newest version, its size, who made it and
// when, and the cohort it is the source of. Exact text still works as typed:
// selection:NAME@V, NAME@V, NAME, or handle:ID. Since record 55 (rulings of
// 2026-10-12, item 6) a run also goes straight over a dataset's or a
// cohort's main scans of a role: each dataset and cohort is offered beside
// the selections, found by its name, the role taken from a word typed (t1,
// flair, t2) or the first of the pack's, and main:ROLE@dataset:NAME works as
// typed. Since 2026-10-12, for a pipeline that needs several roles (a T1w and
// a FLAIR), a dataset or a cohort is taken with every role it needs, no role
// chosen ("study-anon · main T1w + FLAIR"), and main@dataset:NAME works as
// typed.

import type { SelectionRow, SelectionSize } from "../query/selections";
import { mainOfSpec, type MainOver } from "./catalog";

export interface OverOption {
  name: string;
  /** The newest version; every version from 1 up to it stays. */
  newest: number;
  size: SelectionSize | null;
  /** Who made it, and when, where the engine says them. */
  owner: string | null;
  made: string | null;
  /** When its newest version was saved, for the order of an empty search. */
  saved: string | null;
  /** The cohort whose source it is. */
  cohort: string | null;
  description: string | null;
}

export function optionOf(r: SelectionRow): OverOption {
  return { name: r.name, newest: Math.max(1, r.versions || 1), size: r.size ?? null, owner: r.owner ?? null, made: r.created_at ?? null, saved: r.updated_at ?? r.created_at ?? null, cohort: r.cohort ?? null, description: r.description ?? null };
}

/** What exact text names: a selection with or without its version, a dataset's or a cohort's main scans, or a handle; null where the text is not one name. */
export type Spec = { selection: string; version: number | null } | { main: MainOver } | { handle: number };

export function specOf(typed: string): Spec | null {
  const t = typed.trim();
  const h = /^handle:\s*(\d+)$/iu.exec(t);
  if (h) return { handle: Number(h[1]) };
  if (/^main\s*[:@]/iu.test(t)) {
    const main = mainOfSpec(t);
    return main ? { main } : null;
  }
  const m = /^(?:selection:)?([^\s@:,]+)(?:@(\d+))?$/iu.exec(t);
  return m ? { selection: m[1], version: m[2] ? Number(m[2]) : null } : null;
}

const wordsOf = (s: string | null): string[] => (s ?? "").toLowerCase().split(/[^a-z0-9]+/u).filter(Boolean);
const bare = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/gu, "");

/** Whether the letters of `needle` stand in `hay` in their order: "siemns" in "3dt1siemens". */
function inOrder(needle: string, hay: string): boolean {
  let i = 0;
  for (const c of hay) if (c === needle[i] && ++i === needle.length) return true;
  return needle.length === 0;
}

/** How well one typed word finds an option: by a word of its name, a part of the name, its other words, then its letters in order; 0 where it does not. */
function wordScore(t: string, name: string, nameWords: string[], other: string[]): number {
  if (nameWords.includes(t)) return 6;
  if (nameWords.some((w) => w.startsWith(t))) return 5;
  if (name.includes(t)) return 4;
  if (other.includes(t)) return 3;
  if (other.some((w) => w.startsWith(t))) return 2;
  if (t.length >= 3 && inOrder(t, bare(name))) return 1;
  return 0;
}

export interface Found {
  option: OverOption;
  /** The version taken: the one typed after @ where it stands, else the newest. */
  version: number;
  score: number;
}

/**
 * The options the typed words find, best first: every word must find the
 * option somewhere; the name found whole, or its words in the order typed,
 * comes first. With nothing typed, the most recently saved first.
 */
export function findOver(options: OverOption[], typed: string, max = 8): { found: Found[]; more: number } {
  const spec = specOf(typed);
  const asked = spec && "selection" in spec ? spec : null;
  const text = typed.trim().toLowerCase().replace(/^selection:/u, "").replace(/@\d*$/u, "");
  const words = wordsOf(text);
  const recent = (a: Found, b: Found) => b.score - a.score || (b.option.saved ?? "").localeCompare(a.option.saved ?? "") || a.option.name.localeCompare(b.option.name);
  const versionOf = (o: OverOption) => (asked && asked.version !== null && asked.selection.toLowerCase() === o.name.toLowerCase() && asked.version >= 1 && asked.version <= o.newest ? asked.version : o.newest);
  const all: Found[] = [];
  for (const o of options) {
    if (words.length === 0) {
      all.push({ option: o, version: o.newest, score: 0 });
      continue;
    }
    const name = o.name.toLowerCase();
    const nameWords = wordsOf(o.name);
    const other = [...wordsOf(o.description), ...wordsOf(o.cohort), ...wordsOf(o.owner)];
    let score = 0;
    let missed = false;
    for (const w of words) {
      const s = wordScore(w, name, nameWords, other);
      if (s === 0) missed = true;
      score += s;
    }
    if (missed) continue;
    if (name === text || name === words.join("-")) score += 20;
    else if (bare(name).startsWith(bare(text))) score += 4;
    else if (bare(name).includes(bare(text))) score += 3;
    // the words in the order typed, each found in the name after the one before
    let from = 0;
    const ordered = words.every((w) => {
      const i = name.indexOf(w, from);
      if (i < 0) return false;
      from = i + w.length;
      return true;
    });
    if (ordered && words.length > 1) score += 1;
    all.push({ option: o, version: versionOf(o), score });
  }
  all.sort(recent);
  return { found: all.slice(0, max), more: Math.max(0, all.length - max) };
}

/** The pool with more rows the engine answered added, each name once, the newer answer kept. */
export function merged(pool: OverOption[], more: OverOption[]): OverOption[] {
  const by = new Map(pool.map((o) => [o.name, o]));
  for (const o of more) by.set(o.name, o);
  return [...by.values()];
}

/** The longest typed word: what the engine's own filter, part of the name, is asked for where the pool is not every selection. */
export function askWord(typed: string): string {
  return wordsOf(typed.replace(/^selection:/iu, "").replace(/@\d*$/u, "")).sort((a, b) => b.length - a.length)[0] ?? "";
}

/** A dataset or a cohort whose main scans a run may go over, with its size where the engine says it. */
export interface ScopeOption {
  kind: MainOver["kind"];
  name: string;
  /** Its scans and subjects (a dataset's: those with a scan in its folder; a cohort's: its members). */
  scans: number | null;
  subjects: number | null;
}

/** The words a person types for a role, by the role the pack names: t1, t1w for t1w; flair; t2, t2w for t2w. */
export function roleOfWord(word: string, roles: readonly string[]): string | null {
  const w = word.toLowerCase();
  for (const r of roles) {
    const bare = r.toLowerCase();
    if (w === bare || w === bare.replace(/w$/u, "")) return r;
  }
  return null;
}

export interface FoundScope {
  option: ScopeOption;
  /** The role taken: the one a typed word names, else the first of the pack's; null for a pipeline that needs several, which takes each of them. */
  role: string | null;
  score: number;
}

/**
 * The datasets and cohorts the typed words find, best first, each with the
 * role a word names (t1, flair) or the first of the pack's. A word that
 * names a role need not find the name; every other word must, by a word of
 * the name, a part of it, or its kind. With nothing typed, every one, the
 * datasets first, by name: they come after the recent selections. Where the
 * pipeline needs several roles (`needs`), each is taken with no role chosen,
 * since the run takes the main scans of every one.
 */
export function findScopes(options: ScopeOption[], typed: string, roles: readonly string[], max = 6, needs: readonly string[] = []): { found: FoundScope[]; more: number } {
  const spec = specOf(typed);
  if (roles.length === 0 || (spec && "main" in spec)) return { found: [], more: 0 };
  const words = wordsOf(typed.replace(/^selection:/iu, "").replace(/@\d*$/u, ""));
  let role: string | null = null;
  const rest: string[] = [];
  for (const w of words) {
    const r = roleOfWord(w, roles);
    if (r && role === null) role = r;
    else if (!r) rest.push(w);
  }
  const all: FoundScope[] = [];
  for (const o of options) {
    const name = o.name.toLowerCase();
    let score = 0;
    let missed = false;
    for (const w of rest) {
      const s = wordScore(w, name, wordsOf(o.name), [o.kind, "main", "scans"]);
      if (s === 0) missed = true;
      score += s;
    }
    if (missed) continue;
    // nothing of a name typed (nothing at all, or only a role): every one
    all.push({ option: o, role: needs.length > 1 ? null : (role ?? roles[0]), score });
  }
  const kind = (f: FoundScope) => (f.option.kind === "dataset" ? 0 : 1);
  all.sort((a, b) => b.score - a.score || kind(a) - kind(b) || a.option.name.localeCompare(b.option.name));
  return { found: all.slice(0, max), more: Math.max(0, all.length - max) };
}
