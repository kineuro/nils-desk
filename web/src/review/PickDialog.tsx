// SPDX-License-Identifier: AGPL-3.0-only
// A `pick.border` item opened (record 45 S5): the occasion the run doubts on
// the session board, and three acts. Pick writes a person's pick with its
// why, which a later pick run leaves standing and which answers the item;
// Keep the run's pick acknowledges the item and writes nothing else; Withdraw
// takes a person's pick back, so the run's pick applies again. Refusals are
// the engine's own words.

import { useState } from "react";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";
import { ops, type ReviewItem } from "../ops/client";
import { Dialog } from "../ui/Dialog";
import { Says } from "../ui/Says";
import { refusalWords } from "./client";
import { answeredIndex, borderOf, borderWords, occasionWords, pickBody, picks, type Border } from "./picks";
import { SessionBoard } from "./SessionBoard";

/** What a person may do with a border, by grant and door; each null is a reason it is not offered. */
export function pickActs(caps: Capabilities, b: Border): { pick: boolean; keep: boolean; withdraw: boolean } {
  const work = may(caps, "review:work");
  const open = b.status === "open";
  return {
    pick: work && open && served(caps, "POST /api/picks") && b.candidates.length > 0,
    keep: work && open && b.runPick !== null && served(caps, "POST /api/review/{id}/accept"),
    withdraw: work && b.answered !== null && served(caps, "POST /api/picks/{id}/withdraw"),
  };
}

export function PickDialog({ caps, item, onClose, onDone, pictures = true }: { caps: Capabilities; item: ReviewItem; onClose: () => void; onDone: (words: string) => void; pictures?: boolean }) {
  const b = borderOf(item);
  const [main, setMain] = useState<number | null>(() => (b ? answeredIndex(b) : null));
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  if (!b) return null;
  const acts = pickActs(caps, b);
  const run = (work: Promise<unknown>, words: string) => {
    setBusy(true);
    setRefused(null);
    work.then(
      () => onDone(words),
      (e: unknown) => {
        setBusy(false);
        setRefused(refusalWords(e));
      },
    );
  };
  const pick = () => main !== null && run(picks.set(pickBody(b, b.candidates[main].stacks, why)), `Picked stacks ${b.candidates[main].stacks.join(", ")} as ${occasionWords(b)}. A pick run leaves it standing.`);
  const keep = () => run(ops.reviewAccept(b.item, why.trim() || "kept the run's pick"), `Kept the run's pick for ${occasionWords(b)}.`);
  const withdraw = () => b.answered && run(picks.withdraw(b.answered.pick, why.trim() || undefined), `Withdrew the pick for ${occasionWords(b)}; the run's pick applies again.`);
  return (
    <Dialog
      title={`Pick ${b.role || "a role"}`}
      icon="review"
      onClose={onClose}
      foot={
        <div className="row actions">
          {acts.pick && (
            <button type="button" className="button" disabled={busy || main === null || why.trim() === ""} onClick={pick}>
              Pick
            </button>
          )}
          {acts.keep && (
            <button type="button" className="button secondary" disabled={busy} onClick={keep}>
              Keep the run&apos;s pick
            </button>
          )}
          {acts.withdraw && (
            <button type="button" className="button secondary" disabled={busy} onClick={withdraw}>
              Withdraw my pick
            </button>
          )}
          <button type="button" className="button quiet" onClick={onClose}>
            Close
          </button>
          {refused && <span className="warn">{refused}</span>}
        </div>
      }
    >
      <p className="lede">
        {occasionWords(b)}: {borderWords(b)}
        {b.margin !== null ? ` · margin ${b.margin.toFixed(2)}` : ""}
      </p>
      {b.answered && (
        <p className="meta">
          A person picked stacks {b.answered.stacks.join(", ")}
          {b.answered.why ? `: ${b.answered.why}` : ""}.
        </p>
      )}
      <SessionBoard candidates={b.candidates} main={main} onMain={acts.pick ? setMain : null} why={why} onWhy={acts.pick || acts.keep || acts.withdraw ? setWhy : null} pictures={pictures} />
      <Says head="What a pick is worth">
        A person&apos;s pick stands through every later pick run, which writes its own beside it as evidence and raises no border here again. Withdrawing it lets the run&apos;s pick apply again.
      </Says>
    </Dialog>
  );
}
