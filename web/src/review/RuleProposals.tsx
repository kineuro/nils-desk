// SPDX-License-Identifier: AGPL-3.0-only
// The proposed rule changes (record 56, sections 5.3, 6.4 and 6.5): the ones
// waiting for a person first, each on its approval card with its effect and
// any answer it breaks with its scans, then the ones decided, folded. A card
// stays where it is once adopted, so the line that follows its re-sort stays
// in sight. Opened by its address (#review/rules/proposals/<id>), a card
// shows its report; opened for a dataset (?dataset=), the list holds the
// proposals that touch it.

import { useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { href, narrow } from "../routes";
import { Wait } from "../ui/Wait";
import { refusalWords, type PackDoc } from "./client";
import type { Proposal, Status } from "./proposals";
import { RuleApproval } from "./RuleApproval";
import { mayRehearse, rulesDoors } from "./rulesDoors";

const n = (v: number) => v.toLocaleString("en-US");

type Load = { kind: "loading"; since: number } | { kind: "failed"; why: string } | { kind: "ready"; proposals: Proposal[] };

export interface ProposalsProps {
  caps: Capabilities;
  pack: PackDoc;
  dataset: string | null;
  /** The proposal the address opened. */
  opened: number | null;
  /** A decision, said for the page, with the status it moved from and to: said once per proposal. */
  onDecided: (words: string, from: Status, to: Status) => void;
  /** What a card says later, its re-sort ended or its rehearsal made again. */
  onSaid: (words: string) => void;
  /** Change it: the proposal handed to the form. */
  onChange?: (p: Proposal) => void;
  onOpen?: (stack: number) => void;
}

export function RuleProposals({ caps, pack, dataset, opened, onDecided, onSaid, onChange, onOpen }: ProposalsProps) {
  const [load, setLoad] = useState<Load>(() => ({ kind: "loading", since: Date.now() }));
  // the proposals decided here, each said once to the page's counts
  const [decidedHere] = useState(() => new Set<number>());
  const [extra, setExtra] = useState<Proposal | null>(null);
  useEffect(() => {
    let alive = true;
    setLoad({ kind: "loading", since: Date.now() });
    // the waiting ones read on their own, so older decided ones never push them past the list's end
    Promise.all([
      rulesDoors.proposals(pack.pack, { dataset, status: "proposed", limit: 500 }),
      rulesDoors.proposals(pack.pack, { dataset }),
    ]).then(
      ([w, r]) => {
        if (!alive) return;
        const seen = new Set(w.proposals.map((p) => p.id));
        setLoad({ kind: "ready", proposals: [...w.proposals, ...r.proposals.filter((p) => !seen.has(p.id))] });
      },
      (e: unknown) => alive && setLoad({ kind: "failed", why: refusalWords(e) }),
    );
    return () => {
      alive = false;
    };
  }, [pack.pack, dataset]);

  // the opened one, where the list does not hold it (another dataset's, or past the list's end)
  const listed = load.kind === "ready" && opened !== null && load.proposals.some((p) => p.id === opened);
  useEffect(() => {
    if (opened === null || load.kind !== "ready" || listed) return;
    let alive = true;
    rulesDoors.proposal(pack.pack, opened).then(
      (p) => alive && setExtra(p),
      () => alive && setExtra(null),
    );
    return () => {
      alive = false;
    };
  }, [opened, load.kind, listed, pack.pack]);

  // the opened card comes into sight once it is drawn
  useEffect(() => {
    if (opened === null || load.kind !== "ready") return;
    document.getElementById(`rule-change-${opened}`)?.scrollIntoView?.({ block: "nearest" });
  }, [opened, load.kind, extra]);

  if (load.kind === "loading") return <Wait phase="reading the proposals" since={load.since} size="panel" />;
  if (load.kind === "failed") return <p className="warn">The proposals could not be read: {load.why}</p>;
  const all = extra && !listed ? [extra, ...load.proposals] : load.proposals;
  const waiting = all.filter((p) => p.status === "proposed");
  const decided = all.filter((p) => p.status !== "proposed");
  const card = (p: Proposal) => (
    <div key={p.id} id={`rule-change-${p.id}`} className={p.id === opened ? "rp-card opened" : "rp-card"}>
      <RuleApproval
        caps={caps}
        pack={pack}
        proposal={p}
        open={p.id === opened}
        onChange={onChange}
        onOpen={onOpen}
        onChanged={(next, words) => {
          if (next.status !== p.status && !decidedHere.has(p.id)) {
            decidedHere.add(p.id);
            onDecided(words, p.status, next.status);
          } else onSaid(words);
        }}
      />
    </div>
  );
  return (
    <div className="rp">
      {waiting.length === 0 && (
        <div className="rp-none">
          <p>{dataset ? `No change waits for you on ${dataset}.` : "No change waits for you."}</p>
          {mayRehearse(caps) && (
            <a className="button secondary" href={narrow(href("review", "rules", "change"), { dataset: dataset ?? undefined })}>
              Change a rule
            </a>
          )}
        </div>
      )}
      {waiting.map(card)}
      {decided.length > 0 && (
        <details className="rp-decided" open={decided.some((p) => p.id === opened)}>
          <summary>
            <span className="eyebrow">Decided</span>
            <span className="meta">
              {n(decided.filter((p) => p.status === "adopted").length)} adopted · {n(decided.filter((p) => p.status === "rejected").length)} not adopted
              {decided.some((p) => p.status === "retired") ? ` · ${n(decided.filter((p) => p.status === "retired").length)} retired` : ""}
            </span>
          </summary>
          <div className="rp-list">{decided.map(card)}</div>
        </details>
      )}
    </div>
  );
}
