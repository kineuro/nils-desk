// SPDX-License-Identifier: AGPL-3.0-only
// A check (job type 3, record 55 H3, slice D2) in the real desk: the desk's
// own App, its top bar, its sections and its page, opened on a check's
// reader (or, with ?page=new, on New check from a run) against a fake engine
// that answers E2's doors from its OpenAPI shapes (check.fixture.ts), so the
// layout check measures it in the shell a person really has. The viewers
// are the stand-in with the real viewer's boxes (vite.layout.config.ts).
//
//   check.html?panels=1..8&grain=result|part&page=reader|new|campaign&others=n&set=lesions|structures&read=1&status=open|closed&refused=1
//
// `others` puts a second rater ahead who read the first n results; `set`
// checks each structure of a label map instead of each lesion; `read=1`
// has two raters' answers on every result, for the campaign's page; `refused=1`
// on a closed one has the close refuse the first result it could write.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../src/App";
import "../../src/shell.css";
import { CHECK_CAMPAIGNS_CAPS, checkDoorsOf, checkEngine, RUN_ID } from "./check.fixture";
import { CAMPAIGN_ID } from "./reader.fixture";

const q = new URLSearchParams(location.search);
const panels = Number(q.get("panels") ?? 3);
const grain = q.get("grain") === "part" ? "part" : "result";
const others = q.get("others");
const engine = checkEngine({ panels, grain, items: 6, others: others === null ? undefined : Number(others), set: q.get("set") === "structures" ? "structures" : "lesions", read: q.get("read") === "1", status: q.get("status") === "closed" ? "closed" : "open", refused: q.get("refused") === "1" });

const caps = {
  engine: {
    engine: { name: "nils", version: "1.0.0-alpha.80" },
    contracts: { openapi: "7" },
    doors: ["GET /api/capabilities", ...checkDoorsOf()],
    policy: [],
    auth: "token",
    principal: "rater@site",
    roles: [],
    registry: { epoch: 4 },
    packs: [{ name: "mri", version: "0.13.0" }],
    campaigns: CHECK_CAMPAIGNS_CAPS,
  },
  kvasir: null,
  assistant: null,
  apps: [],
  person: { subject: "rater@site", display_name: "rater", grants: ["campaigns:see", "campaigns:work", "pipelines:see", "review:work"], detail: "quasi", groups: [] },
  desk: { version: "1.0.0", mode: "local", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
};

const real = window.fetch.bind(window);
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const path = new URL(url, location.origin).pathname;
  if (path === "/desk/capabilities") return Promise.resolve(new Response(JSON.stringify(caps), { status: 200, headers: { "content-type": "application/json" } }));
  if (path.startsWith("/api/instances/")) return real(input, init);
  return engine(input, init);
}) as typeof fetch;

if (!location.hash) location.hash = q.get("page") === "new" ? `#campaigns?make=check&run=${RUN_ID}` : q.get("page") === "campaign" ? `#campaigns/${CAMPAIGN_ID}` : `#campaigns/${CAMPAIGN_ID}/check`;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
