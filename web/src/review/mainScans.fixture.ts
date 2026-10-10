// SPDX-License-Identifier: AGPL-3.0-only
// Main scans' made-up answers (record 55, decision 6), shaped as the build
// spec's section 5 has the engine's doors answer: a cohort's rules, version 2
// saved over the pack's defaults, and one role's map, a page of subjects and
// the strips. Every name and number here is made up.

import { rulesOf, type Metrics, type Rules } from "./mainScans";

export const RULES: Rules = rulesOf({
  roles: {
    t1w: { keep_alike: "balanced", kinds_in_order: ["3D MPRAGE", "3D MPRAGE +C", "2D SE"], not_used: [], contrast: "either", dimension: "any", body_part: "brain", slice_thickness_at_most_mm: null },
    flair: { keep_alike: "balanced", kinds_in_order: ["3D FLAIR", "2D FLAIR"], not_used: [], contrast: "either", dimension: "any", body_part: "brain", slice_thickness_at_most_mm: null },
    t2w: { keep_alike: "balanced", kinds_in_order: ["3D SPACE", "2D TSE"], not_used: [], contrast: "either", dimension: "any", body_part: "brain", slice_thickness_at_most_mm: null },
  },
  same_kind_in_one_visit: {
    weights: { slice_count: 0.2, field_of_view: 0.1, modifiers: 0.12, orientation: 0.05, completeness: 0.05 },
    derived_series_scores: 0.5,
    near_tie_within_percent: 5,
    near_tie_goes_to: ["axial_coronal_sagittal", "thinner_slices", "default_reconstruction", "later_full_repeat", "earlier_series"],
  },
});

export const METRICS = (over: Partial<Metrics> = {}): Metrics => ({
  visits: 1100,
  visits_taken: 1050,
  subjects: 600,
  subjects_taken: 590,
  alike_data: { kind: "3D MPRAGE", visits: 640 },
  alike_within: { subjects: 250, of: 310 },
  series_complete: { subjects: 280, of: 310 },
  ...over,
});

/** The rules door's answer for a cohort: version 2 saved, version 1 the pack's defaults. */
export function rulesAnswer(version = 2, rules: Rules = RULES, author = "astrid") {
  const versions: { version: number; reason: string; author: string | null; at: string | null }[] = [{ version: 1, reason: "the pack's defaults", author: null, at: null }];
  for (let v = 2; v <= version; v++) versions.push({ version: v, reason: v === version ? "3D first for the lesion study" : `version ${v}`, author, at: "2026-10-10T09:00:00Z" });
  return {
    scope: { cohort: "ms-followup" },
    pack: { name: "mri", version: "1.1.0" },
    current: { version, saved: version > 1, reason: version > 1 ? "3D first for the lesion study" : "the pack's defaults", author: version > 1 ? author : null, at: version > 1 ? "2026-10-10T09:00:00Z" : null, digest: `d${version}`, rules },
    versions,
  };
}

/** The map door's answer for one role, with an effect where a draft was sent. */
export function mapAnswer(role: string, draft: boolean, over: Record<string, unknown> = {}) {
  const t1 = role === "t1w";
  return {
    role,
    rules_version: 2,
    kinds: t1
      ? [
          { key: "3D MPRAGE", visits_with: 412, visits_taken: 388, allowed: true, used: true, new: false },
          { key: "3D MPRAGE +C", visits_with: 120, visits_taken: 6, allowed: true, used: true, new: false },
          { key: "2D SE", visits_with: 300, visits_taken: 250, allowed: true, used: true, new: false },
          { key: "3D SPGR", visits_with: 90, visits_taken: 80, allowed: true, used: true, new: true },
        ]
      : [
          { key: "3D FLAIR", visits_with: 300, visits_taken: 280, allowed: true, used: true, new: false },
          { key: "2D FLAIR", visits_with: 500, visits_taken: 420, allowed: true, used: true, new: false },
        ],
    metrics: draft ? METRICS({ visits_taken: 1060, alike_data: { kind: "3D MPRAGE", visits: 700 } }) : METRICS(),
    columns: [
      { key: "Siemens Skyra · 3 T", visits: 420 },
      { key: "GE Signa · 1.5 T", visits: 380 },
      { key: "Other scanners", visits: 300 },
    ],
    matrix: [
      { kind: "3D MPRAGE", cells: [300, 60, 28] },
      { kind: "2D SE", cells: [0, 200, 50] },
      { kind: null, cells: [3, 1, 9] },
    ],
    series: [
      { steps: ["3D MPRAGE"], subjects: 120 },
      { steps: ["2D SE", "3D MPRAGE"], subjects: 40 },
      { steps: ["3D MPRAGE", null], subjects: 7 },
    ],
    single_visit_subjects: 290,
    by_visit: [
      { visit: 1, visits: 600, kinds: [{ kind: "3D MPRAGE", visits: 300 }, { kind: "2D SE", visits: 280 }, { kind: null, visits: 20 }] },
      { visit: 2, visits: 310, kinds: [{ kind: "3D MPRAGE", visits: 200 }, { kind: "2D SE", visits: 100 }, { kind: null, visits: 10 }] },
    ],
    effect: draft ? { visits_changed: 37, subjects_changed: 21, before: METRICS() } : null,
    ...over,
  };
}

/** A page of the group's subjects: the first changes kind at its second visit, the second has a person's pick. */
export function subjectsAnswer(total = 2) {
  return {
    total,
    page: 0,
    per_page: 24,
    subjects: [
      {
        subject_id: 17,
        subject: "5a9f30c6e8b21d41",
        visits: [
          { session: "17:2010-01-02", visit: 1, column: "GE Signa · 1.5 T", field: "1.5 T", kind: "2D SE", stack: 121, by: "rules", changed: false, candidates: [{ stacks: [121], kind: "2D SE", score: 0.81 }] },
          { session: "17:2012-03-04", visit: 2, column: "Siemens Skyra · 3 T", field: "3 T", kind: "3D MPRAGE", stack: 123, by: "rules", changed: true, candidates: [{ stacks: [123], kind: "3D MPRAGE", score: 0.88 }, { stacks: [124], kind: "3D MPRAGE", score: 0.85 }] },
        ],
      },
      {
        subject_id: 18,
        subject: "5a9f30c6e8b21d42",
        visits: [{ session: "18:2011-05-06", visit: 1, column: "Siemens Skyra · 3 T", field: "3 T", kind: "3D MPRAGE", stack: 131, by: "person", pick: 97, why: "motion in series 9", changed: false, candidates: [{ stacks: [130], kind: "3D MPRAGE", score: 0.9 }, { stacks: [131], kind: "3D MPRAGE", score: 0.7 }] }],
      },
    ],
  };
}

export const STRIPS = {
  kinds: ["3D MPRAGE", "2D SE"],
  columns: ["Siemens Skyra · 3 T", "GE Signa · 1.5 T"],
  subjects: [
    { subject_id: 17, column: 1, visits: [1, 0] },
    { subject_id: 18, column: 0, visits: [0] },
    { subject_id: 19, column: 0, visits: [0, 0, -1] },
  ],
};
