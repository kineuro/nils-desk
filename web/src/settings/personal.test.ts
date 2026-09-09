// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";
import { personalWords } from "./kvasir";

describe("the personal source's words (section 8.4)", () => {
  it("shows the forbidden provider's sentence and date, and the states of the offered one", () => {
    expect(personalWords({ provider: "anthropic", personal: "absent_by_policy", policy: { sentence: "the terms forbid it", date: "2026-02-20" }, brought_key: null, oauth: null })).toBe("Absent by policy: the terms forbid it (as of 2026-02-20).");
    expect(personalWords({ provider: "openai", personal: "offered", brought_key: null, oauth: null })).toMatch(/Not connected/u);
    expect(personalWords({ provider: "openai", personal: "offered", brought_key: { created_at: 1, rotated_at: null }, oauth: null })).toMatch(/sealed under your subject/u);
    expect(personalWords({ provider: "openai", personal: "offered", brought_key: null, oauth: { created_at: 1, refreshed_at: 2, expires_at: 3 } })).toMatch(/your own subscription, refreshed/u);
  });
});
