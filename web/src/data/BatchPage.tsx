// SPDX-License-Identifier: AGPL-3.0-only
// A batch's page (record 27, R5b): the batch is the thread. The five stages
// are one strip across the top, each with its count and a word of state.
// Below: what it added by base, the refused files by reason with what to do
// about each, and the chain of jobs with what each stage did. At the side its
// timeline, the dataset's pseudonymisation as values, and where else its
// files show. Every count and every link stands; the commentary is gone.

import { useCallback, useEffect, useState } from "react";
import type { JobRow } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";
import type { Event } from "../objects/client";
import { data, ops, type ReviewItem } from "../ops/client";
import { href, narrow } from "../routes";
import { messageOf } from "../settings/common";
import { Icon } from "../ui/Icon";
import { Values } from "../ui/Says";
import { Wait } from "../ui/Wait";
import { addedByBase, batches, datasetOf, eventMark, jobWords, ledeWords, tookWords, verbWords, type BatchDoc } from "./batch";
import { chainJobs } from "./datasets";
import { arrivesWords, leavingWords, subjectsWords, type Dataset } from "./pseudonyms";
import { sources, whenWords, type Source } from "./sources";
import { byReason, jobsOfBatch, reasonWords, remedyWords, stages, stateWords, type Stage } from "./stages";

type Load = { kind: "loading"; since: number } | { kind: "failed"; why: string } | { kind: "ready"; batch: BatchDoc };
type Timeline = { kind: "none" } | { kind: "loading" } | { kind: "ready"; events: Event[] } | { kind: "failed"; why: string };

const n = (v: number) => v.toLocaleString("en-US");

