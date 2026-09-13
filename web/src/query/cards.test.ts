// SPDX-License-Identifier: AGPL-3.0-only
// The Query page's pure parts.

import { describe, expect, it } from "vitest";
import type { Move } from "../ask/client";
import { argsOf, cardTitle, clauseText, inputOf, moveWords, preview, stepCounts, versionsOf } from "./cards";

const addWhere: Move = {
  id: 4,
  kind: "add_where",
  set: "people",
  template: "where {field} {op} {value}",
  holes: [
    { name: "field", type: "field", fillers: ["sex", "birth_date"] },
    { name: "op", type: "op", fillers: ["=", "<"] },
    { name: "value", type: "value", optional: true },
  ],
};

const addHas: Move = {
  id: 9,
  kind: "add_has",
  set: "people",
  template: "has at least {min} {child}",
  holes: [
    { name: "child", type: "set", fillers: ["stacks"] },
    { name: "min", type: "int", optional: true },
  ],
};

describe("a card", () => {
  it("is named by the query, else by the set it answers", () => {
    expect(cardTitle("T1w after contrast")).toBe("T1w after contrast");
    expect(cardTitle(null, "t1_with_contrast")).toBe("t1 with contrast");
    expect(cardTitle("  ", null)).toBe("A query");
  });
  it("labels its versions oldest first", () => {
    const chain = [
      { document: 3, hash: "a", parent: null, ask: {}, principal: "anna", created_at: "2026-09-10T10:00:00Z" },
      { document: 7, hash: "b", parent: 3, ask: {} },
    ];
    expect(versionsOf(chain)).toEqual([
      { id: 3, label: "v1", principal: "anna", at: "2026-09-10T10:00:00Z" },
      { id: 7, label: "v2", principal: null, at: null },
    ]);
  });
});

describe("a move typed in by hand", () => {
  it("offers a choice where the engine gives fillers, a number for a count, words otherwise", () => {
    expect(addWhere.holes.map(inputOf)).toEqual(["choice", "choice", "words"]);
    expect(inputOf({ name: "strict", type: "bool", fillers: ["true", "false"] })).toBe("yesno");
    expect(inputOf(addHas.holes[1])).toBe("number");
  });
  it("reads back arguments, leaves out empty optional holes and names the required ones still empty", () => {
    expect(argsOf(addWhere, { field: "sex", op: "=", value: "F" })).toEqual({ args: { field: "sex", op: "=", value: "F" }, missing: [] });
    expect(argsOf(addWhere, { field: "sex" })).toEqual({ args: { field: "sex" }, missing: ["op"] });
    expect(argsOf(addHas, { child: "stacks", min: "2" })).toEqual({ args: { child: "stacks", min: 2 }, missing: [] });
    expect(argsOf(addHas, { child: "stacks", min: "two" }).missing).toEqual(["min"]);
  });
  it("says on its button what it does", () => {
    expect(moveWords(addHas)).toBe("Must have");
    expect(moveWords({ ...addHas, kind: "something_new", template: "frobnicate {x}" })).toBe("frobnicate");
  });
  it("reads as its template with what was typed so far", () => {
    expect(preview(addWhere, { field: "sex", op: "=" })).toBe("where sex = {value}");
  });
});

describe("a step's counts", () => {
  it("are what its last clause group kept, with what its clauses lost", () => {
    const groups = [
      { set: "people", grain: "subject", group: "source", clauses: 1, kept: 412, subjects: 412, lost: 0 },
      { set: "people", grain: "subject", group: "has", clauses: 1, kept: 107, subjects: 107, lost: 305 },
      { set: "visits", grain: "session", group: "near", clauses: 1, kept: 611, subjects: 104, lost: 3 },
    ];
    expect(stepCounts(groups, "people")).toEqual({ rows: 107, subjects: 107, lost: 305 });
    expect(stepCounts(groups, "nothing")).toBeNull();
  });
});

describe("a clause read from a query", () => {
  it("reads as words, never as its JSON", () => {
    expect(clauseText(["=", {}, ["field", {}, "sex"], "F"])).toBe("sex = F");
    expect(clauseText(["in", {}, ["axis", {}, "base"], ["T1w", "T2w"]])).toBe("base in T1w, T2w");
    expect(clauseText(["and", {}, ["=", {}, ["field", {}, "course"], "RRMS"], [">=", {}, ["field", {}, "edss"], 3]])).toBe("course = RRMS and edss >= 3");
    expect(clauseText(["is_null", {}, ["field", {}, "birth_date"]])).toBe("is null(birth date)");
  });
});
