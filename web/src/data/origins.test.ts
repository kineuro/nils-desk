// SPDX-License-Identifier: AGPL-3.0-only
// Where a scan's labels came from (UX round 2): the door's answer read, the
// visit a viewer asks it for, and each origin in words: the rules, a model, a
// person's decision, and a decision the sort has not applied yet.

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  axisWord,
  byStack,
  decidedLine,
  decisionLink,
  forgetOrigins,
  fromLine,
  heldAxes,
  hoverLine,
  originsFor,
  originsOf,
  originTitle,
  originWords,
  originTone,
  runLink,
  staleAxes,
  staleLine,
  staleTail,
  targetKey,
  targetOfScan,
  targetOfVisit,
  type AxisOrigin,
} from "./origins";

const SORTED = { pack: "mri", version: "1.4.0", overlay: null, job: 3, at: "2026-11-01T08:00:00Z" };

const rules: AxisOrigin = {
  axis: "body_part",
  values: ["spine"],
  confidence: 0.9,
  tier: "keyword",
  origin: "rules",
  line: "rules mri@1.4.0, body_part/spine_words",
  state: "current",
  words: null,
  rules: [{ rule_set: "body_part", rule: "spine_words", source: "series_description", value: "spine", matched: "spine" }],
  decided: null,
};

const unsorted: AxisOrigin = {
  ...rules,
  state: "unsorted",
  words: "decided neck; sorted before the decision",
  decided: { id: 77, kind: "person", scope: "stack", at: "2026-11-05T14:02:00Z", value: "neck", values: ["neck"], by: "anna@lab", campaign: { id: 6, name: "curate", status: "closed", item: 412, position: 3 } },
};

const model: AxisOrigin = {
  ...rules,
  values: ["brain"],
  tier: "decision",
  origin: "model",
  rules: [],
  from: { kind: "model", by: "bodypart@2.1", model: { id: 7, name: "bodypart", version: "2.1", label: "bodypart@2.1" } },
  decided: { id: 80, kind: "model", scope: "group", value: "brain", values: ["brain"], by: "bodypart@2.1", committed_by: "rae@lab", model: { id: 7, label: "bodypart@2.1", p: 0.97, run: 12 }, review_item: { id: 40, kind: "body_part:model" } },
};

const person: AxisOrigin = {
  ...rules,
  values: ["neck"],
  tier: "decision",
  origin: "decision",
  rules: [],
  from: { kind: "person", by: "anna@lab", campaign: 6, scope: "stack" },
  decided: unsorted.decided,
};

afterEach(() => {
  vi.unstubAllGlobals();
  forgetOrigins();
});

describe("the origins door's answer", () => {
  it("is read leniently, by stack and axis", () => {
    const o = originsOf({ count: 1, unsorted: 1, stacks: [{ stack: 5, sorted: SORTED, unsorted: true, axes: [unsorted, { values: ["x"] }] }, { stack: "x" }] });
    expect(o.stacks).toHaveLength(1);
    expect(o.unsorted).toBe(1);
    const axes = byStack(o).get(5)!;
    expect(axes.get("body_part")?.state).toBe("unsorted");
    expect(staleAxes(axes).map((a) => a.axis)).toEqual(["body_part"]);
    expect(heldAxes(o, 5)).toEqual({ body_part: "spine" });
    expect(heldAxes(o, 6)).toBeNull();
    // an engine's word the desk does not know reads as the rules' and current
    expect(originsOf({ stacks: [{ stack: 1, axes: [{ axis: "base", origin: "oracle", state: "odd" }] }] }).stacks[0].axes[0]).toMatchObject({ origin: "rules", state: "current", values: [] });
  });

  it("is asked once per visit and kept", async () => {
    const asked: string[] = [];
    vi.stubGlobal("fetch", (url: string) => {
      asked.push(url);
      return Promise.resolve(new Response(JSON.stringify({ count: 0, unsorted: 0, stacks: [] }), { status: 200 }));
    });
    await Promise.all([originsFor({ session: 34 }), originsFor({ session: 34 })]);
    await originsFor({ session: 34 });
    await originsFor({ studies: [5, 6] });
    expect(asked).toEqual(["/api/origins?session=34", "/api/origins?studies=5,6"]);
  });
});

