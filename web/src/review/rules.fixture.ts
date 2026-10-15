// SPDX-License-Identifier: AGPL-3.0-only
// The Rules page's engine for the tests and the layout check (record 56,
// sections 6.4 and 6.5): a pack with four axes, its rule sets and fields;
// two pairs of rules the pack cannot rank; and a change's effect as the
// rehearse door answers it, with transitions on two axes, names, picks by
// role, Review's questions and the answers people settled, three of which
// it breaks. Every name and number is made up.

export const PACK_RAW = {
  pack: "mri",
  version: "1.2.0",
  contract: 9,
  modality: "MR",
  flags: 140,
  axes: [
    {
      axis: "technique",
      multi: false,
      phase: "class",
      values: [
        { name: "SE", keywords: ["se"], list: "technique.SE" },
        { name: "TSE", keywords: ["tse", "fse"], list: "technique.TSE" },
        { name: "MDME", label: "SyMRI", keywords: ["mdme", "magic"], list: "technique.MDME" },
      ],
    },
    {
      axis: "base",
      multi: false,
      phase: "class",
      values: [
        { name: "T1w", keywords: ["t1"], list: "base.T1w" },
        { name: "T2w", keywords: ["t2"], list: "base.T2w" },
        { name: "FLAIR", keywords: ["flair"], list: "base.FLAIR" },
        { name: "PDw", keywords: ["pd"], list: "base.PDw" },
      ],
    },
    {
      axis: "body_part",
      multi: false,
      phase: "class",
      values: [
        { name: "brain", keywords: ["brain", "head"], list: "body_part.brain" },
        { name: "neck", keywords: ["neck"], list: "body_part.neck" },
        { name: "spine", keywords: ["spine", "cspine"], list: "body_part.spine" },
      ],
    },
    {
      axis: "post_contrast",
      multi: false,
      phase: "class",
      values: [
        { name: "given", keywords: ["gd", "+c"], list: "post_contrast.given" },
        { name: "not_given", keywords: [], list: null },
      ],
    },
  ],
  rule_sets: [
    { rule_set: "symri", rules: 6, decides: ["technique", "base"], entered: true },
    { rule_set: "technique", rules: 24, decides: ["technique"], entered: false },
    { rule_set: "base", rules: 31, decides: ["base"], entered: false },
    { rule_set: "body_part", rules: 12, decides: ["body_part"], entered: false },
  ],
  fields: { series_description: "text", protocol_name: "text", sequence_name: "text", slice_thickness: "number" },
  picks: [{ name: "main", roles: ["t1w", "flair", "t2w"] }],
  buckets: {},
  lists: ["technique.SE", "technique.TSE", "technique.MDME", "base.T1w", "base.T2w", "base.FLAIR", "base.PDw", "body_part.brain", "body_part.neck", "body_part.spine", "post_contrast.given"],
};

/** Two pairs the pack cannot rank (GET /api/packs/mri/disagreements). */
export const TIES = {
  pack: "mri",
  stacks: 14,
  pairs: [
    {
      pair: "base: base/named=FLAIR | base/named=T2w",
      axis: "base",
      why: ["one_rule"],
      sides: [
        { rule_set: "base", rule: "named", value: "FLAIR", tier: "keyword", confidence: 0.8 },
        { rule_set: "base", rule: "named", value: "T2w", tier: "keyword", confidence: 0.8 },
      ],
      stacks: 9,
      examples: [4101, 4102, 4103, 4104, 4105, 4106, 4107, 4108, 4109],
      versions: ["1.2.0"],
    },
    {
      pair: "body_part: body_part/neck_words=neck | body_part/spine_words=spine",
      axis: "body_part",
      why: ["priority_tie"],
      sides: [
        { rule_set: "body_part", rule: "neck_words", value: "neck", tier: "keyword", confidence: 0.7 },
        { rule_set: "body_part", rule: "spine_words", value: "spine", tier: "keyword", confidence: 0.7 },
      ],
      stacks: 5,
      examples: [5201, 5202, 5203, 5204, 5205],
      versions: ["1.1.0", "1.2.0"],
    },
  ],
};

const tr = (from: string, to: string, stacks: number, datasets: Record<string, number>, examples: number[], names?: [string, string]) => ({
  from,
  to,
  stacks,
  datasets,
  sites: { "(none)": stacks },
  makes: { SIEMENS: Math.ceil(stacks * 0.6), GE: Math.floor(stacks * 0.4) },
  scanners: { "S#####": stacks },
  examples: examples.map((stack) => ({ stack, names: names ? { before: { name: names[0], bids: `sub-x_${names[0]}` }, after: { name: names[1], bids: `sub-x_${names[1]}` } } : null })),
});

