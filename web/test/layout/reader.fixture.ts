// SPDX-License-Identifier: AGPL-3.0-only
// A Phase 0 reading as the engine of record 48's first real read serves it,
// made up and shared by the layout check (a browser) and the reader's tests
// (jsdom): an axes question asking the seven axes a person answers, with the
// MRI pack's own vocabularies, and deriving five; a blind item's why door
// with long header text and the physics; the whole-header door; and a derive
// door that carries an answer through a few of the pack's rules; and after
// the second real read, the names each value goes by, the pack's groups and
// implications, and the combinations door. Nothing here is a real person or
// a real scan.

import type { Campaign, Claimed, HeaderDoc, Question } from "../../src/campaigns/client";

/** The MRI pack's vocabularies (packs/mri/axes), the asked axes in the order the reader asks them. */
export const VOCAB: Record<string, string[]> = {
  provenance: ["SyMRI", "EPIMix", "STAGE", "SWIRecon", "DTIRecon", "PerfusionRecon", "ASLRecon", "BOLDRecon", "Localizer", "ProjectionDerived", "SubtractionDerived", "RawRecon"],
  technique: ["MS-EPI", "DWI-EPI", "DWI-STEAM", "BOLD-EPI", "ASL-EPI", "Perfusion-EPI", "GRASE", "SE-EPI", "GRE-EPI", "MRF", "MDME", "MAVRIC", "3D-TSE", "SS-TSE", "IR-TSE", "ME-SE", "VFA-TSE", "TSE", "SE", "QALAS", "MP2RAGE", "MEMPRAGE", "MPRAGE", "TOF-MRA", "PC-MRA", "comb-ME-GRE", "ME-GRE", "CISS", "bSSFP", "DESS", "SSFP", "VFA-GRE", "VI-GRE", "FSP-GRE", "SP-GRE", "SS-GRE", "GRE", "EPI"],
  modifier: ["FLAIR", "STIR", "DIR", "PSIR", "IR", "Radial", "Spiral", "FatSat", "WaterExcitation", "Dixon", "MT", "FlowComp", "BlackBlood", "BrightBlood", "MoCo"],
  construct: ["ADC", "eADC", "FA", "Trace", "MD", "CBF", "CBV", "MTT", "Tmax", "TTP", "Water", "Fat", "InPhase", "OutPhase", "T1map", "T2map", "R1map", "R2map", "PDmap", "Qmap", "SyntheticT1w", "SyntheticT2w", "SyntheticFLAIR", "SyntheticPDw", "MyelinMap", "QSM", "MIP", "MinIP", "MPR", "B0map", "B1map", "Composed", "EchoCombined", "TTestMap", "Magnitude", "Real", "Imaginary", "ORIG", "Filtered", "ND", "INV1", "INV2", "Uniform", "UniformDenoised", "SWI", "Phase", "R2starmap", "SyntheticSTIR", "SyntheticDIR", "SyntheticPSIR", "FatFraction", "MultiQmap", "isoDWI"],
  base: ["DWI", "PWI", "SWI", "T1rho", "T2rho", "T2starw", "T2w", "PDw", "T1w", "MTw", "Unknown"],
  body_part: ["neck", "spine", "brain", "brain-neck", "chest"],
  post_contrast: ["given", "not_given"],
};

export const DERIVED_VOCAB: Record<string, string[]> = {
  role: ["t1w", "flair"],
  directory_type: ["excluded", "localizer", "dwi", "perf", "func", "fmap", "anat", "misc"],
  disposition: ["acquisition", "scanner_derived", "reformat", "working_scan", "scout", "excluded"],
  convertible: ["yes", "no"],
  quality: ["Distorted", "InputUnavailable", "Encrypted"],
};

export const ASKED = ["provenance", "technique", "modifier", "construct", "base", "body_part", "post_contrast"];
export const DERIVED = ["directory_type", "disposition", "convertible", "role", "quality"];

