// SPDX-License-Identifier: AGPL-3.0-only
// The map's layers in the desk's own words (record 55, decision 6: the data
// map's layers): what the map doors answer of a layer, read; each value its
// one colour among the theme's, the same wherever it is drawn; a visit drawn
// by the value of the scan it takes, else by what most of its scans are;
// and the layer's step said over the dataset or cohort.

import { describe, expect, it } from "vitest";
import { stepOf } from "./mapLayers.fixture";
import {
  LAYERS,
  layerHeadOf,
  layerOrder,
  layerSlot,
  layerStepWords,
  layerWord,
  mapLayerOf,
  mapOf,
  stripDrawn,
  stripsOf,
  subjectsOf,
  visitDrawn,
  visitLayerOf,
  visitLayerWords,
} from "./mainScans";

describe("the layers", () => {
  it("offers the kinds first, then body region, body part and post-contrast", () => {
    expect(LAYERS.map((l) => l.words)).toEqual(["Kinds", "Body region", "Body part", "Post-contrast"]);
    expect(LAYERS[0].key).toBeNull();
  });

  it("gives every value one colour among the theme's, the same on every layer it is on, and a value it does not know a free one", () => {
    expect(layerSlot("body_region", "head")).toBe(1);
    expect(layerSlot("body_region", "spine")).toBe(3);
    expect(layerSlot("body_part", "spine")).toBe(3);
    expect(layerSlot("body_part", "brain")).toBe(1);
    // post-contrast as Data's grid colours contrast: without blue, with orange
    expect(layerSlot("post_contrast", "pre")).toBe(1);
    expect(layerSlot("post_contrast", "post")).toBe(2);
    expect(layerSlot("post_contrast", "")).toBeNull();
    expect(layerSlot("post_contrast", null)).toBeNull();
    const known = new Set([1, 2, 3, 4, 5, 6, 7, 10]);
    expect(known.has(layerSlot("body_region", "pelvis") as number)).toBe(false);
    expect(layerSlot("body_region", "pelvis")).toBe(layerSlot("body_region", "pelvis"));
  });

  it("says a value in words and lists values in the layer's order, one it does not know last", () => {
    expect(layerWord("body_part", "brain-neck")).toBe("brain and neck");
    expect(layerWord("post_contrast", "by_definition")).toBe("by definition");
    expect(layerWord("body_region", "pelvis")).toBe("pelvis");
    expect(layerOrder("body_region", ["spine", "pelvis", "head", "spine"])).toEqual(["head", "spine", "pelvis"]);
  });

  it("reads the map's layer, its step as the scope's own page carries it, and nothing where none was asked", () => {
    const step = stepOf("body_part", { state: "done", answered: 1200 });
    const map = mapOf({
      role: "t1w",
      kinds: [],
      metrics: {},
      columns: [],
      layer: {
        layer: "body_region",
        operation: "body_part",
        values: [
          { value: "head", visits_with: 10, visits_taken: 8, scans: 40, visits_taken_before: 7 },
          { value: "spine", visits_with: 2, visits_taken: 1, scans: 3 },
        ],
        none: { visits: 1, scans: 5, taken: 0, taken_before: 1 },
        step,
      },
    });
    expect(map.layer).toEqual({
      layer: "body_region",
      operation: "body_part",
      values: [
        { value: "head", visits_with: 10, visits_taken: 8, visits_taken_before: 7, scans: 40 },
        { value: "spine", visits_with: 2, visits_taken: 1, visits_taken_before: null, scans: 3 },
      ],
      none: { visits: 1, scans: 5, taken: 0, taken_before: 1 },
      prior_72h: null,
      step,
    });
    expect(mapOf({ role: "t1w" }).layer).toBeNull();
    // a layer the desk does not know, or a step it cannot read, is not read
    expect(mapLayerOf({ layer: "colour", values: [] })).toBeNull();
    expect(mapLayerOf({ layer: "post_contrast", values: [], none: {}, prior_72h: 2, step: { step: "post_contrast", state: "sideways" } })).toMatchObject({ operation: "post_contrast", prior_72h: 2, step: null });
  });

  it("reads a visit's scans on the layer and each candidate's value, and a page's and the strips' layer", () => {
    const page = subjectsOf({
      total: 1,
      subjects: [
        {
          subject_id: 1,
          subject: "c0de",
          visits: [{ visit: 1, kind: "3D MPRAGE", stacks: [5], candidates: [{ stacks: [5], kind: "3D MPRAGE", layer: "post" }, { stacks: [6], kind: "2D SE", layer: null }], layer: { taken: "post", scans: { post: 2, pre: 1, by_definition: 0 }, none: 1, prior_72h: 1 } }],
        },
      ],
      layer: { layer: "post_contrast", operation: "post_contrast", values: ["pre", "post"] },
    });
    const v = page.subjects[0].visits[0];
    expect(v.layer).toEqual({ taken: "post", scans: [{ value: "post", count: 2 }, { value: "pre", count: 1 }], none: 1, prior_72h: 1 });
    expect(v.candidates?.map((c) => c.layer)).toEqual(["post", null]);
    expect(page.layer).toEqual({ layer: "post_contrast", operation: "post_contrast", values: ["pre", "post"] });
    // without a layer, a candidate says nothing of one
    expect(subjectsOf({ subjects: [{ subject_id: 1, visits: [{ candidates: [{ stacks: [5] }] }] }] }).subjects[0].visits[0]).toMatchObject({ layer: null, candidates: [{ stacks: [5] }] });
    expect("layer" in (subjectsOf({ subjects: [{ subject_id: 1, visits: [{ candidates: [{ stacks: [5] }] }] }] }).subjects[0].visits[0].candidates?.[0] ?? {})).toBe(false);
    const strips = stripsOf({ kinds: ["3D MPRAGE"], subjects: [{ subject_id: 1, column: 0, visits: [0, -1], layer: { taken: [1, -1], held: [1, 0] } }], layer: { layer: "body_region", values: ["head", "spine"] } });
    expect(strips.subjects[0].layer).toEqual({ taken: [1, -1], held: [1, 0] });
    expect(strips.layer).toEqual({ layer: "body_region", operation: "body_part", values: ["head", "spine"] });
    expect(stripsOf({ subjects: [{ subject_id: 1, visits: [0] }] }).subjects[0]).not.toHaveProperty("layer");
    expect(layerHeadOf({ values: ["head"] })).toBeNull();
  });

  it("draws a visit by the value of the scan it takes, filled; else by what most of its scans are, outlined; else nothing", () => {
    const v = visitLayerOf({ taken: "spine", scans: { head: 3, spine: 1 }, none: 0 })!;
    expect(visitDrawn(v)).toEqual({ value: "spine", taken: true });
    expect(visitDrawn(visitLayerOf({ taken: null, scans: { head: 1, spine: 3 }, none: 2 })!)).toEqual({ value: "spine", taken: false });
    expect(visitDrawn(visitLayerOf({ taken: null, scans: {}, none: 4 })!)).toBeNull();
    const head = { layer: "body_region" as const, operation: "body_part" as const, values: ["head", "spine"] };
    const l = { taken: [0, -1, -1], held: [0, 1, -1] };
    expect([0, 1, 2, 3].map((j) => stripDrawn(head, l, j))).toEqual([{ value: "head", taken: true }, { value: "spine", taken: false }, null, null]);
  });

  it("says a visit's scans on the layer in one line, the 72-hour flag where it is up", () => {
    expect(visitLayerWords("body_region", visitLayerOf({ taken: "head", scans: { spine: 2, head: 10 }, none: 1 })!)).toBe("13 scans: head 10, spine 2; 1 with no answer");
    expect(visitLayerWords("post_contrast", visitLayerOf({ taken: "pre", scans: { pre: 1 }, none: 0, prior_72h: 1 })!)).toBe("1 scan: pre 1; contrast in the 72 hours before");
  });

  it("says whether the layer's step has run over the dataset or the cohort", () => {
    const cohort = { kind: "cohort" as const, name: "ms-followup" };
    const dataset = { kind: "dataset" as const, name: "study-big" };
    expect(layerStepWords("body_region", cohort, stepOf("body_part"))).toEqual({ words: "Body part has not run on this cohort.", ran: false });
    expect(layerStepWords("post_contrast", dataset, stepOf("post_contrast", { state: "done", answered: 1200, of: 1300 }))).toEqual({ words: "Post-contrast has run on this dataset · 1,200 of 1,300 answered.", ran: true });
    expect(layerStepWords("body_part", dataset, stepOf("body_part", { state: "running" })).words).toBe("Body part runs on this dataset now; the layer fills in as it answers.");
    expect(layerStepWords("body_part", dataset, stepOf("body_part", { state: "queued" })).words).toBe("Body part waits its turn on this dataset.");
    expect(layerStepWords("body_part", dataset, stepOf("body_part", { state: "failed" })).words).toBe("Body part failed on this dataset the last time it ran.");
    expect(layerStepWords("body_part", dataset, stepOf("body_part", { state: "off", served: false })).words).toBe("Body part is not available here, so it has not run on this dataset.");
    expect(layerStepWords("body_part", dataset, null).ran).toBe(false);
  });
});
