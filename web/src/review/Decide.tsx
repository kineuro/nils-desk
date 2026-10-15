// SPDX-License-Identifier: AGPL-3.0-only
// Deciding one item (record 27, R5d): a classifier question takes a value, or
// nothing, and goes through the apply door at the scan's own scope; any other
// item is acknowledged. Review round 1 (record 56 section 6.3, DR4): no scope
// to choose, no why field and no note on what a decision is worth; a
// question about many scans is answered in its grid. A blind-first question
// is still answered from the scan first (record 55 D6).

import { useEffect, useState } from "react";
import { ops, type ReviewItem } from "../ops/client";
import { BothSides } from "./BothSides";
import { answerBody, modeOf, owesBlind, provisionalValue, s1, type Suggestions } from "./s1";
import { Dialog } from "../ui/Dialog";
import { itemWords, refusalWords, type PackDoc } from "./client";
import { kindOf } from "./triage";

export interface DecideProps {
  item: ReviewItem;
  pack: PackDoc | null;
  /** A value to start from, when the page knows the rules' own guess. */
  guess?: string | null;
  onClose: () => void;
  onDone: (words: string) => void;
}

export function DecideDialog({ item, pack, guess = null, onClose, onDone }: DecideProps) {
  const k = kindOf(item.kind);
  const axis = k.classifier ? k.area : null;
  const values = axis ? (pack?.axes.find((a) => a.axis === axis)?.values ?? []) : [];
  const [value, setValue] = useState(axis !== null && owesBlind(item) ? "" : (guess ?? ""));
  const [nothing, setNothing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  // record 55 D6: a blind-first question is answered from the scan first;
  // the suggestions show after the person's own answer
  const mode = modeOf(item);
  const [blind, setBlind] = useState(() => axis !== null && owesBlind(item));
  const [both, setBoth] = useState<Suggestions | null>(null);
  useEffect(() => {
    if (!axis || blind) return;
    let alive = true;
    s1.suggestions(item.id).then(
      (d) => {
        if (!alive) return;
        setBoth(d);
        const p = provisionalValue(d.provisional);
        if (p && value === "" && !nothing) {
          setValue(p.value);
          setNothing(p.nothing);
        }
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [axis, blind, item.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const answerBlind = () => {
    setBusy(true);
    setRefused(null);
    s1.provisional(item.id, answerBody(value, nothing))
      .then(() => {
        setBusy(false);
        setBlind(false);
      })
      .catch((e: unknown) => {
        setBusy(false);
        setRefused(refusalWords(e));
      });
  };

  const apply = () => {
    setBusy(true);
    setRefused(null);
    // a decision is the scan's own: the stack's scope, always
    const call = axis ? ops.reviewApply(item.id, { ...(nothing ? { nothing: true } : { value: value.trim() }), scope: "stack" }) : ops.reviewAccept(item.id);
    call
      .then((r) => onDone((((r as { answer?: { blind?: boolean } }).answer?.blind) ? "Given blind. " : "") + (axis ? `Decided ${axis} ${nothing ? "has no value" : `is ${value.trim()}`}.` : "Acknowledged.")))
      .catch((e: unknown) => {
        setBusy(false);
        setRefused(refusalWords(e));
      });
  };
  const ready = axis ? nothing || value.trim() !== "" : true;
  return (
    <Dialog
      title={axis ? `Decide ${axis}` : "Acknowledge this item"}
      icon="review"
      onClose={onClose}
      foot={
        <div className="row actions">
          {blind ? (
            <button type="button" className="button" disabled={busy || !ready} onClick={answerBlind}>
              Answer, then see the suggestions
            </button>
          ) : (
            <button type="button" className="button" disabled={busy || !ready} onClick={apply}>
              {axis ? "Decide" : "Acknowledge"}
            </button>
          )}
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          {refused && <span className="warn">{refused}</span>}
        </div>
      }
    >
      <p className="lede">
        {blind ? `A question about ${axis}. Answer from the scan and its header; NILS's answers show after yours.` : itemWords(item)}
        {mode === "blind_first" && <span className="tag mode-blind">blind first</span>}
      </p>
      {axis && !blind && both && <BothSides doc={both} axis={axis} />}
      {axis && (
        <div className="field">
          <span className="label">{axis} is</span>
          <div className="field-row">
            {values.length > 0 ? (
              <span className="input select">
                <select value={nothing ? "" : value} disabled={nothing} aria-label={`The value of ${axis}`} onChange={(e) => setValue(e.target.value)}>
                  <option value="">choose a value</option>
                  {values.map((v) => (
                    <option key={v.value} value={v.value}>
                      {v.label && v.label !== v.value ? `${v.value} (${v.label})` : v.value}
                    </option>
                  ))}
                </select>
              </span>
            ) : (
              <span className="input">
                <input value={value} disabled={nothing} placeholder={`a value of ${axis}`} aria-label={`The value of ${axis}`} onChange={(e) => setValue(e.target.value)} />
              </span>
            )}
            <label className="choice">
              <input type="checkbox" checked={nothing} onChange={(e) => setNothing(e.target.checked)} />
              no value here
            </label>
          </div>
        </div>
      )}
    </Dialog>
  );
}
