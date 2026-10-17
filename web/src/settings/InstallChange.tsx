// SPDX-License-Identifier: AGPL-3.0-only
// The setup steps the supervisor makes (record 55 ruling 35 (c), gate T31),
// each a dialog with one action: how people sign in, another folder for the
// engine's archives, the stations' model server, and an archive put back.
// Where the supervisor does not make a step, a person who may work on the
// install reads the command under one line that says why; anyone else reads
// who makes it, and no command.

import { useId, useState } from "react";
import { DoorError } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { Command } from "../ui/Command";
import { Dialog } from "../ui/Dialog";
import { Wait } from "../ui/Wait";
import { Acted, messageOf, useRun } from "./common";
import { folderRefusal, instead, modelBody, modelRefusal, NO_SIGNIN, restoreWords, signinBody, signinRefusal, type ModelDraft, type SigninDraft } from "./changes";
import { PathField } from "./PathField";
import { supervise, type Change, type Install } from "./supervise";

/** What stands where a step's button does not: who makes it, or the command under the one line that says why; nothing where the button stands. */
export function Instead({ caps, install, change, command }: { caps: Capabilities; install: Install | null; change: Change; command: string }) {
  const said = instead(caps, install, change);
  if (said === null) return null;
  if (!said.command) return <p className="meta">{said.line}</p>;
  return (
    <div className="at-machine">
      <span className="meta">{said.line}</span>
      <Command text={command} />
    </div>
  );
}

/**
 * Follow a sign-in change until the run is done or the desk no longer
 * answers this browser as it did, which is the change taking hold: null then,
 * and the run's last words where it failed. A desk starting again does not
 * answer for a moment, and is asked again.
 */
async function signedOutOrEnded(id: string, everyMs = 1500, limitMs = 15 * 60_000): Promise<string | null> {
  const until = Date.now() + limitMs;
  while (Date.now() < until) {
    await new Promise((done) => setTimeout(done, everyMs));
    try {
      const r = await supervise.run(id);
      if (r.state === "done") return null;
      if (r.state !== "running") return r.tail?.slice(-1)[0] ?? `it ${r.state}`;
    } catch (e) {
      if (e instanceof DoorError && (e.status === 401 || e.status === 403)) return null;
    }
  }
  return null;
}

const MODES: { id: "local" | "oidc"; title: string; words: string }[] = [
  { id: "local", title: "A password the desk keeps", words: "People are added on the People page." },
  { id: "oidc", title: "Your identity provider", words: "The desk is registered there already: its issuer, client id and secret." },
];

/**
 * How people sign in, changed. The desk and every part start again in the
 * new way, which signs this browser out, so the page loads again once the
 * desk answers it differently.
 */
