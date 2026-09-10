// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";
import type { Funnel, Options } from "./client";
import { step } from "./editor";
import { chipWord, clauseGroups, countWords, landing, nextMoves, pastedList, pickerSections, startBody } from "./start";

describe("start from anything", () => {
  it("asks the start door in its own words", () => {
    expect(startBody({ kind: "nothing" })).toEqual({ from: {} });
    expect(startBody({ kind: "cohorts", cohorts: ["a", "b"] })).toEqual({ from: { cohorts: ["a", "b"] } });
    expect(startBody({ kind: "selection", selection: "high-field@2" })).toEqual({ from: { selection: "high-field@2" } });
    expect(startBody({ kind: "handle", handle: 71 })).toEqual({ from: { handle: 71 } });
    expect(startBody({ kind: "document", document: 9 })).toEqual({ from: { document: 9 } });
    expect(startBody({ kind: "values", upload: 3 })).toEqual({ from: { values: 3 } });
  });
  it("says the count and what sits under it", () => {
    expect(countWords({ document: {}, set: "people", grain: "subject", count: 48, subjects: 48, sessions: 172, epoch: 1 })).toBe("48 subjects, 172 sessions");
    expect(countWords({ document: {}, set: "visits", grain: "session", count: 1, subjects: 1, sessions: 1, epoch: 1 })).toBe("1 session, 1 subjects");
    expect(countWords({ document: {}, set: "scope", grain: "cohort", count: 2, subjects: null, sessions: null, epoch: 1 })).toBe("2 cohorts");
  });
  it("reads a pasted list by lines or commas, trimmed, once each", () => {
    expect(pastedList(" a\nb, c;c\n\n")).toEqual(["a", "b", "c"]);
  });
});

describe("counts that move", () => {
  const funnel: Funnel[] = [
    { set: "visits", grain: "session", stage: "source", group: "source", rows: 172, subjects: 48, on_path: true },
    { set: "visits", grain: "session", stage: "where", group: "where", rows: 90, subjects: 40, on_path: true },
    { set: "visits", grain: "session", stage: "near", group: "near", rows: 120, subjects: 44, on_path: true },
    { set: "people", grain: "subject", stage: "source", rows: 48, subjects: 48, on_path: true },
  ];
  it("keys the funnel by clause group in the language's order and says what each group lost", () => {
    expect(clauseGroups(funnel, "visits")).toEqual([
      { group: "source", rows: 172, subjects: 48, lost: 0 },
      { group: "near", rows: 120, subjects: 44, lost: 52 },
      { group: "where", rows: 90, subjects: 40, lost: 30 },
    ]);
  });
  it("falls back to the stage when an engine keys the funnel by set", () => {
    expect(clauseGroups(funnel, "people")).toEqual([{ group: "source", rows: 48, subjects: 48, lost: 0 }]);
  });
  it("reads the engine's clause groups when it answered by clause", () => {
    const groups = [
      { set: "visits", grain: "session", group: "where", clauses: 1, kept: 90, subjects: 40, lost: 30 },
      { set: "visits", grain: "session", group: "source", clauses: 1, kept: 172, subjects: 48, lost: 0 },
      { set: "visits", grain: "session", group: "near", clauses: 1, kept: 120, subjects: 44, lost: 52 },
    ];
    expect(clauseGroups([], "visits", groups).map((g) => `${g.group} ${g.rows} -${g.lost}`)).toEqual(["source 172 -0", "near 120 -52", "where 90 -30"]);
  });
});

function options(set: string, grain: string, moves: Options["moves"], fields: string[] = []): Options {
  return { token: "t", hash: "h", epoch: 1, set, grain, describe: "", exposes: { fields, dated: [], bindings: [] }, moves, presets: [] };
}

describe("click or say it", () => {
  const document = { sets: { people: { grain: "subject" }, visits: { grain: "session", of: "people", where: [["=", {}, ["field", {}, "x"], 1]] } }, out: { set: "visits", level: "count" } };
  const visits = options("visits", "session", [
    { id: 5, kind: "set_out", set: "visits", template: "answer with {level}", holes: [{ name: "level", type: "level" }] },
    { id: 2, kind: "add_where", set: "visits", template: "where {field} {op} {value}", holes: [{ name: "field", type: "field" }, { name: "op", type: "op" }, { name: "value", type: "value" }] },
    { id: 3, kind: "remove_where", set: "visits", template: "drop clause {index}", holes: [{ name: "index", type: "index" }] },
    { id: 1, kind: "add_near", set: "visits", template: "near {set}", holes: [{ name: "set", type: "set" }] },
  ], ["first", "subject.code"]);
  it("lists the legal next moves in the language's order, without the drop", () => {
    const s = step(document, "visits", visits);
    expect(nextMoves(s).map((n) => `${n.part}:${n.move.kind}`)).toEqual(["near:add_near", "where:add_where", "out:set_out"]);
    expect(chipWord(visits.moves[1])).toBe("where");
    expect(chipWord(visits.moves[0])).toBe("answer with");
  });
  it("offers one picker across every set and lands the clause on the field's set", () => {
    const people = options("people", "subject", [{ id: 9, kind: "add_where", set: "people", template: "where {field} {op} {value}", holes: [{ name: "field", type: "field" }] }], ["sex", "birth_year"]);
    const all = { people, visits };
    const sections = pickerSections(all, ["people", "visits"], "");
    expect(sections.map((s) => [s.set, s.grain, s.fields.length])).toEqual([["people", "subject", 2], ["visits", "session", 2]]);
    expect(pickerSections(all, ["people", "visits"], "code").map((s) => s.fields)).toEqual([["subject.code"]]);
    expect(landing(all, "visits")?.id).toBe(2);
    expect(landing({ ...all, visits: options("visits", "session", []) }, "visits")).toBeNull();
  });
});
