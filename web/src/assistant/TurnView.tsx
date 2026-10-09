// SPDX-License-Identifier: AGPL-3.0-only
// One turn of a conversation, as the Assistant page and a Query card's
// discussion show it: what was said, its words drawn from their markdown, what
// the assistant did behind a small "?", each change it proposes on the one
// approval card, and a question on the one clarification card. A page that decides proposals somewhere else
// passes no onDecide, and the turn only names them. On the Assistant page a
// turn carries its actions too (the chat, slice 4): a person's message is
// copied, edited, or switched to another way it was sent, and an answer is
// copied, asked for again, or given a verdict.

import { Fragment, useEffect, useRef, useState } from "react";
import type React from "react";
import { href } from "../routes";
import { Icon } from "../ui/Icon";
import type { Rating } from "./chats";
import { useCopy } from "../ui/clipboard";
import { Markdown } from "./Markdown";
import { plainMentions, saidWithMentions } from "./mentions";
import type { Change, PaneMemory, Proposal, Turn } from "./parts";
import { ApprovalCardView, ClarificationCardView, StepsHelp } from "./Cards";
import { cardOfChange, cardOfProposal } from "./events";
import { MISSES } from "./thread";

export interface TurnActions {
  /** A turn is running: nothing is sent again meanwhile. */
  busy: boolean;
  editing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onEdit: (words: string) => void;
  onRetry: () => void;
  rating: Rating | null;
  onRate: (verdict: "up" | "down" | null, reason?: string) => void;
  /** Which of the ways this message was sent it is, and where the ways either side continue. */
  version: { index: number; count: number; prev: string | null; next: string | null } | null;
  onVersion: (conversation: string) => void;
}

export function TurnView(props: {
  turn: Turn;
  open: boolean;
  onToggle: () => void;
  proposals: Proposal[];
  choice: { question: string; options: { label: string; count: number | null }[] } | null;
  onDecide?: (p: Proposal, verdict: "accepted" | "rejected") => void;
  /** One chat: the other changes this turn proposed, and how the page decides them. */
  changes?: Change[];
  onChange?: (c: Change, verdict: "approved" | "declined") => void;
  onChoose: (label: string) => void;
  /** Where an undecided proposal is decided, when it is not here. */
  decidedElsewhere?: string;
  actions?: TurnActions;
  /** Where a proposal opens on the Query page, when the thread offers it (a share's reader, the chat, slice 5). */
  openQuery?: (document: number) => string;
  /** The memories this turn offered, kept or forgot (the chat, slice 6), and what the page does with an offer. */
  memories?: PaneMemory[];
  /** The sentence the turn settled on, shown when it wrote no words and proposed nothing (the chat, slice 7). */
  said?: string;
  memoryActions?: { state: (m: PaneMemory) => "saved" | "dismissed" | null; keep: (m: PaneMemory) => void; dismiss: (m: PaneMemory) => void };
}) {
  const { turn, open, onToggle, proposals, changes, onChange, choice, onDecide, onChoose, decidedElsewhere, actions, openQuery, memories, memoryActions, said } = props;
  if (turn.role === "user") return <Asked turn={turn} actions={actions} />;
  if (turn.role === "system") return <p className="meta">{turn.text}</p>;
  const steps = turn.done && turn.tools.length > 0 ? <StepsHelp tools={turn.tools} open={open} onToggle={onToggle} /> : null;
  return (
    <div className="said">
      {turn.thinking && <Thinking text={turn.thinking} live={!turn.done && !turn.text} />}
      {turn.text ? <Markdown text={turn.text} streaming={!turn.done} /> : said && turn.done && proposals.length === 0 ? <Markdown text={said} /> : null}
      {proposals.map((p) => (
        <Fragment key={p.document}>
          <ApprovalCardView card={cardOfProposal(p, decidedElsewhere)} onDecide={onDecide && !p.stale ? (v) => onDecide(p, v === "approved" ? "accepted" : "rejected") : undefined} />
          {openQuery && (
            <a className="button secondary small" href={openQuery(p.document)}>
              Open in Query
            </a>
          )}
        </Fragment>
      ))}
      {(changes ?? []).map((c) => (
        <ApprovalCardView key={c.id} card={cardOfChange(c)} onDecide={onChange ? (v) => onChange(c, v) : undefined} />
      ))}
      {(memories ?? []).map((mem) => {
        const here = memoryActions?.state(mem) ?? null;
        const key = `${mem.state}:${mem.text}`;
        if (mem.state === "forgotten")
          return (
            <p key={key} className="meta memory-line">
              Forgotten: {mem.text}
            </p>
          );
        if (mem.state === "saved" || here === "saved")
          return (
            <p key={key} className="meta memory-line">
              <Icon name="check" />
              Kept for your later conversations: {mem.text} <a href={href("assistant", "memory")}>Memory</a>
            </p>
          );
        if (here === "dismissed" || !memoryActions) return null;
        return (
          <div key={key} className="memory-offer">
            <p className="grow">
              <strong>Keep this for later conversations?</strong> {mem.text}
            </p>
            <div className="row">
              <button type="button" className="button small" onClick={() => memoryActions.keep(mem)}>
                Save
              </button>
              <button type="button" className="button secondary small" onClick={() => memoryActions.dismiss(mem)}>
                Not now
              </button>
            </div>
          </div>
        );
      })}
      {choice && <ClarificationCardView card={choice} onChoose={onChoose} />}
      {actions && turn.done ? <Answered turn={turn} actions={actions} steps={steps} /> : steps && <div className="turn-actions">{steps}</div>}
    </div>
  );
}

