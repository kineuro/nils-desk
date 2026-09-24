// SPDX-License-Identifier: AGPL-3.0-only
// Pipelines / the assistant's plan (record 49 A5, A7): the analysis-plan
// station turns a question into a run document (the selection, the pipeline
// and its version, the parameters, the pre-flight it saw, and why). The desk
// shows it as a run already filled in, checks it again with the engine's
// pre-flight, and offers one button: the person starts it (R5). Nothing runs
// before that press. Where the assistant serves no analysis-plan station the
// Catalog offers no plan, and this page says what it could not read.

import { useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { stations, stationsServed } from "../assistant/stations";
import { engineWords } from "../models/ModelsPage";
import { href } from "../routes";
import { Icon } from "../ui/Icon";
import { Says } from "../ui/Says";
import { Wait } from "../ui/Wait";
import { catalog, runCommand, type Pipeline } from "./catalog";
import { ops } from "./client";
import { PreflightPanel } from "./Preflight";
import { pipelineOf, preflightGate, rangeWords, runActs, runDocumentOf, runs, type Preflight, type RunDocument } from "./runs";

/** The station that plans runs, where the assistant serves it. */
export const PLAN_STATION = "analysis-plan";

export function plansOffered(caps: Capabilities): boolean {
  return stationsServed(caps).includes(PLAN_STATION);
}

type Load = { kind: "loading"; since: number; words: string } | { kind: "failed"; why: string } | { kind: "ready"; doc: RunDocument; pipeline: Pipeline | null };

/** Waits for the station's run to settle, then reads its run document. */
export function PlanPage({ caps, id }: { caps: Capabilities; id: string }) {
  const [load, setLoad] = useState<Load>(() => ({ kind: "loading", since: Date.now(), words: "reading the plan" }));
  useEffect(() => {
    let alive = true;
    const settle = async () => {
      let run = await stations.run(id);
      while (alive && (run.state === "queued" || run.state === "running")) {
        setLoad((was) => (was.kind === "loading" ? { ...was, words: "the assistant is planning" } : was));
        await new Promise((r) => setTimeout(r, 3000));
        run = await stations.run(id);
      }
      if (run.state !== "settled") throw new Error(run.error ?? `the station's run ${run.state}`);
      const v = await stations.verdict(id);
      const doc = v ? runDocumentOf(v.result) : null;
      if (!doc) throw new Error("the station settled with no run document");
      const c = await catalog.list();
      return { doc, pipeline: pipelineOf(c.pipelines, doc.pipeline) };
    };
    settle().then(
      (r) => alive && setLoad({ kind: "ready", ...r }),
      (e: unknown) => alive && setLoad({ kind: "failed", why: engineWords(e) }),
    );
    return () => {
      alive = false;
    };
  }, [id]);
  if (load.kind === "loading") return <Wait phase={load.words} since={load.since} size="panel" />;
  if (load.kind === "failed") return <p className="warn">The plan could not be read: {load.why}</p>;
  return <PlanRunner caps={caps} doc={load.doc} pipeline={load.pipeline} />;
}

/** The plan with a live pre-flight and the one button that starts it. */
export function PlanRunner({ caps, doc, pipeline }: { caps: Capabilities; doc: RunDocument; pipeline: Pipeline | null }) {
  const acts = runActs(caps);
  const [live, setLive] = useState<Preflight | null>(null);
  const [liveWhy, setLiveWhy] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  useEffect(() => {
    if (!pipeline || !acts.preflight) return;
    runs.preflight(pipeline.id, doc.over, doc.params).then(setLive, (e: unknown) => setLiveWhy(engineWords(e)));
  }, [pipeline?.id, acts.preflight]); // eslint-disable-line react-hooks/exhaustive-deps
  const start = () => {
    if (!pipeline) return;
    setBusy(true);
    setSaid(null);
    ops
      .enqueue(runCommand({ pipeline, over: doc.over, params: doc.params, models: [], labels: null }))
      .then(async (j) => {
        setSaid(`Queued as job ${j.job}.`);
        // the run's row exists once the lane takes the job; open it then
        for (let i = 0; i < 20; i++) {
          const r = await catalog.runs(20).catch(() => ({ runs: [] }));
          const mine = r.runs.find((x) => x.job_id === j.job);
          if (mine) {
            location.hash = href("pipelines", "runs", String(mine.id));
            return;
          }
          await new Promise((res) => setTimeout(res, 1500));
        }
      })
      .catch((e: unknown) => {
        setBusy(false);
        setSaid(engineWords(e));
      });
  };
  return <PlanView caps={caps} doc={doc} pipeline={pipeline} live={live} liveWhy={liveWhy} busy={busy} said={said} onStart={acts.queue && pipeline ? start : null} />;
}

/** The plan as the page draws it. */
export function PlanView({ caps, doc, pipeline, live, liveWhy, busy, said, onStart }: { caps: Capabilities; doc: RunDocument; pipeline: Pipeline | null; live: Preflight | null; liveWhy: string | null; busy: boolean; said: string | null; onStart: (() => void) | null }) {
  const acts = runActs(caps);
  const shown = live ?? doc.preflight;
  const gate = preflightGate(acts.preflight ? live : doc.preflight);
  const over = "selection" in doc.over ? `selection:${doc.over.selection}@${doc.over.version}` : `handle ${doc.over.handle}`;
  const params = pipeline?.parameters ?? [];
  return (
    <section className="stack roomy plan-page">
      {doc.question && <p className="lede">{doc.question}</p>}
      <div className="note brand">
        <Icon name="assistant" />
        <div className="note-body">
          <p className="note-lead">The assistant&apos;s plan</p>
          {doc.why && <p className="note-detail">{doc.why}</p>}
        </div>
      </div>
      <div className="table-wrap">
        <table className="thin">
          <tbody>
            <tr>
              <th>Pipeline</th>
              <td>
                <b>{pipeline?.label ?? doc.pipeline}</b>
                {pipeline?.description && <div className="meta">{pipeline.description}</div>}
              </td>
            </tr>
            <tr>
              <th>Over</th>
              <td className="path">{over}</td>
            </tr>
            {params.map((p) => (
              <tr key={p.id}>
                <th>{p.name}</th>
                <td>
                  {doc.params[p.id] ?? String(p["default-value"] ?? "")}
                  {doc.params[p.id] === undefined && <span className="meta"> · default</span>}
                  {rangeWords(p) && <span className="meta"> · {rangeWords(p)}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pipeline === null && <p className="warn">The catalog holds no pipeline {doc.pipeline}, so this plan cannot run here.</p>}
      <PreflightPanel p={shown} checking={acts.preflight && live === null && liveWhy === null && pipeline !== null} why={liveWhy} />
      {!acts.preflight && doc.preflight && <p className="meta">The pre-flight as the assistant saw it; this engine does not check again.</p>}
      <div className="row actions">
        {onStart ? (
          <button type="button" className="button" disabled={busy || !gate.go} onClick={onStart}>
            <Icon name="play" />
            Start this run
          </button>
        ) : (
          <span className="meta">{acts.queue ? "" : "Starting a run needs Pipelines: Work at detail quasi."}</span>
        )}
        {said && <span className="meta">{said}</span>}
      </div>
      <Says head="What starting it does">
        The selection is frozen into its stacks and pinned, every parameter is recorded, and the image is the one the catalog pins. The assistant proposed this run; only your press starts it.
      </Says>
    </section>
  );
}
