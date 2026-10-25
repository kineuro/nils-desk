// SPDX-License-Identifier: AGPL-3.0-only
// What the engine answers for the Pipelines page without tabs, a workflow's
// plan, a workflow run and the provenance of a session (Wave 7b sections 8.1
// to 8.6), as the tests and the layout check draw them. Every name and
// number here is made up.

import type { Pipeline, Run } from "./catalog";
import type { Family, Provenance, WorkflowPlan, WorkflowRow, WorkflowRun } from "./client";
import type { RunDetail, UnitRun } from "./runs";

const IMG = (name: string, hex: string) => `ghcr.io/kineuro/${name}@sha256:${hex.repeat(32)}`;

const base = (id: number, name: string, version: string, more: Partial<Pipeline> = {}): Pipeline => ({
  id,
  name,
  version,
  label: `${name}@${version}`,
  image: IMG(name, (id % 16).toString(16).padStart(2, "0")),
  layout: "bids",
  level: "session",
  state: "active",
  standing: "current",
  roles: ["t1w", "flair"],
  ...more,
});

/** The catalog: the registration family's members, SAMSEG in two versions (one replaced), SynthSeg, segcsvd and N4. */
export const PIPELINES: Pipeline[] = [
  base(11, "ants", "1", { family: "registration", description: "ANTs rigid, within a session", outputs: [{ id: "flair_aligned", kind: "image" }, { id: "xfm", kind: "transform" }] }),
  base(12, "synthmorph", "1", { family: "registration", description: "SynthMorph, any contrast or slice thickness", outputs: [{ id: "flair_aligned", kind: "image" }, { id: "xfm", kind: "transform" }] }),
  base(5, "samseg-lesions", "3", { description: "SAMSEG with lesions", outputs: [{ id: "lesions", kind: "mask" }, { id: "volumes", kind: "table" }] }),
  base(2, "samseg-lesions", "2", { standing: "replaced", replaced_by: "samseg-lesions@3", replaced_why: "the header resampling went wrong on 2D FLAIR" }),
  base(6, "synthseg", "2", { roles: ["t1w"], outputs: [{ id: "labels", kind: "mask" }] }),
  base(7, "segcsvd", "2", { outputs: [{ id: "wmh", kind: "mask" }, { id: "pvs", kind: "mask" }], parameters: [{ id: "wmh_threshold", name: "WMH threshold", type: "Number", "default-value": 0.5, optional: true }, { id: "pvs_threshold", name: "PVS threshold", type: "Number", "default-value": 0.5, optional: true }] }),
  base(1, "n4", "1", { roles: ["t1w"], outputs: [{ id: "corrected", kind: "image" }] }),
];

export const FAMILIES: Family[] = [
  {
    family: true,
    name: "registration",
    version: "1",
    words: "Register a FLAIR to its T1w, visits to each other, or a T1w to a template; the rules pick the method per session.",
    digest: "a".repeat(64),
    roles: ["t1w", "flair"],
    goals: { goal: ["fast", "standard", "research"], switches: { task: ["within_session", "across_visits", "to_template"] } },
    tasks: { within_session: { level: "session", members: ["ants", "synthmorph"] }, across_visits: { level: "participant", members: ["robust"] }, to_template: { level: "session", members: ["ants", "synthmorph"] } },
    members: [
      { member: "ants", pipeline: "ants", method: "ANTs 2.6.2", pipeline_id: 11, label: "ants@1", level: "session", standing: "current" },
      { member: "synthmorph", pipeline: "synthmorph", method: "SynthMorph", pipeline_id: 12, label: "synthmorph@1", level: "session", standing: "current" },
      { member: "robust", pipeline: "robust", method: "mri_robust_register", pipeline_id: null, label: null, level: "participant", standing: null },
    ],
    rules: [{ id: "r1", when: "both 3D at 1.5 mm or finer", route: "ants", why: "both 3D at 1.5 mm or finer" }, { id: "r2", when: "else", route: "synthmorph", why: "2D or slices over 2.5 mm" }],
  },
];

