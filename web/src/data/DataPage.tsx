// SPDX-License-Identifier: AGPL-3.0-only
// The Datasets page (record 27, R2a): the value, not the sentence. Each
// dataset is a card with its name and the state it is in, its folder, how its
// files come in and the cohort it feeds, its two trees in one line and its
// three numbers; Now lists the open jobs from the engine's event stream; the
// chosen dataset's batches follow, each with its thread in five cells and each
// opening its own page. Why there are two trees, and how one person stays one
// subject, are disclosures, closed until they are asked for. A dataset is
// added in a dialog, what is new is brought in as one chain, and how a dataset
// is pseudonymised and how it leaves are changed on its Pseudonymisation page.
// The section's other pages, the cohorts, a batch and a dataset's
// pseudonymisation, are mounted by the shell beside this one.

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
import { AddSource } from "./AddSource";
import { BringInNew } from "./BringInNew";
import {
  arrivesOf,
  batchTail,
  countWords,
  datasetState,
  jobs as jobsDoor,
  record26,
  sources,
  STAGES,
  stripMarks,
  type Arrives,
  type Batch,
  type Dataset,
  type Rates,
  type StageName,
} from "./datasets";
import { FinishDialog } from "./FinishDataset";
import { FINISH, isRoot, notReadOf, stateWords, stateOf } from "./layout";
import { NowSection, useLiveJobs } from "./Now";
import { NotRead } from "./NotRead";
import { fileWords, whenWords } from "./sources";

type Load = { kind: "loading"; since: number } | { kind: "failed"; why: string } | { kind: "ready"; list: Dataset[]; rates: Rates | null };

const n = (v: number) => v.toLocaleString("en-US");

/** How a dataset's files come in, as its card's chip. */
const COMES_IN: Record<Arrives, { words: string; tone: "gated" | "ok"; icon: "lock" | "shield" }> = {
  identified: { words: "identified", tone: "gated", icon: "lock" },
  deidentified: { words: "de-identified", tone: "ok", icon: "shield" },
  coded: { words: "our codes in PatientID", tone: "ok", icon: "shield" },
};

/** A stage in one letter, under which the batches table names the five in order. */
const LETTER: Record<StageName, string> = { pseudonymised: "P", walked: "W", digested: "D", classified: "C", reviewed: "R" };

/** A tree by its own folder, not the whole path. */
const leaf = (p: string) => p.replace(/\/+$/, "").split("/").pop() || p;

/** The sentence that used to stand beside a value, closed until it is asked for. */
function Says({ head, icon, children }: { head: string; icon?: "lock"; children: string }) {
  return (
    <details className="says">
      <summary>
        {icon && <Icon name={icon} />}
        {head}
      </summary>
      <p>{children}</p>
    </details>
  );
}

