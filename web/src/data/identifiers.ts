// SPDX-License-Identifier: AGPL-3.0-only
// A subject's identifiers at the engine's doors (record 55, ruling 35 (c);
// gate T31, step 8.7): shown by type, their values only with a why and never
// one that reads as a personnummer, two subjects linked and a linkage
// reversed, and identifiers purged with the subject's code typed. Each is an
// admin's act and audited by the engine.

import { door } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may, sees } from "../grants";

export interface ShownIdentifier {
  identity: number;
  id_type: string;
  label: string;
  source: string;
  kept: boolean;
  value?: string;
  shape?: string;
  withheld?: string;
}

export interface ShownLinkage {
  id: number;
  role: "canonical" | "alias";
  other: string;
  evidence: string;
  by: string | null;
  at: string;
  reversed_at: string | null;
  reversed_by: string | null;
}

export interface Shown {
  subject: string;
  merged_into: string | null;
  values: boolean;
  identifiers: ShownIdentifier[];
  by_type: { id_type: string; label: string; count: number; kept: boolean }[];
  shown: number;
  withheld: number;
  linkages: ShownLinkage[];
}

export interface Purge {
  subject: string | null;
  all: boolean;
  identities: number;
  linkages: number;
  confirm?: string;
  job?: number;
}

export const identifiers = {
  show: (subject: string) => door<Shown>("POST", "/api/linkage/show", { subject }),
  values: (subject: string, why: string) => door<Shown>("POST", "/api/linkage/show", { subject, values: true, why }),
  link: (a: string, b: string, evidence: string) => door<{ linkage: number; job: number; state: string }>("POST", "/api/linkage/links", { a, b, evidence }),
  unlink: (id: number) => door<{ linkage: number; reversed: boolean }>("POST", `/api/linkage/links/${id}/unlink`, {}),
  purgeLook: (subject: string | null) => door<Purge>("POST", "/api/linkage/purge", subject === null ? { all: true, dry_run: true } : { subject, dry_run: true }),
  purge: (subject: string | null, confirm: string) => door<Purge>("POST", "/api/linkage/purge", subject === null ? { all: true, confirm } : { subject, confirm }),
};

/** What a purge of every subject is confirmed with, typed. */
export const EVERY_SUBJECT = "every subject";

/** Whether the person may act on identifiers: an admin's, at every detail. */
export function identifiersWork(caps: Capabilities): boolean {
  return served(caps, "POST /api/linkage/show") && may(caps, "data:work") && may(caps, "install:work") && sees(caps, "sensitive");
}

/** What an identifier's value cell says. */
export function valueWords(i: ShownIdentifier, values: boolean): string {
  if (!i.kept) return "never kept";
  if (i.withheld) return `${i.shape ?? ""} · not shown, reads as a personnummer`.trim();
  if (i.value !== undefined) return i.value;
  return values ? "" : "kept";
}

/** Why a why or evidence cannot be sent yet, or null. */
export function reasonRefusal(text: string): string | null {
  return text.trim().length < 4 ? "a reason, a few words, for the audit" : null;
}
