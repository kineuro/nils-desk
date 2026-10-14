// SPDX-License-Identifier: AGPL-3.0-only
// System 1 in the review rule (Wave 7a, record 55 D3, D6, D7; spec 11):
// both suggestions and both reasons beside a question, blind first where a
// read trains or measures, the rounds of a rules version and a System 1
// version with what each accepted and sent to Review, the blind audit of
// what was accepted, the damaged-header flag of a dataset, and the site's
// share of blind-first questions. Each call is one engine door; the pure
// parts here are what the screens draw from.

import { door, type Json } from "../ask/client";
import type { ReviewItem } from "../ops/client";

/** A question's mode: both suggestions at once, or the person's own answer first. */
export type Mode = "routine" | "blind_first";

/** What System 1's model is now: confirmed by a recorded certificate, not yet, or none chosen. */
export type S1Status = "confirmed" | "not_confirmed" | "no_model";

export interface RulesReason {
  axis: string;
  value: string | string[] | null;
  set_by?: Json | null;
  decided?: {
    rule_set?: string;
    rule?: string;
    clause?: number | null;
    tier?: string;
    basis?: string;
    reads?: { fields?: string[] } | null;
    header?: Record<string, unknown>;
    matched?: string | null;
  } | null;
  voted?: { rule: string; value: string | null }[];
  line?: string;
}

export interface Similar {
  stack_id: number;
  value: string | null;
  series_description: string | null;
  alike_by: string;
}

export interface S1Opinion {
  axis?: string;
  value: string | null;
  p: number;
  reliability: number | null;
  fields: { field: string; effect: number }[] | null;
  similar?: Similar[];
  agrees?: boolean;
  model?: { id: number; name: string; version: string } | null;
}

export interface Suggestions {
  item: number;
  kind: string;
  mode: Mode;
  provisional: { answer: Json; seconds: number | null } | null;
  system1: { status: S1Status; why: string; model: { id: number; name: string; version: string } | null; certificate_id: number | null };
  stacks: { stack_id: number; header?: Json; axes: { axis: string; rules: RulesReason; system1: S1Opinion | null }[] }[];
  total_stacks: number;
  sealed_left_out: number;
}

/** A blind-first item as the queue serves it before the person's own answer. */
export interface Blinded {
  blind_first: true;
  axes: string[];
}

export interface DrawGrade {
  read: number;
  wrong: number;
  error: number | null;
  bound: number;
  confidence: number;
  wrong_by_axis: Record<string, number>;
  not_settled: number;
  cant_tell: number;
}

export interface Draw {
  id: number;
  round_id: number;
  seed: string;
  share: number;
  frame: { stacks: number; digest: string };
  drawn: number;
  campaign_id: number | null;
  created_by: string;
  created_at: string;
  grade: DrawGrade | null;
  graded_at: string | null;
}

export interface Round {
  id: number;
  rules: string;
  model_id: number | null;
  gate: Record<string, { lambda1: number; lambda2: number }>;
  confirmed: boolean;
  started_at?: string;
}

export interface RoundReport {
  round: Round;
  scans: number;
  accepted: number;
  reviewed: number;
  gate_held: number;
  shares: { accepted: number | null; review: number | null };
  review_by_kind: Record<string, number>;
  waiting_by_kind: Record<string, number>;
  never_asked: { conflict: number; low_confidence: number; body_part: number; post_contrast: number };
  gate: { outcomes: Record<string, number>; accepted_stacks: number };
  system1: { model_id: number | null; scans_with_opinion: number; coverage: number | null; confirmed: boolean };
  answers: Partial<Record<"blind" | "not_blind" | "unmarked", { decisions: number; mean_seconds: number | null }>>;
  audits: Draw[];
}

export interface Rounds {
  current: { pack: string | null; pack_version: string | null; model: { id: number; name: string; version: string } | null; confirmed: boolean };
  rounds: RoundReport[];
}

export interface HeadersFlag {
  dataset: string;
  damaged: boolean;
  by: "person" | "signs";
  flag: { damaged: boolean; why: string | null; by: string; at: string } | null;
  signs: { scans: number; no_names: number; share: number; damaged: boolean; rule?: string };
  gate: string;
}

export interface ReviewSettings {
  blind_share: number;
  default_blind_share: number;
  system1: { task: string; chosen: Json | null; confirmed: boolean; certificate_id: number | null };
  audit_share: number;
}

const enc = encodeURIComponent;