export const FLAIR_LESIONS: WorkflowRow = {
  id: 1,
  name: "flair-lesions",
  version: "1",
  label: "flair-lesions@1",
  digest: "b".repeat(64),
  state: "active",
  origin: "starter",
  added_at: "2026-10-20T08:00:00Z",
  contract: "workflow/v1",
  workflow: {
    name: "flair-lesions",
    title: "FLAIR lesions",
    what: "Register the FLAIR to the T1w, segment lesions with SAMSEG, then white-matter hyperintensities and perivascular spaces with segcsvd over a SynthSeg of the T1w",
    steps: [
      { id: "register", family: "registration", version: "current", goal: "standard", switches: { task: "within_session" } },
      { id: "samseg", pipeline: "samseg-lesions", version: "current", goal: "standard", switches: { lesions: "on" } },
      { id: "synthseg", pipeline: "synthseg", version: "current", goal: "standard" },
      { id: "segcsvd", pipeline: "segcsvd", version: "current", goal: "standard", knobs: ["wmh_threshold", "pvs_threshold"] },
    ],
    links: [
      { from: "register.flair_aligned", to: "samseg.aligned_flair" },
      { from: "register.flair_aligned", to: "segcsvd.aligned_flair" },
      { from: "synthseg.labels", to: "segcsvd.synthseg" },
    ],
  },
};

export const CORTICAL: WorkflowRow = {
  id: 2,
  name: "cortical",
  version: "1",
  label: "cortical@1",
  state: "active",
  origin: "starter",
  workflow: { name: "cortical", title: "Cortical reconstruction", what: "N4, then recon-all", steps: [{ id: "n4", pipeline: "n4", version: "current" }, { id: "recon", pipeline: "recon-all", version: "current" }], links: [] },
};

export const WORKFLOWS: WorkflowRow[] = [FLAIR_LESIONS, CORTICAL];

const FLAIR_T = { kind: "image", role: "flair", contrast: "FLAIR", grid: "t1w" };
const MASK_T1 = { kind: "mask", grid: "t1w" };

/** The shipped workflow planned over a dataset's main scans: every link fed, the implicit need satisfied, runnable. */
export const PLAN: WorkflowPlan = {
  workflow: "flair-lesions@1",
  workflow_id: 1,
  name: "flair-lesions",
  version: "1",
  handle: 71,
  selection: "main@dataset:study-anon",
  steps: [
    { step: "register", of: "family", pipeline: "registration", pipeline_id: null, goal: "standard", switches: { task: "within_session" }, family: "registration", members: [{ member: "ants", pipeline: "ants@1", pipeline_id: 11 }, { member: "synthmorph", pipeline: "synthmorph@1", pipeline_id: 12 }], waits_for: [], waits_whole: [], preflight: { family: "registration", digest: "a".repeat(64), task: "within_session", level: "session", units: 4, counts: { ants: 3, synthmorph: 1 } } },
    { step: "samseg", of: "pipeline", pipeline: "samseg-lesions@3", pipeline_id: 5, goal: "standard", switches: { lesions: "on" }, waits_for: ["register"], waits_whole: ["register"], preflight: { units: { total: 4, ready: 4, missing: 0 }, ready: true, fed: { aligned_flair: "fed by step register" } } },
    { step: "synthseg", of: "pipeline", pipeline: "synthseg@2", pipeline_id: 6, goal: "standard", waits_for: [], waits_whole: [], preflight: { units: { total: 4, ready: 4, missing: 0 }, ready: true } },
    { step: "segcsvd", of: "pipeline", pipeline: "segcsvd@2", pipeline_id: 7, goal: "standard", knobs: { wmh_threshold: 0.5, pvs_threshold: 0.5 }, waits_for: ["register", "synthseg"], waits_whole: ["register", "synthseg"], preflight: { units: { total: 4, ready: 4, missing: 0 }, ready: true, fed: { aligned_flair: "fed by step register", synthseg: "fed by step synthseg" } } },
  ],
  links: [
    { link: "register.flair_aligned->samseg.aligned_flair", from: { step: "register", output: "flair_aligned", pipeline: "registration", type: FLAIR_T }, to: { step: "samseg", input: "aligned_flair", pipeline: "samseg-lesions@3", type: FLAIR_T }, verdict: "fed", words: "the registration's aligned FLAIR feeds samseg's aligned_flair and meets aligned(flair, t1w)" },
    { link: "register.flair_aligned->segcsvd.aligned_flair", from: { step: "register", output: "flair_aligned", pipeline: "registration", type: FLAIR_T }, to: { step: "segcsvd", input: "aligned_flair", pipeline: "segcsvd@2", type: FLAIR_T }, verdict: "fed", words: "the registration's aligned FLAIR feeds segcsvd's aligned_flair and meets aligned(flair, t1w)" },
    { link: "synthseg.labels->segcsvd.synthseg", from: { step: "synthseg", output: "labels", pipeline: "synthseg@2", type: MASK_T1 }, to: { step: "segcsvd", input: "synthseg", pipeline: "segcsvd@2", type: MASK_T1 }, verdict: "fed", words: "segcsvd's key carries synthseg@2 (robust, of the T1w)" },
    { link: null, from: null, to: { step: "samseg", input: null, pipeline: "samseg-lesions@3" }, verdict: "satisfied", words: "registration of FLAIR to T1w before SAMSEG meets SAMSEG's aligned(flair, t1w)", implicit: true },
  ],
  verdicts: { satisfied: 1, missing: 0, redundant: 0, refused: 0, fed: 3 },
  runnable: true,
  words: null,
};

