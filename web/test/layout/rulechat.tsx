// SPDX-License-Identifier: AGPL-3.0-only
// A rule change the assistant proposed, in the one chat (record 56, 6.4): the
// desk's own App on the conversation of the Assistant's checks, its history
// ending in a turn that proposed a change to the rules, which the chat draws
// as the Rules page's own approval card, read from the engine's proposal
// (one that breaks three settled answers). rules.pw.ts opens it at a laptop's
// width and a phone's, in the dark theme. Every name and number is made up.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../src/App";
import "../../src/shell.css";
import { fakeDoors, text } from "../../src/assistant/onechat.fixture";
import { GRANTS } from "../../src/grants";
import { PACK_RAW, PROPOSAL_FULL } from "../../src/review/rules.fixture";

const caps = {
  engine: {
    engine: { name: "nils", version: "1.0.0-alpha.81" },
    contracts: { openapi: "7" },
    doors: ["GET /api/capabilities", "POST /api/ask/profile", "GET /api/packs/{name}", "GET /api/packs/{name}/proposals/{id}", "POST /api/packs/{name}/proposals/{id}/decide", "POST /api/packs/{name}/proposals/{id}/rehearse", "GET /api/instances/{stack}/thumb"],
    policy: [],
    auth: "token",
    principal: "astrid@site",
    roles: ["admin"],
    registry: { epoch: 4 },
    packs: [{ name: "mri", version: "1.2.0" }],
  },
  kvasir: { models: [{ id: "qwen38-27b", locality: "local" }] },
  assistant: { stations: [{ id: "nils" }] },
  apps: [],
  person: { subject: "astrid@site", display_name: "Astrid", grants: [...GRANTS], detail: "sensitive", groups: [] },
  desk: { version: "1.0.0", mode: "local", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
};

document.documentElement.dataset.theme = new URLSearchParams(location.search).get("theme") === "light" ? "light" : "dark";

/** The turn that proposed a change to the rules, at the end of the conversation's history. */
const PROPOSED = [
  { id: "u6", role: "user", parts: [text("Series called dark fluid are FLAIR. Fix the rules.")] },
  {
    id: "a6",
    role: "assistant",
    parts: [
      text("I proposed one change for everyone: it moves 50 scans to FLAIR and breaks 3 answers people settled."),
      { type: "data-approval", data: { kind: "approval", id: "r6", change: "rule_change", sentence: 'Add "dark fluid" to base FLAIR', ref: { proposal: 12, pack: "mri" } } },
    ],
  },
];

const doors = fakeDoors([]);
const asked = new Map<string, number>();
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.origin);
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  if (url.pathname === "/desk/capabilities") return reply(200, caps);
  if (url.pathname === "/api/packs/mri/proposals/12") return reply(200, PROPOSAL_FULL);
  if (url.pathname === "/api/packs/mri") return reply(200, PACK_RAW);
  const method = init?.method ?? "GET";
  const key = `${method} ${url.pathname}${url.search}`;
  const nth = (asked.get(key) ?? 0) + 1;
  asked.set(key, nth);
  const a = doors({ method, url: `${url.pathname}${url.search}`, body: typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null }, nth);
  if (a && url.searchParams.get("view") === "history") {
    const history = a.body as { messages: unknown[] };
    return reply(a.status, { ...history, messages: [...history.messages, ...PROPOSED] });
  }
  return a ? reply(a.status, a.body) : reply(404, { error: `the layout check has no ${method} ${url.pathname}` });
}) as typeof fetch;

if (!location.hash) location.hash = "#assistant/c1";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
