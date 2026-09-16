// SPDX-License-Identifier: AGPL-3.0-only
// The words the desk keeps for a tag (record 28). The policy is the engine's
// and is asserted where it lives; what is asserted here is that the desk has a
// word for every tag the engine serves, that the five the DICOM standard names
// nothing say so rather than carry a name someone made up, and that a tag this
// dictionary has never heard of degrades to no name at all rather than to a
// guess. The policy read here is the one the engine serves.

import { describe, expect, it } from "vitest";
import served from "../../test/fixtures/pseudonymize_tags.json";
import type { TagPolicy } from "./policy";
import { NAMES, nameOf, normaliseTag } from "./tags";

const policy = served as unknown as TagPolicy;

/** Every tag the door names anywhere: the ones it acts on, the code, and the two never removed. */
const everyServedTag = [...policy.tags.map((t) => t.tag), policy.code.tag, ...policy.mandatory.map((m) => m.tag)];

describe("the words the desk keeps for a tag", () => {
  it("has a word for every tag the engine serves", () => {
    const noWord = everyServedTag.filter((t) => nameOf(t) === undefined);
    expect(noWord).toEqual([]);
    expect(everyServedTag.length).toBe(policy.count + 1 + policy.mandatory.length);
  });

  it("says of the tags the standard names nothing that it names them nothing, rather than leaving them out", () => {
    // absent from the dictionary would read as a gap in the desk; null is a fact about the standard
    expect(everyServedTag.filter((t) => nameOf(t) === null)).toEqual(["0008,106E", "0012,0088", "0012,0089", "0012,0090", "0012,0091"]);
    expect(Object.prototype.hasOwnProperty.call(NAMES, "0012,0088")).toBe(true);
  });

  it("degrades honestly for a tag it has never heard of", () => {
    // no name at all, which a row shows as a gap in the words; what becomes of the tag is the door's to say
    expect(nameOf("0099,0001")).toBeUndefined();
    expect(nameOf("0010,0010")).toBe("PatientName");
    expect(nameOf("0008,106E")).toBeNull();
  });

  it("holds words and nothing else: no category, no fate, no count", () => {
    for (const [tag, name] of Object.entries(NAMES)) {
      expect(tag).toMatch(/^[0-9A-F]{4},[0-9A-F]{4}$/u);
      expect(name === null || typeof name === "string").toBe(true);
    }
  });

  it("reads a tag as the engine writes it", () => {
    expect(normaliseTag(" 0008,1030 ")).toBe("0008,1030");
    expect(normaliseTag("0010,21a0")).toBe("0010,21A0");
    expect(normaliseTag("0010-0010")).toBeNull();
    expect(normaliseTag("10,10")).toBeNull();
  });
});
