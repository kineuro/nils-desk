// SPDX-License-Identifier: AGPL-3.0-only
// The words of the one safe way in (Wave 7a): what a dataset's structure
// says, why a dataset is not read yet (the engine's words where its door
// gives them, else the same reasoning), a root told from a dataset, an engine
// that reads structure told from one before it, and the move question.

import { describe, expect, it } from "vitest";
import { ASKED, ASKS_FIRST, UNKNOWN, caps7a } from "../../test/safeWayIn";
import { foundFacts, isRoot, notReadOf, patientIdOf, questionWords, readsStructure, stateWords } from "./layout";

describe("a dataset in words", () => {
  it("says what each structure means, by whether it is read yet", () => {
    expect(stateWords("identified", true)).toBe("identified: will be pseudonymised");
    expect(stateWords("anonymised", false)).toBe("anonymised: needs its PatientID and how subjects are found");
    expect(stateWords("anonymised", true)).toBe("anonymised: read as it is");
    expect(stateWords("both", true)).toBe("both: identified, with its anonymised copy beside it");
    expect(stateWords("unknown", false)).toBe("unknown: tell us where its loose entries go");
    expect(foundFacts(UNKNOWN).map((f) => f.v)).toEqual(["not there", "not there", "3 entries, 2 with DICOM"]);
  });

  it("says why a dataset is not read: the engine's words first, else the same reasoning, and never of a root", () => {
    expect(notReadOf({ role: "source", not_read: "its structure is unknown" })).toBe("its structure is unknown");
    expect(notReadOf({ role: "source", not_read: null, dataset: { state: "unknown" } })).toBeNull();
    expect(notReadOf({ role: "source", dataset: { kind: "dataset", state: "unknown", arrives: "undeclared" } })).toContain("say which tree they go into");
    expect(notReadOf({ role: "source", dataset: { kind: "dataset", state: "anonymised", patient_id: null, subjects: null } })).toBe(
      "it is anonymised and does not say what PatientID holds, nor how its subjects are found",
    );
    expect(notReadOf({ role: "source", dataset: { kind: "dataset", state: "anonymised", patient_id: "subject-code", subjects: "map" } })).toBeNull();
    expect(notReadOf({ role: "source", dataset: { kind: "dataset", state: "identified" } })).toBeNull();
    // the sources door carries the fields at the top
    expect(notReadOf({ kind: "dataset", state: "anonymised", patient_id: "subject-code", subjects: null })).toBe("it is anonymised and does not say how its subjects are found");
    expect(notReadOf({ role: "source", dataset: { kind: "root", state: "unknown" } })).toBeNull();
    expect(notReadOf({ role: "export", not_read: "x" })).toBeNull();
    expect(isRoot({ role: "source", dataset: { kind: "root" } })).toBe(true);
    expect(isRoot({ kind: "dataset" })).toBe(false);
  });

  it("knows an engine that reads structure by its capabilities, and asks the move in the tree's own words", () => {
    expect(readsStructure(caps7a([]))).toBe(true);
    const before = caps7a([]);
    before.engine!["places"] = { ...ASKS_FIRST, dataset: { ...ASKS_FIRST.dataset, states: undefined } };
    expect(readsStructure(before)).toBe(false);
    const q = questionWords({ why: ASKED.error, layout: UNKNOWN }, "anon");
    expect(q.lead).toBe("Move 2 entries into the anonymised folder?");
    expect(q.tree).toBe("derivatives/dcm-anon");
    expect(patientIdOf("subject-code", "x")).toBe("subject-code");
    expect(patientIdOf("id-type", " study-id ")).toBe("id-type:study-id");
    expect(patientIdOf("id-type", "")).toBeNull();
  });
});
