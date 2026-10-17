// SPDX-License-Identifier: AGPL-3.0-only
// The walk of the side (record 55 H2, round 4; gate T31: every section is
// reachable from the side): the real desk over walk.fixture.ts, every grant
// held by one person, every door in walk.doors.json served, and an engine
// that holds nothing, so each page draws its empty state. side-walk.pw.ts
// opens every section and every page under it and checks that each one draws.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../src/App";
import "../../src/shell.css";
import { empty, WALK_CAPS } from "./walk.fixture";

const json = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const path = new URL(url, location.origin).pathname;
  if (path === "/desk/capabilities") return json(200, WALK_CAPS);
  const body = (init?.method ?? "GET") === "GET" ? empty(path) : null;
  if (body !== null) return json(200, body);
  return json(404, { error: `the walk's engine has no ${path}` });
}) as typeof fetch;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
