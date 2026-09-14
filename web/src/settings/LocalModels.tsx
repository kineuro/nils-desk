// SPDX-License-Identifier: AGPL-3.0-only
// Local models on the Kvasir page (record 23, slice M; record 24), for an
// admin and where Kvasir serves them: where new downloads go and the room
// there, the Hugging Face token, and every model Kvasir downloads with its
// state, how far it is and its path, to pause, resume or remove. Where the
// install runs llama.cpp for Kvasir, a downloaded GGUF model starts and stops
// from its row, one at a time, and says how it serves and whether Kvasir
// admitted it; a downloaded model also shows the commands a model server runs
// it with. While a model is queued or downloading, or loads into llama.cpp,
// the list is read again every few seconds, until none is.

import { useEffect, useId, useRef, useState } from "react";
import { Command } from "../ui/Command";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { Acted, Health, messageOf, useActing } from "./common";
import { DownloadModel } from "./DownloadModel";
import type { Admission } from "./gateway";
import { kvasir, localRefusalOf, type AdmissionRecord, type Backend, type LocalModel, type LocalRun, type LocalServe, type LocalStatus } from "./kvasir";
import {
  actionsOf,
  barOf,
  emptyWords,
  freeWords,
  introWords,
  locationRefusal,
  modelTag,
  movedWords,
  NO_COMMAND,
  NOT_STARTABLE_NOTE,
  POLL_MS,
  progressWords,
  queuedWords,
  removedWords,
  removeWords,
  replaceWords,
  revisionWords,
  runActionsOf,
  runningBesides,
  runsKey,
  runtimeLabel,
  runtimeLine,
  runtimeTag,
  runTag,
  SELF_NOTE,
  sentence,
  SERVE_NOTE,
  servedAdmission,
  servingWords,
  START_POLL_MS,
  started,
  startedWords,
  starting,
  startRefusalWords,
  STAY_NOTE,
  stopFirstWords,
  stoppedWords,
  TOKEN_NOTE,
  tokenReady,
  tokenTag,
  UNREACHABLE,
  underWay,
} from "./local";

/** Kvasir's words for a refusal, as a sentence. */
const refused = (e: unknown) => new Error(sentence(messageOf(e)));

