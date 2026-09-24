// SPDX-License-Identifier: AGPL-3.0-only
// Review / Models (record 45 S7): what models proposed. One change matrix per
// axis, from the value the stacks hold now to the value proposed, each cell
// opening its groups by confidence band. A staged group is committed or
// withdrawn alone; Commit by filter puts in force the staged part a model,
// an axis, a from and a to name, after a closure panel that counts it.

import { useState } from "react";
import type { Capabilities } from "../capabilities";
import { ops } from "../ops/client";
import { Dialog } from "../ui/Dialog";
import { Says } from "../ui/Says";
import { refusalWords } from "./client";
import { axesOf, changeMatrix, commitBody, commitPlan, committedWords, decisions, fromOfRow, modelActs, modelsIn, type Cell, type CommitFilter, type ModelGroup } from "./modelFamily";
import "./grown.css";

const n = (v: number) => v.toLocaleString("en-US");
const p = (v: number | null) => (v === null ? "" : v.toFixed(2));

export function ChangeMatrix({ groups, axis, on, onCell }: { groups: ModelGroup[]; axis: string; on: { from: string; to: string } | null; onCell: (from: string, to: string) => void }) {
  const m = changeMatrix(groups, axis);
  if (m.total === 0) return <p className="meta">Nothing proposed on {axis}.</p>;
  return (
    <div className="table-wrap">
      <table className="thin matrix">
        <thead>
          <tr>
            <th className="from">{axis} now</th>
            {m.tos.map((t) => (
              <th key={t} className="num">
                to {t}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {m.froms.map((f) => (
            <tr key={f}>
              <th className="from">{f}</th>
              {m.tos.map((t) => {
                const c: Cell | undefined = m.cells[f]?.[t];
                const here = on?.from === f && on?.to === t;
                return (
                  <td key={t} className={here ? "num on" : "num"}>
                    {c ? (
                      <button type="button" aria-pressed={here} title={`${n(c.staged)} staged`} onClick={() => onCell(f, t)}>
                        {n(c.stacks)}
                      </button>
                    ) : (
                      ""
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The groups of one cell, by band: each staged one committed or withdrawn alone. */
export function CellGroups({ cell, may, onCommit, onWithdraw }: { cell: Cell; may: { commit: boolean; withdraw: boolean }; onCommit: (g: ModelGroup) => void; onWithdraw: (g: ModelGroup) => void }) {
  const rows = [...cell.groups].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
  return (
    <div className="table-wrap">
      <table className="thin">
        <thead>
          <tr>
            <th>Band</th>
            <th>Model</th>
            <th className="num">Stacks</th>
            <th className="num">Lowest p</th>
            <th>State</th>
            <th className="acts" />
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g.item.id}>
              <td>{g.band}</td>
              <td className="path">{g.model}</td>
              <td className="num">{n(g.members)}</td>
              <td className="num">{p(g.confidence)}</td>
              <td>{g.staged ? <span className="tag caution">staged</span> : <span className="tag">asked</span>}</td>
              <td className="acts">
                <span className="row-actions">
                  {g.staged && g.decision !== null && may.withdraw && (
                    <button type="button" className="button quiet small" onClick={() => onWithdraw(g)}>
                      Withdraw
                    </button>
                  )}
                  {g.staged && g.decision !== null && may.commit && (
                    <button type="button" className="button small" onClick={() => onCommit(g)}>
                      Commit
                    </button>
                  )}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ModelFamily({ caps, groups, askHref, onChanged }: { caps: Capabilities; groups: ModelGroup[]; askHref: ((kind: string) => string) | null; onChanged: (words: string) => void }) {
  const axes = axesOf(groups);
  const [axis, setAxis] = useState<string | null>(null);
  const [on, setOn] = useState<{ from: string; to: string } | null>(null);
  const [filter, setFilter] = useState<CommitFilter | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const acts = modelActs(caps);
  const shown = axis !== null && axes.includes(axis) ? axis : (axes[0] ?? null);
  if (shown === null) return <p className="meta">No model proposed anything that waits.</p>;
  const m = changeMatrix(groups, shown);
  const cell = on ? m.cells[on.from]?.[on.to] : undefined;
  const act = (work: Promise<unknown>, words: string) =>
    work.then(
      () => onChanged(words),
      (e: unknown) => setSaid(refusalWords(e)),
    );
  const models = cell ? modelsIn(cell) : [];
  return (
    <section className="stack roomy">
      <div className="chips">
        {axes.map((a) => (
          <button
            key={a}
            type="button"
            className={a === shown ? "opt on" : "opt"}
            aria-pressed={a === shown}
            onClick={() => {
              setAxis(a);
              setOn(null);
            }}
          >
            {a}
          </button>
        ))}
      </div>
      <ChangeMatrix groups={groups} axis={shown} on={on} onCell={(from, to) => setOn(on?.from === from && on?.to === to ? null : { from, to })} />
      {said && <p className="warn">{said}</p>}
      {cell && on && (
        <>
          <div className="section-head rule-top">
            <h2>
              {shown}: {on.from} to {on.to}
            </h2>
            <span className="meta">
              {n(cell.stacks)} stacks · {n(cell.staged)} staged
            </span>
            {acts.byFilter &&
              models.map((model) => (
                <button key={model} type="button" className="button small" onClick={() => setFilter({ model, axis: shown, to: on.to, from: fromOfRow(on.from) })}>
                  Commit by filter{models.length > 1 ? `: ${model}` : ""}
                </button>
              ))}
            {askHref && (
              <a className="button secondary small" href={askHref(`${shown}:model`)}>
                Ask people about these
              </a>
            )}
          </div>
          <CellGroups
            cell={cell}
            may={acts}
            onCommit={(g) => g.decision !== null && act(ops.decisionCommit(g.decision), `Committed ${n(g.members)} stacks: ${g.axis} is ${g.to}, by ${g.model}.`)}
            onWithdraw={(g) => g.decision !== null && act(ops.decisionWithdraw(g.decision), `Withdrew the model's decision on ${n(g.members)} stacks; the group is asked again.`)}
          />
        </>
      )}
      {filter && <CommitDialog groups={groups} filter={filter} onClose={() => setFilter(null)} onDone={(w) => { setFilter(null); onChanged(w); }} />}
      <Says head="What a model's decision is worth">
        A model&apos;s answer is staged, never in force, until a person commits it. Committing names you as the one who put it in force and keeps the model as its author. Withdraw sends a group back to be asked.
      </Says>
    </section>
  );
}

/** The closure panel of a commit by filter: what it puts in force, counted, and that nothing else moves. */
export function CommitDialog({ groups, filter, onClose, onDone }: { groups: ModelGroup[]; filter: CommitFilter; onClose: () => void; onDone: (words: string) => void }) {
  const plan = commitPlan(groups, filter);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const [moved, setMoved] = useState(false);
  const go = () => {
    setBusy(true);
    setRefused(null);
    decisions.commitWhere(commitBody(filter, moved)).then(
      (r) => onDone(committedWords(r)),
      (e: unknown) => {
        setBusy(false);
        setRefused(refusalWords(e));
      },
    );
  };
  const what = `${filter.axis} ${filter.from === undefined ? "" : `from ${filter.from ?? "no value"} `}to ${filter.to}`;
  return (
    <Dialog
      title="Commit by filter"
      icon="review"
      onClose={onClose}
      foot={
        <div className="row actions">
          <button type="button" className="button" disabled={busy || plan.groups === 0} onClick={go}>
            Commit {n(plan.stacks)}
          </button>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          {refused && <span className="warn">{refused}</span>}
        </div>
      }
    >
      <p className="lede">
        {n(plan.stacks)} {plan.stacks === 1 ? "stack" : "stacks"} in {n(plan.groups)} staged {plan.groups === 1 ? "group" : "groups"}: {what}, by {filter.model}.
      </p>
      <p className="meta">Nothing else is put in force. {plan.open > 0 ? `${n(plan.open)} stacks below the threshold stay asked.` : ""}</p>
      {refused && /moved on/u.test(refused) && (
        <label className="choice">
          <input type="checkbox" checked={moved} onChange={(e) => setMoved(e.target.checked)} />
          commit anyway, though the registry moved on since they were staged
        </label>
      )}
    </Dialog>
  );
}
