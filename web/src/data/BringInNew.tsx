// SPDX-License-Identifier: AGPL-3.0-only
// Do all steps (record 26, D1, and the tries of 2026-10-08): the steps a
// dataset needs, queued as the engine's own `bring-in` under one name:
// pseudonymise for identified data, then read, then sort with the pack. The
// card's own button does one step at a time; this does them all. Where the
// engine queues nothing after a job, the read is queued alone.

import { useState } from "react";
import type { Capabilities } from "../capabilities";
import { may } from "../grants";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { arrivesOf, bringInBody, bringInName, estimateWords, jobs, newInOriginals, packFor, record26, type Dataset, type Rates } from "./datasets";

export function BringInNew(props: { caps: Capabilities; dataset: Dataset; rates: Rates | null; onClose: () => void; onDone: (words: string) => void }) {
  const { caps, dataset: d, rates, onClose, onDone } = props;
  const [pack, setPack] = useState<string | null>(() => packFor(caps));
  const [why, setWhy] = useState<string | null>(null);
  const [queueing, setQueueing] = useState(false);
  const chains = record26(caps, d);
  const identified = arrivesOf(d) === "identified";
  const packs = caps.engine?.packs ?? [];
  const fresh = newInOriginals(d);
  const estimate = identified ? estimateWords(fresh, rates?.pseudonymize, "reading") : estimateWords(fresh, rates?.digest, "sorting");
  // sorting needs work on Pipelines: without it the steps stop after reading
  const sorts = may(caps, "pipelines:work");
  const steps = chains ? [...(identified ? ["Pseudonymise"] : []), "Read", ...(sorts ? ["Sort"] : [])] : ["Read"];

  const go = () => {
    setQueueing(true);
    setWhy(null);
    const name = bringInName(d.name);
    const body = chains ? bringInBody(d, name, pack) : { command: ["digest", `@${d.name}`], name };
    jobs
      .enqueue(body.command, body.name)
      .then(() => onDone(`${d.name}: started.`))
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
        Start
      </button>
      {why && <span className="warn">{why}</span>}
    </div>
  );

  return (
    <Dialog title={`Do all steps: ${d.name}`} icon="play" onClose={onClose} foot={foot}>
      <p className="steps-line">{steps.join(" → ")}</p>
      {fresh !== null && <p className="meta">{fresh.toLocaleString("en-US")} new files</p>}
      {chains && packs.length > 1 && (
        <div className="field-row">
          <label className="meta" htmlFor="bring-in-pack">
            Sort with
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
    </Dialog>
  );
}
