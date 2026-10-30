// SPDX-License-Identifier: AGPL-3.0-only
// The rule reviews on the Rules page (record 58 P2, record 56's loop): each
// graded audit round that found a wrong stack, with one press to its rule
// review, the campaign over those stacks where the rules' answer and its
// evidence are read and proposals are made. The review belongs to the
// round's draw, not to a proposal. Opened by the engine once: a review
// already open is a link, one not yet open is opened and then followed.

import { useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";
import { href } from "../routes";
import { s1, type Draw } from "./s1";

/** Whether this person on this engine reads the rounds' reviews, and may open one. */
export function reviewsOf(caps: Capabilities): { reads: boolean; opens: boolean } {
  const reads = served(caps, "GET /api/audit/draws") && (may(caps, "review:see") || may(caps, "campaigns:see"));
  const opens = reads && served(caps, "POST /api/audit/draws/{id}/rule-review") && may(caps, "review:work") && may(caps, "campaigns:work");
  return { reads, opens };
}

/** The draws a rule review is for: graded, with a wrong stack, newest first. */
export function reviewable(draws: Draw[]): Draw[] {
  return draws.filter((d) => (d.grade?.wrong ?? 0) > 0).sort((a, b) => b.id - a.id);
}

export interface RuleReviewsProps {
  caps: Capabilities;
  /** Something said on failure. */
  onSaid?: (words: string) => void;
}

export function RuleReviews({ caps, onSaid }: RuleReviewsProps) {
  const { reads, opens } = reviewsOf(caps);
  const [draws, setDraws] = useState<Draw[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  useEffect(() => {
    if (!reads) return;
    let alive = true;
    s1.draws().then(
      (r) => alive && setDraws(reviewable(r.draws)),
      () => alive && setDraws([]),
    );
    return () => {
      alive = false;
    };
  }, [reads]);
  if (!reads || !draws || draws.length === 0) return null;
  const open = (d: Draw) => {
    setBusy(d.id);
    s1.ruleReview(d.id).then(
      (r) => {
        setBusy(null);
        if (r.rule_review) location.hash = href("review", "campaigns", String(r.rule_review.campaign_id));
      },
      (e: Error) => {
        setBusy(null);
        onSaid?.(`The rule review did not open: ${e.message}`);
      },
    );
  };
  return (
    <ul className="rule-reviews" aria-label="Rule reviews">
      {draws.map((d) => {
        const at = d.campaigns?.rule_review ?? null;
        return (
          <li key={d.id}>
            <span>
              Round {d.round_id}, audit {d.id}: {d.grade!.wrong} wrong of {d.grade!.read}
            </span>
            {at !== null ? (
              <a className="button secondary small" href={href("review", "campaigns", String(at))}>
                Review
              </a>
            ) : (
              opens && (
                <button type="button" className="button secondary small" disabled={busy === d.id} onClick={() => open(d)}>
                  Review
                </button>
              )
            )}
          </li>
        );
      })}
    </ul>
  );
}