/** The MRI pack's exclusion groups and its implications among the seven asked axes, as the engine freezes them (nils_pack::legal). */
export const GROUPS = {"modifier": {"IR_CONTRAST": ["FLAIR", "STIR", "DIR", "PSIR", "IR"], "TRAJECTORY": ["Radial", "Spiral"]}, "construct": {"QUANT_MAP": ["T1map", "T2map", "R1map", "R2map", "PDmap", "Qmap"]}};
export const IMPLICATIONS = [{"rule": "base/technique:MPRAGE", "when": {"axis": "technique", "is": "MPRAGE"}, "then": [{"axis": "base", "value": "T1w"}]}, {"rule": "base/technique:MEMPRAGE", "when": {"axis": "technique", "is": "MEMPRAGE"}, "then": [{"axis": "base", "value": "T1w"}]}, {"rule": "base/technique:MP2RAGE", "when": {"axis": "technique", "is": "MP2RAGE"}, "then": [{"axis": "base", "value": "T1w"}]}, {"rule": "base/technique:TOF-MRA", "when": {"axis": "technique", "is": "TOF-MRA"}, "then": [{"axis": "base", "value": "T1w"}]}, {"rule": "base/technique:ME-GRE", "when": {"axis": "technique", "is": "ME-GRE"}, "then": [{"axis": "base", "value": "T2starw"}]}, {"rule": "base/technique:comb-ME-GRE", "when": {"axis": "technique", "is": "comb-ME-GRE"}, "then": [{"axis": "base", "value": "T2starw"}]}, {"rule": "base/technique:DWI-EPI", "when": {"axis": "technique", "is": "DWI-EPI"}, "then": [{"axis": "base", "value": "DWI"}]}, {"rule": "base/technique:ASL-EPI", "when": {"axis": "technique", "is": "ASL-EPI"}, "then": [{"axis": "base", "value": "PWI"}]}];

/**
 * A part of the names the engine serves with the question (record 48, the
 * second real read): each value's label where it differs, the pack's terms
 * and the words its rules read, as packs/mri/axes has them.
 */
export const NAMES = {
  technique: {
    MPRAGE: { terms: ["MP-RAGE", "BRAVO", "IR-FSPGR", "3D TFE", "TFL"], keywords: ["ir spgr"] },
    "3D-TSE": { label: "SPACE", terms: ["CUBE", "VISTA", "3D FSE"], keywords: [] },
    "FSP-GRE": { label: "TurboFLASH", terms: ["FSPGR", "TFE", "TFL"], keywords: [] },
    bSSFP: { label: "FIESTA", terms: ["TrueFISP", "bFFE"], keywords: [] },
    "ME-GRE": { label: "MEGRE", terms: ["multi-echo GRE"], keywords: [] },
  },
  base: { T1w: { terms: ["T1", "T1 weighted"], keywords: [] }, T2starw: { label: "T2*w", terms: ["T2*", "T2 star"], keywords: [] } },
  modifier: { FLAIR: { terms: ["dark fluid"], keywords: [] }, FatSat: { terms: ["fat saturation", "SPIR", "SPAIR"], keywords: [] } },
  construct: { SWI: { terms: ["susceptibility weighted imaging", "SWAN"], keywords: [] } },
  post_contrast: { given: { label: "1", terms: ["post contrast", "Gd"], keywords: [] }, not_given: { label: "0", terms: ["pre contrast", "native"], keywords: [] } },
};

export const QUESTION: Question = {
  kind: "axes",
  axes: ASKED,
  derive: DERIVED,
  values: VOCAB,
  constraints: { pack: "mri", values: VOCAB, multi: ["modifier", "construct"], groups: GROUPS, implications: IMPLICATIONS },
  cant_tell: "cant_tell",
  unsure: true,
  vocabulary: NAMES,
};

/**
 * The combinations door's answer (record 48, the second real read): how
 * common each whole answer is across a made-up registry, most common first,
 * never counting the campaign's stacks or a sealed one.
 */
export const COMBOS = {
  campaign: 41,
  axes: ASKED,
  counted: 1210,
  distinct: 3,
  left_out: { outside: 4, illegal: 0, stacks: 500 },
  combinations: [
    { values: { provenance: "RawRecon", technique: "TSE", modifier: ["FLAIR"], construct: [], base: "T2w", body_part: "brain", post_contrast: "not_given" }, count: 700 },
    { values: { provenance: "RawRecon", technique: "MPRAGE", modifier: [], construct: [], base: "T1w", body_part: "brain", post_contrast: "not_given" }, count: 400 },
    { values: { provenance: "RawRecon", technique: "MPRAGE", modifier: [], construct: [], base: "T1w", body_part: "brain", post_contrast: "given" }, count: 110 },
  ],
};

