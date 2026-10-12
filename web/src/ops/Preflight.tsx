// SPDX-License-Identifier: AGPL-3.0-only
// The pre-flight (record 49 A3, A7): what a run would do, as the engine
// counts it before anything runs. Units ready of the whole, the units that
// lack an input folded by why, the time, the GPU and the lane's budget, and
// the blockers that keep Run from being pressed. A refusal, or a pre-flight
// that is not ready, says why as a failed run does (2026-10-12): the kind,
// what to do, and what can be done about it; and each check of what the run
// needs of this machine (the converter, the runtime, the image, memory, the
// GPU, disk) says whether it holds, in the engine's words. Over a dataset's
// or a cohort's main scans (record 55, 2026-10-12), how many scans they
// resolve to, under which rules, and the visits that have none, by why,
// named at detail quasi.

import type React from "react";
import { roleWord } from "../review/mainScans";
import { Icon } from "../ui/Icon";
import { Values } from "../ui/Says";
import { failureWords, type Failure, type Requirement } from "./failure";
import { FailNote, KindTag } from "./Reason";
import { blockedOf, mainReadOf, missingByWhy, preflightCells, preflightChecks, preflightGate, withoutByWhy, type MainRead, type Preflight } from "./runs";

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
  const main = mainReadOf(p);
  return (
    <div className={gate.go ? "note brand preflight" : "note caution preflight"}>
      <Icon name={gate.go ? "check" : "alert"} />
      <div className="note-body">
        <p className="note-lead">{gate.go ? "Pre-flight" : "Not ready"}</p>
        <Values cells={preflightCells(p)} />
        {main && <MainWithout m={main} />}
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
        <Requirements checks={preflightChecks(p)} />
        {blocked && (
          <>
            <p className="fail-said">
              {blocked.kind && <KindTag kind={blocked.kind} cause={blocked.cause} />}
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

/** The main scans read, and the visits with none by why: "12 visits have no main T1w", each reason with the visits it names. */
export function MainWithout({ m }: { m: MainRead }) {
  const role = roleWord(m.main);
  const without = withoutByWhy(m);
  return (
    <div className="preflight-main">
      {m.read && <p className="note-detail">{m.read[0].toUpperCase() + m.read.slice(1)}.</p>}
      {m.without.visits > 0 && (
        <>
          <p className="note-detail">
            <b className="num">{n(m.without.visits)}</b> {m.without.visits === 1 ? "visit has" : "visits have"} no main {role}; the run goes over the {n(m.main_visits)} that {m.main_visits === 1 ? "has" : "have"} one.
          </p>
          <ul className="preflight-missing preflight-without" aria-label={`visits with no main ${role}`}>
            {without.map((w) => {
              const shown = w.visits.slice(0, 3);
              return (
                <li key={w.why}>
                  <b className="num">{n(w.count)}</b> {w.why}
                  {shown.length > 0 && (
                    <span className="meta">
                      {" "}
                      · {shown.join(", ")}
                      {w.count > shown.length ? ` and ${n(w.count - shown.length)} more` : ""}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

/** What the run needs of this machine, one check a line: its border says whether it holds, its words are the engine's. */
export function Requirements({ checks }: { checks: Requirement[] }) {
  if (checks.length === 0) return null;
  return (
    <ul className="requirements" aria-label="what the run needs of this machine">
      {checks.map((c, i) => (
        <li key={`${c.check}${i}`} className={c.ok ? "req ok" : "req not"}>
          <span className="req-check">{c.check}</span>
          <span className="req-said">{c.said}</span>
        </li>
      ))}
    </ul>
  );
}
