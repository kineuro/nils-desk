// SPDX-License-Identifier: AGPL-3.0-only
// A check (job type 3, record 55 H3) as the engine of slice E2 serves it,
// made up from its OpenAPI shapes and shared by the layout check (a browser)
// and the check's tests (jsdom): the campaign, the claim with the items
// ahead (their stacks only, as E2's claim names them), the item door with a
// result, its lesions and one to eight panels, the stats with the counts by
// verdict and reason, one's own answers kept and corrected as the mine and
// amend doors do, the preview and the make door of New check, and a run of
// samseg-lesions with its masks. A check of structures (a label map's parts,
// each by its name), a second rater, and a check read by two with its
// answers, outcomes and the parts door that names them, for the campaign's
// page. Nothing here is a real person or a scan.

import type { Campaign, Claimed } from "../../src/campaigns/client";
import { CAMPAIGN_ID, type Asked } from "./reader.fixture";

export const CHECK_ITEM = 7301;
export const RESULT_ID = 9001;
export const RUN_ID = 77;
/** The made-on scan of item n, and the scans beside it: 9100 + 10 n + panel. */
export const stackOf = (item: number, panel: number) => 9100 + 10 * (item - CHECK_ITEM) + panel;
/** Another scan of the visit in the same frame, for "+ scan". */
export const MORE_STACK = 9199;

export const REASONS = [
  { id: "under", words: "Under-segmented", needs: "none" },
  { id: "over", words: "Over-segmented", needs: "none" },
  { id: "under_over", words: "Under and over", needs: "none" },
  { id: "joined", words: "Two or more joined", needs: "none" },
  { id: "not_lesion", words: "Not a lesion", needs: "none" },
  { id: "missed", words: "Missed lesion", needs: "point" },
  { id: "other", words: "Other", needs: "note" },
];

export interface CheckOpts {
  /** Panels per item, the made-on scan included: 1 to 8. */
  panels?: number;
  grain?: "result" | "part";
  /** Items in the campaign (claimed in turn). */
  items?: number;
  status?: "open" | "closed";
  /** Items still open, for the campaign page. */
  open?: number;
  log?: Asked[];
  kept?: KeptCheck[];
  /** Another rater, other@site, who read the first n items already: each item then wants two raters, as in a check read by two. */
  others?: number;
  /** The part set: each lesion (the default), or each structure of a label map, by its name. */
  set?: "lesions" | "structures";
  /** Every item read by rater@site and other@site, each answer on the campaign's answers door and each item's outcome on the campaign. */
  read?: boolean;
}

/** The lesions of the result, bottom to top: a box of voxel corners and the voxel nearest the centre, mm LPS. */
export const LESIONS = [
  { label: 1, voxels: 212, volume_mm3: 210.4, anchor_mm: [-20.5, 11, 30], box_mm: [[-24, 8, 27], [-17, 15, 33]], position: 0 },
  { label: 2, voxels: 8, volume_mm3: 7.9, anchor_mm: [12, -30, 38], box_mm: [[11, -31, 37], [13, -29, 39]], position: 1 },
  { label: 3, voxels: 1, volume_mm3: 1, anchor_mm: [30, 20, 41], box_mm: [[29.5, 19.5, 40.5], [30.5, 20.5, 41.5]], position: 2 },
  { label: 4, voxels: 1830, volume_mm3: 1828.5, anchor_mm: [-5, 40, 52], box_mm: [[-16, 31, 46], [6, 50, 60]], position: 3 },
].map((p) => ({ ...p, name: null, method: "26-connected", check: null, check_reason: null }));

/** The structures of a label map, by value and name, bottom to top: the long names a parts list must keep apart. */
export const STRUCTURES = [
  [16, "Brain-Stem", 21000],
  [17, "Left-Hippocampus", 4100],
  [53, "Right-Hippocampus", 4300],
  [4, "Left-Lateral-Ventricle", 7900],
  [43, "Right-Lateral-Ventricle", 8200],
  [2, "Left-Cerebral-White-Matter", 225000],
  [41, "Right-Cerebral-White-Matter", 228000],
  [24, "CSF", 1200],
].map(([label, name, mm3], i) => ({ label: label as number, name: name as string, voxels: mm3 as number, volume_mm3: mm3 as number, anchor_mm: [(i % 2 ? 1 : -1) * 20, 10, 10 + 6 * i], box_mm: [[-40, -20, 5 + 6 * i], [40, 30, 15 + 6 * i]], position: i, method: "label", check: null, check_reason: null }));

