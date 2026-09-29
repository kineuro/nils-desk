// SPDX-License-Identifier: AGPL-3.0-only
// An anchored campaign as the engine serves it (the post-contrast study,
// anchored reading), made up and shared by the layout check (a browser) and
// the anchored view's tests (jsdom): a campaign `nils campaign anchored`
// made, one item's sheet (three panels in a drawn order, the anchors
// labelled and one flagged as of another session, three answers, nothing
// else of any stack), and the summary. Nothing here is a real person or a
// real scan.

import type { Campaign, Claimed } from "../../src/campaigns/client";
import { CAMPAIGN_ID, ITEM_ID, type Asked } from "./reader.fixture";

export const CAND = 8121;
export const PRE = 8104;
export const POST = 8133;

export const ANCHORED_CAMPAIGN = {
  id: CAMPAIGN_ID,
  name: "post-contrast-anchored-dev",
  owner: "nima@site",
  status: "open",
  question: { kind: "anchored", axis: "post_contrast", post: "given", pre: "not_given", answers: ["like_pre", "like_post", "cant_tell"] },
  grain: "anchored",
  suggest: "none",
  source: { anchored: { seed_sha256: "9f86d081884c7d659a2feaa0c55ad015", items: 212 } },
  raters_per_item: 1,
  rater_policy: { raters: ["rater@site"], adjudicators: [] },
  adjudication: { when: "never", metric: "exact", threshold: 1 },
  closes_into: "none",
  lease_seconds: 900,
  counts: { items: { open: 400, agreed: 12 }, assignments: { leased: 1 }, answers: 12 },
  items: [
    { id: ITEM_ID, campaign_id: CAMPAIGN_ID, position: 12, review_item_id: 3, stack_id: null, subject_id: null, session_day: null, key: "anchored:12", input_derivative_ids: null, state: "open", round: 1 },
  ],
} as unknown as Campaign;

export function anchoredClaimed(now = Date.now()): Claimed {
  return {
    assignment: { id: 78, campaign_id: CAMPAIGN_ID, item_id: ITEM_ID, principal: "rater@site", role: "rater", round: 1, state: "leased", created_at: new Date(now).toISOString(), leased_at: new Date(now).toISOString(), lease_until: new Date(now + 900_000).toISOString(), ended_at: null },
    item: (ANCHORED_CAMPAIGN as unknown as { items: Claimed["item"][] }).items[0],
    held: false,
  } as unknown as Claimed;
}

export const ANCHORED_SHEET = {
  item: ITEM_ID,
  panels: [
    { panel: 0, role: "reference_post", label: "reference post", stack: POST, other_session: false },
    { panel: 1, role: "candidate", label: "candidate", stack: CAND, other_session: false },
    { panel: 2, role: "reference_pre", label: "reference pre", stack: PRE, other_session: true },
  ],
  answers: ["like_pre", "like_post", "cant_tell"],
  keys: { "1": "like_pre", "2": "like_post", "3": "cant_tell" },
};

export const ANCHORED_SUMMARY = {
  campaign: CAMPAIGN_ID,
  items: 212,
  answered: 12,
  answers: { like_pre: 5, like_post: 6, cant_tell: 1 },
  items_with_an_anchor_of_another_session: 31,
  seconds: { median: 6.1, p90: 14.2 },
  blind: true,
  seed_sha256: "9f86d081884c7d659a2feaa0c55ad015",
};

/** The engine's doors for the anchored view, as a fetch. */
export function anchoredEngine(opts: { log?: Asked[] } = {}): typeof fetch {
  const { log = [] } = opts;
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  let answers = 0;
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, "http://desk.test");
    const path = url.pathname;
    const method = (init?.method ?? "GET").toUpperCase();
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : null;
    log.push({ method, path, body });
    const c = `/api/campaigns/${CAMPAIGN_ID}`;
    if (method === "GET" && path === c) return json(200, ANCHORED_CAMPAIGN);
    if (method === "GET" && path === "/api/campaigns") return json(200, { count: 1, campaigns: [ANCHORED_CAMPAIGN] });
    if (method === "POST" && path === `${c}/claim`) return json(200, anchoredClaimed());
    if (method === "POST" && path.endsWith("/renew")) return json(200, anchoredClaimed().assignment);
    if (method === "POST" && path.endsWith("/release")) return json(200, anchoredClaimed().assignment);
    if (method === "POST" && path.startsWith(`${c}/assignments/`) && path.endsWith("/answer")) return json(200, { answer: 600 + ++answers, item: ITEM_ID, state: "agreed", adjudication: null });
    if (method === "GET" && path === `${c}/items/${ITEM_ID}/anchored`) return json(200, ANCHORED_SHEET);
    if (method === "GET" && path === `${c}/anchored`) return json(200, ANCHORED_SUMMARY);
    if (method === "GET" && path === `${c}/anchored/values`) return json(200, { campaign: CAMPAIGN_ID, count: 0, values: [], blind: true });
    if (method === "GET" && path === `${c}/answers`) return json(200, { campaign: CAMPAIGN_ID, count: 0, answers: [], blind: true });
    // every door that would show more of a stack refuses an anchored campaign
    if (path.startsWith(`${c}/items/`)) return json(409, { error: "campaign reads a stack beside its anchors from their pictures alone" });
    return json(404, { error: `no door ${method} ${path}` });
  };
}

export function anchoredDoorsOf(): string[] {
  return [
    "GET /api/campaigns",
    "GET /api/campaigns/{id}",
    "GET /api/campaigns/{id}/answers",
    "POST /api/campaigns/{id}/claim",
    "POST /api/campaigns/{id}/assignments/{assignment}/answer",
    "POST /api/campaigns/{id}/assignments/{assignment}/release",
    "POST /api/campaigns/{id}/assignments/{assignment}/renew",
    "GET /api/campaigns/{id}/items/{item}/anchored",
    "GET /api/campaigns/{id}/anchored",
    "GET /api/campaigns/{id}/anchored/values",
  ];
}
