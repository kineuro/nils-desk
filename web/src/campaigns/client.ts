// SPDX-License-Identifier: AGPL-3.0-only
// Campaigns (record 45 S3 and S4, on the doors of record 42): one question
// asked of a frozen list of items, answered by raters under leases,
// adjudicated where they disagree, and closed through the review spine's one
// write path. This file holds the doors, as the engine's OpenAPI 7 names
// them, and the page's pure parts: what a close will write, what an answer
// body is, whose turn an item is. Nothing here decides; the engine does.

import { door, DoorError, type Json } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";
import { href, narrow } from "../routes";

/** A small JSON Schema, as a form question and a derivative's form carry it. */
export interface FormSchema {
  properties: Record<string, FormField>;
  required?: string[];
}

export interface FormField {
  type?: "string" | "number" | "integer" | "boolean" | "array";
  enum?: (string | number)[];
  title?: string;
  description?: string;
}

/** The question, one of the kinds the engine knows; `axes` joins with wave 45's engine slice. */
export interface Question {
  kind: string;
  axis?: string;
  /** An axis question's values (the pack's, or the ones the question lists); an axes question's per axis. */
  values?: string[] | Record<string, string[]>;
  axes?: string[];
  role?: string;
  scheme?: string;
  schema?: FormSchema;
  derivative_kind?: string;
  form?: FormSchema;
  /** An axes question's legal combinations, frozen from the served pack when the campaign was made (record 45 E4). */
  constraints?: AxesConstraints;
  /** An axes question's reserved word for "can't tell" (record 48), which any asked axis takes as its value; absent on an engine before it. */
  cant_tell?: string;
  /** Whether the answer door takes the unsure mark (record 48); absent on an engine before it. */
  unsure?: boolean;
  /**
   * An axes question's derived axes (record 48, after the first real read):
   * computed by the pack's rules from the rater's answer, never answered and
   * never drawn as a row. Absent on an engine before it.
   */
  derive?: string[];
  /**
   * The names each value of an answered axis goes by (record 48, the second
   * real read): its label, description, the pack's terms and the words its
   * rules read, served from the pack with the question; the same for every
   * stack. Absent on an engine before it. Read with `vocabularyOf`.
   */
  vocabulary?: Record<string, Record<string, { label?: string; description?: string; terms?: string[]; keywords?: string[] }>>;
}

/** What an axes question holds its answers to: each asked axis's values, the multi-valued axes, the exclusion groups and the pack's implications. */
export interface AxesConstraints {
  pack?: string;
  values?: Record<string, string[]>;
  multi?: string[];
  groups?: Record<string, Record<string, string[]>>;
  implications?: { rule?: string; when: Condition; then: { axis: string; value: string; when?: Condition | null }[] }[];
}

/** The pack's condition language over axis values: true, false, {axis, is}, {axis, missing_or}, {all}, {any}, {not}. */
export type Condition = boolean | { axis?: string; is?: string; missing_or?: string; all?: Condition[]; any?: Condition[]; not?: Condition };

/** An axes answer as the engine reads it: each asked axis with its values, none for no value. */
export type Joint = Record<string, string[]>;

export type ItemState = "open" | "awaiting_metric" | "needs_adjudication" | "agreed" | "adjudicated" | "disagreed" | "resolved";

export interface Agreement {
  items: number;
  raters_per_item: number;
  exact: number | null;
  fleiss_kappa: number | null;
  cohen_kappa: number | null;
  /** An axes campaign's agreement measured on each axis alone (record 45 E4). */
  per_axis?: Record<string, Agreement & { cant_tell?: number }>;
  /** How many answers were marked unsure (record 48). */
  unsure?: number;
}

export interface Item {
  id: number;
  campaign_id?: number;
  position: number;
  review_item_id: number | null;
  stack_id: number | null;
  /** Left out at detail plain for a session's item, which spells the day it opened. */
  subject_id?: number | null;
  session_day?: string | null;
  key?: string | null;
  input_derivative_ids: number[] | null;
  state: ItemState | string;
  round: number;
  agreement: number | null;
  metric: number | null;
  outcome: { value?: unknown; form?: Json | null; answers?: number[]; derivative_id?: number | null; per_axis?: Record<string, number>; decisions?: Record<string, number> } | null;
  decision_id: number | null;
  pick_id: number | null;
  resolved_at: string | null;
  /** Record 48: an item of a sealed sample, read with nothing suggested and never in a batch. */
  blind?: boolean;
  /** Record 48 R1: a batch held it back to be read alone. */
  held_back?: boolean;
}

export interface Assignment {
  id: number;
  campaign_id?: number;
  item_id: number;
  principal: string;
  role: "rater" | "adjudicator";
  round: number;
  state: "leased" | "submitted" | "released" | "expired" | "offered" | string;
  created_at: string;
  leased_at: string | null;
  lease_until: string | null;
  ended_at: string | null;
}

export interface Counts {
  items: Partial<Record<string, number>>;
  assignments: Partial<Record<string, number>>;
  answers: number;
}

export interface Campaign {
  id: number;
  name: string;
  owner: string;
  status: "open" | "closing" | "closed" | string;
  question: Question;
  grain: "stack" | "session" | string;
  source: Json;
  handle_id: number | null;
  content_hash?: string | null;
  epoch?: number;
  pack_version?: string | null;
  raters_per_item: number;
  rater_policy: { raters: string[]; adjudicators: string[] };
  adjudication: { when: "disagree" | "always" | "never" | string; metric: "exact" | "kappa" | "external" | string; threshold?: number | null };
  closes_into: "decision" | "stage" | "pick" | "none" | string;
  lease_seconds: number;
  created_at: string;
  closed_at: string | null;
  closed_by: string | null;
  agreement: Agreement | null;
  counts: Counts;
  /** One campaign's read carries its items and assignments; the list leaves them out. */
  items?: Item[];
  assignments?: Assignment[];
}

