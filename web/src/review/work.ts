// SPDX-License-Identifier: AGPL-3.0-only
// Review's one list of work (Wave 7a, record 55 H3; spec 13.2): the
// machine's open questions, grouped by kind with their counts, and the
// campaigns with their state and the person's own share, side by side under
// the job types a person does. A queue is worked by one person, item by
// item; a campaign by several readers, blind, with their agreement
// measured; both are rows here, each with the one act that starts it. The
// list is built from the doors that exist (the review summary, the
// campaigns list and each campaign's mine door); nothing here decides.

import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";
import { href, narrow } from "../routes";
import { adjudicatorHas, itemTotal, ownCampaign, purposeOf, questionWords, rateRefusal, type Campaign } from "../campaigns/client";
import type { ReviewSummary } from "./client";
import { REASONS, queueHref, reasonWords } from "./filter";
import { kindOf, kindWords } from "./triage";
import { PICK_BORDER } from "./picks";

/** The job types a person does in 7a; drawing a mask (type 4) is Wave 7b's and has no row. */
export type Job = "answer" | "pick" | "check" | "settle" | "audit";

export const JOBS: { job: Job; title: string; line: string }[] = [
  { job: "answer", title: "Answer a question", line: "An axis, several axes, a form, a pair." },
  { job: "pick", title: "Pick a main scan", line: "The stack that stands for a role." },
  { job: "check", title: "Check a result", line: "Accept, reject or flag a pipeline's output." },
  { job: "settle", title: "Settle a disagreement", line: "Two answers side by side." },
  // record 55 D7: a round's blind audit, read by agent raters; shown only while one is open
  { job: "audit", title: "Audit", line: "Blind reads of accepted scans. Never trains." },
];

/** One row of the list: a kind of the machine's questions, or a campaign, with the act that starts it. */
export interface WorkRow {
  key: string;
  job: Job;
  /** The machine's questions are worked alone; a campaign by its readers; an adjudication by its adjudicator. */
  from: "machine" | "campaign" | "adjudication";
  title: string;
  /** A few words under the title. */
  what: string;
  /** How many wait: the open questions of the kind, a campaign's open items, the items to adjudicate. */
  count: number | null;
  href: string;
  /** The act's word; null where the row is only opened. */
  act: string | null;
  campaign?: Campaign;
}

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

/** The reasons of the sort's own questions about one axis (record 56), each answered in a question's grid. */
const SORT_WHY: readonly string[] = ["missing", "disagree", "unsure", "decision", "conflict", "low_confidence"];

/** The row of one kind of the machine's open questions: its job, its words and where it is worked. */
export function machineRow(kind: string, count: number): WorkRow | null {
  if (heldKind(kind) || count <= 0) return null;
  const k = kindOf(kind);
  const base = { key: `kind:${kind}`, from: "machine" as const, count };
  if (kind === PICK_BORDER) return { ...base, job: "pick", title: "Pick borders", what: "Occasions a pick run doubts.", href: narrow(href("review", "picks"), { earlier: 1 }), act: "Open" };
  if (kind === "classify.asked") return { ...base, job: "answer", title: "System 1 asks", what: "Legal candidates for a whole stack.", href: href("review", "asked"), act: "Open" };
  if (kind === "pipeline:qc") return { ...base, job: "check", title: "A run's checks", what: "Units a pipeline's own checks flagged.", href: href("review", "questions"), act: "Open" };
  if (k.classifier && k.what === "model") return { ...base, job: "answer", title: `${k.area}: a model proposes`, what: "Staged until a person commits them.", href: href("review", "proposals"), act: "Open" };
  // record 56 section 6.3: the sort's own questions are answered as a question's grid, from the list of them
  if (k.classifier && SORT_WHY.includes(k.what)) return { ...base, job: "answer", title: `${k.area}: ${reasonWords(k.what)}`, what: "Scans the rules left to a person.", href: href("review", "questions"), act: "Answer" };
  if (k.classifier && (REASONS as readonly string[]).includes(k.what)) return { ...base, job: "answer", title: `${k.area}: ${reasonWords(k.what)}`, what: "Scans the rules left to a person.", href: queueHref({ axis: k.area, reason: k.what, border: null }), act: "Answer" };
  if (k.area === "identity" || k.area === "linkage") return { ...base, job: "answer", title: `Subjects: ${k.what.replace(/_/gu, " ")}`, what: "Who a file is about.", href: href("review", "identifiers"), act: "Decide" };
  if (k.area === "session") return { ...base, job: "answer", title: `Sessions: ${k.what.replace(/_/gu, " ")}`, what: "Sessions that moved between visits.", href: href("review", "questions"), act: "See" };
  return { ...base, job: "answer", title: kindWords(kind), what: "Waiting in the queue.", href: href("review", "questions"), act: "Open" };
}

