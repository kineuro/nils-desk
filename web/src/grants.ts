// SPDX-License-Identifier: AGPL-3.0-only
// What a person may open, as grants, and how much of a record they see, as
// detail (record 25; contracts/suite/v2/grants.schema.json). A grant names a
// page and how far a person goes there: see, or work, which includes see; the
// assistant has use. The desk, the engine, Kvasir and the assistant share this
// vocabulary, and each part guards its own doors with it.

import type { Capabilities } from "./capabilities";

export const GRANTS = [
  "assistant-settings:see",
  "assistant-settings:work",
  "assistant:use",
  "audit:see",
  "data:see",
  "data:work",
  "database:see",
  "database:work",
  "identity:see",
  "identity:work",
  "install:see",
  "install:work",
  "kvasir:see",
  "kvasir:work",
  "pipelines:see",
  "pipelines:work",
  "places:see",
  "places:work",
  "query:see",
  "query:work",
  "release:see",
  "release:work",
  "review:see",
  "review:work",
] as const;

export type Grant = (typeof GRANTS)[number];

/** How much of a record a person sees, lowest first. */
export const DETAILS = ["plain", "quasi", "sensitive"] as const;

export type Detail = (typeof DETAILS)[number];

/** A ladder name, as a legacy entitlement or a station's ceiling still names it. */
export type Step = "reader" | "reviewer" | "operator" | "admin";

/** The sets the ladder's names and `assist` stand for (contracts/suite/v2/vectors/grants.json). */
export const SETS: Record<Step | "assist", { grants: Grant[]; detail: Detail }> = {
  reader: { grants: ["data:see", "query:see", "query:work"], detail: "plain" },
  reviewer: { grants: ["data:see", "pipelines:see", "query:see", "query:work", "review:see", "review:work"], detail: "quasi" },
  operator: {
    grants: [
      "assistant-settings:see",
      "data:see",
      "data:work",
      "install:see",
      "kvasir:see",
      "pipelines:see",
      "pipelines:work",
      "places:see",
      "places:work",
      "query:see",
      "query:work",
      "release:see",
      "release:work",
      "review:see",
      "review:work",
    ],
    detail: "sensitive",
  },
  admin: { grants: GRANTS.filter((g) => g !== "assistant:use"), detail: "sensitive" },
  assist: { grants: ["assistant:use"], detail: "plain" },
};

/** Whether a list of grants holds one: work on a page holds see there too. */
export function holdsGrant(have: readonly string[], grant: Grant): boolean {
  if (have.includes(grant)) return true;
  return grant.endsWith(":see") && have.includes(`${grant.slice(0, -":see".length)}:work`);
}

/** Whether the person holds a grant. */
export function may(caps: Capabilities, grant: Grant): boolean {
  return holdsGrant(caps.person.grants, grant);
}

/** Whether the person holds any of the grants. */
export function mayAny(caps: Capabilities, ...grants: Grant[]): boolean {
  return grants.some((g) => may(caps, g));
}

/** Whether the person sees records in at least this detail. */
export function sees(caps: Capabilities, detail: Detail): boolean {
  return DETAILS.indexOf(caps.person.detail) >= DETAILS.indexOf(detail);
}

/** A string the vocabulary knows. */
export function isGrant(s: string): s is Grant {
  return (GRANTS as readonly string[]).includes(s);
}
