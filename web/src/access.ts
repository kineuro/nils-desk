// SPDX-License-Identifier: AGPL-3.0-only
// What a control needs that a person does not hold, in words (record 25). A
// control whose door the engine would refuse is not offered, and in its place
// the page says which page's work it needs, never a grant as the parts spell
// it.

import type { Capabilities } from "./capabilities";
import { may, type Grant } from "./grants";

/** A page's work a control needs: the grant, and the page as a person reads it. */
export type Work = [grant: Grant, page: string];

/**
 * Why a control is not offered to this person, in words, or null when it is:
 * `doing` needs work on every one of `pages`, and where it needs more than one
 * the words name those this person has no work on.
 */
export function needsWork(caps: Capabilities, doing: string, pages: Work[]): string | null {
  const missing = pages.filter(([grant]) => !may(caps, grant)).map(([, page]) => page);
  if (missing.length === 0) return null;
  const all = pages.map(([, page]) => page);
  if (all.length === 1) return `${doing} needs work on ${all[0]}.`;
  return `${doing} needs work on ${all.join(" and on ")}; this account has no work on ${missing.join(" or on ")}.`;
}
