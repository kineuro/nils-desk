// SPDX-License-Identifier: AGPL-3.0-only
// The Pipelines page: the jobs as cards. Now, live from the engine's event
// stream where it serves one (the Data page's one reader of it, which falls
// back to reading the door), is what runs and what waits in a chain; under
// it every job the engine lists, filtered by state, each a card that says
// what it did, for whom, how far it got, what stopped it and the next move.
// A cancel goes by the verb's grant: a digest is Data work, a sort
// Pipelines work, a release Release work; the card keeps its button and
// says why when a person lacks the grant. Since 2026-10-12 a stopped run's
// job leaves Now once a later job took its run up again, and says which; a
// run's job that made nothing stays in Now to be looked at; Run again of a
// run opens its pre-flight first. Since 2026-10-13 a pipeline run's job, in
// Now and in All jobs, opens its run, where what it made is: a click anywhere
// on its card, or Open run.
// Since Wave 7a Models is a page here
// (#pipelines/models, spec section 13.1), and a person who may see models
// and not the jobs opens it first. Wave 7b (section 8.1): Catalog and Runs
// are one Pipelines page with no tabs, which the section opens on
// (#pipelines); the jobs are a page beside it (#pipelines/jobs); a workflow's
// page is #pipelines/workflows/<id> and a workflow run's
// #pipelines/workflow-runs/<id>; the old #pipelines/catalog and
// #pipelines/runs lead to the page (routes.ts).

import { useCallback, useEffect, useState } from "react";
import type { JobRow } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { useLiveJobs } from "../data/Now";
import { nowWords } from "../data/now";
import { door as served } from "../deployment";
import { may } from "../grants";
import { href } from "../routes";
import { messageOf } from "../settings/common";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import { ModelsPage } from "../models/ModelsPage";
import { CatalogPage } from "./Catalog";
import { AddWorkflowButton, WorkflowPage, WorkflowRunPage } from "./Workflows";
import { workflowActs } from "./workflows";
import { AddPipelineDialog } from "./PipelineSetup";
import { setupActs } from "./pipelineSetup";
import { ops } from "./client";
import { PlanPage, plansOffered } from "./PlanPage";
import { RunPage } from "./RunPage";
import { RunAgainDialog, type Again } from "./RunAgain";
import { runActs } from "./runs";
import { runOfJob, viewActs } from "./results";
import { RunResultPage } from "./RunResult";
import { cardOf, countByFilter, FILTERS, filterJobs, needsALook, type ChainedJob, type JobCard, type StateFilter } from "./pipelines";
import { isWorker, wordsOf } from "./verbs";
import { WorkersReady } from "./WorkersReady";
import { FailLine } from "./Reason";

const n = (v: number) => v.toLocaleString("en-US");