export const STRUCTURE_REASONS = [
  { id: "boundary_off", words: "Boundary off", needs: "none" },
  { id: "wrong_label", words: "Wrong label", needs: "none" },
  { id: "part_missing", words: "Part missing", needs: "none" },
  { id: "extra_part", words: "Extra part", needs: "none" },
  { id: "other", words: "Other", needs: "note" },
];

const setOf = (o: CheckOpts) => (o.set === "structures" ? { key: "structures", words: "Structures", kind: "labels", parts: STRUCTURES, reasons: STRUCTURE_REASONS } : { key: "lesions", words: "Lesions", kind: "components", parts: LESIONS, reasons: REASONS });

/**
 * Two raters' answers to every item of a read check, as the answers door
 * lists them: item 1 both accept; item 2 both flag a structure's boundary
 * and the first flags a second; item 3 one rejects and one accepts, so it
 * waits for an adjudicator; the rest both accept, the second with a note.
 */
export function checkAnswers(o: CheckOpts = {}): Record<string, unknown>[] {
  const n = o.items ?? 3;
  const [a, b] = o.set === "structures" ? [17, 53] : [1, 2];
  const reason = o.set === "structures" ? "boundary_off" : "under";
  const form = (parts: { label: number; reason: string }[] = [], reasons: string[] = []) => ({ reasons, parts, points: [], seen: parts.map((p) => p.label), shown: [] });
  const out: Record<string, unknown>[] = [];
  for (let i = 0; i < n; i++) {
    const item = CHECK_ITEM + i;
    const pair: [string, string, unknown, string | null][] =
      i === 1
        ? [["flagged", "rater@site", form([{ label: a, reason }, { label: b, reason }]), null], ["flagged", "other@site", form([{ label: a, reason }]), null]]
        : i === 2
          ? [["rejected", "rater@site", form(), null], ["accepted", "other@site", form(), null]]
          : [["accepted", "rater@site", form(), null], ["accepted", "other@site", form(), i === 0 ? null : "fine at the edges"]];
    pair.forEach(([value, principal, f, why], k) => out.push({ id: 900 + 2 * i + k, item_id: item, assignment_id: 600 + 2 * i + k, principal, role: "rater", round: 1, author_kind: "person", value, form: f, derivative_id: null, why, answered_at: "2026-10-11T09:00:00Z", seconds: 5.1, via: "claim" }));
  }
  return out;
}

const ROLES = ["made_on", "t1w", "flair", "t2w", "swi", "dwi", "pd", "t1w_post"];
const WORDS: Record<string, string> = { made_on: "FLAIR", t1w: "T1w", flair: "FLAIR", t2w: "T2w", swi: "SWI", dwi: "DWI", pd: "PD", t1w_post: "T1w post" };

export function checkCampaign(o: CheckOpts = {}): Campaign {
  const n = o.items ?? 3;
  const set = setOf(o);
  const answers = o.read ? checkAnswers(o) : [];
  // a read check: each item agreed on its outcome (resolved, with its decisions, once closed), but the one the raters split on
  const outcomeOf = (item: number, i: number) => {
    const two = answers.filter((x) => x.item_id === item);
    if (two.length < 2 || two[0].value !== two[1].value) return null;
    const parts = [...new Map(two.flatMap((x) => (x.form as { parts: { label: number; reason: string }[] }).parts).map((p) => [`${p.label}/${p.reason}`, p])).values()];
    return { value: two[0].value, form: { reasons: [], parts, points: [], seen: parts.map((p) => p.label), shown: [] }, answers: two.map((x) => x.id), ...(o.status === "closed" ? { decisions: { result: 3000 + i, parts: Object.fromEntries(parts.map((p, k) => [String(p.label), 3100 + 10 * i + k])) } } : {}) };
  };
  const items = Array.from({ length: n }, (_, i) => {
    const outcome = o.read ? outcomeOf(CHECK_ITEM + i, i) : null;
    const state = !o.read ? "open" : outcome === null ? "needs_adjudication" : o.status === "closed" ? "resolved" : "agreed";
    return { id: CHECK_ITEM + i, campaign_id: CAMPAIGN_ID, position: 11 + i, review_item_id: 400 + i, stack_id: null, subject_id: null, session_day: null, key: `result:${RESULT_ID + i}`, input_derivative_ids: null, derivative_id: RESULT_ID + i, part_set: set.key, part_label: o.grain === "part" ? 1 + (i % 4) : null, state, round: 1, agreement: null, metric: null, outcome, decision_id: outcome && o.status === "closed" ? 3000 + i : null, pick_id: null, resolved_at: null };
  });
  return {
    id: CAMPAIGN_ID,
    name: o.set === "structures" ? "SAMSEG structures, run 77" : "SAMSEG lesions, run 77",
    owner: "rater@site",
    status: o.status ?? "open",
    question: { kind: "check", part_set: set.key, grain: o.grain ?? "result", reasons: set.reasons } as never,
    grain: o.grain ?? "result",
    source: { run: RUN_ID, output: "labels", which: "unchecked" },
    handle_id: null,
    raters_per_item: o.others === undefined && !o.read ? 1 : 2,
    rater_policy: { raters: o.others === undefined && !o.read ? ["rater@site"] : ["rater@site", "other@site"], adjudicators: [] },
    adjudication: { when: "disagree", metric: "exact", threshold: null },
    closes_into: "check",
    lease_seconds: 900,
    created_at: "2026-10-11T08:00:00Z",
    closed_at: null,
    closed_by: null,
    agreement: null,
    suggest: "none",
    counts: o.read ? { items: Object.fromEntries([...new Set(items.map((i) => i.state))].map((st) => [st, items.filter((i) => i.state === st).length])), assignments: {}, answers: answers.length } : { items: { open: o.open ?? 340, agreed: 0 }, assignments: { leased: 1 }, answers: 0 },
    items,
    assignments: [],
  } as unknown as Campaign;
}

