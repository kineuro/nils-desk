// SPDX-License-Identifier: AGPL-3.0-only
// Models (record 45 S6): the registered models by task and slot, the one
// promoted in each first, and one model with its card, its encoders, the
// label set it was trained on and its history. Under models:work a model is
// registered (a train run registers what it fitted; a card from elsewhere is
// posted), admitted by a check, promoted in its slot, or retired, each after
// a panel that says what it moves. What the engine refuses is shown in its
// own words.

import { useCallback, useEffect, useState } from "react";
import { DoorError } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { whenWords } from "../data/sources";
import { door as served } from "../deployment";
import { may } from "../grants";
import { href } from "../routes";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { Says, Values } from "../ui/Says";
import { Wait } from "../ui/Wait";
import { byTask, checkOf, encodersOf, fittedBy, label, modelActs, models, openActs, promotedBeside, refusedModels, shortDigest, stateTag, trainedOn, type Model, type RunRow, type TaskSlot } from "./client";
import "../review/grown.css";

/** The engine's own words for a refusal, as its door said them. */
export function engineWords(e: unknown): string {
  if (e instanceof DoorError) return typeof e.body.error === "string" && e.body.error !== "" ? e.body.error : `the engine answered ${e.status}`;
  return e instanceof Error ? e.message : String(e);
}

type Load = { kind: "loading"; since: number } | { kind: "failed"; why: string } | { kind: "ready"; list: Model[] };

export function ModelsPage({ caps, page, arg }: { caps: Capabilities; page: string | null; arg: string | null }) {
  const [load, setLoad] = useState<Load>(() => ({ kind: "loading", since: Date.now() }));
  const [said, setSaid] = useState<string | null>(null);
  const read = useCallback(() => {
    models.list().then(
      (r) => setLoad({ kind: "ready", list: r.models }),
      (e: unknown) => setLoad((was) => (was.kind === "ready" ? was : { kind: "failed", why: engineWords(e) })),
    );
  }, []);
  useEffect(read, [read]);
  const changed = (words: string) => {
    setSaid(words);
    read();
  };
  const id = page === "model" && arg && /^\d+$/.test(arg) ? Number(arg) : null;
  const list = load.kind === "ready" ? load.list : null;
  return (
    <>
      {said && (
        <p className="meta said">
          <Icon name="check" />
          {said}
        </p>
      )}
      {load.kind === "loading" && <Wait phase="reading the models" since={load.since} size="panel" />}
      {load.kind === "failed" && <p className="warn">The models could not be read: {load.why}</p>}
      {list && id === null && <ModelsBody caps={caps} list={list} onChanged={changed} />}
      {list && id !== null && <ModelPage caps={caps} id={id} list={list} onChanged={changed} />}
    </>
  );
}

/** The models by task and slot, as the page draws them from what it read. */
export function ModelsBody({ caps, list, onChanged }: { caps: Capabilities; list: Model[]; onChanged: (words: string) => void }) {
  const acts = modelActs(caps);
  const [registering, setRegistering] = useState(false);
  const tasks = byTask(list);
  return (
    <section className="data models">
      <div className="data-head">
        <div className="grow">
          <span className="eyebrow">Models</span>
          <h1>Models by task</h1>
          <p className="lede">One promoted model answers each task in its slot. A model is registered, admitted by a check, then promoted.</p>
        </div>
        {acts.register && (
          <button type="button" className="button" onClick={() => setRegistering(true)}>
            <Icon name="plus" />
            Register
          </button>
        )}
      </div>
      {tasks.length === 0 && (
        <div className="note">
          <Icon name="info" />
          <div className="note-body">
            <p className="note-lead">No model yet.</p>
            <p className="note-detail">A train pipeline registers the model it fitted; a card from elsewhere is registered here.</p>
          </div>
        </div>
      )}
      {tasks.map((t) => (
        <TaskCard key={`${t.task} ${t.slot}`} t={t} />
      ))}
      {registering && <RegisterDialog caps={caps} onClose={() => setRegistering(false)} onDone={(w) => { setRegistering(false); onChanged(w); }} />}
    </section>
  );
}

function ModelLine({ m }: { m: Model }) {
  const tag = stateTag(m.state);
  return (
    <tr>
      <td>
        <a href={href("models", "model", String(m.id))}>{label(m)}</a>
      </td>
      <td>{m.kind}</td>
      <td className="path">{shortDigest(m.digest)}</td>
      <td>
        <span className={`tag ${tag.tone}`}>{tag.words}</span>
      </td>
      <td className="num">{whenWords(m.promoted_at ?? m.admitted_at ?? m.registered_at)}</td>
    </tr>
  );
}

