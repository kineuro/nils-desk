// SPDX-License-Identifier: AGPL-3.0-only
// A pack as the door answers it at contract 5, for the tests beside the
// Review page: values listed with their words, by name or as a list, a flag
// with a threshold, and an axis an older door only numbered. Made up.

import { packDoc } from "./client";

export const PACK = packDoc({
  pack: "mri",
  version: "0.1.1",
  contract: 5,
  modality: "MR",
  flags: 138,
  axes: [
    { axis: "provenance", multi: false, values: [{ value: "original", keywords: ["orig"] }] },
    {
      axis: "technique",
      multi: false,
      values: {
        "MS-EPI": { label: "RESOLVE", family: "EPI", keywords: ["resolve", "muse"], detection: { exclusive: "is_epi_diff_resolve", combination: ["has_segmented_kspace", "has_epi"] } },
        "DWI-EPI": { family: "MIXED", keywords: ["dwi", "dti"], detection: { exclusive: "is_dwi" } },
        "SS-GRE": { label: "SPACE", keywords: ["space", "spc"], detection: { exclusive: "is_3d_tse" } },
      },
    },
    { axis: "base", multi: false, values: [{ value: "T1w", detection: ["is_t1"], threshold: 0.65 }], review_below: 0.65 },
    { axis: "body_part", multi: false, values: 4 },
    { axis: "post_contrast", multi: false, values: [{ value: "yes", keywords: ["gd"] }, { value: "no", keywords: ["utan gd"] }] },
  ],
  buckets: { contrast_positive: ["gd"], contrast_negative: ["utan gd"], localizer_words: ["scout"], diffusion_tokens: ["ADC"] },
});
