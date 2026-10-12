// SPDX-License-Identifier: AGPL-3.0-only
// The pre-flight (record 49 A3, A7): what a run would do, as the engine
// counts it before anything runs. Units ready of the whole, the units that
// lack an input folded by why, the time, the GPU and the lane's budget, and
// the blockers that keep Run from being pressed. A refusal, or a pre-flight
// that is not ready, says why as a failed run does (2026-10-12): the kind,
// what to do, and what can be done about it.

import type React from "react";
import { Icon } from "../ui/Icon";
import { Values } from "../ui/Says";
import { failureWords, type Failure } from "./failure";
import { FailNote, KindTag } from "./Reason";
import { blockedOf, missingByWhy, preflightCells, preflightGate, type Preflight } from "./runs";

const n = (v: number) => v.toLocaleString("en-US");

export function PreflightPanel({ p, checking = false, why = null, act = null }: { p: Preflight | null; checking?: boolean; why?: string | Failure | null; act?: ((f: Failure) => React.ReactNode) | null }) {
  if (why) {
    const f = typeof why === "string" ? failureWords(why) : why;
    return (
      <FailNote f={f} lead="The pre-flight refused">
        {act?.(f)}
      </FailNote>
    );
  }
  if (p === null) return checking ? <p className="meta">Checking what the run would do…</p> : null;
  const gate = preflightGate(p);
  const blocked = blockedOf(p);
  const missing = missingByWhy(p);
  return (
    <div className={gate.go ? "note brand preflight" : "note caution preflight"}>
      <Icon name={gate.go ? "check" : "alert"} />
      <div className="note-body">
        <p className="note-lead">{gate.go ? "Pre-flight" : "Not ready"}</p>
        <Values cells={preflightCells(p)} />
        {missing.length > 0 && (
          <ul className="preflight-missing">
            {missing.map((m) => (
              <li key={m.why}>
                <b className="num">{n(m.count)}</b> {m.why}
                {m.units.length > 0 && (
                  <span className="meta">
                    {" "}
                    · {m.units.slice(0, 3).join(", ")}
                    {m.units.length > 3 ? ` and ${n(m.units.length - 3)} more` : ""}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {blocked && (
          <>
            <p className="fail-said">
              {blocked.kind && <KindTag kind={blocked.kind} />}
              <span>{blocked.line}</span>
            </p>
            {blocked.error !== blocked.line && <p className="note-detail">{blocked.error}</p>}
            {act?.(blocked)}
          </>
        )}
        {checking && <p className="note-detail">Checking again…</p>}
      </div>
    </div>
  );
}