describe("the visit a viewer asks for", () => {
  it("is the grid's visit key, or a scan's session, else its study, else the scan", () => {
    expect(targetOfVisit("s34")).toEqual({ session: 34 });
    expect(targetOfVisit("t5.6")).toEqual({ studies: [5, 6] });
    expect(targetOfVisit("x")).toBeNull();
    expect(targetOfScan({ id: 9, session: 34, study: 5 })).toEqual({ session: 34 });
    expect(targetOfScan({ id: 9, session: null, study: 5 })).toEqual({ studies: [5] });
    expect(targetOfScan({ id: 9, session: null })).toEqual({ stack: 9 });
    expect(targetKey({ studies: [5, 6] })).toBe("t5.6");
  });
});

describe("each origin in words", () => {
  it("names the rules' pack and rule", () => {
    expect(originTone(rules)).toBe("rules");
    expect(fromLine(rules, SORTED)).toBe("Rules mri@1.4.0 · body_part/spine_words");
    expect(staleTail(rules)).toBeNull();
    expect(decidedLine(rules)).toBeNull();
  });

  it("names a model, its run and its probability, and links the run", () => {
    expect(originTone(model)).toBe("model");
    expect(fromLine(model, SORTED)).toBe("Model bodypart@2.1 · run 12 · p 0.97");
    expect(decidedLine(model)).toBe("Committed by rae@lab");
    expect(runLink(model)).toEqual({ href: "#pipelines/runs/12", label: "Run 12" });
    expect(decisionLink(model)).toBeNull();
  });

  it("names who decided, and links the campaign's item", () => {
    expect(originTone(person)).toBe("decision");
    expect(fromLine({ ...person, state: "current" }, SORTED)).toMatch(/^Decided by anna@lab · 5 Nov/);
    expect(decidedLine({ ...person, state: "current" })).toBeNull();
    expect(decisionLink(person)).toEqual({ href: "#review/campaigns/6", label: "Campaign curate, item 412" });
  });

  it("says a decision the sort has not applied yet, on the label and in full", () => {
    expect(originTone(unsorted)).toBe("stale");
    expect(staleTail(unsorted)).toBe("decided neck");
    expect(staleLine(unsorted)).toBe("Decided neck; sorted before the decision");
    expect(decidedLine(unsorted)).toMatch(/^By anna@lab · 5 Nov/);
    expect(decisionLink(unsorted)?.label).toBe("Campaign curate, item 412");
    const withdrawn: AxisOrigin = { ...person, state: "withdrawn", decided: null };
    expect(originTone(withdrawn)).toBe("stale");
    expect(staleTail(withdrawn)).toBe("withdrawn");
  });

  it("names no one where a campaign not closed decided it", () => {
    const blind: AxisOrigin = { ...rules, state: "withheld", decided: { withheld: true, campaign: { id: 6, status: "open" } } };
    expect(originTone(blind)).toBe("withheld");
    expect(decisionLink(blind)).toBeNull();
    expect(decidedLine(blind)).toMatch(/not closed/);
  });

  it("puts a scan's labels on a card's hover, one line an axis", () => {
    const axes = new Map([
      ["body_part", unsorted],
      ["base", { ...rules, axis: "base", values: ["T2w"], rules: [{ rule_set: "base", rule: "t2_words" }] }],
    ]);
    // UX round 5, finding 8: a person's words, never the kind path or the rule's name
    expect(originTitle(axes, SORTED).split("\n")).toEqual([
      "Weighting: T2w · from the header (rules 1.4.0)",
      "Body part: spine · from the header (rules 1.4.0) · Decided neck; sorted before the decision",
    ]);
    expect(axisWord("body_part")).toBe("Body part");
  });

  it("says where a label came from in a person's words, for the hover", () => {
    expect(originWords(rules, SORTED)).toBe("from the header (rules 1.4.0)");
    expect(originWords(rules, null)).toBe("from the header (rules)");
    expect(originWords(model, SORTED)).toBe("model, 0.97 (run 12)");
    expect(originWords({ ...model, decided: { ...model.decided, model: { id: 7, label: "bodypart@2.1" } } }, SORTED)).toBe("model");
    expect(originWords({ ...person, state: "current" }, SORTED)).toBe("decided by anna@lab on 5 Nov");
    expect(originWords({ ...person, state: "current", from: { kind: "agent" }, decided: { ...person.decided, by: undefined } }, SORTED)).toBe("decided by an agent on 5 Nov");
    expect(originWords({ ...rules, origin: "none", values: [] }, SORTED)).toBe("nothing answered it");
    expect(hoverLine("Body part", model, SORTED)).toBe("Body part: brain · model, 0.97 (run 12)");
    expect(hoverLine("Contrast", { ...rules, axis: "post_contrast", values: ["yes"] }, SORTED)).toMatch(/^Contrast: .+ · from the header \(rules 1\.4\.0\)$/u);
  });
});
