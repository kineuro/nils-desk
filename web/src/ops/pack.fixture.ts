// SPDX-License-Identifier: AGPL-3.0-only
// The pipeline pack's doors as the engine answers them (openapi v7, record 57
// P1 to P4, Wave 7b spec 5.5 to 5.7): a version's pack, a pre-flight with the
// units it judged, a run whose units say who chose each knob, and its numbers
// per comparability key, for the tests and the layout check. Every name and
// number here is made up.

import type { PackDoc, RunNumbers } from "./client";
import type { Preflight, RunDetail, UnitRun } from "./runs";

export const KEY_A = `sha256:${"a1".repeat(32)}`;
export const KEY_B = `sha256:${"b2".repeat(32)}`;

/** The SAMSEG example pack of the spec (5.2), as GET /api/pipelines/{id}/pack answers it. */
export const PACK_DOC: PackDoc = {
  pipeline: "samseg-lesions@2",
  pipeline_id: 5,
  pack: {
    nils_pack: 1,
    pipeline: { name: "samseg-lesions", descriptor_sha256: `sha256:${"88".repeat(32)}`, version: "0.1" },
    goals: { goal: ["fast", "standard", "research"], lesions: ["on", "off"] },
    knobs: {
      lesion: { what: "segment white-matter lesions from the FLAIR beside the T1w", comparability: "breaks", set_by: "rule" },
      pallidum_separate: { what: "segment the pallidum apart from the white matter", comparability: "breaks", set_by: "rule" },
      threshold: { default: 0.3, comparability: "breaks", set_by: "fixed" },
      threads: { what: "the threads one session uses", comparability: "none", set_by: "person" },
    },
  },
  pack_digest: `sha256:${"7d".repeat(32)}`,
  version_digest: `sha256:${"6e".repeat(32)}`,
  facts: ["flair.present", "t1w.dimension", "t1w.field_strength_t", "aligned:flair:t1w"],
  breaking_knobs: ["lesion", "pallidum_separate", "threshold"],
  goals: { goal: ["fast", "standard", "research"], switches: { lesions: ["on", "off"] }, defaults: { goal: "standard", lesions: "on" } },
  rules: [
    { id: "lesions-follow-the-switch", when: "lesions == 'off'", set: { lesion: "off" }, why: "the person turned lesions off", source: "policy" },
    { id: "lesions-off-without-flair", when: "not present(flair)", set: { lesion: "off" }, why: "no FLAIR, so no lesions", source: "SAMSEG's documentation" },
    { id: "pallidum-needs-t2-or-flair", when: "not present(flair) and not present(t2w)", set: { pallidum_separate: false }, why: "on a T1w alone the pallidum cannot be told from the white matter", source: "SAMSEG's wiki" },
  ],
  checks: [{ metric: "flair_t1_brain_dice", check: "flair_t1_brain_dice >= 0.85", action: "flag", source: "policy" }],
};

/** The pipeline the pack belongs to, as the catalog lists it. */
export const SAMSEG_PIPELINE = {
  id: 5,
  name: "samseg-lesions",
  version: "2",
  label: "samseg-lesions@2",
  image: `ghcr.io/example/samseg@sha256:${"4b".repeat(32)}`,
  layout: "bids",
  level: "session",
  state: "active",
  parameters: [
    { id: "lesion", name: "Lesions", type: "String", "value-choices": ["on", "off"], "default-value": "on" },
    { id: "pallidum_separate", name: "Pallidum apart", type: "Flag", "default-value": true },
    { id: "threshold", name: "Lesion threshold", type: "Number", "default-value": 0.3 },
    { id: "threads", name: "Threads", type: "Number", integer: true, minimum: 1, maximum: 16, "default-value": 4 },
  ],
  outputs: [{ id: "volumes", kind: "table", columns: [{ name: "intracranial", unit: "mm3" }, { name: "lesion_volume", unit: "mm3" }, { name: "flair_t1_brain_dice" }] }],
  roles: ["t1w", "flair"],
};

