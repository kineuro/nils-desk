// SPDX-License-Identifier: AGPL-3.0-only
// The Data page never shows the engine's own words (Nima, 2026-10-09: the
// desk is an app, not a weblog). A refusal the desk knows becomes one short
// plain line; what the engine said stays behind a "?".

import { DoorError } from "../ask/client";
import { messageOf } from "../settings/common";

/** One plain line and the engine's own words for the "?". */
export interface Plain {
  words: string;
  detail: string;
}

/** The refusals the desk knows, first match wins: what the engine says, and the line shown. */
const KNOWN: { test: RegExp; words: string }[] = [
  { test: /does not say what PatientID|does not say how its subjects|PatientID holds/i, words: "Set the IDs first." },
  { test: /structure is unknown|is undeclared|entries beside derivatives|say which tree/i, words: "Sort the files first." },
  { test: /originals.*pseudonymiser alone|in a dataset's originals/i, words: "Pseudonymise it first." },
  { test: /not a registered ingest location|is not registered|not read yet|which is not read|is not read:/i, words: "This dataset is not ready to read yet." },
  { test: /already (running|queued)|is running/i, words: "This is already running." },
];

/** A refusal, an error or the engine's words, as the Data page says it; `otherwise` where the desk does not know it. */
export function plainError(e: unknown, otherwise = "That did not work."): Plain {
  const detail = messageOf(e);
  const status = e instanceof DoorError ? e.status : null;
  const known = KNOWN.find((k) => k.test.test(detail));
  if (known) return { words: known.words, detail };
  if (status === 401 || status === 403) return { words: "You may not do this.", detail };
  if (status === null && /fetch|network|load failed/i.test(detail)) return { words: "NILS did not answer. Try again.", detail };
  return { words: otherwise, detail };
}
