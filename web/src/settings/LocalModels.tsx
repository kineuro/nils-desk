// SPDX-License-Identifier: AGPL-3.0-only
// The models Kvasir downloads (record 23, slice M; records 24 and 25), among
// the Kvasir page's models for a person with Kvasir: Work, where Kvasir serves
// them. Each is a card with its state, how far it is and what may be done with
// it: paused, resumed or removed, and where the install runs llama.cpp for
// Kvasir, a downloaded GGUF model started and stopped, one at a time, saying
// whether Kvasir admitted it and the stations it answers. One line under the
// cards holds the machine's card and llama.cpp, where downloads go and the
// Hugging Face token. While a model is queued or downloading, or loads into
// llama.cpp, the list is read again every few seconds, until none is.

import { useEffect, useId, useRef, useState } from "react";
import { Command } from "../ui/Command";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { CardTags, MarkSquare, MoreMenu } from "./cards";
import { Acted, messageOf, useActing } from "./common";
import { machineWords, MARKS, plainly, type Admission } from "./gateway";
import { kvasir, localRefusalOf, type LocalModel, type LocalRun, type LocalServe, type LocalStatus } from "./kvasir";
import {
  actionsOf,
  barOf,
  localMeta,
  localName,
  localTag,
  locationRefusal,
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
  roomLine,
  runActionsOf,
  runningBesides,
  runsKey,
  runtimeLabel,
  runtimeLine,
  runtimeTag,
  SELF_NOTE,
  sentence,
  SERVE_NOTE,
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
  underWay,
} from "./local";
import type { Install } from "./supervise";

/** A refusal for want of a grant in plain words, and any other in Kvasir's words as a sentence. */
function refused(e: unknown): Error {
  const plain = plainly(e);
  return plain !== e ? (plain as Error) : new Error(sentence(messageOf(e)));
}

/**
 * The models Kvasir downloads, read where `enabled` (Kvasir: Work), with what
 * may be done with them and the dialogs that do it. `onRun` is told when a
 * model starts, stops or changes how it runs, so the page reads its backends
 * again; `onSaid` is told what was done.
 */
