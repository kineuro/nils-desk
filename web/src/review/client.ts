// SPDX-License-Identifier: AGPL-3.0-only
// The Review page's doors and its pure parts (record 26): the queue by cohort
// and its summary, why one stack was judged so, a pack with every axis's
// words, a word tried and proposed as an overlay, what adopting one would
// move, and a merge of two subjects. Each call is one engine door through the
// desk's proxy; the page reads the newer doors only where the engine serves
// them, and reads the older ones as they are.

import { door, DoorError, type Json } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { may, sees } from "../grants";
import { ops, overlayScope, type Batch, type OverlayRow, type ReviewItem, type Signals } from "../ops/client";
import { href } from "../routes";
import { kindOf } from "./triage";

const q = (params: Record<string, string | number | boolean | undefined | null>) => {
  const s = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  return s ? `?${s}` : "";
};

/** `GET /api/review/summary?cohort=`: the open items by kind, each cohort's open count, and the items of subjects in no cohort. */
export interface ReviewSummary {
  by_kind: Record<string, number>;
  cohorts: { name: string; open: number }[];
  none: number;
}

/** `GET /api/explain/{stack}`: what the command line prints, axis by axis. */
export interface Explain {
  stack: number;
  pack: string;
  version?: string | null;
  overlay?: string | null;
  axes: ExplainAxis[];
}

export interface ExplainAxis {
  axis: string;
  value: string | null;
  label?: string | null;
  confidence: number;
  tier: string;
  evidence?: { rule_set: string; rule: string; source: string; matched: string | null }[] | null;
  decision?: { kind: string; actor: string; why: string | null } | null;
}

/** What the site's adopted overlays put on one list, as the pack door reports it. */
export interface SiteEdit {
  add: string[];
  remove: string[];
  overlays: number[];
}

/** One value of one axis as the pack door lists it: its words, its flag and, from the signals, how it fared. */
export interface PackValue {
  value: string;
  label: string | null;
  family: string | null;
  /** The words that reach it, the site's adopted ones among them. */
  keywords: string[];
  /** The flag or the combination of flags the pack tries first, in words. */
  flag: string | null;
  /** The confidence threshold the value asks a person under, when the pack names one. */
  threshold: number | null;
  /**
   * The word list a site may amend, as `axis.value`, or null where this
   * value is reached by no word and a site may add none. The pack computes
   * it: a value the axis tries by keyword, or one a keyword rule sets.
   */
  list: string | null;
  /** What the site's adopted overlays already put on that list; null where they put nothing. */
  site: SiteEdit | null;
}

export interface PackAxis {
  axis: string;
  multi: boolean;
  /** The values in the order the pack tries them; empty when the door lists only their number. */
  values: PackValue[];
  /** How many values the door counted, when it listed no words. */
  counted: number;
  review_below: number | null;
  /** When the axis is decided: what the stack is, or what to do with it. */
  phase: string | null;
}

/** The pack as the door answers it, with what this page reads of it. */
export interface PackDoc {
  pack: string;
  version: string;
  contract: number;
  modality: string | null;
  flags: number;
  axes: PackAxis[];
  /** The four lists an engine at pack contract 4 lets a site amend, by name. */
  buckets: Record<string, string[]>;
  /** The word lists a site may amend at pack contract 5, by `axis.value`. */
  lists: string[];
}

/** An overlay document as the try and the propose doors take it. */
export interface OverlayDoc extends Json {
  name?: string;
  version?: string;
  pack: string;
  scope: Record<string, string>;
  /** Pack contract 5: any word list by `axis.value`. */
  lists?: Record<string, { add: string[]; remove: string[] }>;
  /** Pack contract 4: the pack's editable buckets by name. */
  buckets?: Record<string, { add: string[]; remove: string[] }>;
}

export interface TryResult {
  moves: { axis: string; from: string | null; to: string | null; stacks: number }[];
  review_items: { close: number; open: number };
  cases: { passed: number; failed: number };
}

/** `GET /api/depends/overlay/{id}`: what adopting would move. */
export interface Closure {
  stacks: { count: number; sample: number[] };
  review: { opens: number; closes: number };
  handles: { handle: number; name: string | null; reason: string }[];
  releases: { release: number; name: string; version: string }[];
}

