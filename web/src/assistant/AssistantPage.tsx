// SPDX-License-Identifier: AGPL-3.0-only
// The Assistant's page (Wave 5 section 9, as a page of its own): one
// conversation at a time, the person's conversations kept by the assistant and
// listed under the Assistant in the side, and every one of them on the page of
// all conversations (the chat, slice 2). One chat (2026-10-09): one input
// and one agent, whatever the person wants; one live line while a turn works,
// the steps behind a "?", the plan while several steps run, every change on
// the one approval card and every question on the one clarification card.
// Another page may hand it a sentence to start from. The conversation loop
// itself is useConversation, which a Query card's discussion holds too. The
// thread (the chat, slice 4): answers in markdown; a message edited, or an
// answer asked for again, continues as another version of the conversation
// from that message, with the ways it was sent a click apart; answers given a
// verdict; commands after a slash; ways to begin.
//
// Messages first (the redesign Nima confirmed on 2026-10-09): one column of
// about 800px, the person's words in raised boxes on the right and the
// answers as plain text; a head of the title, the model and one menu; the
// input with how full the context is under it. A query answer is one quiet
// card in the thread; Open puts it on a panel beside the chat, which narrows
// on the left, and the panel follows the version the conversation is on.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type React from "react";
import type { Capabilities } from "../capabilities";
import { keepingRefusal } from "../query/cards";
import { href } from "../routes";
import { assistantModel } from "../sections";
import { admit } from "../ui/context";
import { Icon } from "../ui/Icon";
import { useKept } from "../ui/kept";
import "./assistant.css";
import { type Chat, type ChatContext, chats, chatsKept, meterOf, versionAt, renamedIn } from "./chats";
import { ChatHistory } from "./ChatHistory";
import { ChatMenu } from "./ChatMenu";
import { takeSaid, titleOf } from "./client";
import { answersSummarize, type PaneState, type Proposal } from "./parts";
import { CompactionNote, ContextMeter } from "./ContextMeter";
import { exportName, saveText } from "./download";
import { memory } from "./memory";
import { loadMentionables, MENTION_KIND, type Mentionable, mentionables, mentionAt, plainMentions, withMention } from "./mentions";
import { MemoryPage } from "./MemoryPage";
import { ShareDialog } from "./ShareDialog";
import { SharedList, SharedPage } from "./SharedPages";
import { Starters } from "./Starters";
import { ApprovalCardView, PlanPanel, StatusLine } from "./Cards";
import { agentFor, cardOfPlan, planShown } from "./events";
import { liveLine } from "./steps";
import { askedBefore, COMMANDS, commandOf, commandsFor, lastAsked } from "./thread";
import { TurnView } from "./TurnView";
import { QueryCard, type VersionState } from "./QueryCard";
import { QueryPanel } from "./QueryPanel";
import { type Beside, useConversation } from "./useConversation";
import { useInPlay } from "./useInPlay";

/** What the page says before anything is asked: one line, whatever the person wants. */
const LEDE = "Ask about your data, or say what to do.";

/** Under the input, always: what the assistant may do. */
const PROMISE = "It reads what you may read, and proposes; you decide.";

