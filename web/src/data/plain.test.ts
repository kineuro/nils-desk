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
      [new DoorError(403, { error: "this needs data:work" }), "You may not do this."],
      [new TypeError("Failed to fetch"), "NILS did not answer. Try again."],
      [new DoorError(500, { error: "something else entirely" }), "That did not work."],
    ];
    for (const [e, words] of cases) {
      const p = plainError(e);
      expect(p.words).toBe(words);
      expect(p.detail.length).toBeGreaterThan(0);
    }
    expect(plainError("exit 3", "This job failed.")).toEqual({ words: "This job failed.", detail: "exit 3" });
  });
});