export const s1 = {
  suggestions: (item: number, member?: number) => door<Suggestions>("GET", `/api/review/${item}/suggestions${member ? `?member=${member}` : ""}`),
  provisional: (item: number, answer: Json) => door<{ item: number; mode: Mode; answer: Json; seconds: number | null }>("POST", `/api/review/${item}/provisional`, answer),
  rounds: () => door<Rounds>("GET", "/api/review/rounds"),
  /** The review settings, from the site settings door, which needs no review grant (a database admin reads them). */
  settings: () => door<{ review?: ReviewSettings }>("GET", "/api/settings").then((d) => {
    if (!d.review) throw new Error("this engine's settings carry no review settings");
    return d.review;
  }),
  setShare: (share: number) => door<Json>("PUT", "/api/settings", { review: { blind_share: share } }),
  headers: (dataset: string) => door<HeadersFlag>("GET", `/api/datasets/${enc(dataset)}/headers`),
  setHeaders: (dataset: string, damaged: boolean | null, why?: string) => door<HeadersFlag>("PUT", `/api/datasets/${enc(dataset)}/headers`, { damaged, ...(why ? { why } : {}) }),
  draw: (body: { round?: number; seed?: string; share?: number; raters?: string[]; adjudicators?: string[]; raters_per_item?: number }) =>
    door<{ draw: Draw; round: Round; campaign: { id: number; name: string } }>("POST", "/api/audit/draws", body),
  draws: (round?: number) => door<{ draws: Draw[] }>("GET", `/api/audit/draws${round ? `?round=${round}` : ""}`),
  grade: (id: number) => door<{ draw: number; grade: DrawGrade }>("POST", `/api/audit/draws/${id}/grade`, {}),
};

/** An item's mode, routine where an engine before it says none. */
export function modeOf(item: Pick<ReviewItem, "mode">): Mode {
  return item.mode === "blind_first" ? "blind_first" : "routine";
}

/** Whether the person still owes a blind-first item their own answer: the engine hides NILS's answers until then. */
export function owesBlind(item: Pick<ReviewItem, "mode" | "provisional">): boolean {
  return modeOf(item) === "blind_first" && !item.provisional;
}

/** A share as a percent, one decimal under ten. */
export function pct(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "none";
  const p = v * 100;
  return `${p < 10 && p !== 0 ? p.toFixed(1) : Math.round(p)} %`;
}

/** A probability as two decimals. */
export const prob = (v: number | null | undefined): string => (v === null || v === undefined ? "none" : v.toFixed(2));

/** A value as a reader is shown it: words joined, or "no value". */
export function valueWords(v: string | string[] | null | undefined): string {
  if (v === null || v === undefined || v === "") return "no value";
  return Array.isArray(v) ? (v.length ? v.join(", ") : "no value") : v.split(",").join(", ");
}

/** The words of System 1's standing beside a question. */
export function s1Words(status: S1Status): string {
  return status === "confirmed" ? "System 1" : status === "not_confirmed" ? "System 1, not confirmed" : "System 1: no model";
}

/** The fields a rule read, with their values, as one short line. */
export function readWords(r: RulesReason): string {
  const h = r.decided?.header ?? {};
  const parts = Object.entries(h)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([f, v]) => `${f.replace(/^text_/u, "").replace(/_ci$/u, "").replace(/_/gu, " ")} ${String(v)}`);
  return parts.join(" · ");
}

/** The rule that decided, as `set/rule`, or the person who did. */
export function ruleWords(r: RulesReason): string {
  const by = (r.set_by ?? {}) as Json;
  if (typeof by.kind === "string" && by.kind !== "rule") return `${by.kind}${typeof by.actor === "string" ? ` (${by.actor})` : ""}`;
  if (!r.decided?.rule) return "no rule answered";
  const clause = typeof r.decided.clause === "number" ? `, clause ${r.decided.clause}` : "";
  return `${r.decided.rule_set ?? ""}/${r.decided.rule}${clause}`;
}

/** The answer a person gives an item as its doors take it: a value, nothing, or values by axis. */
export function answerBody(value: string, nothing: boolean): Json {
  return nothing ? { nothing: true } : { value: value.trim() };
}

/** The value a provisional answer gave, for the field to start from after the reveal. */
export function provisionalValue(p: { answer: Json } | null | undefined): { value: string; nothing: boolean } | null {
  if (!p) return null;
  const a = p.answer as Json;
  if (a.nothing === true) return { value: "", nothing: true };
  if (typeof a.value === "string") return { value: a.value, nothing: false };
  if (Array.isArray(a.value)) return { value: (a.value as string[]).join(","), nothing: false };
  return null;
}

/** A round's never-asked check, true where no question was sent for a conflict, a low confidence, body part or post-contrast (T20). */
export function neverAskedHolds(r: RoundReport): boolean {
  const n = r.never_asked;
  return n.conflict === 0 && n.low_confidence === 0 && n.body_part === 0 && n.post_contrast === 0;
}

/** A draw's grade in words: wrong of read, and the bound. */
export function gradeWords(g: DrawGrade | null | undefined): string {
  if (!g) return "not graded";
  return `${g.wrong.toLocaleString("en-US")} wrong of ${g.read.toLocaleString("en-US")} read · error ${pct(g.error)} · bound ${pct(g.bound)} at ${Math.round(g.confidence * 100)} %`;
}
