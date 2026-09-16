// SPDX-License-Identifier: AGPL-3.0-only
// What the pseudonymiser does to the standard elements it acts on, read from
// the engine that owns it (record 28): `GET /api/pseudonymize/tags`. The
// engine serves what it removes, in numbers, categories and three fates, and
// the desk keeps the words; nothing here is a second copy of the policy, and
// an engine that does not serve the door leaves the desk knowing none of it.
//
// Beside the door's answer: what becomes of each tag under one dataset. A
// dataset's own keep and remove lists are that dataset's, served with it and
// saved on its place, so they stay the desk's to edit. Keeping beats removing,
// which is why a tag on both lists is refused here before the engine sees it.

import { door } from "../ask/client";
import { keeper } from "../ui/kept";
import type { Tags } from "./datasets";
import { nameOf, normaliseTag } from "./tags";

/** What becomes of an element: the engine's three words, and no fourth. */
export type Fate = "removed" | "replaced" | "kept";

/** One element of a category the pseudonymiser acts on, as the door serves it. */
export interface PolicyTag {
  tag: string;
  category: string;
  fate: Fate;
  /** Why, where the fate is not the plain removal. */
  why?: string;
}

/** An element settled whatever a dataset says: the code, and the two never removed. */
export interface FixedTag {
  tag: string;
  fate: Fate;
  why: string;
}

/** The door's whole answer. */
export interface TagPolicy {
  count: number;
  categories: { category: string; count: number }[];
  fates: string[];
  tags: PolicyTag[];
  code: FixedTag;
  mandatory: FixedTag[];
  covariates: { fate: Fate; opt_out: string; tags: string[] };
}

export const pseudonymize = {
  tags: () => door<TagPolicy>("GET", "/api/pseudonymize/tags"),
};

/**
 * Read once and kept: the policy is a constant of the engine's binary, and
 * both the Tags card and the chooser read it.
 */
export const policyKept = keeper<TagPolicy>(() => pseudonymize.tags());

/** The served tags by number, built once per answer rather than on every row. */
const indexes = new WeakMap<TagPolicy, Map<string, PolicyTag>>();
function index(policy: TagPolicy): Map<string, PolicyTag> {
  let found = indexes.get(policy);
  if (!found) {
    found = new Map(policy.tags.map((t) => [t.tag, t]));
    indexes.set(policy, found);
  }
  return found;
}

/** One of the served tags, or undefined; nothing is served without the door. */
export function policyTag(policy: TagPolicy | null, tag: string): PolicyTag | undefined {
  return policy ? index(policy).get(tag) : undefined;
}

/** The covariates a dataset keeps unless it opts out; none are known without the door. */
function covariates(policy: TagPolicy | null): string[] {
  return policy?.covariates.tags ?? [];
}

/** Whether this dataset keeps a tag out of every removal. */
function keptBy(policy: TagPolicy | null, tags: Tags, tag: string): boolean {
  return tags.keep.includes(tag) || (tags.keep_demographics && covariates(policy).includes(tag));
}

/** What a row says becomes of its tag: the door's three fates, and the removal a dataset asked for itself. */
export type RowFate = Fate | "added";

export interface TagRow {
  tag: string;
  /** The standard's name; null where it names none, undefined where this desk has no word for it. */
  name: string | null | undefined;
  /** The category the pseudonymiser holds it in; null for a tag no category holds. */
  category: string | null;
  fate: RowFate;
  /** What happens to it, as the row says it. */
  words: string;
  /** A row that can never be ticked: the fate is the engine's, not the dataset's. */
  fixed: boolean;
  /** Whether the row is ticked: the dataset keeps it. */
  kept: boolean;
}

function row(tag: string, category: string | null, fate: RowFate, words: string, fixed: boolean, kept: boolean): TagRow {
  return { tag, name: nameOf(tag), category, fate, words, fixed, kept };
}