/** The Datasets page; `dataset` is the one the address names, #data/datasets/<name>, chosen on arrival. */
export function DataPage({ caps, install, onChanged, dataset }: { caps: Capabilities; install: Install | null; onChanged: () => void; dataset?: string | null }) {
  const [load, setLoad] = useState<Load>(() => ({ kind: "loading", since: Date.now() }));
  const [chosen, setChosen] = useState<string | null>(dataset ?? null);
  const [bringing, setBringing] = useState<Dataset | null>(null);
  const [adding, setAdding] = useState(false);
  /** A dataset not read yet, being finished. */
  const [finishing, setFinishing] = useState<Dataset | null>(null);
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

  // a root is a folder of datasets, never a dataset: its datasets are the cards
  const list = load.kind === "ready" ? load.list.filter((d) => !isRoot(d)) : [];
  const placeOf = (d: Dataset) => places.value?.places.find((p) => p.id === d.id) ?? null;
  /** Why a dataset is not read yet: the places door's own words where it was read, else the same reasoning from the dataset. */
  const whyOf = (d: Dataset): string | null => {
    const p = placeOf(d);
    return p && p.not_read !== undefined ? p.not_read : notReadOf(d);
  };
  const rates = load.kind === "ready" ? load.rates : null;
  const current = list.find((s) => s.name === chosen) ?? list[0] ?? null;

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
          <p className="lede">One dataset, one folder, one name.</p>
          {modern && (
            <Says head="Why two trees?">
              What comes in identified is pseudonymised into a tree of its own before anything reads it, so the registry never points at an identified file. The originals stay beside it, locked.
            </Says>
          )}
        </div>
        {works && (
          <button type="button" className="button secondary" onClick={() => setAdding(true)}>
            <Icon name="folder" />
            Add a source
          </button>
        )}
        {works && current && whyOf(current) === null && (
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
            <p className="note-detail">A dataset is a folder of DICOM with a name. Add one to bring its files in.</p>
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
              notRead={whyOf(d)}
              onFinish={works ? () => setFinishing(d) : null}
            />
          ))}
        </div>
      )}
      {said && <p className="meta">{said}</p>}
      <NowSection caps={caps} jobs={jobs} onSaid={setSaid} />
      {current && <Batches dataset={current} works={works && whyOf(current) === null} onBringIn={() => setBringing(current)} onAgain={(b) => readAgain(b, current)} />}
      {modern && list.length > 0 && (
        <Says head="One person is one subject" icon="lock">
          Every identifier a person was seen under is filed on their one subject in the sealed store, so any of them arriving in any dataset lands on the same code. An identifier the store does not know
          holds its files until someone maps it. UIDs are kept, so a study brought in twice is one study.
        </Says>
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
      {finishing && (
        <FinishDialog
          caps={caps}
          place={{ id: finishing.id, name: finishing.name, path: finishing.path, dataset: placeOf(finishing)?.dataset ?? { kind: finishing.kind, state: finishing.state, arrives: finishing.arrives, root: finishing.root, patient_id: finishing.patient_id, subjects: finishing.subjects, folder: finishing.folder }, not_read: whyOf(finishing) }}
          layout={placeOf(finishing)?.layout ?? null}
          onClose={() => setFinishing(null)}
          onDone={(words) => {
            setFinishing(null);
            setSaid(words);
            void placesKept.refresh().catch(() => undefined);
            read();
          }}
        />
      )}
      {adding && (
        <AddSource
          caps={caps}
          install={install}
          places={places.value?.places ?? []}
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

function DatasetCard(props: { dataset: Dataset; on: boolean; works: boolean; notRead: string | null; onPick: () => void; onBringIn: () => void; onFinish: (() => void) | null }) {
  const { dataset: d, on, works, notRead, onPick, onBringIn, onFinish } = props;
  const waiting = notRead !== null;
  const state = waiting ? { words: "not read", tone: "caution" as const } : datasetState(d);
  const how = waiting ? null : COMES_IN[arrivesOf(d)];
  const trees = d.trees ?? null;
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
            {works && !waiting && (
              <button type="button" onClick={onBringIn}>
                Bring in what is new
              </button>
            )}
            {onFinish && waiting && (
              <button type="button" onClick={onFinish}>
                {FINISH}
              </button>
            )}
            <a href={href("data", "datasets", d.name, "pseudonymisation")}>Pseudonymisation</a>
          </MoreMenu>
        </span>
      </div>
      <span className="where">{d.path}</span>
      {d.state && <span className="meta">{stateWords(stateOf(d), !waiting, d.kind === "legacy")}</span>}
      {waiting && <NotRead name={d.name} why={notRead} onFinish={onFinish} />}
      <div className="row">
        {how && (
          <span className={`privacy ${how.tone}`}>
            <Icon name={how.icon} />
            {how.words}
          </span>
        )}
        {d.cohort && (
          <span className="tag brand users">
            <Icon name="users" />
            {d.cohort}
          </span>
        )}
      </div>
      {trees && (
        <div className="trees">
          {trees.originals && (
            <span>
              <Icon name="lock" />
              <span className="path">{leaf(trees.originals.path)}</span> {countWords(trees.originals.files)}
            </span>
          )}
          {trees.anon && (
            <span>
              {trees.originals && <Icon name="arrow" />}
              <Icon name="shield" />
              <span className="path">{leaf(trees.anon.path)}</span> {countWords(trees.anon.files)}
            </span>
          )}
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
          {n(d.digests.count)} in all
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
                      <div className="thread" role="img" aria-label={marks.map((m) => `${m.name}: ${m.words}`).join(", ")}>
                        {marks.map((m) => (
                          <span key={m.name} className={m.mark === "none" ? undefined : m.mark} title={`${m.name}: ${m.words}`}>
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
      {d.digests.count > recent.length && <p className="meta">The {recent.length} newest of {d.digests.count} batches.</p>}
    </section>
  );
}
