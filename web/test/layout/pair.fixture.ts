// SPDX-License-Identifier: AGPL-3.0-only
// A pair campaign as the engine serves it (the post-contrast study, pair
// mode), made up and shared by the layout check (a browser) and the pair
// view's tests (jsdom): a campaign `nils campaign pair` made, one pair's
// sheet (two stacks and five answers, nothing else of either), and the
// summary. Nothing here is a real person or a real scan.

import type { Campaign, Claimed } from "../../src/campaigns/client";
import { CAMPAIGN_ID, ITEM_ID, type Asked } from "./reader.fixture";

export const LEFT = 7311;
export const RIGHT = 7302;

export const PAIR_CAMPAIGN = {
  id: CAMPAIGN_ID,
  name: "post-contrast-pairs-dev",
  owner: "nima@site",
  status: "open",
  question: { kind: "pair", axis: "post_contrast", post: "given", pre: "not_given", answers: ["left_post", "right_post", "both_pre", "both_post", "cant_tell"] },
  grain: "pair",
  suggest: "none",
  source: { pair: { seed_sha256: "9f86d081884c7d659a2feaa0c55ad015", pairs: 412 } },
  raters_per_item: 1,
  rater_policy: { raters: ["rater@site"], adjudicators: [] },
  adjudication: { when: "never", metric: "exact", threshold: 1 },
  closes_into: "none",
  lease_seconds: 900,
  counts: { items: { open: 400, agreed: 12 }, assignments: { leased: 1 }, answers: 12 },
  items: [
    { id: ITEM_ID, campaign_id: CAMPAIGN_ID, position: 12, review_item_id: 3, stack_id: null, subject_id: null, session_day: null, key: "pair:12", input_derivative_ids: null, state: "open", round: 1 },
  ],
} as unknown as Campaign;

export function pairClaimed(now = Date.now()): Claimed {
  return {
    assignment: { id: 78, campaign_id: CAMPAIGN_ID, item_id: ITEM_ID, principal: "rater@site", role: "rater", round: 1, state: "leased", created_at: new Date(now).toISOString(), leased_at: new Date(now).toISOString(), lease_until: new Date(now + 900_000).toISOString(), ended_at: null },
    item: (PAIR_CAMPAIGN as unknown as { items: Claimed["item"][] }).items[0],
    held: false,
  } as unknown as Claimed;
}

export const PAIR_SHEET = {
  item: ITEM_ID,
  left: { stack: LEFT },
  right: { stack: RIGHT },
  answers: ["left_post", "right_post", "both_pre", "both_post", "cant_tell"],
  keys: { "1": "left_post", "2": "right_post", "3": "both_pre", "4": "both_post", "5": "cant_tell" },
};

export const PAIR_SUMMARY = {
  campaign: CAMPAIGN_ID,
  items: 412,
  answered: 12,
  answers: { left_post: 4, right_post: 5, both_pre: 1, both_post: 1, cant_tell: 1 },
  seconds: { median: 4.2, p90: 9.8 },
  blind: true,
  seed_sha256: "9f86d081884c7d659a2feaa0c55ad015",
};

/** The engine's doors for the pair view, as a fetch. */
export function pairEngine(opts: { log?: Asked[] } = {}): typeof fetch {
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
    if (method === "GET" && path === c) return json(200, PAIR_CAMPAIGN);
    if (method === "GET" && path === "/api/campaigns") return json(200, { count: 1, campaigns: [PAIR_CAMPAIGN] });
    if (method === "POST" && path === `${c}/claim`) return json(200, pairClaimed());
    if (method === "POST" && path.endsWith("/renew")) return json(200, pairClaimed().assignment);
    if (method === "POST" && path.endsWith("/release")) return json(200, pairClaimed().assignment);
    if (method === "POST" && path.startsWith(`${c}/assignments/`) && path.endsWith("/answer")) return json(200, { answer: 600 + ++answers, item: ITEM_ID, state: "agreed", adjudication: null });
    if (method === "GET" && path === `${c}/items/${ITEM_ID}/pair`) return json(200, PAIR_SHEET);
    if (method === "GET" && path === `${c}/pair`) return json(200, PAIR_SUMMARY);
    if (method === "GET" && path === `${c}/pair/values`) return json(200, { campaign: CAMPAIGN_ID, count: 0, values: [], blind: true });
    if (method === "GET" && path === `${c}/answers`) return json(200, { campaign: CAMPAIGN_ID, count: 0, answers: [], blind: true });
    // every door that would show more of a stack refuses a pair campaign
    if (path.startsWith(`${c}/items/`)) return json(409, { error: "campaign reads pairs from their pictures alone" });
    return json(404, { error: `no door ${method} ${path}` });
  };
}

export function pairDoorsOf(): string[] {
  return [
    "GET /api/campaigns",
    "GET /api/campaigns/{id}",
    "GET /api/campaigns/{id}/answers",
    "POST /api/campaigns/{id}/claim",
    "POST /api/campaigns/{id}/assignments/{assignment}/answer",
    "POST /api/campaigns/{id}/assignments/{assignment}/release",
    "POST /api/campaigns/{id}/assignments/{assignment}/renew",
    "GET /api/campaigns/{id}/items/{item}/pair",
    "GET /api/campaigns/{id}/pair",
    "GET /api/campaigns/{id}/pair/values",
  ];
}
