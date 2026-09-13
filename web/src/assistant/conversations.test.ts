// SPDX-License-Identifier: AGPL-3.0-only
// How a conversation is named in the side.

import { describe, expect, it } from "vitest";
import { titleOf } from "./client";

describe("a conversation's name", () => {
  it("is its first words, cut at a word", () => {
    expect(titleOf("Which scanners sent DWI?")).toBe("Which scanners sent DWI?");
    expect(titleOf("Sessions with a T1w after contrast within 30 days of a relapse, one per relapse")).toBe("Sessions with a T1w after contrast within 30…");
    expect(titleOf("   ")).toBe("A conversation");
  });
});
