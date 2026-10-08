// SPDX-License-Identifier: AGPL-3.0-only
// "Pick main scans" (Wave 7a, H2 round 3: no command line inside a flow):
// the pick run for one cohort or one dataset, queued as a job by the engine's
// own door, wherever picks matter.

import { door } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";

export interface PickRunQueued {
  job: number;
  state: string;
  /** cohort:NAME, dataset:NAME or registry. */
  for: string;
  command: string[];
}

export const pickRun = {
  start: (body: { cohort: string } | { dataset: string }, pack?: string | null) => door<PickRunQueued>("POST", "/api/picks/run", { ...body, ...(pack ? { pack } : {}) }),
};

/** Whether this person may start a pick run here: pipelines work, and the door served. */
export function mayPick(caps: Capabilities): boolean {
  return may(caps, "pipelines:work") && served(caps, "POST /api/picks/run");
}

/** What a queued run says, in one line. */
export function pickWords(q: PickRunQueued): string {
  return `Picking main scans (job ${q.job}).`;
}