/** A pre-flight of the pack: 9 run, 2 skipped for want of a 3D T1, 1 routed. */
export const PRE_PACK: Preflight = {
  pipeline: "samseg-lesions@2",
  pipeline_id: 5,
  handle: 4,
  selection: "selection:study@3",
  params: { lesion: "on", pallidum_separate: true, threshold: 0.3, threads: 4 },
  layout: "bids",
  level: "session",
  unit: "session",
  stacks: 24,
  units: { total: 12, ready: 12, missing: 0 },
  missing: [],
  cannot: [],
  estimate: { seconds_per_unit: 2700, source: "descriptor", seconds: 32400 },
  gpu: { need: "none", available: null, device: null },
  ready: true,
  blockers: [],
  requirements: [
    { check: "runtime", ok: true, said: "podman 5.4.2", failure: null },
    { check: "licence", ok: true, said: "the terms of freesurfer@8.1.0 were accepted by astrid@site", failure: null },
  ],
  units_judged: {
    units: [
      { unit: "sub-a01_ses-1", status: "ready", knobs: { lesion: { value: "on", by: "default" } } },
      { unit: "sub-a02_ses-1", status: "skipped", need: "t1w: dimension == '3D'", words: "the T1 is 2D; SAMSEG reads its contrasts on one 3D grid" },
      { unit: "sub-a03_ses-1", status: "routed", variant: { variant: "t1-only", pipeline: "samseg@2", rule: "no-flair-goes-t1-only", why: "no FLAIR picked" } },
    ],
    ready: 9,
    skipped: 2,
    routed: 1,
    cannot_tell: 1,
    with_caveats: 3,
    skipped_by_why: [{ why: "the T1 is 2D; SAMSEG reads its contrasts on one 3D grid", units: 2 }],
    pack_digest: `sha256:${"7d".repeat(32)}`,
  },
  person: { goal: null, switches: {}, let_run: false },
};

const unit = (name: string, more: Partial<UnitRun>): UnitRun => ({
  unit: name,
  state: "over",
  status: "succeeded",
  attempts: 1,
  device: "cpu",
  exit_code: 0,
  started_at: "2026-10-20T08:00:00Z",
  finished_at: "2026-10-20T08:45:00Z",
  pack_status: "ready",
  keys: { comparability: KEY_A, result: `sha256:${"c3".repeat(32)}` },
  ...more,
});

const KNOBS = {
  lesion: { value: "on", by: "default" },
  pallidum_separate: { value: true, by: "default" },
  threshold: { value: 0.3, by: "fixed" },
  threads: { value: 8, by: "person:astrid@site" },
};

/** A run whose units say who chose each knob, the caveats, a flag, a skip in the pack's words, a route, and two keys. */
export const RUN_PACK: RunDetail = {
  id: 41,
  pipeline_id: 5,
  pipeline: "samseg-lesions@2",
  job_id: 71,
  handle_id: 4,
  selection: "selection:study@3",
  status: "done",
  started_at: "2026-10-20T08:00:00Z",
  finished_at: "2026-10-20T09:10:00Z",
  runtime: "podman",
  device: "cpu",
  summary: { units: { total: 4, succeeded: 3, failed: 0, skipped: 1 }, numbers: { tables: { files: 3, rows: 3, missing_columns: ["volumes: lesion_volume"], refused_values: [], rows_naming_no_unit: 0 }, measures: 6, checks: { declared: 1, breaches: 1, unchecked: 0 } }, flags: 1 },
  units_run: [
    unit("sub-a01_ses-1", { knobs: KNOBS, caveats: [{ role: "t1w", need: "t1w: field_strength_t >= 1.5", words: "the T1 was acquired below 1.5 T", source: "policy" }] }),
    unit("sub-a02_ses-1", {
      knobs: { ...KNOBS, lesion: { value: "off", by: "rule:lesions-off-without-flair", rule: "lesions-off-without-flair", facts: { "flair.present": false } }, pallidum_separate: { value: false, by: "rule:pallidum-needs-t2-or-flair", rule: "pallidum-needs-t2-or-flair" } },
      keys: { comparability: KEY_B, result: `sha256:${"d4".repeat(32)}` },
    }),
    unit("sub-a03_ses-1", { knobs: KNOBS, flags: [{ metric: "flair_t1_brain_dice", value: 0.79, threshold: 0.85, op: ">=", check: "flair_t1_brain_dice >= 0.85", action: "flag", words: "FLAIR and T1 may not be aligned: their brain masks agree below 0.85", source: "policy" }] }),
    unit("sub-a04_ses-1", { status: "skipped", pack_status: "skipped", need: "t1w: dimension == '3D'", words: "the T1 is 2D; SAMSEG reads its contrasts on one 3D grid", lacks: ["the T1 is 2D; SAMSEG reads its contrasts on one 3D grid"], knobs: null, keys: { comparability: null, result: null }, finished_at: null }),
  ],
};

