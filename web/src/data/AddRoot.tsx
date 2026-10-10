// SPDX-License-Identifier: AGPL-3.0-only
// Adding a root folder (Wave 7a, the tries of 2026-10-08): the folder where
// the dataset folders live, and nothing more. NILS assumes nothing about what
// is under it; the Data page lists its folders, and a folder becomes a
// dataset only when the person adds it. The folder is chosen in the engine's
// own picker or typed. Setup holds the form in its step; Data and Places open
// it in a small dialog.

import { useState } from "react";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";
import { placeName } from "../home/look";
import type { Place } from "../objects/client";
import { messageOf } from "../settings/common";
import { keptRunning } from "../settings/install";
import { knownFolders } from "../settings/move";
import { PathField } from "../settings/PathField";
import { followRun, supervise, type Install } from "../settings/supervise";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import { readsStructure } from "./layout";
import { IngestPicker } from "./Picker";
import { newFolderRefusal, type Chosen } from "./picker";
import { roots } from "./steps";

type Act = { kind: "idle" } | { kind: "working"; phase: string; since: number } | { kind: "failed"; why: string };

/** The folder field, the add button and one line: the whole of adding a root. */
export function RootForm(props: { caps: Capabilities; install: Install | null; places: Place[]; initial?: string; onAdded: (words: string) => void; onCancel?: () => void }) {
  const { caps, install, places, onAdded, onCancel } = props;
  const [path, setPath] = useState(props.initial ?? "");
  const [at, setAt] = useState<string | null>(null);
  const [outside, setOutside] = useState(Boolean(props.initial));
  const [act, setAct] = useState<Act>({ kind: "idle" });
  const folder = path.trim().replace(/\/+$/, "");
  const absolute = folder.startsWith("/");
  const name = folder ? placeName(folder, places.map((p) => p.name)) : "";
  const supervised = install !== null && may(caps, "install:work");
  const restarts = supervised && install !== null && keptRunning(install);
  const refusal = newFolderRefusal(caps);
  const lists = served(caps, "POST /api/ingest/folders") && may(caps, "data:work");
  const picking = lists && !outside;
  const picked: Chosen | null = at !== null ? { at, path: folder, place: null } : null;
  const working = act.kind === "working";
  const structure = readsStructure(caps);

  const add = async () => {
    if (refusal !== null || !absolute || !name || !structure) return;
    try {
      setAct({ kind: "working", phase: `adding ${folder}`, since: Date.now() });
      const answer = await roots.add(name, folder);
      if (restarts) {
        setAct({ kind: "working", phase: "starting the engine again with the folder", since: Date.now() });
        const run = await supervise.reapply("engine");
        const ended = await followRun(run.id, () => undefined);
        if (ended === null || ended.state !== "done") throw new Error(`${answer.name} is added; the engine is still starting, so look again in a moment.`);
      }
      setAct({ kind: "idle" });
      setPath("");
      setAt(null);
      onAdded(`${answer.name} is added. Its folders are on the Data page.`);
    } catch (e: unknown) {
      setAct({ kind: "failed", why: messageOf(e) });
    }
  };

  if (refusal !== null) return <p className="meta">{refusal}</p>;
  if (!structure) return <p className="warn">Update the engine on the Parts page first.</p>;
  return (
    <div className="root-form pick-folder">
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
              <Icon name="folder-search" />
              Type a folder
            </button>
          }
        />
      ) : (
        <PathField
          id="root-path"
          value={path}
          label="The root folder"
          placeholder="/srv/imaging"
          disabled={working}
          browse={supervised}
          known={knownFolders(places, install?.dir ?? null)}
          onChange={(p) => {
            setAt(null);
            setPath(p);
          }}
          onEnter={() => void add()}
        />
      )}
      <div className="row actions">
        <span className="meta grow">{at !== null ? folder : "The folder your dataset folders are in."}</span>
        {onCancel && (
          <button type="button" className="button secondary" disabled={working} onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="button" className="button" disabled={!absolute || working} onClick={() => void add()}>
          Add
        </button>
      </div>
      {act.kind === "working" && <Wait phase={act.phase} since={act.since} />}
      {act.kind === "failed" && <p className="warn">{act.why}</p>}
    </div>
  );
}

/** The same form in a small dialog, from Data and Places. */
export function AddRootDialog(props: { caps: Capabilities; install: Install | null; places: Place[]; initial?: string; onClose: () => void; onDone: (words: string) => void }) {
  const { onClose, onDone, ...form } = props;
  return (
    <Dialog title="Add a root folder" icon="folder" onClose={onClose} foot={null}>
      <RootForm {...form} onAdded={onDone} onCancel={onClose} />
    </Dialog>
  );
}
