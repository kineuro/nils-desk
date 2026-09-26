// SPDX-License-Identifier: AGPL-3.0-only
// The time to the next item (record 50, after the first gold campaign: "when
// i moved to next one it took system some time to load"): the reader of a
// body-part campaign against a fake engine that answers as a far engine
// would, the evidence door slowest. Each claim names the item after it, so
// the reader can read it ahead while this one is read. `?prefetch=off`
// turns the reading ahead off, as a person on a slow link may, which is
// the time before; next.pw.ts measures both.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../../src/shell.css";
import "../../src/campaigns/campaigns.css";
import type { Capabilities } from "../../src/capabilities";
import { Workspace } from "../../src/campaigns/Workspace";

const VALUES = ["neck", "spine", "brain", "brain-neck", "chest", "other"];
const QUESTION = { kind: "axis", axis: "body_part", values: VALUES, unsure: true };
// how long each door takes, in ms, as a far engine answers
const LATENCY = { claim: 40, answer: 40, why: 450, header: 250, other: 20 };

if (new URLSearchParams(location.search).get("prefetch") === "off") localStorage.setItem("nils.reader.prefetch", "off");
else localStorage.removeItem("nils.reader.prefetch");

const item = (n: number) => ({ id: 1000 + n, position: n, review_item_id: null, stack_id: 500 + n, input_derivative_ids: null, state: "open", round: 1, agreement: null, metric: null, outcome: null, decision_id: null, pick_id: null, resolved_at: null });
const campaign = { id: 7, name: "body parts, round 1", owner: "cleo@site", status: "open", question: QUESTION, grain: "stack", raters_per_item: 1, rater_policy: { raters: ["rater@site"], adjudicators: [] }, adjudication: { when: "never", metric: "exact" }, closes_into: "none", lease_seconds: 900, counts: { items: { open: 40 }, assignments: {}, answers: 0 }, items: Array.from({ length: 40 }, (_, n) => item(n)) };

let at = 0;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const json = async (ms: number, body: unknown, status = 200) => {
  await wait(ms);
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
};
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const path = new URL(url, location.origin).pathname;
  const method = (init?.method ?? "GET").toUpperCase();
  if (method === "GET" && path === "/api/campaigns/7") return json(LATENCY.other, campaign);
  if (method === "GET" && path === "/api/campaigns") return json(LATENCY.other, { count: 1, campaigns: [campaign] });
  if (method === "POST" && path === "/api/campaigns/7/claim") {
    const n = at;
    return json(LATENCY.claim, {
      assignment: { id: 70 + n, item_id: 1000 + n, principal: "rater@site", role: "rater", round: 1, state: "leased", created_at: "", leased_at: "", lease_until: new Date(Date.now() + 900_000).toISOString(), ended_at: null },
      item: item(n),
      held: false,
      next: { item: 1001 + n, stack: 501 + n },
    });
  }
  if (method === "POST" && /\/assignments\/\d+\/answer$/u.test(path)) {
    at++;
    return json(LATENCY.answer, { answer: 200 + at, item: 999 + at, state: "agreed", adjudication: null });
  }
  const why = /^\/api\/campaigns\/7\/items\/(\d+)\/why$/u.exec(path);
  if (why) return json(LATENCY.why, { stack: 500 + Number(why[1]) - 1000, item: Number(why[1]), axes: [], blind: false, suggested: "brain", header_door: `/api/campaigns/7/items/${why[1]}/header`, texts: { series_description: `series of item ${why[1]}` } });
  if (/\/items\/\d+\/header$/u.test(path)) return json(LATENCY.header, { fields: [] });
  return json(LATENCY.other, { error: `no door ${method} ${path}` }, 404);
}) as typeof fetch;

const caps = {
  engine: {
    engine: { name: "nils", version: "1.0.0-alpha.47" },
    contracts: { openapi: "7" },
    doors: ["GET /api/campaigns", "GET /api/campaigns/{id}", "POST /api/campaigns/{id}/claim", "POST /api/campaigns/{id}/assignments/{assignment}/answer", "POST /api/campaigns/{id}/assignments/{assignment}/renew", "GET /api/campaigns/{id}/items/{item}/why", "GET /api/campaigns/{id}/items/{item}/header"],
    policy: [],
    auth: "token",
    principal: "rater@site",
    roles: [],
    registry: { epoch: 4 },
    packs: [],
  },
  kvasir: null,
  assistant: null,
  apps: [],
  person: { subject: "rater@site", display_name: "rater", grants: ["campaigns:see", "campaigns:work"], detail: "quasi", groups: [] },
  desk: { version: "1.0.0", mode: "local", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
} as unknown as Capabilities;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <div className="desk">
      <div className="body">
        <main className="page">
          <Workspace caps={caps} id="7" role="rater" />
        </main>
      </div>
    </div>
  </StrictMode>,
);
