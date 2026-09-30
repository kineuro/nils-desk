// SPDX-License-Identifier: AGPL-3.0-only
// Picks in Review (record 45 S5): a `pick.border` item read as the occasion
// it doubts, its candidates best first with the run's own pick marked, and
// the person's doors: a pick of their own with a why, which the next pick run
// leaves standing, and its withdrawal, after which the run's pick applies
// again. Keeping the run's pick is a decision too (record 51 R1 and R2):
// accepting the item writes a person's pick of the stacks the run picked, or,
// where nothing was eligible, a person's pick of no stack.

import { door, type Json } from "../ask/client";
import type { ReviewItem } from "../ops/client";

/** One candidate of an occasion: the stacks of one acquisition and the run's score. */
export interface Candidate {
  stacks: number[];
  score: number | null;
  /** The run's own pick: the best candidate when the run picked one. */
  chosen: boolean;
}

/** A person's pick that answered the item. */
export interface Answered {
  pick: number;
  stacks: number[];
  why: string | null;
}

/** A `pick.border` item as the page reads it. */
export interface Border {
  item: number;
  status: string;
  subject: number | null;
  day: string | null;
  role: string;
  /** The pick that declares the role, by name. */
  model: string | null;
  borders: string[];
  score: number | null;
  margin: number | null;
  runnerUp: number | null;
  candidates: Candidate[];
  /** The run's pick row, when it picked one. */
  runPick: number | null;
  answered: Answered | null;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const text = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const ids = (v: unknown): number[] => (Array.isArray(v) ? v.flatMap((x) => (typeof x === "number" && Number.isInteger(x) ? [x] : [])) : []);

export const PICK_BORDER = "pick.border";

/** The border an item is, or null for any other kind. */
export function borderOf(item: ReviewItem): Border | null {
  if (item.kind !== PICK_BORDER) return null;
  const ref = (item.ref ?? {}) as Json;
  const ev = (item.evidence ?? {}) as Json;
  const runPick = num(ev.pick_id);
  // the run lists what it considered best first; the first is its pick when it picked one
  const considered = Array.isArray(ev.considered) ? (ev.considered as Json[]) : [];
  const nothing = Array.isArray(ev.borders) && (ev.borders as unknown[]).includes("nothing_eligible");
  const candidates = considered
    .map((c, i) => ({ stacks: ids(c.stacks), score: num(c.score), chosen: i === 0 && runPick !== null && !nothing }))
    .filter((c) => c.stacks.length > 0);
  const d = (item.decision ?? null) as Json | null;
  const pick = d ? num(d.pick_id) : null;
  return {
    item: item.id,
    status: item.status,
    subject: num(ref.subject_id),
    day: text(ref.session_day),
    role: text(ref.role) ?? "",
    model: text(ref.model),
    borders: Array.isArray(ev.borders) ? (ev.borders as unknown[]).map(String) : [],
    score: num(ev.score),
    margin: num(ev.margin),
    runnerUp: num(ev.runner_up_score),
    candidates,
    runPick,
    answered: d && pick !== null && d.author_kind === "person" ? { pick, stacks: ids(d.stacks), why: text(d.why) } : null,
  };
}

/** v0's nine reasons (record 51 R6): the three v1 had, and the six the pack declares since, each as v0 computed it. */
const WORDS: Record<string, string> = {
  too_close: "the two best too close",
  rare: "a winner rare here",
  nothing_eligible: "nothing eligible",
  retake: "a retake: the winner is more than one stack",
  unknown_dim: "the winner's dimension unknown",
  slice_count_outlier: "an odd number of slices for its dimension",
  pre_post_twin: "a twin before or after contrast close behind",
  epimix_fallback: "an EPIMix stands in",
  dixon_vs_plain: "a plain stack close behind the Dixon",
};

/** Why the run doubts its pick, in words. */
export function borderWords(b: Pick<Border, "borders">): string {
  return b.borders.map((w) => WORDS[w] ?? w.replace(/_/g, " ")).join(", ") || "doubted";
}

/** Whether nothing was eligible for the role here, so there is no run's pick to keep. */
export const nothingEligible = (b: Pick<Border, "borders">) => b.borders.includes("nothing_eligible");

/** What Keep writes, in the words its button says (record 51 R1 and R2). */
export function keepWords(b: Pick<Border, "borders" | "runPick">): string {
  return b.runPick === null && nothingEligible(b) ? "Keep: no stack stands for this role here" : "Keep the run's pick as yours";
}

/** A person's answer in words: the stacks they picked, or that none stands. */
export function answeredWords(a: Answered): string {
  const said = a.stacks.length === 0 ? "A person said no stack stands for this role here" : `A person picked stacks ${a.stacks.join(", ")}`;
  return `${said}${a.why ? `: ${a.why}` : ""}.`;
}

/** The roles the Picks page offers: the pack's, in its order, then any other a border names (a pick an older pack declared), each with its open borders. */
export function rolesOffered(pack: readonly string[], borders: readonly Pick<Border, "role" | "status">[]): { role: string; open: number }[] {
  const roles = [...new Set([...pack, ...borders.map((b) => b.role).filter((r) => r !== "")])];
  return roles.map((role) => ({ role, open: borders.filter((b) => b.role === role && b.status === "open").length }));
}

/** The occasion in words: "T1w of subject 12 on 2026-03-02". */
export function occasionWords(b: Pick<Border, "role" | "subject" | "day">): string {
  const who = b.subject !== null ? `subject ${b.subject}` : "a subject";
  return `${b.role || "a role"} of ${who}${b.day ? ` on ${b.day}` : ""}`;
}

/** The body of a person's pick of one candidate. */
export function pickBody(b: Pick<Border, "role" | "model">, stacks: number[], why: string): Json {
  return { role: b.role, stacks, why: why.trim(), ...(b.model ? { pick: b.model } : {}) };
}

/** Which candidate a person's answer names, or null. */
export function answeredIndex(b: Border): number | null {
  if (!b.answered) return null;
  const key = [...b.answered.stacks].sort((x, y) => x - y).join(",");
  const i = b.candidates.findIndex((c) => [...c.stacks].sort((x, y) => x - y).join(",") === key);
  return i >= 0 ? i : null;
}

export interface PickWritten {
  id: number;
  model: string;
  role: string;
  subject_id: number;
  session_day: string;
  stacks: number[];
  overruled: number[];
  replaced: number[];
  answered: number;
}

/** The person's pick doors (record 42 S3). */
export const picks = {
  set: (body: Json) => door<PickWritten>("POST", "/api/picks", body),
  withdraw: (id: number, why?: string) => door<{ id: number; restored: number[] }>("POST", `/api/picks/${id}/withdraw`, why ? { why } : {}),
};
