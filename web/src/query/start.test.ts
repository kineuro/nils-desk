// SPDX-License-Identifier: AGPL-3.0-only
// What Start a query starts from and what each needs (gate T31, walkthrough
// step 14.7): the pure parts. A saved selection and a kept result are chosen
// from lists, a list of IDs is pasted with its type; each is the engine's
// start door's own `from`, and a list of IDs asks the upload door first.

import { describe, expect, it } from "vitest";
import { DoorError, type HandleRow } from "../ask/client";
import { startBody } from "../ask/start";
import { caps7a } from "../../test/safeWayIn";
import type { Grant } from "../grants";
import type { SelectionRow } from "./selections";
import { idsRefusal, pastedIds, resultWords, selectionRef, selectionWords, startableResults, startFrom, startRefusal, startsFromIds, startsFromResult, startsFromSelection, unmatchedWords } from "./start";

const selection = (over: Partial<SelectionRow> = {}): SelectionRow => ({
  id: 3,
  name: "high-field",
  spec: "selection:high-field@2",
  description: null,
  versions: 2,
  grain: "stack",
  owner: "astrid",
  created_at: "2026-10-01T10:00:00Z",
  updated_at: null,
  updated_by: null,
  note: null,
  cohort: null,
  size: { rows: 1204, grain: "stack", version: 2, handle: 71, at: "2026-10-02T10:00:00Z", truncated: false },
  ...over,
});

const handle = (over: Partial<HandleRow> = {}): HandleRow => ({
  id: 71,
  name: "north T1w",
  grain: "stack",
  row_count: 250,
  content_hash: "x",
  principal: "astrid",
  actor: {},
  created_at: "",
  epoch: 4,
  pack_version: "0.1.1",
  disclosure: "local",
  truncated: false,
  limit: null,
  kept: true,
  last_read_at: null,
  withdrawn_at: null,
  ask_hash: "h",
  columns: ["_key"],
  ...over,
});

describe("what a new question starts from", () => {
  const none = { cohorts: "", selection: "", handle: null };

  it("is the start door's own `from`", () => {
    expect(startFrom("nothing", none)).toEqual({ kind: "nothing" });
    expect(startFrom("cohorts", { ...none, cohorts: "north, south  east" })).toEqual({ kind: "cohorts", cohorts: ["north", "south", "east"] });
    expect(startFrom("selection", { ...none, selection: "high-field@2" })).toEqual({ kind: "selection", selection: "high-field@2" });
    expect(startFrom("handle", { ...none, handle: 71 })).toEqual({ kind: "handle", handle: 71 });
  });

  it("is nothing yet while a choice is missing, and for a list of IDs until it is uploaded", () => {
    expect(startFrom("cohorts", none)).toBeNull();
    expect(startFrom("cohorts", { ...none, cohorts: " , " })).toBeNull();
    expect(startFrom("selection", none)).toBeNull();
    expect(startFrom("handle", none)).toBeNull();
    expect(startFrom("values", { ...none, cohorts: "north" })).toBeNull();
  });

  it("asks the start door in its words, a list by the upload's own id", () => {
    expect(startBody({ kind: "selection", selection: selectionRef(selection()) })).toEqual({ from: { selection: "high-field@2" } });
    expect(startBody({ kind: "handle", handle: 71 })).toEqual({ from: { handle: 71 } });
    expect(startBody({ kind: "values", upload: "u-0123456789abcdef" })).toEqual({ from: { values: "u-0123456789abcdef" } });
  });
});

