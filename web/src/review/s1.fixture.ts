// SPDX-License-Identifier: AGPL-3.0-only
// Fixtures of the review rule's doors (record 55 D3, D6, D7), in the shapes
// the engine answers: one question's both suggestions and a round's report.

import type { RoundReport, Suggestions } from "./s1";

export const SUGGESTIONS: Suggestions = {
  item: 41,
  kind: "base:missing",
  mode: "routine",
  provisional: null,
  system1: { status: "not_confirmed", why: "System 1 is not yet confirmed: no recorded certificate names it (D2); its opinion is a research model's", model: { id: 7, name: "s1c", version: "2026-10-09" }, certificate_id: null },
  stacks: [
    {
      stack_id: 1207,
      header: {},
      axes: [
        {
          axis: "base",
          rules: { axis: "base", value: null, set_by: { kind: "rule" }, decided: null, line: "base: (nothing)" },
          system1: {
            value: "FLAIR",
            p: 0.93,
            reliability: 0.41,
            fields: [
              { field: "text_series_description", effect: 0.52 },
              { field: "inversion_time", effect: 0.11 },
            ],
            similar: [{ stack_id: 88, value: "FLAIR", series_description: "AX FLAIR fs", alike_by: "series_description" }],
            agrees: false,
            model: { id: 7, name: "s1c", version: "2026-10-09" },
          },
        },
        {
          axis: "technique",
          rules: { axis: "technique", value: "TSE", set_by: { kind: "rule" }, decided: { rule_set: "technique", rule: "tse", clause: 0, header: { text_sequence_name: "*tse2d1" }, matched: "tse" }, line: "" },
          system1: { value: "TSE", p: 0.99, reliability: 0.41, fields: [], agrees: true, model: null },
        },
      ],
    },
  ],
  total_stacks: 1,
  sealed_left_out: 0,
};

export const ROUND: RoundReport = {
  round: { id: 3, rules: "mri@1.2.0", model_id: 7, gate: { base: { lambda1: 0.9, lambda2: 0.95 } }, confirmed: false },
  scans: 1003,
  accepted: 996,
  reviewed: 7,
  gate_held: 0,
  shares: { accepted: 0.993, review: 0.007 },
  review_by_kind: { "base:missing": 7 },
  waiting_by_kind: { "base:missing": 7, "body_part:model": 12 },
  never_asked: { conflict: 0, low_confidence: 0, body_part: 0, post_contrast: 0 },
  gate: { outcomes: {}, accepted_stacks: 0 },
  system1: { model_id: 7, scans_with_opinion: 1003, coverage: 1, confirmed: false },
  answers: { blind: { decisions: 3, mean_seconds: 21 }, not_blind: { decisions: 9, mean_seconds: 8 } },
  audits: [
    {
      id: 2, round_id: 3, seed: "audit-round-3", share: 0.01, frame: { stacks: 996, digest: "sha256:ab" }, drawn: 10, campaign_id: 14, created_by: "astrid", created_at: "2026-10-14T09:00:00Z",
      grade: { read: 10, wrong: 0, error: 0, bound: 0.2589, confidence: 0.95, wrong_by_axis: {}, not_settled: 0, cant_tell: 0 }, graded_at: "2026-10-14T10:00:00Z",
    },
  ],
};

