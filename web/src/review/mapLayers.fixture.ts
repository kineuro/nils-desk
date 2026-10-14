// SPDX-License-Identifier: AGPL-3.0-only
// The map's layers' made-up answers (record 55, decision 6: the data map's
// layers), shaped as the engine's map doors answer a `layer`: the cohort's
// map with each value's visits, a page of subjects whose visits and
// candidates carry their values, and the strips with each visit's value
// taken and held. The first subject's first visit takes a head scan, its
// second a spine scan; the second subject's one visit takes nothing, its
// scans mostly spine. Every name and number here is made up.

import type { SummaryStep } from "../data/summary";
import { STRIPS, mapAnswer, subjectsAnswer, type FakeAnswer, type FakeCall } from "./mainScans.fixture";

/** The doors a desk runs a step with, beside the Main scans ones. */
export const RUN_DOORS = ["POST /api/cohorts/{name}/steps/{step}/run", "POST /api/datasets/{name}/steps/{step}/run"];

/** The step that answers a layer over the cohort, as its own page carries it: served and not run yet, by default. */
export function stepOf(operation: "body_part" | "post_contrast", over: Partial<SummaryStep> = {}): SummaryStep {
  return {
    step: operation,
    state: "waiting",
    job: null,
    run: null,
    started_at: null,
    finished_at: null,
    progress: null,
    served: true,
    answered: 0,
    look: 0,
    of: 1300,
    jobs: [],
    refusal: null,
    ...over,
  };
}

const BODY = { values: ["head", "spine"], operation: "body_part" as const };
const CONTRAST = { values: ["pre", "post", "undetermined"], operation: "post_contrast" as const };

const head = (layer: string) => (layer === "post_contrast" ? CONTRAST : BODY);

/** The map's layer: each value's visits and scans, what carries none, and the step. */
export function mapLayer(layer: string, step: SummaryStep, draft = false) {
  const body = layer !== "post_contrast";
  const values = body
    ? [
        { value: "head", visits_with: 1080, visits_taken: 1040, scans: 9000 },
        { value: "spine", visits_with: 30, visits_taken: 2, scans: 140 },
      ]
    : [
        { value: "pre", visits_with: 1000, visits_taken: 900, scans: 6000 },
        { value: "post", visits_with: 420, visits_taken: 120, scans: 1800 },
        { value: "undetermined", visits_with: 90, visits_taken: 30, scans: 400 },
      ];
  return {
    layer,
    operation: head(layer).operation,
    values: draft ? values.map((v, i) => ({ ...v, visits_taken_before: v.visits_taken - (i === 0 ? 12 : 0) })) : values,
    none: { visits: 8, scans: 400, taken: 8, ...(draft ? { taken_before: 8 } : {}) },
    ...(body ? {} : { prior_72h: 3 }),
    step,
  };
}

/** A page of subjects whose visits and candidates carry their values on the layer. */
export function subjectsWithLayer(layer: string, step: SummaryStep) {
  const page = subjectsAnswer(2);
  const body = layer !== "post_contrast";
  const visits = [
    // subject 17: its first visit takes a head scan, its second a spine one
    body ? { taken: "head", scans: { head: 3 }, none: 2 } : { taken: "pre", scans: { pre: 4, post: 1 }, none: 0, prior_72h: 0 },
    body ? { taken: "spine", scans: { head: 1, spine: 2 }, none: 0 } : { taken: "post", scans: { pre: 2, post: 2 }, none: 0, prior_72h: 2 },
    // subject 18: its one visit, a person's pick, of a scan no answer reached; most of its scans spine
    body ? { taken: null, scans: { spine: 4 }, none: 1 } : { taken: null, scans: { undetermined: 3 }, none: 1, prior_72h: 0 },
  ];
  let i = 0;
  return {
    ...page,
    subjects: page.subjects.map((s) => ({
      ...s,
      visits: s.visits.map((v) => {
        const l = visits[i++];
        return { ...v, layer: l, candidates: v.candidates.map((c, j) => ({ ...c, layer: j === 0 ? l.taken : null })) };
      }),
    })),
    layer: { layer, operation: head(layer).operation, values: head(layer).values, step },
  };
}

/** The strips with each visit's value taken and held, as indexes into the layer's values. */
export function stripsWithLayer(layer: string, step: SummaryStep) {
  const body = layer !== "post_contrast";
  const marks: Record<number, { taken: number[]; held: number[] }> = body
    ? { 17: { taken: [0, 1], held: [0, 1] }, 18: { taken: [-1], held: [1] }, 19: { taken: [0, 0, -1], held: [0, 0, -1] } }
    : { 17: { taken: [0, 1], held: [0, 0] }, 18: { taken: [-1], held: [2] }, 19: { taken: [0, 2, -1], held: [0, 2, -1] } };
  return {
    ...STRIPS,
    subjects: STRIPS.subjects.map((s) => ({ ...s, layer: marks[s.subject_id] })),
    layer: { layer, operation: head(layer).operation, values: head(layer).values, step },
  };
}

/** The map doors asked for a layer, answering it with `step` for the step of each operation. */
export function layerDoors(steps: { body_part?: SummaryStep; post_contrast?: SummaryStep } = {}) {
  return (c: FakeCall): FakeAnswer => {
    const layer = c.body?.layer;
    if (c.method !== "POST" || typeof layer !== "string") return undefined;
    const operation = layer === "post_contrast" ? "post_contrast" : "body_part";
    const step = steps[operation] ?? stepOf(operation);
    const draft = c.body?.rules !== undefined;
    if (c.path === "/api/picks/map") return { status: 200, body: { ...mapAnswer(String(c.body?.role), draft), layer: mapLayer(layer, step, draft) } };
    if (c.path === "/api/picks/map/subjects") return { status: 200, body: subjectsWithLayer(layer, step) };
    if (c.path === "/api/picks/map/strips") return { status: 200, body: stripsWithLayer(layer, step) };
    return undefined;
  };
}
