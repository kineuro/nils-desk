// SPDX-License-Identifier: AGPL-3.0-only
// The keyword tab (Wave 4c section 9.13), beside the review queue: the
// classifier's own signals over a scope, the assistant's proposal with
// its prediction and its try result, and the adopt button an operator
// sees. The desk renders the station's verdict from the assistant's
// store and adopts through the engine's own door; it composes no overlay.

import { useCallback, useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { Closure } from "../review/Closure";
import { stations, type StationRun, type Verdict } from "../assistant/stations";
import { holds } from "../sections";
import { ops, type OverlayRow, type Signals } from "./client";

export function Keyword({ caps }: { caps: Capabilities }) {
  const [scope, setScope] = useState("batch:1");
  const [signals, setSignals] = useState<Signals | null>(null);
  const [overlays, setOverlays] = useState<OverlayRow[]>([]);
  const [why, setWhy] = useState<string | null>(null);
  const [run, setRun] = useState<StationRun | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [words, setWords] = useState("");
  const operator = holds(caps, "operator");

  const load = useCallback(() => {
    setWhy(null);
    ops.signals(scope).then(setSignals).catch((e: Error) => setWhy(e.message));
    ops.overlays().then((r) => setOverlays(r.overlays)).catch(() => setOverlays([]));
  }, [scope]);
  useEffect(() => {
    load();
  }, [load]);

  const tune = () => {
    setVerdict(null);
    setWhy(null);
    const message = `Tune one axis of the pack over the scope ${scope}.${words.trim() ? ` ${words.trim()}` : ""}`;
    stations
      .follow("keyword-tune", message, setRun)
      .then(({ run: r, verdict: v }) => {
        setRun(r);
        setVerdict(v);
        load();
      })
      .catch((e: Error) => setWhy(e.message));
  };
  // an adoption is irreversible: it opens the closure panel first (Wave 5 section 8.2), and the panel's button does the act
  const [closing, setClosing] = useState<number | null>(null);
  const [adopting, setAdopting] = useState(false);
  const adopt = (id: number) => setClosing(id);
  const confirmAdopt = (id: number) => {
    setAdopting(true);
    ops
      .overlayAdopt(id)
      .then(() => {
        setClosing(null);
        load();
      })
      .catch((e: Error) => setWhy(e.message))
      .finally(() => setAdopting(false));
  };

  const result = verdict?.result as
    | { axis?: string; bucket?: string; prediction?: { add?: string[]; remove?: string[]; flip?: string[]; must_not_regress?: string[] }; rehearsal?: { moves?: { axis: string; from: string; to: string; stacks: number }[]; review_items?: { close: number; open: number } }; diff?: string; proposal?: { overlay?: number; review_item?: number } | null; sentence?: string }
    | undefined;
  const busy = run !== null && (run.state === "queued" || run.state === "running");

  return (
    <div>
      <div className="row">
        <label>scope <input value={scope} onChange={(e) => setScope(e.target.value)} placeholder="batch:1, origin:name, pack:0.1.1" size={22} /></label>
        <button type="button" onClick={load}>Read the signals</button>
      </div>
      {why && <p className="warn">{why}</p>}
      {signals && (
        <div className="panel">
          <h2>Signals over {signals.scope}</h2>
          <div className="scroll">
            <table className="thin">
              <thead><tr><th>axis</th><th>tiers</th><th>open review</th><th>below 0.7</th></tr></thead>
              <tbody>
                {Object.entries(signals.axes).map(([axis, a]) => (
                  <tr key={axis}>
                    <td>{axis}</td>
                    <td>{Object.entries(a.tiers).map(([t, n]) => `${t} ${n}`).join(", ")}</td>
                    <td>{Object.entries(a.open_review).map(([g, n]) => `${g} (${n})`).join(", ")}</td>
                    <td className="num">{a.confidence.below_0_7 ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {Object.keys(signals.diagnostics).length > 0 && <p className="meta">diagnostics: {Object.entries(signals.diagnostics).map(([k, n]) => `${k} ${n}`).join(", ")}</p>}
          {signals.shadowed_keywords.length > 0 && (
            <details><summary>{signals.shadowed_keywords.length} shadowed keywords, which can never match</summary><ul>{signals.shadowed_keywords.map((k) => <li key={k}>{k}</li>)}</ul></details>
          )}
          {signals.unused_overlay_terms.length > 0 && <p className="meta">unused overlay terms: {signals.unused_overlay_terms.join(", ")}</p>}
        </div>
      )}
      <div className="panel">
        <h2>Tune with the assistant</h2>
        <p>The station surveys these signals, writes one hypothesis with a prediction, rehearses it through <code>try</code>, which writes nothing, and proposes an overlay for an operator to adopt.</p>
        <label>what you know <input value={words} onChange={(e) => setWords(e.target.value)} placeholder="the site's own word, the axis it concerns" size={48} /></label>
        <div className="row">
          <button type="button" onClick={tune} disabled={busy}>{busy ? `Working (${run?.state})` : "Tune"}</button>
        </div>
        {run && !busy && run.state !== "settled" && <p className="warn">The run ended: {run.state}{run.error ? `, ${run.error}` : ""}.</p>}
        {run && run.state === "settled" && !verdict && <p className="warn">The run ended without a verdict{run.reply?.metadata?.terminal ? `: ${run.reply.metadata.terminal}` : ""}.</p>}
        {result && (
          <div className="proposal open">
            <p className="sentence">{result.sentence}</p>
            <p className="meta">{result.axis}, bucket {result.bucket}, the diff read <strong>{result.diff}</strong></p>
            {result.prediction && (
              <p>
                Prediction: add {result.prediction.add?.join(", ") || "nothing"}{result.prediction.remove?.length ? `, remove ${result.prediction.remove.join(", ")}` : ""}; groups that flip: {result.prediction.flip?.join(", ") || "none named"}; must not regress: {result.prediction.must_not_regress?.join(", ") || "none named"}.
              </p>
            )}
            {result.rehearsal && (
              <p>
                Rehearsal: {(result.rehearsal.moves ?? []).map((m) => `${m.axis} ${m.from || "(unset)"} to ${m.to}, ${m.stacks} stacks`).join("; ") || "nothing moved"}; review items closing {result.rehearsal.review_items?.close ?? 0}, opening {result.rehearsal.review_items?.open ?? 0}.
              </p>
            )}
            {result.proposal?.overlay !== undefined && (
              <p>
                Proposed as overlay {result.proposal.overlay}{result.proposal.review_item !== undefined ? `, review item ${result.proposal.review_item}` : ""}.
                {operator && <> <button type="button" onClick={() => adopt(Number(result.proposal?.overlay))}>Adopt</button></>}
              </p>
            )}
            {verdict && <details><summary>checks</summary><ul>{verdict.checks.map((c) => <li key={c.name}>{c.name}: {c.passed ? "passed" : c.why}</li>)}</ul></details>}
          </div>
        )}
      </div>
      {closing !== null && (
        <Closure
          caps={caps}
          act={{ verb: `Adopt overlay ${closing}`, kind: "overlay", id: closing, moves: result?.proposal?.overlay === closing ? result.rehearsal?.moves?.map((m) => ({ axis: m.axis, from: m.from || null, to: m.to, stacks: m.stacks })) : undefined }}
          onConfirm={() => confirmAdopt(closing)}
          onCancel={() => setClosing(null)}
          busy={adopting}
        />
      )}
      {overlays.length > 0 && (
        <div className="panel">
          <h2>Overlays</h2>
          <table className="thin">
            <thead><tr><th>id</th><th>name</th><th>status</th><th>scope</th><th>author</th><th /></tr></thead>
            <tbody>
              {overlays.map((o) => (
                <tr key={o.id}>
                  <td>{o.id}</td><td>{o.name}</td><td>{o.status}</td><td>{o.scope ?? ""}</td><td>{o.author ?? ""}</td>
                  <td>{operator && o.status === "proposed" && <button type="button" onClick={() => adopt(o.id)}>Adopt</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
