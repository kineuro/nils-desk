// SPDX-License-Identifier: AGPL-3.0-only
// The assistant pane (Wave 4c section 7.7): the chat beside the question,
// sharing exactly two values with it, the current document id and the
// epoch. It renders the parts the reducer admitted and nothing else: a
// proposal as a unified diff of the two canonical texts with the
// assistant's sentence above it, a choice as typed options with counts, the
// status line, and the handles it cited. Accept moves the desk's pointer;
// reject sends the proposal back as feedback so the next turn knows.

import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";
import type { Capabilities } from "../capabilities";
import { ask, desk, type Diff } from "../ask/client";
import { assistant, conversationFor, newConversation, remember, StaleProposal, type Conversation, type Delegation } from "./client";
import type { PageContext } from "../ui/context";
import { unified } from "./diff";
import { empty, fromHistory, reduce, type PaneState, type Proposal } from "./parts";

const TOKEN_PUSH_MS = 5 * 60_000;
const DELEGATION_POLL_MS = 4_000;

/** The station the pane speaks to: the concierge holds the conversation when the assistant serves one (section 9.12), else ask-help directly. */
export function stationOf(caps: Capabilities): string {
  const list = (caps.assistant?.["stations"] as { id?: string }[] | undefined) ?? [];
  return list.some((s) => s.id === "concierge") ? "concierge" : "ask-help";
}

export interface PaneProps {
  caps: Capabilities;
  /** The current document and its chain, so a conversation follows a version; null on the start page. */
  docId: number | null;
  chain: number[];
  epoch: number;
  onOpen: (id: number) => void;
  /** The page's typed context (Wave 5 section 9.2), sent beside every turn. */
  context?: PageContext;
}

