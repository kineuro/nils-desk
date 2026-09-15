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
// as its card. The thread (the chat, slice 4): answers in markdown; a message
// edited, or an answer asked for again, continues as another version of the
// conversation from that message, with the ways it was sent a click apart;
// answers given a verdict; commands after a slash; ways to begin.

import { useEffect, useRef, useState } from "react";
import type React from "react";
import type { Capabilities } from "../capabilities";
import { keepingRefusal } from "../query/cards";
import { href } from "../routes";
import { assistantModel } from "../sections";
import { admit } from "../ui/context";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import { useKept } from "../ui/kept";
import { type Chat, type ChatContext, chats, chatsKept, meterOf, STATION_WORDS, versionAt, renamedIn } from "./chats";
import { ChatActions, ChatHistory } from "./ChatHistory";
import { takeSaid, titleOf, type Plan } from "./client";
import { answersSummarize, type PaneState } from "./parts";
import { CardInPlay, type InPlay } from "./CardInPlay";
import { CompactionNote, ContextMeter } from "./ContextMeter";
import { exportName, saveText } from "./download";
import { memory } from "./memory";
import { loadMentionables, MENTION_KIND, type Mentionable, mentionables, mentionAt, plainMentions, withMention } from "./mentions";
import { MemoryPage } from "./MemoryPage";
import { ShareDialog } from "./ShareDialog";
import { SharedList, SharedPage } from "./SharedPages";
import { Starters } from "./Starters";
import { stationOf, stationsServed } from "./stations";
import { askedBefore, COMMANDS, commandOf, commandsFor, lastAsked } from "./thread";
import { TurnView } from "./TurnView";
import { type Beside, useConversation } from "./useConversation";

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

