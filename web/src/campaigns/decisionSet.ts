// SPDX-License-Identifier: AGPL-3.0-only
// The decisions in force on an axis, written as a label set (record 42 S7;
// gate T31, walkthrough step 21.3). A campaign's Export writes that campaign's
// labels; this takes what is in force on one axis now, one row for each scan,
// resolved as the classifier resolves them. The engine's door takes more (the
// authors, a selection or a campaign to keep, staged decisions, development
// labels for training); the form takes the axis, the name and the place, and
// the rest stays with the keyboard. Pure: the dialog draws these.

import { door } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may, mayAny } from "../grants";
import type { LabelSet } from "./client";

/** What the door answers: the set, and how many labels a sealed sample kept out where it did. */
export type DecisionSet = LabelSet & { left_out_sealed?: number };

export const decisionSets = {
  write: (body: { axis: string; name?: string; place?: string }) => door<DecisionSet>("POST", "/api/label-sets", body),
};

/** Why the person may not write a label set of decisions, in words, or null when they may: it reads every scan's decisions, so it needs Review beside Campaigns or Review work. */
export function decisionSetRefusal(caps: Capabilities): string | null {
  if (!served(caps, "POST /api/label-sets")) return "This engine has no door for writing a label set.";
  if (!mayAny(caps, "campaigns:work", "review:work")) return "Writing a label set needs work on the Campaigns page or on the Review page.";
  if (!may(caps, "review:see")) return "A label set of decisions reads the decisions of every scan, so it needs the Review page.";
  return null;
}

/** The body of the door: the axis, and the name and the place only where the person chose them. */
export function decisionSetBody(f: { axis: string; name: string; place: string }): { ok: true; body: { axis: string; name?: string; place?: string } } | { ok: false; why: string } {
  const axis = f.axis.trim();
  if (axis === "") return { ok: false, why: "an axis" };
  const name = f.name.trim();
  const place = f.place.trim();
  return { ok: true, body: { axis, ...(name !== "" && name !== axis ? { name } : {}), ...(place !== "" ? { place } : {}) } };
}

/** What the door wrote, in a line; a seal's cost is said where it kept labels out. */
export function decisionSetWords(set: Pick<DecisionSet, "name" | "version" | "rows" | "left_out_sealed">): string {
  const rows = `${set.rows.toLocaleString("en-US")} ${set.rows === 1 ? "row" : "rows"}`;
  const sealed = set.left_out_sealed ?? 0;
  const out = sealed > 0 ? ` ${sealed.toLocaleString("en-US")} ${sealed === 1 ? "label was" : "labels were"} left out: their sample is sealed.` : "";
  return `Wrote ${set.name} v${set.version}: ${rows}.${out}`;
}

/** What the set is, on hover: whose decisions, which, and what is left out. */
export const DECISION_SET_HINT = "One row for each scan: the decision in force on the axis, by whoever made it. A decision not yet committed is left out, and so is a scan of a sealed sample.";
