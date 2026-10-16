// SPDX-License-Identifier: AGPL-3.0-only
// Sorting the scans again under the rules now in force (gate T31, walkthrough
// step 9.5). A rules release changes what the engine sorts from now on; what
// is stored changes only when the scans are sorted again. The engine's
// `classify`, queued at the jobs door as Read new files queues it, judges
// every scan the pack covers when it is given no scope. Pure: the dialog on
// the Parts page draws these.

import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";
import type { Summary } from "../objects/client";

const n = (v: number) => v.toLocaleString("en-US");

/** The rules a sort again is under: the pack, how its rules are called and the version in force. */
export interface SortUnder {
  pack: string;
  title: string;
  version: string | null;
}

/** Why the person may not sort the scans again, in words, or null when they may: the engine queues a sort for work on Pipelines. */
export function sortAgainRefusal(caps: Capabilities): string | null {
  if (!served(caps, "POST /api/jobs")) return "This engine queues no jobs.";
  return may(caps, "pipelines:work") ? null : "Sorting the scans again needs work on the Pipelines page.";
}

/** The command and the name of the job: every scan, under one pack, the job named for the pack and its version. */
export function sortAgainCommand(pack: string, version: string | null): { command: string[]; name: string } {
  const name = version ? `pack-${pack}-${version}` : `pack-${pack}`;
  return { command: ["classify", "--pack", pack, "--name", name], name };
}

/** What the registry holds that a sort again would judge: its scans, and those last sorted under a version no pack in force has. Null where the summary says nothing. */
export interface Scans {
  total: number;
  /** Scans sorted under a version other than those in force; null where the summary does not count them by version. */
  older: number | null;
}

/** The scans from the summary, against the pack versions in force. */
export function scansOf(summary: Pick<Summary, "stacks">, inForce: readonly string[]): Scans {
  const by = summary.stacks.by_pack_version;
  const older = by ? Object.entries(by).reduce((sum, [version, count]) => (inForce.includes(version) ? sum : sum + count), 0) : null;
  return { total: summary.stacks.total, older };
}

/** What a sort again will do, before it runs: every scan, and how many were sorted under other rules. */
export function sortAgainWords(title: string, version: string | null, scans: Scans | null): string[] {
  const under = version ? `${title} ${version}` : title;
  if (scans === null) return [`Sorts every scan again under ${under}.`];
  const out = [`Sorts all ${n(scans.total)} ${scans.total === 1 ? "scan" : "scans"} again under ${under}.`];
  if (scans.older !== null && scans.total > 0) out.push(scans.older > 0 ? `${n(scans.older)} ${scans.older === 1 ? "was" : "were"} sorted under other rules.` : `All were sorted under ${version ?? "these rules"} already.`);
  return out;
}

/** What a sort again leaves alone and what it asks, on hover. */
export const SORT_AGAIN_HINT = "It replaces the rules' stored answers with the answers of the rules now in force. What people decided stays, and Review is asked where the rules now answer a scan differently from what the person saw.";
