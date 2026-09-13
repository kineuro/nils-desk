// SPDX-License-Identifier: AGPL-3.0-only
// The Assistant's page (Wave 5 section 9, as a page of its own): one
// conversation at a time, the person's conversations kept by the assistant and
// listed under the Assistant in the side, and every one of them on the page of
// all conversations (the chat, slice 2). It shows what was asked and answered, what the
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
import { useKept } from "../ui/kept";
import { type Chat, chats, chatsKept, STATION_WORDS } from "./chats";
import { ChatActions, ChatHistory } from "./ChatHistory";
import { takeSaid, titleOf, type Plan } from "./client";
import type { PaneState } from "./parts";
import { CardInPlay, type InPlay } from "./CardInPlay";
import { CompactionNote, ContextMeter } from "./ContextMeter";
import { stationOf, stationsServed } from "./stations";
import { TurnView } from "./TurnView";
import { useConversation } from "./useConversation";

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
  // the page of all conversations, or one conversation
  if (conversation === "all") return <ChatHistory />;
  return <ChatPage caps={caps} conversation={conversation} />;
}

function ChatPage({ caps, conversation }: { caps: Capabilities; conversation: string | null }) {
  const opened = conversation && conversation !== "new" ? conversation : null;
  const list = useKept(chatsKept).value?.conversations ?? [];
  const known = opened ? (list.find((c) => c.id === opened) ?? null) : null;
  const handed = useRef(opened === null ? takeSaid() : null);
  const served = stationsServed(caps).filter((s) => s in STATION_WORDS);
  const [station, setStation] = useState(() => known?.station ?? handed.current?.station ?? stationOf(caps));
  const [conv, setConv] = useState<string | null>(known?.id ?? null);
  const [meta, setMeta] = useState<Chat | null>(known);
  const [missing, setMissing] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
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

  // another conversation opened from the side, or a new one: its station and name from the assistant, then its history
  useEffect(() => {
    if (opened === conv) return;
    talk.reset();
    setMissing(false);
    setFailed(null);
    if (!opened) {
      setConv(null);
      setMeta(null);
      return;
    }
    const open = (c: Chat) => {
      setMeta(c);
      setStation(c.station);
      setConv(c.id);
    };
    const inList = list.find((c) => c.id === opened);
    if (inList) {
      open(inList);
      return;
    }
    let alive = true;
    chats.get(opened).then(
      (c) => alive && open(c),
      () => alive && setMissing(true),
    );
    return () => {
      alive = false;
    };
  }, [opened]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (words: string) => {
    let id = conv;
    setText("");
    setFailed(null);
    if (!id) {
      // the assistant names the conversation, and it is the person's
      try {
        const made = await chats.create({ station, title: titleOf(words) });
        id = made.id;
        talk.made(id);
        setMeta(made);
        setConv(id);
        location.hash = href("assistant", id);
        chatsKept.refresh().catch(() => undefined);
      } catch (e) {
        setText(words);
        setFailed(e instanceof Error ? e.message : String(e));
        return;
      }
    }
    const card = inPlay.current;
    const prompt = card
      ? admit({ page: { kind: "assistant", id: null }, epoch: caps.engine?.registry.epoch, document_id: card.document, content_hash: card.hash, chain: card.chain, sets: card.sets, funnel: card.funnel })
      : context;
    talk.send(id, words, { context: prompt, lineage: card?.root ?? null, document: card?.document ?? null });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim().length === 0 || pane.busy || warming) return;
    void send(text.trim());
  };

  const toggle = (turn: string) =>
    setUnfolded((was) => {
      const next = new Set(was);
      if (next.has(turn)) next.delete(turn);
      else next.add(turn);
      return next;
    });

  const said = ending(pane.settled);
  const title = meta?.title ?? (conv || opened ? "A conversation" : "New conversation");
  return (
    <section className="talk-page">
      <div className="talk-head">
        <h1 className="grow">{title}</h1>
        {model && <span className="tag">{model}</span>}
        {meta && (
          <ChatActions
            chat={meta}
            onChanged={(c) => {
              setMeta(c);
              chatsKept.refresh().catch(() => undefined);
            }}
            onDeleted={() => {
              chatsKept.refresh().catch(() => undefined);
              location.hash = href("assistant", "new");
            }}
          />
        )}
      </div>
      {conv && <CardInPlay key={conv} talk={talk} opened={meta?.document ?? null} onShown={(card) => (inPlay.current = card)} />}
      <div className="talk" aria-live="polite">
        {missing && (
          <p className="meta">
            This conversation is not one of yours, or it was deleted. <a href={href("assistant", "all")}>All conversations</a>
          </p>
        )}
        <CompactionNote context={talk.context} />
        {!missing && pane.turns.length === 0 && !pane.busy && <p className="lede">{hint(station)}</p>}
        {pane.turns.map((t) => (
          <TurnView
            key={t.id}
            turn={t}
            open={unfolded.has(t.id)}
            onToggle={() => toggle(t.id)}
            proposals={pane.proposals.filter((p) => p.turn === t.id)}
            choice={pane.choice?.turn === t.id && !pane.busy ? pane.choice : null}
            decidedElsewhere="It stands on the card above, to accept or disregard."
            onChoose={(label) => void send(label)}
          />
        ))}
        {pane.busy && <Wait phase={pane.status?.text ?? "thinking"} since={talk.since || Date.now()} />}
        {talk.plans.map((p) => (
          <PlanCard key={p.id} plan={p} onConfirm={() => talk.confirm(p)} onChange={() => input.current?.focus()} />
        ))}
        {said && <p className={pane.settled?.outcome === "aborted" ? "meta" : "warn"}>{said}</p>}
        {talk.why && <p className="warn">{talk.why}</p>}
        {failed && <p className="warn">The conversation could not be started: {failed}</p>}
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
          <ContextMeter context={talk.context} />
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