export function BatchPage({ caps, id }: { caps: Capabilities; id: number }) {
  const [load, setLoad] = useState<Load>(() => ({ kind: "loading", since: Date.now() }));
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [review, setReview] = useState<ReviewItem[]>([]);
  const [list, setList] = useState<Source[]>([]);
  const [refused, setRefused] = useState<Record<string, unknown>[] | null>(null);
  const [timeline, setTimeline] = useState<Timeline>({ kind: "none" });
  const [said, setSaid] = useState<string | null>(null);
  const works = may(caps, "data:work") && served(caps, "POST /api/jobs");
  const sorts = may(caps, "pipelines:work") && served(caps, "POST /api/jobs");

  const read = useCallback(() => {
    batches
      .get(id)
      .then((b) => setLoad({ kind: "ready", batch: b }))
      .catch((e: unknown) => setLoad((was) => (was.kind === "ready" ? was : { kind: "failed", why: messageOf(e) })));
    if (served(caps, "GET /api/jobs")) ops.jobs(true, 200).then((r) => setJobs(r.jobs), () => undefined);
    if (served(caps, "GET /api/sources")) sources.list().then((r) => setList(r.sources), () => undefined);
    if (served(caps, "GET /api/review") && may(caps, "review:see")) ops.review(undefined, undefined, 200).then((r) => setReview(r.items.filter((i) => ofBatch(i, id))), () => undefined);
    if (served(caps, "GET /api/quarantine")) data.quarantine(id, undefined, 500).then((r) => setRefused(r.files as Record<string, unknown>[]), () => setRefused(null));
    if (served(caps, "GET /api/timeline/{kind}/{id}")) {
      setTimeline((was) => (was.kind === "ready" ? was : { kind: "loading" }));
      batches
        .timeline(id)
        .then((r) => setTimeline({ kind: "ready", events: r.events }))
        .catch((e: unknown) => setTimeline({ kind: "failed", why: messageOf(e) }));
    }
  }, [id, caps]);

  useEffect(() => {
    setLoad({ kind: "loading", since: Date.now() });
    read();
  }, [read]);

  const batch = load.kind === "ready" ? load.batch : null;
  const strip = batch ? stages(batch, jobs, review) : [];
  // while a stage runs, the page reads again every ten seconds
  const running = batch !== null && (batch.state === "running" || strip.some((s) => s.mark === "now"));
  useEffect(() => {
    if (!running) return;
    const t = setInterval(read, 10_000);
    return () => clearInterval(t);
  }, [running, read]);

  const dataset = batch ? datasetOf(batch, list) : null;
  // the same batch among the dataset's digests names the jobs of its thread by
  // stage, which the jobs table takes beside the ones the batch row names
  const digest = dataset?.digests.recent.find((d) => d.id === id) ?? null;
  const mine = batch ? jobsOfBatch(batch, jobs, chainJobs(digest?.chain)).sort((a, b) => a.id - b.id) : [];
  const classified = batch?.stages?.classified ?? null;
  const toSort = classified ? Math.max(0, classified.of - classified.stacks) : (digest?.to_sort ?? 0);
  const refusedCount = batch?.stages?.walked.refused ?? batch?.quarantined ?? (refused?.length ?? 0);
  const reasons = refused ? byReason(refused) : [];
  const byBase = batch ? addedByBase(batch) : null;
  const chained = batch?.stages !== undefined && batch?.stages !== null;

  const readAgain = (retry: boolean) => {
    if (!dataset) return;
    setSaid(null);
    batches
      .readAgain(dataset, retry, chained && (dataset.trees?.originals ?? null) !== null)
      .then((j) => {
        setSaid(retry ? `The ${n(refusedCount)} refused files are read again as job ${j.job}.` : `A read of ${dataset.name} is queued as job ${j.job}.`);
        read();
      })
      .catch((e: unknown) => setSaid(messageOf(e)));
  };

  const sort = () => {
    setSaid(null);
    batches
      .sort(classified?.pack ?? null, chained)
      .then((j) => {
        setSaid(`Sorting is queued from job ${j.job}: fingerprint, then classify.`);
        read();
      })
      .catch((e: unknown) => setSaid(messageOf(e)));
  };

  if (load.kind === "loading") return <Wait phase="reading the batch" since={load.since} size="panel" />;
  if (load.kind === "failed" || batch === null) {
    return (
      <section className="state">
        <h1>Batch {id}</h1>
        <p>The batch could not be read: {load.kind === "failed" ? load.why : "nothing came back"}.</p>
        <p>
          <a href={href("data")}>Back to Data</a>
        </p>
      </section>
    );
  }

  return (
    <section className="bpage">
      <div className="main">
        <div className="trail">
          <Icon name="data" />
          <a href={href("data")}>Data</a>
          <span>/</span>
          <a href={href("data", "datasets")}>Datasets</a>
          {dataset && (
            <>
              <span>/</span>
              <a href={href("data", "datasets", dataset.name)}>{dataset.name}</a>
            </>
          )}
          <span>/</span>
          <span>{batch.name}</span>
        </div>
        <div className="data-head">
          <div className="grow">
            <h1>{batch.name}</h1>
            <p className="lede">{ledeWords(batch, dataset, whenWords(batch.started_at))}</p>
          </div>
          {works && dataset && (
            <button type="button" className="button secondary" onClick={() => readAgain(false)}>
              <Icon name="restart" />
              Read again
            </button>
          )}
          {sorts && toSort > 0 && (
            <button type="button" className="button" onClick={sort}>
              Sort {n(toSort)}
            </button>
          )}
        </div>
        {said && <p className="meta">{said}</p>}
        <StageStrip strip={strip} jobs={jobs} batch={batch} />
        <div className="pair">
          <section className="panel card">
            <div className="row card-head">
              <h2>What it added, by base</h2>
              <span className="meta">stacks</span>
            </div>
            {byBase && byBase.length > 0 ? (
              <div className="bybase">
                {byBase.map((r) => {
                  const max = Math.max(...byBase.map((x) => x.count), 1);
                  return <BaseBar key={r.base} label={r.base} count={r.count} width={(r.count / max) * 100} unsure={r.unsure} />;
                })}
              </div>
            ) : (
              <p className="meta">{classified && classified.of > 0 ? "This engine does not count what a batch added by base yet." : "Nothing sorted yet."}</p>
            )}
          </section>
          <section className="panel card">
            <div className="row card-head">
              <h2>Refused files</h2>
              <span className="meta">by reason</span>
            </div>
            {refusedCount === 0 && <p className="meta">Every file was read.</p>}
            {refusedCount > 0 && reasons.length > 0 && (
              <div className="reasons">
                {reasons.map((r) => (
                  <div key={r.reason} className="reason">
                    <span>
                      {reasonWords(r.reason)}
                      <span className="meta">{remedyWords(r.reason)}</span>
                    </span>
                    <b>{n(r.count)}</b>
                  </div>
                ))}
              </div>
            )}
            {refusedCount > 0 && reasons.length === 0 && <p className="meta">{n(refusedCount)} files refused{served(caps, "GET /api/quarantine") ? "" : "; this engine does not list them by reason"}.</p>}
            {refusedCount > 0 && (
              <div className="row">
                {works && dataset ? (
                  <button type="button" className="button secondary small" onClick={() => readAgain(true)}>
                    Read the {n(refusedCount)} again
                  </button>
                ) : (
                  <span className="meta">Reading them again needs work on the Data page.</span>
                )}
              </div>
            )}
          </section>
        </div>
        <section className="stack roomy">
          <div className="section-head rule-top">
            <h2>Jobs on this batch</h2>
            <span className="meta">what each stage did</span>
          </div>
          {mine.length === 0 && <p className="meta">{served(caps, "GET /api/jobs") ? "No job of this batch is listed." : "This engine does not list its jobs."}</p>}
          {mine.length > 0 && (
            <div className="table-wrap">
              <table className="thin">
                <thead>
                  <tr>
                    <th>Job</th>
                    <th>Step</th>
                    <th>By</th>
                    <th>When</th>
                    <th>Took</th>
                    <th>State</th>
                  </tr>
                </thead>
                <tbody>
                  {mine.map((j) => (
                    <tr key={j.id}>
                      <td className="num">{j.id}</td>
                      <td>
                        <span className="path">{verbWords(j)}</span>
                      </td>
                      <td>{typeof j.args?.principal === "string" ? j.args.principal : ""}</td>
                      <td className="num">{whenWords(j.started_at)}</td>
                      <td className="num">{tookWords(j)}</td>
                      <td>
                        <span className={`tag ${j.state === "done" ? "ok" : j.state === "failed" ? "blocked" : j.state === "running" ? "brand" : j.state === "cancelled" ? "caution" : ""}`}>{j.state}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
      <div className="aside">
        <section className="panel card">
          <div className="row card-head">
            <Icon name="clock" size="lg" />
            <h2>Timeline</h2>
          </div>
          {timeline.kind === "none" && <p className="meta">This engine keeps no timeline for a batch.</p>}
          {timeline.kind === "loading" && <p className="meta">Reading the timeline.</p>}
          {timeline.kind === "failed" && <p className="meta">No timeline for this batch: {timeline.why}</p>}
          {timeline.kind === "ready" && timeline.events.length === 0 && <p className="meta">Nothing on the timeline yet.</p>}
          {timeline.kind === "ready" && timeline.events.length > 0 && (
            <ul className="tl">
              {timeline.events.map((e, i) => (
                <li key={`${e.at}-${i}`} className={eventMark(e)}>
                  <span>
                    {e.summary}
                    <span className="meta">
                      {whenWords(e.at)}
                      {e.actor ? ` · ${e.actor}` : ""}
                      {e.produced ? ` · ${e.produced.kind} ${e.produced.id}` : ""}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="panel card">
          <div className="row card-head">
            <Icon name="lock" size="lg" />
            <h2>Pseudonymisation</h2>
          </div>
          {dataset ? <PseudonymisationFacts dataset={dataset} /> : <p className="meta">The dataset this batch read is not among the sources.</p>}
        </section>
        <section className="panel card">
          <div className="row card-head">
            <Icon name="layers" size="lg" />
            <h2>Also here</h2>
          </div>
          {refusedCount > 0 && (
            <a className="tail" href={narrow(href("review"), { batch: id })}>
              The {n(refusedCount)} refused files, on Review
              <Icon name="chevron-right" />
            </a>
          )}
          <a className="tail" href={href("query")}>
            Stacks of this batch, as a query
            <Icon name="chevron-right" />
          </a>
          <a className="tail" href={href("release")}>
            Releases holding them
            <Icon name="chevron-right" />
          </a>
        </section>
      </div>
    </section>
  );
}

/** A review item of this batch: its ref names the batch. */
function ofBatch(i: ReviewItem, id: number): boolean {
  const ref = (i.ref ?? {}) as Record<string, unknown>;
  return ref.batch === id || ref.batch_id === id || (i.scope === "batch" && String(ref.id ?? "") === String(id));
}

/** The five stages, each with its count, a word of state, its line and its job. */
export function StageStrip({ strip, jobs, batch }: { strip: Stage[]; jobs: JobRow[]; batch: BatchDoc }) {
  const took = (ids: number[]) => {
    const rows = ids.map((id) => jobs.find((j) => j.id === id)).filter((j): j is JobRow => j !== undefined);
    if (rows.length === 0) return "";
    const last = rows.sort((a, b) => b.id - a.id)[0];
    return rows.length === 1 && last.finished_at ? tookWords(last) : whenWords(last.finished_at ?? last.started_at);
  };
  return (
    <div className={strip.length === 5 ? "strip five" : "strip"} aria-label="the stages of this batch">
      {strip.map((s) => (
        <div key={s.name} className={s.mark === "none" ? undefined : s.mark}>
          <span className="k">{s.name}</span>
          <span className="v">
            {s.count === null ? "" : n(s.count)}
            {s.unit && <small> {s.unit}</small>}
          </span>
          <span className="meta state">{stateWords(s.mark)}</span>
          <span className="meta">{s.words}</span>
          {s.name === "reviewed" ? (
            s.mark === "wait" ? (
              <>
                {s.since && <span className="meta">since {whenWords(s.since)}</span>}
                <a className="tail" href={narrow(href("review"), { batch: batch.id })}>
                  Open on Review
                  <Icon name="chevron-right" />
                </a>
              </>
            ) : null
          ) : (
            s.jobs.length > 0 && (
              <span className="meta">
                {jobWords(s.jobs)}
                {took(s.jobs) ? ` · ${took(s.jobs)}` : ""}
              </span>
            )
          )}
        </div>
      ))}
    </div>
  );
}

function BaseBar({ label, count, width, unsure }: { label: string; count: number; width: number; unsure: boolean }) {
  return (
    <>
      <span>{label}</span>
      <span className="bar">
        <i className={unsure ? "unsure" : undefined} style={{ width: `${Math.max(1, Math.round(width))}%` }} />
      </span>
      <span className="num">{n(count)}</span>
    </>
  );
}

/** The dataset's pseudonymisation facts, at the side of its batch. */
export function PseudonymisationFacts({ dataset }: { dataset: Dataset }) {
  return (
    <>
      <Values
        cells={[
          { k: "arrives", v: arrivesWords(dataset) },
          { k: "subjects", v: subjectsWords(dataset) },
          { k: "on release", v: leavingWords(dataset.handling?.on_release) },
        ]}
      />
      <a className="tail" href={href("data", "datasets", dataset.name, "pseudonymisation")}>
        Pseudonymisation of {dataset.name}
        <Icon name="chevron-right" />
      </a>
    </>
  );
}
