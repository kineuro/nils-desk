// SPDX-License-Identifier: AGPL-3.0-only
// Data: datasets and cohorts on one page (Wave 7a, the design Nima confirmed
// on 2026-10-09). Two bands that look different: the datasets, where the
// files come from, each a folder card with its state, its numbers, a bar of
// six steps saying where it is, and how sure the sort is; and the cohorts,
// groups of subjects from any dataset, each a card with its subjects, where
// they come from and what waits. On a card the only button is View, which
// opens the viewer. Choosing a card shows how things relate: a cohort lights
// up the datasets that feed it, a dataset the cohorts it feeds, and the rest
// dim; its detail opens under the bands with its actions, the next step the
// one primary button. A card is chosen on arrival, the first that needs a
// person, so the next step is always on screen.

import { useCallback, useEffect, useRef, useState } from "react";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";
import { placesKept } from "../objects/kept";
import { href, narrow } from "../routes";
import { messageOf } from "../settings/common";
import type { Install } from "../settings/supervise";
import { Hint } from "../ui/Hint";
import { Icon } from "../ui/Icon";
import { useKept } from "../ui/kept";
import { Wait } from "../ui/Wait";
import { AddDataset } from "./AddDataset";
import { CohortDetail } from "./CohortDetail";
import { cohorts as cohortDoors, type Cohort } from "./cohorts";
import { DatasetDetail } from "./DatasetDetail";
import { jobs as jobsDoor, packFor, sources, type Dataset, type Layout } from "./datasets";
import { SetIdsDialog, SortFilesDialog, type Finishing } from "./FinishDataset";
import { isRoot, notReadOf } from "./layout";
import { NewCohortDialog, makingRefusal } from "./NewCohort";
import { useLiveJobs } from "./Now";
import { plainError } from "./plain";
import { kindWords, nextStep, stepCommand, type StepId } from "./steps";
import {
  cardLine,
  cohortLine,
  cohortRelation,
  datasetRelation,
  feedsWords,
  filesOf,
  maySummarise,
  originWords,
  partLabel,
  railOf,
  slotOf,
  summaries,
  TONE,
  type DatasetSummary,
  type Part,
  type Relation,
} from "./summary";
import { mayBrowse, viewHref, type Scope } from "./viewer";
import "./data.css";

type Load = { kind: "loading"; since: number } | { kind: "failed"; why: string } | { kind: "ready"; list: Dataset[] };

/** Words about a dataset's run: which dataset, when they were said, and whether its run was seen going since. */
interface Until {
  dataset: string;
  since: number;
  seen: boolean;
}

/** What the page says: words, a refusal's detail behind a "?", and the run the words stand for while it goes. */
interface Said {
  words: string;
  detail?: string;
  until?: Until;
}

/** Whether a step of the dataset finished after the words about its run were said, give or take the clocks of two machines. */
export function runEnded(s: Pick<DatasetSummary, "steps">, since: number): boolean {
  return s.steps.some((x) => typeof x.finished_at === "string" && Date.parse(x.finished_at) >= since - 5_000);
}

/** A record without one of its keys. */
function without<T>(r: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _gone, ...rest } = r;
  return rest;
}

/** The card chosen on the page: a dataset or a cohort, by name. */
export type Chosen = { kind: "dataset"; name: string } | { kind: "cohort"; name: string } | null;

const n = (v: number) => v.toLocaleString("en-US");

/** What the address chooses: a cohort or a dataset named after the question mark, or the dataset it names (#data/datasets/<name>, and its viewer's /view). */
export function chosenOf(dataset: string | null | undefined, query: Record<string, string> | undefined): Chosen {
  if (query?.cohort) return { kind: "cohort", name: query.cohort };
  if (query?.dataset) return { kind: "dataset", name: query.dataset };
  if (dataset) return { kind: "dataset", name: dataset };
  return null;
}

