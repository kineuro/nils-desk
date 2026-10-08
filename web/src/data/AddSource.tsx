// SPDX-License-Identifier: AGPL-3.0-only
// Add a source (Wave 7a, H2 round 1): the one way data comes in. Data's
// button, Setup's DICOM step and the Places page's source role all lead
// here. A source is a root folder: NILS explores it, and each folder under it
// becomes a dataset whose state its structure says, never a choice: under
// derivatives/, dcm-original is identified data, dcm-anon (or v0's dcm-raw)
// is already anonymised, both is identified with its anonymised copy, and
// DICOM beside derivatives/ or no tree at all is unknown. A folder that holds
// derivatives/ itself is one dataset, and a path that names a pseudonymised
// tree is read as that tree. The datasets found are listed with their state
// in plain words; one that is not read yet says why, and is finished in the
// same dialog. Nothing is moved and nothing is read until each is complete.
// The folder is chosen in the engine's own picker, or typed.

import { useState } from "react";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";
import { placeName } from "../home/look";
import type { Place } from "../objects/client";
import { messageOf } from "../settings/common";
import { addFolderWords, keptRunning, reapplyByHand } from "../settings/install";
import { knownFolders } from "../settings/move";
import { PathField } from "../settings/PathField";
import { followRun, supervise, type Install } from "../settings/supervise";
import { Command } from "../ui/Command";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import { places as placesDoor, type Layout, type PlaceAnswer } from "./datasets";
import { FinishPanel, type Finishing } from "./FinishDataset";
import { FINISH, NOT_READ, notReadOf, readsStructure, stateOf, stateWords } from "./layout";
import { IngestPicker } from "./Picker";
import { newFolderRefusal, type Chosen } from "./picker";

type Act = { kind: "idle" } | { kind: "working"; phase: string; since: number } | { kind: "failed"; why: string };

/** One row of what the exploration found: a dataset place with its layout, or a folder it could not settle. */
export interface Row {
  place: Finishing | null;
  name: string;
  path: string;
  layout: Layout | null;
  error: string | null;
}

/** The rows of a door's answer: a root's datasets, or the one dataset the folder is. */
export function rowsOf(answer: PlaceAnswer): Row[] {
  if (answer.dataset?.kind === "root" || answer.datasets) {
    return (answer.datasets ?? []).map((f) =>
      typeof f.id === "number"
        ? { place: { id: f.id, name: f.name, path: f.path, dataset: f.dataset }, name: f.name, path: f.path, layout: f.layout ?? null, error: null }
        : { place: null, name: f.name, path: f.path, layout: null, error: f.layout?.error ?? "it could not be settled" },
    );
  }
  return [{ place: { id: answer.id, name: answer.name, path: answer.path, dataset: answer.dataset }, name: answer.name, path: answer.path, layout: answer.layout ?? null, error: null }];
}

/** How the exploration ended, in one line. */
export function foundWords(name: string, rows: Row[], root: boolean): string {
  const datasets = rows.filter((r) => r.place !== null);
  const waiting = datasets.filter((r) => notReadOf({ ...r.place!, role: "source" }) !== null).length;
  const n = (k: number) => k.toLocaleString("en-US");
  const head = root ? `${name} is a source with ${n(datasets.length)} ${datasets.length === 1 ? "dataset" : "datasets"}` : `${name} is a dataset`;
  return waiting === 0 ? `${head}, read by what its structure says.` : `${head}; ${n(waiting)} ${waiting === 1 ? "is" : "are"} not read until finished.`;
}