/** One item's door: the result, the set, the panels (the made-on scan first), the lesions inline, the reasons. */
export function checkSheet(item: number, o: CheckOpts = {}, mine: unknown = null): Record<string, unknown> {
  const panels = Math.min(8, Math.max(1, o.panels ?? 3));
  const i = item - CHECK_ITEM;
  const set = setOf(o);
  const part = o.grain === "part" ? set.parts[i % set.parts.length] : null;
  return {
    item,
    position: 12 + i,
    of: 340,
    state: "open",
    result: { id: RESULT_ID + i, pipeline: "samseg-lesions", version: "1", output: "labels", run: RUN_ID, sha256: "a3f1c2d4e5b6a7980112233445566778899aabbccddeeff00112233445566778", check: null },
    set: { key: set.key, words: set.words, kind: set.kind, grain: o.grain ?? "result", count: set.parts.length, note: null },
    part,
    panels: Array.from({ length: panels }, (_, p) => ({ panel: p, stack: stackOf(item, p), shows: WORDS[ROLES[p]], role: ROLES[p], made_on: p === 0, link: p === 0 ? "same" : "world", layer: "ready" })),
    more: [{ stack: MORE_STACK, shows: "T2w" }],
    parts: set.parts,
    reasons: set.reasons,
    verdicts: ["accepted", "rejected", "flagged"],
    mine,
    warming: null,
  };
}

/** One answer the fake engine keeps, as the mine door lists it. */
export interface KeptCheck {
  answer: number;
  item: number;
  position: number;
  value: string;
  form: unknown;
  why: string | null;
  via: "claim" | "amend";
  supersedes: number | null;
  superseded_by: number | null;
}

/** The claim of item `at`, with the items after it ahead (their stacks, no layer: E2's claim names none). */
export function checkClaimed(at: number, o: CheckOpts = {}, now = Date.now()): Claimed & { ahead: unknown[] } {
  const c = checkCampaign(o) as unknown as { items: NonNullable<Claimed["item"]>[] };
  const item = c.items[at];
  const panels = Math.min(8, Math.max(1, o.panels ?? 3));
  return {
    assignment: { id: 500 + at, campaign_id: CAMPAIGN_ID, item_id: item.id, principal: "rater@site", role: "rater", round: 1, state: "leased", created_at: new Date(now).toISOString(), leased_at: new Date(now).toISOString(), lease_until: new Date(now + 900_000).toISOString(), ended_at: null },
    item,
    held: false,
    ahead: c.items.slice(at + 1, at + 6).map((x) => ({ item: x.id, position: x.position, stacks: Array.from({ length: panels }, (_, p) => stackOf(x.id, p)) })),
  } as unknown as Claimed & { ahead: unknown[] };
}

