// SPDX-License-Identifier: AGPL-3.0-only
// Review round 1's layout check (record 56 section 6.3): the real desk, its
// top bar and side, on Review's Questions for one dataset and on a
// question's grid, against a fake engine that gathers its questions as the
// engine's doors do: "T2w or FLAIR?" over twelve scans with System 1's
// answers, "Which base?" over seven with one answer staged and one read
// blind first, a question about whole scans answered on Asked, three scans
// a campaign holds, and an identity question that waits beside them. The
// pictures are drawn here as small grey discs. What the answer door was
// sent is kept on the window for questions.pw.ts to read. Every name and
// number is made up.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../src/App";
import "../../src/shell.css";
import { GRANTS } from "../../src/grants";
import { answered, LIST, PAGE_MISSING, PAGE_PAIR } from "../../src/review/questions.fixture";

const DOORS = [
  "GET /api/capabilities",
  "GET /api/review",
  "GET /api/review/summary",
  "GET /api/review/questions",
  "GET /api/review/questions/{key}/scans",
  "POST /api/review/questions/{key}/answer",
  "GET /api/review/{id}/suggestions",
  "POST /api/campaigns",
  "GET /api/campaigns",
  "GET /api/sources",
];

const caps = {
  engine: { engine: { name: "nils", version: "1.0.0-alpha.81" }, contracts: { openapi: "7" }, doors: DOORS, policy: [], auth: "token", principal: "astrid@site", roles: [], registry: { epoch: 4 }, packs: [{ name: "mri", version: "1.2.0" }] },
  kvasir: null,
  assistant: null,
  apps: [],
  person: { subject: "astrid@site", display_name: "Astrid", grants: [...GRANTS], detail: "quasi", groups: [] },
  desk: { version: "1.0.0", mode: "local", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
};

const ITEMS = [
  { id: 1, kind: "base:missing", scope: "group", status: "open", created_at: "2026-10-14T10:00:00Z", members: 7, evidence: { axis: "base", value: "", tier: "missing" } },
  { id: 2, kind: "base:disagree", scope: "stack", status: "open", created_at: "2026-10-14T10:00:00Z", ref: { stack_id: 301 }, evidence: { axis: "base" } },
  { id: 3, kind: "identity.collision", scope: "subject", status: "open", created_at: "2026-10-14T09:00:00Z", evidence: { sessions: 2, place: "ms-a" } },
];

const w = window as unknown as { posted: unknown[]; left: Record<string, number> };
w.posted = [];
w.left = { "base:missing": 7, "base:FLAIR|T2w": 12 };
const json = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.origin);
  const path = decodeURIComponent(url.pathname);
  if (path === "/desk/capabilities") return json(200, caps);
  if (path === "/api/review/questions") return json(200, { ...LIST, questions: (LIST.questions as { key: string }[]).filter((q) => w.left[q.key] > 0) });
  if (path === "/api/review/questions/base:missing/scans") return json(200, PAGE_MISSING);
  if (path === "/api/review/questions/base:FLAIR|T2w/scans") return json(200, PAGE_PAIR);
  const answer = /^\/api\/review\/questions\/(.+)\/answer$/u.exec(path);
  if (answer) {
    const body = JSON.parse(String(init?.body)) as { stacks: number[]; except: { stack: number; skip?: boolean }[] };
    w.posted.push(body);
    const skipped = body.except.filter((e) => e.skip).map((e) => e.stack);
    w.left[answer[1]] = skipped.length;
    return json(200, answered(answer[1], body.stacks, skipped.length, skipped));
  }
  if (path === "/api/review/summary") return json(200, { by_kind: { "base:missing": 1, "base:disagree": 1, "identity.collision": 1 }, cohorts: [], none: 0 });
  if (path === "/api/review") return json(200, { count: ITEMS.length, items: ITEMS });
  if (path === "/api/campaigns") return json(200, { campaigns: [] });
  if (path === "/api/sources") return json(200, { count: 1, window_days: 30, sources: [{ id: 3, name: "ms-a" }] });
  return json(404, { error: `the layout check's engine has no ${path}` });
}) as typeof fetch;

if (!location.hash) location.hash = "#review/questions?dataset=ms-a";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