/** How the person left a proposed version, for its card. */
const stateOf = (p: Proposal): VersionState => (p.stale ? "stale" : p.decided === "accepted" ? "kept" : p.decided === "rejected" ? "set aside" : "open");

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
  // one chat: a new conversation goes to the one agent; one kept from before keeps whom it talks to
  const [station, setStation] = useState(() => known?.station ?? agentFor(caps));
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
  const epoch = caps.engine?.registry.epoch ?? null;
  const keeping = keepingRefusal(caps);
  // the query the conversation works on: the version on the panel goes with the next prompt
  const play = useInPlay(talk, conv, meta?.document ?? null, keeping);
  const [panel, setPanel] = useState(false);
  const panelOpen = panel && play.display !== null;
  // the conversation's name being typed, from the menu's Rename
  const [naming, setNaming] = useState<string | null>(null);
  // plans from the inbox put aside here with Not now
  const [aside, setAside] = useState<Set<string>>(new Set());
  // a summarize asked for: how many summaries the conversation had, and the context read before it (the chat, slice 11)
  const summarizing = useRef<{ before: number; context: ChatContext | null } | null>(null);
  // the thread follows the newest words while the person is at its foot
  const scroller = useRef<HTMLDivElement | null>(null);
  const pinned = useRef(true);

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
    setPanel(false);
    setNaming(null);
    setAside(new Set());
    pinned.current = true;
    summarizing.current = null;
    if (!opened) {
      setConv(null);
      setMeta(null);
      setStation(agentFor(caps));
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

  // the thread stays at its foot after each change while the person reads there
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  });
  // and while what is in it grows by itself (a card's counts arriving), it stays at the foot
  useEffect(() => {
    const el = scroller.current;
    const content = el?.firstElementChild;
    if (!el || !content || typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(() => {
      if (pinned.current) el.scrollTop = el.scrollHeight;
    });
    watch.observe(content);
    return () => watch.disconnect();
  }, []);

  /** What a prompt carries beside its words: the version of the query in play, or the page's own context. */
  const beside = (): Beside => {
    const card = play.context;
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
    pinned.current = true;
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
      await rename(rest);
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

  const rename = async (name: string) => {
    if (!conv) return;
    try {
      const c = await chats.patch(conv, { title: name.trim() || null });
      setMeta(c);
      setNaming(null);
      chatsKept.refresh().catch(() => undefined);
    } catch (e) {
      setFailed(`The conversation could not be renamed: ${said(e)}`);
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
  const status = liveLine(pane, talk.slow);
  const title = meta?.title ?? (conv || opened ? "A conversation" : "New conversation");
  const revise = () => input.current?.focus();
  /** A proposed version, or the card the conversation was opened on, as its query card: one line while the panel is open. */
  const queryCard = (document: number, state: VersionState) => (
    <QueryCard
      document={document}
      label={play.versions.get(document)?.label ?? null}
      epoch={epoch}
      state={state}
      compact={panelOpen}
      shown={panelOpen && play.display === document}
      onOpen={() => {
        play.show(document);
        setPanel(true);
      }}
    />
  );
  const about = meta?.document ?? null;
  // the latest answer keeps its actions in sight; an earlier one shows them on hover
  const latest = [...pane.turns].reverse().find((t) => t.role === "assistant")?.id ?? null;
  return (
    <section className={panelOpen ? "one-chat with-panel" : "one-chat"}>
      <div className="one-chat-main">
        <div className="one-chat-head">
          {naming !== null && meta ? (
            <form
              className="row one-chat-rename"
              onSubmit={(e) => {
                e.preventDefault();
                void rename(naming);
              }}
            >
              <span className="input">
                <input
                  value={naming}
                  autoFocus
                  aria-label="The conversation's name"
                  onChange={(e) => setNaming(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setNaming(null);
                  }}
                />
              </span>
              <button type="submit" className="button small">
                Save
              </button>
              <button type="button" className="button secondary small" onClick={() => setNaming(null)}>
                Cancel
              </button>
            </form>
          ) : (
            <h1>{title}</h1>
          )}
          {model && !panelOpen && <span className="tag">{model}</span>}
          {meta && (
            <ChatMenu
              chat={meta}
              onShare={() => setSharing(true)}
              onRename={() => setNaming(meta.title ?? "")}
              onChanged={(c) => {
                setMeta(c);
                chatsKept.refresh().catch(() => undefined);
              }}
              onDeleted={() => {
                chatsKept.refresh().catch(() => undefined);
                location.hash = href("assistant", "new");
              }}
              onFailed={setFailed}
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
        <div
          className="one-chat-scroll"
          ref={scroller}
          onScroll={(e) => {
            const el = e.currentTarget;
            pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
        >
          <div className="one-chat-thread" aria-live="polite">
            {missing && (
              <p className="meta">
                This conversation is not one of yours, or it was deleted. <a href={href("assistant", "all")}>All conversations</a>
              </p>
            )}
            <CompactionNote context={talk.context} />
            {about !== null && !pane.proposals.some((p) => p.document === about) && queryCard(about, "open")}
            {!missing && pane.turns.length === 0 && !pane.busy && (
              <>
                <p className="lede">{LEDE}</p>
                {!conv && (
                  <Starters
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
                queryCard={(p) => queryCard(p.document, stateOf(p))}
                changes={pane.changes.filter((c) => c.turn === t.id)}
                onChange={talk.decideChange}
                onRevise={revise}
                choice={pane.choice?.turn === t.id && !pane.busy ? pane.choice : null}
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
                        quiet: t.id !== latest,
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
            {planShown(pane.plan) && <PlanPanel items={pane.plan} />}
            {status && <StatusLine words={status} />}
            {talk.plans
              .filter((p) => !aside.has(p.id))
              .map((p) => (
                <ApprovalCardView
                  key={p.id}
                  card={cardOfPlan(p)}
                  onDecide={(v) => (v === "approved" ? talk.confirm(p) : setAside((was) => new Set(was).add(p.id)))}
                  onRevise={revise}
                />
              ))}
            {ended && <p className={pane.settled?.outcome === "aborted" ? "meta" : "warn"}>{ended}</p>}
            {talk.why && <p className="warn">{talk.why}</p>}
            {failed && <p className="warn">{failed}</p>}
            {note && <p className="meta command-note">{note}</p>}
          </div>
        </div>
        <form className="one-chat-composer" onSubmit={submit}>
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
              placeholder={warming ? "The model is warming" : panelOpen ? "Change this query, or ask anything" : "Ask anything"}
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
          <div className="one-chat-foot">
            <ContextMeter context={talk.context} />
            {!panelOpen && <span className="one-chat-promise">{PROMISE}</span>}
          </div>
        </form>
      </div>
      {panelOpen && <QueryPanel play={play} caps={caps} keeping={keeping} epoch={epoch} onClose={() => setPanel(false)} />}
    </section>
  );
}
