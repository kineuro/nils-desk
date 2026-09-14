// SPDX-License-Identifier: AGPL-3.0-only
// Local models on the Kvasir page (record 23, slice M), for an admin and
// where Kvasir serves them: where new downloads go and the room there, the
// Hugging Face token, and every model Kvasir downloads with its state, how
// far it is and its path, to pause, resume or remove. A downloaded model
// shows the commands a model server runs it with, since Kvasir runs no
// model. While a model is queued or downloading, the list is read again
// every few seconds, until none is.

import { useEffect, useId, useRef, useState } from "react";
import { Command } from "../ui/Command";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { Acted, Health, messageOf, useActing } from "./common";
import { DownloadModel } from "./DownloadModel";
import { kvasir, type LocalModel, type LocalStatus } from "./kvasir";
import {
  actionsOf,
  barOf,
  freeWords,
  locationRefusal,
  modelTag,
  movedWords,
  NO_COMMAND,
  POLL_MS,
  progressWords,
  queuedWords,
  removedWords,
  removeWords,
  revisionWords,
  runtimeLabel,
  sentence,
  SERVE_NOTE,
  STAY_NOTE,
  TOKEN_NOTE,
  tokenReady,
  tokenTag,
  underWay,
} from "./local";

/** Kvasir's words for a refusal, as a sentence. */
const refused = (e: unknown) => new Error(sentence(messageOf(e)));

export function LocalModels() {
  const [status, setStatus] = useState<LocalStatus | null>(null);
  const [missed, setMissed] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [moving, setMoving] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);
  const acting = useActing();
  // each read and each answer counts one, so a read still on its way when a fresher answer lands is let go
  const round = useRef(0);

  const load = () => {
    const mine = ++round.current;
    kvasir.local
      .status()
      .then((s) => {
        if (mine !== round.current) return;
        // null where Kvasir does not serve local models, and the section stays out
        setStatus(s);
        setMissed(null);
      })
      .catch((e: unknown) => {
        // below admin, or Kvasir not answering: a section never read stays out, and one read keeps what it showed
        if (mine === round.current) setMissed(messageOf(e));
      });
  };

  /** What a door answered, in place of what was read. */
  const take = (next: LocalStatus | ((s: LocalStatus) => LocalStatus)) => {
    round.current += 1;
    setStatus((s) => (typeof next === "function" ? (s ? next(s) : s) : next));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read once when the page opens; what is done here reads again
  }, []);

  // while a model is queued or downloading the list is read again, and no longer once none is
  const busy = status !== null && underWay(status.models);
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load only sets what it read
  }, [busy]);

  if (status === null) return null;

  const put = (m: LocalModel) => take((s) => ({ ...s, models: s.models.map((x) => (x.id === m.id ? m : x)) }));
  const step = (m: LocalModel, phase: string, door: (id: number) => Promise<LocalModel>) => {
    setSaid(null);
    acting.act(phase, async () => {
      try {
        put(await door(m.id));
        return "";
      } catch (e) {
        load();
        throw refused(e);
      }
    });
  };

  const quiet = acting.acting.kind === "done" && acting.acting.words === "";
  const toRemove = removing === null ? null : (status.models.find((m) => m.id === removing) ?? null);

  return (
    <section className="stack local">
      <div className="section-head rule-top">
        <h2>Local models</h2>
        <button
          type="button"
          className="button small"
          onClick={() => {
            setSaid(null);
            setDownloading(true);
          }}
        >
          <Icon name="plus" />
          Download a model
        </button>
      </div>
      <p className="meta">Models Kvasir downloads from the Hugging Face Hub, for a model server of yours to run.</p>
      {said && <p className="ok-words">{said}</p>}
      {missed && <p className="warn">{`The list could not be read again: ${missed}`}</p>}

      <div className="pair">
        <div className="panel card">
          <div className="row card-head">
            <Icon name="disk" size="lg" />
            <h2>Where downloads go</h2>
            <button
              type="button"
              className="button secondary small"
              onClick={() => {
                setSaid(null);
                setMoving(true);
              }}
            >
              Change
            </button>
          </div>
          <p className="path">{status.location}</p>
          <p className="meta">{freeWords(status.free_bytes)}</p>
        </div>
        <div className="panel card">
          <div className="row card-head">
            <Icon name="key" size="lg" />
            <h2>Hugging Face token</h2>
            <Health {...tokenTag(status.token)} />
          </div>
          <p className="meta">{TOKEN_NOTE}</p>
          <TokenForm set={status.token} onDone={(token) => take((s) => ({ ...s, token }))} />
        </div>
      </div>

      {status.models.length === 0 ? (
        <p className="meta">No local model yet. Download one, then start a model server on it.</p>
      ) : (
        <ul className="local-list">
          {status.models.map((m) => (
            <LocalModelRow
              key={m.id}
              model={m}
              busy={acting.working}
              onPause={() => step(m, `pausing ${m.repo}`, kvasir.local.pause)}
              onResume={() => step(m, `resuming ${m.repo}`, kvasir.local.resume)}
              onRemove={() => {
                setSaid(null);
                setRemoving(m.id);
              }}
            />
          ))}
        </ul>
      )}
      {!quiet && <Acted acting={acting.acting} />}

      {downloading && (
        <DownloadModel
          token={status.token}
          free={status.free_bytes}
          onClose={() => setDownloading(false)}
          onDone={(m) => {
            setDownloading(false);
            take((s) => ({ ...s, models: [...s.models.filter((x) => x.id !== m.id), m] }));
            setSaid(queuedWords(m));
            load();
          }}
        />
      )}
      {moving && (
        <LocationDialog
          current={status.location}
          onClose={() => setMoving(false)}
          onDone={(s) => {
            setMoving(false);
            take(s);
            setSaid(`${movedWords(s.location)} ${STAY_NOTE}`);
          }}
        />
      )}
      {toRemove && (
        <RemoveLocal
          model={toRemove}
          onClose={() => setRemoving(null)}
          onDone={(words) => {
            setRemoving(null);
            take((s) => ({ ...s, models: s.models.filter((x) => x.id !== toRemove.id) }));
            setSaid(words);
            load();
          }}
        />
      )}
    </section>
  );
}

