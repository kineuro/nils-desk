// SPDX-License-Identifier: AGPL-3.0-only
// The Query page: every query kept is a card. A card opens on a version: its
// counts and the manual editor in the middle, and on the right the discussion
// and the card's steps as a timeline from its start to its answer. Every change
// is a move the engine offered, and applying one makes the next version, so a
// person can go back to any version and start again from it.

import { useCallback, useEffect, useMemo, useState } from "react";
import { ask, chain, DoorError, type DocumentHandle, type Diagnosis, type Json, type Move, type Options, type Preview } from "../ask/client";
import { editor, setsOf } from "../ask/editor";
import { countWords, nextMoves, startBody, type From, type Started } from "../ask/start";
import type { Capabilities } from "../capabilities";
import { holds } from "../deployment";
import { objects, type DocumentRow } from "../objects/client";
import { href } from "../routes";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import { whenWords } from "../data/sources";
import { argsOf, cardTitle, clauseText, inputOf, preview, stepCounts, versionsOf, type Version } from "./cards";

const n = (v: number) => v.toLocaleString("en-US");

export function QueryPage({ caps, open }: { caps: Capabilities; open: string | null }) {
  const id = open !== null && /^\d+$/.test(open) ? Number(open) : null;
  return id === null ? <Cards caps={caps} /> : <Card caps={caps} id={id} />;
}

function Cards({ caps }: { caps: Capabilities }) {
  const [rows, setRows] = useState<DocumentRow[] | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [since] = useState(() => Date.now());
  useEffect(() => {
    objects
      .documents()
      .then((r) => setRows(r.documents))
      .catch((e: Error) => setWhy(e.message));
  }, []);
  return (
    <section className="query">
      <div className="data-head">
        <div className="grow">
          <span className="eyebrow">Query</span>
          <h1>Cards</h1>
          <p className="lede">Every query you keep is a card. Open one to change it step by step; each change is a version you can go back to.</p>
        </div>
        <button type="button" className="button" onClick={() => setStarting(true)}>
          <Icon name="plus" />
          New query
        </button>
      </div>
      {rows === null && !why && <Wait phase="reading the cards" since={since} size="panel" />}
      {why && <p className="warn">The cards could not be read: {why}</p>}
      {rows !== null && rows.length === 0 && <p className="lede">No query yet. Start one from everyone or from a cohort.</p>}
      {rows !== null && rows.length > 0 && (
        <div className="query-cards">
          {rows.map((r) => (
            <a key={r.root} className="query-card-link" href={href("query", String(r.document))}>
              <span className="query-card-title">
                <span className="grow">{cardTitle(r.name)}</span>
                <span className="chip">v{r.versions}</span>
              </span>
              <span className="row">
                {r.grain && <span className="tag">{r.grain}</span>}
                {r.level && <span className="meta">answers as {r.level}</span>}
              </span>
              <span className="meta">
                {r.last_run ? `ran ${whenWords(r.last_run.at)}` : "not run yet"}
                {r.author ? ` · ${r.author}` : ""}
              </span>
            </a>
          ))}
        </div>
      )}
      {starting && <StartDialog caps={caps} onClose={() => setStarting(false)} />}
    </section>
  );
}

function StartDialog({ caps, onClose }: { caps: Capabilities; onClose: () => void }) {
  const [kind, setKind] = useState<"nothing" | "cohorts">("nothing");
  const [cohorts, setCohorts] = useState("");
  const [started, setStarted] = useState<Started | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const from: From = kind === "cohorts" ? { kind: "cohorts", cohorts: cohorts.split(/[\s,]+/).filter(Boolean) } : { kind: "nothing" };
  const look = () => {
    setBusy(true);
    setWhy(null);
    ask
      .start(startBody(from))
      .then((s) => setStarted(s as Started))
      .catch((e: Error) => setWhy(e.message))
      .finally(() => setBusy(false));
  };
  const open = () => {
    if (!started) return;
    setBusy(true);
    ask
      .store(started.document as Json)
      .then((d) => {
        location.hash = href("query", String(d.document));
      })
      .catch((e: Error) => {
        setBusy(false);
        setWhy(e.message);
      });
  };
  return (
    <Dialog
      title="Start a query"
      icon="search"
      onClose={onClose}
      foot={
        <div className="row actions">
          {started ? (
            <button type="button" className="button" disabled={busy} onClick={open}>
              Open as a card
            </button>
          ) : (
            <button type="button" className="button" disabled={busy || (kind === "cohorts" && cohorts.trim() === "")} onClick={look}>
              Count it
            </button>
          )}
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          {why && <span className="warn">{why}</span>}
        </div>
      }
    >
      <div className="field">
        <span className="label">Start from</span>
        <label className="choice">
          <input type="radio" name="from" checked={kind === "nothing"} onChange={() => { setKind("nothing"); setStarted(null); }} />
          Everyone the registry holds
        </label>
        <label className="choice">
          <input type="radio" name="from" checked={kind === "cohorts"} onChange={() => { setKind("cohorts"); setStarted(null); }} />
          One or more cohorts
        </label>
        {kind === "cohorts" && (
          <div className="input">
            <input value={cohorts} placeholder="cohort names, separated by commas" onChange={(e) => { setCohorts(e.target.value); setStarted(null); }} />
          </div>
        )}
      </div>
      {started && <p className="lede">{countWords(started)}</p>}
      <p className="meta">
        A saved card, a kept result and a list of identifiers are started from too: open a card and choose Start a new card from here
        {holds(caps, "reviewer") ? "." : "; a list of identifiers asks for the reviewer role."}
      </p>
    </Dialog>
  );
}

