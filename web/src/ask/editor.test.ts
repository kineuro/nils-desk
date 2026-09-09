// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";
import type { DocumentHandle, Options } from "./client";
import { documentMoves, edit, editor, firstEmpty, movesForCell, partOf, project, sentence, setsOf, step } from "./editor";
import applied from "../../test/fixtures/apply.json";
import child from "../../test/fixtures/documents_get_child.json";
import root from "../../test/fixtures/documents_get.json";
import options from "../../test/fixtures/options.json";

const doc = root as unknown as DocumentHandle;
const opts = options as unknown as Options;

describe("the editor is derived from the document", () => {
  it("orders the sets the way the engine reads them: a source before what reads it, has children before the parent", () => {
    expect(setsOf(doc.ask)).toEqual(["scope", "people", "visits", "flair", "mp2rage", "both"]);
  });
  it("marks the clause groups present in the document as active and the offered ones as visible", () => {
    const s = step(doc.ask, "scope", opts);
    const parts = Object.fromEntries(s.parts.map((p) => [p.part, p]));
    expect(parts.where.active).toBe(true);
    expect(parts.where.valid).toBe(true);
    expect(parts.where.moves.map((m) => m.kind).sort()).toEqual(["add_where", "remove_where", "set_strict"]);
    expect(parts.has.active).toBe(false);
    expect(parts.has.visible).toBe(true);
    expect(parts.near.visible).toBe(false);
    expect(parts.out.active).toBe(false);
    expect(s.grain).toBe("cohort");
    expect(s.sentence).toBe("scope: cohorts; where name among {cohorts}.");
    expect(s.source).toBe("the registry");
  });
  it("offers the revert of the last where clause when the engine offers its removal", () => {
    const s = step(doc.ask, "scope", opts);
    const where = s.parts.find((p) => p.part === "where")!;
    expect(where.revert?.move.kind).toBe("remove_where");
    expect(where.revert?.args).toEqual({ index: 0 });
  });
  it("gives the answer set the out sub-step, and keeps the document's own moves apart", () => {
    const both = step(doc.ask, "both", null);
    expect(both.answers).toBe(true);
    expect(both.kept).toBe(true);
    expect(both.parts.find((p) => p.part === "out")!.active).toBe(true);
    expect(both.parts.find((p) => p.part === "has")!.active).toBe(true);
    expect(both.source).toBe("from visits");
    expect(documentMoves(opts).map((m) => m.kind)).toEqual(["add_set", "rename_set", "set_param", "keep_set"]);
    expect(both.parts.find((p) => p.part === "out")!.moves.map((m) => m.kind)).toEqual([]);
    expect(step(doc.ask, "both", { ...opts, set: "both" }).parts.find((p) => p.part === "out")!.moves.map((m) => m.kind)).toEqual(["set_out", "set_limit"]);
    expect(both.clauses.has).toEqual(["at least 1 flair", "at least 1 mp2rage"]);
    expect(partOf("set_param")).toBe("document");
  });
  it("opens the first set with nothing to filter and a filter to offer, else the answer", () => {
    const steps = editor(doc.ask, { scope: opts });
    // people has no where and no options fetched, so nothing is offered yet; the answer set is next
    expect(firstEmpty(steps)).toBe("both");
    const withPeople = editor(doc.ask, { scope: opts, people: { ...opts, set: "people", moves: opts.moves.map((m) => ({ ...m, set: m.set === "scope" ? "people" : m.set })) } });
    expect(firstEmpty(withPeople)).toBe("people");
  });
  it("carries the version chain as parent links the engine recorded", () => {
    expect((child as unknown as DocumentHandle).parent).toBe(doc.document);
    expect(applied.parent).toBe(doc.document);
    expect(applied.changed).toEqual([["scope", "scope: cohorts; where name among {cohorts} and name is known."]]);
  });
});

describe("every edit is a move the engine offered", () => {
  it("a cell click offers only the moves whose template has a hole the value can fill", () => {
    const offers = movesForCell([opts], "name", "ms-cohort-a");
    expect(offers.map((o) => [o.set, o.move.kind])).toEqual([["scope", "add_where"]]);
    expect(offers[0].args).toEqual({ field: "name", op: "=", value: "ms-cohort-a" });
    expect(movesForCell([opts], "not_a_field", 1)).toEqual([]);
    expect(movesForCell([opts], "owner", null)[0].args.op).toBe("is_null");
  });
  it("the audit line of a chip click and of a cell click have the same shape", () => {
    const offer = movesForCell([opts], "name", "ms-cohort-a")[0];
    const chip = edit("chip", 1, offer);
    const cell = edit("cell", 1, offer);
    const proposal = edit("proposal", 1, offer);
    expect(Object.keys(chip)).toEqual(Object.keys(cell));
    expect(Object.keys(chip)).toEqual(Object.keys(proposal));
    expect({ ...chip, origin: "cell" }).toEqual(cell);
    expect(chip.sentence).toBe("where name = ms-cohort-a");
  });
  it("fills a template from its holes and leaves an empty hole visible", () => {
    const m = opts.moves.find((x) => x.kind === "add_has")!;
    expect(sentence(m, { child: "people", min: 1 })).toBe("at least 1 and at most {max} people as {as}");
  });
});

describe("the projection preset keeps the named columns the result has", () => {
  it("never invents a column and leaves the result alone with no preset", () => {
    const cols = ["stack", "subject", "base", "rows"];
    expect(project(cols, "the named list")).toEqual(["subject", "stack", "base"]);
    expect(project(cols, null)).toEqual(cols);
    expect(project(["rows", "subjects"], "on request")).toEqual([]);
  });
});
