// SPDX-License-Identifier: AGPL-3.0-only
// Both suggestions and both reasons beside a question (Wave 7a, record 55
// D3 and D6; spec 11.3): the rules' answer with the rule that decided, the
// fields it read and the words it matched, and System 1's with its
// probability, the rules' reliability on the header, the fields that
// mattered and a few settled scans like it, shown for display and never as
// votes. Until a certificate confirms System 1 its column says so.

import "./s1.css";
import { prob, readWords, ruleWords, s1Words, valueWords, type Suggestions } from "./s1";

const STACKS_SHOWN = 3;

export function BothSides({ doc, axis }: { doc: Suggestions; axis?: string | null }) {
  const status = doc.system1.status;
  const stacks = doc.stacks.slice(0, STACKS_SHOWN);
  return (
    <div className="both-sides" aria-label="Both suggestions">
      {stacks.map((s) => (
        <div key={s.stack_id} className="both-stack">
          {doc.stacks.length > 1 && <span className="meta">Scan {s.stack_id}</span>}
          {s.axes
            .filter((a) => !axis || a.axis === axis)
            .map((a) => {
              const o = a.system1;
              const agree = o && o.agrees;
              return (
                <div key={a.axis} className={`both-row ${o ? (agree ? "agree" : "differ") : "alone"}`}>
                  <section className="both-side rules" aria-label={`The rules on ${a.axis}`}>
                    <span className="eyebrow">Rules</span>
                    <b className="side-value">{valueWords(a.rules.value)}</b>
                    <span className="meta">{ruleWords(a.rules)}</span>
                    {readWords(a.rules) && <span className="meta">read {readWords(a.rules)}</span>}
                    {a.rules.decided?.matched && <span className="meta">matched “{a.rules.decided.matched}”</span>}
                  </section>
                  <section className={`both-side s1 ${status}`} aria-label={`System 1 on ${a.axis}`}>
                    <span className="eyebrow">{s1Words(status)}</span>
                    {status === "no_model" ? (
                      <span className="meta">{doc.system1.why}</span>
                    ) : o ? (
                      <>
                        <b className="side-value">{valueWords(o.value)}</b>
                        <span className="meta">
                          p {prob(o.p)} · rules reliable {prob(o.reliability)}
                        </span>
                        {o.fields && o.fields.length > 0 && (
                          <span className="meta">
                            mattered:{" "}
                            {o.fields
                              .slice(0, 3)
                              .map((f) => `${f.field.replace(/^text_/u, "").replace(/_/gu, " ")} ${f.effect >= 0 ? "+" : ""}${f.effect.toFixed(2)}`)
                              .join(" · ")}
                          </span>
                        )}
                        {o.similar && o.similar.length > 0 && (
                          <span className="meta similar">
                            settled like it (for display, not votes):{" "}
                            {o.similar.map((x) => `${x.series_description ?? `scan ${x.stack_id}`} ${valueWords(x.value)}`).join(" · ")}
                          </span>
                        )}
                        {status === "not_confirmed" && <span className="meta">{doc.system1.why}</span>}
                      </>
                    ) : (
                      <span className="meta">no opinion on this scan yet</span>
                    )}
                  </section>
                </div>
              );
            })}
        </div>
      ))}
      {doc.total_stacks > STACKS_SHOWN && <span className="meta">{doc.total_stacks - STACKS_SHOWN} more scans in this question</span>}
    </div>
  );
}