/** A plan with every verdict once, over a document a person wrote by hand: N4 before SAMSEG, a T1w mask into a FLAIR input, SAMSEG with lesions and no registration, the family the catalog lacks. */
export const PLAN_ALL: WorkflowPlan = {
  workflow: "by-hand@1",
  workflow_id: 9,
  handle: 72,
  selection: "selection:ms-baseline@4",
  steps: [
    { step: "n4", of: "pipeline", pipeline: "n4@1", pipeline_id: 1, waits_for: [], waits_whole: [], preflight: { units: { total: 6, ready: 5, missing: 1 }, ready: true } },
    { step: "samseg", of: "pipeline", pipeline: "samseg-lesions@3", pipeline_id: 5, switches: { lesions: "on" }, waits_for: ["n4"], waits_whole: [], preflight: { units: { total: 6, ready: 6, missing: 0 }, ready: true } },
    { step: "lesions", of: "pipeline", pipeline: "lst-ai@1", pipeline_id: 8, waits_for: ["samseg"], waits_whole: ["samseg"], preflight: { units: { total: 6, ready: 0, missing: 6 }, ready: false, blockers: ["no unit can run: its mask input is of another type"] } },
    { step: "synthseg", of: "pipeline", pipeline: "synthseg@2", pipeline_id: 6, waits_for: [], waits_whole: [], preflight: { units: { total: 6, ready: 6, missing: 0 }, ready: true } },
    { step: "segcsvd", of: "pipeline", pipeline: "segcsvd@2", pipeline_id: 7, waits_for: ["synthseg"], waits_whole: ["synthseg"], preflight: { units: { total: 6, ready: 6, missing: 0 }, ready: true, fed: { synthseg: "fed by step synthseg" } } },
    { step: "reg", of: "family", pipeline: "cortical-registration", pipeline_id: null, refused: "the catalog holds no family cortical-registration", waits_for: [], waits_whole: [] },
  ],
  links: [
    { link: null, from: null, to: { step: "samseg", input: null }, verdict: "missing", words: "SAMSEG with lesions and no registration step: accepted only with its header-alignment check on", implicit: true },
    { link: "n4.corrected->samseg.t1w", from: { step: "n4", output: "corrected", type: { kind: "image", role: "t1w", contrast: "T1w" } }, to: { step: "samseg", input: "t1w", type: { kind: "image", role: "t1w" } }, verdict: "redundant", words: "N4 before SAMSEG is redundant: SAMSEG corrects bias itself" },
    { link: "samseg.lesions->lesions.flair_mask", from: { step: "samseg", output: "lesions", type: MASK_T1 }, to: { step: "lesions", input: "flair_mask", type: { kind: "mask", grid: "flair" } }, verdict: "refused", words: "a mask on t1w does not meet an input on flair" },
    { link: "synthseg.labels->segcsvd.synthseg", from: { step: "synthseg", output: "labels", type: MASK_T1 }, to: { step: "segcsvd", input: "synthseg", type: MASK_T1 }, verdict: "fed", words: "segcsvd's key carries synthseg@2 (robust, of the T1w)" },
    { link: null, from: null, to: { step: "segcsvd", input: null }, verdict: "satisfied", words: "a SynthSeg of the T1w before segcsvd meets its labels need", implicit: true },
  ],
  verdicts: { satisfied: 1, missing: 1, redundant: 1, refused: 1, fed: 1 },
  runnable: false,
  words: "step reg: the catalog holds no family cortical-registration; link samseg.lesions -> lesions.flair_mask: a mask on t1w does not meet an input on flair",
};

