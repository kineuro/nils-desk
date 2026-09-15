// SPDX-License-Identifier: AGPL-3.0-only
// A share as the desk words it and draws it.

import { describe, expect, it } from "vitest";
import { audienceWords, guardWords, matching, namesOf, readsWords, turnsOf } from "./shares";

describe("a share", () => {
  it("names its audience and who opened it in words", () => {
    expect(audienceWords({ audience: "desk", people: [] })).toBe("everyone on this desk");
    expect(audienceWords({ audience: "people", people: [{ subject: "bo", display: "Bo" }] })).toBe("Bo");
    expect(
      audienceWords({
        audience: "people",
        people: [
          { subject: "bo", display: "Bo" },
          { subject: "cy", display: null },
          { subject: "di", display: "Di" },
        ],
      }),
    ).toBe("Bo, cy and 1 more");
    expect(readsWords(undefined)).toBe("Nobody has opened it yet");
    expect(readsWords([{ subject: "cy", display: "Cy", first_at: "", last_at: "", count: 2 }])).toBe("Opened by Cy");
    expect(guardWords(null)).toBeNull();
    expect(guardWords({ class: "sensitive", words: "sensitive values" })).toBe("It may have read sensitive values; a person who does not see them in records is refused.");
  });

  it("names people from the desk's directory before the names it was given", () => {
    const name = namesOf([{ subject: "cy", display: "Cy Lund" }]);
    expect(name("cy", "cy")).toBe("Cy Lund");
    expect(name("bo", "Bo")).toBe("Bo");
    expect(name("di")).toBe("di");
    expect(readsWords([{ subject: "cy", display: "cy", first_at: "", last_at: "", count: 1 }], name)).toBe("Opened by Cy Lund");
  });

  it("finds people by name or subject", () => {
    const people = [
      { subject: "anna", display: "Anna Berg" },
      { subject: "bo", display: "Bo" },
    ];
    expect(matching(people, " berg").map((p) => p.subject)).toEqual(["anna"]);
    expect(matching(people, "BO").map((p) => p.subject)).toEqual(["bo"]);
    expect(matching(people, "")).toEqual(people);
  });

  it("draws its snapshot as done turns with their steps, and its proposals by the turn that made them", () => {
    const { turns, proposals } = turnsOf([
      { id: "u1", role: "user", text: "the women", steps: [], proposals: [] },
      {
        id: "a1",
        role: "assistant",
        text: "31 are women.",
        steps: [
          { name: "nils_draft", failed: false },
          { name: "nils_preview", failed: true },
        ],
        proposals: [{ document: 12, parent: 7, sentence: "only women", decided: "accepted" }],
      },
    ]);
    expect(turns[1]).toEqual({
      id: "a1",
      role: "assistant",
      text: "31 are women.",
      done: true,
      tools: [
        { id: "a1-0", name: "nils_draft", state: "done" },
        { id: "a1-1", name: "nils_preview", state: "failed" },
      ],
    });
    expect(proposals).toEqual([{ document: 12, parent: 7, sentence: "only women", turn: "a1", decided: "accepted" }]);
  });
});
