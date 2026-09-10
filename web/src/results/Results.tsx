// SPDX-License-Identifier: AGPL-3.0-only
// The result surface (Wave 4c section 7.4). A run leaves a handle; this page
// lists what the engine's handles door answers, pages a handle's rows from
// the rows door and never re-executes. Running, stale and truncated are the
// three named states, each with its own treatment; export is CSV off a
// handle through the desk's export door, with a purpose the person types.

import { useCallback, useEffect, useMemo, useState } from "react";
import { type Column, columnName, desk, type DeskRecord, type HandleRow, type JobRow, results } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { age, type ResultState, type Running, running, surface } from "./state";

const POLL_RUNNING_MS = 30_000;
const POLL_IDLE_MS = 120_000;

export function Results({ caps }: { caps: Capabilities }) {
  const [handles, setHandles] = useState<HandleRow[] | null>(null);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [record, setRecord] = useState<DeskRecord>({ results: [], lineage: [], export: null });
  const [withdrawn, setWithdrawn] = useState(false);
  const [openId, setOpenId] = useState<number | null>(() => {
    const m = /^#(?:ask\/results|results)\/(\d+)$/.exec(location.hash);
    return m ? Number(m[1]) : null;
  });
  const [why, setWhy] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(() => {
    results.handles(withdrawn).then((h) => setHandles(h.handles)).catch((e: Error) => setWhy(e.message));
    results.jobs().then((j) => setJobs(j.jobs)).catch(() => setJobs([]));
    desk.results().then(setRecord).catch(() => undefined);
    setNow(Date.now());
  }, [withdrawn]);

  const live = useMemo(() => running(jobs), [jobs]);
  useEffect(() => {
    refresh();
  }, [refresh]);
  useEffect(() => {
    // progress by 30 seconds while something runs; a slow poll otherwise
    const t = setInterval(refresh, live.length > 0 ? POLL_RUNNING_MS : POLL_IDLE_MS);
    return () => clearInterval(t);
  }, [refresh, live.length]);

  const epoch = caps.engine?.registry.epoch ?? 0;
  const canExport = Boolean(caps.desk.export);
  const states = useMemo(() => (handles ? surface(handles, record, epoch, caps.person.entitlements, canExport) : []), [handles, record, epoch, caps.person.entitlements, canExport]);
  const open = states.find((s) => s.handle.id === openId) ?? null;

  return (
    <section className="results">
      <header className="ask-head">
        <div>
          <h1>Results</h1>
          <p className="meta">What runs left. A handle is paged, never run again.</p>
        </div>
        <div className="row">
          <label>
            <input type="checkbox" checked={withdrawn} onChange={(e) => setWithdrawn(e.target.checked)} /> withdrawn too
          </label>
          <button type="button" onClick={refresh}>Refresh</button>
        </div>
      </header>
      {why && <p className="warn">{why}</p>}

      {live.length > 0 && (
        <div className="panel running">
          <h2>Running</h2>
          <ul>
            {live.map((r) => <RunningRow key={r.job} r={r} now={now} />)}
          </ul>
        </div>
      )}

      {handles === null ? (
        <p>Reading the handles</p>
      ) : states.length === 0 ? (
        <p>No result yet. Run a question on the Ask page; its handle appears here.</p>
      ) : (
        <div className="scroll">
          <table className="handles">
            <thead>
              <tr><th>handle</th><th>name</th><th>grain</th><th className="num">rows</th><th>state</th><th>by</th><th>at</th></tr>
            </thead>
            <tbody>
              {states.map((s) => (
                <tr key={s.handle.id} className={s.handle.id === openId ? "on" : ""}>
                  <td><button type="button" className="cell" onClick={() => setOpenId(s.handle.id)}>{s.handle.id}</button></td>
                  <td>{s.handle.name ?? <em>unnamed</em>}</td>
                  <td>{s.handle.grain}</td>
                  <td className="num">{s.handle.row_count}{s.truncated ? "+" : ""}</td>
                  <td><Badges s={s} /></td>
                  <td>{s.handle.principal}</td>
                  <td className="when">{s.handle.created_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && <Detail key={open.handle.id} s={open} caps={caps} onChanged={refresh} />}
    </section>
  );
}

function RunningRow({ r, now }: { r: Running; now: number }) {
  const seconds = age(r.since, now);
  const beat = r.heartbeat ? age(r.heartbeat, now) : null;
  const tail = seconds > 120;
  return (
    <li>
      <strong>job {r.job}</strong> {r.name ?? ""} {r.state}
      {r.document !== null && <> on document {r.document}</>}, {seconds} s
      {beat !== null && <>, last beat {beat} s ago</>}
      {r.progress !== null && r.progress !== undefined && <> <code>{JSON.stringify(r.progress)}</code></>}
      {tail && <span className="stale"> past the two minute tail: the job door keeps it, this page keeps polling</span>}
    </li>
  );
}

function Badges({ s }: { s: ResultState }) {
  return (
    <span className="badges">
      {s.rows === "withdrawn" && <span className="tag off">withdrawn</span>}
      {s.rows === "dropped" && <span className="tag off">rows dropped</span>}
      {s.stale && <span className="tag warn" title={s.stale.overlay}>stale</span>}
      {s.truncated && <span className="tag warn">{s.truncated.by === "you" ? "your limit" : "truncated"}</span>}
      {s.rows === "kept" && !s.stale && !s.truncated && <span className="tag">kept</span>}
    </span>
  );
}

/** One handle: its provenance, the named overlays, its rows by page, and the controls. */
function Detail({ s, caps, onChanged }: { s: ResultState; caps: Capabilities; onChanged: () => void }) {
  const h = s.handle;
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<{ columns: Column[]; rows: unknown[][]; pages: number } | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [purpose, setPurpose] = useState("");
  const [cohort, setCohort] = useState("");
  const [create, setCreate] = useState(false);
  const [reason, setReason] = useState("");
  const [promoted, setPromoted] = useState<number | null>(null);

  useEffect(() => {
    if (s.rows !== "kept") return;
    let alive = true;
    fetch(`/api/ask/handles/${h.id}/rows?page=${page}`, { headers: { "X-Nils-Desk": "1" } })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? `the door answered ${r.status}`);
        return j as { columns: Column[]; rows: unknown[][]; pages: number };
      })
      .then((r) => alive && setRows(r))
      .catch((e: Error) => alive && setWhy(e.message));
    return () => {
      alive = false;
    };
  }, [h.id, page, s.rows]);

  const exportHref = `/desk/export/${h.id}${purpose ? `?purpose=${encodeURIComponent(purpose)}` : ""}`;
  const promote = () => {
    results
      .promote(h.id, cohort.trim(), create, reason.trim())
      .then((j) => {
        setPromoted(j.job);
        onChanged();
      })
      .catch((e: Error) => setWhy(e.message));
  };

  return (
    <div className="panel detail">
      <h2>
        handle {h.id} {h.name && <>· {h.name}</>}
      </h2>
      <dl className="provenance">
        <dt>grain</dt><dd>{h.grain}</dd>
        <dt>rows</dt><dd>{h.row_count}{s.truncated ? ` (${s.truncated.by === "you" ? `your limit of ${s.truncated.limit}` : "our truncation: the engine's cap"})` : ""}</dd>
        <dt>content</dt><dd>{h.content_hash ?? "none: a capped answer is never hashed"}</dd>
        <dt>ran</dt><dd>{h.principal}{h.actor && h.actor.kind !== "absent" ? ` (${JSON.stringify(h.actor)})` : ""} at {h.created_at}</dd>
        <dt>epoch</dt><dd>{h.epoch}{h.pack_version ? `, pack ${h.pack_version}` : ""}</dd>
        <dt>disclosure</dt><dd>{h.disclosure}</dd>
        {s.document !== null && <><dt>document</dt><dd><a href={`#ask/${s.document}`}>{s.document}</a></dd></>}
        {h.last_read_at && <><dt>last read</dt><dd>{h.last_read_at}</dd></>}
      </dl>

      {s.stale && (
        <div className="overlay">
          <strong>Stale.</strong> {s.stale.overlay}. The rows below are what was produced then.
          {s.stale.moved_to !== null && <> <a href={`#ask/${s.stale.moved_to}`}>Open the document as it stands</a> and run again.</>}
        </div>
      )}
      {s.truncated && (
        <div className="overlay">
          <strong>{s.truncated.by === "you" ? "Your limit." : "Our truncation."}</strong>{" "}
          {s.truncated.by === "you"
            ? `The document's out step asked for at most ${s.truncated.limit} rows; the answer stops there.`
            : "The engine's cap cut the answer. A capped answer may be paged and read, never hashed, released, pinned or promoted."}
          {s.document !== null && <> The row count is the control: <a href={`#ask/${s.document}`}>edit the limit in the out step</a>.</>}
        </div>
      )}
      {s.rows === "withdrawn" && <div className="overlay"><strong>Withdrawn</strong> at {h.withdrawn_at}.</div>}
      {s.rows === "dropped" && <div className="overlay"><strong>Rows dropped</strong> by retention; the provenance stays.</div>}
      {why && <p className="warn">{why}</p>}

      {s.rows === "kept" && (
        <div>
          {rows ? (
            <div className="scroll">
              <table className="preview">
                <thead><tr>{rows.columns.map((c) => <th key={columnName(c)}>{columnName(c)}</th>)}</tr></thead>
                <tbody>
                  {rows.rows.map((r, i) => (
                    <tr key={i}>{r.map((v, j) => <td key={j} className={typeof v === "number" ? "num" : ""}>{v === null ? "" : String(v)}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>Reading page {page + 1}</p>
          )}
          {rows && rows.pages > 1 && (
            <div className="row">
              <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
              <span>page {page + 1} of {rows.pages}</span>
              <button type="button" disabled={page + 1 >= rows.pages} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          )}
        </div>
      )}

      <div className="controls">
        <div className="control">
          <h3>Export</h3>
          <label>
            purpose <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="written on every page's read audit" size={36} />
          </label>
          {s.export.enabled ? (
            <a className="button" href={exportHref} download>CSV</a>
          ) : (
            <button type="button" disabled title={s.export.reason ?? ""}>CSV</button>
          )}
          {!s.export.enabled && <p className="reason">{s.export.reason}</p>}
        </div>
        <div className="control">
          <h3>Release</h3>
          <button type="button" disabled={!s.release.enabled} title={s.release.reason ?? ""} onClick={() => { location.hash = `#release/releases/${h.id}`; }}>
            Release
          </button>
          <p className="reason">{s.release.enabled ? "opens the release form on the Release page" : s.release.reason}</p>
        </div>
        <div className="control">
          <h3>Promote</h3>
          {s.promote.enabled ? (
            <div className="row">
              <input value={cohort} onChange={(e) => setCohort(e.target.value)} placeholder="cohort" size={16} />
              <label><input type="checkbox" checked={create} onChange={(e) => setCreate(e.target.checked)} /> create it</label>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="reason" size={24} />
              <button type="button" disabled={!cohort.trim()} onClick={promote}>Promote</button>
            </div>
          ) : (
            <button type="button" disabled title={s.promote.reason ?? ""}>Promote</button>
          )}
          <p className="reason">{s.promote.enabled ? (promoted !== null ? `queued as job ${promoted}` : "a job, into a cohort") : s.promote.reason}</p>
        </div>
      </div>
      {caps.person.entitlements.length === 0 && null}
    </div>
  );
}