const run = (id: number, p: Pipeline, more: Partial<Run> = {}): Run => ({
  id,
  pipeline_id: p.id,
  pipeline: p.label,
  job_id: id + 60,
  selection: "main@dataset:study-anon",
  status: "done",
  started_at: `2026-10-21T0${(id % 9) + 1}:00:00Z`,
  finished_at: null,
  summary: { units: { total: 4, succeeded: 4 } },
  made: { units: 4, made: 4, failed: 0, skipped: 0, left: 0, nothing: false, why: [] },
  ...more,
} as Run);

/** The pipeline runs: the steps of workflow run 12, an older samseg run, and a run going. */
export const RUNS: Run[] = [
  run(42, PIPELINES[2], { status: "running", started_at: "2026-10-22T09:00:00Z", summary: { units: { total: 4, succeeded: 1 } }, made: null } as Partial<Run>),
  run(41, PIPELINES[2]),
  run(40, PIPELINES[0]),
  run(39, PIPELINES[4], { started_at: "2026-10-21T04:30:00Z" }),
  run(38, PIPELINES[5], { status: "partial", summary: { units: { total: 4, succeeded: 3, failed: 1 } }, made: { units: 4, made: 3, failed: 1, skipped: 0, left: 0, nothing: false, why: [{ status: "failed", why: "out of memory", units: 1 }] } } as Partial<Run>),
  run(33, PIPELINES[2], { started_at: "2026-10-12T10:00:00Z" }),
];

export const WORKFLOW_RUN: WorkflowRun = {
  id: 12,
  workflow: "flair-lesions@1",
  workflow_id: 1,
  job: 101,
  handle: 71,
  selection: "main@dataset:study-anon",
  status: "partial",
  started_at: "2026-10-21T01:00:00Z",
  finished_at: "2026-10-21T06:10:00Z",
  steps: [
    { step: "register", of: "family", pipeline: "registration", run: 40, status: "done", units: { total: 4, succeeded: 4, failed: 0, skipped: 0, reused: 0, unreported: 0 }, finished_at: "2026-10-21T02:00:00Z", waits_for: [], waits_whole: [] },
    { step: "samseg", of: "pipeline", pipeline: "samseg-lesions@3", run: 41, status: "done", units: { total: 4, succeeded: 2, failed: 0, skipped: 0, reused: 2, unreported: 0 }, finished_at: "2026-10-21T03:00:00Z", waits_for: ["register"], waits_whole: ["register"] },
    { step: "synthseg", of: "pipeline", pipeline: "synthseg@2", run: 39, status: "done", units: { total: 4, succeeded: 4, failed: 0, skipped: 0, reused: 0, unreported: 0 }, finished_at: "2026-10-21T04:40:00Z", waits_for: [], waits_whole: [] },
    { step: "segcsvd", of: "pipeline", pipeline: "segcsvd@2", run: 38, status: "partial", units: { total: 4, succeeded: 3, failed: 1, skipped: 0, reused: 0, unreported: 0 }, error: "1 unit failed: out of memory", finished_at: "2026-10-21T06:10:00Z", waits_for: ["register", "synthseg"], waits_whole: ["register", "synthseg"] },
  ],
  summary: { steps: 4, steps_total: 4, steps_done: 3, units: { total: 16, succeeded: 13, failed: 1, skipped: 0, reused: 2, unreported: 0 } },
  principal: "astrid@site",
  error: null,
};

