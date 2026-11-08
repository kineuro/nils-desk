// SPDX-License-Identifier: AGPL-3.0-only
// Review / Proposals per model and axis (UX round 1, 2026-11-05): a change
// matrix whose every cell is opened and committed by hand is too much work
// for what is wanted, the confident answers in force and the rest read by
// oneself. Each model's proposals on an axis are a card with two acts: commit
// the ones at or above its threshold, and make the rest a campaign with the
// person its one rater and the model's answer filled in.
// UX round 5 (2026-11-08): the commit's confirm says what happens in a
// person's words and nothing else, its button goes quiet while the call is
// out, and the dialog closes the moment the engine answers; the page follows
// the re-sort. The campaign of the rest asks how many (500, or the whole N)
// and which first, and says how long it would take at the axis's pace, so a
// campaign nobody can finish is never one click.

import { useState } from "react";
import { href } from "../routes";
import { Dialog } from "../ui/Dialog";
import { refusalWords } from "./client";
import { campaignWords, commitWords, REST_LIMIT, REST_ORDERS, standingDoors, thresholdWords, type CommitAnswer, type RestOrder, type Standing } from "./modelFamily";
import { estimateWords } from "./resort";
import { axisTitle, modelInWords, modelSub, modelWords } from "./work";
import "./modelStanding.css";

const n = (v: number) => v.toLocaleString("en-US");

/** One model's proposals on one axis: what waits, and the two acts. */
export function StandingCard({ s, acts, onCommit, onCampaign }: { s: Standing; acts: { commit: boolean; campaign: boolean }; onCommit: () => void; onCampaign: () => void }) {
  const nothing = s.commit.stacks === 0 && s.below.stacks === 0;
  return (
    <article className="panel card proposal-card" aria-label={`${s.axis} by ${s.label}`}>
      <div className="row card-head">
        <h2>{s.axis}</h2>
        <span className="meta" title={modelSub(s)}>
          {modelWords(s)}
        </span>
        <span className="meta path">{modelSub(s)}</span>
        <span className="meta">{thresholdWords(s.threshold)}</span>
      </div>
      {!nothing && (
        <div className="row actions proposal-acts">
          {s.commit.stacks > 0 && (
            <button type="button" className="button" disabled={!acts.commit} onClick={onCommit}>
              {commitWords(s)}
            </button>
          )}
          {s.below.stacks > 0 && (
            <button type="button" className={s.commit.stacks > 0 ? "button secondary" : "button"} disabled={!acts.campaign} onClick={onCampaign}>
              {campaignWords(s)}
            </button>
          )}
        </div>
      )}
      {(s.held.stacks > 0 || s.asked.stacks > 0) && (
        <p className="meta">
          {s.held.stacks > 0 && <>{n(s.held.stacks)} staged wait for an open campaign to close. </>}
          {s.asked.stacks > 0 && (
            <>
              {n(s.asked.stacks)} asked in{" "}
              {s.campaigns.map((c, i) => (
                <span key={c.id || c.name}>
                  {i > 0 && ", "}
                  {c.id > 0 ? <a href={href("review", "campaigns", String(c.id))}>{c.name}</a> : c.name}
                </span>
              ))}
              .
            </>
          )}
        </p>
      )}
    </article>
  );
}

/** The confirm's one paragraph (finding 3): what the scans get, from whom, at what, in whose name, and when every page shows it. */
export function confirmWords(s: Standing): string {
  const at = s.threshold === null ? "" : `, at ${s.threshold.toFixed(2)} or above`;
  return `${n(s.commit.stacks)} scans get ${axisTitle(s.axis).toLowerCase()} = what the model proposed${at}, in your name. Every page shows it once they are sorted again.`;
}

