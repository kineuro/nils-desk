// SPDX-License-Identifier: AGPL-3.0-only
// Anchored reading (the post-contrast study, record 48 of 2026-09-29,
// night). Nima reads whether contrast was given to a candidate stack beside
// a known-pre and a known-post anchor of the same subject, in three panels
// in the order the engine's seed drew. The page shows the three pictures,
// labelled candidate, reference pre and reference post, and nothing else of
// any of them: no time, no series name, no header, no value the rules gave,
// no stack number. An anchor of another session is flagged. One key
// answers: 1 like the pre, 2 like the post, 3 can't tell; Enter sends it.
//
// So that a real difference in signal stays visible, every panel is scaled
// by its own reference tissue and shown under one window by default, which
// a drag on any panel moves for all (`w` gives each its own again). Where
// the geometry matches, paging one panel pages the others to the same
// place (`l`). `d` shows the candidate minus each anchor on the anchors'
// panels. 7 to 0 jump to the ventricles, the superior sagittal sinus, the
// transverse sinuses and the sella, estimated from the head's extent and
// said to be approximate. `b` opens one's last answer again (and again the
// one before), `m` lists one's answers by item; an answer opened shows the
// same three panels with it marked, and another choice and Enter correct it
// (the engine keeps the earlier answer). The item leased stays leased.
//
// The page itself is the comparison reader (CompareReader.tsx), which pair
// mode shares: the view kept per campaign and rater, the next items warmed
// while this one is read, the answers apart from the view's controls.

import { useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { ANCHORED_ANSWERS, ANCHORED_WORDS, anchoredCounts, anchoredDoors, ROLE_WORDS, ROLES, type AnchoredAnswer, type AnchoredSummary } from "./anchored";
import { refused as refusedWords, type Campaign, type Item } from "./client";
import { CompareReader, type CompareSpec } from "./CompareReader";

/** An item in words, by its place in the campaign: never a stack's number. */
export const anchoredWords = (i: Pick<Item, "position">): string => `item ${i.position + 1}`;

const HELP: Record<AnchoredAnswer, string> = {
  like_pre: "the candidate looks like the reference pre",
  like_post: "the candidate looks like the reference post",
  cant_tell: "can't tell",
};

export const ANCHORED_SPEC: CompareSpec<AnchoredAnswer> = {
  kind: "anchored",
  title: "Read against anchors",
  noun: "item",
  words: anchoredWords,
  answers: ANCHORED_ANSWERS,
  answerWords: ANCHORED_WORDS,
  answerHelp: HELP,
  panelKeys: ROLES,
  panelWord: (k) => ROLE_WORDS[k as keyof typeof ROLE_WORDS] ?? k,
  sheet: (c, item) =>
    anchoredDoors.sheet(c, item).then((s) => ({
      item: s.item,
      panels: s.panels.map((p) => ({
        key: p.role,
        stack: p.stack,
        label: ROLE_WORDS[p.role],
        lead: p.role === "candidate",
        flag: p.otherSession ? { words: "another session", title: "this reference is from another session of the same person, the closest with the same settings" } : undefined,
      })),
    })),
  summary: (c) => anchoredDoors.summary(c).then((s) => ({ items: s.items, answered: s.answered, median: s.median, counts: anchoredCounts(s) })),
  says: (chosen, panel) => (panel === "candidate" ? { words: ANCHORED_WORDS[chosen], post: chosen === "like_post" } : null),
  difference: true,
};

export function AnchoredReader({ caps, id, query }: { caps: Capabilities; id: string; query?: Record<string, string> }) {
  return <CompareReader caps={caps} id={id} query={query} spec={ANCHORED_SPEC} />;
}

/**
 * An anchored campaign on its own page: how far it is read, how often each
 * answer was given, the items with an anchor of another session, the time
 * per item, and each answer's candidate value to save as a file.
 */
export function AnchoredPanel({ campaign }: { campaign: Campaign }) {
  const [s, setS] = useState<AnchoredSummary | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    anchoredDoors.summary(campaign.id).then(setS, (e: unknown) => setFailed(refusedWords(e)));
  }, [campaign.id]);
  const save = () => {
    setSaving(true);
    anchoredDoors
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
      <h2>Read against anchors</h2>
      {failed && <p className="warn">{failed}</p>}
      {s && (
        <dl className="facts">
          <div className="facts-pair">
            <dt>read</dt>
            <dd>
              {s.answered} of {s.items} items
            </dd>
          </div>
          <div className="facts-pair">
            <dt>answers</dt>
            <dd>{anchoredCounts(s)}</dd>
          </div>
          <div className="facts-pair">
            <dt>anchors</dt>
            <dd>{s.otherSession === 0 ? "every one from the candidate's session" : `${s.otherSession} item${s.otherSession === 1 ? "" : "s"} with an anchor of another session`}</dd>
          </div>
          <div className="facts-pair">
            <dt>per item</dt>
            <dd>{s.median === null ? "not timed yet" : `median ${s.median} s`}</dd>
          </div>
        </dl>
      )}
      <p>
        <button type="button" className="button secondary small" disabled={saving} onClick={save}>
          Save the values
        </button>{" "}
        <span className="meta">each answer resolved for its candidate alone: like the post gives it given, like the pre not given; the anchors get no value</span>
      </p>
    </div>
  );
}
