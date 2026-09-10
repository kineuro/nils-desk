// SPDX-License-Identifier: AGPL-3.0-only
// The first page of a fresh install: the parts this deployment has, what the
// registry holds, and who you are. Nothing else is here yet; each part of the
// desk is built back deliberately.

import { useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { cohortNames, objects, type Summary } from "../objects/client";
import { classify, Failure, type Failed } from "../ui/Failure";
import { Wait } from "../ui/Wait";

type Load = { kind: "waiting"; since: number } | { kind: "failed"; failed: Failed } | { kind: "ready"; summary: Summary } | { kind: "absent" };

export function Home({ caps }: { caps: Capabilities }) {
  const has = served(caps, "GET /api/summary");
  const [load, setLoad] = useState<Load>(has ? { kind: "waiting", since: Date.now() } : { kind: "absent" });
  useEffect(() => {
    if (!has) return;
    let alive = true;
    objects
      .summary()
      .then((s) => alive && setLoad({ kind: "ready", summary: s }))
      .catch((e: unknown) => alive && setLoad({ kind: "failed", failed: classify(e) }));
    return () => {
      alive = false;
    };
  }, [has]);

  return (
    <section className="first">
      <h1>NILS</h1>
      <p className="lede">
        This deployment keeps imaging data as one registry: every scan digested and classified, every person pseudonymous, every question a
        stored document, every release described before it is made.
      </p>

      <h2>What is installed</h2>
      <dl className="facts">
        <dt>engine</dt>
        <dd>
          {caps.engine ? `${caps.engine.engine.name} ${caps.engine.engine.version}` : "not reachable"}
          {caps.engine && <span className="meta"> contracts {Object.entries(caps.engine.contracts).map(([k, v]) => `${k} ${v}`).join(", ")}</span>}
        </dd>
        <dt>desk</dt>
        <dd>
          {caps.desk.version}
          <span className="meta"> {caps.desk.mode} mode</span>
        </dd>
        {caps.kvasir !== null && (
          <>
            <dt>model gateway</dt>
            <dd>installed</dd>
          </>
        )}
        {caps.assistant !== null && (
          <>
            <dt>assistant</dt>
            <dd>installed</dd>
          </>
        )}
      </dl>

      <h2>What the registry holds</h2>
      {load.kind === "absent" && <p>This engine serves no summary door, so the desk cannot say.</p>}
      {load.kind === "waiting" && <Wait phase="reading the registry" since={load.since} size="panel" />}
      {load.kind === "failed" && <Failure failed={load.failed} />}
      {load.kind === "ready" && <Holds caps={caps} s={load.summary} />}

      <h2>You</h2>
      <dl className="facts">
        <dt>signed in as</dt>
        <dd>
          {caps.person.display_name || caps.person.subject}
          {caps.person.subject && caps.person.display_name && <span className="meta"> {caps.person.subject}</span>}
        </dd>
        <dt>entitlements</dt>
        <dd>{caps.person.entitlements.join(", ") || "none"}</dd>
      </dl>
    </section>
  );
}

function Holds({ caps, s }: { caps: Capabilities; s: Summary }) {
  const empty = s.subjects.total === 0 && s.sessions.total === 0 && s.stacks.total === 0;
  if (empty) {
    return (
      <>
        <p>The registry is empty. Nothing has been brought in yet.</p>
        <p className="meta">
          epoch {s.epoch}
          {caps.engine?.registry.schema_version !== undefined && <>, schema {caps.engine.registry.schema_version}</>}
        </p>
      </>
    );
  }
  const names = cohortNames(s);
  return (
    <>
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
          {names.map((c) => (
            <tr key={c}>
              <td>{c}</td>
              <td className="num">{s.subjects.by_cohort[c] ?? 0}</td>
              <td className="num">{s.sessions.by_cohort[c] ?? 0}</td>
              <td className="num">{s.stacks.by_cohort[c] ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="meta">
        epoch {s.epoch}
        {caps.engine?.registry.schema_version !== undefined && <>, schema {caps.engine.registry.schema_version}</>}
        {names.length > 1 && <>; a subject in two cohorts counts in each</>}
      </p>
    </>
  );
}
