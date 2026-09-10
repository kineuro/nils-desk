// SPDX-License-Identifier: AGPL-3.0-only
// Home (Wave 5 section 6.1): the answer to "what should I do". Four bands,
// each a predicate on the parts present and the person's entitlement: what
// the registry holds, what needs you, what is running, what changed since
// you were here. The to-do that is true; never a row of a person.

import { useEffect, useMemo, useState } from "react";
import { type HandleRow, type JobRow, results } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { ops, type ReleaseRow, type ReviewItem } from "../ops/client";
import { usePageContext } from "../Rail";
import { door as served, holds } from "../sections";
import { objects, type Summary } from "../objects/client";
import { Empty } from "../ui/Empty";
import { classify, Failure, type Failed } from "../ui/Failure";
import { Wait } from "../ui/Wait";

type Load<T> = { kind: "waiting"; since: number } | { kind: "failed"; failed: Failed } | { kind: "ready"; value: T };

function useLoad<T>(on: boolean, read: () => Promise<T>, every: number | null = null): Load<T> | null {
  const [load, setLoad] = useState<Load<T> | null>(on ? { kind: "waiting", since: Date.now() } : null);
  useEffect(() => {
    if (!on) return;
    let alive = true;
    const go = () =>
      read()
        .then((v) => alive && setLoad({ kind: "ready", value: v }))
        .catch((e: unknown) => alive && setLoad({ kind: "failed", failed: classify(e) }));
    go();
    const t = every ? setInterval(go, every) : null;
    return () => {
      alive = false;
      if (t) clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read is fixed per band
  }, [on, every]);
  return load;
}

const LAST_VISIT = "nils-desk:last-visit";

/** The last visit, kept per browser as a convenience; missing in a private window, and then the band shows the last day. */
export function lastVisit(now = Date.now()): string {
  let seen: string | null = null;
  try {
    seen = localStorage.getItem(LAST_VISIT);
    localStorage.setItem(LAST_VISIT, new Date(now).toISOString());
  } catch {
    seen = null;
  }
  return seen ?? new Date(now - 24 * 3600 * 1000).toISOString();
}

export function Home({ caps }: { caps: Capabilities }) {
  usePageContext({ page: { kind: "home", id: null }, epoch: caps.engine?.registry.epoch });
  const since = useMemo(() => lastVisit(), []);
  const summaryDoor = served(caps, "GET /api/summary");
  const summary = useLoad(summaryDoor, () => objects.summary(since));
  const reviewer = holds(caps, "reviewer");
  const review = useLoad(reviewer && served(caps, "GET /api/review"), () => ops.review("open", undefined, 20));
  const jobs = useLoad(reviewer && served(caps, "GET /api/jobs"), () => ops.jobs(true, 50), 10_000);
  const handles = useLoad(served(caps, "GET /api/ask/handles"), () => results.handles());
  const releases = useLoad(holds(caps, "operator") && served(caps, "GET /api/releases"), () => ops.releases(20));
  return (
    <section className="home">
      <h1>Home</h1>
      <div className="bands">
        <Band title="What the registry holds">
          {!summaryDoor && <p className="meta">This engine serves no summary door. The counts live on the Data page.</p>}
          {summary && <Loaded load={summary}>{(s) => <Holds s={s} />}</Loaded>}
        </Band>
        <Band title="What needs you">
          {!reviewer && <p className="meta">Nothing waits on a reader. Ask a question, or read a result.</p>}
          {review && (
            <Loaded load={review}>
              {(r) => (r.items.length === 0 ? <Empty what="No review item is open." /> : <ReviewList items={r.items} />)}
            </Loaded>
          )}
          {jobs && (
            <Loaded load={jobs}>
              {(j) => {
                const failed = j.jobs.filter((x) => x.state === "failed");
                return failed.length === 0 ? null : <JobList jobs={failed} title="Jobs that failed" />;
              }}
            </Loaded>
          )}
        </Band>
        <Band title="What is running">
          {!reviewer && <p className="meta">Jobs are listed for reviewers and above.</p>}
          {jobs && (
            <Loaded load={jobs}>
              {(j) => {
                const mine = j.jobs.filter((x) => x.state === "running" || x.state === "queued" || x.state === "cancelling");
                const own = caps.person.subject;
                mine.sort((a, b) => Number(b.args?.principal === own) - Number(a.args?.principal === own));
                return mine.length === 0 ? <Empty what="Nothing is running." /> : <JobList jobs={mine} />;
              }}
            </Loaded>
          )}
        </Band>
        <Band title="What changed since you were here">
          <p className="meta">since {since.slice(0, 16).replace("T", " ")}</p>
          {summary && summary.kind === "ready" && summary.value.since && <SinceCounts s={summary.value} />}
          {handles && (
            <Loaded load={handles}>
              {(h) => {
                const fresh = h.handles.filter((x) => x.created_at > since).slice(0, 10);
                return fresh.length === 0 ? <Empty what="No result was produced." back={{ label: "Ask one.", href: "#ask" }} /> : <HandleList handles={fresh} />;
              }}
            </Loaded>
          )}
          {releases && (
            <Loaded load={releases}>
              {(r) => {
                const fresh = r.releases.filter((x) => (x.started_at ?? "") > since);
                return fresh.length === 0 ? null : <ReleaseList releases={fresh} />;
              }}
            </Loaded>
          )}
        </Band>
      </div>
    </section>
  );
}

function Band({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="band">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Loaded<T>({ load, children }: { load: Load<T>; children: (v: T) => React.ReactNode }) {
  if (load.kind === "waiting") return <Wait phase="reading" since={load.since} size="line" />;
  if (load.kind === "failed") return <Failure failed={load.failed} />;
  return <>{children(load.value)}</>;
}

function Holds({ s }: { s: Summary }) {
  return (
    <div>
      <table className="thin counts">
        <thead>
          <tr>
            <th />
            <th className="num">subjects</th>
            <th className="num">sessions</th>
            <th className="num">stacks</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>all</td>
            <td className="num">{s.subjects.total}</td>
            <td className="num">{s.sessions.total}</td>
            <td className="num">{s.stacks.total}</td>
          </tr>
          {s.cohorts.map((c) => (
            <tr key={c}>
              <td>{c}</td>
              <td className="num">{s.subjects.by_cohort[c] ?? 0}</td>
              <td className="num">{s.sessions.by_cohort[c] ?? 0}</td>
              <td className="num">{s.stacks.by_cohort[c] ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {Object.keys(s.stacks.by_pack_version ?? {}).length > 0 && (
        <p className="meta">
          stacks by pack version: {Object.entries(s.stacks.by_pack_version!).map(([v, n]) => `${v}: ${n}`).join(", ")}
        </p>
      )}
      {s.cohorts.length > 1 && <p className="meta">a subject in two cohorts counts in each</p>}
      <p className="meta">
        epoch {s.epoch}
        {s.synthetic && <>, synthetic</>}
      </p>
    </div>
  );
}

function SinceCounts({ s }: { s: Summary }) {
  const c = s.since!;
  const parts = [
    [c.subjects, "subjects"],
    [c.sessions, "sessions"],
    [c.stacks, "stacks"],
    [c.handles, "results"],
    [c.releases, "releases"],
  ].filter(([n]) => (n as number) > 0);
  if (parts.length === 0) return <p className="meta">The registry did not move.</p>;
  return <p>{parts.map(([n, w]) => `${n} ${w}`).join(", ")} landed.</p>;
}

function ReviewList({ items }: { items: ReviewItem[] }) {
  return (
    <ul className="todo">
      {items.map((i) => (
        <li key={i.id}>
          <a href={`#review/${i.id}`}>
            {i.kind} {i.id}
          </a>{" "}
          <span className="meta">{i.scope}, opened {i.created_at.slice(0, 10)}</span>
        </li>
      ))}
    </ul>
  );
}

function JobList({ jobs, title }: { jobs: JobRow[]; title?: string }) {
  return (
    <div>
      {title && <h3>{title}</h3>}
      <ul className="todo">
        {jobs.map((j) => (
          <li key={j.id}>
            <a href={`#job/${j.id}`}>
              {j.name ?? j.kind} {j.id}
            </a>{" "}
            <span className="meta">
              {j.state}, since {j.started_at.slice(11, 19)}
              {j.args?.principal ? `, ${j.args.principal}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HandleList({ handles }: { handles: HandleRow[] }) {
  return (
    <ul className="todo">
      {handles.map((h) => (
        <li key={h.id}>
          <a href={`#handle/${h.id}`}>
            {h.name ?? `result ${h.id}`}
          </a>{" "}
          <span className="meta">
            {h.row_count} {h.grain}s, {h.created_at.slice(0, 16).replace("T", " ")}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ReleaseList({ releases }: { releases: ReleaseRow[] }) {
  return (
    <ul className="todo">
      {releases.map((r) => (
        <li key={r.id}>
          <a href={`#release/${r.id}`}>
            {r.name} {r.version}
          </a>{" "}
          <span className="meta">{r.started_at?.slice(0, 16).replace("T", " ")}</span>
        </li>
      ))}
    </ul>
  );
}
