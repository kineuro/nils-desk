// SPDX-License-Identifier: AGPL-3.0-only
// Workflows on the Pipelines page (Wave 7b spec sections 8.1 to 8.5; record
// 57 P7): a workflow's own page shows its steps and links as the document
// says them, takes the scope as the pipelines door takes it (a selection, or
// a dataset's or a cohort's main scans), the goal and the knobs a person may
// set per step, and asks the engine's plan: each link drawn with its verdict
// and words (satisfied, missing, redundant, refused, fed) and each step's
// pre-flight (its units, the inputs a link feeds, the steps it waits for
// whole, a family's routing); `runnable` decides whether Start is offered,
// and Start posts the run and opens the run's page. A workflow run's page
// lists its steps with their status and unit counts, each step's pipeline
// run linked, the sum line, and Cancel where the job is open. A workflow is
// added by hand by pasting or uploading its nils.workflow.yml (install:work).
// The assistant's plan opens here as a workflow filled in: the address may
// carry the scope (?select=main@dataset:<name>) and the goal, and the plan is
// asked at once.

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import type { Capabilities } from "../capabilities";
import { whenWords } from "../data/sources";
import { door as served } from "../deployment";
import { href } from "../routes";
import { messageOf } from "../settings/common";
import { Dialog } from "../ui/Dialog";
import { Hint } from "../ui/Hint";
import { Icon } from "../ui/Icon";
import { Says, Values } from "../ui/Says";
import { Wait } from "../ui/Wait";
import { catalog, mainOfSpec, overWords, pipelineRoles, selectOf, type Over, type Pipeline } from "./catalog";
import { ops, workflows, type PlanLink, type PlanStep, type WorkflowDoc, type WorkflowPlan, type WorkflowRow, type WorkflowRun } from "./client";
import { OverPicker } from "./OverPicker";
import { TextOrFile } from "./PipelineSetup";
import { cancellable, workflowRunOfJob, knobIds, linkWords, planBody, runSums, statusTone, stepPreflight, stepRuns, stepUnitsWords, typeWords, verdictCounts, verdictTone, workflowActs, workflowHref, workflowRunHref, workflowRunTag } from "./workflows";

const n = (v: number) => v.toLocaleString("en-US");
const GOALS = ["fast", "standard", "research"];

/* ---------------------------------------------------------------- the steps and links, as the document says them */

