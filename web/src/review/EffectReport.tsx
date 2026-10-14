// SPDX-License-Identifier: AGPL-3.0-only
// A rule change's effect on the sorting (record 56, section 5.4), drawn the
// same wherever a change is decided: on the Rules page as it is written, on
// a proposal's approval card, and in the one chat. Its line first (how many
// scans move, the largest moves, what it does to the answers we know) and
// where it lands; then any answer it breaks, with its scans, which is never
// folded away (5.6); then each part behind a line of its own that says its
// counts: the moves per axis with their datasets, sites, makes and pictures,
// the answers we know, the names, the main scans, Review, and the checks.

import type { Capabilities } from "../capabilities";
import { Thumb } from "../campaigns/Thumb";
import { slotOf } from "../campaigns/values";
import type { PackDoc } from "./client";
import {
  answersWords,
  caseGroups,
  caseWords,
  effectLine,
  namesWords,
  picksWords,
  reachWords,
  reviewWords,
  rolesOf,
  tallyWords,
  valueWords,
  type AnswerCase,
  type Effect,
} from "./effect";
import { thumbOf } from "./rulesDoors";

const n = (v: number) => v.toLocaleString("en-US");

/** A value of an axis in its colour: its frame, its bar and its tint, by its place among the axis's values; a set or nothing stays plain. */
export function ValueTag({ pack, axis, value }: { pack: PackDoc | null; axis: string; value: string }) {
  const values = pack?.axes.find((a) => a.axis === axis)?.values.map((v) => v.value) ?? [];
  const slot = value.includes(",") ? null : slotOf(values, value);
  return (
    <span className={value === "" ? "value-tag rx-none" : slot === null ? "value-tag rx-plain" : "value-tag"} data-slot={slot ?? undefined}>
      {valueWords(value)}
    </span>
  );
}

/** Some scans as their pictures, each with its id, a press opening why it was sorted so; the rest counted, or with `named` each named by its number. */
export function Scans({ caps, stacks, titles, onOpen, limit = 5, named = false }: { caps: Capabilities; stacks: number[]; titles?: Record<number, string>; onOpen?: (stack: number) => void; limit?: number; named?: boolean }) {
  const shown = stacks.slice(0, limit);
  if (shown.length === 0) return null;
  return (
    <span className="rx-scans">
      {shown.map((s) => {
        const src = thumbOf(caps, s);
        const title = titles?.[s] ?? `scan ${s}`;
        const body = (
          <>
            {src && (
              <span className="rx-pic">
                <Thumb src={src} loading="lazy" />
              </span>
            )}
            <span className="rx-id">{s}</span>
          </>
        );
        return onOpen ? (
          <button key={s} type="button" className="rx-scan" title={title} aria-label={`Why ${title} is sorted so`} onClick={() => onOpen(s)}>
            {body}
          </button>
        ) : (
          <span key={s} className="rx-scan" title={title}>
            {body}
          </span>
        );
      })}
      {stacks.length > shown.length && (named ? <span className="meta mono rx-also">also {stacks.slice(shown.length).join(", ")}</span> : <span className="meta">+{n(stacks.length - shown.length)}</span>)}
    </span>
  );
}

/** The answers a change breaks, said with their scans, in the caution colour: never folded away (record 56, 5.6). */
export function BreaksBox({ caps, pack = null, count: said, cases, onOpen }: { caps: Capabilities; pack?: PackDoc | null; count: number; cases: AnswerCase[]; onOpen?: (stack: number) => void }) {
  if (said === 0 && cases.length === 0) return null;
  const count = Math.max(said, cases.length);
  return (
    <div className="rx-breaks" aria-label="The answers it breaks">
      <p className="rx-breaks-head">
        Breaks {n(count)} {count === 1 ? "answer" : "answers"} people settled
        {cases.length < count && <span className="meta"> · the first {n(cases.length)} shown</span>}
      </p>
      <CaseGroups caps={caps} pack={pack} cases={cases} onOpen={onOpen} />
    </div>
  );
}

/** The answers a change's report says it breaks. */
export function Breaks({ caps, pack = null, effect, onOpen }: { caps: Capabilities; pack?: PackDoc | null; effect: Effect; onOpen?: (stack: number) => void }) {
  return <BreaksBox caps={caps} pack={pack} count={effect.answers.breaks} cases={effect.answers.right_to_wrong} onOpen={onOpen} />;
}

/** How many pictures a group of answers shows; the rest are named by their scan's number. */
const PICTURED = 8;