/** The Pipelines section's pages: the one Pipelines page (Wave 7b section 8.1) where the engine serves the catalog, else the jobs; the jobs beside it; a run's, a workflow's and a workflow run's own pages; the assistant's plan; a unit's result on its run. */
export function PipelinesPage({ caps, page = null, arg = null, query }: { caps: Capabilities; page?: string | null; arg?: string | null; query?: Record<string, string> }) {
  const catalog = may(caps, "pipelines:see") && served(caps, "GET /api/pipelines");
  const [said, setSaid] = useState<string | null>(null);
  // record 55 H2, round 4: a pipeline added in the desk, and the catalog read again after it
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(0);
  // since 2026-10-13 a unit's result, drawn: #pipelines/runs/4?view=<unit>
  if (page === "runs" && arg !== null && /^\d+$/.test(arg) && query?.view && viewActs(caps)) {
    return (
      <section className="pipelines">
        <div className="data-head">
          <div className="grow">
            <span className="eyebrow">Pipelines</span>
            <h1>Run {arg}</h1>
          </div>
        </div>
        <RunResultPage id={Number(arg)} unit={query.view} />
      </section>
    );
  }
  const modelsOpen = may(caps, "models:see") && served(caps, "GET /api/models");
  if (modelsOpen && (page === "models" || !may(caps, "pipelines:see"))) {
    return <ModelsPage caps={caps} id={page === "models" && arg !== null && /^\d+$/.test(arg) ? Number(arg) : null} />;
  }
  if (page === "runs" && arg !== null && /^\d+$/.test(arg) && runActs(caps).open) {
    return (
      <section className="pipelines">
        <div className="data-head">
          <div className="grow">
            <span className="eyebrow">Pipelines</span>
            <h1>Run {arg}</h1>
          </div>
        </div>
        <RunPage caps={caps} id={Number(arg)} />
      </section>
    );
  }
  if (page === "plan" && arg !== null && catalog && plansOffered(caps)) {
    return (
      <section className="pipelines">
        <div className="data-head">
          <div className="grow">
            <span className="eyebrow">Pipelines</span>
            <h1>A planned run</h1>
          </div>
        </div>
        <PlanPage caps={caps} id={arg} />
      </section>
    );
  }
  const wf = workflowActs(caps);
  if (page === "workflows" && arg !== null && catalog && wf.see) {
    return (
      <section className="pipelines">
        <div className="data-head">
          <div className="grow">
            <span className="eyebrow">Pipelines</span>
            <h1>Workflow</h1>
          </div>
        </div>
        <WorkflowPage caps={caps} id={arg} query={query} />
      </section>
    );
  }
  if (page === "workflow-runs" && arg !== null && /^\d+$/.test(arg) && catalog && wf.openRun) {
    return (
      <section className="pipelines">
        <div className="data-head">
          <div className="grow">
            <span className="eyebrow">Pipelines</span>
            <h1>Workflow run {arg}</h1>
          </div>
        </div>
        <WorkflowRunPage caps={caps} id={Number(arg)} />
      </section>
    );
  }
  if (page === "jobs" || !catalog) return <JobsPage caps={caps} catalog={catalog} />;
  // Wave 7b section 8.1: the one Pipelines page, which the section opens on; the old Catalog and Runs addresses draw it too
  return (
    <section className="pipelines">
      <div className="data-head">
        <div className="grow">
          <span className="eyebrow">Pipelines</span>
          <h1>Pipelines</h1>
          <p className="lede">What this engine can run, the workflows that chain it, and every run.</p>
        </div>
        <div className="row">
          <AddWorkflowButton
            caps={caps}
            onDone={(w) => {
              setAdded((n) => n + 1);
              setSaid(w);
            }}
          />
          {setupActs(caps).add && (
            <button type="button" className="button" onClick={() => setAdding(true)}>
              <Icon name="plus" />
              Add a pipeline
            </button>
          )}
        </div>
      </div>
      {said && <p className="meta">{said}</p>}
      <CatalogPage key={added} caps={caps} onQueued={setSaid} />
      {adding && (
        <AddPipelineDialog
          onClose={() => setAdding(false)}
          onDone={(w) => {
            setAdding(false);
            setAdded((n) => n + 1);
            setSaid(w);
          }}
        />
      )}
    </section>
  );
}


