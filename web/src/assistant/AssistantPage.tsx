// SPDX-License-Identifier: AGPL-3.0-only
// The Assistant's page (Wave 5 section 9, as a page of its own): one
// conversation at a time, the conversations this browser keeps listed under
// the Assistant in the side. It shows what was asked and answered, what the
// assistant did as a folded list of steps, each new version it proposes to
// accept or disregard, a choice answered with a click, and the plans it made,
// which run only once confirmed. Another page may hand it a sentence to start
// from. The conversation loop itself is useConversation, which a Query card's
// discussion holds too, and the query a conversation is about floats over it
// as its card.

import { useEffect, useRef, useState } from "react";
import type React from "react";
import type { Capabilities } from "../capabilities";
import { href } from "../routes";
import { assistantModel } from "../sections";
import { admit } from "../ui/context";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import { conversations, newConversation, takeSaid, titleOf, type Plan } from "./client";
import type { PaneState } from "./parts";
import { CardInPlay, type InPlay } from "./CardInPlay";
import { stationOf, stationsServed } from "./stations";
import { TurnView } from "./TurnView";
import { useConversation } from "./useConversation";

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
  const talk = useConversation(station, conv);
  const pane = talk.pane;
  const [text, setText] = useState(() => handed.current?.words ?? "");
  const [unfolded, setUnfolded] = useState<Set<string>>(new Set());
  const input = useRef<HTMLTextAreaElement | null>(null);
  const warming = (caps.kvasir?.["health"] as { warming?: boolean } | undefined)?.warming === true;
  const model = assistantModel(caps);
  const context = admit({ page: { kind: "assistant", id: null }, epoch: caps.engine?.registry.epoch });
  // the query card floating over the conversation: the version on it goes with the next prompt
  const inPlay = useRef<InPlay | null>(null);

  // another conversation opened from the side, or a new one: start from its history
  useEffect(() => {
    if (opened === conv) return;
    const c = opened ? (conversations().find((x) => x.id === opened) ?? null) : null;
    talk.reset();
    setConv(c?.id ?? null);
    if (c?.station) setStation(c.station);
  }, [opened]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = (words: string) => {
    let id = conv;
    if (!id) {
      id = newConversation(null, null, station, titleOf(words)).id;
      talk.made(id);
      setConv(id);
      location.hash = href("assistant", id);
    }
    setText("");
    const card = inPlay.current;
    const prompt = card
      ? admit({ page: { kind: "assistant", id: null }, epoch: caps.engine?.registry.epoch, document_id: card.document, content_hash: card.hash, chain: card.chain, sets: card.sets, funnel: card.funnel })
      : context;
    talk.send(id, words, { context: prompt, lineage: card?.root ?? null, document: card?.document ?? null });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim().length === 0 || pane.busy || warming) return;
    send(text.trim());
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
      {conv && <CardInPlay key={conv} talk={talk} opened={conversations().find((c) => c.id === conv)?.document ?? null} onShown={(card) => (inPlay.current = card)} />}
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
            decidedElsewhere="It stands on the card above, to accept or disregard."
            onChoose={(label) => send(label)}
          />
        ))}
        {pane.busy && <Wait phase={pane.status?.text ?? "thinking"} since={talk.since || Date.now()} />}
        {talk.plans.map((p) => (
          <PlanCard key={p.id} plan={p} onConfirm={() => talk.confirm(p)} onChange={() => input.current?.focus()} />
        ))}
        {said && <p className={pane.settled?.outcome === "aborted" ? "meta" : "warn"}>{said}</p>}
        {talk.why && <p className="warn">{talk.why}</p>}
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
            <button type="button" className="icon-button" aria-label="Stop" title="Stop" onClick={talk.stop}>
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
