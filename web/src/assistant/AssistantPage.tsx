// SPDX-License-Identifier: AGPL-3.0-only
// The Assistant's page (Wave 5 section 9, as a page of its own): one
// conversation at a time, the conversations this browser keeps listed under
// the Assistant in the side. It shows what was asked and answered, what the
// assistant did as a folded list of steps, each new version it proposes to
// accept or disregard, a choice answered with a click, and the plans it made,
// which run only once confirmed. Another page may hand it a sentence to start
// from.

import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";
import type { Capabilities } from "../capabilities";
import { href } from "../routes";
import { assistantModel } from "../sections";
import { admit } from "../ui/context";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import { assistant, conversations, newConversation, StaleProposal, takeSaid, titleOf, type Delegation, type Plan } from "./client";
import { empty, fromHistory, reduce, type PaneState, type Proposal, type Turn } from "./parts";
import { stationOf, stationsServed } from "./stations";
import { foldedSteps, stepLines } from "./steps";

const TOKEN_PUSH_MS = 5 * 60_000;
const DELEGATION_POLL_MS = 4_000;

/** The stations a person talks to here, by what they do. */
const STATION_WORDS: Record<string, string> = {
  concierge: "Asks about the registry",
  "ask-help": "Builds queries",
  operator: "Plans work",
};

/** What the page says before anything is asked, by station. */
function hint(station: string): string {
  if (station === "operator") return "Say what should come in, and when. The assistant plans it, and nothing runs until you confirm.";
  if (station === "ask-help") return "Say what you want to find. The assistant drafts it as a query, and each change it makes is a version you accept or disregard.";
  return "Ask about what the registry holds, or say what you want to find.";
}

/** The sentence for a turn that ended some other way than answering. */
function ending(settled: PaneState["settled"]): string | null {
  if (!settled || settled.outcome === "completed") return null;
  if (settled.outcome === "aborted") return "Stopped.";
  return settled.error ?? "The assistant did not finish this turn.";
}

