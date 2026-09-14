// SPDX-License-Identifier: AGPL-3.0-only
// Downloading a model (record 23, slice M), a dialog on the Kvasir page: the
// model's name on the Hugging Face Hub, a revision and the patterns of its
// files. Look up lists the files with their sizes and the total, and keeps
// nothing; Download is offered only once a look-up answered for exactly what
// the dialog shows, and Kvasir looks the model up again as it queues it. A
// refusal says in words what to do.

import { useId, useState } from "react";
import { Dialog } from "../ui/Dialog";
import { Acted, useActing } from "./common";
import { kvasir, localRefusalOf, type LocalModel } from "./kvasir";
import {
  askOf,
  askRefusal,
  bytesWords,
  DEFAULT_REVISION,
  downloadable,
  EMPTY_DRAFT,
  fingerprint,
  foundWords,
  patternsOf,
  refusalWords,
  roomWords,
  stale,
  type DownloadDraft,
  type Found,
} from "./local";

/** `token` says whether a Hugging Face token is set, and `free` the room where downloads go, as the page last read them. */
export function DownloadModel(props: { token: boolean; free: number | null; onClose: () => void; onDone: (m: LocalModel) => void }) {
  const { token, free, onClose, onDone } = props;
  const id = useId();
  const [d, setD] = useState<DownloadDraft>(EMPTY_DRAFT);
  const [found, setFound] = useState<Found | null>(null);
  // what each act asked, so its words stand only while the dialog still shows that
  const [lookedFor, setLookedFor] = useState<string | null>(null);
  const [askedFor, setAskedFor] = useState<string | null>(null);
  const looking = useActing();
  const queuing = useActing();
  const busy = looking.working || queuing.working;
  const print = fingerprint(d);

  const edit = (patch: Partial<DownloadDraft>) => setD((x) => ({ ...x, ...patch }));

  /** Kvasir's refusal in words a person can act on; anything else as it came. */
  const inWords = (e: unknown, asked: DownloadDraft): unknown => {
    const r = localRefusalOf(e);
    return r ? new Error(refusalWords(r, { token, patterns: patternsOf(asked.include).length })) : e;
  };

  const lookUp = () => {
    const asked = d;
    setLookedFor(fingerprint(asked));
    looking.act(`asking the Hugging Face Hub for the files of ${asked.repo.trim()}`, async () => {
      try {
        setFound({ print: fingerprint(asked), lookup: await kvasir.local.lookup(askOf(asked)) });
        return "";
      } catch (e) {
        setFound(null);
        throw inWords(e, asked);
      }
    });
  };

  const download = () => {
    const asked = d;
    setAskedFor(fingerprint(asked));
    queuing.act(`asking Kvasir to download ${asked.repo.trim()}`, async () => {
      try {
        onDone(await kvasir.local.download(askOf(asked)));
        return "";
      } catch (e) {
        throw inWords(e, asked);
      }
    });
  };

  const cannot = askRefusal(d);
  const shown = found && found.print === print ? found.lookup : null;
  const room = shown && shown.files.length > 0 ? roomWords(shown.bytes_total, free) : null;
  const lookQuiet = looking.acting.kind === "done" && looking.acting.words === "";
  const queueQuiet = queuing.acting.kind === "done" && queuing.acting.words === "";

  const foot = (
    <>
      {stale(d, found) && <p className="meta">Something changed since the look-up, so look it up again.</p>}
      {!queueQuiet && (queuing.working || askedFor === print) && <Acted acting={queuing.acting} />}
      <div className="row actions">
        <button type="button" className="button" disabled={!downloadable(d, found) || busy} onClick={download}>
          Download
        </button>
        <button type="button" className="button secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
    </>
  );

  return (
    <Dialog title="Download a model" icon="disk" onClose={onClose} foot={foot}>
      <p className="meta">Kvasir downloads it from the Hugging Face Hub into where downloads go, for a model server of yours to run.</p>
      <div className="field">
        <label className="label" htmlFor={`${id}-repo`}>
          The model
        </label>
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
          />
        </div>
        <span className="meta">Its name on the Hugging Face Hub, as owner/name.</span>
      </div>

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
        <span className="meta">Patterns, one a line or separated by commas, such as *Q4_K_M.gguf for one quantization of a GGUF model. Left empty, every file of the model downloads.</span>
      </div>

      <div className="field">
        <div className="field-row">
          <button type="button" className="button secondary small" disabled={cannot !== null || busy} onClick={lookUp}>
            Look up
          </button>
          {cannot ? <span className="meta">{cannot}</span> : !shown && <span className="meta">Kvasir asks the hub which files it would download, and keeps nothing.</span>}
        </div>
        {!lookQuiet && (looking.working || lookedFor === print) && <Acted acting={looking.acting} />}
        {shown && (
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
        )}
      </div>
    </Dialog>
  );
}
