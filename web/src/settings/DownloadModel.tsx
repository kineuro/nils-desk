// SPDX-License-Identifier: AGPL-3.0-only
// Downloading a model to this machine (record 23, slice M; record 25), the
// first of Add a model's choices: the model's name on the Hugging Face Hub,
// with a revision and the patterns of its files folded under it. Look it up
// lists what the hub holds and keeps nothing; a GGUF model's file is then
// chosen by its quantization, with whether it fits the machine's card, and any
// other model downloads every file the patterns choose. Download is offered
// only once a look-up answered for exactly what the dialog shows, and Kvasir
// looks the model up again as it queues it. A refusal says in words what to do.

import { useId, useState } from "react";
import type React from "react";
import { Acted, useActing } from "./common";
import { plainly } from "./gateway";
import { kvasir, localRefusalOf, type LocalModel } from "./kvasir";
import {
  askedBytes,
  askOf,
  askRefusal,
  bytesWords,
  CHECKED_BEFORE,
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
  stale,
  type DownloadDraft,
  type Found,
} from "./local";

/**
 * The download's part of Add a model: what it asks and its buttons. `token`
 * says whether a Hugging Face token is set and `free` the room where downloads
 * go, as the page last read them; `card` is the machine's, where it is known.
 */
export function useDownload(props: {
  token: boolean;
  free: number | null;
  card: { name: string; memory_gb: number } | null;
  advice: string[];
  onClose: () => void;
  onDone: (m: LocalModel) => void;
}): { body: React.ReactNode; foot: React.ReactNode; busy: boolean } {
  const { token, free, card, advice, onClose, onDone } = props;
  const id = useId();
  const [d, setD] = useState<DownloadDraft>(EMPTY_DRAFT);
  const [found, setFound] = useState<Found | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  // what each act asked, so its words stand only while the dialog still shows that
  const [lookedFor, setLookedFor] = useState<string | null>(null);
  const [askedFor, setAskedFor] = useState<string | null>(null);
  const looking = useActing();
  const queuing = useActing();
  const busy = looking.working || queuing.working;
  const print = fingerprint(d);

  const edit = (patch: Partial<DownloadDraft>) => setD((x) => ({ ...x, ...patch }));

  /** A refusal for want of a grant in plain words, Kvasir's own refusal in words a person can act on, anything else as it came. */
  const inWords = (e: unknown, asked: DownloadDraft): unknown => {
    const plain = plainly(e);
    if (plain !== e) return plain;
    const r = localRefusalOf(e);
    return r ? new Error(refusalWords(r, { token, patterns: patternsOf(asked.include).length })) : e;
  };

  const cannot = askRefusal(d);

  const lookUp = () => {
    const asked = d;
    setLookedFor(fingerprint(asked));
    looking.act(`asking the Hugging Face Hub for the files of ${asked.repo.trim()}`, async () => {
      try {
        const lookup = await kvasir.local.lookup(askOf(asked));
        setFound({ print: fingerprint(asked), lookup });
        setChosen(defaultChoice(fileChoices(lookup.files), card));
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
        <span className="meta">{cannot ?? "As owner/name. Kvasir asks the hub which files it would download, and keeps nothing."}</span>
        {!lookQuiet && (looking.working || lookedFor === print) && <Acted acting={looking.acting} />}
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
          <span className="meta">A branch, a tag or a commit. Left empty, main.</span>
        </div>
        <div className="field">
          <label className="label" htmlFor={`${id}-include`}>
            Only the files that match
          </label>
          <div className="input mono">
            <textarea id={`${id}-include`} rows={3} value={d.include} placeholder="*Q4_K_M.gguf" spellCheck={false} disabled={busy} onChange={(e) => edit({ include: e.target.value })} />
          </div>
          <span className="meta">Patterns, one a line or separated by commas, such as *Q4_K_M.gguf for one quantization of a GGUF model. Left empty, every file of the model is looked up.</span>
        </div>
        </div>
      </details>

      {shown &&
        (choices.length > 0 ? (
          <div className="field">
            <span className="label">The file</span>
            <div className="choices" role="radiogroup" aria-label="The file">
              {choices.map((c) => {
                const fit = fitWords(c.bytes, card);
                return (
                  <label key={c.key} className={chosen === c.key ? "file-row on" : "file-row"}>
                    <input type="radio" name={`${id}-file`} checked={chosen === c.key} disabled={busy} onChange={() => setChosen(c.key)} />
                    <span>
                      <span className="path">{c.label}</span> <span className="meta">{c.paths.length > 1 ? `${bytesWords(c.bytes)} in ${c.paths.length} parts` : bytesWords(c.bytes)}</span>
                    </span>
                    {fit && <span className={`tag ${fit.tone}`}>{fit.words}</span>}
                  </label>
                );
              })}
            </div>
            {room && !room.fits ? <span className="warn">{room.words}</span> : <span className="meta">{[room?.words, CHECKED_BEFORE].filter(Boolean).join(" ")}</span>}
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
      {stale(d, found) && <p className="meta">Something changed since the look-up, so look it up again.</p>}
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
