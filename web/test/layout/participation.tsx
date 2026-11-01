// SPDX-License-Identifier: AGPL-3.0-only
// Settings > Participation (Wave 7b step 5) in the real desk's shell against
// a fake engine and a fake assistant: by default the site takes part in
// nothing; with ?on it shares counts and a sealed read, a draw of 1,000 is
// made and its rater run is half way, the counts file previews and sends.
// Every name and number here is made up.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../src/App";
import "../../src/shell.css";
import { GRANTS } from "../../src/grants";

const ON = new URLSearchParams(location.search).has("on");
const ENGINE = "1.0.0-beta.5";

const engine = {
  engine: { name: "nils", version: ENGINE },
  contracts: { openapi: "7", pack: "10" },
  doors: ["GET /api/capabilities", "GET /api/summary", "GET /api/participation", "POST /api/participation", "GET /api/participation/preview", "POST /api/participation/send", "GET /api/participation/sends", "POST /api/audit/draws", "POST /api/audit/draws/{id}/settle"],
  policy: [],
  auth: "token",
  principal: "astrid@site",
  roles: [],
  registry: { epoch: 4, schema_version: 40 },
  packs: [{ name: "mri", version: "1.0.3" }],
  uptime_seconds: 5 * 86_400,
};

const caps = {
  engine,
  kvasir: null,
  assistant: null,
  apps: [],
  person: { subject: "astrid@site", display_name: "Astrid", grants: [...GRANTS], detail: "sensitive", groups: [] },
  desk: { version: ENGINE, mode: "local", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
};

const counts = (total: number) => ({ total, by_cohort: {} });
const summary = { epoch: 4, synthetic: null, cohorts: 0, subjects: counts(1_205), sessions: counts(2_610), stacks: counts(12_480), since: null };
const off = { enabled: false, tiers: [], note: "Nothing leaves this install.", assistant_rater_door: null };
const sent = { id: 1, tier: 1, digest: "ab".repeat(32), bytes: 2_048, sent_at: "2026-10-01T10:00:00Z", sent_by: "astrid@site", receiver: "https://participation.example.org", receipt: "cd".repeat(32), error: null, previewed_at: "2026-10-01T09:59:00Z", draw: null, ok: true };
const on = { enabled: true, site: "example-site", tiers: [1, 3], receiver: "https://participation.example.org", key_file: "/etc/nils/participation.key", key_fingerprint: "0123456789abcdef0123", public_key: "cHVi", auto: true, enabled_at: "2026-10-01T09:00:00Z", enabled_by: "astrid@site", previewed: {}, last_send: { "1": sent }, receiver_reachable: true, assistant_rater_door: true };
const draw = { id: 7, round_id: 2, seed: "participation-example-site-2026-11-01", share: null, count: 1000, created_by: "astrid@site", frame: { stacks: 12_480, digest: "ef".repeat(32) }, drawn: 1000, campaign_id: 31, campaigns: { raters: 31, settle: null, rule_review: null }, settle: null, grade: null };
const document_ = {
  kind: "nils participation counts",
  site: "example-site",
  registry_id: "0123abcd",
  made_at: "2026-11-01T10:00:00Z",
  versions: { engine: ENGINE, desk: ENGINE, pack: { name: "mri", version: "1.0.3" } },
  archive: { stacks_by_modality: { MR: 12_480 }, stacks_by_vendor: { SIEMENS: 9_800, "GE MEDICAL SYSTEMS": 2_680 }, sessions: 2_610, subjects: 1_205 },
  answers: { technique: { T1: 4_100, T2: 3_900, FLAIR: 2_300, DWI: 1_400, abstained: 780 } },
  review: { technique: { corrections: 42 } },
  releases: { count: 3, stacks: 6_200, files_written: 18_600, failures: {} },
  audit: { rounds_graded: 2, last_wrong: 0, last_bound: 0.003 },
  trains: false,
  signature: "c2lnbmF0dXJl",
  signed_by: "0123456789abcdef",
};
if (ON) {
  try {
    localStorage.setItem("nils-participation-sealed:7", JSON.stringify({ path: "model-first", run: { id: "r1", conversation: "rater-c1", rater: "astrid@site" } }));
  } catch {
    // the page still draws the draw
  }
}

const json = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const path = new URL(url, location.origin).pathname;
  const method = init?.method ?? "GET";
  if (path === "/desk/capabilities") return json(200, caps);
  if (path === "/api/capabilities") return json(200, engine);
  if (path === "/api/summary") return json(200, summary);
  if (path === "/api/participation" && method === "GET") return json(200, ON ? on : off);
  if (path === "/api/participation" && method === "POST") return json(200, on);
  if (path === "/api/participation/sends") return json(200, { sends: ON ? [sent] : [] });
  if (path === "/api/participation/preview") return json(200, { document: document_, digest: "ab".repeat(32), previewed_at: "2026-11-01T10:00:00Z" });
  if (path === "/api/participation/send") return json(200, { ...sent, id: 2, sent_at: new Date().toISOString() });
  if (path === "/api/audit/draws") return json(200, { draws: ON ? [draw] : [] });
  if (path === "/api/campaigns/31") return json(200, { id: 31, status: "open", counts: { items: { open: 512, settled: 488 } } });
  if (path === "/assistant/raters/runs/r1") return json(200, { run: "r1", conversation: "rater-c1", principal: "astrid@site", state: "running", done: false, claimed: 490, answered: 488, refused: 2, cant_tell: 0, errors: 0, token: "held" });
  if (path === "/desk/assistant/conversations/rater-c1/token") return json(200, {});
  return json(404, { error: `the layout check's engine has no ${path}` });
}) as typeof fetch;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
