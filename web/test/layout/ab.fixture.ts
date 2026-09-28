// SPDX-License-Identifier: AGPL-3.0-only
// An A/B campaign as the engine of record 48 (the reference read by judges)
// serves it, made up and shared by the layout check (a browser) and the A/B
// view's tests (jsdom): the reader's Phase 0 question and blind item, a
// campaign made by `nils campaign ab` over two raters and the rules, and an
// item's sheet where the voters split on technique and body part and agree
// on the rest. Nothing here is a real person or a real scan.

import type { Campaign } from "../../src/campaigns/client";
import { CAMPAIGN, CAMPAIGN_ID, claimed, HEADER_DOC, ITEM_ID, STACK_ID, WHY_BLIND, type Asked } from "./reader.fixture";

export const AB_CAMPAIGN = {
  ...CAMPAIGN,
  name: "cert-p0-clean-ab",
  source: {
    selection: "cert-p0-clean@1",
    handle: 12,
    ab: { voters: ["judge-27b", "judge-flash", "rules"], seed_sha256: "5d41402abc4b2a76b9719d911017c592", audit: { share: 0.1, cells: 150 }, localizers: "without", localizer: { axis: "provenance", value: "Localizer", asks: ["provenance", "body_part"] } },
  },
  counts: { items: { open: 248, agreed: 12 }, assignments: { leased: 1 }, answers: 12 },
} as unknown as Campaign;

/** One item's sheet: technique and body part split, the rest agreed, each candidate with the reason one voter gave. */
export const SHEET = {
  item: ITEM_ID,
  stack: STACK_ID,
  localizer: false,
  not_asked: "not_asked",
  localizer_rule: { axis: "provenance", value: "Localizer", asks: ["provenance", "body_part"] },
  causes: ["rule_bug", "convention_gap", "header_ambiguity", "rater_error", "reader_slip"],
  axes: [
    { axis: "provenance", asked: true, split: false, candidates: [{ label: "A", value: "RawRecon", reason: "ImageType ORIGINAL\\PRIMARY\\M\\ND: an acquisition's own images" }] },
    {
      axis: "technique",
      asked: true,
      split: true,
      candidates: [
        { label: "A", value: "IR-TSE", reason: "SequenceName *tir2d1rr99 with TI 2500 and an echo train of 16: an inversion-recovery turbo spin echo" },
        { label: "B", value: "TSE", reason: "ScanningSequence SE\\IR, SequenceVariant SK\\SP\\MP, echo train 16" },
      ],
    },
    { axis: "modifier", asked: true, split: false, candidates: [{ label: "A", value: ["FLAIR"], reason: "TI 2500 at 3 T nulls the fluid; SeriesDescription t2_flair_tra" }] },
    { axis: "construct", asked: true, split: false, candidates: [{ label: "A", value: [], reason: "ImageType names no derived map" }] },
    { axis: "base", asked: true, split: false, candidates: [{ label: "A", value: "T2w", reason: "TE 81 and TR 9000 with the fluid nulled" }] },
    {
      axis: "body_part",
      asked: true,
      split: true,
      candidates: [
        { label: "A", value: "brain-neck", reason: "BodyPartExamined HEAD, 30 slices of 5 mm reach 150 mm below the vertex" },
        { label: "B", value: "brain", reason: "BodyPartExamined HEAD; the protocol is the brain's" },
      ],
    },
    { axis: "post_contrast", asked: true, split: false, candidates: [{ label: "A", value: "not_given", reason: "the session's contrast series comes after it" }] },
  ],
};

/** A localizer's sheet: provenance and body part asked, the rest not. */
export const LOCALIZER_SHEET = {
  ...SHEET,
  localizer: true,
  axes: SHEET.axes.map((a) =>
    a.axis === "provenance"
      ? { ...a, candidates: [{ label: "A", value: "Localizer", reason: "three planes of three slices" }] }
      : a.axis === "body_part"
        ? { ...a, split: false, candidates: [{ label: "A", value: "brain", reason: "a head scout" }] }
        : { ...a, asked: false, split: false, candidates: [] },
  ),
};

