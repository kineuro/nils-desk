// SPDX-License-Identifier: AGPL-3.0-only
// The Review queue's layout check (record 51, G4 and R5): the queue in the
// desk's shell with its filter chips by axis and by reason, a pick border's
// reasons, and a row that carries the badge of a model disagreeing with a
// person's decision, whose Look shows the badge beside the viewer's boxes.
// The filter is held here as the page holds it in its address.

import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import "../../src/shell.css";
import type { Capabilities } from "../../src/capabilities";
import type { ReviewItem } from "../../src/ops/client";
import { NO_FILTER, type QueueFilter } from "../../src/review/filter";
import { QueuePage } from "../../src/review/Queue";

const caps = {
  engine: { engine: { name: "nils", version: "1.0.0-alpha.63" }, contracts: { openapi: "7" }, doors: ["GET /api/capabilities", "GET /api/review", "GET /api/review/summary", "POST /api/campaigns"], policy: [], auth: "off", principal: "astrid", roles: [], registry: { epoch: 1 }, packs: [{ name: "mri", version: "0.16.0" }] },
  kvasir: null,
  assistant: null,
  apps: [],
  person: { subject: "astrid", display_name: "Astrid", grants: ["review:see", "review:work", "campaigns:see", "campaigns:work", "data:see"], detail: "quasi", groups: [] },
  desk: { version: "1.0.0-alpha.60", mode: "off", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
} as unknown as Capabilities;

const AXES = ["base", "technique", "modifier", "provenance", "construct", "body_part", "post_contrast", "orientation", "mr_acquisition_type"];
const REASONS = ["missing", "conflict", "low_confidence", "vote", "decision"];
let id = 0;
const items: ReviewItem[] = [];
for (const axis of AXES) {
  for (const reason of REASONS) {
    id++;
    items.push({ id, kind: `${axis}:${reason}`, scope: "stack", status: "open", created_at: "2026-09-30T08:00:00Z", ref: { stack_id: 400 + id }, evidence: { axis, value: "T1w", other: "T2w", values: ["T1w", "T2w"] } });
  }
}
items.push({
  id: 900,
  kind: "body_part:decision",
  scope: "stack",
  status: "open",
  created_at: "2026-09-30T09:00:00Z",
  ref: { stack_id: 901 },
  evidence: { axis: "body_part", decision: "spine", source: "model", model: { id: 3, name: "bodypart-infer-fusion-head", version: "0.2.0" }, model_id: 3, value: "brain-neck", confidence: 0.973, threshold: 0.8, run_id: 12 },
});
for (const [k, borders] of [["too_close"], ["retake", "dixon_vs_plain"], ["slice_count_outlier", "pre_post_twin", "epimix_fallback"], ["unknown_dim"]].entries()) {
  items.push({ id: 950 + k, kind: "pick.border", scope: "subject", status: "open", created_at: "2026-09-30T09:00:00Z", ref: { subject_id: 20 + k, session_day: "2010-11-27", role: k % 2 ? "t2w" : "t1w" }, evidence: { borders } });
}

function Page() {
  const [filter, setFilter] = useState<QueueFilter>(NO_FILTER);
  const [said, setSaid] = useState("");
  return (
    <section className="data review">
      <div className="data-head">
        <div className="grow">
          <span className="eyebrow">Review</span>
          <h1>What needs a person</h1>
        </div>
      </div>
      <QueuePage caps={caps} items={items} summary={null} cohort="" onCohort={() => undefined} batch={null} onDecide={(i) => setSaid(`decide ${i.id}`)} onExplain={() => undefined} onChanged={setSaid} filter={filter} onFilter={setFilter} />
      <p className="meta" data-said>
        {said}
      </p>
    </section>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
