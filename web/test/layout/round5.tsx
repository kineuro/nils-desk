// SPDX-License-Identifier: AGPL-3.0-only
// Record 55 H2, round 5 (spec 13.1): the real desk, its top bar and side,
// against a fake engine, desk and assistant, on each page this round
// changed: Settings landing on Overview with Engine, Desk, Language models
// and the Assistant set in under Parts; People, an admin's reset of another
// person's password and their removal with what they kept handed over; one's
// own password on the profile; Backups with restore as three printed steps;
// Release with a row's hand over and withdraw; the Logs page with a job's log
// and a run's units; and the Assistant's Plans waiting and Standing grants.
// Every name, path and number here is made up.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../src/App";
import "../../src/shell.css";
import { GRANTS } from "../../src/grants";

const DOORS = [
  "GET /api/capabilities",
  "GET /api/places",
  "GET /api/backups",
  "GET /api/settings",
  "GET /api/status",
  "GET /api/custody",
  "GET /api/audit",
  "GET /api/releases",
  "POST /api/releases",
  "POST /api/handovers",
  "GET /api/jobs",
  "POST /api/jobs",
  "GET /api/jobs/{id}",
  "GET /api/jobs/{id}/log",
  "GET /api/pipelines",
  "GET /api/pipeline-runs",
  "GET /api/pipeline-runs/{id}",
  "GET /api/pipeline-runs/{id}/log",
  "GET /api/pipeline-runs/{id}/units/{unit}/log",
];

const NOW = Date.now();
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString().replace(/\.\d+Z$/u, "Z");

const caps = {
  engine: {
    engine: { name: "nils", version: "1.0.0-alpha.80" },
    contracts: { openapi: "7" },
    doors: DOORS,
    policy: [],
    auth: "token",
    principal: "astrid",
    roles: ["admin"],
    registry: { epoch: 4 },
    packs: [{ name: "mri", version: "1.0.1" }],
  },
  kvasir: { models: [{ id: "local-model", locality: "local" }] },
  assistant: { assistant: { version: "1.0.0-alpha.27" }, stations: [], doors: ["GET /inbox", "GET /grants", "POST /grants", "DELETE /grants/{id}", "POST /plans/{id}/confirm"] },
  apps: [],
  person: { subject: "astrid", display_name: "Astrid Berg", grants: [...GRANTS], detail: "sensitive", groups: ["Admins"] },
  desk: {
    version: "1.0.0",
    mode: "local",
    contracts: {},
    engine_reachable: true,
    contract_mismatch: null,
    login: null,
    signed_in: true,
    settings: { origin: "http://127.0.0.1:7203", engine_url: "http://127.0.0.1:7200", kvasir_url: null, assistant_url: null, session_hours: 12, token_minutes: 5, cli_token_hours: 24, export: "", store: "", retention: "", engine_flags: null },
  },
};

const place = (id: number, name: string, role: string, path: string, guarantees: Record<string, unknown> = {}) => ({ id, name, role, path, guarantees, probed: null, probed_at: null, retired_at: null });
const PLACES = {
  places: [
    place(1, "studies", "source", "/srv/data/studies"),
    place(2, "registry", "registry", "/srv/nils/registry", { backup: "backups" }),
    place(3, "backups", "backup", "/srv/backups/nils"),
    place(4, "exports", "export", "/srv/exports"),
    place(5, "partner-outbox", "exchange", "/srv/exchange/partner-outbox-with-a-long-folder-name"),
  ],
};
const archive = (name: string, minutes: number) => ({ name, created_at: ago(minutes), seconds: 41, bytes: 2_400_000_000, files: 3, epoch: 4, schema_version: 86, backend: "sqlite", ours: true, checked: { at: ago(minutes - 1), ok: true, rehearsed: true } });
const BACKUPS = {
  dir: "/srv/backups/nils",
  place: { id: 3, name: "backups", guarantees: {} },
  count: 2,
  archives: [archive("nils-registry-2026-10-13T020000Z", 600), archive("nils-registry-2026-10-12T020000Z", 2040)],
  schedule: { every: "day", at: "02:00", day: null, keep: 14, timezone: "Europe/Stockholm", next: ago(-840) },
};
const STATUS = { registry: { home: "/srv/nils/registry", backend: "sqlite", schema: null, registry_id: "reg-7f3a", schema_version: 86, epoch: 4, created_at: ago(90000), pseudonym_scheme: "keyed", pseudonym_key: "site-key", display_length: 8 } };

