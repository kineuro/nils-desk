// SPDX-License-Identifier: AGPL-3.0-only
// A handover's password, shown once (record 55, ruling 35 (c); gate T31, step
// 13.4). The engine derives it from the key and never stores it; the desk
// reads it in one call, shows it in this dialog alone, and lets go of it when
// the person says it is copied. It is in no address, no browser storage and
// no log; the dialog does not close until the person confirms the copy.

import { useEffect, useId, useState } from "react";
import { messageOf } from "../settings/common";
import { keys } from "../settings/keys";
import { useCopy } from "../ui/clipboard";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";

export function PasswordOnce({ keyName, onClose }: { keyName: string; onClose: () => void }) {
  const [password, setPassword] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [since] = useState(() => Date.now());
  const [copiedIt, setCopiedIt] = useState(false);
  const [state, copy] = useCopy();
  const ids = useId();

  useEffect(() => {
    let live = true;
    keys
      .password(keyName)
      .then((r) => live && setPassword(r.password))
      .catch((e: unknown) => live && setFailed(messageOf(e)));
    return () => {
      live = false;
      setPassword(null);
    };
  }, [keyName]);

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
      eyebrow={`Key ${keyName}`}
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
          <p className="meta">Shown once, never stored. Give it to the receiver apart from the archives.</p>
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
