// SPDX-License-Identifier: AGPL-3.0-only
// A campaign's upkeep in the real desk (2026-11-05, a campaign of 4,838 items
// read alone): the desk's own App on a two-axis campaign's page against a fake
// engine, with an item someone holds, one whose lease ran out, two set aside
// to read one by one, a pace with a break, and a close that runs as a job the
// page follows until it is closed. Every name and number here is made up.
//
//   upkeep.html            the open campaign, its maker signed in
//   upkeep.html?closing=1  a close running as a job, seen on the page
//   upkeep.html?leased=1   asking one axis refused while an item is read

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../src/App";
import "../../src/shell.css";
import { GRANTS } from "../../src/grants";

const q = new URLSearchParams(location.search);
const ID = 31;
const DOORS = [
  "GET /api/capabilities",
  "GET /api/campaigns",
  "GET /api/campaigns/{id}",
  "GET /api/campaigns/{id}/answers",
  "GET /api/campaigns/{id}/stats",
  "POST /api/campaigns/{id}/claim",
  "POST /api/campaigns/{id}/assignments/{assignment}/answer",
  "POST /api/campaigns/{id}/assignments/{assignment}/release",
  "POST /api/campaigns/{id}/close",
  "POST /api/campaigns/{id}/export",
  "POST /api/campaigns/{id}/hold-back",
  "POST /api/campaigns/{id}/requestion",
  "GET /api/campaigns/{id}/gallery",
  "POST /api/campaigns/{id}/gallery/accept",
  "GET /api/campaigns/{id}/batches",
  "GET /api/label-sets",
];
const caps = {
  engine: { engine: { name: "nils", version: "1.0.0-beta.10" }, contracts: { openapi: "7" }, doors: DOORS, policy: [], auth: "token", principal: "astrid@site", roles: [], registry: { epoch: 4 }, packs: [{ name: "mri", version: "1.4.0" }] },
  kvasir: null,
  assistant: null,
  apps: [],
  person: { subject: "astrid@site", display_name: "Astrid", grants: [...GRANTS], detail: "sensitive", groups: [] },
  desk: { version: "1.0.0", mode: "local", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
};

const NOW = Date.now();
const at = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString().replace(/\.\d+Z$/u, "Z");
const AXES = ["body_part", "body_region"];
const values = { body_part: ["brain", "spine", "neck"], body_region: ["head", "neck", "thorax"] };
const item = (id: number, state: string, over: Record<string, unknown> = {}) => ({ id, campaign_id: ID, position: id - 1, review_item_id: 900 + id, stack_id: 4000 + id, subject_id: null, session_day: null, key: `stack:${4000 + id}`, input_derivative_ids: null, state, round: 1, agreement: state === "agreed" ? 1 : null, metric: null, outcome: state === "agreed" || state === "resolved" ? { value: { body_part: "brain", body_region: "head" }, answers: [id] } : null, decision_id: state === "resolved" ? 7000 + id : null, pick_id: null, resolved_at: null, held_back: false, ...over });
const lease = (id: number, itemId: number, principal: string, state: string, until: string) => ({ id, campaign_id: ID, item_id: itemId, principal, role: "rater", round: 1, state, created_at: at(-40), leased_at: at(-40), lease_until: until, ended_at: state === "leased" ? null : until });
const items = [item(1, "resolved"), item(2, "agreed"), item(3, "agreed"), item(4, "open"), item(5, "open"), item(6, "open", { held_back: true }), item(7, "open", { held_back: true })];
const assignments = [lease(11, 4, "rune@site", "leased", at(12)), lease(12, 5, "rune@site", "expired", at(-20)), lease(13, 2, "rune@site", "submitted", at(-30)), lease(14, 3, "rune@site", "submitted", at(-30))];
const closeJob = (state: string, running: boolean) => ({
  id: 88,
  state,
  running,
  by: "astrid@site",
  started_at: at(-1),
  finished_at: running ? null : at(0),
  result: running ? null : { decisions: [7002, 7012], picks: [], resolved: 2, unresolved: 4, refused: [{ item: 3, why: "a decision of a higher rank holds body_part on stack 4003" }], skipped: [], staged: false, agreement: null, left_out_sealed: 0 },
  error: null,
});
const campaign = (status: string, job: unknown) => ({
  id: ID,
  name: "body-part-curation",
  owner: "astrid@site",
  status,
  question: { kind: "axes", axes: AXES, values, unsure: true, cant_tell: "cant_tell" },
  grain: "stack",
  source: { selection: "every-stack@1" },
  handle_id: 12,
  pack_version: "mri@1.4.0",
  raters_per_item: 1,
  rater_policy: { raters: ["rune@site"], adjudicators: [] },
  adjudication: { when: "never", metric: "exact" },
  closes_into: "decision",
  lease_seconds: 900,
  created_at: at(-600),
  closed_at: status === "closed" ? at(0) : null,
  closed_by: status === "closed" ? "astrid@site" : null,
  agreement: null,
  suggest: "rules",
  purpose: "decide",
  hold_back: 0.1,
  hold_back_none: true,
  planted: null,
  close_again: false,
  close_job: job,
  counts: { items: status === "closed" ? { resolved: 2, refused: 1, open: 4 } : status === "closing" ? { resolved: 2, agreed: 1, open: 4 } : { resolved: 1, agreed: 2, open: 4 }, assignments: { leased: 1, expired: 1, submitted: 2 }, answers: 3 },
  items: status === "closed" ? items.map((i) => (i.state === "agreed" ? { ...i, state: i.id === 3 ? "refused" : "resolved", refused: i.id === 3 ? { why: "a decision of a higher rank holds body_part on stack 4003", at: at(0) } : null } : i)) : items,
  assignments,
});
const stats = { campaign: ID, pause_seconds: 300, raters: [{ principal: "rune@site", name: "Rune", answers: 4838, read: 512, batched: 4326, amended: 3, timed: 498, paused: 14, median_seconds: 4.2, p90_seconds: 11.8, suggested: 4838, changed: 61, share_changed: 0.0126 }] };

// the close as a job: started, read twice closing, then closed with what it wrote
let closeAsked = q.get("closing") === "1";
// asking one axis: the dry run says what changes, the move asks body_part alone (2026-11-06)
let asksOne = false;
let reads = 0;
const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const path = new URL(url, location.origin).pathname;
  const method = init?.method ?? "GET";
  if (path === "/desk/capabilities") return json(caps);
  if (path === `/api/campaigns/${ID}` && method === "GET") {
    if (!closeAsked) {
      const c = campaign("open", null);
      return json(asksOne ? { ...c, question: { ...c.question, axes: ["body_part"], derive: ["body_region"] } } : c);
    }
    reads += 1;
    return json(reads <= 2 || q.get("closing") === "1" ? campaign("closing", closeJob("running", true)) : campaign("closed", closeJob("done", false)));
  }
  if (path === `/api/campaigns/${ID}/close` && method === "POST") {
    closeAsked = true;
    return json({ job: 88, campaign: ID, state: "running" }, 202);
  }
  if (path === `/api/campaigns/${ID}/requestion` && method === "POST") {
    const body = JSON.parse(String(init?.body ?? "{}")) as { axes: string[]; dry_run?: boolean };
    if (q.get("leased") === "1") return json({ error: "1 item(s) of body-part-curation are leased under the question as it stands; wait for them to be answered or released (nils campaign release <assignment>)" }, 409);
    const one = body.axes[0];
    if (!body.dry_run) asksOne = true;
    return json({ campaign: ID, name: "body-part-curation", asked_before: AXES, asked: body.axes, derive: one === "body_part" ? ["body_region"] : [], answers_kept: 3, answers_derived: body.dry_run ? 0 : 3, dry_run: body.dry_run === true });
  }
  if (path === `/api/campaigns/${ID}/answers`) return json({ campaign: ID, count: 0, answers: [], blind: false });
  if (path === `/api/campaigns/${ID}/stats`) return json(stats);
  if (path === "/api/label-sets") return json({ count: 0, label_sets: [] });
  return json({ error: `no door ${method} ${path}` }, 404);
}) as typeof fetch;

if (!location.hash) location.hash = `#review/campaigns/${ID}`;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
