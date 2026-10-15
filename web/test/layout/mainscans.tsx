// SPDX-License-Identifier: AGPL-3.0-only
// Main scans' layout check (record 55, decision 6): the real desk, its top
// bar and side, on Review, Main scans for a cohort against a fake engine
// whose doors answer as the build spec's section 5 has them. Six hundred
// made-up subjects at four scanners: six T1w kinds, eight series, five
// visit columns, a page of 24 subjects with up to five visits each, and a
// strip for every subject, so mainscans.pw.ts measures that the page and
// its Rules panel share a laptop's width, that a big screen grows them
// together, that a phone is one column with no sideways scroll, and that a
// visit's pick opens in the window. By dataset the subjects' scans are in
// three datasets and about one visit in eight is copied into a second, as
// the engine answers since 2026-10-12, so the check measures the line that
// says so and a visit naming the other dataset it is in. Asked for a layer
// (record 55, decision 6: the data map's layers), the doors answer what each
// visit's scans are by body region, body part or post-contrast, the value of
// the scan each visit takes, and the step that answers the layer: body part
// not yet run over the scope, post-contrast run, so maplayers.pw.ts measures
// the layer's keys, its values, the cards and strips in its colours and the
// Run. Every name and number here is made up.

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
  "POST /api/cohorts/{name}/steps/{step}/run",
  "POST /api/datasets/{name}/steps/{step}/run",
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
    // by scanner a visit is in one column
    columns: COLUMNS.map((c, i) => ({ key: c, visits: visits.filter((v) => v.column === i).length, shared: 0 })),
    shared_visits: 0,
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

// ------------------------------------------------------------ by dataset

const DATASETS = ["study-big", "ward-c-followup", "trial-2019"];

/** Each visit's datasets with its field strength, in the map's column order: its subject's own, and for about one visit in eight a copy in the next one too. */
function datasetsOf(r: string) {
  const cohort = cohortOf(r);
  const raw = cohort.map((s) =>
    s.visits.map((v, j) => {
      const own = s.id % DATASETS.length;
      const names = (s.id * 7 + j * 13) % 8 === 0 ? [DATASETS[own], DATASETS[(own + 1) % DATASETS.length]] : [DATASETS[own]];
      return names.map((n) => `${n} · ${v.field}`);
    }),
  );
  const counts = new Map<string, number>();
  for (const k of raw.flat(2)) counts.set(k, (counts.get(k) ?? 0) + 1);
  const keys = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k]) => k);
  const at = new Map(cohort.map((s, i) => [s.id, raw[i].map((ks) => [...ks].sort((a, b) => keys.indexOf(a) - keys.indexOf(b)))]));
  return { cohort, keys, at };
}

/** The map by dataset: a copied visit is in both its columns, and each counts it; the rest counts each visit once. */
function datasetMapOf(r: string, draft: boolean) {
  const { cohort, keys, at } = datasetsOf(r);
  const kinds = KINDS[r] ?? KINDS.t1w;
  const visits = cohort.flatMap((s) => s.visits.map((v, j) => ({ kind: v.kind, under: at.get(s.id)![j] })));
  return {
    ...mapOf(r, draft),
    columns: keys.map((k) => ({ key: k, visits: visits.filter((v) => v.under.includes(k)).length, shared: visits.filter((v) => v.under.length > 1 && v.under.includes(k)).length })),
    shared_visits: visits.filter((v) => v.under.length > 1).length,
    matrix: [...kinds, null].map((k) => ({ kind: k, cells: keys.map((c) => visits.filter((v) => v.kind === k && v.under.includes(c)).length) })),
  };
}

