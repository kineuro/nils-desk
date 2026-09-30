// SPDX-License-Identifier: AGPL-3.0-only
// A pair campaign as the engine serves it (the post-contrast study, pair
// mode), made up and shared by the layout check (a browser) and the pair
// view's tests (jsdom): a campaign `nils campaign pair` made, one pair's
// sheet (two stacks and five answers, nothing else of either), a second
// pair, the summary, and one's own answers, which the engine keeps and
// corrects as the mine and amend doors do. Nothing here is a real person or
// a real scan.

import type { Campaign, Claimed } from "../../src/campaigns/client";
import type { Kept } from "./anchored.fixture";
import { CAMPAIGN_ID, ITEM_ID, type Asked } from "./reader.fixture";

export const LEFT = 7311;
export const RIGHT = 7302;
/** The second pair's two stacks. */
export const LEFT2 = 7355;
export const RIGHT2 = 7349;

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
    { id: ITEM_ID + 1, campaign_id: CAMPAIGN_ID, position: 13, review_item_id: 4, stack_id: null, subject_id: null, session_day: null, key: "pair:13", input_derivative_ids: null, state: "open", round: 1 },
  ],
} as unknown as Campaign;

export function pairClaimed(now = Date.now(), at = 0): Claimed {
  const item = (PAIR_CAMPAIGN as unknown as { items: NonNullable<Claimed["item"]>[] }).items[at];
  return {
    assignment: { id: 78 + at, campaign_id: CAMPAIGN_ID, item_id: item.id, principal: "rater@site", role: "rater", round: 1, state: "leased", created_at: new Date(now).toISOString(), leased_at: new Date(now).toISOString(), lease_until: new Date(now + 900_000).toISOString(), ended_at: null },
    item,
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

export const PAIR_SHEET_2 = {
  item: ITEM_ID + 1,
  left: { stack: LEFT2 },
  right: { stack: RIGHT2 },
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

/**
 * The engine's doors for the pair view, as a fetch. The claim hands the
 * first pair not yet answered; an answer is kept, listed by the mine door
 * (the latest first, no stack, no picture), and corrected by the amend door
 * as the engine does it: a new answer that supersedes the earlier one, which
 * is kept. `kept` is where a test reads them; `status` closes the campaign.
 */
export function pairEngine(opts: { log?: Asked[]; kept?: Kept[]; status?: "open" | "closed" } = {}): typeof fetch {
  const { log = [], kept = [], status = "open" } = opts;
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const campaign = { ...(PAIR_CAMPAIGN as unknown as Record<string, unknown>), status };
  const items = (PAIR_CAMPAIGN as unknown as { items: { id: number; position: number }[] }).items;
  const sheets: Record<number, unknown> = { [ITEM_ID]: PAIR_SHEET, [ITEM_ID + 1]: PAIR_SHEET_2 };
  let next = 600;
  let clock = Date.parse("2026-09-30T08:00:00Z");
  const standing = () => kept.filter((k) => k.superseded_by === null).sort((a, b) => b.answer - a.answer);
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, "http://desk.test");
    const path = url.pathname;
    const method = (init?.method ?? "GET").toUpperCase();
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : null;
    log.push({ method, path, body });
    const c = `/api/campaigns/${CAMPAIGN_ID}`;
    const open = items.findIndex((i) => !kept.some((k) => k.item === i.id));
    if (method === "GET" && path === c) return json(200, campaign);
    if (method === "GET" && path === "/api/campaigns") return json(200, { count: 1, campaigns: [campaign] });
    if (method === "POST" && path === `${c}/claim`) return json(200, open < 0 ? { assignment: null, item: null, why: "every pair is answered" } : pairClaimed(Date.now(), open));
    if (method === "POST" && path.endsWith("/renew")) return json(200, pairClaimed(Date.now(), Math.max(0, open)).assignment);
    if (method === "POST" && path.endsWith("/release")) return json(200, pairClaimed(Date.now(), Math.max(0, open)).assignment);
    if (method === "POST" && path.startsWith(`${c}/assignments/`) && path.endsWith("/answer")) {
      const it = items[Math.max(0, open)];
      const k: Kept = { answer: ++next, item: it.id, position: it.position, value: String((body as { value?: unknown })?.value), via: "claim", supersedes: null, superseded_by: null, answered_at: new Date((clock += 60_000)).toISOString() };
      kept.push(k);
      return json(200, { answer: k.answer, item: it.id, state: "agreed", adjudication: null });
    }
    if (method === "GET" && path === `${c}/mine`) {
      const list = standing();
      const values: Record<string, number> = {};
      for (const k of list) values[k.value] = (values[k.value] ?? 0) + 1;
      return json(200, { campaign: CAMPAIGN_ID, principal: "rater@site", open: status === "open", count: list.length, total: list.length, values, answers: list.map((k) => ({ answer: k.answer, item: k.item, stack: null, position: k.position, value: k.value, answered_at: k.answered_at, via: k.via, unsure: false, supersedes: k.supersedes, role: "rater", round: 1, item_state: "agreed", thumb: null, sealed: false })) });
    }
    const amend = /\/answers\/(\d+)\/amend$/u.exec(path);
    if (method === "POST" && path.startsWith(`${c}/`) && amend) {
      const was = kept.find((k) => k.answer === Number(amend[1]));
      if (!was) return json(404, { error: `no answer ${amend[1]}` });
      if (status !== "open") return json(409, { error: `campaign ${PAIR_CAMPAIGN.name} is closed; an answer is corrected while its campaign is open` });
      if (was.superseded_by !== null) return json(409, { error: `answer ${was.answer} was corrected already, as answer ${was.superseded_by}; correct that one` });
      const value = String((body as { value?: unknown })?.value);
      if (value === was.value) return json(200, { answer: was.answer, supersedes: was.answer, item: was.item, state: "agreed", adjudication: null, unchanged: true, derived: null });
      const k: Kept = { answer: ++next, item: was.item, position: was.position, value, via: "amend", supersedes: was.answer, superseded_by: null, answered_at: new Date((clock += 60_000)).toISOString() };
      was.superseded_by = k.answer;
      kept.push(k);
      return json(200, { answer: k.answer, supersedes: was.answer, item: was.item, state: "agreed", adjudication: null, unchanged: false, derived: null });
    }
    const sheet = /\/items\/(\d+)\/pair$/u.exec(path);
    if (method === "GET" && path.startsWith(`${c}/`) && sheet && sheets[Number(sheet[1])]) return json(200, sheets[Number(sheet[1])]);
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
    "GET /api/campaigns/{id}/mine",
    "POST /api/campaigns/{id}/answers/{answer}/amend",
  ];
}