export interface Answer {
  id: number;
  item_id: number;
  assignment_id: number;
  principal: string;
  role: "rater" | "adjudicator";
  round: number;
  author_kind: "person" | "agent" | "model" | string;
  /** Left out at detail plain for a free question. */
  value?: unknown;
  form?: Json | null;
  derivative_id?: number | null;
  why?: string | null;
  answered_at: string;
  model_id?: number | null;
  /** The rater wants a second look (record 48). */
  unsure?: boolean;
  /** The derived axes the pack computed from this answer (record 48), where the engine keeps them. */
  derived?: Derived | null;
}

/** Derived axes by name: a value, a set on a multi-valued axis, none (null), or can't tell. */
export type Derived = Record<string, string | string[] | null>;

export interface Claimed {
  assignment: Assignment | null;
  item: Item | null;
  held?: boolean;
  why?: string;
}

export interface Answered {
  answer: number;
  item: number;
  state: ItemState | string;
  adjudication: number | null;
  /** The derived axes the engine stored with the answer (record 48). */
  derived?: Derived | null;
}

export interface Closed {
  decisions: number[];
  picks: number[];
  resolved: number;
  unresolved: number;
  refused: unknown[];
  /** Items whose stack (or an axis of it) someone decided while the campaign was open: that decision stands. */
  skipped?: { item: number; why: string }[];
  staged: boolean;
  agreement: Agreement | null;
}

export interface LabelSet {
  id: number;
  name: string;
  version: number;
  kind: string;
  what: string | null;
  source: Json;
  campaign_id: number | null;
  handle_id: number | null;
  epoch: number;
  pack_version: string | null;
  scheme_digest: string | null;
  sealed: boolean;
  training: string;
  rows: number;
  digest: string;
  place_id: number | null;
  path: string | null;
  created_by: string;
  created_at: string;
  /** One set's read carries its two files; at detail plain a set of a person's words has none. */
  files?: { "labels.tsv"?: string; "provenance.json"?: Json };
}

/** The stacks a session item's pick is made among. */
export interface Candidates {
  campaign: number;
  item: number;
  role: string;
  count: number;
  candidates: { stack_id: number; series_id?: number | null; axes: Record<string, string[]>; picked_by: number[] }[];
  /** The picks standing for the role on the occasion: a run's with its scores and every candidate it considered, best first, and a person's. */
  picks: { id: number; author_kind: string; actor?: string | null; stacks: number[]; score?: number | null; margin?: number | null; borders?: string[]; considered?: { stacks: number[]; score?: number | null }[] | null; model?: string | null }[];
}

/** How many of a new campaign's stacks have their picture, and the job that builds the rest (record 45 E1). */
export interface Pictures {
  stacks: number;
  have: number;
  missing: number;
  place: string | null;
  build?: string[];
}

/** What a campaign is made of, as the make door takes it. */
export interface MakeBody extends Json {
  name: string;
  question: Json;
  source: Json;
  raters_per_item: number;
  raters?: string[];
  adjudicators?: string[];
  adjudication: Json;
  closes_into: string;
  lease_seconds: number;
}

/** The body of an answer: a value for an axis, a pick and a free question, a form for a form, a file for a derivative. */
export interface AnswerBody extends Json {
  value?: string | number[] | Record<string, string | string[] | null>;
  form?: Json;
  derivative_id?: number;
  why?: string;
  /** Sent only when set, and only to an engine whose question says it takes it. */
  unsure?: boolean;
}

const id = (c: number | string) => encodeURIComponent(String(c));

export const campaigns = {
  list: () => door<{ count: number; campaigns: Campaign[] }>("GET", "/api/campaigns").then((r) => r.campaigns),
  one: (c: number | string) => door<Campaign>("GET", `/api/campaigns/${id(c)}`),
  answers: (c: number | string) => door<{ campaign: number; count: number; answers: Answer[] }>("GET", `/api/campaigns/${id(c)}/answers`).then((r) => r.answers),
  make: (body: MakeBody) => door<Campaign & { pictures?: Pictures }>("POST", "/api/campaigns", body),
  claim: (c: number | string, role: "rater" | "adjudicator" = "rater") => door<Claimed>("POST", `/api/campaigns/${id(c)}/claim`, { role }),
  answer: (c: number | string, assignment: number, body: AnswerBody) => door<Answered>("POST", `/api/campaigns/${id(c)}/assignments/${assignment}/answer`, body),
  release: (c: number | string, assignment: number) => door<Assignment>("POST", `/api/campaigns/${id(c)}/assignments/${assignment}/release`, {}),
  /**
   * Keeps a lease. The renew door (record 45) lengthens it by the campaign's
   * lease from now and answers the assignment; where it answers 409 the lease
   * ran out or the campaign closed, and a claim then says what the person
   * holds now (the next item, or nothing). An engine before the door is
   * claimed of: a claim hands a live lease back as it is (held), so the
   * heartbeat learns whether it still holds and how long.
   */
  renew: (caps: Capabilities, c: number | string, assignment: number, role: "rater" | "adjudicator") =>
    served(caps, RENEW)
      ? door<Assignment>("POST", `/api/campaigns/${id(c)}/assignments/${assignment}/renew`, {}).then(
          (a) => ({ assignment: a, item: null, held: true }) as Claimed,
          (e: unknown) => {
            if (e instanceof DoorError && e.status === 409) return campaigns.claim(c, role);
            throw e;
          },
        )
      : campaigns.claim(c, role),
  close: (c: number | string) => door<Closed>("POST", `/api/campaigns/${id(c)}/close`, {}),
  export: (c: number | string, body: { of: "outcomes" | "answers"; name?: string; place?: string }) => door<LabelSet>("POST", `/api/campaigns/${id(c)}/export`, body),
  labelSets: () => door<{ count: number; label_sets: LabelSet[] }>("GET", "/api/label-sets").then((r) => r.label_sets),
  labelSet: (n: number) => door<LabelSet>("GET", `/api/label-sets/${n}`),
  /** The review item behind a campaign item, for its evidence; review:see, so a rater without it reads nothing here. */
  reviewItem: (n: number) => door<{ id: number; kind: string; evidence: Json | null }>("GET", `/api/review/${n}`),
  /** A session item's stacks for a pick question, with what the classifier says of each (record 45; detail quasi). */
  candidates: (c: number | string, item: number) => door<Candidates>("GET", `/api/campaigns/${id(c)}/items/${item}/candidates`),
  /** The pack's words for an axis, where the person may read the pack. */
  pack: (name: string) => door<Json>("GET", `/api/packs/${encodeURIComponent(name)}`),
  /** The derived axes of a partial answer (record 48): the asked axes chosen so far, the rest taken as can't tell. */
  derive: (c: number | string, item: number, value: Record<string, string | string[] | null>) => door<{ derived?: Json }>("POST", `/api/campaigns/${id(c)}/items/${item}/derive`, { value }),
  /** An item's whole stored header less direct identifiers (record 48), from the path the why door names. */
  header: (path: string) => door<HeaderDoc>("GET", path),
  /** How common each combination of the answered axes is across the registry, never counting this campaign's stacks or a sealed one (record 48). */
  combinations: (c: number | string, limit = 300) => door<Json>("GET", `/api/campaigns/${id(c)}/combinations?limit=${limit}`),
};

