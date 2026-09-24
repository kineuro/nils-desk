// SPDX-License-Identifier: AGPL-3.0-only
// A `classify.asked` item as record 45 R5 fixes its evidence, for the tests of
// the candidate list until wave 44 writes real ones: four legal candidates,
// most probable not first, and four the desk must not render (a value the
// pack does not list, a probability past one, a set on a single-valued axis,
// one the evidence itself calls illegal), with both systems' evidence, the
// axes they agree on and the certificate. Made up.

import type { ReviewItem } from "../ops/client";
import { packDoc } from "./client";

export const ASKED_PACK = packDoc({
  pack: "mri",
  version: "0.4.0",
  contract: 5,
  axes: [
    { axis: "base", values: [{ name: "T1w" }, { name: "T2w" }, { name: "FLAIR" }, { name: "PDw" }] },
    { axis: "technique", values: [{ name: "TSE" }, { name: "GRE" }, { name: "SE" }] },
    { axis: "modifier", multi: true, values: [{ name: "fat_sat" }, { name: "IR" }] },
    { axis: "post_contrast", values: [{ name: "yes" }, { name: "no" }] },
  ],
});

export const ASKED_ITEM: ReviewItem = {
  id: 901,
  kind: "classify.asked",
  scope: "stack",
  status: "open",
  created_at: "2026-09-24T10:00:00Z",
  ref: { stack_id: 4410 },
  members: 1,
  evidence: {
    candidates: [
      { values: { base: "T2w", technique: "TSE", modifier: ["fat_sat"], post_contrast: "no" }, p: 0.22 },
      { values: { base: "FLAIR", technique: "TSE", modifier: ["IR"], post_contrast: "no" }, p: 0.71 },
      { values: { base: "PDw", technique: "TSE", modifier: [], post_contrast: "no" }, p: 0.04 },
      { values: { base: "T1w", technique: "SE", post_contrast: "yes" }, p: 0.02 },
      // not legal: a value this pack does not list
      { values: { base: "DIR", technique: "TSE", post_contrast: "no" }, p: 0.01 },
      // not legal: a probability past one
      { values: { base: "T2w", technique: "GRE", post_contrast: "no" }, p: 1.3 },
      // not legal: a set on a single-valued axis
      { values: { base: ["T2w", "FLAIR"], technique: "TSE", post_contrast: "no" }, p: 0.01 },
      // not legal: the evidence says so
      { values: { base: "T1w", technique: "GRE", post_contrast: "no" }, p: 0.01, legal: false },
    ],
    systems: {
      rules: {
        base: { value: "T2w", rule_set: "base", rule: "te_long", votes: [{ rule: "te_long", value: "T2w" }, { rule: "ti_inversion", value: "FLAIR" }], label_model_p: 0.58 },
        technique: { value: "TSE", rule_set: "technique", rule: "echo_train", votes: [{ rule: "echo_train", value: "TSE" }], label_model_p: 0.97 },
        post_contrast: { value: "no", rule_set: "contrast", rule: "no_agent", votes: [], label_model_p: 0.91 },
      },
      model: {
        model_id: 7,
        digest: "sha256:5f2c0000000000000000000000000000000000000000000000000000000000aa",
        p: {
          base: { FLAIR: 0.74, T2w: 0.21, PDw: 0.05 },
          technique: { TSE: 0.96, GRE: 0.04 },
          post_contrast: { no: 0.98, yes: 0.02 },
        },
      },
    },
    certificate: { epsilon: 0.05, delta: 0.01, threshold: 0.9, score: 0.71, group: "T2-like" },
    agree: ["technique", "post_contrast"],
  },
};
