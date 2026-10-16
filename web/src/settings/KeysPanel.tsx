// SPDX-License-Identifier: AGPL-3.0-only
// The keys, on Backups (record 55, ruling 35 (c); gate T31, steps 8.6 and
// 8.7): the key store by name, a key made from its passphrase (the pseudonym
// key again after a restore, or a handover's key), and a key taken away with
// its name typed. The passphrase lives in one password field until it is
// sent, is cleared as it goes, and goes only in that call's body. An engine
// without the doors keeps the printed command.

import { useEffect, useId, useState } from "react";
import type { Capabilities } from "../capabilities";
import { Command } from "../ui/Command";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { messageOf } from "./common";
import { keyNameRefusal, keys, keysSee, keysWork, passphraseRefusal, type KeyStore } from "./keys";

export function KeysPanel({ caps, pseudonymKey }: { caps: Capabilities; pseudonymKey: string }) {
  const [store, setStore] = useState<KeyStore | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const sees = keysSee(caps);
  const works = keysWork(caps);

  const read = () => {
    if (!sees) return;
    keys
      .list()
      .then((s) => {
        setStore(s);
        setFailed(null);
      })
      .catch((e: unknown) => setFailed(messageOf(e)));
  };
  useEffect(read, [sees]); // eslint-disable-line react-hooks/exhaustive-deps -- read once the person may

  if (!sees) {
    return (
      <section className="note caution db-key">
        <Icon name="key" size="lg" />
        <div className="note-body">
          <p className="note-lead">The key is in no backup</p>
          <p className="note-detail">
            The pseudonym key <span className="path">{pseudonymKey}</span> gives each subject the same code every time, and reads the identifiers the linkage store keeps; a registry restored without it can do neither. The key is
            the passphrase given when it was added. Keep that where you keep passwords, away from this machine, and this makes the key again from it:
          </p>
          <Command text={`nils key add ${pseudonymKey}`} />
        </div>
      </section>
    );
  }

  const missing = store !== null && !store.present;
  return (
    <section className="panel card db-keys">
      <div className="row card-head">
        <Icon name="key" size="lg" />
        <h2>Keys</h2>
        {store && (
          <span className={missing ? "tag blocked" : "tag ok"}>
            <Icon name={missing ? "alert" : "check"} />
            {missing ? "pseudonym key missing" : "pseudonym key here"}
          </span>
        )}
      </div>
      <p className="meta">In no backup. Keep each passphrase where you keep passwords.</p>
      {failed && <p className="warn">{failed}</p>}
      {store && (
        <div className="table-wrap">
          <table className="thin">
            <thead>
              <tr>
                <th>Key</th>
                <th className="num">Bytes</th>
                <th>Fingerprint</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {store.keys.length === 0 && (
                <tr>
                  <td colSpan={4} className="meta">
                    No key.
                  </td>
                </tr>
              )}
              {store.keys.map((k) => (
                <tr key={k.name}>
                  <td className="path">{k.name}</td>
                  <td className="num">{k.bytes}</td>
                  <td className="path">{k.fingerprint}</td>
                  <td>
                    {k.in_use ? (
                      <span className="tag">pseudonyms</span>
                    ) : (
                      works && (
                        <button type="button" className="button quiet small" aria-label={`Remove ${k.name}`} onClick={() => setRemoving(k.name)}>
                          Remove
                        </button>
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {works ? (
        <div className="row actions">
          <button type="button" className={missing ? "button" : "button secondary"} onClick={() => setMaking(true)}>
            {missing ? "Make the pseudonym key" : "Make a key"}
          </button>
        </div>
      ) : (
        <p className="meta">Making or removing a key is an admin&apos;s.</p>
      )}
      {said && <p className="ok-words">{said}</p>}
      {making && store && (
        <MakeKey
          store={store}
          onClose={() => setMaking(false)}
          onDone={(words) => {
            setMaking(false);
            setSaid(words);
            read();
          }}
        />
      )}
      {removing && (
        <RemoveKey
          name={removing}
          onClose={() => setRemoving(null)}
          onDone={(words) => {
            setRemoving(null);
            setSaid(words);
            read();
          }}
        />
      )}
    </section>
  );
}

/** A key made from its passphrase. The field is cleared the moment the call is sent. */
function MakeKey({ store, onClose, onDone }: { store: KeyStore; onClose: () => void; onDone: (words: string) => void }) {
  const [name, setName] = useState(store.present ? "" : store.pseudonym_key);
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const ids = useId();
  const taken = store.keys.some((k) => k.name === name.trim());
  const refusal = keyNameRefusal(name) ?? (taken ? "a name not in the store" : null) ?? passphraseRefusal(passphrase, store.max_bytes);
  const pseudonym = name.trim() === store.pseudonym_key;

  const send = () => {
    if (refusal !== null || busy) return;
    const given = passphrase;
    // let go of it before the call returns, whatever it says
    setPassphrase("");
    setBusy(true);
    setFailed(null);
    keys
      .add(name.trim(), given)
      .then((k) => onDone(`${k.name} made: ${k.bytes} bytes, fingerprint ${k.fingerprint}. ${capital(k.checked)}.`))
      .catch((e: unknown) => {
        setBusy(false);
        setFailed(messageOf(e));
      });
  };

  return (
    <Dialog
      title={pseudonym ? "Make the pseudonym key" : "Make a key"}
      icon="key"
      onClose={onClose}
      foot={
        <div className="row actions">
          <span className="meta grow">{refusal === null ? "Sent once; kept only in the key store." : `Needs ${refusal}.`}</span>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="button" disabled={busy || refusal !== null} onClick={send}>
            Make it
          </button>
        </div>
      }
    >
      {pseudonym && <p className="meta">Tried on the identifiers first; a wrong passphrase is refused.</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <div className="field">
          <label className="label" htmlFor={`${ids}-name`}>
            Name
          </label>
          <span className="input mono">
            <input id={`${ids}-name`} value={name} autoComplete="off" spellCheck={false} onChange={(e) => setName(e.target.value)} />
          </span>
        </div>
        <div className="field">
          <label className="label" htmlFor={`${ids}-pass`}>
            Passphrase
          </label>
          <span className="input mono">
            <input id={`${ids}-pass`} type="password" value={passphrase} autoComplete="off" spellCheck={false} onChange={(e) => setPassphrase(e.target.value)} />
          </span>
        </div>
      </form>
      {failed && <p className="warn">{failed}</p>}
    </Dialog>
  );
}

/** A key taken away, its name typed again. */
function RemoveKey({ name, onClose, onDone }: { name: string; onClose: () => void; onDone: (words: string) => void }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const ids = useId();
  const ready = typed.trim() === name;
  const send = () => {
    if (!ready || busy) return;
    setBusy(true);
    setFailed(null);
    keys
      .remove(name, typed.trim())
      .then(() => onDone(`${name} removed.`))
      .catch((e: unknown) => {
        setBusy(false);
        setFailed(messageOf(e));
      });
  };
  return (
    <Dialog
      title={`Remove ${name}`}
      icon="alert"
      onClose={onClose}
      foot={
        <div className="row actions">
          <span className="meta grow">{ready ? "Gone for good without its passphrase." : `Type ${name} to remove it.`}</span>
          <button type="button" className="button secondary" onClick={onClose}>
            Keep
          </button>
          <button type="button" className="button" disabled={busy || !ready} onClick={send}>
            Remove
          </button>
        </div>
      }
    >
      <p className="meta">Archives handed over under it open with its password only while it is here, or made again.</p>
      <div className="field">
        <label className="label" htmlFor={`${ids}-confirm`}>
          Type its name
        </label>
        <span className="input mono">
          <input id={`${ids}-confirm`} value={typed} autoComplete="off" spellCheck={false} onChange={(e) => setTyped(e.target.value)} />
        </span>
      </div>
      {failed && <p className="warn">{failed}</p>}
    </Dialog>
  );
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
