// SPDX-License-Identifier: AGPL-3.0-only
// The Pseudonymisation page's pure parts: a CSV read in the browser, each
// column's shape and its guessed meaning, the import's columns and its
// report in words, the held files grouped by shape, how many people see
// records at each detail, what the identity-check station saw, and the
// words each fact takes. The numbers and names here are made up.

import { describe, expect, it } from "vitest";
import type { Access } from "../settings/identity";
import {
  arrivesWords,
  bytesWords,
  detailCounts,
  guessRole,
  heldGroups,
  heldLine,
  identityWords,
  importColumns,
  leavingRefusal,
  leavingWords,
  lookAt,
  mapRefusal,
  parseCsv,
  proposedRule,
  reportLines,
  ruleWords,
  sawOf,
  shapeOf,
  shapeWords,
  subjectsWords,
  tagList,
  typeName,
  type Dataset,
  type IdType,
  type ImportReport,
} from "./pseudonyms";

const types: IdType[] = [
  { name: "personnummer", description: "the national number" },
  { name: "lake-id", description: "the lake study's id" },
];

describe("a CSV read on this machine", () => {
  it("splits on the delimiter the header uses, honours quotes, and drops empty lines", () => {
    const csv = parseCsv('pn,canonical_pn,note\n"199001019999",199001019999,"a, quoted"\n199002029999,199001019999,\n\n');
    expect(csv.delimiter).toBe(",");
    expect(csv.header).toEqual(["pn", "canonical_pn", "note"]);
    expect(csv.rows).toEqual([
      ["199001019999", "199001019999", "a, quoted"],
      ["199002029999", "199001019999", ""],
    ]);
    expect(parseCsv("a;b\r\n1;2\r\n").rows).toEqual([["1", "2"]]);
    expect(parseCsv("a\tb\n1\t2").delimiter).toBe("\t");
    expect(parseCsv("").rows).toEqual([]);
  });
});

describe("what a column looks like", () => {
  it("is its shape: digits as 9, capitals as A, and how many rows hold it", () => {
    expect(shapeOf("SMS1234")).toBe("AAA9999");
    expect(shapeOf("19900101-9999")).toBe("99999999-9999");
    expect(shapeWords("999999999999")).toBe("12 digits");
    expect(shapeWords("AAA999")).toBe("AAA999");
    const look = lookAt("pn", ["199001019999", "199002029999", "199001019999", ""]);
    expect(look.words).toBe("12 digits, 3 rows, rest empty, 2 distinct");
    expect(lookAt("blank", ["", ""]).words).toBe("empty");
    expect(lookAt("mixed", ["SMS1234", "199001019999", "SMS9999", "AB12"]).words).toBe("3 shapes: AAA9999, 12 digits, 4 rows");
  });
  it("means the person's number, the code, a type of the registry's, or a new type named after the header", () => {
    const look = lookAt("x", ["1"]);
    expect(guessRole("canonical_pn", look, types)).toEqual({ role: "canonical", id_type: null, new_type: null });
    expect(guessRole("subject_code", look, types)).toEqual({ role: "code", id_type: null, new_type: null });
    expect(guessRole("Personnummer", look, types)).toEqual({ role: "identifier", id_type: "personnummer", new_type: null });
    expect(guessRole("lake id", look, types)).toEqual({ role: "identifier", id_type: "lake-id", new_type: null });
    expect(guessRole("PatientID", look, types)).toEqual({ role: "identifier", id_type: null, new_type: "patientid" });
    expect(guessRole("empty", lookAt("empty", ["", ""]), types)).toEqual({ role: "ignore", id_type: null, new_type: null });
    expect(typeName("KI PRO / site")).toBe("ki-pro-site");
  });
  it("becomes the import's columns, a new type named as its type", () => {
    const guesses = [guessRole("pn", lookAt("pn", ["1"]), types), guessRole("canonical_pn", lookAt("c", ["1"]), types), guessRole("Orchard", lookAt("o", ["1"]), types), guessRole("note", lookAt("n", [""]), types)];
    expect(importColumns(["pn", "canonical_pn", "Orchard", "note"], guesses)).toEqual([
      { header: "pn", role: "identifier", id_type: "personnummer" },
      { header: "canonical_pn", role: "canonical" },
      { header: "Orchard", role: "identifier", id_type: "orchard" },
      { header: "note", role: "ignore" },
    ]);
    expect(mapRefusal(guesses)).toBeNull();
    expect(mapRefusal([guesses[3]])).toBe("At least one column is an identifier or the person's number.");
    expect(mapRefusal([guesses[1], guesses[1]])).toBe("One column stands for the person; two are chosen.");
    expect(mapRefusal([guesses[1]])).toBe("The person's number alone maps nothing: add an identifier column or the code.");
  });
});

