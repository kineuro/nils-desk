// SPDX-License-Identifier: AGPL-3.0-only
// Pipelines / a run (record 49 A7): its units by state (running, waiting,
// done, failed, kept when it was taken up again), cancel and resume, its
// table of measures as the ask reads it (one row per scan at detail quasi;
// below it the totals over groups, which the engine withholds under 5
// scans), its checks and breaches with the way to their review items, and
// the files it made. Read again every few seconds while it runs. Since
// record 55 H3 (job type 3) a mask's file says its check, and a run that
// made masks offers Check results, which opens the New check filled for it.
// Since 2026-10-12 each unit says its own status (done, failed or skipped,
// with why), the run reads as its units summed, never a bare done, and a run
// that did not make all it was for says why, one line a reason with the
// units under it; Resume and Run again open its pre-flight first.
// Since 2026-10-13 a unit with a mask offers View (its scan with the mask
// drawn over it, read only; ./RunResult), and the files are listed by unit
// with their names and sizes.

import { Fragment, useCallback, useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { whenWords } from "../data/sources";
import { engineWords } from "../models/ModelsPage";
import { href, narrow } from "../routes";
import { Icon } from "../ui/Icon";
import { Says, Values } from "../ui/Says";
import { Wait } from "../ui/Wait";
import { checkTag, makeCheckRefusal } from "../campaigns/check";
import { NewCheck, runChoiceOf } from "../campaigns/NewCheck";
import { door as served } from "../deployment";
import { peopleKept } from "../assistant/shares";
import { useKept } from "../ui/kept";
import { softwareHrefFor } from "../settings/software";
import { catalog, overWords, type Pipeline } from "./catalog";
import { ops, packs, type RunNumbers } from "./client";
import { byWords, flagWords, keyShort, keyTitle, madeColumns, packView, packWords, poolingOf, valueWords, type PackView } from "./pack";
import { namer } from "./who";
import { failureOf } from "./failure";
import { InstallFor } from "./Install";
import { FailLine, FailNote, KindTag } from "./Reason";
import { madeOf, madeWords, runTag, unitsByWhy } from "./made";
import { againOfRun, RunAgainDialog } from "./RunAgain";
import { RunSeeds } from "./PipelineRuntime";
import { seedsSuggested } from "./pipelineSetup";
import { foundByWords } from "./tools";
import { drawable, fileName, filesByUnit, shortName, sizeWords, viewActs } from "./results";
import {
  allPassed,
  breachesByCheck,
  failuresByCause,
  failuresByReason,
  converterOf,
  heldWords,
  cellWords,
  mainReadOf,
  rulesWords,
  checksOf,
  groupBy,
  headerWords,
  shownColumns,
  measureColumns,
  resumable,
  runActs,
  runs,
  tableAsk,
  unitCounts,
  unitTotals,
  unitTone,
  type Derivative,
  type RunDetail,
  type UnitRun,
  type UnitTone,
} from "./runs";

const n = (v: number) => v.toLocaleString("en-US");

export type Table = { kind: "off"; why: string | null } | { kind: "loading" } | { kind: "failed"; why: string } | { kind: "pooled"; words: string } | { kind: "ready"; perScan: boolean; columns: string[]; rows: unknown[][]; truncated: boolean };

type Load = { kind: "loading"; since: number } | { kind: "failed"; why: string } | { kind: "ready"; run: RunDetail; pipeline: Pipeline | null; resumedAt: string | null; jobAlive: boolean };

const OPEN = new Set(["running", "queued"]);

export function RunPage({ caps, id }: { caps: Capabilities; id: number }) {
  const acts = runActs(caps);
  const [load, setLoad] = useState<Load>(() => ({ kind: "loading", since: Date.now() }));
  const [table, setTable] = useState<Table>({ kind: "off", why: null });
  const [files, setFiles] = useState<Derivative[] | null>(null);
  const [by, setBy] = useState("subject.sex");
  const [said, setSaid] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [again, setAgain] = useState(false);
  // Wave 7b: the pipeline version's pack (its rules' words), and the run's numbers per comparability key
  const [pack, setPack] = useState<PackView | null>(null);
  // the numbers answered for one run at one status; an answer for another is not this run's
  const [answered, setAnswered] = useState<{ key: string; value: RunNumbers | null } | undefined>(undefined);
  const people = useKept(peopleKept);
  useEffect(() => peopleKept.ensure(), []);

  const read = useCallback(() => {
    runs
      .get(id)
      .then(async (run) => {
        const [pipes, job] = await Promise.all([catalog.list().catch(() => null), run.job_id !== null ? runs.job(run.job_id).catch(() => null) : Promise.resolve(null)]);
        const pipeline = pipes?.pipelines.find((p) => p.id === run.pipeline_id) ?? null;
        const alive = job !== null && (job.state === "running" || job.state === "queued" || job.state === "cancelling");
        setLoad({ kind: "ready", run, pipeline, resumedAt: (run.resumes ?? 0) > 0 && job ? job.started_at : null, jobAlive: alive });
      })
      .catch((e: unknown) => setLoad((was) => (was.kind === "ready" ? was : { kind: "failed", why: engineWords(e) })));
  }, [id]);

  useEffect(() => {
    // a new run starts from nothing: the last run's pack and numbers are not its own
    setPack(null);
    setAnswered(undefined);
    read();
  }, [read]);
  const status = load.kind === "ready" ? load.run.status : null;
  useEffect(() => {
    if (status === null || !OPEN.has(status)) return;
    const t = setInterval(read, 4000);
    return () => clearInterval(t);
  }, [status, read]);

  const run = load.kind === "ready" ? load.run : null;
  const pipeline = load.kind === "ready" ? load.pipeline : null;
  // the table is read once the run has loaded measures, and again when it ends or the grouping changes
  const numbers = run && answered?.key.startsWith(`${run.id}:`) ? answered.value : null;
  const measures = run ? Number(((run.summary?.numbers ?? {}) as Record<string, unknown>).measures ?? 0) : 0;
  useEffect(() => {
    if (!pipeline || !served(caps, "GET /api/pipelines/{id}/pack")) return;
    let alive = true;
    packs.of(pipeline.id).then(
      (d) => alive && setPack(packView(d)),
      () => alive && setPack(null),
    );
    return () => {
      alive = false;
    };
  }, [pipeline?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!run) return;
    const key = `${run.id}:${run.status}`;
    if (measures === 0 || !served(caps, "GET /api/pipeline-runs/{id}/numbers")) return setAnswered({ key, value: null });
    let alive = true;
    packs.numbers(run.id).then(
      (value) => alive && setAnswered({ key, value }),
      () => alive && setAnswered({ key, value: null }),
    );
    return () => {
      alive = false;
    };
  }, [run?.id, run?.status, measures]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!run || !pipeline) return;
    // the numbers door is read first where the engine serves it, so the table asks only for the columns the run made
    // and once for a status: the table waits for the numbers of this run at this status
    if (measures > 0 && served(caps, "GET /api/pipeline-runs/{id}/numbers") && answered?.key !== `${run.id}:${run.status}`) return;
    const cols = madeColumns(measureColumns(pipeline as Pipeline & { descriptor?: Record<string, unknown> | null }), run.summary, numbers);
    if (cols.length === 0 || measures === 0) return setTable({ kind: "off", why: null });
    if (!acts.table) return setTable({ kind: "off", why: "Reading a run's numbers needs Query: Work." });
    setTable({ kind: "loading" });
    runs
      .ask(tableAsk({ pipeline: pipeline.name, level: pipeline.level, run: run.id, columns: cols, perScan: acts.perScan, by }))
      .then((a) => setTable({ kind: "ready", perScan: acts.perScan, columns: a.columns, rows: a.rows, truncated: a.truncated }))
      .catch((e: unknown) => {
        // a total that would sum results of several comparability keys is refused: the words and the keys apart, never a merged number
        const pooled = poolingOf(e);
        setTable(pooled ? { kind: "pooled", words: pooled } : { kind: "failed", why: engineWords(e) });
      });
  }, [run?.id, run?.status, pipeline?.id, measures, by, acts.table, acts.perScan, answered]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!run || !acts.files || OPEN.has(run.status)) return;
    runs.derivatives(run.id).then((r) => setFiles(r.derivatives), () => setFiles(null));
  }, [run?.id, run?.status, acts.files]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = (words: string, work: Promise<unknown>) => {
    setSaid(null);
    work.then(
      () => {
        setSaid(words);
        read();
      },
      (e: unknown) => setSaid(engineWords(e)),
    );
  };

  if (load.kind === "loading") return <Wait phase="reading the run" since={load.since} size="panel" />;
  if (load.kind === "failed") return <p className="warn">Run {id} could not be read: {load.why}</p>;
  const r = load.run;
  // a run that made masks is checked from here: one press, then Start checking
  const choice = load.pipeline ? runChoiceOf(r, [load.pipeline]) : null;
  const masks = (files ?? []).filter((f) => f.kind === "mask");
  const checkable = choice !== null && masks.length > 0 && makeCheckRefusal(caps) === null;
  const goesOn = acts.queue && resumable(r, load.jobAlive) ? () => setAgain(true) : null;
  return (
    <>
      {checking && choice && <NewCheck caps={caps} run={choice} onClose={() => setChecking(false)} />}
      {again && (
        <RunAgainDialog
          caps={caps}
          again={againOfRun(r)}
          onClose={() => setAgain(false)}
          onDone={(w) => {
            setAgain(false);
            setSaid(w);
            read();
          }}
        />
      )}
      <RunView
        caps={caps}
        run={r}
        pipeline={load.pipeline}
        resumedAt={load.resumedAt}
        jobAlive={load.jobAlive}
        table={table}
        files={files}
        by={by}
        onBy={setBy}
        said={said}
        onCancel={r.job_id !== null && acts.cancel && load.jobAlive ? () => act(`Run ${r.id} stops at its next heartbeat; the units it finished are kept.`, ops.cancel(r.job_id!)) : null}
        onResume={goesOn}
        onCheck={checkable ? () => setChecking(true) : null}
        onAgain={goesOn}
        checkPrimary={masks.some((f) => !f.check)}
        pack={pack}
        numbers={numbers}
        people={people.value}
      />
    </>
  );
}