/** The doors record 48's first real read added: the derived axes of an answer, and an item's whole header. */
export const DERIVE = "POST /api/campaigns/{id}/items/{item}/derive";
export const HEADER = "GET /api/campaigns/{id}/items/{item}/header";
/** The door the second real read added: how common each whole answer is, for the combination search. */
export const COMBINATIONS = "GET /api/campaigns/{id}/combinations";

/** The whole-header door's answer: one representative instance's stored header, direct identifiers left out. */
export interface HeaderDoc {
  stack?: number | null;
  item?: number | null;
  blind?: boolean;
  detail?: string;
  instance?: { instance_number?: number | null } | null;
  fields: HeaderField[];
  left_out?: { identifying?: number; below_detail?: number } | null;
}

export interface HeaderField {
  level?: string | null;
  column?: string | null;
  keyword?: string | null;
  tag?: string | null;
  value: unknown;
}

/** The door that lengthens a lease (record 45); the heartbeat uses it where it is served. */
export const RENEW = "POST /api/campaigns/{id}/assignments/{assignment}/renew";

// ---------------------------------------------------------------- the section

/** Whether the section is offered: the grant and the door. */
export function offered(caps: Capabilities): boolean {
  return may(caps, "campaigns:see") && served(caps, "GET /api/campaigns");
}

/** The person as the engine names them on an assignment. */
export function principalOf(caps: Capabilities): string {
  return caps.engine?.principal || caps.person.subject;
}

/** The kinds a campaign may ask, with the ones this engine knows: `axes` only where its contract says so. */
export function kindsOffered(caps: Capabilities): string[] {
  const kinds = ["axis", "form", "free", "derivative", "pick"];
  if (axesServed(caps)) kinds.splice(1, 0, "axes");
  return kinds;
}

/** The door a record 45 engine adds beside the axes question; OpenAPI 7 grew both in place, so the door is how the desk knows. */
export const CANDIDATES = "GET /api/campaigns/{id}/items/{item}/candidates";

/** Whether the engine asks the `axes` question (record 45 E4): it serves record 45's campaign doors and a pack to hold the answers to. */
export function axesServed(caps: Capabilities): boolean {
  const kinds = (caps.engine as { campaigns?: { question_kinds?: unknown } } | null)?.campaigns?.question_kinds;
  if (Array.isArray(kinds)) return kinds.includes("axes");
  return served(caps, CANDIDATES) && (caps.engine?.packs.length ?? 0) > 0;
}

export const KIND_WORDS: Record<string, string> = {
  axis: "One axis",
  axes: "Several axes",
  pick: "Pick the stacks",
  form: "A form",
  derivative: "A file",
  free: "Free text",
};

/** The question in a few words. */
export function questionWords(q: Question): string {
  switch (q.kind) {
    case "axis":
      return `${q.axis ?? "an axis"}${Array.isArray(q.values) && q.values.length > 0 ? ` · ${q.values.length} values` : ""}`;
    case "axes":
      return (q.axes ?? []).join(", ") || "several axes";
    case "pick":
      return `pick ${q.role ?? "a role"}`;
    case "form":
      return `form · ${Object.keys(q.schema?.properties ?? {}).length} fields`;
    case "derivative":
      return `${q.derivative_kind ?? "a file"}${q.form ? " with a form" : ""}`;
    case "free":
      return "free text";
    default:
      return q.kind;
  }
}

/** Where the items came from. */
export function sourceWords(source: Json): string {
  if (typeof source.selection === "string") return `selection ${source.selection}`;
  if (source.handle !== undefined) return `result ${String(source.handle)}`;
  if (source.review && typeof source.review === "object") {
    const r = source.review as Json;
    const kind = typeof r.kind === "string" ? r.kind : typeof r.kind_prefix === "string" ? `${r.kind_prefix}*` : "review items";
    return `review ${kind}${r.job_id ? ` of job ${String(r.job_id)}` : ""}`;
  }
  return "none";
}

/** Where a closed campaign's answers went. */
export const CLOSES_WORDS: Record<string, string> = {
  decision: "decisions in force",
  stage: "staged decisions",
  pick: "picks",
  none: "nothing: the answers are the labels",
};

/** The item states in the order a campaign moves through them, each with its word and tone. */
export const STATES: { state: string; words: string; tone: "" | "caution" | "brand" | "ok" }[] = [
  { state: "open", words: "open", tone: "" },
  { state: "awaiting_metric", words: "awaiting metric", tone: "caution" },
  { state: "needs_adjudication", words: "to adjudicate", tone: "caution" },
  { state: "disagreed", words: "disagreed", tone: "caution" },
  { state: "agreed", words: "agreed", tone: "ok" },
  { state: "adjudicated", words: "adjudicated", tone: "ok" },
  { state: "resolved", words: "resolved", tone: "brand" },
];

export const stateWords = (s: string) => STATES.find((x) => x.state === s)?.words ?? s.replace(/_/g, " ");

