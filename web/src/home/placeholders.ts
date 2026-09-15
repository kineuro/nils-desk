// SPDX-License-Identifier: AGPL-3.0-only
// The sections of the desk that are being built back, offered once an install
// is set up, each where the engine serves the door it reads and the person
// holds the grant that opens it (Wave 5 section 6.2, record 25). Until each is
// built, its page says what it will do.

import type { Grant } from "../grants";
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
}

export const PLACEHOLDERS: Placeholder[] = [
  { id: "query", title: "Query", icon: "search", grant: "query:see", door: "POST /api/ask/run", words: "Narrow the registry to what you need, step by step or in words, and keep every version of it as a card.", built: true },
  { id: "data", title: "Data", icon: "data", grant: "data:see", door: "GET /api/sources", words: "The sources, each with its digests and how what comes in is handled.", built: true },
  { id: "review", title: "Review", icon: "review", grant: "review:see", door: "GET /api/review", words: "What needs a person's judgement: a scan the rules could not place, a subject to confirm." },
  { id: "release", title: "Release", icon: "release", grant: "release:see", door: "POST /api/releases", words: "Hand results out as a release, a BIDS tree or a table, written to an export place." },
  { id: "pipelines", title: "Pipelines", icon: "branch", grant: "pipelines:see", door: "GET /api/jobs", words: "The jobs that ran and are running: digests, backups and releases.", built: true },
];
