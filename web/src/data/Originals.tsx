// SPDX-License-Identifier: AGPL-3.0-only
// Acting on a dataset's originals (record 26): the two dialogs behind Vault
// it and Purge it on the Pseudonymisation page. Vaulting moves them into
// another place, the one the engine takes, and says what it leaves alone;
// purging removes them for good, so it says what the engine answered the act
// would reach, asks why, and asks for the dataset's name typed out. Neither
// dialog decides anything the engine decides: a refusal is shown in the
// engine's own words, and the act itself is a job like any other. Each has a
// body that holds nothing, so a test can draw it in any state.

import { useState } from "react";
import type { Capabilities } from "../capabilities";
import { sees } from "../grants";
import { messageOf } from "../settings/common";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import {
  confirmsName,
  movingWords,
  originals,
  originalsLines,
  purgeRefusal,
  roleNamed,
  vaultChoices,
  type Dataset,
  type OriginalsLook,
  type PlaceRow,
} from "./pseudonyms";

const n = (v: number) => v.toLocaleString("en-US");

/** What the foot says of the detail these acts are read at. */
function detailWords(caps: Capabilities): string {
  return sees(caps, "sensitive") ? "Run under your detail, sensitive." : "Acting on the originals needs detail sensitive; this account sees less, so the engine will refuse it.";
}

/* ---------------------------------------------------------------- Vault it */

