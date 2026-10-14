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

/** What the door answers: the job queued, what it is for and how many scans it runs over. */
export interface StepStarted {
  job: number;
  state: "queued";
  step: Operation;
  for: string;
  scans: number;
  handle: number;
  command: string[];
}

export const stepRuns = {
  /** A step's run over a dataset's or a cohort's scans, queued. */
  start: (scope: RunScope, name: string, step: Operation) => door<StepStarted>("POST", `/api/${scope}/${encodeURIComponent(name)}/steps/${step}/run`),
};

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
  if (!isOperation(st.step) || !served(caps, STEP_RUN_DOORS[scope]) || !may(caps, "pipelines:work")) return null;
  if (st.state === "queued" || st.state === "running") return null;
  const label = st.state === "done" || st.state === "failed" ? "Run again" : "Run";
  if (!sees(caps, "quasi")) return { label, disabled: true, why: "A model reads the scans' images, which needs quasi detail." };
  if (st.refusal) return { label, disabled: true, why: st.refusal.error };
  return { label, disabled: false, why: null };
}

/** The Run of each step of a rail that offers one; every one held while a press is answered. */
export function runOffers(caps: Capabilities, scope: RunScope, steps: SummaryStep[], pressed: boolean, onRun: (step: Operation) => void): Partial<Record<StepName, StepRunOffer>> {
  const out: Partial<Record<StepName, StepRunOffer>> = {};
  for (const st of steps) {
    const c = runControl(caps, scope, st);
    if (!c || !isOperation(st.step)) continue;
    const step = st.step;
    out[step] = { ...c, disabled: c.disabled || pressed, onRun: () => onRun(step) };
  }
  return out;
}

/** What a page says once a step's run is queued. */
export function startedWords(name: string, step: Operation | "main_scans"): string {
  const words = { body_part: "body part", post_contrast: "post-contrast", main_scans: "main scans" };
  return `${name}: ${words[step]} queued.`;
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