function JobsPage({ caps }: { caps: Capabilities; catalog?: boolean }) {
  const live = useLiveJobs(caps);
  const [all, setAll] = useState<JobRow[] | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [filter, setFilter] = useState<StateFilter>("all");
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [said, setSaid] = useState<string | null>(null);
  const [again, setAgain] = useState<Again | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [since] = useState(() => Date.now());
  const lists = served(caps, "GET /api/jobs");
  const cancels = served(caps, "POST /api/jobs/{id}/cancel");
  const queues = served(caps, "POST /api/jobs");
  const opensRuns = runActs(caps).open;

  const read = useCallback(() => {
    if (!lists) return;
    ops
      .jobs(true, 200)
      .then((r) => {
        setAll(r.jobs);
        setWhy(null);
      })
      .catch((e: unknown) => setWhy(messageOf(e)));
  }, [lists]);

  useEffect(() => {
    read();
    const t = setInterval(read, 30_000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(t);
      clearInterval(tick);
    };
  }, [read]);

  // a job that ends leaves Now; the list under it is read again to show how it ended
  const openIds = live.open === null ? null : live.open.map((j) => j.id).join(",");
  useEffect(() => {
    if (openIds !== null) read();
  }, [openIds, read]);

  const act = (words: string, work: Promise<unknown>) => {
    setSaid(null);
    work
      .then(() => {
        setSaid(words);
        live.refresh();
        read();
      })
      .catch((e: unknown) => setSaid(messageOf(e)));
  };

  const card = (j: JobRow) => {
    const c = cardOf(j as ChainedJob, now);
    const holds = may(caps, c.cancel);
    const mayCancel = holds && cancels;
    const mayQueue = holds && queues;
    const run = opensRuns ? runOfJob(j) : null;
    return (
      <Card
        key={j.id}
        card={c}
        open={run !== null ? href("pipelines", "runs", String(run)) : null}
        reason={holds ? null : `needs work on ${wordsOf(j).page}`}
        onCancel={mayCancel && (c.tone === "running" || c.tone === "queued") ? () => act(c.tone === "queued" ? `Job ${j.id} is dropped from the queue.` : `Job ${j.id} stops at its next heartbeat; what is written stays written.`, ops.cancel(j.id)) : null}
        onNext={mayQueue && c.next ? () => (c.again ? setAgain(c.again) : act(`Queued again as a new job.`, ops.enqueue(c.next!.command))) : null}
        onDismiss={c.tone === "failed" || c.tone === "cancelled" || c.made?.head === "nothing made" ? () => setDismissed((was) => new Set([...was, j.id])) : null}
      />
    );
  };

  const nowJobs = (live.open ?? all?.filter((j) => j.state === "running" || j.state === "queued" || j.state === "cancelling") ?? []).filter((j) => !dismissed.has(j.id) && !isWorker(j));
  // a queue worker's own row ends when the engine restarts: never a failure of anyone's work, so it waits folded under All jobs;
  // a stopped run's job whose run a later job took up again needs no look, and a run's job that made nothing does
  const recentFailed = (all ?? []).filter((j) => !isWorker(j) && !dismissed.has(j.id) && needsALook(j, now)).slice(0, 5);
  const shown = filterJobs(all ?? [], filter).filter((j) => !dismissed.has(j.id) && !isWorker(j));
  const workers = (all ?? []).filter((j) => isWorker(j) && j.state !== "running");
  const counts = countByFilter((all ?? []).filter((j) => !isWorker(j)));

  return (
    <section className="pipelines">
      {again && (
        <RunAgainDialog
          caps={caps}
          again={again}
          onClose={() => setAgain(null)}
          onDone={(w) => {
            setAgain(null);
            setSaid(w);
            live.refresh();
            read();
          }}
        />
      )}
      <div className="data-head">
        <div className="grow">
          <span className="eyebrow">Pipelines</span>
          <h1>Jobs</h1>
          <p className="lede">What runs and waits now, and every job that ran.</p>
        </div>
      </div>
      {!lists && <p className="meta">This engine does not list its jobs.</p>}
      {said && <p className="meta">{said}</p>}
      {why && all === null && <p className="warn">The jobs could not be read: {why}</p>}
      <div className="section-head rule-top">
        <h2>Now</h2>
        <span className="meta">{nowWords(live.live, nowJobs.length)}</span>
      </div>
      <WorkersReady jobs={live.open ?? all ?? []} now={now} />
      {live.open === null && all === null && lists && <Wait phase="reading the jobs" since={since} size="panel" />}
      {(live.open !== null || all !== null) && nowJobs.length === 0 && recentFailed.length === 0 && <p className="meta">Nothing runs and nothing waits.</p>}
      {(nowJobs.length > 0 || recentFailed.length > 0) && <div className="jobs-now">{[...nowJobs, ...recentFailed.filter((f) => !nowJobs.some((j) => j.id === f.id))].map(card)}</div>}
      <div className="now-line">
        <span>
          <Icon name="pulse" />
          {live.live.kind === "stream" ? "Updated every second while a job runs" : "Read again every few seconds while a job runs"}
        </span>
        <span>
          <Icon name="clock" />A cancel stops at the next heartbeat; what is written stays written
        </span>
      </div>
      <div className="section-head rule-top">
        <h2>All jobs</h2>
        <div className="chips" role="group" aria-label="show the jobs in one state">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" className={filter === f.id ? "tag brand" : "tag"} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label} {n(counts[f.id])}
            </button>
          ))}
        </div>
      </div>
      {all !== null && shown.length === 0 && <p className="meta">No job {filter === "all" ? "yet" : filter}.</p>}
      {shown.length > 0 && <div className="jobs-now">{shown.map(card)}</div>}
      {workers.length > 0 && (
        <details className="says workers">
          <summary>
            {n(workers.length)} queue {workers.length === 1 ? "worker" : "workers"} ended by a restart
          </summary>
          <div className="jobs-now">{workers.map(card)}</div>
        </details>
      )}
    </section>
  );
}

