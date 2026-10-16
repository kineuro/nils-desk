// SPDX-License-Identifier: AGPL-3.0-only
// The Query page: every query kept is a card, and what the assistant drafted
// is a draft until a person keeps it (record 55 K6). A card opens on a
// version: its charts and the manual editor in the middle, and on the right
// the discussion and the card's steps as a timeline from its start to its
// answer. Every change is a move the engine offered, and applying one makes
// the next version, so a person can go back to any version and start again
// from it. The charts count what is under the step chosen on the timeline,
// each member once.

import { useCallback, useEffect, useMemo, useState } from "react";
import type React from "react";
import { chats, chatsKept } from "../assistant/chats";
import { titleOf } from "../assistant/client";
import type { Proposal } from "../assistant/parts";
import { stationsServed } from "../assistant/stations";
import { CompactionNote, ContextMeter } from "../assistant/ContextMeter";
import { TurnView } from "../assistant/TurnView";
import { StatusLine } from "../assistant/Cards";
import { liveLine } from "../assistant/steps";
import { useConversation, type Conversing } from "../assistant/useConversation";
import { ask, catalogFields, chain, columnName, DoorError, type DocumentHandle, type Diagnosis, type Json, type Move, type Options, type Preview, type Profile } from "../ask/client";
import { editor, setsOf } from "../ask/editor";
import { countIn, countText, HELD, heldCell, heldColumns, heldList, HELD_WHY, LIST_WHY, LIST_WORDS } from "../ask/held";
import type { Capabilities } from "../capabilities";
import { PromoteDialog } from "../data/PromoteDialog";
import { door as served } from "../deployment";
import { may } from "../grants";
import { objects, type DocumentRow, type Show } from "../objects/client";
import { href } from "../routes";
import { assistantModel, assistantOffered } from "../sections";
import { admit } from "../ui/context";
import { CountText } from "../ui/Count";
import { Icon } from "../ui/Icon";
import { useKept } from "../ui/kept";
import { Wait } from "../ui/Wait";
import { whenWords } from "../data/sources";
import { keptWords, mayKeep } from "./kept";
import { SaveSelection } from "./SaveSelection";
import { StartDialog } from "./StartDialog";
import { Exports } from "./Exports";
import { Selections } from "./Selections";
import { mayList, maySave } from "./selections";
import { ProfilePanel, StepEditor } from "./CardParts";
import { cardTitle, changeWords, clauseText, fieldChoices, keepingRefusal, stepCounts, versionsOf, type ChartTab, type Version } from "./cards";
import { useAnswerFile } from "./useAnswerFile";

const n = (v: number) => v.toLocaleString("en-US");

export function QueryPage({ caps, open }: { caps: Capabilities; open: string | null }) {
  if (open === "selections" && mayList(caps)) return <SelectionsPage caps={caps} />;
  if (open === "exports" && mayExport(caps)) return <ExportsPage caps={caps} />;
  const id = open !== null && /^\d+$/.test(open) ? Number(open) : null;
  return id === null ? <Cards caps={caps} /> : <Card caps={caps} id={id} />;
}

/** Whether the person finds Query's Exports: the kept results, where the engine lists them. */
export const mayExport = (caps: Capabilities): boolean => may(caps, "query:see") && served(caps, "GET /api/ask/handles");


function ExportsPage(_: { caps: Capabilities }) {
  return (
    <section className="query">
      <div className="data-head">
        <div className="grow">
          <span className="eyebrow">Query</span>
          <h1>Exports</h1>
        </div>
      </div>
      <Exports />
    </section>
  );
}

function SelectionsPage(_: { caps: Capabilities }) {
  return (
    <section className="query">
      <div className="data-head">
        <div className="grow">
          <span className="eyebrow">Query</span>
          <h1>Selections</h1>
        </div>
      </div>
      <Selections />
    </section>
  );
}

