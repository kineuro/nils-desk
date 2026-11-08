// SPDX-License-Identifier: AGPL-3.0-only
// A campaign's page as an app page (UX round 5, finding 7, 2026-11-08): what
// the campaign asks in a person's words, who reads it, its state as a tone,
// one next action chosen from its state, each item named by its scan and each
// answer as a value word. Pure, so the page and its tests read the same words.

import type { Capabilities } from "../capabilities";
import { ANCHORED_WORDS, anchoredServed, isAnchored } from "./anchored";
import { abServed, isAb } from "./ab";
import { isCheck } from "./check";
import { adjudicatorHas, CANT_TELL, closeRefusal, itemTotal, principalOf, questionWords, rateRefusal, type Campaign, type Item, type Question } from "./client";
import { ANSWER_WORDS as PAIR_WORDS, isPair, pairServed } from "./pair";
import { nameOf, namesWords } from "./people";
import { closeStage } from "./upkeep";

const n = (v: number) => v.toLocaleString("en-US");

/** An axis in a person's words: body_part is "body part". */
export const axisWords = (axis: string) => axis.replace(/_/gu, " ");

/** What the campaign asks, as a person would say it. */
export function askWords(q: Question): string {
  switch (q.kind) {
    case "anchored":
      return "Is the scan like the pre or the post?";
    case "pair":
      return "Which of the two is the post?";
    case "ab":
      return "Which reading is right, A or B?";
    case "axis":
      return `What is each scan's ${axisWords(q.axis ?? "value")}?`;
    case "axes": {
      const axes = (q.axes ?? []).map(axisWords);
      if (axes.length === 0) return "What is each scan, on several axes?";
      if (axes.length === 1) return `What is each scan's ${axes[0]}?`;
      return `What are each scan's ${axes.slice(0, -1).join(", ")} and ${axes[axes.length - 1]}?`;
    }
    case "pick":
      return `Which stack is the ${q.role ?? "one asked for"}?`;
    case "form":
      return "Fill in a form for each scan.";
    case "derivative":
      return "Give a file for each scan.";
    case "free":
      return "Say in words what each scan is.";
    case "check":
      return "Is each result right?";
    default:
      return questionWords(q);
  }
}

/** Who reads the campaign, in a person's words: "you read them", "Rune reads them", "Rune and Bo read them", "3 raters", or that anyone with work on Campaigns does. */
export function readersWords(caps: Capabilities, c: Pick<Campaign, "rater_policy">, names: ReadonlyMap<string, string>): string {
  const raters = c.rater_policy.raters;
  if (raters.length === 0) return "anyone with work on Campaigns reads them";
  const me = principalOf(caps);
  if (raters.length === 1) return raters[0] === me ? "you read them" : `${nameOf(names, raters[0]).name} reads them`;
  if (raters.length > 3) return `${raters.length} raters`;
  const others = raters.filter((r) => r !== me);
  if (others.length === raters.length) return `${namesWords(names, raters)} read them`;
  return `you and ${namesWords(names, others)} read them`;
}

/** The head's one line: what it asks, the engine's words of the question, how many items, who reads them. */
export function ledeWords(caps: Capabilities, c: Campaign, names: ReadonlyMap<string, string>): string {
  const total = itemTotal(c.counts);
  const noun = c.grain === "session" ? (total === 1 ? "session" : "sessions") : total === 1 ? "scan" : "scans";
  return [askWords(c.question), questionWords(c.question), `${n(total)} ${noun}`, readersWords(caps, c, names)].join(" · ");
}

/** The page's tone, told by the head's border: a campaign being read is the brand's, one closing or stopped part way the caution's, a closed one quiet. */
export function headTone(c: Pick<Campaign, "status"> & { close_job?: Campaign["close_job"] }): "brand" | "caution" | "neutral" {
  if (c.status === "closing") return "caution";
  if (c.status === "closed") return "neutral";
  return "brand";
}

/** The one next action, and how the page does it. */
export type NextAct =
  | { kind: "read"; words: string; href: string }
  | { kind: "settle"; words: string; href: string }
  | { kind: "close"; words: string }
  | { kind: "close-again"; words: string }
  | { kind: "results"; words: string }
  | { kind: "none" };

/**
 * The one next action chosen from the campaign's state (the Review page's
 * rule: one obvious act): items the person may read, "Read the N left" (an
 * A/B campaign is settled, "Settle the N"); items waiting for them as
 * adjudicator, "Settle the N"; nothing left and open, "Close"; a close that
 * stopped part way, "Run the close again"; closed, "Results" where the
 * person may read them. A check (job type 3) keeps its own head, and a
 * close running has no act: the page follows it.
 */
