// SPDX-License-Identifier: AGPL-3.0-only
// Main scans' layout check (record 55, decision 6): the real desk, its top
// bar and side, on Review, Main scans for a cohort against a fake engine
// whose doors answer as the build spec's section 5 has them. Six hundred
// made-up subjects at four scanners: six T1w kinds, eight series, five
// visit columns, a page of 24 subjects with up to five visits each, and a
// strip for every subject, so mainscans.pw.ts measures that the page and
// its Rules panel share a laptop's width, that a big screen grows them
// together, that a phone is one column with no sideways scroll, and that a
// visit's pick opens in the window. Every name and number here is made up.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../src/App";
import "../../src/shell.css";
import { GRANTS } from "../../src/grants";

const DOORS = [
  "GET /api/capabilities",
  "GET /api/review",
  "GET /api/review/summary",
  "GET /api/sources",
  "GET /api/cohorts",
  "GET /api/picks/summary",
  "GET /api/picks/rules",
  "GET /api/picks/rules/text",
  "POST /api/picks/rules",
  "POST /api/picks/map",
  "POST /api/picks/map/subjects",
  "POST /api/picks/map/strips",
  "POST /api/picks",
  "POST /api/picks/{id}/withdraw",
  "GET /api/jobs/{id}",
];

const caps = {
  engine: { engine: { name: "nils", version: "1.0.0-alpha.80" }, contracts: { openapi: "7" }, doors: DOORS, policy: [], auth: "token", principal: "astrid@site", roles: [], registry: { epoch: 4 }, packs: [{ name: "mri", version: "1.1.0" }] },
  kvasir: null,
  assistant: null,
  apps: [],
  person: { subject: "astrid@site", display_name: "Astrid", grants: [...GRANTS], detail: "sensitive", groups: [] },
  desk: { version: "1.0.0", mode: "local", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
};

/** A seeded random number, so every run draws the same made-up cohort. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const KINDS: Record<string, string[]> = {
  t1w: ["3D MPRAGE", "3D SPGR", "3D MPRAGE +C", "3D SPGR +C", "2D SE", "2D SE +C"],
  flair: ["3D FLAIR", "2D FLAIR"],
  t2w: ["3D SPACE", "2D TSE"],
};
const COLUMNS = ["Siemens Skyra · 3 T", "Siemens Avanto · 1.5 T", "GE Signa HDxt · 3 T", "Philips Ingenia · 1.5 T", "Other scanners"];

const role = (keep: string, kinds: string[]) => ({ keep_alike: keep, kinds_in_order: kinds, not_used: [], contrast: "either", dimension: "any", body_part: "brain", slice_thickness_at_most_mm: null });
const RULES = {
  roles: { t1w: role("balanced", KINDS.t1w.slice(0, 5)), flair: role("balanced", KINDS.flair), t2w: role("within_each_subject", KINDS.t2w) },
  same_kind_in_one_visit: {
    weights: { slice_count: 0.2, field_of_view: 0.1, modifiers: 0.12, orientation: 0.05, completeness: 0.05 },
    derived_series_scores: 0.5,
    near_tie_within_percent: 5,
    near_tie_goes_to: ["axial_coronal_sagittal", "thinner_slices", "default_reconstruction", "later_full_repeat", "earlier_series"],
  },
};

interface Subject {
  id: number;
  code: string;
  column: number;
  visits: { kind: string | null; column: number; field: string }[];
}

/** Six hundred subjects at four scanners, a role's kinds per visit. */
function cohortOf(r: string): Subject[] {
  const next = rng(20261010 + r.length);
  const kinds = KINDS[r] ?? KINDS.t1w;
  return Array.from({ length: 600 }, (_, i) => {
    const column = Math.floor(next() * 4);
    const count = 1 + Math.floor(next() * next() * 6);
    let at = Math.floor(next() * Math.min(3, kinds.length));
    const visits = Array.from({ length: count }, () => {
      if (next() < 0.25) at = Math.floor(next() * kinds.length);
      const col = next() < 0.85 ? column : Math.floor(next() * 5);
      return { kind: next() < 0.05 ? null : kinds[at], column: col, field: COLUMNS[col].endsWith("1.5 T") ? "1.5 T" : "3 T" };
    });
    return { id: 1000 + i, code: (0x5a9f30c6e8b21d00 + i * 7919).toString(16).slice(0, 16), column, visits };
  });
}

const changes = (s: Subject) => s.visits.filter((v, j) => j > 0 && v.kind !== s.visits[j - 1].kind).length;

function mapOf(r: string, draft: boolean) {
  const cohort = cohortOf(r);
  const kinds = KINDS[r] ?? KINDS.t1w;
  const visits = cohort.flatMap((s) => s.visits);
  const taken = visits.filter((v) => v.kind !== null);
  const count = (k: string | null) => visits.filter((v) => v.kind === k).length;
  const repeat = cohort.filter((s) => s.visits.length > 1);
  const series = new Map<string, number>();
  for (const s of repeat) {
    const steps: (string | null)[] = [];
    for (const v of s.visits) if (steps.length === 0 || steps[steps.length - 1] !== v.kind) steps.push(v.kind);
    const key = JSON.stringify(steps);
    series.set(key, (series.get(key) ?? 0) + 1);
  }
  const metrics = {
    visits: visits.length,
    visits_taken: taken.length,
    subjects: cohort.length,
    subjects_taken: cohort.filter((s) => s.visits.some((v) => v.kind !== null)).length,
    alike_data: { kind: kinds[0], visits: count(kinds[0]) },
    alike_within: { subjects: repeat.filter((s) => changes(s) === 0).length, of: repeat.length },
    series_complete: { subjects: repeat.filter((s) => s.visits.every((v) => v.kind !== null)).length, of: repeat.length },
  };
  return {
    role: r,
    rules_version: 2,
    kinds: kinds.map((k, i) => ({ key: k, visits_with: count(k) + 40 - i * 5, visits_taken: count(k), allowed: true, used: true, new: r === "t1w" && i === kinds.length - 1 })),
    metrics: draft ? { ...metrics, visits_taken: metrics.visits_taken + 12, alike_data: { ...metrics.alike_data, visits: metrics.alike_data.visits + 40 } } : metrics,
    columns: COLUMNS.map((c, i) => ({ key: c, visits: visits.filter((v) => v.column === i).length })),
    matrix: [...kinds, null].map((k) => ({ kind: k, cells: COLUMNS.map((_, i) => visits.filter((v) => v.column === i && v.kind === k).length) })),
    series: [...series.entries()].map(([k, n]) => ({ steps: JSON.parse(k), subjects: n })).sort((a, b) => b.subjects - a.subjects),
    single_visit_subjects: cohort.length - repeat.length,
    by_visit: [1, 2, 3, 4, 5].map((n) => {
      const at = cohort.flatMap((s) => s.visits.filter((_, j) => Math.min(j + 1, 5) === n));
      return { visit: n, visits: at.length, kinds: [...kinds, null].map((k) => ({ kind: k, visits: at.filter((v) => v.kind === k).length })) };
    }),
    effect: draft ? { visits_changed: 37, subjects_changed: 21, before: metrics } : null,
  };
}

function subjectsOf(r: string, page: number, order: string) {
  const all = cohortOf(r)
    .filter((s) => s.visits.length > 1 && changes(s) > 0)
    .sort((a, b) => (order === "visits" ? b.visits.length - a.visits.length : changes(b) - changes(a) || b.visits.length - a.visits.length) || a.id - b.id);
  return {
    total: all.length,
    page,
    per_page: 24,
    subjects: all.slice(page * 24, page * 24 + 24).map((s) => ({
      subject_id: s.id,
      subject: s.code,
      visits: s.visits.map((v, j) => ({
        session_id: s.id * 10 + j,
        visit: j + 1,
        column: COLUMNS[v.column],
        field: v.field,
        kind: v.kind,
        stack: v.kind ? s.id * 10 + j : null,
        by: v.kind ? "rules" : null,
        changed: j > 0 && v.kind !== s.visits[j - 1].kind,
        candidates: v.kind ? [{ stacks: [s.id * 10 + j], kind: v.kind, score: 0.88 }, { stacks: [s.id * 10 + j + 5], kind: v.kind, score: 0.8 }] : [],
      })),
    })),
  };
}

function stripsOf(r: string) {
  const kinds = KINDS[r] ?? KINDS.t1w;
  return { kinds, columns: COLUMNS.slice(0, 4), subjects: cohortOf(r).map((s) => ({ subject_id: s.id, column: s.column, visits: s.visits.map((v) => (v.kind === null ? -1 : kinds.indexOf(v.kind))) })) };
}

const RULES_DOC = {
  scope: { cohort: "ms-followup" },
  pack: { name: "mri", version: "1.1.0" },
  current: { version: 2, saved: true, reason: "3D first for the lesion study", author: "astrid", at: "2026-10-10T09:00:00Z", digest: "d2", rules: RULES },
  versions: [
    { version: 2, reason: "3D first for the lesion study", author: "astrid", at: "2026-10-10T09:00:00Z" },
    { version: 1, reason: "the pack's defaults", author: null, at: null },
  ],
};

const json = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.origin);
  const path = url.pathname;
  const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
  if (path === "/desk/capabilities") return json(200, caps);
  if (path === "/api/picks/rules" && (init?.method ?? "GET") === "GET") return json(200, RULES_DOC);
  if (path === "/api/picks/rules/text") return Promise.resolve(new Response(`# Main scans of ms-followup, version 2\nroles:\n  t1w:\n    keep_alike: balanced\n    kinds_in_order:\n${KINDS.t1w.map((k) => `      - ${k}`).join("\n")}\n`, { status: 200 }));
  if (path === "/api/picks/map") return json(200, mapOf(String(body.role), body.rules !== undefined));
  if (path === "/api/picks/map/subjects") return json(200, subjectsOf(String(body.role), Number(body.page ?? 0), String(body.order)));
  if (path === "/api/picks/map/strips") return json(200, stripsOf(String(body.role)));
  if (path === "/api/review/summary") return json(200, { by_kind: { "pick.border": 4 }, cohorts: [], none: 0 });
  if (path === "/api/sources") return json(200, { count: 2, window_days: 30, sources: [{ id: 3, name: "study-big" }, { id: 4, name: "ward-c" }] });
  if (path === "/api/cohorts") return json(200, [{ name: "ms-followup", retired_at: null }]);
  return json(404, { error: `the layout check's engine has no ${path}` });
}) as typeof fetch;

if (!location.hash) location.hash = "#review/picks?cohort=ms-followup";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