/** The card chosen on arrival: the first dataset that needs a person, else the first dataset, else the first cohort. */
export function firstChoice(list: readonly Dataset[], why: (d: Dataset) => string | null, cohortList: readonly Cohort[]): Chosen {
  const needs = list.find((d) => {
    const s = nextStep(d, why(d));
    return s.step !== "read-new" && s.step !== "running";
  });
  const d = needs ?? list[0];
  if (d) return { kind: "dataset", name: d.name };
  const c = cohortList[0];
  return c ? { kind: "cohort", name: c.name } : null;
}

/**
 * The page; `dataset` is the one the address names (#data/datasets/<name>, or
 * its viewer, /view), `step` what the address opens of it (its pseudonymise
 * step, #data/datasets/<name>/pseudonymisation, as the page that stood there
 * before was named), `query` what the address narrows to.
 */
export function DataPage({
  caps,
  install,
  onChanged,
  dataset,
  step: opening,
  query,
}: {
  caps: Capabilities;
  install: Install | null;
  onChanged: () => void;
  dataset?: string | null;
  step?: string | null;
  query?: Record<string, string>;
}) {
  const [load, setLoad] = useState<Load>(() => ({ kind: "loading", since: Date.now() }));
  const [cohortList, setCohortList] = useState<Cohort[] | null>(null);
  /** Why the cohorts could not be read, where they could not. */
  const [cohortsWhy, setCohortsWhy] = useState<string | null>(null);
  const [sums, setSums] = useState<Record<string, DatasetSummary>>({});
  /** Why a dataset's summary could not be read, by its name. */
  const [sumsWhy, setSumsWhy] = useState<Record<string, string>>({});
  const [chosen, setChosen] = useState<Chosen>(() => chosenOf(dataset, query));
  const picked = useRef(chosen !== null);
  const [adding, setAdding] = useState(false);
  const [making, setMaking] = useState(false);
  /** The dialog a dataset's step opens. */
  const [opened, setOpened] = useState<{ kind: "sort-files" | "set-ids"; dataset: Dataset } | null>(null);
  /** What the page last said: a done act's words, or a refusal as one plain line with the engine's words behind a "?"; words about a dataset's run stand only while it goes. */
  const [said, setSaid] = useState<Said | null>(null);
  const say = (words: string) => setSaid({ words });
  const failed = (e: unknown) => setSaid(plainError(e));
  const places = useKept(placesKept);
  const jobs = useLiveJobs(caps);
  const works = may(caps, "data:work");
  const readsCohorts = may(caps, "data:see") && served(caps, "GET /api/cohorts");
  const summarises = maySummarise(caps);

  // the viewer's dataset, or what the address names, is the one chosen
  useEffect(() => {
    const c = chosenOf(dataset, query);
    if (c) {
      picked.current = true;
      setChosen(c);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the address's own words
  }, [dataset, query?.cohort, query?.dataset]);

  const read = useCallback(() => {
    sources
      .list()
      .then((r) => setLoad({ kind: "ready", list: r.sources }))
      .catch((e: Error) => setLoad((was) => (was.kind === "ready" ? was : { kind: "failed", why: e.message })));
  }, []);
  const readCohorts = useCallback(() => {
    if (!readsCohorts) return;
    cohortDoors
      .list()
      .then((all) => {
        setCohortList(all.filter((c) => !c.retired_at));
        setCohortsWhy(null);
      })
      .catch((e: unknown) => {
        // a list not read is said, never drawn as an empty one
        setCohortList((was) => was ?? []);
        setCohortsWhy(messageOf(e));
      });
  }, [readsCohorts]);

  useEffect(() => {
    read();
    readCohorts();
    if (served(caps, "GET /api/places")) void placesKept.ensure();
  }, [read, readCohorts, caps]);

  // a root is where folders live, never a dataset
  const list = load.kind === "ready" ? load.list.filter((d) => !isRoot(d)) : [];
  const names = list.map((d) => d.name).join("\n");

  // each dataset's summary, for the steps on its card and its detail; one that cannot be read is said so, and a dataset gone from the list takes its summary with it
  const readSums = useCallback(
    (only?: string[]) => {
      if (!summarises) return;
      for (const name of only ?? names.split("\n").filter(Boolean)) {
        summaries
          .read(name)
          .then((s) => {
            setSums((was) => ({ ...was, [name]: s }));
            setSumsWhy((was) => (name in was ? without(was, name) : was));
          })
          .catch((e: unknown) => {
            setSums((was) => (name in was ? without(was, name) : was));
            setSumsWhy((was) => ({ ...was, [name]: messageOf(e) }));
          });
      }
    },
    [summarises, names],
  );
  useEffect(() => {
    readSums();
  }, [readSums]);
  useEffect(() => {
    const listed = new Set(names.split("\n").filter(Boolean));
    setSums((was) => (Object.keys(was).every((k) => listed.has(k)) ? was : Object.fromEntries(Object.entries(was).filter(([k]) => listed.has(k)))));
    setSumsWhy((was) => (Object.keys(was).every((k) => listed.has(k)) ? was : Object.fromEntries(Object.entries(was).filter(([k]) => listed.has(k)))));
  }, [names]);

  // what runs: read again when a job ends, and every few seconds while one of a dataset runs
  const openIds = (jobs.open ?? []).filter((j) => j.state !== "done" && j.state !== "failed" && j.state !== "cancelled").map((j) => j.id);
  const openKey = openIds.join(",");
  const running = Object.values(sums)
    .filter((s) => names.split("\n").includes(s.dataset) && s.steps.some((x) => x.state === "running" || x.state === "queued"))
    .map((s) => s.dataset);
  const runningKey = running.join("\n");
  useEffect(() => {
    if (load.kind !== "ready") return;
    read();
    readCohorts();
    readSums();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a change in the open jobs is what reads again
  }, [openKey]);
  useEffect(() => {
    if (runningKey === "") return;
    const t = setInterval(() => {
      read();
      readSums(runningKey.split("\n"));
    }, 5_000);
    return () => clearInterval(t);
  }, [runningKey, read, readSums]);

  // words about a dataset's run go once it is over: seen running and now not, or a step of it finished since the words were said
  useEffect(() => {
    const until = said?.until;
    if (!until) return;
    const s = sums[until.dataset];
    if (!s) return;
    if (s.steps.some((x) => x.state === "running" || x.state === "queued")) {
      if (!until.seen) setSaid((was) => (was?.until === until ? { ...was, until: { ...until, seen: true } } : was));
      return;
    }
    if (until.seen || runEnded(s, until.since)) setSaid((was) => (was?.until === until ? null : was));
  }, [said, sums]);

  const placeOf = (d: Dataset) => places.value?.places.find((p) => p.id === d.id) ?? null;
  /** Why a dataset is not read yet: the places door's own words where it was read, else the same reasoning from the dataset. */
  const whyOf = (d: Dataset): string | null => {
    const p = placeOf(d);
    return p && p.not_read !== undefined ? p.not_read : notReadOf(d);
  };

  // on arrival, the first card that needs a person is chosen; a person's own choice stands
  const cohortsRead = !readsCohorts || cohortList !== null;
  useEffect(() => {
    if (picked.current || load.kind !== "ready" || !cohortsRead) return;
    picked.current = true;
    setChosen(firstChoice(list, whyOf, cohortList ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when both lists are read
  }, [load.kind, cohortsRead]);

  const choose = (c: Chosen) => {
    picked.current = true;
    // the chosen card again lets go of it
    const next = c && chosen && c.kind === chosen.kind && c.name === chosen.name ? null : c;
    setChosen(next);
    setSaid(null);
    // the address keeps the choice, without a page of history each
    if (!dataset) {
      const to = next ? narrow(href("data", "datasets"), { [next.kind]: next.name }) : href("data", "datasets");
      try {
        history.replaceState(null, "", to);
      } catch {
        // a page without history keeps its address
      }
    }
  };

  const changed = (words: string, running?: string) => {
    setSaid(running ? { words, until: { dataset: running, since: Date.now(), seen: false } } : { words });
    void placesKept.refresh().catch(() => undefined);
    onChanged();
    jobs.refresh();
    read();
    readCohorts();
    readSums();
  };

  /** A dataset's step: a dialog for what it still needs, else its job queued; the promise ends once the engine answered. */
  const step = (d: Dataset, id: StepId): Promise<void> | undefined => {
    if (id === "sort-files" || id === "set-ids") {
      setOpened({ kind: id, dataset: d });
      return undefined;
    }
    const c = stepCommand(d, id, packFor(caps));
    if (!c) return undefined;
    setSaid(null);
    return jobsDoor
      .enqueue(c.command, c.name, c.then)
      .then(() => changed(`${d.name}: started.`))
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

  const allCohorts = cohortList ?? [];
  const chosenDataset = chosen?.kind === "dataset" ? (list.find((d) => d.name === chosen.name) ?? null) : null;
  const chosenCohort = chosen?.kind === "cohort" ? (allCohorts.find((c) => c.name === chosen.name) ?? null) : null;
  const datasetNames = list.map((d) => d.name);
  const making_ = makingRefusal(caps);
  // View opens the viewer of the dataset or the cohort, offered where the person may browse it
  const viewOf = (scope: Scope, something: boolean): View => (mayBrowse(caps, scope) ? (something ? viewHref(scope) : null) : false);

  return (
    <section className="data dp">
      <div className="data-head">
        <div className="grow">
          <span className="eyebrow">Data</span>
          <h1>Datasets and cohorts</h1>
        </div>
        {making_ === null && (
          <button type="button" className="button secondary" onClick={() => setMaking(true)}>
            New cohort
          </button>
        )}
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

      <div className="dp-band-head">
        <span className="eyebrow">Datasets</span>
        <span className="meta">where the files come from</span>
      </div>
      {load.kind === "loading" && <Wait phase="reading the datasets" since={load.since} size="panel" />}
      {load.kind === "failed" && (
        <p className="warn">
          The datasets could not be read.
          <Hint text={load.why} />
        </p>
      )}
      {load.kind === "ready" && list.length === 0 && <p className="meta">No dataset yet.</p>}
      {list.length > 0 && (
        <div className="dp-grid datasets">
          {list.map((d) => (
            <DatasetCard
              key={d.id}
              dataset={d}
              why={whyOf(d)}
              summary={sums[d.name] ?? null}
              on={chosenDataset?.id === d.id}
              relation={chosenCohort ? datasetRelation(d.name, chosenCohort) : null}
              feeds={feedsWords(d.name, d.cohort, allCohorts)}
              view={viewOf({ kind: "dataset", name: d.name }, d.totals.stacks > 0)}
              onPick={() => choose({ kind: "dataset", name: d.name })}
            />
          ))}
        </div>
      )}

      {readsCohorts && (
        <>
          <div className="dp-band-head">
            <span className="eyebrow">Cohorts</span>
            <span className="meta">groups of subjects, from any dataset</span>
          </div>
          {cohortsWhy !== null && <p className="warn">The cohorts could not be read: {cohortsWhy}</p>}
          {cohortList !== null && allCohorts.length === 0 && cohortsWhy === null && <p className="meta">No cohort yet.</p>}
          {allCohorts.length > 0 && (
            <div className="dp-grid cohorts">
              {allCohorts.map((c) => (
                <CohortCard
                  key={c.name}
                  cohort={c}
                  datasets={datasetNames}
                  on={chosenCohort?.name === c.name}
                  relation={chosenDataset ? cohortRelation(chosenDataset.name, c) : null}
                  view={viewOf({ kind: "cohort", name: c.name }, true)}
                  onPick={() => choose({ kind: "cohort", name: c.name })}
                />
              ))}
            </div>
          )}
        </>
      )}

      {chosenDataset && (
        <DatasetDetail
          key={`dataset ${chosenDataset.id}`}
          caps={caps}
          dataset={chosenDataset}
          summary={sums[chosenDataset.name] ?? null}
          summaryWhy={sumsWhy[chosenDataset.name] ?? null}
          why={whyOf(chosenDataset)}
          jobs={jobs}
          datasets={list}
          cohorts={allCohorts.map((c) => c.name)}
          openStep={opening === "pseudonymisation" && dataset === chosenDataset.name}
          onStep={(id) => step(chosenDataset, id)}
          onChanged={changed}
          onSaid={say}
          onFailed={failed}
          onRemoved={(words) => {
            setChosen(null);
            changed(words);
          }}
        />
      )}
      {chosenCohort && (
        <CohortDetail
          key={`cohort ${chosenCohort.name}`}
          caps={caps}
          cohort={chosenCohort}
          datasets={datasetNames}
          onChanged={changed}
          onRenamed={(name) => {
            setChosen({ kind: "cohort", name });
            changed(`Renamed to ${name}.`);
          }}
          onRetired={(name) => {
            setChosen(null);
            changed(`${name} is retired.`);
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
      {making && (
        <NewCohortDialog
          caps={caps}
          taken={allCohorts.map((c) => c.name)}
          onClose={() => setMaking(false)}
          onMade={(name) => {
            setMaking(false);
            picked.current = true;
            setChosen({ kind: "cohort", name });
            changed(`${name} is made.`);
          }}
        />
      )}
    </section>
  );
}

/** A card's View: the viewer's address, null where there is nothing to view yet, false where the person may not browse it. */
type View = string | null | false;

/** The View button of a card: the viewer of the dataset or the cohort, where there is something to view. */
function ViewLink({ to, label }: { to: View; label: string }) {
  if (to === false) return null;
  if (to === null)
    return (
      <span className="dp-view" aria-disabled="true" title="Nothing to view yet">
        <Icon name="grid" />
        View
      </span>
    );
  return (
    <a className="dp-view" href={to} aria-label={label} onClick={(e) => e.stopPropagation()}>
      <Icon name="grid" />
      View
    </a>
  );
}

/** The six segments of where a dataset is, in words for a screen reader. */
const SEGMENT_WORDS = ["found", "read", "sorted", "main scans", "pictures", "3D views"];

function DatasetCard(props: { dataset: Dataset; why: string | null; summary: DatasetSummary | null; on: boolean; relation: Relation | null; feeds: string; view: View; onPick: () => void }) {
  const { dataset: d, why, summary, on, relation, feeds, view, onPick } = props;
  const next = nextStep(d, why);
  const files = filesOf(d, summary);
  const rail = railOf(d, summary);
  const line = cardLine(d, next, summary);
  // what the scans that need a look are asked, behind a hover
  const lookWords = kindWords(summary?.look_kinds ?? d.totals.need_a_look ?? {});
  const cls = ["dp-card", on ? "on" : relation ? (relation.related ? "rel" : "dim") : null].filter(Boolean).join(" ");
  const said = rail.map((s, i) => `${SEGMENT_WORDS[i]} ${s === "done" ? "done" : s === "run" ? "running" : "not yet"}`).join(", ");
  return (
    <div className={cls} onClick={onPick} aria-current={on ? "true" : undefined}>
      <div className="dp-card-head">
        <Icon name="folder" />
        <button
          type="button"
          className="dp-pick"
          aria-pressed={on}
          onClick={(e) => {
            e.stopPropagation();
            onPick();
          }}
        >
          {d.name}
        </button>
        <span className={TONE[next.word]} title={why ?? undefined}>
          {next.word}
        </span>
      </div>
      <div className="dp-nums">
        <span>
          <b>{files === null ? "?" : n(files)}</b>
          <span>files</span>
        </span>
        <span>
          <b>{n(d.totals.subjects)}</b>
          <span>subjects</span>
        </span>
        <span>
          <b>{n(d.totals.stacks)}</b>
          <span>scans</span>
        </span>
      </div>
      {relation ? (
        <div className={relation.related ? "dp-rel on" : "dp-rel"}>{relation.words}</div>
      ) : (
        <>
          <div className="dp-rail" role="img" aria-label={`Where it is: ${said}`}>
            {rail.map((s, i) => (
              <span key={i} className={s} />
            ))}
          </div>
          <div className={next.step === "pseudonymise" && (d.held?.identifiers ?? 0) > 0 ? "dp-line look" : "dp-line"} title={lookWords || undefined}>
            {line}
          </div>
        </>
      )}
      <div className="dp-foot">
        <span className={relation ? "dp-line grow" : "dp-feeds grow"}>{relation ? line : feeds}</span>
        <ViewLink to={view} label={`View ${d.name}`} />
      </div>
    </div>
  );
}

/** A cohort's parts, from the engine where it says them, else one part of all its members by how it came to be. */
export function partsOf(c: Cohort): Part[] {
  if (c.parts && c.parts.length > 0) return c.parts;
  if (c.subjects === 0) return [];
  const from: Part["from"] = c.from.kind === "source" ? "dataset" : c.from.kind === "promotion" ? "query" : c.from.kind === "manual" ? "hand" : "import";
  return [{ from, dataset: from === "dataset" ? (c.feeds[0] ?? null) : null, subjects: c.subjects }];
}

function CohortCard({ cohort: c, datasets, on, relation, view, onPick }: { cohort: Cohort; datasets: string[]; on: boolean; relation: Relation | null; view: View; onPick: () => void }) {
  const parts = partsOf(c);
  const cls = ["dp-card", "dp-cohort", on ? "on" : relation ? (relation.related ? "rel" : "dim") : null].filter(Boolean).join(" ");
  const more = ["subjects", c.sessions !== null ? `${n(c.sessions)} visits` : null, `${n(c.stacks)} scans`].filter(Boolean).join(" · ");
  return (
    <div className={cls} onClick={onPick} aria-current={on ? "true" : undefined}>
      <div className="dp-card-head">
        <Icon name="users" />
        <button
          type="button"
          className="dp-pick"
          aria-pressed={on}
          onClick={(e) => {
            e.stopPropagation();
            onPick();
          }}
        >
          {c.name}
        </button>
        <span className="tag">{originWords(c)}</span>
      </div>
      <div className="dp-big">
        <b>{n(c.subjects)}</b>
        <span>{more}</span>
      </div>
      {parts.length > 0 && (
        <>
          <div className="dp-parts" role="img" aria-label={`Where its subjects come from: ${parts.map((p) => `${partLabel(p)} ${p.subjects}`).join(", ")}`}>
            {parts.map((p) => (
              <span key={`${p.from} ${p.dataset ?? ""}`} className={`dp-c${slotOf(p, datasets)}`} style={{ flex: p.subjects }} />
            ))}
          </div>
          <div className="dp-legend">
            {parts.map((p) => (
              <span key={`${p.from} ${p.dataset ?? ""}`}>
                <i className={`dp-sw dp-c${slotOf(p, datasets)}`} />
                {partLabel(p)} {n(p.subjects)}
              </span>
            ))}
          </div>
        </>
      )}
      {relation && <div className={relation.related ? "dp-rel on" : "dp-rel"}>{relation.words}</div>}
      <div className="dp-foot">
        <span className="dp-line grow">{cohortLine(c)}</span>
        <ViewLink to={view} label={`View ${c.name}`} />
      </div>
    </div>
  );
}
