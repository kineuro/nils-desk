// SPDX-License-Identifier: AGPL-3.0-only
// Sort again, from a rules row on Parts (gate T31, walkthrough step 9.5): a
// rules release changes what the engine sorts from now on, and the scans
// already sorted keep the answers they have until they are sorted again. The
// dialog says what the sort will judge before it runs, and queues the
// engine's `classify` over every scan, as Read new files does for a read.

import { useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { objects } from "../objects/client";
import { ops } from "../ops/client";
import type { Queued } from "../ops/ReleaseActs";
import { Dialog } from "../ui/Dialog";
import { Hint } from "../ui/Hint";
import { Wait } from "../ui/Wait";
import { messageOf } from "./common";
import { SORT_AGAIN_HINT, scansOf, sortAgainCommand, sortAgainWords, type Scans, type SortUnder } from "./sorting";

export function SortAgainDialog({ caps, under, onClose, onDone }: { caps: Capabilities; under: SortUnder; onClose: () => void; onDone: (q: Queued) => void }) {
  // null while the summary is read, and for ever where the engine does not give one
  const [scans, setScans] = useState<Scans | null | "reading">(served(caps, "GET /api/summary") ? "reading" : null);
  const [since] = useState(() => Date.now());
  const [busy, setBusy] = useState<number | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  // the versions in force: every pack the engine loaded, and the one this row is about
  const inForce = [...(caps.engine?.packs ?? []).map((p) => p.version), ...(under.version ? [under.version] : [])];
  const key = inForce.join(",");
  useEffect(() => {
    if (!served(caps, "GET /api/summary")) return;
    let alive = true;
    objects.summary().then(
      (s) => alive && setScans(scansOf(s, inForce)),
      () => alive && setScans(null),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read once, against the versions in force as it opens
  }, [key]);

  const { command, name } = sortAgainCommand(under.pack, under.version);
  const send = () => {
    setBusy(Date.now());
    setFailed(null);
    ops
      .enqueue(command, name)
      .then((j) => onDone({ job: j.job, words: `Sorting every scan again under ${under.title}${under.version ? ` ${under.version}` : ""} is queued as job ${j.job}.` }))
      .catch((e: unknown) => {
        setBusy(null);
        setFailed(messageOf(e));
      });
  };
  const lines = scans === "reading" ? [] : sortAgainWords(under.title, under.version, scans);
  return (
    <Dialog
      title="Sort again"
      icon="branch"
      eyebrow={under.version ? `${under.title} ${under.version}` : under.title}
      onClose={onClose}
      foot={
        <div className="row actions">
          <span className="grow" />
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="button" disabled={busy !== null || scans === "reading"} onClick={send}>
            Sort again
          </button>
        </div>
      }
    >
      {scans === "reading" && <Wait phase="counting the scans" since={since} />}
      {lines.map((l, i) => (
        <p key={l} className={i === 0 ? "lede" : "meta"}>
          {l}
          {i === 0 && <Hint text={SORT_AGAIN_HINT} />}
        </p>
      ))}
      {busy !== null && <Wait phase="queueing the sort" since={busy} />}
      {failed && <p className="warn">{failed}</p>}
    </Dialog>
  );
}