export function useLocalModels(props: { enabled: boolean; onRun?: () => void; onSaid: (words: string | null) => void }) {
  const { enabled } = props;
  /** undefined until read, and where it is not read; null where Kvasir serves no local models. */
  const [status, setStatus] = useState<LocalStatus | null | undefined>(undefined);
  const [missed, setMissed] = useState<string | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);
  const [replacing, setReplacing] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  const [tokening, setTokening] = useState(false);
  const acting = useActing();
  // each read and each answer counts one, so a read still on its way when a fresher answer lands is let go
  const round = useRef(0);
  // how the models ran at the last read, so a change there reads the page's backends again
  const runs = useRef<string | null>(null);
  const told = useRef(props);
  useEffect(() => {
    told.current = props;
  });
  const say = (words: string | null) => told.current.onSaid(words);
  const ran = () => told.current.onRun?.();

  const load = () => {
    if (!enabled) return;
    const mine = ++round.current;
    kvasir.local
      .status()
      .then((s) => {
        if (mine !== round.current) return;
        setStatus(s);
        setMissed(null);
        const key = s ? runsKey(s.models) : null;
        if (runs.current !== null && key !== runs.current) ran();
        runs.current = key;
      })
      .catch((e: unknown) => {
        // Kvasir not answering: models never read stay out, and models read keep what they showed
        if (mine === round.current) setMissed(refused(e).message);
      });
  };

  /** What a door answered, in place of what was read. */
  const take = (next: LocalStatus | ((s: LocalStatus) => LocalStatus)) => {
    round.current += 1;
    setStatus((s) => (typeof next === "function" ? (s ? next(s) : s) : next));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read when the page opens; what is done here reads again
  }, [enabled]);

  const models = status?.models ?? [];
  // while a model is queued or downloading the list is read again, and no longer once none is
  const busy = underWay(models);
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load only sets what it read
  }, [busy]);

  // while a model loads into llama.cpp the list is read again sooner, until it serves or does not start
  const loading = starting(models);
  useEffect(() => {
    if (!loading) return;
    const t = setInterval(load, START_POLL_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load only sets what it read
  }, [loading]);

  const put = (m: LocalModel) => take((s) => ({ ...s, models: s.models.map((x) => (x.id === m.id ? m : x)) }));
  const step = (m: LocalModel, phase: string, door: (id: number) => Promise<LocalModel>) => {
    say(null);
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

  const begin = (m: LocalModel) => {
    say(null);
    acting.act(`starting ${m.repo}`, async () => {
      try {
        put(await kvasir.local.start(m.id));
      } catch (e) {
        load();
        const plain = plainly(e);
        if (plain !== e) throw plain;
        const r = localRefusalOf(e);
        throw new Error(r ? startRefusalWords(r) : sentence(messageOf(e)));
      }
      // the model it stopped changed too, and the page's backends follow
      load();
      ran();
      return startedWords(m);
    });
  };

  const stop = (m: LocalModel) => {
    say(null);
    acting.act(`stopping ${m.repo}`, async () => {
      try {
        put(await kvasir.local.stop(m.id));
      } catch (e) {
        load();
        throw refused(e);
      }
      load();
      ran();
      return stoppedWords(m);
    });
  };

  const toRemove = removing === null ? null : (models.find((m) => m.id === removing) ?? null);
  const toStart = replacing === null ? null : (models.find((m) => m.id === replacing) ?? null);
  const stopping = toStart ? runningBesides(models, toStart.id) : null;

  const dialogs = status ? (
    <>
      {locating && (
        <LocationDialog
          current={status.location}
          onClose={() => setLocating(false)}
          onDone={(s) => {
            setLocating(false);
            take(s);
            say(`${movedWords(s.location)} ${STAY_NOTE}`);
          }}
        />
      )}
      {tokening && (
        <TokenDialog
          set={status.token}
          onClose={() => setTokening(false)}
          onDone={(token, words) => {
            setTokening(false);
            take((s) => ({ ...s, token }));
            say(words);
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
            say(words);
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
            begin(toStart);
          }}
        />
      )}
    </>
  ) : null;

  return {
    status,
    missed,
    acting: acting.acting,
    working: acting.working,
    dialogs,
    /** A download Add a model queued, put in the list at once. */
    queued: (m: LocalModel) => {
      take((s) => ({ ...s, models: [...s.models.filter((x) => x.id !== m.id), m] }));
      say(queuedWords(m));
      load();
    },
    pause: (m: LocalModel) => step(m, `pausing ${m.repo}`, kvasir.local.pause),
    resume: (m: LocalModel) => step(m, `resuming ${m.repo}`, kvasir.local.resume),
    /** llama.cpp runs one model at a time: a start that stops another asks first. */
    start: (m: LocalModel) => {
      say(null);
      if (runningBesides(models, m.id)) setReplacing(m.id);
      else begin(m);
    },
    stop,
    remove: (m: LocalModel) => {
      say(null);
      setRemoving(m.id);
    },
    locate: () => {
      say(null);
      setLocating(true);
    },
    token: () => {
      say(null);
      setTokening(true);
    },
  };
}

/**
 * One model Kvasir downloads, as a card: its name, where it runs, how far its
 * download is and its state; where Kvasir starts it on llama.cpp, how it runs,
 * whether Kvasir admitted it and the stations it answers; its files and, once
 * downloaded, the commands a model server runs it with, folded under the card.
 */
export function LocalModelCard(props: {
  model: LocalModel;
  busy?: boolean;
  /** Whether the install runs llama.cpp for Kvasir. */
  runtime?: boolean;
  /** Whether Kvasir admitted the model, where it serves. */
  admission?: Admission | null;
  /** The stations llama.cpp's model answers. */
  answers?: string | null;
  onPause: () => void;
  onResume: () => void;
  onRemove: () => void;
  onStart?: () => void;
  onStop?: () => void;
  /** The admission suite run again on the model llama.cpp serves. */
  onCheck?: () => void;
}) {
  const { model: m, busy = false, runtime = false, admission = null, answers = null, onPause, onResume, onRemove, onStart, onStop, onCheck } = props;
  const name = localName(m);
  const bar = barOf(m);
  const run = m.run ?? null;
  const tags = [{ ...localTag(m), dot: true }, ...(admission && admission.tone !== "ok" ? [{ tone: admission.tone, words: admission.words, dot: true }] : [])];
  return (
    <div className="mcard">
      <div className="name">
        <MarkSquare mark={MARKS.runtime} />
        <span className="path" title={m.repo}>
          {name}
        </span>
      </div>
      <span className="meta">{localMeta(m)}</span>
      {bar !== null && (
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
        </div>
      )}
      <CardTags tags={tags} aside={admission?.tone === "ok" ? admission.words : null} />
      {m.state !== "done" && <span className="meta num">{progressWords(m)}</span>}
      {admission?.detail && <span className="meta">{admission.detail}</span>}
      {m.state === "failed" && m.error && <p className="warn">{sentence(m.error)}</p>}
      {run?.state === "starting" && <span className="meta">{`Loading into llama.cpp as ${run.model}.`}</span>}
      {run?.state === "failed" && <RunFailure run={run} />}
      {answers && started(m) && <span className="meta">{answers}</span>}
      <Files model={m} runtime={runtime} />
      <div className="row">
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
        {actionsOf(m.state)
          .filter((a) => a !== "remove")
          .map((a) => (
            <button key={a} type="button" className="button secondary small" disabled={busy} onClick={a === "pause" ? onPause : onResume}>
              {a === "pause" ? "Pause" : "Resume"}
            </button>
          ))}
        <MoreMenu label={`More for ${name}`}>
          {onCheck && run?.state === "serving" && (
            <button type="button" disabled={busy} onClick={onCheck}>
              Check
            </button>
          )}
          <button type="button" onClick={onRemove}>
            Remove
          </button>
        </MoreMenu>
      </div>
    </div>
  );
}

/** Why a model did not start, with what llama.cpp logged behind a disclosure. */
function RunFailure({ run }: { run: LocalRun }) {
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

/** A model's revision and path and, once downloaded, the commands a model server runs it with, folded under its card. */
function Files({ model: m, runtime }: { model: LocalModel; runtime: boolean }) {
  const serve = m.state === "done" ? m.serve : [];
  const startable = m.startable === true;
  const summary = serve.length === 0 ? "Its files" : startable ? "Or run it yourself" : "Run it on a model server";
  return (
    <details className="card-files">
      <summary>{summary}</summary>
      <div className="serve">
        <span className="meta">{revisionWords(m)}</span>
        <span className="meta path">{m.path}</span>
        {serve.length > 0 && <ServeList serve={serve} />}
        {serve.length > 0 && startable && <p className="meta">{SELF_NOTE}</p>}
        {m.state === "done" && !startable && <p className="meta">{serve.length > 0 ? (runtime ? NOT_STARTABLE_NOTE : SERVE_NOTE) : NO_COMMAND}</p>}
      </div>
    </details>
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

/** The line under the models: the machine's card and llama.cpp, where downloads go and the room there, and the Hugging Face token. */
export function MachineLine({ install, status, onLocate, onToken }: { install: Install | null; status: LocalStatus; onLocate: () => void; onToken: () => void }) {
  const card = machineWords(install).card;
  const runtime = status.runtime ?? null;
  return (
    <div className="mline">
      {(card || runtime) && (
        <span>
          <Icon name="chip" />
          <span>{[card, runtime ? runtimeLine(runtime) : null].filter(Boolean).join(" · ")}</span>
          {runtime && <span className={runtime.reachable ? "ok-words" : "warn"}>{runtimeTag(runtime).words}</span>}
        </span>
      )}
      <span>
        <Icon name="disk" />
        <span>
          Downloads go to <span className="path">{status.location}</span>, {roomLine(status.free_bytes)} ·
        </span>
        <button type="button" className="link-button" onClick={onLocate}>
          Change
        </button>
      </span>
      <span>
        <Icon name="key" />
        <span>{status.token ? "Hugging Face token set ·" : "Hugging Face token not set ·"}</span>
        <button type="button" className="link-button" onClick={onToken}>
          {status.token ? "Change" : "Set"}
        </button>
      </span>
    </div>
  );
}

/** The Hugging Face token: set from a password field, or cleared, and never shown. */
function TokenDialog({ set, onClose, onDone }: { set: boolean; onClose: () => void; onDone: (token: boolean, words: string) => void }) {
  const id = useId();
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
      onDone(true, "The Hugging Face token is set, and shown to nobody.");
      return "";
    });

  const clear = () =>
    saving.act("clearing the Hugging Face token", async () => {
      try {
        await kvasir.local.clearToken();
      } catch (e) {
        throw refused(e);
      }
      onDone(false, "The Hugging Face token is cleared.");
      return "";
    });

  const quiet = saving.acting.kind === "done" && saving.acting.words === "";
  const foot = (
    <>
      {!quiet && <Acted acting={saving.acting} />}
      <div className="row actions">
        <button type="button" className="button" disabled={!ready} onClick={store}>
          Set it
        </button>
        {set && (
          <button type="button" className="button secondary" disabled={saving.working} onClick={clear}>
            Clear it
          </button>
        )}
        <button type="button" className="button secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
    </>
  );

  return (
    <Dialog title="Hugging Face token" icon="key" onClose={onClose} foot={foot}>
      <div className="field">
        <label className="label" htmlFor={`${id}-token`}>
          {set ? "Another token" : "The token"}
        </label>
        <div className="input mono">
          <input
            id={`${id}-token`}
            type="password"
            autoComplete="off"
            value={token}
            disabled={saving.working}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && ready) store();
            }}
          />
        </div>
        <span className="meta">{TOKEN_NOTE}</span>
      </div>
    </Dialog>
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