/** The items by state as bar segments, in the order a campaign moves, each with its share. */
export function progress(counts: Counts): { state: string; words: string; tone: string; n: number; share: number }[] {
  const total = Object.values(counts.items).reduce<number>((a, b) => a + (b ?? 0), 0);
  if (total === 0) return [];
  const known = STATES.map((s) => ({ ...s, n: counts.items[s.state] ?? 0 }));
  const other = Object.entries(counts.items)
    .filter(([k]) => !STATES.some((s) => s.state === k))
    .map(([state, n]) => ({ state, words: state, tone: "" as const, n: n ?? 0 }));
  return [...known, ...other].filter((s) => s.n > 0).map((s) => ({ ...s, share: s.n / total }));
}

export const itemTotal = (counts: Counts) => Object.values(counts.items).reduce<number>((a, b) => a + (b ?? 0), 0);

/** Settled: agreed, adjudicated or resolved, what a close writes or wrote. */
export const settled = (state: string) => state === "agreed" || state === "adjudicated" || state === "resolved";

/** A share as a percentage, or a dash. */
export const pct = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? "none" : `${Math.round(v * 100)}%`);
export const kappa = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? "none" : v.toFixed(2));

/** Agreement in one line: exact, then Cohen's kappa where the same two answered every item, else Fleiss'. */
export function agreementWords(a: Agreement | null): string {
  if (!a || a.items === 0) return "not measured yet";
  const k = a.cohen_kappa !== null && a.cohen_kappa !== undefined ? `κ ${kappa(a.cohen_kappa)}` : a.fleiss_kappa !== null && a.fleiss_kappa !== undefined ? `Fleiss κ ${kappa(a.fleiss_kappa)}` : null;
  return [`${pct(a.exact)} exact`, k, `over ${a.items} ${a.items === 1 ? "item" : "items"}`].filter(Boolean).join(" · ");
}

// ---------------------------------------------------------------- who may do what

/** Why the person may not rate here, or null when a claim is theirs to try. */
export function rateRefusal(caps: Capabilities, c: Campaign, role: "rater" | "adjudicator" = "rater"): string | null {
  if (c.status !== "open") return `The campaign is ${c.status}.`;
  if (!may(caps, "campaigns:work")) return "Rating needs work on the Campaigns page.";
  if (!served(caps, "POST /api/campaigns/{id}/claim")) return "This engine has no door for claiming an item.";
  const listed = role === "rater" ? c.rater_policy.raters : c.rater_policy.adjudicators;
  if (listed.length > 0 && !listed.includes(principalOf(caps))) return `The campaign names its ${role}s, and you are not one.`;
  return null;
}

/** Whether an adjudicator has anything here: the person may adjudicate and an item waits for one. */
export function adjudicatorHas(caps: Capabilities, c: Campaign): boolean {
  return rateRefusal(caps, c, "adjudicator") === null && (c.counts.items.needs_adjudication ?? 0) > 0;
}

/**
 * Whether the page shows each rater's answer while the campaign is open: to
 * its owner and its adjudicators, and to anyone once it is closed. A rater
 * rates blind. The engine's answers door opens under campaigns:see, so the
 * blinding is the desk's.
 */
export function seesAnswers(caps: Capabilities, c: Campaign): boolean {
  if (c.status === "closed") return true;
  const me = principalOf(caps);
  if (c.owner === me) return true;
  const adj = c.rater_policy.adjudicators;
  return adj.length > 0 ? adj.includes(me) : may(caps, "campaigns:work") && may(caps, "review:work");
}

/** Why the person may not close, or null. Closing writes decisions, so it needs Review work beside Campaigns work. */
export function closeRefusal(caps: Capabilities, c: Campaign): string | null {
  if (c.status === "closed") return "It is closed.";
  if (!served(caps, "POST /api/campaigns/{id}/close")) return "This engine has no door for closing a campaign.";
  if (!may(caps, "campaigns:work")) return "Closing needs work on the Campaigns page.";
  if (!may(caps, "review:work")) return "Closing writes through Review, so it needs work on the Review page as well.";
  return null;
}

export function exportRefusal(caps: Capabilities): string | null {
  if (!served(caps, "POST /api/campaigns/{id}/export")) return "This engine has no door for exporting a campaign.";
  if (!may(caps, "campaigns:work")) return "Exporting needs work on the Campaigns page.";
  return null;
}

export function makeRefusal(caps: Capabilities): string | null {
  if (!served(caps, "POST /api/campaigns")) return "This engine has no door for making a campaign.";
  if (!may(caps, "campaigns:work")) return "Making a campaign needs work on the Campaigns page.";
  return null;
}

// ---------------------------------------------------------------- the closure panel

export interface Closure {
  /** What the settled items become. */
  writes: { n: number; words: string };
  /** Settled items whose answers were not all a person's: staged whatever the campaign says (record 42 R6). */
  staged: number;
  /** Items that stay unresolved, by state, and stay open in the queue. */
  unresolved: { state: string; words: string; n: number }[];
  unresolvedTotal: number;
  /** Leases still out, which the close ends. */
  leases: number;
  already: number;
}

/**
 * What a close will write, counted from the campaign as read: the engine has
 * no dry close, so the panel says what its rules make of the items that are
 * settled now. A model's or an agent's answer stages its decision (R6).
 */
