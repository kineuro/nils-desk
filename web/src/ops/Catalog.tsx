// SPDX-License-Identifier: AGPL-3.0-only
// Pipelines / Catalog (record 45 S6): what this engine can run, each entry by
// name and version with its pinned image, and the runs with what they made.
// Run on a selection takes a saved selection, the descriptor's parameters and
// the models or label set it reads, and shows what the run will write before
// it is queued. With no runtime, the catalog says why and offers no Run.
// Record 49 A7: the dialog shows the engine's pre-flight before Run (units,
// missing inputs and why, time, GPU, budget) and each parameter's range; a
// run's number opens its page; the assistant's analysis-plan station, where
// it is served, turns a question into a plan the person starts. Since
// 2026-10-12 a run reads as its units summed, never a bare done ("3 of 4
// made", "nothing made"), the rest on one line under its row ("4 of 4
// skipped: no FLAIR picked"), and Run again opens its pre-flight first.
// Since 2026-10-12 (Nima: "be able to select the version (simple like a drop
// down)") the catalog is one row a name with a plain select of the versions
// a new run may take, newest first; the row and the run follow the version
// chosen. A version a later one replaces because it fixes it is not offered;
// the Runs table still names each run's own version. Since 2026-10-13 each
// row says its newest run on one line, which opens it, and a run's whole row
// in the Runs table opens its page. The assistant's plan is asked on the
// Assistant page since (Nima: "the pipeline page should make user able to do
// this manually"); its run still opens here filled in.

import { Fragment, useCallback, useEffect, useState } from "react";
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
import { DoorError } from "../ask/client";
import { failureOf, refusalOf, requirementsOf, type Failure, type Requirement } from "./failure";
import { OverPicker } from "./OverPicker";
import { PreflightPanel, Requirements } from "./Preflight";
import { FailLine, FailNote } from "./Reason";
import { InstallFor, useInstall } from "./Install";
import { LanePanel, SecretsPanel } from "./PipelineSetup";
import { RuntimePanel, StartersPanel } from "./PipelineRuntime";
import { setupActs } from "./pipelineSetup";
import { runTag } from "./made";
import { lastRunOf, lastRunWords } from "./results";
import { againOfRun, RunAgainDialog, type Again } from "./RunAgain";
import { preflightGate, rangeWords, runActs, runs as runDoors, type Preflight } from "./runs";
import { andWords, catalog, catalogActs, catalogRows, imageWords, needsOf, overWords, paramError, pipelineRoles, runCommand, runCounts, writesWords, type Capability, type LabelSet, type Over, type Pipeline, type Run } from "./catalog";
import { roleWord } from "../review/mainScans";
import { softwareHrefFor } from "../settings/software";
import { packs } from "./client";
import { packError, packView, personMaySet, personOf, setByWords, valueWords, type PackView } from "./pack";

const n = (v: number) => v.toLocaleString("en-US");

type Load = { kind: "loading"; since: number } | { kind: "failed"; why: string } | { kind: "ready"; pipelines: Pipeline[]; capability: Capability | null; runs: Run[] };

/** Which of the page's two lists is drawn: the catalog, the runs (spec 13.1: each its own page in the side), or both. */
export type CatalogPart = "catalog" | "runs" | "both";

