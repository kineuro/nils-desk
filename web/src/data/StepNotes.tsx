// SPDX-License-Identifier: AGPL-3.0-only
// The line under a dataset's or a cohort's rail for a model's step that runs
// or failed (2026-11-05, what production taught): how far a running body part
// or post-contrast run is, in the engine's count ("312 of 870 scans in part 4
// of 23 · 47 min"), and why a failed one failed, in the engine's words for it
// ("killed at its memory cap of 16 GB"), with the way to its run. Before, a
// run over a cohort stood at "0 of 20,000" for twenty minutes, and a failed
// one said "failed" while the reason sat in its job and its units.

import type { Capabilities } from "../capabilities";
import { stepFailureOf, stepProgressWords, type StepFailure } from "../ops/progress";
import { KindTag } from "../ops/Reason";
import { runActs } from "../ops/runs";
import { href } from "../routes";
import { Hint } from "../ui/Hint";
import { OPERATIONS, stepWords, type SummaryStep } from "./summary";

/** One line under the rail: a model's step that runs, or one that failed. */
export interface StepNote {
  step: string;
  /** The step's title: Body part, Post-contrast. */
  title: string;
  failed: boolean;
  /** Running: how far, and how long. Failed: what happened, or what to do. */
  words: string;
  failure: StepFailure | null;
  /** The run it is about, where the engine names one. */
  run: number | null;
}

/** The lines under a rail: each model's step that runs and says how far, or failed and says why. */
export function stepNotes(steps: SummaryStep[], now: number): StepNote[] {
  const out: StepNote[] = [];
  for (const st of steps) {
    if (!(OPERATIONS as string[]).includes(st.step)) continue;
    const title = stepWords(st, new Date(now)).title;
    const run = typeof st.run === "number" ? st.run : null;
    if (st.state === "running") {
      const words = stepProgressWords(st.progress, st.started_at, now);
      if (words) out.push({ step: st.step, title, failed: false, words, failure: null, run });
    } else if (st.state === "failed") {
      const failure = stepFailureOf(st.failure);
      if (failure) out.push({ step: st.step, title, failed: true, words: failure.line, failure, run });
    }
  }
  return out;
}

export function StepNotes({ caps, steps, now }: { caps: Capabilities; steps: SummaryStep[]; now: number }) {
  const notes = stepNotes(steps, now);
  if (notes.length === 0) return null;
  const opens = runActs(caps).open;
  return (
    <div className="dp-step-notes">
      {notes.map((note) => (
        <p key={note.step} className={note.failed ? "dp-step-note failed" : "dp-step-note"} role="status">
          {note.failure?.kind && <KindTag kind={note.failure.kind} cause={note.failure.cause} />}
          <span>
            <b>{note.failed ? `${note.title} failed` : note.title}</b>: {note.words}
          </span>
          {note.run !== null && opens && <a href={href("pipelines", "runs", String(note.run))}>Run {note.run}</a>}
          {note.failure?.advice && <Hint text={note.failure.advice} />}
        </p>
      ))}
    </div>
  );
}
