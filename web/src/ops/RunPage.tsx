// SPDX-License-Identifier: AGPL-3.0-only
// Pipelines / a run (record 49 A7): its units by state (running, waiting,
// done, failed, kept when it was taken up again), cancel and resume, its
// table of measures as the ask reads it (one row per scan at detail quasi;
// below it the totals over groups, which the engine withholds under 5
// scans), its checks and breaches with the way to their review items, and
// the files it made. Read again every few seconds while it runs.

import { useCallback, useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { whenWords } from "../data/sources";
import { engineWords } from "../models/ModelsPage";
import { href, narrow } from "../routes";
import { Icon } from "../ui/Icon";
import { Says, Values } from "../ui/Says";
import { Wait } from "../ui/Wait";
import { catalog, type Pipeline } from "./catalog";
import { ops } from "./client";
import {
  allPassed,
  breachesByCheck,
  failuresByReason,
  heldWords,
  cellWords,
  checksOf,
  groupBy,
  headerWords,
  shownColumns,
  measureColumns,
  resumable,
  resumeCommand,
  runActs,
  runs,
  tableAsk,
  unitCounts,
  unitTotals,
  unitTone,
  type Derivative,
  type RunDetail,
  type UnitTone,
} from "./runs";

const n = (v: number) => v.toLocaleString("en-US");

export type Table = { kind: "off"; why: string | null } | { kind: "loading" } | { kind: "failed"; why: string } | { kind: "ready"; perScan: boolean; columns: string[]; rows: unknown[][]; truncated: boolean };

type Load = { kind: "loading"; since: number } | { kind: "failed"; why: string } | { kind: "ready"; run: RunDetail; pipeline: Pipeline | null; resumedAt: string | null; jobAlive: boolean };

const OPEN = new Set(["running", "queued"]);

export function RunPage({ caps, id }: { caps: Capabilities; id: number }) {
  const acts = runActs(caps);
  const [load, setLoad] = useState<Load>(() => ({ kind: "loading", since: Date.now() }));
  const [table, setTable] = useState<Table>({ kind: "off", why: null });
  const [files, setFiles] = useState<Derivative[] | null>(null);
  const [by, setBy] = useState("subject.sex");
  const [said, setSaid] = useState<string | null>(null);

  const read = useCallback(() => {
    runs
      .get(id)
      .then(async (run) => {
        const [pipes, job] = await Promise.all([catalog.list().catch(() => null), run.job_id !== null ? runs.job(run.job_id).catch(() => null) : Promise.resolve(null)]);
        const pipeline = pipes?.pipelines.find((p) => p.id === run.pipeline_id) ?? null;
        const alive = job !== null && (job.state === "running" || job.state === "queued" || job.state === "cancelling");
        setLoad({ kind: "ready", run, pipeline, resumedAt: (run.resumes ?? 0) > 0 && job ? job.started_at : null, jobAlive: alive });
      })
      .catch((e: unknown) => setLoad((was) => (was.kind === "ready" ? was : { kind: "failed", why: engineWords(e) })));
  }, [id]);

  useEffect(() => {
    read();
  }, [read]);
  const status = load.kind === "ready" ? load.run.status : null;
  useEffect(() => {
    if (status === null || !OPEN.has(status)) return;
    const t = setInterval(read, 4000);
    return () => clearInterval(t);
  }, [status, read]);

  const run = load.kind === "ready" ? load.run : null;
  const pipeline = load.kind === "ready" ? load.pipeline : null;
  // the table is read once the run has loaded measures, and again when it ends or the grouping changes
  const measures = run ? Number(((run.summary?.numbers ?? {}) as Record<string, unknown>).measures ?? 0) : 0;
  useEffect(() => {
    if (!run || !pipeline) return;
    const cols = measureColumns(pipeline as Pipeline & { descriptor?: Record<string, unknown> | null });
    if (cols.length === 0 || measures === 0) return setTable({ kind: "off", why: null });
    if (!acts.table) return setTable({ kind: "off", why: "Reading a run's numbers needs Query: Work." });
    setTable({ kind: "loading" });
    runs
      .ask(tableAsk({ pipeline: pipeline.name, level: pipeline.level, run: run.id, columns: cols, perScan: acts.perScan, by }))
      .then((a) => setTable({ kind: "ready", perScan: acts.perScan, columns: a.columns, rows: a.rows, truncated: a.truncated }))
      .catch((e: unknown) => setTable({ kind: "failed", why: engineWords(e) }));
  }, [run?.id, run?.status, pipeline?.id, measures, by, acts.table, acts.perScan]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!run || !acts.files || OPEN.has(run.status)) return;
    runs.derivatives(run.id).then((r) => setFiles(r.derivatives), () => setFiles(null));
  }, [run?.id, run?.status, acts.files]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = (words: string, work: Promise<unknown>) => {
    setSaid(null);
    work.then(
      () => {
        setSaid(words);
        read();
      },
      (e: unknown) => setSaid(engineWords(e)),
    );
  };

  if (load.kind === "loading") return <Wait phase="reading the run" since={load.since} size="panel" />;
  if (load.kind === "failed") return <p className="warn">Run {id} could not be read: {load.why}</p>;
  const r = load.run;
  return (
    <RunView
      caps={caps}
      run={r}
      pipeline={load.pipeline}
      resumedAt={load.resumedAt}
      jobAlive={load.jobAlive}
      table={table}
      files={files}
      by={by}
      onBy={setBy}
      said={said}
      onCancel={r.job_id !== null && acts.cancel && load.jobAlive ? () => act(`Run ${r.id} stops at its next heartbeat; the units it finished are kept.`, ops.cancel(r.job_id!)) : null}
      onResume={acts.queue && resumable(r, load.jobAlive) ? () => act(`Run ${r.id} is queued to go on where it stopped.`, ops.enqueue(resumeCommand(r))) : null}
    />
  );
}

