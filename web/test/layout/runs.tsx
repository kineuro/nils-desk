// SPDX-License-Identifier: AGPL-3.0-only
// Runs that say why, and the Over that finds what a person means (2026-10-12):
// the real desk, its top bar and side, on Pipelines, Catalog against a fake
// engine with two runs that failed for want of dcm2niix (one as the engine
// says it today, one with the failure slice's kind and what to do), a run
// whose units failed for memory, and a run that went well; the run form's
// Over over five saved selections, one of them a cohort's source; a refused
// pre-flight that an install of dcm2niix clears; a run's page; and Settings,
// Parts with dcm2niix under Tools. ?offline makes the install fail as an
// engine without the network does; ?installed has dcm2niix there already.
// Every name and number here is made up.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../src/App";
import "../../src/shell.css";
import { GRANTS } from "../../src/grants";
import { SLICE } from "../../src/ops/failure";
import { installDoor } from "../../src/ops/tools";

const ask = new URLSearchParams(location.search);
const OFFLINE = ask.has("offline");
let installed = ask.has("installed");

const INSTALL = installDoor("dcm2niix");
const DOORS = [
  "GET /api/capabilities",
  "GET /api/pipelines",
  "GET /api/pipelines/{id}",
  "POST /api/pipelines/{name}/preflight",
  "GET /api/pipeline-runs",
  "GET /api/pipeline-runs/{id}",
  "GET /api/derivatives",
  "GET /api/ask/selections",
  "GET /api/ask/selections/{name}",
  "GET /api/jobs",
  "GET /api/jobs/{id}",
  "POST /api/jobs",
  "POST /api/jobs/{id}/cancel",
  "GET /api/review",
  INSTALL,
];

/** A value at one of SLICE's dotted paths, the tool's name put in. */
function put(o: Record<string, unknown>, name: keyof typeof SLICE, v: unknown) {
  const path = SLICE[name].replace("{tool}", "dcm2niix").split(".");
  let at = o;
  for (const k of path.slice(0, -1)) at = (at[k] ??= {}) as Record<string, unknown>;
  at[path[path.length - 1]] = v;
  return o;
}
const VERSION = "v1.0.20250506";
const WHERE = "/usr/local/bin/dcm2niix";
const status = () => put(put(put({}, "present", installed), "path", installed ? WHERE : null), "version", installed ? VERSION : null);

const engine = (): Record<string, unknown> =>
  put(
    { engine: { name: "nils", version: "1.0.0-alpha.80" }, contracts: { openapi: "7" }, doors: DOORS, policy: [], auth: "token", principal: "astrid@site", roles: [], registry: { epoch: 4 }, packs: [{ name: "mri", version: "1.0.1" }] },
    "status",
    status(),
  );
