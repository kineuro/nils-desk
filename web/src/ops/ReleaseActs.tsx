// SPDX-License-Identifier: AGPL-3.0-only
// Hand over and withdraw, from a release's row (record 55 H2, round 5). A
// handover packs the release's newest version into archives in an exchange
// place, encrypted by default under a password of its own that the person
// receiving it is given apart (record 55, ruling 35 (c)); a withdrawal records
// why, and the release stays listed, marked.

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
import { ownPasswords, plainRefusal, typedRefusal, typeRefusal, handovers, type Closing } from "./handovers";
import { jobLogHref, logsOffered } from "./logs";
import { exchangePlaces, handoverOut, keyRefusal, passwordCommand, withdrawCommand, withdrawRefusal } from "./releaseActs";

/** What a queued job came to, said on the page, with a link to its log where the person may read it. */
export interface Queued {
  words: string;
  job: number;
}

/**
 * Hand over a release: the exchange place, then how the archives are kept closed (record 55, ruling 35 (c)). With an
 * engine that gives each handover its own password, encryption is on by default and turning it off asks why; the
 * password is made by NILS, or typed by the release's maker or a holder of handover-password:work, in two password
 * fields cleared as the call is sent. Shown later, once, from the handover's row. An older engine keeps the key and the
 * printed command.
 */
export function HandoverDialog(props: { caps: Capabilities; release: Release; onClose: () => void; onDone: (q: Queued) => void }) {
  return ownPasswords(props.caps) ? <HandoverOwn {...props} /> : <HandoverByKey {...props} />;
}

function usePlaces(caps: Capabilities, r: Release) {
  const places = useKept(placesKept);
  useEffect(() => {
    if (served(caps, "GET /api/places")) placesKept.ensure();
  }, [caps]);
  const exchanges = exchangePlaces(places.value?.places ?? null);
  const [placeId, setPlaceId] = useState<number | null>(null);
  const place = exchanges.find((p) => p.id === placeId) ?? exchanges[0] ?? null;
  const out = place ? handoverOut(place, r) : null;
  return { places, exchanges, place, out, setPlaceId };
}

function Into({ ids, at }: { ids: string; at: ReturnType<typeof usePlaces> }) {
  const { places, exchanges, place, out, setPlaceId } = at;
  return (
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
  );
}

function HandoverOwn({ caps, release: r, onClose, onDone }: { caps: Capabilities; release: Release; onClose: () => void; onDone: (q: Queued) => void }) {
  const at = usePlaces(caps, r);
  const [encrypt, setEncrypt] = useState(true);
  const [how, setHow] = useState<"made" | "typed">("made");
  const [typed, setTyped] = useState("");
  const [again, setAgain] = useState("");
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const ids = useId();
  const typing = typeRefusal(caps, r);
  const refusal =
    at.place === null ? "an exchange place, made on Settings, Places" : !encrypt ? plainRefusal(why) : how === "typed" ? (typing ?? typedRefusal(typed, again)) : null;

  const send = () => {
    if (refusal !== null || at.out === null || busy !== null) return;
    const closing: Closing = !encrypt ? { encrypt: false, why: why.trim() } : how === "typed" ? { encrypt: true, password: "typed", typed } : { encrypt: true, password: "made" };
    // let go of the typed password before the call returns, whatever it says
    setTyped("");
    setAgain("");
    setBusy(Date.now());
    setFailed(null);
    const out = at.out;
    handovers
      .queue(r.name, out, closing)
      .then((j) =>
        onDone({
          job: j.job,
          words: `Handover of ${r.name} version ${r.version} is queued as job ${j.job}, into ${out}${encrypt ? "; its password is on its row once it is done" : ", unencrypted"}.`,
        }),
      )
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
          <span className="meta grow">{refusal === null ? (encrypt ? "Read back once written." : "Unencrypted: whoever holds them can open them.") : `Needs ${refusal}.`}</span>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="button" disabled={busy !== null || refusal !== null} onClick={send}>
            Hand over
          </button>
        </div>
      }
    >
      <p className="meta">Its newest version is packed into archives, in an exchange place apart from the tree.</p>
      <Into ids={ids} at={at} />
      <label className="choice" htmlFor={`${ids}-encrypt`}>
        <input id={`${ids}-encrypt`} type="checkbox" checked={encrypt} onChange={(e) => setEncrypt(e.target.checked)} />
        <span>Encrypt the archives</span>
      </label>
      {encrypt ? (
        <div className="field" role="radiogroup" aria-label="Password">
          <span className="label">Password</span>
          <label className="choice" htmlFor={`${ids}-made`}>
            <input id={`${ids}-made`} type="radio" name={`${ids}-how`} checked={how === "made"} onChange={() => setHow("made")} />
            <span>Made by NILS, this handover&apos;s own</span>
          </label>
          <label className="choice" htmlFor={`${ids}-typed`} title={typing ? `Needs ${typing}.` : undefined}>
            <input id={`${ids}-typed`} type="radio" name={`${ids}-how`} checked={how === "typed"} disabled={typing !== null} onChange={() => setHow("typed")} />
            <span>I type one</span>
          </label>
          {how === "typed" && typing === null && (
            <>
              <div className="field">
                <label className="label" htmlFor={`${ids}-pw`}>
                  Its password
                </label>
                <span className="input mono">
                  <input id={`${ids}-pw`} type="password" value={typed} autoComplete="off" spellCheck={false} onChange={(e) => setTyped(e.target.value)} />
                </span>
              </div>
              <div className="field">
                <label className="label" htmlFor={`${ids}-again`}>
                  Again
                </label>
                <span className="input mono">
                  <input id={`${ids}-again`} type="password" value={again} autoComplete="off" spellCheck={false} onChange={(e) => setAgain(e.target.value)} />
                </span>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="field">
          <label className="label" htmlFor={`${ids}-why`}>
            Why unencrypted
          </label>
          <span className="input">
            <input id={`${ids}-why`} value={why} autoComplete="off" onChange={(e) => setWhy(e.target.value)} />
          </span>
          <span className="meta">Kept on the handover and in the audit.</span>
        </div>
      )}
      {busy !== null && <Wait phase="queueing the handover" since={busy} />}
      {failed && <p className="warn">{failed}</p>}
    </Dialog>
  );
}

/** An engine from before each handover had its own password: the key, and the command that gives the receiver its password. */
function HandoverByKey({ caps, release: r, onClose, onDone }: { caps: Capabilities; release: Release; onClose: () => void; onDone: (q: Queued) => void }) {
  const at = usePlaces(caps, r);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const ids = useId();
  const refusal = served(caps, "POST /api/handovers") ? (at.place === null ? "an exchange place, made on Settings, Places" : keyRefusal(key)) : "an engine with the handover door";

  const send = () => {
    if (refusal !== null || at.out === null) return;
    const out = at.out;
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
      <Into ids={ids} at={at} />
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
