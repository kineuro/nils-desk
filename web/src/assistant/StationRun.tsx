// SPDX-License-Identifier: AGPL-3.0-only
// One station run on a page (record 26): started headless through the
// assistant, followed to its end, and drawn as its phases and its verdict. The
// page that opens it says what the person may do with the verdict: adopt or
// refuse a keyword-tune's overlay, use or keep the rule an identity-check
// proposes. The station proposes; the acts are the person's.

import { useEffect, useState } from "react";
import type React from "react";
import type { Capabilities } from "../capabilities";
import { assistantModel } from "../sections";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import { clockWords, phasesOf, runTag, sawOf, type Station } from "./runs";
import { stations, type StationRun as Run, type Verdict } from "./stations";

const n = (v: number) => v.toLocaleString("en-US");

export interface StationRunProps {
  caps: Capabilities;
  station: Station;
  /** The message that starts the run: the scope, the axis, the location, in words the station reads. */
  message: string;
  title: string;
  /** What the person may do once the verdict is in; nothing while it runs. */
  acts: (verdict: Verdict, run: Run) => React.ReactNode;
  /** A line under the acts: what stays as it is. */
  aside?: (verdict: Verdict) => React.ReactNode;
  onSettled?: (verdict: Verdict | null, run: Run) => void;
}

export function StationRun({ caps, station, message, title, acts, aside, onSettled }: StationRunProps) {
  const [run, setRun] = useState<Run | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [since] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    stations
      .follow(station, message, (r) => alive && setRun(r))
      .then(({ run: r, verdict: v }) => {
        if (!alive) return;
        setVerdict(v);
        onSettled?.(v, r);
      })
      .catch((e: Error) => alive && setWhy(e.message));
    return () => {
      alive = false;
    };
    // one run per mount: the message names it
  }, [station, message]); // eslint-disable-line react-hooks/exhaustive-deps

  const phases = phasesOf(station, run, verdict);
  const tag = runTag(run, verdict);
  const model = assistantModel(caps);
  const who = caps.person.display_name || caps.person.subject;
  const busy = run === null || run.state === "queued" || run.state === "running";
  const saw = station === "identity-check" ? sawOf(verdict) : [];
  return (
    <div className="run">
      <div className="row run-head">
        <span className="sq brand">
          <Icon name="assistant" />
        </span>
        <div className="grow run-title">
          <h2>{title}</h2>
          <span className="meta">
            the {station} station{model ? ` · ${model}` : ""} · asked by {who}
            {station === "identity-check" ? " · shapes and counts only, never a value or a path" : ""}
          </span>
        </div>
        <span className={`tag ${tag.tone}`}>
          {tag.tone === "ok" && <Icon name="check" />}
          {tag.words}
        </span>
      </div>
      {why && <p className="warn">{why}</p>}
      {saw.length > 0 && (
        <div className="pair">
          {saw.map((s) => {
            const widest = Math.max(1, ...s.shapes.map((x) => x.count));
            return (
              <section key={s.title} className="panel card">
                <div className="row card-head">
                  <h2>{s.title}</h2>
                </div>
                <div className="bybase">
                  {s.shapes.map((x) => (
                    <span key={x.shape} className="bybase-row">
                      <span className="path">{x.shape}</span>
                      <span className="bar">
                        <i className={x.count < widest / 10 ? "unsure" : ""} style={{ width: `${Math.max(1, Math.round((100 * x.count) / widest))}%` }} />
                      </span>
                      <span className="num">{n(x.count)}</span>
                    </span>
                  ))}
                </div>
                <dl className="facts">
                  {s.people !== null && (
                    <>
                      <dt>people</dt>
                      <dd>{n(s.people)} under this rule</dd>
                    </>
                  )}
                  {s.empty !== null && (
                    <>
                      <dt>files with no value</dt>
                      <dd>{n(s.empty)}</dd>
                    </>
                  )}
                  {s.pathAnswer && (
                    <>
                      <dt>is the path an identifier?</dt>
                      <dd>{s.pathAnswer}</dd>
                    </>
                  )}
                </dl>
              </section>
            );
          })}
        </div>
      )}
      <ul className="tl">
        {phases.map((p) => (
          <li key={p.key} className={p.state}>
            <span>
              <b>{p.title}</b>
              {p.when && <span className="meta"> {clockWords(p.when)}</span>}
              <span className="meta">{p.words}</span>
            </span>
          </li>
        ))}
      </ul>
      {busy && !why && <Wait phase={run?.state === "running" ? "the station is working" : "waiting for the station"} since={since} />}
      {verdict && run && (
        <div className="row actions run-acts">
          {acts(verdict, run)}
          <span className="grow" />
          {aside && <span className="meta">{aside(verdict)}</span>}
        </div>
      )}
    </div>
  );
}
