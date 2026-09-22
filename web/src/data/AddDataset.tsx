// SPDX-License-Identifier: AGPL-3.0-only
// Add a dataset (record 27, R2b): the folder is chosen in the engine's own
// picker, which lists the folders of its ingest locations and says what a look
// found inside each, so anyone who may add a dataset browses without a grant
// on the install; a folder outside those locations is typed instead, and the
// same look door says what is in it by its bare path. Then how the files come
// in, who a file is about with the identifier's type from the registry's list
// or a new one made here, the map as a CSV whose columns are named for what
// they are and whose report is read before anything is written, what happens
// to a file whose identifier the map does not know, and the cohort its
// subjects join. A folder that holds a v0 cohort layout is declared as one:
// dcm-raw renamed, v0's map filed, the originals left. Adding a folder as a
// dataset asks for work on the Data and the Places pages, and starts the
// engine again where a service keeps it running.

import { useEffect, useRef, useState } from "react";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";
import { placeName } from "../home/look";
import type { Place } from "../objects/client";
import { messageOf } from "../settings/common";
import { addFolderWords, keptRunning, reapplyByHand } from "../settings/install";
import { knownFolders } from "../settings/move";
import { PathField } from "../settings/PathField";
import { patiently } from "../settings/places";
import { followRun, supervise, type Install } from "../settings/supervise";
import { Command } from "../ui/Command";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import { ingest, type Look } from "./browse";
import {
  bringInBody,
  bringInName,
  cohortChoices,
  cohortOf,
  identityOf,
  jobs,
  linkage,
  locationOf,
  packFor,
  places as placesDoor,
  probeWords,
  record26,
  v0Words,
  type Arrives,
  type BringIn,
  type ColumnRole,
  type DatasetFields,
  type ImportReport,
  type Layout,
  type LinkageType,
  type MapColumn,
  type Unmapped,
} from "./datasets";
import { IngestPicker } from "./Picker";
import { lookWords, newFolderRefusal, type Chosen } from "./picker";
// the map is read and refused by the Pseudonymisation page's own rules, so a file this dialog takes is one that page would take too
import { csvRefusal, guessRole, importColumns, lookAt, mapRefusal, parseCsv, reportLines, reportOf, typeName, type ColumnLook, type Guess } from "./pseudonyms";

type Act = { kind: "idle" } | { kind: "working"; phase: string; since: number } | { kind: "done"; words: string } | { kind: "failed"; why: string };

/** A fact as its value: what it is in small letters, then the value alone. */
type Cell = { k: string; v: string };

/** A column of the map: its header, what the values under it look like, and what it means. */
interface Column {
  header: string;
  look: ColumnLook;
  guess: Guess;
}

/** The map as uploaded: its file, its columns named, and what the engine said it would do. */
interface Map {
  file: string;
  rows: string[][];
  columns: Column[];
  report: ImportReport | null;
  checking: boolean;
  why: string | null;
}

/**
 * The types the columns name that the site has not got. The import makes
 * these itself when it is told to; told nothing, the engine makes each of
 * them a conflict instead, and a map with a conflict is not filed at all.
 */
export function typesToMake(columns: { header: string; guess: Guess }[], known: LinkageType[] | null): string[] {
  const names = new Set((known ?? []).map((t) => t.name));
  const wanted = columns.filter((c) => c.guess.role === "identifier" || c.guess.role === "canonical").map((c) => c.guess.id_type ?? c.guess.new_type ?? typeName(c.header));
  return [...new Set(wanted.filter((t) => t !== "" && !names.has(t)))];
}

/** The map as the import door takes it, rehearsed or filed: the columns named for what they are, and the word that makes the types they name that the site has not got. */
export function mapImport(columns: { header: string; guess: Guess }[], rows: string[][], known: LinkageType[] | null): { columns: MapColumn[]; rows: string[][]; make_types: boolean } {
  return {
    columns: importColumns(
      columns.map((c) => c.header),
      columns.map((c) => c.guess),
    ),
    rows,
    make_types: typesToMake(columns, known).length > 0,
  };
}

