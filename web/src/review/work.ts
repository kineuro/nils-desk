// SPDX-License-Identifier: AGPL-3.0-only
// Review's first page (Wave 7a, record 55 H3; redesigned 2026-11-08 after
// production use): what the page shows is built here, pure, from the doors
// that exist. Four bands of cards: what models proposed (one card per model
// and axis, from `GET /api/review/proposals`), the scans the rules ask a
// person about (one card per axis, from the questions doors, else from the
// review summary), the campaigns people read (one card each, the person's own
// first), and everything else the summary counts, folded, in a person's words
// with the one place each is worked. Nothing here decides, and no engine word
// (kind, item, staged, queue) reaches the surface.

import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";
import { href, narrow } from "../routes";
import { adjudicatorHas, itemTotal, ownCampaign, purposeOf, questionWords, rateRefusal, type Campaign } from "../campaigns/client";
import { knownToolName } from "../settings/software";
import type { ReviewSummary } from "./client";
import { REASONS, reasonWords } from "./filter";
import { isModelKind, type Standing } from "./modelFamily";
import { PICK_BORDER } from "./picks";
import { gridHref, kindsAnswered, listHref, type QuestionList, type Where } from "./questions";
import { kindOf, kindWords } from "./triage";

const n = (v: number) => v.toLocaleString("en-US");

/** Whether a kind is one a campaign holds (the campaigns family): answered in its campaign, never in the queue. */
export const heldKind = (kind: string): boolean => kind.startsWith("campaign.");

/** How many of the machine's open questions a campaign holds, from the summary. */
export function heldCount(summary: ReviewSummary | null): number {
  return Object.entries(summary?.by_kind ?? {}).reduce((s, [k, v]) => s + (heldKind(k) ? v : 0), 0);
}

/** The queue's own count: every open question but those a campaign holds. */
export function queuedCount(summary: ReviewSummary | null): number {
  return Object.entries(summary?.by_kind ?? {}).reduce((s, [k, v]) => s + (heldKind(k) ? 0 : v), 0);
}

// ------------------------------------------------------------ words

/** An axis as a person names it; an axis the table does not know is its words capitalised. */
const AXIS_TITLES: Record<string, string> = {
  body_part: "Body part",
  post_contrast: "Post-contrast",
  base: "Base",
  technique: "Technique",
  modifier: "Modifier",
  construct: "Construct",
  provenance: "Provenance",
};

