// SPDX-License-Identifier: AGPL-3.0-only
// Run, on the rail of a dataset or a cohort (record 56, 2026-10-10): body
// part and post-contrast are operations of their own, each started from its
// step. The engine's door freezes the scans the step counts and queues its
// model over them; the step then goes queued, running, done or failed, and
// the running job sits in the dataset's log with its progress and Stop. Run is
// offered to a person with work on Pipelines while the step neither waits nor
// runs; where the engine would refuse it, it stands disabled with the engine's
// reason behind a "?". Main scans carry a Run of their own (2026-10-11):
// the pick run door picks a dataset's main scans again by its saved rules,
// beside a link to its Main scans page and one line of help.

import { door } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may, sees } from "../grants";
import { href, narrow } from "../routes";
import { mayMainScans } from "../review/mainScans";
import { mayPick } from "./pickRun";
import type { StepMore, StepRunOffer } from "./StepRail";
import { OPERATIONS, type Operation, type StepName, type SummaryStep } from "./summary";

/** The doors that start a step's run, a dataset's and a cohort's. */
export const STEP_RUN_DOORS = {
  datasets: "POST /api/datasets/{name}/steps/{step}/run",
  cohorts: "POST /api/cohorts/{name}/steps/{step}/run",
} as const;

export type RunScope = keyof typeof STEP_RUN_DOORS;

/** Which of a step's scans a run goes over (engine, 2026-11-05): every one it counts, or only those without its answer. */
export type Over = "all" | "without";

/** What the door answers: the job queued, what it is for and how many scans it runs over, which, and in how many parts. */
export interface StepStarted {
  job: number;
  state: "queued";
  step: Operation;
  for: string;
  scans: number;
  over?: Over;
  parts?: number;
  handle: number;
  command: string[];
}

export const stepRuns = {
  /** A step's run over a dataset's or a cohort's scans, queued: every one, or only those without its answer. */
  start: (scope: RunScope, name: string, step: Runnable, over: Over = "all") =>
    door<StepStarted>("POST", `/api/${scope}/${encodeURIComponent(name)}/steps/${step}/run`, over === "without" ? { scans: "without" } : undefined),
};

/** The steps the door runs: the operations, and the sort (engine 1.0.0-beta.9, from a dataset's and a cohort's card). */
export type Runnable = Operation | "sorted";
function isRunnable(step: StepName): step is Runnable {
  return isOperation(step) || step === "sorted";
}

function isOperation(step: StepName): step is Operation {
  return (OPERATIONS as StepName[]).includes(step);
}

/** A step's Run as the rail draws it, or null where none is offered. */
export interface RunControl {
  label: string;
  disabled: boolean;
  /** Why a press does nothing now, for its "?". */
  why: string | null;
}

/**
 * A step's Run: offered on body part and post-contrast where the engine has
 * the door and the person works on Pipelines, never while the step waits its
 * turn or runs (its log has the job and Stop); disabled where a run reads
 * images the person may not see, or the engine would refuse it, saying why.
 */
export function runControl(caps: Capabilities, scope: RunScope, st: SummaryStep): RunControl | null {
  if (!isRunnable(st.step) || !served(caps, STEP_RUN_DOORS[scope]) || !may(caps, "pipelines:work")) return null;
  if (st.state === "queued" || st.state === "running") return null;
  const label = st.state === "done" || st.state === "failed" ? "Run again" : "Run";
  // the sort reads headers, never an image (2026-11-05: Sort runs from the card too)
  if (isOperation(st.step) && !sees(caps, "quasi")) return { label, disabled: true, why: "A model reads the scans' images, which needs quasi detail." };
  if (st.refusal) return { label, disabled: true, why: st.refusal.error };
  return { label, disabled: false, why: null };
}

/** The Run of each step of a rail that offers one; every one held while a press is answered. */
export function runOffers(caps: Capabilities, scope: RunScope, steps: SummaryStep[], pressed: boolean, onRun: (step: Runnable) => void): Partial<Record<StepName, StepRunOffer>> {
  const out: Partial<Record<StepName, StepRunOffer>> = {};
  for (const st of steps) {
    const c = runControl(caps, scope, st);
    if (!c || !isRunnable(st.step)) continue;
    const step = st.step;
    out[step] = { ...c, disabled: c.disabled || pressed, onRun: () => onRun(step) };
  }
  return out;
}

/** The rail's Run offers with the one whose acts are open marked so (2026-11-05). */
export function choosingOffers(offers: Partial<Record<StepName, StepRunOffer>>, choosing: StepName | null): Partial<Record<StepName, StepRunOffer>> {
  const out: Partial<Record<StepName, StepRunOffer>> = {};
  for (const [step, offer] of Object.entries(offers) as [StepName, StepRunOffer][]) out[step] = { ...offer, open: choosing === step };
  return out;
}