export const review = {
  /** The queue, through the one door the operations client types; `cohort` narrows it at record 26. */
  list: (f: { status?: string; kind?: string; cohort?: string; limit?: number }) => ops.review(f.status, f.kind, f.limit ?? 200, f.cohort),
  summary: (cohort?: string) => door<ReviewSummary>("GET", `/api/review/summary${q({ cohort })}`),
  explain: (stack: number) => door<Explain>("GET", `/api/explain/${stack}`),
  pack: (name: string) => door<Json>("GET", `/api/packs/${encodeURIComponent(name)}`).then(packDoc),
  try: (overlay: OverlayDoc, scope: string, sample?: number) => door<TryResult>("POST", "/api/classify/try", sample ? { overlay, scope, sample } : { overlay, scope }),
  propose: (name: string, overlay: OverlayDoc, scope: string, why: string, try_ref?: string) =>
    door<{ overlay: number; review_item: number | null; status: string }>("POST", "/api/overlays", { name, overlay, scope, why, ...(try_ref ? { try_ref } : {}) }),
  closure: (overlay: number) => door<Closure>("GET", `/api/depends/overlay/${overlay}`),
  merge: (canonical: string, alias: string, why: string) => door<{ job: number; state: string }>("POST", "/api/linkage/merge", { canonical, alias, why }),
};

/** A chip of the queue: everything, one cohort with its open count, or the subjects in no cohort. */
export interface CohortChip {
  /** The cohort's name; "" for everything, "none" for no cohort. */
  key: string;
  words: string;
  open: number;
}

/** The chips from the summary door; with no summary, everything alone, counted from the items on the page. */
export function cohortChips(summary: ReviewSummary | null, items: ReviewItem[]): CohortChip[] {
  if (!summary) return [{ key: "", words: "All", open: items.filter((i) => i.status === "open").length }];
  const all = Object.values(summary.by_kind).reduce((n, v) => n + v, 0);
  return [
    { key: "", words: "All", open: all },
    ...summary.cohorts.map((c) => ({ key: c.name, words: c.name, open: c.open })),
    { key: "none", words: "in no cohort", open: summary.none },
  ];
}

/** The three kinds the queue is made of: a scan the rules could not place, subjects that may be one person, a session that moved. */
export type Family = "unsure" | "identity" | "moved" | "picks" | "proposals" | "asked";

/** The families with a page of their own under Review (record 45): a row there opens it. */
export const PAGED: readonly Family[] = ["picks", "proposals", "asked"];

export function familyOf(kind: string): Family | null {
  const k = kindOf(kind);
  if (kind === "pick.border") return "picks";
  if (kind === "classify.asked") return "asked";
  if (k.classifier && k.what === "model") return "proposals";
  if (k.classifier) return "unsure";
  if (k.area === "identity" || k.area === "linkage") return "identity";
  if (k.area === "session") return "moved";
  return null;
}

const n = (v: number) => v.toLocaleString("en-US");

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function text(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null;
}

/** How many stacks an item is about. */
export function membersOf(item: ReviewItem): number {
  return typeof item.members === "number" ? item.members : Array.isArray(item.members) ? item.members.length : 1;
}

/** The batch an item came from, as its ref or its evidence names it. */
export function batchOf(item: ReviewItem): { id: number | null; name: string | null } {
  const ref = (item.ref ?? {}) as Json;
  const ev = (item.evidence ?? {}) as Json;
  const id = num(ref.batch_id) ?? num(ev.batch_id) ?? num(ev.batch);
  const name = text(ev.batch_name) ?? text(ev.batch) ?? text(ref.batch_name);
  return { id, name };
}

/** The stack an item is about, when it names one. */
export function stackOf(item: ReviewItem): number | null {
  const ref = (item.ref ?? {}) as Json;
  return num(ref.stack_id) ?? num(ref.stack) ?? num((item.evidence as Json | null)?.stack_id);
}

/** The dataset an identity item belongs to, when the engine named it. */
export function datasetOf(item: ReviewItem): string | null {
  const ref = (item.ref ?? {}) as Json;
  const ev = (item.evidence ?? {}) as Json;
  return text(ev.place) ?? text(ev.dataset) ?? text(ref.place) ?? text(ref.dataset);
}

