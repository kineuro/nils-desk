// SPDX-License-Identifier: AGPL-3.0-only
// A campaign's pages, inside Review since Wave 7a (record 45 S3, study A3;
// record 55 H3: Review and Campaigns are one list of work, review/WorkPage).
// Addresses:
//   #review/campaigns                  Review's one list (?make=selection|handle|review&from= opens the make dialog)
//   #review/campaigns/<id>             one campaign
//   #review/campaigns/<id>/rate        the rating workspace (?alone=1 the items read one by one, ?amend=<answer> one's own answer to correct)
//   #review/campaigns/<id>/adjudicate  the adjudicator's view
//   #review/campaigns/<id>/settle      an A/B campaign's items settled blind (record 48, the reference read by judges)
//   #review/campaigns/<id>/pairs       a pair campaign read two stacks at a time (the post-contrast study, pair mode; ?amend=<answer> one's own answer to correct)
//   #review/campaigns/<id>/anchored    an anchored campaign: a candidate read beside a reference pre and a reference post (?amend=<answer> likewise)
//   #review/campaigns/<id>/gallery     a hundred items of a one-axis campaign at once (record 50)
//   #review/campaigns/<id>/check       a check's results read one at a time (job type 3, record 55 H3; ?as=adjudicator settles, ?amend=<answer> likewise)
//   #review/campaigns?make=check       New check, from its run chooser (&run=<id> filled for that run)
//   #review/label-sets[/<n>]           the label sets, or one
// An address of the old Campaigns section (#campaigns...) leads here (routes.ts, fromCampaigns).

import type { Capabilities } from "../capabilities";
import { CampaignPage } from "./CampaignPage";
import { LabelSetPage, LabelSetsPage } from "./LabelSets";
import { Gallery } from "./Gallery";
import { Workspace } from "./Workspace";
import { AbReader } from "./AbReader";
import { PairReader } from "./PairReader";
import { AnchoredReader } from "./AnchoredReader";
import { CheckReader } from "./CheckReader";
import "./campaigns.css";

/** One campaign's page, or the reader its view names. */
export function CampaignPages({ caps, id: page, view: arg, query }: { caps: Capabilities; id: string; view: string | null; query?: Record<string, string> }) {
  if (arg === "rate") return <Workspace key={`${page}/rate/${query?.amend ?? ""}/${query?.alone ?? ""}`} caps={caps} id={page} role="rater" query={query} />;
  if (arg === "settle") return <AbReader key={`${page}/settle`} caps={caps} id={page} />;
  if (arg === "pairs") return <PairReader key={`${page}/pairs/${query?.amend ?? ""}`} caps={caps} id={page} query={query} />;
  if (arg === "anchored") return <AnchoredReader key={`${page}/anchored/${query?.amend ?? ""}`} caps={caps} id={page} query={query} />;
  if (arg === "check") return <CheckReader key={`${page}/check/${query?.amend ?? ""}/${query?.as ?? ""}`} caps={caps} id={page} query={query} role={query?.as === "adjudicator" ? "adjudicator" : "rater"} />;
  if (arg === "adjudicate") return <Workspace key={`${page}/adj`} caps={caps} id={page} role="adjudicator" />;
  if (arg === "gallery") return <Gallery key={`${page}/gallery`} caps={caps} id={page} />;
  return <CampaignPage caps={caps} id={page} missing={query?.missing && /^\d+$/u.test(query.missing) ? Number(query.missing) : null} />;
}

/** The label sets, or one. */
export function LabelSetPages({ caps, id }: { caps: Capabilities; id: string | null }) {
  return id && /^\d+$/u.test(id) ? <LabelSetPage caps={caps} id={Number(id)} /> : <LabelSetsPage caps={caps} />;
}