describe("the lists to choose from", () => {
  it("names a saved selection by its name and the version listed, with how big its newest answer was", () => {
    expect(selectionRef(selection())).toBe("high-field@2");
    expect(selectionWords(selection())).toBe("high-field · v2 · 1,204 stacks");
    expect(selectionWords(selection({ size: null }))).toBe("high-field · v2 · not run yet");
  });

  it("offers a kept result that has its rows, is not withdrawn and was not cut off, newest first", () => {
    const all = [handle({ id: 70 }), handle({ id: 74 }), handle({ id: 72, kept: false }), handle({ id: 73, withdrawn_at: "2026-10-03T10:00:00Z" }), handle({ id: 75, truncated: true }), handle({ id: 76, row_count: null })];
    expect(startableResults(all).map((h) => h.id)).toEqual([74, 70]);
  });

  it("names a kept result by its name, grain and rows", () => {
    expect(resultWords(handle())).toBe("north T1w · stack · 250 rows");
    expect(resultWords(handle({ name: null, grain: "session", row_count: 1 }))).toBe("Result 71 · session · 1 row");
  });
});

describe("what a person may start from", () => {
  const SEL = ["GET /api/ask/selections"];
  const RES = ["GET /api/ask/handles"];
  const IDS = ["POST /api/ask/values"];

  it("offers a saved selection and a kept result where the engine lists them to a person who may see queries", () => {
    expect(startsFromSelection(caps7a(SEL))).toBe(true);
    expect(startsFromSelection(caps7a([]))).toBe(false);
    expect(startsFromSelection(caps7a(SEL, ["data:see"]))).toBe(false);
    expect(startsFromResult(caps7a(RES))).toBe(true);
    expect(startsFromResult(caps7a([]))).toBe(false);
    expect(startsFromResult(caps7a(RES, ["data:see"]))).toBe(false);
  });

  it("offers a list of IDs where the engine takes one, and says in words why a person may not use it", () => {
    expect(startsFromIds(caps7a(IDS))).toBe(true);
    expect(startsFromIds(caps7a([]))).toBe(false);
    expect(idsRefusal(caps7a(IDS))).toBeNull();
    const work = ["query:see", "data:see"] as Grant[];
    expect(idsRefusal(caps7a(IDS, work))).toBe("A list of IDs needs work on the Query page.");
    // work on the Query page at plain detail: the upload is quasi
    const plain = caps7a(IDS, ["query:see", "query:work"]);
    plain.person.detail = "plain";
    expect(idsRefusal(plain)).toBe("A list of IDs asks to see sex and age in records.");
  });
});

describe("a list of IDs", () => {
  it("is the pasted IDs once each and their type, nothing until both are there", () => {
    expect(pastedIds("study-id", "a1\nb2, a1;c3\n")).toEqual({ type: "study-id", values: ["a1", "b2", "c3"] });
    expect(pastedIds("", "a1")).toBeNull();
    expect(pastedIds("study-id", " \n ,")).toBeNull();
  });

  it("says how many matched no subject, and says nothing when every one matched", () => {
    expect(unmatchedWords({ n: 184, unresolved: [] })).toBeNull();
    expect(unmatchedWords({ n: 184, unresolved: [3, 9, 40, 41] })).toBe("4 of 184 IDs matched no subject.");
    expect(unmatchedWords({ n: 2, unresolved: [0, 1] })).toBe("None of the 2 IDs matched a subject.");
    expect(unmatchedWords({ n: 1, unresolved: [0] })).toBe("The ID matched no subject.");
  });
});

describe("a refused start", () => {
  it("says what the engine says is wrong with the opening document, not only that it is refused", () => {
    const issue = { code: "unknown_set", path: "sets.people.from", message: "upload u-0123456789abcdef is not known; uploads live only until resolved", next: "POST /api/ask/values again" };
    expect(startRefusal(new DoorError(400, { error: "the opening document", issues: [issue, { message: "an uploaded list resolves to subjects" }] }))).toBe(
      "the opening document: upload u-0123456789abcdef is not known; uploads live only until resolved; an uploaded list resolves to subjects",
    );
    expect(startRefusal(new DoorError(404, { error: "no selection high-field@9" }))).toBe("no selection high-field@9");
    expect(startRefusal(new DoorError(403, { error: "an uploaded list needs query:work", issues: [] }))).toBe("an uploaded list needs query:work");
    expect(startRefusal(new DoorError(500, {}))).toBe("the door answered 500");
    expect(startRefusal(new Error("network down"))).toBe("network down");
    expect(startRefusal("odd")).toBe("odd");
  });
});