describe("the import's report", () => {
  const report: ImportReport = { subjects: { named: 212, known: 209, new: 3 }, identifiers: { filed: 1296, known: 1240, new: 56, types_new: 1 }, held_released: { released: 4, of: 4 }, merges: [{ alias: "a", canonical: "b" }, { alias: "c", canonical: "d" }], conflicts: [] };
  it("says what it will do, line by line, and marks conflicts", () => {
    const lines = reportLines(report);
    expect(lines.map((l) => l.label)).toEqual(["subjects", "identifiers", "held files", "merges", "conflicts"]);
    expect(lines[0].words).toBe("212 named · 209 known · 3 new, with codes derived from their number");
    expect(lines[1].words).toBe("1,296 filed · 1,240 already known · 56 new · 1 new type");
    expect(lines[2].words).toBe("4 of 4 released");
    expect(lines[3].words).toBe("2: provisional subjects become their canonical ones · the old codes stay as identifiers");
    expect(lines[4].tone).toBe("ok");
    const refused = reportLines({ ...report, held_released: 0, merges: [], conflicts: [{ row: 12, why: "already on another subject" }] });
    expect(refused[2].words).toBe("none");
    expect(refused[3].words).toBe("none");
    expect(refused[4]).toEqual({ label: "conflicts", words: "1: nothing is written until they are resolved", tone: "caution" });
  });
});

describe("the held files", () => {
  it("are grouped by shape, most files first, with their batches and the earliest sighting", () => {
    const groups = heldGroups([
      { shape: "AAA999", files: 1, first_seen: "2026-09-15T10:00:00Z", batch: "lake-2026-09-15" },
      { shape: "999999999999", files: 2, first_seen: "2026-09-15T09:00:00Z", batch: "lake-2026-09-15" },
      { shape: "999999999999", files: 1, first_seen: "2026-09-14T09:00:00Z", batch: "lake-2026-09-14" },
    ]);
    expect(groups).toEqual([
      { shape: "999999999999", files: 3, identifiers: 2, batches: ["lake-2026-09-15", "lake-2026-09-14"], since: "2026-09-14T09:00:00Z" },
      { shape: "AAA999", files: 1, identifiers: 1, batches: ["lake-2026-09-15"], since: "2026-09-15T10:00:00Z" },
    ]);
    expect(heldLine(groups[0], 0)).toBe("12 digits, not in the map");
    expect(heldLine(groups[1], 1)).toBe("AAA999, a second shape");
    expect(heldGroups([])).toEqual([]);
  });
});

describe("who sees what", () => {
  it("counts the people at each detail from the desk's people door", () => {
    const person = (subject: string, detail: "plain" | "quasi" | "sensitive") => ({ subject, display: "", groups: [], followed: [], grants: [], detail: null, access: { grants: [], detail }, last_seen_at: null, sessions_open: 0 });
    const access: Access = { mode: "local", sessions_open: 0, people: [person("a", "plain"), person("b", "quasi"), person("c", "quasi"), person("d", "sensitive")] };
    expect(detailCounts(access)).toEqual({ plain: 1, quasi: 2, sensitive: 1 });
    expect(detailCounts(null)).toEqual({ plain: 0, quasi: 0, sensitive: 0 });
  });
});

