// SPDX-License-Identifier: AGPL-3.0-only
// The reader in the real desk (after the first gold campaign, "the planes are
// still small on the big screen"): the desk's own App, its top bar, its
// sections and its page, opened on a one-axis campaign's rating page against
// the reader's fake engine, so the layout check measures the pictures in the
// shell a rater really has. `?mode=axes` asks the seven axes instead. The
// viewer is the stand-in with the real viewer's boxes (vite.layout.config.ts).

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../src/App";
import "../../src/shell.css";
import { CAMPAIGN_ID, doorsOf, fakeEngine } from "./reader.fixture";

const axes = new URLSearchParams(location.search).get("mode") === "axes";
const engine = fakeEngine({ axis: !axes });

const caps = {
  engine: {
    engine: { name: "nils", version: "1.0.0-alpha.49" },
    contracts: { openapi: "7" },
    doors: ["GET /api/capabilities", ...doorsOf()],
    policy: [],
    auth: "token",
    principal: "rater@site",
    roles: [],
    registry: { epoch: 4 },
    packs: [{ name: "mri", version: "0.9.0" }],
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
  // the instance doors, where a page serves them (the real viewer's check), else the reader's engine
  if (path.startsWith("/api/instances/")) return real(input, init);
  return engine(input, init);
}) as typeof fetch;

if (!location.hash) location.hash = `#campaigns/${CAMPAIGN_ID}/rate`;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
