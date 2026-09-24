// SPDX-License-Identifier: AGPL-3.0-only
// The candidate list (record 45 R5, study A3): System 1's legal candidates for
// one stack, most probable first, each one line with its p and its values,
// the axes where the rules and the model disagree marked. Both systems'
// evidence and the certificate sit in closed disclosures (record 27).
// Choosing a candidate answers every axis at once; None of these hands the
// stack to a person axis by axis.

import type { Asked, AskedCandidate } from "./asked";
import { modelTop, rulesP, valueWords } from "./asked";
import "./grown.css";

const p = (v: number | null) => (v === null ? "" : v.toFixed(2));

export interface CandidateListProps {
  asked: Asked;
  /** Null draws the list without a choice. */
  onChoose: ((c: AskedCandidate) => void) | null;
  onNone: (() => void) | null;
  busy?: boolean;
}

export function CandidateList({ asked, onChoose, onNone, busy = false }: CandidateListProps) {
  const axes = [...new Set([...asked.axes, ...Object.keys(asked.rules)])];
  return (
    <div className="stack roomy">
      {asked.candidates.length === 0 ? (
        <p className="meta">No legal candidate to offer.</p>
      ) : (
        <ol className="candidates" aria-label="Legal candidates, most probable first">
          {asked.candidates.map((c) => (
            <li key={JSON.stringify(c.values)} className="candidate">
              <span className="p num">{p(c.p)}</span>
              <span className="cand-values">
                {Object.entries(c.values).map(([axis, v]) => (
                  <span key={axis} className={asked.differ.includes(axis) ? "tag caution differ" : "tag"} title={asked.differ.includes(axis) ? "the two systems disagree here" : undefined}>
                    {axis} {valueWords(v)}
                  </span>
                ))}
              </span>
              {onChoose ? (
                <button type="button" className="button small" disabled={busy} onClick={() => onChoose(c)}>
                  Choose
                </button>
              ) : (
                <span />
              )}
            </li>
          ))}
        </ol>
      )}
      {asked.dropped > 0 && (
        <p className="meta">
          {asked.dropped} {asked.dropped === 1 ? "candidate" : "candidates"} left out: not legal under this pack.
        </p>
      )}
      {onNone && (
        <div className="row actions">
          <button type="button" className="button secondary small" disabled={busy} onClick={onNone}>
            None of these
          </button>
        </div>
      )}
      <details className="says">
        <summary>Both systems{asked.differ.length > 0 ? `, disagreeing on ${asked.differ.join(", ")}` : ", agreeing"}</summary>
        {asked.model?.name && <p className="meta">The model is {asked.model.name}.</p>}
        <div className="table-wrap">
          <table className="thin">
            <thead>
              <tr>
                <th>Axis</th>
                <th>Rules</th>
                <th>Model</th>
              </tr>
            </thead>
            <tbody>
              {axes.map((axis) => {
                const r = asked.rules[axis];
                const m = modelTop(asked, axis);
                return (
                  <tr key={axis}>
                    <td>{axis}</td>
                    <td>
                      {r?.value ?? "no value"}
                      {r?.rule ? <span className="meta"> · {r.rule_set ? `${r.rule_set}/` : ""}{r.rule}</span> : null}
                      {r && r.votes.length > 1 ? <span className="meta"> · {r.votes.length} votes</span> : null}
                      {r && rulesP(r) !== null ? <span className="meta"> · p {p(rulesP(r))}</span> : null}
                    </td>
                    <td>{m ? `${m.value} · p ${p(m.p)}` : "no answer"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
      {asked.certificate && (
        <details className="says">
          <summary>The certificate</summary>
          <div className="values">
            <div>
              <span className="k">score</span>
              <span className="v">{p(asked.certificate.score)}</span>
            </div>
            <div>
              <span className="k">threshold</span>
              <span className="v">{p(asked.certificate.threshold)}</span>
            </div>
            <div>
              <span className="k">risk level</span>
              <span className="v">{p(asked.certificate.risk)}</span>
            </div>
            <div>
              <span className="k">delta</span>
              <span className="v">{p(asked.certificate.delta)}</span>
            </div>
            {asked.certificate.auto !== null && (
              <div>
                <span className="k">decided without a person</span>
                <span className="v">{asked.certificate.auto ? "yes" : "no"}</span>
              </div>
            )}
            {asked.certificate.group && (
              <div>
                <span className="k">group</span>
                <span className="v">{asked.certificate.group}</span>
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