export function TaskCard({ t }: { t: TaskSlot }) {
  const rows = t.promoted ? [t.promoted, ...t.others] : t.others;
  return (
    <section className="stack roomy">
      <div className="section-head rule-top">
        <h2>{t.task}</h2>
        <span className="meta">
          slot {t.slot} · {t.promoted ? `${label(t.promoted)} answers` : "nothing promoted"}
        </span>
      </div>
      <div className="table-wrap">
        <table className="thin">
          <thead>
            <tr>
              <th>Model</th>
              <th>Kind</th>
              <th>Digest</th>
              <th>State</th>
              <th className="num">Since</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <ModelLine key={m.id} m={m} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

type One = { kind: "loading"; since: number } | { kind: "failed"; why: string } | { kind: "ready"; m: Model };

export function ModelPage({ caps, id, list, onChanged }: { caps: Capabilities; id: number; list: Model[]; onChanged: (words: string) => void }) {
  const [one, setOne] = useState<One>(() => ({ kind: "loading", since: Date.now() }));
  const [asked, setAsked] = useState(0);
  useEffect(() => {
    let alive = true;
    models.get(id).then(
      (m) => alive && setOne({ kind: "ready", m }),
      (e: unknown) => alive && setOne({ kind: "failed", why: engineWords(e) }),
    );
    return () => {
      alive = false;
    };
  }, [id, asked]);
  if (one.kind === "loading") return <Wait phase="reading the model" since={one.since} size="panel" />;
  if (one.kind === "failed") return <p className="warn">Model {id} could not be read: {one.why}</p>;
  return (
    <ModelBody
      caps={caps}
      m={one.m}
      list={list}
      onChanged={(w) => {
        setAsked((n) => n + 1);
        onChanged(w);
      }}
    />
  );
}

type Act = "admit" | "promote" | "retire";

/** One model as the page draws it. */
export function ModelBody({ caps, m, list, onChanged }: { caps: Capabilities; m: Model; list: Model[]; onChanged: (words: string) => void }) {
  const acts = modelActs(caps);
  const open = openActs(m);
  const [act, setAct] = useState<Act | null>(null);
  const tag = stateTag(m.state);
  const trained = trainedOn(m);
  const encoders = encodersOf(m);
  const events = [...(m.events ?? [])].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return (
    <section className="data model">
      <div className="data-head">
        <div className="grow">
          <span className="eyebrow">
            <a href={href("models")}>Models</a> · {m.task}
          </span>
          <h1>{label(m)}</h1>
          <p className="lede">
            <span className={`tag ${tag.tone}`}>{tag.words}</span> {m.kind} in slot {m.slot}
          </p>
        </div>
        {acts.admit && open.admit && (
          <button type="button" className="button secondary" onClick={() => setAct("admit")}>
            Admit
          </button>
        )}
        {acts.promote && open.promote && (
          <button type="button" className={m.state === "admitted" ? "button" : "button secondary"} onClick={() => setAct("promote")}>
            Promote
          </button>
        )}
        {acts.retire && open.retire && (
          <button type="button" className="button quiet" onClick={() => setAct("retire")}>
            Retire
          </button>
        )}
      </div>
      <Values
        cells={[
          { k: "digest", v: shortDigest(m.digest), title: m.digest },
          { k: "threshold", v: m.threshold != null ? m.threshold.toFixed(2) : "none" },
          { k: "registered by", v: m.registered_by },
          { k: "check", v: m.check ? `${m.check.suite}, ${m.check.passed ? "passed" : "failed"}` : "none" },
        ]}
      />
      <div className="section-head rule-top">
        <h2>Card</h2>
      </div>
      <dl className="facts">
        <div className="facts-pair">
          <dt>trained on</dt>
          <dd>{trained ? `${trained.name ?? "a label set"} · ${shortDigest(trained.digest)}${trained.rows !== null ? ` · ${trained.rows.toLocaleString("en-US")} rows` : ""}${trained.sealed ? " · sealed draw" : ""}` : "no label set"}</dd>
        </div>
        <div className="facts-pair">
          <dt>encoders</dt>
          <dd>
            {encoders.length === 0
              ? "none"
              : encoders.map((e, i) => (
                  <span key={i}>
                    {i > 0 ? ", " : ""}
                    {e.id !== null ? <a href={href("models", "model", String(e.id))}>{e.words}</a> : e.words}
                  </span>
                ))}
          </dd>
        </div>
        {typeof m.card.pack_version === "string" && (
          <div className="facts-pair">
            <dt>pack</dt>
            <dd>{m.card.pack_version}</dd>
          </div>
        )}
      </dl>
      {m.check && m.check.checks.length > 0 && (
        <Says head={`The check: ${m.check.suite}`}>
          {m.check.checks.map((c) => `${c.name} ${c.passed ? "passed" : "failed"}${c.value != null ? ` at ${c.value}` : ""}${c.threshold != null ? ` (threshold ${c.threshold})` : ""}`).join("; ")}.
        </Says>
      )}
      <div className="section-head rule-top">
        <h2>History</h2>
      </div>
      <ol className="model-events">
        {events.map((e, i) => (
          <li key={i} className="meta">
            {whenWords(e.at)} · {e.transition.replace(/_/g, " ")} by {e.by}
            {e.detail && typeof e.detail.why === "string" ? `: ${e.detail.why}` : ""}
          </li>
        ))}
        {events.length === 0 && <li className="meta">Registered {whenWords(m.registered_at)} by {m.registered_by}.</li>}
      </ol>
      {m.task.startsWith("axis:") && may(caps, "review:see") && served(caps, "GET /api/review") && (
        <p className="meta">
          What it proposed waits in <a href={href("review", "proposals")}>Review, Proposals</a>, staged until a person commits it.
        </p>
      )}
      {act === "admit" && <AdmitDialog m={m} onClose={() => setAct(null)} onDone={(w) => { setAct(null); onChanged(w); }} />}
      {(act === "promote" || act === "retire") && <MoveDialog act={act} m={m} list={list} onClose={() => setAct(null)} onDone={(w) => { setAct(null); onChanged(w); }} />}
    </section>
  );
}

/** Admit: a check, whose passed the rows decide, recorded on the model. */
export function AdmitDialog({ m, onClose, onDone }: { m: Model; onClose: () => void; onDone: (words: string) => void }) {
  const [suite, setSuite] = useState("heldout");
  const [rows, setRows] = useState([{ name: "", passed: true, value: "", threshold: "" }]);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const check = checkOf(suite, rows);
  const set = (i: number, patch: Partial<(typeof rows)[number]>) => setRows((was) => was.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const go = () => {
    setBusy(true);
    setRefused(null);
    models.admit(m.id, check).then(
      (after) => onDone(after.state === "admitted" ? `${label(m)} is admitted by ${check.suite}.` : `The check was kept; ${label(m)} is still ${after.state}.`),
      (e: unknown) => {
        setBusy(false);
        setRefused(engineWords(e));
      },
    );
  };
  return (
    <Dialog
      title={`Admit ${label(m)}`}
      icon="check"
      onClose={onClose}
      foot={
        <div className="row actions">
          <button type="button" className="button" disabled={busy || check.suite === "" || check.checks.length === 0} onClick={go}>
            Record the check
          </button>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          {refused && <span className="warn">{refused}</span>}
        </div>
      }
    >
      <p className="lede">{check.checks.length === 0 ? "Name what was checked." : check.passed ? "Every check passed: the model is admitted." : "A check failed: it is kept as an event and admits nothing."}</p>
      <div className="field">
        <span className="label">Suite</span>
        <span className="input">
          <input value={suite} aria-label="Suite" onChange={(e) => setSuite(e.target.value)} />
        </span>
      </div>
      <div className="checks-edit">
        {rows.map((r, i) => (
          <div key={i} className="field-row">
            <span className="input">
              <input value={r.name} placeholder="check, such as ece" aria-label="Check" onChange={(e) => set(i, { name: e.target.value })} />
            </span>
            <span className="input">
              <input value={r.value} placeholder="value" aria-label="Value" onChange={(e) => set(i, { value: e.target.value })} />
            </span>
            <span className="input">
              <input value={r.threshold} placeholder="threshold" aria-label="Threshold" onChange={(e) => set(i, { threshold: e.target.value })} />
            </span>
            <label className="choice">
              <input type="checkbox" checked={r.passed} onChange={(e) => set(i, { passed: e.target.checked })} />
              passed
            </label>
          </div>
        ))}
        <button type="button" className="button quiet small" onClick={() => setRows((was) => [...was, { name: "", passed: true, value: "", threshold: "" }])}>
          Another check
        </button>
      </div>
    </Dialog>
  );
}

/** Promote or retire, after the panel that says what else it moves. */
export function MoveDialog({ act, m, list, onClose, onDone }: { act: "promote" | "retire"; m: Model; list: Model[]; onClose: () => void; onDone: (words: string) => void }) {
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const beside = promotedBeside(m, list);
  const go = () => {
    setBusy(true);
    setRefused(null);
    const work =
      act === "promote"
        ? models.promote(m.id, why.trim() || undefined).then((r) => `${label(m)} is promoted for ${m.task}${r.retired ? `; ${label(r.retired)} is retired` : ""}.`)
        : models.retire(m.id, why.trim() || undefined).then(() => `${label(m)} is retired; its decisions stay and keep naming it.`);
    work.then(onDone, (e: unknown) => {
      setBusy(false);
      setRefused(engineWords(e));
    });
  };
  return (
    <Dialog
      title={`${act === "promote" ? "Promote" : "Retire"} ${label(m)}`}
      icon={act === "promote" ? "arrow" : "x"}
      onClose={onClose}
      foot={
        <div className="row actions">
          <button type="button" className="button" disabled={busy} onClick={go}>
            {act === "promote" ? "Promote" : "Retire"}
          </button>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      }
    >
      {act === "promote" ? (
        <p className="lede">
          {label(m)} answers {m.task} in slot {m.slot}. {beside ? `${label(beside)}, promoted there now, is retired.` : "Nothing is promoted there now."}
          {m.state === "registered" ? " It is not admitted yet." : ""}
        </p>
      ) : (
        <p className="lede">{label(m)} answers no more. Its decisions stay and keep naming it.</p>
      )}
      <div className="field">
        <span className="label">Why</span>
        <span className="input">
          <input value={why} placeholder="kept on the model's history" aria-label="Why" onChange={(e) => setWhy(e.target.value)} />
        </span>
      </div>
      {refused && (
        <div className="note caution" role="alert">
          <Icon name="alert" />
          <div className="note-body">
            <p className="note-lead">The engine refused</p>
            <p className="note-detail">{refused}</p>
          </div>
        </div>
      )}
    </Dialog>
  );
}

/** Register: what train runs fitted, registered by the run already, or a card posted as it is. */
export function RegisterDialog({ caps, onClose, onDone }: { caps: Capabilities; onClose: () => void; onDone: (words: string) => void }) {
  const acts = modelActs(caps);
  const [runs, setRuns] = useState<RunRow[] | null>(null);
  const [card, setCard] = useState("");
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  useEffect(() => {
    if (!acts.runs) return;
    models.runs(50).then(
      (r) => setRuns(r.runs.filter((x) => fittedBy(x).length > 0 || refusedModels(x).length > 0)),
      () => setRuns([]),
    );
  }, [acts.runs]);
  const go = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(card);
    } catch (e) {
      setRefused(`Not JSON: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    setBusy(true);
    setRefused(null);
    models.register(parsed as Record<string, unknown>).then(
      (m) => onDone(`${label(m)} is registered; admit it with a check before promoting it.`),
      (e: unknown) => {
        setBusy(false);
        setRefused(engineWords(e));
      },
    );
  };
  return (
    <Dialog
      title="Register a model"
      icon="plus"
      onClose={onClose}
      foot={
        <div className="row actions">
          <button type="button" className="button" disabled={busy || card.trim() === ""} onClick={go}>
            Register the card
          </button>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          {refused && <span className="warn">{refused}</span>}
        </div>
      }
    >
      {acts.runs && (
        <div className="field">
          <span className="label">From a run</span>
          {runs === null && <span className="meta">Reading the runs.</span>}
          {runs !== null && runs.length === 0 && <span className="meta">No run fitted a model yet.</span>}
          {runs !== null && runs.length > 0 && <RunsFitted runs={runs} />}
        </div>
      )}
      <div className="field">
        <span className="label">A card from elsewhere</span>
        <span className="input">
          <textarea rows={6} value={card} placeholder='{"name": "...", "version": "...", "kind": "head", "digest": "sha256:...", "task": "axis:body_part"}' aria-label="The card" onChange={(e) => setCard(e.target.value)} />
        </span>
      </div>
      <Says head="What registering does">
        A train run registers the model it fitted from the card beside it, trained on the label set the run was given. A card posted here is registered as it is, neither admitted nor promoted; the engine checks its encoder and label set exist.
      </Says>
    </Dialog>
  );
}

/** The models runs fitted: each registered by its run, or refused in the engine's words. */
export function RunsFitted({ runs }: { runs: RunRow[] }) {
  return (
    <ul className="tried-list">
      {runs.map((r) => (
        <li key={r.id}>
          run {r.id} · {r.pipeline}
          {fittedBy(r).map((f) => (
            <span key={f.output} className="meta">
              {" "}
              · {f.model} registered
            </span>
          ))}
          {refusedModels(r).map((w) => (
            <span key={w} className="warn">
              {" "}
              · {w}
            </span>
          ))}
        </li>
      ))}
    </ul>
  );
}

