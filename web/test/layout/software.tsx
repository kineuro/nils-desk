// SPDX-License-Identifier: AGPL-3.0-only
// Wave 7b's screens in the real desk, its top bar, its side and its pages,
// against a fake engine in the engine's shapes, for the layout check and the
// screenshots of the desk rounds (spec 17): Settings > Software
// (#settings/software), a run's units with who chose each knob, their
// caveats, flags and keys, and its numbers per comparability key
// (#pipelines/runs/41), and the start of a run with the pack's goal and
// switches and the pre-flight's judged units (#pipelines/catalog, then Run).
// ?pooled makes the table's ask refused for pooling, as the engine refuses a
// total across keys. Every name and number here is made up.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../src/App";
import "../../src/shell.css";
import { GRANTS } from "../../src/grants";
import { NUMBERS_TWO, PACK_DOC, PRE_PACK, RUN_PACK, SAMSEG_PIPELINE } from "../../src/ops/pack.fixture";
import { PLACE, SOFTWARE_DOORS } from "../../src/settings/software.fixture";

const POOLED = new URLSearchParams(location.search).has("pooled");

const DOORS = [
  "GET /api/capabilities",
  "GET /api/pipelines",
  "GET /api/pipelines/{id}",
  "GET /api/pipelines/{id}/pack",
  "POST /api/pipelines/{name}/preflight",
  "GET /api/pipeline-runs",
  "GET /api/pipeline-runs/{id}",
  "GET /api/pipeline-runs/{id}/numbers",
  "GET /api/derivatives",
  "GET /api/ask/selections",
  "GET /api/ask/selections/{name}",
  "POST /api/ask/run",
  "GET /api/sources",
  "GET /api/cohorts",
  "GET /api/jobs",
  "GET /api/jobs/{id}",
  "POST /api/jobs",
  ...SOFTWARE_DOORS,
];

const engine = {
  engine: { name: "nils", version: "1.0.0-beta.1.dev.3" },
  contracts: { openapi: "7" },
  doors: DOORS,
  policy: [],
  auth: "token",
  principal: "astrid@site",
  roles: [],
  registry: { epoch: 4 },
  packs: [{ name: "mri", version: "1.0.1", main_roles: ["t1w", "flair", "t2w"] }],
  pipelines: { enabled: true, preflight: { door: "POST /api/pipelines/{name}/preflight", resume: true } },
};
const caps = {
  engine,
  kvasir: null,
  assistant: null,
  apps: [],
  person: { subject: "astrid@site", display_name: "Astrid", grants: [...GRANTS], detail: "quasi", groups: [] },
  desk: { version: "1.0.0", mode: "local", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
};

const PIPELINES = [{ ...SAMSEG_PIPELINE, description: "White matter lesions from a T1 and a FLAIR, by SAMSEG.", standing: "current", inputs: [], needs: { gpu: "none" }, proposals: [], pack_digest: PACK_DOC.pack_digest }];
const SELECTIONS = [{ name: "study", version: 3, versions: 3, subjects: 12, sessions: 12, stacks: 24, saved_at: "2026-10-19T12:00:00Z", by: "astrid@site" }];

const json = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.origin);
  const path = url.pathname;
  const method = init?.method ?? "GET";
  if (path === "/desk/capabilities") return json(200, caps);
  if (path === "/api/capabilities") return json(200, engine);
  if (path === "/desk/people") return json(200, { people: [{ subject: "bo@site", display: "Bo" }] });
  if (path.startsWith("/desk/")) return json(404, { error: `the layout check's desk has no ${path}` });
  if (path === "/api/software") return json(200, PLACE);
  if (path === "/api/pipelines") return json(200, { pipelines: PIPELINES, capability: { enabled: true, runtime: { name: "podman", version: "5.4" } } });
  if (path === "/api/pipelines/5/pack") return json(200, PACK_DOC);
  if (path === "/api/pipelines/5/preflight") return json(200, PRE_PACK);
  if (path === "/api/pipeline-runs") return json(200, { runs: [RUN_PACK], limit: 50 });
  if (path === "/api/pipeline-runs/41") return json(200, RUN_PACK);
  if (path === "/api/pipeline-runs/41/numbers") return json(200, NUMBERS_TWO);
  if (path === "/api/ask/run") {
    if (POOLED) return json(409, { error: `${NUMBERS_TWO.words}: group by measure.samseg-lesions.key to answer per key` });
    return json(200, { columns: ["id", "measure.samseg-lesions.intracranial", "measure.samseg-lesions.flair_t1_brain_dice"], rows: [[101, 1_452_000, 0.9], [102, 1_380_000, null], [103, 1_448_000, 0.79]], truncated: false });
  }
  if (/^\/api\/jobs\/\d+$/u.test(path)) return json(200, { id: 71, state: "done", started_at: "2026-10-20T08:00:00Z" });
  if (path === "/api/jobs" && method === "POST") return json(202, { job: 80, state: "queued" });
  if (path === "/api/jobs") return json(200, { count: 0, jobs: [] });
  if (path === "/api/derivatives") return json(200, { derivatives: [] });
  if (path === "/api/sources") return json(200, { count: 0, window_days: 0, sources: [] });
  if (path === "/api/cohorts") return json(200, []);
  if (path === "/api/ask/selections") return json(200, { count: 1, total: 1, matching: 1, selections: SELECTIONS, next: null });
  if (path.startsWith("/api/ask/selections/")) return json(200, { name: "study", version: 3, current_version: 3, ask: {} });
  return json(404, { error: `the layout check's engine has no ${method} ${path}` });
}) as typeof fetch;

if (!location.hash) location.hash = "#settings/software";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
