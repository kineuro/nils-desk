// SPDX-License-Identifier: AGPL-3.0-only
// The Data page's plain words for the engine's refusals (2026-10-09).

import { describe, expect, it } from "vitest";
import { DoorError } from "../ask/client";
import { knownError, plainError } from "./plain";

describe("a refusal in plain words", () => {
  it("maps what the desk knows to one short line and keeps the engine's words for the \"?\"", () => {
    const cases: [unknown, string][] = [
      [new DoorError(400, { error: "@study-big is not a registered ingest location; those are data, data-test" }), "This dataset is not ready to read yet."],
      [new DoorError(409, { error: "/x is in the dataset s, which is not read: it arrives deidentified and does not say what PatientID holds (patient_id: subject-code or id-type:<name>)" }), "Set the IDs first."],
      [new DoorError(409, { error: "/x is in the dataset s, which is undeclared: its structure is unknown" }), "Sort the files first."],
      [new DoorError(409, { error: "/x is in a dataset's originals (derivatives/dcm-original), which the pseudonymiser alone reads" }), "Pseudonymise it first."],
      // an identified dataset declared with no identity rule: the answer is its step's one question, never "Set the IDs"
      [new DoorError(409, { error: "the dataset s holds identified files and has no identity rule: nothing says what PatientID holds, so its originals are not read. Give it one with nils place set 9 --identity FILE or in the desk's Data: a rule whose id_type is personnummer for an ID that is the same everywhere, or the hospital's or study's own type" }), "Say what PatientID holds first."],
      [new DoorError(400, { error: "s holds identified files (derivatives/dcm-original) and nothing says what PatientID holds. Give an identity rule (--identity FILE, or identity in the body): a rule whose id_type is personnummer for an ID that is the same everywhere, or the hospital's or study's own type. Nothing was written" }), "Say what PatientID holds first."],
      // the jobs door's 409 for a pseudonymise run or a bring-in of such a dataset
      [new DoorError(409, { error: "the dataset s holds identified files and has no identity rule: nothing says what PatientID holds, so its originals are not read. Give it one with nils place set N --identity FILE or in the desk's Data: ..." }), "Say what PatientID holds first."],
      // the same refusal in other words is still that refusal
      [new DoorError(400, { error: "an identified dataset needs an identity rule (identity: id_type and from)" }), "Say what PatientID holds first."],
      [new Error("s is identified and its identity rule is missing"), "Say what PatientID holds first."],
      // a rule that is there and broken is not that refusal
      [new DoorError(400, { error: "the identity rule of the dataset s: unknown field" }), "That did not work."],
      [new DoorError(403, { error: "this needs data:work" }), "You may not do this."],
      [new TypeError("Failed to fetch"), "NILS did not answer. Try again."],
      [new DoorError(500, { error: "something else entirely" }), "That did not work."],
      // 2026-10-12: a step's run refused for what it needs of this machine says what to do in the engine's words
      [new DoorError(409, { error: "refused before it started: the image will not pull; ...", failure: { kind: "dependency", cause: "image", advice: "Check the registry the image is pulled from can be reached, then run it again.", fix: null }, requirements: [] }), "Check the registry the image is pulled from can be reached, then run it again."],
    ];
    for (const [e, words] of cases) {
      const p = plainError(e);
      expect(p.words).toBe(words);
      expect(p.detail.length).toBeGreaterThan(0);
    }
    expect(plainError("exit 3", "This job failed.")).toEqual({ words: "This job failed.", detail: "exit 3" });
  });

  it("says a release's refusal to name its subjects by an ID type in one line (the engine's words as its doors say them)", () => {
    const cases: [DoorError, string][] = [
      [
        new DoorError(409, {
          error:
            "the release names its subjects by study-id, then pacs-id and cannot name them all. 2 subjects hold several values of the type that would name them: 7c1d0e5a93b2f468 (2 of study-id), e40b6a1f8d3c2957 (3 of study-id). Say which value names each (--name-choice CODE=VALUE or a --name-choices file on the command line, name_choices in a request); the plan lists the values (nils release --name-plan, POST /api/releases/names). 1 name would be shared once cleaned to letters and digits, so two subjects would be written into one folder: 7c1d0e5a93b2f468 (by study-id) and e40b6a1f8d3c2957 (by its code). Nothing was written.",
          disclosure: "gated",
        }),
        "Some subjects cannot be named yet.",
      ],
      [new DoorError(403, { error: "naming subjects by an ID type that identifies a person needs detail sensitive; astrid sees plain" }), "Naming by this ID type needs someone who may see IDs."],
      [new DoorError(403, { error: "naming subjects by an ID type that identifies a person needs data:work; astrid holds release:work" }), "Naming by this ID type needs someone who may see IDs."],
      [new DoorError(400, { error: "name by personnummer: a personnummer is never kept, not even sealed, so it can name no subject. Choose an ID type that keeps its values (nils linkage id-type list). Nothing was written." }), "This ID type keeps no ID, so it names no subject."],
      [new DoorError(400, { error: "name by reserve-number: an ID of this type is never kept, not even sealed, so it can name no subject. Choose an ID type that keeps its values (nils linkage id-type list). Nothing was written." }), "This ID type keeps no ID, so it names no subject."],
      [new DoorError(400, { error: "name by ward-id: no ID type is named so. The types that keep values are pacs-id, study-id. Nothing was written." }), "There is no such ID type."],
      [new DoorError(400, { error: "name by study-id: no subject holds a kept value of study-id, so it would name nobody and every subject would keep its code. Import the IDs first (nils linkage import), or take the type out of the list. Nothing was written." }), "No subject holds an ID of this type."],
      [new DoorError(400, { error: "name by study-id: the type is in the list twice. Name each type once, in the order they are tried. Nothing was written." }), "An ID type is in the list twice."],
      [new DoorError(400, { error: "name_by is a list of ID type names, in the order they are tried" }), "The ID types to name by could not be read."],
      [new DoorError(400, { error: "name_choices says which value names a subject, and the release names by no ID type: give name_by, or leave name_choices out. Nothing was written." }), "An ID was chosen and no ID type names the subjects."],
      [new DoorError(400, { error: "name_choices is a list of {subject, value}: a subject code and the value that names that subject. Nothing was written." }), "The chosen IDs could not be read."],
      [new DoorError(400, { error: "the choice for 7c1d0e5a93b2f468: the release's selection holds no subject with that code. A choice names a subject by its subject code. Nothing was written." }), "An ID was chosen for a subject this release does not hold."],
      [new DoorError(400, { error: "the choice for 7c1d0e5a93b2f468: two different values were given. Give one. Nothing was written." }), "Two IDs were chosen for one subject."],
      [new DoorError(400, { error: "the choice for 7c1d0e5a93b2f468: the subject holds no such value of study-id, the type that names it. The plan lists the values it holds (nils release --name-plan, POST /api/releases/names). Nothing was written." }), "A chosen ID is not one the subject holds. Choose again."],
      [new DoorError(400, { error: "the choice for 7c1d0e5a93b2f468: the subject holds one value of study-id, the type that names it, and the choice is another. Leave the choice out. Nothing was written." }), "A subject needs no choice any more. Choose again."],
      [new DoorError(400, { error: "the choice for 7c1d0e5a93b2f468: the subject holds no value of study-id, pacs-id that can name it, so it keeps its code. Leave the choice out. Nothing was written." }), "A subject needs no choice any more. Choose again."],
    ];
    for (const [e, words] of cases) {
      // the engine's own words stay behind the "?"
      expect(knownError(e)).toEqual({ words, detail: e.message });
      expect(plainError(e).words).toBe(words);
    }
    // what the desk has no line for is left to the place that shows it
    expect(knownError(new DoorError(400, { error: "ms-a: no cohort is named so" }))).toBeNull();
    expect(knownError(new DoorError(403, { error: "this needs release:work" }))).toBeNull();
  });
});
