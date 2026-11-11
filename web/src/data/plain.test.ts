// SPDX-License-Identifier: AGPL-3.0-only
// The Data page's plain words for the engine's refusals (2026-10-09).

import { describe, expect, it } from "vitest";
import { DoorError } from "../ask/client";
import { plainError } from "./plain";

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
});
