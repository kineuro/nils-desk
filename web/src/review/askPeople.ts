// SPDX-License-Identifier: AGPL-3.0-only
// "Ask people about these" (record 45 S7): a campaign made from the Review
// filter a person is looking at. The campaign pages are the Campaigns
// section's (record 45 S3); Review only links to its maker with the filter.
//
// The address, agreed with the Campaigns section's maker:
//
//   #campaigns/new?from=review&kind=<kind>
//   #campaigns/new?from=review&kind_prefix=<prefix>
//
// with, each optional, `job=<id>` (only items a job raised), `limit=<n>`
// (at most this many items) and `cohort=<name>` (what the queue was narrowed
// to, which the maker shows and the engine's source does not take). The maker
// turns kind, kind_prefix, job and limit into the campaign's source
// `{review: {kind | kind_prefix, job_id?, limit?}}` as the campaign door takes it.

import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";
import { PLACEHOLDERS } from "../home/placeholders";
import { href, narrow } from "../routes";

export interface ReviewFilter {
  kind?: string;
  kind_prefix?: string;
  job?: number | null;
  limit?: number | null;
  cohort?: string | null;
}

/** The address of the campaign maker, filled from a Review filter. */
export function askPeopleHref(f: ReviewFilter): string {
  return narrow(href("campaigns", "new"), { from: "review", kind: f.kind, kind_prefix: f.kind ? undefined : f.kind_prefix, job: f.job ?? undefined, limit: f.limit ?? undefined, cohort: f.cohort ?? undefined });
}

/** Whether the link leads anywhere: the Campaigns section is built into this desk, the engine makes campaigns, and the person may. */
export function asksPeople(caps: Capabilities): boolean {
  return PLACEHOLDERS.some((p) => p.id === "campaigns" && p.built === true) && served(caps, "POST /api/campaigns") && may(caps, "campaigns:work");
}
