// SPDX-License-Identifier: AGPL-3.0-only
// The queue's filters (record 51, G4): by axis and by reason, as v0's axes QC
// filtered by axis and flag type. Since Review round 1 (record 56 section
// 6.3, DR4) no chips offer them: the sort's questions are answered as a grid
// above the list, and an address that names a filter (a link from the list
// of work) still narrows the list under them. The kinds come from what the engine lists
// (`<axis>:<reason>` for the classifier's questions, `pick.border` for a pick
// run's doubts, narrowed by the border's reasons), and the filter lives in the
// page's address, so a reload or a link keeps it:
//
//   #review/questions?axis=base&reason=conflict
//   #review/questions?reason=pick.border&border=too_close
//
// "Ask people about these" carries it to the campaign maker as the source the
// campaign door takes, a kind (`--review-kind base:conflict`) or a prefix
// (`--review-prefix base:`). A reason alone across every axis is neither, so
// it is not carried.

import type { Json } from "../ask/client";
import type { ReviewItem } from "../ops/client";
import { href, narrow } from "../routes";
import type { ReviewFilter } from "./askPeople";
import { borderWords, PICK_BORDER } from "./picks";
import { kindOf } from "./triage";

export interface QueueFilter {
  axis: string | null;
  reason: string | null;
  /** A pick border's reason, with the reason `pick.border` only. */
  border: string | null;
}

export const NO_FILTER: QueueFilter = { axis: null, reason: null, border: null };

/** The classifier's reasons the queue filters by, in the order the page offers them. */
export const REASONS = ["missing", "conflict", "low_confidence", "vote", "decision", "model"] as const;

const REASON_WORDS: Record<string, string> = {
  missing: "no value",
  conflict: "rules conflict",
  low_confidence: "not confident",
  vote: "vote split",
  decision: "a decision disagrees",
  model: "a model proposes",
  disagree: "the rules and System 1 disagree",
  unsure: "System 1 is not sure",
  [PICK_BORDER]: "pick borders",
};

/** A reason in words, as its chip says it. */
export const reasonWords = (r: string) => REASON_WORDS[r] ?? r.replace(/_/g, " ");

const word = (v: string | undefined) => (v && /^[a-z_.]+$/.test(v) ? v : null);

/** The filter an address names; anything it does not know is left out. */
export function queueFilterOf(query: Record<string, string> | undefined): QueueFilter {
  const reason = word(query?.reason);
  const known = reason === PICK_BORDER || (reason !== null && (REASONS as readonly string[]).includes(reason)) ? reason : null;
  return {
    axis: known === PICK_BORDER ? null : word(query?.axis),
    reason: known,
    border: known === PICK_BORDER ? word(query?.border) : null,
  };
}

/** The queue's address with a filter, the cohort it was narrowed to, and the dataset it was opened for (a dataset's card's Review), which a filter keeps. */
export function queueHref(f: QueueFilter, cohort = "", dataset = ""): string {
  return narrow(href("review", "questions"), { dataset, cohort, axis: f.axis, reason: f.reason, border: f.border });
}

/** The classifier's axis and reason of a kind, or null for a kind that is not one of the classifier's questions. */
function classifierKind(kind: string): { axis: string; reason: string } | null {
  const k = kindOf(kind);
  return k.classifier && (REASONS as readonly string[]).includes(k.what) ? { axis: k.area, reason: k.what } : null;
}

/** Whether an item passes the filter. */
export function passes(item: ReviewItem, f: QueueFilter): boolean {
  if (f.reason === PICK_BORDER) {
    if (item.kind !== PICK_BORDER) return false;
    const borders = ((item.evidence ?? {}) as Json).borders;
    return f.border === null || (Array.isArray(borders) && borders.map(String).includes(f.border));
  }
  if (f.axis === null && f.reason === null) return true;
  const c = classifierKind(item.kind);
  if (!c) return false;
  return (f.axis === null || c.axis === f.axis) && (f.reason === null || c.reason === f.reason);
}

/** What the filter is as the engine's list door and the campaign maker take it: one kind, a prefix, or neither. */
export function filterKind(f: QueueFilter): Pick<ReviewFilter, "kind" | "kind_prefix"> | null {
  if (f.reason === PICK_BORDER) return { kind: PICK_BORDER };
  if (f.axis && f.reason) return { kind: `${f.axis}:${f.reason}` };
  if (f.axis) return { kind_prefix: `${f.axis}:` };
  return null;
}

/** The filter in words, for the table's head. */
export function filterWords(f: QueueFilter): string | null {
  if (f.reason === PICK_BORDER) return f.border ? `pick borders: ${borderWords({ borders: [f.border] })}` : "pick borders";
  if (f.axis && f.reason) return `${f.axis}: ${reasonWords(f.reason)}`;
  if (f.axis) return `every ${f.axis} question`;
  if (f.reason) return `${reasonWords(f.reason)}, on every axis`;
  return null;
}
