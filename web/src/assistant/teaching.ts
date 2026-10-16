// SPDX-License-Identifier: AGPL-3.0-only
// Teaching through the desk's proxy to the assistant (Wave 5 section 9.5):
// the corrections, the sets, the fine-tune job, the candidates with both
// gates beside each other, and promotion, refused until both are green.

import { DoorError, door, type Json } from "../ask/client";

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

/** What retiring a candidate answers: whether it rolled a promotion back, and the model each backend routes to after it. */
export interface Retired {
  retired: number;
  rolled_back: boolean;
  candidate: Candidate;
  promoted: { backend: string; model: string | null }[];
}

/** Every fine-tune job; an assistant without the jobs door (before alpha.30, whose 404 is plain text) gives the person's own, from the inbox. */
async function jobs(): Promise<FineTuneJob[]> {
  const r = await fetch("/assistant/teaching/jobs", { headers: { "X-Nils-Desk": "1" } });
  if (r.status === 404) return (await door<{ teaching?: FineTuneJob[] }>("GET", "/assistant/inbox")).teaching ?? [];
  const text = await r.text();
  let body: { jobs?: FineTuneJob[]; error?: unknown } = {};
  try {
    body = text ? (JSON.parse(text) as typeof body) : {};
  } catch {
    // a body that is not JSON says nothing more than the status
  }
  if (!r.ok) throw new DoorError(r.status, body as Json);
  return body.jobs ?? [];
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
  jobs,
  /** Retire a candidate; retiring the promoted one rolls its promotion back. */
  retire: (id: number) => door<Retired>("POST", `/assistant/teaching/candidates/${id}/retire`, {}),
};

/** The screens of the Teaching page, one list and one action each. */
export const SCREENS = ["corrections", "sets", "jobs", "models"] as const;
export type Screen = (typeof SCREENS)[number];
export const SCREEN_WORDS: Record<Screen, string> = { corrections: "Corrections", sets: "Sets", jobs: "Jobs", models: "Models" };

/** A correction's kind in words. */
export function kindWords(k: Correction["kind"]): string {
  return k === "rejected_proposal" ? "proposal rejected" : k === "overturned_station" ? "station overturned" : "pack overturned";
}

/** A job's state and what it left, in words. */
export function jobWords(j: FineTuneJob): { tone: "ok" | "caution" | "blocked"; state: string; result: string } {
  if (j.state === "running") return { tone: "caution", state: "running", result: `set ${j.set_id}, ${j.recipe.steps} steps on ${j.recipe.base}` };
  if (j.state === "failed") return { tone: "blocked", state: "failed", result: j.error ?? "no reason given" };
  const made = j.candidate !== null ? `candidate ${j.candidate}` : "no candidate";
  return { tone: "ok", state: "done", result: j.outcome?.dry ? `${made}; dry: no adapter was made` : made };
}

/** Whether any job is still running: the page reads the jobs again while one is. */
export const running = (js: FineTuneJob[]): boolean => js.some((j) => j.state === "running");

/** The one next step a candidate offers, or none; blocked with the reason where it may not be taken. */
export type Step = { verb: "admit" | "bench" | "promote" | "retire"; label: string; reason: string | null } | null;

export function nextStep(c: Candidate, work: boolean): Step {
  const why = work ? null : "needs kvasir:work";
  if (c.state === "retired") return null;
  if (c.state === "promoted") return { verb: "retire", label: "Roll back", reason: why };
  if (!c.gates.admission) return { verb: "admit", label: c.admission ? "Admit again" : "Admit", reason: why };
  if (!c.gates.bench) return { verb: "bench", label: c.bench ? "Bench again" : "Bench", reason: why };
  const p = promotable(c);
  return { verb: "promote", label: "Promote", reason: why ?? p.reason };
}

/** What rolling a promotion back changes, for its confirmation. */
export function rollbackWords(c: Candidate): string[] {
  return [
    `${c.model} is retired, and ${c.backend} routes every purpose to the model it is configured with again.`,
    "The model this one replaced stays retired: a retired model is never promoted again.",
  ];
}

export interface RecipeDraft {
  base: string;
  steps: string;
  rank: string;
  lr: string;
}

export const RECIPE_DRAFT: Omit<RecipeDraft, "base"> = { steps: "20", rank: "8", lr: "0.0001" };

/** A recipe from the form, refused in words where the assistant would refuse it. */
export function recipeOf(d: RecipeDraft): Recipe | { refused: string } {
  const base = d.base.trim();
  if (!base) return { refused: "Name the base model." };
  const num = (v: string, min: number, max: number, whole: boolean): number | null => {
    const n = Number(v.trim());
    return v.trim() !== "" && Number.isFinite(n) && n >= min && n <= max && (!whole || Number.isInteger(n)) ? n : null;
  };
  const steps = num(d.steps, 1, 100_000, true);
  const rank = num(d.rank, 1, 512, true);
  const lr = num(d.lr, 1e-8, 1, false);
  if (steps === null) return { refused: "Steps are a whole number from 1 to 100000." };
  if (rank === null) return { refused: "Rank is a whole number from 1 to 512." };
  if (lr === null) return { refused: "The learning rate is a number above 0 and at most 1." };
  return { base, method: "lora", steps, rank, lr };
}

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