/** What one item is about, in a line, from its kind and the evidence its kind describes. */
export function itemWords(item: ReviewItem): string {
  const k = kindOf(item.kind);
  const ev = (item.evidence ?? {}) as Json;
  const members = membersOf(item);
  const alike = members > 1 ? ` · ${n(members)} stacks alike` : "";
  if (item.kind === "pick.border") {
    const ref = (item.ref ?? {}) as Json;
    return `${text(ref.role) ?? "a role"} of subject ${num(ref.subject_id) ?? ""}${text(ref.session_day) ? ` on ${text(ref.session_day)}` : ""}: the pick run doubts it`;
  }
  if (item.kind === "classify.asked") return `System 1 asks about stack ${num(((item.ref ?? {}) as Json).stack_id) ?? ""}`;
  if (k.classifier && k.what === "model") {
    const model = text(ev.model) ?? "a model";
    return `${text(ev.value) ?? "a value"} proposed by ${model}${text(ev.tier) ? ` at ${text(ev.tier)}` : ""}${alike}`;
  }
  if (k.classifier) {
    const values = Array.isArray(ev.values) ? (ev.values as unknown[]).filter((v): v is string => typeof v === "string") : [];
    const value = text(ev.value) ?? text(ev.guess);
    if (k.what === "vote") return `${values.length > 1 ? values.join(" or ") : k.area}, the vote split${alike}`;
    if (k.what === "missing") return `no ${k.area} fits${alike}`;
    if (k.what === "low_confidence") return `${value ? `${value}? ` : ""}the rules were not sure of ${k.area}${alike}`;
    if (k.what === "decision") return `a decision on ${k.area} disagrees with the rules${alike}`;
    return `${k.area}: ${k.what}${alike}`;
  }
  if (k.area === "identity" || k.area === "linkage") {
    const sessions = num(ev.sessions);
    const between = sessions !== null ? ` · ${n(sessions)} ${sessions === 1 ? "session" : "sessions"} between them` : "";
    if (k.what === "collision" || k.what === "conflict") return `two codes share one identifier${between}`;
    if (k.what === "unmapped") {
      const files = num(ev.files);
      const shape = text(ev.shape);
      return `${files !== null ? `${n(files)} files ` : "files "}held until the map names ${shape ? `an identifier shaped ${shape}` : "their identifier"}`;
    }
    if (k.what === "provisional") return `a subject coded from an identifier the map does not know${between}`;
    return `${k.area} ${k.what.replace(/_/g, " ")}${between}`;
  }
  if (k.area === "session") {
    const from = num(ev.from) ?? text(ev.from);
    const to = num(ev.to) ?? text(ev.to);
    const scheme = text(ev.scheme);
    if (from !== null && to !== null) return `a session moved from visit ${from} to visit ${to}${scheme ? ` under ${scheme}` : ""}`;
    return `a session ${k.what.replace(/_/g, " ")}${scheme ? ` under ${scheme}` : ""}`;
  }
  return k.what ? `${k.area} ${k.what.replace(/_/g, " ")}` : item.kind;
}

/**
 * What settles an identity question, by what it is: two codes sharing one
 * identifier are decided to be two or merged into one; files held until
 * mapped are mapped, on their dataset's Pseudonymisation page, and never
 * decided here; a subject coded without a map is merged into the one it
 * stands for, by a merge or by a map that names its identifier.
 */
export function identityActs(item: Pick<ReviewItem, "kind">): { decide: boolean; merge: boolean; map: boolean } {
  if (familyOf(item.kind) !== "identity") return { decide: false, merge: false, map: false };
  const what = kindOf(item.kind).what;
  if (what === "unmapped") return { decide: false, merge: false, map: true };
  if (what === "provisional") return { decide: false, merge: true, map: true };
  return { decide: true, merge: true, map: false };
}

/** Where Map them leads: the dataset's Pseudonymisation page when the item names its dataset, else the Identifiers page, which names each. */
export function mapHref(item: ReviewItem): string {
  const dataset = datasetOf(item);
  return dataset ? href("data", "datasets", dataset, "pseudonymisation") : href("review", "identifiers");
}

/** The kind on a row, in one word, and its tone. */
export function kindTag(kind: string): { words: string; tone: "gated" | "caution" | "" } {
  const f = familyOf(kind);
  if (f === "identity") return { words: "identity", tone: "gated" };
  if (f === "unsure") return { words: "unsure", tone: "caution" };
  if (f === "moved") return { words: "moved", tone: "" };
  if (f === "picks") return { words: "pick", tone: "caution" };
  if (f === "proposals") return { words: "model", tone: "caution" };
  if (f === "asked") return { words: "asked", tone: "caution" };
  return { words: kindOf(kind).area, tone: "" };
}

/** The decision's scope, as the door names it and as the page says it. */
export const SCOPES: { scope: "stack" | "series" | "subject" | "origin"; words: string }[] = [
  { scope: "stack", words: "this scan" },
  { scope: "series", words: "its series" },
  { scope: "subject", words: "this subject" },
  { scope: "origin", words: "this scanner" },
];

