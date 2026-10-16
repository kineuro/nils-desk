// SPDX-License-Identifier: AGPL-3.0-only
// The panel that commits a model's proposals by filter (record 45 S7), drawn
// from one staged group for choice.pw.ts. Its "commit anyway" row shows once
// the engine refuses a commit because the registry moved on since the
// proposals were staged, which the fake door here always answers.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { ReviewItem } from "../../src/ops/client";
import { CommitDialog } from "../../src/review/ModelFamily";
import { modelGroups } from "../../src/review/modelFamily";
import "../../src/shell.css";

window.fetch = (() => Promise.resolve(new Response(JSON.stringify({ error: "the registry moved on since they were staged" }), { status: 409, headers: { "content-type": "application/json" } }))) as typeof fetch;

const key = "run:3|body_part:model|chest|p>=0.9|model:7";
const staged = {
  id: 3,
  kind: "body_part:model",
  scope: "group",
  status: "staged",
  created_at: "2026-09-24T10:00:00Z",
  ref: { group: key, run_id: 3 },
  evidence: { axis: "body_part", value: "chest", tier: "p>=0.9", confidence: 0.9, mean_confidence: 0.93, threshold: 0.7, model: "bodypart-head@1", run_id: 3, members: 8, group: "g", from: "spine" },
  decision: { axis: "body_part", value: "chest", author_kind: "model", model_id: 7, decision: 503, staged: true },
  members: 8,
  group_key: key,
} as unknown as ReviewItem;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <div className="app">
      <main className="page">
        <CommitDialog groups={modelGroups([staged])} filter={{ model: "bodypart-head@1", axis: "body_part", from: "spine", to: "chest" }} onClose={() => undefined} onDone={() => undefined} />
      </main>
    </div>
  </StrictMode>,
);
