// SPDX-License-Identifier: AGPL-3.0-only
// My answers (record 50, after the first gold campaign: "it was not easy to
// go back and correct the mistake"): the rater's own answers still standing,
// the most recent first, narrowed to one value, each opened in the reader to
// correct. A correction is a new answer that supersedes the earlier one,
// which the engine keeps; a closed campaign's answers stand as given. Only
// one's own answer is ever shown here, and nothing suggested beside it, so
// an item of a sealed sample stays blind.

import { useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { href, narrow } from "../routes";
import { Icon } from "../ui/Icon";
import { AMEND, campaigns, mineWords, refused as refusedWords, singleValueOf, type Campaign, type Mine, type MyAnswer } from "./client";
import { ValueMark, valueTone } from "./values";

/** Where a correction opens: the reader, on that answer, and back to where it came from after. */
export function amendHref(campaign: number | string, answer: number, back: "gallery" | "rate" = "rate"): string {
  return narrow(href("campaigns", String(campaign), "rate"), { amend: answer, back });
}

/** Why an answer cannot be corrected here, or null. */
export function amendRefusal(caps: Capabilities, c: Pick<Campaign, "status" | "question">, mine: Pick<Mine, "open"> | null): string | null {
  if (!served(caps, AMEND)) return "This engine does not take corrections; update it.";
  if (c.status !== "open" || mine?.open === false) return "The campaign is closed: its answers stand as given.";
  if (c.question.kind !== "axis" && c.question.kind !== "axes") return "Only an axis answer is corrected in the reader.";
  return null;
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

export function MyAnswers({ caps, campaign: c, values, back, onClose }: { caps: Capabilities; campaign: Campaign; values: string[]; back: "gallery" | "rate"; onClose: () => void }) {
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
              <ValueMark values={values} value={v} />
              {v} <b>{n}</b>
            </button>
          ))}
        </div>
      )}
      {failed && <p className="warn">{failed}</p>}
      {!mine && !failed && <p className="meta">Reading your answers…</p>}
      {mine && mine.answers.length === 0 && <p className="meta">{value ? `No answer of yours says ${value}.` : "You have answered nothing here yet."}</p>}
      {mine && mine.answers.length > 0 && (
        <ul className="mine-list">
          {mine.answers.map((a) => (
            <MineRow key={a.answer} a={a} c={c} values={values} refusal={refusal} back={back} />
          ))}
        </ul>
      )}
    </div>
  );
}

function MineRow({ a, c, values, refusal, back }: { a: MyAnswer; c: Campaign; values: string[]; refusal: string | null; back: "gallery" | "rate" }) {
  const v = singleValueOf(c.question, a.value);
  return (
    <li className="mine-row" data-answer={a.answer}>
      {a.thumb ? <img src={a.thumb} alt="" loading="lazy" decoding="async" /> : <span />}
      <span className="mine-what">
        <span className="value-tag" {...valueTone(values, v)}>
          <ValueMark values={values} value={v} />
          {mineWords(c.question, a.value)}
        </span>
        <span className="meta">
          item {a.position + 1} · {whenWords(a.answered_at)}
          {a.via === "batch" ? " · in a batch" : a.via === "amend" ? " · corrected" : ""}
        </span>
        {a.unsure && <span className="tag caution">unsure</span>}
        {a.sealed && (
          <span className="tag gated" title="of a sealed sample: read blind, only your own answer is shown">
            blind
          </span>
        )}
      </span>
      {refusal ? (
        <button type="button" className="button quiet small" disabled title={refusal}>
          Correct
        </button>
      ) : (
        <a className="button secondary small" href={amendHref(c.id, a.answer, back)}>
          Correct
        </a>
      )}
    </li>
  );
}