/** Why a decision was refused, in words: the engine's ranking says who decided before and outranks the caller. */
export function refusalWords(e: unknown): string {
  if (e instanceof DoorError) {
    const said = typeof e.body.error === "string" ? e.body.error : "";
    if (e.status === 409 && /does not (decide|adopt) over|outrank|lower author/u.test(said)) return `Refused: ${said}. A decision stands until the one who made it, or someone of higher standing, withdraws it.`;
    if (e.status === 409) return `Refused: ${said}`;
    if (e.status === 403) return "Deciding needs work on the Review page.";
    return said || e.message;
  }
  return e instanceof Error ? e.message : String(e);
}

/** The pack document as the door answers it, made even: values as a list in the pack's order, whatever shape the door listed them in. */
export function packDoc(raw: Json): PackDoc {
  const axes = Array.isArray(raw.axes) ? (raw.axes as Json[]) : [];
  const buckets: Record<string, string[]> = {};
  if (raw.buckets && typeof raw.buckets === "object") {
    for (const [name, words] of Object.entries(raw.buckets as Json)) if (Array.isArray(words)) buckets[name] = words.map(String);
  }
  const lists = Array.isArray(raw.lists) ? raw.lists.map(String) : [];
  return {
    pack: text(raw.pack) ?? text(raw.name) ?? "",
    version: text(raw.version) ?? "",
    contract: num(raw.contract) ?? 4,
    modality: text(raw.modality),
    flags: typeof raw.flags === "number" ? raw.flags : Array.isArray(raw.flags) ? raw.flags.length : raw.flags && typeof raw.flags === "object" ? Object.keys(raw.flags as Json).length : 0,
    axes: axes.map((a) => {
      const name = text(a.axis) ?? text(a.name) ?? "";
      const listed = a.values;
      const values: PackValue[] = Array.isArray(listed)
        ? listed.map((v) => packValue(v as Json | string))
        : listed && typeof listed === "object"
          ? Object.entries(listed as Json).map(([value, v]) => packValue({ value, ...((v as Json) ?? {}) }))
          : [];
      const counted = num(listed) ?? num(a.count) ?? values.length;
      return { axis: name, multi: a.multi === true, values, counted, review_below: num(a.review_below), phase: text(a.phase) };
    }),
    buckets,
    lists,
  };
}

function siteEdit(v: unknown): SiteEdit | null {
  if (!v || typeof v !== "object") return null;
  const s = v as Json;
  const add = Array.isArray(s.add) ? s.add.map(String) : [];
  const remove = Array.isArray(s.remove) ? s.remove.map(String) : [];
  const overlays = Array.isArray(s.overlays) ? s.overlays.flatMap((o) => (typeof o === "number" ? [o] : [])) : [];
  return add.length === 0 && remove.length === 0 ? null : { add, remove, overlays };
}

function packValue(v: Json | string): PackValue {
  if (typeof v === "string") return { value: v, label: null, family: null, keywords: [], flag: null, threshold: null, list: null, site: null };
  const keywords = Array.isArray(v.keywords) ? v.keywords.map(String) : Array.isArray(v.words) ? v.words.map(String) : [];
  const det = (v.detection ?? v.flags ?? null) as Json | string[] | string | null;
  let flag: string | null = null;
  if (typeof det === "string") flag = det;
  else if (Array.isArray(det)) flag = det.length > 0 ? det.map(String).join(" and ") : null;
  else if (det && typeof det === "object") {
    const parts: string[] = [];
    if (text(det.exclusive)) parts.push(det.exclusive as string);
    if (Array.isArray(det.combination) && det.combination.length > 0) parts.push(`${parts.length > 0 ? "else " : ""}${det.combination.map(String).join(" and ")}`);
    flag = parts.length > 0 ? parts.join(", ") : null;
  }
  return {
    value: text(v.value) ?? text(v.name) ?? "",
    label: text(v.label),
    family: text(v.family),
    keywords,
    flag,
    threshold: num(v.threshold) ?? num(v.below),
    list: text(v.list),
    site: siteEdit(v.site),
  };
}

/**
 * What a site may add a word to, as the pack computes it rather than as the
 * desk fixes it: a value carrying a list of its own at pack contract 5, or,
 * on an older engine, one standing for a bucket the pack lets a site amend.
 */
