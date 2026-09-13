// SPDX-License-Identifier: AGPL-3.0-only
// Home's third step opened, as the chosen design draws it: a folder named,
// looked inside by the supervisor on this host, each folder inside ticked to
// become a batch of its own, and the folder added as a source. The engine
// starts again to read it, which the supervisor does and says how it went;
// the command a person would run by hand is beside the buttons.

import { useState } from "react";
import { DoorError } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { holds } from "../deployment";
import { objects, type Place } from "../objects/client";
import { ops } from "../ops/client";
import { railPresent } from "../sections";
import { addFolderWords, keptRunning, reapplyByHand } from "../settings/install";
import { followRun, supervise, type Install } from "../settings/supervise";
import { Command } from "../ui/Command";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import { digests, placeName, rows as rowsOf, type FolderRow, type Pack } from "./look";
import type { Step } from "./steps";

type Seen = { kind: "idle" } | { kind: "looking"; since: number } | { kind: "seen"; rows: FolderRow[]; partial: boolean } | { kind: "failed"; why: string };
type Act = { kind: "idle" } | { kind: "working"; phase: string; since: number } | { kind: "done"; words: string } | { kind: "failed"; why: string };

function messageOf(e: unknown): string {
  if (e instanceof DoorError) {
    const body = (e.body ?? {}) as { error?: unknown };
    return typeof body.error === "string" ? body.error : `the door answered ${e.status}`;
  }
  return e instanceof Error ? e.message : String(e);
}

/** A door asked again while the engine is still starting: a failed connection or the desk saying the engine did not answer. */
async function patiently<T>(f: () => Promise<T>, tries = 20): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await f();
    } catch (e) {
      const starting = e instanceof TypeError || (e instanceof Error && /did not answer/.test(e.message));
      if (!starting || i >= tries) throw e;
      await new Promise((done) => setTimeout(done, 3000));
    }
  }
}

export function BringInStep(props: { n: number; step: Step; caps: Capabilities; install: Install | null; places: Place[]; packs: Pack[]; onDone: () => void }) {
  const { n, step, caps, install, places, packs, onDone } = props;
  const [path, setPath] = useState("");
  const [seen, setSeen] = useState<Seen>({ kind: "idle" });
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [act, setAct] = useState<Act>({ kind: "idle" });
  // the supervisor answers an admin; the install is its answer
  const supervised = install !== null && holds(caps, "admin");
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
    const queue = digest ? digests(name, chosen) : [];
    setAct({ kind: "working", phase: "adding the folder as a source", since: Date.now() });
    (async () => {
      await objects.placeAdd({ name, role: "source", path: folder, guarantees: { backup: null, snapshots: false, protected: false, fast: false } });
      if (!restarts) {
        setAct({ kind: "done", words: `${name} is a source. The engine reads it once it starts again.` });
        onDone();
        return;
      }
      setAct({ kind: "working", phase: "starting the engine again with the folder", since: Date.now() });
      const run = await supervise.reapply("engine");
      const ended = await followRun(run.id, () => undefined);
      if (ended === null) throw new Error("the engine is still starting; look again in a moment");
      if (ended.state !== "done") throw new Error(`the engine did not start again: ${ended.tail?.slice(-1)[0] ?? ended.state}`);
      for (const [i, d] of queue.entries()) {
        setAct({ kind: "working", phase: `queueing digest ${i + 1} of ${queue.length}`, since: Date.now() });
        await patiently(() => ops.enqueue(d.command, d.name));
      }
      const queued = queue.length === 0 ? "" : queue.length === 1 ? ", and one digest is queued" : `, and ${queue.length} digests are queued`;
      setAct({ kind: "done", words: `${name} is a source${queued}.` });
      setSeen({ kind: "idle" });
      setPath("");
      onDone();
    })().catch((e: unknown) => setAct({ kind: "failed", why: messageOf(e) }));
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
    <div className="step open">
      <span className="stepno now">{n}</span>
      <div className="step-form">
        <div className="step-body">
          <h3>{step.title}</h3>
          <p className="meta">{step.words}</p>
        </div>
        <div className="row path-row">
          <label className="input mono grow">
            <span className="sr-only">A folder on this machine</span>
            <input
              value={path}
              placeholder="/srv/imaging/incoming"
              spellCheck={false}
              onChange={(e) => {
                setPath(e.target.value);
                setSeen({ kind: "idle" });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") look();
              }}
            />
          </label>
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
            <table className="thin">
              <thead>
                <tr>
                  <th className="tick">
                    <span className="sr-only">Digest</span>
                  </th>
                  <th>Folder</th>
                  <th className="num">Files</th>
                  <th>Looks like</th>
                  <th>Rules</th>
                </tr>
              </thead>
              <tbody>
                {seen.rows.map((r) => (
                  <tr key={r.name || "."}>
                    <td className="tick">
                      <input type="checkbox" checked={r.dicom && ticked.has(r.name)} disabled={!r.dicom || working} onChange={() => toggle(r.name)} aria-label={`Digest ${r.name || "the folder itself"}`} />
                    </td>
                    <td>
                      <span className="path">{r.name || "the folder itself"}</span>
                    </td>
                    <td className="num">
                      {r.files.toLocaleString("en-GB")}
                      {r.capped ? "+" : ""}
                    </td>
                    <td className={r.dicom ? undefined : "meta"}>{r.looksLike}</td>
                    <td>
                      {r.rules.kind === "pack" && <span className="chip">{r.rules.text}</span>}
                      {r.rules.kind === "digest-only" && <span className="tag caution">{r.rules.text}</span>}
                      {r.rules.kind === "none" && <span className="meta">{r.rules.text}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
          {railPresent(caps, "home") && (
            <button
              type="button"
              className="button quiet small"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent("nils:rail-say", {
                    detail: `Bring in ${folder || "the folder I name"}, one batch for each folder inside, and classify what can be classified.`,
                  }),
                )
              }
            >
              <Icon name="assistant" />
              Plan it with the assistant
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
      <span className="tag brand">next</span>
    </div>
  );
}
