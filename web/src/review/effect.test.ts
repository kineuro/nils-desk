// SPDX-License-Identifier: AGPL-3.0-only
// A change's effect (record 56, 5.4) read from the rehearse door's answer:
// every part of the report made even, its line ("Moves 50 scans · base T2w
// → FLAIR, 47 scans · fixes 47, breaks 3"), where it lands, the main scans,
// Review and the names in a line each, and whether it breaks an answer we
// know, which its card must say (5.6). An answer missing a part reads as
// nothing, never as a crash.

import { describe, expect, it } from "vitest";
import { answersWords, breaks, effectLine, effectOf, namesWords, picksWords, reachWords, reviewWords, rolesOf, tallyWords, topTransitions, transitionWords } from "./effect";
import { EFFECT_RAW, EFFECT_SCOPED_RAW } from "./rules.fixture";

describe("the effect report", () => {
  const e = effectOf(EFFECT_RAW);

  it("reads every part the door answers", () => {
    expect(e.pack).toBe("mri@1.2.0");
    expect(e.moved).toBe(50);
    expect(e.scope).toMatchObject({ replayed: "pack", stacks: 1003, sealed_left_out: 4 });
    expect(e.axes[0].transitions[0]).toMatchObject({ from: "T2w", to: "FLAIR", stacks: 47, datasets: { "study-big": 40, "ward-c": 7 }, makes: { SIEMENS: 29, GE: 18 } });
    expect(e.axes[0].transitions[0].examples[0]).toEqual({ stack: 3101, names: { before: { name: "T2w_TSE", bids: "sub-x_T2w_TSE" }, after: { name: "FLAIR_TSE", bids: "sub-x_FLAIR_TSE" } } });
    expect(e.names).toMatchObject({ descriptive: 50, bids: 50 });
    expect(e.names.examples[1].before.bids).toBeNull();
    expect(e.picks).toMatchObject({ occasions: 412, moved: 17, why: null });
    expect(e.review).toEqual({ before: 7, after: 4, by_kind: [{ kind: "base:missing", appear: 0, disappear: 3 }] });
    expect(e.answers).toMatchObject({ fixes: 47, breaks: 3, net: 44 });
    expect(e.answers.right_to_wrong).toHaveLength(3);
    expect(e.ships).toEqual({ as: "rules release", pack: "mri", version: "1.2.1", from: "1.2.0" });
    expect(e.cases).toEqual({ held: true, failures: null });
    expect(e.seconds).toBe(0.9);
  });

  it("says it in a line: what moves, the largest moves, what it does to the answers we know", () => {
    expect(effectLine(e)).toBe("Moves 50 scans · base T2w → FLAIR, 47 scans · base nothing → FLAIR, 3 scans · 17 main scans change · fixes 47, breaks 3");
    expect(transitionWords(topTransitions(e, 1)[0])).toBe("base T2w → FLAIR, 47 scans");
    expect(answersWords(e.answers)).toBe("fixes 47, breaks 3");
  });

  it("says where it lands: a new rules version for everyone, or only its scope", () => {
    expect(reachWords(e.ships)).toBe("A new rules version, mri 1.2.1 (from 1.2.0), for everyone");
    expect(reachWords(effectOf(EFFECT_SCOPED_RAW).ships)).toBe("Only dataset study-big, on mri 1.2.0");
  });

  it("says the names, the main scans and Review in a line each", () => {
    expect(namesWords(e.names)).toBe("50 names and 50 BIDS names change");
    expect(picksWords(e.picks)).toBe("17 picks move of 412 · 2 borders raised · 4 settled");
    expect(reviewWords(e.review)).toBe("Scans asked: 7 → 4");
    expect(rolesOf(e.picks).map((r) => [r.role, r.counts.moved])).toEqual([
      ["flair", 15],
      ["t2w", 2],
    ]);
    expect(tallyWords({ a: 1, b: 5, c: 3, d: 2 })).toBe("b 5, c 3, d 2, +1 more");
    expect(tallyWords({ "(none)": 3 })).toBe("none 3");
  });

  it("knows a change that breaks an answer we know, and one that breaks none", () => {
    expect(breaks(e)).toBe(true);
    expect(breaks(effectOf(EFFECT_SCOPED_RAW))).toBe(false);
  });

  it("reads an answer missing its parts as nothing", () => {
    const empty = effectOf({ picks: { models: [], why: "the pack declares no picks" } });
    expect(empty.moved).toBe(0);
    expect(empty.axes).toEqual([]);
    expect(effectLine(empty)).toBe("Moves nothing · no settled answer to measure it on");
    expect(picksWords(empty.picks)).toBe("Main scans not replayed: the pack declares no picks");
    expect(reviewWords(empty.review)).toBe("Review unchanged: 0 scans asked");
    expect(namesWords(empty.names)).toBe("No name changes");
    expect(effectOf(null).ships.as).toBe("rules release");
  });
});

describe("the answers a change breaks or fixes", () => {
  it("are grouped by what changed alike, each group with every scan, the largest first", async () => {
    const { caseGroups, caseWords } = await import("./effect");
    const groups = caseGroups([
      { stack: 1, axis: "base", answer: "T2w", before: "T2w", after: "FLAIR" },
      { stack: 2, axis: "technique", answer: "SE", before: "SE", after: "" },
      { stack: 3, axis: "base", answer: "T2w", before: "T2w", after: "FLAIR" },
    ]);
    expect(groups).toEqual([
      { axis: "base", answer: "T2w", before: "T2w", after: "FLAIR", stacks: [1, 3] },
      { axis: "technique", answer: "SE", before: "SE", after: "", stacks: [2] },
    ]);
    expect(groups.map(caseWords)).toEqual(["base T2w → FLAIR, settled T2w", "technique SE → nothing, settled SE"]);
  });
});
