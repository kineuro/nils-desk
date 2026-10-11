// SPDX-License-Identifier: AGPL-3.0-only
// A check on its campaign page (job type 3, record 55 H3; the build spec of
// 2026-10-11, section 9.1, slice D2): the counts by verdict and by reason
// as tags, the pace, the agreement where two read, and one next action:
// Continue checking while results are open, Close and write the checks
// once none is, with the line of what the close writes.

import { useEffect, useState } from "react";
import type React from "react";
import type { Capabilities } from "../capabilities";
import { href } from "../routes";
import { checkDoors, checkQuestionOf, checkTag, verdictLine, VERDICTS, type CheckStats } from "./check";
import { kappa, pct, principalOf, rateRefusal, refused as refusedWords, type Campaign } from "./client";
import { slotOf } from "./values";

/** The page's one next action for a check, and whether it is the close. */
export function checkActs(caps: Capabilities, c: Campaign): { head: React.ReactNode; closes: boolean } {
  const open = c.counts.items.open ?? 0;
  const reads = rateRefusal(caps, c) === null && open > 0;
  return {
    head: reads ? (
      <a className="button" href={href("campaigns", String(c.id), "check")}>
        Continue checking
      </a>
    ) : null,
    closes: c.status !== "closed" && open === 0,
  };
}

export function CheckPanel({ caps, campaign: c }: { caps: Capabilities; campaign: Campaign }) {
  const [s, setS] = useState<CheckStats | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  useEffect(() => {
    checkDoors.stats(c.id, principalOf(caps)).then(setS, (e: unknown) => setWhy(refusedWords(e)));
  }, [c.id, caps]);
  const q = checkQuestionOf(c);
  const ids = q.reasons.map((r) => r.id);
  const a = c.agreement as (Campaign["agreement"] & { reasons?: { items?: number; jaccard?: number | null } }) | null;
  const two = c.raters_per_item > 1;
  return (
    <div className="check-panel">
      {why && <p className="warn">{why}</p>}
      {s && (
        <>
          <p className="check-line">
            <b>{verdictLine(s.verdicts)}</b>
            {s.own && <span className="meta"> · your answers</span>}
            {s.median !== null && <span className="meta"> · median {s.median} s</span>}
          </p>
          <div className="chips check-counts" aria-label="by verdict and by reason">
            {VERDICTS.filter((v) => (s.verdicts[v] ?? 0) > 0).map((v) => (
              <span key={v} className={checkTag(v).className}>
                {checkTag(v).words} <b>{(s.verdicts[v] ?? 0).toLocaleString("en-US")}</b>
              </span>
            ))}
            {q.reasons
              .filter((r) => (s.reasons[r.id] ?? 0) > 0)
              .map((r) => (
                <span key={r.id} className="value-tag" data-slot={slotOf(ids, r.id) ?? undefined}>
                  {r.words} <b>{(s.reasons[r.id] ?? 0).toLocaleString("en-US")}</b>
                </span>
              ))}
          </div>
        </>
      )}
      {two && a && (
        <p className="meta">
          Agreement {pct(a.exact)} · κ {kappa(a.cohen_kappa ?? a.fleiss_kappa)}
          {a.reasons && typeof a.reasons.jaccard === "number" && ` · reasons overlap ${pct(a.reasons.jaccard)}`}
        </p>
      )}
    </div>
  );
}
