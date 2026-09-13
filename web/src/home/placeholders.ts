// SPDX-License-Identifier: AGPL-3.0-only
// The sections of the desk that are being built back, offered once an install
// is set up, each where the engine serves the door it reads and the person
// may open it (Wave 5 section 6.2). Until each is built, its page says what
// it will do.

import type { Entitlement } from "../capabilities";
import type { IconName } from "../ui/Icon";

export interface Placeholder {
  id: string;
  title: string;
  icon: IconName;
  entitlement: Entitlement;
  door: string;
  words: string;
  /** Built back: the section renders its own page, not this placeholder. */
  built?: boolean;
}

export const PLACEHOLDERS: Placeholder[] = [
  { id: "query", title: "Query", icon: "search", entitlement: "reader", door: "POST /api/ask/run", words: "Narrow the registry to what you need, step by step or in words, and keep every version of it as a card.", built: true },
  { id: "data", title: "Data", icon: "data", entitlement: "reader", door: "GET /api/sources", words: "The sources, each with its digests and how what comes in is handled.", built: true },
  { id: "review", title: "Review", icon: "review", entitlement: "reviewer", door: "GET /api/review", words: "What needs a person's judgement: a scan the rules could not place, a subject to confirm." },
  { id: "release", title: "Release", icon: "release", entitlement: "operator", door: "POST /api/releases", words: "Hand results out as a release, a BIDS tree or a table, written to an export place." },
  { id: "pipelines", title: "Pipelines", icon: "branch", entitlement: "reviewer", door: "GET /api/jobs", words: "The jobs that ran and are running: digests, backups and releases." },
];