/** A job as a card; a pipeline run's job opens its run (`open`, its page's address). */
export function Card({ card: c, reason, open: opens = null, onCancel, onNext, onDismiss }: { card: JobCard; reason: string | null; open?: string | null; onCancel: (() => void) | null; onNext: (() => void) | null; onDismiss: (() => void) | null }) {
  // a run's job that did not make all it was for reads in caution, never a bare done
  const short = c.made !== null && c.made.tone === "caution";
  // a stopped job whose run a later job took up again reads as over, not as a failure to mend
  const tone = c.tone === "queued" ? "job queued" : c.tone === "failed" ? (c.taken ? "job done" : "job failed") : c.tone === "cancelled" ? "job cancelled" : c.tone === "done" ? (short ? "job done short" : "job done") : "job";
  const sq = (c.tone === "failed" && !c.taken) || short ? "sq caution" : c.tone === "running" ? "sq brand" : "sq";
  const open = c.tone === "running" || c.tone === "queued";
  // a run's job opens its run on a click anywhere on the card but its buttons and links; Open run is the way by the keyboard
  const go = (e: { target: EventTarget | null }) => {
    if (!opens || (e.target instanceof Element && e.target.closest("a, button, input, select, summary"))) return;
    location.hash = opens;
  };
  return (
    <div className={opens ? `${tone} openable` : tone} onClick={opens ? go : undefined}>
      <span className={sq}>
        <Icon name={c.icon} />
      </span>
      <div className="what">
        <b>{c.title}</b>
        <span className="meta">
          {c.meta}
          {c.waits !== null ? ` · waits for job ${c.waits}` : ""}
          {c.then.length > 0 ? ` · ${c.then.join(", ")}` : ""}
        </span>
      </div>
      <div className="acts">
        {open && (onCancel ? (
          <button type="button" className={c.tone === "queued" ? "button quiet small" : "button secondary small"} onClick={onCancel}>
            {c.tone === "queued" ? "Drop" : "Cancel"}
          </button>
        ) : (
          <span className="blocked">
            <button type="button" className={c.tone === "queued" ? "button quiet small" : "button secondary small"} disabled aria-disabled="true">
              {c.tone === "queued" ? "Drop" : "Cancel"}
            </button>
            {reason && <span className="reason">{reason}</span>}
          </span>
        ))}
        {c.next && (onNext ? (
          <button type="button" className="button secondary small" onClick={onNext}>
            {c.next.label}
          </button>
        ) : (
          <span className="blocked">
            <button type="button" className="button secondary small" disabled aria-disabled="true">
              {c.next.label}
            </button>
            {reason && <span className="reason">{reason}</span>}
          </span>
        ))}
        {opens && (
          <a className="button secondary small" href={opens}>
            Open run
          </a>
        )}
        {onDismiss && (
          <button type="button" className="button quiet small" onClick={onDismiss}>
            Dismiss
          </button>
        )}
      </div>
      {c.progress && (
        <div className="how">
          <span className="local-track">
            <i style={{ width: `${Math.round((c.progress.fraction ?? 0.05) * 100)}%` }} />
          </span>
          <span className="meta num">{c.progress.words}</span>
        </div>
      )}
      {c.made?.rest && (
        <div className="how">
          <span className="made-rest">{c.made.rest}</span>
        </div>
      )}
      {c.failure?.kind ? (
        <div className="how">
          <FailLine f={c.failure} />
        </div>
      ) : (
        c.error && (
          <div className="how">
            <span className="warn">{c.error}</span>
          </div>
        )
      )}
    </div>
  );
}
