// SPDX-License-Identifier: AGPL-3.0-only
// Acting on a dataset's originals (record 27, R6): the two dialogs behind
// Vault it and Purge it on the Pseudonymisation page, as counts rather than
// paragraphs. Vaulting moves them into another place, one of those the engine
// takes rather than any place at all, and says what it leaves alone; purging
// shows what the engine answered the act would reach as four numbers and a
// forecast, each reason it could be held back on its own line with its own
// count, then the reason for it and the dataset's name typed out. Neither
// dialog decides anything the engine decides: a refusal is shown in the
// engine's own words, the purge waits while the engine says it is not ready,
// and the act itself is a job like any other. Neither holds a person's answers
// either: the page holds them, so that a read under an open dialog cannot lose
// a choice. Each has a body that holds nothing, so a test can draw it in any
// state.

import type { Capabilities } from "../capabilities";
import { sees } from "../grants";
import { messageOf } from "../settings/common";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import {
  bytesWords,
  movingWords,
  originals,
  purgeAsked,
  purgeReady,
  purgeRefusal,
  purgeRefused,
  vaultAsked,
  vaultChoices,
  vaultReady,
  vaultRefused,
  VAULT_ROLE,
  type Dataset,
  type OriginalsLook,
  type PlaceRow,
  type PurgeAsk,
  type VaultAsk,
  type VaultFrom,
} from "./pseudonyms";

const n = (v: number) => v.toLocaleString("en-US");

/** A fact as its value: what it is in small letters, then the value alone. */
type Cell = { k: string; v: string };

function Values({ cells }: { cells: Cell[] }) {
  return (
    <div className="values">
      {cells.map((c) => (
        <div key={c.k}>
          <span className="k">{c.k}</span>
          <span className="v">{c.v}</span>
        </div>
      ))}
    </div>
  );
}

/** The sentence that used to stand beside a value, closed until it is asked for. */
function Says({ head, children }: { head: string; children: string }) {
  return (
    <details className="says">
      <summary>{head}</summary>
      <p>{children}</p>
    </details>
  );
}

/** What the foot says of how far into a record these acts are read. */
function detailWords(caps: Capabilities): string {
  return sees(caps, "sensitive")
    ? "Run as someone cleared to see identifiers, and recorded as yours."
    : "Acting on the originals means reading identifiers, and you are not cleared to; the engine will refuse it.";
}

/** The roles the places themselves carry, for reading the role out of a refusal. */
function rolesOf(places: readonly PlaceRow[]): string[] {
  return [...new Set(places.map((p) => p.role).filter((r): r is string => typeof r === "string"))];
}

/**
 * What could hold a purge back, each with its own count. The engine decides,
 * not this list: a reason stands only while the engine says it is not ready,
 * and any reason it counts for itself, files that changed since they were
 * read among them, is in its own words under these lines.
 */
function heldBack(look: OriginalsLook): { key: string; count: number; words: string; meta: string }[] {
  return [
    {
      key: "map",
      count: look.held,
      words: look.held === 1 ? "file waits for a map" : "files wait for a map",
      meta: "Their originals are what a map would still release.",
    },
    {
      key: "copy",
      count: look.unverified,
      words: look.unverified === 1 ? "file has no checked copy" : "files have no checked copy",
      meta: "No copy the engine checked stands for them in dcm-anon.",
    },
  ];
}

/* ---------------------------------------------------------------- Vault it */

