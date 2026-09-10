// SPDX-License-Identifier: AGPL-3.0-only
// Review's pure parts (Wave 5 section 8.2): items sorted by what they cost
// if wrong, which items need looking at, and the plan of a bulk decision,
// which writes one audit row per item and is refused for an item that needs
// reading.

import type { ReviewItem } from "../ops/client";

/** The kind's two halves: an engine stage `<area>.<what>`, or the classifier's `<axis>:<reason>`. */
export function kindOf(kind: string): { area: string; what: string; classifier: boolean } {
  const m = /^([a-z_]+)[.:]([a-z_]+)$/.exec(kind);
  if (!m) return { area: kind, what: "", classifier: false };
  return { area: m[1], what: m[2], classifier: kind.includes(":") };
}

const SCOPE_WEIGHT: Record<string, number> = { subject: 5, study: 4, batch: 4, run: 3, series: 2, stack: 1 };

/** What an item costs if decided wrong: identity first, then a vote the pack could not settle, low confidence, a missing axis, a recorded decision; wider scope and more members cost more. */
export function costOf(item: ReviewItem): number {
  const k = kindOf(item.kind);
  let base = 1;
  if (k.area === "identity" || k.area === "linkage") base = 100;
  else if (k.classifier && k.what === "vote") base = 60;
  else if (k.classifier && k.what === "low_confidence") base = 40;
  else if (k.classifier && k.what === "missing") base = 20;
  else if (k.classifier && k.what === "decision") base = 10;
  else base = 30;
  const members = typeof item.members === "number" ? item.members : Array.isArray(item.members) ? item.members.length : 1;
  return base * (SCOPE_WEIGHT[item.scope] ?? 1) + Math.min(members, 500);
}

/** Open items first, then by cost, then older first. */
export function sortByCost(items: ReviewItem[]): ReviewItem[] {
  return [...items].sort((a, b) => {
    if (a.status !== b.status) return a.status === "open" ? -1 : 1;
    const c = costOf(b) - costOf(a);
    if (c !== 0) return c;
    return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
  });
}

/** An item that needs looking at: an identity or linkage question, a vote the pack could not settle, or a low-confidence call; never decided in bulk. */
export function needsReading(item: ReviewItem): string | null {
  const k = kindOf(item.kind);
  if (k.area === "identity" || k.area === "linkage") return "an identity question is read, never bulk-accepted";
  if (k.classifier && k.what === "vote") return "the pack's rules disagreed; someone looks";
  if (k.classifier && k.what === "low_confidence") return "the pack was not confident; someone looks";
  return null;
}

/** The plan of a bulk accept: what will be accepted, one audit row each, and what is refused with its reason. */
export function bulkPlan(items: ReviewItem[], selected: number[]): { accepts: ReviewItem[]; refused: { item: ReviewItem; why: string }[]; stacks: number } {
  const chosen = items.filter((i) => selected.includes(i.id));
  const accepts: ReviewItem[] = [];
  const refused: { item: ReviewItem; why: string }[] = [];
  for (const i of chosen) {
    if (i.status !== "open") {
      refused.push({ item: i, why: "already decided" });
      continue;
    }
    const why = needsReading(i);
    if (why) refused.push({ item: i, why });
    else accepts.push(i);
  }
  const stacks = accepts.reduce((n, i) => n + (typeof i.members === "number" ? i.members : Array.isArray(i.members) ? i.members.length : 1), 0);
  return { accepts, refused, stacks };
}

/** The words for a kind on a row. */
export function kindWords(kind: string): string {
  const k = kindOf(kind);
  if (k.classifier) {
    const reason: Record<string, string> = { low_confidence: "not confident", missing: "no value", decision: "decision", vote: "rules disagree" };
    return `${k.area}: ${reason[k.what] ?? k.what}`;
  }
  return k.what ? `${k.area} ${k.what.replace(/_/g, " ")}` : kind;
}