const TONE_WORDS: Record<UnitTone, string> = { running: "running", waiting: "waiting", done: "done", failed: "failed", kept: "kept on resume" };
const TONE_TAG: Record<UnitTone, string> = { running: "tag brand", waiting: "tag", done: "tag ok", failed: "tag caution", kept: "tag ok" };

/** The run as the page draws it from what it read. */
export function RunView(props: {
  caps: Capabilities;
  run: RunDetail;
  pipeline: Pipeline | null;
  resumedAt: string | null;
  jobAlive: boolean;
  table: Table;
  files: Derivative[] | null;
  by: string;
  onBy: (field: string) => void;
  said: string | null;
  onCancel: (() => void) | null;
  onResume: (() => void) | null;
}) {
  const { caps, run: r, pipeline, resumedAt, table, files, by, onBy, said, onCancel, onResume } = props;
  const acts = runActs(caps);
  const units = r.units_run ?? [];
  const counts = unitCounts(units, resumedAt);
  const s = (r.summary ?? {}) as Record<string, unknown>;
  const total = Number(((s.units ?? {}) as Record<string, unknown>).total ?? units.length);
  const checks = checksOf(r);
  const byCheck = breachesByCheck(r);
  const failures = failuresByReason(r);
  const running = OPEN.has(r.status);
  // below detail quasi the engine lists no unit: the totals are its own, a withheld one fewer than five
  const totals = checks.totals ? unitTotals(r) : null;
  const unitCells = totals
    ? [
        { k: "units", v: total > 0 ? `${n(totals.over)} of ${n(total)} over` : "none yet" },
        ...(totals.failed !== 0 ? [{ k: "failed", v: heldWords(totals.failed) }] : []),
      ]
    : [
        { k: "units", v: total > 0 ? `${n(counts.done + counts.kept)} of ${n(total)} done` : "none yet" },
        ...(counts.failed > 0 ? [{ k: "failed", v: n(counts.failed) }] : []),
        ...(counts.kept > 0 ? [{ k: "kept on resume", v: n(counts.kept) }] : []),
      ];
  const cells = [
    { k: "status", v: r.status },
    ...unitCells,
    { k: "over", v: r.selection ?? (r.handle_id ? `handle ${r.handle_id}` : "") },
    { k: "on", v: [r.runtime, r.device].filter(Boolean).join(", ") || "not yet" },
    { k: running ? "since" : "ran", v: whenWords(r.started_at ?? "") },
  ];
  return (
    <section className="stack roomy run-page">
      <div className="row actions">
        <span className={r.status === "done" ? "tag ok" : r.status === "failed" || r.status === "partial" ? "tag caution" : running ? "tag brand" : "tag"}>{r.status}</span>
        <b>{r.pipeline}</b>
        <span className="meta">run {r.id}{r.job_id !== null ? ` · job ${r.job_id}` : ""}{(r.resumes ?? 0) > 0 ? ` · taken up ${n(r.resumes!)} ${r.resumes === 1 ? "time" : "times"}` : ""}</span>
        <span className="grow" />
        {onCancel && (
          <button type="button" className="button secondary small" onClick={onCancel}>
            Cancel
          </button>
        )}
        {onResume && (
          <button type="button" className="button small" onClick={onResume}>
            Resume
          </button>
        )}
      </div>
      <Values cells={cells} />
      {said && <p className="meta">{said}</p>}
      {r.error && <p className="warn">{r.error}</p>}

      <div className="section-head rule-top">
        <h2>Table</h2>
        {table.kind === "ready" && <span className="meta">{table.perScan ? `${n(table.rows.length)} ${table.rows.length === 1 ? "scan" : "scans"}` : "totals by group"}</span>}
      </div>
      <TableView table={table} by={by} onBy={onBy} choices={groupBy(pipeline?.level)} />

      <div className="section-head rule-top">
        <h2>Checks</h2>
        <span className="meta">
          {checks.declared === 0 ? "none declared" : `${n(checks.declared)} declared · ${heldWords(checks.breaches)} ${checks.breaches === 1 ? "breach" : "breaches"}${checks.unchecked > 0 ? ` · ${n(checks.unchecked)} unchecked` : ""}`}
        </span>
      </div>
      {allPassed(r) && !running && <p className="meta">Every unit that finished passed its checks.</p>}
      {checks.totals && <p className="meta">Counted by check at your detail; a count under five scans reads fewer than five.</p>}
      {byCheck.length > 0 && (
        <div className="table-wrap">
          <table className="thin">
            <thead>
              <tr>
                <th>Check</th>
                <th className="num">Units</th>
                {acts.perScan && !checks.totals && <th>Which</th>}
              </tr>
            </thead>
            <tbody>
              {byCheck.map((c) => (
                <tr key={c.check}>
                  <td className="path">{c.check}</td>
                  <td className="num">{heldWords(c.units)}</td>
                  {acts.perScan && !checks.totals && (
                    <td className="meta">
                      {checks.units
                        .filter((u) => u.breaches.some((b) => (b.check || b.metric) === c.check))
                        .slice(0, 5)
                        .map((u) => `${u.unit ?? "a unit"} (${u.breaches.find((b) => (b.check || b.metric) === c.check)?.value ?? "?"})`)
                        .join(", ")}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {checks.items > 0 && acts.review && (
        <p className="meta">
          <a href={narrow(href("review"), { run: r.id })}>
            {n(checks.items)} review {checks.items === 1 ? "item" : "items"}
          </a>{" "}
          for the failures and breaches of this run
        </p>
      )}

      <div className="section-head rule-top">
        <h2>Units</h2>
        <span className="meta">
          {totals
            ? `${n(totals.over)} of ${n(total)} over`
            : (Object.keys(TONE_WORDS) as UnitTone[])
                .filter((t) => counts[t] > 0)
                .map((t) => `${n(counts[t])} ${TONE_WORDS[t]}`)
                .join(" · ") || "none yet"}
        </span>
      </div>
      {totals && failures.length > 0 && (
        <div className="table-wrap">
          <table className="thin">
            <thead>
              <tr>
                <th>Failed, by reason</th>
                <th className="num">Units</th>
              </tr>
            </thead>
            <tbody>
              {failures.map((f) => (
                <tr key={f.reason}>
                  <td>{f.reason}</td>
                  <td className="num">{heldWords(f.units)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {totals && <p className="meta">At your detail a run names no unit; its units are counted by state and reason.</p>}
      {units.length > 0 && (
        <div className="table-wrap">
          <table className="thin">
            <thead>
              <tr>
                <th>Unit</th>
                <th>State</th>
                <th className="num">Tries</th>
                <th>On</th>
                <th className="num">Ended</th>
              </tr>
            </thead>
            <tbody>
              {units.slice(0, 200).map((u, i) => {
                const t = unitTone(u, resumedAt);
                return (
                  <tr key={u.unit ?? `u${i}`}>
                    <td className="path">{u.unit ?? `unit ${i + 1}`}</td>
                    <td>
                      <span className={TONE_TAG[t]}>{TONE_WORDS[t]}</span>
                      {u.exit_code !== null && u.exit_code !== undefined && u.exit_code !== 0 ? <span className="meta"> · exit {u.exit_code}</span> : null}
                    </td>
                    <td className="num">{u.attempts ?? ""}</td>
                    <td className="meta">{u.device ?? ""}</td>
                    <td className="num">{u.finished_at ? whenWords(u.finished_at) : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {units.length > 200 && <p className="meta">The first 200 of {n(units.length)} units.</p>}

      {files !== null && (
        <>
          <div className="section-head rule-top">
            <h2>Files</h2>
            <span className="meta">{n(files.length)} made</span>
          </div>
          {files.length > 0 && <FilesView files={files} />}
        </>
      )}
      {pipeline === null && <p className="meta">The catalog no longer lists this run&apos;s pipeline, so its table is not read.</p>}
      <Says head="Where the numbers come from">
        Each value is the unit&apos;s newest run of this pipeline&apos;s version; a row here is one this run measured and the ask still reads. Below detail quasi a measure is shown only as a total over a group of 5 scans or more; a smaller group&apos;s totals are withheld.
      </Says>
    </section>
  );
}

function TableView({ table, by, onBy, choices }: { table: Table; by: string; onBy: (field: string) => void; choices: { field: string; label: string }[] }) {
  if (table.kind === "off") return <p className="meta">{table.why ?? "This run loaded no measures."}</p>;
  if (table.kind === "loading") return <p className="meta">Reading the table…</p>;
  if (table.kind === "failed") return <p className="warn">The table could not be read: {table.why}</p>;
  const cols = shownColumns(table.columns);
  return (
    <>
      {!table.perScan && (
        <div className="field-row">
          <span className="meta">Totals by</span>
          <div className="chips" role="group" aria-label="group the totals by">
            {choices.map((g) => (
              <button key={g.field} type="button" className={by === g.field ? "tag brand" : "tag"} aria-pressed={by === g.field} onClick={() => onBy(g.field)}>
                {g.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {!table.perScan && (
        <div className="note gated">
          <Icon name="lock" />
          <div className="note-body">
            <p className="note-detail">At your detail a scan&apos;s measure is not shown. A group&apos;s totals show when it holds 5 scans or more (k = 5); a smaller group reads withheld.</p>
          </div>
        </div>
      )}
      {table.rows.length === 0 ? (
        <p className="meta">No row: the ask reads a newer run for these units, or none was measured.</p>
      ) : (
        <div className="table-wrap">
          <table className="thin">
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c.name} className={c.name === "id" ? "num" : undefined}>
                    {headerWords(c.name)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, i) => (
                <tr key={i}>
                  {cols.map((c) => (
                    <td key={c.name} className={typeof row[c.at] === "number" || row[c.at] === null ? "num" : undefined}>
                      {cellWords(row[c.at])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {table.truncated && <p className="meta">The first rows only; the whole table is answered in Query.</p>}
    </>
  );
}

function FilesView({ files }: { files: Derivative[] }) {
  const byKind = new Map<string, number>();
  for (const f of files) byKind.set(f.kind, (byKind.get(f.kind) ?? 0) + 1);
  return (
    <>
      <p className="meta">{[...byKind.entries()].map(([k, c]) => `${n(c)} ${k}`).join(" · ")}</p>
      <div className="table-wrap">
        <table className="thin">
          <thead>
            <tr>
              <th className="num">File</th>
              <th>Kind</th>
              <th>Of</th>
              <th className="num">Bytes</th>
              <th>Digest</th>
            </tr>
          </thead>
          <tbody>
            {files.slice(0, 50).map((f) => (
              <tr key={f.id}>
                <td className="num">{f.id}</td>
                <td>{f.kind}</td>
                <td className="meta">{f.stack_id ? `stack ${f.stack_id}` : (f.scope ?? "")}</td>
                <td className="num">{n(f.bytes)}</td>
                <td className="path">{f.sha256.slice(0, 12)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {files.length > 50 && <p className="meta">The first 50 of {n(files.length)} files.</p>}
    </>
  );
}
