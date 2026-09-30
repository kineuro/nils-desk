// SPDX-License-Identifier: AGPL-3.0-only
// The queue's filters (record 51, G4): by axis and by reason, as v0's axes QC
// filtered by axis and flag type. The kinds come from what the engine lists
// (`<axis>:<reason>` for the classifier's questions, `pick.border` for a pick
// run's doubts, narrowed by the border's reasons), and the filter lives in the
// page's address, so a reload or a link keeps it:
//
//   #review?axis=base&reason=conflict
//   #review?reason=pick.border&border=too_close
//
// "Ask people about these" carries it to the campaign maker as the source the
// campaign door takes, a kind (`--review-kind base:conflict`) or a prefix
// (`--review-prefix base:`). A reason alone across every axis is neither, so
// it is not carried.

import type { Json } from "../ask/client";
import type { ReviewItem } from "../ops/client";
import { href, narrow } from "../routes";
import type { ReviewSummary } from "./client";
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

/** The queue's address with a filter and the cohort it was narrowed to. */
export function queueHref(f: QueueFilter, cohort = ""): string {
  return narrow(href("review"), { cohort, axis: f.axis, reason: f.reason, border: f.border });
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

/** The chips the queue offers, from the kinds the engine lists (the summary's where it gives one) and the pick borders among the items read. */
export function filterChoices(summary: ReviewSummary | null, items: ReviewItem[]): { axes: string[]; reasons: string[]; borders: string[] } {
  const kinds = summary ? Object.keys(summary.by_kind) : [...new Set(items.filter((i) => i.status === "open").map((i) => i.kind))];
  const axes = new Set<string>();
  const reasons = new Set<string>();
  for (const kind of kinds) {
    const c = classifierKind(kind);
    if (c) {
      axes.add(c.axis);
      reasons.add(c.reason);
    }
  }
  const borders = new Set<string>();
  for (const i of items) {
    if (i.kind !== PICK_BORDER) continue;
    const b = ((i.evidence ?? {}) as Json).borders;
    if (Array.isArray(b)) for (const r of b) borders.add(String(r));
  }
  const ordered: string[] = REASONS.filter((r) => reasons.has(r));
  if (kinds.includes(PICK_BORDER) || borders.size > 0) ordered.push(PICK_BORDER);
  return { axes: [...axes].sort(), reasons: ordered, borders: [...borders].sort() };
}

/** The filter in words, for the table's head. */
export function filterWords(f: QueueFilter): string | null {
  if (f.reason === PICK_BORDER) return f.border ? `pick borders: ${borderWords({ borders: [f.border] })}` : "pick borders";
  if (f.axis && f.reason) return `${f.axis}: ${reasonWords(f.reason)}`;
  if (f.axis) return `every ${f.axis} question`;
  if (f.reason) return `${reasonWords(f.reason)}, on every axis`;
  return null;
}