/** What the model reasoned before it answered, folded until asked for, never part of the answer (the chat, slice 9). */
function Thinking({ text, live }: { text: string; live: boolean }) {
  const [open, setOpen] = useState(false);
  const words = text.split(/\s+/u).filter(Boolean).length;
  return (
    <div className="steps thinking">
      <button type="button" className="steps-line" aria-expanded={open} onClick={() => setOpen((was) => !was)}>
        <Icon name={open ? "chevron-down" : "chevron-right"} />
        <span className={live ? "grow thinking-live" : "grow"}>{live ? "Thinking" : "Reasoning"}</span>
        <span className="meta num">
          {words.toLocaleString()} {words === 1 ? "word" : "words"}
        </span>
      </button>
      {open && (
        <div className="thinking-body">
          <Markdown text={text} streaming={live} />
        </div>
      )}
    </div>
  );
}

/** A person's words, each card, cohort or result they named drawn as a chip; a card's opens it on the Query page (the chat, slice 12). */
function SaidWords({ text }: { text: string }) {
  return (
    <>
      {saidWithMentions(text).map((s, i) =>
        s.kind === "words" ? (
          <Fragment key={i}>{s.text}</Fragment>
        ) : s.mention.kind === "card" ? (
          <a key={i} className="mention" href={href("query", s.mention.id)} title={`Query card, document ${s.mention.id}`}>
            {s.mention.name}
          </a>
        ) : (
          <span key={i} className="mention" title={s.mention.kind === "cohort" ? "Cohort" : `Result ${s.mention.id}`}>
            {s.mention.name}
          </span>
        ),
      )}
    </>
  );
}

/** A person's message: its words, the ways it was sent, and copy and edit on hover. */
function Asked({ turn, actions }: { turn: Turn; actions?: TurnActions }) {
  if (!actions) return <p className="said you">
        <SaidWords text={turn.text} />
      </p>;
  if (actions.editing) return <EditBox words={turn.text} onSend={actions.onEdit} onCancel={actions.onCancelEdit} />;
  const v = actions.version;
  return (
    <div className="said-you">
      <p className="said you">
        <SaidWords text={turn.text} />
      </p>
      <div className="turn-actions">
        <span className="on-hover">
          <CopyButton text={plainMentions(turn.text)} what="message" />
          <button type="button" className="icon-button" aria-label="Edit this message" title="Edit" disabled={actions.busy} onClick={actions.onStartEdit}>
            <Icon name="pencil" />
          </button>
        </span>
        {v && v.count > 1 && (
          <span className="versions">
            <button
              type="button"
              className="icon-button"
              aria-label="The way it was sent before"
              title="Before"
              disabled={!v.prev || actions.busy}
              onClick={() => v.prev && actions.onVersion(v.prev)}
            >
              <Icon name="chevron-left" />
            </button>
            <span className="meta num">
              {v.index + 1} / {v.count}
            </span>
            <button
              type="button"
              className="icon-button"
              aria-label="The way it was sent after"
              title="After"
              disabled={!v.next || actions.busy}
              onClick={() => v.next && actions.onVersion(v.next)}
            >
              <Icon name="chevron-right" />
            </button>
          </span>
        )}
      </div>
    </div>
  );
}

