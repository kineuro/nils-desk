// SPDX-License-Identifier: AGPL-3.0-only
// A `classify.asked` item as record 45 R5 fixes its evidence, for the tests of
// the candidate list until wave 44 writes real ones: four legal candidates,
// most probable not first, one with no value on an axis, and five the desk
// must not render (a value the pack does not list, a probability past one,
// a set on a single-valued axis, one the evidence itself calls illegal, one
// missing an axis asked about), with both systems' evidence, the axes they
// agree on and the certificate, in the review-item contract's shape. And
// that contract's own example, as the engine slice wrote it. Made up.

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
    axes: ["base", "technique", "modifier", "post_contrast"],
    candidates: [
      { values: { base: "T2w", technique: "TSE", modifier: ["fat_sat"], post_contrast: "no" }, p: 0.22 },
      { values: { base: "FLAIR", technique: "TSE", modifier: ["IR"], post_contrast: "no" }, p: 0.71 },
      { values: { base: "PDw", technique: "TSE", modifier: [], post_contrast: "no" }, p: 0.04 },
      { values: { base: "T1w", technique: "SE", modifier: null, post_contrast: "yes" }, p: 0.02 },
      // not legal: a value this pack does not list
      { values: { base: "DIR", technique: "TSE", modifier: [], post_contrast: "no" }, p: 0.01 },
      // not legal: a probability past one
      { values: { base: "T2w", technique: "GRE", modifier: [], post_contrast: "no" }, p: 1.3 },
      // not legal: a set on a single-valued axis
      { values: { base: ["T2w", "FLAIR"], technique: "TSE", modifier: [], post_contrast: "no" }, p: 0.01 },
      // not legal: the evidence says so
      { values: { base: "T1w", technique: "GRE", modifier: [], post_contrast: "no" }, p: 0.01, legal: false },
      // not legal: an axis the stack is asked about is missing
      { values: { base: "T2w", technique: "TSE" }, p: 0.01 },
    ],
    systems: {
      rules: {
        pack: "mri@0.4.0",
        axes: {
          base: { value: "T2w", rule_set: "base", rule: "te_long", votes: [{ rule: "te_long", value: "T2w" }, { rule: "ti_inversion", value: "FLAIR" }], label_model_p: { T2w: 0.58, FLAIR: 0.42 } },
          technique: { value: "TSE", rule_set: "technique", rule: "echo_train", votes: [{ rule: "echo_train", value: "TSE" }], label_model_p: { TSE: 0.97, GRE: 0.03 } },
          modifier: { value: null, rule_set: "modifier", rule: null, votes: [], label_model_p: {} },
          post_contrast: { value: "no", rule_set: "contrast", rule: "no_agent", votes: [], label_model_p: { no: 0.91, yes: 0.09 } },
        },
      },
      model: {
        model_id: 7,
        digest: "sha256:5f2c0000000000000000000000000000000000000000000000000000000000aa",
        name: "system1",
        version: "0.1.0",
        p: {
          base: { FLAIR: 0.74, T2w: 0.21, PDw: 0.05 },
          technique: { TSE: 0.96, GRE: 0.04 },
          modifier: { IR: 0.7, fat_sat: 0.2 },
          post_contrast: { no: 0.98, yes: 0.02 },
        },
      },
    },
    certificate: { risk_level: 0.05, delta: 0.01, threshold: 0.9, score: 0.71, group: "T2-like", auto_decided: false },
    agree: ["technique", "post_contrast"],
    confidence: 0.71,
  },
};

/** contracts/review-item/v4/classify.asked.example.json, as the engine slice of wave 45 wrote it. */
export const ASKED_EXAMPLE: ReviewItem = {
  "id": 4812,
  "kind": "classify.asked",
  "scope": "stack",
  "status": "open",
  "actor": null,
  "created_at": "2026-09-24T09:12:00Z",
  "decided_at": null,
  "ref": {
    "stack_id": 1207
  },
  "evidence": {
    "axes": [
      "base",
      "technique",
      "modifier"
    ],
    "candidates": [
      {
        "values": {
          "base": "T1w",
          "technique": "MPRAGE",
          "modifier": [
            "FatSat"
          ]
        },
        "p": 0.71
      },
      {
        "values": {
          "base": "T1w",
          "technique": "MPRAGE",
          "modifier": []
        },
        "p": 0.22
      },
      {
        "values": {
          "base": "T2w",
          "technique": "TSE",
          "modifier": [
            "FatSat"
          ]
        },
        "p": 0.04
      }
    ],
    "systems": {
      "rules": {
        "pack": "mri@0.4.0",
        "axes": {
          "base": {
            "value": "T1w",
            "rule_set": "base",
            "rule": "technique:MPRAGE",
            "votes": [
              {
                "rule": "technique:MPRAGE",
                "value": "T1w"
              },
              {
                "rule": "keyword:T1w",
                "value": "T1w"
              }
            ],
            "label_model_p": {
              "T1w": 0.97,
              "T2w": 0.03
            }
          },
          "technique": {
            "value": "MPRAGE",
            "rule_set": "technique",
            "rule": "MPRAGE",
            "votes": [
              {
                "rule": "MPRAGE",
                "value": "MPRAGE"
              }
            ],
            "label_model_p": {
              "MPRAGE": 0.95,
              "TSE": 0.05
            }
          },
          "modifier": {
            "value": null,
            "rule_set": "modifier",
            "rule": null,
            "votes": [],
            "label_model_p": {}
          }
        }
      },
      "model": {
        "model_id": 12,
        "digest": "sha256:4b1d6f0c9a8e7d2c3b4a59687f0e1d2c3b4a5968778695a4b3c2d1e0f9a8b7c6",
        "name": "system1",
        "version": "0.1.0",
        "p": {
          "base": {
            "T1w": 0.93,
            "T2w": 0.07
          },
          "technique": {
            "MPRAGE": 0.9,
            "TSE": 0.1
          },
          "modifier": {
            "FatSat": 0.76,
            "FLAIR": 0.02
          }
        }
      }
    },
    "agree": [
      "base",
      "technique"
    ],
    "certificate": {
      "risk_level": 0.05,
      "delta": 0.01,
      "group": "siemens|3T|head",
      "threshold": 0.9,
      "score": 0.71,
      "auto_decided": false
    },
    "confidence": 0.71
  },
  "decision": null,
  "members": 1,
  "group_key": "asked:stack:1207",
  "accepted_by": null
};
