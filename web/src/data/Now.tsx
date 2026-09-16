// SPDX-License-Identifier: AGPL-3.0-only
// The Now section of the Data page (record 26, D1): one card per open job,
// fed by the engine's event stream through the desk's proxy, or read every
// few seconds where the stream refuses or the engine has none; a chain queued
// after a job as one dashed card; a failed job with its error and one next
// move. Cancel keeps its button and says why when a person lacks the grant.

import { useCallback, useEffect, useRef, useState } from "react";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";
import { href } from "../routes";
import { Icon } from "../ui/Icon";
import { jobs as jobsDoor, type ChainedJob } from "./datasets";
import { isOpen, jobCards, liveJobs, nowWords, type JobCard, type Live } from "./now";

export interface LiveJobs {
  /** The open jobs, null until the first read. */
  open: ChainedJob[] | null;
  /** The failed jobs read from the door, the dismissed ones left out. */
  failed: ChainedJob[];
  live: Live;
  dismiss: (id: number) => void;
  /** Read the jobs again now: after one was queued or cancelled here. */
  refresh: () => void;
}

/** The open jobs, live, and the failed ones read when a job ends. */
export function useLiveJobs(caps: Capabilities): LiveJobs {
  const [open, setOpen] = useState<ChainedJob[] | null>(null);
  const [failed, setFailed] = useState<ChainedJob[]>([]);
  const [live, setLive] = useState<Live>({ kind: "still" });
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [asked, setAsked] = useState(0);
  const openIds = useRef<string>("");
  const reads = served(caps, "GET /api/jobs");
  const streams = served(caps, "GET /api/events");

  const readFailed = useCallback(() => {
    if (!reads) return;
    jobsDoor
      .recent(50)
      .then((r) => setFailed(r.jobs.filter((j) => j.state === "failed")))
      .catch(() => undefined);
  }, [reads]);

  useEffect(() => {
    if (!reads) return;
    readFailed();
    const stop = liveJobs({
      served: streams,
      poll: () => jobsDoor.open(),
      onLive: setLive,
      onJobs: (jobs) => {
        const now = jobs
          .filter(isOpen)
          .map((j) => j.id)
          .sort((a, b) => a - b)
          .join(",");
        // a job that left the open list may have failed: the failed ones are read again
        if (openIds.current !== "" && openIds.current !== now) readFailed();
        openIds.current = now;
        setOpen(jobs);
      },
    });
    return stop;
  }, [reads, streams, readFailed, asked]);

  return {
    open,
    failed: failed.filter((j) => !dismissed.has(j.id)),
    live,
    dismiss: (id) => setDismissed((d) => new Set(d).add(id)),
    refresh: () => setAsked((a) => a + 1),
  };
}

export function NowSection({ caps, jobs, onSaid }: { caps: Capabilities; jobs: LiveJobs; onSaid: (words: string) => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!served(caps, "GET /api/jobs")) return null;
  const cards = jobCards(jobs.open ?? [], jobs.failed, caps, now);
  const count = cards.filter((c) => c.kind !== "failed").length;

  const cancel = (c: JobCard) => {
    jobsDoor
      .cancel(c.id)
      .then(() => {
        onSaid(c.kind === "running" ? `Job ${c.id} stops at its next heartbeat; what is written stays written.` : `Job ${c.id} is dropped from the queue.`);
        jobs.refresh();
      })
      .catch((e: Error) => onSaid(e.message));
  };
  const again = (c: JobCard) => {
    const next = c.failed?.next;
    if (!next) return;
    jobsDoor
      .enqueue(next.command, next.name ?? undefined)
      .then((j) => {
        jobs.dismiss(c.id);
        onSaid(`Queued again as job ${j.job}.`);
        jobs.refresh();
      })
      .catch((e: Error) => onSaid(e.message));
  };

  return (
    <section className="stack roomy" aria-label="the jobs now">
      <div className="section-head rule-top">
        <h2>Now</h2>
        <span className="meta">{nowWords(jobs.live, count)}</span>
        {may(caps, "pipelines:see") && (
          <a className="button quiet small" href={href("pipelines")}>
            All jobs on Pipelines
          </a>
        )}
      </div>
      {cards.length === 0 && <p className="meta">Nothing runs now. Bring in what is new to start a batch.</p>}
      {cards.length > 0 && (
        <div className="jobs-now">
          {cards.map((c) => (
            <div key={c.key} className={`job${c.kind === "chain" || c.kind === "queued" ? " queued" : c.kind === "failed" ? " failed" : ""}`}>
              <span className={c.tone === "neutral" ? "sq" : `sq ${c.tone}`}>
                <Icon name={c.icon} />
              </span>
              <div className="what">
                <b>{c.what}</b>
                <span className="meta">{c.line}</span>
              </div>
              <div className="acts">
                {c.cancel && c.cancel.refusal === null && (
                  <button type="button" className={c.kind === "running" ? "button secondary small" : "button quiet small"} onClick={() => cancel(c)}>
                    {c.cancel.label}
                  </button>
                )}
                {c.cancel && c.cancel.refusal !== null && (
                  <button type="button" className="button quiet small" disabled title={c.cancel.refusal}>
                    {c.cancel.label}
                  </button>
                )}
                {c.failed?.next && (
                  <button type="button" className="button secondary small" onClick={() => again(c)}>
                    {c.failed.next.label}
                  </button>
                )}
                {c.failed && (
                  <button type="button" className="button quiet small" onClick={() => jobs.dismiss(c.id)}>
                    Dismiss
                  </button>
                )}
              </div>
              {c.progress && (
                <div className="how">
                  {c.progress.fraction !== null && (
                    <span className="local-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(c.progress.fraction * 100)}>
                      <i style={{ width: `${Math.round(c.progress.fraction * 100)}%` }} />
                    </span>
                  )}
                  <span className="meta num">{c.progress.words}</span>
                </div>
              )}
              {c.cancel?.refusal && <div className="how meta">{c.cancel.refusal}</div>}
              {c.failed && (
                <div className="how">
                  <span className="warn">{c.failed.error}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="now-line">
        <span>
          <Icon name="pulse" />
          {jobs.live.kind === "stream" ? "Updated every second while a job runs" : jobs.live.kind === "polling" ? "Read every few seconds while this page is open" : "Waiting for the first read"}
        </span>
        <span>
          <Icon name="clock" />A cancel stops at the next heartbeat; what is written stays written
        </span>
      </div>
    </section>
  );
}
