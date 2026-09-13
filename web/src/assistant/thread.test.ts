// SPDX-License-Identifier: AGPL-3.0-only
// The thread's own rules: commands, and where an edit or a retry starts again.

import { describe, expect, it } from "vitest";
import type { Turn } from "./parts";
import { askedBefore, commandOf, commandsFor, lastAsked } from "./thread";

const turn = (id: string, role: Turn["role"], text = id): Turn => ({ id, role, text, done: true, tools: [] });

describe("the message box", () => {
  it("reads a slash and a name as a command, and a path as words", () => {
    expect(commandOf("/rename  Cohort A counts ")).toEqual({ name: "rename", rest: "Cohort A counts", known: true });
    expect(commandOf("/new")).toEqual({ name: "new", rest: "", known: true });
    expect(commandOf("/nope")).toEqual({ name: "nope", rest: "", known: false });
    expect(commandOf("/data/scans holds what?")).toBeNull();
    expect(commandOf("how many subjects?")).toBeNull();
  });

  it("offers the commands a half-typed name could be, and none once the name is done", () => {
    expect(commandsFor("/").map((c) => c.name)).toEqual(["new", "fork", "rename", "status", "help"]);
    expect(commandsFor("/re").map((c) => c.name)).toEqual(["rename"]);
    expect(commandsFor("/rename cohorts")).toEqual([]);
    expect(commandsFor("cohorts")).toEqual([]);
  });
});

describe("an edit or a retry", () => {
  it("starts again from the person's message the answer replied to, or the last one", () => {
    const turns = [turn("u1", "user"), turn("a1", "assistant"), turn("u2", "user"), turn("a2", "assistant"), turn("s", "system")];
    expect(askedBefore(turns, "a2")?.id).toBe("u2");
    expect(askedBefore(turns, "a1")?.id).toBe("u1");
    expect(askedBefore(turns, "u1")).toBeNull();
    expect(lastAsked(turns)?.id).toBe("u2");
    expect(lastAsked([])).toBeNull();
  });
});
