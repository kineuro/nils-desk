// SPDX-License-Identifier: AGPL-3.0-only
// Every noun of the registry has a page (Wave 5 section 6.3): the object,
// what hangs off it, and its timeline. The sections are entry points; the
// pages are the product. What the page can show of the object itself is
// what the engine serves a door for; the timeline is there regardless.

import { useEffect, useState } from "react";
import { ask, type DocumentHandle, chain, type Json, results } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { ops, type ReleaseRow } from "../ops/client";
import type { JobRow } from "../ask/client";
import type { ObjectKind } from "../routes";
import { door as served } from "../sections";
import { classify, Failure, type Failed } from "../ui/Failure";
import { Wait } from "../ui/Wait";
import { usePageContext } from "../Rail";
import { BatchPage } from "../data/BatchPage";
import { PackPage } from "../data/PackPage";
import { ItemPage } from "../review/ItemPage";
import { Timeline } from "./Timeline";

type Load<T> = { kind: "waiting"; since: number } | { kind: "failed"; failed: Failed } | { kind: "ready"; value: T } | { kind: "no_door" };

function useDoor<T>(has: boolean, read: () => Promise<T>, deps: unknown[]): Load<T> {
  const [load, setLoad] = useState<Load<T>>(has ? { kind: "waiting", since: Date.now() } : { kind: "no_door" });
  useEffect(() => {
    if (!has) return;
    let alive = true;
    setLoad({ kind: "waiting", since: Date.now() });
    read()
      .then((v) => alive && setLoad({ kind: "ready", value: v }))
      .catch((e: unknown) => alive && setLoad({ kind: "failed", failed: classify(e) }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the reader closes over its deps
  }, deps);
  return load;
}

const TITLES: Record<ObjectKind, string> = {
  cohort: "Cohort", subject: "Subject", session: "Session", batch: "Batch", document: "Question", handle: "Result", release: "Release",
  handover: "Handover", pack: "Pack", overlay: "Overlay", rule: "Rule", job: "Job", review: "Review item", conversation: "Conversation",
};

export function ObjectPage({ caps, kind, id }: { caps: Capabilities; kind: ObjectKind; id: string }) {
  return (
    <section className={`object object-${kind}`}>
      <header className="ask-head">
        <div>
          <p className="meta eyebrow">{TITLES[kind]}</p>
          <h1>
            {TITLES[kind]} {id}
          </h1>
        </div>
      </header>
      <Body caps={caps} kind={kind} id={id} />
      <h2>Timeline</h2>
      <Timeline caps={caps} kind={kind} id={id} />
    </section>
  );
}

function Body({ caps, kind, id }: { caps: Capabilities; kind: ObjectKind; id: string }) {
  switch (kind) {
    case "document":
      return <DocumentBody caps={caps} id={Number(id)} />;
    case "handle":
      return <HandleBody caps={caps} id={Number(id)} />;
    case "job":
      return <JobBody caps={caps} id={Number(id)} />;
    case "review":
      return <ItemPage id={Number(id)} />;
    case "batch":
      return <BatchPage caps={caps} id={Number(id)} />;
    case "pack":
      return <PackPage name={id} />;
    case "release":
      return <ReleaseBody caps={caps} id={Number(id)} />;
    default:
      return <p className="meta">This engine serves no door for one {TITLES[kind].toLowerCase()} on its own yet; what it keeps about it is the timeline below.</p>;
  }
}

function Loading<T>({ load, children }: { load: Load<T>; children: (v: T) => React.ReactNode }) {
  if (load.kind === "no_door") return <p className="meta">The engine serves no door for this object.</p>;
  if (load.kind === "waiting") return <Wait phase="reading the object" since={load.since} size="panel" />;
  if (load.kind === "failed") return <Failure failed={load.failed} />;
  return <>{children(load.value)}</>;
}

function DocumentBody({ caps, id }: { caps: Capabilities; id: number }) {
  const load = useDoor(served(caps, "GET /api/ask/documents/{id}"), () => ask.get(id), [id]);
  const versions = useDoor(served(caps, "GET /api/ask/documents/{id}"), () => chain(id), [id]);
  const doc = load.kind === "ready" ? load.value : null;
  usePageContext({ page: { kind: "document", id: String(id) }, document_id: id, content_hash: doc?.hash, chain: versions.kind === "ready" ? versions.value.map((v) => v.document) : undefined });
  return (
    <Loading load={load}>
      {(d: DocumentHandle) => (
        <dl className="facts">
          <dt>name</dt>
          <dd>{String((d.ask as Json).name ?? "unnamed")}</dd>
          <dt>hash</dt>
          <dd>
            <code>{d.hash.slice(0, 12)}</code>
          </dd>
          <dt>author</dt>
          <dd>{d.principal ?? "unknown"}</dd>
          <dt>created</dt>
          <dd>{d.created_at ?? "unknown"}</dd>
          {d.parent !== null && (
            <>
              <dt>from</dt>
              <dd>
                <a href={`#document/${d.parent}`}>question {d.parent}</a>
              </dd>
            </>
          )}
          {versions.kind === "ready" && (
            <>
              <dt>versions</dt>
              <dd>{versions.value.length}</dd>
            </>
          )}
          <dt />
          <dd>
            <a className="button" href={`#ask/${id}`}>
              Open in Ask
            </a>
          </dd>
        </dl>
      )}
    </Loading>
  );
}

function HandleBody({ caps, id }: { caps: Capabilities; id: number }) {
  const load = useDoor(served(caps, "GET /api/ask/handles/{id}"), () => ask.handle(id), [id]);
  usePageContext({ page: { kind: "handle", id: String(id) }, handle_id: id });
  return (
    <Loading load={load}>
      {(h: Json) => (
        <dl className="facts">
          {["name", "grain", "row_count", "epoch", "created_at", "content_hash"].map((k) => (
            <Fact key={k} k={k} v={h[k]} />
          ))}
          <dt />
          <dd>
            <a className="button" href={`#ask/results/${id}`}>
              Open in Results
            </a>
          </dd>
        </dl>
      )}
    </Loading>
  );
}

function JobBody({ caps, id }: { caps: Capabilities; id: number }) {
  const load = useDoor(served(caps, "GET /api/jobs/{id}"), () => results.job(id), [id]);
  usePageContext({ page: { kind: "job", id: String(id) }, job_ids: [id] });
  return (
    <Loading load={load}>
      {(j: JobRow) => (
        <dl className="facts">
          <Fact k="kind" v={j.kind} />
          <Fact k="name" v={j.name} />
          <Fact k="state" v={j.state} />
          <Fact k="started" v={j.started_at} />
          <Fact k="finished" v={j.finished_at} />
          {j.error && <Fact k="error" v={j.error} />}
        </dl>
      )}
    </Loading>
  );
}

function ReleaseBody({ caps, id }: { caps: Capabilities; id: number }) {
  const load = useDoor(served(caps, "GET /api/releases"), () => ops.releases(200).then((r) => r.releases.find((x) => x.id === id) ?? Promise.reject(new Error("no such release"))), [id]);
  usePageContext({ page: { kind: "release", id: String(id) } });
  return (
    <Loading load={load}>
      {(r: ReleaseRow) => (
        <dl className="facts">
          <Fact k="name" v={r.name} />
          <Fact k="version" v={r.version} />
          <Fact k="started" v={r.started_at} />
          <Fact k="files" v={r.files} />
          <Fact k="subjects" v={r.subjects} />
          <Fact k="layout" v={r.layout} />
        </dl>
      )}
    </Loading>
  );
}

function Fact({ k, v }: { k: string; v: unknown }) {
  if (v === undefined || v === null) return null;
  return (
    <>
      <dt>{k.replace(/_/g, " ")}</dt>
      <dd>{typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
    </>
  );
}
