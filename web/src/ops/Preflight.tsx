// SPDX-License-Identifier: AGPL-3.0-only
// The pre-flight (record 49 A3, A7): what a run would do, as the engine
// counts it before anything runs. Units ready of the whole, the units that
// lack an input folded by why, the time, the GPU and the lane's budget, and
// the blockers that keep Run from being pressed.

import { Icon } from "../ui/Icon";
import { Values } from "../ui/Says";
import { missingByWhy, preflightCells, preflightGate, type Preflight } from "./runs";

const n = (v: number) => v.toLocaleString("en-US");

export function PreflightPanel({ p, checking = false, why = null }: { p: Preflight | null; checking?: boolean; why?: string | null }) {
  if (why) return <p className="warn">The pre-flight could not be read: {why}</p>;
  if (p === null) return checking ? <p className="meta">Checking what the run would do…</p> : null;
  const gate = preflightGate(p);
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
        {!gate.go && gate.why && <p className="note-detail">{gate.why}</p>}
        {checking && <p className="note-detail">Checking again…</p>}
      </div>
    </div>
  );
}