export interface AddPlan {
  name: string;
  path: string;
  /** The dataset fields, or null for an engine before record 26. */
  fields: DatasetFields | null;
  /** Start the engine again, so it reads the new folder: only where a service keeps it running. */
  restart: boolean;
  map: { columns: MapColumn[]; rows: string[][]; make_types: boolean } | null;
  bringIn: BringIn | null;
}

function Values({ cells }: { cells: Cell[] }) {
  return (
    <div className="values">
      {cells.map((c) => (
        <div key={c.k}>
          <span className="k">{c.k}</span>
          <span className="v">{c.v}</span>
        </div>
      ))}
    </div>
  );
}

/** The sentence that used to stand beside a control, closed until it is asked for. */
function Says({ head, children }: { head: string; children: string }) {
  return (
    <details className="says">
      <summary>{head}</summary>
      <p>{children}</p>
    </details>
  );
}

/** What a look found in a folder, in a few words, or why nothing was found. */
function insideWords(l: Look): string {
  if (l.exists === false) return "nothing is there";
  if (l.directory === false) return "a file, not a folder";
  if (l.readable === false) return "the engine cannot read it";
  if (!l.here) return l.timed_out ? "the look did not answer in time" : "nothing found";
  return lookWords({ name: "", looked: true, ...l.here }).words || "no files";
}

/**
 * Add a dataset: the place with its dataset fields, the engine started again
 * with the folder where a service keeps it running, the map filed under the
 * dataset's name, and the bring-in queued. Says each phase as it begins, and
 * answers the words of how it ended.
 */
export async function addDataset(plan: AddPlan, phase: (words: string) => void): Promise<string> {
  phase(`adding ${plan.name} as a dataset`);
  const answer = await placesDoor.add({ name: plan.name, role: "source", path: plan.path, guarantees: { backup: null, snapshots: false, protected: false, fast: false }, ...(plan.fields ?? {}) });
  const renamed = answer.layout?.v0?.renamed === true ? ", its dcm-raw renamed dcm-anon" : "";
  if (plan.restart) {
    phase("starting the engine again with the folder");
    const run = await supervise.reapply("engine");
    const ended = await followRun(run.id, () => undefined);
    if (ended === null) throw new Error(`${plan.name} is a dataset${renamed}; the engine is still starting, so look again in a moment.`);
    if (ended.state !== "done") throw new Error(`${plan.name} is a dataset${renamed}, and the engine did not start again: ${ended.tail?.slice(-1)[0] ?? ended.state}`);
  }
  const said: string[] = [`${plan.name} is a dataset${renamed}`];
  if (plan.map) {
    phase("filing the map");
    const r = await patiently(() => linkage.import({ place: plan.name, columns: plan.map!.columns, rows: plan.map!.rows, make_types: plan.map!.make_types, dry_run: false }));
    said.push("job" in r ? `the map is filed as job ${r.job}` : "the map is filed");
  }
  // a job names the folder by its place, which the engine learns when it starts again
  if (plan.bringIn && plan.restart) {
    phase("queueing the bring-in");
    const j = await patiently(() => jobs.enqueue(plan.bringIn!.command, plan.bringIn!.name));
    said.push(`job ${j.job} brings in what is there as the thread ${plan.bringIn.name}`);
  } else if (!plan.restart) {
    said.push(plan.bringIn ? "the engine reads it once it starts again, and Bring in what is new is offered from its card then" : "the engine reads it once it starts again");
  }
  return `${said.join("; ")}.`;
}

type FieldChoice = "PatientID" | "PatientName" | "other" | "path";