const caps = () => ({
  engine: engine(),
  kvasir: null,
  assistant: null,
  apps: [],
  person: { subject: "astrid@site", display_name: "Astrid", grants: [...GRANTS], detail: "sensitive", groups: [] },
  desk: { version: "1.0.0", mode: "local", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
});

const NOW = Date.now();
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString().replace(/\.\d+Z$/u, "Z");

const ERROR = `the release of the input failed: dcm2niix is not runnable (No such file or directory (os error 2)). dcm2niix is a prerequisite of a deployment: install a current build from rordenlab/dcm2niix, which a distribution's package lags, and pass --dcm2niix if it is not on the path.`;
const TODO = "Install dcm2niix where the engine runs, then run it again.";
const slice = (o: Record<string, unknown>, kind: string, todo: string) => put(put(o, "kind", kind), "todo", todo);

const IMAGE = `ghcr.io/kineuro/nils-pipelines@sha256:${"4b".repeat(32)}`;
const PIPELINES = [
  { id: 3, name: "samseg-lesions", version: "1", label: "samseg-lesions@1", description: "White matter lesions from a T1 and a FLAIR, by SAMSEG.", image: IMAGE, layout: "bids", level: "session", state: "active", parameters: [], inputs: [], outputs: [{ id: "lesions", kind: "mask" }, { id: "volumes", kind: "table" }], needs: { gpu: "none" }, proposals: [] },
  { id: 4, name: "n4-bias-correction", version: "1", label: "n4-bias-correction@1", description: "N4 bias field correction of a T1.", image: IMAGE, layout: "bids", level: "session", state: "active", parameters: [{ id: "shrink", name: "Shrink factor", type: "Number", integer: true, minimum: 1, maximum: 8, "default-value": 4, optional: true }], inputs: [], outputs: [{ id: "corrected", kind: "image" }], needs: { gpu: "none" }, proposals: [] },
];

const run = (id: number, pipeline: (typeof PIPELINES)[number], selection: string, status: string, minutes: number, more: Record<string, unknown> = {}) => ({
  id,
  pipeline_id: pipeline.id,
  pipeline: pipeline.label,
  job_id: id + 30,
  handle_id: id + 70,
  selection,
  status,
  started_at: ago(minutes),
  finished_at: ago(minutes - 1),
  runtime: "podman",
  device: "cpu",
  results_digest: null,
  summary: { units: { total: 0 } },
  error: null,
  units_run: [],
  ...more,
});
const unit = (u: string, status: string, error: string | null = null) => ({ unit: u, state: "over", status, attempts: 1, device: "cpu", exit_code: status === "failed" ? 137 : 0, started_at: ago(200), finished_at: ago(190), error });
const RUNS = [
  slice(run(14, PIPELINES[1], "selection:3d-t1-siemens@1", "failed", 12, { error: ERROR }), "dependency", TODO),
  run(13, PIPELINES[0], "selection:t1-3d-stacks@1", "failed", 20, { error: ERROR }),
  run(12, PIPELINES[1], "selection:flair-2d-ge@1", "partial", 200, {
    results_digest: "9f",
    summary: { units: { total: 3, succeeded: 2, failed: 1 }, derivatives: 2 },
    units_run: [unit("sub-1a2b_ses-1", "succeeded"), slice(unit("sub-3c4d_ses-1", "failed", "the container was killed: out of memory at 15.8 GB. The lane allows 16 GB a unit."), "resource", "Give the lane more memory, or run fewer units at once."), unit("sub-5e6f_ses-2", "succeeded")],
  }),
  run(11, PIPELINES[0], "selection:ms-followup-source@3", "done", 1500, { results_digest: "ab", summary: { units: { total: 41, succeeded: 41 }, derivatives: 82 } }),
];

const sel = (id: number, name: string, versions: number, rows: number | null, owner: string, made: number, more: Record<string, unknown> = {}) => ({
  id,
  name,
  spec: `selection:${name}@${versions}`,
  description: null,
  versions,
  grain: "stack",
  owner,
  created_at: ago(made),
  updated_at: ago(made - 60),
  updated_by: owner,
  note: null,
  cohort: null,
  size: rows === null ? null : { rows, grain: "stack", version: versions, handle: id + 100, at: ago(made - 60), truncated: false },
  ...more,
});
const SELECTIONS = [
  sel(1, "t1-3d-stacks", 1, 1204, "astrid", 3 * 1440),
  sel(2, "3d-t1-siemens", 2, 318, "bjorn", 2 * 1440),
  sel(3, "flair-2d-ge", 1, 96, "astrid", 9 * 1440),
  sel(4, "ms-followup-source", 3, 2210, "carin", 30 * 1440, { cohort: "ms-followup", description: "The source ask of the follow-up cohort" }),
  sel(5, "dwi-b1000-all-sites", 1, null, "bjorn", 600),
].sort((a, b) => a.name.localeCompare(b.name));

const json = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.origin);
  const path = url.pathname;
  const method = init?.method ?? "GET";
  const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
  if (path === "/desk/capabilities") return json(200, caps());
  if (path === "/api/capabilities") return json(200, engine());
  if (path === "/api/pipelines") return json(200, { pipelines: PIPELINES, capability: { enabled: true, runtime: { name: "podman", version: "5.4" } } });
  if (path === "/api/pipeline-runs") return json(200, { runs: RUNS, limit: 50 });
  const one = /^\/api\/pipeline-runs\/(\d+)$/u.exec(path);
  if (one) {
    const r = RUNS.find((x) => x.id === Number(one[1]));
    return r ? json(200, r) : json(404, { error: "no such run" });
  }
  if (/^\/api\/jobs\/\d+$/u.test(path)) return json(200, { id: 44, state: "failed", started_at: ago(12) });
  if (path === "/api/jobs" && method === "POST") return json(200, { job: 51, state: "queued" });
  if (path === "/api/derivatives") return json(200, { derivatives: [] });
  if (path === "/api/ask/selections") {
    const q = (url.searchParams.get("q") ?? "").toLowerCase();
    const list = SELECTIONS.filter((s) => s.name.includes(q));
    return json(200, { count: list.length, total: SELECTIONS.length, matching: list.length, selections: list, next: null });
  }
  const named = /^\/api\/ask\/selections\/(.+)$/u.exec(path);
  if (named) {
    const [name, v] = decodeURIComponent(named[1]).split("@");
    const s = SELECTIONS.find((x) => x.name === name);
    return s && (!v || Number(v) <= s.versions) ? json(200, { name, version: v ? Number(v) : s.versions }) : json(404, { error: `no selection ${decodeURIComponent(named[1])}` });
  }
  if (/^\/api\/pipelines\/[^/]+\/preflight$/u.test(path)) {
    // a bids input is released with dcm2niix: refused until it is installed
    if (!installed) return json(400, slice({ error: ERROR }, "dependency", TODO));
    return json(200, { pipeline: "n4-bias-correction@1", selection: body.select, layout: "bids", level: "session", stacks: 318, units: { total: 140, ready: 138, missing: 2 }, missing: [{ unit: "sub-7a8b_ses-1", why: "no t1w picked" }, { unit: "sub-9c0d_ses-2", why: "no t1w picked" }], estimate: { seconds_per_unit: 95, source: "descriptor", seconds: 3300, slots: 4 }, gpu: { need: "none", available: null, device: null }, budget: { cores: 16, memory_gb: 64, fits: true }, ready: true, blockers: [] });
  }
  if (path === INSTALL.split(" ")[1] && method === "POST") {
    if (OFFLINE) return json(502, put({ error: "the download of dcm2niix failed: github.com could not be reached (no route to host). The engine's machine is offline." }, "kind", "dependency"));
    installed = true;
    return new Promise((r) => setTimeout(r, 400)).then(() => json(200, status()));
  }
  return json(404, { error: `the layout check's engine has no ${path}` });
}) as typeof fetch;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
