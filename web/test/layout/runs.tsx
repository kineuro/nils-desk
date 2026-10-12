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
// Record 55 (2026-10-12): beside the selections, two datasets (and a root,
// never offered) and two cohorts (one retired, never offered), whose main
// scans of a role a run goes straight over, and a pre-flight of them that
// says how many scans they resolve to and the visits that have none.
// Since 2026-10-12: a run that made nothing though it is done (every session
// skipped for want of a FLAIR) and runs that made part or all of what they
// were for, each read as its units summed; a resumed run's pre-flight, which
// Run again opens first; and on the Jobs page a stopped run's job whose run a
// later job took up again, and that later job, which made nothing.
// Every name and number here is made up.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../src/App";
import "../../src/shell.css";
import { GRANTS } from "../../src/grants";

const ask = new URLSearchParams(location.search);
const OFFLINE = ask.has("offline");
/** ?refuse: the pre-flight passes, and the jobs door refuses the run when it is pressed, as it does when the machine changed between. */
const REFUSE = ask.has("refuse");
let installed = ask.has("installed");

const INSTALL = "POST /api/tools/dcm2niix/install";
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
  "GET /api/sources",
  "GET /api/cohorts",
  "GET /api/jobs",
  "GET /api/jobs/{id}",
  "POST /api/jobs",
  "POST /api/jobs/{id}/cancel",
  "GET /api/review",
  "GET /api/tools",
  INSTALL,
];

const PINNED = "v1.0.20260724";
const WHERE = "/usr/local/lib/nils/tools/dcm2niix";
const FIX = { tool: "dcm2niix", door: INSTALL, command: "nils tools install dcm2niix", grant: "install:work" };
/** dcm2niix as GET /api/tools and the capabilities answer it. */
const tool = () => ({
  name: "dcm2niix",
  present: installed,
  path: installed ? WHERE : null,
  found_by: installed ? "tools" : null,
  version: installed ? PINNED : null,
  pinned: PINNED,
  current: installed ? true : null,
  problem: null,
  install: { door: INSTALL, command: FIX.command, grant: FIX.grant, available: true, into: "/usr/local/lib/nils/tools", source: "https://github.com/rordenlab/dcm2niix/releases", sha256: "5e".repeat(32), why: null },
});

const engine = (): Record<string, unknown> => ({
  engine: { name: "nils", version: "1.0.0-alpha.80" },
  contracts: { openapi: "7" },
  doors: DOORS,
  policy: [],
  auth: "token",
  principal: "astrid@site",
  roles: [],
  registry: { epoch: 4 },
  packs: [{ name: "mri", version: "1.0.1", main_roles: ["t1w", "flair", "t2w"] }],
  tools: { dcm2niix: tool() },
  pipelines: { enabled: true, preflight: { door: "POST /api/pipelines/{name}/preflight", resume: true } },
});
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
const ADVICE = "Install dcm2niix where the engine runs: an admin can from Settings, Parts, or with nils tools install dcm2niix; then run it again.";
const failure = (kind: string, cause: string, advice: string, fix: unknown = null) => ({ kind, cause, advice, fix });
const NO_DCM2NIIX = failure("dependency", "dcm2niix", ADVICE, FIX);

/** The checks as this page's engine answers them: with ?refuse a dcm2niix of the site's is found on the search path. */
const checksNow = () => (REFUSE && !installed ? requirements().map((c) => (c.check === "converter" ? { ...c, ok: true, said: "v1.0.20250506 at /usr/bin/dcm2niix (on the engine's search path)", failure: null } : c)) : requirements());