export const CAMPAIGN_ID = 41;
export const ITEM_ID = 9001;
export const STACK_ID = 5120;

export const CAMPAIGN = {
  id: CAMPAIGN_ID,
  name: "phase0-reference-rater-a",
  owner: "nima@site",
  status: "open",
  question: QUESTION,
  grain: "stack",
  source: { selection: "phase0@1" },
  raters_per_item: 1,
  rater_policy: { raters: ["rater@site"], adjudicators: [] },
  adjudication: { when: "never", metric: "exact", threshold: 1 },
  closes_into: "none",
  lease_seconds: 900,
  counts: { items: { open: 250 }, assignments: { leased: 1 }, answers: 0 },
  items: [
    { id: ITEM_ID, campaign_id: CAMPAIGN_ID, position: 0, review_item_id: null, stack_id: STACK_ID, subject_id: null, session_day: null, key: `stack:${STACK_ID}`, input_derivative_ids: null, state: "open", round: 1, blind: true },
    { id: ITEM_ID + 1, campaign_id: CAMPAIGN_ID, position: 1, review_item_id: null, stack_id: STACK_ID + 1, subject_id: null, session_day: null, key: `stack:${STACK_ID + 1}`, input_derivative_ids: null, state: "open", round: 1, blind: true },
  ],
} as unknown as Campaign;

export function claimed(now = Date.now()): Claimed {
  return {
    assignment: { id: 77, campaign_id: CAMPAIGN_ID, item_id: ITEM_ID, principal: "rater@site", role: "rater", round: 1, state: "leased", created_at: new Date(now).toISOString(), leased_at: new Date(now).toISOString(), lease_until: new Date(now + 900_000).toISOString(), ended_at: null },
    item: (CAMPAIGN as unknown as { items: Claimed["item"][] }).items[0],
    held: false,
  } as unknown as Claimed;
}

/** A blind item's why door: the file in full, long text and all, and nothing of how NILS read it. */
export const WHY_BLIND = {
  stack: STACK_ID,
  item: ITEM_ID,
  pack: "mri",
  version: "0.9.0",
  detail: "quasi",
  blind: true,
  header: { repetition_time: 2300, echo_time: 2.98, inversion_time: 900, flip_angle: 9, image_type: ["ORIGINAL", "PRIMARY", "M", "ND", "NORM"], n_slices: 176 },
  texts: {
    series_description: "t1_mprage_sag_p2_iso_1.0mm_ND_research_protocol_repeat_after_motion_second_attempt_with_prescan_normalize",
    protocol_name: "t1_mprage_sag_p2_iso_1.0mm_ND_research_protocol_repeat_after_motion",
    sequence_name: "*tfl3d1_16ns",
    sequence_variant: "SK\\SP\\MP",
    scanning_sequence: "GR\\IR",
    scan_options: "IR\\PFP\\FS\\SAT1\\SAT2\\SAT3",
    image_type: "ORIGINAL\\PRIMARY\\M\\ND\\NORM\\FILTERED\\DIS3D\\MFSPLIT",
    mr_acquisition_type: "3D",
    body_part_examined: "HEAD",
    series_comments: "Repeated after motion; prescan normalize on; the operator noted a second attempt with the head coil re-seated",
    image_comments: "NORM FILTERED DIS3D",
    derivation_description: "Distortion correction 3D; prescan normalized",
    study_description: "RESEARCH^NEURO MS PROTOCOL LONG FORM WITH CONTRAST ARM",
    contrast_bolus_agent: "",
    angio_flag: "N",
  },
  physics: {
    repetition_time: 2300,
    echo_time: 2.98,
    inversion_time: 900,
    flip_angle: 9,
    echo_train_length: 1,
    pixel_bandwidth: 240,
    magnetic_field_strength: 3,
    manufacturer: "SIEMENS",
    manufacturer_model_name: "Prisma_fit",
    slice_thickness: 1,
    spacing_between_slices: 1,
    rows: 256,
    columns: 240,
    acquisition_matrix: [0, 256, 240, 0],
    pixel_spacing: [1, 1],
    orientation: "sagittal",
    n_slices: 176,
    n_instances: 176,
    number_of_averages: 1,
    imaged_nucleus: "1H",
  },
  header_door: `/api/campaigns/${CAMPAIGN_ID}/items/${ITEM_ID}/header`,
  pictures: { planes: true },
  suggested: null,
  worth: null,
};