export const SUMMARY = {
  campaign: CAMPAIGN_ID,
  items: 260,
  answered: 12,
  seconds: { median: 6.4, p90: 14.2 },
  split_choices: { A: 7, B: 6, neither: 1, cant_tell: 1 },
  split_by_axis: { technique: { letter: 8, neither: 1 }, body_part: { letter: 5, cant_tell: 1 } },
  choices: { A: 7, B: 6, confirm: 68, neither: 1, cant_tell: 1 },
  causes: { technique: { convention_gap: 3, rater_error: 1 } },
  causes_offered: ["rule_bug", "convention_gap", "header_ambiguity", "rater_error", "reader_slip"],
  seed_sha256: "5d41402abc4b2a76b9719d911017c592",
  sources: false,
};

/** The engine's doors for the A/B view, as a fetch. */
export function abEngine(opts: { localizer?: boolean; log?: Asked[] } = {}): typeof fetch {
  const { localizer = false, log = [] } = opts;
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  let answers = 0;
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, "http://desk.test");
    const path = url.pathname;
    const method = (init?.method ?? "GET").toUpperCase();
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : null;
    log.push({ method, path, body });
    const c = `/api/campaigns/${CAMPAIGN_ID}`;
    if (method === "GET" && path === c) return json(200, AB_CAMPAIGN);
    if (method === "GET" && path === "/api/campaigns") return json(200, { count: 1, campaigns: [AB_CAMPAIGN] });
    if (method === "POST" && path === `${c}/claim`) return json(200, claimed());
    if (method === "POST" && path.endsWith("/renew")) return json(200, claimed().assignment);
    if (method === "POST" && path.endsWith("/release")) return json(200, claimed().assignment);
    if (method === "POST" && path.startsWith(`${c}/assignments/`) && path.endsWith("/answer")) return json(200, { answer: 500 + ++answers, item: ITEM_ID, state: "agreed", adjudication: null });
    if (method === "POST" && /\/answers\/\d+\/cause$/u.test(path)) return json(200, { ...(body as object), answer: Number(path.split("/")[5]) });
    if (method === "GET" && path === `${c}/items/${ITEM_ID}/ab`) return json(200, localizer ? LOCALIZER_SHEET : SHEET);
    if (method === "GET" && path === `${c}/items/${ITEM_ID}/why`) return json(200, WHY_BLIND);
    if (method === "GET" && path === `${c}/items/${ITEM_ID}/header`) return json(200, HEADER_DOC);
    if (method === "GET" && path === `${c}/ab`) return json(200, SUMMARY);
    if (method === "GET" && path === `${c}/ab/decisions`) return json(200, { campaign: CAMPAIGN_ID, sources: false, count: 0, decisions: [] });
    if (method === "GET" && path === `${c}/answers`) return json(200, { campaign: CAMPAIGN_ID, count: 0, answers: [], blind: true });
    return json(404, { error: `no door ${method} ${path}` });
  };
}

export function abDoorsOf(): string[] {
  return [
    "GET /api/campaigns",
    "GET /api/campaigns/{id}",
    "GET /api/campaigns/{id}/answers",
    "POST /api/campaigns/{id}/claim",
    "POST /api/campaigns/{id}/assignments/{assignment}/answer",
    "POST /api/campaigns/{id}/assignments/{assignment}/release",
    "POST /api/campaigns/{id}/assignments/{assignment}/renew",
    "GET /api/campaigns/{id}/items/{item}/why",
    "GET /api/campaigns/{id}/items/{item}/header",
    "GET /api/campaigns/{id}/ab",
    "GET /api/campaigns/{id}/ab/decisions",
    "GET /api/campaigns/{id}/items/{item}/ab",
    "POST /api/campaigns/{id}/answers/{answer}/cause",
  ];
}