/** What a run needs of this machine, as the pre-flight checks it. */
const requirements = () => [
  installed
    ? { check: "converter", ok: true, said: `${PINNED} at ${WHERE} (in the registry's tools folder)`, failure: null, path: WHERE, found_by: "tools", version: PINNED }
    : { check: "converter", ok: false, said: "dcm2niix is not on the engine's search path, beside nils, where the setup record names one, or in the registry's tools folder", failure: NO_DCM2NIIX, path: null, found_by: null },
  { check: "runtime", ok: true, said: "podman 5.4.2", failure: null, runtime: "podman", version: "5.4.2" },
  { check: "image", ok: true, said: "the image is not here yet; it is pulled when the run starts", failure: null, present: false },
  { check: "memory", ok: true, said: "a unit needs 8 GB; the machine has 62 GB and the lane 48 GB", failure: null, need_gb: 8, machine_gb: 62, lane_gb: 48 },
  { check: "disk", ok: true, said: "the units take 14 GB of the 812 GB free in the working place work", failure: null, place: "work", free_gb: 812, need_gb: 14 },
];

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
/** What a run made, as the engine sums its units. */
const made = (units: number, done: number, failed: number, skipped: number, why: { status: string; why: string; units: number }[]) => ({ units, made: done, failed, skipped, left: 0, nothing: done === 0, line: null, why });
const SKIPPED = ["sub-7a8b_ses-1", "sub-9c0d_ses-1", "sub-1e2f_ses-2", "sub-3a4b_ses-1"];
const RUNS = [
  // taken up again once dcm2niix was there, with no session able to run: done, and made nothing
  run(15, PIPELINES[0], "selection:t1-3d-stacks@1", "done", 8, {
    results_digest: "c4",
    summary: { units: { total: 4, succeeded: 0, failed: 0, skipped: 4, unreported: 0, missing_input: 4 }, derivatives: 0, converter: { version: PINNED, path: WHERE, found_by: "tools" } },
    made: made(4, 0, 0, 4, [{ status: "skipped", why: "no FLAIR picked", units: 4 }]),
    units_run: SKIPPED.map((u) => ({ ...unit(u, "skipped", "missing an input: no flair is picked for it among the selection's stacks"), attempts: 0, exit_code: null, lacks: ["no FLAIR picked"] })),
  }),
  run(14, PIPELINES[1], "selection:3d-t1-siemens@1", "failed", 12, { error: ERROR, failure: NO_DCM2NIIX }),
  run(13, PIPELINES[0], "selection:t1-3d-stacks@1", "failed", 20, { error: ERROR }),
  run(12, PIPELINES[1], "selection:flair-2d-ge@1", "partial", 200, {
    results_digest: "9f",
    summary: { units: { total: 3, succeeded: 2, failed: 1 }, derivatives: 2, failures_by_cause: [{ kind: "resource", cause: "memory", units: 1 }], converter: { version: PINNED, path: WHERE, found_by: "tools" } },
    made: made(3, 2, 1, 0, [{ status: "failed", why: "out of memory", units: 1 }]),
    units_run: [unit("sub-1a2b_ses-1", "succeeded"), { ...unit("sub-3c4d_ses-1", "failed", "the container was killed: out of memory at 15.8 GB. The lane allows 16 GB a unit."), failure: failure("resource", "memory", "Give the lane more memory, or run fewer units at once.") }, unit("sub-5e6f_ses-2", "succeeded")],
  }),
  run(11, PIPELINES[0], "selection:ms-followup-source@3", "done", 1500, { results_digest: "ab", summary: { units: { total: 41, succeeded: 41 }, derivatives: 82 }, made: made(41, 41, 0, 0, []) }),
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

/** The datasets, a root among them, and the cohorts, a retired one among them: the root and the retired one are never offered. */
const totals = (subjects: number, stacks: number) => ({ subjects, studies: subjects, sessions: subjects, stacks, refused_files: 0, to_sort: 0 });
const SOURCES = [
  { id: 2, name: "archive", kind: "root", totals: totals(0, 0) },
  { id: 3, name: "study-anon", kind: "dataset", totals: totals(412, 5120) },
  { id: 4, name: "ms-2026", kind: "dataset", totals: totals(38, 960) },
];
const COHORTS = [
  { name: "ms-followup", subjects: 41, stacks: 2210, retired_at: null },
  { name: "pilot-2024", subjects: 9, stacks: 300, retired_at: ago(90 * 1440) },
];

/** A dataset's or a cohort's main scans as the engine resolves them: how many, under which rules, and the visits with none. */
function mainRead(spec: string): Record<string, unknown> | null {
  const m = /^main:([a-z0-9]+)@(dataset|cohort):(.+)$/u.exec(spec);
  if (!m) return null;
  const [, role, kind, name] = m;
  const own = name === "study-anon";
  return {
    main: role,
    of: spec,
    scope: { kind, id: 3, name },
    picks: own ? { scope: { kind, id: 3, name }, version: 3, digest: "c0ffee", run: 88 } : { scope: null, version: 1, defaults: true, pack: "mri", pack_version: "1.0.1" },
    read: own ? `${kind} ${name}'s main scans under its own rules, version 3` : `the pack's main scans of ${kind} ${name}`,
    visits: 486,
    main_visits: 474,
    stacks: 481,
    without: {
      visits: 12,
      why: [
        { why: `it holds no ${role} scan`, visits: 9 },
        { why: `it holds a ${role} scan and none is picked`, visits: 3 },
      ],
      named: [
        { subject_id: 21, subject: "7a8b9c0d", session_day: "2023-01-15", why: `it holds a ${role} scan and none is picked` },
        { subject_id: 22, subject: "1e2f3a4b", session_day: "2022-11-02", why: `it holds a ${role} scan and none is picked` },
        { subject_id: 23, subject: "5c6d7e8f", session_day: "2024-03-09", why: `it holds a ${role} scan and none is picked` },
        { subject_id: 24, subject: "9a0b1c2d", session_day: "2021-06-30", why: `it holds no ${role} scan` },
      ],
    },
  };
}

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
  if (path === "/api/jobs" && method === "POST") {
    const command = (body.command ?? []) as string[];
    // a new run is checked for what it needs of this machine; one taken up again is not
    if (REFUSE && command[0] === "run" && !command.includes("--resume")) return json(409, { error: "refused before it started: the units take 920 GB and the working place work has 812 GB free; free space or choose another place", failure: failure("resource", "disk", "Free space in the working place, or name another with nils pipeline lane --output-place, then run it again."), requirements: [...checksNow().slice(0, 4), { check: "disk", ok: false, said: "the units take 920 GB and the working place work has 812 GB free", failure: failure("resource", "disk", "Free space in the working place, or name another with nils pipeline lane --output-place, then run it again."), place: "work", free_gb: 812, need_gb: 920 }] });
    return json(200, { job: 51, state: "queued" });
  }
  if (path === "/api/jobs") {
    const queued = ["run", "samseg-lesions@1", "--select", "selection:t1-3d-stacks@1", "--pack-dir", "/usr/local/share/nils/packs"];
    const resumed = ["run", "--resume", "15", "--pack-dir", "/usr/local/share/nils/packs"];
    const jobs = [
      // run 15 taken up again once dcm2niix was there: done, with no session able to run
      { id: 46, kind: "pipeline", name: "samseg-lesions@1", state: "done", started_at: ago(9), heartbeat_at: null, finished_at: ago(8), progress: null, error: null, failure: null, args: { argv: resumed, queued: resumed, principal: "astrid@site", pipeline: "samseg-lesions@1", resume: 15, run: 15 }, result: { run: 15, status: "done", summary: RUNS[0].summary, results_digest: "c4" }, made: RUNS[0].made, taken_up: null },
      { id: 44, kind: "run", name: null, state: "failed", started_at: ago(12), heartbeat_at: null, finished_at: ago(11), progress: null, error: ERROR, failure: NO_DCM2NIIX, args: { argv: ["run", "n4-bias-correction@1", "--select", "selection:3d-t1-siemens@1"], principal: "astrid@site" }, result: null },
      // the job run 15 stopped in for want of dcm2niix, taken up again since as job 46
      { id: 18, kind: "pipeline", name: "samseg-lesions@1", state: "failed", started_at: ago(560), heartbeat_at: null, finished_at: ago(559), progress: null, error: ERROR, failure: NO_DCM2NIIX, args: { argv: queued, queued, principal: "astrid@site", pipeline: "samseg-lesions@1", run: 15 }, result: { run: 15, status: "failed", summary: {}, results_digest: null, failure: NO_DCM2NIIX }, made: null, taken_up: { job: 46, state: "done", run: 15 } },
    ];
    // without ?all the door lists the jobs not over, as the engine's does
    const listed = url.searchParams.has("all") ? jobs : jobs.filter((j) => j.state === "queued" || j.state === "running" || j.state === "cancelling");
    return json(200, { count: listed.length, jobs: listed });
  }
  if (path === "/api/tools") return json(200, { tools: [tool()] });
  if (path === "/api/derivatives") return json(200, { derivatives: [] });
  if (path === "/api/sources") return json(200, { count: SOURCES.length, window_days: 0, sources: SOURCES });
  if (path === "/api/cohorts") return json(200, COHORTS);
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
    // a bids input is released with dcm2niix: not ready until it is installed (or, with ?refuse, said ready)
    const ready = installed || REFUSE;
    const checks = checksNow();
    // a run taken up again: the units it still has to run, every one of which can
    if (typeof body.resume === "number")
      return json(200, { pipeline: "n4-bias-correction@1", selection: "selection:3d-t1-siemens@1", resume: { run: body.resume, status: "failed", job: 44, kept: 0, made: 0 }, layout: "bids", level: "session", unit: "session", stacks: 318, units: { total: 140, ready: 140, missing: 0 }, missing: [], cannot: [], estimate: { seconds_per_unit: 95, source: "descriptor", seconds: 3300, slots: 4 }, gpu: { need: "none", available: null, device: null }, budget: { cores: 16, memory_gb: 48, fits: true }, ready, blockers: ready ? [] : [checks[0].said], requirements: checks, failure: ready ? null : NO_DCM2NIIX });
    const main = typeof body.select === "string" ? mainRead(body.select) : null;
    if (main)
      return json(200, { pipeline: "n4-bias-correction@1", selection: body.select, main, layout: "bids", level: "session", stacks: 481, units: { total: 474, ready: 474, missing: 0 }, missing: [], estimate: { seconds_per_unit: 95, source: "descriptor", seconds: 11300, slots: 4 }, gpu: { need: "none", available: null, device: null }, budget: { cores: 16, memory_gb: 48, fits: true }, ready, blockers: ready ? [] : [checks[0].said], requirements: checks, failure: ready ? null : NO_DCM2NIIX });
    return json(200, { pipeline: "n4-bias-correction@1", selection: body.select, layout: "bids", level: "session", stacks: 318, units: { total: 140, ready: 138, missing: 2 }, missing: [{ unit: "sub-7a8b_ses-1", why: "no t1w picked" }, { unit: "sub-9c0d_ses-2", why: "no t1w picked" }], estimate: { seconds_per_unit: 95, source: "descriptor", seconds: 3300, slots: 4 }, gpu: { need: "none", available: null, device: null }, budget: { cores: 16, memory_gb: 48, fits: true }, ready, blockers: ready ? [] : [checks[0].said], requirements: checks, failure: ready ? null : NO_DCM2NIIX });
  }
  if (path === INSTALL.split(" ")[1] && method === "POST") {
    if (OFFLINE)
      return json(502, {
        error: `the releases of dcm2niix could not be reached (github.com: no route to host). By hand: fetch dcm2niix_lnx.zip of ${PINNED} from github.com/rordenlab/dcm2niix/releases, check that its sha256 is ${"5e".repeat(32)}, and put its dcm2niix in /usr/local/lib/nils/tools.`,
        offline: true,
        failure: NO_DCM2NIIX,
      });
    installed = true;
    return new Promise((r) => setTimeout(r, 400)).then(() => json(200, { installed: true, source: "https://github.com/rordenlab/dcm2niix/releases", tool: tool() }));
  }
  return json(404, { error: `the layout check's engine has no ${path}` });
}) as typeof fetch;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
