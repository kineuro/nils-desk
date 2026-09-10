// SPDX-License-Identifier: AGPL-3.0-only
// The closure panel (Wave 5 section 8.2): every irreversible act opens one,
// fed by the engine's dependency door (12.4), and refuses to render without
// it. "Adopt overlay 7 and move 412 stacks?": the moves by axis, the review
// items that open and close, the results that stop reproducing, and a
// button that says what it does.

import { useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { type Closure as ClosureDoc, objects } from "../objects/client";
import { door as served } from "../sections";
import { Blocked } from "../ui/Veil";
import { classify, Failure, type Failed } from "../ui/Failure";
import { Wait } from "../ui/Wait";

export interface Act {
  /** What the act does, in the words of the button: "Adopt overlay 7". */
  verb: string;
  kind: "overlay" | "pack" | "rule" | "subject" | "stack";
  id: number | string;
  /** The moves the rehearsal named, when the act's own door reported them. */
  moves?: { axis: string; from: string | null; to: string; stacks: number }[];
}

/** The button's words, from the closure. */
export function buttonWords(act: Act, c: ClosureDoc): string {
  const parts = [`${act.verb} and move ${c.stacks.count} stacks`];
  if (c.review.opens > 0 || c.review.closes > 0) parts.push(`open ${c.review.opens} and close ${c.review.closes} review items`);
  if (c.handles.length > 0) parts.push(`retire ${c.handles.length} results`);
  return parts.join(", ");
}

export function Closure({ caps, act, onConfirm, onCancel, busy }: { caps: Capabilities; act: Act; onConfirm: () => void; onCancel: () => void; busy?: boolean }) {
  const has = served(caps, "GET /api/depends/{kind}/{id}");
  const [load, setLoad] = useState<{ kind: "waiting"; since: number } | { kind: "failed"; failed: Failed } | { kind: "ready"; c: ClosureDoc }>({ kind: "waiting", since: Date.now() });
  useEffect(() => {
    if (!has) return;
    let alive = true;
    setLoad({ kind: "waiting", since: Date.now() });
    objects
      .depends(act.kind, act.id)
      .then((c) => alive && setLoad({ kind: "ready", c }))
      .catch((e: unknown) => alive && setLoad({ kind: "failed", failed: classify(e) }));
    return () => {
      alive = false;
    };
  }, [has, act.kind, act.id]);
  return (
    <div className="panel closure" role="dialog" aria-label={act.verb}>
      <h3>{act.verb}?</h3>
      {!has && (
        <>
          <p className="meta">This engine serves no dependency door, so what this act would move cannot be shown; the act is not offered from here.</p>
          <Blocked control={{ enabled: false, reason: "the engine serves no dependency door" }} label={act.verb} onClick={onConfirm} />
        </>
      )}
      {has && load.kind === "waiting" && <Wait phase="computing what moves" since={load.since} size="panel" />}
      {has && load.kind === "failed" && <Failure failed={load.failed} />}
      {has && load.kind === "ready" && (
        <>
          <p>
            <strong>{load.c.stacks.count} stacks</strong> move.
            {load.c.stacks.sample.length > 0 && <> For instance {load.c.stacks.sample.slice(0, 5).map((s) => <a key={s} href={`#stack/${s}`}> stack {s}</a>)}.</>}
          </p>
          {(act.moves ?? load.c.moves ?? []).length > 0 && (
            <ul className="moves-by-axis">
              {(act.moves ?? load.c.moves ?? []).map((m, i) => (
                <li key={i}>
                  {m.axis}: {m.from ?? "(unset)"} to {m.to}, {m.stacks} stacks
                </li>
              ))}
            </ul>
          )}
          <p>
            Review items: {load.c.review.opens} open, {load.c.review.closes} close.
          </p>
          {load.c.handles.length > 0 && (
            <p>
              Results that stop reproducing: {load.c.handles.map((h) => <a key={h.handle} href={`#handle/${h.handle}`}> {h.name ?? `result ${h.handle}`}</a>)}.
            </p>
          )}
          {load.c.releases.length > 0 && (
            <p>
              Releases that stop reproducing: {load.c.releases.map((r) => <a key={r.release} href={`#release/${r.release}`}> {r.name} {r.version}</a>)}.
            </p>
          )}
          <div className="row">
            <button type="button" className="on" disabled={busy} onClick={onConfirm}>
              {buttonWords(act, load.c)}
            </button>
            <button type="button" onClick={onCancel}>Not now</button>
          </div>
        </>
      )}
    </div>
  );
}
