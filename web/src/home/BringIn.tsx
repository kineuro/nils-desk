// SPDX-License-Identifier: AGPL-3.0-only
// Bringing DICOM in, the step of setup that names a source. Where the engine
// lists its own ingest locations to a person with work on Data, folders are
// chosen there at any depth, looked inside and digested, one digest each (the
// picker in data/Picker.tsx). Otherwise, and for a person with work on the
// install who wants a folder outside those locations, a folder is typed or
// chosen by clicking through this machine's folders, looked inside by the
// supervisor on this host, each folder inside ticked to become a batch of its
// own, and the folder added as a source. The engine starts again to read it,
// which the supervisor does and says how it went; the command a person would
// run by hand is beside the buttons. That flow is the one the Places page
// adds a source with.

import { useState } from "react";
import type { Capabilities } from "../capabilities";
import { IngestPicker } from "../data/Picker";
import { door } from "../deployment";
import { may } from "../grants";
import type { Place } from "../objects/client";
import { sayLater } from "../assistant/client";
import { stationOf, stationsServed } from "../assistant/stations";
import { href } from "../routes";
import { assistantOffered } from "../sections";
import { messageOf } from "../settings/common";
import { addFolderWords, keptRunning, reapplyByHand } from "../settings/install";
import { knownFolders } from "../settings/move";
import { PathField } from "../settings/PathField";
import { addPlace } from "../settings/places";
import { supervise, type Install } from "../settings/supervise";
import { Command } from "../ui/Command";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import { FolderTable } from "./FolderTable";
import { digests, placeName, rows as rowsOf, type FolderRow, type Pack } from "./look";

type Seen = { kind: "idle" } | { kind: "looking"; since: number } | { kind: "seen"; rows: FolderRow[]; partial: boolean } | { kind: "failed"; why: string };
type Act = { kind: "idle" } | { kind: "working"; phase: string; since: number } | { kind: "done"; words: string } | { kind: "failed"; why: string };

export function BringInForm(props: { caps: Capabilities; install: Install | null; places: Place[]; packs: Pack[]; onDone: (words?: string) => void }) {
  const { caps, install, places, onDone } = props;
  const [outside, setOutside] = useState(false);
  // the engine lists its ingest locations to a person with work on Data; the host's folders need work on the install
  const listed = door(caps, "POST /api/ingest/folders") && may(caps, "data:work");
  const supervised = install !== null && may(caps, "install:work");
  if (listed && !outside) {
    return (
      <IngestPicker
        places={places}
        onDone={onDone}
        outside={
          supervised ? (
            <button type="button" className="button quiet small" onClick={() => setOutside(true)}>
              <Icon name="folder-search" />A folder outside these
            </button>
          ) : null
        }
      />
    );
  }
  return <HostForm {...props} back={listed ? () => setOutside(false) : null} />;
}

