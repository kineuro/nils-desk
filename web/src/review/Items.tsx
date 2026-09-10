// SPDX-License-Identifier: AGPL-3.0-only
// The review queue (Wave 5 section 8.2): items sorted by what they cost if
// wrong, each a link to its page; bulk decisions for items that do not need
// looking at, one audit row per item, the closure count shown first, refused
// for items that do.

import { useCallback, useEffect, useMemo, useState } from "react";
import { ops, type ReviewItem } from "../ops/client";
import { Empty } from "../ui/Empty";
import { classify, Failure, type Failed } from "../ui/Failure";
import { Wait } from "../ui/Wait";
import { bulkPlan, costOf, kindWords, needsReading, sortByCost } from "./triage";

export function Items() {
  const [status, setStatus] = useState("open");
  const [kind, setKind] = useState("");
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [failed, setFailed] = useState<Failed | null>(null);
  const [since, setSince] = useState(() => Date.now());
  const [selected, setSelected] = useState<number[]>([]);
  const [done, setDone] = useState<{ accepted: number[]; failed: { id: number; why: string }[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    setSince(Date.now());
    ops
      .review(status || undefined, kind || undefined, 200)
      .then((r) => {
        setItems(r.items);
        setFailed(null);
      })
      .catch((e: unknown) => setFailed(classify(e)));
  }, [status, kind]);
  useEffect(() => {
    load();
  }, [load]);
  const sorted = useMemo(() => (items ? sortByCost(items) : []), [items]);
  const plan = useMemo(() => bulkPlan(sorted, selected), [sorted, selected]);
  const toggle = (id: number) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const acceptAll = async () => {
    setBusy(true);
    const accepted: number[] = [];
    const failures: { id: number; why: string }[] = [];
    // one door call per item: one audit row each, never a batch the audit cannot tell apart
    for (const i of plan.accepts) {
      try {
        await ops.reviewAccept(i.id, "accepted in bulk from the review queue");
        accepted.push(i.id);
      } catch (e) {
        failures.push({ id: i.id, why: (e as Error).message });
      }
    }
    setDone({ accepted, failed: failures });
    setSelected([]);
    setBusy(false);
    load();
  };
  return (
    <div className="items">
      <div className="row">
        <label>
          status{" "}
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="open">open</option>
            <option value="decided">decided</option>
            <option value="">all</option>
          </select>
        </label>
        <label>
          kind <input value={kind} onChange={(e) => setKind(e.target.value)} placeholder="axis:reason or area.what" size={22} />
        </label>
        <button type="button" onClick={load}>Refresh</button>
      </div>
      {failed && <Failure failed={failed} action={{ label: "Try again", onClick: load }} />}
      {!failed && items === null && <Wait phase="reading the queue" since={since} size="panel" />}
      {items !== null && sorted.length === 0 && <Empty what="Nothing waits here." back={{ label: "See what was decided.", href: "#review/review" }} />}
      {sorted.length > 0 && (
        <>
          {selected.length > 0 && (
            <div className="panel closure">
              <p>
                <strong>{plan.accepts.length} items, {plan.stacks} stacks</strong> would be accepted without a decision, one audit row each.
                {plan.refused.length > 0 && <> {plan.refused.length} of the selected are refused: they need reading.</>}
              </p>
              {plan.refused.length > 0 && (
                <ul className="reasons">
                  {plan.refused.map((r) => (
                    <li key={r.item.id}>
                      <a href={`#review/${r.item.id}`}>item {r.item.id}</a>: {r.why}
                    </li>
                  ))}
                </ul>
              )}
              <div className="row">
                <button type="button" className="on" disabled={busy || plan.accepts.length === 0} onClick={acceptAll}>
                  Accept {plan.accepts.length} items without a decision
                </button>
                <button type="button" onClick={() => setSelected([])}>Clear</button>
              </div>
            </div>
          )}
          {done && (
            <p className="meta">
              {done.accepted.length} accepted{done.failed.length > 0 && <>; {done.failed.map((f) => `item ${f.id}: ${f.why}`).join("; ")}</>}
            </p>
          )}
          <div className="scroll">
            <table className="thin queue">
              <thead>
                <tr>
                  <th />
                  <th>item</th>
                  <th>what</th>
                  <th>scope</th>
                  <th className="num">members</th>
                  <th>needs</th>
                  <th>status</th>
                  <th>raised</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((i) => {
                  const reading = needsReading(i);
                  return (
                    <tr key={i.id} className={selected.includes(i.id) ? "on" : ""} data-cost={costOf(i)}>
                      <td>
                        <input type="checkbox" aria-label={`select item ${i.id}`} checked={selected.includes(i.id)} disabled={i.status !== "open"} onChange={() => toggle(i.id)} />
                      </td>
                      <td>
                        <a href={`#review/${i.id}`}>{i.id}</a>
                      </td>
                      <td>{kindWords(i.kind)}</td>
                      <td>{i.scope}</td>
                      <td className="num">{typeof i.members === "number" ? i.members : Array.isArray(i.members) ? i.members.length : ""}</td>
                      <td>{reading ? <span className="tag caution">reading</span> : <span className="meta">a glance</span>}</td>
                      <td>{i.status}</td>
                      <td className="when">{i.created_at.slice(0, 16).replace("T", " ")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