/** One model Kvasir downloads: its name, revision and commit, its state and how far it is, its path, what may be done with it, and once downloaded the commands a model server runs it with. */
export function LocalModelRow(props: { model: LocalModel; busy?: boolean; onPause: () => void; onResume: () => void; onRemove: () => void }) {
  const { model: m, busy = false, onPause, onResume, onRemove } = props;
  const tag = modelTag(m.state);
  const bar = barOf(m);
  return (
    <li className="local-row">
      <div className="local-head">
        <div className="local-name">
          <span className="path">{m.repo}</span>
          <span className="meta">{revisionWords(m)}</span>
        </div>
        <Health tone={tag.tone} words={tag.words} />
        <span className="local-actions">
          {actionsOf(m.state).map((a) =>
            a === "remove" ? (
              <button key={a} type="button" className="button quiet small" onClick={onRemove}>
                Remove
              </button>
            ) : (
              <button key={a} type="button" className="button secondary small" disabled={busy} onClick={a === "pause" ? onPause : onResume}>
                {a === "pause" ? "Pause" : "Resume"}
              </button>
            ),
          )}
        </span>
      </div>
      {bar !== null ? (
        <div className="local-progress">
          <span
            className={m.state === "paused" ? "local-track paused" : "local-track"}
            role="progressbar"
            aria-label={`How much of ${m.repo} is downloaded`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={bar}
          >
            <i style={{ width: `${bar}%` }} />
          </span>
          <span className="meta num">{progressWords(m)}</span>
        </div>
      ) : (
        <p className="meta">{progressWords(m)}</p>
      )}
      {m.state === "failed" && m.error && <p className="warn">{sentence(m.error)}</p>}
      <p className="meta path">{m.path}</p>
      {m.state === "done" && (
        <div className="serve">
          {m.serve.length > 0 && (
            <dl className="serve-list">
              {m.serve.map((s, i) => (
                <div key={`${i}-${s.runtime}`} className="serve-row">
                  <dt>{runtimeLabel(s.runtime)}</dt>
                  <dd>
                    <Command text={s.command} />
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <p className="meta">{m.serve.length > 0 ? SERVE_NOTE : NO_COMMAND}</p>
        </div>
      )}
    </li>
  );
}

/** The Hugging Face token: set from a password field, or cleared, and never shown. */
function TokenForm({ set, onDone }: { set: boolean; onDone: (token: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");
  const saving = useActing();
  const ready = tokenReady(token) && !saving.working;

  const store = () =>
    saving.act("storing the Hugging Face token", async () => {
      try {
        await kvasir.local.setToken(token.trim());
      } catch (e) {
        throw refused(e);
      }
      setToken("");
      setOpen(false);
      onDone(true);
      return "The Hugging Face token is set, and shown to nobody.";
    });

  const clear = () =>
    saving.act("clearing the Hugging Face token", async () => {
      try {
        await kvasir.local.clearToken();
      } catch (e) {
        throw refused(e);
      }
      onDone(false);
      return "The Hugging Face token is cleared.";
    });

  return (
    <div className="key-form">
      {open ? (
        <>
          <div className="input mono grow">
            <input
              type="password"
              autoComplete="off"
              aria-label="The Hugging Face token"
              value={token}
              disabled={saving.working}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && ready) store();
              }}
            />
          </div>
          <button type="button" className="button small" disabled={!ready} onClick={store}>
            Set
          </button>
          <button
            type="button"
            className="button quiet small"
            onClick={() => {
              setOpen(false);
              setToken("");
            }}
          >
            Cancel
          </button>
        </>
      ) : (
        <>
          <button type="button" className="button secondary small" disabled={saving.working} onClick={() => setOpen(true)}>
            {set ? "Set another token" : "Set a token"}
          </button>
          {set && (
            <button type="button" className="button quiet small" disabled={saving.working} onClick={clear}>
              Clear
            </button>
          )}
        </>
      )}
      <Acted acting={saving.acting} />
    </div>
  );
}

/** Where new downloads go, changed: Kvasir creates the folder and checks it can write there, or says why not. */
function LocationDialog({ current, onClose, onDone }: { current: string; onClose: () => void; onDone: (s: LocalStatus) => void }) {
  const id = useId();
  const [path, setPath] = useState(current);
  const saving = useActing();
  const typed = path.trim();
  const why = locationRefusal(typed, current);
  const ready = why === null && !saving.working;

  const save = () =>
    saving.act(`checking that Kvasir can write to ${typed}`, async () => {
      try {
        onDone(await kvasir.local.setLocation(typed));
      } catch (e) {
        throw refused(e);
      }
      return "";
    });

  const quiet = saving.acting.kind === "done" && saving.acting.words === "";
  const foot = (
    <>
      {why && <p className="meta">{why}</p>}
      {!quiet && <Acted acting={saving.acting} />}
      <div className="row actions">
        <button type="button" className="button" disabled={!ready} onClick={save}>
          Save
        </button>
        <button type="button" className="button secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
    </>
  );

  return (
    <Dialog title="Where downloads go" icon="disk" onClose={onClose} foot={foot}>
      <div className="field">
        <label className="label" htmlFor={`${id}-path`}>
          The folder new downloads go into
        </label>
        <div className="input mono">
          <input
            id={`${id}-path`}
            value={path}
            placeholder="/srv/models"
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            disabled={saving.working}
            onChange={(e) => setPath(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && ready) save();
            }}
          />
        </div>
        <span className="meta">An absolute path on the machine Kvasir runs on, such as /srv/models. Kvasir creates the folder where it is missing, and checks that it can write there.</span>
      </div>
      <div className="note">
        <Icon name="info" />
        <div className="note-body">
          <p className="note-detail">{STAY_NOTE}</p>
        </div>
      </div>
    </Dialog>
  );
}

/** A model removed, once the dialog has said what goes with it. */
function RemoveLocal({ model, onClose, onDone }: { model: LocalModel; onClose: () => void; onDone: (words: string) => void }) {
  const removing = useActing();
  const remove = () =>
    removing.act(`removing ${model.repo}`, async () => {
      try {
        await kvasir.local.remove(model.id);
      } catch (e) {
        throw refused(e);
      }
      onDone(removedWords(model));
      return "";
    });
  const quiet = removing.acting.kind === "done" && removing.acting.words === "";

  const foot = (
    <>
      {!quiet && <Acted acting={removing.acting} />}
      <div className="row actions">
        <button type="button" className="button" disabled={removing.working} onClick={remove}>
          Remove it
        </button>
        <button type="button" className="button secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
    </>
  );

  return (
    <Dialog title={`Remove ${model.repo}?`} icon="alert" onClose={onClose} foot={foot}>
      {removeWords(model).map((w) => (
        <p key={w}>{w}</p>
      ))}
    </Dialog>
  );
}