/** What adding "dark fluid" to base FLAIR does: 47 T2w and 3 empty base answers become FLAIR, three settled answers break. */
export const EFFECT_RAW = {
  pack: "mri@1.2.0",
  patch: {
    operations: [{ op: "add_words", axis: "base", value: "FLAIR", words: ["dark fluid"], field: "series_description", scope: "pack", reason: "dark fluid is FLAIR", evidence: "written on the Rules page" }],
    applied: [{ at: 1, op: "add_words", scope: "pack", changes: ["base.FLAIR: + dark fluid"], files: ["axes/base.yml"] }],
    files: ["axes/base.yml"],
    cases: { held: true, failures: null },
  },
  ships: { as: "rules release", pack: "mri", version: "1.2.1", from: "1.2.0" },
  scope: { replayed: "pack", stacks: 1003, sealed_left_out: 4, by_operation: [{ at: 1, op: "add_words", scope: "pack", stacks: 1003 }] },
  replay: "the rules, the decisions in force, ...",
  moved: { stacks: 50 },
  axes: [
    {
      axis: "base",
      moved: 50,
      held_by_decision: 2,
      transitions: [tr("T2w", "FLAIR", 47, { "study-big": 40, "ward-c": 7 }, [3101, 3102, 3103, 3104, 3105], ["T2w_TSE", "FLAIR_TSE"]), tr("", "FLAIR", 3, { "study-big": 3 }, [3201, 3202, 3203])],
    },
  ],
  names: {
    descriptive: { changed: 50 },
    bids: { changed: 50 },
    examples: [
      { stack: 3101, before: { name: "T2w_TSE", bids: "sub-x_T2w" }, after: { name: "FLAIR_TSE", bids: "sub-x_FLAIR" } },
      { stack: 3201, before: { name: "TSE", bids: null }, after: { name: "FLAIR_TSE", bids: "sub-x_FLAIR" } },
    ],
  },
  picks: {
    scheme: "default",
    occasions: 412,
    kept: 395,
    changed: 12,
    removed: 2,
    added: 3,
    moved: 17,
    held_by_a_person: 1,
    borders: { raised: 2, settled: 4, still: 9 },
    models: [
      {
        model: "main",
        occasions: 412,
        kept: 395,
        changed: 12,
        removed: 2,
        added: 3,
        moved: 17,
        held_by_a_person: 1,
        borders: { raised: 2, settled: 4, still: 9 },
        by_role: {
          flair: { occasions: 140, kept: 125, changed: 12, removed: 0, added: 3, moved: 15, held_by_a_person: 1, borders: { raised: 1, settled: 3, still: 4 } },
          t2w: { occasions: 136, kept: 134, changed: 0, removed: 2, added: 0, moved: 2, held_by_a_person: 0, borders: { raised: 1, settled: 1, still: 5 } },
        },
        examples: [],
      },
    ],
  },
  review: { stacks_asked: { before: 7, after: 4 }, by_kind: [{ kind: "base:missing", appear: 0, disappear: 3 }] },
  answers: {
    measured_on: "the rules' own answer, before any decision, pass or vote; an axis the rules left empty is unanswered",
    sets: [{ name: "person decisions in force", holds: "the answers people gave", answers: 1200, sealed_left_out: 6 }],
    fixes: 47,
    breaks: 3,
    net: 44,
    by_axis: {
      base: { answers: 600, right_to_wrong: 3, wrong_to_right: 44, unanswered_to_right: 3, unanswered_to_wrong: 0, right_to_unanswered: 0, wrong_to_unanswered: 0, wrong_to_wrong: 0, unchanged: 550 },
    },
    right_to_wrong: [
      { stack: 3301, axis: "base", answer: "T2w", before: "T2w", after: "FLAIR" },
      { stack: 3302, axis: "base", answer: "T2w", before: "T2w", after: "FLAIR" },
      { stack: 3303, axis: "base", answer: "T2w", before: "T2w", after: "FLAIR" },
    ],
    wrong_to_right: [{ stack: 3101, axis: "base", answer: "FLAIR", before: "T2w", after: "FLAIR" }],
  },
  seconds: { patch: 0.01, packs: 0.1, read: 0.3, rules: 0.2, passes: 0.1, dispose: 0.05, picks: 0.12, answers: 0.02, total: 0.9 },
};