export const WORKFLOW_RUN_GOING: WorkflowRun = {
  id: 13,
  workflow: "flair-lesions@1",
  workflow_id: 1,
  job: 104,
  handle: 73,
  selection: "selection:ms-baseline@4",
  status: "running",
  started_at: "2026-10-22T09:00:00Z",
  finished_at: null,
  steps: [
    { step: "register", of: "family", pipeline: "registration", run: 42, status: "running", units: { total: 4, succeeded: 1, failed: 0, skipped: 0, reused: 0, unreported: 0 }, waits_for: [], waits_whole: [] },
    { step: "samseg", of: "pipeline", pipeline: "samseg-lesions@3", run: null, status: "queued", units: null, waits_for: ["register"], waits_whole: ["register"] },
    { step: "synthseg", of: "pipeline", pipeline: "synthseg@2", run: null, status: "queued", units: null, waits_for: [], waits_whole: [] },
    { step: "segcsvd", of: "pipeline", pipeline: "segcsvd@2", run: null, status: "queued", units: null, waits_for: ["register", "synthseg"], waits_whole: ["register", "synthseg"] },
  ],
  summary: { steps: 4, steps_total: 4, steps_done: 0 },
  principal: "astrid@site",
  error: null,
};

export const WORKFLOW_RUNS: WorkflowRun[] = [WORKFLOW_RUN_GOING, WORKFLOW_RUN];

const unit = (name: string, more: Partial<UnitRun> = {}): UnitRun => ({ unit: name, state: "over", status: "succeeded", attempts: 1, device: "cpu", started_at: "2026-10-21T02:05:00Z", finished_at: "2026-10-21T02:40:00Z", pack_status: "ready", keys: { comparability: "c".repeat(64), result: "d".repeat(64) }, ...more });

/** The samseg step's units (run 41): one reused, one judged again against a different forecast and stale, one skipped with its input fed by no step, one plain. */
export const UNITS: UnitRun[] = [
  unit("sub-12_ses-20260112", { reused_from: 33, words_reused: "reused from run 33: the result key matched a kept result", judged_at: "start", forecast: { judged_at: "run", status: "ready", words: null }, curation: { state: "current" }, knobs: { lesions: { value: "on", by: "person:astrid@site" } } }),
  unit("sub-13_ses-20260113", { judged_at: "start", forecast: { judged_at: "run", status: "ready", words: null, caveats: [{ words: "cannot tell: aligned" }] }, words: "aligned by the registration step", curation: { state: "stale", words: "stale: the rules version on an input changed (mri 1.0.0 to 1.0.1)", changes: [{ pack: "mri", was: "1.0.0", now: "1.0.1" }] } }),
  unit("sub-14_ses-20260114", { status: "skipped", pack_status: "skipped", need: "aligned", words: "its FLAIR was not aligned: the unit failed in step register", lacks: ["no aligned FLAIR"], fed: { aligned_flair: "fed by no step for this unit: the unit failed in step register" }, reuse: { considered: [{ run: 33, unit: "sub-14_ses-20260114", reused: false, why: "its files fail their sha256" }] }, curation: { state: "unknown", words: "recorded before the door" } }),
  unit("sub-15_ses-20260115", { curation: { state: "current" } }),
];

/** The registration step's units (run 40, a family run): each routed to a member by a rule. */
export const FAMILY_UNITS: UnitRun[] = [
  unit("sub-12_ses-20260112", { pack_status: "routed", variant: { variant: "ants", pipeline: "ants@1", rule: "r1", why: "both 3D at 1.5 mm or finer" }, family: { name: "registration", digest: "a".repeat(64) }, curation: { state: "current" } }),
  unit("sub-13_ses-20260113", { pack_status: "routed", variant: { variant: "synthmorph", pipeline: "synthmorph@1", rule: "r2", why: "2D or slices over 2.5 mm" }, family: { name: "registration", digest: "a".repeat(64) }, curation: { state: "current" } }),
];

export const RUN_41: RunDetail = {
  id: 41,
  pipeline_id: 5,
  pipeline: "samseg-lesions@3",
  job_id: 102,
  handle_id: 71,
  selection: "main@dataset:study-anon",
  status: "done",
  started_at: "2026-10-21T02:00:00Z",
  finished_at: "2026-10-21T03:00:00Z",
  runtime: "podman",
  device: "cpu",
  units: "apart",
  units_run: UNITS,
  summary: { units: { total: 4, succeeded: 3, failed: 0, skipped: 1 }, derivatives: 6, numbers: { checks: { declared: 0, breaches: 0, unchecked: 0 } } },
  made: { units: 4, made: 3, failed: 0, skipped: 1, left: 0, nothing: false, why: [{ status: "skipped", why: "no aligned FLAIR", units: 1 }], line: "3 of 4 made · 1 skipped: no aligned FLAIR" },
} as unknown as RunDetail;

