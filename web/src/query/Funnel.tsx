// SPDX-License-Identifier: AGPL-3.0-only
// The yield funnel beside a saved selection (record 58 P4, Wave 7b spec
// sections 15 and 17): pick the pipeline or family, read what is left after
// each filter and each hard need, open a row for its years, bases and 2D or
// 3D, and the error-budget line under it. The numbers are the engine's.

import { useEffect, useRef, useState } from "react";
import { catalog } from "../ops/catalog";
import { messageOf } from "../settings/common";
import { Wait } from "../ui/Wait";
import { droppedWords, funnel, groupWords, stepWords, type Funnel as Doc, type FunnelRow } from "./funnel";

type Load = { kind: "idle" } | { kind: "loading"; since: number } | { kind: "ready"; doc: Doc } | { kind: "failed"; why: string };

const n = (v: number) => v.toLocaleString("en-US");

function Breakdown({ r }: { r: FunnelRow }) {
  return (
    <div className="meta funnel-by">
      <div>Year: {groupWords(r.by_year)}</div>
      <div>Base: {groupWords(r.by_base)}</div>
      <div>2D/3D: {groupWords(r.by_dimension)}</div>
      {(r.lacking ?? []).map((l) => (
        <div key={l.why}>
          {l.why}: {n(l.units)}
        </div>
      ))}
      {(r.left_out ?? []).map((l) => (
        <div key={l.why}>
          {l.why}: {n(l.stacks)}
        </div>
      ))}
      {!!r.cannot_tell && <div>Cannot tell: {n(r.cannot_tell)}</div>}
    </div>
  );
}

/** The funnel of one selection, `spec` as `selection:NAME@V`. */
export function Funnel({ spec }: { spec: string }) {
  const [choices, setChoices] = useState<string[] | null>(null);
  const [pipeline, setPipeline] = useState("");
  const [load, setLoad] = useState<Load>({ kind: "idle" });
  const [open, setOpen] = useState<number | null>(null);
  const asked = useRef(0);

  useEffect(() => {
    catalog.list().then(
      (c) => {
        const names = [
          ...(c.families ?? []).map((f) => f.name),
          ...[...new Set(c.pipelines.filter((p) => p.state === "active" && p.standing !== "replaced" && p.standing !== "retired").map((p) => p.name))],
        ];
        setChoices(names);
      },
      (e: unknown) => setLoad({ kind: "failed", why: messageOf(e) }),
    );
  }, []);

  const count = (name: string) => {
    setPipeline(name);
    setOpen(null);
    if (!name) return setLoad({ kind: "idle" });
    const mine = ++asked.current;
    setLoad({ kind: "loading", since: Date.now() });
    funnel.of(spec, name).then(
      (doc) => asked.current === mine && setLoad({ kind: "ready", doc }),
      (e: unknown) => asked.current === mine && setLoad({ kind: "failed", why: messageOf(e) }),
    );
  };

  return (
    <div className="funnel">
      <div className="field-row">
        <label className="input grow">
          <select aria-label="Pipeline" value={pipeline} onChange={(e) => count(e.target.value)} disabled={choices === null}>
            <option value="">{choices === null ? "Reading pipelines" : "Through which pipeline?"}</option>
            {(choices ?? []).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>
      {load.kind === "loading" && <Wait phase="counting the funnel" since={load.since} />}
      {load.kind === "failed" && <p className="warn">{load.why}</p>}
      {load.kind === "ready" && (
        <>
          <div className="table-wrap">
            <table className="thin funnel-rows">
              <thead>
                <tr>
                  <th>Step</th>
                  <th className="num">Subjects</th>
                  <th className="num">Sessions</th>
                  <th className="num">Stacks</th>
                  <th className="num">Dropped</th>
                </tr>
              </thead>
              <tbody>
                {load.doc.rows.map((r) => (
                  <FunnelLine key={r.row} r={r} unit={load.doc.unit} open={open === r.row} toggle={() => setOpen(open === r.row ? null : r.row)} />
                ))}
              </tbody>
            </table>
          </div>
          <p className="funnel-budget">
            <b>{load.doc.budget.words}</b>
            {load.doc.budget.certificate_words && <span className="meta"> · {load.doc.budget.certificate_words}</span>}
          </p>
        </>
      )}
    </div>
  );
}

function FunnelLine({ r, unit, open, toggle }: { r: FunnelRow; unit: string; open: boolean; toggle: () => void }) {
  return (
    <>
      <tr className={open ? "open" : undefined}>
        <td>
          <button type="button" className="button quiet small" aria-expanded={open} title={r.kind === "need" ? r.what : undefined} onClick={toggle}>
            {stepWords(r, unit)}
          </button>
          {r.axes && r.axes.length > 0 && <span className="meta"> · reads {r.axes.join(", ")}</span>}
        </td>
        <td className="num">{n(r.subjects)}</td>
        <td className="num">{n(r.sessions)}</td>
        <td className="num">{n(r.stacks)}</td>
        <td className="num meta">{droppedWords(r)}</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={5}>
            <Breakdown r={r} />
          </td>
        </tr>
      )}
    </>
  );
}
