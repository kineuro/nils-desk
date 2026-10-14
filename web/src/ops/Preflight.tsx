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
// named at detail quasi. Since 2026-10-12 (Nima: "these sessions cannot be
// [run] unless they have whatever"): the units that cannot run are one line a
// reason, in the engine's few words, with the units under it, and a run whose
// units can all run says so plainly; a run taken up again says how many of
// its units it keeps.

import type React from "react";
import { roleWord } from "../review/mainScans";
import { Icon } from "../ui/Icon";
import { Values } from "../ui/Says";
import { failureWords, type Failure, type Requirement } from "./failure";
import { FailNote, KindTag } from "./Reason";
import { blockedOf, cannotOf, mainReadOf, mainReadRoles, preflightCells, preflightChecks, preflightGate, unitWord, unitsWords, withoutByWhy, type MainRead, type Preflight } from "./runs";

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
  const main = mainReadOf(p);
  const r = p.resume;
  return (
    <div className={gate.go ? "note brand preflight" : "note caution preflight"}>
      <Icon name={gate.go ? "check" : "alert"} />
      <div className="note-body">
        <p className="note-lead">{gate.go ? "Pre-flight" : "Not ready"}</p>
        <Values cells={preflightCells(p)} />
        {r && r.kept > 0 && (
          <p className="note-detail">
            {unitsWords(r.kept, unitWord(p))} over before {r.kept === 1 ? "is" : "are"} kept ({n(r.made)} made).
          </p>
        )}
        {main && <MainWithout m={main} />}
        <CannotList p={p} />
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

/** How many units a reason holds: its count, or fewer than five where the engine withholds it. */
const countWords = (count: number | null): string => (count === null ? "fewer than five" : n(count));

/** The units that cannot run, one line a reason with the units under it ("2 sessions cannot run: no FLAIR picked"), or, where every one can, that they all can. */
export function CannotList({ p }: { p: Preflight }) {
  const word = unitWord(p);
  const cannot = cannotOf(p);
  if (cannot.length === 0) {
    const total = p.units.total;
    if (total === 0 || p.units.missing > 0) return null;
    return <p className="note-detail can-run">{total === 1 ? `The one ${word} can run.` : `All ${unitsWords(total, word)} can run.`}</p>;
  }
  return (
    <ul className="preflight-missing preflight-cannot" aria-label={`the ${word}s that cannot run`}>
      {cannot.map((c) => {
        const shown = c.units.slice(0, 6);
        const more = (c.count ?? c.units.length) - shown.length;
        return (
          <li key={c.why}>
            <b className="num">{countWords(c.count)}</b> {c.count === 1 ? word : `${word}s`} cannot run: {c.why}
            {shown.length > 0 && (
              <div className="meta cannot-units">
                {shown.join(", ")}
                {more > 0 ? ` and ${n(more)} more` : ""}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** The main scans read, and the visits with none by why: "12 visits have no main T1w", each reason with the visits it names; of several roles, the visits that lack one ("1 visit lacks a main FLAIR; the run goes over the 2 that have both"). */
export function MainWithout({ m }: { m: MainRead }) {
  const roles = mainReadRoles(m);
  const several = roles.length > 1;
  const role = roleWord(m.main);
  const without = withoutByWhy(m);
  // the roles the visits that lack one lack, as the engine counts them by role
  const lacked = several ? [...new Set((m.without.why ?? []).map((w) => w.role).filter((r): r is string => typeof r === "string"))] : [];
  const lacking = (lacked.length > 0 ? lacked : roles).map(roleWord);
  const orWords = lacking.length <= 1 ? (lacking[0] ?? "") : `${lacking.slice(0, -1).join(", ")} or ${lacking[lacking.length - 1]}`;
  return (
    <div className="preflight-main">
      {m.read && <p className="note-detail">{m.read[0].toUpperCase() + m.read.slice(1)}.</p>}
      {m.without.visits > 0 && (
        <>
          {several ? (
            <p className="note-detail">
              <b className="num">{n(m.without.visits)}</b> {m.without.visits === 1 ? "visit lacks" : "visits lack"} a main {orWords}; the run goes over the {n(m.main_visits)} that {m.main_visits === 1 ? "has" : "have"} {roles.length === 2 ? "both" : "each"}.
            </p>
          ) : (
            <p className="note-detail">
              <b className="num">{n(m.without.visits)}</b> {m.without.visits === 1 ? "visit has" : "visits have"} no main {role}; the run goes over the {n(m.main_visits)} that {m.main_visits === 1 ? "has" : "have"} one.
            </p>
          )}
          <ul className="preflight-missing preflight-without" aria-label={several ? "visits that lack a role" : `visits with no main ${role}`}>
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