export function nextAct(caps: Capabilities, c: Campaign, opts: { results: boolean; href: (...parts: string[]) => string }): NextAct {
  const stage = closeStage(c);
  if (stage === "running") return { kind: "none" };
  if (stage === "stopped") return closeRefusal(caps, c) === null ? { kind: "close-again", words: "Run the close again" } : { kind: "none" };
  if (isCheck(c)) return { kind: "none" };
  const open = c.counts.items.open ?? 0;
  const id = String(c.id);
  if (c.status === "open" && open > 0 && rateRefusal(caps, c) === null) {
    if (isAb(c) && abServed(caps)) return { kind: "settle", words: `Settle the ${n(open)}`, href: opts.href("review", "campaigns", id, "settle") };
    const view = isPair(c) && pairServed(caps) ? "pairs" : isAnchored(c) && anchoredServed(caps) ? "anchored" : "rate";
    return { kind: "read", words: `Read the ${n(open)} left`, href: opts.href("review", "campaigns", id, view) };
  }
  if (c.status === "open" && adjudicatorHas(caps, c)) {
    const k = c.counts.items.needs_adjudication ?? 0;
    return { kind: "settle", words: `Settle the ${n(k)}`, href: opts.href("review", "campaigns", id, "adjudicate") };
  }
  if (c.status === "open") return closeRefusal(caps, c) === null ? { kind: "close", words: "Close" } : { kind: "none" };
  if (c.status === "closed" && opts.results) return { kind: "results", words: "Results" };
  return { kind: "none" };
}

/** A scan's name where a door gave it: its series description, with the subject code where one is known. */
export interface ScanName {
  description: string | null;
  code: string | null;
}

/**
 * An item named by its scan, as the grid's cards are: the series description
 * and the subject code where the page read them, else "scan N of the
 * campaign" (a session's item, "session N"), with the engine's words on hover.
 */
export function itemName(i: Item, c: Pick<Campaign, "grain">, scan: ScanName | null = null): { name: string; title: string } {
  const engine = i.stack_id !== null && i.stack_id !== undefined ? `stack ${i.stack_id}` : i.subject_id !== null && i.subject_id !== undefined && i.session_day ? `subject ${i.subject_id} · ${i.session_day}` : (i.key ?? `item ${i.id}`);
  if (scan && (scan.description || scan.code)) return { name: [scan.description, scan.code].filter(Boolean).join(" · "), title: engine };
  const noun = c.grain === "session" ? "session" : "scan";
  return { name: `${noun} ${n(i.position + 1)} of the campaign`, title: engine };
}

/** A value as the value word a person reads: "like the post", "can't tell", the pack's label where the question carries one, else the value itself; nothing for no value. */
export function valueWord(c: Pick<Campaign, "question">, value: unknown, axis: string | null = null): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value !== "string") return String(value);
  if (value === CANT_TELL) return "can't tell";
  if (c.question.kind === "anchored" && value in ANCHORED_WORDS) return ANCHORED_WORDS[value as keyof typeof ANCHORED_WORDS];
  if (c.question.kind === "pair" && value in PAIR_WORDS) return PAIR_WORDS[value as keyof typeof PAIR_WORDS];
  const key = axis ?? c.question.axis ?? null;
  const label = key ? c.question.vocabulary?.[key]?.[value]?.label?.trim() : undefined;
  return label || value;
}

/**
 * An answer's value in a person's words: one value as its word, several axes
 * as "body part brain · region head", a list joined, nothing for null; a form,
 * a file or the stacks of a pick as the engine's words give them.
 */
export function answerValueWords(c: Pick<Campaign, "question">, value: unknown, fallback: () => string): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return valueWord(c, value);
  if (Array.isArray(value)) return value.every((v) => typeof v === "string") ? value.map((v) => valueWord(c, v)).join(", ") : fallback();
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.every(([, v]) => v === null || typeof v === "string" || (Array.isArray(v) && v.every((x) => typeof x === "string")))) {
      return entries
        .filter(([, v]) => v !== null && v !== "")
        .map(([axis, v]) => `${axisWords(axis)} ${Array.isArray(v) ? v.map((x) => valueWord(c, x, axis)).join("+") || "none" : valueWord(c, v, axis)}`)
        .join(" · ");
    }
  }
  return fallback();
}
