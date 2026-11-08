// SPDX-License-Identifier: AGPL-3.0-only
// A campaign's page as an app page (UX round 5, finding 7) in the real desk:
// the desk's own App on an anchored campaign's page against a fake engine,
// where people sign in through a provider, so every principal is a subject
// hash at the provider's host and the desk's people door gives the names.
// Every name, hash and number here is made up.
//
//   campaign.html                 the person reads it: two items left, "Read the 2 left"
//   campaign.html?state=settle    two others read it, three items wait for the person as adjudicator: "Settle the 3"
//   campaign.html?state=done      another reads it, nothing left: "Close"
//   campaign.html?state=closed    closed: "Results"
//   campaign.html?blind=1         made to show the pictures alone: no scan is named, each row is "scan N of the campaign"

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../src/App";
import "../../src/shell.css";
import { GRANTS } from "../../src/grants";

const q = new URLSearchParams(location.search);
const state = q.get("state") ?? "open";
const ID = 3;
const HOST = "auth.example.org";
const ME_SUBJECT = "a1b2c3d4e5f60718293a4b5c6d7e8f90";
const ME = `${ME_SUBJECT}@${HOST}`;
const RUNE_SUBJECT = "4c1070c1a9f3e2b7d6c5a4b3c2d1e0f9";
const RUNE = `${RUNE_SUBJECT}@${HOST}`;
// a person the desk has not seen: named "a rater", the hash never shown whole
const UNSEEN = `9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b@${HOST}`;
const DOORS = [
  "GET /api/capabilities",
  "GET /api/campaigns",
  "GET /api/campaigns/{id}",
  "GET /api/campaigns/{id}/answers",
  "GET /api/campaigns/{id}/stats",
  "GET /api/campaigns/{id}/results",
  "GET /api/campaigns/{id}/items/{item}/anchored",
  "GET /api/campaigns/{id}/anchored",
  "GET /api/campaigns/{id}/anchored/values",
  "GET /api/stacks/{stack}/header",
  "POST /api/campaigns/{id}/claim",
  "POST /api/campaigns/{id}/assignments/{assignment}/answer",
  "POST /api/campaigns/{id}/assignments/{assignment}/release",
  "POST /api/campaigns/{id}/close",
  "POST /api/campaigns/{id}/export",
  "POST /api/campaigns/{id}/raters",
  "GET /api/label-sets",
];
const caps = {
  engine: { engine: { name: "nils", version: "1.0.0-beta.10" }, contracts: { openapi: "7" }, doors: DOORS, policy: [], auth: "token", principal: ME, roles: [], registry: { epoch: 4 }, packs: [{ name: "mri", version: "1.4.0" }], campaigns: { draws: ["pair", "anchored"] } },
  kvasir: null,
  assistant: null,
  apps: [],
  person: { subject: ME_SUBJECT, display_name: "Astrid", grants: [...GRANTS], detail: "quasi", groups: [] },
  desk: { version: "1.0.0", mode: "oidc", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
};

const NOW = Date.now();
const at = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString().replace(/\.\d+Z$/u, "Z");
const SERIES = ["t1_mprage_sag_p2", "t1_mprage_sag_p2_gd", "t1_tse_tra", "t1_se_tra_gd", "t1_fl2d_tra", "t1_mprage_sag_p2_gd"];
const raters = state === "open" ? [ME] : state === "settle" ? [RUNE, UNSEEN] : [RUNE];
const adjudicators = state === "settle" ? [ME] : [];
const itemState = (i: number): string => {
  if (state === "closed") return "resolved";
  if (state === "done") return "agreed";
  if (state === "settle") return i < 3 ? "needs_adjudication" : "agreed";
  return i < 4 ? "agreed" : "open";
};
const items = SERIES.map((_, i) => {
  const s = itemState(i);
  const value = i % 2 === 0 ? "like_pre" : "like_post";
  return { id: 300 + i, campaign_id: ID, position: i, review_item_id: null, stack_id: 5001 + i, subject_id: null, session_day: null, key: `anchored:${i}`, input_derivative_ids: null, state: s, round: 1, agreement: s === "agreed" || s === "resolved" ? 1 : s === "needs_adjudication" ? 0 : null, metric: null, outcome: s === "agreed" || s === "resolved" ? { value, answers: [400 + i] } : null, decision_id: s === "resolved" ? 7000 + i : null, pick_id: null, resolved_at: s === "resolved" ? at(-10) : null, held_back: false };
});
const counts: Record<string, number> = {};
for (const i of items) counts[i.state] = (counts[i.state] ?? 0) + 1;
const answerOf = (i: number, who: string, value: string, id: number) => ({ id, item_id: 300 + i, assignment_id: 500 + id, principal: who, role: "rater", round: 1, author_kind: "person", value, form: null, derivative_id: null, why: null, answered_at: at(-30 + i), model_id: null, unsure: i === 1 });
const answers = items.flatMap((it, i) => {
  if (it.state === "open") return [];
  const a = answerOf(i, raters[0], i % 2 === 0 ? "like_pre" : "like_post", 400 + i);
  if (raters.length < 2) return [a];
  return [a, answerOf(i, raters[1], it.state === "needs_adjudication" ? (i % 2 === 0 ? "like_post" : "cant_tell") : i % 2 === 0 ? "like_pre" : "like_post", 450 + i)];
});
const assignments = answers.map((a) => ({ id: a.assignment_id, campaign_id: ID, item_id: a.item_id, principal: a.principal, role: "rater", round: 1, state: "submitted", created_at: at(-40), leased_at: at(-40), lease_until: at(-25), ended_at: at(-30) }));
if (state === "open") assignments.push({ id: 590, campaign_id: ID, item_id: 304, principal: ME, role: "rater", round: 1, state: "expired", created_at: at(-40), leased_at: at(-40), lease_until: at(-20), ended_at: at(-20) });
const campaign = {
  id: ID,
  name: "postcontrast-anchored-r1",
  owner: ME,
  status: state === "closed" ? "closed" : "open",
  question: { kind: "anchored", axis: "post_contrast", values: ["like_pre", "like_post", "cant_tell"] },
  grain: "stack",
  source: { anchored: { candidates: "t1-unsure@3", anchors: "t1-anchors@1" } },
  handle_id: null,
  pack_version: "mri@1.4.0",
  raters_per_item: raters.length,
  rater_policy: { raters, adjudicators },
  adjudication: { when: state === "settle" ? "disagree" : "never", metric: "exact" },
  closes_into: "none",
  lease_seconds: 900,
  created_at: at(-600),
  closed_at: state === "closed" ? at(-5) : null,
  closed_by: state === "closed" ? ME : null,
  agreement: raters.length > 1 ? { items: 6, raters_per_item: 2, exact: 0.5, fleiss_kappa: null, cohen_kappa: 0.25 } : null,
  suggest: "none",
  hide_header: q.get("blind") === "1",
  purpose: "decide",
  planted: null,
  close_again: false,
  close_job: null,
  counts: { items: counts, assignments: { submitted: assignments.length }, answers: answers.length },
  items,
  assignments,
};
const stats = { campaign: ID, pause_seconds: 300, raters: raters.map((p, i) => ({ principal: p, name: null, answers: 6, read: 6, batched: 0, amended: 0, timed: 6, paused: i, median_seconds: 6.1 + i, p90_seconds: 14.2, suggested: 0, changed: 0, share_changed: 0 })) };
const results = { campaign: ID, name: campaign.name, status: campaign.status, owner: ME, closes_into: "none", closed_at: campaign.closed_at, named: true, agreement: campaign.agreement, unsure: 1, settled: 6, adjudicated: 0, decisions: 0, picks: 0, raters: raters.map((p) => ({ rater: p, name: p === RUNE ? "Rune" : null, answers: 6, adjudications: 0, unsure: 0 })), values: [{ axis: null, value: "like_pre", answers: 3, settled: 3 }, { axis: null, value: "like_post", answers: 3, settled: 3 }], count: 6, items: items.map((it) => ({ ...it, answers: answers.filter((a) => a.item_id === it.id).map((a) => ({ id: a.id, rater: a.principal, role: a.role, round: 1, value: a.value, unsure: a.unsure })), adjudicated: false })) };

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const path = new URL(url, location.origin).pathname;
  const method = init?.method ?? "GET";
  if (path === "/desk/capabilities") return json(caps);
  if (path === "/desk/people") return json({ people: [{ subject: RUNE_SUBJECT, display: "Rune" }, { subject: "0f1e2d3c4b5a69788796a5b4c3d2e1f0", display: "Bo" }] });
  if (path === `/api/campaigns/${ID}` && method === "GET") return json(campaign);
  if (path === `/api/campaigns/${ID}/answers`) return json({ campaign: ID, count: answers.length, answers, blind: false });
  if (path === `/api/campaigns/${ID}/stats`) return json(stats);
  if (path === `/api/campaigns/${ID}/results`) return json(results);
  if (path === `/api/campaigns/${ID}/anchored`) return json({ campaign: ID, items: items.length, answered: answers.length, answers: { like_pre: 3, like_post: 3, cant_tell: 0 }, seconds: {} });
  if (path === "/api/label-sets") return json({ count: 0, label_sets: [] });
  const header = /^\/api\/stacks\/(\d+)\/header$/u.exec(path);
  // a campaign made to show the pictures alone never asks; answered all the same, so a wrong ask would show
  if (header) return json({ stack: Number(header[1]), detail: "quasi", texts: { series_description: SERIES[Number(header[1]) - 5001] ?? "unknown" } });
  return json({ error: `no door ${method} ${path}` }, 404);
}) as typeof fetch;

if (!location.hash) location.hash = `#review/campaigns/${ID}`;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
