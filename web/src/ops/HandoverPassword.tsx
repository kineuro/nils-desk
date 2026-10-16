// SPDX-License-Identifier: AGPL-3.0-only
// A handover's password, shown once (record 55, ruling 35 (c); gate T31, step
// 13.4), and a release's handovers, each with how it is kept closed. Each
// handover has a password of its own; the engine answers it to a holder of
// handover-password:see or the release's maker, and the desk shows it in this
// dialog alone and lets go of it when the person says it is copied. It is in
// no address, no browser storage and no log; the dialog does not close until
// the person confirms the copy.

import { useEffect, useId, useState } from "react";
import type { Release } from "../data/cohorts";
import { messageOf } from "../settings/common";
import { useCopy } from "../ui/clipboard";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import { closedWords, handovers, type Handover } from "./handovers";

export function PasswordOnce({ handover, onClose }: { handover: number; onClose: () => void }) {
  const [password, setPassword] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [since] = useState(() => Date.now());
  const [copiedIt, setCopiedIt] = useState(false);
  const [state, copy] = useCopy();
  const ids = useId();

  useEffect(() => {
    let live = true;
    handovers
      .password(handover)
      .then((r) => live && setPassword(r.password))
      .catch((e: unknown) => live && setFailed(messageOf(e)));
    return () => {
      live = false;
      setPassword(null);
    };
  }, [handover]);

  // shown, it goes only once the person says it is copied; refused or not yet read, it closes as any dialog
  const close = () => {
    if (password !== null && !copiedIt) return;
    setPassword(null);
    onClose();
  };

  return (
    <Dialog
      title="The receiver's password"
      icon="key"
      eyebrow={`Handover ${handover}`}
      onClose={close}
      foot={
        <div className="row actions">
          <span className="meta grow">{password === null ? "" : copiedIt ? "Gone once closed." : "Copy it, then confirm."}</span>
          <button type="button" className="button" disabled={password !== null && !copiedIt} onClick={close}>
            Done
          </button>
        </div>
      }
    >
      {password === null && failed === null && <Wait phase="reading the password" since={since} />}
      {failed && <p className="warn">{failed}</p>}
      {password !== null && (
        <>
          <p className="meta">Shown once. Give it to the receiver apart from the archives.</p>
          <span className="chip command handover-password">
            <code aria-label="The password">{password}</code>
            <button type="button" className="chip-copy" aria-label={state === "copied" ? "Copied" : state === "failed" ? "Could not copy" : "Copy the password"} onClick={() => copy(password)}>
              <Icon name={state === "copied" ? "check" : state === "failed" ? "alert" : "copy"} />
            </button>
          </span>
          <label className="choice" htmlFor={`${ids}-copied`}>
            <input id={`${ids}-copied`} type="checkbox" checked={copiedIt} onChange={(e) => setCopiedIt(e.target.checked)} />
            <span>I copied it</span>
          </label>
        </>
      )}
    </Dialog>
  );
}

/** A release version's handovers: where each went, how it is kept closed, and its password for whoever may show it. */
export function HandoversDialog({ release: r, onClose }: { release: Pick<Release, "name" | "version">; onClose: () => void }) {
  const [rows, setRows] = useState<Handover[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [showing, setShowing] = useState<number | null>(null);
  const [since] = useState(() => Date.now());
  useEffect(() => {
    handovers
      .list(r.name)
      .then((l) => setRows(l.handovers.filter((h) => h.version === r.version)))
      .catch((e: unknown) => setFailed(messageOf(e)));
  }, [r.name, r.version]);
  return (
    <Dialog
      title={`Handovers of ${r.name}`}
      icon="release"
      eyebrow={`Version ${r.version}`}
      onClose={onClose}
      foot={
        <div className="row actions">
          <span className="grow" />
          <button type="button" className="button secondary" onClick={onClose}>
            Close
          </button>
        </div>
      }
    >
      {rows === null && failed === null && <Wait phase="reading the handovers" since={since} />}
      {failed && <p className="warn">{failed}</p>}
      {rows !== null && rows.length === 0 && <p className="meta">Not handed over.</p>}
      {rows !== null && rows.length > 0 && (
        <div className="table-wrap">
          <table className="thin">
            <thead>
              <tr>
                <th className="num">#</th>
                <th>Into</th>
                <th>Kept closed</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((h) => (
                <tr key={h.id}>
                  <td className="num">{h.id}</td>
                  <td className="path">{h.root}</td>
                  <td className={h.encrypted ? "meta" : "warn"}>{closedWords(h)}</td>
                  <td>
                    {h.may_show && (
                      <button type="button" className="button quiet small" aria-label={`Show the password of handover ${h.id}`} onClick={() => setShowing(h.id)}>
                        Show the password
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showing !== null && <PasswordOnce handover={showing} onClose={() => setShowing(null)} />}
    </Dialog>
  );
}