/** The steps in order, each with what it runs, its goal and switches, the knobs a person may set, and the links into it; with a plan, each link's verdict. */
export function WorkflowSteps({ doc, plan = null, children }: { doc: WorkflowDoc; plan?: WorkflowPlan | null; children?: (step: PlanStep | null, id: string) => React.ReactNode }) {
  const planStep = (id: string) => plan?.steps.find((s) => s.step === id) ?? null;
  const planLinks = (id: string) => (plan?.links ?? []).filter((l) => l.to.step === id);
  return (
    <ol className="wf-steps" aria-label="the workflow's steps">
      {doc.steps.map((s, i) => {
        const ps = planStep(s.id);
        const links = plan ? planLinks(s.id) : doc.links.filter((l) => l.to.startsWith(`${s.id}.`)).map((l): PlanLink => ({ from: { step: l.from.split(".")[0], output: l.from.split(".").slice(1).join(".") }, to: { step: s.id, input: l.to.split(".").slice(1).join(".") }, verdict: "" }));
        const switches = Object.entries(s.switches ?? {});
        const knobs = knobIds(s);
        const refused = ps?.refused ?? null;
        return (
          <li key={s.id} className={refused ? "wf-step refused" : "wf-step"}>
            <span className={`stepno${refused ? " attention" : ""}`}>{i + 1}</span>
            <div className="step-body">
              <div className="wf-step-head">
                <b>{s.id}</b>
                <span className="meta">
                  {s.family ? `family ${stepRuns(s)}` : stepRuns(s)}
                  {s.goal ? ` · goal ${s.goal}` : ""}
                </span>
                {switches.map(([k, v]) => (
                  <span key={k} className="tag" title={s.family ? "the family's task, as the document fixes it" : "a switch the document fixes"}>
                    {k} {String(v)}
                  </span>
                ))}
                {knobs.length > 0 && <span className="meta">knobs {knobs.join(", ")}</span>}
              </div>
              {links.length > 0 && (
                <div className="wf-links">
                  {links.map((l, j) => (
                    <LinkLine key={`${l.link ?? j}`} l={l} planned={plan !== null} />
                  ))}
                </div>
              )}
              {refused && <span className="unit-flag drop">{refused}</span>}
              {children?.(ps, s.id)}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** One link as an arrow with, once planned, its verdict tag and the plan's words; the types on hover. */
export function LinkLine({ l, planned }: { l: PlanLink; planned: boolean }) {
  const tone = verdictTone(l.verdict);
  const types = [l.from?.type ? `from ${typeWords(l.from.type)}` : null, l.to.type ? `to ${typeWords(l.to.type)}` : null].filter(Boolean).join("; ");
  return (
    <div className={`wf-link ${tone}`} title={types || undefined}>
      <span className="wf-arrow">{linkWords(l)}</span>
      {planned && l.verdict && <span className={tone === "neutral" ? "tag" : `tag ${tone}`}>{l.verdict}</span>}
      {planned && l.words && <span className="meta wf-words">{l.words}</span>}
    </div>
  );
}

/* ---------------------------------------------------------------- the plan */

/** A step's pre-flight in a line: units, the inputs fed, the steps it waits for whole, a family's routing, its blockers. */
export function StepPreflight({ s }: { s: PlanStep }) {
  const p = stepPreflight(s);
  const cells: string[] = [];
  if (p.units) cells.push(`${n(p.units.total ?? 0)} ${p.units.total === 1 ? "unit" : "units"}${(p.units.missing ?? 0) > 0 ? `, ${n(p.units.missing ?? 0)} missing` : ""}`);
  if (p.family) {
    const counts = Object.entries(p.family.counts);
    cells.push(`${p.family.task ? `task ${p.family.task}` : "the family"}${p.family.units !== null ? `, ${n(p.family.units)} ${p.family.units === 1 ? "unit" : "units"}` : ""}${counts.length > 0 ? `: ${counts.map(([m, c]) => `${n(c)} to ${m}`).join(", ")}` : ""}`);
  }
  if (p.waitsWhole.length > 0) cells.push(`waits for ${p.waitsWhole.join(", ")} whole`);
  return (
    <div className="unit-pack wf-pre">
      {cells.map((c) => (
        <span key={c} className="meta">
          {c}
        </span>
      ))}
      {p.fed.map((f) => (
        <span key={f.input} className="unit-note brand">
          {f.input}: {f.words}
        </span>
      ))}
      {p.blockers.map((b) => (
        <span key={b} className="unit-flag">
          {b}
        </span>
      ))}
      {p.ready === false && p.blockers.length === 0 && !s.refused && <span className="unit-flag">the pre-flight says the step is not ready</span>}
    </div>
  );
}

/** The plan's verdicts counted, and whether it can run, in one line. */
export function PlanLine({ plan }: { plan: WorkflowPlan }) {
  const counts = verdictCounts(plan);
  return (
    <div className="row wf-plan-line">
      <span className={plan.runnable ? "tag ok" : "tag blocked"}>{plan.runnable ? "can run" : "cannot run"}</span>
      {counts.map((c) => (
        <span key={c.verdict} className={verdictTone(c.verdict) === "neutral" ? "tag" : `tag ${verdictTone(c.verdict)}`}>
          {n(c.count)} {c.verdict}
        </span>
      ))}
      {plan.words && <span className="meta">{plan.words}</span>}
    </div>
  );
}

/* ---------------------------------------------------------------- a workflow's page */

type Load<T> = { kind: "loading"; since: number } | { kind: "failed"; why: string } | { kind: "ready"; v: T };

/** The scope an address names: ?select=main@dataset:<name>, ?select=selection:<name>@<v> or ?handle=<id>. */
export function overOfQuery(query: Record<string, string> | undefined): Over | null {
  if (!query) return null;
  if (query.handle && /^\d+$/u.test(query.handle)) return { handle: Number(query.handle) };
  const main = mainOfSpec(query.select);
  if (main) return { main };
  const sel = /^(?:selection:)?([^@]+)@(\d+)$/u.exec(query.select ?? "");
  return sel ? { selection: sel[1], version: Number(sel[2]) } : null;
}

export function WorkflowPage({ caps, id, query }: { caps: Capabilities; id: string; query?: Record<string, string> }) {
  const acts = workflowActs(caps);
  const [load, setLoad] = useState<Load<{ w: WorkflowRow; pipelines: Pipeline[] }>>(() => ({ kind: "loading", since: Date.now() }));
  useEffect(() => {
    let alive = true;
    Promise.all([workflows.of(id), served(caps, "GET /api/pipelines") ? catalog.list().catch(() => ({ pipelines: [] as Pipeline[] })) : Promise.resolve({ pipelines: [] as Pipeline[] })]).then(
      ([w, c]) => alive && setLoad({ kind: "ready", v: { w, pipelines: c.pipelines } }),
      (e: unknown) => alive && setLoad({ kind: "failed", why: messageOf(e) }),
    );
    return () => {
      alive = false;
    };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (load.kind === "loading") return <Wait phase="reading the workflow" since={load.since} size="panel" />;
  if (load.kind === "failed") return <p className="warn">The workflow could not be read: {load.why}</p>;
  return <WorkflowView caps={caps} w={load.v.w} pipelines={load.v.pipelines} acts={acts} prefilled={overOfQuery(query)} goalAsked={query?.goal && GOALS.includes(query.goal) ? query.goal : null} />;
}

/** The page: the document's steps and links, the plan form, the plan once asked, and Start. */
export function WorkflowView({ caps, w, pipelines, acts, prefilled = null, goalAsked = null }: { caps: Capabilities; w: WorkflowRow; pipelines: Pipeline[]; acts: ReturnType<typeof workflowActs>; prefilled?: Over | null; goalAsked?: string | null }) {
  const doc = w.workflow;
  const [over, setOver] = useState<Over | null>(prefilled);
  const [goal, setGoal] = useState<string | null>(goalAsked);
  const [knobs, setKnobs] = useState<Record<string, Record<string, string>>>({});
  const [plan, setPlan] = useState<{ key: string; p: WorkflowPlan | null; why: string | null; since: number } | null>(null);
  const [starting, setStarting] = useState<{ since: number; words: string } | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  // Start waits for its run; once the page is left it neither sets state nor navigates
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const body = over ? planBody(selectOf(over), goal, knobs) : null;
  const key = body ? JSON.stringify(body) : null;
  const askPlan = useCallback(() => {
    if (!body || !key) return;
    const since = Date.now();
    setPlan({ key, p: null, why: null, since });
    workflows.plan(w.id, body).then(
      (p) => setPlan((was) => (was?.key === key ? { key, p, why: null, since } : was)),
      (e: unknown) => setPlan((was) => (was?.key === key ? { key, p: null, why: messageOf(e), since } : was)),
    );
  }, [body, key, w.id]);
  // the assistant's plan, or a link, opens the workflow filled in: its plan is asked at once
  useEffect(() => {
    if (prefilled && acts.plan) askPlan();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const current = plan && plan.key === key ? plan : null;
  const planned = current?.p ?? null;
  const roles = [...new Set(doc.steps.flatMap((s) => pipelineRoles(pipelines.find((p) => p.name === s.pipeline && p.standing !== "replaced") ?? {})))];
  const start = () => {
    if (!body) return;
    setStarting({ since: Date.now(), words: "queueing the run" });
    setSaid(null);
    workflows
      .run(w.id, body)
      .then(async (a) => {
        const queuedOnly = `Queued as job ${a.job}. Its run appears on the Pipelines page once the job starts.`;
        if (!alive.current) return;
        // without the door that lists workflow runs there is nothing to wait for
        if (!acts.runs) {
          setStarting(null);
          setSaid(queuedOnly);
          return;
        }
        setStarting({ since: Date.now(), words: `queued as job ${a.job}; waiting for the run to start` });
        // the run's row is made when its job starts: the job is read, and the run's list only a few times once the job has left the queue
        let lists = 0;
        for (let i = 0; i < 20; i++) {
          await new Promise((r) => setTimeout(r, 1000));
          if (!alive.current) return;
          const job = await ops.job(a.job).catch(() => null);
          if (!alive.current) return;
          let id = job ? workflowRunOfJob(job) : null;
          if (id === null && (job === null || job.state !== "queued") && lists < 3) {
            lists += 1;
            const runs = await workflows.runs().catch(() => ({ runs: [] as WorkflowRun[] }));
            if (!alive.current) return;
            id = runs.runs.find((r) => r.job === a.job)?.id ?? null;
          }
          if (id !== null) {
            location.hash = workflowRunHref(id);
            return;
          }
          if (job && (job.state === "failed" || job.state === "cancelled")) {
            setStarting(null);
            setSaid(`Job ${a.job} ${job.state}${job.error ? `: ${job.error}` : ""}.`);
            return;
          }
        }
        setStarting(null);
        setSaid(queuedOnly);
      })
      .catch((e: unknown) => {
        if (!alive.current) return;
        setStarting(null);
        setSaid(messageOf(e));
      });
  };
  const stepsWithKnobs = doc.steps.filter((s) => knobIds(s).length > 0);
  return (
    <section className="stack roomy wf-page">
      <div className="row actions">
        <b>{doc.title ?? w.name}</b>
        <span className="meta">
          {w.label}
          {w.origin === "starter" ? " · shipped" : ""}
          {w.added_at ? ` · added ${whenWords(w.added_at)}` : ""}
        </span>
      </div>
      {doc.what && <p className="lede">{doc.what}</p>}
      <WorkflowSteps doc={doc} plan={planned}>
        {(ps) => (ps ? <StepPreflight s={ps} /> : null)}
      </WorkflowSteps>

      {acts.plan && (
        <>
          <div className="section-head rule-top">
            <h2>Plan a run</h2>
            <span className="meta">nothing runs until Start</span>
          </div>
          <OverPicker caps={caps} over={over} onOver={setOver} needs={roles} />
          <div className="field">
            <span className="label">
              Goal
              <Hint text="Every step's pack takes the goal; a step whose document names its own keeps it." />
            </span>
            <div className="chips" role="group" aria-label="the run's goal">
              {GOALS.map((g) => (
                <button key={g} type="button" className={(goal ?? "standard") === g ? "opt on" : "opt"} aria-pressed={(goal ?? "standard") === g} onClick={() => setGoal(g === "standard" ? null : g)}>
                  {g}
                </button>
              ))}
            </div>
          </div>
          {stepsWithKnobs.map((s) => (
            <div key={s.id} className="field wf-knobs">
              <span className="label">Step {s.id}</span>
              <div className="row wrap">
                {knobIds(s).map((k) => (
                  <label key={k} className="wf-knob">
                    <span className="knob-id">{k}</span>
                    <span className="input">
                      <input value={knobs[s.id]?.[k] ?? ""} placeholder="the pack's" aria-label={`${s.id}.${k}`} onChange={(e) => setKnobs((was) => ({ ...was, [s.id]: { ...(was[s.id] ?? {}), [k]: e.target.value } }))} />
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
          <div className="row actions">
            <button type="button" className="button secondary" disabled={!body || (current !== null && current.p === null && current.why === null)} onClick={askPlan}>
              Plan
            </button>
            {current && current.p === null && current.why === null && <Wait phase="planning" since={current.since} />}
            {current?.why && <span className="warn">The plan was refused: {current.why}</span>}
            {over && !current && <span className="meta">The scope or a knob changed: plan again.</span>}
          </div>
          {planned && (
            <>
              <PlanLine plan={planned} />
              <Values
                cells={[
                  { k: "over", v: planned.selection ? overWords(planned.selection, roles) : planned.handle != null ? `handle ${planned.handle}` : "" },
                  { k: "steps", v: `${n(planned.steps.length)}${planned.steps.some((s) => s.refused) ? `, ${n(planned.steps.filter((s) => s.refused).length)} refused` : ""}` },
                  { k: "links", v: n(planned.links.length) },
                ]}
              />
              <div className="row actions">
                {acts.run ? (
                  <button type="button" className="button" disabled={!planned.runnable || starting !== null} onClick={start}>
                    Start
                  </button>
                ) : (
                  <span className="blocked">
                    <button type="button" className="button" disabled aria-disabled="true">
                      Start
                    </button>
                    <span className="reason">needs work on Pipelines</span>
                  </span>
                )}
                {starting && <Wait phase={starting.words} since={starting.since} />}
                {!planned.runnable && <span className="meta">{planned.words ?? "A link or a step is refused; see the steps above."}</span>}
              </div>
            </>
          )}
          {said && <p className="meta">{said}</p>}
        </>
      )}
      <Says head="What a workflow run is">
        Each step is one pipeline run over the same frozen scope, a unit going on to the next step as soon as its own unit before is over; a step fed through a typed input or a role waits for the whole step before. A unit whose result key matches a kept result is not run again and says which run it reused. The plan checks every link first and nothing runs until Start.
      </Says>
    </section>
  );
}

/* ---------------------------------------------------------------- a workflow run's page */

export function WorkflowRunPage({ caps, id }: { caps: Capabilities; id: number }) {
  const acts = workflowActs(caps);
  const [load, setLoad] = useState<Load<WorkflowRun>>(() => ({ kind: "loading", since: Date.now() }));
  const [said, setSaid] = useState<string | null>(null);
  const read = useCallback(() => workflows.runOf(id).then((v) => setLoad({ kind: "ready", v }), (e: unknown) => setLoad((was) => (was.kind === "ready" ? was : { kind: "failed", why: messageOf(e) }))), [id]);
  useEffect(() => {
    read();
  }, [read]);
  // read again every few seconds while the run is open
  const open = load.kind === "ready" && (load.v.status === "running" || load.v.status === "queued" || load.v.status === "cancelling");
  useEffect(() => {
    if (!open) return;
    const t = setInterval(read, 5000);
    return () => clearInterval(t);
  }, [open, read]);
  if (load.kind === "loading") return <Wait phase="reading the run" since={load.since} size="panel" />;
  if (load.kind === "failed") return <p className="warn">The run could not be read: {load.why}</p>;
  const r = load.v;
  const cancel = acts.cancel && cancellable(r) ? () => ops.cancel(r.job!).then(() => { setSaid(`Job ${r.job} stops its steps at their next heartbeat; what is written stays written.`); read(); }, (e: unknown) => setSaid(messageOf(e))) : null;
  return <WorkflowRunView caps={caps} run={r} onCancel={cancel} said={said} />;
}

/** The run as a page: its tag and sum line, the values, the steps with their status, unit counts and runs, and Cancel where the job is open. */
export function WorkflowRunView({ caps, run: r, onCancel, said = null }: { caps: Capabilities; run: WorkflowRun; onCancel: (() => void) | null; said?: string | null }) {
  const opens = workflowActs(caps).see;
  const sums = runSums(r);
  const tag = workflowRunTag(r);
  const running = r.status === "running" || r.status === "queued" || r.status === "cancelling";
  const runOpen = served(caps, "GET /api/pipeline-runs/{id}");
  return (
    <section className="stack roomy run-page wf-run">
      <div className="row actions">
        <span className={tag.className}>{tag.words}</span>
        {opens ? <a href={workflowHref(r.workflow_id)}><b>{r.workflow}</b></a> : <b>{r.workflow}</b>}
        <span className="meta">
          workflow run {n(r.id)}
          {r.job !== null ? ` · job ${n(r.job)}` : ""}
        </span>
        <span className="grow" />
        {onCancel && (
          <button type="button" className="button secondary small" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      <Values
        cells={[
          { k: "status", v: r.status },
          { k: "steps", v: `${n(sums.stepsDone)} of ${n(sums.steps)} done` },
          { k: "units", v: sums.unitsWords },
          { k: "over", v: r.selection ? overWords(r.selection) : r.handle != null ? `handle ${r.handle}` : "", title: r.selection ?? undefined },
          { k: running ? "since" : "ran", v: whenWords(r.started_at ?? "") },
        ]}
      />
      {said && <p className="meta">{said}</p>}
      {r.error && <p className="warn">{r.error}</p>}
      <div className="section-head rule-top">
        <h2>Steps</h2>
        <span className="meta">{sums.line}</span>
      </div>
      <div className="table-wrap">
        <table className="thin wf-run-steps">
          <thead>
            <tr>
              <th>Step</th>
              <th>Runs</th>
              <th>State</th>
              <th>Units</th>
              <th className="num">Run</th>
              <th className="num">Ended</th>
            </tr>
          </thead>
          <tbody>
            {r.steps.map((s) => {
              const tone = statusTone(s.status);
              return (
                <Fragment key={s.step}>
                  <tr className={s.error ? "has-fail" : undefined}>
                    <td>
                      <b>{s.step}</b>
                      {(s.waits_whole ?? []).length > 0 && <div className="meta">waits for {s.waits_whole!.join(", ")} whole</div>}
                    </td>
                    <td>{s.pipeline ?? stepRuns(s)}</td>
                    <td>
                      <span className={tone === "neutral" ? "tag" : `tag ${tone}`}>{s.status}</span>
                    </td>
                    <td>{stepUnitsWords(s.units)}</td>
                    <td className="num">{s.run !== null ? runOpen ? <a href={href("pipelines", "runs", String(s.run))}>{n(s.run)}</a> : n(s.run) : ""}</td>
                    <td className="num">{s.finished_at ? whenWords(s.finished_at) : ""}</td>
                  </tr>
                  {s.error && (
                    <tr className="made-row">
                      <td colSpan={6}>
                        <div className="made-line">
                          <span className="made-words" title={s.error}>
                            {s.error}
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
      <Says head="How the steps chain">
        A unit goes on to the next step as soon as its own unit before is over; a step that reads another&apos;s files through a typed input or a role waits for the whole step before. A unit skipped or failed at one step is skipped downstream with the same reason. A reused unit took a kept result of an earlier run instead of running.
      </Says>
    </section>
  );
}

/* ---------------------------------------------------------------- adding a workflow by hand */

/** Add a workflow: its nils.workflow.yml pasted or uploaded; the engine checks it and answers the version it is or the name's next. */
export function AddWorkflowDialog({ onClose, onDone }: { onClose: () => void; onDone: (words: string) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const add = () => {
    setBusy(Date.now());
    setWhy(null);
    workflows.add(text).then(
      (a) => onDone(a.added ? `Added ${a.label}.` : `${a.label} was in the catalog already.`),
      (e: unknown) => {
        setBusy(null);
        setWhy(messageOf(e));
      },
    );
  };
  return (
    <Dialog
      title="Add a workflow"
      icon="branch"
      onClose={onClose}
      foot={
        <div className="row actions">
          {busy !== null && <Wait phase="adding" since={busy} />}
          {why && <span className="warn">{why}</span>}
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="button" disabled={text.trim() === "" || busy !== null} onClick={add}>
            Add
          </button>
        </div>
      }
    >
      <div className="field">
        <label className="label" htmlFor="workflow-document">
          Its nils.workflow.yml
          <Hint text="Steps chained, each a pipeline or a family, an output wired to the next step's input. The same document again is the version it is; one that differs is the next version." />
        </label>
        <TextOrFile id="workflow-document" value={text} placeholder={"nils_workflow: 1\nname: …\nsteps:\n  - id: …\n    pipeline: …\nlinks:\n  - {from: a.out, to: b.in}"} accept=".yml,.yaml,.json,text/yaml" onChange={setText} />
      </div>
    </Dialog>
  );
}

/** The head's Add a workflow, for a person with install work where the engine takes one. */
export function AddWorkflowButton({ caps, onDone }: { caps: Capabilities; onDone: (words: string) => void }) {
  const [adding, setAdding] = useState(false);
  if (!workflowActs(caps).add) return null;
  return (
    <>
      <button type="button" className="button secondary" onClick={() => setAdding(true)}>
        <Icon name="plus" />
        Add a workflow
      </button>
      {adding && (
        <AddWorkflowDialog
          onClose={() => setAdding(false)}
          onDone={(w) => {
            setAdding(false);
            onDone(w);
          }}
        />
      )}
    </>
  );
}
