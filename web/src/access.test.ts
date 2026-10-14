// SPDX-License-Identifier: AGPL-3.0-only
// What a control needs that a person does not hold, in words.

import { describe, expect, it } from "vitest";
import { needsWork, type Work } from "./access";
import type { Capabilities } from "./capabilities";
import type { Grant } from "./grants";

const holding = (grants: Grant[]): Capabilities => ({ person: { subject: "p", display_name: "p", grants, detail: "plain", groups: [] } }) as unknown as Capabilities;
const handling: Work[] = [
  ["data:work", "the Data page"],
  ["places:work", "the Places page"],
];

describe("what a control needs", () => {
  it("is nothing to say while the person holds the work of every page it needs", () => {
    expect(needsWork(holding(["query:work"]), "Keeping cards", [["query:work", "the Query page"]])).toBeNull();
    expect(needsWork(holding(["data:work", "places:work"]), "Changing how a source is handled", handling)).toBeNull();
  });

  it("names the one page whose work it needs", () => {
    expect(needsWork(holding(["query:see"]), "Keeping cards", [["query:work", "the Query page"]])).toBe("Keeping cards needs work on the Query page.");
  });

  it("names every page it needs, and the ones this person has no work on", () => {
    expect(needsWork(holding(["data:work", "places:see"]), "Changing how a source is handled", handling)).toBe(
      "Changing how a source is handled needs work on the Data page and on the Places page; this account has no work on the Places page.",
    );
    expect(needsWork(holding(["places:work", "data:see"]), "Changing how a source is handled", handling)).toMatch(/this account has no work on the Data page\.$/);
    expect(needsWork(holding([]), "Changing how a source is handled", handling)).toMatch(/this account has no work on the Data page or on the Places page\.$/);
  });

  it("never shows a grant as the parts spell it", () => {
    for (const grants of [[], ["data:see"], ["places:work"]] as Grant[][]) expect(needsWork(holding(grants), "Changing how a source is handled", handling)).not.toMatch(/:(see|work|use)\b/);
  });
});
