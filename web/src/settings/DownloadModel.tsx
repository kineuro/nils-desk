// SPDX-License-Identifier: AGPL-3.0-only
// Downloading a model to this machine (record 23, slice M; record 25), the
// first of Add a model's choices: the model's name on the Hugging Face Hub,
// with a revision and the patterns of its files folded under it. Look it up
// lists what the hub holds and keeps nothing; a GGUF model's file is then
// chosen by its quantization, with whether it fits the machine's card, and any
// other model downloads every file the patterns choose. Download is offered
// only once a look-up answered for exactly what the dialog shows, and Kvasir
// looks the model up again as it queues it. A refusal says in words what to do.
// Whether a Hugging Face token is set is said there too, for a gated model,
// and the token is set or replaced without leaving the dialog.

import { useId, useState } from "react";
import type React from "react";
import { Acted, messageOf, useActing } from "./common";
import { plainly } from "./gateway";
import { kvasir, localRefusalOf, type LocalModel } from "./kvasir";
import {
  askedBytes,
  askOf,
  askRefusal,
  bytesWords,
  DEFAULT_REVISION,
  defaultChoice,
  downloadAsk,
  EMPTY_DRAFT,
  fileChoices,
  fingerprint,
  fitWords,
  foundWords,
  patternsOf,
  refusalWords,
  roomWords,
  sentence,
  stale,
  tokenReady,
  type DownloadDraft,
  type Found,
} from "./local";

/**
 * The download's part of Add a model: what it asks and its buttons. `token`
 * says whether a Hugging Face token is set and `free` the room where downloads
 * go, as the page last read them; `cards` are the machine's, none where no supervisor answers.
 * `onToken` is told once a token is set here.
 */