export function closure(c: Campaign, answers: Answer[] | null = null): Closure {
  const items = c.items ?? [];
  const ready = items.filter((i) => i.state === "agreed" || i.state === "adjudicated");
  const already = items.filter((i) => i.state === "resolved").length;
  const byItem = new Map<number, Answer[]>();
  for (const a of answers ?? []) byItem.set(a.item_id, [...(byItem.get(a.item_id) ?? []), a]);
  const notPersons = ready.filter((i) => (byItem.get(i.id) ?? []).some((a) => a.author_kind !== "person")).length;
  // an axes item closes into one decision per axis (record 45 E4)
  const perItem = c.question.kind === "axes" && (c.closes_into === "decision" || c.closes_into === "stage") ? Math.max(1, c.question.axes?.length ?? 1) : 1;
  const n = ready.length * perItem;
  const plural = (one: string, many: string) => (n === 1 ? one : many);
  const words =
    c.closes_into === "decision"
      ? plural("decision in force", "decisions in force")
      : c.closes_into === "stage"
        ? plural("staged decision, for a person to commit", "staged decisions, for a person to commit")
        : c.closes_into === "pick"
          ? plural("person's pick", "person's picks")
          : plural("review item closed with its outcome", "review items closed with their outcomes");
  const unresolved = STATES.filter((s) => !settled(s.state))
    .map((s) => ({ state: s.state, words: s.words, n: items.filter((i) => i.state === s.state).length }))
    .filter((s) => s.n > 0);
  return {
    writes: { n, words: perItem > 1 ? `${words}, one per axis of ${ready.length} ${ready.length === 1 ? "item" : "items"}` : words },
    staged: c.closes_into === "decision" ? notPersons * perItem : 0,
    unresolved,
    unresolvedTotal: unresolved.reduce((a, s) => a + s.n, 0),
    leases: (c.assignments ?? []).filter((a) => a.state === "leased").length,
    already,
  };
}

/** What the close answered, in one sentence. */
export function closedWords(r: Closed, into: string): string {
  const wrote = into === "pick" ? `${r.picks.length} ${r.picks.length === 1 ? "pick" : "picks"}` : into === "none" ? `${r.resolved} resolved` : `${r.decisions.length} ${r.decisions.length === 1 ? "decision" : "decisions"}${r.staged ? ", staged" : ""}`;
  const refused = r.refused.length > 0 ? `; ${r.refused.length} refused by a decision that outranks it` : "";
  const n = r.skipped?.length ?? 0;
  const skipped = n > 0 ? `; ${n} skipped, decided by someone while the campaign was open` : "";
  return `Closed: ${wrote}, ${r.unresolved} unresolved${refused}${skipped}.`;
}

// ---------------------------------------------------------------- making one

export type SourceKind = "selection" | "handle" | "review";

export interface Draft {
  name: string;
  source: SourceKind;
  /** name@version, a handle id, or a review kind; a kind ending in `*` or `.` is a prefix. */
  from: string;
  /** Review items only: the job that raised them, at most how many, and the cohort Review was narrowed to (said, not sent). */
  job?: number;
  limit?: number;
  cohort?: string;
  kind: string;
  axis: string;
  axes: string[];
  /** For an axis question: a narrower list of values, comma separated; empty takes the pack's. */
  values: string;
  role: string;
  derivativeKind: string;
  fields: DraftField[];
  ratersPerItem: number;
  raters: string;
  adjudicators: string;
  when: string;
  metric: string;
  threshold: string;
  closesInto: string;
  leaseMinutes: number;
}

export interface DraftField {
  name: string;
  type: "string" | "number" | "integer" | "boolean" | "enum";
  /** For an enum: the choices, comma separated. */
  choices: string;
  required: boolean;
}

export function emptyDraft(prefill: Partial<Prefill> = {}): Draft {
  return {
    name: "",
    source: prefill.source ?? "selection",
    from: prefill.from ?? "",
    ...(prefill.job ? { job: prefill.job } : {}),
    ...(prefill.limit ? { limit: prefill.limit } : {}),
    ...(prefill.cohort ? { cohort: prefill.cohort } : {}),
    kind: "axis",
    axis: "",
    axes: [],
    values: "",
    role: "",
    derivativeKind: "mask",
    fields: [{ name: "", type: "enum", choices: "", required: true }],
    ratersPerItem: 2,
    raters: "",
    adjudicators: "",
    when: "disagree",
    metric: "exact",
    threshold: "0.8",
    closesInto: "stage",
    leaseMinutes: 60,
  };
}

/** What a question of this kind may close into. */
export function closesFor(kind: string): string[] {
  if (kind === "axis" || kind === "axes") return ["stage", "decision", "none"];
  if (kind === "pick") return ["pick", "none"];
  return ["none"];
}

const list = (s: string) =>
  s
    .split(/[\s,]+/u)
    .map((x) => x.trim())
    .filter(Boolean);

/** The form's schema from its fields. */
export function schemaOf(fields: DraftField[]): FormSchema {
  const properties: Record<string, FormField> = {};
  for (const f of fields) {
    const name = f.name.trim();
    if (!name) continue;
    properties[name] = f.type === "enum" ? { enum: list(f.choices) } : { type: f.type };
  }
  return { properties, required: fields.filter((f) => f.required && f.name.trim()).map((f) => f.name.trim()) };
}

