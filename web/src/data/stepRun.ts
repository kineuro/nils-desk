// SPDX-License-Identifier: AGPL-3.0-only
// Run, on the rail of a dataset or a cohort (record 56, 2026-10-10): body
// part and post-contrast are operations of their own, each started from its
// step. The engine's door freezes the scans the step counts and queues its
// model over them; the step then goes queued, running, done or failed, and
// the running job sits in the dataset's log with its progress and Stop. Run is
// offered to a person with work on Pipelines while the step neither waits nor
// runs; where the engine would refuse it, it stands disabled with the engine's
// reason behind a "?".

import { door } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may, sees } from "../grants";
import type { StepRunOffer } from "./StepRail";
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
export function startedWords(name: string, step: Operation): string {
  return `${name}: ${step === "body_part" ? "body part" : "post-contrast"} queued.`;
}
