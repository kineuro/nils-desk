// SPDX-License-Identifier: AGPL-3.0-only
// The review rule's screens (record 55 D3, D6, D7) drawn from fixtures, for
// the layout check and its screenshots: s1.html?view=routine|blind|rounds|work.
// A fake engine answers the doors the screens read.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import listed from "../fixtures/campaigns/list.json";
import { capsFor, DOORS } from "../../src/campaigns/caps.fixture";
import type { Campaign } from "../../src/campaigns/client";
import { DecideDialog } from "../../src/review/Decide";
import { RoundsBody } from "../../src/review/RoundsPage";
import { WorkBody } from "../../src/review/WorkPage";
import { ROUND, SUGGESTIONS } from "../../src/review/s1.fixture";
import "../../src/shell.css";

const view = new URLSearchParams(location.search).get("view") ?? "routine";
const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.endsWith("/provisional")) return json({ item: 41, mode: "blind_first", answer: JSON.parse(String(init?.body ?? "{}")), seconds: 14 });
  if (url.endsWith("/suggestions")) return json({ ...SUGGESTIONS, mode: view === "blind" ? "blind_first" : "routine", provisional: view === "blind" ? { answer: { value: "FLAIR" }, seconds: 14 } : null });
  return json({});
}) as typeof fetch;

const caps = capsFor({ doors: [...DOORS, "GET /api/review", "GET /api/review/summary", "GET /api/review/rounds", "POST /api/audit/draws", "POST /api/audit/draws/{id}/grade", "GET /api/picks/rules"], grants: ["review:see", "review:work", "campaigns:see", "campaigns:work"] });
const pack = { name: "mri", version: "1.2.0", axes: [{ axis: "base", values: ["T1w", "T2w", "FLAIR", "PDw", "SWI"].map((v) => ({ value: v, label: null })) }] } as never;
const item = { id: 41, kind: "base:missing", scope: "stack", status: "open", ref: { stack_id: 1207 }, created_at: "2026-10-14T08:00:00Z", mode: view === "blind" ? "blind_first" : "routine", evidence: view === "blind" ? { blind_first: true, axes: ["base"] } : {} } as never;
const campaigns = [
  ...(listed as { campaigns: Campaign[] }).campaigns,
  { ...(listed as { campaigns: Campaign[] }).campaigns[0], id: 99, name: "audit-round-3-draw-2", purpose: "audit", status: "open", question: { kind: "axes", axes: ["provenance", "technique", "modifier", "construct", "base"] } } as Campaign,
];

function Page() {
  if (view === "rounds")
    return <RoundsBody caps={caps} load={{ kind: "ready", value: { current: { pack: "mri", pack_version: "1.2.0", model: { id: 7, name: "s1c", version: "2026-10-09" }, confirmed: false }, rounds: [ROUND, { ...ROUND, round: { ...ROUND.round, id: 2, rules: "mri@1.1.0" }, audits: [] }] } }} onDraw={() => undefined} onGrade={() => undefined} />;
  if (view === "work") return <WorkBody caps={caps} summary={{ by_kind: { "base:missing": 7, "base:disagree": 3 }, cohorts: [], none: 0 }} list={campaigns} onMake={() => undefined} />;
  return <DecideDialog item={item} pack={pack} guess="T2w" onClose={() => undefined} onDone={() => undefined} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <div className="app">
      <main className="page">
        <Page />
      </main>
    </div>
  </StrictMode>,
);
