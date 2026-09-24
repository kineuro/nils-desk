// SPDX-License-Identifier: AGPL-3.0-only
// A `pick.border` item as a pick run over a synthetic registry raised it: the
// run's two best candidates too close, three considered, best first.

import type { ReviewItem } from "../ops/client";

/** As a synthetic engine's pick run raised it. */
export const BORDER: ReviewItem = {
  id: 4,
  kind: "pick.border",
  scope: "subject",
  status: "open",
  created_at: "2026-09-24T10:03:00Z",
  ref: { subject_id: 21, session_day: "2010-11-27", role: "t1w", model: "main" },
  evidence: {
    borders: ["too_close"],
    pick_id: 81,
    score: 0.655,
    margin: 0.0,
    runner_up_score: 0.655,
    candidates: 3,
    considered: [
      { stacks: [406], score: 0.655 },
      { stacks: [409], score: 0.655 },
      { stacks: [405], score: 0.4907 },
    ],
  },
  decision: null,
  members: 3,
  group_key: "pick:main|role:t1w|subject:21|day:2010-11-27",
};
