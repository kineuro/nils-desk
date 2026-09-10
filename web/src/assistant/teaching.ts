// SPDX-License-Identifier: AGPL-3.0-only
// Teaching through the desk's proxy to the assistant (Wave 5 section 9.5):
// the corrections, the sets, the fine-tune job, the candidates with both
// gates beside each other, and promotion, refused until both are green.

import { door } from "../ask/client";

export interface Correction {
  id: string;
  kind: "rejected_proposal" | "overturned_station" | "overturned_pack";
  station: string;
  prompt_digest: string;
  correction: string;
  why: string | null;
  at: string;
}

export interface CuratedSet {
  id: number;
  name: string;
  subject: string;
  count: number;
  digest: string;
  created_at: string;
}

export interface Recipe {
  base: string;
  method: "lora";
  steps: number;
  rank: number;
  lr: number;
}

export interface FineTuneJob {
  id: number;
  set_id: number;
  subject: string;
  recipe: Recipe;
  state: "running" | "done" | "failed";
  started_at: string;
  finished_at: string | null;
  outcome: { dry: boolean; base: string; steps: number; adapter: string | null; set_digest: string; note: string } | null;
  candidate: number | null;
  error: string | null;
}

export interface Bench {
  id: number;
  candidate: number;
  at: number;
  passed: number;
  of: number;
  strict: number;
  median_seconds: number | null;
  dry: boolean;
  note: string | null;
}

export interface Candidate {
  id: number;
  model: string;
  backend: string;
  source: { kind: "fine-tune"; job: number | string; recipe: Record<string, unknown> } | { kind: "manual" };
  state: "registered" | "admitted" | "promoted" | "retired";
  admission: { suite: string; version: string; passed: boolean; failed: string[]; record: number | null; at: number } | null;
  proposal: { id: number | string; principal: string } | null;
  notes: string | null;
  bench: Bench | null;
  gates: { admission: boolean; bench: boolean; refused: string | null };
  job: FineTuneJob | null;
}

export const teaching = {
  corrections: () => door<{ count: number; corrections: Correction[] }>("GET", "/assistant/teaching/corrections"),
  sets: () => door<{ sets: CuratedSet[] }>("GET", "/assistant/teaching/sets"),
  curate: (name: string, corrections: string[]) => door<CuratedSet>("POST", "/assistant/teaching/sets", { name, corrections }),
  fineTune: (set: number, recipe: Recipe) => door<FineTuneJob>("POST", `/assistant/teaching/sets/${set}/fine-tune`, { recipe }),
  candidates: () => door<{ candidates: Candidate[]; promoted: { backend: string; model: string | null }[] }>("GET", "/assistant/teaching/candidates"),
  admit: (id: number) => door<{ candidate: Candidate }>("POST", `/assistant/teaching/candidates/${id}/admit`, {}),
  bench: (id: number) => door<Bench>("POST", `/assistant/teaching/candidates/${id}/bench`, {}),
  promote: (id: number, proposal: string) => door<{ promoted: number }>("POST", `/assistant/teaching/candidates/${id}/promote`, { proposal: { id: proposal } }),
};

/** The words of a gate on the page. */
export function gateWords(c: Candidate): { admission: string; bench: string } {
  const a = c.admission;
  const b = c.bench;
  return {
    admission: !a ? "not run" : a.passed ? "passed" : `failed: ${a.failed.join(", ") || "no record"}`,
    bench: !b ? "not run" : `${b.passed} of ${b.of}${b.dry ? " (recorded, not live)" : ""}${b.median_seconds !== null ? `, median ${b.median_seconds} s` : ""}`,
  };
}

/** What a promotion changes, for its closure panel: the model the backend's purposes will route to, and the one retired. */
export function promotionWords(c: Candidate, promoted: { backend: string; model: string | null }[]): string[] {
  const now = promoted.find((p) => p.backend === c.backend)?.model ?? null;
  const lines = [`${c.backend} routes every purpose to ${c.model}.`];
  lines.push(now ? `${now} is retired.` : "No model was promoted on this backend before.");
  if (c.source.kind === "fine-tune") lines.push(`The candidate came from fine-tune job ${c.source.job} with its recipe recorded.`);
  return lines;
}

/** Whether promotion may be offered: the button is blocked with the reason while either gate is not green. */
export function promotable(c: Candidate): { enabled: boolean; reason: string | null } {
  if (c.state === "promoted") return { enabled: false, reason: "already the promoted model" };
  if (c.state === "retired") return { enabled: false, reason: "retired" };
  return c.gates.refused ? { enabled: false, reason: c.gates.refused } : { enabled: true, reason: null };
}
