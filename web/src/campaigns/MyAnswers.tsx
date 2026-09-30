// SPDX-License-Identifier: AGPL-3.0-only
// My answers (record 50, after the first gold campaign: "it was not easy to
// go back and correct the mistake"): the rater's own answers still standing,
// the most recent first, narrowed to one value, each opened in the reader to
// correct. A correction is a new answer that supersedes the earlier one,
// which the engine keeps; a closed campaign's answers stand as given. Only
// one's own answer is ever shown here, and nothing suggested beside it, so
// an item of a sealed sample stays blind. An anchored or a pair campaign's
// answers are corrected in their own reader, and listed by their place in
// the campaign and the answer's words alone: no picture, no time.

import { useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { href, narrow } from "../routes";
import { Icon } from "../ui/Icon";
import { ANCHORED_WORDS, isAnchored } from "./anchored";
import { ANSWER_WORDS, isPair } from "./pair";
import { AMEND, campaigns, mineWords, refused as refusedWords, singleValueOf, type Campaign, type Mine, type MyAnswer } from "./client";
import { Thumb } from "./Thumb";
import { valueTone } from "./values";

/** The page an answer of a campaign is corrected on: an anchored or a pair campaign's own reader, else the rating workspace. */
export type AmendPage = "rate" | "anchored" | "pairs";
export function amendPageOf(c: Pick<Campaign, "question">): AmendPage {
  return isAnchored(c) ? "anchored" : isPair(c) ? "pairs" : "rate";
}

/** Where a correction opens: the reader, on that answer, and back to where it came from after. */
export function amendHref(campaign: number | string, answer: number, back: "gallery" | "rate" = "rate", page: AmendPage = "rate"): string {
  if (page !== "rate") return narrow(href("campaigns", String(campaign), page), { amend: answer });
  return narrow(href("campaigns", String(campaign), "rate"), { amend: answer, back });
}

/** Why an answer cannot be corrected here, or null. */
export function amendRefusal(caps: Capabilities, c: Pick<Campaign, "status" | "question">, mine: Pick<Mine, "open"> | null): string | null {
  if (!served(caps, AMEND)) return "This engine does not take corrections; update it.";
  if (c.status !== "open" || mine?.open === false) return "The campaign is closed: its answers stand as given.";
  if (!["axis", "axes", "anchored", "pair"].includes(c.question.kind)) return "Only an axis, an anchored or a pair answer is corrected in the reader.";
  return null;
}

/** Whether a campaign is read blind from pictures alone, so its answers are listed by place and words only. */
const picturesOnly = (c: Pick<Campaign, "question">): boolean => isAnchored(c) || isPair(c);

/** One's own answer in words: an anchored or a pair answer as its reader says it, anything else as the reader shows it. */
export function ownWords(c: Pick<Campaign, "question">, value: unknown): string {
  if (typeof value === "string" && isAnchored(c) && value in ANCHORED_WORDS) return ANCHORED_WORDS[value as keyof typeof ANCHORED_WORDS];
  if (typeof value === "string" && isPair(c) && value in ANSWER_WORDS) return ANSWER_WORDS[value as keyof typeof ANSWER_WORDS];
  return mineWords(c.question, value);
}

/** An answer's item by its place in the campaign, as its reader names it: never a stack. */
export function placeWords(c: Pick<Campaign, "question">, position: number): string {
  return `${isPair(c) ? "pair" : "item"} ${position + 1}`;
}

/** When an answer was given, in a few words. */
export function whenWords(at: string, now = Date.now()): string {
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return at;
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return at.slice(0, 10);
}

/**
 * `onPick`, where given, opens an answer in the page that shows the list
 * (the anchored and the pair reader) instead of following a link; `current`
 * is the answer open there now, marked.
 */
export function MyAnswers({ caps, campaign: c, values, back, onClose, onPick, current = null }: { caps: Capabilities; campaign: Campaign; values: string[]; back: "gallery" | "rate"; onClose: () => void; onPick?: (a: MyAnswer) => void; current?: number | null }) {
  const [mine, setMine] = useState<Mine | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [value, setValue] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setFailed(null);
    campaigns.mine(c.id, { value }).then(
      (m) => alive && setMine(m),
      (e: unknown) => alive && setFailed(refusedWords(e)),
    );
    return () => {
      alive = false;
    };
  }, [c.id, value]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const refusal = amendRefusal(caps, c, mine);
  const counted = Object.entries(mine?.values ?? {});
  return (
    <div className="drawer mine-drawer" role="dialog" aria-label="my answers">
      <div className="mine-head">
        <h2>My answers</h2>
        {mine && <span className="meta">{mine.total} standing, the latest first</span>}
        <span className="grow" />
        <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
          <Icon name="x" />
        </button>
      </div>
      {refusal && <p className="meta">{refusal}</p>}
      {counted.length > 1 && (
        <div className="mine-filter chips" role="group" aria-label="by value">
          <button type="button" className={value === null ? "opt on" : "opt"} aria-pressed={value === null} onClick={() => setValue(null)}>
            every value
          </button>
          {counted.map(([v, n]) => (
            <button key={v} type="button" className={value === v ? "opt on" : "opt"} aria-pressed={value === v} onClick={() => setValue(v)} {...valueTone(values, v)}>
              {picturesOnly(c) ? ownWords(c, v) : v} <b>{n}</b>
            </button>
          ))}
        </div>
      )}
      {failed && <p className="warn">{failed}</p>}
      {!mine && !failed && <p className="meta">Reading your answers…</p>}
      {mine && mine.answers.length === 0 && <p className="meta">{value ? `No answer of yours says ${ownWords(c, value)}.` : "You have answered nothing here yet."}</p>}
      {mine && mine.answers.length > 0 && (
        <ul className="mine-list">
          {mine.answers.map((a) => (
            <MineRow key={a.answer} a={a} c={c} values={values} refusal={refusal} back={back} onPick={onPick} current={current === a.answer} />
          ))}
        </ul>
      )}
    </div>
  );
}

