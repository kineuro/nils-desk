// SPDX-License-Identifier: AGPL-3.0-only
// Verify mode's screens (record 58 P1, spec 12) in the real desk, its top
// bar, its sections and its page, against the reader's fake engine, for the
// layout check and the screenshots of the desk rounds: `?mode=` takes
// `screen` (an item filled in to accept, the default), `ab` (two sources
// differing on one axis, A and B), `results` (a closed verify campaign's page,
// whose Results tab carries the catch rate, and its Pace) or `form` (Make a
// campaign, opened with its source filled in, where Verify is chosen). The
// viewer is the stand-in with the real viewer's boxes (vite.layout.config.ts).
// Every name and number here is made up.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../src/App";
import "../../src/shell.css";
import { makeHref } from "../../src/campaigns/client";
import { GRANTS } from "../../src/grants";
import { CAMPAIGN_ID, doorsOf, fakeEngine } from "./reader.fixture";

const mode = new URLSearchParams(location.search).get("mode") ?? "screen";
const results = mode === "results";
const reading = mode === "screen" || mode === "ab";
const engine = fakeEngine({ verify: mode === "ab" ? "ab" : true, closed: results });

const me = reading ? "rater@site" : "nima@site";
const caps = {
  engine: {
    engine: { name: "nils", version: "1.0.0-beta.2" },
    contracts: { openapi: "7" },
    doors: ["GET /api/capabilities", "POST /api/campaigns", ...doorsOf({ results: true })],
    policy: [],
    auth: "token",
    principal: me,
    roles: [],
    registry: { epoch: 4 },
    packs: [{ name: "mri", version: "1.3.0" }],
  },
  kvasir: null,
  assistant: null,
  apps: [],
  person: { subject: me, display_name: reading ? "rater" : "Astrid", grants: reading ? ["campaigns:see", "campaigns:work"] : [...GRANTS], detail: "quasi", groups: [] },
  desk: { version: "1.0.0", mode: "local", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
};

const json = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const path = new URL(url, location.origin).pathname;
  if (path === "/desk/capabilities") return json(200, caps);
  if (path === "/api/capabilities") return json(200, caps.engine);
  if (path.startsWith("/desk/")) return json(404, { error: `the layout check's desk has no ${path}` });
  return engine(input, init);
}) as typeof fetch;

location.hash = mode === "form" ? makeHref("selection", "audit-draw@1") : results ? `#review/campaigns/${CAMPAIGN_ID}` : `#review/campaigns/${CAMPAIGN_ID}/rate`;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
