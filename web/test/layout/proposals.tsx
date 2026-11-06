// SPDX-License-Identifier: AGPL-3.0-only
// Review / Proposals per model and axis (UX round 1), in the real desk's
// shell, against a fake engine whose doors answer as the engine's do: the
// one list of work with many kinds, so the model's row sits low on it; the
// counts per model and axis; a commit that re-sorts; and a campaign of the
// rest. proposals.pw.ts opens it at a laptop's width and a phone's. Every
// name and number here is made up.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../src/App";
import "../../src/shell.css";
import { GRANTS } from "../../src/grants";

const DOORS = [
  "GET /api/capabilities",
  "GET /api/review",
  "GET /api/review/summary",
  "GET /api/review/proposals",
  "POST /api/review/proposals/campaign",
  "POST /api/decisions/commit",
  "POST /api/decisions/{id}/commit",
  "POST /api/decisions/{id}/withdraw",
  "GET /api/campaigns",
  "GET /api/campaigns/{id}",
];

const caps = {
  engine: {
    engine: { name: "nils", version: "1.0.0-beta.9" },
    contracts: { openapi: "7" },
    doors: DOORS,
    policy: [],
    auth: "token",
    principal: "astrid@site",
    roles: [],
    registry: { epoch: 4 },
    packs: [{ name: "mri", version: "1.4.0" }],
  },
  kvasir: null,
  assistant: null,
  apps: [],
  person: { subject: "astrid@site", display_name: "Astrid", grants: [...GRANTS], detail: "quasi", groups: [] },
  desk: { version: "1.0.0", mode: "local", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
};

const kinds = ["base", "technique", "modifier", "contrast", "plane", "body_region", "laterality", "sequence", "fat", "motion", "dwi", "perfusion"];
const SUMMARY = {
  by_kind: { ...Object.fromEntries(kinds.flatMap((k, i) => [[`${k}:missing`, 3 + i], [`${k}:disagree`, 2 + i]])), "identity.collision": 2, "pick.border": 3, "classify.asked": 5, "pipeline:qc": 4, "body_part:model": 40 },
  cohorts: [],
  none: 0,
};

let committed = false;
const row = (over: Record<string, unknown> = {}) => ({
  model: { id: 7, name: "bodypart-head", version: "3", digest: "sha256:aa", state: "admitted" },
  label: "bodypart-head@3",
  axis: "body_part",
  threshold: 0.9,
  thresholds: [0.9],
  staged: committed ? { groups: 1, stacks: 46 } : { groups: 9, stacks: 1250 },
  held: { groups: 1, stacks: 46 },
  commit: committed ? { groups: 0, stacks: 0 } : { groups: 8, stacks: 1204 },
  drifted: committed ? 0 : 3,
  below: { groups: 30, stacks: 4838 },
  asked: { groups: 0, stacks: 0 },
  campaigns: [],
  runs: [162],
  name: "bodypart-head-body_part-unsure",
  ...over,
});
const ROWS = () => [
  row(),
  row({ model: { id: 9, name: "region-head", version: "1" }, label: "region-head@1", axis: "body_region", threshold: 0.85, staged: { groups: 2, stacks: 310 }, held: { groups: 0, stacks: 0 }, commit: { groups: 2, stacks: 310 }, drifted: 0, below: { groups: 0, stacks: 0 }, asked: { groups: 3, stacks: 72 }, campaigns: [{ id: 4, name: "region-r1" }], name: "region-head-body_region-unsure" }),
];

const json = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const p = new URL(url, location.origin).pathname;
  const method = init?.method ?? "GET";
  if (p === "/desk/capabilities") return json(200, caps);
  if (p === "/api/review/summary") return json(200, SUMMARY);
  if (p === "/api/review") return json(200, { count: 0, items: [] });
  if (p === "/api/review/proposals") return json(200, { count: 2, proposals: ROWS() });
  if (p === "/api/decisions/commit" && method === "POST") {
    committed = true;
    return json(200, { committed: [1, 2, 3, 4, 5, 6, 7, 8], items: 8, left: 1, split: [], resort: { state: "done", stacks: 1204, sorted: 1204, words: "re-sorted 1,204 scans" } });
  }
  if (p === "/api/review/proposals/campaign" && method === "POST") return json(201, { campaign: { id: 12, name: "bodypart-head-body_part-unsure" }, adopted: 30, suggestions: { suggestions: 4838 }, counts: {} });
  if (p === "/api/campaigns") return json(200, { count: 0, campaigns: [] });
  return json(404, { error: `the layout check's engine has no ${p}` });
}) as typeof fetch;

if (!location.hash) location.hash = "#review";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