/** The confirm of a commit: one paragraph, Commit, Cancel. The button goes quiet while the call is out; the dialog closes on the answer. */
export function CommitStandingDialog({ s, onClose, onDone }: { s: Standing; onClose: () => void; onDone: (answer: CommitAnswer) => void }) {
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const go = () => {
    if (busy) return;
    setBusy(true);
    setRefused(null);
    standingDoors.commit(s).then(
      (r) => onDone(r),
      (e: unknown) => {
        setBusy(false);
        setRefused(refusalWords(e));
      },
    );
  };
  return (
    <Dialog
      title="Commit at or above the threshold"
      icon="review"
      onClose={onClose}
      foot={
        <div className="row actions">
          <button type="button" className="button" disabled={busy} aria-busy={busy || undefined} onClick={go}>
            {busy ? "Committing…" : `Commit ${n(s.commit.stacks)}`}
          </button>
          <button type="button" className="button secondary" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          {refused && <span className="warn">{refused}</span>}
        </div>
      }
    >
      <p className="lede">{confirmWords(s)}</p>
    </Dialog>
  );
}

/** The choices of how many: the default cap, and the whole lot where it is more. */
export function limitChoices(below: number): { limit: number; words: string }[] {
  if (below <= REST_LIMIT) return [{ limit: below, words: `All ${n(below)}` }];
  return [
    { limit: REST_LIMIT, words: n(REST_LIMIT) },
    { limit: below, words: `All ${n(below)}` },
  ];
}

/** A campaign of the rest: its name, how many, which first, and what it would take; it lands on the new campaign. */
export function RestCampaignDialog({ s, onClose, onMade }: { s: Standing; onClose: () => void; onMade?: (id: number) => void }) {
  const [name, setName] = useState(s.name);
  const choices = limitChoices(s.below.stacks);
  const [limit, setLimit] = useState(choices[0].limit);
  const [order, setOrder] = useState<RestOrder>("least_sure");
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const estimate = estimateWords(limit, s.pace);
  const go = () => {
    if (busy) return;
    setBusy(true);
    setRefused(null);
    standingDoors.campaign(s, name, limit, order).then(
      (r) => {
        if (onMade) onMade(r.campaign.id);
        else location.hash = href("review", "campaigns", String(r.campaign.id));
      },
      (e: unknown) => {
        setBusy(false);
        setRefused(refusalWords(e));
      },
    );
  };
  return (
    <Dialog
      title="A campaign for you"
      icon="review"
      onClose={onClose}
      foot={
        <div className="row actions">
          <button type="button" className="button" disabled={busy || name.trim() === ""} onClick={go}>
            Make a campaign of {n(limit)}
          </button>
          <button type="button" className="button secondary" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          {refused && <span className="warn">{refused}</span>}
        </div>
      }
    >
      <p className="lede">
        {n(s.below.stacks)} scans {modelInWords(s)} is unsure of, below {s.threshold === null ? "its threshold" : s.threshold.toFixed(2)}: its answer filled in, for you to accept or correct.
      </p>
      <label className="field">
        <span className="label">Name</span>
        <span className="input mono">
          <input value={name} onChange={(e) => setName(e.target.value)} spellCheck={false} />
        </span>
      </label>
      <fieldset className="field rest-choice">
        <legend className="label">How many</legend>
        <div className="chips" role="radiogroup" aria-label="How many">
          {choices.map((c) => (
            <button key={c.limit} type="button" role="radio" aria-checked={limit === c.limit} className={limit === c.limit ? "opt on" : "opt"} onClick={() => setLimit(c.limit)}>
              {c.words}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="field rest-choice">
        <legend className="label">Which first</legend>
        <div className="chips" role="radiogroup" aria-label="Which first">
          {REST_ORDERS.map((o) => (
            <button key={o.order} type="button" role="radio" aria-checked={order === o.order} className={order === o.order ? "opt on" : "opt"} onClick={() => setOrder(o.order)}>
              {o.words}
            </button>
          ))}
        </div>
      </fieldset>
      <p className="meta rest-estimate">{estimate ? `You alone read them: ${estimate}.` : "You alone read them."}</p>
    </Dialog>
  );
}