export function valueEditable(pack: PackDoc, axis: string, value: string): boolean {
  const key = `${axis}.${value}`;
  if (pack.contract >= 5 && pack.lists.length > 0) return pack.lists.includes(key);
  if (pack.contract >= 5) return (pack.axes.find((a) => a.axis === axis)?.values.find((v) => v.value === value)?.list ?? null) !== null;
  const bucket = BUCKET_OF[key] ?? null;
  return bucket !== null && bucket in pack.buckets;
}

/**
 * Whether the pack reaches the axis by a word anywhere: a word on one of its
 * values, or a list the pack opens on it, which is a word list a site may grow
 * whether or not it holds a word today. A door that only numbered an axis's
 * values says nothing either way, so such an axis is not taken for a wordless
 * one. This is what the page marks as "no words", and it is the pack's answer:
 * whether this engine lets a site amend those words is the separate question
 * `axisEditable` asks.
 */
export function axisHasWords(pack: PackDoc, a: PackAxis): boolean {
  if (a.values.length === 0) return true;
  if (a.values.some((v) => v.keywords.length > 0 || v.list !== null)) return true;
  return pack.lists.some((l) => l.startsWith(`${a.axis}.`));
}

/**
 * Whether a site may add a word anywhere on the axis, under the same contract
 * test each value is read under: the pack computes the lists it opens at every
 * contract, and only contract 5 lets a site amend by them, so an engine at
 * contract 4 is answered by its buckets alone. An engine that only numbered an
 * axis's values still names the lists it opens, so such an axis is not
 * mistaken for one no word may be added to.
 */
export function axisEditable(pack: PackDoc, a: PackAxis): boolean {
  if (a.values.some((v) => valueEditable(pack, a.axis, v.value))) return true;
  if (pack.contract < 5) return false;
  return pack.lists.some((l) => l.startsWith(`${a.axis}.`));
}

/**
 * Why an axis takes no word from a site, in a person's words: it carries none
 * anywhere and is decided from the other axes, or it carries words this engine
 * does not let a site amend.
 */
export function whyNoWords(pack: PackDoc, a: PackAxis): string {
  if (a.values.length > 0 && !axisHasWords(pack, a)) {
    return a.phase === "disposition"
      ? "No words anywhere: it is decided from the axes above it."
      : "No words anywhere: a flag or a rule decides it.";
  }
  if (a.values.length === 0) return "This engine lists no value of this axis, so it lists no words either.";
  const amendable = Object.keys(pack.buckets);
  if (amendable.length > 0) return `This engine lets a site grow ${amendable.join(", ")} only.`;
  return "This pack opens no word list on this axis, so a site adds none to it.";
}

/**
 * Why a site adds no word to one value, in a person's words. Two different
 * things are refused the same way, so each says which it is: a value reached
 * by no word at all takes none from anyone, and a value carrying words this
 * engine does not let a site amend is refused by the engine, not by the pack.
 */
export function whyNoWordHere(pack: PackDoc, a: PackAxis, v: PackValue): string {
  const reached = v.keywords.length > 0 || v.list !== null || pack.lists.includes(`${a.axis}.${v.value}`);
  if (!reached) return "This value is reached by no word, so a site adds none to it.";
  return whyNoWords(pack, a);
}

/** A value's words split in two: the ones the pack shipped, and the ones the site added. */
export function wordsOf(v: PackValue): { shipped: string[]; added: string[] } {
  const added = v.site?.add ?? [];
  const lower = new Set(added.map((w) => w.toLowerCase()));
  return { shipped: v.keywords.filter((w) => !lower.has(w.toLowerCase())), added };
}

/** One word on a value, as the page draws it: the pack's own, one a site adopted, or one only proposed. */
export interface ValueWord {
  word: string;
  from: "pack" | "site" | "proposed";
  /** Which scope adopted or proposed it; null for the pack's own words, and where no overlay on the page names the scope. */
  scope: string | null;
}

/**
 * A value's words in the order the page draws them: the pack's own first,
 * then the ones a site adopted, each with the scope that adopted it, then the
 * ones only proposed. The two answers are joined because neither is whole on
 * its own. The pack door names a site's adopted words among the value's own at
 * pack contract 5; at contract 4 a site amends a bucket, which the door names
 * on no value, so the adopted overlays answer for those. A word both answer to
 * is drawn once, with the scope the overlay names.
 */
