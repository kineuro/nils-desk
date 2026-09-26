// SPDX-License-Identifier: AGPL-3.0-only
// The desk's width check (record 48, after the learners report): the real
// desk, every section open to one person, against a fake engine that holds
// nothing, so each page draws its frame (a heading, an empty list, a note)
// and the check measures whether the page uses the window's width.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../src/App";
import "../../src/shell.css";
import { GRANTS } from "../../src/grants";

const DOORS = [
  "GET /api/capabilities",
  "GET /api/summary",
  "POST /api/ask/run",
  "GET /api/sources",
  "GET /api/review",
  "GET /api/campaigns",
  "GET /api/models",
  "POST /api/releases",
  "GET /api/jobs",
];

const caps = {
  engine: {
    engine: { name: "nils", version: "1.0.0-alpha.44" },
    contracts: { openapi: "7" },
    doors: DOORS,
    policy: [],
    auth: "token",
    principal: "admin@site",
    roles: ["admin"],
    registry: { epoch: 4 },
    packs: [{ name: "mri", version: "0.9.0" }],
  },
  kvasir: null,
  assistant: null,
  apps: [],
  person: { subject: "admin@site", display_name: "admin", grants: [...GRANTS], detail: "identifying", groups: [] },
  desk: { version: "1.0.0", mode: "local", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
};

const json = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
window.fetch = ((input: RequestInfo | URL) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const path = new URL(url, location.origin).pathname;
  if (path === "/desk/capabilities") return json(200, caps);
  // an engine that holds nothing: every list is empty
  return json(404, { error: `the layout check's engine has no ${path}` });
}) as typeof fetch;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