export function Pane({ caps, docId, chain, epoch, onOpen, context }: PaneProps) {
  const [conv, setConv] = useState<Conversation | null>(() => conversationFor(docId === null ? [] : [docId, ...chain]));
  const [state, setState] = useState<PaneState>(empty);
  const [text, setText] = useState("");
  const [why, setWhy] = useState<string | null>(null);
  const [diffs, setDiffs] = useState<Record<number, string | null>>({});
  const reader = useRef<AbortController | null>(null);
  const health = caps.kvasir?.["health"] as { warming?: boolean } | undefined;
  const warming = health?.warming === true;
  const STATION = stationOf(caps);
  const [tasks, setTasks] = useState<Delegation[]>([]);

  // the stream: from the offset the state holds, until the submission settles
  const follow = useCallback(
    (c: Conversation, from: string) => {
      // eslint-disable-next-line react-hooks/exhaustive-deps -- the station is fixed for the deployment
      reader.current?.abort();
      const ctl = new AbortController();
      reader.current = ctl;
      let offset = from;
      const loop = async () => {
        while (!ctl.signal.aborted) {
          const { chunks, next } = await assistant.updates(STATION, c.id, offset, ctl.signal);
          let settled = false;
          setState((s) => {
            let out = s;
            for (const ch of chunks) out = reduce(out, ch);
            settled = out.settled !== null && !out.busy;
            return { ...out, offset: next };
          });
          offset = next;
          if (settled && chunks.length > 0) {
            // the concierge settles at once and is woken when its delegate settles: keep reading while a task is pending (section 9.12)
            let pending = false;
            if (STATION === "concierge") {
              const list = await assistant.delegations(c.id).catch(() => [] as Delegation[]);
              setTasks(list);
              pending = list.some((t) => t.state === "queued" || t.state === "running");
            }
            if (!pending) return;
            setState((s) => ({ ...s, busy: true }));
            await new Promise((r) => setTimeout(r, DELEGATION_POLL_MS));
          }
        }
      };
      loop().catch((e: Error) => {
        if (e.name !== "AbortError") setWhy(e.message);
      });
    },
    [STATION],
  );

  // opening: the history, the token, and a running turn followed
  useEffect(() => {
    if (!conv) return;
    let alive = true;
    assistant.token(conv.id).catch(() => undefined);
    assistant
      .history(STATION, conv.id)
      .then((h) => {
        if (!alive) return;
        const s = h ? fromHistory(h, state) : empty();
        setState(s);
        if (s.busy) follow(conv, s.offset);
      })
      .catch((e: Error) => alive && setWhy(e.message));
    const t = setInterval(() => assistant.token(conv.id).catch(() => undefined), TOKEN_PUSH_MS);
    return () => {
      alive = false;
      clearInterval(t);
      reader.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the pane reloads when the conversation changes, not when the state does
  }, [conv?.id, follow]);

  // the diff of each open proposal against its parent, once
  useEffect(() => {
    for (const p of state.proposals) {
      if (p.decided !== null || p.document in diffs) continue;
      setDiffs((d) => ({ ...d, [p.document]: null }));
      const base = p.parent ?? docId;
      const sides = base === null ? null : ([{ document_id: base }, { document_id: p.document }] as const);
      (sides ? ask.diff(sides[0], sides[1]) : ask.get(p.document).then((d): Diff => ({ same: false, canonical_a: "", canonical_b: JSON.stringify(d.ask, null, 2) })))
        .then((d) => setDiffs((x) => ({ ...x, [p.document]: d.refused ? `the diff door refused: ${d.refused}` : unified(d.canonical_a ?? "", d.canonical_b ?? "") })))
        .catch((e: Error) => setDiffs((x) => ({ ...x, [p.document]: e.message })));
    }
  }, [state.proposals, diffs, docId]);

  const send = (words: string) => {
    const message = docId === null ? words : `${words} (the base document is ${docId}; refine it rather than start over)`;
    const c = conv ?? newConversation(docId, null);
    if (!conv) setConv(c);
    setWhy(null);
    setText("");
    setState((s) => ({ ...s, busy: true, settled: null }));
    // the lineage is the chain's root (section 7.4); the assistant keys the conversation by it
    const lineage = chain.length > 0 ? chain[0] : docId;
    assistant
      .send(STATION, c.id, message, { context, lineage, document: docId })
      .then(({ offset }) => follow(c, state.offset === "-1" ? "-1" : offset))
      .catch((e: Error) => {
        setWhy(e.message);
        setState((s) => ({ ...s, busy: false }));
      });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim().length === 0 || state.busy || warming) return;
    send(text.trim());
  };

  const decide = (p: Proposal, verdict: "accepted" | "rejected", why?: string) => {
    if (!conv || p.stale) return;
    const row = { document: p.document, sentence: p.sentence, ...(why ? { why } : {}), ...(docId !== null ? { current: docId } : {}) };
    assistant
      .feedback(conv.id, verdict === "accepted" ? [row] : [], verdict === "rejected" ? [row] : [])
      .then(() => {
        setState((s) => ({ ...s, proposals: s.proposals.map((x) => (x.document === p.document ? { ...x, decided: verdict } : x)) }));
        if (verdict === "accepted") {
          const parent = p.parent ?? docId;
          if (parent !== null && parent !== p.document) desk.lineage(p.document, parent).catch(() => undefined);
          remember({ ...conv, document: p.document });
          onOpen(p.document);
        }
      })
      .catch((e: Error) => {
        // the question moved on since the proposal: it reads as stale and stays undecided (section 7.4)
        if (e instanceof StaleProposal) setState((s) => ({ ...s, proposals: s.proposals.map((x) => (x.document === p.document ? { ...x, stale: { moved_to: e.movedTo } } : x)) }));
        else setWhy(e.message);
      });
  };

  // typing in the document rejects (Wave 5 section 7.3): an edit made by hand sends every pending proposal back as rejected
  useEffect(() => {
    const onEdited = () => {
      setState((s) => {
        const pending = s.proposals.filter((p) => p.decided === null);
        if (pending.length === 0 || !conv) return s;
        assistant.feedback(conv.id, [], pending.map((p) => ({ document: p.document, sentence: p.sentence, why: "the person edited the document instead" }))).catch(() => undefined);
        return { ...s, proposals: s.proposals.map((p) => (p.decided === null ? { ...p, decided: "rejected" as const } : p)) };
      });
    };
    window.addEventListener("nils:document-edited", onEdited);
    return () => window.removeEventListener("nils:document-edited", onEdited);
  }, [conv]);

  const fresh = () => {
    reader.current?.abort();
    setConv(newConversation(docId, conv?.id ?? null));
    setState(empty());
    setDiffs({});
    setWhy(null);
  };

  return (
    <aside className="assistant">
      <header className="row">
        <h2>Assistant</h2>
        <span className="meta">
          {docId === null ? "no document open" : `document ${docId}`}, epoch {epoch}
        </span>
        <button type="button" onClick={fresh} disabled={state.busy}>New conversation</button>
      </header>
      {warming && <p className="warming">Warming: the model backend has not produced its first token since it started.</p>}
      {why && <p className="warn">{why}</p>}
      <ol className="turns">
        {state.turns.map((t) => (
          <li key={t.id} className={t.role}>
            {t.text && <p>{t.text}</p>}
            {t.tools.length > 0 && (
              <ul className="tools">
                {t.tools.map((x) => (
                  <li key={x.id} className={x.state}>{x.name}</li>
                ))}
              </ul>
            )}
            {state.proposals
              .filter((p) => p.turn === t.id)
              .map((p) => (
                <ProposalView key={p.document} p={p} diff={diffs[p.document]} onDecide={(v) => decide(p, v)} />
              ))}
            {state.choice?.turn === t.id && (
              <div className="choice">
                <p>{state.choice.question}</p>
                <ul>
                  {state.choice.options.map((o) => (
                    <li key={o.label}>
                      <button type="button" disabled={state.busy} onClick={() => send(o.label)}>
                        {o.label}
                        {o.count !== null && <span className="count">{o.count}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        ))}
      </ol>
      {tasks.length > 0 && (
        <ul className="tasks">
          {tasks.map((t) => (
            <li key={t.task} className={t.state}>
              {t.task} with {t.station}: {t.state}
              {t.result?.sentence && <> , {t.result.sentence}</>}
              {t.error && <> , {t.error}</>}
            </li>
          ))}
        </ul>
      )}
      {state.status && (
        <p className="status">
          <span className="tag">{state.status.phase}</span> {state.status.text}
        </p>
      )}
      {state.settled && state.settled.outcome !== "completed" && state.settled.outcome !== "settled" && (
        <p className="warn">The run ended: {state.settled.outcome}{state.settled.error ? `, ${state.settled.error}` : ""}.</p>
      )}
      {state.handles.length > 0 && (
        <p className="meta">
          Results cited:{" "}
          {state.handles.map((h) => (
            <a key={h} href={`#handle/${h}`}>handle {h}</a>
          ))}
        </p>
      )}
      {state.aside.length > 0 && (
        <details>
          <summary>What it read and noted</summary>
          <ul className="aside">
            {state.aside.map((a, i) => (
              <li key={`${a.kind}-${i}`}>
                {a.kind === "lookup" && <>looked up {a.level}.{a.field}: {a.values.join(", ")}</>}
                {(a.kind === "note" || a.kind === "todo") && <>{a.kind}: {a.text}</>}
                {a.kind === "funnel" && <>funnel: {a.rows.map((r) => `${r.set} ${r.stage} ${r.rows} rows, ${r.subjects} subjects`).join("; ")}</>}
              </li>
            ))}
          </ul>
        </details>
      )}
      <form onSubmit={submit} className="say">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder={docId === null ? "Words to a document" : "One step of this document, in words"} disabled={warming} />
        <div className="row">
          <button type="submit" disabled={state.busy || warming || text.trim().length === 0}>{state.busy ? "Working" : "Send"}</button>
          {state.busy && conv && <button type="button" onClick={() => assistant.abort(STATION, conv.id).catch(() => undefined)}>Stop</button>}
        </div>
      </form>
    </aside>
  );
}

function ProposalView({ p, diff, onDecide }: { p: Proposal; diff: string | null | undefined; onDecide: (v: "accepted" | "rejected") => void }) {
  return (
    <div className={`proposal ${p.decided ?? "open"}`}>
      <p className="sentence">{p.sentence}</p>
      <p className="meta">
        proposes document {p.document}
        {p.parent !== null && <> from {p.parent}</>}
        {p.decided && <> , {p.decided}</>}
        {p.stale && <span className="tag warn"> stale</span>}
      </p>
      {p.stale && (
        <p className="reason">
          The question moved on{p.stale.moved_to !== null && <> to {p.stale.moved_to}</>} since this was proposed; it cannot be accepted. Say it again on the open version.
        </p>
      )}
      {p.decided === null && !p.stale && (
        <>
          {diff === undefined || diff === null ? <p className="meta">Reading the diff</p> : diff === "" ? <p className="meta">No change against the base.</p> : <pre className="udiff">{diff.split("\n").map((l, i) => <span key={`${i}-${l}`} className={l.startsWith("+") ? "add" : l.startsWith("-") ? "del" : l.startsWith("@@") ? "hunk" : ""}>{l}{"\n"}</span>)}</pre>}
          <div className="row">
            <button type="button" className="on" onClick={() => onDecide("accepted")}>Accept</button>
            <button type="button" onClick={() => onDecide("rejected")}>Reject</button>
          </div>
        </>
      )}
    </div>
  );
}