export function valueWords(v: PackValue, overlays: OverlayRow[], axis: string): ValueWord[] {
  const site = siteWords(overlays, axis, v.value);
  const named = new Map(site.adopted.map((s) => [s.word.toLowerCase(), s.scope]));
  const { shipped, added } = wordsOf(v);
  const out: ValueWord[] = shipped.filter((w) => !named.has(w.toLowerCase())).map((word) => ({ word, from: "pack" as const, scope: null }));
  const drawn = new Set<string>();
  for (const word of added) {
    drawn.add(word.toLowerCase());
    out.push({ word, from: "site", scope: named.get(word.toLowerCase()) ?? null });
  }
  for (const s of site.adopted) {
    if (drawn.has(s.word.toLowerCase())) continue;
    drawn.add(s.word.toLowerCase());
    out.push({ word: s.word, from: "site", scope: s.scope });
  }
  for (const s of site.proposed) out.push({ word: s.word, from: "proposed", scope: s.scope });
  return out;
}

/** The axes rail: each axis with what its rules are made of, in words. */
export function axisWords(a: PackAxis): string {
  const lists = a.values.filter((v) => v.keywords.length > 0).length;
  const flags = a.values.some((v) => v.flag !== null);
  if (lists > 0) return `${lists} ${lists === 1 ? "list" : "lists"}`;
  if (a.values.length === 0 && a.counted > 0) return `${a.counted} values`;
  if (flags) return a.values.some((v) => v.threshold !== null) ? "flags and physics" : "flags";
  return "";
}

/** The scope of a rule change, as the signals and the overlay doors name it. */
export type Scope = { kind: "batch"; id: number; name: string | null } | { kind: "origin"; name: string } | { kind: "everything"; pack: string; version: string };

/** The scope as the signals door takes it. */
export function scopeString(s: Scope): string {
  if (s.kind === "batch") return `batch:${s.id}`;
  if (s.kind === "origin") return `origin:${s.name}`;
  return `pack:${s.version}`;
}

/** The scope as the overlay document carries it: provenance, never a selection. */
export function scopeDoc(s: Scope): Record<string, string> {
  if (s.kind === "batch") return { batch: String(s.id) };
  if (s.kind === "origin") return { station: s.name };
  return {};
}

export function scopeWords(s: Scope): string {
  if (s.kind === "batch") return `batch ${s.name ?? s.id}`;
  if (s.kind === "origin") return `scanner ${s.name}`;
  return "everything";
}

/** The four buckets of pack contract 4 stand for a value of an axis each; nothing else is a site's to edit there. */
const BUCKET_OF: Record<string, string> = { "post_contrast.yes": "contrast_positive", "post_contrast.no": "contrast_negative", "directory_type.localizer": "localizer_words", "construct.diffusion": "diffusion_tokens" };

/**
 * The overlay a word makes, for the try door and then the propose door: at
 * pack contract 5 any list by `axis.value`; at contract 4 the bucket the
 * value stands for, or nothing, with why.
 */
export function wordOverlay(pack: PackDoc, axis: string, value: string, add: string[], remove: string[], scope: Scope, name?: string): { overlay: OverlayDoc | null; why: string | null } {
  const words = add.map((w) => w.trim()).filter((w) => w !== "");
  const gone = remove.map((w) => w.trim()).filter((w) => w !== "");
  if (words.length === 0 && gone.length === 0) return { overlay: null, why: "Write a word first." };
  const key = `${axis}.${value}`;
  const base: OverlayDoc = { pack: pack.pack, scope: scopeDoc(scope), ...(name ? { name, version: "1.0.0" } : {}) };
  if (pack.contract >= 5) {
    // the pack says which lists a site may amend; a value reached by no word has none, and the engine would refuse the overlay
    if (!valueEditable(pack, axis, value)) return { overlay: null, why: `${axis} ${value} is reached by no word, so a site adds none to it.` };
    return { overlay: { ...base, lists: { [key]: { add: words, remove: gone } } }, why: null };
  }
  const bucket = BUCKET_OF[key] ?? Object.keys(pack.buckets).find((b) => b === key || b === `${axis}_${value}`.toLowerCase());
  if (!bucket || !(bucket in pack.buckets)) {
    const editable = Object.keys(pack.buckets);
    return { overlay: null, why: `This engine lets a site grow ${editable.length > 0 ? `only ${editable.join(", ")}` : "no list"} of ${pack.pack} ${pack.version}; ${axis} ${value} waits for pack contract 5.` };
  }
  return { overlay: { ...base, buckets: { [bucket]: { add: words, remove: gone } } }, why: null };
}

