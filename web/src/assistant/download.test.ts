// SPDX-License-Identifier: AGPL-3.0-only
// A conversation's markdown file is named by its title and the day it was saved.

import { describe, expect, it } from "vitest";
import { exportName } from "./download";

describe("a conversation's file", () => {
  it("is named by its title in plain words and the day", () => {
    const day = new Date("2026-09-14T10:00:00Z");
    expect(exportName("How many subjects does each cohort hold?…", day)).toBe("how-many-subjects-does-each-cohort-hold-2026-09-14.md");
    expect(exportName("Kohorter över tid", day)).toBe("kohorter-over-tid-2026-09-14.md");
    expect(exportName(null, day)).toBe("conversation-2026-09-14.md");
    expect(exportName("???", day)).toBe("conversation-2026-09-14.md");
    expect(exportName("x".repeat(80), day)).toBe(`${"x".repeat(60)}-2026-09-14.md`);
  });
});
