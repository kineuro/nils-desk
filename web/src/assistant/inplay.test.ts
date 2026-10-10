// SPDX-License-Identifier: AGPL-3.0-only
// The query a conversation works on (the Assistant redesign, 2026-10-09): its
// versions numbered in their line, an answer's funnel in the page's words
// (subjects, visits, scans), the conditions as a person reads them, and the
// move a clicked bar narrows the question with.

import { describe, expect, it } from "vitest";
import type { Move, Options, Preview, Profile } from "../ask/client";
import { editor } from "../ask/editor";
import { beforeWords, conditionsOf, conditionWords, funnelOf, levelSet, lineOf, listingMove, narrowing, pathOf, placed, stacksOf } from "./inplay";

const profile = (counts: Profile["counts"], grain = "stack"): Profile => ({ set: "scans", grain, counts, stack_types: null, field: null, demographics: null, clinical: null });

describe("the versions of a conversation", () => {
  it("are numbered in their line as they came, a version of an unknown parent starting a line of its own", () => {
    const all = placed([
      { document: 101, parent: null },
      { document: 102, parent: 101 },
      { document: 103, parent: 102 },
      { document: 200, parent: 999 },
      { document: 104, parent: 101 },
    ]);
    expect([101, 102, 103, 104].map((d) => all.get(d)?.label)).toEqual(["v1", "v2", "v3", "v4"]);
    expect(all.get(200)).toMatchObject({ root: 200, label: "v1" });
    expect(lineOf(all, 103).map((p) => p.document)).toEqual([101, 102, 103, 104]);
    expect(lineOf(all, 200).map((p) => p.document)).toEqual([200]);
    expect(lineOf(all, 555)).toEqual([]);
  });

  it("go on from the versions a Query page card already has", () => {
    const all = placed(
      [
        { document: 7, parent: null },
        { document: 9, parent: 7 },
      ],
      { 7: 3 },
    );
    expect(all.get(7)?.label).toBe("v3");
    expect(all.get(9)?.label).toBe("v4");
  });

  it("count a version once, however often it is named", () => {
    const all = placed([
      { document: 1, parent: null },
      { document: 1, parent: null },
      { document: 2, parent: 1 },
    ]);
    expect(all.get(2)?.label).toBe("v2");
  });
});

describe("an answer's funnel", () => {
  it("reads subjects, visits and scans, the engine's word beside where it differs, the answer's step marked", () => {
    const steps = funnelOf(profile({ subjects: 48, sessions: 61, stacks: 212 }));
    expect(steps.map((s) => [s.word, s.hint, s.n, s.answer])).toEqual([
      ["subjects", null, 48, false],
      ["visits", "session", 61, false],
      ["scans", "stack", 212, true],
    ]);
    expect(steps.some((s) => s.word === "people")).toBe(false);
  });

  it("says how many the version it came from held", () => {
    const steps = funnelOf(profile({ subjects: 41, sessions: 52, stacks: 139 }), profile({ subjects: 48, sessions: 61, stacks: 212 }));
    expect(steps.map(beforeWords)).toEqual(["of 48", "of 61", "of 212"]);
    const same = funnelOf(profile({ subjects: 48, sessions: 70, stacks: 212 }), profile({ subjects: 48, sessions: 61, stacks: 212 }));
    expect(same.map(beforeWords)).toEqual([null, "was 61", null]);
  });

  it("counts an answer of another grain by its rows, and draws nothing it was refused", () => {
    expect(funnelOf(profile({ rows: 9, subjects: 4 }, "event")).map((s) => [s.word, s.n, s.answer])).toEqual([
      ["subjects", 4, false],
      ["events", 9, true],
    ]);
    expect(funnelOf(profile({ refused: "no" }))).toEqual([]);
    expect(funnelOf(null)).toEqual([]);
  });
});

const DOC = {
  ast_version: 1,
  sets: {
    scope: { grain: "cohort", where: [["=", {}, ["field", {}, "name"], "study-big"]] },
    people: { grain: "subject", of: "scope" },
    visits: { grain: "session", of: "people", has: [{ set: "flair", min: 1 }] },
    flair: { grain: "stack", of: "visits", where: [["=", {}, ["axis", {}, "modifier"], "FLAIR"]] },
    scans: {
      grain: "stack",
      of: "visits",
      where: [
        ["=", {}, ["axis", {}, "base"], "T1w"],
        ["=", {}, ["axis", {}, "post_contrast"], "given"],
        [">=", {}, ["field", {}, "slices"], 100],
      ],
    },
  },
  out: { set: "scans", level: "count" },
};

const move = (id: number, kind: string, set: string | null, holes: Move["holes"], template = kind): Move => ({ id, kind, set, template, holes });
const opts = (set: string, grain: string, moves: Move[]): Options => ({ token: "t", hash: "h", epoch: 1, set, grain, describe: "", exposes: { fields: [], dated: [], bindings: [] }, moves, presets: [] });

