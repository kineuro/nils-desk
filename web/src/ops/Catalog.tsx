// SPDX-License-Identifier: AGPL-3.0-only
// Pipelines / Catalog (record 45 S6): what this engine can run, each entry by
// name and version with its pinned image, and the runs with what they made.
// Run on a selection takes a saved selection, the descriptor's parameters and
// the models or label set it reads, and shows what the run will write before
// it is queued. With no runtime, the catalog says why and offers no Run.
// Record 49 A7: the dialog shows the engine's pre-flight before Run (units,
// missing inputs and why, time, GPU, budget) and each parameter's range; a
// run's number opens its page; the assistant's analysis-plan station, where
// it is served, turns a question into a plan the person starts.

import { useCallback, useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { whenWords } from "../data/sources";
import { door as served } from "../deployment";
import { may } from "../grants";
import { engineWords } from "../models/ModelsPage";
import { href } from "../routes";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { Says } from "../ui/Says";
import { Wait } from "../ui/Wait";
import { stations } from "../assistant/stations";
import { plansOffered } from "./PlanPage";
import { PreflightPanel } from "./Preflight";
import { PLAN_STATION, preflightGate, rangeWords, runActs, runs as runDoors, type Preflight } from "./runs";
import { catalog, catalogActs, imageWords, needsOf, paramError, runCommand, runCounts, writesWords, type Capability, type LabelSet, type Over, type Pipeline, type Run } from "./catalog";
import { ops } from "./client";

const n = (v: number) => v.toLocaleString("en-US");

type Load = { kind: "loading"; since: number } | { kind: "failed"; why: string } | { kind: "ready"; pipelines: Pipeline[]; capability: Capability | null; runs: Run[] };

export function CatalogPage({ caps, onQueued }: { caps: Capabilities; onQueued: (words: string) => void }) {
  const [load, setLoad] = useState<Load>(() => ({ kind: "loading", since: Date.now() }));
  const [running, setRunning] = useState<Pipeline | null>(null);
  const read = useCallback(() => {
    Promise.all([catalog.list(), served(caps, "GET /api/pipeline-runs") ? catalog.runs(50).catch(() => ({ runs: [] as Run[] })) : Promise.resolve({ runs: [] as Run[] })]).then(
      ([c, r]) => setLoad({ kind: "ready", pipelines: c.pipelines, capability: c.capability ?? null, runs: r.runs }),
      (e: unknown) => setLoad({ kind: "failed", why: engineWords(e) }),
    );
  }, [caps]);
  useEffect(read, [read]);
  if (load.kind === "loading") return <Wait phase="reading the catalog" since={load.since} size="panel" />;
  if (load.kind === "failed") return <p className="warn">The catalog could not be read: {load.why}</p>;
  return (
    <>
      {plansOffered(caps) && <PlanAsk />}
      <CatalogBody caps={caps} pipelines={load.pipelines} capability={load.capability} runs={load.runs} onRun={setRunning} />
      {running && (
        <RunDialog
          caps={caps}
          pipeline={running}
          onClose={() => setRunning(null)}
          onDone={(w) => {
            setRunning(null);
            read();
            onQueued(w);
          }}
        />
      )}
    </>
  );
}

/** The catalog and the runs, as the page draws them from what it read. */
export function CatalogBody({ caps, pipelines, capability, runs, onRun }: { caps: Capabilities; pipelines: Pipeline[]; capability: Capability | null; runs: Run[]; onRun: (p: Pipeline) => void }) {
  const acts = catalogActs(caps, capability);
  const active = pipelines.filter((p) => p.state !== "retired");
  const proposals = may(caps, "review:see") && served(caps, "GET /api/review");
  const opens = runActs(caps).open;
  return (
    <section className="stack roomy">
      {capability && !capability.enabled && (
        <div className="note gated">
          <Icon name="lock" />
          <div className="note-body">
            <p className="note-lead">No runtime here</p>
            <p className="note-detail">{capability.reason ?? "This engine found no container runtime, so nothing runs from here."}</p>
          </div>
        </div>
      )}
      <div className="section-head rule-top">
        <h2>Catalog</h2>
        <span className="meta">
          {n(active.length)} {active.length === 1 ? "pipeline" : "pipelines"}
          {capability?.runtime ? ` · ${capability.runtime.name}${capability.runtime.gpu ? " with a GPU" : ""}` : ""}
        </span>
      </div>
      {active.length === 0 && <p className="meta">Nothing in the catalog. A pipeline is added at the command line, pinned by its image digest.</p>}
      {active.length > 0 && (
        <div className="table-wrap">
          <table className="thin">
            <thead>
              <tr>
                <th>Pipeline</th>
                <th>Unit</th>
                <th>Image</th>
                <th>Writes</th>
                <th className="acts" />
              </tr>
            </thead>
            <tbody>
              {active.map((p) => (
                <tr key={p.id}>
                  <td>
                    <b>{p.label}</b>
                    {p.description && <div className="meta">{p.description}</div>}
                  </td>
                  <td>
                    {p.level} · {p.layout}
                  </td>
                  <td className="path" title={p.image}>
                    {imageWords(p)}
                  </td>
                  <td className="meta">{writesWords(p)}</td>
                  <td className="acts">{acts.run && <button type="button" className="button small" onClick={() => onRun(p)}>Run on a selection</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {acts.why && acts.see && capability?.enabled && <p className="meta">{acts.why}</p>}
      <div className="section-head rule-top">
        <h2>Runs</h2>
        <span className="meta">newest first</span>
      </div>
      {runs.length === 0 && <p className="meta">No run yet.</p>}
      {runs.length > 0 && (
        <div className="table-wrap">
          <table className="thin">
            <thead>
              <tr>
                <th>Run</th>
                <th>Pipeline</th>
                <th>Over</th>
                <th>State</th>
                <th className="num">Units</th>
                <th className="num">Files</th>
                <th className="num">Staged</th>
                <th className="num">Since</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => {
                const c = runCounts(r);
                return (
                  <tr key={r.id}>
                    <td className="num">{opens ? <a href={href("pipelines", "runs", String(r.id))}>{r.id}</a> : r.id}</td>
                    <td>{r.pipeline}</td>
                    <td className="path">{r.selection ?? ""}</td>
                    <td>
                      <span className={r.status === "done" ? "tag ok" : r.status === "failed" || r.status === "partial" ? "tag caution" : "tag"}>{r.status}</span>
                      {c.models > 0 && <span className="meta"> · {n(c.models)} model{c.models === 1 ? "" : "s"}</span>}
                    </td>
                    <td className="num">
                      {n(c.units)}
                      {c.failed > 0 ? ` · ${n(c.failed)} failed` : ""}
                    </td>
                    <td className="num">{n(c.derivatives)}</td>
                    <td className="num">{c.staged > 0 && proposals ? <a href={href("review", "proposals")}>{n(c.staged)}</a> : n(c.staged)}</td>
                    <td className="num">{whenWords(r.started_at ?? "")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Run on a selection: what it runs over, its parameters and inputs, and the panel that says what it writes. */
export function RunDialog({ caps, pipeline, onClose, onDone }: { caps: Capabilities; pipeline: Pipeline; onClose: () => void; onDone: (words: string) => void }) {
  const needs = needsOf(pipeline);
  const params = pipeline.parameters ?? [];
  const [selection, setSelection] = useState("");
  const [over, setOver] = useState<Over | null>(null);
  const [overWhy, setOverWhy] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [chosenModels, setChosenModels] = useState<string[]>(() => needs.models.map(() => ""));
  const [labels, setLabels] = useState<string>("");
  const [modelList, setModelList] = useState<{ id: number; name: string; version: string; state: string }[]>([]);
  const [labelSets, setLabelSets] = useState<LabelSet[]>([]);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  useEffect(() => {
    if (needs.models.length > 0 && served(caps, "GET /api/models") && may(caps, "models:see")) catalog.models().then((r) => setModelList(r.models.filter((m) => m.state === "admitted" || m.state === "promoted")), () => undefined);
    if (needs.labels && served(caps, "GET /api/label-sets")) catalog.labelSets().then((r) => setLabelSets(r.label_sets.filter((s) => !s.sealed)), () => undefined);
    // the lists are read once, when the dialog opens
  }, []);
  const find = () => {
    setOver(null);
    setOverWhy(null);
    const name = selection.trim();
    if (name === "") return;
    catalog.selection(name).then(
      (s) => setOver({ selection: s.name, version: s.version }),
      (e: unknown) => setOverWhy(engineWords(e)),
    );
  };
  const errors = params.map((p) => paramError(p, values[p.id] ?? "")).filter((e): e is string => e !== null);
  const missing = needs.models.some((m, i) => !m.optional && chosenModels[i] === "") || (needs.labels !== null && !needs.labels.optional && labels === "");
  const changed = Object.fromEntries(Object.entries(values).filter(([id, v]) => v.trim() !== "" && String(params.find((p) => p.id === id)?.["default-value"] ?? "") !== v.trim()));
  // record 49 A7: the engine's pre-flight, asked again as the selection or a parameter changes
  const checks = runActs(caps).preflight;
  const [pre, setPre] = useState<{ key: string; p: Preflight | null; why: string | null } | null>(null);
  const preKey = over && errors.length === 0 ? JSON.stringify([over, changed]) : null;
  useEffect(() => {
    if (!checks || preKey === null || over === null) return;
    let alive = true;
    const t = setTimeout(() => {
      runDoors.preflight(pipeline.id, over, changed).then(
        (p) => alive && setPre({ key: preKey, p, why: null }),
        (e: unknown) => alive && setPre({ key: preKey, p: null, why: engineWords(e) }),
      );
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [checks, preKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const current = pre !== null && pre.key === preKey ? pre : null;
  const gate = preflightGate(current?.p ?? null);
  const checked = !checks || (current !== null && current.p !== null);
  const ready = over !== null && errors.length === 0 && !missing && !busy && checked && gate.go;
  const command = over
    ? runCommand({
        pipeline,
        over,
        params: changed,
        models: chosenModels.filter((m) => m !== ""),
        labels: labels === "" ? null : Number(labels),
      })
    : null;
  const go = () => {
    if (!command) return;
    setBusy(true);
    setRefused(null);
    ops.enqueue(command).then(
      (j) => onDone(`Queued ${pipeline.label} as job ${j.job}.`),
      (e: unknown) => {
        setBusy(false);
        setRefused(e instanceof Error ? e.message : String(e));
      },
    );
  };
  return (
    <Dialog
      title={`Run ${pipeline.label}`}
      icon="play"
      onClose={onClose}
      foot={
        <div className="row actions">
          <button type="button" className="button" disabled={!ready} onClick={go}>
            Run
          </button>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          {refused && <span className="warn">{refused}</span>}
        </div>
      }
    >
      <div className="field">
        <span className="label">Over the selection</span>
        <div className="field-row">
          <span className="input">
            <input value={selection} placeholder="name, or name@version" aria-label="The selection" onChange={(e) => setSelection(e.target.value)} onBlur={find} />
          </span>
          <button type="button" className="button secondary small" onClick={find}>
            Find
          </button>
        </div>
        {over && "selection" in over && <span className="meta">selection:{over.selection}@{over.version}, frozen when the run starts</span>}
        {overWhy && <span className="warn">{overWhy}</span>}
      </div>
      {params.map((p) => (
        <div key={p.id} className="field">
          <span className="label">{p.name}</span>
          <span className="input">
            {p["value-choices"] ? (
              <select value={values[p.id] ?? String(p["default-value"] ?? "")} aria-label={p.name} onChange={(e) => setValues((v) => ({ ...v, [p.id]: e.target.value }))}>
                {p.optional && p["default-value"] === undefined && <option value="">default</option>}
                {p["value-choices"].map((c) => (
                  <option key={String(c)} value={String(c)}>
                    {String(c)}
                  </option>
                ))}
              </select>
            ) : (
              <input value={values[p.id] ?? ""} placeholder={p["default-value"] !== undefined ? String(p["default-value"]) : p.optional ? "optional" : ""} aria-label={p.name} onChange={(e) => setValues((v) => ({ ...v, [p.id]: e.target.value }))} />
            )}
          </span>
          {paramError(p, values[p.id] ?? "") ? <span className="warn">{paramError(p, values[p.id] ?? "")}</span> : rangeWords(p) && <span className="meta">{rangeWords(p)}</span>}
        </div>
      ))}
      {needs.models.map((m, i) => (
        <div key={m.id} className="field">
          <span className="label">Model: {m.id}</span>
          <span className="input select">
            <select value={chosenModels[i]} aria-label={`The model for ${m.id}`} onChange={(e) => setChosenModels((was) => was.map((x, j) => (j === i ? e.target.value : x)))}>
              <option value="">{m.optional ? "none" : "choose an admitted model"}</option>
              {modelList.map((x) => (
                <option key={x.id} value={`${x.name}@${x.version}`}>
                  {x.name}@{x.version} · {x.state}
                </option>
              ))}
            </select>
          </span>
        </div>
      ))}
      {needs.labels && (
        <div className="field">
          <span className="label">Label set</span>
          <span className="input select">
            <select value={labels} aria-label="The label set" onChange={(e) => setLabels(e.target.value)}>
              <option value="">{needs.labels.optional ? "none" : "choose a label set"}</option>
              {labelSets.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.name} v{s.version}
                  {s.rows != null ? ` · ${n(s.rows)} rows` : ""}
                </option>
              ))}
            </select>
          </span>
        </div>
      )}
      {checks && over !== null && <PreflightPanel p={current?.p ?? null} checking={current === null && errors.length === 0} why={current?.why ?? null} />}
      <div className="note brand">
        <Icon name="info" />
        <div className="note-body">
          <p className="note-lead">What the run writes</p>
          <p className="note-detail">
            {writesWords(pipeline) || "files per unit"}, under the working place. Each {pipeline.level} of the selection is one unit; a unit that fails is one item in Review.
            {pipeline.needs?.gpu === "required" ? " It needs a GPU." : pipeline.needs?.gpu === "optional" ? " It uses a GPU where there is one." : ""}
          </p>
          {command && <code>nils {command.join(" ")}</code>}
        </div>
      </div>
      <Says head="What a run is">
        The selection is frozen into its stacks when the run starts and pinned, every parameter is recorded with its default filled, and the image is the one the catalog pins. A model&apos;s proposals are evidence until a person commits them.
      </Says>
    </Dialog>
  );
}

/** A question to the assistant's analysis-plan station; its plan opens as a run filled in, which the person starts. */
function PlanAsk() {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<string | null>(null);
  const ask = () => {
    const q = question.trim();
    if (q === "") return;
    setBusy(true);
    setWhy(null);
    stations.start(PLAN_STATION, q).then(
      (r) => {
        location.hash = href("pipelines", "plan", r.run);
      },
      (e: unknown) => {
        setBusy(false);
        setWhy(engineWords(e));
      },
    );
  };
  return (
    <div className="field">
      <span className="label">Plan with the assistant</span>
      <div className="field-row">
        <span className="input grow">
          <input value={question} placeholder="hippocampal volume in the MS patients with a 3D T1" aria-label="The question to plan a run for" onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()} />
        </span>
        <button type="button" className="button secondary small" disabled={busy || question.trim() === ""} onClick={ask}>
          Plan
        </button>
      </div>
      {why && <span className="warn">{why}</span>}
    </div>
  );
}
