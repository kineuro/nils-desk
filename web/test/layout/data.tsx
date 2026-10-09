// SPDX-License-Identifier: AGPL-3.0-only
// The Data page's layout check (Wave 7a, the design of 2026-10-09): the real
// desk, its top bar and side, on Datasets and cohorts against a fake engine
// with four datasets, two cohorts, each dataset's summary, a running job and
// a cohort that grew, so data.pw.ts measures that the bands and the chosen
// card's detail use the window's width, that how a cohort grew never draws
// one event over another, and that a phone's width is one column with no
// sideways scroll; and an identified dataset whose IDs need a code, so it
// measures the pseudonymise step opened in place, its three boxes and its
// IDs one row each. Every name and number here is made up.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../src/App";
import "../../src/shell.css";
import { GRANTS } from "../../src/grants";

const DOORS = [
  "GET /api/capabilities",
  "GET /api/sources",
  "GET /api/cohorts",
  "GET /api/cohorts/{name}",
  "GET /api/datasets/{name}/summary",
  "GET /api/datasets/{name}/scans",
  "GET /api/cohorts/{name}/scans",
  "GET /api/jobs",
  "POST /api/jobs",
  "POST /api/jobs/{id}/cancel",
  "GET /api/picks/summary",
  "POST /api/cohorts",
  "PUT /api/cohorts/{name}",
  "POST /api/cohorts/{name}/members",
  "POST /api/releases",
  "PUT /api/places/{id}",
  "GET /api/linkage/types",
  "POST /api/linkage/imports",
  "GET /api/linkage/held/ids",
  "POST /api/linkage/held/code",
  "POST /api/linkage/held/reveal",
];

