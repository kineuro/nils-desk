// SPDX-License-Identifier: AGPL-3.0-only
// Setup after a command-line install (agenda 3.8): the real desk, its top bar
// and side, against a fake engine whose registry was digested with the
// command line, so it holds stacks and names no source place, has no backup
// schedule, and the desk is open to the network with nobody signing in. The
// root-folder step holds on the stacks, the two other needed steps stay
// listed, and the page says the desk is open with a way to Home. ?empty is
// the same install before anything was digested: setup holds the desk.
// Every name and number here is made up.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../src/App";
import "../../src/shell.css";
import { GRANTS } from "../../src/grants";

const EMPTY = new URLSearchParams(location.search).has("empty");
const STACKS = EMPTY ? 0 : 12480;
const ENGINE = "1.0.0-beta.1";

const engine = {
  engine: { name: "nils", version: ENGINE },
  contracts: { openapi: "7", pack: "10" },
  doors: ["GET /api/capabilities", "GET /api/places", "GET /api/backups", "GET /api/summary", "GET /api/sources", "GET /api/review", "GET /api/campaigns", "GET /api/jobs", "GET /api/batches"],
  policy: [],
  auth: "token",
  principal: "astrid@site",
  roles: [],
  registry: { epoch: 4, schema_version: 40 },
  packs: [{ name: "mri", version: "1.0.3" }],
  uptime_seconds: 5 * 86_400,
};

const caps = {
  engine,
  kvasir: null,
  assistant: null,
  apps: [],
  person: { subject: "astrid@site", display_name: "Astrid", grants: [...GRANTS], detail: "sensitive", groups: [] },
  desk: {
    version: ENGINE,
    mode: "off",
    contracts: {},
    engine_reachable: true,
    contract_mismatch: null,
    login: null,
    signed_in: true,
    settings: {
      origin: "https://desk.example.org",
      engine_url: "http://127.0.0.1:8437",
      kvasir_url: null,
      assistant_url: null,
      session_hours: 12,
      token_minutes: 15,
      cli_token_hours: 24,
      export: "export",
      store: "/home/astrid/nils/desk",
      retention: "90 days",
      engine_flags: null,
      supervisor_url: null,
    },
  },
};

const places = { places: [{ id: 1, name: "registry", role: "registry", path: "/scratch/astrid/nils/registry", guarantees: {}, probed: { mount: "/scratch" }, probed_at: null, retired_at: null }] };
const backups = { dir: "/scratch/astrid/nils/backups", place: null, count: 0, archives: [], schedule: { every: "off", at: "02:00", day: null, keep: 14, timezone: "UTC", next: null, next_local: null, last: null } };
const counts = (total: number) => ({ total, by_cohort: {} });
const summary = { epoch: 4, synthetic: null, cohorts: 0, subjects: counts(EMPTY ? 0 : 1_205), sessions: counts(EMPTY ? 0 : 2_610), stacks: counts(STACKS), since: null };

const json = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
window.fetch = ((input: RequestInfo | URL) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const path = new URL(url, location.origin).pathname;
  if (path === "/desk/capabilities") return json(200, caps);
  if (path === "/api/capabilities") return json(200, engine);
  if (path === "/api/places") return json(200, places);
  if (path === "/api/backups") return json(200, backups);
  if (path === "/api/summary") return json(200, summary);
  if (path === "/api/sources") return json(200, { count: 0, window_days: 30, sources: [] });
  if (path === "/api/batches") return json(200, { count: EMPTY ? 0 : 3, batches: [] });
  if (path === "/api/jobs") return json(200, { jobs: [] });
  return json(404, { error: `the layout check's engine has no ${path}` });
}) as typeof fetch;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