/** A rehearsal in a line: what moved, what closes and opens, the cases. */
export function tryWords(t: TryResult): string {
  const moved = t.moves.reduce((s, m) => s + m.stacks, 0);
  const cases = t.cases.passed + t.cases.failed;
  return `moves ${n(moved)} ${moved === 1 ? "stack" : "stacks"} · closes ${n(t.review_items.close)} ${t.review_items.close === 1 ? "item" : "items"} · opens ${n(t.review_items.open)}${cases > 0 ? ` · cases ${n(t.cases.passed)} of ${n(cases)}` : ""}`;
}

/** What adopting would do, for the button and the note: move N, M cards stop reproducing. */
export function closureWords(c: Closure): { act: string; note: string } {
  const cards = c.handles.length;
  const parts = [`re-sorts ${n(c.stacks.count)} ${c.stacks.count === 1 ? "stack" : "stacks"}`, `closes ${n(c.review.closes)} ${c.review.closes === 1 ? "item" : "items"}`];
  if (c.review.opens > 0) parts.push(`opens ${n(c.review.opens)}`);
  if (cards > 0) parts.push(`${n(cards)} query ${cards === 1 ? "card stops" : "cards stop"} reproducing until ${cards === 1 ? "it runs" : "they run"} again`);
  if (c.releases.length > 0) parts.push(`${n(c.releases.length)} ${c.releases.length === 1 ? "release" : "releases"} included them`);
  return { act: `Adopt: move ${n(c.stacks.count)}`, note: `It ${parts.join(", ")}.` };
}

/** The change an overlay row proposes, in words: its lists or buckets and their words. */
export function overlayChange(o: OverlayRow): { title: string; words: string }[] {
  const doc = (o.document ?? {}) as Json;
  const out: { title: string; words: string }[] = [];
  const read = (map: unknown, split: (k: string) => string) => {
    if (!map || typeof map !== "object") return;
    for (const [k, v] of Object.entries(map as Json)) {
      const e = (v ?? {}) as Json;
      const add = Array.isArray(e.add) ? e.add.map(String) : [];
      const remove = Array.isArray(e.remove) ? e.remove.map(String) : [];
      const words = [add.length > 0 ? `+ ${add.join(", ")}` : "", remove.length > 0 ? `- ${remove.join(", ")}` : ""].filter(Boolean).join(" ");
      out.push({ title: split(k), words });
    }
  };
  read(doc.lists, (k) => k.replace(".", " · "));
  read(doc.buckets, (k) => k);
  return out;
}

/** The words an adopted overlay adds to a value's list, and those a proposed one would, for the table's tags. */
export function siteWords(overlays: OverlayRow[], axis: string, value: string): { adopted: { word: string; scope: string }[]; proposed: { word: string; scope: string }[] } {
  const key = `${axis}.${value}`;
  const bucket = BUCKET_OF[key] ?? null;
  const adopted: { word: string; scope: string }[] = [];
  const proposed: { word: string; scope: string }[] = [];
  for (const o of overlays) {
    const doc = (o.document ?? {}) as Json;
    const edits: Json[] = [];
    const lists = doc.lists as Json | undefined;
    if (lists && lists[key]) edits.push(lists[key] as Json);
    const buckets = doc.buckets as Json | undefined;
    if (bucket && buckets && buckets[bucket]) edits.push(buckets[bucket] as Json);
    for (const e of edits) {
      const add = Array.isArray(e.add) ? e.add.map(String) : [];
      const scope = overlayScope(o) ?? scopeOfDoc(doc);
      for (const word of add) (o.status === "adopted" ? adopted : o.status === "proposed" ? proposed : []).push({ word, scope });
    }
  }
  return { adopted, proposed };
}

function scopeOfDoc(doc: Json): string {
  const s = (doc.scope ?? {}) as Json;
  const [k, v] = Object.entries(s)[0] ?? [];
  return k ? `${k} ${String(v)}` : "everything";
}

/** The words the adopted overlays add, across every list and bucket: the strip's "site words". */
export function siteWordCount(overlays: OverlayRow[]): number {
  let count = 0;
  for (const o of overlays) {
    if (o.status !== "adopted") continue;
    const doc = (o.document ?? {}) as Json;
    for (const map of [doc.lists, doc.buckets]) {
      if (!map || typeof map !== "object") continue;
      for (const e of Object.values(map as Json)) {
        const add = (e as Json | null)?.add;
        if (Array.isArray(add)) count += add.filter((w) => typeof w === "string" && w.trim() !== "").length;
      }
    }
  }
  return count;
}

