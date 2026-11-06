// SPDX-License-Identifier: AGPL-3.0-only
// Ask one axis alone in an open campaign (2026-11-06): the gallery shows one
// axis at a time, so a campaign asking two had none. The person picks the
// axis (the first by default), the engine's dry run says what changes (asked,
// derived from it, no longer asked, the answers given kept), and one press
// moves the campaign. Nothing changes before that press.

import { Fragment, useEffect, useState } from "react";
import { Dialog } from "../ui/Dialog";
import { answeredAxes, campaigns, refused, type Campaign, type Requestioned } from "./client";
import { askOnePlan, askOneRefused, askOneSaid } from "./upkeep";

export function AskOneDialog({ campaign: c, onClose, onDone }: { campaign: Campaign; onClose: () => void; onDone: (words: string) => void }) {
  const axes = answeredAxes(c.question);
  const [axis, setAxis] = useState(axes[0] ?? "");
  const [plan, setPlan] = useState<Requestioned | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    setPlan(null);
    setWhy(null);
    campaigns
      .requestion(c.id, [axis], true)
      .then((r) => alive && setPlan(r))
      .catch((e: unknown) => alive && setWhy(askOneRefused(refused(e))));
    return () => {
      alive = false;
    };
  }, [c.id, axis]);
  const go = () => {
    setBusy(true);
    setWhy(null);
    campaigns
      .requestion(c.id, [axis])
      .then((r) => onDone(askOneSaid(r)))
      .catch((e: unknown) => {
        setBusy(false);
        setWhy(askOneRefused(refused(e)));
      });
  };
  return (
    <Dialog
      title="Ask one axis"
      eyebrow={c.name}
      icon="grid"
      onClose={onClose}
      foot={
        <div className="row actions">
          <span className="meta grow">{plan || why ? "" : "Checking what changes…"}</span>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="button" disabled={busy || plan === null} onClick={go}>
            Ask {axis} alone
          </button>
        </div>
      }
    >
      {axes.length > 1 && (
        <fieldset className="field plain-set">
          <legend className="label">Axis</legend>
          <span className="chips" role="group" aria-label="Axis">
            {axes.map((a) => (
              <button key={a} type="button" className={a === axis ? "opt on" : "opt"} aria-pressed={a === axis} onClick={() => setAxis(a)}>
                {a}
              </button>
            ))}
          </span>
        </fieldset>
      )}
      {plan && (
        <dl className="facts ask-one-plan">
          {askOnePlan(plan).map((row) => (
            <Fragment key={row.k}>
              <dt>{row.k}</dt>
              <dd>{row.v}</dd>
            </Fragment>
          ))}
        </dl>
      )}
      {why && <p className="warn">{why}</p>}
    </Dialog>
  );
}