/** What the preview door answers for a body: made-up counts that follow the body's source and panels. */
export function checkPreview(body: Record<string, unknown>): Record<string, unknown> {
  const source = (body.source ?? {}) as Record<string, unknown>;
  const panels = Array.isArray(body.panels) ? body.panels.length : 3;
  const which = source.which;
  const named = 340;
  const checked = 2;
  const taken = which === "breached" ? 6 : which === "unchecked" ? named - checked : named;
  const drawable = typeof source.sample === "number" ? Math.min(source.sample, taken - 2) : taken - 2;
  const q = (body.question ?? {}) as Record<string, unknown>;
  const parts = drawable * 6 + 112;
  return {
    results: named,
    items: q.grain === "part" ? parts : drawable,
    parts,
    drawable,
    not_drawable: [{ why: "no scan is known whose grid it is on", count: 2 }],
    checked_already: checked,
    held: 0,
    parts_pending: 0,
    parts_jobs: [],
    panels_missing: panels > 2 ? { flair: 4 } : {},
    panels_other_frame: {},
    panels: { roles: ["made_on", ...(Array.isArray(body.panels) ? (body.panels as string[]).filter((r) => r !== "made_on") : [])], most: panels, fewest: panels > 2 ? panels - 1 : panels },
    pictures_to_build: 12,
    layers_to_build: 40,
    layers_asked: drawable * panels,
    place: "working",
    grain: q.grain ?? "result",
    part_set: q.part_set ?? "lesions",
    seconds: 0.21,
  };
}

/** The catalog's samseg-lesions, its labels output a mask read as lesions and as structures. */
export const SAMSEG = {
  id: 12,
  name: "samseg-lesions",
  version: "1",
  label: "SAMSEG",
  image: "ghcr.io/example/samseg@sha256:0",
  layout: "bids",
  level: "session",
  state: "active",
  outputs: [
    { id: "labels", kind: "mask", parts: [{ key: "lesions", words: "Lesions", kind: "components", labels: [99] }, { key: "structures", words: "Structures", kind: "labels" }] },
    { id: "volumes", kind: "table" },
  ],
};

export const RUN = { id: RUN_ID, pipeline_id: 12, pipeline: "samseg-lesions", job_id: 300, status: "done", started_at: "2026-10-11T07:00:00Z", finished_at: "2026-10-11T07:40:00Z", derivatives: [RESULT_ID, RESULT_ID + 1, RESULT_ID + 2], summary: {}, units_run: [] };

/**
 * The engine's doors for a check, as a fetch. The claim hands the first item
 * not yet answered; an answer is kept with its form and listed by the mine
 * door; the item door gives one's own answer back (`mine`); amend keeps the
 * earlier one; preview and make answer New check; the run, the catalog and
 * the run's masks answer the run page. `log` holds every call.
 */
