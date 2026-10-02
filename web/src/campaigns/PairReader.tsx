// SPDX-License-Identifier: AGPL-3.0-only
// Pair mode (the post-contrast study, P6). Nima reads the picture gold of
// whether contrast was given two stacks at a time: a pre/post candidate pair
// of one session, a same-header rerun included, side by side, left and right
// as the engine's seed drew them. The page shows the two pictures and
// nothing else of either stack: no time, no series name, no header, no
// value the rules gave, not even a stack's number. One key answers: 1 the
// left is post, 2 the right is post, 3 both pre, 4 both post, 5 can't tell;
// Enter sends it. Both sides are scaled by their own reference tissue and
// shown under one window by default, which a drag on either moves for both
// (`w` gives each its own window again), so enhancement is not normalised
// away; where the two stacks' geometry matches, paging one pages the other
// to the same place (`l` lets them go and brings them back). 7 to 0 jump
// to the ventricles, the sinuses and the sella, approximately. The arrows
// page the side under the pointer. `b` opens one's last answer again (and
// again the one before), `m` lists one's answers by pair; an answer opened
// shows the same two pictures with it marked, and another choice and Enter
// correct it (the engine keeps the earlier answer). The pair leased stays
// leased.
//
// The page itself is the comparison reader (CompareReader.tsx), which
// anchored reading shares: the view kept per campaign and rater (for each
// side where the rater chooses), the next pairs warmed while this one is
// read, the answers apart from the view's controls.

import { useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { isViewMode, type ViewMode } from "../viewer/view";
import { refused as refusedWords, type Campaign, type Item } from "./client";
import { CompareReader, type CompareSpec } from "./CompareReader";
import { ANSWER_WORDS, answerCounts, PAIR_ANSWERS, pairDoors, sidesOf, SIDES, type PairAnswer, type PairSummary } from "./pair";

/** The view the pair page kept before it kept one per campaign: the first choice on a campaign read for the first time. */
const VIEW_KEY = "nils.pair.view";
function legacyView(): ViewMode | null {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return isViewMode(v) ? v : null;
  } catch {
    return null;
  }
}

/** A pair in words, by its place in the campaign: never a stack's number, which follows the order of acquisition. */
export const pairWords = (i: Pick<Item, "position">): string => `pair ${i.position + 1}`;

const sideWords = (s: "post" | "pre" | "?") => (s === "?" ? "can't tell" : s);

const HELP: Record<PairAnswer, string> = {
  left_post: "the left is post, the right pre",
  right_post: "the right is post, the left pre",
  both_pre: "both pre",
  both_post: "both post (a rerun after the contrast)",
  cant_tell: "can't tell",
};

export const PAIR_SPEC: CompareSpec<PairAnswer> = {
  kind: "pairs",
  title: "Read pairs",
  noun: "pair",
  words: pairWords,
  answers: PAIR_ANSWERS,
  answerWords: ANSWER_WORDS,
  answerHelp: HELP,
  panelKeys: SIDES,
  panelWord: (k) => k,
  sheet: (c, item) =>
    pairDoors.sheet(c, item).then((s) => ({
      item: s.item,
      panels: [
        { key: "left", stack: s.left, label: "left", lead: true },
        { key: "right", stack: s.right, label: "right", lead: false },
      ],
    })),
  summary: (c) => pairDoors.summary(c).then((s: PairSummary) => ({ items: s.items, answered: s.answered, median: s.median, counts: answerCounts(s) })),
  says: (chosen, panel) => {
    const side = sidesOf(chosen)[panel as "left" | "right"];
    return side ? { words: sideWords(side), post: side === "post" } : null;
  },
  difference: false,
  legacyView,
};

export function PairReader({ caps, id, query }: { caps: Capabilities; id: string; query?: Record<string, string> }) {
  return <CompareReader caps={caps} id={id} query={query} spec={PAIR_SPEC} />;
}

/**
 * A pair campaign on its own page: how far it is read, how often each
 * answer was given, the time per pair, and each answer resolved per stack
 * to save as a file. While the campaign is open a rater reads only their own.
 */
export function PairPanel({ campaign }: { campaign: Campaign }) {
  const [s, setS] = useState<PairSummary | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    pairDoors.summary(campaign.id).then(setS, (e: unknown) => setFailed(refusedWords(e)));
  }, [campaign.id]);
  const save = () => {
    setSaving(true);
    pairDoors
      .values(campaign.id)
      .then((d) => {
        const url = URL.createObjectURL(new Blob([JSON.stringify(d, null, 1)], { type: "application/json" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = `${campaign.name.replace(/[^\w.-]+/gu, "-")}-values.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      })
      .catch((e: unknown) => setFailed(refusedWords(e)))
      .finally(() => setSaving(false));
  };
  return (
    <div className="ab-panel pair-panel">
      <h2>Read in pairs</h2>
      {failed && <p className="warn">{failed}</p>}
      {s && (
        <dl className="facts">
          <div className="facts-pair">
            <dt>read</dt>
            <dd>
              {s.answered} of {s.items} pairs
            </dd>
          </div>
          <div className="facts-pair">
            <dt>answers</dt>
            <dd>{answerCounts(s)}</dd>
          </div>
          <div className="facts-pair">
            <dt>per pair</dt>
            <dd>{s.median === null ? "not timed yet" : `median ${s.median} s`}</dd>
          </div>
        </dl>
      )}
      <p>
        <button type="button" className="button secondary small" disabled={saving} onClick={save}>
          Save the values
        </button>{" "}
        <span className="meta">each answer resolved per stack: left post gives the left given and the right not given, and so on</span>
      </p>
    </div>
  );
}