describe("the question's conditions", () => {
  it("read as a person says them: a cohort by name, a scan's kind by its value, contrast in words", () => {
    expect(conditionWords(DOC.sets.scope.where[0], "cohort")).toBe("in study-big");
    expect(conditionWords(DOC.sets.scans.where[0], "stack")).toBe("T1w");
    expect(conditionWords(DOC.sets.scans.where[1], "stack")).toBe("with contrast");
    expect(conditionWords(DOC.sets.scans.where[2], "stack")).toBe("slices >= 100");
  });

  it("are every where of every step, each taken away by the engine's own move, and what a step must have", () => {
    const remove = move(4, "remove_where", "scans", [{ name: "index", type: "index", fillers: ["0", "1", "2"] }]);
    const options = { scans: opts("scans", "stack", [remove]) };
    const conds = conditionsOf(editor(DOC, options), options, pathOf(DOC).map((s) => s.set));
    expect(conds.map((c) => c.words)).toEqual(["in study-big", "flair: FLAIR", "T1w", "with contrast", "slices >= 100", "has at least 1 flair"]);
    const contrast = conds.find((c) => c.words === "with contrast");
    expect(contrast?.remove).toEqual({ move: remove, args: { index: 1 } });
    expect(conds.find((c) => c.words === "in study-big")?.remove).toBeNull();
  });

  it("know the answer's path, and where a level's condition goes", () => {
    expect(pathOf(DOC).map((s) => s.set)).toEqual(["scans", "visits", "people", "scope"]);
    expect(levelSet(DOC, "subject")).toBe("people");
    expect(levelSet(DOC, "stack")).toBe("scans");
    expect(levelSet(DOC, "event")).toBeNull();
  });
});

describe("a bar that narrows the question", () => {
  const axis = move(7, "add_axis_where", "scans", [
    { name: "axis", type: "axis", fillers: ["base"] },
    { name: "value", type: "value", fillers: ["FLAIR", "T1w", "T2w"] },
  ]);
  const plane = move(8, "add_axis_where", "scans", [
    { name: "axis", type: "axis", fillers: ["plane"] },
    { name: "value", type: "value", fillers: ["axial"] },
  ]);
  const where = move(9, "add_where", "scans", [
    { name: "field", type: "field", fillers: ["manufacturer", "slices"] },
    { name: "op", type: "op", fillers: ["=", "!="] },
    { name: "value", type: "value", optional: true },
  ]);
  const sex = move(3, "add_where", "people", [
    { name: "field", type: "field", fillers: ["sex"] },
    { name: "op", type: "op", fillers: ["="] },
    { name: "value", type: "value", optional: true },
  ]);

  it("is a scan kind on the base axis, a field's value on the answer, a sex on the subjects", () => {
    expect(narrowing("stacks", "T1w", "scans", opts("scans", "stack", [plane, axis]), "manufacturer")).toEqual({ set: "scans", move: axis, args: { axis: "base", value: "T1w" } });
    expect(narrowing("field", "Siemens", "scans", opts("scans", "stack", [where]), "manufacturer")).toEqual({ set: "scans", move: where, args: { field: "manufacturer", op: "=", value: "Siemens" } });
    expect(narrowing("people", "F", "people", opts("people", "subject", [sex]), "manufacturer")).toEqual({ set: "people", move: sex, args: { field: "sex", op: "=", value: "F" } });
  });

  it("is nothing for a missing value, a value the engine does not offer, a clinical kind, or a set without options", () => {
    expect(narrowing("stacks", null, "scans", opts("scans", "stack", [axis]), "manufacturer")).toBeNull();
    expect(narrowing("stacks", "DWI", "scans", opts("scans", "stack", [axis]), "manufacturer")).toBeNull();
    expect(narrowing("field", "Siemens", "scans", opts("scans", "stack", [where]), "vendor_model")).toBeNull();
    expect(narrowing("clinical", "EDSS", "scans", opts("scans", "stack", [where]), "manufacturer")).toBeNull();
    expect(narrowing("people", "F", null, null, "manufacturer")).toBeNull();
  });
});

describe("the pictures of an answer", () => {
  const preview = (level: string, columns: string[], rows: unknown[][]): Preview => ({ level, columns, rows, truncated: false, declaration: null });

  it("are a scan set's own keys at the record level, else a stack column, each once", () => {
    expect(stacksOf(preview("record", ["_key", "_subject"], [[11, 1], [12, 1], [11, 2]]), "stack")).toEqual([11, 12]);
    expect(stacksOf(preview("record", ["_key", "_subject", "stack"], [[5, 1, 40]]), "session")).toEqual([40]);
    expect(stacksOf(preview("count", ["rows", "subjects"], [[212, 48]]), "stack")).toEqual([]);
    expect(stacksOf(preview("record", ["_key"], Array.from({ length: 40 }, (_, i) => [i + 1])), "stack", 24)).toHaveLength(24);
  });

  it("ask the engine's own move to list the scans, where it offers it", () => {
    const out = move(2, "set_out", null, [
      { name: "set", type: "set", fillers: ["scans", "visits"] },
      { name: "level", type: "level", fillers: ["boolean", "count", "aggregate", "record"] },
    ]);
    expect(listingMove(opts("scans", "stack", [out]), "scans")).toEqual({ set: "scans", move: out, args: { set: "scans", level: "record" } });
    expect(listingMove(opts("scans", "stack", []), "scans")).toBeNull();
    expect(listingMove(opts("scans", "stack", [out]), "flair")).toBeNull();
  });
});