function MineRow({ a, c, values, refusal, back, onPick, current }: { a: MyAnswer; c: Campaign; values: string[]; refusal: string | null; back: "gallery" | "rate"; onPick?: (a: MyAnswer) => void; current: boolean }) {
  const v = singleValueOf(c.question, a.value);
  // read from the pictures alone: the place and the words, no picture and no time
  const blind = picturesOnly(c);
  return (
    <li className={["mine-row", blind ? "no-thumb" : "", current ? "on" : ""].filter(Boolean).join(" ")} data-answer={a.answer} aria-current={current || undefined}>
      {!blind && (a.thumb ? <Thumb src={a.thumb} loading="lazy" /> : <span />)}
      <span className="mine-what">
        {blind && <b>{placeWords(c, a.position)}</b>}
        <span className="value-tag" {...valueTone(values, v)}>
          {blind ? ownWords(c, a.value) : mineWords(c.question, a.value)}
        </span>
        <span className="meta">
          {blind ? "" : `item ${a.position + 1} · ${whenWords(a.answered_at)}`}
          {a.via === "batch" ? `${blind ? "" : " · "}in a batch` : a.via === "amend" ? `${blind ? "" : " · "}corrected` : ""}
        </span>
        {a.unsure && <span className="tag caution">unsure</span>}
        {a.sealed && (
          <span className="tag gated" title="of a sealed sample: read blind, only your own answer is shown">
            blind
          </span>
        )}
        {current && <span className="tag">open now</span>}
      </span>
      {refusal ? (
        <button type="button" className="button quiet small" disabled title={refusal}>
          Correct
        </button>
      ) : onPick ? (
        <button type="button" className="button secondary small" disabled={current} onClick={() => onPick(a)}>
          Correct
        </button>
      ) : (
        <a className="button secondary small" href={amendHref(c.id, a.answer, back, amendPageOf(c))}>
          Correct
        </a>
      )}
    </li>
  );
}
