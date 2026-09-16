// SPDX-License-Identifier: AGPL-3.0-only
// Bring in what is new (record 26, D1): the thread that reads a dataset's new
// files, queued as the engine's own `bring-in`, which unfolds into the steps
// the dataset needs under one name: pseudonymise for a dataset that arrives
// identified, then digest the pseudonymised tree, then fingerprint and
// classify with the dataset's pack; or the first step alone, named the same
// way. A dataset that arrives de-identified or coded has no first step. Where
// the engine queues nothing after a job, the digest is queued alone, as before.

import { useState } from "react";
import type { Capabilities } from "../capabilities";
import { may } from "../grants";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { arrivesOf, bringInBody, bringInName, bringInSteps, estimateWords, jobs, newInOriginals, packFor, record26, type Dataset, type Rates } from "./datasets";

export function BringInNew(props: { caps: Capabilities; dataset: Dataset; rates: Rates | null; onClose: () => void; onDone: (words: string) => void }) {
  const { caps, dataset: d, rates, onClose, onDone } = props;
  const [name, setName] = useState(() => bringInName(d.name));
  const [only, setOnly] = useState(false);
  const [pack, setPack] = useState<string | null>(() => packFor(caps));
  const [why, setWhy] = useState<string | null>(null);
  const [queueing, setQueueing] = useState(false);
  const chains = record26(caps, d);
  const identified = arrivesOf(d) === "identified";
  const packs = caps.engine?.packs ?? [];
  const version = packs.find((p) => p.name === pack)?.version ?? null;
  const steps = bringInSteps(d, pack, version);
  const fresh = newInOriginals(d);
  const held = d.held?.files ?? 0;
  const estimate = identified ? estimateWords(fresh, rates?.pseudonymize, "the digest") : estimateWords(fresh, rates?.digest, "the sort");
  const first = identified ? "Pseudonymise" : "Digest";
  const sorts = may(caps, "pipelines:work");

  const go = () => {
    setQueueing(true);
    setWhy(null);
    const batch = name.trim() || bringInName(d.name);
    const body = chains ? bringInBody(d, batch, pack, only) : { command: ["digest", `@${d.name}`], name: batch };
    jobs
      .enqueue(body.command, body.name)
      .then((j) => {
        if (chains && !only) onDone(`Bringing in what is new in ${d.name} is queued as job ${j.job}, its ${steps.length} steps one thread named ${batch}; Now shows it once it starts.`);
        else onDone(`${first === "Pseudonymise" && chains ? "The pseudonymisation" : "A digest"} of ${d.name} is queued as job ${j.job}; Now shows it once it starts.`);
      })
      .catch((e: Error) => {
        setQueueing(false);
        setWhy(e.message);
      });
  };

  const foot = (
    <div className="row actions">
      <span className="meta grow">{estimate ?? ""}</span>
      <button type="button" className="button secondary" disabled={queueing} onClick={onClose}>
        Cancel
      </button>
      <button type="button" className="button" disabled={queueing} onClick={go}>
        <Icon name="play" />
        Bring in
      </button>
      {why && <span className="warn">{why}</span>}
    </div>
  );

  return (
    <Dialog title="Bring in what is new" icon="play" onClose={onClose} foot={foot}>
      <dl className="facts">
        <dt>dataset</dt>
        <dd>
          <b>{d.name}</b> <span className="meta path">{d.path}</span>
        </dd>
        {fresh !== null && (
          <>
            <dt>{identified ? "new in the originals" : "not yet read"}</dt>
            <dd>
              <span className="num">{fresh.toLocaleString("en-US")} files</span>
              {held > 0 && <span className="meta"> · {held.toLocaleString("en-US")} held until mapped</span>}
            </dd>
          </>
        )}
        <dt>name</dt>
        <dd>
          <div className="input mono batch-name">
            <input value={name} spellCheck={false} disabled={queueing} aria-label="The batch's name" onChange={(e) => setName(e.target.value)} />
          </div>
        </dd>
      </dl>
      {chains ? (
        <div className="field">
          <span className="label">Steps</span>
          <ul className="tl">
            {steps.map((s, i) => (
              <li key={s.title} className={i === 0 ? "now" : undefined}>
                <span>
                  <b>{s.title}</b>
                  <span className="meta">{s.words}</span>
                </span>
              </li>
            ))}
          </ul>
          {packs.length > 1 && (
            <div className="field-row">
              <label className="meta" htmlFor="bring-in-pack">
                Classify with
              </label>
              <div className="input">
                <select id="bring-in-pack" value={pack ?? ""} disabled={queueing} onChange={(e) => setPack(e.target.value || null)}>
                  {packs.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name} {p.version}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <div className="choices" role="radiogroup">
            <label className="radio-row">
              <input type="radio" name="bring-in-how" checked={!only} disabled={queueing} onChange={() => setOnly(false)} />
              <span>
                <b>{steps.length === 3 ? "All three, as one thread" : "Both, as one thread"}</b>
                <span className="meta">The engine queues each step when the one before is done, every step under the name above: one line on the batch.</span>
              </span>
            </label>
            <label className="radio-row">
              <input type="radio" name="bring-in-how" checked={only} disabled={queueing} onChange={() => setOnly(true)} />
              <span>
                <b>{first} only</b>
                <span className="meta">{identified ? "Write dcm-anon and stop; digest and sort later from the batch's page." : "Read what is new and stop; sort later from the batch's page."}</span>
              </span>
            </label>
          </div>
        </div>
      ) : (
        <p className="meta">This engine queues one job at a time, so a digest of {d.name} is queued; sort it from the batch once it has read.</p>
      )}
      {chains && (
        <div className="note gated">
          <Icon name="lock" />
          <div className="note-body">
            <p className="note-detail">
              Pseudonymising and digesting need work on the Data page; sorting needs work on the Pipelines page.{" "}
              {sorts ? "You hold both, so the chain runs to its end." : "This account has no work on Pipelines, so the chain stops after the digest and the batch says why."}
            </p>
          </div>
        </div>
      )}
    </Dialog>
  );
}