export function useDownload(props: {
  token: boolean;
  free: number | null;
  cards: { name: string; memory_gb: number }[];
  advice: string[];
  onClose: () => void;
  onDone: (m: LocalModel) => void;
  onToken: (set: boolean) => void;
}): { body: React.ReactNode; foot: React.ReactNode; busy: boolean } {
  const { token, free, cards, advice, onClose, onDone, onToken } = props;
  const id = useId();
  const [d, setD] = useState<DownloadDraft>(EMPTY_DRAFT);
  const [found, setFound] = useState<Found | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  // what each act asked, so its words stand only while the dialog still shows that
  const [lookedFor, setLookedFor] = useState<string | null>(null);
  const [askedFor, setAskedFor] = useState<string | null>(null);
  const looking = useActing();
  const queuing = useActing();
  // the Hugging Face token, typed here in place of where it is set now
  const [typing, setTyping] = useState(false);
  const [secret, setSecret] = useState("");
  const saving = useActing();
  const busy = looking.working || queuing.working || saving.working;
  const print = fingerprint(d);

  const edit = (patch: Partial<DownloadDraft>) => setD((x) => ({ ...x, ...patch }));

  /** A refusal for want of a grant in plain words, Kvasir's own refusal in words a person can act on, anything else as it came. */
  const inWords = (e: unknown, asked: DownloadDraft): unknown => {
    const plain = plainly(e);
    if (plain !== e) return plain;
    const r = localRefusalOf(e);
    return r ? new Error(refusalWords(r, { token, patterns: patternsOf(asked.include).length })) : e;
  };

  const storeToken = () =>
    saving.act("storing the Hugging Face token", async () => {
      try {
        await kvasir.local.setToken(secret.trim());
      } catch (e) {
        const plain = plainly(e);
        throw plain !== e ? plain : new Error(sentence(messageOf(e)));
      }
      setSecret("");
      setTyping(false);
      onToken(true);
      return "The token is set.";
    });

  const cannot = askRefusal(d);

  const lookUp = () => {
    const asked = d;
    setLookedFor(fingerprint(asked));
    looking.act(`asking the Hugging Face Hub for the files of ${asked.repo.trim()}`, async () => {
      try {
        const lookup = await kvasir.local.lookup(askOf(asked));
        setFound({ print: fingerprint(asked), lookup });
        setChosen(defaultChoice(fileChoices(lookup.files), cards));
        return "";
      } catch (e) {
        setFound(null);
        throw inWords(e, asked);
      }
    });
  };

  const shown = found && found.print === print ? found.lookup : null;
  const choices = shown ? fileChoices(shown.files) : [];
  const ask = downloadAsk(d, found, chosen);

  const download = () => {
    if (!ask) return;
    const asked = d;
    const sent = ask;
    setAskedFor(fingerprint(asked));
    queuing.act(`asking Kvasir to download ${asked.repo.trim()}`, async () => {
      try {
        onDone(await kvasir.local.download(sent));
        return "";
      } catch (e) {
        throw inWords(e, asked);
      }
    });
  };

  const room = shown && shown.files.length > 0 ? roomWords(askedBytes(shown, chosen), free) : null;
  const lookQuiet = looking.acting.kind === "done" && looking.acting.words === "";
  const queueQuiet = queuing.acting.kind === "done" && queuing.acting.words === "";
  const tokenQuiet = saving.acting.kind === "done" && saving.acting.words === "";

  const body = (
    <>
      <div className="field">
        <label className="label" htmlFor={`${id}-repo`}>
          Its name on the Hugging Face Hub
        </label>
        <div className="field-row">
          <div className="input mono">
            <input
              id={`${id}-repo`}
              value={d.repo}
              placeholder="owner/name"
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              disabled={busy}
              onChange={(e) => edit({ repo: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter" && cannot === null && !busy) lookUp();
              }}
            />
          </div>
          <button type="button" className="button secondary" disabled={cannot !== null || busy} onClick={lookUp}>
            Look it up
          </button>
        </div>
        {cannot && <span className="meta">{cannot}</span>}
        {!lookQuiet && (looking.working || lookedFor === print) && <Acted acting={looking.acting} />}
      </div>

      <div className="field">
        <span className="label">Hugging Face token</span>
        {typing ? (
          <div className="field-row">
            <div className="input mono">
              <input
                type="password"
                aria-label="The Hugging Face token"
                autoComplete="off"
                value={secret}
                disabled={saving.working}
                onChange={(e) => setSecret(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && tokenReady(secret) && !saving.working) storeToken();
                }}
              />
            </div>
            <button type="button" className="button secondary" disabled={!tokenReady(secret) || saving.working} onClick={storeToken}>
              Save
            </button>
            <button
              type="button"
              className="button quiet"
              disabled={saving.working}
              onClick={() => {
                setTyping(false);
                setSecret("");
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="row">
            <span className={token ? "tag ok" : "tag"}>{token ? "set" : "not set"}</span>
            <button type="button" className="button quiet small" disabled={busy} onClick={() => setTyping(true)}>
              {token ? "Replace" : "Set"}
            </button>
          </div>
        )}
        <span className="meta">Gated models need one.</span>
        {!tokenQuiet && <Acted acting={saving.acting} />}
      </div>

      <details className="more-fields">
        <summary>Another revision, or only some files</summary>
        <div className="more-body">
        <div className="field">
          <label className="label" htmlFor={`${id}-revision`}>
            Revision
          </label>
          <div className="input mono">
            <input
              id={`${id}-revision`}
              value={d.revision}
              placeholder={DEFAULT_REVISION}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              disabled={busy}
              onChange={(e) => edit({ revision: e.target.value })}
            />
          </div>
          <span className="meta">Branch, tag or commit; main if empty.</span>
        </div>
        <div className="field">
          <label className="label" htmlFor={`${id}-include`}>
            Only the files that match
          </label>
          <div className="input mono">
            <textarea id={`${id}-include`} rows={3} value={d.include} placeholder="*Q4_K_M.gguf" spellCheck={false} disabled={busy} onChange={(e) => edit({ include: e.target.value })} />
          </div>
          <span className="meta">One a line or separated by commas, such as *Q4_K_M.gguf.</span>
        </div>
        </div>
      </details>

      {shown &&
        (choices.length > 0 ? (
          <div className="field">
            <span className="label">The file</span>
            <div className="choices" role="radiogroup" aria-label="The file">
              {choices.map((c) => {
                const fit = fitWords(c.bytes, cards);
                return (
                  <label key={c.key} className={chosen === c.key ? "file-row on" : "file-row"}>
                    <input type="radio" name={`${id}-file`} checked={chosen === c.key} disabled={busy} onChange={() => setChosen(c.key)} />
                    <span>
                      <span className="path">{c.label}</span> <span className="meta">{c.paths.length > 1 ? `${bytesWords(c.bytes)} in ${c.paths.length} parts` : bytesWords(c.bytes)}</span>
                    </span>
                    {fit && (
                      <span className={`tag ${fit.tone}`} title={fit.title ?? undefined}>
                        {fit.words}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
            {room && <span className={room.fits ? "meta" : "warn"}>{room.words}</span>}
            {advice.length > 0 && <span className="meta">{advice.join(" ")}</span>}
          </div>
        ) : (
          <div className="found">
            <p>{foundWords(shown)}</p>
            {shown.files.length > 0 && (
              <ul className="file-list">
                {shown.files.map((f) => (
                  <li key={f.path}>
                    <span className="path">{f.path}</span>
                    <span className="meta num">{bytesWords(f.size)}</span>
                  </li>
                ))}
              </ul>
            )}
            {room && <p className={room.fits ? "meta" : "warn"}>{room.words}</p>}
          </div>
        ))}
    </>
  );

  const foot = (
    <>
      {stale(d, found) && <p className="meta">Changed since the look-up; look it up again.</p>}
      {shown && choices.length > 0 && chosen === null && <p className="meta">Choose the file to download.</p>}
      {!queueQuiet && (queuing.working || askedFor === print) && <Acted acting={queuing.acting} />}
      <div className="row actions">
        <button type="button" className="button" disabled={ask === null || busy} onClick={download}>
          Download
        </button>
        <button type="button" className="button secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
    </>
  );

  return { body, foot, busy };
}