export function LocalModels(props: {
  /** Kvasir's backends as the page read them, for whether a serving model is admitted. */
  backends?: Backend[] | null;
  admissions?: AdmissionRecord[] | null;
  now?: number;
  /** Called when a model starts, stops or changes how it runs, so the page reads its backends again. */
  onRun?: () => void;
}) {
  const { backends = null, admissions = null, now = Date.now(), onRun } = props;
  const [status, setStatus] = useState<LocalStatus | null>(null);
  const [missed, setMissed] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [moving, setMoving] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);
  const [replacing, setReplacing] = useState<number | null>(null);
  const acting = useActing();
  // each read and each answer counts one, so a read still on its way when a fresher answer lands is let go
  const round = useRef(0);
  // how the models ran at the last read, so a change there reads the page's backends again
  const runs = useRef<string | null>(null);
  const told = useRef(onRun);
  useEffect(() => {
    told.current = onRun;
  });

  const load = () => {
    const mine = ++round.current;
    kvasir.local
      .status()
      .then((s) => {
        if (mine !== round.current) return;
        // null where Kvasir does not serve local models, and the section stays out
        setStatus(s);
        setMissed(null);
        const key = s ? runsKey(s.models) : null;
        if (runs.current !== null && key !== runs.current) told.current?.();
        runs.current = key;
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

  // while a model loads into llama.cpp the list is read again sooner, until it serves or does not start
  const loading = status !== null && starting(status.models);
  useEffect(() => {
    if (!loading) return;
    const t = setInterval(load, START_POLL_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load only sets what it read
  }, [loading]);

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

  const start = (m: LocalModel) => {
    setSaid(null);
    acting.act(`starting ${m.repo}`, async () => {
      try {
        put(await kvasir.local.start(m.id));
      } catch (e) {
        load();
        const r = localRefusalOf(e);
        throw new Error(r ? startRefusalWords(r) : sentence(messageOf(e)));
      }
      // the model it stopped changed too, and the page's backends follow
      load();
      told.current?.();
      return startedWords(m);
    });
  };

  const stop = (m: LocalModel) => {
    setSaid(null);
    acting.act(`stopping ${m.repo}`, async () => {
      try {
        put(await kvasir.local.stop(m.id));
      } catch (e) {
        load();
        throw refused(e);
      }
      load();
      told.current?.();
      return stoppedWords(m);
    });
  };

  const quiet = acting.acting.kind === "done" && acting.acting.words === "";
  const toRemove = removing === null ? null : (status.models.find((m) => m.id === removing) ?? null);
  const toStart = replacing === null ? null : (status.models.find((m) => m.id === replacing) ?? null);
  const stopping = toStart ? runningBesides(status.models, toStart.id) : null;
  const runtime = status.runtime;

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
      <p className="meta">{introWords(runtime)}</p>
      {runtime && (
        <div className="local-runtime">
          <Icon name="chip" />
          <span className="path">{runtimeLine(runtime)}</span>
          <Health {...runtimeTag(runtime)} />
        </div>
      )}
      {runtime && !runtime.reachable && <p className="warn">{UNREACHABLE}</p>}
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
        <p className="meta">{emptyWords(runtime)}</p>
      ) : (
        <ul className="local-list">
          {status.models.map((m) => (
            <LocalModelRow
              key={m.id}
              model={m}
              busy={acting.working}
              runtime={Boolean(runtime)}
              admission={m.run ? servedAdmission(m.run, backends, admissions, now) : null}
              onPause={() => step(m, `pausing ${m.repo}`, kvasir.local.pause)}
              onResume={() => step(m, `resuming ${m.repo}`, kvasir.local.resume)}
              onRemove={() => {
                setSaid(null);
                setRemoving(m.id);
              }}
              onStart={() => {
                setSaid(null);
                // llama.cpp runs one model at a time: a start that stops another asks first
                if (runningBesides(status.models, m.id)) setReplacing(m.id);
                else start(m);
              }}
              onStop={() => stop(m)}
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
      {toStart && stopping && (
        <StartInstead
          model={toStart}
          running={stopping}
          onClose={() => setReplacing(null)}
          onStart={() => {
            setReplacing(null);
            start(toStart);
          }}
        />
      )}
    </section>
  );
}

/**
 * One model Kvasir downloads: its name, revision and commit, its state and how
 * far it is, its path and what may be done with it; where Kvasir starts it on
 * llama.cpp, how it runs and whether Kvasir admitted it; and once downloaded
 * the commands a model server runs it with.
 */
export function LocalModelRow(props: {
  model: LocalModel;
  busy?: boolean;
  /** Whether the install runs llama.cpp for Kvasir. */
  runtime?: boolean;
  /** Whether Kvasir admitted the model, where it serves. */
  admission?: Admission | null;
  onPause: () => void;
  onResume: () => void;
  onRemove: () => void;
  onStart?: () => void;
  onStop?: () => void;
}) {
  const { model: m, busy = false, runtime = false, admission = null, onPause, onResume, onRemove, onStart, onStop } = props;
  const tag = modelTag(m.state);
  const bar = barOf(m);
  const run = m.run ?? null;
  return (
    <li className="local-row">
      <div className="local-head">
        <div className="local-name">
          <span className="path">{m.repo}</span>
          <span className="meta">{revisionWords(m)}</span>
        </div>
        <Health tone={tag.tone} words={tag.words} />
        {run && <Health {...runTag(run)} />}
        <span className="local-actions">
          {runActionsOf(m).map((a) =>
            a === "start" ? (
              <button key={a} type="button" className="button small" disabled={busy || !onStart} onClick={onStart}>
                Start
              </button>
            ) : (
              <button key={a} type="button" className="button secondary small" disabled={busy || !onStop} onClick={onStop}>
                Stop
              </button>
            ),
          )}
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
      {run && <RunLines run={run} admission={admission} />}
      {m.state === "done" &&
        (m.startable === true ? (
          m.serve.length > 0 && (
            <details className="serve-self">
              <summary>Or run it yourself</summary>
              <div className="serve">
                <ServeList serve={m.serve} />
                <p className="meta">{SELF_NOTE}</p>
              </div>
            </details>
          )
        ) : (
          <div className="serve">
            {runtime && m.serve.length > 0 && <span className="label">Or run it yourself</span>}
            {m.serve.length > 0 && <ServeList serve={m.serve} />}
            <p className="meta">{m.serve.length > 0 ? (runtime ? NOT_STARTABLE_NOTE : SERVE_NOTE) : NO_COMMAND}</p>
          </div>
        ))}
    </li>
  );
}

/** A model's run on llama.cpp: loading, serving with its context, slots and admission, or why it did not start with what llama.cpp logged. A stopped model says so in its tag alone. */
function RunLines({ run, admission }: { run: LocalRun; admission: Admission | null }) {
  if (run.state === "starting") return <p className="meta">{`Loading into llama.cpp as ${run.model}.`}</p>;
  if (run.state === "serving")
    return (
      <div className="local-run">
        <span className="meta">{servingWords(run)}</span>
        {admission && <Health tone={admission.tone} words={admission.words} />}
        {admission?.detail && <span className="meta">{admission.detail}</span>}
      </div>
    );
  if (run.state !== "failed") return null;
  const log = Array.isArray(run.log) ? run.log : [];
  return (
    <>
      <p className="warn">{sentence(run.error ?? "") || "It did not start, and llama.cpp said nothing more."}</p>
      {log.length > 0 && (
        <details className="failure-raw local-log">
          <summary>What llama.cpp logged</summary>
          <pre>{log.join("\n")}</pre>
        </details>
      )}
    </>
  );
}

/** The commands a model server runs a download with, each under its label and to copy. */
function ServeList({ serve }: { serve: LocalServe[] }) {
  return (
    <dl className="serve-list">
      {serve.map((s, i) => (
        <div key={`${i}-${s.runtime}`} className="serve-row">
          <dt>{runtimeLabel(s.runtime)}</dt>
          <dd>
            <Command text={s.command} />
          </dd>
        </div>
      ))}
    </dl>
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

/** A model removed, once the dialog has said what goes with it; a model llama.cpp loads or serves is stopped first. */
function RemoveLocal({ model, onClose, onDone }: { model: LocalModel; onClose: () => void; onDone: (words: string) => void }) {
  const removing = useActing();
  const held = started(model);
  const remove = () =>
    removing.act(`removing ${model.repo}`, async () => {
      try {
        await kvasir.local.remove(model.id);
      } catch (e) {
        // Kvasir refuses to remove a model it has started, until it is stopped
        if (localRefusalOf(e)?.status === 409) throw new Error(stopFirstWords(model));
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
        <button type="button" className="button" disabled={removing.working || held} onClick={remove}>
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
      {held ? <p>{stopFirstWords(model)}</p> : removeWords(model).map((w) => <p key={w}>{w}</p>)}
    </Dialog>
  );
}

/** Before a start that stops the model llama.cpp loads or serves now: it runs one model at a time. */
function StartInstead({ model, running, onClose, onStart }: { model: LocalModel; running: LocalModel; onClose: () => void; onStart: () => void }) {
  const foot = (
    <div className="row actions">
      <button type="button" className="button" onClick={onStart}>
        Start it
      </button>
      <button type="button" className="button secondary" onClick={onClose}>
        Cancel
      </button>
    </div>
  );
  return (
    <Dialog title={`Start ${model.repo}?`} icon="chip" onClose={onClose} foot={foot}>
      <p>{replaceWords(model, running)}</p>
    </Dialog>
  );
}