const caps = {
  engine: { engine: { name: "nils", version: "1.0.0-alpha.80" }, contracts: { openapi: "7" }, doors: DOORS, policy: [], auth: "token", principal: "astrid@site", roles: [], registry: { epoch: 4 }, packs: [{ name: "mri", version: "0.25.0" }] },
  kvasir: null,
  assistant: null,
  apps: [],
  person: { subject: "astrid@site", display_name: "Astrid", grants: [...GRANTS], detail: "sensitive", groups: [] },
  desk: { version: "1.0.0", mode: "local", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
};

const NOW = Date.now();
/** ?done draws the identified dataset pseudonymised, its step's summary beside its log. */
const DONE = new URLSearchParams(location.search).has("done");
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString().replace(/\.\d+Z$/u, "Z");

interface Spec {
  name: string;
  state: "anonymised" | "identified" | "unknown";
  files: number | null;
  subjects: number;
  scans: number;
  sure: number;
  look: number;
  cohort: string | null;
}

const SPECS: Spec[] = [
  { name: "study-big", state: "anonymised", files: 45395, subjects: 70, scans: 1003, sure: 800, look: 203, cohort: "ms-followup" },
  { name: "record34", state: "unknown", files: null, subjects: 0, scans: 0, sure: 0, look: 0, cohort: null },
  { name: "study-identified", state: "identified", files: 213, subjects: 0, scans: 0, sure: 0, look: 0, cohort: null },
  { name: "study-anon", state: "anonymised", files: 120, subjects: 10, scans: 10, sure: 10, look: 0, cohort: "ms-followup" },
];

function source(s: Spec, i: number) {
  const read = s.scans > 0;
  const arrives = s.state === "unknown" ? "undeclared" : s.state === "identified" ? "identified" : "deidentified";
  const ids = s.state === "anonymised" ? { patient_id: "subject-code", subjects: "generated" } : { patient_id: s.state === "identified" ? "subject-code" : null, subjects: null };
  const trees =
    s.state === "unknown"
      ? { originals: null, anon: null }
      : s.state === "identified"
        ? { originals: { path: `/srv/data-test/${s.name}/derivatives/dcm-original`, files: s.files, bytes: 2_000_000 }, anon: { path: `/srv/data-test/${s.name}/derivatives/dcm-anon`, files: DONE ? s.files : 0, last_written: null } }
        : { originals: null, anon: { path: `/srv/data-test/${s.name}/derivatives/dcm-anon`, files: s.files, last_written: null } };
  return {
    id: i + 2,
    name: s.name,
    path: `/srv/data-test/${s.name}`,
    guarantees: {},
    probed: null,
    handling: { arrives: arrives === "identified" ? "identified" : "deidentified", on_release: { uids: "preserve", deface: false } },
    handling_declared: false,
    roots: read ? 1 : 0,
    arrives,
    ...ids,
    cohort: s.cohort,
    held: s.state === "identified" && !DONE ? { files: s.files ?? 0, identifiers: HELD.length } : { files: 0, identifiers: 0 },
    identity: s.state === "identified" ? { id_type: "study-id", from: [{ field: "PatientID" }] } : null,
    trees,
    dataset: { kind: "dataset", state: s.state, root: "data-test", arrives, ...ids, cohort: s.cohort },
    digests: read
      ? { count: 1, first: null, last: null, recent: [{ id: i + 1, name: `${s.name}-1`, state: "done", started_at: ago(70), finished_at: ago(69), job_id: 4, files: { seen: s.files, new: s.files, changed: 0, unchanged: 0, refused: 0 }, subjects_added: s.subjects, stacks_added: s.scans, classified: s.scans, to_sort: s.look }] }
      : { count: 0, first: null, last: null, recent: [] },
    totals: { subjects: s.subjects, studies: s.subjects, sessions: s.subjects, stacks: s.scans, refused_files: read ? 216 : 0, to_sort: s.look, sure: s.sure, unsorted: 0, need_a_look: s.look > 0 ? { "base:conflict": s.look } : {} },
  };
}

const step = (name: string, state: string, counts: Record<string, unknown>, minutes: number | null, job: number | null = null) => ({ step: name, state, job, started_at: minutes === null ? null : ago(minutes + 1), finished_at: minutes === null ? null : ago(minutes), progress: null, ...counts });

function summary(s: Spec) {
  const read = s.scans > 0;
  const steps = [step("found", s.state === "unknown" ? "waiting" : "done", { files: s.files, bytes: 9_500_000_000, tree: s.state === "identified" ? "originals" : "anon" }, s.state === "unknown" ? null : 72)];
  if (s.state === "identified") steps.push(DONE ? step("pseudonymised", "done", { files: s.files, waiting: 0, held: 0 }, 50, 12) : step("pseudonymised", "waiting", { files: 0, waiting: s.files, held: s.files }, null));
  steps.push(
    step("read", read ? "done" : "waiting", { files: read ? s.files : 0, refused: read ? 216 : 0, reads: read ? 1 : 0 }, read ? 69 : null, 4),
    step("sorted", read ? "done" : "waiting", { scans: s.scans, of: s.scans, look: s.look, unsorted: 0 }, read ? 66 : null, 6),
    // record 56: body part and post-contrast, steps of their own; a body-part model is served here, a post-contrast one is not
    step("body_part", read ? "done" : "waiting", { run: read ? 2 : null, served: true, answered: read ? s.scans - 12 : 0, look: read ? 12 : 0, of: s.scans, jobs: read ? [11] : [] }, read ? 62 : null, read ? 11 : null),
    step("post_contrast", "off", { run: null, served: false, answered: 0, look: 0, of: s.scans, jobs: [] }, null),
    step("main_scans", read ? "done" : "waiting", { picked: read ? 97 : 0, borders: read ? 76 : 0 }, read ? 64 : null, 8),
    step("pictures", read ? "done" : "waiting", { made: s.scans, of: s.scans, in_sort: true }, read ? 63 : null, 6),
  );
  const views = s.name === "study-big" ? { ...step("views", "running", { made: 57, of: s.scans }, null, 9), started_at: ago(1), progress: { done: 57, total: 1001 } } : step("views", read ? "done" : "waiting", { made: s.scans, of: s.scans }, read ? 60 : null, 9);
  steps.push(views);
  return {
    dataset: s.name,
    dataset_id: SPECS.indexOf(s) + 2,
    detail: "sensitive",
    state: s.state,
    added_at: ago(72),
    subjects: s.subjects,
    sessions: Math.round(s.subjects * 1.6),
    studies: Math.round(s.subjects * 1.6),
    scans: s.scans,
    sure: s.sure,
    need_a_look: s.look,
    unsorted: 0,
    look_kinds: {},
    kinds: read
      ? [
          { kind: "T1w", scans: Math.round(s.scans * 0.28) },
          { kind: "T2w", scans: Math.round(s.scans * 0.21) },
          { kind: "FLAIR", scans: Math.round(s.scans * 0.1) },
          { kind: "DWI", scans: Math.round(s.scans * 0.05) },
          { kind: "PWI", scans: Math.round(s.scans * 0.04) },
          { kind: "SWI", scans: Math.round(s.scans * 0.02) },
        ]
      : [],
    body_regions: [],
    files: { found: s.files, bytes: 9_500_000_000, read: s.files ?? 0, refused: read ? 216 : 0, refused_batch: read ? 3 : null, held: 0 },
    pictures_place: "working",
    steps,
  };
}

const COHORTS = [
  {
    name: "ms-followup",
    owner: "admin",
    description: "The follow-up visits of the MS group",
    subjects: 58,
    sessions: 96,
    stacks: 840,
    feeds: ["study-big", "study-anon"],
    from: { kind: "source", detail: { dataset: "study-big", batch: 3 } },
    waiting: 12,
    releases: 2,
    created_at: "2026-09-12T10:00:00Z",
    last_joined: ago(30),
    retired_at: null,
    parts: [
      { from: "dataset", dataset: "study-big", subjects: 48 },
      { from: "dataset", dataset: "study-anon", subjects: 10 },
    ],
    datasets: [
      { name: "study-big", subjects: 48, scans: 820, feeds: true },
      { name: "study-anon", subjects: 10, scans: 10, feeds: true },
    ],
  },
  {
    name: "qc-sample",
    owner: "admin",
    description: null,
    subjects: 25,
    sessions: 25,
    stacks: 75,
    feeds: [],
    from: { kind: "promotion", detail: { handle: 4 } },
    waiting: 0,
    releases: 1,
    created_at: "2026-09-30T10:00:00Z",
    last_joined: "2026-09-30T10:00:00Z",
    retired_at: null,
    parts: [
      { from: "query", dataset: null, subjects: 23 },
      { from: "hand", dataset: null, subjects: 2 },
    ],
    datasets: [{ name: "study-anon", subjects: 0, scans: 0, feeds: false }],
  },
];

const DETAIL = {
  ...COHORTS[0],
  joins: [
    { when: "2026-10-09T09:00:00Z", what: "digest", subjects: 10, by: "admin", batch: 9, dataset: "study-anon" },
    { when: "2026-10-01T10:00:00Z", what: "digest", subjects: 8, by: "admin", batch: 5, dataset: "study-big" },
    { when: "2026-09-12T10:00:00Z", what: "digest", subjects: 40, by: "admin", batch: 3, dataset: "study-big" },
  ],
  sources_holding: [
    { place: "study-big", subjects: 48 },
    { place: "study-anon", subjects: 10 },
  ],
  releases: [
    { id: 2, name: "ms-followup-r2", layout: "bids", subjects: 48, finished_at: "2026-10-05T10:00:00Z", handed_over: true },
    { id: 1, name: "ms-followup-r1", layout: "bids", subjects: 40, finished_at: "2026-09-20T10:00:00Z", handed_over: true },
  ],
  clinical: [{ kind: "EDSS", primary: true, subjects: 41 }],
  steps: [
    step("sorted", "done", { scans: 108, of: 108, look: 9, unsorted: 0 }, null),
    step("body_part", "done", { run: 2, served: true, answered: 96, look: 12, of: 108, jobs: [11] }, 62, 11),
    step("post_contrast", "off", { run: null, served: false, answered: 0, look: 0, of: 108, jobs: [] }, null),
  ],
};

const JOBS = [
  { id: 9, kind: "pyramid", name: "pictures after job 6", state: "running", started_at: ago(1), heartbeat_at: null, finished_at: null, progress: { done: 57, total: 1001 }, error: null, args: { queued: ["pyramid", "build", "--classified", "6"] }, result: null },
  { id: 8, kind: "pick", name: "sort:6", state: "done", started_at: ago(65), heartbeat_at: null, finished_at: ago(64), progress: null, error: null, args: {}, result: { subjects: 70 } },
  { id: 6, kind: "classify", name: null, state: "done", started_at: ago(68), heartbeat_at: null, finished_at: ago(63), progress: null, error: null, args: {}, result: { previews: { stacks: 1003, built: 991 } } },
  { id: 4, kind: "digest", name: "study-big-1", state: "done", started_at: ago(70), heartbeat_at: null, finished_at: ago(69), progress: { batch_id: 3, ingested: 45179, changed: 0, subjects_created: 70 }, error: null, args: {}, result: null },
];

/** The identified dataset's held IDs, one row each by shape; their files add up to its 213. */
const HELD = [
  { id: 1, shape: "AAA999999", files: 120 },
  { id: 2, shape: "aAAA9999", files: 61 },
  { id: 3, shape: "aAAA9999", files: 20 },
  { id: 4, shape: "AAA9999", files: 12 },
].map((h) => ({ ...h, id_type: "study-id", first_seen: ago(80), batch: 1, state: "held", code: null, also_in: [], waits_for: null }));

const json = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.origin);
  const path = url.pathname;
  // a map rehearsed for the identified dataset: three of its four IDs get a code, one a subject study-big holds already
  if (path === "/api/linkage/imports" && init?.method === "POST")
    return json(200, { rows: 3, subjects: { named: 3, known: 1, new: 2 }, identifiers: { filed: 3, known: 0, new: 3, types_new: 0 }, held_released: 201, held_released_by: [], merges: [], conflicts: [], dry_run: true, written: false, held_ids: [1, 2, 3].map((id) => ({ id, code: `5a9f30c6e8b21d4${id}`, also_in: id === 1 ? ["study-big"] : [] })) });
  if (path === "/desk/capabilities") return json(200, caps);
  if (path === "/api/sources") return json(200, { count: SPECS.length, window_days: 30, sources: SPECS.map(source), rates: null });
  if (path === "/api/cohorts") return json(200, COHORTS);
  if (path === "/api/cohorts/ms-followup") return json(200, DETAIL);
  const sum = /^\/api\/datasets\/([^/]+)\/summary$/u.exec(path);
  if (sum) {
    const s = SPECS.find((x) => x.name === decodeURIComponent(sum[1]));
    return s ? json(200, summary(s)) : json(404, { error: "no such dataset" });
  }
  if (path === "/api/linkage/held/ids") return json(200, DONE ? { place: "study-identified", files: 0, identifiers: 0, ids: [], subjects: { coded: 4, generated: 1 } } : { place: "study-identified", files: 213, identifiers: HELD.length, ids: HELD, subjects: { coded: 0, generated: 0 } });
  if (path === "/api/linkage/types") return json(200, [{ name: "study-id", description: "the study's own number" }]);
  if (path === "/api/jobs") {
    const dataset = url.searchParams.get("dataset");
    if (dataset === "study-big") return json(200, { count: JOBS.length, jobs: JOBS });
    if (dataset) return json(200, { count: 0, jobs: [] });
    return json(200, { count: 1, jobs: url.searchParams.get("all") ? [] : [JOBS[0]] });
  }
  if (path === "/api/picks/summary") {
    if (url.searchParams.get("cohort")) return json(200, { cohort: "ms-followup", subjects: 58, roles: { t1w: { picked: 90, clear: 80, tied: 0, borders: {}, review_items: 4, subjects: 56 }, flair: { picked: 80, clear: 78, tied: 0, borders: {}, review_items: 0, subjects: 51 }, t2w: { picked: 70, clear: 70, tied: 0, borders: {}, review_items: 0, subjects: 49 } } });
    return json(200, { roles: { t1w: { picked: 40, clear: 9, tied: 0, borders: { too_close: 45 }, review_items: 31, subjects: 38 }, flair: { picked: 20, clear: 14, tied: 0, borders: { rare: 7 }, review_items: 6, subjects: 20 }, t2w: { picked: 37, clear: 15, tied: 0, borders: { too_close: 24 }, review_items: 22, subjects: 37 } } });
  }
  return json(404, { error: `the layout check's engine has no ${path}` });
}) as typeof fetch;

if (!location.hash) location.hash = "#data/datasets";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
