// SPDX-License-Identifier: AGPL-3.0-only
// The pack's quality (record 56, sections 2, 4.1 and 6.4): first the answers
// the pack cannot rank, a defect of the pack and never a person's question;
// then the rules that win over another, the overrides kept as evidence of
// why, by rule pair; then System 1's disagreements with the rules, which wait
// until it is served. Each row says its axis, its two rules and their values,
// how many scans and some of their pictures, and offers the one change that
// would mend it, filled in on the Change a rule tab. Read from the quality
// report, or from an engine before it, the ties alone.

import { useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { Wait } from "../ui/Wait";
import { refusalWords, type PackDoc } from "./client";
import { Scans, ValueTag } from "./EffectReport";
import { draftOfOverride, draftOfTie, rankWords, tieWhy, type Draft, type Quality, type Side } from "./quality";
import { DOORS, readsQuality, rulesDoors } from "./rulesDoors";

const n = (v: number) => v.toLocaleString("en-US");

type Load = { kind: "loading"; since: number } | { kind: "failed"; why: string } | { kind: "ready"; value: Quality; report: boolean } | { kind: "absent" };

export interface QualityProps {
  caps: Capabilities;
  pack: PackDoc | null;
  /** One dataset's stacks alone, where the page was opened for it. */
  dataset?: string | null;
  /** A change filled in to mend a row. */
  onMend: ((d: Draft) => void) | null;
  onOpen?: (stack: number) => void;
}

/** A rule and the value it writes. */
function RuleSide({ pack, axis, side }: { pack: PackDoc | null; axis: string; side: Side }) {
  return (
    <span className="rq-side">
      <ValueTag pack={pack} axis={axis} value={side.value} />
      <span className="mono rq-rule">{side.rule_set ? `${side.rule_set}/${side.rule}` : side.rule}</span>
    </span>
  );
}

const count = (pairs: number, stacks: number) => (pairs === 0 ? "none" : `${n(pairs)} ${pairs === 1 ? "pair" : "pairs"} · ${n(stacks)} scans`);

export function RuleQuality({ caps, pack, dataset = null, onMend, onOpen }: QualityProps) {
  const [load, setLoad] = useState<Load>(() => (readsQuality(caps) ? { kind: "loading", since: Date.now() } : { kind: "absent" }));
  const name = pack?.pack ?? null;
  useEffect(() => {
    if (!name || !readsQuality(caps)) {
      setLoad({ kind: "absent" });
      return;
    }
    let alive = true;
    setLoad({ kind: "loading", since: Date.now() });
    // the report where the engine gathers it; from an engine before it, the ties alone
    const read: Promise<{ value: Quality; report: boolean }> = served(caps, DOORS.quality)
      ? rulesDoors.quality(name, dataset).then((value) => ({ value, report: true }))
      : rulesDoors.ties(name).then((ties) => ({ value: { stacks: 0, ties, overrides: { stacks: 0, overrides: [] }, system1: { served: false, model: null, why: null, rows: [] } }, report: false }));
    read.then(
      (r) => alive && setLoad({ kind: "ready", ...r }),
      (e: unknown) => alive && setLoad({ kind: "failed", why: refusalWords(e) }),
    );
    return () => {
      alive = false;
    };
  }, [caps, name, dataset]);

  if (load.kind === "loading") return <Wait phase="reading the pack's quality" since={load.since} size="panel" />;
  if (load.kind === "failed") return <p className="warn">The pack's quality could not be read: {load.why}</p>;
  if (load.kind === "absent") return <p className="rq-none">This engine does not gather the pack's quality.</p>;
  const { ties, overrides, system1 } = load.value;
  return (
    <div className="rq">
      <section className="rq-sec" aria-label="Answers the pack cannot rank">
        <div className="rq-head">
          <h2>Two rules, no rank</h2>
          <span className="meta">{count(ties.ties.length, ties.stacks)}</span>
        </div>
        {ties.ties.length === 0 && <p className="rq-none">The pack ranks every answer it gives.</p>}
        {ties.ties.map((t) => (
          <div key={t.pair} className="rq-row rq-tie">
            <span className="rq-axis">{t.axis}</span>
            <span className="rq-pair">
              {t.sides.map((s, i) => (
                <RuleSide key={i} pack={pack} axis={t.axis} side={s} />
              ))}
            </span>
            <span className="rq-count num">{n(t.stacks)}</span>
            <span className="meta rq-why">{tieWhy(t)}</span>
            <Scans caps={caps} stacks={t.examples} onOpen={onOpen} limit={4} />
            {onMend && (
              <button type="button" className="button secondary small rq-act" onClick={() => onMend(draftOfTie(t))}>
                Mend
              </button>
            )}
          </div>
        ))}
      </section>

      <section className="rq-sec" aria-label="Rules that win over another">
        <div className="rq-head">
          <h2>One rule over another</h2>
          <span className="meta">{load.report ? count(overrides.overrides.length, overrides.stacks) : ""}</span>
        </div>
        {!load.report && <p className="rq-none">Counted by the engine's next release.</p>}
        {load.report && overrides.overrides.length === 0 && <p className="rq-none">No rule won over another on the last sort.</p>}
        {overrides.overrides.map((o) => {
          const d = draftOfOverride(o);
          return (
            <div key={o.pair} className="rq-row rq-over">
              <span className="rq-axis">{o.axis}</span>
              <span className="rq-pair">
                <RuleSide pack={pack} axis={o.axis} side={o.winner} />
                <span className="meta rq-over-word">over</span>
                <RuleSide pack={pack} axis={o.axis} side={o.loser} />
              </span>
              <span className="rq-count num">{n(o.stacks)}</span>
              <span className="meta rq-why">{rankWords(o.rank)}</span>
              <Scans caps={caps} stacks={o.examples} onOpen={onOpen} limit={4} />
              {onMend && d && (
                <button type="button" className="button secondary small rq-act" onClick={() => onMend(d)}>
                  Turn it round
                </button>
              )}
            </div>
          );
        })}
      </section>

      <section className="rq-sec" aria-label="Where System 1 disagrees">
        <div className="rq-head">
          <h2>System 1 disagrees</h2>
          <span className="meta">{system1.served ? count(system1.rows.length, system1.rows.reduce((s, r) => s + r.stacks, 0)) : ""}</span>
        </div>
        {!system1.served && <p className="rq-none">Not served yet.</p>}
        {system1.served && system1.rows.length === 0 && <p className="rq-none">System 1 agrees with the rules{system1.model ? ` (${system1.model})` : ""}.</p>}
        {system1.rows.map((r) => (
          <div key={`${r.axis}:${r.rules}>${r.system1}`} className="rq-row rq-s1">
            <span className="rq-axis">{r.axis}</span>
            <span className="rq-pair">
              <span className="rq-side">
                <ValueTag pack={pack} axis={r.axis} value={r.rules} />
                <span className="meta">the rules</span>
              </span>
              <span className="rq-side">
                <ValueTag pack={pack} axis={r.axis} value={r.system1} />
                <span className="meta">System 1</span>
              </span>
            </span>
            <span className="rq-count num">{n(r.stacks)}</span>
            <span className="meta rq-why">{system1.model ?? ""}</span>
            <Scans caps={caps} stacks={r.examples} onOpen={onOpen} limit={4} />
          </div>
        ))}
      </section>
    </div>
  );
}
