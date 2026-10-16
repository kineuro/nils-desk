// SPDX-License-Identifier: AGPL-3.0-only
// Uninstall NILS, at the foot of Settings > Setup (gate T31, walkthrough
// step 1.9): one button where a supervisor keeps this install, and a dialog
// that says what goes and what stays, asks the directory's name typed, and
// hands the work to the supervisor, which goes on after this desk is gone.

import { useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { DoorError } from "../ask/client";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import { messageOf } from "./common";
import { supervise, type Install, type UninstallPreview } from "./supervise";
import { goneWords, planLines, typedRight, uninstallOffered, uninstallRefusal, type Leave } from "./uninstall";

export function UninstallSection({ caps, install }: { caps: Capabilities; install: Install | null }) {
  const [open, setOpen] = useState(false);
  if (!uninstallOffered(caps, install)) return null;
  return (
    <div className="section-head rule-top setup-row uninstall-row">
      <h2>Uninstall</h2>
      <span className="meta grow">Remove NILS from this machine, keeping the data or not.</span>
      <button type="button" className="button secondary small" onClick={() => setOpen(true)}>
        Uninstall NILS
      </button>
      {open && <UninstallDialog onClose={() => setOpen(false)} />}
    </div>
  );
}

type Read = { kind: "reading"; since: number } | { kind: "older" } | { kind: "failed"; why: string } | { kind: "ready"; p: UninstallPreview };

export function UninstallDialog({ onClose }: { onClose: () => void }) {
  const [read, setRead] = useState<Read>(() => ({ kind: "reading", since: Date.now() }));
  const [leave, setLeave] = useState<Leave>("nils");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  useEffect(() => {
    supervise.uninstallPreview().then(
      (p) => setRead({ kind: "ready", p }),
      (e: unknown) => setRead(e instanceof DoorError && e.status === 404 ? { kind: "older" } : { kind: "failed", why: messageOf(e) }),
    );
  }, []);
  const p = read.kind === "ready" ? read.p : null;
  const refusal = p ? uninstallRefusal(p, leave) : null;
  const go = () => {
    if (!p) return;
    setBusy(Date.now());
    setWhy(null);
    supervise.uninstall(leave, typed.trim()).then(
      () => setGone(goneWords(p, leave)),
      (e: unknown) => {
        setBusy(null);
        setWhy(messageOf(e));
      },
    );
  };
  const foot = gone ? (
    <div className="row actions">
      <button type="button" className="button secondary" onClick={onClose}>
        Close
      </button>
    </div>
  ) : (
    <div className="row actions">
      {busy !== null && <Wait phase="starting the uninstall" since={busy} />}
      {(why ?? refusal) && <span className="warn">{why ?? refusal}</span>}
      <button type="button" className="button secondary" onClick={onClose}>
        Cancel
      </button>
      <button type="button" className="button" disabled={!p || !typedRight(p, typed) || refusal !== null || busy !== null} onClick={go}>
        Uninstall
      </button>
    </div>
  );
  return (
    <Dialog title="Uninstall NILS" icon="alert" eyebrow={p?.dir} onClose={onClose} foot={foot}>
      {read.kind === "reading" && <Wait phase="reading what would go" since={read.since} />}
      {read.kind === "older" && <p className="warn">This supervisor cannot uninstall yet. Update every part on Parts first.</p>}
      {read.kind === "failed" && <p className="warn">{read.why}</p>}
      {gone && <p className="ok-words">{gone}</p>}
      {p && !gone && (
        <>
          <div className="choices">
            <label className="radio-row">
              <input type="radio" name="leave" checked={leave === "nils"} onChange={() => setLeave("nils")} />
              <span>
                <b>NILS, keeping the data</b>
                <span className="meta">the services, the programs and the packs go; the registry, its key, the backups and the choices made stay for the next setup</span>
              </span>
            </label>
            <label className="radio-row">
              <input type="radio" name="leave" checked={leave === "everything"} onChange={() => setLeave("everything")} />
              <span>
                <b>Everything</b>
                <span className="meta">all of that and {p.dir} itself</span>
              </span>
            </label>
          </div>
          {leave === "everything" && (
            <div className="note caution">
              <Icon name="alert" />
              <div className="note-body">
                <p className="note-detail">This cannot be undone. Without the registry&apos;s key the same subject can never be given the same code again.</p>
              </div>
            </div>
          )}
          <details className="more-fields">
            <summary>What goes and what stays</summary>
            <pre className="more-body uninstall-plan">{planLines(p, leave).join("\n")}</pre>
          </details>
          <label className="field">
            <span className="label">Type {p.name} to uninstall</span>
            <span className="input mono">
              <input value={typed} spellCheck={false} autoComplete="off" onChange={(e) => setTyped(e.target.value)} aria-label="The install's directory name" />
            </span>
          </label>
        </>
      )}
    </Dialog>
  );
}
