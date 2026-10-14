// SPDX-License-Identifier: AGPL-3.0-only
// Review's one list of work and Data's Browse, in the real desk's shell
// (Wave 7a, record 55 H3; spec 13.1 and 13.2), against a fake engine whose
// doors answer as the engine's do: the machine's questions by kind, six
// campaigns of every job (an axis, a pick, a check, a pair, an A/B and one to
// adjudicate) with the person's own share, the saved selections, the open
// kinds and the people the make dialog chooses from, the preview of a drawn
// campaign, and the registry's subjects, sessions and scans. work.pw.ts
// opens it at #review, at the make dialog and at #data/browse, at a laptop's
// width and a phone's. Every name and number here is made up.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../src/App";
import "../../src/shell.css";
import { GRANTS } from "../../src/grants";

const DOORS = [
  "GET /api/capabilities",
  "GET /api/review",
  "GET /api/review/summary",
  "GET /api/campaigns",
  "POST /api/campaigns",
  "POST /api/campaigns/preview",
  "GET /api/campaigns/{id}",
  "GET /api/campaigns/{id}/mine",
  "POST /api/campaigns/{id}/claim",
  "GET /api/label-sets",
  "GET /api/ask/selections",
  "GET /api/ask/handles",
  "GET /api/packs/{name}",
  "GET /api/picks/rules",
  "GET /api/sources",
  "GET /api/subjects",
  "GET /api/subjects/{id}/sessions",
  "GET /api/sessions/{id}/stacks",
  "GET /api/scans",
  "GET /api/cohorts",
];

