// SPDX-License-Identifier: AGPL-3.0-only
// One chat: the few things a chat shows besides words. One approval card for
// every change, drawn as a plan waiting for the person (the Assistant
// redesign, 2026-10-09: its kind, "waits for you", its steps, and Approve,
// Change it, Not now; nothing runs until it is approved); one question with
// its choices as outlined buttons; the plan while a plan of several steps
// runs; and one quiet status line while a turn works. No card names who
// made it.

import { useState } from "react";
import { Icon } from "../ui/Icon";
import "./assistant.css";
import type { ApprovalCard, ClarificationCard, PlanItem } from "./events";
import { lastSteps } from "./steps";
import type { Tool } from "./parts";

const STATE_TAG: Record<ApprovalCard["state"], { tone: string; words: (c: ApprovalCard) => string }> = {
  open: { tone: "tag caution", words: () => "waits for you" },
  approved: { tone: "tag ok", words: (c) => c.done },
  declined: { tone: "tag", words: () => "not now" },
  stale: { tone: "tag", words: () => "moved on" },
};

/**
 * A change waiting for the person: its kind, its line, its steps, and three
 * buttons. Change it hands the words back to the person, who says what to
 * change; a card decided elsewhere says where.
 */
export function ApprovalCardView({ card, onDecide, onRevise }: { card: ApprovalCard; onDecide?: (verdict: "approved" | "declined") => void; onRevise?: () => void }) {
  const tag = STATE_TAG[card.state];
  const List = card.numbered ? "ol" : "ul";
  return (
    <section className="approval-card" data-change={card.change} data-state={card.state} aria-label={card.kind}>
      <div className="approval-body">
        <div className="approval-kind">
          <span className="eyebrow">{card.kind}</span>
          <span className={tag.tone}>{tag.words(card)}</span>
        </div>
        <p className="approval-title">{card.title}</p>
        {card.sentence && <p className="approval-sentence">{card.sentence}</p>}
        {card.lines.length > 0 && (
          <List className="approval-lines">
            {card.lines.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </List>
        )}
        {card.state === "open" && !onDecide && card.elsewhere && <p className="meta">{card.elsewhere}</p>}
        {card.state === "approved" && card.next && (
          <p className="meta">
            <a href={card.next.href}>{card.next.words}</a>
          </p>
        )}
      </div>
      {card.state === "open" && onDecide && (
        <div className="approval-foot">
          <button type="button" className="button" onClick={() => onDecide("approved")}>
            {card.approve}
          </button>
          {onRevise && (
            <button type="button" className="button secondary" onClick={onRevise}>
              Change it
            </button>
          )}
          <button type="button" className="button quiet" onClick={() => onDecide("declined")}>
            {card.decline}
          </button>
        </div>
      )}
    </section>
  );
}

/** A question the agent asked: the sentence, and its choices as outlined buttons, a click sending the choice as the next message. */
export function ClarificationCardView({ card, onChoose }: { card: ClarificationCard; onChoose: (label: string) => void }) {
  return (
    <div className="ask-choice">
      <p>{card.question}</p>
      <div className="ask-options" role="group" aria-label="Choose">
        {card.options.map((o) => (
          <button key={o.label} type="button" className="ask-option" onClick={() => onChoose(o.label)}>
            {o.label}
            {o.count !== null && <span className="num">{o.count.toLocaleString("en-US")}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

const MARK: Record<PlanItem["status"], "check" | "alert" | "play" | "chevron-right" | "x"> = {
  done: "check",
  failed: "alert",
  running: "play",
  pending: "chevron-right",
  skipped: "x",
};

/** The agent's plan, while one of several steps is under way. */
export function PlanPanel({ items }: { items: PlanItem[] }) {
  return (
    <div className="plan plan-panel" aria-label="The plan">
      {items.map((i, n) => (
        <div key={n} className={`line plan-${i.status}`}>
          <Icon name={MARK[i.status]} />
          <p>{i.text}</p>
        </div>
      ))}
    </div>
  );
}

/** The one live line while a turn works: what it is doing now, in plain words, quietly. */
export function StatusLine({ words }: { words: string }) {
  return (
    <p className="status-line" role="status" aria-live="polite">
      <span className="status-dot" aria-hidden="true" />
      <span>{words}</span>
    </p>
  );
}

/** What a turn did, behind a small "?": the last three steps, and all of them on asking. */
export function StepsHelp({ tools, open, onToggle }: { tools: Tool[]; open: boolean; onToggle: () => void }) {
  const [all, setAll] = useState(false);
  const { lines, more } = lastSteps(tools, all);
  if (lines.length === 0 && more === 0) return null;
  return (
    <span className="steps-help">
      <button type="button" className="icon-button steps-q" aria-expanded={open} aria-label="What it did" title="What it did" onClick={onToggle}>
        ?
      </button>
      {open && (
        <span className="steps-pop" role="note">
          {lines.map((s) => (
            <span key={s.id} className={`steps-line quiet ${s.state}`}>
              <Icon name={s.state === "failed" ? "alert" : "check"} />
              {s.words}
            </span>
          ))}
          {more > 0 && (
            <button type="button" className="link-button" onClick={() => setAll(true)}>
              Show all
            </button>
          )}
        </span>
      )}
    </span>
  );
}