/** The same item read in the open (not blind): the rules' lines and System 1's candidates beside the file. */
export const WHY_SEEN = {
  ...WHY_BLIND,
  blind: false,
  asked: {
    item: 4812,
    confidence: 0.61,
    agree: ["provenance", "construct", "base", "body_part", "post_contrast"],
    candidates: [0.46, 0.31, 0.14, 0.06].map((p, i) => ({
      values: { provenance: "RawRecon", technique: ["MPRAGE", "MEMPRAGE", "MPRAGE", "MP2RAGE"][i], modifier: [[], ["FatSat"], ["FatSat"], []][i], construct: [], base: "T1w", body_part: "brain", post_contrast: "not_given" },
      p,
    })),
  },
  axes: ASKED.map((axis) => ({
    axis,
    value: { provenance: "RawRecon", technique: "MPRAGE", modifier: [], construct: [], base: "T1w", body_part: "brain", post_contrast: "not_given" }[axis],
    confidence: 0.8,
    decided: { rule_set: axis, rule: `${axis}:first`, clause: 0, reads: { flags: [] }, header: { repetition_time: 2300 } },
    voted: [],
    s1: [{ value: "x", p: 0.5 }],
  })),
  worth: { confidence: 0.61, disagree: true },
};

/** The whole-header door's answer: many fields of one instance, direct identifiers left out. */
export const HEADER_DOC: HeaderDoc = {
  stack: STACK_ID,
  item: ITEM_ID,
  blind: true,
  detail: "quasi",
  instance: { instance_number: 88 },
  fields: [
    { level: "series", column: "series_description", keyword: "SeriesDescription", tag: "(0008,103E)", value: WHY_BLIND.texts.series_description },
    { level: "series", column: "protocol_name", keyword: "ProtocolName", tag: "(0018,1030)", value: WHY_BLIND.texts.protocol_name },
    { level: "series", column: "sequence_name", keyword: "SequenceName", tag: "(0018,0024)", value: "*tfl3d1_16ns" },
    { level: "instance", column: "image_type", keyword: "ImageType", tag: "(0008,0008)", value: ["ORIGINAL", "PRIMARY", "M", "ND", "NORM"] },
    { level: "series", column: "repetition_time", keyword: "RepetitionTime", tag: "(0018,0080)", value: 2300 },
    { level: "series", column: "echo_time", keyword: "EchoTime", tag: "(0018,0081)", value: 2.98 },
    { level: "series", column: "inversion_time", keyword: "InversionTime", tag: "(0018,0082)", value: 900 },
    { level: "series", column: "flip_angle", keyword: "FlipAngle", tag: "(0018,1314)", value: 9 },
    ...Array.from({ length: 60 }, (_, i) => ({ level: "instance", column: null, keyword: `PrivateField${i + 1}`, tag: `(0019,10${String(i + 10).padStart(2, "0")})`, value: `value ${i + 1}` })),
  ],
  left_out: { identifying: 7, below_detail: 3 },
};

/**
 * A derive door that carries the answer through a few of the pack's rules:
 * the directory type from the base, the role from the base and the
 * modifier, convertible and the disposition from the provenance, quality
 * from the image type (none here). An asked axis not given is can't tell.
 */
export function deriveOf(value: Record<string, unknown>): Record<string, string | string[] | null> {
  const base = value.base;
  const modifier = Array.isArray(value.modifier) ? value.modifier : [];
  const provenance = value.provenance;
  const known = (v: unknown) => v !== undefined && v !== "cant_tell";
  return {
    directory_type: !known(base) ? "cant_tell" : base === "DWI" ? "dwi" : base === "PWI" ? "perf" : "anat",
    disposition: !known(provenance) ? "cant_tell" : provenance === "Localizer" ? "scout" : provenance === "RawRecon" ? "acquisition" : "scanner_derived",
    convertible: provenance === "Localizer" ? "no" : "yes",
    role: !known(base) ? "cant_tell" : [...(base === "T1w" ? ["t1w"] : []), ...(modifier.includes("FLAIR") ? ["flair"] : [])],
    quality: [],
  };
}

