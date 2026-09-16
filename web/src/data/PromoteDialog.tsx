// SPDX-License-Identifier: AGPL-3.0-only
// New cohort from a card (record 27, R5c): a complete answer at any grain
// becomes members, the subjects of its rows. Every field of the old dialog
// stands; what the promotion carries with it is one disclosure. The engine
// files them as a job, and the cohort's card is on Data / Cohorts at once.

import { useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { href } from "../routes";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { Says, Values } from "../ui/Says";
import { cohorts, type Cohort } from "./cohorts";

const n = (v: number) => v.toLocaleString("en-US");

export interface PromotedCard {
  id: number;
  name: string;
  version: string | null;
}

export interface PromotedAnswer {
  handle: number;
  rows: number;
  grain: string;
  subjects: number | null;
  epoch: number | null;
}

/** The cohort name a card suggests: its name as one word. */
export function suggestedCohort(card: string): string {
  return card.trim().toLowerCase().replace(/[^\p{L}\p{N}_.-]+/gu, "-").replace(/^-+|-+$/g, "");
}

/** What the answer is, in words: 96 sessions of 84 subjects, or 84 subjects. */
export function answerWords(a: PromotedAnswer): string {
  const rows = `${n(a.rows)} ${a.grain}${a.rows === 1 ? "" : "s"}`;
  if (a.grain === "subject" || a.subjects === null) return rows;
  return `${rows} of ${n(a.subjects)} subjects`;
}

export function PromoteDialog({ caps, card, answer, onClose }: { caps: Capabilities; card: PromotedCard; answer: PromotedAnswer; onClose: () => void }) {
  const [name, setName] = useState(() => suggestedCohort(card.name));
  const [owner, setOwner] = useState(caps.person.display_name || caps.person.subject);
  const [why, setWhy] = useState("");
  const [into, setInto] = useState<"new" | "existing">("new");
  const [existing, setExisting] = useState("");
  const [list, setList] = useState<Cohort[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [made, setMade] = useState<{ cohort: string; job: number } | null>(null);
  const lists = served(caps, "GET /api/cohorts");

  useEffect(() => {
    if (!lists) return;
    let alive = true;
    cohorts.list().then(
      (l) => alive && setList(l.filter((c) => !c.retired_at)),
      () => alive && setList([]),
    );
    return () => {
      alive = false;
    };
  }, [lists]);

  const cohort = into === "new" ? name.trim() : existing;
  const refusal = into === "new" ? (cohort === "" ? "a name" : list?.some((c) => c.name === cohort) ? "another name; that one is taken" : null) : cohort === "" ? "a cohort to add them to" : null;
  const subjects = answer.subjects ?? (answer.grain === "subject" ? answer.rows : null);
  const who = subjects !== null ? `The ${n(subjects)} subjects of these ${answer.grain === "subject" ? "rows" : `${answer.grain}s`}` : `The subjects of these ${answer.grain}s`;

  const go = () => {
    setBusy(true);
    setFailed(null);
    cohorts
      .promote(answer.handle, { cohort, create: into === "new", ...(why.trim() ? { reason: why.trim() } : {}) })
      .then((r) => setMade({ cohort, job: r.job }))
      .catch((e: Error) => {
        setBusy(false);
        setFailed(e.message);
      });
  };

  if (made) {
    return (
      <Dialog
        title={into === "new" ? "The cohort is being made" : "They are joining"}
        icon="users"
        onClose={onClose}
        foot={
          <div className="row actions">
            <span className="meta grow">Job {made.job} files the memberships.</span>
            <button type="button" className="button secondary" onClick={onClose}>
              Close
            </button>
            <a className="button" href={href("data", "cohorts", made.cohort)}>
              <Icon name="users" />
              Open {made.cohort}
            </a>
          </div>
        }
      >
        <p>
          {who.charAt(0).toLowerCase() + who.slice(1)} join <span className="path">{made.cohort}</span>.
        </p>
      </Dialog>
    );
  }

  return (
    <Dialog
      title="New cohort from this card"
      icon="users"
      onClose={onClose}
      foot={
        <div className="row actions">
          <span className="meta grow">{refusal ? `Needs ${refusal}.` : "It appears on Cohorts at once."}</span>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="button" disabled={busy || refusal !== null} onClick={go}>
            {into === "new" ? "Make the cohort" : "Add them"}
          </button>
        </div>
      }
    >
      <Values
        cells={[
          { k: "card", v: card.version ? `${card.name} · version ${card.version}` : card.name },
          { k: "answer", v: `${answerWords(answer)} · complete` },
        ]}
      />
      <div className="field">
        <span className="label">Who joins</span>
        <div className="choices">
          <label className="radio-row">
            <input type="radio" name="into" checked={into === "new"} onChange={() => setInto("new")} />
            <span>
              <b>{who}, as a new cohort</b>
            </span>
          </label>
          <label className="radio-row">
            <input type="radio" name="into" checked={into === "existing"} onChange={() => setInto("existing")} />
            <span>
              <b>Add them to an existing cohort</b>
              <span className="meta">subjects already in it stay as they are</span>
            </span>
          </label>
        </div>
      </div>
      {into === "new" ? (
        <div className="fields2">
          <label className="field">
            <span className="label">Name</span>
            <span className="input mono">
              <input value={name} autoFocus onChange={(e) => setName(e.target.value)} />
            </span>
          </label>
          <label className="field">
            <span className="label">Owner</span>
            <span className="input">
              <input value={owner} onChange={(e) => setOwner(e.target.value)} />
            </span>
          </label>
        </div>
      ) : (
        <label className="field">
          <span className="label">Cohort</span>
          <span className="input">
            <select value={existing} onChange={(e) => setExisting(e.target.value)}>
              <option value="">{list === null ? (lists ? "reading the cohorts" : "type a name below") : list.length === 0 ? "no cohort yet" : "choose a cohort"}</option>
              {(list ?? []).map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name} · {n(c.subjects)} subjects
                </option>
              ))}
            </select>
          </span>
          {!lists && (
            <span className="input mono">
              <input value={existing} placeholder="the cohort's name" onChange={(e) => setExisting(e.target.value)} />
            </span>
          )}
        </label>
      )}
      <label className="field">
        <span className="label">Why</span>
        <span className="input">
          <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="the 7T arm of the grant" />
        </span>
      </label>
      <Says head="What the cohort keeps from this card">
        A cohort names people; the card goes on naming what of theirs, so a release from it gives exactly them. The card is pinned by the cohort, and which version of it answered is kept on every
        membership. When new rows land, run the card again and promote it again: only the new subjects join.
        {into === "new" && owner.trim() !== "" ? ` The owner is recorded as ${owner.trim()}.` : ""}
      </Says>
      {failed && <p className="warn">{failed}</p>}
    </Dialog>
  );
}
