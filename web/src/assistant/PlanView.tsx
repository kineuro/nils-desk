// SPDX-License-Identifier: AGPL-3.0-only
// A plan restated (Wave 5 section 9.3): one line per step with its rung,
// confirmed once; the rung-two steps run under standing grants when their
// condition holds, the rung-three steps wait as proposals for a person.

import { useState } from "react";
import { assistant, type Plan, type Step } from "./client";

export function rungWords(s: Step): string {
  return s.rung === 2 ? "runs under a grant" : "a proposal you decide";
}

export function stepState(s: Step): string {
  if (s.rung === 3) return s.decided ? s.decided : "waiting for you";
  if (s.state === "waiting" && s.reason) return `waits: ${s.reason}`;
  if (s.job) return `${s.state}, job ${s.job}`;
  return s.state;
}

export function PlanView({ plan, onChanged }: { plan: Plan; onChanged: (p: Plan) => void }) {
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<string | null>(null);
  const unconfirmed = !plan.confirmed_at && plan.state !== "done" && plan.state !== "confirmed";
  const confirm = () => {
    setBusy(true);
    assistant
      .confirmPlan(plan.id)
      .then((p) => {
        setWhy(null);
        onChanged(p);
      })
      .catch((e: Error) => setWhy(e.message))
      .finally(() => setBusy(false));
  };
  return (
    <div className={`plan ${unconfirmed ? "open" : ""}`}>
      <p className="sentence">{plan.instruction}</p>
      <ol className="plan-steps">
        {plan.steps.map((s) => (
          <li key={s.n} className={`rung-${s.rung}`}>
            <span className="tag">{s.rung === 2 ? "run" : "propose"}</span> {s.words} <span className="meta">({rungWords(s)}; {stepState(s)})</span>
            {s.job && (
              <>
                {" "}
                <a href={`#job/${s.job}`}>job {s.job}</a>
              </>
            )}
          </li>
        ))}
      </ol>
      {unconfirmed && (
        <div className="row">
          <button type="button" className="on" disabled={busy} onClick={confirm}>
            Confirm this plan
          </button>
          <span className="meta">Runs the rung-two steps under your grants when due; the proposals wait for you.</span>
        </div>
      )}
      {!unconfirmed && <p className="meta">{plan.state}</p>}
      {why && <p className="warn">{why}</p>}
    </div>
  );
}