/** Answers that changed alike, a row each: the axis, what the rules said and say now, what people settled, and every scan, the first ones as pictures. */
function CaseGroups({ caps, pack, cases, onOpen }: { caps: Capabilities; pack: PackDoc | null; cases: AnswerCase[]; onOpen?: (stack: number) => void }) {
  return (
    <ul className="rx-cases">
      {caseGroups(cases).map((g) => (
        <li key={`${g.axis}|${g.answer}|${g.before}|${g.after}`} aria-label={caseWords(g)}>
          <span className="rx-case">
            <b>{g.axis}</b>
            <ValueTag pack={pack} axis={g.axis} value={g.before} />
            <span className="rx-arrow">→</span>
            <ValueTag pack={pack} axis={g.axis} value={g.after} />
            <span className="meta">
              settled {valueWords(g.answer)} · {n(g.stacks.length)} {g.stacks.length === 1 ? "scan" : "scans"}
            </span>
          </span>
          <Scans caps={caps} stacks={g.stacks} onOpen={onOpen} limit={PICTURED} named />
        </li>
      ))}
    </ul>
  );
}

/** The effect's line and where it lands: what a card says before anything is opened. */
export function EffectHead({ effect }: { effect: Effect }) {
  return (
    <div className="rx-head">
      <p className="rx-line">{effectLine(effect)}</p>
      <p className="meta rx-reach">
        {reachWords(effect.ships)} · replayed over {n(effect.scope.stacks)} scans
        {effect.scope.sealed_left_out > 0 ? `, ${n(effect.scope.sealed_left_out)} sealed left out` : ""}
        {effect.seconds !== null ? ` in ${effect.seconds.toLocaleString("en-US", { maximumFractionDigits: 1 })} s` : ""}
      </p>
    </div>
  );
}

