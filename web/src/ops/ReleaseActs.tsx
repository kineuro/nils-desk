// SPDX-License-Identifier: AGPL-3.0-only
// Hand over and withdraw, from a release's row (record 55 H2, round 5). A
// handover packs the release's newest version into encrypted archives in an
// exchange place, under a key whose password the person receiving it is given
// apart; a withdrawal records why, and the release stays listed, marked.

import { useEffect, useId, useState } from "react";
import type { Capabilities } from "../capabilities";
import type { Release } from "../data/cohorts";
import { door as served } from "../deployment";
import { placesKept } from "../objects/kept";
import { Command } from "../ui/Command";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { useKept } from "../ui/kept";
import { Wait } from "../ui/Wait";
import { ops } from "./client";
import { jobLogHref, logsOffered } from "./logs";
import { exchangePlaces, handoverOut, keyRefusal, passwordCommand, withdrawCommand, withdrawRefusal } from "./releaseActs";

/** What a queued job came to, said on the page, with a link to its log where the person may read it. */
export interface Queued {
  words: string;
  job: number;
}

/** Hand over a release: the exchange place, the key, and the command that gives the receiver the password. */
export function HandoverDialog({ caps, release: r, onClose, onDone }: { caps: Capabilities; release: Release; onClose: () => void; onDone: (q: Queued) => void }) {
  const places = useKept(placesKept);
  useEffect(() => {
    if (served(caps, "GET /api/places")) placesKept.ensure();
  }, [caps]);
  const exchanges = exchangePlaces(places.value?.places ?? null);
  const [placeId, setPlaceId] = useState<number | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const ids = useId();
  const place = exchanges.find((p) => p.id === placeId) ?? exchanges[0] ?? null;
  const out = place ? handoverOut(place, r) : null;
  const refusal = served(caps, "POST /api/handovers") ? (place === null ? "an exchange place, made on Settings, Places" : keyRefusal(key)) : "an engine with the handover door";

  const send = () => {
    if (refusal !== null || out === null) return;
    setBusy(Date.now());
    setFailed(null);
    ops
      .handover(r.name, out, key.trim())
      .then((j) => onDone({ job: j.job, words: `Handover of ${r.name} version ${r.version} is queued as job ${j.job}, into ${out}.` }))
      .catch((e: Error) => {
        setBusy(null);
        setFailed(e.message);
      });
  };

  return (
    <Dialog
      title={`Hand over ${r.name}`}
      icon="release"
      eyebrow={`Version ${r.version}`}
      onClose={onClose}
      foot={
        <div className="row actions">
          <span className="meta grow">{refusal === null ? "The archives are read back once written." : `Needs ${refusal}.`}</span>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="button" disabled={busy !== null || refusal !== null} onClick={send}>
            Hand over
          </button>
        </div>
      }
    >
      <p className="meta">Its newest version is packed into encrypted archives, in an exchange place apart from the tree.</p>
      <div className="field">
        <label className="label" htmlFor={`${ids}-place`}>
          Into
        </label>
        {exchanges.length > 0 ? (
          <>
            <span className="input">
              <select id={`${ids}-place`} value={place?.id ?? ""} onChange={(e) => setPlaceId(Number(e.target.value))}>
                {exchanges.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </span>
            {out && <span className="meta path handover-out">{out}</span>}
          </>
        ) : (
          <p className="meta">{places.value === null ? "Reading the places." : "No exchange place yet. An admin makes one on Settings, Places."}</p>
        )}
      </div>
      <div className="field">
        <label className="label" htmlFor={`${ids}-key`}>
          Key
        </label>
        <span className="input mono">
          <input id={`${ids}-key`} value={key} autoComplete="off" spellCheck={false} placeholder="its name in the registry's key store" onChange={(e) => setKey(e.target.value)} />
        </span>
      </div>
      {key.trim() && keyRefusal(key) === null && (
        <div className="note">
          <Icon name="key" />
          <div className="note-body">
            <p className="note-detail">The person receiving it needs the password. It is never stored; an admin gives it to them apart, from:</p>
            <Command text={passwordCommand(key)} />
          </div>
        </div>
      )}
      {busy !== null && <Wait phase="queueing the handover" since={busy} />}
      {failed && <p className="warn">{failed}</p>}
    </Dialog>
  );
}

/** Withdraw one version: why, which stays on the release; nothing is deleted. */
export function WithdrawDialog({ release: r, onClose, onDone }: { release: Release; onClose: () => void; onDone: (q: Queued) => void }) {
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const ids = useId();
  const refusal = withdrawRefusal(why);
  const send = () => {
    if (refusal !== null) return;
    setBusy(Date.now());
    setFailed(null);
    ops
      .enqueue(withdrawCommand(r, why), r.name)
      .then((j) => onDone({ job: j.job, words: `Withdrawal of ${r.name} version ${r.version} is queued as job ${j.job}.` }))
      .catch((e: Error) => {
        setBusy(null);
        setFailed(e.message);
      });
  };
  return (
    <Dialog
      title={`Withdraw ${r.name}`}
      icon="alert"
      eyebrow={`Version ${r.version}`}
      onClose={onClose}
      foot={
        <div className="row actions">
          <span className="meta grow">{refusal === null ? "It stays listed, marked withdrawn." : `Needs ${refusal}.`}</span>
          <button type="button" className="button secondary" onClick={onClose}>
            Keep
          </button>
          <button type="button" className="button" disabled={busy !== null || refusal !== null} onClick={send}>
            Withdraw
          </button>
        </div>
      }
    >
      <p className="meta">A release is never removed. Its files stay where they were written; whoever uses them reads that it was withdrawn and why.</p>
      <div className="field">
        <label className="label" htmlFor={`${ids}-why`}>
          Why
        </label>
        <span className="input">
          <input id={`${ids}-why`} value={why} autoComplete="off" onChange={(e) => setWhy(e.target.value)} />
        </span>
      </div>
      {busy !== null && <Wait phase="queueing the withdrawal" since={busy} />}
      {failed && <p className="warn">{failed}</p>}
    </Dialog>
  );
}

/** What a queued hand over or withdrawal came to, with its log where the person may read it. */
export function QueuedWords({ caps, queued }: { caps: Capabilities; queued: Queued }) {
  return (
    <p className="ok-words">
      {queued.words}
      {logsOffered(caps) && (
        <>
          {" "}
          <a href={jobLogHref(queued.job)}>Its log</a>
        </>
      )}
    </p>
  );
}