/** An answer's actions: copy it, ask for it again, and say whether it was good or missed. */
function Answered({ turn, actions, steps }: { turn: Turn; actions: TurnActions; steps: React.ReactNode }) {
  const [missing, setMissing] = useState(false);
  const verdict = actions.rating?.verdict ?? null;
  return (
    <>
      <div className="turn-actions">
        {turn.text && <CopyButton text={turn.text} what="answer" />}
        <button type="button" className="icon-button" aria-label="Ask for this answer again" title="Ask again" disabled={actions.busy} onClick={actions.onRetry}>
          <Icon name="restart" />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="A good answer"
          title="Good answer"
          aria-pressed={verdict === "up"}
          onClick={() => {
            setMissing(false);
            actions.onRate(verdict === "up" ? null : "up");
          }}
        >
          <Icon name="thumb-up" />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="The answer missed"
          title="Missed"
          aria-pressed={verdict === "down"}
          onClick={() => {
            if (verdict === "down") actions.onRate(null);
            setMissing(verdict !== "down" && !missing);
          }}
        >
          <Icon name="thumb-down" />
        </button>
        {verdict === "down" && actions.rating?.reason && <span className="meta">{actions.rating.reason}</span>}
        {steps}
      </div>
      {missing && (
        <Miss
          onSend={(reason) => {
            setMissing(false);
            actions.onRate("down", reason);
          }}
          onCancel={() => setMissing(false)}
        />
      )}
    </>
  );
}

/** What missed, in a word or in a sentence; either may be left out. */
function Miss({ onSend, onCancel }: { onSend: (reason?: string) => void; onCancel: () => void }) {
  const [picked, setPicked] = useState<string | null>(null);
  const [words, setWords] = useState("");
  const reason = [picked, words.trim()].filter(Boolean).join(": ");
  return (
    <form
      className="miss"
      onSubmit={(e) => {
        e.preventDefault();
        onSend(reason || undefined);
      }}
    >
      <p className="meta">What missed? Say it if you like; the verdict is kept with this conversation.</p>
      <div className="chips">
        {MISSES.map((m) => (
          <button key={m} type="button" className={picked === m ? "button small" : "button secondary small"} aria-pressed={picked === m} onClick={() => setPicked(picked === m ? null : m)}>
            {m}
          </button>
        ))}
      </div>
      <div className="input">
        <input value={words} maxLength={400} placeholder="Or say it in words" aria-label="What missed" onChange={(e) => setWords(e.target.value)} />
      </div>
      <div className="row miss-foot">
        <span className="grow" />
        <button type="button" className="button secondary small" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="button small">
          Send
        </button>
      </div>
    </form>
  );
}

/** A message being edited: sent as another version of it, the one before a click away. */
function EditBox({ words, onSend, onCancel }: { words: string; onSend: (words: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(words);
  const box = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  const send = () => {
    const w = text.trim();
    if (w) onSend(w);
  };
  return (
    <form
      className="edit-box"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <div className="input composer-input">
        <textarea
          ref={box}
          value={text}
          rows={Math.min(8, Math.max(2, text.split("\n").length))}
          aria-label="Edit the message"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            } else if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
            }
          }}
        />
      </div>
      <div className="row edit-box-foot">
        <span className="meta grow">Sent as another version; the one before stays a click away.</span>
        <button type="button" className="button secondary small" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="button small" disabled={text.trim().length === 0}>
          Send
        </button>
      </div>
    </form>
  );
}

function CopyButton({ text, what }: { text: string; what: string }) {
  const [state, copy] = useCopy();
  const label = state === "copied" ? "Copied" : state === "failed" ? "Could not copy" : `Copy the ${what}`;
  return (
    <button type="button" className="icon-button" aria-label={label} title={label} onClick={() => copy(text)}>
      <Icon name={state === "copied" ? "check" : state === "failed" ? "alert" : "copy"} />
    </button>
  );
}
