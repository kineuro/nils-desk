// SPDX-License-Identifier: AGPL-3.0-only
// Logs (record 55 H2, round 5; spec 13.1, "Jobs with their logs"): the jobs
// the engine lists, newest first, and the log of the one opened, its end
// first, followed while the job runs, with Earlier to read back. A job that
// ran a pipeline lists its run's units under its log, each opening that
// unit's own log in the same place. What a log holds is the engine's to
// refuse: a job's log needs the work of the page its verb belongs to, and a
// unit holding a stack of a sealed sample is not shown to whoever may not
// read one.

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChainedJob } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { whenWords } from "../data/sources";
import { door as served } from "../deployment";
import { href } from "../routes";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import { ops } from "./client";
import { RUN_LOG, UNIT_LOG, earlierFrom, joined, jobLogHref, logs, prepended, refusedWords, runOf, type LogPiece } from "./logs";
import { runs, type UnitRun } from "./runs";
import { isWorker, namedWords } from "./verbs";

/** Which log is open: the job's own, or one unit's of its run. */
type Open = { kind: "job" } | { kind: "unit"; run: number; unit: string } | { kind: "run"; run: number };

const FOLLOW_MS = 3000;

export function LogsPage({ caps, job }: { caps: Capabilities; job: number | null }) {
  const [list, setList] = useState<ChainedJob[] | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [since] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    const read = () =>
      ops
        .jobs(true, 100)
        .then((r) => {
          if (!alive) return;
          setList(r.jobs.filter((j) => !isWorker(j)));
          setWhy(null);
        })
        .catch((e: Error) => alive && setWhy(e.message));
    void read();
    const t = setInterval(read, 15_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const opened = job === null ? null : (list?.find((j) => j.id === job) ?? null);
  return (
    <section className="pipelines logs">
      <div className="data-head">
        <div className="grow">
          <span className="eyebrow">Pipelines</span>
          <h1>Logs</h1>
          <p className="lede">What each job printed, and each unit of a run.</p>
        </div>
      </div>
      {why && <p className="warn">The jobs could not be read: {why}</p>}
      <div className="logs-split">
        <nav className="logs-list" aria-label="jobs">
          {list === null && !why && <Wait phase="reading the jobs" since={since} size="panel" />}
          {list !== null && list.length === 0 && <p className="meta">No job yet. A job's log appears here once it runs.</p>}
          {(list ?? []).map((j) => (
            <a key={j.id} className={j.id === job ? "logs-job on" : "logs-job"} href={jobLogHref(j.id)} aria-current={j.id === job ? "page" : undefined}>
              <span className={`state-dot ${j.state}`} aria-hidden="true" />
              <span className="grow logs-job-name">{namedWords(j)}</span>
              <span className="meta logs-job-when">
                {j.state === "running" || j.state === "queued" ? j.state : whenWords(j.finished_at ?? j.started_at)}
              </span>
              <span className="meta num logs-job-id">{j.id}</span>
            </a>
          ))}
        </nav>
        <div className="logs-open">
          {job === null && <p className="meta">Choose a job to read its log.</p>}
          {job !== null && <JobLog key={job} caps={caps} id={job} row={opened} />}
        </div>
      </div>
    </section>
  );
}

/** One job's log, and its run's units where it ran a pipeline. */
function JobLog({ caps, id, row }: { caps: Capabilities; id: number; row: ChainedJob | null }) {
  const [open, setOpen] = useState<Open>({ kind: "job" });
  const [units, setUnits] = useState<UnitRun[] | null>(null);
  const [apart, setApart] = useState<boolean | null>(null);
  const run = row ? runOf(row) : null;
  const unitLogs = run !== null && served(caps, UNIT_LOG);

  useEffect(() => {
    if (!unitLogs || run === null) return;
    let alive = true;
    runs
      .get(run)
      .then((r) => {
        if (!alive) return;
        setUnits((r.units_run ?? []).filter((u) => typeof u.unit === "string"));
        setApart(r.units !== "together");
      })
      .catch(() => alive && setUnits([]));
    return () => {
      alive = false;
    };
  }, [run, unitLogs]);

  const title = row ? namedWords(row) : `Job ${id}`;
  const reader = useCallback(
    (from?: number) => {
      if (open.kind === "unit") return logs.unit(open.run, open.unit, from);
      if (open.kind === "run") return logs.run(open.run, from);
      return logs.job(id, from);
    },
    [open, id],
  );
  const which = open.kind === "job" ? `job ${id}` : open.kind === "run" ? `run ${open.run}` : `unit ${open.unit}`;
  return (
    <div className="stack">
      <div className="logs-head">
        <h2 className="grow">{title}</h2>
        <span className="meta">
          job {id}
          {row ? ` · ${row.state}` : ""}
          {run !== null ? (
            <>
              {" · "}
              <a href={href("pipelines", "runs", String(run))}>run {run}</a>
            </>
          ) : null}
        </span>
      </div>
      {units !== null && units.length > 0 && (
        <div className="chips logs-units" role="group" aria-label="whose log">
          <button type="button" className={open.kind === "job" ? "opt on" : "opt"} aria-pressed={open.kind === "job"} onClick={() => setOpen({ kind: "job" })}>
            The job
          </button>
          {apart === false && run !== null && served(caps, RUN_LOG) ? (
            <button type="button" className={open.kind === "run" ? "opt on" : "opt"} aria-pressed={open.kind === "run"} onClick={() => setOpen({ kind: "run", run })}>
              The run's units, together
            </button>
          ) : (
            units.map((u) => {
              const on = open.kind === "unit" && open.unit === u.unit;
              return (
                <button key={u.unit} type="button" className={`opt unit-${u.state}${on ? " on" : ""}`} aria-pressed={on} title={u.error ?? u.state} onClick={() => run !== null && u.unit && setOpen({ kind: "unit", run, unit: u.unit })}>
                  {u.unit}
                </button>
              );
            })
          )}
        </div>
      )}
      <LogText key={which} read={reader} which={which} />
    </div>
  );
}

/** A log's text, its end first; followed while it grows, with Earlier to read back. */
export function LogText({ read, which }: { read: (from?: number) => Promise<LogPiece>; which: string }) {
  const [piece, setPiece] = useState<LogPiece | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [since] = useState(() => Date.now());
  const box = useRef<HTMLPreElement>(null);
  // whether the person is at the end, where a followed log keeps them
  const atEnd = useRef(true);

  useEffect(() => {
    let alive = true;
    let t: ReturnType<typeof setTimeout> | undefined;
    let last: LogPiece | null = null;
    const step = () =>
      read(last === null ? undefined : last.to)
        .then((p) => {
          if (!alive) return;
          last = joined(last, p);
          setPiece(last);
          setWhy(null);
          if (!p.over) t = setTimeout(step, FOLLOW_MS);
        })
        .catch((e: unknown) => alive && setWhy(refusedWords(e)));
    void step();
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [read]);

  useEffect(() => {
    const b = box.current;
    if (b && atEnd.current) b.scrollTop = b.scrollHeight;
  }, [piece?.to]);

  const earlier = () => {
    if (!piece) return;
    setReading(true);
    read(earlierFrom(piece))
      .then((p) => {
        atEnd.current = false;
        setPiece((now) => (now ? prepended(p, now) : p));
      })
      .catch((e: unknown) => setWhy(refusedWords(e)))
      .finally(() => setReading(false));
  };

  if (why) return <p className="warn">{why}</p>;
  if (!piece) return <Wait phase={`reading the log of ${which}`} since={since} size="panel" />;
  return (
    <div className="stack log-view">
      <div className="row log-bar">
        {piece.earlier ? (
          <button type="button" className="button secondary small" disabled={reading} onClick={earlier}>
            <Icon name="chevron-up" />
            Earlier
          </button>
        ) : (
          <span className="meta">From its start</span>
        )}
        <span className="meta grow">
          {piece.shared ? "The run's units ran together and wrote one log. " : ""}
          {sizeOf(piece.size)}
          {piece.over ? "" : ", still running"}
        </span>
      </div>
      {piece.text ? (
        <pre
          ref={box}
          className="log-text"
          tabIndex={0}
          aria-label={`Log of ${which}`}
          onScroll={(e) => {
            const b = e.currentTarget;
            atEnd.current = b.scrollHeight - b.scrollTop - b.clientHeight < 24;
          }}
        >
          {piece.text}
        </pre>
      ) : (
        <p className="meta">{piece.over ? "It printed nothing." : "Nothing printed yet."}</p>
      )}
    </div>
  );
}

function sizeOf(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
