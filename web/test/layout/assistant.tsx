// SPDX-License-Identifier: AGPL-3.0-only
// The Assistant in the real desk (the redesign, 2026-10-09): the desk's own
// App, its top bar, side and page, opened on a conversation with two
// versions of a query, a plan that waits and a question, against the fake
// assistant and engine of the page's own tests, in the bundle's order (the
// App's styles, then the shell's), so assistant.pw.ts measures the column,
// the panel and a phone's width in a real browser. `?theme=light` draws the
// light theme.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../src/App";
import "../../src/shell.css";
import { fakeDoors } from "../../src/assistant/onechat.fixture";
import { GRANTS } from "../../src/grants";

const caps = {
  engine: {
    engine: { name: "nils", version: "1.0.0-alpha.80" },
    contracts: { openapi: "7" },
    doors: ["GET /api/capabilities", "POST /api/ask/profile", "PUT /api/ask/selections/{name}", "GET /api/ask/selections"],
    policy: [],
    auth: "token",
    principal: "astrid@site",
    roles: ["admin"],
    registry: { epoch: 4 },
    packs: [{ name: "mri", version: "0.25.0" }],
  },
  kvasir: { models: [{ id: "qwen38-27b", locality: "local" }] },
  assistant: { stations: [{ id: "nils" }] },
  apps: [],
  person: { subject: "astrid@site", display_name: "Astrid", grants: [...GRANTS], detail: "sensitive", groups: [] },
  desk: { version: "1.0.0", mode: "local", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
};

const theme = new URLSearchParams(location.search).get("theme");
if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;

const doors = fakeDoors();
const asked = new Map<string, number>();
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.origin);
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  if (url.pathname === "/desk/capabilities") return reply(200, caps);
  const method = init?.method ?? "GET";
  const key = `${method} ${url.pathname}${url.search}`;
  const nth = (asked.get(key) ?? 0) + 1;
  asked.set(key, nth);
  const a = doors({ method, url: `${url.pathname}${url.search}`, body: typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null }, nth);
  return a ? reply(a.status, a.body) : reply(404, { error: `the layout check has no ${method} ${url.pathname}` });
}) as typeof fetch;

if (!location.hash) location.hash = "#assistant/c1";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
