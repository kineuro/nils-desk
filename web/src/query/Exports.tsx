// SPDX-License-Identifier: AGPL-3.0-only
// Ask's Exports (Wave 7a, spec 13.1, round 4): the kept results, newest
// first, each saved as a CSV file at the person's own detail, read through
// the rows door with the purpose export as a card's Download CSV reads its
// answer. A result whose rows are held back, dropped or withdrawn says so
// in place of the button.

import { useEffect, useState } from "react";
import { saveText } from "../assistant/download";
import { results, type HandleRow } from "../ask/client";
import { whenWords } from "../data/sources";
import { messageOf } from "../settings/common";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import { handleFile, HELD_FILE, refusalWords, savedWords } from "./csv";

type Load = { kind: "loading"; since: number } | { kind: "ready"; rows: HandleRow[] } | { kind: "failed"; why: string };

/** Why a result gives no file, or null where it gives one. */
export function noFile(h: HandleRow): string | null {
  if (h.withdrawn_at) return "withdrawn";
  if (h.row_count === null) return HELD_FILE;
  if (!h.kept) return "its rows were dropped";
  return null;
}

/** A result's name as a person reads it. */
export const resultTitle = (h: HandleRow): string => h.name ?? `Result ${h.id}`;

export function Exports() {
  const [load, setLoad] = useState<Load>(() => ({ kind: "loading", since: Date.now() }));
  const [said, setSaid] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  useEffect(() => {
    results.handles().then(
      (r) => setLoad({ kind: "ready", rows: [...r.handles].sort((a, b) => b.id - a.id) }),
      (e: unknown) => setLoad({ kind: "failed", why: messageOf(e) }),
    );
  }, []);
  const save = (h: HandleRow) => {
    setBusy(h.id);
    handleFile(h.id, resultTitle(h)).then(
      (f) => {
        saveText(f.name, f.text, "text/csv");
        setSaid((s) => ({ ...s, [h.id]: savedWords(f) }));
      },
      (e: unknown) => setSaid((s) => ({ ...s, [h.id]: refusalWords(e) })),
    ).finally(() => setBusy(null));
  };
  if (load.kind === "loading") return <Wait phase="reading the kept results" since={load.since} size="panel" />;
  if (load.kind === "failed") return <p className="warn">The kept results could not be read: {load.why}</p>;
  if (load.rows.length === 0) return <p className="lede">No kept result yet. Run a card, and its answer is kept here.</p>;
  return (
    <div className="table-wrap">
      <table className="thin exports">
        <thead>
          <tr>
            <th>Result</th>
            <th>Grain</th>
            <th className="num">Rows</th>
            <th>Made</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {load.rows.map((h) => {
            const why = noFile(h);
            return (
              <tr key={h.id}>
                <td>{resultTitle(h)}</td>
                <td>{h.grain}</td>
                <td className="num">{h.row_count === null ? "held" : h.row_count.toLocaleString("en-US")}</td>
                <td className="meta">{whenWords(h.created_at)}</td>
                <td>
                  {why === null ? (
                    <button type="button" className="button quiet small" disabled={busy === h.id} onClick={() => save(h)}>
                      <Icon name="download" />
                      CSV
                    </button>
                  ) : (
                    <span className="meta">{why}</span>
                  )}
                  {said[h.id] && <span className="meta"> {said[h.id]}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