export function AddDataset(props: {
  caps: Capabilities;
  install: Install | null;
  places: Place[];
  cohorts: string[];
  /** A folder already looked at, with what the look found, for a dialog opened from it. */
  initial?: { path: string; layout: Layout | null };
  /** What a look finds in a folder before it is declared: what is inside it, and the layout it holds. */
  lookAt?: (folder: string) => Promise<Look>;
  onClose: () => void;
  onDone: (words: string) => void;
}) {
  const { caps, install, places, cohorts, onClose, onDone } = props;
  const [path, setPath] = useState(props.initial?.path ?? "");
  // the folder as the engine names it, @location/relative, when it was picked in the engine's own picker
  const [at, setAt] = useState<string | null>(null);
  const [outside, setOutside] = useState(false);
  const [typed, setTyped] = useState<string | null>(null);
  const [arrives, setArrives] = useState<Arrives>("identified");
  const [fieldChoice, setFieldChoice] = useState<FieldChoice>("PatientID");
  const [otherField, setOtherField] = useState("");
  const [segment, setSegment] = useState(1);
  const [idType, setIdType] = useState("");
  const [types, setTypes] = useState<LinkageType[] | null>(null);
  const [newType, setNewType] = useState<{ name: string; description: string; why: string | null } | null>(null);
  const [probe, setProbe] = useState<Act>({ kind: "idle" });
  const [map, setMap] = useState<Map | null>(null);
  const [unmapped, setUnmapped] = useState<Unmapped>("hold");
  const [cohort, setCohort] = useState<string | null>(null);
  const [layout, setLayout] = useState<Layout | null>(props.initial?.layout ?? null);
  const [found, setFound] = useState<Look | null>(null);
  /** Why the engine did not say what is in the folder, in its own words. */
  const [lookWhy, setLookWhy] = useState<string | null>(null);
  const [looking, setLooking] = useState<number | null>(null);
  const [act, setAct] = useState<Act>({ kind: "idle" });
  const fileRef = useRef<HTMLInputElement>(null);
  const probing = useRef(0);

  const folder = path.trim().replace(/\/+$/, "");
  const absolute = folder.startsWith("/");
  const taken = places.map((p) => p.name);
  const name = typed ?? (folder ? placeName(folder, taken) : "");
  const modern = record26(caps);
  const supervised = install !== null && may(caps, "install:work");
  const restarts = supervised && install !== null && keptRunning(install);
  const adding = newFolderRefusal(caps);
  const working = act.kind === "working";
  // the engine lists its own ingest locations to a person with work on Data; the host's folders need work on the install
  const lists = served(caps, "POST /api/ingest/folders") && may(caps, "data:work");
  // the same work looks inside a folder by its bare path, which only an engine of record 26 takes
  const looks = modern && served(caps, "POST /api/ingest/look") && may(caps, "data:work");
  const picking = lists && !outside;
  const typesServed = served(caps, "GET /api/linkage/types");
  const importsServed = modern && served(caps, "POST /api/linkage/imports") && may(caps, "data:work");
  const probes = modern && served(caps, "POST /api/ingest/probe") && may(caps, "data:work");
  const v0 = v0Words(layout);
  const location = at ?? (absolute ? locationOf(folder, places) : null);
  const from = fieldChoice === "path" ? ({ kind: "path", segment } as const) : ({ kind: "field", field: fieldChoice === "other" ? otherField : fieldChoice } as const);
  const identity = identityOf(from, idType);
  const choices = cohortChoices(name, cohorts);
  const cohortChoice = cohort ?? choices[0]?.value ?? "none";
  const words = install ? addFolderWords(install) : null;
  const lookInside = props.lookAt ?? ((f: string) => ingest.lookHere(f));
  const picked: Chosen | null = at !== null ? { at, path: folder, place: null } : null;
  /** The types of the map's columns the site has not got, which the import makes. */
  const newTypes = map ? typesToMake(map.columns, types) : [];

  /**
   * Another folder chosen: what was said of the one before it is let go. The
   * probe read that folder, the map was uploaded for it and the identifier's
   * type was chosen from what it holds, so none of the three is carried over.
   */
  const chooseFolder = (next: string, where: string | null) => {
    if (next.trim().replace(/\/+$/, "") === folder && where === at) return;
    setAt(where);
    setPath(next);
    probing.current += 1;
    setProbe({ kind: "idle" });
    setMap(null);
    setNewType(null);
    setIdType(types?.[0]?.name ?? "");
  };

  // the registry's identifier types, once
  useEffect(() => {
    if (!typesServed) return;
    let alive = true;
    linkage
      .types()
      .then((r) => {
        if (!alive) return;
        setTypes(r.types);
        setIdType((t) => t || r.types[0]?.name || "");
      })
      .catch(() => alive && setTypes([]));
    return () => {
      alive = false;
    };
  }, [typesServed]);

  // once the folder settles, one look says what is inside it and whether it holds a v0 cohort layout
  useEffect(() => {
    if (props.initial && folder === props.initial.path.trim().replace(/\/+$/, "")) return;
    setFound(null);
    setLayout(null);
    setLookWhy(null);
    if (!looks || !absolute) return;
    let alive = true;
    const t = setTimeout(() => {
      setLooking(Date.now());
      lookInside(folder)
        .then((l) => {
          if (!alive) return;
          setFound(l);
          setLayout(l.layout ?? null);
        })
        .catch((e: unknown) => {
          // a folder the engine would not look inside read as an empty one: the look is what tells a person what is there before they declare on it, so what stopped it is said
          if (alive) setLookWhy(`The engine did not look inside this folder: ${messageOf(e)}`);
        })
        .finally(() => {
          if (alive) setLooking(null);
        });
    }, 600);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the folder is what settles
  }, [folder, absolute, looks]);

  const upload = (file: File) => {
    file
      .text()
      .then((text) => {
        const csv = parseCsv(text);
        // what the engine will not read is said here, before a row of it is posted anywhere
        const refused = csvRefusal(csv);
        if (refused !== null) return setMap({ file: file.name, rows: [], columns: [], report: null, checking: false, why: refused });
        const columns = csv.header.map((h, i) => {
          const look = lookAt(
            h,
            csv.rows.map((r) => r[i] ?? ""),
          );
          return { header: h, look, guess: guessRole(h, look, types ?? []) };
        });
        const next: Map = { file: file.name, rows: csv.rows, columns, report: null, checking: false, why: null };
        setMap(next);
        check(next);
      })
      .catch((e: unknown) => setMap({ file: file.name, rows: [], columns: [], report: null, checking: false, why: messageOf(e) }));
  };

  /** The dry run: what the engine would do with the map as its columns stand. */
  const check = (m: Map) => {
    const refusal = mapRefusal(m.columns.map((c) => c.guess));
    if (refusal || !importsServed) return setMap({ ...m, report: null, why: refusal });
    setMap({ ...m, checking: true, why: null });
    linkage
      .import({ ...mapImport(m.columns, m.rows, types), dry_run: true })
      .then((r) => setMap((was) => (was && was.file === m.file ? { ...was, checking: false, report: "job" in r ? null : reportOf(r), why: "job" in r ? "The engine filed the map at once rather than rehearsing it." : null } : was)))
      .catch((e: unknown) => setMap((was) => (was && was.file === m.file ? { ...was, checking: false, report: null, why: messageOf(e) } : was)));
  };

  const setGuess = (i: number, guess: Guess) => setMap((m) => (m ? { ...m, columns: m.columns.map((c, k) => (k === i ? { ...c, guess } : c)), report: null } : m));

  /** A column's role: one that files under a type keeps the type it has, or is read for one again. */
  const setRole = (i: number, c: Column, role: ColumnRole) => {
    if (role !== "identifier" && role !== "canonical") return setGuess(i, { role, id_type: null, new_type: null });
    if (c.guess.id_type !== null || c.guess.new_type !== null) return setGuess(i, { ...c.guess, role });
    const g = guessRole(c.header, c.look, types ?? []);
    setGuess(i, { role, id_type: g.id_type, new_type: g.new_type ?? (typeName(c.header) || "identifier") });
  };

  /** A column's type: one of the site's, or a name for one the import makes. */
  const setType = (i: number, c: Column, name: string) => {
    const known = (types ?? []).some((t) => t.name === name);
    setGuess(i, { ...c.guess, id_type: known ? name : null, new_type: known ? null : name });
  };

  const addType = () => {
    if (!newType) return;
    const nm = newType.name.trim().toLowerCase();
    if (!/^[a-z0-9-]+$/.test(nm)) return setNewType({ ...newType, why: "a type name is lowercase letters, digits and hyphens" });
    linkage
      .addType(nm, newType.description.trim())
      .then((t) => {
        setTypes((was) => [...(was ?? []), t]);
        setIdType(t.name);
        setNewType(null);
      })
      .catch((e: unknown) => setNewType({ ...newType, why: messageOf(e) }));
  };

  const runProbe = () => {
    if (!location || !identity) return;
    const mine = ++probing.current;
    setProbe({ kind: "working", phase: "probing the shapes over a sample", since: Date.now() });
    jobs
      .probe(location, [identity], 2000)
      .then(async (j) => {
        for (let i = 0; i < 60; i++) {
          await new Promise((done) => setTimeout(done, 1500));
          if (probing.current !== mine) return;
          const row = await jobs.job(j.job);
          if (row.state === "done") return setProbe({ kind: "done", words: probeWords(row.result) });
          if (row.state === "failed" || row.state === "cancelled") return setProbe({ kind: "failed", why: row.error ?? `the probe ${row.state}` });
        }
        setProbe({ kind: "failed", why: "the probe is still running; its result is on Pipelines" });
      })
      .catch((e: unknown) => probing.current === mine && setProbe({ kind: "failed", why: messageOf(e) }));
  };

  const add = (bringIn: boolean) => {
    if (adding !== null || !absolute || !name) return;
    const fields: DatasetFields | null = modern
      ? {
          arrives: v0 ? "identified" : arrives,
          identity: identity ?? null,
          unmapped: arrives === "coded" ? "code" : unmapped,
          cohort: cohortOf(cohortChoice),
          ...(arrives !== "identified" && !v0 ? { move_into_anon: true } : {}),
        }
      : null;
    const chain = bringIn ? (modern ? bringInBody({ name, arrives: fields?.arrives, handling: { arrives: "identified", on_release: { uids: "remap", deface: false } } }, bringInName(name), packFor(caps)) : { command: ["digest", "--name", name, `@${name}`], name, then: [] }) : null;
    const plan: AddPlan = {
      name,
      path: folder,
      fields,
      restart: restarts,
      map: map && map.report && map.report.conflicts.length === 0 && importsServed ? mapImport(map.columns, map.rows, types) : null,
      bringIn: chain,
    };
    const say = (phase: string) => setAct({ kind: "working", phase, since: Date.now() });
    addDataset(plan, say)
      .then((said) => {
        setAct({ kind: "done", words: said });
        onDone(said);
      })
      .catch((e: unknown) => setAct({ kind: "failed", why: messageOf(e) }));
  };

  const folderSection = (
    <div className="field pick-folder">
      <span className="label">Folder</span>
      {picking ? (
        <IngestPicker
          places={places}
          adding={adding}
          choose="one"
          picked={picked}
          onPick={(c) => chooseFolder(c.path, c.at)}
          outside={
            <button
              type="button"
              className="button quiet small"
              disabled={working}
              onClick={() => {
                // the folder is no longer one of the engine's locations, so it is no longer named as one
                setOutside(true);
                setAt(null);
              }}
            >
              <Icon name="folder-search" />A folder outside these
            </button>
          }
        />
      ) : (
        <>
          <PathField
            id="dataset-path"
            value={path}
            placeholder="/srv/imaging/incoming"
            disabled={working}
            browse={supervised}
            known={knownFolders(places, install?.dir ?? null)}
            onChange={(p) => chooseFolder(p, null)}
          />
          {lists && (
            <button type="button" className="button quiet small" disabled={working} onClick={() => setOutside(false)}>
              <Icon name="arrow-up" />
              The engine's locations
            </button>
          )}
        </>
      )}
      {looking !== null && <Wait phase="looking inside the folder" since={looking} />}
      {folder !== "" && (found !== null || at !== null) && (
        <Values cells={[{ k: "chosen", v: at ?? folder }, ...(at !== null ? [{ k: "folder", v: folder }] : []), ...(found ? [{ k: "inside", v: insideWords(found) }] : [])]} />
      )}
      {lookWhy && <p className="warn">{lookWhy}</p>}
    </div>
  );

  const mapSection = (
    <div className="field">
      <span className="label">{v0 ? "v0's map" : "The map"}</span>
      {importsServed ? (
        <>
          <div className="field-row">
            <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="sr-only" aria-label="The map as a CSV" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            <button type="button" className="button secondary small" disabled={working} onClick={() => fileRef.current?.click()}>
              <Icon name="file" />
              {map ? "Another CSV" : v0 ? "Choose the file" : "Upload a CSV"}
            </button>
            <span className="meta">{v0 ? "every person keeps the code they had" : "identifier to code, or to the person's number"}</span>
          </div>
          {map && (
            <div className="map-columns">
              <p className="meta">
                <span className="path">{map.file}</span>: {map.rows.length.toLocaleString("en-US")} rows
              </p>
              <div className="table-wrap">
                <table className="thin">
                  <thead>
                    <tr>
                      <th>Column</th>
                      <th>Is</th>
                      <th>Of type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {map.columns.map((c, i) => (
                      <tr key={c.header || i}>
                        <td>
                          <span className="path">{c.header || `column ${i + 1}`}</span>
                        </td>
                        <td>
                          <div className="input">
                            <select value={c.guess.role} aria-label={`What ${c.header || `column ${i + 1}`} is`} disabled={working} onChange={(e) => setRole(i, c, e.target.value as ColumnRole)}>
                              <option value="identifier">an identifier</option>
                              <option value="canonical">the canonical identifier</option>
                              <option value="code">the code</option>
                              <option value="ignore">ignored</option>
                            </select>
                          </div>
                        </td>
                        <td>
                          {(c.guess.role === "identifier" || c.guess.role === "canonical") && (
                            <TypeSelect
                              value={c.guess.id_type ?? c.guess.new_type ?? ""}
                              types={types}
                              disabled={working}
                              label={`The type of ${c.header || `column ${i + 1}`}`}
                              onChange={(t) => setType(i, c, t)}
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {newTypes.length > 0 && (
                <p className="meta">
                  {newTypes.length === 1 ? `The type ${newTypes[0]} is not one of the site's, and is made when the map is filed.` : `The types ${newTypes.join(", ")} are not the site's, and are made when the map is filed.`}
                </p>
              )}
              <div className="row actions">
                <button type="button" className="button secondary small" disabled={map.checking || working} onClick={() => check(map)}>
                  Check the map
                </button>
                {map.checking && <Wait phase="asking what the map would do" since={Date.now()} />}
                {map.why && <span className="warn">{map.why}</span>}
              </div>
              {map.report && (
                <ul className="report">
                  {reportLines(map.report).map((l) => (
                    <li key={l.label} className={l.tone === "caution" ? "warn" : l.tone === "ok" ? "ok-words" : undefined}>
                      {l.label}: {l.words}
                    </li>
                  ))}
                  <li className="meta">{map.report.conflicts.length > 0 ? "Nothing is written while a conflict stands." : "Filed once the dataset is added."}</li>
                </ul>
              )}
            </div>
          )}
        </>
      ) : (
        <span className="meta">{modern ? "Filing a map needs work on the Data page." : "This engine files a map from its command line: nils linkage import."}</span>
      )}
      {!v0 && arrives !== "coded" && (
        <div className="choices" role="radiogroup">
          <label className="radio-row">
            <input type="radio" name="unmapped" checked={unmapped === "hold"} disabled={working} onChange={() => setUnmapped("hold")} />
            <span>
              <b>Hold files whose identifier the map does not know</b>
              <span className="meta">They wait in the originals until someone maps them.</span>
            </span>
          </label>
          <label className="radio-row">
            <input type="radio" name="unmapped" checked={unmapped === "code"} disabled={working} onChange={() => setUnmapped("code")} />
            <span>
              <b>Give them a code from the identifier</b>
              <span className="meta">The same identifier always gives the same code; a later map merges it.</span>
            </span>
          </label>
        </div>
      )}
    </div>
  );

  const cohortSection = (
    <div className="field">
      <label className="label" htmlFor="dataset-cohort">
        Its subjects join
      </label>
      <div className="field-row">
        <div className="input">
          <select id="dataset-cohort" value={cohortChoice} disabled={working} onChange={(e) => setCohort(e.target.value)}>
            {choices.map((c) => (
              <option key={c.value} value={c.value}>
                {c.words}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );

  const foot = (
    <>
      {words && install && restarts && (
        <div className="note">
          <Icon name="restart" />
          <div className="note-body">
            <p className="note-lead">{words.lead}</p>
            <p className="note-detail">{words.detail}</p>
            <Command text={reapplyByHand(install)} />
          </div>
        </div>
      )}
      {act.kind === "working" && <Wait phase={act.phase} since={act.since} />}
      {act.kind === "failed" && <p className="warn">{act.why}</p>}
      {act.kind === "done" && <p className="ok-words">{act.words}</p>}
      {adding !== null && <p className="meta">{adding}</p>}
      <div className="row actions">
        <span className="meta grow">{restarts ? "Adding a dataset restarts the engine, about 20 s." : supervised || !absolute ? "" : "The engine reads it once it starts again."}</span>
        <button type="button" className="button secondary" disabled={working} onClick={onClose}>
          Cancel
        </button>
        {!v0 && (
          <button type="button" className="button secondary" disabled={adding !== null || !absolute || !name || working} onClick={() => add(false)}>
            Add
          </button>
        )}
        <button type="button" className="button" disabled={adding !== null || !absolute || !name || working} onClick={() => add(true)}>
          Add and bring in
        </button>
      </div>
    </>
  );

  return (
    <Dialog title="Add a dataset" icon="folder" onClose={onClose} foot={foot}>
      {folderSection}
      <div className="field">
        <label className="label" htmlFor="dataset-name">
          Name
        </label>
        <div className="input mono">
          <input id="dataset-name" value={name} spellCheck={false} disabled={working} onChange={(e) => setTyped(e.target.value)} />
        </div>
      </div>
      {v0 ? (
        <>
          <div className="note brand">
            <Icon name="info" />
            <div className="note-body">
              <p className="note-lead">{v0.lead}</p>
              <p className="note-detail">{v0.detail}</p>
            </div>
          </div>
          <div className="field">
            <span className="label">What happens</span>
            <ul className="tl">
              <li className="now">
                <span>
                  <b>dcm-raw is renamed dcm-anon</b>
                  <span className="meta">A rename; nothing is rewritten.</span>
                </span>
              </li>
              <li>
                <span>
                  <b>v0's map is filed</b>
                  <span className="meta">Every person keeps the code they had.</span>
                </span>
              </li>
              <li>
                <span>
                  <b>The originals stay</b>
                  <span className="meta">dcm-original is locked, and read again only for new files.</span>
                </span>
              </li>
            </ul>
          </div>
          {mapSection}
          {cohortSection}
          {v0.skipped > 0 && (
            <div className="note">
              <Icon name="lock" />
              <div className="note-body">
                <p className="note-detail">The {v0.skipped.toLocaleString("en-US")} files v0 skipped are in dcm-original only; the first bring-in pseudonymises them.</p>
              </div>
            </div>
          )}
        </>
      ) : modern ? (
        <>
          <div className="field">
            <span className="label">How the files come in</span>
            <div className="choices" role="radiogroup">
              <label className="radio-row">
                <input type="radio" name="arrives" checked={arrives === "identified"} disabled={working} onChange={() => setArrives("identified")} />
                <span>
                  <b>Identified, from the scanners</b>
                  <span className="meta">Pseudonymised into dcm-anon first; the originals stay locked.</span>
                </span>
              </label>
              <label className="radio-row">
                <input type="radio" name="arrives" checked={arrives === "deidentified"} disabled={working} onChange={() => setArrives("deidentified")} />
                <span>
                  <b>De-identified by someone else</b>
                  <span className="meta">Moved in as sent; the map gives it our codes.</span>
                </span>
              </label>
              <label className="radio-row">
                <input type="radio" name="arrives" checked={arrives === "coded"} disabled={working} onChange={() => setArrives("coded")} />
                <span>
                  <b>Our own codes already in PatientID</b>
                  <span className="meta">Moved in; the codes are taken as they are.</span>
                </span>
              </label>
            </div>
          </div>
          {arrives !== "coded" && (
            <div className="field">
              <span className="label">Who a file is about</span>
              <div className="field-row">
                <div className="input">
                  <select value={fieldChoice} aria-label="Where the identifier is read from" disabled={working} onChange={(e) => setFieldChoice(e.target.value as FieldChoice)}>
                    <option value="PatientID">PatientID</option>
                    <option value="PatientName">PatientName</option>
                    <option value="other">another DICOM keyword</option>
                    <option value="path">a folder of the path</option>
                  </select>
                </div>
                {fieldChoice === "other" && (
                  <div className="input mono">
                    <input value={otherField} placeholder="OtherPatientIDs" aria-label="The DICOM keyword" spellCheck={false} disabled={working} onChange={(e) => setOtherField(e.target.value)} />
                  </div>
                )}
                {fieldChoice === "path" && (
                  <div className="input">
                    <input type="number" min={1} value={segment} aria-label="Which folder of the path, counted from one" disabled={working} onChange={(e) => setSegment(Math.max(1, Number(e.target.value) || 1))} />
                  </div>
                )}
                <TypeSelect value={idType} types={types} disabled={working} label="The identifier's type" onChange={setIdType} />
                {typesServed && may(caps, "data:work") && !newType && (
                  <button type="button" className="button quiet small" disabled={working} onClick={() => setNewType({ name: "", description: "", why: null })}>
                    New type
                  </button>
                )}
                {probes && (
                  <button type="button" className="button secondary small" disabled={working || !location || !identity || probe.kind === "working"} title={!location ? "The folder lies under no location of the engine's; probe once the dataset is added." : undefined} onClick={runProbe}>
                    Probe the shapes
                  </button>
                )}
              </div>
              {newType && (
                <div className="field-row">
                  <div className="input mono">
                    <input value={newType.name} placeholder="study-id" aria-label="The new type's name" spellCheck={false} onChange={(e) => setNewType({ ...newType, name: e.target.value })} />
                  </div>
                  <div className="input">
                    <input value={newType.description} placeholder="What the identifier is" aria-label="What the new type is" onChange={(e) => setNewType({ ...newType, description: e.target.value })} />
                  </div>
                  <button type="button" className="button small" disabled={!newType.name.trim()} onClick={addType}>
                    Make it
                  </button>
                  <button type="button" className="button quiet small" onClick={() => setNewType(null)}>
                    Never mind
                  </button>
                  {newType.why && <span className="warn">{newType.why}</span>}
                </div>
              )}
              {probe.kind === "working" && <Wait phase={probe.phase} since={probe.since} />}
              {probe.kind === "done" && <span className="meta">{probe.words}</span>}
              {probe.kind === "failed" && <span className="warn">{probe.why}</span>}
              <Says head="What the type is for">
                The type is the name the sealed store files an identifier under, so one person is one subject however many numbers they arrive under. Probe the shapes reads a sample and answers in
                shapes and counts, never a value, and writes nothing.
              </Says>
            </div>
          )}
          {arrives !== "coded" && mapSection}
          {cohortSection}
        </>
      ) : (
        <>
          <div className="field">
            <span className="label">What comes in</span>
            <div className="choices" role="radiogroup">
              <label className="choice">
                <input type="radio" name="arrives" checked={arrives === "identified"} disabled={working} onChange={() => setArrives("identified")} />
                Identified, as the scanners send it
              </label>
              <label className="choice">
                <input type="radio" name="arrives" checked={arrives === "deidentified"} disabled={working} onChange={() => setArrives("deidentified")} />
                Already de-identified
              </label>
            </div>
          </div>
          <p className="meta">This engine keeps none of these choices yet: the folder is added and read as it is.</p>
        </>
      )}
    </Dialog>
  );
}

/** The identifier's type: one of the registry's where the engine lists them, else typed. */
function TypeSelect({ value, types, disabled, label, onChange }: { value: string; types: LinkageType[] | null; disabled: boolean; label: string; onChange: (t: string) => void }) {
  if (types && types.length > 0) {
    return (
      <div className="input">
        <select value={value} aria-label={label} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
          {!types.some((t) => t.name === value) && <option value={value}>{value || "choose a type"}</option>}
          {types.map((t) => (
            <option key={t.name} value={t.name} title={t.description ?? undefined}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
    );
  }
  return (
    <div className="input mono">
      <input value={value} placeholder="the type" aria-label={label} spellCheck={false} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