/**
 * What happens to one served tag under this dataset. A tag the engine
 * replaces is settled by the engine, so it carries no tick; the rest are the
 * dataset's to keep, by its own list or by the covariate switch.
 */
export function fateOf(tags: Tags, t: PolicyTag): TagRow {
  if (t.fate === "replaced") return row(t.tag, t.category, "replaced", t.why ?? "replaced by the engine", true, true);
  if (tags.keep.includes(t.tag)) return row(t.tag, t.category, "kept", "kept: this dataset's own exception", false, true);
  if (t.fate === "kept" && tags.keep_demographics) return row(t.tag, t.category, "kept", t.why ?? "kept", false, true);
  return row(t.tag, t.category, "removed", `removed with the ${t.category} group`, false, false);
}

/**
 * Why a tag can never be removed, in the engine's own words, or null when it
 * can. Without the door the desk knows of none, and the engine refuses what
 * it must when the change is saved.
 */
export function neverRemoved(policy: TagPolicy | null, tag: string): string | null {
  if (policy === null) return null;
  if (tag === policy.code.tag) return policy.code.why;
  const mandatory = policy.mandatory.find((m) => m.tag === tag);
  if (mandatory) return mandatory.why;
  const served = index(policy).get(tag);
  if (served && served.fate === "replaced") return served.why ?? "replaced by the engine";
  return null;
}

/** The tags this dataset keeps that the door does not serve; without the door, everything it keeps. */
function ownKept(policy: TagPolicy | null, tags: Tags): string[] {
  return tags.keep.filter((t) => policyTag(policy, t) === undefined && neverRemoved(policy, t) === null);
}

/** The tags this dataset removes beside the served ones: its own list, less what is served already and less what nothing can remove. */
export function extraTags(policy: TagPolicy | null, tags: Tags): string[] {
  return tags.remove.filter((t) => policyTag(policy, t) === undefined && neverRemoved(policy, t) === null && !keptBy(policy, tags, t));
}

/**
 * Every row the chooser shows: what the engine settles itself, what it
 * serves under this dataset, what this dataset keeps beyond it, and what it
 * removes on top. Without the door only the dataset's own lists are known,
 * and only they are shown: the desk keeps no copy of what the engine removes.
 */
export function tagRows(policy: TagPolicy | null, tags: Tags): TagRow[] {
  const settled: TagRow[] = policy
    ? [row(policy.code.tag, null, policy.code.fate, policy.code.why, true, true), ...policy.mandatory.map((m) => row(m.tag, null, m.fate, m.why, true, true))]
    : [];
  const served = policy ? policy.tags.map((t) => fateOf(tags, t)) : [];
  const kept = ownKept(policy, tags).map((t) => row(t, null, "kept", "kept: this dataset's own exception", false, true));
  const extras = extraTags(policy, tags).map((t) => row(t, null, "added", "removed: this dataset asked for it", false, false));
  return [...settled, ...served, ...kept, ...extras];
}

/** What the summary counts: how many leave the file, how many of the served stay, and how many this dataset added. */
export interface TagCounts {
  removed: number;
  kept: number;
  extra: number;
}

/**
 * The counts, computed the way the engine applies them rather than by
 * subtracting from a round number: a tag the dataset keeps stays, the
 * covariates stay unless the dataset says otherwise, a replaced tag is not a
 * removal, and what the dataset names itself leaves beside the rest. The
 * served tags' removed and kept always add up to what the door serves. They
 * need the door: what the engine removes is not the desk's to guess.
 */
export function tagCounts(policy: TagPolicy, tags: Tags): TagCounts {
  const rows = policy.tags.map((t) => fateOf(tags, t));
  const removed = rows.filter((r) => r.fate === "removed").length;
  const extra = extraTags(policy, tags).length;
  return { removed: removed + extra, kept: rows.length - removed, extra };
}