export function AddSource(props: { caps: Capabilities; install: Install | null; places: Place[]; initial?: { path: string }; onClose: () => void; onDone: (words: string) => void }) {
  const { caps, install, places, onClose, onDone } = props;
  const [path, setPath] = useState(props.initial?.path ?? "");
  const [at, setAt] = useState<string | null>(null);
  // a folder named by the page that opened the dialog is typed, not picked
  const [outside, setOutside] = useState(Boolean(props.initial?.path));
  const [typed, setTyped] = useState<string | null>(null);
  const [act, setAct] = useState<Act>({ kind: "idle" });
  const [found, setFound] = useState<{ name: string; root: boolean; loose: number; rows: Row[] } | null>(null);
  const [finishing, setFinishing] = useState<number | null>(null);
  const folder = path.trim().replace(/\/+$/, "");
  const absolute = folder.startsWith("/");
  const name = typed ?? (folder ? placeName(folder, places.map((p) => p.name)) : "");
  const structure = readsStructure(caps);
  const supervised = install !== null && may(caps, "install:work");
  const restarts = supervised && install !== null && keptRunning(install);
  const refusal = newFolderRefusal(caps);
  const lists = served(caps, "POST /api/ingest/folders") && may(caps, "data:work");
  const picking = lists && !outside;
  const picked: Chosen | null = at !== null ? { at, path: folder, place: null } : null;
  const working = act.kind === "working";
  const words = install ? addFolderWords(install) : null;

  const explore = async () => {
    if (refusal !== null || !absolute || !name || !structure) return;
    const say = (phase: string) => setAct({ kind: "working", phase, since: Date.now() });
    try {
      say(`exploring ${folder}`);
      const answer = await placesDoor.add({ name, role: "source", path: folder, guarantees: { backup: null, snapshots: false, protected: false, fast: false } });
      const root = answer.dataset?.kind === "root";
      setFound({ name: answer.name, root, loose: root && typeof (answer.layout as { loose?: unknown } | null)?.loose === "number" ? ((answer.layout as { loose: number }).loose ?? 0) : 0, rows: rowsOf(answer) });
      if (restarts) {
        say("starting the engine again with the folder");
        const run = await supervise.reapply("engine");
        const ended = await followRun(run.id, () => undefined);
        if (ended === null) throw new Error(`${answer.name} is added; the engine is still starting, so look again in a moment.`);
        if (ended.state !== "done") throw new Error(`${answer.name} is added, and the engine did not start again: ${ended.tail?.slice(-1)[0] ?? ended.state}`);
      }
      setAct({ kind: "idle" });
    } catch (e: unknown) {
      setAct({ kind: "failed", why: messageOf(e) });
    }
  };

  // what the exploration found, and one of its datasets finished in place
  if (found) {
    const row = finishing !== null ? found.rows[finishing] : null;
    const done = () => onDone(foundWords(found.name, found.rows, found.root));
    const foot = (
      <div className="row actions">
        <span className="meta grow">{found.root ? "Each folder under the source is a dataset of its own." : ""}</span>
        <button type="button" className="button" onClick={done}>
          Done
        </button>
      </div>
    );
    return (
      <Dialog title={`Add a source: ${found.name}`} icon="folder" onClose={done} foot={foot}>
        {act.kind === "failed" && <p className="warn">{act.why}</p>}
        {row && row.place ? (
          <FinishPanel
            caps={caps}
            place={row.place}
            layout={row.layout}
            onBack={() => setFinishing(null)}
            onSaved={(next) => setFound((f) => (f ? { ...f, rows: f.rows.map((r, i) => (i === finishing ? { ...r, place: next.place, layout: next.layout } : r)) } : f))}
          />
        ) : (
          <>
            {found.rows.length === 0 && <p className="meta">No folder under {found.name} holds anything to read yet. Put each dataset in a folder of its own under it, and explore it again from the Places page.</p>}
            {found.loose > 0 && (
              <p className="meta">
                {found.loose.toLocaleString("en-US")} {found.loose === 1 ? "file lies" : "files lie"} at the top of {found.name}; they belong to no dataset and are not read.
              </p>
            )}
            <ul className="found-list" aria-label="The datasets found">
              {found.rows.map((r, i) => {
                const why = r.place ? notReadOf({ ...r.place, role: "source" }) : null;
                const legacy = r.place?.dataset?.kind === "legacy" || r.layout?.legacy === true;
                return (
                  <li key={r.path} className="found-row">
                    <div className="grow">
                      <b>{r.name}</b>
                      <div className="meta path">{r.path}</div>
                      {r.error !== null ? (
                        <span className="warn">{r.error}</span>
                      ) : (
                        <span className="meta">{stateWords(r.place ? stateOf(r.place, r.layout) : undefined, why === null, legacy)}</span>
                      )}
                      {why !== null && <div className="meta">Not read: {why}.</div>}
                    </div>
                    {r.place && why !== null && <span className="tag caution">{NOT_READ}</span>}
                    {r.place && why === null && <span className="tag ok">read</span>}
                    {r.place && (
                      <button type="button" className={why !== null ? "button small" : "button quiet small"} aria-label={`${why !== null ? FINISH : "Settings"}: ${r.name}`} onClick={() => setFinishing(i)}>
                        {why !== null ? FINISH : "Settings"}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Dialog>
    );
  }

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
      {refusal !== null && <p className="meta">{refusal}</p>}
      <div className="row actions">
        <span className="meta grow">{restarts ? "Adding a source restarts the engine, about 20 s." : ""}</span>
        <button type="button" className="button secondary" disabled={working} onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="button" disabled={refusal !== null || !absolute || !name || !structure || working} onClick={() => void explore()}>
          Add and explore
        </button>
      </div>
    </>
  );

  return (
    <Dialog title="Add a source" icon="folder" onClose={onClose} foot={foot}>
      <div className="field pick-folder">
        <span className="label">Folder</span>
        {picking ? (
          <IngestPicker
            places={places}
            adding={refusal}
            choose="one"
            picked={picked}
            onPick={(c) => {
              setAt(c.at);
              setPath(c.path);
            }}
            outside={
              <button
                type="button"
                className="button quiet small"
                disabled={working}
                onClick={() => {
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
              id="source-path"
              value={path}
              placeholder="/srv/imaging/incoming"
              disabled={working}
              browse={supervised}
              known={knownFolders(places, install?.dir ?? null)}
              onChange={(p) => {
                setAt(null);
                setPath(p);
              }}
            />
            {lists && (
              <button type="button" className="button quiet small" disabled={working} onClick={() => setOutside(false)}>
                <Icon name="arrow-up" />
                The engine's locations
              </button>
            )}
          </>
        )}
        {at !== null && <span className="meta path">{folder}</span>}
      </div>
      <div className="field">
        <label className="label" htmlFor="source-name">
          Name
        </label>
        <div className="input mono">
          <input id="source-name" value={name} spellCheck={false} disabled={working} onChange={(e) => setTyped(e.target.value)} />
        </div>
      </div>
      {structure ? (
        <div className="note brand">
          <Icon name="info" />
          <div className="note-body">
            <p className="note-lead">NILS explores the folder</p>
            <p className="note-detail">
              Each folder under it is a dataset, and what it holds says how it is read: derivatives/dcm-original is identified and is pseudonymised, derivatives/dcm-anon is already anonymised. Anything else is
              unknown until you say where its entries go. Nothing is moved and nothing is read until each dataset is complete.
            </p>
          </div>
        </div>
      ) : (
        <p className="warn">This engine does not explore a source by its structure. Update the engine on the Parts page, then add the source.</p>
      )}
    </Dialog>
  );
}