const caps = {
  engine: {
    engine: { name: "nils", version: "1.0.0-alpha.80" },
    contracts: { openapi: "7" },
    doors: DOORS,
    policy: [],
    auth: "token",
    principal: "astrid@site",
    roles: [],
    registry: { epoch: 4 },
    packs: [{ name: "mri", version: "1.1.0" }],
    campaigns: { question_kinds: ["axis", "axes", "pair", "anchored", "check"], draws: ["pair", "anchored", "ab"] },
  },
  kvasir: null,
  assistant: null,
  apps: [],
  person: { subject: "astrid@site", display_name: "Astrid", grants: [...GRANTS], detail: "quasi", groups: [] },
  desk: { version: "1.0.0", mode: "local", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
};

const counts = (open: number, agreed = 0, adj = 0) => ({ items: { open, agreed, needs_adjudication: adj }, assignments: {}, answers: agreed * 2 });
const campaign = (id: number, name: string, question: Record<string, unknown>, c: ReturnType<typeof counts>, more: Record<string, unknown> = {}) => ({
  id,
  name,
  owner: "astrid@site",
  status: "open",
  question,
  grain: question.kind === "pick" ? "session" : "stack",
  source: { selection: `${name}@1` },
  handle_id: 3,
  raters_per_item: 2,
  rater_policy: { raters: [], adjudicators: [] },
  adjudication: { when: "disagree", metric: "exact" },
  closes_into: "stage",
  lease_seconds: 3600,
  created_at: "2026-10-12T09:00:00Z",
  closed_at: null,
  closed_by: null,
  agreement: null,
  counts: c,
  ...more,
});
const CAMPAIGNS = [
  campaign(11, "body-part-curation-round-9", { kind: "axis", axis: "body_part", values: ["brain", "spine", "neck", "brain-neck"] }, counts(212, 88, 0)),
  campaign(12, "base-review-study-big", { kind: "axis", axis: "base", values: ["T1w", "T2w", "PDw", "T2starw"] }, counts(7, 2, 3), { rater_policy: { raters: [], adjudicators: ["astrid@site"] } }),
  campaign(13, "main-t1-followup", { kind: "pick", role: "t1w" }, counts(40, 12, 0)),
  campaign(14, "samseg-lesions-check", { kind: "check", part_set: "lesions", reasons: ["missed", "over", "under"] }, counts(336, 20, 0)),
  campaign(15, "post-contrast-pairs-r3", { kind: "pair", axis: "post_contrast" }, counts(120, 0, 0)),
  campaign(16, "reference-ab-cert3", { kind: "axes", axes: ["base", "technique", "modifier"] }, counts(54, 0, 0), { source: { ab: { voters: ["rules", "judge"] } }, raters_per_item: 1 }),
  campaign(9, "probe-axis", { kind: "axis", axis: "base" }, counts(0, 6, 0), { status: "closed", closed_at: "2026-10-01T09:00:00Z" }),
];
const SUMMARY = { by_kind: { "base:missing": 7, "identity.collision": 2, "identity.unmapped": 1, "body_part:model": 40, "pick.border": 3, "classify.asked": 5, "campaign.axis": 219, "pipeline:qc": 4 }, cohorts: [], none: 0 };
const SELECTIONS = ["t1-pre", "t1-post", "body-part-unsure", "sealed-cert-3"].map((name, i) => ({
  id: i + 1,
  name,
  spec: `selection:${name}@${i + 1}`,
  description: null,
  versions: i + 1,
  grain: "stack",
  owner: "astrid@site",
  created_at: "2026-10-10T09:00:00Z",
  updated_at: null,
  updated_by: null,
  note: null,
  cohort: null,
  size: { rows: 120 + i * 40, grain: "stack", version: i + 1, handle: 20 + i, at: "2026-10-10T09:00:00Z", truncated: false },
}));
const PACK = {
  pack: "mri",
  version: "1.1.0",
  contract: 9,
  axes: [
    { axis: "base", values: ["T1w", "T2w", "PDw", "T2starw", "DWI"] },
    { axis: "body_part", values: ["brain", "spine", "neck", "brain-neck", "other"] },
    { axis: "post_contrast", values: ["given", "none"] },
    { axis: "technique", values: ["SE", "GRE", "MDME", "EPI"] },
  ],
  picks: [{ name: "main", roles: ["t1w", "flair", "t2w"] }],
};

const code = (i: number) => `${(0x5a9f30c6 + i * 7919).toString(16)}e8b21d${i % 10}`;
const SUBJECTS = Array.from({ length: 24 }, (_, i) => ({
  id: 100 + i,
  code: code(i),
  label: code(i),
  visits: 1 + (i % 4),
  scans: 9 + i * 3,
  look: i % 5 === 0 ? 2 : 0,
  regions: i % 4 === 0 ? ["brain", "spine"] : ["brain"],
  makers: [["Siemens", "GE", "Philips"][i % 3]],
  main: i % 6 === 0 ? ["t1w"] : ["t1w", "flair", "t2w"],
}));
const VISITS = [0, 365, 730].map((day, i) => ({
  session: 400 + i,
  studies: [500 + i],
  label: `ses-20${20 + i}0412`,
  first: `20${20 + i}-04-12`,
  day: String(day),
  number: i + 1,
  scans: 12 - i * 2,
  look: i === 0 ? 2 : 0,
  regions: ["brain"],
  kinds: [
    { kind: "T1w", scans: 3 },
    { kind: "FLAIR", scans: 1 },
    { kind: "T2w", scans: 2 },
  ],
  contrast: i === 0,
  symri: 0,
  main: [{ role: "t1w", stack: 900 + i, name: "Sag_T1w_3D_MPRAGE_ND" }],
}));
const SCOPE = { kind: "registry" };

const json = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const u = new URL(url, location.origin);
  const p = u.pathname;
  if (p === "/desk/capabilities") return json(200, caps);
  if (p === "/desk/people") return json(200, { people: [{ subject: "bo", display: "Bo", holds: true }, { subject: "cy", display: "Cy", holds: true }, { subject: "dee", display: "Dee", holds: false }] });
  if (p === "/api/review/summary") return json(200, SUMMARY);
  if (p === "/api/review") return json(200, { count: 0, items: [] });
  if (p === "/api/campaigns") return json(200, { count: CAMPAIGNS.length, campaigns: CAMPAIGNS });
  if (/^\/api\/campaigns\/\d+\/mine$/.test(p)) return json(200, { campaign: 11, principal: "astrid@site", open: true, count: 34, total: 34, values: {}, answers: [] });
  if (p === "/api/campaigns/preview") {
    const body = JSON.parse(String(init?.body ?? "{}")) as { source?: Record<string, unknown> };
    if (body.source?.pair) return json(200, { kind: "pair", counts: { pairs: 118, stacks: 236, stacks_in_two_or_more_pairs: 0, pairs_across_studies: 4, left_out: 6 }, dry_run: true });
    return json(200, { counts: { items: 54 }, dry_run: true });
  }
  if (p === "/api/ask/selections") return json(200, { count: SELECTIONS.length, total: SELECTIONS.length, matching: SELECTIONS.length, selections: SELECTIONS, next: null });
  if (p === "/api/ask/handles") return json(200, { count: 0, handles: [] });
  if (p.startsWith("/api/packs/")) return json(200, PACK);
  if (p === "/api/label-sets") return json(200, { count: 0, label_sets: [] });
  if (p === "/api/subjects")
    return json(200, {
      scope: SCOPE,
      detail: "quasi",
      show: "code",
      order: "look",
      totals: { subjects: 1240, visits: 3010, scans: 31200, look: 7 },
      matched: 1240,
      count: SUBJECTS.length,
      subjects: SUBJECTS,
      next: 124,
      facets: { makers: [{ name: "GE", subjects: 400 }, { name: "Philips", subjects: 380 }, { name: "Siemens", subjects: 460 }], regions: [{ name: "brain", subjects: 1240 }, { name: "spine", subjects: 310 }], roles: [{ name: "t1w", subjects: 1200 }, { name: "flair", subjects: 990 }], id_types: [] },
    });
  if (/^\/api\/subjects\/\d+\/sessions$/.test(p)) return json(200, { scope: SCOPE, detail: "quasi", name: "date", show: "code", subject: { id: 100, code: code(0), label: code(0) }, totals: { visits: 3, scans: 30, look: 2, span: "730" }, matched: 3, visits: VISITS });
  if (/^\/api\/sessions\/[^/]+\/stacks$/.test(p) || p === "/api/scans") return json(200, { scope: SCOPE, total: 0, count: 0, scans: [], next: null, pictures: { shown: true, why: null, missing: 0, partial: 0 } });
  if (p === "/api/sources") return json(200, { sources: [], totals: {} });
  if (p === "/api/cohorts") return json(200, []);
  return json(404, { error: `the layout check's engine has no ${p}` });
}) as typeof fetch;

if (!location.hash) location.hash = "#review";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