function subjectsOf(r: string, page: number, order: string, columns: string) {
  const under = columns === "dataset" ? datasetsOf(r).at : null;
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
        column: under ? under.get(s.id)![j][0] : COLUMNS[v.column],
        columns: under ? under.get(s.id)![j] : [COLUMNS[v.column]],
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

function stripsOf(r: string, columns: string) {
  const kinds = KINDS[r] ?? KINDS.t1w;
  const strip = (v: { kind: string | null }) => (v.kind === null ? -1 : kinds.indexOf(v.kind));
  if (columns === "dataset") {
    // every subject once, under the dataset most of its visits are in
    const map = datasetMapOf(r, false);
    const { cohort, keys, at } = datasetsOf(r);
    const most = (s: Subject) => {
      const n = keys.map((k) => at.get(s.id)!.filter((under) => under.includes(k)).length);
      return n.indexOf(Math.max(...n));
    };
    return { kinds, columns: map.columns, shared_visits: map.shared_visits, subjects: cohort.map((s) => ({ subject_id: s.id, column: most(s), visits: s.visits.map(strip) })) };
  }
  const map = mapOf(r, false);
  return { kinds, columns: map.columns.slice(0, 4), shared_visits: 0, subjects: cohortOf(r).map((s) => ({ subject_id: s.id, column: s.column, visits: s.visits.map(strip) })) };
}

// ------------------------------------------------------------ the layers

const LAYER_VALUES: Record<string, string[]> = {
  body_region: ["head", "spine", "chest", "other"],
  body_part: ["brain", "brain-neck", "neck", "spine", "chest", "other"],
  post_contrast: ["pre", "post", "by_definition", "undetermined"],
};

/** A visit's scans on a layer, made up from its subject and its place: mostly the head or the brain, about one visit in nine of the spine, some contrast. */
function visitScans(layer: string, s: Subject, j: number): { scans: Record<string, number>; none: number; taken: string | null; flag: number } {
  const next = rng(s.id * 31 + j * 7 + layer.length);
  const kind = s.visits[j].kind;
  const n = 8 + Math.floor(next() * 10);
  if (layer === "post_contrast") {
    const given = (kind ?? "").endsWith("+C") || next() < 0.3;
    const post = given ? 2 + Math.floor(next() * 4) : 0;
    const undetermined = next() < 0.2 ? 1 + Math.floor(next() * 3) : 0;
    const pre = Math.max(0, n - post - undetermined);
    const scans: Record<string, number> = { pre, post, undetermined, ...(next() < 0.1 ? { by_definition: 1 } : {}) };
    const taken = kind === null ? null : kind.endsWith("+C") ? "post" : undetermined > 0 && next() < 0.3 ? "undetermined" : "pre";
    return { scans, none: next() < 0.1 ? 1 : 0, taken, flag: next() < 0.04 ? 1 : 0 };
  }
  const head = layer === "body_part" ? (next() < 0.15 ? "brain-neck" : "brain") : "head";
  const spineVisit = (s.id + j) % 9 === 0;
  const scans: Record<string, number> = spineVisit ? { spine: n - 2, [head]: 2 } : { [head]: n - (next() < 0.2 ? 1 : 0) };
  if (!spineVisit && next() < 0.1) scans.spine = 1;
  const none = next() < 0.25 ? 1 + Math.floor(next() * 3) : 0;
  const taken = kind === null ? null : spineVisit && next() < 0.3 ? "spine" : next() < 0.05 ? null : head;
  return { scans, none, taken, flag: 0 };
}

/** The step that answers a layer over the scope: body part has not run on it, post-contrast has. */
function layerStep(layer: string) {
  const ran = layer === "post_contrast";
  return {
    step: ran ? "post_contrast" : "body_part",
    state: ran ? "done" : "waiting",
    job: ran ? 812 : null,
    run: ran ? 77 : null,
    started_at: ran ? "2026-10-14T08:00:00Z" : null,
    finished_at: ran ? "2026-10-14T08:40:00Z" : null,
    progress: null,
    served: true,
    answered: ran ? 11800 : 0,
    look: 0,
    of: 12600,
    jobs: ran ? [812] : [],
    refusal: null,
    label: ran ? { rule: "time-rule-1", labelled: 12600, in_anchored_sessions: 9000, by_state: {} } : null,
  };
}

function layerHead(layer: string, values: string[]) {
  return { layer, operation: layer === "post_contrast" ? "post_contrast" : "body_part", values, step: layerStep(layer) };
}

/** The map's layer over the cohort: each value's visits that hold it and take it, its scans, what carries none. */
function mapLayerOf(r: string, layer: string) {
  const cohort = cohortOf(r);
  const order = LAYER_VALUES[layer];
  const rows = new Map<string, { visits_with: number; visits_taken: number; scans: number }>();
  const none = { visits: 0, scans: 0, taken: 0 };
  let flagged = 0;
  for (const s of cohort)
    s.visits.forEach((v, j) => {
      const x = visitScans(layer, s, j);
      const held = Object.entries(x.scans).filter(([, n]) => n > 0);
      for (const [value, n] of held) {
        const row = rows.get(value) ?? { visits_with: 0, visits_taken: 0, scans: 0 };
        row.visits_with += 1;
        row.scans += n;
        rows.set(value, row);
      }
      if (held.length === 0) none.visits += 1;
      none.scans += x.none;
      if (v.kind !== null) {
        if (x.taken === null) none.taken += 1;
        else {
          const row = rows.get(x.taken) ?? { visits_with: 0, visits_taken: 0, scans: 0 };
          row.visits_taken += 1;
          rows.set(x.taken, row);
        }
      }
      flagged += x.flag;
    });
  const values = order.filter((v) => rows.has(v)).map((value) => ({ value, ...rows.get(value)! }));
  return { ...layerHead(layer, values.map((v) => v.value)), values, none, ...(layer === "post_contrast" ? { prior_72h: flagged } : {}) };
}

/** Each visit of a page of subjects on the layer, with its candidates' values. */
function withLayer(page: ReturnType<typeof subjectsOf>, r: string, layer: string) {
  const cohort = new Map(cohortOf(r).map((s) => [s.id, s]));
  const values = LAYER_VALUES[layer];
  return {
    ...page,
    subjects: page.subjects.map((p) => {
      const s = cohort.get(p.subject_id)!;
      return {
        ...p,
        visits: p.visits.map((v, j) => {
          const x = visitScans(layer, s, j);
          const layered = { taken: x.taken, scans: x.scans, none: x.none, ...(layer === "post_contrast" ? { prior_72h: x.flag } : {}) };
          return { ...v, layer: layered, candidates: v.candidates.map((c, i) => ({ ...c, layer: i === 0 ? x.taken : values[0] })) };
        }),
      };
    }),
    layer: layerHead(layer, values),
  };
}

/** The strips on the layer: each visit's value taken and the value most of its scans carry, by index. */
function stripsLayer(strips: ReturnType<typeof stripsOf>, r: string, layer: string) {
  const cohort = new Map(cohortOf(r).map((s) => [s.id, s]));
  const values = LAYER_VALUES[layer];
  const index = (v: string | null) => (v === null ? -1 : values.indexOf(v));
  return {
    ...strips,
    subjects: strips.subjects.map((st) => {
      const s = cohort.get(st.subject_id)!;
      const xs = s.visits.map((_, j) => visitScans(layer, s, j));
      const most = (x: { scans: Record<string, number> }) => {
        const held = Object.entries(x.scans).filter(([, n]) => n > 0);
        held.sort((a, b) => b[1] - a[1] || values.indexOf(a[0]) - values.indexOf(b[0]));
        return held[0]?.[0] ?? null;
      };
      return { ...st, layer: { taken: xs.map((x) => index(x.taken)), held: xs.map((x) => index(most(x))) } };
    }),
    layer: layerHead(layer, values),
  };
}

const RULES_DOC = {
  scope: { kind: "cohort", id: 7, name: "ms-followup" },
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
  // a dataset's page is about the dataset, as the engine names it
  if (path === "/api/picks/rules" && (init?.method ?? "GET") === "GET") return json(200, url.searchParams.get("dataset") ? { ...RULES_DOC, scope: { kind: "dataset", id: 3, name: url.searchParams.get("dataset") } } : RULES_DOC);
  if (path.endsWith("/run") && path.includes("/steps/")) {
    // the runs asked for, for the check to read: the fake engine answers in the page, where no request is seen
    const w = window as unknown as { runs?: string[] };
    w.runs = [...(w.runs ?? []), path];
    return json(202, { job: 913, state: "queued", step: path.split("/")[5], for: "made-up", scans: 12600, handle: 51, command: [] });
  }
  const layer = typeof body.layer === "string" ? body.layer : null;
  if (layer && path === "/api/picks/map") return json(200, { ...(body.columns === "dataset" ? datasetMapOf(String(body.role), body.rules !== undefined) : mapOf(String(body.role), body.rules !== undefined)), layer: mapLayerOf(String(body.role), layer) });
  if (layer && path === "/api/picks/map/subjects") return json(200, withLayer(subjectsOf(String(body.role), Number(body.page ?? 0), String(body.order), String(body.columns)), String(body.role), layer));
  if (layer && path === "/api/picks/map/strips") return json(200, stripsLayer(stripsOf(String(body.role), String(body.columns)), String(body.role), layer));
  if (path === "/api/picks/rules/text") return Promise.resolve(new Response(`# Main scans of ms-followup, version 2\nroles:\n  t1w:\n    keep_alike: balanced\n    kinds_in_order:\n${KINDS.t1w.map((k) => `      - ${k}`).join("\n")}\n`, { status: 200 }));
  if (path === "/api/picks/map") return json(200, body.columns === "dataset" ? datasetMapOf(String(body.role), body.rules !== undefined) : mapOf(String(body.role), body.rules !== undefined));
  if (path === "/api/picks/map/subjects") return json(200, subjectsOf(String(body.role), Number(body.page ?? 0), String(body.order), String(body.columns)));
  if (path === "/api/picks/map/strips") return json(200, stripsOf(String(body.role), String(body.columns)));
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
