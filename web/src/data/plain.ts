// SPDX-License-Identifier: AGPL-3.0-only
// The Data page never shows the engine's own words (Nima, 2026-10-09: the
// desk is an app, not a weblog). A refusal the desk knows becomes one short
// plain line; what the engine said stays behind a "?".

import { DoorError } from "../ask/client";
import { messageOf } from "../settings/common";
import { failureOf } from "../ops/failure";

/** One plain line and the engine's own words for the "?". */
export interface Plain {
  words: string;
  detail: string;
}

/** The refusals the desk knows, first match wins: what the engine says, and the line shown. */
const KNOWN: { test: RegExp; words: string }[] = [
  // a release naming its subjects by ID types, refused at the release door or its rehearsal: each begins with the engine's own
  // opening, so none of the lines below can take it
  { test: /^the release names its subjects by .* cannot name them all/i, words: "Some subjects cannot be named yet." },
  { test: /^naming subjects by an ID type that identifies a person/i, words: "Naming by this ID type needs someone who may see IDs." },
  { test: /^name by [^:]+: .*never kept, not even sealed/i, words: "This ID type keeps no ID, so it names no subject." },
  { test: /^name by [^:]+: no ID type is named so/i, words: "There is no such ID type." },
  { test: /^name by [^:]+: no subject holds a kept value/i, words: "No subject holds an ID of this type." },
  { test: /^name by [^:]+: the type is in the list twice/i, words: "An ID type is in the list twice." },
  { test: /^name_by is a list of ID type names/i, words: "The ID types to name by could not be read." },
  { test: /^name_choices says which value names a subject, and the release names by no ID type/i, words: "An ID was chosen and no ID type names the subjects." },
  { test: /^name_choices is a list of/i, words: "The chosen IDs could not be read." },
  { test: /^the choice for [^:]+: the release's selection holds no subject with that code/i, words: "An ID was chosen for a subject this release does not hold." },
  { test: /^the choice for [^:]+: two different values were given/i, words: "Two IDs were chosen for one subject." },
  { test: /^the choice for [^:]+: the subject holds no such value/i, words: "A chosen ID is not one the subject holds. Choose again." },
  { test: /^the choice for [^:]+: .*Leave the choice out/i, words: "A subject needs no choice any more. Choose again." },
  // an identified dataset with no identity rule, refused at its declaration, its pseudonymise run or its bring-in: before the lines
  // below, since the engine's words may name PatientID as well
  { test: /\b(no|without an?|needs an?|give (it |the dataset )?an?|set an?|missing) identity rule\b|identity rule (is )?(missing|not set|not given)/i, words: "Say what PatientID holds first." },
  { test: /does not say what PatientID|does not say how its subjects|PatientID holds/i, words: "Set the IDs first." },
  { test: /structure is unknown|is undeclared|entries beside derivatives|say which tree/i, words: "Sort the files first." },
  { test: /originals.*pseudonymiser alone|in a dataset's originals/i, words: "Pseudonymise it first." },
  { test: /not a registered ingest location|is not registered|not read yet|which is not read|is not read:/i, words: "This dataset is not ready to read yet." },
  { test: /already (running|queued)|is running/i, words: "This is already running." },
];

/** A step's run refused at its door (record 56), by the engine's reason and the step: the line shown. */
const STEP_REFUSED: Record<string, (step: string) => string> = {
  running: (step) => (step === "post_contrast" ? "Post-contrast runs already." : step === "sorted" ? "A sort runs already." : "Body part runs already."),
  no_model: (step) => (step === "post_contrast" ? "No post-contrast model is installed." : "No body-part model is installed."),
  no_pipeline: () => "No body-part model is installed.",
  no_runtime: () => "Models cannot run on this machine.",
  no_place: () => "There is no place for a model's results.",
  no_scans: () => "There are no scans to run it over yet.",
  // engine 2026-11-06: a run over the scans without its answer, where none is without it
  none_without: (step) => (step === "sorted" ? "Every scan is sorted already." : "Every scan has its answer already."),
};

/** A refusal the desk has a line for, or null: for a page that says the engine's own words wherever it has none. */
export function knownError(e: unknown): Plain | null {
  const detail = messageOf(e);
  const known = KNOWN.find((k) => k.test.test(detail));
  return known ? { words: known.words, detail } : null;
}

/** A refusal, an error or the engine's words, as the Data page says it; `otherwise` where the desk does not know it. */
export function plainError(e: unknown, otherwise = "That did not work."): Plain {
  const detail = messageOf(e);
  const status = e instanceof DoorError ? e.status : null;
  if (e instanceof DoorError && typeof e.body.reason === "string" && typeof e.body.step === "string") {
    const said = STEP_REFUSED[e.body.reason];
    if (said) return { words: said(e.body.step), detail };
  }
  // 2026-10-12: a run refused for what it needs of this machine says what to do in the engine's words
  const advice = e instanceof DoorError ? failureOf(e.body)?.advice : null;
  if (advice) return { words: advice, detail };
  const known = KNOWN.find((k) => k.test.test(detail));
  if (known) return { words: known.words, detail };
  if (status === 401 || status === 403) return { words: "You may not do this.", detail };
  if (status === null && /fetch|network|load failed/i.test(detail)) return { words: "NILS did not answer. Try again.", detail };
  return { words: otherwise, detail };
}
