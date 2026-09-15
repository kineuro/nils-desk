// SPDX-License-Identifier: AGPL-3.0-only
// The Query page: every query kept is a card. A card opens on a version: its
// charts and the manual editor in the middle, and on the right the discussion
// and the card's steps as a timeline from its start to its answer. Every change
// is a move the engine offered, and applying one makes the next version, so a
// person can go back to any version and start again from it. The charts count
// what is under the step chosen on the timeline, each member once.

import { useCallback, useEffect, useMemo, useState } from "react";
import type React from "react";
import { chats, chatsKept } from "../assistant/chats";
import { titleOf } from "../assistant/client";
import type { Proposal } from "../assistant/parts";
import { stationsServed } from "../assistant/stations";
import { CompactionNote, ContextMeter } from "../assistant/ContextMeter";
import { TurnView } from "../assistant/TurnView";
import { useConversation, type Conversing } from "../assistant/useConversation";
import { ask, catalogFields, chain, DoorError, type DocumentHandle, type Diagnosis, type Json, type Move, type Options, type Preview, type Profile } from "../ask/client";
import { editor, setsOf } from "../ask/editor";
import { countWords, startBody, type From, type Started } from "../ask/start";
import type { Capabilities } from "../capabilities";
import { sees } from "../grants";
import { objects, type DocumentRow } from "../objects/client";
import { href } from "../routes";
import { assistantModel, assistantOffered } from "../sections";
import { admit } from "../ui/context";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { useKept } from "../ui/kept";
import { Wait } from "../ui/Wait";
import { whenWords } from "../data/sources";
import { ProfilePanel, StepEditor } from "./CardParts";
import { cardTitle, changeWords, clauseText, fieldChoices, keepingRefusal, stepCounts, versionsOf, type ChartTab, type Version } from "./cards";

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
  // counting is asking; opening what was counted as a card keeps it
  const keeping = keepingRefusal(caps);
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
            keeping === null && (
              <button type="button" className="button" disabled={busy} onClick={open}>
                Open as a card
              </button>
            )
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
      {keeping !== null ? (
        <p className="meta">{keeping} Counting here keeps nothing.</p>
      ) : (
        <p className="meta">
          A saved card, a kept result and a list of identifiers are started from too: open a card and choose Start a new card from here
          {sees(caps, "quasi") ? "." : "; a list of identifiers asks to see sex and age in records."}
        </p>
      )}
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
  const [profile, setProfile] = useState<{ set: string; field: string; value: Profile } | null>(null);
  const [profileWhy, setProfileWhy] = useState<string | null>(null);
  const [tab, setTab] = useState<ChartTab>("stacks");
  const [field, setField] = useState("manufacturer");
  const [fields, setFields] = useState<string[]>([]);

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
    setProfile(null);
    setBusy(null);
    load();
  }, [load]);

  const steps = useMemo(() => (doc ? editor(doc.ask, options) : []), [doc, options]);
  const answer = ((doc?.ask.out as Json | undefined)?.set as string | undefined) ?? null;
  const current = steps.find((s) => s.set === chosen) ?? steps.find((s) => s.answers) ?? steps[0] ?? null;
  // a list of identifiers is started from with detail quasi (record 25)
  const lists = sees(caps, "quasi");
  // a new card from this one, or a proposed version taken, is kept, which needs work on the Query page
  const keeping = keepingRefusal(caps);
  const profiled = current?.set ?? null;

  // the charts follow the step chosen on the timeline, and are counted again for every version
  useEffect(() => {
    if (profiled === null) return;
    let alive = true;
    setProfileWhy(null);
    ask.profile(id, profiled, field).then(
      (p) => alive && setProfile({ set: profiled, field, value: p }),
      (e: Error) => alive && setProfileWhy(e.message),
    );
    return () => {
      alive = false;
    };
  }, [id, doc, profiled, field]);

  // the card's discussion: the conversation opened on any of its versions, followed across them
  const station = "ask-help";
  const talkable = assistantOffered(caps) && stationsServed(caps).includes(station);
  const [conv, setConv] = useState<string | null>(null);
  const talk = useConversation(station, conv);
  const root = versions.some((v) => v.id === id) ? versions[0].id : null;
  // the person's conversation on any version of this card, from the assistant's list (the chat, slice 2)
  const chatList = useKept(chatsKept);
  useEffect(() => {
    talk.reset();
    setConv(null);
  }, [root]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (root === null || !talkable) return;
    chatsKept.ensure();
    const chain = versions.map((v) => v.id);
    const found = (chatList.value?.conversations ?? []).find((c) => c.station === station && c.document !== null && chain.includes(c.document));
    if (found) setConv((was) => was ?? found.id);
  }, [root, chatList.value]); // eslint-disable-line react-hooks/exhaustive-deps

  const pending = talk.pane.proposals.filter((p) => p.decided === null);
  const [changes, setChanges] = useState<Record<string, string[]>>({});
  const pendingKey = pending.map((p) => p.document).join(",");
  // what each proposed version changes against the version open
  useEffect(() => {
    for (const p of pending) {
      const key = `${id}:${p.document}`;
      if (changes[key] || p.stale) continue;
      ask.diff({ document_id: id }, { document_id: p.document }).then(
        (d) => setChanges((c) => ({ ...c, [key]: (d.changes ?? []).map(changeWords).filter((w) => w !== "") })),
        () => undefined,
      );
    }
  }, [pendingKey, id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let alive = true;
    catalogFields("stack").then(
      (f) => alive && setFields(fieldChoices(f)),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, []);

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

  const say = async (words: string) => {
    let target = conv;
    if (!target) {
      // the assistant names the card's conversation, and it is the person's
      try {
        const made = await chats.create({ station, title: titleOf(words), title_by: "words", document: id, lineage: root ?? id });
        target = made.id;
        talk.made(target);
        setConv(target);
        chatsKept.refresh().catch(() => undefined);
      } catch (e) {
        setWhy(e instanceof Error ? e.message : String(e));
        return;
      }
    }
    const context = admit({
      page: { kind: "query", id: String(id) },
      document_id: id,
      content_hash: doc?.hash,
      chain: versions.map((v) => v.id),
      epoch: caps.engine?.registry.epoch,
      sets: steps.map((s) => ({ name: s.set, grain: s.grain })),
      funnel: steps.flatMap((s) => {
        const c = stepCounts(diagnosis?.groups, s.set);
        return c ? [{ set: s.set, rows: c.rows }] : [];
      }),
    });
    talk.send(target, words, { context, lineage: root ?? id, document: id });
  };

  // accepting a proposal: the assistant records it against the version open, and the engine keeps it as that version's next
  const take = (p: Proposal) => {
    setBusy({ phase: "taking the proposed version", since: Date.now() });
    setWhy(null);
    talk
      .decide(p, "accepted", id)
      .then((ok) => (ok ? ask.storeUnder(p.document, id).then((d) => next(d.document)) : setBusy(null)))
      .catch((e: Error) => {
        setBusy(null);
        setWhy(e.message);
      });
  };

  if (!doc) return why ? <p className="warn">This card could not be read: {why}</p> : <Wait phase="reading the card" since={since} size="panel" />;

  const groups = (diagnosis?.groups ?? []).filter((g) => current && g.set === current.set);
  const widest = Math.max(1, ...groups.map((g) => g.kept + g.lost));
  // a new step is a move on the whole query, offered with any set's options
  const addSet = current ? options[current.set]?.moves.find((m) => m.kind === "add_set") ?? null : null;
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
        {keeping === null && (
          <button type="button" className="button secondary" disabled={busy !== null} onClick={branch}>
            <Icon name="branch" />
            New card from here
          </button>
        )}
        <button type="button" className="button" disabled={busy !== null} onClick={runIt}>
          <Icon name="play" />
          Run
        </button>
      </div>
      {busy && <Wait phase={busy.phase} since={busy.since} />}
      {why && <p className="warn">{why}</p>}
      {keeping !== null && <p className="meta">{keeping}</p>}
      <div className="query-grid">
        <div className="query-main">
          <ProfilePanel
            set={profiled}
            profile={profile && profile.set === profiled ? profile.value : null}
            loading={profiled !== null && (profile === null || profile.set !== profiled || profile.field !== field)}
            why={profileWhy}
            tab={tab}
            onTab={setTab}
            field={field}
            fields={fields}
            onField={setField}
          />
          {current && (
            <StepEditor
              step={current}
              options={options[current.set] ?? null}
              move={move}
              typed={typed}
              busy={busy !== null}
              onMove={(m) => {
                setMove(m);
                setTyped({});
              }}
              onType={(k, v) => setTyped((t) => ({ ...t, [k]: v }))}
              onApply={applyMove}
            />
          )}
          <section className="panel card">
            <div className="row">
              <h2 className="grow">{current ? `Where the rows go in ${current.set}` : "Where the rows go"}</h2>
              {answered && <span className="tag brand">{answered.truncated ? "at least " : ""}{n(answered.count)} rows</span>}
            </div>
            {groups.length === 0 && <p className="meta">The counts come once the engine has checked the query.</p>}
            {groups.map((g) => (
              <div key={g.group} className="count-bar">
                <span className="count-group">{g.group}</span>
                <span className="count-track">
                  <i style={{ width: `${Math.round((100 * g.kept) / widest)}%` }} />
                </span>
                <span className="num">{n(g.kept)} rows</span>
                <span className="num meta">{n(g.subjects)} subjects</span>
                {g.lost > 0 && <span className="num warn">−{n(g.lost)}</span>}
              </div>
            ))}
            <p className="meta">A row is a member for each path that reaches it, so a subject in two of the cohorts a query starts from is two rows. The numbers above count each member once.</p>
          </section>
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
          <TalkPanel caps={caps} talkable={talkable} talk={talk} onSay={say} />
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
                  <span className="num timeline-count" title={counts ? (s.grain === "subject" ? "subjects, each once" : "rows") : undefined}>{counts ? n(s.grain === "subject" ? counts.subjects : counts.rows) : ""}</span>
                </button>
              );
            })}
            {pending.map((p) => (
              <div key={p.document} className={p.stale ? "timeline-step proposed stale" : "timeline-step proposed"}>
                <span className="timeline-dot" />
                <span className="timeline-body">
                  <span className="row">
                    <b className="grow">Proposed next version</b>
                    <span className="tag brand">from the assistant</span>
                  </span>
                  <span>{p.sentence}</span>
                  {(changes[`${id}:${p.document}`] ?? []).map((w, i) => (
                    <span key={i} className="timeline-clause">
                      {w}
                    </span>
                  ))}
                  {p.stale ? (
                    <span className="meta">It was made for another version, so it can no longer be taken here.</span>
                  ) : (
                    <span className="row actions">
                      {keeping === null && (
                        <button type="button" className="button small" disabled={busy !== null} onClick={() => take(p)}>
                          Accept
                        </button>
                      )}
                      <button type="button" className="button secondary small" disabled={busy !== null} onClick={() => void talk.decide(p, "rejected", id)}>
                        Disregard
                      </button>
                    </span>
                  )}
                </span>
              </div>
            ))}
            {addSet && (
              <div className="timeline-add">
                <button type="button" className="move" disabled={busy !== null} onClick={() => { setMove(addSet); setTyped({}); }}>
                  <Icon name="plus" />
                  Add a step
                </button>
              </div>
            )}
            <div className="timeline-step answer">
              <span className="timeline-dot" />
              <span className="timeline-body">
                <b>The answer</b>
                <span className="meta">{answered ? `${answered.truncated ? "at least " : ""}${n(answered.count)} rows` : "not run in this view"}</span>
              </span>
            </div>
          </section>
          {keeping === null && !lists && <p className="meta">Starting from a list of identifiers asks to see sex and age in records.</p>}
        </aside>
      </div>
    </section>
  );
}

