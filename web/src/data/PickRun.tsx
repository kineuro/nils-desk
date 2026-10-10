// SPDX-License-Identifier: AGPL-3.0-only
// The "Pick main scans" button: one press queues the run, and its job is said.

import { useState } from "react";
import type { Capabilities } from "../capabilities";
import { messageOf } from "../settings/common";
import { mayPick, pickRun, pickWords } from "./pickRun";

export function PickRun({ caps, of, onQueued }: { caps: Capabilities; of: { cohort: string } | { dataset: string }; onQueued?: (words: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ words: string; failed: boolean } | null>(null);
  if (!mayPick(caps)) return null;
  const go = () => {
    setBusy(true);
    setSaid(null);
    pickRun.start(of).then(
      (q) => {
        setBusy(false);
        setSaid({ words: pickWords(q), failed: false });
        onQueued?.(pickWords(q));
      },
      (e: unknown) => {
        setBusy(false);
        setSaid({ words: messageOf(e), failed: true });
      },
    );
  };
  return (
    <span className="row pick-run">
      <button type="button" className="button secondary" disabled={busy} onClick={go}>
        Pick main scans
      </button>
      {said && <span className={said.failed ? "warn" : "meta"}>{said.words}</span>}
    </span>
  );
}
