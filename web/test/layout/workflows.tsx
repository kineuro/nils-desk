// SPDX-License-Identifier: AGPL-3.0-only
// The Pipelines page without tabs, a workflow's plan, a workflow run and the
// provenance panel (Wave 7b sections 8.1 and 8.3 to 8.6): the real desk, its
// top bar and side, against a fake engine whose catalog holds the
// registration family and its members, SAMSEG, SynthSeg, segcsvd and N4, two
// shipped workflows, the runs of one workflow run and a run going, a plan of
// the FLAIR lesions workflow over a dataset's main scans, and the provenance
// of one session. Every name and number here is made up.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../src/App";
import "../../src/shell.css";
import { GRANTS } from "../../src/grants";
import { FAMILIES, FAMILY_UNITS, PIPELINES, PLAN, PROVENANCE, RUN_41, RUN_43, RUNS, WORKFLOW_DOORS, WORKFLOW_RUN, WORKFLOW_RUN_GOING, WORKFLOW_RUNS, WORKFLOWS } from "../../src/ops/workflows.fixture";

const DOORS = ["GET /api/capabilities", "GET /api/pipelines/{id}", "GET /api/derivatives", "GET /api/ask/selections", "GET /api/ask/selections/{name}", "GET /api/sources", "GET /api/cohorts", "GET /api/jobs/{id}", ...WORKFLOW_DOORS];

const engine = {
  engine: { name: "nils", version: "1.0.0-beta.1.dev.4" },
  contracts: { openapi: "7" },
  doors: DOORS,
  policy: [],
  auth: "token",
  principal: "astrid@site",
  roles: [],
  registry: { epoch: 4 },
  packs: [{ name: "mri", version: "1.0.1", main_roles: ["t1w", "flair", "t2w"] }],
  pipelines: { enabled: true },
};
const caps = {
  engine,
  kvasir: null,
  assistant: null,
  apps: [],
  person: { subject: "astrid@site", display_name: "Astrid", grants: [...GRANTS], detail: "quasi", groups: [] },
  desk: { version: "1.0.0", mode: "local", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true, setup: { ready: true } },
};

const SELECTIONS = [{ name: "ms-baseline", version: 4, current_version: 4, count: 6 }];
const SOURCES = { count: 1, window_days: 7, sources: [{ id: 3, name: "study-anon", role: "dataset", kind: "dataset", path: "/data/study-anon", files: 40, stacks: 8, subjects: 4 }] };
const RUN_40 = { ...RUN_41, id: 40, pipeline_id: 11, pipeline: "ants@1", units_run: FAMILY_UNITS, summary: { units: { total: 2, succeeded: 2 }, derivatives: 4 }, made: { units: 2, made: 2, failed: 0, skipped: 0, left: 0, nothing: false, why: [] } };

const json = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.origin);
  const path = url.pathname;
  const method = init?.method ?? "GET";
  if (path === "/desk/capabilities") return json(200, caps);
  if (path === "/api/capabilities") return json(200, engine);
  if (path === "/desk/people") return json(200, { people: [{ subject: "astrid@site", display: "Astrid" }] });
  if (path.startsWith("/desk/")) return json(404, { error: `the layout check's desk has no ${path}` });
  if (path === "/api/pipelines") return json(200, { pipelines: PIPELINES, families: FAMILIES, capability: { enabled: true, runtime: { name: "podman", version: "5.4" } } });
  if (path === "/api/pipelines/family/registration") return json(200, FAMILIES[0]);
  if (path === "/api/pipeline-runs") return json(200, { runs: RUNS, limit: 50 });
  if (path === "/api/pipeline-runs/41") return json(200, RUN_41);
  if (path === "/api/pipeline-runs/43") return json(200, RUN_43);
  if (path === "/api/pipeline-runs/40") return json(200, RUN_40);
  if (path === "/api/workflows") return json(200, { workflows: WORKFLOWS });
  if (path === "/api/workflows/1") return json(200, WORKFLOWS[0]);
  if (path === "/api/workflows/2") return json(200, WORKFLOWS[1]);
  if (path === "/api/workflows/1/plan" && method === "POST") return json(200, PLAN);
  if (path === "/api/workflows/1/run" && method === "POST") return json(202, { job: 105, state: "queued", workflow: "flair-lesions@1", workflow_id: 1, handle: 71, plan: PLAN.verdicts });
  if (path === "/api/workflow-runs") return json(200, { runs: WORKFLOW_RUNS });
  if (path === "/api/workflow-runs/12") return json(200, WORKFLOW_RUN);
  if (path === "/api/workflow-runs/13") return json(200, WORKFLOW_RUN_GOING);
  if (path.startsWith("/api/provenance/")) return json(200, PROVENANCE);
  if (/^\/api\/jobs\/\d+$/u.test(path)) return json(200, { id: 102, state: "done", started_at: "2026-10-21T02:00:00Z" });
  if (path === "/api/jobs" && method === "POST") return json(202, { job: 106, state: "queued" });
  if (path === "/api/jobs") return json(200, { count: 0, jobs: [] });
  if (path === "/api/derivatives") return json(200, { derivatives: [] });
  if (path === "/api/sources") return json(200, SOURCES);
  if (path === "/api/cohorts") return json(200, []);
  if (path === "/api/ask/selections") return json(200, { count: 1, total: 1, matching: 1, selections: SELECTIONS, next: null });
  if (path.startsWith("/api/ask/selections/")) return json(200, { name: "ms-baseline", version: 4, current_version: 4, ask: {} });
  return json(404, { error: `the layout check's engine has no ${method} ${path}` });
}) as typeof fetch;

if (!location.hash) location.hash = "#pipelines";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
