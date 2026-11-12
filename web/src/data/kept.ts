// SPDX-License-Identifier: AGPL-3.0-only
// What the Data page read last, kept between visits (2026-11-12). The page
// held its two lists and every dataset's summary in its own state, so each
// arrival waited for the datasets (up to 10 s on a large registry), the
// cohorts (3 s) and one summary a dataset before it drew anything. It now
// draws what it read last at once and reads all three again behind; only the
// first visit in a browser tab waits. Kept for the person they were read for
// and for what that person may read, in memory, for the life of the tab.

import type { Capabilities } from "../capabilities";
import { shelf } from "../ui/kept";
import type { Cohort } from "./cohorts";
import type { Dataset } from "./datasets";
import { isPending, type CountProgress, type DatasetSummary, type SummaryAnswer } from "./summary";

/** The one key of a door that answers a whole list. */
export const LIST = "list";

/** What was read of one dataset's summary: its summary, and how far its first count has got while the engine answers without counts. */
export interface KeptSummary {
  sum: DatasetSummary | null;
  first: CountProgress | null;
}

/** The datasets as last listed, under `LIST`. */
export const sourcesKept = shelf<Dataset[]>();
/** The cohorts not retired as last listed, under `LIST`. */
export const cohortsKept = shelf<Cohort[]>();
/** Each dataset's summary as last read, by the dataset's name. */
export const summariesKept = shelf<KeptSummary>();

/**
 * Who the page's reads are kept for: the person, and everything that decides
 * what they may read. A person signing out or in loads the document anew,
 * which lets go of everything kept; this is for what changes while the tab
 * stays, a grant given or taken, another account in the same session.
 */
export function whoOf(caps: Capabilities): string {
  const sorted = (v: readonly string[] | undefined) => [...(v ?? [])].sort();
  const p: Capabilities["person"] | null = caps.person ?? null;
  return JSON.stringify([
    caps.desk.mode,
    caps.desk.signed_in,
    p?.subject ?? null,
    p?.detail ?? null,
    sorted(p?.grants),
    sorted(p?.groups),
    caps.engine?.principal ?? null,
    caps.engine?.detail ?? null,
    sorted(caps.engine?.grants),
  ]);
}

/** The page taken up for this person: what was kept for anyone else is let go. */
export function takeData(who: string): void {
  sourcesKept.take(who);
  cohortsKept.take(who);
  summariesKept.take(who);
}

/** Keep a summary's answer; one of a dataset the kept list no longer names is let go, as the page lets go of its read. */
export function keepSummary(who: string, name: string, sent: number, answer: SummaryAnswer): void {
  const list = sourcesKept.get(who)[LIST];
  if (list && !list.some((d) => d.name === name)) return;
  // 2026-11-05: a dataset never counted is answered with how far its first count has got, beside the summary it had, if any
  const value: KeptSummary = isPending(answer) ? { sum: summariesKept.get(who)[name]?.sum ?? null, first: answer.count } : { sum: answer, first: null };
  summariesKept.land(who, name, sent, value);
}

/** Everything let go, for a test that starts as a new tab does. */
export function forgetData(): void {
  sourcesKept.forget();
  cohortsKept.forget();
  summariesKept.forget();
}
