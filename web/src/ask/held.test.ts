// SPDX-License-Identifier: AGPL-3.0-only
// A count the engine held back (record 55 K7, small counts at plain): it
// reads held back, the same words wherever it is, with why on hover; never 0, "null" or NaN, and never in
// a sum.

import { describe, expect, it } from "vitest";
import { DoorError } from "./client";
import { countIn, countText, countUnit, heldCell, heldColumns, heldList, heldRefusal, HELD_WHY, LIST_WHY, sumCounts } from "./held";

describe("a held count", () => {
  it("reads held back, in figures otherwise", () => {
    expect(countText(null)).toBe("held back");
    expect(countText(1497)).toBe("1,497");
    expect(countText(0)).toBe("0");
    expect(countUnit(null, "subjects")).toBe("subjects held back");
    expect(countUnit(1, "subjects")).toBe("1 subject");
    expect(countUnit(12, "rows")).toBe("12 rows");
  });
  it("is null wherever the engine sent no number, never 0 or NaN", () => {
    expect(countIn(null)).toBeNull();
    expect(countIn(undefined)).toBeNull();
    expect(countIn(Number.NaN)).toBeNull();
    expect(countIn("3")).toBeNull();
    expect(countIn(0)).toBe(0);
  });
  it("is never summed: a total beside a held count is held too", () => {
    expect(sumCounts([3, 4])).toBe(7);
    expect(sumCounts([3, null, 4])).toBeNull();
    expect(sumCounts([])).toBe(0);
  });
  it("reads the answer's held_back, with the engine's why", () => {
    const why = "fewer than 5, or held beside a count of fewer than 5 so that it is not found by subtraction";
    const held = heldColumns({ held_back: [{ column: "rows", why }, { column: "subjects" }, { why: "no column" }, { column: "rows", why: "again" }] });
    expect([...held]).toEqual([
      ["rows", why],
      ["subjects", HELD_WHY],
    ]);
    expect(heldColumns({}).size).toBe(0);
    expect(heldColumns(null).size).toBe(0);
    expect(heldCell(why)).toBe("held back");
    expect(heldCell("a group under 5 subjects")).toBe("held back");
  });
});

describe("a list held back whole (record 55 K7, small lists)", () => {
  const LIST = "a list of fewer than 5 subjects that a quasi identifying field chose; its length is a count, so no row is shown";
  it("is an answer with no row whose columns are held back as a list, or a run or handle whose row_count is null", () => {
    const held = { columns: ["code", "age"], rows: [], held_back: [{ column: "code", why: LIST }, { column: "age", why: LIST }] };
    expect(heldList(held)).toBe(LIST);
    expect(heldList({ handle: 7, row_count: null, rows: [], pages: 0, columns: [] })).toBe(LIST_WHY);
    // none listed is an empty answer, not a held one; a held count is a value, not a list
    expect(heldList({ rows: [], row_count: 0, held_back: [] })).toBeNull();
    expect(heldList({ rows: [[null, null]], held_back: [{ column: "rows", why: "fewer than 5, or held beside a count" }] })).toBeNull();
    expect(heldList({ rows: [], held_back: [{ column: "mean", why: "a group under 5 subjects" }] })).toBeNull();
    expect(heldList(null)).toBeNull();
  });
  it("is what the engine's 409 means when a set, a start or a cohort reads its handle", () => {
    expect(heldRefusal(new DoorError(409, { error: `handle 7 holds no rows: its answer was ${LIST}, at the detail it was asked at` }))).toBe(true);
    expect(heldRefusal(new DoorError(409, { error: "the answer is stale" }))).toBe(false);
    expect(heldRefusal(new DoorError(404, { error: "handle 7 holds no rows" }))).toBe(false);
    expect(heldRefusal(new Error("holds no rows"))).toBe(false);
  });
});
