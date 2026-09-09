// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";
import { lineDiff, unified } from "./diff";

describe("the unified diff of two canonical texts", () => {
  it("is empty for a no-op edit", () => {
    expect(unified("a\nb\nc", "a\nb\nc")).toBe("");
    expect(unified("", "")).toBe("");
  });
  it("marks the changed lines with context and hunk headers", () => {
    const a = ["sets:", "  scope:", "    grain: cohort", "    where: []", "out:", "  level: rows"].join("\n");
    const b = ["sets:", "  scope:", "    grain: cohort", "    where: [[in, name, a]]", "out:", "  level: count"].join("\n");
    const d = unified(a, b, 1);
    expect(d.split("\n")).toEqual(["@@ -3,4 +3,4 @@", "     grain: cohort", "-    where: []", "+    where: [[in, name, a]]", " out:", "-  level: rows", "+  level: count"]);
  });
  it("diffs the whole text when one side is empty", () => {
    expect(lineDiff("", "x\ny")).toEqual([{ tag: "+", text: "x" }, { tag: "+", text: "y" }]);
    expect(unified("", "x")).toBe("@@ -1,0 +1,1 @@\n+x");
  });
});
