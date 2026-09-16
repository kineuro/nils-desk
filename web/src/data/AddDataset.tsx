// SPDX-License-Identifier: AGPL-3.0-only
// Add a dataset (record 26, D1): a name and a folder, what arrives through
// it, who a file is about with the identifier's type from the registry's list
// or a new one made here, the shapes probed over a sample, the map as a CSV
// whose columns are named for what they are and whose report is read before
// anything is written, what happens to a file whose identifier the map does
// not know, and the cohort its subjects join. A folder that holds a v0 cohort
// layout is declared as one: dcm-raw renamed, v0's map filed, the originals
// left. Adding a folder as a dataset asks for work on the Data and the Places
// pages, and starts the engine again where a service keeps it running.

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
import {
  bringInBody,
  bringInName,
  cohortChoices,
  cohortOf,
  columnsRefusal,
  guessColumns,
  identityOf,
  jobs,
  linkage,
  locationOf,
  look,
  packFor,
  parseCsv,
  places as placesDoor,
  probeWords,
  record26,
  reportLines,
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
import { newFolderRefusal } from "./picker";

type Act = { kind: "idle" } | { kind: "working"; phase: string; since: number } | { kind: "done"; words: string } | { kind: "failed"; why: string };

/** The map as uploaded: its file, its columns named, and what the engine said it would do. */
interface Map {
  file: string;
  header: string[];
  rows: string[][];
  columns: MapColumn[];
  report: ImportReport | null;
  checking: boolean;
  why: string | null;
}

export interface AddPlan {
  name: string;
  path: string;
  /** The dataset fields, or null for an engine before record 26. */
  fields: DatasetFields | null;
  /** Start the engine again, so it reads the new folder: only where a service keeps it running. */
  restart: boolean;
  map: { columns: MapColumn[]; rows: string[][] } | null;
  bringIn: BringIn | null;
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
    const r = await patiently(() => linkage.import({ place: plan.name, columns: plan.map!.columns, rows: plan.map!.rows, dry_run: false }));
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
  layoutOf?: (folder: string) => Promise<Layout | null>;
  onClose: () => void;
  onDone: (words: string) => void;
}) {
  const { caps, install, places, cohorts, onClose, onDone } = props;
  const [path, setPath] = useState(props.initial?.path ?? "");
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
  const looks = modern && served(caps, "POST /api/ingest/look");
  const typesServed = served(caps, "GET /api/linkage/types");
  const importsServed = modern && served(caps, "POST /api/linkage/imports") && may(caps, "data:work");
  const probes = modern && served(caps, "POST /api/ingest/probe") && may(caps, "data:work");
  const v0 = v0Words(layout);
  const location = absolute ? locationOf(folder, places) : null;
  const from = fieldChoice === "path" ? ({ kind: "path", segment } as const) : ({ kind: "field", field: fieldChoice === "other" ? otherField : fieldChoice } as const);
  const identity = identityOf(from, idType);
  const choices = cohortChoices(name, cohorts);
  const cohortChoice = cohort ?? choices[0]?.value ?? "none";
  const words = install ? addFolderWords(install) : null;
  const layoutOf = props.layoutOf ?? ((f: string) => look.layout(f).then((r) => r.layout ?? null));

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

  // once the folder settles, the look says whether it holds a v0 cohort layout
  useEffect(() => {
    if (props.initial && folder === props.initial.path.trim().replace(/\/+$/, "")) return;
    setLayout(null);
    if (!looks || !absolute) return;
    let alive = true;
    const t = setTimeout(() => {
      layoutOf(folder)
        .then((l) => alive && setLayout(l))
        .catch(() => alive && setLayout(null));
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
        const { header, rows } = parseCsv(text);
        if (header.length === 0) return setMap({ file: file.name, header, rows, columns: [], report: null, checking: false, why: "The file has no header row." });
        const columns = guessColumns(header, idType || null);
        const next: Map = { file: file.name, header, rows, columns, report: null, checking: false, why: null };
        setMap(next);
        check(next);
      })
      .catch((e: unknown) => setMap({ file: file.name, header: [], rows: [], columns: [], report: null, checking: false, why: messageOf(e) }));
  };

  /** The dry run: what the engine would do with the map as its columns stand. */
  const check = (m: Map) => {
    const refusal = columnsRefusal(m.columns);
    if (refusal || !importsServed) return setMap({ ...m, report: null, why: refusal });
    setMap({ ...m, checking: true, why: null });
    linkage
      .import({ columns: m.columns, rows: m.rows, dry_run: true })
      .then((r) => setMap((was) => (was && was.file === m.file ? { ...was, checking: false, report: "job" in r ? null : r, why: "job" in r ? "The engine filed the map at once rather than rehearsing it." : null } : was)))
      .catch((e: unknown) => setMap((was) => (was && was.file === m.file ? { ...was, checking: false, report: null, why: messageOf(e) } : was)));
  };

  const setColumn = (i: number, patch: Partial<MapColumn>) =>
    setMap((m) => (m ? { ...m, columns: m.columns.map((c, k) => (k === i ? { ...c, ...patch } : c)), report: null } : m));

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
    const chain = bringIn ? (modern ? bringInBody({ name, arrives: fields?.arrives, handling: { arrives: "identified", on_release: { dates: "keep", uids: "remap", deface: false } } }, bringInName(name), packFor(caps)) : { command: ["digest", "--name", name, `@${name}`], name, then: [] }) : null;
    const plan: AddPlan = {
      name,
      path: folder,
      fields,
      restart: restarts,
      map: map && map.report && map.report.conflicts.length === 0 && importsServed ? { columns: map.columns, rows: map.rows } : null,
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
            <span className="meta">{v0 ? "v0's CSV of PatientID and subject_code imports as it is; every person keeps the code they had." : "identifier to code, or identifier to the number that stands for the person; several files, several types, any time"}</span>
          </div>
          {map && (
            <div className="map-columns">
              <p className="meta">
                <span className="path">{map.file}</span>: {map.rows.length.toLocaleString("en-US")} rows. Name each column for what it is.
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
                            <select value={c.role} aria-label={`What ${c.header || `column ${i + 1}`} is`} disabled={working} onChange={(e) => setColumn(i, { role: e.target.value as ColumnRole })}>
                              <option value="identifier">an identifier</option>
                              <option value="canonical">the canonical identifier</option>
                              <option value="code">the code</option>
                              <option value="ignore">ignored</option>
                            </select>
                          </div>
                        </td>
                        <td>{(c.role === "identifier" || c.role === "canonical") && <TypeSelect value={c.id_type ?? ""} types={types} disabled={working} label={`The type of ${c.header || `column ${i + 1}`}`} onChange={(t) => setColumn(i, { id_type: t })} />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
                    <li key={l.words} className={l.tone === "caution" ? "warn" : l.tone === "ok" ? "ok-words" : undefined}>
                      {l.words}
                    </li>
                  ))}
                  <li className="meta">{map.report.conflicts.length > 0 ? "Nothing is written while a conflict stands." : "Filed once the dataset is added; it holds for every dataset."}</li>
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
              <span className="meta">They stay in the originals until someone maps them. The dataset says how many.</span>
            </span>
          </label>
          <label className="radio-row">
            <input type="radio" name="unmapped" checked={unmapped === "code"} disabled={working} onChange={() => setUnmapped("code")} />
            <span>
              <b>Give them a code from the identifier</b>
              <span className="meta">The same identifier always gives the same code; the subject is marked unmapped so a later map can merge it.</span>
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
        {v0 && cohortChoice.startsWith("new:") && <span className="meta">v0's cohort of the same name, made now</span>}
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
        <span className="meta grow">{restarts ? "Adding a dataset restarts the engine, about 20 s." : supervised || !absolute ? "" : "The engine reads a new dataset once it starts again."}</span>
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
      <div className="fields2 dataset-names">
        <div className="field">
          <label className="label" htmlFor="dataset-name">
            Name
          </label>
          <div className="input mono">
            <input id="dataset-name" value={name} spellCheck={false} disabled={working} onChange={(e) => setTyped(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label className="label" htmlFor="dataset-path">
            Folder
          </label>
          <PathField id="dataset-path" value={path} placeholder="/srv/imaging/incoming" disabled={working} browse={supervised} known={knownFolders(places, install?.dir ?? null)} onChange={setPath} />
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
                  <span className="meta">A rename, nothing rewritten. It becomes the registry's source.</span>
                </span>
              </li>
              <li>
                <span>
                  <b>v0's map is filed</b>
                  <span className="meta">Its identifier to code pairs go into the sealed store, so every person keeps the code they had, and their number is known if it arrives again.</span>
                </span>
              </li>
              <li>
                <span>
                  <b>The originals stay</b>
                  <span className="meta">dcm-original is locked and never read again unless new files land there; then they are pseudonymised into dcm-anon like any other.</span>
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
                <p className="note-detail">
                  The {v0.skipped.toLocaleString("en-US")} files v0 skipped are in dcm-original only; they are pseudonymised on the first bring-in, or held if their identifier is not in the map.
                </p>
              </div>
            </div>
          )}
        </>
      ) : modern ? (
        <>
          <div className="field">
            <span className="label">What arrives</span>
            <div className="choices" role="radiogroup">
              <label className="radio-row">
                <input type="radio" name="arrives" checked={arrives === "identified"} disabled={working} onChange={() => setArrives("identified")} />
                <span>
                  <b>Identified, from the scanners</b>
                  <span className="meta">Pseudonymised into derivatives/dcm-anon before anything reads it. The originals stay in derivatives/dcm-original, locked to the stewards.</span>
                </span>
              </label>
              <label className="radio-row">
                <input type="radio" name="arrives" checked={arrives === "deidentified"} disabled={working} onChange={() => setArrives("deidentified")} />
                <span>
                  <b>De-identified by someone else</b>
                  <span className="meta">Moved into dcm-anon as sent, in place, instantly. Its identifiers are mapped to our codes by the map below.</span>
                </span>
              </label>
              <label className="radio-row">
                <input type="radio" name="arrives" checked={arrives === "coded"} disabled={working} onChange={() => setArrives("coded")} />
                <span>
                  <b>Our own codes already in PatientID</b>
                  <span className="meta">Moved into dcm-anon; the codes are taken as they are.</span>
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
                  <button type="button" className="button secondary small" disabled={working || !location || !identity || probe.kind === "working"} title={!location ? "The folder lies under no source yet; probe once the dataset is added." : undefined} onClick={runProbe}>
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
              <span className="meta">
                {types && types.length > 0 ? `The type is one of the registry's (${types.map((t) => t.name).join(", ")}) or a new one made here.` : typesServed ? "The registry names no type yet; make one here." : "The type is the name the registry files the identifier under."}
                {probe.kind === "done" ? ` ${probe.words}` : ""}
              </span>
              {probe.kind === "working" && <Wait phase={probe.phase} since={probe.since} />}
              {probe.kind === "failed" && <span className="warn">{probe.why}</span>}
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
          <p className="meta">This engine keeps no dataset fields yet: the folder is added as a source, read as it is, and its handling is declared from the card.</p>
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