function TalkPanel({ caps, talkable, talk, onSay }: { caps: Capabilities; talkable: boolean; talk: Conversing; onSay: (words: string) => void }) {
  const [text, setText] = useState("");
  const [unfolded, setUnfolded] = useState<Set<string>>(new Set());
  const warming = (caps.kvasir?.["health"] as { warming?: boolean } | undefined)?.warming === true;
  const model = assistantModel(caps);
  const pane = talk.pane;
  const settled = pane.settled && pane.settled.outcome !== "completed" ? pane.settled : null;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const words = text.trim();
    if (!words || pane.busy || warming) return;
    setText("");
    onSay(words);
  };
  const toggle = (turn: string) =>
    setUnfolded((was) => {
      const next = new Set(was);
      if (next.has(turn)) next.delete(turn);
      else next.add(turn);
      return next;
    });
  return (
    <section className="panel card card-talk">
      <div className="row">
        <Icon name="assistant" />
        <h2 className="grow">Talk it through</h2>
        {talkable && model && <span className="tag">{model}</span>}
        {talkable && <ContextMeter context={talk.context} />}
      </div>
      {!talkable && <p className="meta">The assistant is not open to you here. The card still changes by hand, step by step.</p>}
      {talkable && (
        <>
          <div className="talk card-talk-log" aria-live="polite">
            <CompactionNote context={talk.context} />
            {pane.turns.length === 0 && !pane.busy && (
              <p className="meta">Say a change in words, such as only women, or their T1w stacks. The assistant proposes it as the next version, and it stands in the steps below to accept or disregard.</p>
            )}
            {pane.turns.map((t) => (
              <TurnView
                key={t.id}
                turn={t}
                open={unfolded.has(t.id)}
                onToggle={() => toggle(t.id)}
                proposals={pane.proposals.filter((p) => p.turn === t.id)}
                choice={pane.choice?.turn === t.id && !pane.busy ? pane.choice : null}
                onChoose={(label) => onSay(label)}
                decidedElsewhere="It stands in the steps below."
                said={pane.finals[t.id]}
              />
            ))}
            {pane.busy && <Wait phase={pane.status?.text ?? "thinking"} since={talk.since || Date.now()} />}
            {settled && <p className={settled.outcome === "aborted" ? "meta" : "warn"}>{settled.outcome === "aborted" ? "Stopped." : (settled.error ?? "The assistant did not finish this turn.")}</p>}
            {talk.why && <p className="warn">{talk.why}</p>}
          </div>
          <form className="card-talk-composer" onSubmit={submit}>
            <div className="input composer-input">
              <textarea
                value={text}
                rows={2}
                placeholder={warming ? "The model is warming" : "Say a change in words"}
                aria-label="Talk to the assistant about this card"
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) submit(e);
                  else if (e.key === "Escape" && pane.busy) {
                    e.preventDefault();
                    talk.stop();
                  }
                }}
              />
              {pane.busy ? (
                <button type="button" className="icon-button" aria-label="Stop" title="Stop" onClick={talk.stop}>
                  <Icon name="x" />
                </button>
              ) : (
                <button type="submit" className="icon-button" aria-label="Send" disabled={warming || text.trim().length === 0}>
                  <Icon name="arrow" />
                </button>
              )}
            </div>
          </form>
        </>
      )}
    </section>
  );
}