/** The machine's rows, the most waiting first within each job. */
export function machineRows(summary: ReviewSummary | null): WorkRow[] {
  return Object.entries(summary?.by_kind ?? {})
    .map(([kind, count]) => machineRow(kind, count))
    .filter((r): r is WorkRow => r !== null)
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0) || a.title.localeCompare(b.title));
}

/** An A/B campaign (record 48): its source names its voters. */
export const isAb = (c: Pick<Campaign, "source">): boolean => typeof (c.source as { ab?: unknown }).ab === "object" && (c.source as { ab?: unknown }).ab !== null;

/** The job a campaign's readers do, by its question. */
export function jobOf(c: Pick<Campaign, "question" | "source" | "purpose">): Job {
  if (purposeOf(c) === "audit") return "audit";
  if (isAb(c)) return "settle";
  if (c.question.kind === "check") return "check";
  if (c.question.kind === "pick") return "pick";
  return "answer";
}

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

/** A campaign's rows: its reading, where the person may claim an item, and its adjudication, where an item waits for them. */
export function campaignRows(caps: Capabilities, c: Campaign): WorkRow[] {
  const open = c.counts.items.open ?? 0;
  const r = readerOf(c);
  const reads = rateRefusal(caps, c) === null && open > 0;
  const total = itemTotal(c.counts);
  const rows: WorkRow[] = [
    {
      key: `campaign:${c.id}`,
      job: jobOf(c),
      from: "campaign",
      title: c.name,
      what: purposeOf(c) === "decide" ? questionWords(c.question) : `${questionWords(c.question)} · ${purposeOf(c) === "audit" ? "audit, never trains" : `${purposeOf(c)}, blind first`}`,
      count: c.status === "open" ? open : total,
      href: reads ? href("review", "campaigns", String(c.id), r.view) : href("review", "campaigns", String(c.id)),
      act: reads ? r.act : "Open",
      campaign: c,
    },
  ];
  if (adjudicatorHas(caps, c)) {
    const n = c.counts.items.needs_adjudication ?? 0;
    rows.push({
      key: `adjudicate:${c.id}`,
      job: "settle",
      from: "adjudication",
      title: c.name,
      what: `${n.toLocaleString("en-US")} to adjudicate`,
      count: n,
      href: c.question.kind === "check" ? narrow(href("review", "campaigns", String(c.id), "check"), { as: "adjudicator" }) : href("review", "campaigns", String(c.id), "adjudicate"),
      act: "Adjudicate",
      campaign: c,
    });
  }
  return rows;
}

/** Main scans' standing row under Pick, for a person who may open the page: the picks of every dataset and cohort. */
export function mainScansRow(caps: Capabilities): WorkRow | null {
  if (!may(caps, "review:see") || !served(caps, "GET /api/picks/rules")) return null;
  return { key: "main-scans", job: "pick", from: "machine", title: "Main scans", what: "Each dataset's and cohort's picks, by their rules.", count: null, href: href("review", "picks"), act: "Open" };
}

/** The whole list, by job, in the order of JOBS: the machine's rows first, then the campaigns, the most waiting first. */
export function workList(caps: Capabilities, summary: ReviewSummary | null, list: readonly Campaign[] | null): { job: Job; title: string; line: string; rows: WorkRow[]; waiting: number }[] {
  const open = (list ?? []).filter((c) => c.status !== "closed" && theirs(caps, c));
  const machine = may(caps, "review:see") ? machineRows(summary) : [];
  const ms = mainScansRow(caps);
  const campaigns = open.flatMap((c) => campaignRows(caps, c)).sort((a, b) => (b.count ?? 0) - (a.count ?? 0) || a.title.localeCompare(b.title));
  return JOBS.filter((j) => j.job !== "audit" || campaigns.some((r) => r.job === "audit")).map((j) => {
    const rows = [...machine.filter((r) => r.job === j.job), ...(ms && j.job === "pick" ? [ms] : []), ...campaigns.filter((r) => r.job === j.job)];
    const waiting = rows.reduce((s, r) => s + (r.from === "campaign" && r.campaign?.status !== "open" ? 0 : (r.count ?? 0)), 0);
    return { ...j, rows, waiting };
  });
}

/** The person's own share of a campaign, in words: their answers standing, of the items it holds. */
export function shareWords(mine: number | null | undefined, c: Pick<Campaign, "counts">): string | null {
  if (mine === null || mine === undefined) return null;
  const total = itemTotal(c.counts);
  return mine === 0 ? "none yours yet" : `${mine.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} yours`;
}
