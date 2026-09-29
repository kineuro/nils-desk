// SPDX-License-Identifier: AGPL-3.0-only
// The pair view in the real desk (the post-contrast study, pair mode): the
// desk's own App, its top bar, its sections and its page, opened on a pair
// campaign's reading page against a fake engine, so the layout check
// measures it in the shell a person really has. The viewers are the
// stand-in with the real viewer's boxes (vite.layout.config.ts).

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../src/App";
import "../../src/shell.css";
import { pairDoorsOf, pairEngine } from "./pair.fixture";
import { CAMPAIGN_ID } from "./reader.fixture";

const engine = pairEngine();

const caps = {
  engine: {
    engine: { name: "nils", version: "1.0.0-alpha.60" },
    contracts: { openapi: "7" },
    doors: ["GET /api/capabilities", ...pairDoorsOf()],
    policy: [],
    auth: "token",
    principal: "rater@site",
    roles: [],
    registry: { epoch: 4 },
    packs: [{ name: "mri", version: "0.12.0" }],
  },
  kvasir: null,
  assistant: null,
  apps: [],
  person: { subject: "rater@site", display_name: "rater", grants: ["campaigns:see", "campaigns:work"], detail: "quasi", groups: [] },
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

if (!location.hash) location.hash = `#campaigns/${CAMPAIGN_ID}/pairs`;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