/** The make door's body from the draft, or what it still needs. */
export function makeBody(d: Draft): { ok: true; body: MakeBody } | { ok: false; needs: string } {
  const name = d.name.trim();
  if (!name) return { ok: false, needs: "a name" };
  if (!/^[\p{L}\p{N}][\p{L}\p{N}_.-]*$/u.test(name)) return { ok: false, needs: "a name of letters, digits, dots, dashes or underscores" };
  const from = d.from.trim();
  let source: Json;
  if (d.source === "selection") {
    if (!/^[^@\s]+@\d+$/u.test(from)) return { ok: false, needs: "a selection as name@version" };
    source = { selection: from };
  } else if (d.source === "handle") {
    if (!/^\d+$/u.test(from)) return { ok: false, needs: "a result's handle number" };
    source = { handle: Number(from) };
  } else {
    if (!from) return { ok: false, needs: "a review kind, such as base:vote, or a prefix such as base:" };
    const narrowed = { ...(d.job ? { job_id: d.job } : {}), ...(d.limit ? { limit: d.limit } : {}) };
    source = { review: /[*.:]$/u.test(from) ? { kind_prefix: from.replace(/\*$/u, ""), ...narrowed } : { kind: from, ...narrowed } };
  }
  let question: Json;
  switch (d.kind) {
    case "axis": {
      if (!d.axis.trim()) return { ok: false, needs: "the axis to ask" };
      const values = list(d.values);
      question = { kind: "axis", axis: d.axis.trim(), ...(values.length > 0 ? { values } : {}) };
      break;
    }
    case "axes":
      if (d.axes.length < 1) return { ok: false, needs: "the axes to ask" };
      question = { kind: "axes", axes: d.axes };
      break;
    case "pick":
      if (!d.role.trim()) return { ok: false, needs: "the role to pick, such as main_t1" };
      question = { kind: "pick", role: d.role.trim() };
      break;
    case "form": {
      const schema = schemaOf(d.fields);
      if (Object.keys(schema.properties).length === 0) return { ok: false, needs: "at least one field of the form" };
      const bad = d.fields.find((f) => f.name.trim() && f.type === "enum" && list(f.choices).length === 0);
      if (bad) return { ok: false, needs: `the choices of ${bad.name.trim()}` };
      question = { kind: "form", schema: schema as unknown as Json };
      break;
    }
    case "derivative":
      question = { kind: "derivative", ...(d.derivativeKind.trim() ? { derivative_kind: d.derivativeKind.trim() } : {}) };
      break;
    default:
      question = { kind: "free" };
  }
  if (!(d.ratersPerItem >= 1)) return { ok: false, needs: "at least one rater per item" };
  const threshold = Number(d.threshold);
  const metric = d.kind === "derivative" ? "external" : d.metric;
  const when = d.kind === "derivative" && d.when === "disagree" && metric !== "external" ? "always" : d.when;
  if (metric !== "exact" && !(threshold >= 0 && threshold <= 1)) return { ok: false, needs: "a threshold between 0 and 1" };
  const closes = closesFor(d.kind).includes(d.closesInto) ? d.closesInto : closesFor(d.kind)[0];
  const raters = list(d.raters);
  const adjudicators = list(d.adjudicators);
  return {
    ok: true,
    body: {
      name,
      question,
      source,
      raters_per_item: Math.floor(d.ratersPerItem),
      ...(raters.length > 0 ? { raters } : {}),
      ...(adjudicators.length > 0 ? { adjudicators } : {}),
      adjudication: { when, metric, ...(metric !== "exact" || d.threshold.trim() !== "0.8" ? { threshold } : {}) },
      closes_into: closes,
      lease_seconds: Math.max(60, Math.round(d.leaseMinutes * 60)),
    },
  };
}

/**
 * What another page fills the make dialog with: the source, and for Review
 * items the job that raised them, at most how many, and the cohort the queue
 * was narrowed to, which the dialog says and the engine's review source does
 * not take.
 */
export interface Prefill {
  source: SourceKind;
  from: string;
  job?: number;
  limit?: number;
  cohort?: string;
}

/**
 * The one address that opens the make dialog with its source filled in:
 * Query's from a selection or a result, Review's "Ask people about these"
 * from its filter (`#campaigns?make=review&from=<kind or prefix>&job=&limit=&cohort=`).
 */
export function makeHref(source: SourceKind, from: string | number, more: { job?: number | null; limit?: number | null; cohort?: string | null } = {}): string {
  return narrow(href("campaigns"), { make: source, from: String(from), job: more.job, limit: more.limit, cohort: more.cohort });
}

/** The dialog's prefill from an address's query, or null when it asks for none. */
export function prefillOf(query: Record<string, string> | undefined): Prefill | null {
  const make = query?.make;
  if (make !== "selection" && make !== "handle" && make !== "review" && make !== "1") return null;
  const count = (v: string | undefined) => (v && /^[1-9]\d*$/u.test(v) ? Number(v) : undefined);
  const job = make === "review" ? count(query?.job) : undefined;
  const limit = make === "review" ? count(query?.limit) : undefined;
  const cohort = make === "review" && query?.cohort ? query.cohort : undefined;
  return { source: make === "1" ? "selection" : make, from: query?.from ?? "", ...(job ? { job } : {}), ...(limit ? { limit } : {}), ...(cohort ? { cohort } : {}) };
}

// ---------------------------------------------------------------- answering

/** The values an axis question offers, flat. */
export function axisValues(q: Question, axis?: string): string[] {
  if (Array.isArray(q.values)) return q.values;
  if (q.values && axis && Array.isArray(q.values[axis])) return q.values[axis];
  return [];
}

/** The axes a question's derived axes name; never answered by the rater. */
export const derivedAxes = (q: Question): string[] => (q.kind === "axes" && Array.isArray(q.derive) ? q.derive.filter((a) => typeof a === "string") : []);

/** The axes the rater answers: an axes question's asked axes less any it derives; an axis question's one axis. */
export function answeredAxes(q: Question): string[] {
  if (q.kind === "axis") return q.axis ? [q.axis] : [];
  if (q.kind !== "axes") return [];
  const derived = derivedAxes(q);
  return (q.axes ?? []).filter((a) => !derived.includes(a));
}

/** The word an axes answer gives an axis for "can't tell" where the question does not name its own (the engine's reserved word). */
export const CANT_TELL = "cant_tell";

/** The question's word for "can't tell", or null where the engine does not take it (an older engine, or not an axes question). */
export function cantTellOf(q: Question): string | null {
  return q.kind === "axes" && typeof q.cant_tell === "string" && q.cant_tell !== "" ? q.cant_tell : null;
}

/** Whether the answer door takes the unsure mark for this question. */
export const unsureOf = (q: Question): boolean => q.unsure === true;

/** A rater's answer as it is being given, before it is sent. */
export type Given =
  | { kind: "value"; value: string }
  | { kind: "values"; values: Record<string, string | string[] | null> }
  | { kind: "stacks"; stacks: number[] }
  | { kind: "form"; form: Json }
  | { kind: "file"; derivative: number | null; form: Json }
  | { kind: "text"; text: string }
  | { kind: "none" };

