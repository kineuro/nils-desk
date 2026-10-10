// SPDX-License-Identifier: AGPL-3.0-only
// A chosen dataset, under the bands of the Data page (Wave 7a, the design of
// 2026-10-09): its actions with the next step as the one primary button;
// where it is, a rail of its steps with their counts and times and the
// running one marked; what it holds, the funnel of subjects, visits and
// scans, how sure the sort is, the kinds of scan and its files; its main
// scans per role with the way to Review; and its log, the running job with
// its progress and Stop, then what ran before. A dataset whose files arrive
// identified has its pseudonymise step on the rail between Found and Read,
// opened in place under the rail (the design of the same day): by itself
// while it waits on a person, and from the rail or the address otherwise.
// Body part and post-contrast are run from their steps on the rail (record
// 56), and their running job joins the log.

import { useEffect, useState } from "react";
import type { JobRow } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";
import { href, narrow } from "../routes";
import { MoreMenu } from "../settings/cards";
import { sizeWords } from "../settings/database";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { jobs as jobsDoor, packFor, type ChainedJob, type Dataset } from "./datasets";
import { cancelRefusal } from "./now";
import type { LiveJobs } from "./Now";
import { DatasetSettings } from "./DatasetSettings";
import { maySeePicks, picksSummary, type PickLine } from "./picks";
import { opensItself, PseudonymisedSummary, PseudonymiseStep, StepDialogs, usePseudonymise, type Opened } from "./PseudonymiseStep";
import { railWords } from "./pseudoStep";
import { STOPPED_NEXT, useStopped } from "./stopped";
import { StepRail } from "./StepRail";
import { runOffers, startedWords, stepRuns } from "./stepRun";
import { nextStep, stepCommand, type StepId } from "./steps";
import {
  clock,
  doingTitle,
  filesOf,
  idsWords,
  logLine,
  maySummarise,
  operationOf,
  originalIdWords,
  railSteps,
  roleOrder,
  roleWord,
  runningWords,
  stateOf,
  stateWord,
  stepOf,
  stepsOfSources,
  stepWords,
  TONE,
  whereWords,
  type DatasetSummary,
  type LogLine,
  type Operation,
  type SummaryStep,
} from "./summary";
import { mayBrowse, viewHref } from "./viewer";

const n = (v: number) => v.toLocaleString("en-US");

export interface DatasetDetailProps {
  caps: Capabilities;
  dataset: Dataset;
  summary: DatasetSummary | null;
  /** Why the summary could not be read, where it could not: the rail then stands on what the list knows. */
  summaryWhy?: string | null;
  why: string | null;
  jobs: LiveJobs;
  /** Every dataset of the page, which a vault of the originals stays out of. */
  datasets?: readonly Dataset[];
  /** The cohorts there are, for the cohort a dataset feeds. */
  cohorts?: readonly string[];
  /** The address opened the pseudonymise step: #data/datasets/<name>/pseudonymisation. */
  openStep?: boolean;
  /** A step pressed; where it queues a job, the promise ends when the engine answered. */
  onStep: (id: StepId) => void | Promise<void>;
  /** Words for the page; with a dataset's name, they speak of its run and stand only while it goes. */
  onChanged: (words: string, running?: string) => void;
  onSaid: (words: string) => void;
  onFailed: (e: unknown) => void;
  onRemoved: (words: string) => void;
}

