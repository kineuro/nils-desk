// SPDX-License-Identifier: AGPL-3.0-only
// The batch accept grid's layout check (UX round 5): the real desk, its top
// bar and side, on Review's first page with a body-part model's card and on
// the grid of what that model left unsure, against a fake engine that
// answers the two grid doors as the engine's do: three values below the
// threshold, ten bands over the model's range, five hundred scans a page
// (small grey discs), and an accept that says what it wrote and the job the
// re-sort runs as, corrections counted; the page carries the axis's legal
// values, so a set-apart tile takes a value; and the band door (UX round 6,
// item 5), whose job is half way on its first read and done on the next,
// with the re-sort it queued. What the accept and band doors were sent is
// kept on the window for proposalgrid.pw.ts to read. Every name and number
// is made up.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../src/App";
import "../../src/shell.css";
import { GRANTS } from "../../src/grants";
import { accepted, type AcceptSent, bandJob, bandQueued, type BandSentBody, bandWrites, gpage, MODEL, VALUES } from "../../src/review/proposalGrid.fixture";

const DOORS = [
  "GET /api/capabilities",
  "GET /api/review",
  "GET /api/review/summary",
  "GET /api/review/proposals",
  "GET /api/review/proposals/scans",
  "POST /api/review/proposals/accept",
  "POST /api/review/proposals/accept-band",
  "GET /api/jobs/{id}",
  "POST /api/review/proposals/campaign",
  "POST /api/decisions/commit",
  "GET /api/review/questions",
  "GET /api/review/questions/{key}/scans",
  "GET /api/campaigns",
  "POST /api/campaigns",
  "GET /api/sources",
];

const caps = {
  engine: { engine: { name: "nils", version: "1.0.0-beta.11" }, contracts: { openapi: "7" }, doors: DOORS, policy: [], auth: "token", principal: "astrid@site", roles: [], registry: { epoch: 4 }, packs: [{ name: "mri", version: "1.4.0" }] },
  kvasir: null,
  assistant: null,
  apps: [],
  person: { subject: "astrid@site", display_name: "Astrid", grants: [...GRANTS], detail: "quasi", groups: [] },
  desk: { version: "1.0.0", mode: "local", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
};

const below = Object.values(VALUES).reduce((a, b) => a + b, 0);
const STANDING = {
  model: MODEL,
  label: `${MODEL.name}@${MODEL.version}`,
  axis: "body_part",
  threshold: 0.9,
  thresholds: [0.9],
  staged: { groups: 9, stacks: 1701 },
  held: { groups: 0, stacks: 0 },
  commit: { groups: 9, stacks: 1701 },
  drifted: 0,
  below: { groups: 30, stacks: below },
  asked: { groups: 0, stacks: 0 },
  campaigns: [],
  runs: [184],
  name: "bodypart-cascade-body_part-unsure",
};

const w = window as unknown as { posted: unknown[]; banded: BandSentBody[]; accepted: number; jobReads: number; bandReads: number };
w.posted = [];
w.banded = [];
w.accepted = 0;
w.jobReads = 0;
w.bandReads = 0;
const json = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.origin);
  const path = decodeURIComponent(url.pathname);
  const q = url.searchParams;
  if (path === "/desk/capabilities") return json(200, caps);
  if (path === "/api/review/proposals") return json(200, { count: 1, proposals: [STANDING] });
  if (path === "/api/review/proposals/scans") {
    const value = q.get("value");
    const total = value ? (VALUES[value] ?? 0) - (value === "neck" ? w.accepted : 0) : below - w.accepted;
    return json(200, gpage({ value, min: q.get("min") ? Number(q.get("min")) : null, max: q.get("max") ? Number(q.get("max")) : null, size: Number(q.get("size") ?? 500), page: Number(q.get("page") ?? 1), total }));
  }
  if (path === "/api/review/proposals/accept") {
    const body = JSON.parse(String(init?.body)) as AcceptSent;
    w.posted.push(body);
    const a = accepted(body);
    w.accepted += (a.decided as number) + (a.corrected as number);
    return json(200, a);
  }
  // the whole band as a job (item 5): its scans leave the set once it is over; the job is half way on its first
  // read and done on the next, with its result and the re-sort it queued, which is over at once
  if (path === "/api/review/proposals/accept-band") {
    const body = JSON.parse(String(init?.body)) as BandSentBody;
    w.banded.push(body);
    w.accepted += bandWrites(body);
    return json(200, bandQueued(body));
  }
  if (path === "/api/jobs/357") {
    w.bandReads += 1;
    const of = bandWrites(w.banded[0]);
    return json(200, bandJob(w.banded[0], w.bandReads === 1 ? Math.floor(of / 2) : of));
  }
  if (path === "/api/jobs/358") return json(200, { id: 358, kind: "resort", name: "re-sort after astrid@site accepted a band", state: "done", started_at: "2026-11-10T09:02:00Z", heartbeat_at: null, finished_at: "2026-11-10T09:04:00Z", progress: { done: 41210, of: 41210, what: "scans" }, error: null, args: {}, result: null });
  // the re-sort job the accept queued: half way on the first read, over on the next
  if (path === "/api/jobs/356") {
    w.jobReads += 1;
    const of = w.accepted;
    const done = w.jobReads === 1 ? Math.floor(of / 2) : of;
    return json(200, { id: 356, kind: "resort", name: "re-sort after astrid@site accepted decisions", state: done >= of ? "done" : "running", started_at: "2026-11-08T20:00:00Z", heartbeat_at: null, finished_at: null, progress: { done, of, what: "scans" }, error: null, args: {}, result: null });
  }
  if (path === "/api/review/summary") return json(200, { by_kind: { "body_part:model": 39 }, cohorts: [], none: 0 });
  if (path === "/api/review") return json(200, { count: 0, items: [] });
  if (path === "/api/review/questions") return json(200, { scope: { kind: "registry" }, scans: 0, questions: [], vocabularies: {}, elsewhere: [], held: { scans: 0, campaigns: [] } });
  if (path === "/api/campaigns") return json(200, { campaigns: [] });
  if (path === "/api/sources") return json(200, { count: 0, window_days: 30, sources: [] });
  return json(404, { error: `the layout check's engine has no ${path}` });
}) as typeof fetch;

if (!location.hash) location.hash = "#review";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
