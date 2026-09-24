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
import { catalog, runCommand, type Over, type Pipeline } from "./catalog";
import { ops } from "./client";
import { PreflightPanel } from "./Preflight";
import { handleGone, PLAN_STATION, pipelineOf, planSelectionName, preflightGate, rangeWords, runActs, runDocumentOf, runs, type Preflight, type RunDocument } from "./runs";


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
      const read = runDocumentOf(await stations.verdict(id));
      if ("refused" in read) throw new Error(read.refused);
      const doc = read.doc;
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

/** The plan with a live pre-flight and the one button that starts it; where the plan's handle is gone, its proposed ask saved as a selection first. */
export function PlanRunner({ caps, doc, pipeline }: { caps: Capabilities; doc: RunDocument; pipeline: Pipeline | null }) {
  const acts = runActs(caps);
  const [over, setOver] = useState<Over>(doc.over);
  const [live, setLive] = useState<Preflight | null>(null);
  const [liveWhy, setLiveWhy] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const overKey = JSON.stringify(over);
  useEffect(() => {
    if (!pipeline || !acts.preflight) return;
    setLive(null);
    setLiveWhy(null);
    runs.preflight(pipeline.id, over, doc.params).then(
      (p) => {
        setLive(p);
        setGone(false);
      },
      (e: unknown) => {
        const words = engineWords(e);
        setLiveWhy(words);
        setGone("handle" in over && handleGone(words));
      },
    );
  }, [pipeline?.id, acts.preflight, overKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = (name: string) => {
    if (doc.proposed === null) return;
    setBusy(true);
    setSaid(null);
    runs.saveSelection(name, doc.proposed).then(
      (s) => {
        setBusy(false);
        setSaid(`Saved as selection:${s.name}@${s.version}; checked again before it runs.`);
        setOver({ selection: s.name, version: s.version });
      },
      (e: unknown) => {
        setBusy(false);
        setSaid(engineWords(e));
      },
    );
  };
  const start = () => {
    if (!pipeline) return;
    setBusy(true);
    setSaid(null);
    ops
      .enqueue(runCommand({ pipeline, over, params: doc.params, models: [], labels: null }))
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
        const words = engineWords(e);
        setBusy(false);
        setSaid(words);
        if ("handle" in over && handleGone(words)) setGone(true);
      });
  };
  return (
    <PlanView
      caps={caps}
      doc={doc}
      over={over}
      pipeline={pipeline}
      live={live}
      liveWhy={liveWhy}
      busy={busy}
      said={said}
      onStart={acts.queue && pipeline ? start : null}
      gone={gone}
      onSave={gone && acts.save && doc.proposed !== null ? save : null}
    />
  );
}

/** The plan as the page draws it. */
export function PlanView(props: {
  caps: Capabilities;
  doc: RunDocument;
  /** What the run goes over now: the plan's own, or the selection its proposed ask was saved as. */
  over?: Over;
  pipeline: Pipeline | null;
  live: Preflight | null;
  liveWhy: string | null;
  busy: boolean;
  said: string | null;
  onStart: (() => void) | null;
  /** The plan's handle is gone, as the engine said. */
  gone?: boolean;
  onSave?: ((name: string) => void) | null;
}) {
  const { caps, doc, pipeline, live, liveWhy, busy, said, onStart, gone = false, onSave = null } = props;
  const acts = runActs(caps);
  const target = props.over ?? doc.over;
  const moved = JSON.stringify(target) !== JSON.stringify(doc.over);
  const shown = live ?? (moved || gone ? null : doc.preflight);
  // with the door, only a fresh pre-flight of what the run goes over now lets Start go
  const gate = acts.preflight ? (live === null ? { go: false, why: liveWhy } : preflightGate(live)) : preflightGate(doc.preflight);
  const overWords = "selection" in target ? `selection:${target.selection}@${target.version}` : `handle ${target.handle}`;
  const params = pipeline?.parameters ?? [];
  const [name, setName] = useState(() => planSelectionName(doc.question));
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
              <td className="path">{overWords}</td>
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
      {gone ? (
        <div className="note caution">
          <Icon name="alert" />
          <div className="note-body">
            <p className="note-lead">The plan&apos;s stacks are no longer kept</p>
            {onSave ? (
              <>
                <p className="note-detail">Save the assistant&apos;s question as a selection; the run then goes over it, after a fresh pre-flight.</p>
                <div className="field-row">
                  <span className="input grow">
                    <input value={name} aria-label="The selection's name" onChange={(e) => setName(e.target.value)} />
                  </span>
                  <button type="button" className="button secondary small" disabled={busy || name.trim() === ""} onClick={() => onSave(name.trim())}>
                    Save as a selection
                  </button>
                </div>
              </>
            ) : (
              <p className="note-detail">{doc.proposed === null ? "The plan holds no question to save as a selection; ask the assistant again." : "Saving it as a selection needs Query: Work at detail quasi."}</p>
            )}
          </div>
        </div>
      ) : (
        <PreflightPanel p={shown} checking={acts.preflight && live === null && liveWhy === null && pipeline !== null} why={liveWhy} />
      )}
      {!acts.preflight && doc.preflight && <p className="meta">The pre-flight as the assistant saw it; this engine does not check again.</p>}
      <div className="row actions">
        {onStart ? (
          <button type="button" className="button" disabled={busy || gone || !gate.go} onClick={onStart}>
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