export function checkEngine(o: CheckOpts = {}): typeof fetch {
  const { log = [], kept = [] } = o;
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const campaign = checkCampaign(o);
  const items = (campaign as unknown as { items: { id: number; position: number }[] }).items;
  let next = 800;
  /** The item the caller holds a lease on, from the claim until it is answered or given back. */
  let leased: number | null = null;
  const standing = () => kept.filter((k) => k.superseded_by === null).sort((a, b) => b.answer - a.answer);
  // the campaign's assignments now: the other rater's answers, the caller's, and the caller's lease
  const assignment = (id: number, item: number, principal: string, state: string) => ({ id, campaign_id: CAMPAIGN_ID, item_id: item, principal, role: "rater", round: 1, state, created_at: "2026-10-11T08:30:00Z", leased_at: "2026-10-11T08:30:00Z", lease_until: null, ended_at: null });
  const assignments = () => [
    ...items.slice(0, o.others ?? 0).map((i, n) => assignment(600 + n, i.id, "other@site", "submitted")),
    ...[...new Set(kept.map((k) => k.item))].map((item, n) => assignment(700 + n, item, "rater@site", "submitted")),
    ...(leased !== null && !kept.some((k) => k.item === leased) ? [assignment(500, leased, "rater@site", "leased")] : []),
  ];
  const ownRow = () => {
    const mine = standing();
    const verdicts = Object.fromEntries(["accepted", "rejected", "flagged"].map((v) => [v, mine.filter((k) => k.value === v).length]));
    return { principal: "rater@site", answers: mine.length, median_seconds: mine.length > 0 ? 4.2 : null, verdicts, reasons: {} };
  };
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, "http://desk.test");
    const path = url.pathname;
    const method = (init?.method ?? "GET").toUpperCase();
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    log.push({ method, path: path + url.search, body });
    const c = `/api/campaigns/${CAMPAIGN_ID}`;
    const open = items.findIndex((i) => !kept.some((k) => k.item === i.id));
    if (method === "GET" && path === c) return json(200, { ...campaign, assignments: assignments() });
    if (method === "GET" && path === "/api/campaigns") return json(200, { count: 1, campaigns: [campaign] });
    if (method === "POST" && path === `${c}/claim`) {
      leased = open < 0 ? null : items[open].id;
      return json(200, open < 0 ? { assignment: null, item: null, why: "every item is answered" } : checkClaimed(open, o));
    }
    if (method === "POST" && path.endsWith("/release")) leased = null;
    if (method === "POST" && (path.endsWith("/renew") || path.endsWith("/release"))) return json(200, checkClaimed(Math.max(0, open), o).assignment);
    if (method === "POST" && path.startsWith(`${c}/assignments/`) && path.endsWith("/answer")) {
      const it = items[Math.max(0, open)];
      const k: KeptCheck = { answer: ++next, item: it.id, position: it.position, value: String(body?.value), form: body?.form ?? null, why: typeof body?.why === "string" ? body.why : null, via: "claim", supersedes: null, superseded_by: null };
      kept.push(k);
      leased = null;
      return json(200, { answer: k.answer, item: it.id, state: "agreed", adjudication: null });
    }
    if (method === "GET" && path === `${c}/mine`) {
      const list = standing();
      return json(200, { campaign: CAMPAIGN_ID, principal: "rater@site", open: true, count: list.length, total: list.length, values: {}, answers: list.map((k) => ({ answer: k.answer, item: k.item, stack: null, position: k.position, value: k.value, answered_at: "2026-10-11T09:00:00Z", via: k.via, unsure: false, supersedes: k.supersedes, role: "rater", round: 1, thumb: null, sealed: false })) });
    }
    const amend = /\/answers\/(\d+)\/amend$/u.exec(path);
    if (method === "POST" && amend) {
      const was = kept.find((k) => k.answer === Number(amend[1]));
      if (!was) return json(404, { error: `no answer ${amend[1]}` });
      const k: KeptCheck = { answer: ++next, item: was.item, position: was.position, value: String(body?.value), form: body?.form ?? null, why: typeof body?.why === "string" ? body.why : null, via: "amend", supersedes: was.answer, superseded_by: null };
      was.superseded_by = k.answer;
      kept.push(k);
      return json(200, { answer: k.answer, supersedes: was.answer, item: was.item, state: "agreed", adjudication: null, unchanged: false });
    }
    const sheet = /\/items\/(\d+)\/check$/u.exec(path);
    if (method === "GET" && sheet) {
      const item = Number(sheet[1]);
      if (!items.some((i) => i.id === item)) return json(404, { error: `no campaign item ${item}` });
      const mine = standing().find((k) => k.item === item);
      return json(200, checkSheet(item, o, mine ? { answer: mine.answer, value: mine.value, form: mine.form, why: mine.why, seconds: 4.2, round: 1 } : null));
    }
    if (method === "GET" && path === `${c}/stats`) return json(200, { campaign: CAMPAIGN_ID, all: { answers: 38, median_seconds: 6.4, verdicts: { accepted: 30, rejected: 1, flagged: 7 }, reasons: { under: 3, not_lesion: 4, missed: 2 } }, raters: [ownRow(), ...(o.others ? [{ principal: "other@site", answers: o.others, median_seconds: 5.2, verdicts: { accepted: o.others }, reasons: {} }] : [])] });
    if (method === "GET" && path === `${c}/answers`) {
      const list = o.read ? checkAnswers(o) : [];
      return json(200, { campaign: CAMPAIGN_ID, count: list.length, answers: list, blind: false });
    }
    const parts = /^\/api\/derivatives\/(\d+)\/parts$/u.exec(path);
    if (method === "GET" && parts) {
      const set = setOf(o);
      return json(200, { derivative: Number(parts[1]), set: set.key, words: set.words, kind: set.kind, count: set.parts.length, page: 0, per_page: 500, order: "position", parts: set.parts });
    }
    if (method === "GET" && path === "/api/label-sets") return json(200, { label_sets: [] });
    if (method === "POST" && path === "/api/campaigns/preview") {
      const q = (body?.question ?? {}) as Record<string, unknown>;
      if (Array.isArray(q.reasons) && q.reasons.length === 0) return json(400, { error: "question.reasons: one to 7 reasons, the keys 3 to 9; 0 given" });
      return json(200, checkPreview(body ?? {}));
    }
    if (method === "POST" && path === "/api/campaigns") return json(201, { ...campaign, id: 52, name: body?.name, raters_per_item: body?.raters_per_item ?? 1, rater_policy: { raters: Array.isArray(body?.raters) ? body.raters : [], adjudicators: [] }, pictures: { stacks: 900, have: 880, missing: 20, place: "working", job: 41 }, layers: { pairs: 1000, missing: 40, have: 960, job: 41 } });
    if (method === "GET" && path === `/api/pipeline-runs/${RUN_ID}`) return json(200, RUN);
    if (method === "GET" && path === "/api/pipeline-runs") return json(200, { runs: [RUN, { ...RUN, id: 76, status: "done", derivatives: [], pipeline: "mriqc", pipeline_id: 3 }] });
    if (method === "GET" && path === "/api/pipelines") return json(200, { pipelines: [SAMSEG], capability: null });
    if (method === "GET" && path === `/api/jobs/300`) return json(200, { id: 300, state: "done", started_at: "2026-10-11T07:00:00Z" });
    if (method === "GET" && path === "/api/derivatives") {
      const rows = [0, 1, 2].map((i) => ({ id: RESULT_ID + i, kind: "mask", scope: "session", bytes: 120_000 + i, sha256: `ab${i}`.padEnd(64, "0"), check: i === 0 ? "accepted" : null, grid_link: "same" }));
      const wanted = url.searchParams.get("check") === "unchecked" ? rows.filter((r) => r.check === null) : rows;
      return json(200, { derivatives: wanted, capability: null });
    }
    if (method === "GET" && path === "/desk/people") {
      const people = [
        { subject: "adithya", display: "Adithya", holds: true },
        { subject: "bo", display: "Bo", holds: false },
      ];
      return json(200, { people: url.searchParams.get("holding") === "campaigns:work" ? people : people.map(({ subject, display }) => ({ subject, display })) });
    }
    if (method === "GET" && path.startsWith("/api/packs/")) return json(200, { pack: "mri", version: "0.13.0", contract: 6, axes: [], picks: [{ roles: ["t1w", "flair", "t2w", "swi"] }] });
    return json(404, { error: `no door ${method} ${path}` });
  };
}

