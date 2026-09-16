// SPDX-License-Identifier: AGPL-3.0-only
// A pack as the door answers it at contract 5, for the tests beside the
// Review page: the eleven axes in the order they are decided, values listed
// with their words, by name or as a list, a flag with a threshold, an axis an
// older door only numbered, the list a site may amend named per value, what
// the site's adopted overlays already put on one, and the three axes that
// carry no words anywhere. Made up, and shaped as packs/mri answers.

import { packDoc, type PackDoc } from "./client";

export const PACK = packDoc({
  pack: "mri",
  version: "0.1.1",
  contract: 5,
  modality: "MR",
  flags: 138,
  axes: [
    {
      axis: "provenance",
      multi: false,
      phase: "class",
      values: [
        { name: "original", keywords: ["orig"], list: "provenance.original" },
        { name: "SyMRI", keywords: ["symri", "syntheticmr"], list: "provenance.SyMRI" },
      ],
    },
    {
      axis: "technique",
      multi: false,
      phase: "class",
      values: {
        "MS-EPI": { label: "RESOLVE", family: "EPI", keywords: ["resolve", "muse"], list: "technique.MS-EPI", detection: { exclusive: "is_epi_diff_resolve", combination: ["has_segmented_kspace", "has_epi"] } },
        "DWI-EPI": { family: "MIXED", keywords: ["dwi", "dti"], list: "technique.DWI-EPI", detection: { exclusive: "is_dwi" } },
        "SS-GRE": { label: "SPACE", keywords: ["space", "spc"], list: "technique.SS-GRE", detection: { exclusive: "is_3d_tse" } },
      },
    },
    {
      axis: "modifier",
      multi: true,
      phase: "class",
      values: [{ name: "fat_sat", keywords: ["fs", "spair"], list: "modifier.fat_sat" }],
    },
    {
      axis: "construct",
      multi: false,
      phase: "class",
      // the site added a word to this list, and the door answers it among the words with the site's own edit beside it
      values: [{ name: "diffusion", keywords: ["adc", "trace", "ep2d_site"], list: "construct.diffusion", site: { add: ["ep2d_site"], remove: [], overlays: [7] } }],
    },
    // base is reached by a flag and by physics, and its values are reached by a keyword rule too, so a site may grow them
    { axis: "base", multi: false, phase: "class", values: [{ name: "T1w", detection: ["is_t1"], threshold: 0.65, list: "base.T1w" }], review_below: 0.65 },
    // an older door numbered the values and listed none of them
    { axis: "body_part", multi: false, phase: "class", values: 4 },
    {
      axis: "post_contrast",
      multi: false,
      phase: "class",
      values: [
        { name: "yes", keywords: ["gd"], list: "post_contrast.yes" },
        { name: "no", keywords: ["utan gd"], list: "post_contrast.no" },
      ],
    },
    {
      axis: "directory_type",
      multi: false,
      phase: "class",
      values: [{ name: "localizer", keywords: ["scout", "localizer", "loc_"], list: "directory_type.localizer" }],
    },
    // the three that carry no words anywhere: decided from the axes above them
    {
      axis: "disposition",
      multi: false,
      phase: "disposition",
      values: [
        { name: "acquisition", keywords: [], list: null },
        { name: "working", keywords: [], list: null },
      ],
    },
    {
      axis: "convertible",
      multi: false,
      phase: "disposition",
      values: [
        { name: "yes", keywords: [], list: null },
        { name: "no", keywords: [], list: null },
      ],
    },
    {
      axis: "role",
      multi: true,
      phase: "disposition",
      values: [
        { name: "t1w", keywords: [], list: null },
        { name: "flair", keywords: [], list: null },
      ],
    },
  ],
  buckets: { contrast_positive: ["gd"], contrast_negative: ["utan gd"], localizer_words: ["scout"], diffusion_tokens: ["ADC"] },
  lists: [
    "provenance.original",
    "provenance.SyMRI",
    "technique.MS-EPI",
    "technique.DWI-EPI",
    "technique.SS-GRE",
    "modifier.fat_sat",
    "construct.diffusion",
    "base.T1w",
    // body_part's values were only numbered by this door, and the lists it opens name it all the same
    "body_part.head",
    "body_part.spine",
    "post_contrast.yes",
    "post_contrast.no",
    "directory_type.localizer",
  ],
});

/** The three axes the pack reaches by no word at all: they are decided from the others. */
export const NO_WORDS = ["disposition", "convertible", "role"];

/**
 * The same pack as an engine at pack contract 4 answers it. The engine
 * computes the lists a pack opens whatever its contract, so `lists` stands as
 * it is; but at contract 4 a site amends the four buckets alone, and a word it
 * adopted onto one is named on no value, so the door attaches no `site` to any
 * of them. What the page says of such a pack is the test of both.
 */
export const PACK_4: PackDoc = { ...PACK, contract: 4, axes: PACK.axes.map((a) => ({ ...a, values: a.values.map((v) => ({ ...v, site: null })) })) };
