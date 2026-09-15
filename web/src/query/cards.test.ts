// SPDX-License-Identifier: AGPL-3.0-only
// The Query page's pure parts.

import { describe, expect, it } from "vitest";
import type { Move, Profile } from "../ask/client";
import type { Capabilities } from "../capabilities";
import type { Grant } from "../grants";
import { argsOf, cardTitle, changeWords, chartOf, clauseText, countsOf, fieldChoices, inputOf, keepingRefusal, moveWords, preview, stepCounts, tabsOf, unitWords, valueWords, versionsOf } from "./cards";

describe("keeping a card", () => {
  const holding = (grants: Grant[]) => ({ person: { subject: "p", display_name: "p", grants, detail: "plain", groups: [] } }) as unknown as Capabilities;
  it("is offered with work on the Query page, and said in words without it", () => {
    expect(keepingRefusal(holding(["query:work"]))).toBeNull();
    expect(keepingRefusal(holding(["query:see", "data:work"]))).toBe("Keeping cards needs work on the Query page.");
  });
});

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
    expect(moveWords({ ...addHas, kind: "set_strict" })).toBe("How a condition reads");
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

describe("a step's charts", () => {
  const profile: Profile = {
    set: "people",
    grain: "subject",
    counts: { subjects: 43, sessions: 162, stacks: 822 },
    stack_types: [
      { value: "T1w", count: 497, subjects: 43 },
      { value: null, count: 5, subjects: 2 },
    ],
    field: null,
    demographics: { withheld: "the sex and the age of a subject are quasi-identifying, counted from the reviewer role" },
    clinical: { kinds: [{ value: "EDSS", count: 156, subjects: 43 }], sensitive_withheld: true },
  };
  it("count each member once, and chart only what the step's grain has", () => {
    expect(countsOf(profile)).toEqual([
      { label: "subjects", value: 43 },
      { label: "sessions", value: 162 },
      { label: "stacks", value: 822 },
    ]);
    expect(tabsOf(profile).map((t) => t.id)).toEqual(["stacks", "field", "people", "clinical"]);
    const cohort: Profile = { ...profile, grain: "cohort", counts: { rows: 2, subjects: 43 }, stack_types: null, demographics: null, clinical: null };
    expect(tabsOf(cohort)).toEqual([]);
    expect(countsOf(cohort)).toEqual([
      { label: "subjects", value: 43 },
      { label: "rows", value: 2 },
    ]);
  });
  it("draw bars against the longest, a missing value named", () => {
    const chart = chartOf(profile.stack_types, "base");
    expect(chart.kind === "bars" && chart.bars.map((b) => [b.label, b.share])).toEqual([
      ["T1w", 1],
      ["no base", 5 / 497],
    ]);
  });
  it("read decades by age with the unknown last, and a sex in words", () => {
    const decades = [
      { value: null, count: 15, subjects: 4 },
      { value: 40, count: 117, subjects: 32 },
      { value: 20, count: 5, subjects: 3 },
    ];
    const chart = chartOf(decades, "decade");
    expect(chart.kind === "bars" && chart.bars.map((b) => b.label)).toEqual(["20 to 29", "40 to 49", "age unknown"]);
    expect(valueWords("F", "sex")).toBe("female");
    expect(valueWords(null, "sex")).toBe("not recorded");
    expect(unitWords(1, "subjects")).toBe("1 subject");
    expect(unitWords(1497, "stacks")).toBe("1,497 stacks");
  });
  it("say why a part has nothing to draw", () => {
    expect(chartOf(profile.demographics)).toEqual({ kind: "words", words: "The sex and the age of a subject are quasi-identifying, counted from the reviewer role." });
    expect(chartOf({ name: "manufacturer", refused: "no stacks" })).toEqual({ kind: "words", words: "This could not be counted: no stacks" });
    expect(chartOf([], "plain", "None here.")).toEqual({ kind: "words", words: "None here." });
    expect(chartOf(null)).toEqual({ kind: "none" });
    expect(chartOf(profile.clinical).kind).toBe("bars");
  });
  it("offer the stack fields a person reads as categories, the scanner's maker first", () => {
    const f = (path: string, type: string, klass: string, dated = false) => ({ level: "stack", path, type, class: klass, dated, description: "" });
    const fields = [
      f("series_description", "text", "quasi_identifying"),
      f("dwi_directions", "integer", "technical"),
      f("acquired_on", "date", "technical", true),
      f("manufacturer", "text", "technical"),
      f("slice_thickness", "real", "technical"),
    ];
    expect(fieldChoices(fields)).toEqual(["manufacturer", "dwi_directions"]);
  });
});

describe("a proposed version", () => {
  it("says what it changes, and in which step", () => {
    expect(changeWords({ set: "people", part: "where", kind: "changed" })).toBe("changes where in people");
    expect(changeWords({ set: "visits", part: "set", kind: "added" })).toBe("adds the step visits");
    expect(changeWords({ set: "people", part: "near", kind: "removed" })).toBe("takes near away from people");
    expect(changeWords({ part: "name", kind: "added", after: "women of the two cohorts" })).toBe('names the query "women of the two cohorts"');
    expect(changeWords({ set: null, part: "scheme", kind: "added", after: "default" })).toBe("");
    expect(changeWords({ part: "keep", kind: "added" })).toBe("");
    expect(changeWords({ part: "out", kind: "changed" })).toBe("changes what the query answers with");
    expect(changeWords({ part: "params", kind: "changed" })).toBe("changes the query's params");
  });
});