/** The secondary actions, the primary one and the menu of a dataset, as its head offers them. */
export function datasetActions(caps: Capabilities, d: Dataset, why: string | null) {
  const works = may(caps, "data:work");
  const next = nextStep(d, why);
  const review = next.step === "review" ? (may(caps, "review:see") ? narrow(href("review"), { dataset: d.name }) : null) : null;
  const primary: { label: string; step: StepId | null; href: string | null; busy: boolean } | null =
    next.step === "review"
      ? review
        ? { label: next.label, step: null, href: review, busy: false }
        : null
      : works
        ? { label: next.label, step: next.busy ? null : next.step, href: null, busy: next.busy }
        : null;
  const readable = works && why === null && next.word !== "Unknown" && !next.busy;
  return {
    next,
    primary,
    readNew: readable && next.step !== "read-new" && d.digests.count > 0,
    view: d.totals.stacks > 0 && mayBrowse(caps, { kind: "dataset", name: d.name }) ? viewHref({ kind: "dataset", name: d.name }) : null,
    readAgain: readable && d.digests.count > 0,
    setIds: works && next.step !== "sort-files" && next.step !== "set-ids" && stateOf(d) !== "unknown" && d.arrives !== "undeclared",
    /** The cohort it feeds, among its settings: Data work and Places work, through its place. */
    settings: works && may(caps, "places:work") && served(caps, "PUT /api/places/{id}"),
    /** Its originals, kept, vaulted or purged by the rules of its pseudonymise step. */
    originals: works && Boolean(d.trees?.originals) && served(caps, "PUT /api/places/{id}"),
    remove: may(caps, "places:work") && served(caps, "PUT /api/places/{id}"),
  };
}

/** The steps of a dataset's own chain, each queued again by a press of its button. */
const CHAIN = new Set<string>(["pseudonymised", "read", "sorted", "main_scans"]);

