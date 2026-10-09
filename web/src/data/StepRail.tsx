// SPDX-License-Identifier: AGPL-3.0-only
// The rail of where a dataset or a cohort is (Wave 7a, the design of
// 2026-10-09): a node a step with its name, what it did and when, the line
// between them filled as far as it got, the running step marked. A rail of
// more than six steps (body part and post-contrast among them) folds to four
// to a row on a narrower window. A step that waits on a person says so and is
// marked next; the one a dataset opens in place (its pseudonymise step) is a
// button that opens and closes it.

import type React from "react";
import { stepWords, type StepName, type SummaryStep } from "./summary";

/** What a step says instead of its counts while it waits on a person, and that it is next. */
export type StepSays = Partial<Record<StepName, { what: string; when: string; next: boolean }>>;

/** The step the rail opens in place, whether it is open, and what opens it. */
export interface StepPick {
  step: StepName;
  open: boolean;
  /** The id of what it opens, for the button's aria-controls. */
  controls?: string;
  onPick: () => void;
}

export function StepRail({ steps, now, says, pick }: { steps: SummaryStep[]; now: number; says?: StepSays; pick?: StepPick | null }) {
  const at = new Date(now);
  return (
    <ol className={steps.length > 6 ? "dp-steps many" : "dp-steps"} style={{ "--steps": steps.length } as React.CSSProperties}>
      {steps.map((st, i) => {
        const own = stepWords(st, at);
        const said = says?.[st.step];
        const w = said ? { ...own, what: said.what, when: said.when } : own;
        const picked = pick?.step === st.step ? pick : null;
        const cls = ["dp-step", st.state, said?.next ? "next" : null, picked?.open ? "open" : null].filter(Boolean).join(" ");
        return (
          <li key={st.step} className={cls} aria-current={st.state === "running" ? "step" : said?.next ? "step" : undefined} title={w.hint}>
            <span className="dp-step-mark" aria-hidden="true">
              <span className="node" />
              {i < steps.length - 1 && <span className="link" />}
            </span>
            {picked ? (
              <button type="button" className="dp-step-title dp-step-pick" aria-expanded={picked.open} aria-controls={picked.controls} onClick={picked.onPick}>
                {w.title}
              </button>
            ) : (
              <span className="dp-step-title">{w.title}</span>
            )}
            <span className="dp-step-what">{w.what}</span>
            <span className={w.now || said?.next ? "dp-step-when now" : "dp-step-when"}>{w.when || " "}</span>
          </li>
        );
      })}
    </ol>
  );
}