const GROUPS = { groups: [{ id: 2, name: "Admins", grants: [...GRANTS], detail: "sensitive", follows: [], members: ["astrid"] }, { id: 3, name: "Reviewers", grants: ["data:see", "review:work", "assistant:use"], detail: "quasi", follows: [], members: ["erik", "maja"] }] };
const person = (subject: string, display: string, groups: number[], minutes: number | null) => ({ subject, display, groups, followed: [], grants: [], detail: null, access: { grants: groups.includes(2) ? [...GRANTS] : ["data:see", "review:work", "assistant:use"], detail: groups.includes(2) ? "sensitive" : "quasi" }, last_seen_at: minutes === null ? null : ago(minutes), sessions_open: minutes !== null && minutes < 5 ? 1 : 0 });
const ACCESS = { mode: "local", sessions_open: 2, people: [person("astrid", "Astrid Berg", [2], 1), person("erik", "Erik Lund", [3], 300), person("maja", "Maja Ek", [3], null)] };

const release = (id: number, name: string, version: string, more: Record<string, unknown> = {}) => ({ id, name, version, root: `/srv/exports/${name}`, started_at: ago((4 - id) * 900), files: 1204, subjects: 48, unchanged: null, moved: null, rewritten: null, added: null, removed: null, layout: "bids", actor: "astrid", sessions: 96, dates: "keep", uids: "remap", handed_over: null, ...more });
const RELEASES = [release(3, "ms-cohort-2026-10-01", "2"), release(2, "ms-cohort-2026-10-01", "1"), release(1, "pilot-2026-09", "1", { withdrawn_at: ago(3000), withdrawn_by: "astrid", withdrawn_why: "the wrong cohort" })];

const JOBS = [
  { id: 52, kind: "pipeline", name: "n4-bias-correction@2", state: "running", started_at: ago(4), heartbeat_at: ago(0), finished_at: null, progress: null, error: null, args: { argv: ["run", "n4-bias-correction@2"], queued: ["run", "n4-bias-correction@2"], principal: "astrid", run: 9 }, result: { run: 9 } },
  { id: 51, kind: "digest", name: "study-anon", state: "done", started_at: ago(60), heartbeat_at: null, finished_at: ago(55), progress: null, error: null, args: { argv: ["digest", "@study-anon"], principal: "astrid" }, result: null },
  { id: 50, kind: "release", name: "ms-cohort-2026-10-01", state: "failed", started_at: ago(200), heartbeat_at: null, finished_at: ago(199), progress: null, error: "the export place is full", args: { argv: ["release", "--name", "ms-cohort-2026-10-01"], principal: "astrid" }, result: null },
];
const DIGEST_LOG = Array.from({ length: 60 }, (_, i) => `digest: study-anon/derivatives/dcm-anon/sub-${(1000 + i).toString(16)}/ses-1: ${12 + (i % 7)} files read, 0 refused`).join("\n") + "\ndigest: 1,204 files in 48 subjects, 96 sessions; nothing refused\n";
const RUN = { id: 9, pipeline_id: 6, pipeline: "n4-bias-correction@2", job_id: 52, status: "running", started_at: ago(4), finished_at: null, units: "apart", units_run: ["sub-1a2b_ses-1", "sub-1a2b_ses-2", "sub-3c4d_ses-1", "sub-5e6f_ses-1"].map((unit, i) => ({ unit, state: i === 2 ? "failed" : i === 3 ? "running" : "done", status: null, attempts: 1, started_at: ago(4), finished_at: i < 3 ? ago(1) : null, error: i === 2 ? "exit 1" : null })) };