/** The run's numbers: two comparability keys, never summed. */
export const NUMBERS_TWO: RunNumbers = {
  run: 41,
  keys: [
    { comparability_key: KEY_A, short: "a1a1a1a1a1a1", units: 2, measures: { intracranial: { count: 2, sum: 2_900_000, mean: 1_450_000, unit: "mm3" }, flair_t1_brain_dice: { count: 2, sum: 1.69, mean: 0.845, unit: null } }, caveats: [{ unit: "sub-a01_ses-1", caveats: [{ words: "the T1 was acquired below 1.5 T" }] }] },
    { comparability_key: KEY_B, short: "b2b2b2b2b2b2", units: 1, measures: { intracranial: { count: 1, sum: 1_380_000, mean: 1_380_000, unit: "mm3" } }, caveats: [] },
  ],
  pooled: false,
  words: "these results hold 2 comparability keys (a1a1a1a1a1a1, b2b2b2b2b2b2): they are answered per key and never summed together, since results of different tools, versions, variants or settings that break comparability do not compare",
  unkeyed: 0,
  unkeyed_measures: 0,
  measures: 6,
};

/** A segcsvd run with no FLAIR: its table lacks the FLAIR's columns, and the numbers door names what it made. */
export const SEGCSVD_PIPELINE = {
  id: 9,
  name: "segcsvd",
  version: "1",
  label: "segcsvd@1",
  image: `ghcr.io/example/segcsvd@sha256:${"9e".repeat(32)}`,
  layout: "bids",
  level: "session",
  state: "active",
  parameters: [],
  outputs: [{ id: "wmh", kind: "table", columns: [{ name: "wmh_volume", unit: "mm3" }, { name: "flair_wmh_volume", unit: "mm3" }, { name: "pvs_count" }, { name: "scanner", type: "text" }] }],
};

export const SEGCSVD_SUMMARY = { units: { total: 3, succeeded: 3 }, numbers: { tables: { files: 3, rows: 3, missing_columns: ["wmh: flair_wmh_volume", "wmh: flair_wmh_volume", "wmh: flair_wmh_volume"], refused_values: [], rows_naming_no_unit: 0 }, measures: 9, checks: { declared: 0, breaches: 0, unchecked: 0 } } };

export const SEGCSVD_NUMBERS: RunNumbers = {
  run: 52,
  keys: [{ comparability_key: KEY_A, short: "a1a1a1a1a1a1", units: 3, measures: { wmh_volume: { count: 3, sum: 12_000, mean: 4_000, unit: "mm3" }, pvs_count: { count: 3, sum: 300, mean: 100, unit: null } } }],
  pooled: true,
  words: null,
  unkeyed: 0,
  unkeyed_measures: 0,
  measures: 9,
};
