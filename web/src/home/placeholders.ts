// SPDX-License-Identifier: AGPL-3.0-only
// The sections of the desk that are being built back, offered once an install
// is set up, each where the engine serves the door it reads and the person
// holds the grant that opens it (Wave 5 section 6.2, record 25). Until each is
// built, its page says what it will do. Each unfolds its pages in the side as
// the 2026-10-09 design lists them, a page only where its view is built, the
// engine serves what it reads and the grants allow it.

import type { Capabilities } from "../capabilities";
import { door } from "../deployment";
import { may, mayAny, type Grant } from "../grants";
import { logsOffered } from "../ops/logs";
import { href } from "../routes";
import type { SidePage } from "../sections";
import type { IconName } from "../ui/Icon";

export interface Placeholder {
  id: string;
  title: string;
  icon: IconName;
  /** The grant that opens the section, or the grants any one of which does (record 55 H2: a section whose pages carry their own grants opens for any of them). */
  grant: Grant | readonly Grant[];
  /** The door the section reads, or the doors any one of which it reads. */
  door: string | readonly string[];
  words: string;
  /** Built back: the section renders its own page, not this placeholder. */
  built?: boolean;
  /** The pages unfolded under the section in the side, for these capabilities and grants. */
  pages?: (caps: Capabilities) => SidePage[];
}

/** A page of the side, by the word its address names past the section. */
const page = (id: string, title: string, more: Partial<SidePage> = {}): SidePage => ({ id, title, depth: 1, ...more });

// Left out until their views are built: Pipelines' Runs and Plans (a run's
// and a plan's own pages are opened from the catalog). Models is a page of
// Pipelines since Wave 7a (spec section 13.1), and a check is recorded on a
// model's own page. Data's Pseudonyms holds what spans
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
    // the saved selections where the engine lists them, as the page's own chips (query/selections.ts);
    // the kept results to save as files where the engine lists them (spec 13.1: Query is Cards, Selections, Exports)
    pages: (caps) => [
      page("cards", "Cards", { to: href("query") }),
      ...(door(caps, "GET /api/ask/selections") ? [page("selections", "Selections")] : []),
      ...(door(caps, "GET /api/ask/handles") ? [page("exports", "Exports")] : []),
    ],
  },
  {
    id: "data",
    title: "Data",
    icon: "data",
    grant: "data:see",
    door: "GET /api/sources",
    words: "The datasets, where the files come from, and the cohorts, groups of subjects from any dataset, on one page.",
    built: true,
    // Browse where the engine serves the registry's subjects (Wave 7a, spec 13.1): subjects, then sessions, then scans
    pages: (caps) => [
      page("datasets", "Datasets and cohorts"),
      ...(door(caps, "GET /api/subjects") && door(caps, "GET /api/scans") ? [page("browse", "Browse")] : []),
      ...(door(caps, "GET /api/linkage/types") ? [page("pseudonyms", "Pseudonyms")] : []),
    ],
  },
  {
    id: "review",
    title: "Review",
    icon: "review",
    // Wave 7a, H3 (spec 13.1 and 13.2): Review and Campaigns are one section, one list of work.
    // A person who holds only campaigns:* (a rater) finds their campaigns and no queue, rules or identifiers.
    grant: ["review:see", "campaigns:see"],
    door: ["GET /api/review", "GET /api/campaigns"],
    words: "One list of work: what the machine asks, and the campaigns people read.",
    built: true,
    pages: (caps) => reviewPages(caps),
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
    // record 55 H2, round 4: the kept session schemes where the engine lists them
    pages: (caps) => [
      page("releases", "Releases", { to: href("release") }),
      ...(may(caps, "release:work") ? [page("new", "New release")] : []),
      ...(door(caps, "GET /api/session-schemes") ? [page("schemes", "Session schemes")] : []),
    ],
  },
  {
    id: "pipelines",
    title: "Pipelines",
    icon: "branch",
    // Models is a page here (spec section 13.1): the section opens for pipelines:see or models:see
    grant: ["pipelines:see", "models:see"],
    door: ["GET /api/jobs", "GET /api/models"],
    words: "The jobs that ran and are running, the pipelines that can run, and the models that answer each task.",
    built: true,
    // the catalog where the engine serves it; a run's and a plan's own pages, opened from it, keep it marked;
    // record 55 H2, round 5: the jobs' logs where the engine keeps them (ops/logs.ts);
    // Models where the engine lists models (spec section 13.1), each page by its own grant
    pages: (caps) => [
      ...(may(caps, "pipelines:see") && door(caps, "GET /api/jobs") ? [page("jobs", "Jobs", { to: href("pipelines") })] : []),
      ...(may(caps, "pipelines:see") && door(caps, "GET /api/pipelines") ? [page("catalog", "Catalog", { also: ["plan"] })] : []),
      // spec 13.1: the runs are a page of their own, and a run's page keeps it marked
      ...(may(caps, "pipelines:see") && door(caps, "GET /api/pipelines") && door(caps, "GET /api/pipeline-runs") ? [page("runs", "Runs")] : []),
      ...(may(caps, "pipelines:see") && logsOffered(caps) ? [page("logs", "Logs")] : []),
      ...(may(caps, "models:see") && door(caps, "GET /api/models") ? [page("models", "Models")] : []),
    ],
  },
];

/** Whether the person holds the grant, or one of the grants, that opens a section. */
export function holds(caps: Capabilities, grant: Grant | readonly Grant[]): boolean {
  return typeof grant === "string" ? may(caps, grant) : mayAny(caps, ...grant);
}

/** Whether the engine serves the door, or one of the doors, a section reads. */
export function serves(caps: Capabilities, doors: string | readonly string[]): boolean {
  return typeof doors === "string" ? door(caps, doors) : doors.some((d) => door(caps, d));
}

/**
 * Review's pages in the side, each under its own grant (record 55 H2 and
 * H3): the one list of work for anyone who reviews or reads a campaign
 * (the queue and a campaign opened from it keep it marked); Main scans,
 * Subjects and Rules for a reviewer; the label sets for a reader of
 * campaigns where the engine lists them.
 */
export function reviewPages(caps: Capabilities): SidePage[] {
  const out: SidePage[] = [];
  if (reviews(caps) || readsCampaigns(caps)) out.push(page("work", "Work", { to: href("review"), also: ["questions", "campaigns"] }));
  if (reviews(caps)) out.push(page("picks", "Main scans"), page("identifiers", "Subjects"), page("rules", "Rules"));
  // record 55 D3 and D7: the rounds and their blind audits
  if (reviews(caps) && door(caps, "GET /api/review/rounds")) out.push(page("rounds", "Rounds"));
  if (readsCampaigns(caps) && door(caps, "GET /api/label-sets")) out.push(page("label-sets", "Label sets"));
  return out;
}

/** Whether the person works the machine's queue: the grant and the door. */
export const reviews = (caps: Capabilities): boolean => may(caps, "review:see") && door(caps, "GET /api/review");

/** Whether the person reads campaigns: the grant and the door. */
export const readsCampaigns = (caps: Capabilities): boolean => may(caps, "campaigns:see") && door(caps, "GET /api/campaigns");
