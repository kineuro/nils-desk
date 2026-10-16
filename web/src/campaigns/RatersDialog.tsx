// SPDX-License-Identifier: AGPL-3.0-only
// Change the raters of an open campaign (record 48; gate T31, step 11.8): the
// people who rate it, each a chip that is on while they rate, the people the
// desk names who could be added beside them. One press of Change raters adds
// and takes off together. A rater taken off keeps every answer given and
// gives back what they hold; one added who already read these stacks in
// another campaign is named by the engine after, since the change stands.

import { useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { Dialog } from "../ui/Dialog";
import { refused, type Campaign } from "./client";
import { principalFor, readersOf, type Reader } from "./NewCheck";
import { ratersBody, ratersChange, ratersDone, ratersNeeds, ratersPlan, raters, type RatersChanged } from "./raters";

/** The people the desk names who hold what a rater needs, or null where it names none (it keeps no people, or did not answer). */
function usePeople(caps: Capabilities): Reader[] | null {
  const [people, setPeople] = useState<Reader[] | null>(null);
  useEffect(() => {
    if (caps.desk?.mode === "off") return;
    let alive = true;
    fetch("/desk/people?holding=campaigns:work")
      .then((r) => (r.ok ? (r.json() as Promise<{ people?: { subject: string; display: string; holds?: boolean }[] }>) : { people: [] }))
      .then((r) => alive && setPeople((r.people ?? []).map((p) => ({ principal: principalFor(caps, p.subject), display: p.display || p.subject, holds: typeof p.holds === "boolean" ? p.holds : null }))))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [caps]);
  return people;
}

export function RatersDialog({ caps, campaign: c, onClose, onDone }: { caps: Capabilities; campaign: Campaign; onClose: () => void; onDone: (done: RatersChanged, words: string) => void }) {
  const current = c.rater_policy.raters;
  const people = usePeople(caps);
  const [will, setWill] = useState<string[]>(current);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<string | null>(null);
  const known = new Map((people ?? []).map((p) => [p.principal, p.display]));
  const name = (p: string) => known.get(p) ?? p;
  // those who rate now, then the people who could: never the same one twice
  const options = [...new Set([...current, ...readersOf(people ?? [], "").offered.map((p) => p.principal)])];
  // where the desk names no people, a principal is typed
  const written = typed.split(/[\s,]+/u).filter((p) => p !== "" && !options.includes(p));
  const after = [...will, ...written];
  const needs = ratersNeeds(current, after);
  const plan = ratersPlan(current, after, name);
  const toggle = (p: string) => setWill((w) => (w.includes(p) ? w.filter((x) => x !== p) : [...w, p]));
  const go = () => {
    setBusy(true);
    setWhy(null);
    raters
      .change(c.id, ratersBody(ratersChange(current, after)))
      .then((r) => onDone(r, ratersDone(r, name)))
      .catch((e: unknown) => {
        setBusy(false);
        setWhy(refused(e));
      });
  };
  return (
    <Dialog
      title={`Raters of ${c.name}`}
      icon="users"
      onClose={onClose}
      foot={
        <div className="row actions">
          <span className="meta grow">{needs === null ? plan : `Needs ${needs}.`}</span>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="button" disabled={busy || needs !== null} onClick={go}>
            Change raters
          </button>
        </div>
      }
    >
      <fieldset className="field">
        <legend className="label">Rating</legend>
        <span className="chips" role="group" aria-label="Raters">
          {options.map((p) => (
            <button key={p} type="button" className={will.includes(p) ? "opt on" : "opt"} aria-pressed={will.includes(p)} title={p} onClick={() => toggle(p)}>
              {name(p)}
            </button>
          ))}
        </span>
      </fieldset>
      {people === null && (
        <label className="field">
          <span className="label">Add · optional</span>
          <span className="input mono">
            <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="a principal, or several separated by commas" aria-label="Add a rater" />
          </span>
        </label>
      )}
      {why && <p className="warn">{why}</p>}
    </Dialog>
  );
}