export function DatasetDetail(props: DatasetDetailProps) {
  const { caps, dataset: d, summary: s, why, jobs, onStep, onChanged, onSaid, onFailed, onRemoved } = props;
  const [now, setNow] = useState(() => Date.now());
  const [log, setLog] = useState<ChainedJob[] | null>(null);
  const [picks, setPicks] = useState<PickLine[] | null>(null);
  const [removing, setRemoving] = useState(false);
  const [settings, setSettings] = useState(false);
  /** A step's Run pressed, until the engine answers. */
  const [pressed, setPressed] = useState(false);
  /** The next step's button, or Read new files or Read again, pressed until the engine answers: one press, one job. */
  const [asking, setAsking] = useState(false);
  const acts = datasetActions(caps, d, why);
  /** Where its chain stopped, in the failed job's own words (2026-10-10). */
  const stopped = useStopped(caps, s);
  // the pseudonymise step: open by itself while it waits on a person or runs, or as the person or the address opened it
  const pseudo = usePseudonymise(caps, d, s);
  const view = pseudo.view;
  const [stepOpen, setStepOpen] = useState<boolean | null>(props.openStep ? true : null);
  useEffect(() => {
    if (props.openStep) setStepOpen(true);
  }, [props.openStep]);
  const open = view !== null && (stepOpen ?? opensItself(view));
  const [dialog, setDialog] = useState<Opened>(null);
  const stepId = `pseudonymise-${d.id}`;
  const readsLog = may(caps, "pipelines:see") && served(caps, "GET /api/jobs") && maySummarise(caps);
  const runningNow = s?.steps.some((x) => x.state === "running" || x.state === "queued") ?? false;
  // what the summary last said of each step: the log and the picks are read again when it moves
  const moved = s ? s.steps.map((x) => `${x.step}:${x.state}:${x.job ?? ""}`).join(",") : "";

  useEffect(() => {
    if (!runningNow) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [runningNow]);
  useEffect(() => {
    if (!readsLog) return;
    let alive = true;
    jobsDoor
      .ofDataset(d.name, 10)
      .then((r) => alive && setLog(r.jobs))
      .catch(() => alive && setLog(null));
    return () => {
      alive = false;
    };
  }, [d.name, readsLog, moved]);
  useEffect(() => {
    if (!maySeePicks(caps)) return;
    let alive = true;
    picksSummary
      .read(d.name)
      .then((lines) => alive && setPicks(lines))
      .catch(() => alive && setPicks(null));
    return () => {
      alive = false;
    };
  }, [caps, d.name, moved]);

  const queue = (command: string[], name: string, words: string) => {
    setAsking(true);
    jobsDoor
      .enqueue(command, name)
      .then(() => onChanged(words))
      .catch(onFailed)
      .finally(() => setAsking(false));
  };
  const readNew = () => {
    const c = stepCommand(d, "read-new", packFor(caps));
    if (c) queue(c.command, c.name, `${d.name}: reading what is new.`);
  };
  const readAgain = () => {
    const c = stepCommand(d, "read", packFor(caps));
    if (c) queue(c.command, c.name, `${d.name} is read again.`);
  };
  // body part or post-contrast over the dataset's scans: its model's run queued, or the engine's refusal said plainly
  const runStep = (step: Operation) => {
    setPressed(true);
    stepRuns
      .start("datasets", d.name, step)
      .then(() => onChanged(startedWords(d.name, step)))
      .catch(onFailed)
      .finally(() => setPressed(false));
  };

  const refusedBatch = s?.files.refused_batch ?? null;
  const refused = s?.files.refused ?? d.totals.refused_files;
  const ids = idsWords(d);
  // an identified dataset says what its files carry until they are pseudonymised, and then what the copy NILS reads holds
  const where = (
    view === null ? [whereWords(d), stateWord(s?.state ?? stateOf(d)), ids] : view.phase === "done" ? [whereWords(d), "pseudonymised", ids] : [whereWords(d), "the files carry names"]
  )
    .filter(Boolean)
    .join(" · ");

  // while the step is open before it is done, its own button is the one primary action
  const primary = open && view?.phase !== "done" && acts.primary?.step === "pseudonymise" ? null : acts.primary;
  const said = view ? railWords(view) : null;
  const stepping = (id: StepId) => {
    if (id === "pseudonymise" && view !== null) return setStepOpen(true);
    const asked = onStep(id);
    if (!asked) return;
    setAsking(true);
    void asked.finally(() => setAsking(false));
  };
  // a job of the dataset's chain is queued or runs (pseudonymise, read, sort, main scans): a press would queue it again, so its buttons wait;
  // the pictures, the 3D views and a model's run go on beside it and hold nothing
  const chainRuns = s?.steps.some((x) => CHAIN.has(x.step) && (x.state === "running" || x.state === "queued")) ?? false;
  const busy = asking || chainRuns;
  const logCol = (
    <div className="dp-col">
      <div className="dp-col-head">
        <h3 className="eyebrow">Its log</h3>
        {may(caps, "pipelines:see") && <a href={href("pipelines")}>All on Pipelines</a>}
      </div>
      <Log caps={caps} dataset={d} summary={s} log={readsLog ? log : null} live={jobs} now={now} onSaid={onSaid} onFailed={onFailed} />
    </div>
  );
  return (
    <section className="dp-detail" aria-label={d.name}>
      <div className="dp-detail-head">
        <Icon name="folder" size="lg" />
        <span className="dp-detail-name">{d.name}</span>
        <span className={TONE[acts.next.word]} title={why ?? undefined}>
          {acts.next.word}
        </span>
        <span className="dp-detail-where">{where}</span>
        <span className="dp-acts">
          {acts.readNew && (
            <button type="button" className="button secondary" disabled={busy} onClick={readNew}>
              Read new files
            </button>
          )}
          {acts.view && (
            <a className="button secondary" href={acts.view}>
              View
            </a>
          )}
          {primary && primary.href !== null && (
            <a className="button" href={primary.href}>
              {primary.label}
            </a>
          )}
          {primary && primary.href === null && (
            <button type="button" className="button" disabled={primary.busy || primary.step === null || (busy && primary.step !== "pseudonymise")} onClick={() => primary.step && stepping(primary.step)}>
              {chainRuns && !primary.busy && primary.step !== "pseudonymise" ? "Running" : stopped && primary.step !== null ? "Try again" : primary.label}
            </button>
          )}
          {(acts.readAgain || acts.setIds || acts.settings || acts.originals || (refused > 0 && refusedBatch !== null) || acts.remove) && (
            <MoreMenu label={`More for ${d.name}`}>
              {acts.readAgain && (
                <button type="button" disabled={busy} onClick={readAgain}>
                  Read again
                </button>
              )}
              {acts.setIds && (
                <button type="button" onClick={() => onStep("set-ids")}>
                  The IDs
                </button>
              )}
              {acts.settings && (
                <button type="button" onClick={() => setSettings(true)}>
                  Settings
                </button>
              )}
              {acts.originals && (
                <button type="button" onClick={() => setDialog({ kind: "rules" })}>
                  The originals
                </button>
              )}
              {refused > 0 && refusedBatch !== null && <a href={href("data", "batch", String(refusedBatch))}>Refused files</a>}
              {acts.remove && (
                <button type="button" onClick={() => setRemoving(true)}>
                  Remove
                </button>
              )}
            </MoreMenu>
          )}
        </span>
      </div>

      <div className="dp-sec">
        <h3 className="eyebrow">Where it is</h3>
        {s ? (
          <StepRail
            steps={railSteps(s)}
            now={now}
            says={{ ...(said ? { pseudonymised: said } : {}), ...(stopped ? { [stopped.step]: { what: "stopped", when: "", next: true } } : {}) }}
            pick={view !== null && stepOf(s, "pseudonymised") !== null ? { step: "pseudonymised", open, controls: stepId, onPick: () => setStepOpen(!open) } : null}
            run={runOffers(caps, "datasets", railSteps(s), pressed, runStep)}
          />
        ) : maySummarise(caps) && !props.summaryWhy ? (
          <p className="meta">Reading where it is.</p>
        ) : props.summaryWhy ? (
          <>
            <StepRail steps={stepsOfSources(d)} now={now} />
            <p className="warn">Where it is could not be read: {props.summaryWhy}</p>
          </>
        ) : (
          <StepRail steps={stepsOfSources(d)} now={now} />
        )}
        {stopped && !(open && view && view.phase !== "done") && (
          <p className="warn dp-stopped" role="status">
            Stopped: {stopped.words} <span className="meta">{STOPPED_NEXT}</span>
          </p>
        )}
      </div>

      {open && view && view.phase !== "done" && (
        <PseudonymiseStep
          caps={caps}
          dataset={d}
          summary={s}
          pseudo={pseudo}
          stopped={stopped}
          onChanged={(words, running) => {
            // what the person started stays in sight: the step's summary once it is done, the next steps running beside it
            setStepOpen(true);
            onChanged(words, running);
          }}
          onFailed={onFailed}
          onOpen={setDialog}
        />
      )}
      {open && view && view.phase === "done" ? (
        <div className="dp-cols ps-cols">
          <PseudonymisedSummary caps={caps} dataset={d} summary={s} pseudo={pseudo} onOpen={setDialog} />
          {logCol}
        </div>
      ) : open && view ? (
        runningNow && <div className="dp-cols">{logCol}</div>
      ) : (
        <div className="dp-cols">
          <div className="dp-col">
            <h3 className="eyebrow">What it holds</h3>
            <Holds dataset={d} summary={s} />
          </div>
          <div className="dp-col">
            <h3 className="eyebrow">Main scans</h3>
            <MainScans caps={caps} dataset={d.name} picks={picks} step={stepOf(s, "main_scans")} />
          </div>
          {logCol}
        </div>
      )}
      <StepDialogs caps={caps} dataset={d} datasets={props.datasets ?? []} view={view} opened={dialog} setOpened={setDialog} onChanged={onChanged} />
      {settings && (
        <DatasetSettings
          dataset={d}
          cohorts={props.cohorts ?? []}
          onClose={() => setSettings(false)}
          onSaved={(words) => {
            setSettings(false);
            onChanged(words);
          }}
        />
      )}
      {removing && (
        <RemoveDialog
          dataset={d}
          onClose={() => setRemoving(false)}
          onDone={() => {
            setRemoving(false);
            onRemoved(`${d.name} is removed from Data.`);
          }}
          onFailed={(e) => {
            setRemoving(false);
            onFailed(e);
          }}
        />
      )}
    </section>
  );
}

/** What a dataset holds: the funnel, how sure the sort is, its kinds of scan and its files. */
function Holds({ dataset: d, summary: s }: { dataset: Dataset; summary: DatasetSummary | null }) {
  const subjects = s?.subjects ?? d.totals.subjects;
  const visits = s ? (s.sessions ?? s.studies) : d.totals.sessions || d.totals.studies;
  const scans = s?.scans ?? d.totals.stacks;
  const sure = s?.sure ?? d.totals.sure ?? Math.max(0, d.totals.stacks - d.totals.to_sort);
  const look = s?.need_a_look ?? d.totals.to_sort;
  const unsorted = s?.unsorted ?? d.totals.unsorted ?? 0;
  const kinds = (s?.kinds ?? []).slice(0, 6);
  const most = Math.max(1, ...kinds.map((k) => k.scans));
  const files = filesOf(d, s);
  const bytes = s?.files.bytes ?? null;
  const refused = s?.files.refused ?? d.totals.refused_files;
  const batch = s?.files.refused_batch ?? null;
  const nothing = scans === 0 && subjects === 0;
  return (
    <>
      {!nothing && (
        <div className="dp-funnel" aria-label="subjects, visits and scans">
          <span>
            <b>{n(subjects)}</b> subjects
          </span>
          <span className="arrow">→</span>
          <span>
            <b>{n(visits)}</b> visits
          </span>
          <span className="arrow">→</span>
          <span>
            <b>{n(scans)}</b> scans
          </span>
        </div>
      )}
      {scans > 0 && (
        <>
          <div className="dp-sure" role="img" aria-label={`${n(sure)} sure, ${n(look)} need a look, ${n(unsorted)} not sorted`}>
            {sure > 0 && <span className="ok" style={{ flex: sure }} />}
            {look > 0 && <span className="look" style={{ flex: look }} />}
            {unsorted > 0 && <span className="none" style={{ flex: unsorted }} />}
          </div>
          <div className="dp-sure-words">
            <span>
              <span className="ok">{n(sure)}</span> sure
            </span>
            <span>
              <span className="look">{n(look)}</span> need a look
            </span>
            {unsorted > 0 && (
              <span>
                <span className="none">{n(unsorted)}</span> not sorted
              </span>
            )}
          </div>
        </>
      )}
      {kinds.length > 0 && (
        <div className="dp-kinds" aria-label="the kinds of scan">
          {kinds.map((k) => (
            <div key={k.kind} className="dp-kind">
              <span>{k.kind}</span>
              <span className="dp-track">
                <i style={{ width: `${Math.round((k.scans / most) * 100)}%` }} />
              </span>
              <span className="count">{n(k.scans)}</span>
            </div>
          ))}
        </div>
      )}
      {scans === 0 && <p className="meta">Nothing read yet.</p>}
      <div className="meta">
        {files === null ? "files not counted yet" : `${n(files)} ${files === 1 ? "file" : "files"}`}
        {bytes !== null && bytes > 0 ? ` · ${sizeWords(bytes)}` : ""}
        {refused > 0 && (
          <>
            {" · "}
            {batch !== null ? <a href={href("data", "batch", String(batch))}>{n(refused)} refused, why</a> : `${n(refused)} refused`}
          </>
        )}
      </div>
    </>
  );
}

/** The main scans per role: picked, clear and borders, with the way to Review. */
function MainScans({ caps, dataset, picks, step }: { caps: Capabilities; dataset: string; picks: PickLine[] | null; step: SummaryStep | null }) {
  const reviews = may(caps, "review:see");
  const lines = [...(picks ?? [])].sort((a, b) => roleOrder(a.role, b.role));
  return (
    <>
      {step?.state === "off" && <p className="meta">Off for this dataset.</p>}
      {step?.state !== "off" && lines.length === 0 && <p className="meta">{step?.state === "running" ? "Picking now." : "None picked yet."}</p>}
      {lines.map((l) => {
        const rest = Math.max(0, l.picked - l.clear);
        return (
          <div key={l.role} className="dp-role">
            <div className="dp-role-line">
              <b>{roleWord(l.role)}</b>
              <span className="grow">
                {n(l.picked)} picked · {n(l.clear)} clear{l.borders > 0 ? ` · ${n(l.borders)} ${l.borders === 1 ? "border" : "borders"}` : ""}
              </span>
              {l.review > 0 && reviews && <a href={narrow(href("review", "picks"), { dataset })}>Review {n(l.review)}</a>}
            </div>
            <div className="dp-bar3" aria-hidden="true">
              {l.clear > 0 && <span className="ok" style={{ flex: l.clear }} />}
              {l.review > 0 && <span className="look" style={{ flex: l.review }} />}
              {rest > 0 && <span className="none" style={{ flex: rest }} />}
            </div>
          </div>
        );
      })}
      <div className="meta">
        Picked after every sort by the rules in the pack
        {reviews && (
          <>
            {" · "}
            <a href={href("review", "rules")}>the rules</a>
          </>
        )}
      </div>
    </>
  );
}

/** What ran for the dataset, from the steps of its summary, for a person who does not read the jobs. */
function stepsLog(s: DatasetSummary, now: Date): LogLine[] {
  const past: Record<string, string> = {
    found: "Found",
    pseudonymised: "Pseudonymised",
    read: "Read",
    sorted: "Sorted",
    body_part: "Body part",
    post_contrast: "Post-contrast",
    main_scans: "Main scans picked",
    pictures: "Pictures made",
    views: "3D views made",
  };
  return railSteps(s)
    .filter((st) => st.state === "done" && st.finished_at && st.step !== "found")
    .sort((a, b) => Date.parse(b.finished_at ?? "") - Date.parse(a.finished_at ?? ""))
    .map((st) => ({ id: st.job, at: clock(st.finished_at, now), what: past[st.step], how: stepWords(st, now).what, failed: false, batch: null }));
}

/** The running job of a dataset, with its bar and Stop, and the lines of what ran before. */
function Log(props: {
  caps: Capabilities;
  dataset: Dataset;
  summary: DatasetSummary | null;
  log: ChainedJob[] | null;
  live: LiveJobs;
  now: number;
  onSaid: (words: string) => void;
  onFailed: (e: unknown) => void;
}) {
  const { caps, dataset: d, summary: s, log, live, now, onSaid, onFailed } = props;
  const at = new Date(now);
  const liveById = new Map((live.open ?? []).map((j) => [j.id, j]));
  const isOpen = (j: Pick<JobRow, "state">) => j.state === "queued" || j.state === "running" || j.state === "cancelling";
  // the running jobs: the log's open ones; the live stream's row wins, for its progress
  const open: Running[] = (log ? log.filter(isOpen) : []).map((j) => {
    const row = liveById.get(j.id) ?? j;
    return { key: `job ${row.id}`, job: row, title: doingTitle(row, operationOf(s, row.id)), words: runningWords(row, now), stoppable: row.state !== "cancelling" };
  });
  // and the steps the summary says run now that no open job of the log stands for: a sort's own run that
  // goes on making its pictures after its row says done, or every running step for a person who does not read the jobs
  const openIds = new Set(open.map((r) => r.job?.id));
  const fromSteps: Running[] = (s?.steps ?? [])
    .filter((st) => (st.state === "running" || st.state === "queued") && !(st.job !== null && openIds.has(st.job)))
    .map((st) => {
      const live = st.job !== null ? (liveById.get(st.job) ?? null) : null;
      const row: JobRow = live ?? {
        id: st.job ?? -1,
        kind: kindOfStep(st),
        name: null,
        state: st.state === "queued" ? "queued" : "running",
        started_at: st.started_at ?? "",
        heartbeat_at: null,
        finished_at: null,
        progress: st.progress as JobRow["progress"],
        error: null,
        args: {},
        result: null,
      };
      // a step whose job is over (the pictures a sort still makes) has nothing a press could stop
      const over = st.job !== null && log?.some((j) => j.id === st.job && !isOpen(j));
      return {
        key: `step ${st.step}`,
        job: over || st.job === null ? null : row,
        title: st.step === "pictures" ? "Making pictures" : doingTitle(row, operationOf(s, st.job)),
        words: runningWords(row, now),
        stoppable: !over && st.job !== null,
      };
    });
  const running = [...open, ...fromSteps];
  // what ran before, newest first by when it ended, which a chain's steps and the lanes beside them do out of the queue's order
  const ended = (j: JobRow) => Date.parse(j.finished_at ?? j.started_at) || 0;
  const over = log
    ? log
        .filter((j) => !isOpen(j))
        .sort((a, b) => ended(b) - ended(a) || b.id - a.id)
        .map((j) => logLine(j, at, operationOf(s, j.id)))
    : s
      ? stepsLog(s, at)
      : [];
  const added: LogLine | null = s
    ? { id: null, at: clock(s.added_at, at), what: "Added as a dataset", how: [stateWord(s.state), originalIdWords(d) ?? idsWords(d)].filter(Boolean).join(", "), failed: false, batch: null }
    : null;
  const lines = [...over.slice(0, 8), ...(added && (!log || log.length < 10) ? [added] : [])];

  const stop = (r: Running) => {
    if (!r.job) return;
    jobsDoor
      .cancel(r.job.id)
      .then(() => {
        onSaid(`${r.title}: stopping.`);
        live.refresh();
      })
      .catch(onFailed);
  };
  return (
    <div className="dp-log">
      {running.map((run) => {
        const r = run.words;
        const j = run.job;
        const refusal =
          j === null ? null : j.args && Object.keys(j.args).length > 0 ? cancelRefusal(caps, j) : may(caps, "pipelines:work") || may(caps, "data:work") ? null : "Stopping needs work on Pipelines.";
        return (
          <div key={run.key} className="dp-running">
            <div className="dp-running-head">
              <span className="dp-dot" aria-hidden="true" />
              <span className="grow">{run.title}</span>
              {run.stoppable && j && (
                <button type="button" className="button secondary small" disabled={refusal !== null} title={refusal ?? undefined} onClick={() => stop(run)}>
                  {j.state === "queued" ? "Drop" : "Stop"}
                </button>
              )}
            </div>
            {r.fraction !== null && (
              <div className="dp-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(r.fraction * 100)}>
                <i style={{ width: `${Math.max(2, Math.round(r.fraction * 100))}%` }} />
              </div>
            )}
            {r.words && <div className="meta">{r.words}</div>}
          </div>
        );
      })}
      {lines.map((l, i) => (
        <div key={`${l.id ?? "added"} ${i}`} className={l.failed ? "dp-log-row failed" : "dp-log-row"}>
          <span className="at">{l.at}</span>
          <span>
            <span className="what">{l.batch !== null ? <a href={href("data", "batch", String(l.batch))}>{l.what}</a> : l.what}</span> <span className="how">{l.how}</span>
          </span>
        </div>
      ))}
      {running.length === 0 && lines.length === 0 && <p className="meta">Nothing has run yet.</p>}
    </div>
  );
}

/** A box of the log for what runs now: the job where a press can stop it, its title and how far it is. */
interface Running {
  key: string;
  job: JobRow | null;
  title: string;
  words: { fraction: number | null; words: string };
  stoppable: boolean;
}

/** The verb a step's job is, for a step read from the summary alone. */
function kindOfStep(st: SummaryStep): string {
  switch (st.step) {
    case "pseudonymised":
      return "pseudonymize";
    case "read":
      return "digest";
    case "sorted":
      return "classify";
    case "main_scans":
      return "pick";
    case "pictures":
      return "classify";
    case "views":
      return "pyramid";
    case "body_part":
    case "post_contrast":
      return "pipeline";
    default:
      return st.step;
  }
}

/** Remove a dataset from Data: the place retired, its files and what NILS read kept. */
function RemoveDialog({ dataset: d, onClose, onDone, onFailed }: { dataset: Dataset; onClose: () => void; onDone: () => void; onFailed: (e: unknown) => void }) {
  const [busy, setBusy] = useState(false);
  const go = () => {
    setBusy(true);
    fetch(`/api/places/${d.id}`, { method: "PUT", headers: { "content-type": "application/json", "X-Nils-Desk": "1" }, body: JSON.stringify({ retired: true }) })
      .then(async (r) => {
        if (!r.ok) {
          const body = (await r.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `the engine answered ${r.status}`);
        }
        onDone();
      })
      .catch(onFailed);
  };
  return (
    <Dialog
      title={`Remove ${d.name}?`}
      icon="folder"
      onClose={onClose}
      foot={
        <div className="row actions">
          <span className="meta grow">Its folder and files stay where they are.</span>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="button" disabled={busy} onClick={go}>
            Remove
          </button>
        </div>
      }
    >
      <p>It leaves this page. What NILS read from it stays.</p>
    </Dialog>
  );
}
