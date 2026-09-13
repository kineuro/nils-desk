// SPDX-License-Identifier: AGPL-3.0-only
// One turn of a conversation, as the Assistant page and a Query card's
// discussion show it: what was said, what the assistant did as a folded list
// of steps, each version it proposes, and a choice answered with a click. A
// page that decides proposals somewhere else passes no onDecide, and the turn
// only names them.

import { Icon } from "../ui/Icon";
import type { Proposal, Turn } from "./parts";
import { foldedSteps, stepLines } from "./steps";

export function TurnView(props: {
  turn: Turn;
  open: boolean;
  onToggle: () => void;
  proposals: Proposal[];
  choice: { question: string; options: { label: string; count: number | null }[] } | null;
  onDecide?: (p: Proposal, verdict: "accepted" | "rejected") => void;
  onChoose: (label: string) => void;
  /** Where an undecided proposal is decided, when it is not here. */
  decidedElsewhere?: string;
}) {
  const { turn, open, onToggle, proposals, choice, onDecide, onChoose, decidedElsewhere } = props;
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
            {!onDecide && p.decided === null && !p.stale && decidedElsewhere && <p className="meta">{decidedElsewhere}</p>}
          </div>
          {onDecide && p.decided === null && !p.stale && (
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
