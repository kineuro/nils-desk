// SPDX-License-Identifier: AGPL-3.0-only
// The words of the one safe way in (Wave 7a): what a declaration would read
// and move as the engine's layout says it, an engine that asks first told
// from one before it, and an undeclared place told by either door's shape.

import { describe, expect, it } from "vitest";
import { ASKS_FIRST, LOOSE, caps7a } from "../../test/safeWayIn";
import { asksFirst, declarationWords, foundFacts, isUndeclared, patientIdOf, patientIdServed } from "./layout";

describe("the layout in words", () => {
  it("says what each arrival reads, what it would move, and what stays unread", () => {
    expect(declarationWords(LOOSE, "identified")).toEqual({
      reads: "Reads derivatives/dcm-original only.",
      move: "Moves the 3 loose entries beside derivatives/ into derivatives/dcm-original, once you confirm.",
      stays: null,
    });
    const there = { ...LOOSE, anon: true, question: false, declarations: { deidentified: { reads: "derivatives/dcm-anon", tree_there: true, moves: 1, into: "derivatives/dcm-anon", needed: false } } };
    expect(declarationWords(there, "deidentified")?.stays).toBe("The 1 loose entry beside derivatives/ stays where it is, not read.");
    const empty = { ...LOOSE, loose: 0, loose_entries: [], declarations: { coded: { reads: "derivatives/dcm-anon", tree_there: false, moves: 0, into: "derivatives/dcm-anon", needed: false } } };
    expect(declarationWords(empty, "coded")?.reads).toBe("Reads derivatives/dcm-anon only. An empty derivatives/dcm-anon is made.");
    expect(declarationWords(LOOSE, "undeclared")?.reads).toContain("Nothing in it is read.");
    // an engine before Wave 7a says none of it, and nothing is claimed for it
    expect(declarationWords({ v0: null }, "identified")).toBeNull();
    expect(declarationWords(LOOSE, null)).toBeNull();
    expect(foundFacts(LOOSE).map((f) => f.v)).toEqual(["not there", "not there", "3 loose entries"]);
  });

  it("knows an engine that asks first by its capabilities, and an undeclared place by either door", () => {
    expect(asksFirst(caps7a([]))).toBe(true);
    expect(patientIdServed(caps7a([]))).toBe(true);
    const before = caps7a([]);
    before.engine!["places"] = { ...ASKS_FIRST, dataset: { ...ASKS_FIRST.dataset, arrives: ["identified", "deidentified", "coded"], patient_id: undefined } };
    expect(asksFirst(before)).toBe(false);
    expect(patientIdServed(before)).toBe(false);
    expect(isUndeclared({ arrives: "undeclared" })).toBe(true);
    expect(isUndeclared({ role: "source", dataset: { arrives: "undeclared" } })).toBe(true);
    expect(isUndeclared({ role: "export", dataset: { arrives: "undeclared" } })).toBe(false);
    expect(isUndeclared({ role: "source", dataset: { arrives: "identified" } })).toBe(false);
    expect(patientIdOf("subject-code", "x")).toBe("subject-code");
    expect(patientIdOf("id-type", " study-id ")).toBe("id-type:study-id");
    expect(patientIdOf("id-type", "")).toBeNull();
  });
});