const TONE_WORDS: Record<UnitTone, string> = { running: "running", waiting: "waiting", done: "done", skipped: "skipped", failed: "failed", kept: "kept on resume" };
const TONE_TAG: Record<UnitTone, string> = { running: "tag brand", waiting: "tag", done: "tag ok", skipped: "tag caution", failed: "tag caution", kept: "tag ok" };

/** The run as the page draws it from what it read. */
export function RunView(props: {
  caps: Capabilities;
  run: RunDetail;
  pipeline: Pipeline | null;
  resumedAt: string | null;
  jobAlive: boolean;
  table: Table;
  files: Derivative[] | null;
  by: string;
  onBy: (field: string) => void;
  said: string | null;
  onCancel: (() => void) | null;
  onResume: (() => void) | null;
  /** Check results: the New check for this run's masks, where it made any. */
  onCheck?: (() => void) | null;
  /** Masks no check has decided remain: the button is the page's primary act. */
  checkPrimary?: boolean;
  /** Run again, once a missing tool is installed: opens the run's pre-flight, which takes it up again. */
  onAgain?: (() => void) | null;
  /** Wave 7b: the version's pack, whose rules' words say why a rule chose. */
  pack?: PackView | null;
  /** Wave 7b: the run's numbers per comparability key. */
  numbers?: RunNumbers | null;
  /** The desk's directory, for the names of the people who chose. */
  people?: { subject: string; display: string }[] | null;
}) {
  const { caps, run: r, pipeline, resumedAt, table, files, by, onBy, said, onCancel, onResume, onCheck = null, checkPrimary = false, onAgain = null, pack = null, numbers = null, people = null } = props;
  const name = namer(caps, people);
  const softHref = softwareHrefFor(caps);
  const acts = runActs(caps);
  const units = r.units_run ?? [];
  const counts = unitCounts(units, resumedAt);
  const s = (r.summary ?? {}) as Record<string, unknown>;
  const total = Number(((s.units ?? {}) as Record<string, unknown>).total ?? units.length);
  const checks = checksOf(r);
  const byCheck = breachesByCheck(r);
  const failures = failuresByReason(r);
  // since 2026-10-12 the engine counts the failed units by cause, at every detail
  const causes = failuresByCause(r);
  const converter = converterOf(r);
  const running = OPEN.has(r.status);
  // why it failed, whole (2026-10-12): the kind and what to do where the engine says them, else the error's first sentence
  const failed = failureOf(r);
  const main = mainReadOf(r);
  // below detail quasi the engine lists no unit: the totals are its own, a withheld one fewer than five
  const totals = checks.totals ? unitTotals(r) : null;
  // 2026-10-12: the units summed as the engine says them, never a bare done
  const made = madeOf(r);
  const words = made && made.units > 0 ? madeWords(made) : null;
  const tag = runTag(r);
  // 2026-10-13: each unit's files, and View where one is a mask drawn on a scan
  const unitNames = units.map((u) => u.unit).filter((u): u is string => typeof u === "string");
  const byUnit = files ? filesByUnit(files, unitNames).units : null;
  const views = viewActs(caps) && byUnit !== null && [...byUnit.values()].some((fs) => fs.some(drawable));
  const viewOf = (unit: string | null) => (views && unit && byUnit?.get(unit)?.some(drawable) ? narrow(href("pipelines", "runs", String(r.id)), { view: unit }) : null);
  // Wave 7b: units a pack judged carry their comparability key
  const keyed = units.some((u) => u.keys?.comparability);
  const cols = 5 + (views ? 1 : 0) + (keyed ? 1 : 0);
  const unitCells = totals
    ? [
        { k: "units", v: words && !running ? words.head : total > 0 ? `${n(totals.over)} of ${n(total)} over` : "none yet" },
        ...(totals.failed !== 0 ? [{ k: "failed", v: heldWords(totals.failed) }] : []),
      ]
    : [
        { k: "units", v: words && !running ? words.head : total > 0 ? `${n(counts.done + counts.kept)} of ${n(total)} done` : "none yet" },
        ...(counts.failed > 0 ? [{ k: "failed", v: n(counts.failed) }] : []),
        ...(counts.skipped > 0 ? [{ k: "skipped", v: n(counts.skipped) }] : []),
        ...(counts.kept > 0 ? [{ k: "kept on resume", v: n(counts.kept) }] : []),
      ];
  // a run that ended without making all it was for says why, one line a reason with the units under it
  const short = words !== null && words.tone === "caution" && !running && r.status !== "failed";
  const reasons = short ? (units.length > 0 ? unitsByWhy(units).map((w) => ({ why: `${w.status}: ${w.why}`, count: w.units.length as number | null, units: w.units })) : (made?.why ?? []).map((w) => ({ why: `${w.status}: ${w.why}`, count: w.units, units: [] as string[] }))) : [];
  const cells = [
    // a run that ended reads as its units summed (the tag above, and units here), never a bare done
    ...(words && !running && (r.status === "done" || r.status === "partial") ? [] : [{ k: "status", v: r.status }]),
    ...unitCells,
    { k: "over", v: r.selection ? overWords(r.selection, main?.roles ?? null) : r.handle_id ? `handle ${r.handle_id}` : "", title: main ? [main.of, main.read].filter(Boolean).join(": ") : (r.selection ?? undefined) },
    // record 55 (2026-10-12): a dataset's or a cohort's main scans say which rules picked them
    ...(main && rulesWords(main) ? [{ k: "picked by", v: rulesWords(main)!, title: main.read ?? undefined }] : []),
    { k: "on", v: [r.runtime, r.device].filter(Boolean).join(", ") || "not yet" },
    ...(converter ? [{ k: "dcm2niix", v: converter.version ?? "found", title: [converter.path, foundByWords(converter.found_by)].filter(Boolean).join(", ") || undefined }] : []),
    { k: running ? "since" : "ran", v: whenWords(r.started_at ?? "") },
  ];
  return (
    <section className="stack roomy run-page">
      <div className="row actions">
        <span className={tag.className}>{tag.words}</span>
        <b>{r.pipeline}</b>
        <span className="meta">run {r.id}{r.job_id !== null ? ` · job ${r.job_id}` : ""}{(r.resumes ?? 0) > 0 ? ` · taken up ${n(r.resumes!)} ${r.resumes === 1 ? "time" : "times"}` : ""}</span>
        <span className="grow" />
        {onCancel && (
          <button type="button" className="button secondary small" onClick={onCancel}>
            Cancel
          </button>
        )}
        {onResume && (
          <button type="button" className="button small" onClick={onResume}>
            Resume
          </button>
        )}
        {onCheck && (
          <button type="button" className={checkPrimary ? "button small" : "button quiet small"} onClick={onCheck}>
            Check results
          </button>
        )}
      </div>
      <Values cells={cells} />
      {said && <p className="meta">{said}</p>}
      {failed && (
        <FailNote f={failed} software={softHref}>
          <InstallFor caps={caps} f={failed} again={onAgain} />
        </FailNote>
      )}
      {short && words && (
        <div className="note caution made-note">
          <Icon name="alert" />
          <div className="note-body">
            <p className="note-lead">{words.head[0].toUpperCase() + words.head.slice(1)}</p>
            {words.rest && reasons.length === 0 && <p className="note-detail">{words.rest}</p>}
            {reasons.length > 0 && (
              <ul className="preflight-missing made-why" aria-label="why units made nothing">
                {reasons.map((w) => (
                  <li key={w.why}>
                    <b className="num">{heldWords(w.count)}</b> {w.why}
                    {w.units.length > 0 && (
                      <div className="meta cannot-units">
                        {w.units.slice(0, 6).join(", ")}
                        {w.units.length > 6 ? ` and ${n(w.units.length - 6)} more` : ""}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <div className="section-head rule-top">
        <h2>Table</h2>
        {table.kind === "ready" && <span className="meta">{table.perScan ? `${n(table.rows.length)} ${table.rows.length === 1 ? "scan" : "scans"}` : "totals by group"}</span>}
      </div>
      <TableView table={table} by={by} onBy={onBy} choices={groupBy(pipeline?.level)} />
      {numbers && (!numbers.pooled || table.kind === "pooled") && <KeysApart numbers={numbers} perScan={acts.perScan} words={table.kind === "pooled" ? null : numbers.words} />}

      <div className="section-head rule-top">
        <h2>Checks</h2>
        <span className="meta">
          {checks.declared === 0 ? "none declared" : `${n(checks.declared)} declared · ${heldWords(checks.breaches)} ${checks.breaches === 1 ? "breach" : "breaches"}${checks.unchecked > 0 ? ` · ${n(checks.unchecked)} unchecked` : ""}`}
        </span>
      </div>
      {allPassed(r) && !running && (made === null || (made.made ?? 1) > 0) && <p className="meta">Every unit that finished passed its checks.</p>}
      {checks.totals && <p className="meta">Counted by check at your detail; a count under five scans reads fewer than five.</p>}
      {byCheck.length > 0 && (
        <div className="table-wrap">
          <table className="thin">
            <thead>
              <tr>
                <th>Check</th>
                <th className="num">Units</th>
                {acts.perScan && !checks.totals && <th>Which</th>}
              </tr>
            </thead>
            <tbody>
              {byCheck.map((c) => (
                <tr key={c.check}>
                  <td className="path">{c.check}</td>
                  <td className="num">{heldWords(c.units)}</td>
                  {acts.perScan && !checks.totals && (
                    <td className="meta">
                      {checks.units
                        .filter((u) => u.breaches.some((b) => (b.check || b.metric) === c.check))
                        .slice(0, 5)
                        .map((u) => `${u.unit ?? "a unit"} (${u.breaches.find((b) => (b.check || b.metric) === c.check)?.value ?? "?"})`)
                        .join(", ")}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {checks.items !== 0 && acts.review && (
        <p className="meta">
          <a href={narrow(href("review", "questions"), { run: r.id })}>
            {heldWords(checks.items)} review {checks.items === 1 ? "item" : "items"}
          </a>{" "}
          for the failures and breaches of this run
        </p>
      )}

      <div className="section-head rule-top">
        <h2>Units</h2>
        <span className="meta">
          {totals
            ? `${n(totals.over)} of ${n(total)} over`
            : (Object.keys(TONE_WORDS) as UnitTone[])
                .filter((t) => counts[t] > 0)
                .map((t) => `${n(counts[t])} ${TONE_WORDS[t]}`)
                .join(" · ") || "none yet"}
        </span>
      </div>
      {causes.length > 0 && (
        <div className="table-wrap">
          <table className="thin">
            <thead>
              <tr>
                <th>Failed, by cause</th>
                <th className="num">Units</th>
              </tr>
            </thead>
            <tbody>
              {causes.map((c) => (
                <tr key={`${c.kind}:${c.cause}`}>
                  <td>
                    <span className="fail-said">
                      <KindTag kind={c.kind} cause={c.cause} />
                      <span>{c.cause.replace(/_/gu, " ")}</span>
                    </span>
                  </td>
                  <td className="num">{heldWords(c.units)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {totals && causes.length === 0 && failures.length > 0 && (
        <div className="table-wrap">
          <table className="thin">
            <thead>
              <tr>
                <th>Failed, by reason</th>
                <th className="num">Units</th>
              </tr>
            </thead>
            <tbody>
              {failures.map((f) => (
                <tr key={f.reason}>
                  <td>{f.reason}</td>
                  <td className="num">{heldWords(f.units)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {totals && <p className="meta">At your detail a run names no unit; its units are counted by state and reason.</p>}
      {units.length > 0 && (
        <div className="table-wrap">
          <table className="thin">
            <thead>
              <tr>
                <th>Unit</th>
                <th>State</th>
                <th className="num">Tries</th>
                <th>On</th>
                <th className="num">Ended</th>
                {keyed && <th>Key</th>}
                {views && <th className="acts" />}
              </tr>
            </thead>
            <tbody>
              {units.slice(0, 200).map((u, i) => {
                const t = unitTone(u, resumedAt);
                const f = t === "failed" ? failureOf(u) : null;
                // a skipped unit says what it lacked, in the engine's few words
                const lacks = t === "skipped" ? (u.lacks && u.lacks.length > 0 ? u.lacks.join("; ") : (u.error ?? null)) : null;
                const view = viewOf(u.unit);
                // Wave 7b: the pack's status word and words, who chose each knob, the caveats, the flags
                const said = packWords(u);
                const knobs = Object.entries(u.knobs ?? {});
                const extra = knobs.length > 0 || (u.caveats ?? []).length > 0 || said.words !== null || (u.cohort_checks ?? []).some((c) => c.status === "flagged" || c.status === "not yet");
                return (
                  <Fragment key={u.unit ?? `u${i}`}>
                    <tr className={f || lacks || said.status === "dropped" ? "has-fail" : undefined}>
                      <td className="path">{u.unit ?? `unit ${i + 1}`}</td>
                      <td>
                        <span className={TONE_TAG[t]}>{TONE_WORDS[t]}</span>
                        {said.status && said.status !== "skipped" && <span className={said.status === "routed" ? "tag brand" : "tag caution"}>{said.status}</span>}
                        {u.exit_code !== null && u.exit_code !== undefined && u.exit_code !== 0 ? <span className="meta"> · exit {u.exit_code}</span> : null}
                      </td>
                      <td className="num">{u.attempts ?? ""}</td>
                      <td className="meta">{u.device ?? ""}</td>
                      <td className="num">{u.finished_at ? whenWords(u.finished_at) : ""}</td>
                      {keyed && (
                        <td className="unit-key" title={keyTitle(u.keys?.comparability, u.key_members)}>
                          {keyShort(u.keys?.comparability)}
                        </td>
                      )}
                      {views && (
                        <td className="acts">
                          {view && (
                            <a className="button secondary small" href={view} aria-label={`View ${u.unit}`}>
                              View
                            </a>
                          )}
                        </td>
                      )}
                    </tr>
                    {f && (
                      <tr className="fail-row">
                        <td colSpan={cols}>
                          <FailLine f={f} />
                        </td>
                      </tr>
                    )}
                    {extra && !(lacks && said.status === "skipped" && knobs.length === 0) && (
                      <tr className="made-row unit-pack-row">
                        <td colSpan={cols}>
                          <UnitPack u={u} said={said} skippedShown={lacks !== null} name={name} pack={pack} />
                        </td>
                      </tr>
                    )}
                    {lacks && (
                      <tr className="made-row">
                        <td colSpan={cols}>
                          <div className="made-line">
                            <span className="made-words" title={u.error ?? lacks}>
                              {lacks}
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
      {units.length > 200 && <p className="meta">The first 200 of {n(units.length)} units.</p>}

      {files !== null && (
        <>
          <div className="section-head rule-top">
            <h2>Files</h2>
            <span className="meta">{n(files.length)} made</span>
          </div>
          {files.length > 0 && <FilesView files={files} units={unitNames} />}
        </>
      )}
      {/* gate T31, step 15.8: what the run suggests curating, saved as a selection */}
      <RunSeeds caps={caps} run={r.id} suggested={!running && seedsSuggested(s)} />
      {pipeline === null && <p className="meta">The catalog no longer lists this run&apos;s pipeline, so its table is not read.</p>}
      <Says head="Where the numbers come from">
        Each value is the unit&apos;s newest run of this pipeline&apos;s version; a row here is one this run measured and the ask still reads. Below detail quasi a measure is shown only as a total over a group of 5 scans or more; a smaller group&apos;s totals are withheld.
      </Says>
    </section>
  );
}

/** A unit as its pack judged it: the pack's words, each knob with who chose it, the caveats, the flags and the cohort checks. */
function UnitPack({ u, said, skippedShown, name, pack }: { u: UnitRun; said: ReturnType<typeof packWords>; skippedShown: boolean; name: (p: string) => string; pack: PackView | null }) {
  const knobs = Object.entries(u.knobs ?? {});
  const cohort = (u.cohort_checks ?? []).filter((c) => c.status === "flagged" || c.status === "not yet");
  return (
    <div className="unit-pack">
      {said.words && !(said.status === "skipped" && skippedShown) && <span className={said.status === "routed" ? "meta" : "unit-flag"}>{said.status === "routed" ? `routed ${said.words}` : said.words}</span>}
      {knobs.map(([id, c]) => {
        const b = byWords(c, name, pack);
        return (
          <span key={id} className={`knob ${b.kind}`} title={b.title ?? pack?.knobs[id]?.what ?? undefined}>
            <span className="knob-id">{id}</span>
            <b>{valueWords(c.value)}</b>
            <span className="knob-by">{b.words}</span>
          </span>
        );
      })}
      {(u.caveats ?? []).map((c, i) => (
        <span key={`c${i}`} className="unit-caveat" title={c.source ?? undefined}>
          {c.words}
        </span>
      ))}
      {said.status !== "flagged" && said.status !== "dropped" &&
        (u.flags ?? []).map((f, i) => (
          <span key={`f${i}`} className="unit-flag" title={f.source ?? undefined}>
            {flagWords(f)}
          </span>
        ))}
      {cohort.map((c) => (
        <span key={`k${c.metric}`} className={c.status === "flagged" ? "unit-flag" : "meta"} title={c.came_at ? `flagged ${whenWords(c.came_at)}${c.after_run_closed ? ", after the run closed" : ""}` : undefined}>
          {c.status === "flagged" ? `${c.metric} against the cohort: ${c.words ?? `z ${c.z ?? "?"}`}` : `${c.metric} against the cohort: not yet, ${c.sessions ?? 0} of ${c.min_sessions ?? 30} sessions`}
        </span>
      ))}
    </div>
  );
}

/** A run's numbers per comparability key, apart: the pooling words, and each key with its units and its measures' means, never one number across keys. Below detail quasi a key of fewer than 5 units reads withheld. */
function KeysApart({ numbers, perScan, words }: { numbers: RunNumbers; perScan: boolean; words: string | null }) {
  const names = [...new Set(numbers.keys.flatMap((k) => Object.keys(k.measures)))].slice(0, 6);
  return (
    <div className="keys-apart">
      {words && <p className="meta">{words}</p>}
      <div className="table-wrap">
        <table className="thin">
          <thead>
            <tr>
              <th>Key</th>
              <th className="num">Units</th>
              {names.map((m) => (
                <th key={m} className="num">
                  mean {m.replace(/_/gu, " ")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {numbers.keys.map((k) => (
              <tr key={k.comparability_key}>
                <td className="unit-key" title={k.comparability_key}>
                  {k.short || keyShort(k.comparability_key)}
                </td>
                <td className="num">{k.units.toLocaleString("en-US")}</td>
                {names.map((m) => (
                  <td key={m} className="num">
                    {k.measures[m] ? (perScan || k.units >= 5 ? cellWords(k.measures[m].mean) : "withheld") : ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(numbers.unkeyed ?? 0) > 0 && <p className="meta">{numbers.unkeyed!.toLocaleString("en-US")} units from before the pack carry no key and are counted apart.</p>}
    </div>
  );
}

function TableView({ table, by, onBy, choices }: { table: Table; by: string; onBy: (field: string) => void; choices: { field: string; label: string }[] }) {
  if (table.kind === "off") return <p className="meta">{table.why ?? "This run loaded no measures."}</p>;
  if (table.kind === "loading") return <p className="meta">Reading the table…</p>;
  if (table.kind === "failed") return <p className="warn">The table could not be read: {table.why}</p>;
  if (table.kind === "pooled")
    return (
      <div className="note caution">
        <Icon name="alert" />
        <div className="note-body">
          <p className="note-lead">Not summed: several comparability keys</p>
          <p className="note-detail">{table.words}</p>
        </div>
      </div>
    );
  const cols = shownColumns(table.columns);
  return (
    <>
      {!table.perScan && (
        <div className="field-row">
          <span className="meta">Totals by</span>
          <div className="chips" role="group" aria-label="group the totals by">
            {choices.map((g) => (
              <button key={g.field} type="button" className={by === g.field ? "tag brand" : "tag"} aria-pressed={by === g.field} onClick={() => onBy(g.field)}>
                {g.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {!table.perScan && (
        <div className="note gated">
          <Icon name="lock" />
          <div className="note-body">
            <p className="note-detail">At your detail a scan&apos;s measure is not shown. A group&apos;s totals show when it holds 5 scans or more (k = 5); a smaller group reads withheld.</p>
          </div>
        </div>
      )}
      {table.rows.length === 0 ? (
        <p className="meta">No row: the ask reads a newer run for these units, or none was measured.</p>
      ) : (
        <div className="table-wrap">
          <table className="thin">
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c.name} className={c.name === "id" ? "num" : undefined}>
                    {headerWords(c.name)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, i) => (
                <tr key={i}>
                  {cols.map((c) => (
                    <td key={c.name} className={typeof row[c.at] === "number" || row[c.at] === null ? "num" : undefined}>
                      {cellWords(row[c.at])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {table.truncated && <p className="meta">The first rows only; the whole table is answered in Query.</p>}
    </>
  );
}

/** The files a run made, by unit: each file's short name, kind and size, and a mask's check. */
function FilesView({ files, units }: { files: Derivative[]; units: string[] }) {
  const byKind = new Map<string, number>();
  for (const f of files) byKind.set(f.kind, (byKind.get(f.kind) ?? 0) + 1);
  const masks = files.some((f) => f.kind === "mask");
  const grouped = filesByUnit(files, units);
  const rows: { unit: string | null; f: Derivative; first: boolean }[] = [];
  for (const [unit, fs] of grouped.units) fs.forEach((f, i) => rows.push({ unit, f, first: i === 0 }));
  grouped.own.forEach((f, i) => rows.push({ unit: null, f, first: i === 0 }));
  const shown = rows.slice(0, 50);
  return (
    <>
      <p className="meta">{[...byKind.entries()].map(([k, c]) => `${n(c)} ${k}`).join(" · ")}</p>
      <div className="table-wrap">
        <table className="thin run-files">
          <thead>
            <tr>
              <th>Unit</th>
              <th>File</th>
              <th>Kind</th>
              <th className="num">Size</th>
              {masks && <th>Check</th>}
            </tr>
          </thead>
          <tbody>
            {shown.map(({ unit, f, first }) => (
              <tr key={f.id} className={first ? "unit-first" : undefined}>
                <td className="path">{first ? (unit ?? "the run") : ""}</td>
                <td className="path run-file" title={`file ${f.id} · ${fileName(f)} · sha256 ${f.sha256.slice(0, 12)}`}>
                  {shortName(fileName(f), unit)}
                </td>
                <td>{f.kind}</td>
                <td className="num">{sizeWords(f.bytes)}</td>
                {masks && (
                  <td>
                    {f.kind === "mask" && (
                      <span className={checkTag(f.check).className} title={f.grid_link === "none" ? "no scan is known for it: it cannot be drawn" : undefined}>
                        {checkTag(f.check).words}
                      </span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {files.length > 50 && <p className="meta">The first 50 of {n(files.length)} files.</p>}
    </>
  );
}
