// SPDX-License-Identifier: AGPL-3.0-only
// The saved selections (Wave 7a, H2 round 3), in the Query section: found by
// part of a name, fifty at a time, each with its size, its version and who
// saved it last.

import { useEffect, useRef, useState } from "react";
import { whenWords } from "../data/sources";
import { messageOf } from "../settings/common";
import { Wait } from "../ui/Wait";
import { selections, sizeWords, type SelectionRow } from "./selections";

type Load = { kind: "loading"; since: number } | { kind: "ready"; rows: SelectionRow[]; matching: number; next: string | null } | { kind: "failed"; why: string };

export function Selections() {
  const [q, setQ] = useState("");
  const [load, setLoad] = useState<Load>(() => ({ kind: "loading", since: Date.now() }));
  const asked = useRef(0);

  const read = (text: string, after: string | null = null) => {
    const mine = ++asked.current;
    if (!after) setLoad({ kind: "loading", since: Date.now() });
    selections.list(text, after).then(
      (p) => {
        if (asked.current !== mine) return;
        setLoad((was) => ({ kind: "ready", rows: after && was.kind === "ready" ? [...was.rows, ...p.selections] : p.selections, matching: p.matching, next: p.next }));
      },
      (e: unknown) => asked.current === mine && setLoad({ kind: "failed", why: messageOf(e) }),
    );
  };

  // the first page at once; typing asks again a moment after the last key
  useEffect(() => {
    const t = setTimeout(() => read(q), q === "" ? 0 : 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the words typed are what ask
  }, [q]);

  return (
    <>
      <div className="field-row">
        <div className="input grow">
          <input type="search" value={q} placeholder="Part of a name" aria-label="Find a selection" spellCheck={false} onChange={(e) => setQ(e.target.value)} />
        </div>
        {load.kind === "ready" && <span className="meta">{load.matching.toLocaleString("en-US")}</span>}
      </div>
      {load.kind === "loading" && <Wait phase="reading the selections" since={load.since} />}
      {load.kind === "failed" && <p className="warn">{load.why}</p>}
      {load.kind === "ready" && load.rows.length === 0 && <p className="meta">{q ? "No selection matches." : "No selection yet. Save one from a card."}</p>}
      {load.kind === "ready" && load.rows.length > 0 && (
        <div className="table-wrap">
          <table className="thin selections">
            <thead>
              <tr>
                <th>Name</th>
                <th className="num">Size</th>
                <th>Version</th>
                <th>Saved</th>
              </tr>
            </thead>
            <tbody>
              {load.rows.map((s) => (
                <tr key={s.id}>
                  <td>
                    <b>{s.name}</b>
                    {s.note && <div className="meta">{s.note}</div>}
                  </td>
                  <td className="num">{sizeWords(s.size)}</td>
                  <td>v{s.versions}</td>
                  <td className="meta">
                    {whenWords(s.updated_at ?? s.created_at)}
                    {s.updated_by ?? s.owner ? ` · ${s.updated_by ?? s.owner}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {load.kind === "ready" && load.next && (
        <button type="button" className="button quiet small" onClick={() => read(q, load.next)}>
          More
        </button>
      )}
    </>
  );
}