function Card({ caps, id }: { caps: Capabilities; id: number }) {
  const [doc, setDoc] = useState<DocumentHandle | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [options, setOptions] = useState<Record<string, Options | null>>({});
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [move, setMove] = useState<Move | null>(null);
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<{ phase: string; since: number } | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [rows, setRows] = useState<Preview | null>(null);
  const [answered, setAnswered] = useState<{ count: number; truncated: boolean } | null>(null);
  const [since] = useState(() => Date.now());

  const load = useCallback(() => {
    ask
      .get(id)
      .then(async (d) => {
        setDoc(d);
        const names = setsOf(d.ask);
        const pairs = await Promise.all(names.map((s) => ask.options(id, s).then((o) => [s, o] as const, () => [s, null] as const)));
        setOptions(Object.fromEntries(pairs));
        chain(id).then((c) => setVersions(versionsOf(c)), () => setVersions([]));
        ask.diagnose(id, "clause").then(setDiagnosis, () => setDiagnosis(null));
      })
      .catch((e: Error) => setWhy(e.message));
  }, [id]);

  useEffect(() => {
    setMove(null);
    setTyped({});
    setRows(null);
    setAnswered(null);
    setWhy(null);
    load();
  }, [load]);

  const steps = useMemo(() => (doc ? editor(doc.ask, options) : []), [doc, options]);
  const answer = ((doc?.ask.out as Json | undefined)?.set as string | undefined) ?? null;
  const current = steps.find((s) => s.set === chosen) ?? steps.find((s) => s.answers) ?? steps[0] ?? null;
  const reviewer = holds(caps, "reviewer");

  const next = (document: number) => {
    // the same text is the same version: nothing moves, so the page reads it again
    if (document === id) {
      setBusy(null);
      setMove(null);
      setTyped({});
      load();
    } else location.hash = href("query", String(document));
  };

  const applyMove = (set: string, m: Move, args: Json) => {
    const o = options[set];
    if (!o) return;
    setBusy({ phase: "applying the change", since: Date.now() });
    setWhy(null);
    ask
      .apply(id, o, set, [{ move_id: m.id, args }])
      .then((a) => next(a.document))
      .catch((e: Error) => {
        setBusy(null);
        if (e instanceof DoorError && e.stale) {
          setWhy("The query moved on since its options were read; they are read again.");
          load();
        } else setWhy(e.message);
      });
  };

  const runIt = () => {
    setBusy({ phase: "running the query", since: Date.now() });
    setWhy(null);
    ask
      .run(id)
      .then((r) => {
        setAnswered({ count: r.row_count, truncated: r.truncated });
        setBusy(null);
      })
      .catch((e: Error) => {
        setBusy(null);
        setWhy(e.message);
      });
  };

  const branch = () => {
    setBusy({ phase: "starting a new card", since: Date.now() });
    ask
      .start({ from: { document: id } })
      .then((s) => ask.store(s.document as Json))
      .then((d) => next(d.document))
      .catch((e: Error) => {
        setBusy(null);
        setWhy(e.message);
      });
  };

  if (!doc) return why ? <p className="warn">This card could not be read: {why}</p> : <Wait phase="reading the card" since={since} size="panel" />;

  const groups = (diagnosis?.groups ?? []).filter((g) => current && g.set === current.set);
  const widest = Math.max(1, ...groups.map((g) => g.kept + g.lost));
  const removeWhere = current ? options[current.set]?.moves.find((m) => m.kind === "remove_where") ?? null : null;
  return (
    <section className="query">
      <div className="query-head">
        <div className="grow">
          <span className="eyebrow">
            <a href={href("query")}>Query</a> · card
          </span>
          <h1>{cardTitle((doc.ask as Json).name as string | undefined, answer)}</h1>
        </div>
        {versions.length > 0 && (
          <nav className="versions" aria-label="versions">
            {versions.map((v) => (
              <a key={v.id} className={v.id === id ? "version on" : "version"} href={href("query", String(v.id))} title={[v.principal, whenWords(v.at)].filter(Boolean).join(", ")}>
                {v.label}
              </a>
            ))}
          </nav>
        )}
        <button type="button" className="button secondary" disabled={busy !== null} onClick={branch}>
          <Icon name="branch" />
          New card from here
        </button>
        <button type="button" className="button" disabled={busy !== null} onClick={runIt}>
          <Icon name="play" />
          Run
        </button>
      </div>
      {busy && <Wait phase={busy.phase} since={busy.since} />}
      {why && <p className="warn">{why}</p>}
      <div className="query-grid">
        <div className="query-main">
          <section className="panel card">
            <div className="row">
              <h2 className="grow">{current ? `Where the counts go in ${current.set}` : "Where the counts go"}</h2>
              {answered && <span className="tag brand">{answered.truncated ? "at least " : ""}{n(answered.count)} rows</span>}
            </div>
            {groups.length === 0 && <p className="meta">The counts come once the engine has checked the query.</p>}
            {groups.map((g) => (
              <div key={g.group} className="count-bar">
                <span className="count-group">{g.group}</span>
                <span className="count-track">
                  <i style={{ width: `${Math.round((100 * g.kept) / widest)}%` }} />
                </span>
                <span className="num">{n(g.kept)}</span>
                <span className="num meta">{g.subjects === g.kept ? "" : `${n(g.subjects)} subjects`}</span>
                {g.lost > 0 && <span className="num warn">−{n(g.lost)}</span>}
              </div>
            ))}
            <p className="meta">Charts of the subjects, sessions, stack types and demographics under a step come next.</p>
          </section>
          {current && (
            <section className="panel card">
              <div className="row">
                <h2 className="grow">Change {current.set}</h2>
                <span className="tag">{current.grain}</span>
              </div>
              {current.sentence && <p className="lede">{current.sentence}</p>}
              <div className="clauses">
                {current.where.map((c, i) => (
                  <span key={`w${i}`} className="clause-pill">
                    where {clauseText(c)}
                    {removeWhere && (
                      <button type="button" className="icon-button" aria-label="Remove this condition" disabled={busy !== null} onClick={() => applyMove(current.set, removeWhere, { index: i })}>
                        <Icon name="x" />
                      </button>
                    )}
                  </span>
                ))}
                {Object.entries(current.clauses).flatMap(([part, lines]) => (lines ?? []).map((l, i) => <span key={`${part}${i}`} className="clause-pill">{part} {l}</span>))}
              </div>
              {!move && (
                <div className="chips">
                  {nextMoves(current).map(({ move: m }) => (
                    <button key={m.id} type="button" className="move" disabled={busy !== null} onClick={() => { setMove(m); setTyped({}); }}>
                      <Icon name="plus" />
                      {m.template.split("{")[0].trim() || m.kind.replace(/_/g, " ")}
                    </button>
                  ))}
                </div>
              )}
              {move && (
                <MoveForm
                  move={move}
                  grain={current.grain}
                  typed={typed}
                  busy={busy !== null}
                  onType={(k, v) => setTyped((t) => ({ ...t, [k]: v }))}
                  onApply={() => {
                    const { args, missing } = argsOf(move, typed);
                    if (missing.length === 0) applyMove(current.set, move, args);
                  }}
                  onCancel={() => { setMove(null); setTyped({}); }}
                />
              )}
            </section>
          )}
          <section className="panel card">
            <div className="row">
              <h2 className="grow">Rows</h2>
              <button type="button" className="button secondary small" onClick={() => ask.preview(id).then(setRows, (e: Error) => setWhy(e.message))}>
                Preview 10 rows
              </button>
            </div>
            {rows && (
              <div className="table-wrap">
                <table className="thin">
                  <thead>
                    <tr>{rows.columns.map((c, i) => <th key={i}>{typeof c === "string" ? c : c.name}</th>)}</tr>
                  </thead>
                  <tbody>
                    {rows.rows.map((r, i) => (
                      <tr key={i}>{r.map((v, j) => <td key={j}>{v === null ? "" : String(v)}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <aside className="query-side">
          <section className="panel card">
            <div className="row">
              <Icon name="assistant" />
              <h2 className="grow">Talk it through</h2>
            </div>
            <p className="meta">The assistant comes to this card next: say a change in words, and it appears as a step to accept or disregard.</p>
          </section>
          <section className="panel timeline">
            <div className="row timeline-head">
              <h2 className="grow">Steps</h2>
              <span className="meta">{steps.length} {steps.length === 1 ? "set" : "sets"}</span>
            </div>
            {steps.map((s) => {
              const counts = stepCounts(diagnosis?.groups, s.set);
              return (
                <button key={s.set} type="button" className={s.set === current?.set ? "timeline-step on" : "timeline-step"} onClick={() => { setChosen(s.set); setMove(null); setTyped({}); }}>
                  <span className="timeline-dot" />
                  <span className="timeline-body">
                    <span className="row">
                      <b className="grow">{s.set}</b>
                      <span className="tag">{s.grain}</span>
                    </span>
                    <span className="meta">{s.source}</span>
                    {s.where.map((c, i) => <span key={i} className="timeline-clause">where {clauseText(c)}</span>)}
                    {Object.entries(s.clauses).flatMap(([part, lines]) => (lines ?? []).map((l, i) => <span key={`${part}${i}`} className="timeline-clause">{part} {l}</span>))}
                  </span>
                  <span className="num timeline-count">{counts ? n(counts.rows) : ""}</span>
                </button>
              );
            })}
            <div className="timeline-step answer">
              <span className="timeline-dot" />
              <span className="timeline-body">
                <b>The answer</b>
                <span className="meta">{answered ? `${answered.truncated ? "at least " : ""}${n(answered.count)} rows` : "not run in this view"}</span>
              </span>
            </div>
          </section>
          {!reviewer && <p className="meta">Starting from a list of identifiers asks for the reviewer role.</p>}
        </aside>
      </div>
    </section>
  );
}

function MoveForm(props: { move: Move; grain: string; typed: Record<string, string>; busy: boolean; onType: (k: string, v: string) => void; onApply: () => void; onCancel: () => void }) {
  const { move, grain, typed, busy, onType, onApply, onCancel } = props;
  const { missing } = argsOf(move, typed);
  const field = typed.field ?? "";
  const [suggested, setSuggested] = useState<{ values: [unknown, number][]; hidden: boolean } | null>(null);
  // smart proposals for a condition: the values the chosen field holds most, with their counts
  useEffect(() => {
    setSuggested(null);
    if (move.kind !== "add_where" || !field) return;
    let alive = true;
    ask
      .values(grain, field, 8)
      .then((r) => alive && setSuggested({ values: r.items ?? [], hidden: (r as { kind?: string }).kind === "shapes" }))
      .catch(() => alive && setSuggested(null));
    return () => {
      alive = false;
    };
  }, [move.kind, grain, field]);
  return (
    <div className="move-form">
      <p className="move-sentence">{preview(move, typed)}</p>
      <div className="move-holes">
        {move.holes.map((h) => {
          const kind = inputOf(h);
          const value = typed[h.name] ?? "";
          return (
            <label key={h.name} className="field">
              <span className="label">
                {h.name.replace(/_/g, " ")}
                {h.optional ? " (optional)" : ""}
              </span>
              <span className="input">
                {kind === "choice" && (
                  <select value={value} onChange={(e) => onType(h.name, e.target.value)}>
                    <option value="">choose</option>
                    {(h.fillers ?? []).map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                )}
                {kind === "yesno" && (
                  <select value={value} onChange={(e) => onType(h.name, e.target.value)}>
                    <option value="">choose</option>
                    <option value="true">yes</option>
                    <option value="false">no</option>
                  </select>
                )}
                {kind === "number" && <input type="number" value={value} onChange={(e) => onType(h.name, e.target.value)} />}
                {kind === "words" && <input value={value} onChange={(e) => onType(h.name, e.target.value)} />}
              </span>
            </label>
          );
        })}
      </div>
      {suggested && !suggested.hidden && suggested.values.length > 0 && (
        <div className="chips" aria-label="values this field holds">
          {suggested.values.map(([v, count]) => (
            <button key={String(v)} type="button" className="move" onClick={() => onType("value", String(v))}>
              {String(v)}
              <span className="meta num">{n(count)}</span>
            </button>
          ))}
        </div>
      )}
      {suggested?.hidden && <p className="meta">This field's values are not listed at your role; its shapes are.</p>}
      <div className="row actions">
        <button type="button" className="button small" disabled={busy || missing.length > 0} onClick={onApply}>
          Apply as the next version
        </button>
        <button type="button" className="button secondary small" onClick={onCancel}>
          Cancel
        </button>
        {missing.length > 0 && <span className="meta">still to fill: {missing.join(", ").replace(/_/g, " ")}</span>}
      </div>
    </div>
  );
}