/** The same change scoped to one dataset: an overlay, breaking nothing. */
export const EFFECT_SCOPED_RAW = {
  ...EFFECT_RAW,
  ships: { as: "overlay", pack: "mri", on: "1.2.0", scopes: ["dataset:study-big"], with_pack_edits: false },
  scope: { replayed: "dataset:study-big", stacks: 640, sealed_left_out: 0, by_operation: [{ at: 1, op: "add_words", scope: "dataset:study-big", stacks: 640 }] },
  moved: { stacks: 43 },
  axes: [{ axis: "base", moved: 43, held_by_decision: 0, transitions: [tr("T2w", "FLAIR", 40, { "study-big": 40 }, [3101, 3102]), tr("", "FLAIR", 3, { "study-big": 3 }, [3201])] }],
  answers: { ...EFFECT_RAW.answers, fixes: 40, breaks: 0, net: 40, right_to_wrong: [] },
};

/** The doors the Rules page reads. */
export const RULES_DOORS = [
  "GET /api/review",
  "GET /api/review/summary",
  "GET /api/packs",
  "GET /api/packs/{name}",
  "GET /api/packs/{name}/disagreements",
  "POST /api/packs/{name}/rehearse",
  "GET /api/instances/{stack}/thumb",
  "GET /api/sources",
  "GET /api/batches",
  "GET /api/overlays",
  "GET /api/jobs/{id}",
  "GET /api/explain/{stack}",
];

export const SOURCES = {
  count: 3,
  window_days: 30,
  sources: [
    { id: 2, name: "archive", kind: "root", totals: {} },
    { id: 3, name: "study-big", kind: "dataset", root: "archive", totals: {} },
    { id: 4, name: "ward-c", kind: "dataset", root: "archive", totals: {} },
  ],
};

export const BATCHES = { count: 2, batches: [{ id: 12, name: "study-big-2026-10-01", kind: "digest" }, { id: 11, name: "study-big-2026-10-01", kind: "pseudonymize" }] };

/** The quality report (GET /api/packs/mri/quality): the ties, three pairs of overrides, and System 1 not served. */
export const QUALITY_RAW = {
  pack: "mri",
  version: "1.2.0",
  dataset: null,
  stacks: 1003,
  disagreements: { ...TIES, more: 0 },
  overrides: {
    stacks: 100,
    overrides: 100,
    pairs: [
      {
        pair: "technique: symri/mdme=MDME > technique/se_words=SE",
        axis: "technique",
        rank: ["rule_set_order"],
        winner: { rule_set: "symri", rule: "mdme", value: "MDME", tier: "exclusive", confidence: 0.95 },
        over: { rule_set: "technique", rule: "se_words", value: "SE", tier: "keyword", confidence: 0.8 },
        stacks: 51,
        examples: [6101, 6102, 6103, 6104, 6105, 6106],
        datasets: { "study-big": 51 },
        versions: ["1.2.0"],
      },
      {
        pair: "base: base/physics=FLAIR > base/named=T2w",
        axis: "base",
        rank: ["rule_order"],
        winner: { rule_set: "base", rule: "physics", value: "FLAIR", tier: "physics", confidence: 0.9 },
        over: { rule_set: "base", rule: "named", value: "T2w", tier: "keyword", confidence: 0.8 },
        stacks: 47,
        examples: [6201, 6202],
        datasets: { "study-big": 40, "ward-c": 7 },
        versions: ["1.2.0"],
      },
      {
        pair: "base: answer=T1w > base/named=T2w",
        axis: "base",
        rank: ["answer"],
        winner: { rule_set: "", rule: "answer", value: "T1w", tier: "answer", confidence: 1 },
        over: { rule_set: "base", rule: "named", value: "T2w", tier: "keyword", confidence: 0.8 },
        stacks: 2,
        examples: [6301, 6302],
        datasets: { "ward-c": 2 },
        versions: ["1.2.0"],
      },
    ],
    more: 0,
  },
  system1: { served: false, model: null, threshold: null, disagreements: [], why: "no System 1 model answers here" },
};

const CARD = {
  moved: 50,
  transitions: [
    { axis: "base", from: "T2w", to: "FLAIR", stacks: 47 },
    { axis: "base", from: "", to: "FLAIR", stacks: 3 },
  ],
  fixes: 47,
  breaks: 3,
  net: 44,
  right_to_wrong: EFFECT_RAW.answers.right_to_wrong,
  cases: { held: true, failures: null },
  review: { before: 7, after: 4 },
  says: ["It breaks 3 answers people settled.", "It moves 50 scans."],
};