/** Why the answer cannot be sent yet, or null with its body. Checks what the engine checks first, so a refusal is rare. */
export function answerBody(q: Question, g: Given, why = "", unsure = false): { ok: true; body: AnswerBody } | { ok: false; needs: string } {
  const w = { ...(why.trim() ? { why: why.trim() } : {}), ...(unsure && unsureOf(q) ? { unsure: true } : {}) };
  switch (q.kind) {
    case "axis": {
      if (g.kind !== "value" || !g.value) return { ok: false, needs: "a value" };
      const allowed = axisValues(q);
      if (allowed.length > 0 && !allowed.includes(g.value)) return { ok: false, needs: `one of the question's values` };
      return { ok: true, body: { value: g.value, ...w } };
    }
    case "axes": {
      if (g.kind !== "values") return { ok: false, needs: "a value for each axis" };
      // every asked axis is named; none says it has no value here, can't tell that the data give no clue
      const cant = cantTellOf(q);
      const asked = answeredAxes(q);
      const missing = asked.filter((a) => {
        const v = g.values[a];
        return v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
      });
      if (missing.length > 0) return { ok: false, needs: `a value for ${missing.join(", ")}, or none${cant ? ", or can't tell" : ""}` };
      // only the asked axes are sent and held to the pack; a derived axis is the engine's to compute
      const said = Object.fromEntries(asked.filter((a) => a in g.values).map((a) => [a, g.values[a]]));
      const problem = q.constraints ? legalProblem(q.constraints, jointOf(said, cant ?? CANT_TELL)) : null;
      if (problem) return { ok: false, needs: `a combination the pack allows: ${problem}` };
      const value: Record<string, string | string[] | null> = {};
      for (const a of asked) value[a] = g.values[a] ?? null;
      return { ok: true, body: { value, ...w } };
    }
    case "pick":
      if (g.kind !== "stacks" || g.stacks.length === 0) return { ok: false, needs: "the stacks that stand for the role" };
      return { ok: true, body: { value: g.stacks, ...w } };
    case "form": {
      if (g.kind !== "form") return { ok: false, needs: "the form" };
      const err = formProblem(q.schema, g.form);
      return err ? { ok: false, needs: err } : { ok: true, body: { form: g.form, ...w } };
    }
    case "derivative": {
      if (g.kind !== "file" || g.derivative === null) return { ok: false, needs: "the file, registered in the app that makes it" };
      const err = q.form ? formProblem(q.form, g.form) : null;
      return err ? { ok: false, needs: err } : { ok: true, body: { derivative_id: g.derivative, ...(q.form ? { form: g.form } : {}), ...w } };
    }
    case "free":
      if (g.kind !== "text" || !g.text.trim()) return { ok: false, needs: "the words" };
      return { ok: true, body: { value: g.text.trim(), ...w } };
    default:
      return { ok: false, needs: `a question this desk knows (${q.kind})` };
  }
}

/**
 * The chosen values as the engine reads an axes answer for the pack's
 * constraints: an axis not chosen yet is left out, and so is an axis the
 * rater cannot tell, which names no value; none is no value.
 */
export function jointOf(values: Record<string, string | string[] | null>, cantTell = CANT_TELL): Joint {
  const out: Joint = {};
  for (const [axis, v] of Object.entries(values)) {
    if (v === undefined || v === "" || v === cantTell) continue;
    out[axis] = v === null ? [] : Array.isArray(v) ? v : [v];
  }
  return out;
}

/** A condition on a partial answer: true, false, or null when it reads an axis the answer does not name yet. */
export function holds(c: Condition | null | undefined, a: Joint): boolean | null {
  if (typeof c === "boolean") return c;
  if (!c || typeof c !== "object") return null;
  if (c.axis !== undefined) {
    const held = a[c.axis];
    if (!held) return null;
    if (c.is !== undefined) return held.includes(c.is);
    if (c.missing_or !== undefined) return held.length === 0 || held.includes(c.missing_or);
    return null;
  }
  if (c.all) {
    const each = c.all.map((x) => holds(x, a));
    if (each.includes(false)) return false;
    return each.every((x) => x === true) ? true : null;
  }
  if (c.any) {
    const each = c.any.map((x) => holds(x, a));
    if (each.includes(true)) return true;
    return each.every((x) => x === false) ? false : null;
  }
  if (c.not !== undefined) {
    const h = holds(c.not, a);
    return h === null ? null : !h;
  }
  return null;
}

/** A condition in words. */
export function conditionWords(c: Condition | null | undefined): string {
  if (typeof c === "boolean") return c ? "always" : "never";
  if (!c) return "";
  if (c.axis !== undefined && c.is !== undefined) return `${c.axis} is ${c.is}`;
  if (c.axis !== undefined && c.missing_or !== undefined) return `${c.axis} is ${c.missing_or} or none`;
  if (c.all) return c.all.map(conditionWords).join(" and ");
  if (c.any) return c.any.map(conditionWords).join(" or ");
  if (c.not !== undefined) return `not ${conditionWords(c.not)}`;
  return "";
}

/**
 * Why the pack forbids an answer, or null while it allows it, as the engine
 * checks it: at most one member of an exclusion group, and what a rule whose
 * condition holds sets. Shown as the person chooses, so a refusal is rare.
 */
export function legalProblem(c: AxesConstraints, joint: Joint): string | null {
  // an axis said to be can't tell names nothing, as an axis not chosen yet
  const a: Joint = Object.fromEntries(Object.entries(joint).filter(([, v]) => !(v.length === 1 && v[0] === CANT_TELL)));
  for (const [axis, groups] of Object.entries(c.groups ?? {})) {
    const held = a[axis];
    if (!held) continue;
    for (const [group, members] of Object.entries(groups)) {
      const both = held.filter((v) => members.includes(v));
      if (both.length > 1) return `${both.join(" and ")} are in the exclusion group ${group} of ${axis}, and at most one of them holds`;
    }
  }
  for (const imp of c.implications ?? []) {
    if (holds(imp.when, a) !== true) continue;
    for (const t of imp.then) {
      if (t.when !== undefined && t.when !== null && holds(t.when, a) !== true) continue;
      const held = a[t.axis];
      if (!held) continue;
      if (!held.includes(t.value)) return `the pack's rule ${imp.rule ?? ""} sets ${t.axis} to ${t.value} when ${conditionWords(imp.when)}, and the answer says ${t.axis} is ${held.length === 0 ? "nothing" : held.join(", ")}`.replace("rule  sets", "rule sets");
    }
  }
  return null;
}