describe("the identity-check station's run", () => {
  it("draws what it saw per rule as shapes with counts, never a value, and reads the proposal", () => {
    const result = {
      saw: [
        { rule: { id_type: "patient-id", sources: ["PatientID"] }, shapes: { "9999999999": 18402, AAA999: 18 }, subjects: 214, empty: 0 },
        { source: "path segment 2", code: "verbatim", shapes: [{ shape: "AAA-999", files: 18420 }], subjects: 212, path_is_direct_identifier: false },
      ],
      sentence: "PatientID carries one shape on 18,402 files and a second on 18.",
      proposed: { id_type: "subject-code", code: "verbatim" as const, from: [{ path: { segment: 2 } }] },
    };
    const cards = sawOf(result);
    expect(cards.map((c) => c.title)).toEqual(["Now: PatientID", "Candidate: path segment 2"]);
    expect(cards[0].shapes).toEqual([
      { shape: "9999999999", files: 18402 },
      { shape: "AAA999", files: 18 },
    ]);
    expect(cards[0].facts).toEqual([
      ["people", "214 under this rule"],
      ["files with no value", "0"],
    ]);
    expect(cards[1].meta).toBe("code verbatim");
    expect(cards[1].facts[1]).toEqual(["is the path an identifier?", "no: a study code, not a person's number"]);
    const verdict = { station: "identity-check", terminal: "settled", result, checks: [], proposals: [] };
    expect(proposedRule(verdict)).toEqual(result.proposed);
    expect(ruleWords(result.proposed)).toBe("Read the code from folder 2 of the path, verbatim.");
    expect(ruleWords({ id_type: "personnummer", from: [{ field: "PatientID" }, { path: { segment: 1 } }] })).toBe("Read the personnummer from PatientID, then folder 1 of the path, through the map.");
    expect(proposedRule({ ...verdict, result: {}, proposals: [{ kind: "identity_rule", ref: { rule: result.proposed }, sentence: "" }] })).toEqual(result.proposed);
    expect(proposedRule({ ...verdict, result: {} })).toBeNull();
  });
});

describe("the words of a dataset", () => {
  const base = { id: 1, name: "lake", path: "/scans/lake", guarantees: {}, probed: null, handling: { arrives: "identified" as const, on_release: { dates: "shift" as const, uids: "remap" as const, deface: false } }, handling_declared: true, roots: 1, digests: { count: 0, first: null, last: null, recent: [] }, totals: { subjects: 0, studies: 0, sessions: 0, stacks: 0, refused_files: 0, to_sort: 0 } };
  it("say how it arrives, where the codes come from, the rule and what leaves", () => {
    const d: Dataset = { ...base, arrives: "identified", identity: { id_type: "personnummer", from: [{ field: "PatientID" }] }, unmapped: "hold" };
    expect(arrivesWords(d)).toBe("identified; pseudonymised into dcm-anon before anything reads it");
    expect(subjectsWords(d)).toBe("codes from the map and the key");
    expect(identityWords(d)).toBe("PatientID, through the map");
    expect(identityWords({ ...d, unmapped: "code" })).toBe("PatientID, through the map or hashed");
    expect(identityWords({ ...d, arrives: "coded", identity: { id_type: "subject-code", code: "verbatim", from: [{ path: { segment: 2 } }] } })).toBe("folder 2 of the path, taken verbatim as the code");
    expect(arrivesWords({ ...base })).toBe("identified; pseudonymised into dcm-anon before anything reads it");
    expect(arrivesWords({ ...base, arrives: "deidentified" })).toBe("de-identified; moved into dcm-anon as sent, identifiers mapped when read");
    expect(leavingWords(d.handling.on_release)).toBe("dates shifted · UIDs remapped · faces kept");
    expect(leavingWords(undefined)).toBe("as the tree stands");
    expect(leavingRefusal({ dates: "shift", uids: "preserve", deface: false })).toContain("cannot keep");
    expect(leavingRefusal({ dates: "keep", uids: "preserve", deface: false })).toBeNull();
    expect(bytesWords(2.4e12)).toBe("2.4 TB");
    expect(bytesWords(5e8)).toBe("500 MB");
    expect(tagList("StudyDescription, SeriesDescription\nStudyDescription")).toEqual(["StudyDescription", "SeriesDescription"]);
  });
});
