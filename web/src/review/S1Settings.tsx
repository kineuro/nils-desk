// SPDX-License-Identifier: AGPL-3.0-only
// Two small controls of the review rule (Wave 7a, record 55 D6 and record
// 56): the site's share of review questions answered blind first, one in
// five unless the site says otherwise, and a dataset's damaged-header flag,
// set by its signs at the end of every sort (record 55, ruling 31 (c)) or by
// a person, whose word wins, which puts its scans through the full gate.

import { useEffect, useState } from "react";
import { pct, s1, type HeadersFlag, type HeadersSign, type ReviewSettings } from "./s1";
import "./s1.css";

/** The share as a door takes it, from a percent typed; null where it is no share. */
export function shareOf(text: string): number | null {
  const v = Number(text.trim().replace(/%$/u, ""));
  return Number.isFinite(v) && v >= 0 && v <= 100 ? v / 100 : null;
}

export function BlindShare({ locked }: { locked: string | null }) {
  const [doc, setDoc] = useState<ReviewSettings | null>(null);
  const [text, setText] = useState("");
  const [said, setSaid] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    s1.settings().then(
      (d) => {
        if (!alive) return;
        setDoc(d);
        setText(String(Math.round(d.blind_share * 100)));
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, []);
  if (!doc) return null;
  const share = shareOf(text);
  const changed = share !== null && Math.abs(share - doc.blind_share) > 1e-9;
  return (
    <section className="panel card" aria-label="Blind-first review">
      <div className="row card-head">
        <h2>Blind-first review</h2>
      </div>
      <div className="field">
        <label className="label" htmlFor="blind-share">
          Questions answered blind first, %
        </label>
        <div className="field-row">
          <span className="input">
            <input id="blind-share" inputMode="decimal" value={text} disabled={locked !== null} onChange={(e) => setText(e.target.value)} />
          </span>
          {changed && locked === null && (
            <button
              type="button"
              className="button small"
              onClick={() =>
                s1.setShare(share).then(
                  () => {
                    setDoc({ ...doc, blind_share: share });
                    setSaid(`${pct(share)} of questions are answered blind first now.`);
                  },
                  (e: Error) => setSaid(`Not changed: ${e.message}`),
                )
              }
            >
              Change
            </button>
          )}
        </div>
      </div>
      {said && <p className="meta said">{said}</p>}
      {locked !== null && <p className="meta">{locked}</p>}
      <p className="meta">
        Only blind answers train a model. Default {pct(doc.default_blind_share)}. Campaigns that train or measure are blind first always.
      </p>
    </section>
  );
}

/** Who set a dataset's flag and why: a person, with their why and what the signs say where it differs, or the signs' reason. */
export function headersBy(flag: HeadersFlag): string {
  if (flag.by === "person") {
    const who = flag.flag?.by ?? "a person";
    const said = flag.flag?.why ? `: ${flag.flag.why}` : "";
    const signs = flag.signs.why && flag.signs.damaged !== flag.damaged ? `; its signs: ${flag.signs.why}` : "";
    return `${flag.damaged ? "flagged" : "marked as usual"} by ${who}${said}${signs}`;
  }
  // an engine before the signs were kept reads the nameless share alone
  return flag.signs.why ? `by its signs: ${flag.signs.why}` : `by its signs, ${pct(flag.signs.share)} of scans unnamed`;
}

/** Every sign's share beside its threshold, for the line's title. */
export function signsTitle(flag: HeadersFlag): string | undefined {
  const s = flag.signs;
  if (!s.nameless && !s.unknown_words && !s.unseen_maker) return undefined;
  const one = (label: string, sign?: HeadersSign) =>
    sign ? `${label} ${pct(sign.share)}${sign.threshold === null ? ", no threshold" : `, flags at ${pct(sign.threshold)}`}` : null;
  return [one("unnamed scans", s.nameless), one("scans with no word the rules know", s.unknown_words), one("scans by a maker never seen", s.unseen_maker)]
    .filter((x): x is string => x !== null)
    .join("; ");
}

/** A dataset's damaged-header flag, and the toggle that asks why. */
export function HeadersLine({ dataset, may }: { dataset: string; may: boolean }) {
  const [flag, setFlag] = useState<HeadersFlag | null>(null);
  const [asking, setAsking] = useState(false);
  const [why, setWhy] = useState("");
  const [said, setSaid] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    s1.headers(dataset).then(
      (f) => alive && setFlag(f),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [dataset]);
  if (!flag) return null;
  const set = (damaged: boolean | null) =>
    s1.setHeaders(dataset, damaged, why.trim() || undefined).then(
      (f) => {
        setFlag(f);
        setAsking(false);
        setWhy("");
        setSaid(null);
      },
      (e: Error) => setSaid(e.message),
    );
  return <HeadersView flag={flag} may={may} asking={asking} why={why} said={said} onAsk={() => setAsking(true)} onWhy={setWhy} onSet={set} />;
}

export function HeadersView(props: {
  flag: HeadersFlag;
  may: boolean;
  asking: boolean;
  why: string;
  said: string | null;
  onAsk: () => void;
  onWhy: (w: string) => void;
  onSet: (damaged: boolean | null) => void;
}) {
  const { flag, may, asking, why, said, onAsk, onWhy, onSet } = props;
  const words = flag.damaged ? "Headers damaged: sorting less reliable" : "Headers as usual";
  return (
    <div className={flag.damaged ? "headers-flag damaged" : "headers-flag"} aria-label="Headers">
      <span>{words}</span>
      <span className="meta" title={signsTitle(flag)}>
        {headersBy(flag)}
      </span>
      {may && !asking && (
        <button type="button" className="button quiet small" onClick={onAsk}>
          {flag.damaged ? "Mark as usual" : "Flag as damaged"}
        </button>
      )}
      {may && flag.by === "person" && !asking && (
        <button type="button" className="button quiet small" onClick={() => onSet(null)}>
          Let the signs decide
        </button>
      )}
      {asking && (
        <span className="field-row">
          <span className="input">
            <input value={why} placeholder="why, in a few words" aria-label="Why" onChange={(e) => onWhy(e.target.value)} />
          </span>
          <button type="button" className="button small" disabled={why.trim() === ""} onClick={() => onSet(!flag.damaged)}>
            {flag.damaged ? "Mark as usual" : "Flag"}
          </button>
        </span>
      )}
      {said && <span className="warn">{said}</span>}
    </div>
  );
}