/** The summary in words: "96 removed · 4 kept · 1 added by this dataset". */
export function countWords(c: TagCounts): string {
  const parts = [`${c.removed} removed`, `${c.kept} kept`];
  parts.push(c.extra === 0 ? "none added" : `${c.extra} added by this dataset`);
  return parts.join(" · ");
}

/**
 * Keeping a tag, or letting it go again. The covariates are kept by one
 * switch, so letting one of them go turns that switch off and writes the
 * others into the dataset's own kept list: one tag changes, and the rest stay
 * exactly as they were.
 */
export function keepTag(policy: TagPolicy | null, tags: Tags, tag: string, keep: boolean): Tags {
  const remove = tags.remove.filter((t) => t !== tag);
  if (keep) {
    const already = keptBy(policy, tags, tag);
    return { ...tags, remove, keep: already ? tags.keep : [...tags.keep, tag] };
  }
  const kept = tags.keep.filter((t) => t !== tag);
  if (tags.keep_demographics && covariates(policy).includes(tag)) {
    const others = covariates(policy).filter((t) => t !== tag && !kept.includes(t));
    return { keep_demographics: false, remove, keep: [...kept, ...others] };
  }
  return { ...tags, remove, keep: kept };
}

/** Whether every covariate is kept, by the switch or one by one. */
export function demographicsKept(policy: TagPolicy, tags: Tags): boolean {
  return covariates(policy).every((t) => keptBy(policy, tags, t));
}

/** A tag added to this dataset's own removals, or the refusal in words. */
export function addRemoved(policy: TagPolicy | null, tags: Tags, text: string): { tags: Tags } | { refusal: string } {
  const tag = normaliseTag(text);
  if (tag === null) return { refusal: "A tag is four hexadecimal digits, a comma, four more: 0008,1030." };
  const never = neverRemoved(policy, tag);
  if (never !== null) return { refusal: `${tag} is ${never}. It cannot be removed.` };
  const served = policyTag(policy, tag);
  if (served && !keptBy(policy, tags, tag)) return { refusal: `${tag} is already removed: the pseudonymiser removes it with the ${served.category} group.` };
  if (keptBy(policy, tags, tag)) return { refusal: `${tag} is kept by this dataset. Keeping beats removing, so a tag on both lists is refused: let it go first.` };
  if (tags.remove.includes(tag)) return { refusal: `${tag} is on this dataset's list already.` };
  return { tags: { ...tags, remove: [...tags.remove, tag] } };
}

/** A tag taken off this dataset's own removals. */
export function dropRemoved(tags: Tags, tag: string): Tags {
  return { ...tags, remove: tags.remove.filter((t) => t !== tag) };
}

/** Whether the dataset's lists are as they were read, so Save has nothing to send. */
export function sameTags(a: Tags, b: Tags): boolean {
  const same = (x: string[], y: string[]) => x.length === y.length && x.every((v, i) => v === y[i]);
  return a.keep_demographics === b.keep_demographics && same(a.remove, b.remove) && same(a.keep, b.keep);
}

/** The lists a dataset carries before anyone has changed them. */
export const NO_TAGS: Tags = { keep_demographics: true, remove: [], keep: [] };

/** A dataset's lists as the chooser reads them, whatever an older engine left out. */
export function tagsOf(tags: Tags | null | undefined): Tags {
  if (!tags) return NO_TAGS;
  return {
    keep_demographics: tags.keep_demographics !== false,
    remove: (tags.remove ?? []).map((t) => normaliseTag(t) ?? t.trim().toUpperCase()),
    keep: (tags.keep ?? []).map((t) => normaliseTag(t) ?? t.trim().toUpperCase()),
  };
}

/** Whether a row answers what was typed in the search box: its tag or its name. */
export function matches(r: TagRow, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (q === "") return true;
  return r.tag.toLowerCase().includes(q) || (r.name ?? "").toLowerCase().includes(q);
}
