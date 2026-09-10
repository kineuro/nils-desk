// SPDX-License-Identifier: AGPL-3.0-only
// Parts (Wave 5 section 10.1): every part the deployment has with its
// version, contract versions, health and whether a newer release exists on
// the channel; under each its own settings, generated from what the part
// publishes. The update button sits behind a closure panel that names what
// changes, and beside it, always, the command a person runs by hand.

import { useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { holds } from "../sections";
import { Blocked } from "../ui/Veil";
import { classify, Failure, type Failed } from "../ui/Failure";
import { type Installed, type Part, parts, updateWords } from "./console";
import { byHand, supervise } from "./supervise";

export function Parts({ caps, children }: { caps: Capabilities; children?: React.ReactNode }) {
  const url = caps.desk.settings?.supervisor_url ?? null;
  const admin = holds(caps, "admin");
  const [installed, setInstalled] = useState<Installed[]>([]);
  const [channel, setChannel] = useState<string | null>(null);
  const [failed, setFailed] = useState<Failed | null>(null);
  const [updating, setUpdating] = useState<Part | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!url || !admin) return;
    supervise
      .capabilities()
      .then((c) => {
        setInstalled(c.parts);
        setChannel(c.channel ?? null);
      })
      .catch((e: unknown) => setFailed(classify(e)));
  }, [url, admin]);
  const table = parts(caps, installed);
  const apply = (p: Part) => {
    const newer = installed.find((i) => i.part === p.id)?.newer;
    if (!newer) return;
    setBusy(true);
    supervise
      .update(p.id, newer.version)
      .then((r) => setOutcome(r.applied ? `${p.title} is now ${r.version}.` : `Refused: ${r.reason ?? "the supervisor said no"}.`))
      .catch((e: Error) => setOutcome(`Refused: ${e.message}`))
      .finally(() => {
        setBusy(false);
        setUpdating(null);
      });
  };
  return (
    <div className="parts">
      <table className="thin parts-table">
        <thead>
          <tr>
            <th>part</th>
            <th>version</th>
            <th>contracts</th>
            <th>health</th>
            <th>newer</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {table.map((p) => (
            <tr key={p.id}>
              <td>{p.title}</td>
              <td>{p.version ?? "unknown"}</td>
              <td>{Object.entries(p.contracts).map(([k, v]) => `${k} ${v}`).join(", ")}</td>
              <td>
                <span className={`tag ${p.health === "ok" ? "" : p.health === "warming" ? "caution" : "warn"}`}>{p.health}</span>
              </td>
              <td>{p.newer ?? ""}</td>
              <td>{p.newer && admin && <button type="button" onClick={() => setUpdating(p)}>Update</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!url && <p className="meta">No supervisor is installed on this host: updates are the commands in the guide, run by hand.</p>}
      {failed && <Failure failed={failed} />}
      {updating && (
        <div className="panel closure" role="dialog" aria-label={`update ${updating.title}`}>
          <h3>Update {updating.title}?</h3>
          {updateWords(updating, installed.find((i) => i.part === updating.id)!.newer!, table).map((l) => (
            <p key={l}>{l}</p>
          ))}
          <div className="row">
            {url ? (
              <button type="button" className="on" disabled={busy} onClick={() => apply(updating)}>
                Update {updating.title} to {installed.find((i) => i.part === updating.id)!.newer!.version} and restart it
              </button>
            ) : (
              <Blocked control={{ enabled: false, reason: "no supervisor is installed; run the command by hand" }} label="Update" onClick={() => undefined} />
            )}
            <button type="button" onClick={() => setUpdating(null)}>Not now</button>
          </div>
          <p className="meta">By hand, the same steps:</p>
          <pre className="procedure">{byHand(updating.id, installed.find((i) => i.part === updating.id)!.newer!.version, channel).join("\n")}</pre>
        </div>
      )}
      {outcome && <p className="meta">{outcome}</p>}
      {children}
    </div>
  );
}
