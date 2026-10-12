// SPDX-License-Identifier: AGPL-3.0-only
// A count the engine held back (record 55 K7, small counts at plain): it
// reads held back, the same words wherever it is, with why on hover; never 0, "null" or NaN, and never in
// a sum.

import { describe, expect, it } from "vitest";
import { countIn, countText, countUnit, heldCell, heldColumns, HELD_WHY, sumCounts } from "./held";

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
