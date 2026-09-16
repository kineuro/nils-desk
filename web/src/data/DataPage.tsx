// SPDX-License-Identifier: AGPL-3.0-only
// The Data page as shape C (record 26, D1): the batch is the thread. Each
// dataset is a card with what arrives through it, the cohort it feeds, its two
// trees, what it holds and its newest batch; Now lists the open jobs from the
// engine's event stream; the chosen dataset's batches follow, each with its
// five marks and each opening its own page. A dataset is added in a dialog,
// what is new is brought in as one chain, and how a dataset is pseudonymised
// and how it leaves are changed on its Pseudonymisation page. The section's
// other pages, the cohorts, a batch and a dataset's pseudonymisation, are
// mounted by the shell beside this one.

import { useCallback, useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";
import { placesKept } from "../objects/kept";
import { href, narrow } from "../routes";
import { MoreMenu } from "../settings/cards";
import type { Install } from "../settings/supervise";
import { Icon } from "../ui/Icon";
import { useKept } from "../ui/kept";
import { Wait } from "../ui/Wait";
import { AddDataset } from "./AddDataset";
import { BringInNew } from "./BringInNew";
import {
  arrivesOf,
  arrivesWords,
  batchTail,
  cohortWords,
  cohorts as cohortsDoor,
  datasetState,
  jobs as jobsDoor,
  lastLine,
  record26,
  sources,
  STAGES,
  stripMarks,
  treeLines,
  type Batch,
  type Dataset,
  type Rates,
} from "./datasets";
import { NowSection, useLiveJobs } from "./Now";
import { fileWords, whenWords } from "./sources";

type Load = { kind: "loading"; since: number } | { kind: "failed"; why: string } | { kind: "ready"; list: Dataset[]; rates: Rates | null };

const n = (v: number) => v.toLocaleString("en-US");

/** The Datasets page; `dataset` is the one the address names, #data/datasets/<name>, chosen on arrival. */
export function DataPage({ caps, install, onChanged, dataset }: { caps: Capabilities; install: Install | null; onChanged: () => void; dataset?: string | null }) {
  const [load, setLoad] = useState<Load>(() => ({ kind: "loading", since: Date.now() }));
  const [chosen, setChosen] = useState<string | null>(dataset ?? null);
  const [bringing, setBringing] = useState<Dataset | null>(null);
  const [adding, setAdding] = useState(false);
  const [cohorts, setCohorts] = useState<string[]>([]);
  const [said, setSaid] = useState<string | null>(null);
  const places = useKept(placesKept);
  const jobs = useLiveJobs(caps);
  const works = may(caps, "data:work");
  const modern = record26(caps);
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
    if (served(caps, "GET /api/cohorts")) cohortsDoor.list().then((r) => setCohorts(r.cohorts.map((c) => c.name)), () => setCohorts([]));
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

  const list = load.kind === "ready" ? load.list : [];
  const rates = load.kind === "ready" ? load.rates : null;
  const current = list.find((s) => s.name === chosen) ?? list[0] ?? null;
  const known = [...new Set([...cohorts, ...list.map((d) => d.cohort).filter((c): c is string => typeof c === "string" && c !== "")])];

  const readAgain = (b: Batch, d: Dataset) => {
    setSaid(null);
    jobsDoor
      .enqueue(["digest", "--name", b.name, `@${d.name}`], b.name)
      .then((j) => {
        setSaid(`${b.name} is read again as job ${j.job}.`);
        jobs.refresh();
      })
      .catch((e: Error) => setSaid(e.message));
  };

  return (
    <section className="data">
      <div className="data-head">
        <div className="grow">
          <span className="eyebrow">Data</span>
          <h1>Datasets</h1>
          <p className="lede">
            {modern
              ? "One dataset, one folder, one name. Identified data is pseudonymised into its own tree before anything reads it: the registry never points at an identified file."
              : "One dataset, one folder, one name. Each keeps every batch of it: each time files land, a batch reads what is new or changed."}
          </p>
        </div>
        {works && (
          <button type="button" className="button secondary" onClick={() => setAdding(true)}>
            <Icon name="folder" />
            Add a dataset
          </button>
        )}
        {works && current && (
          <button type="button" className="button" onClick={() => setBringing(current)}>
            <Icon name="play" />
            Bring in what is new
          </button>
        )}
      </div>
      {load.kind === "loading" && <Wait phase="reading the datasets" since={load.since} size="panel" />}
      {load.kind === "failed" && <p className="warn">The datasets could not be read: {load.why}</p>}
      {load.kind === "ready" && list.length === 0 && (
        <div className="note">
          <Icon name="info" />
          <div className="note-body">
            <p className="note-lead">No dataset yet.</p>
            <p className="note-detail">A dataset is a folder of DICOM with a name. {modern ? "What arrives identified is pseudonymised into its own tree before the registry reads it." : "NILS reads it and never writes to it."} Add one to bring its files in.</p>
          </div>
        </div>
      )}
      {list.length > 0 && (
        <div className="sgrid">
          {list.map((d) => (
            <DatasetCard
              key={d.id}
              dataset={d}
              on={current?.id === d.id}
              works={works}
              onPick={() => setChosen(d.name)}
              onBringIn={() => setBringing(d)}
            />
          ))}
        </div>
      )}
      {said && <p className="meta">{said}</p>}
      <NowSection caps={caps} jobs={jobs} onSaid={setSaid} />
      {current && <Batches dataset={current} works={works} onBringIn={() => setBringing(current)} onAgain={(b) => readAgain(b, current)} />}
      {modern && list.length > 0 && (
        <div className="note gated">
          <Icon name="lock" />
          <div className="note-body">
            <p className="note-lead">One person is one subject, wherever they come from, under however many numbers</p>
            <p className="note-detail">
              Every identifier a person was ever seen under is filed on their one subject in the sealed store, so any of them arriving in any dataset lands on the same code. An identifier the store does not know holds its files until someone maps it. UIDs are kept, so a study brought in twice is the same study.
            </p>
          </div>
        </div>
      )}
      {bringing && (
        <BringInNew
          caps={caps}
          dataset={bringing}
          rates={rates}
          onClose={() => setBringing(null)}
          onDone={(words) => {
            setBringing(null);
            setSaid(words);
            jobs.refresh();
            read();
          }}
        />
      )}
      {adding && (
        <AddDataset
          caps={caps}
          install={install}
          places={places.value?.places ?? []}
          cohorts={known}
          onClose={() => setAdding(false)}
          onDone={(words) => {
            setAdding(false);
            setSaid(words);
            void placesKept.refresh().catch(() => undefined);
            onChanged();
            jobs.refresh();
            read();
          }}
        />
      )}
    </section>
  );
}

function DatasetCard(props: { dataset: Dataset; on: boolean; works: boolean; onPick: () => void; onBringIn: () => void }) {
  const { dataset: d, on, works, onPick, onBringIn } = props;
  const state = datasetState(d);
  const arrives = arrivesWords(arrivesOf(d));
  const cohort = cohortWords(d);
  const trees = treeLines(d);
  return (
    <div className={on ? "scard on" : "scard"} aria-current={on ? "true" : undefined} onClick={onPick}>
      <div className="name">
        <Icon name="folder" />
        <button type="button" className="scard-pick grow" aria-pressed={on} onClick={onPick}>
          {d.name}
        </button>
        <span className={state.tone === "neutral" ? "tag" : `tag ${state.tone}`}>{state.words}</span>
        <span onClick={(e) => e.stopPropagation()}>
          <MoreMenu label={`More for ${d.name}`}>
            {works && (
              <button type="button" onClick={onBringIn}>
                Bring in what is new
              </button>
            )}
            <a href={href("data", "datasets", d.name, "pseudonymisation")}>Pseudonymisation</a>
          </MoreMenu>
        </span>
      </div>
      <span className="where">{d.path}</span>
      <div className="row">
        <span className={`privacy ${arrives.tone}`}>
          <Icon name={arrives.icon} />
          {arrives.words}
        </span>
        {cohort && (
          <span className={d.cohort ? "tag brand users" : "tag"}>
            {d.cohort && <Icon name="users" />}
            {cohort}
          </span>
        )}
      </div>
      {trees.length > 0 && (
        <div className="trees">
          {trees.map((t, i) => (
            <span key={t.path}>
              {i > 0 && <Icon name="arrow" />}
              <Icon name={t.icon} />
              <span className="path">{t.path}</span> {t.words}
            </span>
          ))}
        </div>
      )}
      <div className="nums">
        <div>
          <b>{n(d.totals.subjects)}</b>
          <span>subjects</span>
        </div>
        <div>
          <b>{n(d.totals.stacks)}</b>
          <span>stacks</span>
        </div>
        <div>
          <b>{n(d.digests.count)}</b>
          <span>{d.digests.count === 1 ? "batch" : "batches"}</span>
        </div>
      </div>
      <span className="meta">{lastLine(d)}</span>
    </div>
  );
}

function Batches({ dataset: d, works, onBringIn, onAgain }: { dataset: Dataset; works: boolean; onBringIn: () => void; onAgain: (b: Batch) => void }) {
  const recent = d.digests.recent;
  const held = d.held?.files ?? 0;
  return (
    <section className="stack roomy" aria-label={`the batches of ${d.name}`}>
      <div className="section-head rule-top">
        <h2>Batches of {d.name}</h2>
        <span className="meta">
          each time new files were brought in
          {d.totals.refused_files > 0 ? ` · ${n(d.totals.refused_files)} files refused` : ""}
          {held > 0 ? ` · ${n(held)} held until mapped` : ""}
        </span>
        <a className="button secondary small" href={href("data", "datasets", d.name, "pseudonymisation")}>
          Pseudonymisation
        </a>
        {works && (
          <button type="button" className="button small" onClick={onBringIn}>
            <Icon name="play" />
            Bring in what is new
          </button>
        )}
      </div>
      {recent.length === 0 && <p className="meta">Nothing has read this dataset yet.</p>}
      {recent.length > 0 && (
        <div className="table-wrap">
          <table className="thin batches">
            <thead>
              <tr>
                <th>Batch</th>
                <th>When</th>
                <th>Files</th>
                <th>Subjects</th>
                <th className="strip-head">{STAGES.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(" · ")}</th>
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
                      <div className="mini five" role="img" aria-label={marks.map((m) => `${m.name}: ${m.words}`).join(", ")} title={marks.map((m) => `${m.name}: ${m.words}`).join("\n")}>
                        {marks.map((m) => (
                          <i key={m.name} className={m.mark === "none" ? undefined : m.mark} />
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
      {d.digests.count > recent.length && <p className="meta">The {recent.length} newest of {d.digests.count} batches.</p>}
    </section>
  );
}
