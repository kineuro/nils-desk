// SPDX-License-Identifier: AGPL-3.0-only
// The Identity page's words: the ladder of what a person may do, when a person
// last signed in, where the desk answers, and a person added.

import { describe, expect, it } from "vitest";
import { LADDER, addRefusal, lastSeenWords, lit, reachWords, stepBelow, topStep, withAssist, withStep, type DeskUser } from "./identity";

describe("the ladder", () => {
  it("lights every step up to the highest a person holds", () => {
    expect(topStep(["reader", "assist"])).toBe("reader");
    expect(topStep(["operator", "reader"])).toBe("operator");
    expect(topStep(["assist"])).toBeNull();
    expect(LADDER.map((s) => lit(["reviewer"], s))).toEqual([true, true, false, false]);
    expect(LADDER.map((s) => lit([], s))).toEqual([false, false, false, false]);
  });

  it("keeps assist apart from the step chosen", () => {
    expect(withStep(["reader", "assist"], "operator")).toEqual(["operator", "assist"]);
    expect(withStep(["admin"], null)).toEqual([]);
    expect(withAssist(["reader"], true)).toEqual(["reader", "assist"]);
    expect(withAssist(["reader", "assist"], false)).toEqual(["reader"]);
    expect(stepBelow("reviewer")).toBe("reader");
    expect(stepBelow("reader")).toBeNull();
  });
});

describe("the words", () => {
  it("say when a person last signed in", () => {
    const now = Date.parse("2026-09-13T12:00:00Z");
    expect(lastSeenWords(null, now)).toBe("never");
    expect(lastSeenWords("2026-09-13T11:58:00Z", now)).toBe("now");
    expect(lastSeenWords("2026-09-13T11:20:00Z", now)).toBe("40 minutes ago");
    expect(lastSeenWords("2026-09-13T10:30:00Z", now)).toBe("an hour ago");
    expect(lastSeenWords("2026-09-13T09:00:00Z", now)).toBe("3 hours ago");
    expect(lastSeenWords("2026-09-12T09:00:00Z", now)).toBe("yesterday");
    expect(lastSeenWords("2026-09-10T09:00:00Z", now)).toBe("3 days ago");
  });

  it("say where the desk answers, and refuse a person added twice", () => {
    expect(reachWords("http://127.0.0.1:7200")).toEqual({ local: true, words: "Only this machine" });
    expect(reachWords("https://desk.example.org")).toEqual({ local: false, words: "This network, at https://desk.example.org" });
    const users: DeskUser[] = [{ username: "anna", display: "Anna", entitlements: ["admin"], admin: true, last_seen: null }];
    expect(addRefusal({ username: " ", password: "x" }, users)).toBe("a person has a username");
    expect(addRefusal({ username: "anna", password: "a long password" }, users)).toBe("a person named anna exists");
    expect(addRefusal({ username: "bo", password: "" }, users)).toBe("a person has a password");
    expect(addRefusal({ username: "bo", password: "a long password" }, users)).toBeNull();
  });
});
