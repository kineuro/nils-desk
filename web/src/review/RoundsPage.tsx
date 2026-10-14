// SPDX-License-Identifier: AGPL-3.0-only
// The review rounds (Wave 7a, record 55 D3 and D7; spec 11.2 and 11.5): a
// round is a rules version and a System 1 version. Each says what it
// accepted and what it sent to Review, by kind, that it sent nothing for a
// conflict, a low confidence, body part or post-contrast, System 1's
// coverage, and how many answers were given blind; and its blind audits,
// a seeded share of what it accepted read by agent raters, with the
// accepted error and its exact bound. One act each: draw the audit, grade it.

import { useCallback, useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";
import { href } from "../routes";
import { Wait } from "../ui/Wait";
import { gradeWords, neverAskedHolds, pct, s1, type Draw, type RoundReport, type Rounds } from "./s1";
import "./s1.css";

const n = (v: number) => v.toLocaleString("en-US");

type Load = { kind: "loading"; since: number } | { kind: "failed"; why: string } | { kind: "ready"; value: Rounds };

export function RoundsPage({ caps }: { caps: Capabilities }) {
  const [load, setLoad] = useState<Load>(() => ({ kind: "loading", since: Date.now() }));
  const [said, setSaid] = useState<string | null>(null);
  const read = useCallback(() => {
    s1.rounds().then(
      (r) => setLoad({ kind: "ready", value: r }),
      (e: Error) => setLoad({ kind: "failed", why: e.message }),
    );
  }, []);
  useEffect(read, [read]);
  return (
    <RoundsBody
      caps={caps}
      load={load}
      said={said}
      onDraw={(round) =>
        s1.draw(round === null ? {} : { round }).then(
          (r) => (setSaid(`Drew ${n(r.draw.drawn)} of ${n(r.draw.frame.stacks)} accepted scans into ${r.campaign.name}.`), read()),
          (e: Error) => setSaid(`The audit was not drawn: ${e.message}`),
        )
      }
      onGrade={(id) =>
        s1.grade(id).then(
          (r) => (setSaid(`Graded: ${gradeWords(r.grade)}.`), read()),
          (e: Error) => setSaid(`Not graded: ${e.message}`),
        )
      }
    />
  );
}

export interface RoundsBodyProps {
  caps: Capabilities;
  load: Load;
  said?: string | null;
  onDraw: (round: number | null) => void;
  onGrade: (draw: number) => void;
}

export function RoundsBody({ caps, load, said = null, onDraw, onGrade }: RoundsBodyProps) {
  const acts = may(caps, "review:work") && may(caps, "campaigns:work") && served(caps, "POST /api/audit/draws");
  const grades = may(caps, "review:work") && served(caps, "POST /api/audit/draws/{id}/grade");
  const r = load.kind === "ready" ? load.value : null;
  return (
    <section className="data review rounds">
      <div className="data-head">
        <div className="grow">
          <span className="eyebrow">Review</span>
          <h1>Rounds</h1>
          <p className="lede">What each rules version and System 1 accepted, what went to a person, and the blind audit of what was accepted.</p>
        </div>
        {acts && r && (
          <button type="button" className="button" onClick={() => onDraw(null)}>
            Draw the audit
          </button>
        )}
      </div>
      <div className="chips pages">
        <a className="opt" href={href("review")}>
          Work
        </a>
        <a className="opt on" href={href("review", "rounds")} aria-current="page">
          Rounds
        </a>
      </div>
      {said && <p className="meta said">{said}</p>}
      {load.kind === "loading" && <Wait phase="reading the rounds" since={load.since} size="panel" />}
      {load.kind === "failed" && <p className="warn">The rounds could not be read: {load.why}</p>}
      {r && (
        <p className="meta">
          Now: rules {r.current.pack ?? "none"}@{r.current.pack_version ?? "?"} · System 1 {r.current.model ? `${r.current.model.name}@${r.current.model.version}` : "none chosen"}
          {r.current.model && (r.current.confirmed ? " · confirmed" : " · not confirmed")}
        </p>
      )}
      {r && r.rounds.length === 0 && <p className="meta">No round yet: one begins with the gate or the first audit draw.</p>}
      {r && r.rounds.map((rep, i) => <RoundCard key={rep.round.id} rep={rep} current={i === 0} acts={acts} grades={grades} onDraw={onDraw} onGrade={onGrade} />)}
    </section>
  );
}

function Num({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <span className="num-cell">
      <span className="meta">{label}</span>
      <b>{value}</b>
      {sub && <span className="meta">{sub}</span>}
    </span>
  );
}

function RoundCard({ rep, current, acts, grades, onDraw, onGrade }: { rep: RoundReport; current: boolean; acts: boolean; grades: boolean; onDraw: (r: number) => void; onGrade: (d: number) => void }) {
  const kinds = Object.entries(rep.review_by_kind).sort((a, b) => b[1] - a[1]);
  const held = neverAskedHolds(rep);
  const blind = rep.answers.blind?.decisions ?? 0;
  const notBlind = rep.answers.not_blind?.decisions ?? 0;
  return (
    <article className={current ? "round current" : "round"} aria-label={`Round ${rep.round.id}`}>
      <div className="round-head">
        <h2>Round {rep.round.id}</h2>
        <span className="tag">{rep.round.rules}</span>
        <span className="tag">{rep.round.model_id ? `System 1 model ${rep.round.model_id}` : "no System 1"}</span>
        {rep.round.model_id && <span className={rep.round.confirmed ? "tag ok" : "tag caution"}>{rep.round.confirmed ? "confirmed" : "not confirmed"}</span>}
        {acts && (
          <button type="button" className="button secondary small" onClick={() => onDraw(rep.round.id)}>
            Draw the audit
          </button>
        )}
      </div>
      <div className="nums">
        <Num label="Scans" value={n(rep.scans)} />
        <Num label="Accepted" value={pct(rep.shares.accepted)} sub={n(rep.accepted)} />
        <Num label="To a person" value={pct(rep.shares.review)} sub={n(rep.reviewed + rep.gate_held)} />
        <Num label="System 1 read" value={pct(rep.system1.coverage)} sub={n(rep.system1.scans_with_opinion)} />
        <Num label="Answers blind" value={n(blind)} sub={`${n(notBlind)} not blind`} />
      </div>
      {kinds.length > 0 && (
        <div className="kinds" aria-label="Sent to Review by kind">
          {kinds.map(([k, v]) => (
            <span key={k} className="tag">
              {k} {n(v)}
            </span>
          ))}
        </div>
      )}
      <span className={held ? "meta never held" : "meta never broken"}>
        {held
          ? "Nothing sent for a rule conflict, a low confidence, body part or post-contrast."
          : `Sent for what the rules decide: ${Object.entries(rep.never_asked)
              .filter(([, v]) => v > 0)
              .map(([k, v]) => `${k.replace(/_/gu, " ")} ${v}`)
              .join(", ")}`}
      </span>
      {Object.keys(rep.gate.outcomes).length > 0 && (
        <span className="meta">
          Gate on flagged datasets: {Object.entries(rep.gate.outcomes).map(([k, v]) => `${k} ${n(v)}`).join(" · ")} · {n(rep.gate.accepted_stacks)} scans accepted whole
        </span>
      )}
      {rep.audits.map((d) => (
        <DrawLine key={d.id} d={d} grades={grades} onGrade={onGrade} />
      ))}
    </article>
  );
}

function DrawLine({ d, grades, onGrade }: { d: Draw; grades: boolean; onGrade: (d: number) => void }) {
  return (
    <div className="draw" aria-label={`Audit draw ${d.id}`}>
      <span className="tag gated">audit · never trains</span>
      <span className="meta">
        {n(d.drawn)} of {n(d.frame.stacks)} accepted scans, seed {d.seed}
      </span>
      <span className="meta">{gradeWords(d.grade)}</span>
      {d.campaign_id !== null && <a href={href("review", "campaigns", String(d.campaign_id))}>Its campaign</a>}
      {grades && d.campaign_id !== null && (
        <button type="button" className="button secondary small" onClick={() => onGrade(d.id)}>
          Grade
        </button>
      )}
    </div>
  );
}
