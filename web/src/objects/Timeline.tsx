// SPDX-License-Identifier: AGPL-3.0-only
// One timeline on every object's page (Wave 5 section 6.3): every event on
// it in order, each linking to the object it produced. Read from the
// timeline door; when the engine does not serve it, the panel says so by
// name instead of pretending the object has no history.

import { useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { door as served } from "../sections";
import { hrefOf, isObjectKind } from "../routes";
import { Empty } from "../ui/Empty";
import { classify, Failure, type Failed } from "../ui/Failure";
import { Wait } from "../ui/Wait";
import { type Event, objects } from "./client";

type Load = { kind: "waiting"; since: number } | { kind: "failed"; failed: Failed } | { kind: "ready"; events: Event[] };

export function Timeline({ caps, kind, id }: { caps: Capabilities; kind: string; id: string | number }) {
  const [load, setLoad] = useState<Load>({ kind: "waiting", since: Date.now() });
  const has = served(caps, "GET /api/timeline/{kind}/{id}");
  useEffect(() => {
    if (!has) return;
    let alive = true;
    setLoad({ kind: "waiting", since: Date.now() });
    objects
      .timeline(kind, id)
      .then((t) => alive && setLoad({ kind: "ready", events: t.events }))
      .catch((e: unknown) => alive && setLoad({ kind: "failed", failed: classify(e) }));
    return () => {
      alive = false;
    };
  }, [has, kind, id]);
  if (!has) return <p className="meta">This engine serves no timeline door; the object's history is not readable from here.</p>;
  if (load.kind === "waiting") return <Wait phase="reading the timeline" since={load.since} size="panel" />;
  if (load.kind === "failed") return <Failure failed={load.failed} />;
  if (load.events.length === 0) return <Empty what="Nothing has happened to this object yet." />;
  return (
    <ol className="timeline">
      {load.events.map((e, i) => (
        <li key={i} className={`event event-${e.kind}`}>
          <time dateTime={e.at}>{e.at}</time>
          <span className="event-kind">{e.kind}</span>
          <span className="event-summary">{e.summary}</span>
          {e.actor && <span className="event-actor">{e.actor}</span>}
          {e.produced && isObjectKind(e.produced.kind) && (
            <a href={hrefOf(e.produced.kind, e.produced.id)}>
              {e.produced.kind} {e.produced.id}
            </a>
          )}
        </li>
      ))}
    </ol>
  );
}