const said = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function AssistantPage({ caps, conversation }: { caps: Capabilities; conversation: string | null }) {
  // the page of all conversations, or one conversation
  if (conversation === "all") return <ChatHistory />;
  // what is shared, and one share opened (the chat, slice 5)
  if (conversation === "shared") return <SharedList />;
  if (conversation?.startsWith("s-")) return <SharedPage id={conversation} />;
  // what the assistant keeps (the chat, slice 6)
  if (conversation === "memory") return <MemoryPage caps={caps} />;
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
  // the message being edited, and what a command answered
  const [editing, setEditing] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  // the memories offered in this conversation, kept or put aside here
  const [kept, setKept] = useState<Record<string, "saved" | "dismissed">>({});
  // what a mention can name, read once an @ is first typed (the chat, slice 12)
  const [mentionable, setMentionable] = useState<Mentionable[] | null>(null);
  const input = useRef<HTMLTextAreaElement | null>(null);
  const warming = (caps.kvasir?.["health"] as { warming?: boolean } | undefined)?.warming === true;
  const model = assistantModel(caps);
  const context = admit({ page: { kind: "assistant", id: null }, epoch: caps.engine?.registry.epoch });
  // the query card floating over the conversation: the version on it goes with the next prompt
  const inPlay = useRef<InPlay | null>(null);
  // a summarize asked for: how many summaries the conversation had, and the context read before it (the chat, slice 11)
  const summarizing = useRef<{ before: number; context: ChatContext | null } | null>(null);

  // another conversation opened from the side, or a new one: its station and name from the assistant, then its history
  useEffect(() => {
    if (opened === conv) return;
    talk.reset();
    setMissing(false);
    setFailed(null);
    setEditing(null);
    setNote(null);
    setSharing(false);
    setKept({});
    summarizing.current = null;
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

  // the name the model gave the conversation, once the list learns it (the chat, slice 10)
  useEffect(() => {
    const renamed = renamedIn(meta, list);
    if (renamed) setMeta(renamed);
  }, [list]); // eslint-disable-line react-hooks/exhaustive-deps

  // what a summarize did, once its turn settled and the conversation was read again (the chat, slice 11)
  useEffect(() => {
    const asked = summarizing.current;
    if (!asked || pane.busy || talk.context === asked.context) return;
    summarizing.current = null;
    setNote(
      (talk.context?.compactions ?? 0) > asked.before
        ? "Earlier turns were summarized. How full the context is shows again after the next answer."
        : "Nothing was summarized: too little has been said since the conversation was last summarized.",
    );
  }, [talk.context, pane.busy]); // eslint-disable-line react-hooks/exhaustive-deps

  /** What a prompt carries beside its words: the card floating over the conversation, or the page's own context. */
  const beside = (): Beside => {
    const card = inPlay.current;
    const prompt = card
      ? admit({ page: { kind: "assistant", id: null }, epoch: caps.engine?.registry.epoch, document_id: card.document, content_hash: card.hash, chain: card.chain, sets: card.sets, funnel: card.funnel })
      : context;
    return { context: prompt, lineage: card?.root ?? null, document: card?.document ?? null };
  };

  const send = async (words: string) => {
    let id = conv;
    setText("");
    setFailed(null);
    setNote(null);
    if (!id) {
      // the assistant names the conversation, and it is the person's
      try {
        const made = await chats.create({ station, title: titleOf(plainMentions(words)), title_by: "words" });
        id = made.id;
        talk.made(id);
        setMeta(made);
        setConv(id);
        location.hash = href("assistant", id);
        chatsKept.refresh().catch(() => undefined);
      } catch (e) {
        setText(words);
        setFailed(`The conversation could not be started: ${said(e)}`);
        return;
      }
    }
    talk.send(id, words, beside());
  };

  // an edited message, or the same words asked again: another version of the conversation from that message on
  const again = async (message: string, words: string) => {
    if (!conv || pane.busy) return;
    setEditing(null);
    setNote(null);
    setFailed(null);
    try {
      const made = await chats.fork(conv, message);
      talk.sendWhenOpen(made.id, words, beside());
      chatsKept.refresh().catch(() => undefined);
      location.hash = href("assistant", made.id);
    } catch (e) {
      setFailed(`It could not be sent again: ${said(e)}`);
    }
  };

  const run = async (name: string, rest: string) => {
    setText("");
    setNote(null);
    setFailed(null);
    if (name === "new") {
      location.hash = href("assistant", "new");
      return;
    }
    if (name === "help") {
      setNote(COMMANDS.map((c) => `/${c.name}${c.takes ? ` (${c.takes})` : ""}: ${c.words}`).join("\n"));
      return;
    }
    if (name === "status") {
      const m = meterOf(talk.context);
      const n = talk.context?.compactions ?? 0;
      setNote(
        [
          model ? `Model: ${model}` : null,
          `Talking to: ${STATION_WORDS[station] ?? station}`,
          m ? `Context: ${m.words}, ${(talk.context?.tokens ?? 0).toLocaleString("en-US")} tokens` : "Context: not measured yet",
          n > 0 ? `Earlier turns summarized ${n === 1 ? "once" : `${n} times`}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
      );
      return;
    }
    if (name === "remember") {
      if (!rest) {
        setNote("Say what to keep after /remember.");
        return;
      }
      try {
        await memory.add(rest, "said");
        setNote(`Kept for your later conversations: ${rest}`);
      } catch (e) {
        setFailed(`It was not kept: ${said(e)}`);
      }
      return;
    }
    if (!conv) {
      setNote(`/${name} needs a conversation; ask something first.`);
      return;
    }
    if (name === "export") {
      try {
        saveText(exportName(meta?.title ?? null), await chats.exportMarkdown(conv));
      } catch (e) {
        setFailed(`The conversation could not be exported: ${said(e)}`);
      }
      return;
    }
    if (name === "share") {
      if (meta) setSharing(true);
      return;
    }
    if (name === "rename") {
      if (!rest) {
        setNote("Say the name after /rename.");
        return;
      }
      try {
        const c = await chats.patch(conv, { title: rest });
        setMeta(c);
        chatsKept.refresh().catch(() => undefined);
      } catch (e) {
        setFailed(`The conversation could not be renamed: ${said(e)}`);
      }
      return;
    }
    if (name === "fork") {
      if (pane.busy) {
        setNote("Wait for the answer, then copy the conversation.");
        return;
      }
      try {
        const c = await chats.fork(conv);
        chatsKept.refresh().catch(() => undefined);
        location.hash = href("assistant", c.id);
      } catch (e) {
        setFailed(`The conversation could not be copied: ${said(e)}`);
      }
      return;
    }
    if (name === "summarize") {
      if (pane.busy) {
        setNote("Wait for the answer, then summarize the conversation.");
        return;
      }
      summarizing.current = { before: talk.context?.compactions ?? 0, context: talk.context };
      try {
        await talk.summarize(conv);
      } catch (e) {
        summarizing.current = null;
        // a conversation too short to summarize, or a turn still running, is said plainly
        const why = said(e);
        if ((e as { status?: unknown }).status === 409) setNote(`${why.charAt(0).toUpperCase()}${why.slice(1)}.`);
        else setFailed(`The conversation could not be summarized: ${why}`);
      }
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const words = text.trim();
    if (words.length === 0) return;
    const command = commandOf(words);
    if (command) {
      if (command.known) void run(command.name, command.rest);
      else setNote(`There is no command /${command.name}; /help lists them.`);
      return;
    }
    if (pane.busy || warming) return;
    void send(words);
  };

  const toggle = (turn: string) =>
    setUnfolded((was) => {
      const next = new Set(was);
      if (next.has(turn)) next.delete(turn);
      else next.add(turn);
      return next;
    });

  const offered = commandsFor(text);
  // a card, a cohort or a result named with @ (the chat, slice 12): the lists are read once, when an @ is first typed
  const typing = mentionAt(text);
  useEffect(() => {
    if (typing === null || mentionable !== null) return;
    setMentionable([]);
    loadMentionables().then(setMentionable, () => undefined);
  }, [typing === null]); // eslint-disable-line react-hooks/exhaustive-deps
  const mentionOffer = typing !== null && offered.length === 0 ? mentionables(typing, mentionable ?? []) : [];
  const ended = ending(pane.settled);
  const title = meta?.title ?? (conv || opened ? "A conversation" : "New conversation");
  return (
    <section className="talk-page">
      <div className="talk-head">
        <h1 className="grow">{title}</h1>
        {model && <span className="tag">{model}</span>}
        {meta && (
          <button type="button" className="button secondary small" aria-haspopup="dialog" onClick={() => setSharing(true)}>
            <Icon name="users" />
            {meta.shared ? "Shared" : "Share"}
          </button>
        )}
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
      {sharing && meta && (
        <ShareDialog
          chat={meta}
          onClose={(shared) => {
            setSharing(false);
            setMeta({ ...meta, shared });
            chatsKept.refresh().catch(() => undefined);
          }}
        />
      )}
      {conv && <CardInPlay key={conv} talk={talk} opened={meta?.document ?? null} keeping={keepingRefusal(caps)} onShown={(card) => (inPlay.current = card)} />}
      <div className="talk" aria-live="polite">
        {missing && (
          <p className="meta">
            This conversation is not one of yours, or it was deleted. <a href={href("assistant", "all")}>All conversations</a>
          </p>
        )}
        <CompactionNote context={talk.context} />
        {!missing && pane.turns.length === 0 && !pane.busy && (
          <>
            <p className="lede">{hint(station)}</p>
            {!conv && (
              <Starters
                station={station}
                onPick={(words) => {
                  setText(words);
                  input.current?.focus();
                }}
              />
            )}
          </>
        )}
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
            said={pane.finals[t.id]}
            memories={pane.memories.filter((x) => x.turn === t.id)}
            memoryActions={{
              state: (x) => kept[`${x.turn}|${x.text}`] ?? null,
              keep: (x) => {
                memory.add(x.text, "accepted").then(
                  () => setKept((was) => ({ ...was, [`${x.turn}|${x.text}`]: "saved" })),
                  (e: unknown) => setFailed(`It was not kept: ${said(e)}`),
                );
              },
              dismiss: (x) => setKept((was) => ({ ...was, [`${x.turn}|${x.text}`]: "dismissed" })),
            }}
            actions={
              conv && !answersSummarize(pane.turns, t.id)
                ? {
                    busy: pane.busy,
                    editing: editing === t.id,
                    onStartEdit: () => setEditing(t.id),
                    onCancelEdit: () => setEditing(null),
                    onEdit: (words) => void again(t.id, words),
                    onRetry: () => {
                      const asked = askedBefore(pane.turns, t.id);
                      if (asked) void again(asked.id, asked.text);
                    },
                    rating: talk.ratings.find((r) => r.message === t.id) ?? null,
                    onRate: (verdict, reason) => talk.rate(t.id, verdict, reason),
                    version: versionAt(talk.versions, t.id),
                    onVersion: (c) => {
                      // the version switched to is the one the lists show, and open, from now on
                      chats.patch(c, { current: true }).then(
                        () => chatsKept.refresh().catch(() => undefined),
                        () => undefined,
                      );
                      location.hash = href("assistant", c);
                    },
                  }
                : undefined
            }
          />
        ))}
        {pane.busy && <Wait phase={pane.status?.text ?? "thinking"} since={talk.since || Date.now()} />}
        {talk.plans.map((p) => (
          <PlanCard key={p.id} plan={p} onConfirm={() => talk.confirm(p)} onChange={() => input.current?.focus()} />
        ))}
        {ended && <p className={pane.settled?.outcome === "aborted" ? "meta" : "warn"}>{ended}</p>}
        {talk.why && <p className="warn">{talk.why}</p>}
        {failed && <p className="warn">{failed}</p>}
        {note && <p className="meta command-note">{note}</p>}
      </div>
      <form className="talk-composer" onSubmit={submit}>
        {offered.length > 0 && (
          <div className="command-menu">
            {offered.map((c) => (
              <button
                key={c.name}
                type="button"
                onClick={() => {
                  if (c.takes) {
                    setText(`/${c.name} `);
                    input.current?.focus();
                  } else void run(c.name, "");
                }}
              >
                <code>/{c.name}</code>
                <span className="meta">{c.words}</span>
              </button>
            ))}
          </div>
        )}
        {mentionOffer.length > 0 && (
          <div className="command-menu mention-menu" aria-label="Name a card, a cohort or a result">
            {mentionOffer.map((m) => (
              <button
                key={`${m.kind}:${m.id}`}
                type="button"
                onClick={() => {
                  setText(withMention(text, m));
                  input.current?.focus();
                }}
              >
                <span className="mention-kind">{MENTION_KIND[m.kind]}</span>
                <span>{m.name}</span>
                {m.detail && <span className="meta">{m.detail}</span>}
              </button>
            ))}
          </div>
        )}
        <div className="input composer-input">
          <textarea
            ref={input}
            value={text}
            rows={2}
            placeholder={warming ? "The model is warming" : "Ask, or say what to do; / for commands, @ to name a card"}
            aria-label="Ask the assistant"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends and Shift+Enter breaks the line, never while a word is still being composed;
              // Tab completes a command or a mention, Esc stops a turn, and Up in an empty box edits the last message
              if (e.key === "Tab" && offered.length > 0) {
                e.preventDefault();
                setText(`/${offered[0].name}${offered[0].takes ? " " : ""}`);
              } else if (e.key === "Tab" && mentionOffer.length > 0) {
                e.preventDefault();
                setText(withMention(text, mentionOffer[0]));
              } else if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) submit(e);
              else if (e.key === "Escape" && pane.busy) {
                e.preventDefault();
                talk.stop();
              } else if (e.key === "ArrowUp" && text === "" && !pane.busy) {
                const last = lastAsked(pane.turns);
                if (last) {
                  e.preventDefault();
                  setEditing(last.id);
                }
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