/** The provenance of one session: the four steps of workflow run 12, one stale, one reused, and one step withheld. */
export const PROVENANCE: Provenance = {
  of: { kind: "session", id: "13@20260113", subject: 13, session: "20260113" },
  stacks: [1041, 1042],
  steps: [
    { run: 40, pipeline: "ants@1", pipeline_id: 11, run_status: "done", finished_at: "2026-10-21T02:00:00Z", workflow_run: 12, step: "register", unit: "sub-13_ses-20260113", state: "over", status: "succeeded", keys: { comparability: "c".repeat(64), result: "d".repeat(64), short: "cccccccccccc" }, results: { derivatives: [{ id: 501, kind: "image", path: "sub-13/ses-20260113/anat/sub-13_ses-20260113_space-T1w_FLAIR.nii.gz" }, { id: 502, kind: "transform", path: "sub-13/ses-20260113/xfm/sub-13_ses-20260113_from-FLAIR_to-T1w_mode-image_xfm.mat" }], measures: { flair_t1_brain_dice: 0.91 } }, stacks: [1041, 1042], curation: { state: "current" } },
    { run: 41, pipeline: "samseg-lesions@3", pipeline_id: 5, run_status: "done", finished_at: "2026-10-21T03:00:00Z", workflow_run: 12, step: "samseg", unit: "sub-13_ses-20260113", state: "over", status: "succeeded", keys: { comparability: "e".repeat(64), result: "f".repeat(64), short: "eeeeeeeeeeee" }, results: { derivatives: [{ id: 511, kind: "mask", path: "sub-13/ses-20260113/anat/sub-13_ses-20260113_label-lesions_mask.nii.gz" }], measures: { lesion_volume: 1420, intracranial: 1452000 } }, stacks: [1041, 1042], curation: { state: "stale", words: "stale: the rules version on an input changed (mri 1.0.0 to 1.0.1)", changes: [{ pack: "mri", was: "1.0.0", now: "1.0.1" }] } },
    { run: 39, pipeline: "synthseg@2", pipeline_id: 6, run_status: "done", finished_at: "2026-10-21T04:40:00Z", workflow_run: 12, step: "synthseg", unit: "sub-13_ses-20260113", state: "over", status: "succeeded", keys: { comparability: "1".repeat(64), result: "2".repeat(64), short: "111111111111" }, results: { derivatives: [{ id: 521, kind: "mask", path: "sub-13/ses-20260113/anat/sub-13_ses-20260113_dseg.nii.gz" }], measures: {} }, stacks: [1041], curation: { state: "current" } },
    { run: 38, pipeline: "segcsvd@2", pipeline_id: 7, run_status: "partial", finished_at: "2026-10-21T06:10:00Z", workflow_run: 12, step: "segcsvd", unit: "sub-13_ses-20260113", state: "over", status: "succeeded", reused_from: 30, keys: { comparability: "3".repeat(64), result: "4".repeat(64), short: "333333333333" }, results: { derivatives: [{ id: 301, kind: "mask", path: "sub-13/ses-20260113/anat/sub-13_ses-20260113_label-WMH_mask.nii.gz", run: 30 }, { id: 302, kind: "mask", path: "sub-13/ses-20260113/anat/sub-13_ses-20260113_label-PVS_mask.nii.gz", run: 30 }], measures: { wmh_volume: 3100 }, from_run: 30 }, stacks: [1041, 1042], curation: { state: "current" } },
  ],
  counts: { steps: 4, stale: 1, unknown: 0 },
  stale_words: "1 result is stale: the rules version on an input changed since it ran",
  withheld: { steps: 1, why: "a stack of a sample sealed now" },
};

/** The doors the page and its pages read. */
export const WORKFLOW_DOORS = ["GET /api/pipelines", "GET /api/pipelines/family/{name}", "GET /api/pipeline-runs", "GET /api/pipeline-runs/{id}", "GET /api/workflows", "POST /api/workflows", "GET /api/workflows/{id}", "POST /api/workflows/{id}/plan", "POST /api/workflows/{id}/run", "GET /api/workflow-runs", "GET /api/workflow-runs/{id}", "GET /api/provenance/{kind}/{id}", "GET /api/jobs", "POST /api/jobs", "POST /api/jobs/{id}/cancel"];
