// SPDX-License-Identifier: AGPL-3.0-only
// The sections of the desk that are being built back, offered once an install
// is set up, each where the engine serves the door it reads and the person
// holds the grant that opens it (Wave 5 section 6.2, record 25). Until each is
// built, its page says what it will do. Each unfolds its pages in the side as
// the 2026-10-09 design lists them, a page only where its view is built, the
// engine serves what it reads and the grants allow it.

import type { Capabilities } from "../capabilities";
import { door } from "../deployment";
import { may, type Grant } from "../grants";
import { href } from "../routes";
import type { SidePage } from "../sections";
import type { IconName } from "../ui/Icon";

export interface Placeholder {
  id: string;
  title: string;
  icon: IconName;
  /** The grant that opens the section. */
  grant: Grant;
  door: string;
  words: string;
  /** Built back: the section renders its own page, not this placeholder. */
  built?: boolean;
  /** The pages unfolded under the section in the side, for these capabilities and grants. */
  pages?: (caps: Capabilities) => SidePage[];
}

/** A page of the side, by the word its address names past the section. */
const page = (id: string, title: string, more: Partial<SidePage> = {}): SidePage => ({ id, title, depth: 1, ...more });

// Left out until their views are built: Models' Checks (a check is recorded
// on a model's own page), and Pipelines' Runs and Plans (a run's and a plan's
// own pages are opened from the catalog). Data's Pseudonyms holds what spans
// datasets; a dataset's own pseudonymisation is a step of it, opened in place.
export const PLACEHOLDERS: Placeholder[] = [
  {
    id: "query",
    title: "Query",
    icon: "search",
    grant: "query:see",
    door: "POST /api/ask/run",
    words: "Narrow the registry to what you need, step by step or in words, and keep every version of it as a card.",
    built: true,
    // the saved selections where the engine lists them, as the page's own chips (query/selections.ts)
    pages: (caps) => [page("cards", "Cards", { to: href("query") }), ...(door(caps, "GET /api/ask/selections") ? [page("selections", "Selections")] : [])],
  },
  {
    id: "data",
    title: "Data",
    icon: "data",
    grant: "data:see",
    door: "GET /api/sources",
    words: "The datasets, where the files come from, and the cohorts, groups of subjects from any dataset, on one page.",
    built: true,
    pages: (caps) => [page("datasets", "Datasets and cohorts"), ...(door(caps, "GET /api/linkage/types") ? [page("pseudonyms", "Pseudonyms")] : [])],
  },
  {
    id: "review",
    title: "Review",
    icon: "review",
    grant: "review:see",
    door: "GET /api/review",
    words: "What needs a reviewer's judgement: a scan the rules could not place, a subject to confirm.",
    built: true,
    // the queue answers Questions, with what models proposed and what System 1 asks under it
    pages: () => [page("questions", "Questions", { to: href("review") }), page("picks", "Main scans"), page("identifiers", "Subjects"), page("rules", "Rules")],
  },
  {
    id: "campaigns",
    title: "Campaigns",
    icon: "users",
    grant: "campaigns:see",
    door: "GET /api/campaigns",
    words: "One question asked of many items, rated, adjudicated, closed into decisions.",
    built: true,
    // the label sets where the engine lists them, as the page's own tabs (campaigns/parts.tsx)
    pages: (caps) => [page("campaigns", "Campaigns", { to: href("campaigns") }), ...(door(caps, "GET /api/label-sets") ? [page("label-sets", "Label sets")] : [])],
  },
  {
    id: "models",
    title: "Models",
    icon: "chip",
    grant: "models:see",
    door: "GET /api/models",
    words: "The registered models by task: one promoted per slot, each admitted by a check first.",
    built: true,
    pages: () => [page("by-task", "By task", { to: href("models") })],
  },
  {
    id: "release",
    title: "Release",
    icon: "release",
    grant: "release:see",
    door: "POST /api/releases",
    words: "Hand results out as a release, a BIDS tree or a table, written to an export place.",
    built: true,
    // New release only to whoever may make one, as the page offers its button (ops/ReleasePage.tsx)
    pages: (caps) => [page("releases", "Releases", { to: href("release") }), ...(may(caps, "release:work") ? [page("new", "New release")] : [])],
  },
  {
    id: "pipelines",
    title: "Pipelines",
    icon: "branch",
    grant: "pipelines:see",
    door: "GET /api/jobs",
    words: "The jobs that ran and are running: digests, backups and releases.",
    built: true,
    // the catalog where the engine serves it; a run's and a plan's own pages, opened from it, keep it marked
    pages: (caps) => [page("now", "Running now", { to: href("pipelines") }), ...(door(caps, "GET /api/pipelines") ? [page("catalog", "Catalog", { also: ["runs", "plan"] })] : [])],
  },
];
