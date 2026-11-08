// SPDX-License-Identifier: AGPL-3.0-only
// Review / Proposals per model and axis (UX round 1, 2026-11-05): a change
// matrix whose every cell is opened and committed by hand is too much work
// for what is wanted, the confident answers in force and the rest read by
// oneself. Each model's
// proposals on an axis are a card with two acts: commit the ones at or above
// its threshold (a confirm that counts them and says the scans re-sort), and
// make the rest a campaign with the person its one rater and the model's
// answer filled in, which lands on the new campaign's page.

import { useState } from "react";
import { href } from "../routes";
import { Dialog } from "../ui/Dialog";
import { refusalWords } from "./client";
import { campaignWords, commitWords, committedStandingWords, standingDoors, thresholdWords, type Standing } from "./modelFamily";

const n = (v: number) => v.toLocaleString("en-US");

/** One model's proposals on one axis: what waits, and the two acts. */
export function StandingCard({ s, acts, onCommit, onCampaign, reviewHref = null }: { s: Standing; acts: { commit: boolean; campaign: boolean }; onCommit: () => void; onCampaign: () => void; reviewHref?: string | null }) {
  const nothing = s.commit.stacks === 0 && s.below.stacks === 0;
  return (
    <article className="panel card proposal-card" aria-label={`${s.axis} by ${s.label}`}>
      <div className="row card-head">
        <h2>{s.axis}</h2>
        <span className="meta path">{s.label}</span>
        <span className="meta">{thresholdWords(s.threshold)}</span>
      </div>
      {!nothing && (
        <div className="row actions proposal-acts">
          {s.commit.stacks > 0 && (
            <button type="button" className="button" disabled={!acts.commit} onClick={onCommit}>
              {commitWords(s)}
            </button>
          )}
          {reviewHref && s.below.stacks > 0 && (
            <a className="button" href={reviewHref}>
              Review the {n(s.below.stacks)}
            </a>
          )}
          {s.below.stacks > 0 && (
            <button type="button" className={s.commit.stacks > 0 || reviewHref ? "button secondary" : "button"} disabled={!acts.campaign} onClick={onCampaign}>
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

/** The confirm of a commit: how many, what it changes, and that the scans re-sort. */
export function CommitStandingDialog({ s, onClose, onDone }: { s: Standing; onClose: () => void; onDone: (words: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const go = () => {
    setBusy(true);
    setRefused(null);
    standingDoors.commit(s).then(
      (r) => onDone(committedStandingWords(s, r)),
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
          <button type="button" className="button" disabled={busy} onClick={go}>
            Commit {n(s.commit.stacks)}
          </button>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          {refused && <span className="warn">{refused}</span>}
        </div>
      }
    >
      <p className="lede">
        {n(s.commit.stacks)} scans take {s.label}&apos;s {s.axis}, each at or above {s.threshold === null ? "its threshold" : s.threshold.toFixed(2)}.
      </p>
      <p className="meta">
        In force under your name, and re-sorted, so every page shows the new {s.axis}.
        {s.drifted > 0 && " Some were proposed before the data changed; committed as proposed."}
        {s.held.stacks > 0 && ` ${n(s.held.stacks)} more wait for their campaign.`}
        {s.below.stacks > 0 && ` The ${n(s.below.stacks)} below stay asked.`}
      </p>
    </Dialog>
  );
}

/** A campaign of the rest: only its name is asked, prefilled; it lands on the new campaign. */
export function RestCampaignDialog({ s, onClose, onMade }: { s: Standing; onClose: () => void; onMade?: (id: number) => void }) {
  const [name, setName] = useState(s.name);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const go = () => {
    setBusy(true);
    setRefused(null);
    standingDoors.campaign(s, name).then(
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
            Make it
          </button>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          {refused && <span className="warn">{refused}</span>}
        </div>
      }
    >
      <p className="lede">
        {n(s.below.stacks)} scans below {s.threshold === null ? "the threshold" : s.threshold.toFixed(2)}: {s.label}&apos;s {s.axis} filled in, for you to accept or correct.
      </p>
      <label className="field">
        <span className="label">Name</span>
        <span className="input mono">
          <input value={name} onChange={(e) => setName(e.target.value)} spellCheck={false} />
        </span>
      </label>
      <p className="meta">You alone read it. Like scans are accepted together in its gallery. Closing it puts your answers in force.</p>
    </Dialog>
  );
}
