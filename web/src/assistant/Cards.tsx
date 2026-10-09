// SPDX-License-Identifier: AGPL-3.0-only
// One chat: the few things a chat shows besides words. One approval card for
// every change, one clarification card for every question, the plan while a
// plan of several steps runs, and one live line while a turn works. No card
// names who made it.

import { useState } from "react";
import { Icon } from "../ui/Icon";
import type { ApprovalCard, ClarificationCard, PlanItem } from "./events";
import { lastSteps } from "./steps";
import type { Tool } from "./parts";

/** A change waiting for the person: what it is, in a sentence, and two buttons. A card decided elsewhere says where. */
export function ApprovalCardView({ card, onDecide }: { card: ApprovalCard; onDecide?: (verdict: "approved" | "declined") => void }) {
  return (
    <div className="proposal approval" data-change={card.change}>
      <Icon name="ask" />
      <div className="grow">
        <p className="proposal-title">{card.title}</p>
        {card.sentence && <p>{card.sentence}</p>}
        {card.lines.length > 0 && (
          <ul className="approval-lines">
            {card.lines.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        )}
        {card.state === "open" && !onDecide && card.elsewhere && <p className="meta">{card.elsewhere}</p>}
        {card.state === "approved" && card.next && (
          <p className="meta">
            <a href={card.next.href}>{card.next.words}</a>
          </p>
        )}
      </div>
      {card.state === "open" && onDecide && (
        <div className="row">
          <button type="button" className="button small" onClick={() => onDecide("approved")}>
            {card.approve}
          </button>
          <button type="button" className="button secondary small" onClick={() => onDecide("declined")}>
            {card.decline}
          </button>
        </div>
      )}
      {(card.state === "approved" || card.state === "declined") && (
        <span className={card.state === "approved" ? "tag ok" : "tag"}>{card.state === "approved" ? (card.approve === "Confirm" ? "confirmed" : card.approve === "Approve" ? "recorded" : "accepted") : "disregarded"}</span>
      )}
    </div>
  );
}

/** A question the agent asked: the options a click away, which sends the option as the next message. */
export function ClarificationCardView({ card, onChoose }: { card: ClarificationCard; onChoose: (label: string) => void }) {
  return (
    <div className="choice clarification">
      <p>{card.question}</p>
      <div className="chips">
        {card.options.map((o) => (
          <button key={o.label} type="button" className="button secondary small" onClick={() => onChoose(o.label)}>
            {o.label}
            {o.count !== null && <span className="meta num">{o.count.toLocaleString()}</span>}
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

/** The one live line while a turn works: what it is doing now, in plain words. */
export function StatusLine({ words }: { words: string }) {
  return (
    <p className="status-line" role="status" aria-live="polite">
      <span className="thinking-live">{words}</span>
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