export function axisTitle(axis: string): string {
  const known = AXIS_TITLES[axis];
  if (known) return known;
  const words = axis.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A model as a person names it: the friendly name of a NILS model where the software table has one, else its name, then its version. */
export function modelWords(s: Pick<Standing, "model" | "label">): string {
  const name = knownToolName(s.model.name) ?? s.model.name;
  return s.model.version ? `${name} ${s.model.version}` : name;
}

// ------------------------------------------------------------ band 1: proposed by models

/** A card's title: the axis, then the model. */
export function standingTitle(s: Standing): string {
  return `${axisTitle(s.axis)} · ${modelWords(s)}`;
}

/** The words behind "moved on", on hover: the commit dialog's own. */
export const MOVED_ON_WORDS = "Some were proposed before the data changed; committed as proposed.";

/** A card's one line: how many are sure and at what, how many unsure, and what waits elsewhere. */
export function standingMeta(s: Standing): string {
  const parts = [`${n(s.commit.stacks)} sure${s.threshold === null ? "" : ` at ${s.threshold.toFixed(2)} or above`}`, `${n(s.below.stacks)} unsure`];
  if (s.held.stacks > 0) parts.push(`${n(s.held.stacks)} in a campaign already`);
  if (s.drifted > 0) parts.push(`${n(s.drifted)} moved on`);
  return parts.join(" · ");
}

/** The standings as the band orders them: the most proposed first (the door says no time), then by model. */
export function sortStandings(list: readonly Standing[]): Standing[] {
  return [...list].sort((a, b) => b.staged.stacks - a.staged.stacks || a.label.localeCompare(b.label) || a.axis.localeCompare(b.axis));
}

// ------------------------------------------------------------ band 2: scans to answer

/** One axis's card: how many scans wait on it, why, and the one place a person answers them. */
export interface AxisCard {
  axis: string;
  title: string;
  scans: number;
  /** The reasons summed, in the order of their counts. */
  meta: string;
  href: string;
}

/** The reasons of the sort's own questions about one axis (record 56), each answered in a question's grid. */
const SORT_WHY: readonly string[] = ["missing", "disagree", "unsure", "decision", "conflict", "low_confidence"];

/** Whether a kind is one of the sort's questions about an axis: answered in band 2, never in the fold. */
export function axisKind(kind: string): boolean {
  const k = kindOf(kind);
  return k.classifier && !isModelKind(kind) && (k.what === "session" || SORT_WHY.includes(k.what) || (REASONS as readonly string[]).includes(k.what));
}

/** One reason, counted, in a person's words. */
export function reasonLine(reason: string, count: number): string {
  const c = n(count);
  switch (reason) {
    case "missing":
      return `${c} with no value`;
    case "decision":
      return `${c} where a decision disagrees`;
    case "disagree":
      return `${c} where the rules and System 1 disagree`;
    case "unsure":
      return `${c} where System 1 is not sure`;
    case "vote":
      return `${c} where the rules disagree`;
    case "conflict":
      return `${c} where the rules conflict`;
    case "low_confidence":
      return `${c} where the rules are not confident`;
    case "session":
      return `${c} where the session says otherwise`;
    default:
      return `${c} where ${reasonWords(reason)}`;
  }
}

/**
 * Whether the questions door asks a kind of the summary, so the axis cards count it and the fold leaves it out.
 * A new engine says so itself: its summary's `questions` counts every axis the door asks about, and
 * `not_questions` names the classifier kinds it does not. An older engine's summary says nothing, so only a kind
 * the list's questions carry is asked; the rest goes to the fold. A card never counts what its Answer cannot show.
 */
export function askedHere(kind: string, summary: ReviewSummary | null, list: QuestionList | null): boolean {
  if (summary?.questions) {
    const k = kindOf(kind);
    return axisKind(kind) && !(kind in (summary.not_questions ?? {})) && (summary.questions[k.area] ?? 0) > 0;
  }
  return kindsAnswered(list).has(kind);
}

/**
 * The axis cards (UX round 5, 2026-11-08): one card per axis, counting the distinct scans the questions door
 * asks about it. A new engine's summary says that count (`questions`, from the door's own gathering); an older
 * engine's does not, and the list's questions on the axis are summed instead. Never the summary's `by_kind` alone:
 * a kind the door does not ask is the fold's, however the summary counts it. The reasons come from the list's
 * questions on the axis, else from the summary's kinds about it. Answer opens the one question's grid where the
 * axis has one, else the Questions page narrowed to the axis. The most scans first.
 */
export function axisCards(list: QuestionList | null, summary: ReviewSummary | null, where: Where = {}): AxisCard[] {
  const by = new Map<string, { scans: number; reasons: Map<string, number>; keys: string[] }>();
  const axisOf = (axis: string) => {
    let a = by.get(axis);
    if (!a) by.set(axis, (a = { scans: 0, reasons: new Map(), keys: [] }));
    return a;
  };
  const sorted = [...(list?.questions ?? [])].sort((p, q) => q.scans - p.scans);
  for (const q of sorted) {
    const a = axisOf(q.axis);
    a.scans += q.scans;
    a.keys.push(q.key);
    for (const [kind, count] of Object.entries(q.kinds)) {
      const what = kindOf(kind).what;
      a.reasons.set(what, (a.reasons.get(what) ?? 0) + count);
    }
  }
  if (summary?.questions) {
    for (const [axis, scans] of Object.entries(summary.questions)) {
      if (scans <= 0) continue;
      const a = axisOf(axis);
      // the engine's count of distinct scans stands over the list's sum
      a.scans = scans;
      if (a.reasons.size === 0) {
        for (const [kind, count] of Object.entries(summary.by_kind)) {
          const k = kindOf(kind);
          if (count > 0 && k.area === axis && askedHere(kind, summary, list)) a.reasons.set(k.what, (a.reasons.get(k.what) ?? 0) + count);
        }
      }
    }
  }
  return [...by.entries()]
    .filter(([, a]) => a.scans > 0)
    .map(([axis, a]) => {
      const reasons = [...a.reasons.entries()].sort((p, q) => q[1] - p[1]).map(([r, c]) => reasonLine(r, c));
      const to = a.keys.length === 1 ? gridHref(a.keys[0], where) : narrow(listHref(where), { axis });
      return { axis, title: axisTitle(axis), scans: a.scans, meta: reasons.join(" · "), href: to };
    })
    .sort((p, q) => q.scans - p.scans || p.title.localeCompare(q.title));
}

// ------------------------------------------------------------ band 3: campaigns

/** An A/B campaign (record 48): its source names its voters. */
export const isAb = (c: Pick<Campaign, "source">): boolean => typeof (c.source as { ab?: unknown }).ab === "object" && (c.source as { ab?: unknown }).ab !== null;

/** The reader a campaign's items are read in, by its question, and the word of its act. */
export function readerOf(c: Pick<Campaign, "question" | "source">): { view: string; act: string } {
  if (isAb(c)) return { view: "settle", act: "Settle" };
  if (c.question.kind === "check") return { view: "check", act: "Check" };
  if (c.question.kind === "pair") return { view: "pairs", act: "Read" };
  if (c.question.kind === "anchored") return { view: "anchored", act: "Read" };
  return { view: "rate", act: "Rate" };
}

/** Whether a campaign is the person's to see in the list: anyone who reviews sees every one; a rater sees those that are theirs. */
export function theirs(caps: Capabilities, c: Campaign): boolean {
  if (may(caps, "review:see")) return true;
  return ownCampaign(caps, c) || rateRefusal(caps, c) === null || adjudicatorHas(caps, c);
}

/** A campaign's line: its question, and its purpose where it is not to decide. */
export function campaignMeta(c: Pick<Campaign, "question" | "purpose">): string {
  const purpose = purposeOf(c);
  if (purpose === "decide") return questionWords(c.question);
  return `${questionWords(c.question)} · ${purpose === "audit" ? "audit, never trains" : `${purpose}, blind first`}`;
}

/** One campaign card: the campaign's reading, or the adjudication an adjudicator has in it. */
export interface CampaignCard {
  key: string;
  kind: "campaign" | "adjudication";
  campaign: Campaign;
  meta: string;
  /** What the order goes by: the open items, or the items to adjudicate. */
  count: number;
  href: string;
  act: string;
  own: boolean;
}

/** A campaign's cards: its reading, with the act where the person may claim an item, and its adjudication where an item waits for them. */
export function campaignCards(caps: Capabilities, c: Campaign): CampaignCard[] {
  const open = c.counts.items.open ?? 0;
  const r = readerOf(c);
  const reads = rateRefusal(caps, c) === null && open > 0;
  const own = ownCampaign(caps, c);
  const cards: CampaignCard[] = [
    {
      key: `campaign:${c.id}`,
      kind: "campaign",
      campaign: c,
      meta: campaignMeta(c),
      count: open,
      href: reads ? href("review", "campaigns", String(c.id), r.view) : href("review", "campaigns", String(c.id)),
      act: reads ? r.act : "Open",
      own,
    },
  ];
  if (adjudicatorHas(caps, c)) {
    const waiting = c.counts.items.needs_adjudication ?? 0;
    cards.push({
      key: `adjudicate:${c.id}`,
      kind: "adjudication",
      campaign: c,
      meta: `${n(waiting)} to adjudicate`,
      count: waiting,
      href: c.question.kind === "check" ? narrow(href("review", "campaigns", String(c.id), "check"), { as: "adjudicator" }) : href("review", "campaigns", String(c.id), "adjudicate"),
      act: "Adjudicate",
      own: true,
    });
  }
  return cards;
}

/** The band: every open campaign the person may see, the person's own first, then the most open first. */
export function campaignBand(caps: Capabilities, list: readonly Campaign[] | null): CampaignCard[] {
  return (list ?? [])
    .filter((c) => c.status !== "closed" && theirs(caps, c))
    .flatMap((c) => campaignCards(caps, c))
    .sort((a, b) => Number(b.own) - Number(a.own) || b.count - a.count || a.campaign.name.localeCompare(b.campaign.name));
}

/** The person's own share of a campaign, in words: their answers standing, of the items it holds. */
export function shareWords(mine: number | null | undefined, c: Pick<Campaign, "counts">): string | null {
  if (mine === null || mine === undefined) return null;
  const total = itemTotal(c.counts);
  return mine === 0 ? "none yours yet" : `${n(mine)} of ${n(total)} yours`;
}

// ------------------------------------------------------------ band 4: also waiting

/** What else waits, in a person's words, by the summary's kind. */
export function alsoWords(kind: string): string {
  const k = kindOf(kind);
  if (kind === "identity.same_instance") return "The same scan under two subjects";
  if (kind === "identity.collision") return "Two subject codes may be one person";
  if (kind === "identity.empty_study") return "Studies with no files";
  if (kind === "identity.unmapped" || k.area === "linkage") return "Files that need a subject code";
  if (kind === "release.shared_name") return "Files that would share a name in a release";
  if (kind === "release.no_task") return "A release with nothing to do";
  if (kind === "ingest.quarantine") return "Files NILS could not read";
  if (kind === "pipeline:qc") return "Results a run's checks flagged";
  if (kind === "classify.excluded") return "Scans the rules set aside";
  if (kind === "classify.asked") return "What System 1 asks";
  if (kind === PICK_BORDER) return "Occasions a pick run doubts";
  if (isModelKind(kind)) return `${axisTitle(k.area)}: scans a model proposes`;
  if (k.classifier) return `${axisTitle(k.area)}: scans where ${k.what === "session" ? "the session says otherwise" : k.what === "vote" ? "the neighbours vote otherwise" : reasonWords(k.what)}`;
  return kindWords(kind);
}

/** Where one kind of the summary is worked today. */
export function alsoHref(kind: string): string {
  const k = kindOf(kind);
  if (kind === PICK_BORDER) return narrow(href("review", "picks"), { earlier: 1 });
  if (kind === "classify.asked") return href("review", "asked");
  if (isModelKind(kind)) return href("review", "proposals");
  if (k.area === "identity" || k.area === "linkage") return href("review", "identifiers");
  // a classifier question the questions door does not ask is worked in the queue, narrowed to its axis
  if (k.classifier) return narrow(href("review"), { axis: k.area, reason: (REASONS as readonly string[]).includes(k.what) ? k.what : undefined });
  return href("review", "questions");
}

/** One row of the fold: what waits, how many, and where it is worked. */
export interface AlsoRow {
  key: string;
  words: string;
  /** Null for a page with no count of its own (Main scans). */
  count: number | null;
  href: string;
}

/**
 * The fold's rows: every kind of the summary that no band above shows (a campaign's items are answered there,
 * the questions the door asks are band 2, a model's proposals band 1 where the engine counts them), the most
 * first, then Main scans for a person who may open the page. A classifier kind the questions door does not ask
 * (an older engine's session questions, a kind it cannot key) is a row here, in plain words, never a card.
 */
export function alsoRows(caps: Capabilities, summary: ReviewSummary | null, proposals: boolean, list: QuestionList | null = null): AlsoRow[] {
  const rows: AlsoRow[] = Object.entries(summary?.by_kind ?? {})
    .filter(([kind, count]) => count > 0 && !heldKind(kind) && !askedHere(kind, summary, list) && !(proposals && isModelKind(kind)))
    .map(([kind, count]) => ({ key: `kind:${kind}`, words: alsoWords(kind), count, href: alsoHref(kind) }))
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0) || a.words.localeCompare(b.words));
  if (may(caps, "review:see") && served(caps, "GET /api/picks/rules")) rows.push({ key: "main-scans", words: "Main scans · each dataset's and cohort's picks", count: null, href: href("review", "picks") });
  return rows;
}

/** The fold's one line: what it counts. */
export function alsoSummary(rows: readonly AlsoRow[]): string {
  const total = rows.reduce((s, r) => s + (r.count ?? 0), 0);
  return `Also waiting: ${n(total)} subjects, files and checks`;
}
