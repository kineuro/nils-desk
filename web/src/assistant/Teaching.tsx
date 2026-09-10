// SPDX-License-Identifier: AGPL-3.0-only
// Teaching (Wave 5 section 9.5): the corrections the group gave, curated
// into a set; a fine-tune as a job with its recipe; the admission suite and
// the bench beside each other; promotion as a proposal the desk refuses to
// offer until both gates are green.

import { useCallback, useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { holds } from "../sections";
import { Empty } from "../ui/Empty";
import { classify, Failure, type Failed } from "../ui/Failure";
import { Blocked } from "../ui/Veil";
import { Wait } from "../ui/Wait";
import { type Candidate, type Correction, type CuratedSet, gateWords, promotable, promotionWords, type Recipe, teaching } from "./teaching";

export function Teaching({ caps }: { caps: Capabilities }) {
  const reviewer = holds(caps, "reviewer");
  const operator = holds(caps, "operator");
  const [corrections, setCorrections] = useState<Correction[] | null>(null);
  const [sets, setSets] = useState<CuratedSet[] | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [promoted, setPromoted] = useState<{ backend: string; model: string | null }[]>([]);
  const [failed, setFailed] = useState<Failed | null>(null);
  const [since, setSince] = useState(() => Date.now());
  const [chosen, setChosen] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [recipe, setRecipe] = useState<Recipe>({ base: "", method: "lora", steps: 20, rank: 8, lr: 0.0001 });
  const [tuning, setTuning] = useState<number | null>(null);
  const [promoting, setPromoting] = useState<Candidate | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    setSince(Date.now());
    teaching.corrections().then((c) => setCorrections(c.corrections)).catch((e: unknown) => setFailed(classify(e)));
    teaching.sets().then((s) => setSets(s.sets)).catch(() => setSets([]));
    teaching
      .candidates()
      .then((c) => {
        setCandidates(c.candidates);
        setPromoted(c.promoted);
      })
      .catch(() => setCandidates([]));
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const act = (p: Promise<unknown>) => {
    setBusy(true);
    setWhy(null);
    p.then(() => load())
      .catch((e: Error) => setWhy(e.message))
      .finally(() => setBusy(false));
  };
  const curate = () => act(teaching.curate(name.trim(), chosen).then(() => { setChosen([]); setName(""); }));
  const fineTune = (set: number) => act(teaching.fineTune(set, recipe).then(() => setTuning(null)));
  return (
    <div className="teaching">
      <p className="meta">The loop with its gates kept: what the group corrected, curated into a set; a fine-tune as a job; the admission suite and the bench beside each other; promotion only when both are green.</p>
      {failed && <Failure failed={failed} action={{ label: "Try again", onClick: load }} />}
      {why && <p className="warn">{why}</p>}

      <h2>Corrections</h2>
      {corrections === null && !failed && <Wait phase="reading the corrections" since={since} size="line" />}
      {corrections && corrections.length === 0 && <Empty what="The group has not corrected anything yet." />}
      {corrections && corrections.length > 0 && (
        <>
          <table className="thin corrections">
            <thead>
              <tr>
                <th />
                <th>what</th>
                <th>correction</th>
                <th>why</th>
                <th>when</th>
              </tr>
            </thead>
            <tbody>
              {corrections.map((c) => (
                <tr key={c.id} className={chosen.includes(c.id) ? "on" : ""}>
                  <td>
                    <input type="checkbox" aria-label={`select ${c.id}`} checked={chosen.includes(c.id)} disabled={!reviewer} onChange={() => setChosen((s) => (s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id]))} />
                  </td>
                  <td>{c.kind.replace(/_/g, " ")}, {c.station}</td>
                  <td>{c.correction}</td>
                  <td>{c.why ?? ""}</td>
                  <td className="when">{c.at.slice(0, 16).replace("T", " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {reviewer && (
            <div className="row">
              <label>
                set name <input value={name} onChange={(e) => setName(e.target.value)} placeholder="september corrections" size={24} />
              </label>
              <button type="button" className="on" disabled={busy || chosen.length === 0 || !name.trim()} onClick={curate}>
                Curate a set of {chosen.length}
              </button>
            </div>
          )}
        </>
      )}

      <h2>Sets</h2>
      {sets && sets.length === 0 && <Empty what="No set is curated yet." />}
      {sets && sets.length > 0 && (
        <table className="thin">
          <thead>
            <tr>
              <th>set</th>
              <th className="num">corrections</th>
              <th>by</th>
              <th>digest</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sets.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td className="num">{s.count}</td>
                <td>{s.subject}</td>
                <td>
                  <code>{s.digest.slice(0, 12)}</code>
                </td>
                <td>{operator && <button type="button" onClick={() => setTuning(s.id)}>Fine-tune</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {tuning !== null && (
        <div className="panel">
          <h3>Fine-tune set {tuning}</h3>
          <p className="meta">A job on the group's card with its recipe recorded; the result is registered as a candidate. Without torch on the host the job runs dry and says so.</p>
          <div className="row">
            <label>
              base <input value={recipe.base} onChange={(e) => setRecipe({ ...recipe, base: e.target.value })} placeholder="the base model" size={22} />
            </label>
            <label>
              steps <input value={recipe.steps} onChange={(e) => setRecipe({ ...recipe, steps: Number(e.target.value) })} size={5} inputMode="numeric" />
            </label>
            <label>
              rank <input value={recipe.rank} onChange={(e) => setRecipe({ ...recipe, rank: Number(e.target.value) })} size={4} inputMode="numeric" />
            </label>
            <label>
              lr <input value={recipe.lr} onChange={(e) => setRecipe({ ...recipe, lr: Number(e.target.value) })} size={8} />
            </label>
            <button type="button" className="on" disabled={busy || !recipe.base.trim()} onClick={() => fineTune(tuning)}>
              Start the job
            </button>
            <button type="button" onClick={() => setTuning(null)}>Not now</button>
          </div>
        </div>
      )}

      <h2>Candidates</h2>
      {candidates && candidates.length === 0 && <Empty what="No candidate model yet." />}
      {candidates && candidates.length > 0 && (
        <table className="thin candidates-table">
          <thead>
            <tr>
              <th>candidate</th>
              <th>state</th>
              <th>from</th>
              <th>admission</th>
              <th>bench</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {candidates.map((c) => {
              const g = gateWords(c);
              const p = promotable(c);
              return (
                <tr key={c.id}>
                  <td>
                    {c.model} <span className="meta">on {c.backend}</span>
                  </td>
                  <td>
                    <span className="tag">{c.state}</span>
                  </td>
                  <td>{c.source.kind === "fine-tune" ? `job ${c.source.job}${c.job?.outcome?.dry ? ", dry" : ""}` : "by hand"}</td>
                  <td>
                    <span className={`tag ${c.gates.admission ? "" : "caution"}`}>{g.admission}</span>
                  </td>
                  <td>
                    <span className={`tag ${c.gates.bench ? "" : "caution"}`}>{g.bench}</span>
                  </td>
                  <td className="row">
                    {operator && c.state !== "retired" && c.state !== "promoted" && (
                      <>
                        <button type="button" disabled={busy} onClick={() => act(teaching.admit(c.id))}>Admit</button>
                        <button type="button" disabled={busy} onClick={() => act(teaching.bench(c.id))}>Bench</button>
                      </>
                    )}
                    {operator && <Blocked control={p} label="Promote" onClick={() => setPromoting(c)} hint="a proposal; the closure first" />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {promoting && (
        <div className="panel closure" role="dialog" aria-label={`promote ${promoting.model}`}>
          <h3>Promote {promoting.model}?</h3>
          {promotionWords(promoting, promoted).map((l) => (
            <p key={l}>{l}</p>
          ))}
          <div className="row">
            <button type="button" className="on" disabled={busy} onClick={() => { const id = promoting.id; act(teaching.promote(id, `desk-${id}-${Date.now().toString(36)}`)); setPromoting(null); }}>
              Promote {promoting.model} on {promoting.backend} and retire the current one
            </button>
            <button type="button" onClick={() => setPromoting(null)}>Not now</button>
          </div>
        </div>
      )}
    </div>
  );
}