/** A folder of the host, through the supervisor: typed or browsed, looked inside, and added as a source with a restart. */
function HostForm(props: { caps: Capabilities; install: Install | null; places: Place[]; packs: Pack[]; onDone: (words?: string) => void; back: (() => void) | null }) {
  const { caps, install, places, packs, onDone, back } = props;
  const [path, setPath] = useState("");
  const [seen, setSeen] = useState<Seen>({ kind: "idle" });
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [act, setAct] = useState<Act>({ kind: "idle" });
  // the supervisor answers a person with work on the install; the install is its answer
  const supervised = install !== null && may(caps, "install:work");
  // and restarts the engine only where a service manager keeps it running
  const restarts = supervised && install !== null && keptRunning(install);
  const folder = path.trim().replace(/\/+$/, "");
  const absolute = folder.startsWith("/");
  const working = act.kind === "working";
  const chosen = seen.kind === "seen" ? seen.rows.filter((r) => r.dicom && ticked.has(r.name)) : [];

  const look = () => {
    if (!absolute || !supervised) return;
    setSeen({ kind: "looking", since: Date.now() });
    supervise
      .look(folder)
      .then((l) => {
        if (!l.exists) return setSeen({ kind: "failed", why: "Nothing is there on this machine." });
        if (!l.directory) return setSeen({ kind: "failed", why: "That is a file, not a folder." });
        if (!l.readable) return setSeen({ kind: "failed", why: "The folder is there, and this account cannot read it." });
        const rows = rowsOf(l, packs);
        setTicked(new Set(rows.filter((r) => r.dicom).map((r) => r.name)));
        setSeen({ kind: "seen", rows, partial: l.partial });
      })
      .catch((e: unknown) => setSeen({ kind: "failed", why: messageOf(e) }));
  };

  const add = (digest: boolean) => {
    const name = placeName(folder, places.map((p) => p.name));
    const say = (phase: string) => setAct({ kind: "working", phase, since: Date.now() });
    addPlace(
      { name, role: "source", path: folder, guarantees: { backup: null, snapshots: false, protected: false, fast: false }, restart: restarts, digests: digest ? digests(name, chosen) : [] },
      say,
    )
      .then((words) => {
        setAct({ kind: "done", words });
        setSeen({ kind: "idle" });
        setPath("");
        onDone();
      })
      .catch((e: unknown) => setAct({ kind: "failed", why: messageOf(e) }));
  };

  const toggle = (name: string) =>
    setTicked((t) => {
      const next = new Set(t);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const words = install ? addFolderWords(install) : null;
  const holding = seen.kind === "seen" ? seen.rows.filter((r) => r.dicom).length : 0;
  return (
    <div className="step-form">
      <div className="row path-row">
        <PathField
          value={path}
          placeholder="/srv/imaging/incoming"
          label="A folder on this machine"
          browse={supervised}
          known={knownFolders(places, install?.dir ?? null)}
          onChange={(p) => {
            setPath(p);
            setSeen({ kind: "idle" });
          }}
          onEnter={look}
        />
        {supervised && (
          <button type="button" className="button secondary" disabled={!absolute || seen.kind === "looking"} onClick={look}>
            <Icon name="search" />
            Look inside
          </button>
        )}
      </div>
      {seen.kind === "looking" && <Wait phase="looking inside the folder" since={seen.since} />}
      {seen.kind === "failed" && <p className="warn">{seen.why}</p>}
      {seen.kind === "seen" && (
        <div className="folders">
          <p className="meta">
            {holding === 0
              ? "No folder inside holds DICOM that the look could find."
              : `${holding === 1 ? "One folder holds" : `${holding} folders hold`} DICOM. Each ticked folder becomes a batch of its own.`}
            {seen.partial ? " The look stopped before the end, so some folders are not listed." : ""}
          </p>
          <FolderTable rows={seen.rows} ticked={ticked} onToggle={toggle} disabled={working} />
        </div>
      )}
      {words && install && (
        <div className="note">
          <Icon name="restart" />
          <div className="note-body">
            <p className="note-lead">{words.lead}</p>
            <p className="note-detail">{words.detail}</p>
            <Command text={reapplyByHand(install)} />
          </div>
        </div>
      )}
      <div className="row actions">
        {restarts && (
          <button type="button" className="button" disabled={!absolute || chosen.length === 0 || working} onClick={() => add(true)}>
            Add and digest
          </button>
        )}
        <button type="button" className={restarts ? "button secondary" : "button"} disabled={!absolute || working} onClick={() => add(false)}>
          {restarts ? "Add only" : "Add as a source"}
        </button>
        {assistantOffered(caps) && (
          <button
            type="button"
            className="button quiet small"
            onClick={() => {
              sayLater(
                stationsServed(caps).includes("operator") ? "operator" : stationOf(caps),
                `Bring in ${folder || "the folder I name"}, one batch for each folder inside, and classify what can be classified.`,
              );
              location.hash = href("assistant", "new");
            }}
          >
            <Icon name="assistant" />
            Plan it with the assistant
          </button>
        )}
        {back && (
          <button type="button" className="button quiet small" onClick={back}>
            <Icon name="arrow-up" />
            The engine's locations
          </button>
        )}
      </div>
      {!supervised && absolute && (
        <p className="meta">
          The engine reads a new source once it starts again: <Command text="nils supervise reapply --part engine" />
        </p>
      )}
      {act.kind === "working" && <Wait phase={act.phase} since={act.since} />}
      {act.kind === "done" && <p className="ok-words">{act.words}</p>}
      {act.kind === "failed" && <p className="warn">{act.why}</p>}
    </div>
  );
}