/**
 * The overlays with their documents: the list door answers a row without
 * its document, and each overlay's own door carries it, so the adopted and
 * proposed ones, the newest first up to `limit`, are read one by one. A row
 * whose read fails stays as listed.
 */
export async function withDocuments(rows: OverlayRow[], read: (id: number) => Promise<OverlayRow>, limit = 24): Promise<OverlayRow[]> {
  const wanted = rows.filter((o) => o.document === undefined && (o.status === "adopted" || o.status === "proposed")).sort((a, b) => b.id - a.id).slice(0, limit);
  const full = new Map<number, OverlayRow>();
  await Promise.all(wanted.map((o) => read(o.id).then((f) => full.set(o.id, f), () => undefined)));
  return rows.map((o) => {
    const f = full.get(o.id);
    return f ? { ...o, document: f.document, tried: f.tried, why: f.why } : o;
  });
}

/** A batch as the scope chips name it: one chip per thread, so a pseudonymise batch never stands beside its digest batch of the same name. */
export interface ScopeBatch {
  id: number;
  name: string;
  kind: string | null;
}

/** The newest threads for the scope chips: pseudonymise batches left out (the digest of the thread carries the name), one chip per name. */
export function scopeBatches(batches: Pick<Batch, "id" | "name" | "kind">[], limit = 3): ScopeBatch[] {
  const out: ScopeBatch[] = [];
  for (const b of batches) {
    if (b.kind === "pseudonymize") continue;
    if (out.some((s) => s.name === b.name)) continue;
    out.push({ id: b.id, name: b.name, kind: b.kind ?? null });
    if (out.length >= limit) break;
  }
  return out;
}

/** The counts of one value, from the signals: by value when the engine gives it, else null. */
export function valueCounts(signals: Signals | null, axis: string, value: string): { decided: number; unsure: number } | null {
  const by = signals?.["by_value"] as Record<string, Record<string, { decided?: number; unsure?: number; open?: number }>> | undefined;
  const row = by?.[axis]?.[value];
  if (!row) return null;
  return { decided: num(row.decided) ?? 0, unsure: num(row.unsure) ?? num(row.open) ?? 0 };
}

/** The counts of one axis, from the signals: stacks sorted at any tier, and the open items on it. */
export function axisCounts(signals: Signals | null, axis: string): { sorted: number; unsure: number } | null {
  const a = signals?.axes?.[axis];
  if (!a) return null;
  const sorted = Object.values(a.tiers ?? {}).reduce((s, v) => s + v, 0);
  const unsure = Object.values(a.open_review ?? {}).reduce((s, v) => s + v, 0);
  return { sorted, unsure };
}

/** The scanners the signals name, for the scope chips, when the engine lists them. */
export function originsOf(signals: Signals | null): string[] {
  const list = signals?.["origins"];
  if (!Array.isArray(list)) return [];
  return list.flatMap((o) => (typeof o === "string" ? [o] : o && typeof o === "object" && typeof (o as Json).name === "string" ? [(o as Json).name as string] : []));
}

/** Why an axis was judged so, in a line from its evidence or its decision. */
export function becauseWords(a: ExplainAxis): string {
  if (a.decision) return `a ${a.decision.kind}, ${a.decision.actor}, decided${a.decision.why ? `: ${a.decision.why}` : ""}`;
  const ev = a.evidence ?? [];
  const tier = a.tier.toLowerCase();
  const first = ev[0];
  if (first) {
    const where = first.source ? ` in the ${first.source.replace(/_/g, " ")}` : "";
    if (/keyword|word/u.test(tier) || /keyword/u.test(first.rule_set)) return `a word: ${first.matched ?? first.rule}${where}`;
    if (/flag|exclusive|combination/u.test(tier)) return `a flag: ${first.rule}${where}`;
    if (/physic|threshold|geometry/u.test(tier) || /physic/u.test(first.rule_set)) return `physics: ${first.rule}${where}`;
    return `a rule: ${first.rule}${first.rule_set ? ` of ${first.rule_set}` : ""}`;
  }
  if (a.value === null) return "no rule fired; nothing";
  return `${tier || "a rule"}${a.confidence < 0.65 ? ", not sure enough, so it asked" : ""}`;
}

/** Whether the person may decide, adopt, or merge here (record 25's grants, record 26's detail). */
export function acts(caps: Capabilities): { decide: boolean; adopt: boolean; merge: boolean } {
  return {
    decide: may(caps, "review:work"),
    adopt: may(caps, "review:work") && may(caps, "data:work"),
    merge: may(caps, "data:work") && sees(caps, "sensitive"),
  };
}