export function checkDoorsOf(): string[] {
  return [
    "GET /api/campaigns",
    "GET /api/campaigns/{id}",
    "GET /api/campaigns/{id}/answers",
    "POST /api/campaigns",
    "POST /api/campaigns/preview",
    "POST /api/campaigns/{id}/claim",
    "POST /api/campaigns/{id}/close",
    "POST /api/campaigns/{id}/export",
    "POST /api/campaigns/{id}/assignments/{assignment}/answer",
    "POST /api/campaigns/{id}/assignments/{assignment}/release",
    "POST /api/campaigns/{id}/assignments/{assignment}/renew",
    "GET /api/campaigns/{id}/items/{item}/check",
    "GET /api/campaigns/{id}/stats",
    "GET /api/campaigns/{id}/mine",
    "POST /api/campaigns/{id}/answers/{answer}/amend",
    "GET /api/derivatives",
    "GET /api/derivatives/{id}/parts",
    "GET /api/derivatives/{id}/layers/{stack}/{set}/manifest",
    "GET /api/pipelines",
    "GET /api/pipeline-runs",
    "GET /api/pipeline-runs/{id}",
    "GET /api/label-sets",
  ];
}

/** The capabilities' campaigns block as E2 serves it, presets and all. */
export const CHECK_CAMPAIGNS_CAPS = {
  questions: ["axis", "axes", "pick", "form", "derivative", "free", "pair", "anchored", "check"],
  closes_into: ["decision", "stage", "pick", "check", "none"],
  check: { grains: ["result", "part"], verdicts: ["accepted", "rejected", "flagged"], reasons_max: 7, panels_max: 8, panels_default: ["made_on", "t1w", "flair"], presets: { components: REASONS, labels: [{ id: "boundary_off", words: "Boundary off", needs: "none" }, { id: "wrong_label", words: "Wrong label", needs: "none" }, { id: "other", words: "Other", needs: "note" }], whole: [{ id: "partly_wrong", words: "Partly wrong", needs: "none" }] } },
};