export function AssistantPage({ caps, conversation }: { caps: Capabilities; conversation: string | null }) {
  const opened = conversation && conversation !== "new" ? conversation : null;
  const known = opened ? (conversations().find((c) => c.id === opened) ?? null) : null;
  const handed = useRef(opened === null ? takeSaid() : null);
  const served = stationsServed(caps).filter((s) => s in STATION_WORDS);
  const [station, setStation] = useState(() => known?.station ?? handed.current?.station ?? stationOf(caps));
  const [conv, setConv] = useState<string | null>(known?.id ?? null);
  const [pane, setPane] = useState<PaneState>(empty);
  const current = useRef<PaneState>(empty());
  const fresh = useRef<string | null>(null);
  const [since, setSince] = useState(0);
  const [text, setText] = useState(() => handed.current?.words ?? "");
  const [why, setWhy] = useState<string | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [unfolded, setUnfolded] = useState<Set<string>>(new Set());
  const reader = useRef<AbortController | null>(null);
  const input = useRef<HTMLTextAreaElement | null>(null);
  const warming = (caps.kvasir?.["health"] as { warming?: boolean } | undefined)?.warming === true;
  const model = assistantModel(caps);
  const context = admit({ page: { kind: "assistant", id: null }, epoch: caps.engine?.registry.epoch });

  // the reducer's state is kept in a ref as well, so the reading loop decides on what it just applied
  const apply = useCallback((f: (s: PaneState) => PaneState) => {
    current.current = f(current.current);
    setPane(current.current);
  }, []);

  const readPlans = useCallback((id: string) => {
    assistant
      .inbox()
      .then((i) => setPlans(i.plans.filter((p) => p.conversation === id && p.state !== "done")))
      .catch(() => setPlans([]));
  }, []);

  const follow = useCallback(
    (id: string, from: string) => {
      reader.current?.abort();
      const ctl = new AbortController();
      reader.current = ctl;
      let offset = from;
      const loop = async () => {
        while (!ctl.signal.aborted) {
          const { chunks, next } = await assistant.updates(station, id, offset, ctl.signal);
          apply((s) => {
            let out = s;
            for (const c of chunks) out = reduce(out, c);
            return { ...out, offset: next };
          });
          offset = next;
          const s = current.current;
          if (chunks.length > 0 && s.settled !== null && !s.busy) {
            // the concierge settles at once and is woken when its delegate settles (4c section 9.12)
            let pending = false;
            if (station === "concierge") {
              const tasks = await assistant.delegations(id).catch(() => [] as Delegation[]);
              pending = tasks.some((t) => t.state === "queued" || t.state === "running");
            }
            if (!pending) {
              readPlans(id);
              return;
            }
            apply((x) => ({ ...x, busy: true }));
            await new Promise((r) => setTimeout(r, DELEGATION_POLL_MS));
          }
        }
      };
      loop().catch((e: Error) => {
        if (e.name !== "AbortError") setWhy(e.message);
      });
    },
    [station, apply, readPlans],
  );

  // another conversation opened from the side, or a new one: start from its history
  useEffect(() => {
    if (opened === conv) return;
    reader.current?.abort();
    const c = opened ? (conversations().find((x) => x.id === opened) ?? null) : null;
    apply(() => empty());
    setPlans([]);
    setWhy(null);
    setConv(c?.id ?? null);
    if (c?.station) setStation(c.station);
  }, [opened]); // eslint-disable-line react-hooks/exhaustive-deps

  // opening a kept conversation: its history, the person's token, and a turn still running followed
  useEffect(() => {
    if (!conv) return;
    let alive = true;
    assistant.token(conv).catch(() => undefined);
    if (fresh.current !== conv) {
      assistant
        .history(station, conv)
        .then((h) => {
          if (!alive) return;
          const s = h ? fromHistory(h) : empty();
          apply(() => s);
          if (s.busy) {
            setSince(Date.now());
            follow(conv, s.offset);
          }
          readPlans(conv);
        })
        .catch((e: Error) => alive && setWhy(e.message));
    }
    const t = setInterval(() => assistant.token(conv).catch(() => undefined), TOKEN_PUSH_MS);
    return () => {
      alive = false;
      clearInterval(t);
      reader.current?.abort();
    };
  }, [conv, station, apply, follow, readPlans]);

  const send = (words: string) => {
    let id = conv;
    if (!id) {
      id = newConversation(null, null, station, titleOf(words)).id;
      fresh.current = id;
      setConv(id);
      location.hash = href("assistant", id);
    }
    const first = current.current.offset === "-1";
    setWhy(null);
    setText("");
    setSince(Date.now());
    apply((s) => ({ ...s, busy: true, settled: null }));
    const target = id;
    assistant
      .send(station, target, words, { context })
      .then(({ offset }) => follow(target, first ? "-1" : offset))
      .catch((e: Error) => {
        setWhy(e.message);
        apply((s) => ({ ...s, busy: false }));
      });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim().length === 0 || pane.busy || warming) return;
    send(text.trim());
  };

  const stop = () => {
    if (conv) assistant.abort(station, conv).catch((e: Error) => setWhy(e.message));
  };

  const decide = (p: Proposal, verdict: "accepted" | "rejected") => {
    if (!conv) return;
    const row = { document: p.document, sentence: p.sentence };
    assistant
      .feedback(conv, verdict === "accepted" ? [row] : [], verdict === "rejected" ? [row] : [])
      .then(() => apply((s) => ({ ...s, proposals: s.proposals.map((x) => (x.document === p.document ? { ...x, decided: verdict } : x)) })))
      .catch((e: Error) => {
        if (e instanceof StaleProposal) apply((s) => ({ ...s, proposals: s.proposals.map((x) => (x.document === p.document ? { ...x, stale: { moved_to: e.movedTo } } : x)) }));
        else setWhy(e.message);
      });
  };

  const confirm = (p: Plan) => {
    assistant
      .confirmPlan(p.id)
      .then((done) => setPlans((all) => all.map((x) => (x.id === done.id ? done : x))))
      .catch((e: Error) => setWhy(e.message));
  };

  const toggle = (turn: string) =>
    setUnfolded((was) => {
      const next = new Set(was);
      if (next.has(turn)) next.delete(turn);
      else next.add(turn);
      return next;
    });

  const said = ending(pane.settled);
  const unknown = opened !== null && conv === null;
  const title = (conv ? conversations().find((c) => c.id === conv)?.title : null) ?? "New conversation";
  return (
    <section className="talk-page">
      <div className="talk-head">
        <h1 className="grow">{title}</h1>
        {model && <span className="tag">{model}</span>}
      </div>
      <div className="talk" aria-live="polite">
        {unknown && <p className="meta">This browser does not keep that conversation. Start a new one from the side.</p>}
        {!unknown && pane.turns.length === 0 && !pane.busy && <p className="lede">{hint(station)}</p>}
        {pane.turns.map((t) => (
          <TurnView
            key={t.id}
            turn={t}
            open={unfolded.has(t.id)}
            onToggle={() => toggle(t.id)}
            proposals={pane.proposals.filter((p) => p.turn === t.id)}
            choice={pane.choice?.turn === t.id && !pane.busy ? pane.choice : null}
            onDecide={decide}
            onChoose={(label) => send(label)}
          />
        ))}
        {pane.busy && <Wait phase={pane.status?.text ?? "thinking"} since={since || Date.now()} />}
        {plans.map((p) => (
          <PlanCard key={p.id} plan={p} onConfirm={() => confirm(p)} onChange={() => input.current?.focus()} />
        ))}
        {said && <p className={pane.settled?.outcome === "aborted" ? "meta" : "warn"}>{said}</p>}
        {why && <p className="warn">{why}</p>}
      </div>
      <form className="talk-composer" onSubmit={submit}>
        <div className="input composer-input">
          <textarea
            ref={input}
            value={text}
            rows={2}
            placeholder={warming ? "The model is warming" : "Ask, or say what to do"}
            aria-label="Ask the assistant"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) submit(e);
            }}
          />
          {pane.busy ? (
            <button type="button" className="icon-button" aria-label="Stop" title="Stop" onClick={stop}>
              <Icon name="x" />
            </button>
          ) : (
            <button type="submit" className="icon-button" aria-label="Send" disabled={warming || text.trim().length === 0}>
              <Icon name="arrow" />
            </button>
          )}
        </div>
        <div className="row talk-foot">
          {conv === null && served.length > 1 ? (
            <label className="row station-pick">
              <Icon name="assistant" />
              <select value={station} aria-label="The station to talk to" onChange={(e) => setStation(e.target.value)}>
                {served.map((s) => (
                  <option key={s} value={s}>
                    {STATION_WORDS[s]}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <span className="meta">{STATION_WORDS[station] ?? station}</span>
          )}
          <span className="grow" />
          <span className="meta">{station === "operator" ? "It plans jobs for you to confirm; nothing runs before that." : "It reads what you may read, and proposes; you decide."}</span>
        </div>
      </form>
    </section>
  );
}

function TurnView(props: {
  turn: Turn;
  open: boolean;
  onToggle: () => void;
  proposals: Proposal[];
  choice: { question: string; options: { label: string; count: number | null }[] } | null;
  onDecide: (p: Proposal, verdict: "accepted" | "rejected") => void;
  onChoose: (label: string) => void;
}) {
  const { turn, open, onToggle, proposals, choice, onDecide, onChoose } = props;
  if (turn.role === "user") return <p className="said you">{turn.text}</p>;
  if (turn.role === "system") return <p className="meta">{turn.text}</p>;
  const folded = foldedSteps(turn.tools);
  return (
    <div className="said">
      {folded && (
        <div className="steps">
          <button type="button" className="steps-line" aria-expanded={open} onClick={onToggle}>
            <Icon name={turn.tools.some((t) => t.state === "failed") ? "alert" : "check"} />
            <span className="grow">{folded.last}</span>
            {folded.earlier > 0 && <span className="meta">{open ? "fold" : `${folded.earlier} earlier ${folded.earlier === 1 ? "step" : "steps"}`}</span>}
          </button>
          {open &&
            stepLines(turn.tools)
              .slice(0, -1)
              .map((s) => (
                <p key={s.id} className={`steps-line quiet ${s.state}`}>
                  <Icon name={s.state === "failed" ? "alert" : "check"} />
                  {s.words}
                </p>
              ))}
        </div>
      )}
      {turn.text && <p className="said-text">{turn.text}</p>}
      {proposals.map((p) => (
        <div key={p.document} className="proposal">
          <Icon name="ask" />
          <div className="grow">
            <p className="proposal-title">A new version of the query</p>
            <p>{p.sentence}</p>
            {p.stale && <p className="meta">The query moved on since; this version can no longer be taken.</p>}
          </div>
          {p.decided === null && !p.stale && (
            <div className="row">
              <button type="button" className="button small" onClick={() => onDecide(p, "accepted")}>
                Accept
              </button>
              <button type="button" className="button secondary small" onClick={() => onDecide(p, "rejected")}>
                Disregard
              </button>
            </div>
          )}
          {p.decided !== null && <span className={p.decided === "accepted" ? "tag ok" : "tag"}>{p.decided === "accepted" ? "accepted" : "disregarded"}</span>}
        </div>
      ))}
      {choice && (
        <div className="choice">
          <p className="meta">{choice.question}</p>
          <div className="chips">
            {choice.options.map((o) => (
              <button key={o.label} type="button" className="button secondary small" onClick={() => onChoose(o.label)}>
                {o.label}
                {o.count !== null && <span className="meta num">{o.count.toLocaleString()}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PlanCard({ plan, onConfirm, onChange }: { plan: Plan; onConfirm: () => void; onChange: () => void }) {
  const open = !plan.confirmed_at;
  return (
    <div className="plan">
      <div className="plan-head">
        <span className="plan-title">
          A plan in {plan.steps.length} {plan.steps.length === 1 ? "step" : "steps"}
        </span>
        <span className="grow" />
        <span className="meta">{open ? "nothing runs until you confirm" : plan.state}</span>
      </div>
      {plan.steps.map((s) => (
        <div key={s.n} className="line">
          <Icon name={s.rung === 3 ? "branch" : "play"} />
          <div>
            <p>{s.words}</p>
            <p className="meta">
              {s.state}
              {s.reason ? `: ${s.reason}` : ""}
            </p>
          </div>
        </div>
      ))}
      {open && (
        <div className="plan-foot">
          <button type="button" className="button small" onClick={onConfirm}>
            Confirm the plan
          </button>
          <button type="button" className="button secondary small" onClick={onChange}>
            Change it
          </button>
        </div>
      )}
    </div>
  );
}
