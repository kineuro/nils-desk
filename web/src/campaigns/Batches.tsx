// SPDX-License-Identifier: AGPL-3.0-only
// Like with like (record 48 R1): stacks that look the same (same sequence,
// same answer suggested) as one grid of tiles, the answer they share above
// them. A person looks, holds back any that look wrong with a click, and
// accepts the rest in one move; each accepted stack is still its own
// decision, and a random tenth the engine holds back at the accept is left
// to be read one by one. Keys: Enter accepts, `n` the next
// batch, `b` back to one by one.

import { useMemo, useState } from "react";
import { Tile, TileSync } from "../viewer/Tile";
import { acceptPlan, planWords, type Batch } from "./reader";

const valueWords = (v: string | string[] | null) => (v === null ? "none" : Array.isArray(v) ? (v.length > 0 ? v.join("+") : "none") : v);

export interface BatchViewProps {
  batches: Batch[] | null;
  at: number;
  /** Items the person held back with a click. */
  mine: Set<number>;
  busy: boolean;
  said: string | null;
  onHold: (item: number) => void;
  onAccept: () => void;
  onNext: () => void;
  onBack: () => void;
}

export function BatchView({ batches, at, mine, busy, said, onHold, onAccept, onNext, onBack }: BatchViewProps) {
  const sync = useMemo(() => new TileSync(), []);
  const [size] = useState(112);
  if (batches === null) return <p className="meta">Reading the batches…</p>;
  const b = batches[at] ?? null;
  if (!b)
    return (
      <div className="batch">
        <p className="meta">{said ?? "No batch of like stacks is left here."}</p>
        <div className="row actions">
          <button type="button" className="button secondary" onClick={onBack}>
            One by one <kbd>b</kbd>
          </button>
        </div>
      </div>
    );
  const plan = acceptPlan(b, mine);
  const shown = b.items.length;
  return (
    <div className="batch" aria-label={`batch ${at + 1} of ${batches.length}`}>
      <div className="batch-head">
        <span className="eyebrow">
          batch {at + 1} of {batches.length} · {b.count} like {b.count === 1 ? "stack" : "stacks"}
          {shown < b.count ? ` · ${shown} shown` : ""}
        </span>
        <span className="batch-values">
          {Object.entries(b.values).map(([axis, v]) => (
            <span key={axis} className="tag ok">
              {axis} {valueWords(v)}
            </span>
          ))}
        </span>
        <span className="meta batch-words">{b.words}</span>
      </div>
      {said && <p className="meta said">{said}</p>}
      <p className="batch-counts" role="status" aria-live="polite">
        <b>{plan.n - plan.drawn}</b> take the suggestion · <b>{plan.drawn + plan.read.length}</b> held back
        {plan.drawn > 0 ? ` (${plan.drawn} at random for the draw${plan.read.length > 0 ? `, ${plan.read.length} by you` : ""})` : ""}
        {plan.items !== null && shown < b.count ? `; the ${b.count - shown} not shown wait for a later move` : ""}
      </p>
      <div className="batch-grid">
        {b.items.map((i) => {
          const held = mine.has(i.item);
          return (
            <div
              key={i.item}
              className={held ? "batch-cell held" : "batch-cell"}
              role="button"
              tabIndex={0}
              aria-pressed={held}
              aria-label={`${i.stack !== null ? `stack ${i.stack}` : `item ${i.item}`}: ${held ? "held back by you; press to let it take the suggestion" : "takes the suggestion; press to hold it back"}`}
              onClick={() => onHold(i.item)}
              onKeyDown={(e) => {
                // Space or Enter on a tile holds it back or lets it go; never the batch's accept
                if (e.key === " " || e.key === "Enter") {
                  e.preventDefault();
                  e.stopPropagation();
                  onHold(i.item);
                }
              }}
            >
              {i.stack !== null ? <Tile stack={i.stack} sync={sync} size={size} caption={held ? "held by you" : `stack ${i.stack}`} /> : <span className="meta">item {i.item}</span>}
            </div>
          );
        })}
      </div>
      <div className="row actions">
        <button type="button" className="button" disabled={busy || plan.n === 0} onClick={onAccept} title={planWords(plan)}>
          Accept for {plan.n} <kbd>Enter</kbd>
        </button>
        <button type="button" className="button secondary" disabled={busy || batches.length < 2} onClick={onNext}>
          Next batch <kbd>n</kbd>
        </button>
        <span className="grow" />
        <button type="button" className="button quiet" onClick={onBack}>
          One by one <kbd>b</kbd>
        </button>
      </div>
      <p className="meta">A click, Space or Enter on a tile holds it back to read one by one; the wheel moves every tile a plane at a time.</p>
    </div>
  );
}