const INBOX = {
  subject: "astrid",
  jobs: { queued: [], running: [], finished: [], failed: [] },
  waiting: [{ n: 2, rung: 2, verb: "POST", door: "POST /api/jobs", words: "Sort the new sessions of study-anon", state: "waiting", reason: "no standing grant for POST /api/jobs: give one on Standing grants, or confirm each time", plan: "p2" }],
  plans: [
    { id: "p1", conversation: "c-41", instruction: "Every Monday at 06:00, sort what came in over the weekend and tell me what needs Review", state: "proposed", created_at: ago(30), steps: [{ n: 1, rung: 2, verb: "POST", door: "POST /api/jobs", words: "Sort what came in", state: "waiting" }, { n: 2, rung: 2, verb: "GET", door: "GET /api/review", words: "Count what waits on Review", state: "waiting" }] },
    { id: "p3", conversation: "c-44", instruction: "Merge the two codes of one subject", state: "confirmed", created_at: ago(300), steps: [{ n: 1, rung: 3, verb: "POST", door: "POST /api/linkage/merge", words: "Merge sub-7a8b into sub-9c0d", state: "proposed" }] },
  ],
  proposals: [{ n: 1, rung: 3, verb: "POST", door: "POST /api/linkage/merge", words: "Merge sub-7a8b into sub-9c0d", state: "proposed", plan: "p3" }],
  grants: [],
};
const GRANTS_DOC = {
  subject: "astrid",
  grants: [
    { id: 4, subject: "astrid", door: "POST /api/ask/run", page: "query", words: "Run questions", created_at: ago(9000), revoked_at: null },
    { id: 2, subject: "astrid", door: "POST /api/jobs", page: "data", words: "Read, sort, pseudonymise and bring in data", created_at: ago(20000), revoked_at: ago(15000) },
  ],
  ladder: [
    { door: "POST /api/ask/run", rung: 2, role: "reader" },
    { door: "POST /api/jobs", rung: 2, role: "operator" },
    { door: "POST /api/select", rung: 2, role: "reader" },
    { door: "POST /api/linkage/merge", rung: 3, role: "admin" },
  ],
  offer: [
    { page: "query", title: "Query", actions: [{ door: "POST /api/ask/run", words: "Run questions" }] },
    { page: "data", title: "Data", actions: [{ door: "POST /api/jobs", words: "Read, sort, pseudonymise and bring in data" }] },
  ],
};

const json = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
const piece = (text: string, more: Record<string, unknown> = {}) => ({ size: text.length, from: 0, to: text.length, text, earlier: false, over: true, ...more });

window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.origin);
  const path = url.pathname;
  const method = init?.method ?? "GET";
  if (path === "/desk/capabilities") return json(200, caps);
  if (path === "/api/capabilities") return json(200, caps.engine);
  if (path === "/api/places") return json(200, PLACES);
  if (path === "/api/backups") return json(200, BACKUPS);
  if (path === "/api/status") return json(200, STATUS);
  if (path === "/api/settings") return json(200, { timezone: "Europe/Stockholm", week_start: "monday", epoch: 4, week_starts: ["monday", "sunday"], timezones: ["Europe/Stockholm"] });
  if (path === "/api/custody") return json(200, { home: "/srv/nils/registry", backend: "sqlite", registry_id: "reg-7f3a", stores: [] });
  if (path === "/desk/custody") return json(200, { stores: [] });
  if (path === "/api/audit") return json(200, { count: 0, rows: [] });
  if (path === "/desk/groups") return json(200, GROUPS);
  if (path === "/desk/access") return json(200, ACCESS);
  if (path === "/desk/users") return json(200, { users: ACCESS.people.map((p) => ({ username: p.subject, display: p.display, entitlements: [], admin: p.subject === "astrid", last_seen: p.last_seen_at })), entitlements: [] });
  if (path === "/api/releases") return json(200, { count: RELEASES.length, releases: RELEASES });
  if (path === "/api/handovers") return json(202, { job: 61, state: "queued" });
  if (path === "/api/jobs" && method === "POST") return json(202, { job: 62, state: "queued" });
  if (path === "/api/jobs") return json(200, { count: JOBS.length, jobs: JOBS });
  if (path === "/api/jobs/51/log") return json(200, piece(DIGEST_LOG, { job: 51, state: "done", size: 70_000 + DIGEST_LOG.length, from: 70_000, to: 70_000 + DIGEST_LOG.length, earlier: true }));
  if (path === "/api/jobs/52/log") return json(200, piece("run 9: 4 units apart, 2 at a time\nunit sub-1a2b_ses-1 done\nunit sub-1a2b_ses-2 done\nunit sub-3c4d_ses-1 failed: exit 1\n", { job: 52, state: "running", over: false }));
  if (path === "/api/jobs/50/log") return json(404, { error: "job 50 ran before this engine kept jobs' logs" });
  if (path === "/api/pipeline-runs/9") return json(200, RUN);
  if (path.startsWith("/api/pipeline-runs/9/units/")) return json(200, piece("N4BiasFieldCorrection -d 3 -i T1w.nii.gz -s 4\nIteration 1 (of 50).  Current convergence value = 0.00198\nIteration 2 (of 50).  Current convergence value = 0.00087\nElapsed time: 41.2 s\n", { run: 9, unit: decodeURIComponent(path.split("/")[5]), shared: false }));
  if (path === "/assistant/inbox") return json(200, INBOX);
  if (path === "/assistant/grants") return json(200, GRANTS_DOC);
  if (path === "/assistant/conversations") return json(200, { conversations: [] });
  return json(404, { error: `the layout check has no ${path}` });
}) as typeof fetch;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
