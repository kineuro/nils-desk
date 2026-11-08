// SPDX-License-Identifier: AGPL-3.0-only
// Review's first page as production stood on 2026-11-08, in the shapes the
// engine answers: the summary's fourteen kinds, the two models' proposals
// (`GET /api/review/proposals`), the rules' questions gathered by axis, and
// six campaigns, two of them closed. Every count is taken from that day or
// made up around it; every name is made up.

import type { Json } from "../ask/client";
import type { Campaign } from "../campaigns/client";
import type { ReviewSummary } from "./client";
import { standingOf, type Standing } from "./modelFamily";
import { listOf, type QuestionList } from "./questions";

/** The person the fixtures are read as. */
export const ME = "carol@walk";

export const SUMMARY: ReviewSummary = {
  by_kind: {
    "release.shared_name": 948,
    "identity.same_instance": 208,
    "body_part:model": 59,
    "body_part:decision": 14,
    "classify.excluded": 12,
    "construct:session": 7,
    "base:missing": 7,
    "identity.unmapped": 6,
    "body_part:vote": 5,
    "classify.asked": 5,
    "ingest.quarantine": 4,
    "modifier:session": 4,
    "identity.collision": 3,
    "campaign.axis": 219,
  },
  cohorts: [],
  none: 0,
};

const standingRow = (over: Json): Json => ({
  model: { id: 7, name: "nils-postcontrast", version: "0.3.1", digest: "sha256:aa", state: "admitted" },
  label: "nils-postcontrast@0.3.1",
  axis: "post_contrast",
  threshold: 0.99,
  thresholds: [0.99],
  staged: { groups: 89, stacks: 50006 },
  held: { groups: 1, stacks: 12 },
  commit: { groups: 88, stacks: 1701 },
  drifted: 3,
  below: { groups: 4, stacks: 190 },
  asked: { groups: 0, stacks: 0 },
  campaigns: [],
  runs: [162],
  name: "nils-postcontrast-post_contrast-unsure",
  ...over,
});

/** The post-contrast model's proposals, and the body-part model's. */
export const STANDING_ROWS: Json[] = [
  standingRow({}),
  standingRow({
    model: { id: 5, name: "nils-bodypart", version: "1.2.0", digest: "sha256:bb", state: "admitted" },
    label: "nils-bodypart@1.2.0",
    axis: "body_part",
    threshold: 0.9,
    thresholds: [0.9],
    staged: { groups: 3, stacks: 59 },
    held: { groups: 0, stacks: 0 },
    commit: { groups: 3, stacks: 59 },
    drifted: 0,
    below: { groups: 0, stacks: 0 },
    name: "nils-bodypart-body_part-unsure",
  }),
];

export const STANDINGS: Standing[] = STANDING_ROWS.map(standingOf).filter((s): s is Standing => s !== null);

/** The rules' questions, gathered: body part asked three ways, post-contrast once, base twice. */
export const QUESTIONS_RAW: Json = {
  scope: { kind: "registry", name: null, id: null },
  scans: 44,
  questions: [
    { key: "body_part:decision", axis: "body_part", shape: "doubt", values: ["brain"], words: "brain?", reason: "A decision disagrees with the rules.", scans: 14, staged: 0, kinds: { "body_part:decision": 14 } },
    { key: "body_part:vote", axis: "body_part", shape: "pair", values: ["spine", "neck"], words: "spine or neck?", reason: "The rules disagree.", scans: 5, staged: 0, kinds: { "body_part:vote": 5 } },
    { key: "body_part:missing", axis: "body_part", shape: "missing", values: ["brain", "spine"], words: "Which body part?", reason: "The rules found no body part.", scans: 1, staged: 0, kinds: { "body_part:missing": 1 } },
    { key: "post_contrast:missing", axis: "post_contrast", shape: "missing", values: ["given", "none"], words: "Which post-contrast?", reason: "The rules found no answer.", scans: 3, staged: 0, kinds: { "post_contrast:missing": 3 } },
    { key: "base:PDw|T2w", axis: "base", shape: "pair", values: ["T2w", "PDw"], words: "T2w or PDw?", reason: "The rules and System 1 disagree.", scans: 12, staged: 0, kinds: { "base:disagree": 12 } },
    { key: "base:missing", axis: "base", shape: "missing", values: ["T1w", "T2w"], words: "Which base?", reason: "The rules found no base.", scans: 7, staged: 1, kinds: { "base:missing": 7 } },
  ],
  vocabularies: {},
  elsewhere: [],
  held: { scans: 219, campaigns: [{ id: 11, name: "body-part-curation-round-9" }] },
};

export const QUESTIONS: QuestionList = listOf(QUESTIONS_RAW);

const counts = (open: number, agreed = 0, adj = 0) => ({ items: { open, agreed, needs_adjudication: adj }, assignments: {}, answers: agreed * 2 });

function campaign(id: number, name: string, question: Record<string, unknown>, c: ReturnType<typeof counts>, more: Record<string, unknown> = {}): Campaign {
  return {
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
  } as unknown as Campaign;
}

/** Six campaigns, two closed: one the person adjudicates, their own pair campaign, a check, an A/B audit, and two closed. */
export const CAMPAIGNS: Campaign[] = [
  campaign(11, "body-part-curation-round-9", { kind: "axis", axis: "body_part", values: ["brain", "spine", "neck", "brain-neck"] }, counts(212, 88, 3), { rater_policy: { raters: [], adjudicators: [ME] } }),
  campaign(14, "samseg-lesions-check", { kind: "check", part_set: "lesions", reasons: ["missed", "over", "under"] }, counts(336, 20, 0)),
  campaign(15, "post-contrast-pairs-r3", { kind: "pair", axis: "post_contrast" }, counts(120, 0, 0), { owner: ME, rater_policy: { raters: [ME], adjudicators: [] }, raters_per_item: 1 }),
  campaign(16, "reference-ab-cert3", { kind: "axes", axes: ["base", "technique", "modifier"] }, counts(54, 0, 0), { source: { ab: { voters: ["rules", "judge"] } }, raters_per_item: 1, purpose: "audit" }),
  campaign(9, "probe-axis", { kind: "axis", axis: "base" }, counts(0, 6, 0), { status: "closed", closed_at: "2026-10-01T09:00:00Z" }),
  campaign(8, "body-part-curation-round-8", { kind: "axis", axis: "body_part" }, counts(0, 300, 0), { status: "closed", closed_at: "2026-10-20T09:00:00Z" }),
];