export function VaultBody(props: {
  caps: Capabilities;
  dataset: Dataset;
  look: OriginalsLook | null;
  places: readonly PlaceRow[];
  /** Every dataset the page read, so that no place inside one of them is offered for a vault the engine would refuse. */
  datasets: readonly VaultFrom[];
  /** What the dialog has been told, held by the page. */
  ask: VaultAsk;
  onAsk: (ask: VaultAsk) => void;
  onClose: () => void;
  onVault: () => void;
}) {
  const { caps, dataset: d, look, places, datasets, ask, onAsk, onClose, onVault } = props;
  const choices = vaultChoices(places, d, ask.role, datasets);
  const wanted = ask.role ?? VAULT_ROLE;
  const ready = vaultReady(ask);
  const foot = (
    <div className="row actions">
      <span className="meta grow">{detailWords(caps)}</span>
      <button type="button" className="button secondary" disabled={ask.sending} onClick={onClose}>
        Cancel
      </button>
      <button type="button" className="button" disabled={!ready} onClick={onVault}>
        Vault it
      </button>
    </div>
  );
  return (
    <Dialog title={`Vault the originals of ${d.name}`} icon="lock" onClose={onClose} foot={foot}>
      <Values
        cells={[
          { k: "what moves", v: movingWords(look) },
          { k: "from", v: d.trees?.originals?.path ?? "derivatives/dcm-original" },
          ...(look !== null && look.held > 0 ? [{ k: "held until mapped", v: `${n(look.held)} move with them` }] : []),
        ]}
      />
      <div className="field">
        <label className="label" htmlFor="vault-into">
          Where it goes
        </label>
        {choices.length > 0 ? (
          <div className="input">
            <select id="vault-into" value={ask.into} disabled={ask.sending} onChange={(e) => onAsk({ ...ask, into: e.target.value })}>
              <option value="">choose a place</option>
              {choices.map((p) => (
                <option key={p.id} value={p.name}>
                  {p.name} · {p.role} · {p.path}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="meta">
            No place with the {wanted} role stands outside every dataset; a place declared inside one, this dataset or another, is under a source place the engine will not write into. One outside every
            dataset's folder and trees is added on the Places page.
          </p>
        )}
        <span className="meta">
          {ask.role
            ? `The engine takes a place with the ${ask.role} role for this, as it said when it refused, and never one inside a dataset.`
            : `The engine takes a place with the ${VAULT_ROLE} role for this, and never one inside a dataset, this one or another.`}
        </span>
      </div>
      <div className="field">
        <label className="label" htmlFor="vault-why">
          Why
        </label>
        <div className="input">
          <textarea id="vault-why" rows={2} value={ask.why} disabled={ask.sending} placeholder="why the originals are moved" onChange={(e) => onAsk({ ...ask, why: e.target.value })} />
        </div>
        <span className="meta">Recorded on the act, with who asked for it.</span>
      </div>
      {ask.refusal && <p className="warn">{ask.refusal}</p>}
      <Says head="What this leaves untouched">
        It moves the originals out of the dataset and into the place above. The pseudonymised tree, the registry and every person's code are untouched: nothing that was read changes, and nothing is read
        again.
      </Says>
    </Dialog>
  );
}

export function VaultDialog(props: {
  caps: Capabilities;
  dataset: Dataset;
  look: OriginalsLook | null;
  places: readonly PlaceRow[];
  datasets: readonly VaultFrom[];
  ask: VaultAsk;
  onAsk: (ask: VaultAsk) => void;
  onClose: () => void;
  onQueued: (job: number, into: string) => void;
}) {
  const { caps, dataset, look, places, datasets, ask, onAsk, onClose, onQueued } = props;

  const vault = () => {
    const body = vaultAsked(ask);
    onAsk({ ...ask, sending: true, refusal: null });
    originals
      .act(dataset.id, body)
      .then((j) => onQueued(j.job, body.into))
      // the engine named the role it takes: keep to the places of that role, and let the choice be made again
      .catch((e: unknown) => onAsk(vaultRefused(ask, messageOf(e), rolesOf(places))));
  };

  return <VaultBody caps={caps} dataset={dataset} look={look} places={places} datasets={datasets} ask={ask} onAsk={onAsk} onClose={onClose} onVault={vault} />;
}

/* ---------------------------------------------------------------- Purge it */

export function PurgeBody(props: {
  caps: Capabilities;
  dataset: Dataset;
  look: OriginalsLook | null;
  /** What the dialog has been told, held by the page. */
  ask: PurgeAsk;
  onAsk: (ask: PurgeAsk) => void;
  onClose: () => void;
  onPurge: () => void;
}) {
  const { caps, dataset: d, look, ask, onAsk, onClose, onPurge } = props;
  const notReady = purgeRefusal(look);
  const ready = purgeReady(ask, d.name, look);
  const foot = (
    <div className="row actions">
      <span className="meta grow">{detailWords(caps)}</span>
      <button type="button" className="button secondary" disabled={ask.sending} onClick={onClose}>
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
        <>
          <Values
            cells={[
              { k: "files", v: n(look.files) },
              { k: "size", v: bytesWords(look.bytes) },
              { k: "copy checked", v: n(look.verified) },
              { k: "held until mapped", v: n(look.held) },
            ]}
          />
          <span className="meta">What the engine last saw: a forecast, not a promise.</span>
          <div className="whys">
            {heldBack(look).map((r) => (
              <div key={r.key} className={!look.ready && r.count > 0 ? "why stands" : "why"}>
                <b className="num">{n(r.count)}</b>
                <span>{r.words}</span>
                <span className="meta">{r.meta}</span>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="note caution">
        <Icon name="alert" />
        <div className="note-body">
          <p className="note-lead">This cannot be undone</p>
          <p className="note-detail">
            Purging removes the only identified copy of those scans, and nothing brings those files back. A held file's original is what a map would still release; once it is purged, a map releases
            nothing for it.
          </p>
        </div>
      </div>
      <Says head="What this leaves untouched">
        The pseudonymised tree, the registry and every person's code stay as they are: nothing that was read changes, and nothing is read again. The original files alone go, and they go for good.
      </Says>
      <div className="field">
        <label className="label" htmlFor="purge-why">
          Why
        </label>
        <div className="input">
          <textarea id="purge-why" rows={2} value={ask.why} disabled={ask.sending} placeholder="why the originals are removed" onChange={(e) => onAsk({ ...ask, why: e.target.value })} />
        </div>
        <span className="meta">Recorded on the act, with who asked for it.</span>
      </div>
      <div className="field">
        <label className="label" htmlFor="purge-confirm">
          Type {d.name} to confirm
        </label>
        <div className="input mono">
          <input id="purge-confirm" value={ask.typed} spellCheck={false} disabled={ask.sending} placeholder={d.name} onChange={(e) => onAsk({ ...ask, typed: e.target.value })} />
        </div>
      </div>
      {notReady && <p className="warn">{notReady}</p>}
      {ask.refusal && <p className="warn">{ask.refusal}</p>}
    </Dialog>
  );
}

export function PurgeDialog(props: {
  caps: Capabilities;
  dataset: Dataset;
  look: OriginalsLook | null;
  ask: PurgeAsk;
  onAsk: (ask: PurgeAsk) => void;
  onClose: () => void;
  onQueued: (job: number) => void;
}) {
  const { caps, dataset, look, ask, onAsk, onClose, onQueued } = props;

  const purge = () => {
    const body = purgeAsked(ask);
    onAsk({ ...ask, sending: true, refusal: null });
    originals
      .act(dataset.id, body)
      .then((j) => onQueued(j.job))
      .catch((e: unknown) => onAsk(purgeRefused(ask, messageOf(e))));
  };

  return <PurgeBody caps={caps} dataset={dataset} look={look} ask={ask} onAsk={onAsk} onClose={onClose} onPurge={purge} />;
}