function Cards({ caps }: { caps: Capabilities }) {
  const [show, setShow] = useState<Show>("yes");
  const [rows, setRows] = useState<DocumentRow[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  /** How many lines are kept and how many are drafts, where the engine counts them. */
  const [counts, setCounts] = useState<{ cards?: number; drafts?: number }>({});
  const [why, setWhy] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [more, setMore] = useState(false);
  const [since] = useState(() => Date.now());
  useEffect(() => {
    let alive = true;
    setRows(null);
    setNext(null);
    setWhy(null);
    objects
      .documents({ kept: show })
      .then((r) => {
        if (!alive) return;
        setRows(r.documents);
        setNext(r.next);
        setCounts({ cards: r.cards, drafts: r.drafts });
      })
      .catch((e: Error) => alive && setWhy(e.message));
    return () => {
      alive = false;
    };
  }, [show]);
  const readMore = () => {
    if (next === null) return;
    setMore(true);
    objects
      .documents({ kept: show, after: next })
      .then((r) => {
        setRows((was) => [...(was ?? []), ...r.documents]);
        setNext(r.next);
      })
      .catch((e: Error) => setWhy(e.message))
      .finally(() => setMore(false));
  };
  return (
    <section className="query">
      <div className="data-head">
        <div className="grow">
          <span className="eyebrow">Query</span>
          <h1>Cards</h1>
        </div>
        {counts.drafts !== undefined && (
          <div className="chart-tabs" role="tablist" aria-label="Which cards">
            <button type="button" role="tab" aria-selected={show === "yes"} className={show === "yes" ? "on" : ""} onClick={() => setShow("yes")}>
              Cards
            </button>
            <button type="button" role="tab" aria-selected={show === "no"} className={show === "no" ? "on" : ""} onClick={() => setShow("no")}>
              Drafts {counts.drafts.toLocaleString("en-US")}
            </button>
          </div>
        )}
        <button type="button" className="button" onClick={() => setStarting(true)}>
          <Icon name="plus" />
          New card
        </button>
      </div>
      {rows === null && !why && <Wait phase="reading the cards" since={since} size="panel" />}
      {why && <p className="warn">The cards could not be read: {why}</p>}
      {rows !== null && rows.length === 0 && show === "yes" && <p className="lede">No card yet. New card starts one from everyone, a cohort, a saved selection, a kept result or a list of IDs.</p>}
      {rows !== null && rows.length === 0 && show === "no" && <p className="lede">No draft. What the assistant proposes waits here until you keep it.</p>}
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
      {next !== null && (
        <div className="row">
          <button type="button" className="button secondary" disabled={more} onClick={readMore}>
            More
          </button>
        </div>
      )}
      {starting && <StartDialog caps={caps} onClose={() => setStarting(false)} />}
    </section>
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
  /** The run's answer: its rows, null with why `held` where the list is held back whole at plain (record 55 K7, small lists). */
  const [answered, setAnswered] = useState<{ count: number | null; held: string | null; truncated: boolean; handle: number; grain: string } | null>(null);
  // record 26: a complete answer becomes a cohort, the subjects of its rows at any grain
  const [promoting, setPromoting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAs, setSavedAs] = useState<string | null>(null);
  const promotable = served(caps, "POST /api/ask/handles/{id}/promote") && may(caps, "data:work");
  // record 55 K6: a card is on the Cards list once a person keeps it, and goes back among the drafts when they put it back
  const keepable = mayKeep(caps);
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
  // Download CSV beside the preview (2026-10-12): the answer's rows as a file, as the chat's card saves them
  const file = useAnswerFile(id, cardTitle((doc?.ask as Json | undefined)?.name as string | undefined, answer), versions.find((v) => v.id === id)?.label ?? null);
  const current = steps.find((s) => s.set === chosen) ?? steps.find((s) => s.answers) ?? steps[0] ?? null;
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
        setAnswered({ count: r.row_count, held: heldList(r), truncated: r.truncated, handle: r.handle, grain: r.grain });
        setBusy(null);
      })
      .catch((e: Error) => {
        setBusy(null);
        setWhy(e.message);
      });
  };

  const keepCard = (keep: boolean) => {
    setBusy({ phase: keep ? "keeping the card" : "putting the card back", since: Date.now() });
    setWhy(null);
    (keep ? ask.keep(id) : ask.unkeep(id))
      .then(() => {
        setBusy(null);
        load();
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
  // a held count draws no bar and stands in no width
  const widest = Math.max(1, ...groups.map((g) => (countIn(g.kept) ?? 0) + (countIn(g.lost) ?? 0)));
  const held = heldColumns(rows);
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
        {doc.kept !== undefined && (
          <span className={doc.kept ? "tag ok" : "tag"} title={keptWords(doc.kept)}>
            {doc.kept ? "kept" : "draft"}
          </span>
        )}
        {keepable && doc.kept !== undefined && (
          <button type="button" className={doc.kept ? "button quiet" : "button secondary"} disabled={busy !== null} onClick={() => keepCard(doc.kept === null)}>
            {doc.kept ? "Unkeep" : "Keep"}
          </button>
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
              {answered && answered.count === null && (
                <span className="tag held" title={answered.held ?? LIST_WHY}>
                  rows {HELD}
                </span>
              )}
              {answered && answered.count !== null && <span className="tag brand">{answered.truncated ? "at least " : ""}{n(answered.count)} rows</span>}
            </div>
            {groups.length === 0 && <p className="meta">The counts come once the engine has checked the query.</p>}
            {groups.map((g) => (
              <div key={g.group} className="count-bar">
                <span className="count-group">{g.group}</span>
                <span className="count-track">
                  <i style={{ width: `${Math.round((100 * (countIn(g.kept) ?? 0)) / widest)}%` }} />
                </span>
                <CountText value={countIn(g.kept)} unit="rows" />
                <CountText value={countIn(g.subjects)} unit="subjects" className="num meta" />
                {g.lost !== null && g.lost > 0 && <span className="num warn">−{n(g.lost)}</span>}
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
              <button type="button" className="button secondary small" disabled={file.busy} onClick={file.download}>
                <Icon name="file" />
                Download CSV
              </button>
            </div>
            {file.said && (
              <p className={file.warn ? "warn" : "meta"} title={file.why ?? undefined}>
                {file.said}
              </p>
            )}
            {rows && heldList(rows) !== null && (
              <p className="meta held-words" title={heldList(rows) ?? undefined}>
                {LIST_WORDS}
              </p>
            )}
            {rows && heldList(rows) === null && (
              <div className="table-wrap">
                <table className="thin">
                  <thead>
                    <tr>{rows.columns.map((c, i) => <th key={i}>{typeof c === "string" ? c : c.name}</th>)}</tr>
                  </thead>
                  <tbody>
                    {rows.rows.map((r, i) => (
                      <tr key={i}>
                        {r.map((v, j) => {
                          const why = v === null ? held.get(columnName(rows.columns[j])) : undefined;
                          return (
                            <td key={j} className={why ? "held" : undefined} title={why}>
                              {why ? heldCell(why) : v === null ? "" : String(v)}
                            </td>
                          );
                        })}
                      </tr>
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
              const shown = counts ? (s.grain === "subject" ? counts.subjects : counts.rows) : null;
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
                  {counts ? (
                    <span className={shown === null ? "num timeline-count held" : "num timeline-count"} title={shown === null ? HELD_WHY : s.grain === "subject" ? "subjects, each once" : "rows"}>
                      {countText(shown)}
                    </span>
                  ) : (
                    <span className="num timeline-count" />
                  )}
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
                {answered && answered.count === null ? (
                  <span className="meta held" title={answered.held ?? LIST_WHY}>
                    rows {HELD}
                  </span>
                ) : (
                  <span className="meta">{answered && answered.count !== null ? `${answered.truncated ? "at least " : ""}${n(answered.count)} rows` : "not run in this view"}</span>
                )}
                {((answered && !answered.truncated && answered.count !== null && promotable) || maySave(caps)) && (
                  <span className="row actions">
                    {answered && !answered.truncated && answered.count !== null && promotable && (
                      <button type="button" className="button secondary small" disabled={busy !== null} onClick={() => setPromoting(true)}>
                        <Icon name="users" />
                        Make a cohort
                      </button>
                    )}
                    {maySave(caps) && (
                      <button type="button" className="button secondary small" disabled={busy !== null} onClick={() => setSaving(true)}>
                        Save as a selection
                      </button>
                    )}
                  </span>
                )}
                {savedAs && <span className="ok-words">{savedAs}</span>}
              </span>
            </div>
          </section>
        </aside>
      </div>
      {saving && (
        <SaveSelection
          documentId={id}
          title={cardTitle((doc.ask as Json).name as string | undefined, answer)}
          onClose={() => setSaving(false)}
          onSaved={(words) => {
            setSaving(false);
            setSavedAs(words);
          }}
        />
      )}
      {promoting && answered && answered.count !== null && (
        <PromoteDialog
          caps={caps}
          card={{ id, name: cardTitle((doc.ask as Json).name as string | undefined, answer), version: versions.find((v) => v.id === id)?.label ?? null }}
          answer={{
            handle: answered.handle,
            rows: answered.count,
            grain: answered.grain,
            subjects: profile && profile.set === answer && typeof (profile.value.counts as Record<string, unknown>).subjects === "number" ? ((profile.value.counts as Record<string, unknown>).subjects as number) : null,
            epoch: caps.engine?.registry.epoch ?? null,
          }}
          onClose={() => setPromoting(false)}
        />
      )}
    </section>
  );
}

function TalkPanel({ caps, talkable, talk, onSay }: { caps: Capabilities; talkable: boolean; talk: Conversing; onSay: (words: string) => void }) {
  const [text, setText] = useState("");
  const [unfolded, setUnfolded] = useState<Set<string>>(new Set());
  const warming = (caps.kvasir?.["health"] as { warming?: boolean } | undefined)?.warming === true;
  const model = assistantModel(caps);
  const pane = talk.pane;
  const status = liveLine(pane, talk.slow);
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
                charts={pane.charts[t.id]}
                files={pane.files[t.id]}
                decidedElsewhere="It stands in the steps below."
                said={pane.finals[t.id]}
              />
            ))}
            {status && <StatusLine words={status} />}
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