/** What a form still needs, in words, or null when it fits the schema. */
export function formProblem(schema: FormSchema | undefined, form: Json): string | null {
  const props = schema?.properties ?? {};
  for (const name of schema?.required ?? []) {
    const v = form[name];
    if (v === undefined || v === null || v === "") return `${name}`;
  }
  for (const [name, f] of Object.entries(props)) {
    const v = form[name];
    if (v === undefined || v === null || v === "") continue;
    if (f.enum && !f.enum.map(String).includes(String(v))) return `${name} as one of its values`;
    if ((f.type === "integer" && !Number.isInteger(v)) || (f.type === "number" && typeof v !== "number")) return `${name} as a number`;
  }
  return null;
}

/** A form's fields in order, each with how it is asked. */
export function formFields(schema: FormSchema | undefined): { name: string; field: FormField; required: boolean }[] {
  const req = new Set(schema?.required ?? []);
  return Object.entries(schema?.properties ?? {}).map(([name, field]) => ({ name, field, required: req.has(name) }));
}

/**
 * An axes answer as an object. The engine takes the joint answer as an
 * object and keeps it as one text, which is what the answers door and an
 * item's outcome give back; both read here.
 */
export function jointValue(v: unknown): Json | null {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Json;
  if (typeof v === "string" && v.startsWith("{")) {
    try {
      const o = JSON.parse(v) as unknown;
      return o && typeof o === "object" && !Array.isArray(o) ? (o as Json) : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** An answer's value in words: a value, the stacks, a form's fields, a file. */
export function answerWords(a: Pick<Answer, "value" | "form" | "derivative_id">): string {
  if (a.derivative_id !== null && a.derivative_id !== undefined) return `file ${a.derivative_id}${a.form ? ` · ${formWords(a.form)}` : ""}`;
  if (a.form) return formWords(a.form);
  const v = jointValue(a.value) ?? a.value;
  if (v === undefined) return "(not shown at this detail)";
  if (Array.isArray(v)) return `stacks ${v.join(", ")}`;
  if (v && typeof v === "object")
    return Object.entries(v as Json)
      .map(([k, x]) => `${k} ${Array.isArray(x) ? x.join("+") || "none" : x === null ? "none" : x === CANT_TELL ? "can't tell" : String(x)}`)
      .join(" · ");
  return String(v);
}

const formWords = (f: Json) =>
  Object.entries(f)
    .map(([k, v]) => `${k} ${String(v)}`)
    .join(" · ");

/** Where the raters of one item differ, for the adjudicator: each distinct answer with who gave it. */
export function disagreement(answers: Answer[], item: number, round?: number): { words: string; who: string[] }[] {
  const mine = answers.filter((a) => a.item_id === item && a.role === "rater" && (round === undefined || a.round < round));
  const by = new Map<string, string[]>();
  for (const a of mine) {
    const w = answerWords(a);
    by.set(w, [...(by.get(w) ?? []), a.principal]);
  }
  return [...by.entries()].map(([words, who]) => ({ words, who }));
}

/** The keys that pick a value: `1` to `0` on the first row, `q` to `p` on the second (v0's keys). */
export const ROW_KEYS = ["1234567890", "qwertyuiop"];

/** The keys that choose a shown candidate in the reader (record 48): the bottom row, left hand, never a value key. */
export const CANDIDATE_KEYS = "zxcv";

/**
 * The keys that say "can't tell" on an axes question's rows (record 48), one
 * per row: the home row from the left, less `s` (give back) and `h` (the
 * whole header, or the evidence), so `a` on the first row, `d` on the second, then `f`, `g`, `j`,
 * `k` and `l`. Pressed again it clears.
 */
export const CANT_TELL_KEYS = "adfgjkl";

/** The key that marks the answer unsure, for a second look (record 48). */
export const UNSURE_KEY = "m";

/** The key that says can't tell on a row, or null past the last. */
export const cantTellKeyOf = (row: number): string | null => CANT_TELL_KEYS[row] ?? null;

/** The value a key picks on a row of values, or null. */
export function keyValue(key: string, row: number, values: string[]): string | null {
  const keys = ROW_KEYS[row];
  if (!keys) return null;
  const i = keys.indexOf(key.toLowerCase());
  return i >= 0 && i < values.length ? values[i] : null;
}

/** The key that picks the nth value on a row, or null past ten. */
export function keyOf(row: number, i: number): string | null {
  return ROW_KEYS[row]?.[i] ?? null;
}

/** Seconds a lease has left, never below zero. */
export function leaseLeft(a: Pick<Assignment, "lease_until"> | null, now = Date.now()): number | null {
  if (!a?.lease_until) return null;
  return Math.max(0, Math.round((Date.parse(a.lease_until) - now) / 1000));
}

export function leaseWords(seconds: number | null): string {
  if (seconds === null) return "";
  if (seconds <= 0) return "the lease has ended";
  if (seconds < 90) return `${seconds} s left on the lease`;
  return `${Math.round(seconds / 60)} min left on the lease`;
}

/** How often the heartbeat asks after a lease: a third of it, between 15 s and a minute. */
export function beatEvery(leaseSeconds: number): number {
  return Math.min(60, Math.max(15, Math.floor(leaseSeconds / 3))) * 1000;
}

/** A refusal in the engine's words, with what to do. */
export function refused(e: unknown): string {
  if (e instanceof DoorError) {
    const said = typeof e.body.error === "string" ? e.body.error : e.message;
    if (e.status === 403) return `Not yours: ${said}.`;
    if (e.status === 409) return `Refused: ${said}.`;
    return said;
  }
  return e instanceof Error ? e.message : String(e);
}

/** The place an item is: its stack, or its session. */
export function itemWords(i: Item): string {
  if (i.stack_id !== null && i.stack_id !== undefined) return `stack ${i.stack_id}`;
  if (i.subject_id !== null && i.subject_id !== undefined && i.session_day) return `subject ${i.subject_id} · ${i.session_day}`;
  return i.key ?? `item ${i.id}`;
}