/** What the fake engine was asked, for a test to read. */
export interface Asked {
  method: string;
  path: string;
  body: unknown;
}

/**
 * The engine's doors as a fetch, for the layout check's page and the
 * reader's tests. `derive` and `header` false answer 404, as an engine
 * before them; `why` false serves no text or physics.
 */
export function fakeEngine(opts: { derive?: boolean; header?: boolean; texts?: boolean; seen?: boolean; combos?: boolean; log?: Asked[] } = {}): typeof fetch {
  const { derive = true, header = true, texts = true, seen = false, combos = true, log = [] } = opts;
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, "http://desk.test");
    const path = url.pathname;
    const method = (init?.method ?? "GET").toUpperCase();
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : null;
    log.push({ method, path, body });
    const c = `/api/campaigns/${CAMPAIGN_ID}`;
    const campaign = seen ? { ...CAMPAIGN, items: (CAMPAIGN as unknown as { items: object[] }).items.map((i) => ({ ...i, blind: false })) } : CAMPAIGN;
    if (method === "GET" && path === c) return json(200, campaign);
    if (method === "GET" && path === "/api/campaigns") return json(200, { count: 1, campaigns: [CAMPAIGN] });
    if (method === "POST" && path === `${c}/claim`) {
      const cl = claimed();
      return json(200, seen ? { ...cl, item: { ...cl.item, blind: false } } : cl);
    }
    if (method === "POST" && path.startsWith(`${c}/assignments/`) && path.endsWith("/renew")) return json(200, claimed().assignment);
    if (method === "POST" && path.startsWith(`${c}/assignments/`) && path.endsWith("/answer")) {
      const v = (body as { value?: Record<string, unknown> } | null)?.value ?? {};
      return json(200, { answer: 1, item: ITEM_ID, state: "agreed", adjudication: null, derived: deriveOf(v) });
    }
    if (method === "GET" && path === `${c}/items/${ITEM_ID}/why`) {
      if (seen) return json(200, WHY_SEEN);
      if (texts) return json(200, WHY_BLIND);
      const { texts: _t, physics: _p, header_door: _h, ...older } = WHY_BLIND;
      void _t;
      void _p;
      void _h;
      return json(200, older);
    }
    if (method === "GET" && path === `${c}/items/${ITEM_ID}/header`) return header ? json(200, HEADER_DOC) : json(404, { error: "no such door" });
    if (method === "GET" && path === `${c}/combinations`) return combos ? json(200, COMBOS) : json(404, { error: "no such door" });
    if (method === "POST" && path === `${c}/items/${ITEM_ID}/derive`) return derive ? json(200, { derived: deriveOf((body as { value?: Record<string, unknown> } | null)?.value ?? {}) }) : json(404, { error: "no such door" });
    return json(404, { error: `no door ${method} ${path}` });
  };
}

/** The doors the fake engine lists, record 48's new ones among them where asked. */
export function doorsOf(opts: { derive?: boolean; header?: boolean; combos?: boolean } = {}): string[] {
  const { derive = true, header = true, combos = true } = opts;
  return [
    "GET /api/campaigns",
    "GET /api/campaigns/{id}",
    "GET /api/campaigns/{id}/answers",
    "POST /api/campaigns/{id}/claim",
    "POST /api/campaigns/{id}/assignments/{assignment}/answer",
    "POST /api/campaigns/{id}/assignments/{assignment}/release",
    "POST /api/campaigns/{id}/assignments/{assignment}/renew",
    "GET /api/campaigns/{id}/items/{item}/why",
    ...(derive ? ["POST /api/campaigns/{id}/items/{item}/derive"] : []),
    ...(header ? ["GET /api/campaigns/{id}/items/{item}/header"] : []),
    ...(combos ? ["GET /api/campaigns/{id}/combinations"] : []),
  ];
}
