// SPDX-License-Identifier: AGPL-3.0-only
// The Pipelines page: the jobs as cards. Now, live from the engine's event
// stream where it serves one (the Data page's one reader of it, which falls
// back to reading the door), is what runs and what waits in a chain; under
// it every job the engine lists, filtered by state, each a card that says
// what it did, for whom, how far it got, what stopped it and the next move.
// A cancel goes by the verb's grant: a digest is Data work, a sort
// Pipelines work, a release Release work; the card keeps its button and
// says why when a person lacks the grant.

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
import { CatalogPage } from "./Catalog";
import { ops } from "./client";
import { PlanPage, plansOffered } from "./PlanPage";
import { RunPage } from "./RunPage";
import { runActs } from "./runs";
import { cardOf, countByFilter, FILTERS, filterJobs, type ChainedJob, type JobCard, type StateFilter } from "./pipelines";
import { wordsOf } from "./verbs";

const n = (v: number) => v.toLocaleString("en-US");


/** The Pipelines page's two pages: the jobs, and since record 45 the catalog where the engine serves it; since record 49 a run's own page and the assistant's plan. */
export function PipelinesPage({ caps, page = null, arg = null }: { caps: Capabilities; page?: string | null; arg?: string | null }) {
  const catalog = may(caps, "pipelines:see") && served(caps, "GET /api/pipelines");
  const [said, setSaid] = useState<string | null>(null);
  if (page === "runs" && arg !== null && /^\d+$/.test(arg) && runActs(caps).open) {
    return (
      <section className="pipelines">
        <div className="data-head">
          <div className="grow">
            <span className="eyebrow">Pipelines</span>
            <h1>Run {arg}</h1>
          </div>
        </div>
        <PipelinesChips on="catalog" />
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
        <PipelinesChips on="catalog" />
        <PlanPage caps={caps} id={arg} />
      </section>
    );
  }
  if (page === "catalog" && catalog) {
    return (
      <section className="pipelines">
        <div className="data-head">
          <div className="grow">
            <span className="eyebrow">Pipelines</span>
            <h1>Catalog</h1>
            <p className="lede">What this engine can run, pinned by image, and what each run made.</p>
          </div>
        </div>
        <PipelinesChips on="catalog" />
        {said && <p className="meta">{said}</p>}
        <CatalogPage caps={caps} onQueued={setSaid} />
      </section>
    );
  }
  return <JobsPage caps={caps} catalog={catalog} />;
}

function PipelinesChips({ on }: { on: "jobs" | "catalog" }) {
  return (
    <div className="chips pages">
      <a className={on === "jobs" ? "opt on" : "opt"} href={href("pipelines")} aria-current={on === "jobs" ? "page" : undefined}>
        Jobs
      </a>
      <a className={on === "catalog" ? "opt on" : "opt"} href={href("pipelines", "catalog")} aria-current={on === "catalog" ? "page" : undefined}>
        Catalog
      </a>
    </div>
  );
}

function JobsPage({ caps, catalog }: { caps: Capabilities; catalog: boolean }) {
  const live = useLiveJobs(caps);
  const [all, setAll] = useState<JobRow[] | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [filter, setFilter] = useState<StateFilter>("all");
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [said, setSaid] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [since] = useState(() => Date.now());
  const lists = served(caps, "GET /api/jobs");
  const cancels = served(caps, "POST /api/jobs/{id}/cancel");
  const queues = served(caps, "POST /api/jobs");

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
    return (
      <Card
        key={j.id}
        card={c}
        reason={holds ? null : `needs work on ${wordsOf(j).page}`}
        onCancel={mayCancel && (c.tone === "running" || c.tone === "queued") ? () => act(c.tone === "queued" ? `Job ${j.id} is dropped from the queue.` : `Job ${j.id} stops at its next heartbeat; what is written stays written.`, ops.cancel(j.id)) : null}
        onNext={mayQueue && c.next ? () => act(`Queued again as a new job.`, ops.enqueue(c.next!.command)) : null}
        onDismiss={c.tone === "failed" || c.tone === "cancelled" ? () => setDismissed((was) => new Set([...was, j.id])) : null}
      />
    );
  };

  const nowJobs = (live.open ?? all?.filter((j) => j.state === "running" || j.state === "queued" || j.state === "cancelling") ?? []).filter((j) => !dismissed.has(j.id));
  const recentFailed = (all ?? []).filter((j) => (j.state === "failed" || j.state === "cancelled") && !dismissed.has(j.id) && Date.parse(j.finished_at ?? j.started_at) > now - 7 * 86_400_000).slice(0, 5);
  const shown = filterJobs(all ?? [], filter).filter((j) => !dismissed.has(j.id));
  const counts = countByFilter(all ?? []);

  return (
    <section className="pipelines">
      <div className="data-head">
        <div className="grow">
          <span className="eyebrow">Pipelines</span>
          <h1>Jobs</h1>
          <p className="lede">Everything heavy runs as a job the engine queues: digests, pseudonymisation, sorting, releases, backups. What runs is here as it runs; what ran stays.</p>
        </div>
      </div>
      {catalog && <PipelinesChips on="jobs" />}
      {!lists && <p className="meta">This engine does not list its jobs.</p>}
      {said && <p className="meta">{said}</p>}
      {why && all === null && <p className="warn">The jobs could not be read: {why}</p>}
      <div className="section-head rule-top">
        <h2>Now</h2>
        <span className="meta">{nowWords(live.live, nowJobs.length)}</span>
      </div>
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
      <div className="note gated">
        <Icon name="lock" />
        <div className="note-body">
          <p className="note-lead">Who may act</p>
          <p className="note-detail">A digest is cancelled with Data: Work, a sort with Pipelines: Work, a release with Release: Work, a backup with Database: Work. The card keeps its button and says why when a person lacks the grant.</p>
        </div>
      </div>
    </section>
  );
}

function Card({ card: c, reason, onCancel, onNext, onDismiss }: { card: JobCard; reason: string | null; onCancel: (() => void) | null; onNext: (() => void) | null; onDismiss: (() => void) | null }) {
  const tone = c.tone === "queued" ? "job queued" : c.tone === "failed" ? "job failed" : c.tone === "cancelled" ? "job cancelled" : c.tone === "done" ? "job done" : "job";
  const sq = c.tone === "failed" ? "sq caution" : c.tone === "running" ? "sq brand" : "sq";
  const open = c.tone === "running" || c.tone === "queued";
  return (
    <div className={tone}>
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
      {c.error && (
        <div className="how">
          <span className="warn">{c.error}</span>
        </div>
      )}
    </div>
  );
}
