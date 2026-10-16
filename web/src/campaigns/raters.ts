// SPDX-License-Identifier: AGPL-3.0-only
// Raters on an open campaign (record 48, after the first gold campaign; gate
// T31, walkthrough step 11.8): people change while a round is open, so the
// campaign's named raters are added to and taken off from its page, through
// the engine's raters door. A rater taken off keeps every answer given and
// gives back a live claim, which the pool offers again. Pure: the dialog
// draws these and the door answers them.

import { door } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";
import { principalOf, type Campaign } from "./client";

export const RATERS_DOOR = "POST /api/campaigns/{id}/raters";

export const raters = {
  /** Add raters to an open campaign that names its raters, or take them off. */
  change: (campaign: number | string, body: { add?: string[]; remove?: string[] }) => door<RatersChanged>("POST", `/api/campaigns/${encodeURIComponent(String(campaign))}/raters`, body),
};

/** A rater added who already answered other campaigns' items on stacks this one asks: how many, where, and the engine's words. */
export interface RaterWarning {
  principal: string;
  stacks: number;
  campaigns: { campaign: string; stacks: number }[];
  why: string;
}

/** What a change of raters did, as the door answers it. */
export interface RatersChanged {
  campaign: number;
  /** Who rates now. */
  raters: string[];
  added: string[];
  removed: string[];
  /** Live claims of those taken off, given back to the pool. */
  released: number;
  warnings: RaterWarning[];
}

/**
 * Why the person may not change this campaign's raters, or null when they may.
 * The door is for the campaign's maker or a holder of review:work who also
 * works on Campaigns; it is refused on a campaign that is not open and on one
 * that names no raters (anyone with work on Campaigns rates it, and naming
 * one would shut out the rest).
 */
export function ratersRefusal(caps: Capabilities, c: Campaign): string | null {
  if (c.status !== "open") return `The campaign is ${c.status}.`;
  if (!served(caps, RATERS_DOOR)) return "This engine has no door for changing raters.";
  if (!may(caps, "campaigns:work")) return "Changing raters needs work on the Campaigns page.";
  if (c.owner !== principalOf(caps) && !may(caps, "review:work")) return "A campaign's raters are its maker's to change, or work on the Review page's.";
  if (c.rater_policy.raters.length === 0) return "It names no raters, so anyone with work on Campaigns rates it.";
  return null;
}

/** What the person chose, as the door takes it: who to add and who to take off, from who rates now and who is to rate. */
export function ratersChange(current: readonly string[], will: readonly string[]): { add: string[]; remove: string[] } {
  return { add: [...new Set(will)].filter((p) => !current.includes(p)), remove: current.filter((p) => !will.includes(p)) };
}

/** The body of the door: only what changes, a list each. */
export function ratersBody(change: { add: string[]; remove: string[] }): { add?: string[]; remove?: string[] } {
  return { ...(change.add.length > 0 ? { add: change.add } : {}), ...(change.remove.length > 0 ? { remove: change.remove } : {}) };
}

/** Why the change cannot be made yet, or null: something changes, and someone is left to rate. */
export function ratersNeeds(current: readonly string[], will: readonly string[]): string | null {
  const change = ratersChange(current, will);
  if (change.add.length === 0 && change.remove.length === 0) return "a rater to add or to take off";
  if (will.length === 0) return "one rater left, or anyone with work on Campaigns would rate it";
  return null;
}

/** What the change will do, before it is made: "Adds maja. Takes off erik: their answers stay and what they hold goes back to the pool." */
export function ratersPlan(current: readonly string[], will: readonly string[], name: (p: string) => string = (p) => p): string | null {
  const { add, remove } = ratersChange(current, will);
  const parts = [add.length > 0 ? `Adds ${add.map(name).join(", ")}.` : null, remove.length > 0 ? `Takes off ${remove.map(name).join(", ")}: their answers stay and what they hold goes back to the pool.` : null].filter((x): x is string => x !== null);
  return parts.length > 0 ? parts.join(" ") : null;
}

/** What the door did, in a line: who was added, who was taken off and what they held, and who rates now. */
export function ratersDone(r: Pick<RatersChanged, "added" | "removed" | "released" | "raters">, name: (p: string) => string = (p) => p): string {
  const parts: string[] = [];
  if (r.added.length > 0) parts.push(`Added ${r.added.map(name).join(", ")}.`);
  if (r.removed.length > 0) {
    const back = r.released > 0 ? `; ${r.released.toLocaleString("en-US")} ${r.released === 1 ? "claim goes" : "claims go"} back to the pool` : "";
    parts.push(`Took off ${r.removed.map(name).join(", ")}${back}.`);
  }
  if (parts.length === 0) parts.push("Nobody changed.");
  return `${parts.join(" ")} Rating now: ${r.raters.map(name).join(", ")}.`;
}
