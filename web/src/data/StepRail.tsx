// SPDX-License-Identifier: AGPL-3.0-only
// The rail of where a dataset or a cohort is (Wave 7a, the design of
// 2026-10-09): a node a step with its name, what it did and when, the line
// between them filled as far as it got, the running step marked. A rail of
// more than six steps (body part and post-contrast among them) folds to four
// to a row on a narrower window.

import type React from "react";
import { stepWords, type SummaryStep } from "./summary";

export function StepRail({ steps, now }: { steps: SummaryStep[]; now: number }) {
  const at = new Date(now);
  return (
    <ol className={steps.length > 6 ? "dp-steps many" : "dp-steps"} style={{ "--steps": steps.length } as React.CSSProperties}>
      {steps.map((st, i) => {
        const w = stepWords(st, at);
        return (
          <li key={st.step} className={`dp-step ${st.state}`} aria-current={st.state === "running" ? "step" : undefined} title={w.hint}>
            <span className="dp-step-mark" aria-hidden="true">
              <span className="node" />
              {i < steps.length - 1 && <span className="link" />}
            </span>
            <span className="dp-step-title">{w.title}</span>
            <span className="dp-step-what">{w.what}</span>
            <span className={w.now ? "dp-step-when now" : "dp-step-when"}>{w.when || "\u00a0"}</span>
          </li>
        );
      })}
    </ol>
  );
}