/** A pack edit waiting for a person, read whole: its operation, its card and its stored report. */
export const PROPOSAL_FULL = {
  id: 12,
  pack: "mri",
  title: 'Add "dark fluid" to base FLAIR',
  kind: "pack",
  on: "1.2.0",
  scopes: ["pack"],
  status: "proposed",
  reason: "dark fluid is FLAIR",
  evidence: "written on the Rules page",
  datasets: ["study-big", "ward-c"],
  author: "astrid",
  author_kind: "person",
  actor: null,
  created_at: "2026-10-14T18:00:00Z",
  rehearsed_at: "2026-10-14T18:00:01Z",
  decided_at: null,
  decided_by: null,
  why: null,
  stale: false,
  card: CARD,
  ships: { as: "rules release", pack: "mri", version: "1.2.1", from: "1.2.0" },
  version: null,
  job: null,
  applied: null,
  operations: EFFECT_RAW.patch.operations,
  report: EFFECT_RAW,
};

/** A scoped change the assistant proposed, breaking nothing. */
export const PROPOSAL_SCOPED = {
  ...PROPOSAL_FULL,
  id: 13,
  title: 'Add "mdc" to post_contrast given, for dataset ward-c',
  kind: "scoped",
  scopes: ["dataset:ward-c"],
  reason: "ward-c writes mdc for contrast given",
  datasets: ["ward-c"],
  author: "nils",
  author_kind: "agent",
  card: { ...CARD, moved: 12, transitions: [{ axis: "post_contrast", from: "not_given", to: "given", stacks: 12 }], fixes: 4, breaks: 0, net: 4, right_to_wrong: [], says: ["It moves 12 scans."] },
  ships: { as: "scoped change", pack: "mri", on: "1.2.0", scopes: ["dataset:ward-c"] },
  operations: [{ op: "add_words", axis: "post_contrast", value: "given", words: ["mdc"], scope: "dataset:ward-c", reason: "ward-c writes mdc for contrast given", evidence: { review_item: 4512 } }],
  report: EFFECT_SCOPED_RAW,
};

/** A pack edit adopted and re-sorted, with what the re-sort did. */
export const PROPOSAL_ADOPTED = {
  ...PROPOSAL_FULL,
  id: 9,
  title: "Move rule set symri before technique",
  status: "adopted",
  on: "1.1.0",
  decided_at: "2026-10-13T10:00:00Z",
  decided_by: "astrid",
  card: { ...CARD, moved: 51, transitions: [{ axis: "technique", from: "SE", to: "MDME", stacks: 51 }], fixes: 51, breaks: 0, net: 51, right_to_wrong: [] },
  ships: { as: "rules release", pack: "mri", version: "1.2.0", from: "1.1.0" },
  version: { pack: "mri", version: "1.2.0", from: "1.1.0", tag: "pack-mri-v1.2.0", state: "to_release", kept: "packs.versions/mri/1.1.0", files: ["pack.yml"] },
  job: { id: 811, state: "done" },
  applied: {
    state: "done",
    expected: { moved: 51, answers: { fixes: 51, breaks: 0 }, review: { before: 7, after: 7 } },
    measured: { scope: ["pack"], stacks: 1003, moved: { stacks: 51, axes: { technique: 51 } }, before: { technique: { SE: 120, MDME: 30 } }, after: { technique: { SE: 69, MDME: 81 } }, job: 811, at: "2026-10-13T10:02:00Z" },
  },
};

/** A proposal as the list door answers it: without its operations and its report. */
export const listed = (p: Record<string, unknown>) => {
  const { operations: _o, report: _r, ...rest } = p;
  return rest;
};

export const PROPOSALS_LIST = { pack: "mri", count: 3, counts: { proposed: 2, adopted: 1, rejected: 0, retired: 0 }, proposals: [PROPOSAL_SCOPED, PROPOSAL_FULL, PROPOSAL_ADOPTED].map(listed) };

/** The doors of an engine that keeps proposals and gathers the pack's quality. */
export const PROPOSAL_DOORS = [
  ...RULES_DOORS,
  "GET /api/packs/{name}/quality",
  "GET /api/packs/{name}/proposals",
  "POST /api/packs/{name}/proposals",
  "GET /api/packs/{name}/proposals/{id}",
  "POST /api/packs/{name}/proposals/{id}/rehearse",
  "POST /api/packs/{name}/proposals/{id}/decide",
];