/** What a page says once a step's run is queued: over how many scans, where the engine says it (2026-11-05). */
export function startedWords(name: string, step: Runnable | "main_scans", started?: Pick<StepStarted, "scans" | "parts"> | null): string {
  const words = { body_part: "body part", post_contrast: "post-contrast", main_scans: "main scans", sorted: "sort" };
  if (typeof started?.scans !== "number") return `${name}: ${words[step]} queued.`;
  const parts = (started.parts ?? 1) > 1 ? `, in ${n(started.parts ?? 1)} parts` : "";
  return `${name}: ${words[step]} queued on ${n(started.scans)} ${started.scans === 1 ? "scan" : "scans"}${parts}.`;
}

const n = (v: number) => v.toLocaleString("en-US");

/** One act of a step's Run (2026-11-05): what it runs over in words, how many, the parts it takes, and whether it is the first act. */
export interface RunAct {
  over: Over;
  label: string;
  scans: number;
  parts: number;
  primary: boolean;
}

/** The scans a model step's "N without" counts, in the words its Run says them. */
const WITHOUT: Record<Operation, string> = { body_part: "without a body part", post_contrast: "T1 brain, contrast unknown" };

/**
 * What a step's Run offers before it starts (2026-11-05: production's body
 * part said "135 with no body part", and its Run went over all 456,132 scans
 * in 23 parts, saying neither): a model step its scans without its answer
 * first, "Run on the 135 without a body part", where they are some of its
 * scans and not all, then every scan, "Run again on all 456,132", each with
 * its count and parts; the sort every scan; main scans every subject. An
 * engine from before says only how many scans the step counts.
 */
export function runActs(st: SummaryStep, subjects: number | null = null): RunAct[] {
  const verb = st.state === "done" || st.state === "failed" ? "Run again" : "Run";
  if (st.step === "main_scans") {
    const label = typeof subjects === "number" && subjects > 0 ? `${verb} for ${subjects === 1 ? "its 1 subject" : `all ${n(subjects)} subjects`}` : verb;
    return [{ over: "all", label, scans: subjects ?? 0, parts: 1, primary: true }];
  }
  const all = st.runs?.all ?? (typeof st.of === "number" ? { scans: st.of, parts: 1 } : null);
  const out: RunAct[] = [];
  const without = isOperation(st.step) ? (st.runs?.without ?? null) : null;
  const some = without !== null && all !== null && without.scans > 0 && without.scans < all.scans;
  if (some && isOperation(st.step)) out.push({ over: "without", label: `Run on the ${n(without.scans)} ${WITHOUT[st.step]}`, scans: without.scans, parts: without.parts, primary: true });
  if (all) out.push({ over: "all", label: `${verb} on all ${n(all.scans)}`, scans: all.scans, parts: all.parts, primary: !some });
  else out.push({ over: "all", label: verb, scans: 0, parts: 1, primary: true });
  return out;
}

/** A step's acts in a line for a screen reader or a title: "Run on the 135 without a body part, or run again on all 456,132 in 23 parts". */
export function actsWords(acts: RunAct[]): string {
  return acts.map((a, i) => `${i > 0 ? a.label.replace(/^R/, "r") : a.label}${a.parts > 1 ? ` in ${n(a.parts)} parts` : ""}`).join(", or ");
}

/** Main scans' one line of help, behind its "?". */
export const MAIN_SCANS_HELP = "Picks each visit's main scan per role, by this dataset's rules.";

/**
 * Main scans' Run on a dataset's rail: offered where the engine has the pick
 * run door and the person works on Pipelines, never while a pick waits its
 * turn or runs, nor where picking is off for the dataset; held while the
 * dataset has no scans to pick from.
 */
export function pickControl(caps: Capabilities, st: SummaryStep | null, scans: number): RunControl | null {
  if (st?.step !== "main_scans" || !mayPick(caps)) return null;
  if (st.state === "queued" || st.state === "running" || st.state === "off") return null;
  const label = st.state === "done" || st.state === "failed" ? "Run again" : "Run";
  if (scans === 0) return { label, disabled: true, why: "There are no scans to pick from yet." };
  return { label, disabled: false, why: null };
}

/** Main scans' Run as the rail draws it, held while a press is answered or the dataset's chain runs. */
export function pickOffer(caps: Capabilities, st: SummaryStep | null, scans: number, held: boolean, onRun: () => void): StepRunOffer | null {
  const c = pickControl(caps, st, scans);
  return c ? { ...c, disabled: c.disabled || held, onRun } : null;
}

/** Main scans' link to the dataset's Main scans page, where the person may read it, and its help. */
export function mainScansMore(caps: Capabilities, dataset: string): StepMore {
  return { link: mayMainScans(caps) ? { label: "Rules", href: narrow(href("review", "picks"), { dataset }) } : null, help: MAIN_SCANS_HELP };
}