export function CatalogPage({ caps, onQueued, part = "both" }: { caps: Capabilities; onQueued: (words: string) => void; part?: CatalogPart }) {
  const [load, setLoad] = useState<Load>(() => ({ kind: "loading", since: Date.now() }));
  const [running, setRunning] = useState<Pipeline | null>(null);
  const [again, setAgain] = useState<Again | null>(null);
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
      <CatalogBody caps={caps} part={part} pipelines={load.pipelines} capability={load.capability} runs={load.runs} onRun={setRunning} onAgain={runActs(caps).queue ? (r) => setAgain(againOfRun(r)) : null} />
      {again && (
        <RunAgainDialog
          caps={caps}
          again={again}
          onClose={() => setAgain(null)}
          onDone={(w) => {
            setAgain(null);
            read();
            onQueued(w);
          }}
        />
      )}
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
export function CatalogBody({ caps, part = "both", pipelines, capability, runs, onRun, onAgain = null }: { caps: Capabilities; part?: CatalogPart; pipelines: Pipeline[]; capability: Capability | null; runs: Run[]; onRun: (p: Pipeline) => void; onAgain?: ((r: Run) => void) | null }) {
  const acts = catalogActs(caps, capability);
  const rows = catalogRows(pipelines);
  // the version chosen of each name, by id; the newest until one is chosen
  const [chosen, setChosen] = useState<Record<string, number>>({});
  const proposals = may(caps, "review:see") && served(caps, "GET /api/review");
  const opens = runActs(caps).open;
  return (
    <section className="stack roomy">
      {part !== "runs" && (
        <>
      {capability && !capability.enabled && (
        <div className="note gated">
          <Icon name="lock" />
          <div className="note-body">
            <p className="note-lead">No runtime here</p>
            <p className="note-detail">{capability.reason ?? "This engine found no container runtime, so nothing runs from here."}</p>
          </div>
        </div>
      )}
      <div className={part === "both" ? "section-head rule-top" : "section-head"}>
        {part === "both" && <h2>Catalog</h2>}
        <span className="meta">
          {n(rows.length)} {rows.length === 1 ? "pipeline" : "pipelines"}
          {capability?.runtime ? ` · ${capability.runtime.name}${capability.runtime.gpu ? " with a GPU" : ""}` : ""}
        </span>
      </div>
      {rows.length === 0 && <p className="meta">Nothing in the catalog yet. {setupActs(caps).add ? "Add a pipeline from its nils.job.yml." : "Someone with work on the install adds one."}</p>}
      {rows.length > 0 && (
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
              {rows.map((row) => {
                const p = row.versions.find((v) => v.id === chosen[row.name]) ?? row.versions[0];
                const last = lastRunOf(row.name, runs, pipelines);
                const lastWords = last ? lastRunWords(last) : null;
                return (
                  <tr key={row.name}>
                    <td>
                      <div className="catalog-name">
                        <b>{row.name}</b>
                        {row.versions.length > 1 ? (
                          <span className="input select catalog-version">
                            <select value={p.id} aria-label={`The version of ${row.name}`} onChange={(e) => setChosen((was) => ({ ...was, [row.name]: Number(e.target.value) }))}>
                              {row.versions.map((v, i) => (
                                <option key={v.id} value={v.id}>
                                  v{v.version}
                                  {i === 0 ? ", newest" : ""}
                                </option>
                              ))}
                            </select>
                          </span>
                        ) : (
                          <span className="meta">v{p.version}</span>
                        )}
                      </div>
                      {p.description && <div className="meta">{p.description}</div>}
                      {last && lastWords && (opens ? (
                        <a className={`catalog-last ${lastWords.tone}`} href={href("pipelines", "runs", String(last.id))}>
                          {lastWords.words}
                        </a>
                      ) : (
                        <span className={`catalog-last ${lastWords.tone}`}>{lastWords.words}</span>
                      ))}
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
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {acts.why && acts.see && capability?.enabled && <p className="meta">{acts.why}</p>}
      <LanePanel caps={caps} />
      <RuntimePanel caps={caps} />
      <StartersPanel caps={caps} />
      <SecretsPanel caps={caps} />
        </>
      )}
      {part !== "catalog" && (
        <>
      {part === "both" && (
        <div className="section-head rule-top">
          <h2>Runs</h2>
          <span className="meta">newest first</span>
        </div>
      )}
      {runs.length === 0 && (
        <p className="meta">
          No run yet. {part === "runs" ? <a href={href("pipelines", "catalog")}>Run a pipeline from the Catalog.</a> : "Run a pipeline above."}
        </p>
      )}
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
                // a failed run says why on one line under its row (2026-10-12)
                const f = r.status === "failed" || r.status === "partial" ? failureOf(r) : null;
                // a run that ended reads as its units summed, never a bare done, the rest on one line under its row
                const tag = runTag(r);
                const rest = f ? null : tag.rest;
                // the whole row opens the run; a link or a button inside it keeps its own
                const open = (e: { target: EventTarget | null }) => {
                  if (!opens || (e.target instanceof Element && e.target.closest("a, button"))) return;
                  location.hash = href("pipelines", "runs", String(r.id));
                };
                return (
                  <Fragment key={r.id}>
                    <tr
                      className={[f || rest ? "has-fail" : "", opens ? "openable" : ""].filter(Boolean).join(" ") || undefined}
                      tabIndex={opens ? 0 : undefined}
                      onClick={open}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") open(e);
                      }}
                    >
                      <td className="num">{opens ? <a href={href("pipelines", "runs", String(r.id))}>{r.id}</a> : r.id}</td>
                      <td>{r.pipeline}</td>
                      <td className="path" title={r.selection ?? undefined}>
                        {overWords(r.selection, pipelineRoles(pipelines.find((p) => p.id === r.pipeline_id) ?? {}))}
                      </td>
                      <td>
                        <span className={tag.className}>{tag.words}</span>
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
                    {f && <RunFailRow caps={caps} run={r} f={f} cols={8} onAgain={onAgain} />}
                    {rest && (
                      <tr className="made-row">
                        <td colSpan={8}>
                          <div className="made-line">
                            <span className="made-words" title={rest}>
                              {rest}
                            </span>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
        </>
      )}
    </section>
  );
}

/** A failed run's reason under its row, with Install where it is a tool the engine installs, and then Run again where the run can be taken up, which opens its pre-flight. */
function RunFailRow({ caps, run, f, cols, onAgain }: { caps: Capabilities; run: Run; f: Failure; cols: number; onAgain: ((r: Run) => void) | null }) {
  const again = onAgain && run.status === "failed" && !run.results_digest ? () => onAgain(run) : null;
  const install = useInstall(caps, f.fix, again, null, true);
  return (
    <tr className="fail-row">
      <td colSpan={cols}>
        <FailLine f={f}>{install.button}</FailLine>
        {install.said}
      </td>
    </tr>
  );
}

/** Run on a selection: what it runs over, its parameters and inputs, and the panel that says what it writes. */
export function RunDialog({ caps, pipeline, onClose, onDone }: { caps: Capabilities; pipeline: Pipeline; onClose: () => void; onDone: (words: string) => void }) {
  const needs = needsOf(pipeline);
  const params = pipeline.parameters ?? [];
  const [over, setOver] = useState<Over | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [chosenModels, setChosenModels] = useState<string[]>(() => needs.models.map(() => ""));
  const [labels, setLabels] = useState<string>("");
  const [modelList, setModelList] = useState<{ id: number; name: string; version: string; state: string }[]>([]);
  const [labelSets, setLabelSets] = useState<LabelSet[]>([]);
  const [busy, setBusy] = useState(false);
  // a run the jobs door refused before queueing it (409): its failure, and the checks that fail, as the pre-flight says them
  const [refused, setRefused] = useState<{ f: Failure; checks: Requirement[] } | null>(null);
  // Wave 7b (record 57 P2): the version's pack, its goal and switches, and the knobs a person may set
  const [pack, setPack] = useState<{ view: PackView | null; error: string | null } | null>(null);
  const [goal, setGoal] = useState<string | null>(null);
  const [switches, setSwitches] = useState<Record<string, string>>({});
  const [letRun, setLetRun] = useState(false);
  useEffect(() => {
    if (!served(caps, "GET /api/pipelines/{id}/pack")) return;
    packs.of(pipeline.id).then(
      (d) => setPack({ view: packView(d), error: packError(d) }),
      () => setPack(null),
    );
  }, [pipeline.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const view = pack?.view ?? null;
  const person = personOf(view, { goal, switches, let_run: letRun });
  useEffect(() => {
    if (needs.models.length > 0 && served(caps, "GET /api/models") && may(caps, "models:see")) catalog.models().then((r) => setModelList(r.models.filter((m) => m.state === "admitted" || m.state === "promoted")), () => undefined);
    if (needs.labels && served(caps, "GET /api/label-sets")) catalog.labelSets().then((r) => setLabelSets(r.label_sets.filter((s) => !s.sealed)), () => undefined);
    // the lists are read once, when the dialog opens
  }, []);
  const errors = params.map((p) => paramError(p, values[p.id] ?? "")).filter((e): e is string => e !== null);
  const missing = needs.models.some((m, i) => !m.optional && chosenModels[i] === "") || (needs.labels !== null && !needs.labels.optional && labels === "");
  // a knob the pack's rules set or the pack fixes is never sent as the person's
  const changed = Object.fromEntries(Object.entries(values).filter(([id, v]) => personMaySet(view, id) && v.trim() !== "" && String(params.find((p) => p.id === id)?.["default-value"] ?? "") !== v.trim()));
  // record 49 A7: the engine's pre-flight, asked again as the selection or a parameter changes
  const checks = runActs(caps).preflight;
  const [pre, setPre] = useState<{ key: string; p: Preflight | null; why: Failure | null } | null>(null);
  // a tool installed from the refusal asks the pre-flight again
  const [installs, setInstalls] = useState(0);
  const preKey = over && errors.length === 0 ? JSON.stringify([over, changed, installs, person]) : null;
  useEffect(() => {
    if (!checks || preKey === null || over === null) return;
    let alive = true;
    const t = setTimeout(() => {
      runDoors.preflight(pipeline.id, over, changed, person).then(
        (p) => alive && setPre({ key: preKey, p, why: null }),
        (e: unknown) => alive && setPre({ key: preKey, p: null, why: refusalOf(e) }),
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
        person,
      })
    : null;
  const judged = current?.p?.units_judged ?? null;
  const softHref = softwareHrefFor(caps);
  const go = () => {
    if (!command) return;
    setBusy(true);
    setRefused(null);
    runDoors.queue(command).then(
      (j) => onDone(`Queued ${pipeline.label} as job ${j.job}.`),
      (e: unknown) => {
        setBusy(false);
        setRefused({ f: refusalOf(e), checks: requirementsOf(e instanceof DoorError ? e.body : null) });
      },
    );
  };
  return (
    <Dialog
      title={`Run ${pipeline.label}`}
      icon="play"
      onClose={onClose}
      foot={
        <>
          {refused && (
            <FailNote f={refused.f} lead="Not queued" software={softHref}>
              <Requirements checks={refused.checks.filter((c) => !c.ok)} software={softHref} />
              <InstallFor caps={caps} f={refused.f} onInstalled={() => setRefused(null)} />
            </FailNote>
          )}
          <div className="row actions">
            <button type="button" className="button" disabled={!ready} onClick={go}>
              Run
            </button>
            <button type="button" className="button secondary" onClick={onClose}>
              Cancel
            </button>
          </div>
        </>
      }
    >
      <OverPicker caps={caps} over={over} onOver={setOver} needs={pipelineRoles(pipeline)} />
      {pack?.error && <p className="warn">This version&apos;s pack cannot be read here: {pack.error}</p>}
      {view && view.goals.length > 0 && (
        <div className="field">
          <span className="label">Goal</span>
          <div className="chips" role="group" aria-label="the run's goal">
            {view.goals.map((g) => (
              <button key={g} type="button" className={(goal ?? view.defaults.goal) === g ? "opt on" : "opt"} aria-pressed={(goal ?? view.defaults.goal) === g} onClick={() => setGoal(g)}>
                {g}
              </button>
            ))}
          </div>
        </div>
      )}
      {view &&
        Object.entries(view.switches).map(([k, vs]) => {
          const on = switches[k] ?? view.defaults[k] ?? vs[0];
          const what = view.knobs[k]?.what ?? null;
          return (
            <div key={k} className="field">
              <span className="label" title={what ?? undefined}>
                {k[0].toUpperCase() + k.slice(1).replace(/_/gu, " ")}
              </span>
              <div className="chips" role="group" aria-label={`the switch ${k}`}>
                {vs.map((v) => (
                  <button key={v} type="button" className={on === v ? "opt on" : "opt"} aria-pressed={on === v} onClick={() => setSwitches((was) => ({ ...was, [k]: v }))}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      {params.filter((p) => !personMaySet(view, p.id)).map((p) => (
        <div key={p.id} className="field">
          <span className="label">{p.name}</span>
          <span className="knob-fixed">{view!.knobs[p.id].set_by === "fixed" ? `fixed at ${valueWords(view!.knobs[p.id].default ?? p["default-value"])}` : `per unit, ${setByWords(view!, p.id)}`}</span>
        </div>
      ))}
      {params.filter((p) => personMaySet(view, p.id)).map((p) => (
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
      {checks && over !== null && <PreflightPanel p={current?.p ?? null} checking={current === null && errors.length === 0} why={current?.why ?? null} software={softHref} act={(f) => <InstallFor caps={caps} f={f} onInstalled={() => setInstalls((k) => k + 1)} />} />}
      {view && ((judged?.cannot_tell ?? 0) > 0 || letRun) && (
        <label className="check-row">
          <input type="checkbox" checked={letRun} onChange={(e) => setLetRun(e.target.checked)} />
          <span>
            {judged && judged.cannot_tell === 1 ? "Run the unit the registry cannot tell about" : `Run the ${judged && judged.cannot_tell > 0 ? `${n(judged.cannot_tell)} ` : ""}units the registry cannot tell about`} <span className="meta">recorded as your choice</span>
          </span>
        </label>
      )}
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
        {over && "main" in over
          ? over.main.role
            ? `The ${over.main.kind}'s main ${roleWord(over.main.role)} scans are resolved when the run starts, one a visit as its main-scan rules pick them, and frozen and pinned with the rules they were read under`
            : `The ${over.main.kind}'s main ${andWords((over.main.roles ?? pipelineRoles(pipeline)).map(roleWord))} scans are resolved when the run starts, one of each a visit as its main-scan rules pick them, a visit taken where it has each, and frozen and pinned with the rules they were read under`
          : "The selection is frozen into its stacks when the run starts and pinned"}
        , every parameter is recorded with its default filled, and the image is the one the catalog pins. A model&apos;s proposals are evidence until a person commits them.
      </Says>
    </Dialog>
  );
}
