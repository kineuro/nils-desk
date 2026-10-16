// SPDX-License-Identifier: AGPL-3.0-only
// Keeping a card (record 55 K6): an assistant's draft is a card on the Cards
// list once a person keeps it, and a kept card goes back among the drafts when
// they put it back. The engine holds the mark on the first version of the card;
// the desk offers the two controls to a person with work on the Query page,
// where the engine serves the door.

import type { Kept } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { whenWords } from "../data/sources";
import { door as served } from "../deployment";
import { may } from "../grants";

/** The engine's door that keeps a card; the one that puts it back is the same path with DELETE. */
export const KEEP_DOOR = "PUT /api/ask/documents/{id}/kept";

/** Whether this person may keep a card or put it back: work on the Query page, and the door served. */
export function mayKeep(caps: Capabilities): boolean {
  return may(caps, "query:work") && served(caps, KEEP_DOOR);
}

/** The engine's word on a card, as a yes or no, and nothing where it has none: a mark of `null` is a draft, an absent one an engine without the mark. */
export function isKept(kept: Kept | null | undefined): boolean | undefined {
  return kept === undefined ? undefined : kept !== null;
}

/** Who kept a card and when, for a tag's hover ("anna, 3 Oct"); nothing where nobody has. */
export function keptWords(kept: Kept | null | undefined): string | undefined {
  return kept ? [kept.by, whenWords(kept.at)].filter(Boolean).join(", ") : undefined;
}
