// SPDX-License-Identifier: AGPL-3.0-only
// New cohort, from the Data page's head (Wave 7a, 2026-10-09: the cohorts
// live on the page of the datasets): its name, owner and why, and, from a
// list, the codes that join it at once. Made, it is chosen on the page.

import { useState } from "react";
import { needsWork } from "../access";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { Dialog } from "../ui/Dialog";
import { cohorts, membersBody } from "./cohorts";

/** Why making a cohort is not offered, or null when it is. */
export function makingRefusal(caps: Capabilities): string | null {
  if (!served(caps, "POST /api/cohorts")) return "This engine has no door for making a cohort.";
  return needsWork(caps, "Making a cohort", [["data:work", "the Data page"]]);
}

/** Whether a name may be a new cohort's, or what it still needs. */
export function nameRefusal(name: string, taken: readonly string[]): string | null {
  const trimmed = name.trim();
  if (trimmed === "") return "a name";
  if (taken.includes(trimmed)) return "another name; that one is taken";
  if (!/^[\p{L}\p{N}][\p{L}\p{N}_.-]*$/u.test(trimmed)) return "a name of letters, digits, dots, dashes or underscores";
  return null;
}

export function NewCohortDialog({ caps, taken, onClose, onMade }: { caps: Capabilities; taken: readonly string[]; onClose: () => void; onMade: (name: string) => void }) {
  const [name, setName] = useState("");
  const [owner, setOwner] = useState(caps.person.display_name || caps.person.subject);
  const [why, setWhy] = useState("");
  const [codes, setCodes] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const trimmed = name.trim();
  const members = served(caps, "POST /api/cohorts/{name}/members");
  const listed = codes.trim() !== "";
  const refusal = nameRefusal(name, taken) ?? (listed && !why.trim() ? "why; it is recorded on every membership" : null);
  const make = () => {
    setBusy(true);
    setFailed(null);
    cohorts
      .make({ name: trimmed, ...(owner.trim() ? { owner: owner.trim() } : {}), ...(why.trim() ? { description: why.trim() } : {}) })
      .then(async () => {
        if (listed && members) {
          const body = membersBody(codes, "", why);
          if (body.ok) await cohorts.members(trimmed, body.body);
        }
        onMade(trimmed);
      })
      .catch((e: Error) => {
        setBusy(false);
        setFailed(e.message);
      });
  };
  return (
    <Dialog
      title="New cohort"
      icon="users"
      onClose={onClose}
      foot={
        <div className="row actions">
          <span className="meta grow">{refusal ? `Needs ${refusal}.` : "It shows under Cohorts at once."}</span>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="button" disabled={busy || refusal !== null} onClick={make}>
            Make the cohort
          </button>
        </div>
      }
    >
      <div className="fields2">
        <label className="field">
          <span className="label">Name</span>
          <span className="input mono">
            <input value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder="ms-followup" />
          </span>
        </label>
        <label className="field">
          <span className="label">Owner</span>
          <span className="input">
            <input value={owner} onChange={(e) => setOwner(e.target.value)} />
          </span>
        </label>
      </div>
      <label className="field">
        <span className="label">What it is for</span>
        <span className="input">
          <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="the follow-up visits of the MS group" />
        </span>
      </label>
      {members && (
        <details className="more-fields">
          <summary>Subjects to add now, from a list</summary>
          <div className="more-body">
            <label className="field">
              <span className="label">Codes, one per line</span>
              <span className="input mono">
                <textarea value={codes} rows={5} onChange={(e) => setCodes(e.target.value)} />
              </span>
            </label>
          </div>
        </details>
      )}
      {failed && <p className="warn">{failed}</p>}
    </Dialog>
  );
}
