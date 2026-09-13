// SPDX-License-Identifier: AGPL-3.0-only
// The Audit page (Wave 4a section 9.2): the registry's audit log, newest
// first, narrowed by who acted, the act, and the month. Each row says when,
// who acted and for whom, what the act touched, and the epoch it moved to.

import { useEffect, useState } from "react";
import { ops, type AuditRow } from "../ops/client";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import { actionsOf, actorWords, scopeWords, whenWords } from "./audit";
import { Head, messageOf } from "./common";
import { auditQuery, type AuditFilter } from "./console";

const EMPTY: AuditFilter = { principal: "", action: "", object: "", month: "" };

export function AuditPage() {
  const [filter, setFilter] = useState<AuditFilter>(EMPTY);
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [seen, setSeen] = useState<string[]>([]);
  const [why, setWhy] = useState<string | null>(null);
  const [reading, setReading] = useState<number | null>(null);

  const read = (f: AuditFilter) => {
    setReading(Date.now());
    ops
      .audit(auditQuery(f))
      .then((r) => {
        setRows(r.rows);
        setSeen((s) => [...new Set([...s, ...actionsOf(r.rows)])].sort());
        setWhy(null);
      })
      .catch((e: unknown) => setWhy(messageOf(e)))
      .finally(() => setReading(null));
  };

  useEffect(() => read(EMPTY), []);

  const narrowed = filter.principal || filter.action || filter.month;
  return (
    <div className="settings">
      <Head title="Audit" lede="Every act that changes a judgement, reveals an identifier, or changes a setting, with who did it and when. The registry keeps it." />
      <form
        className="row audit-filters"
        onSubmit={(e) => {
          e.preventDefault();
          read(filter);
        }}
      >
        <div className="input">
          <input aria-label="Who acted" placeholder="who acted, user@node" value={filter.principal} onChange={(e) => setFilter({ ...filter, principal: e.target.value })} />
        </div>
        <div className="input">
          <input aria-label="The act" placeholder="the act" list="audit-actions" value={filter.action} onChange={(e) => setFilter({ ...filter, action: e.target.value })} />
          <datalist id="audit-actions">
            {seen.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </div>
        <div className="input">
          <input aria-label="From the month" type="month" value={filter.month} onChange={(e) => setFilter({ ...filter, month: e.target.value })} />
        </div>
        <button type="submit" className="button secondary small" disabled={reading !== null}>
          <Icon name="search" />
          Read
        </button>
        {narrowed && (
          <button
            type="button"
            className="button quiet small"
            onClick={() => {
              setFilter(EMPTY);
              read(EMPTY);
            }}
          >
            Every act
          </button>
        )}
      </form>
      {why && <p className="warn">{why}</p>}
      {reading !== null && rows === null && <Wait phase="reading the audit log" since={reading} />}
      {rows !== null && (
        <section className="stack">
          <p className="meta">{rows.length === 0 ? "No act matches." : rows.length === 1 ? "One act, newest first." : `${rows.length.toLocaleString("en-GB")} acts, newest first.`}</p>
          <div className="table-wrap">
            <table className="thin audit">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Act</th>
                  <th>What it touched</th>
                  <th className="num">Epoch</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const actor = actorWords(r["actor"]);
                  const epoch = r["epoch"];
                  return (
                    <tr key={r.id ?? i}>
                      <td className="meta nowrap">{whenWords(r.at)}</td>
                      <td>
                        {r.principal}
                        {actor && <div className="meta">for {actor}</div>}
                      </td>
                      <td>
                        <span className="tag">{r.action}</span>
                        <div className="meta audit-scope">{scopeWords(r["scope"])}</div>
                      </td>
                      <td className="meta">{scopeWords(r["scope"])}</td>
                      <td className="num">{typeof epoch === "number" ? epoch.toLocaleString("en-GB") : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
