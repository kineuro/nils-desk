// SPDX-License-Identifier: AGPL-3.0-only
// "Ask people about these" (record 45 S7): a campaign made from the Review
// filter a person is looking at. The campaign pages are the Campaigns
// section's (record 45 S3); Review only links to its maker with the filter,
// through the one address the maker is opened by (makeHref in
// campaigns/client.ts):
//
//   #campaigns?make=review&from=<kind, or a prefix ending in : . or *>
//
// with, each optional, `job=<id>` (only items a job raised), `limit=<n>`
// (at most this many items) and `cohort=<name>` (what the queue was narrowed
// to, which the maker shows and the engine's source does not take). The maker
// turns the kind or prefix, the job and the limit into the campaign's source
// `{review: {kind | kind_prefix, job_id?, limit?}}` as the campaign door takes it.

import { makeHref } from "../campaigns/client";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";
import { PLACEHOLDERS } from "../home/placeholders";

export interface ReviewFilter {
  kind?: string;
  kind_prefix?: string;
  job?: number | null;
  limit?: number | null;
  cohort?: string | null;
}

/** The address of the campaign maker, filled from a Review filter: a kind as it is, a prefix marked as one. */
export function askPeopleHref(f: ReviewFilter): string {
  const prefix = f.kind_prefix ?? "";
  const from = f.kind ?? (prefix === "" || /[*.:]$/u.test(prefix) ? prefix : `${prefix}*`);
  return makeHref("review", from, { job: f.job, limit: f.limit, cohort: f.cohort });
}

/** Whether the link leads anywhere: the Campaigns section is built into this desk, the engine makes campaigns, and the person may. */
export function asksPeople(caps: Capabilities): boolean {
  return PLACEHOLDERS.some((p) => p.id === "campaigns" && p.built === true) && served(caps, "POST /api/campaigns") && may(caps, "campaigns:work");
}