export function VaultBody(props: {
  caps: Capabilities;
  dataset: Dataset;
  look: OriginalsLook | null;
  places: readonly PlaceRow[];
  into: string;
  why: string;
  sending: boolean;
  /** The engine's own refusal of the last try, and the role it named in it. */
  refusal: string | null;
  role: string | null;
  onInto: (v: string) => void;
  onWhy: (v: string) => void;
  onClose: () => void;
  onVault: () => void;
}) {
  const { caps, dataset: d, look, places, into, why, sending, refusal, role, onInto, onWhy, onClose, onVault } = props;
  const choices = vaultChoices(places, d.id, role);
  const ready = into.trim() !== "" && why.trim() !== "" && !sending;
  const foot = (
    <div className="row actions">
      <span className="meta grow">{detailWords(caps)}</span>
      <button type="button" className="button secondary" disabled={sending} onClick={onClose}>
        Cancel
      </button>
      <button type="button" className="button" disabled={!ready} onClick={onVault}>
        Vault it
      </button>
    </div>
  );
  return (
    <Dialog title={`Vault the originals of ${d.name}`} icon="lock" onClose={onClose} foot={foot}>
      <dl className="facts">
        <dt>what moves</dt>
        <dd>
          {movingWords(look)}
          {look !== null && look.held > 0 && <span className="meta"> · {n(look.held)} held until mapped move with them</span>}
        </dd>
        <dt>from</dt>
        <dd>
          <span className="path">{d.trees?.originals?.path ?? "derivatives/dcm-original"}</span>
        </dd>
      </dl>
      <div className="field">
        <label className="label" htmlFor="vault-into">
          Where it goes
        </label>
        {choices.length > 0 ? (
          <div className="input">
            <select id="vault-into" value={into} disabled={sending} onChange={(e) => onInto(e.target.value)}>
              <option value="">choose a place</option>
              {choices.map((p) => (
                <option key={p.id} value={p.name}>
                  {p.name} · {p.role} · {p.path}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="meta">{role ? `No place with the ${role} role is declared here; one is added on the Places page.` : "No other place is declared here; one is added on the Places page."}</p>
        )}
        <span className="meta">{role ? `The engine takes a place with the ${role} role for this, as it said when it refused.` : "The engine takes the place it accepts for this, and says which role it wants if it refuses."}</span>
      </div>
      <div className="field">
        <label className="label" htmlFor="vault-why">
          Why
        </label>
        <div className="input">
          <textarea id="vault-why" rows={2} value={why} disabled={sending} placeholder="why the originals are moved" onChange={(e) => onWhy(e.target.value)} />
        </div>
        <span className="meta">Recorded on the act, with who asked for it.</span>
      </div>
      {refusal && <p className="warn">{refusal}</p>}
      <div className="note">
        <Icon name="info" />
        <div className="note-body">
          <p className="note-lead">What this moves, and what it leaves</p>
          <p className="note-detail">
            It moves the originals out of the dataset and into the place above. The pseudonymised tree, the registry and every person's code are untouched: nothing that was read changes, and nothing is
            read again.
          </p>
        </div>
      </div>
    </Dialog>
  );
}

export function VaultDialog(props: { caps: Capabilities; dataset: Dataset; look: OriginalsLook | null; places: readonly PlaceRow[]; onClose: () => void; onQueued: (job: number, into: string) => void }) {
  const { caps, dataset, look, places, onClose, onQueued } = props;
  const [into, setInto] = useState("");
  const [why, setWhy] = useState("");
  const [sending, setSending] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  const vault = () => {
    setSending(true);
    setRefusal(null);
    originals
      .act(dataset.id, { do: "vault", into: into.trim(), why: why.trim() })
      .then((j) => onQueued(j.job, into.trim()))
      .catch((e: unknown) => {
        const words = messageOf(e);
        setSending(false);
        setRefusal(words);
        // the engine named the role it takes: keep to the places of that role, and let the choice be made again
        const named = roleNamed(words, [...new Set(places.map((p) => p.role))]);
        if (named !== null) {
          setRole(named);
          setInto("");
        }
      });
  };

  return (
    <VaultBody
      caps={caps}
      dataset={dataset}
      look={look}
      places={places}
      into={into}
      why={why}
      sending={sending}
      refusal={refusal}
      role={role}
      onInto={setInto}
      onWhy={setWhy}
      onClose={onClose}
      onVault={vault}
    />
  );
}

/* ---------------------------------------------------------------- Purge it */

export function PurgeBody(props: {
  caps: Capabilities;
  dataset: Dataset;
  look: OriginalsLook | null;
  typed: string;
  why: string;
  sending: boolean;
  /** The engine's own refusal of the last try. */
  refusal: string | null;
  onTyped: (v: string) => void;
  onWhy: (v: string) => void;
  onClose: () => void;
  onPurge: () => void;
}) {
  const { caps, dataset: d, look, typed, why, sending, refusal, onTyped, onWhy, onClose, onPurge } = props;
  const notReady = purgeRefusal(look);
  const ready = notReady === null && confirmsName(typed, d.name) && why.trim() !== "" && !sending;
  const foot = (
    <div className="row actions">
      <span className="meta grow">{detailWords(caps)}</span>
      <button type="button" className="button secondary" disabled={sending} onClick={onClose}>
        Cancel
      </button>
      <button type="button" className="button" disabled={!ready} onClick={onPurge}>
        Purge it
      </button>
    </div>
  );
  return (
    <Dialog title={`Purge the originals of ${d.name}`} icon="alert" onClose={onClose} foot={foot}>
      {look === null ? (
        <p className="meta">This engine has not said what is there to purge.</p>
      ) : (
        <dl className="facts">
          {originalsLines(look).map((l) => (
            <div key={l.label} className="facts-pair">
              <dt>{l.label}</dt>
              <dd className={l.tone === "caution" ? "warn" : undefined}>{l.words}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="note caution">
        <Icon name="alert" />
        <div className="note-body">
          <p className="note-lead">This cannot be undone</p>
          <p className="note-detail">
            Purging removes the only identified copy of those scans. The pseudonymised tree, the registry and every person's code stay as they are, and nothing brings the original files back. A held
            file's original is what a map would still release; once it is purged, a map releases nothing for it.
          </p>
        </div>
      </div>
      <div className="field">
        <label className="label" htmlFor="purge-why">
          Why
        </label>
        <div className="input">
          <textarea id="purge-why" rows={2} value={why} disabled={sending} placeholder="why the originals are removed" onChange={(e) => onWhy(e.target.value)} />
        </div>
        <span className="meta">Recorded on the act, with who asked for it.</span>
      </div>
      <div className="field">
        <label className="label" htmlFor="purge-confirm">
          Type {d.name} to confirm
        </label>
        <div className="input mono">
          <input id="purge-confirm" value={typed} spellCheck={false} disabled={sending} placeholder={d.name} onChange={(e) => onTyped(e.target.value)} />
        </div>
      </div>
      {notReady && <p className="warn">{notReady}</p>}
      {refusal && <p className="warn">{refusal}</p>}
    </Dialog>
  );
}

export function PurgeDialog(props: { caps: Capabilities; dataset: Dataset; look: OriginalsLook | null; onClose: () => void; onQueued: (job: number) => void }) {
  const { caps, dataset, look, onClose, onQueued } = props;
  const [typed, setTyped] = useState("");
  const [why, setWhy] = useState("");
  const [sending, setSending] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  const purge = () => {
    setSending(true);
    setRefusal(null);
    originals
      .act(dataset.id, { do: "purge", why: why.trim() })
      .then((j) => onQueued(j.job))
      .catch((e: unknown) => {
        setSending(false);
        setRefusal(messageOf(e));
      });
  };

  return (
    <PurgeBody caps={caps} dataset={dataset} look={look} typed={typed} why={why} sending={sending} refusal={refusal} onTyped={setTyped} onWhy={setWhy} onClose={onClose} onPurge={purge} />
  );
}