export function SignInDialog({ caps, onClose }: { caps: Capabilities; onClose: () => void }) {
  const current = caps.desk.mode;
  const [d, setD] = useState<SigninDraft>({ ...NO_SIGNIN, mode: current === "local" ? "oidc" : "local" });
  const [state, setState] = useState<{ kind: "idle" } | { kind: "working"; since: number } | { kind: "failed"; why: string }>({ kind: "idle" });
  const ids = useId();
  const refused = signinRefusal(d, current);
  const set = (patch: Partial<SigninDraft>) => setD((was) => ({ ...was, ...patch }));

  const send = async () => {
    setState({ kind: "working", since: Date.now() });
    try {
      const run = await supervise.signin(signinBody(d));
      // the desk starts again in the new way, and this browser's session ends with the old one
      const failed = await signedOutOrEnded(run.id);
      if (failed) setState({ kind: "failed", why: failed });
      else location.reload();
    } catch (e) {
      setState({ kind: "failed", why: messageOf(e) });
    }
  };

  return (
    <Dialog
      title="How people sign in"
      icon="users"
      onClose={onClose}
      foot={
        <div className="row actions">
          {refused && <span className="warn">{refused}</span>}
          <span className="grow" />
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="button" disabled={refused !== null || state.kind === "working"} onClick={() => void send()}>
            Change it
          </button>
        </div>
      }
    >
      <div className="choices" role="radiogroup" aria-label="How people sign in">
        {MODES.map((m) => (
          <label key={m.id} className="radio-row">
            <input type="radio" name={`${ids}-mode`} checked={d.mode === m.id} disabled={m.id === current && m.id === "local"} onChange={() => set({ mode: m.id })} />
            <span>
              {m.title}
              {m.id === current && <span className="meta"> now</span>}
              <span className="meta"> · {m.words}</span>
            </span>
          </label>
        ))}
      </div>
      {d.mode === "local" && current !== "local" && (
        <div className="fields3">
          <div className="field">
            <label className="label" htmlFor={`${ids}-name`}>
              First person
            </label>
            <div className="input mono">
              <input id={`${ids}-name`} value={d.name} autoComplete="off" spellCheck={false} onChange={(e) => set({ name: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label className="label" htmlFor={`${ids}-password`}>
              Password
            </label>
            <div className="input">
              <input id={`${ids}-password`} type="password" value={d.password} autoComplete="new-password" onChange={(e) => set({ password: e.target.value })} />
            </div>
          </div>
          <p className="meta">May do everything. Added only where the desk keeps nobody with a password yet.</p>
        </div>
      )}
      {d.mode === "oidc" && (
        <div className="fields3">
          <div className="field">
            <label className="label" htmlFor={`${ids}-issuer`}>
              Issuer
            </label>
            <div className="input mono">
              <input id={`${ids}-issuer`} value={d.issuer} placeholder="https://auth.example.org/application/o/nils/" spellCheck={false} onChange={(e) => set({ issuer: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label className="label" htmlFor={`${ids}-client`}>
              Client id
            </label>
            <div className="input mono">
              <input id={`${ids}-client`} value={d.clientId} spellCheck={false} onChange={(e) => set({ clientId: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label className="label" htmlFor={`${ids}-secret`}>
              Client secret
            </label>
            <div className="input">
              <input id={`${ids}-secret`} type="password" value={d.secret} autoComplete="off" onChange={(e) => set({ secret: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label className="label" htmlFor={`${ids}-roles`}>
              Entitlements claim
            </label>
            <div className="input mono">
              <input id={`${ids}-roles`} value={d.roles} spellCheck={false} onChange={(e) => set({ roles: e.target.value })} />
            </div>
          </div>
        </div>
      )}
      <p className="meta">Every part starts again, and this browser signs in the new way.</p>
      {state.kind === "working" && <Wait phase="changing how people sign in" since={state.since} />}
      {state.kind === "failed" && <p className="warn">{state.why}</p>}
    </Dialog>
  );
}

/** Another folder for the engine's archives: its service written again, and the engine alone started again. */
export function BackupFolderDialog({ home, current, onClose, onDone }: { home: string | null; current: string | null; onClose: () => void; onDone: () => void }) {
  const [path, setPath] = useState(current ?? "");
  const run = useRun();
  const ids = useId();
  const refused = folderRefusal(path, home);
  const same = current !== null && path.trim() === current;
  const send = () =>
    run.start(
      "giving the engine the folder",
      () => supervise.backups(path.trim()),
      () => {
        onDone();
        return `The engine writes its archives to ${path.trim()} now.`;
      },
    );
  return (
    <Dialog
      title={current ? "Another backup folder" : "A backup folder"}
      icon="shield"
      onClose={onClose}
      foot={
        <div className="row actions">
          {refused && path.trim() && <span className="warn">{refused}</span>}
          <span className="grow" />
          <button type="button" className="button secondary" onClick={onClose}>
            {run.acting.kind === "done" ? "Close" : "Cancel"}
          </button>
          <button type="button" className="button" disabled={refused !== null || same || run.working || run.acting.kind === "done"} onClick={send}>
            Give the engine this folder
          </button>
        </div>
      }
    >
      <div className="field">
        <label className="label" htmlFor={`${ids}-dir`}>
          Folder
        </label>
        <PathField id={`${ids}-dir`} value={path} onChange={setPath} placeholder="/data/archives" browse />
        <span className="meta">Made where it is not there yet. The engine starts again; nothing else does.</span>
      </div>
      <Acted acting={run.acting} />
    </Dialog>
  );
}

/** The model server the stations use: Kvasir starts again with it, and takes its key. */
export function ModelServerDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [d, setD] = useState<ModelDraft>({ server: "", key: "", model: "" });
  const run = useRun();
  const ids = useId();
  const refused = modelRefusal(d);
  const send = () =>
    run.start(
      "starting Kvasir again with the model server",
      () => supervise.model(modelBody(d)),
      () => {
        onDone();
        return "Kvasir holds the server, and the stations use it.";
      },
    );
  return (
    <Dialog
      title="A model server"
      icon="gateway"
      onClose={onClose}
      foot={
        <div className="row actions">
          {refused && d.server.trim() && <span className="warn">{refused}</span>}
          <span className="grow" />
          <button type="button" className="button secondary" onClick={onClose}>
            {run.acting.kind === "done" ? "Close" : "Cancel"}
          </button>
          <button type="button" className="button" disabled={refused !== null || run.working || run.acting.kind === "done"} onClick={send}>
            Use this server
          </button>
        </div>
      }
    >
      <div className="fields3">
        <div className="field">
          <label className="label" htmlFor={`${ids}-server`}>
            Address
          </label>
          <div className="input mono">
            <input id={`${ids}-server`} value={d.server} placeholder="https://models.example.org/v1" spellCheck={false} onChange={(e) => setD({ ...d, server: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label className="label" htmlFor={`${ids}-key`}>
            Key
          </label>
          <div className="input">
            <input id={`${ids}-key`} type="password" value={d.key} autoComplete="off" onChange={(e) => setD({ ...d, key: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label className="label" htmlFor={`${ids}-model`}>
            Model
          </label>
          <div className="input mono">
            <input id={`${ids}-model`} value={d.model} placeholder="the server's default" spellCheck={false} onChange={(e) => setD({ ...d, model: e.target.value })} />
          </div>
        </div>
      </div>
      <p className="meta">Every part starts again. Kvasir seals the key; nothing else keeps it.</p>
      <Acted acting={run.acting} />
    </Dialog>
  );
}

/** An archive put back, said in full before it is pressed. */
export function RestoreDialog({ archive, onClose, onDone }: { archive: string; onClose: () => void; onDone: () => void }) {
  const run = useRun();
  const send = () =>
    run.start(
      `putting ${archive} back`,
      () => supervise.restore(archive),
      () => {
        onDone();
        return `${archive} is put back, and the engine is running again.`;
      },
    );
  return (
    <Dialog
      title="Restore"
      icon="restart"
      eyebrow={archive}
      onClose={onClose}
      foot={
        <div className="row actions">
          <span className="grow" />
          <button type="button" className="button secondary" onClick={onClose}>
            {run.acting.kind === "done" ? "Close" : "Cancel"}
          </button>
          <button type="button" className="button" disabled={run.working || run.acting.kind === "done"} onClick={send}>
            Put it back
          </button>
        </div>
      }
    >
      {restoreWords(archive).map((w, i) => (
        <p key={w} className={i === 0 ? "lede" : "meta"}>
          {w}
        </p>
      ))}
      <Acted acting={run.acting} />
    </Dialog>
  );
}