/** The whole report: the head where `head` is set, the breaks, then each part behind its line. */
export function EffectReport({ caps, effect, pack, head = true, breaks = true, onOpen }: { caps: Capabilities; effect: Effect; pack: PackDoc | null; head?: boolean; breaks?: boolean; onOpen?: (stack: number) => void }) {
  const a = effect.answers;
  const measured = a.sets.reduce((s, x) => s + x.answers, 0);
  const roles = rolesOf(effect.picks);
  const axes = Object.entries(a.by_axis).filter(([, t]) => t.answers > 0);
  return (
    <div className="rx" aria-label="What the change does">
      {head && <EffectHead effect={effect} />}
      {breaks && <Breaks caps={caps} pack={pack} effect={effect} onOpen={onOpen} />}

      <details className="rx-sec" open={effect.axes.length > 0}>
        <summary>
          <span className="eyebrow">Moves</span>
          <span className="rx-sum">{effect.moved === 0 ? "No scan moves" : `${n(effect.moved)} ${effect.moved === 1 ? "scan moves" : "scans move"} on ${n(effect.axes.length)} ${effect.axes.length === 1 ? "axis" : "axes"}`}</span>
        </summary>
        {effect.axes.map((ax) => (
          <div key={ax.axis} className="rx-axis">
            <p className="rx-axis-head">
              <b>{ax.axis}</b>
              <span className="meta">
                {n(ax.moved)} moved{ax.held_by_decision > 0 ? ` · ${n(ax.held_by_decision)} more held by a person's decision` : ""}
              </span>
            </p>
            {ax.transitions.map((t) => (
              <div key={`${t.from}>${t.to}`} className="rx-move">
                <span className="rx-from-to">
                  <ValueTag pack={pack} axis={ax.axis} value={t.from} />
                  <span className="rx-arrow">→</span>
                  <ValueTag pack={pack} axis={ax.axis} value={t.to} />
                </span>
                <span className="rx-count num">{n(t.stacks)}</span>
                <span className="rx-where meta">
                  {[tallyWords(t.datasets), Object.keys(t.sites).some((s) => s !== "(none)") ? `sites ${tallyWords(t.sites)}` : "", tallyWords(t.makes)].filter(Boolean).join(" · ")}
                </span>
                <Scans
                  caps={caps}
                  stacks={t.examples.map((e) => e.stack)}
                  titles={Object.fromEntries(t.examples.filter((e) => e.names).map((e) => [e.stack, `${e.names!.before.name} → ${e.names!.after.name}`]))}
                  onOpen={onOpen}
                />
              </div>
            ))}
          </div>
        ))}
      </details>

      <details className="rx-sec" open={a.fixes + a.breaks > 0}>
        <summary>
          <span className="eyebrow">Answers we know</span>
          <span className="rx-sum">
            {measured === 0 ? answersWords(a) : `${answersWords(a)}, net ${a.net > 0 ? "+" : ""}${n(a.net)}, on ${n(measured)} settled answers`}
          </span>
        </summary>
        {axes.length > 0 && (
          <div className="table-wrap">
            <table className="thin rx-table">
              <thead>
                <tr>
                  <th>Axis</th>
                  <th className="num">answers</th>
                  <th className="num">right → wrong</th>
                  <th className="num">wrong → right</th>
                  <th className="num">none → right</th>
                  <th className="num">right → none</th>
                  <th className="num">unchanged</th>
                </tr>
              </thead>
              <tbody>
                {axes.map(([axis, t]) => (
                  <tr key={axis}>
                    <td>{axis}</td>
                    <td className="num">{n(t.answers)}</td>
                    <td className={t.right_to_wrong > 0 ? "num rx-bad" : "num"}>{n(t.right_to_wrong)}</td>
                    <td className={t.wrong_to_right > 0 ? "num rx-good" : "num"}>{n(t.wrong_to_right)}</td>
                    <td className={t.unanswered_to_right > 0 ? "num rx-good" : "num"}>{n(t.unanswered_to_right)}</td>
                    <td className={t.right_to_unanswered > 0 ? "num rx-bad" : "num"}>{n(t.right_to_unanswered)}</td>
                    <td className="num">{n(t.unchanged)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {a.wrong_to_right.length > 0 && (
          <div className="rx-fixes">
            <p className="rx-fixes-head">The answers it fixes</p>
            <CaseGroups caps={caps} pack={pack} cases={a.wrong_to_right} onOpen={onOpen} />
          </div>
        )}
        {a.sets.length > 0 && <p className="meta">Measured on {a.sets.map((s) => `${s.name}${s.sealed_left_out > 0 ? ` (${n(s.sealed_left_out)} sealed left out)` : ""}`).join("; ")}. Sealed samples are never read for this.</p>}
      </details>

      <details className="rx-sec">
        <summary>
          <span className="eyebrow">Names</span>
          <span className="rx-sum">{namesWords(effect.names)}</span>
        </summary>
        {effect.names.examples.length > 0 && (
          <div className="table-wrap">
            <table className="thin rx-table rx-names">
              <thead>
                <tr>
                  <th>Scan</th>
                  <th>Before</th>
                  <th>After</th>
                </tr>
              </thead>
              <tbody>
                {effect.names.examples.map((r) => (
                  <tr key={r.stack}>
                    <td className="num">{r.stack}</td>
                    <td className="mono">
                      {r.before.name}
                      {r.before.bids !== r.after.bids && <div className="meta">{r.before.bids ?? "no BIDS name"}</div>}
                    </td>
                    <td className="mono">
                      {r.after.name}
                      {r.before.bids !== r.after.bids && <div className="meta">{r.after.bids ?? "no BIDS name"}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </details>

      <details className="rx-sec">
        <summary>
          <span className="eyebrow">Main scans</span>
          <span className="rx-sum">{picksWords(effect.picks)}</span>
        </summary>
        {roles.length > 0 && (
          <div className="table-wrap">
            <table className="thin rx-table">
              <thead>
                <tr>
                  <th>Role</th>
                  <th className="num">kept</th>
                  <th className="num">changed</th>
                  <th className="num">removed</th>
                  <th className="num">added</th>
                  <th className="num">a person's pick holds</th>
                  <th className="num">borders raised</th>
                  <th className="num">settled</th>
                </tr>
              </thead>
              <tbody>
                {roles.map(({ role, counts: c }) => (
                  <tr key={role}>
                    <td>{role}</td>
                    <td className="num">{n(c.kept)}</td>
                    <td className="num">{n(c.changed)}</td>
                    <td className="num">{n(c.removed)}</td>
                    <td className="num">{n(c.added)}</td>
                    <td className="num">{n(c.held_by_a_person)}</td>
                    <td className="num">{n(c.borders.raised)}</td>
                    <td className="num">{n(c.borders.settled)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </details>

      <details className="rx-sec">
        <summary>
          <span className="eyebrow">Review</span>
          <span className="rx-sum">{reviewWords(effect.review)}</span>
        </summary>
        {effect.review.by_kind.length > 0 && (
          <ul className="rx-kinds">
            {effect.review.by_kind.map((k) => (
              <li key={k.kind}>
                <span className="mono">{k.kind}</span>
                {k.appear > 0 && <span className="rx-bad">{n(k.appear)} appear</span>}
                {k.disappear > 0 && <span className="rx-good">{n(k.disappear)} go</span>}
              </li>
            ))}
          </ul>
        )}
      </details>

      <details className="rx-sec">
        <summary>
          <span className="eyebrow">Checks</span>
          <span className="rx-sum">{effect.cases.held ? "The pack's own cases hold" : "Some of the pack's cases no longer hold"}</span>
        </summary>
        {effect.cases.failures && <pre className="rx-pre">{effect.cases.failures}</pre>}
        {effect.applied.length > 0 && (
          <ul className="rx-applied">
            {effect.applied.map((x) => (
              <li key={x.at}>
                <span className="mono">{x.op}</span> {x.scope}: {x.changes.join("; ")}
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}
