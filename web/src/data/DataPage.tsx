// SPDX-License-Identifier: AGPL-3.0-only
// The Datasets page, as an app (Wave 7a, the tries of 2026-10-08): the
// datasets only, a card each with its name, one state word, its counts and
// the one button for its next step, the rest in its menu. No folder is listed:
// "Add a dataset" opens a finder that searches a root's folders. How to start is always on screen. Now lists what runs;
// the chosen dataset's scans and reads follow. No paragraphs: an explanation sits behind
// a "?". The section's other pages, the cohorts, a read and a dataset's
// pseudonymisation, are mounted by the shell beside this one.

import { useCallback, useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";
import { placesKept } from "../objects/kept";
import { href, narrow } from "../routes";
import { MoreMenu } from "../settings/cards";
import type { Install } from "../settings/supervise";
import { Hint } from "../ui/Hint";
import { Icon } from "../ui/Icon";
import { useKept } from "../ui/kept";
import { Wait } from "../ui/Wait";
import { AddDataset } from "./AddDataset";
import { BringInNew } from "./BringInNew";
import { batchTail, jobs as jobsDoor, packFor, sources, STAGES, stripMarks, type Batch, type Dataset, type Layout, type Rates, type StageName } from "./datasets";
import { SetIdsDialog, SortFilesDialog, type Finishing } from "./FinishDataset";
import { isRoot, notReadOf } from "./layout";
import { NowSection, useLiveJobs } from "./Now";
import { Scans } from "./Scans";
import { maySeePicks } from "./picks";
import { mayListScans } from "./scans";
import { fileWords, whenWords } from "./sources";
import { plainError } from "./plain";
import { certainty, certaintyWords, kindWords, nextStep, stepCommand, type StepId } from "./steps";

type Load = { kind: "loading"; since: number } | { kind: "failed"; why: string } | { kind: "ready"; list: Dataset[]; rates: Rates | null };

const n = (v: number) => v.toLocaleString("en-US");

/** The five marks of a read, in one letter each, under the words they stand for. */
const STAGE_WORD: Record<StageName, string> = { pseudonymised: "Pseudonymised", walked: "Found", digested: "Read", classified: "Sorted", reviewed: "Checked" };
const LETTER: Record<StageName, string> = { pseudonymised: "P", walked: "F", digested: "R", classified: "S", reviewed: "C" };

/** The one tone of each state word. */
const TONE: Record<string, string> = { Unknown: "tag caution", Anonymised: "tag caution", Identified: "tag gated", Ready: "tag ok" };

/** The Datasets page; `dataset` is the one the address names, #data/datasets/<name>, chosen on arrival. */
export function DataPage({ caps, install, onChanged, dataset }: { caps: Capabilities; install: Install | null; onChanged: () => void; dataset?: string | null }) {
  const [load, setLoad] = useState<Load>(() => ({ kind: "loading", since: Date.now() }));
  const [chosen, setChosen] = useState<string | null>(dataset ?? null);
  const [bringing, setBringing] = useState<Dataset | null>(null);
  const [adding, setAdding] = useState(false);
  /** The dialog a dataset's step opens. */
  const [opened, setOpened] = useState<{ kind: "sort-files" | "set-ids"; dataset: Dataset } | null>(null);
  /** What the page last said: a done act's words, or a refusal as one plain line with the engine's words behind a "?". */
  const [said, setSaid] = useState<{ words: string; detail?: string } | null>(null);
  const say = (words: string) => setSaid({ words });
  const failed = (e: unknown) => setSaid(plainError(e));
  const places = useKept(placesKept);
  const jobs = useLiveJobs(caps);
  const works = may(caps, "data:work");
  useEffect(() => {
    if (dataset) setChosen(dataset);
  }, [dataset]);

  const read = useCallback(() => {
    sources
      .list()
      .then((r) => setLoad({ kind: "ready", list: r.sources, rates: r.rates ?? null }))
      .catch((e: Error) => setLoad((was) => (was.kind === "ready" ? was : { kind: "failed", why: e.message })));
  }, []);


  useEffect(() => {
    read();
    if (served(caps, "GET /api/places")) void placesKept.ensure();
  }, [read, caps]);

  // the datasets are read again when a job ends, and every twenty seconds while one runs
  const openCount = (jobs.open ?? []).filter((j) => j.state !== "done" && j.state !== "failed" && j.state !== "cancelled").length;
  const reading = load.kind === "ready" && (openCount > 0 || load.list.some((s) => s.digests.recent.some((d) => d.state === "running")));
  useEffect(() => {
    if (load.kind === "ready") read();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a change in the open jobs is what reads again
  }, [openCount]);
  useEffect(() => {
    if (!reading) return;
    const t = setInterval(read, 20_000);
    return () => clearInterval(t);
  }, [reading, read]);

  // a root is where folders live, never a dataset
  const list = load.kind === "ready" ? load.list.filter((d) => !isRoot(d)) : [];
  const placeOf = (d: Dataset) => places.value?.places.find((p) => p.id === d.id) ?? null;
  /** Why a dataset is not read yet: the places door's own words where it was read, else the same reasoning from the dataset. */
  const whyOf = (d: Dataset): string | null => {
    const p = placeOf(d);
    return p && p.not_read !== undefined ? p.not_read : notReadOf(d);
  };
  const rates = load.kind === "ready" ? load.rates : null;
  const current = list.find((s) => s.name === chosen) ?? list[0] ?? null;
  const changed = (words: string) => {
    say(words);
    void placesKept.refresh().catch(() => undefined);
    onChanged();
    jobs.refresh();
    read();
  };

  /** A dataset's step: a dialog for what it still needs, else its job queued. */
  const step = (d: Dataset, id: StepId) => {
    if (id === "sort-files" || id === "set-ids") return setOpened({ kind: id, dataset: d });
    const c = stepCommand(d, id, packFor(caps));
    if (!c) return;
    setSaid(null);
    jobsDoor
      .enqueue(c.command, c.name, c.then)
      .then((j) => changed(`${d.name}: started (job ${j.job}).`))
      .catch(failed);
  };

  const readAgain = (b: Batch, d: Dataset) => {
    setSaid(null);
    jobsDoor
      .enqueue(["digest", "--name", b.name, `@${d.name}`], b.name)
      .then((j) => {
        say(`${d.name} is read again (job ${j.job}).`);
        jobs.refresh();
      })
      .catch(failed);
  };

  const finishing = (d: Dataset): Finishing => ({
    id: d.id,
    name: d.name,
    path: d.path,
    dataset: placeOf(d)?.dataset ?? { kind: d.kind, state: d.state, arrives: d.arrives, root: d.root, patient_id: d.patient_id, subjects: d.subjects, copy_folder: d.copy_folder },
    not_read: whyOf(d),
  });
  const layoutOf = (d: Dataset): Layout | null => placeOf(d)?.layout ?? null;

  return (
    <section className="data">
      <div className="data-head">
        <div className="grow">
          <span className="eyebrow">Data</span>
          <h1>Datasets</h1>
        </div>
        {works && (
          <button type="button" className="button" onClick={() => setAdding(true)}>
            <Icon name="plus" />
            Add a dataset
          </button>
        )}
      </div>
      {said && (
        <p className={said.detail === undefined ? "meta" : "warn"} role={said.detail === undefined ? undefined : "alert"}>
          {said.words}
          {said.detail !== undefined && <Hint text={said.detail} />}
        </p>
      )}
      {load.kind === "loading" && <Wait phase="reading the datasets" since={load.since} size="panel" />}
      {load.kind === "failed" && (
        <p className="warn">
          The datasets could not be read.
          <Hint text={load.why} />
        </p>
      )}
      {load.kind === "ready" && list.length === 0 && <p className="meta">No dataset yet.</p>}
      {list.length > 0 && (
        <div className="sgrid">
          {list.map((d) => (
            <DatasetCard
              key={d.id}
              dataset={d}
              why={whyOf(d)}
              on={current?.id === d.id}
              works={works}
              onPick={() => setChosen(d.name)}
              onStep={(id) => step(d, id)}
              onBringIn={() => setBringing(d)}
            />
          ))}
        </div>
      )}
      {current && (mayListScans(caps) || maySeePicks(caps)) && <Scans caps={caps} dataset={current} />}
      <NowSection caps={caps} jobs={jobs} onSaid={say} onFailed={failed} />
      {current && current.digests.count > 0 && <Batches dataset={current} works={works && whyOf(current) === null} onBringIn={() => setBringing(current)} onAgain={(b) => readAgain(b, current)} />}
      {bringing && (
        <BringInNew
          caps={caps}
          dataset={bringing}
          rates={rates}
          onClose={() => setBringing(null)}
          onDone={(words) => {
            setBringing(null);
            changed(words);
          }}
        />
      )}
      {opened?.kind === "sort-files" && (
        <SortFilesDialog
          caps={caps}
          place={finishing(opened.dataset)}
          layout={layoutOf(opened.dataset)}
          onClose={() => setOpened(null)}
          onDone={(words) => {
            setOpened(null);
            changed(words);
          }}
        />
      )}
      {opened?.kind === "set-ids" && (
        <SetIdsDialog
          caps={caps}
          place={finishing(opened.dataset)}
          layout={layoutOf(opened.dataset)}
          onClose={() => setOpened(null)}
          onDone={(words) => {
            setOpened(null);
            changed(words);
          }}
        />
      )}
      {adding && (
        <AddDataset
          caps={caps}
          install={install}
          places={places.value?.places ?? []}
          onClose={() => setAdding(false)}
          onDone={(words) => {
            setAdding(false);
            changed(words);
          }}
        />
      )}
    </section>
  );
}

function DatasetCard(props: { dataset: Dataset; why: string | null; on: boolean; works: boolean; onPick: () => void; onStep: (id: StepId) => void; onBringIn: () => void }) {
  const { dataset: d, why, on, works, onPick, onStep, onBringIn } = props;
  const next = nextStep(d, why);
  const sure = certainty(d);
  const files = d.trees?.anon?.files ?? d.trees?.originals?.files ?? null;
  return (
    <div className={on ? "scard on" : "scard"} aria-current={on ? "true" : undefined} onClick={onPick}>
      <div className="name">
        <Icon name="folder" />
        <button type="button" className="scard-pick grow" aria-pressed={on} onClick={onPick}>
          {d.name}
        </button>
        <span className={TONE[next.word]} title={why ?? undefined}>
          {next.word}
        </span>
        <span onClick={(e) => e.stopPropagation()}>
          <MoreMenu label={`More for ${d.name}`}>
            {works && next.step !== "running" && why === null && (
              <button type="button" onClick={onBringIn}>
                Do all steps
              </button>
            )}
            {works && next.step !== "sort-files" && d.state !== "unknown" && (
              <button type="button" onClick={() => onStep("set-ids")}>
                Set the IDs
              </button>
            )}
            {works && next.step !== "read" && why === null && d.digests.count > 0 && (
              <button type="button" onClick={() => onStep("read")}>
                Read again
              </button>
            )}
            <a href={href("data", "datasets", d.name, "pseudonymisation")}>Pseudonymisation</a>
          </MoreMenu>
        </span>
      </div>
      <div className="nums">
        <div>
          <b>{files === null ? "?" : n(files)}</b>
          <span>files</span>
        </div>
        <div>
          <b>{n(d.totals.subjects)}</b>
          <span>subjects</span>
        </div>
        {!sure && (
          <div>
            <b>{n(d.totals.stacks)}</b>
            <span>scans</span>
          </div>
        )}
      </div>
      {sure && (
        <div className={sure.look > 0 ? "sure-line look" : "sure-line"} title={sure.look > 0 ? kindWords(sure.kinds) || undefined : undefined}>
          {certaintyWords(sure)}
        </div>
      )}
      {works && (
        <div className="row next" onClick={(e) => e.stopPropagation()}>
          {next.step === "review" ? (
            <a className="button small" href={narrow(href("review"), { dataset: d.name })} aria-label={`${next.label}: ${d.name}`}>
              {next.label}
            </a>
          ) : (
            <button type="button" className="button small" disabled={next.busy} aria-label={`${next.label}: ${d.name}`} onClick={() => onStep(next.step)}>
              {next.label}
            </button>
          )}
          {why !== null && <Hint text={why} />}
        </div>
      )}
    </div>
  );
}

/** The chosen dataset's reads, newest first, each with its five marks. */
function Batches({ dataset: d, works, onBringIn, onAgain }: { dataset: Dataset; works: boolean; onBringIn: () => void; onAgain: (b: Batch) => void }) {
  const recent = d.digests.recent;
  const held = d.held?.files ?? 0;
  return (
    <section className="stack roomy" aria-label={`the reads of ${d.name}`}>
      <div className="section-head rule-top">
        <h2>Reads of {d.name}</h2>
        <span className="meta">
          {n(d.digests.count)} in all
          {d.totals.refused_files > 0 ? ` · ${n(d.totals.refused_files)} files refused` : ""}
          {held > 0 ? ` · ${n(held)} held until mapped` : ""}
        </span>
        {works && (
          <button type="button" className="button secondary small" onClick={onBringIn}>
            Do all steps
          </button>
        )}
      </div>
      {recent.length === 0 && <p className="meta">Nothing has read this dataset yet.</p>}
      {recent.length > 0 && (
        <div className="table-wrap">
          <table className="thin batches">
            <thead>
              <tr>
                <th>Read</th>
                <th>When</th>
                <th>Files</th>
                <th>Subjects</th>
                <th className="strip-head">{STAGES.map((s) => STAGE_WORD[s]).join(" · ")}</th>
                <th className="acts">
                  <span className="sr-only">Next</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {recent.map((b) => {
                const marks = stripMarks(b);
                const tail = batchTail(b);
                return (
                  <tr key={b.id}>
                    <td>
                      <a className="path batch-link" href={href("data", "batch", String(b.id))}>
                        {b.name}
                      </a>
                    </td>
                    <td className="num">{whenWords(b.started_at)}</td>
                    <td className="num">{b.state === "running" ? `${n(b.files.seen)} so far` : fileWords(b)}</td>
                    <td className="num">{b.subjects_added === 0 ? "none new" : `${n(b.subjects_added)} new`}</td>
                    <td>
                      <div className="thread" role="img" aria-label={marks.map((m) => `${STAGE_WORD[m.name]}: ${m.words}`).join(", ")}>
                        {marks.map((m) => (
                          <span key={m.name} className={m.mark === "none" ? undefined : m.mark} title={`${STAGE_WORD[m.name]}: ${m.words}`}>
                            {LETTER[m.name]}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="acts">
                      {tail.kind === "held" && (
                        <a className="tail" href={href("data", "datasets", d.name, "pseudonymisation")}>
                          {tail.words}
                          <Icon name="chevron-right" />
                        </a>
                      )}
                      {tail.kind === "sort" && (
                        <a className="tail" href={narrow(href("review"), { batch: b.id })}>
                          {tail.words}
                          <Icon name="chevron-right" />
                        </a>
                      )}
                      {tail.kind === "again" && works && (
                        <button type="button" className="link-button tail" onClick={() => onAgain(b)}>
                          {tail.words}
                          <Icon name="chevron-right" />
                        </button>
                      )}
                      {tail.kind === "again" && !works && <span className="tag">{b.state}</span>}
                      {tail.kind === "reading" && <span className="tag brand">reading</span>}
                      {tail.kind === "sorted" && (
                        <span className="tag ok">
                          <Icon name="check" />
                          sorted
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {d.digests.count > recent.length && <p className="meta">The {recent.length} newest of {d.digests.count}.</p>}
    </section>
  );
}
